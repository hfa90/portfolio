"""Orquestra a busca paralela em todas as fontes e aplica o motor de compatibilidade."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Callable

from .config import SETTINGS
from .matcher import avaliar
from .models import Candidato, Vaga
from .sources import FONTES, Filtros
from .textutils import normalizar


@dataclass
class ResultadoBusca:
    vagas: list[Vaga] = field(default_factory=list)
    total_bruto: int = 0
    por_fonte: dict[str, int] = field(default_factory=dict)
    erros: dict[str, str] = field(default_factory=dict)
    termos: list[str] = field(default_factory=list)


def termos_do_candidato(c: Candidato, maximo: int = 3) -> list[str]:
    termos = []
    for cargo in c.cargos:
        t = cargo.strip()
        if t and normalizar(t) not in {normalizar(x) for x in termos}:
            termos.append(t)
    return termos[:maximo]


def buscar(candidato: Candidato, fontes: list[str], termos: list[str] | None = None,
           progresso: Callable[[str, str, int], None] | None = None,
           cancelado: Callable[[], bool] | None = None) -> ResultadoBusca:
    termos = [t for t in (termos or termos_do_candidato(candidato)) if t.strip()]
    res = ResultadoBusca(termos=termos)
    if not termos:
        return res
    paginas = int(SETTINGS.get("paginas_por_fonte", 2))
    instancias = {fid: FONTES[fid]() for fid in fontes if fid in FONTES}
    instancias = {k: v for k, v in instancias.items() if v.disponivel()}

    tarefas = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for fid, fonte in instancias.items():
            if progresso:
                progresso(fonte.nome, "buscando", 0)
            for termo in termos:
                filtros = Filtros(termo=termo, cidade=candidato.cidade, uf=candidato.uf,
                                  modalidades=candidato.lista("modalidades"),
                                  skills=candidato.lista("skills"), paginas=paginas)
                tarefas.append((pool.submit(fonte.buscar, filtros), fonte.nome))
        futuros = {f: nome for f, nome in tarefas}
        restantes: dict[str, int] = {}
        for _, nome in tarefas:
            restantes[nome] = restantes.get(nome, 0) + 1
        coletadas: list[Vaga] = []
        for fut in as_completed(futuros):
            nome = futuros[fut]
            restantes[nome] -= 1
            try:
                vagas = fut.result()
                coletadas.extend(vagas)
                res.por_fonte[nome] = res.por_fonte.get(nome, 0) + len(vagas)
            except Exception as e:  # noqa: BLE001 — erro de uma fonte não derruba as outras
                res.erros[nome] = str(e)[:200]
            if progresso and restantes[nome] == 0:
                status = "erro" if nome in res.erros and not res.por_fonte.get(nome) else "ok"
                progresso(nome, status, res.por_fonte.get(nome, 0))
            if cancelado and cancelado():
                break

    res.total_bruto = len(coletadas)
    vistos_url, vistos_chave, unicas = set(), set(), []
    for v in coletadas:
        if not v.titulo or not v.url:
            continue
        chave = (normalizar(v.titulo), normalizar(v.empresa), v.uf)
        if v.url in vistos_url or (v.empresa and chave in vistos_chave):
            continue
        vistos_url.add(v.url)
        vistos_chave.add(chave)
        unicas.append(avaliar(candidato, v))
    unicas.sort(key=lambda v: (v.score, v.publicada_em), reverse=True)
    res.vagas = unicas
    return res
