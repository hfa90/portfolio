"""Infraestrutura comum dos conectores de vagas."""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

import requests

from ..config import SETTINGS, USER_AGENT
from ..models import Vaga
from ..textutils import (detectar_contrato, detectar_modalidade, detectar_senioridade, limpar_html,
                         separar_cidade_uf)


@dataclass
class Filtros:
    termo: str
    cidade: str = ""
    uf: str = ""
    modalidades: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    paginas: int = 2


class FonteErro(Exception):
    pass


class Fonte:
    id: str = ""
    nome: str = ""
    descricao: str = ""
    cobertura: str = ""            # ex.: "Brasil · todas as áreas"
    requer_chave: bool = False
    site: str = ""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9"})

    # chamado pelo motor de busca
    def disponivel(self) -> bool:
        return True

    def buscar(self, f: Filtros) -> list[Vaga]:
        raise NotImplementedError

    # utilitários --------------------------------------------------------
    def get(self, url: str, **kw) -> requests.Response:
        return self._req("GET", url, **kw)

    def post(self, url: str, **kw) -> requests.Response:
        return self._req("POST", url, **kw)

    def _req(self, metodo: str, url: str, **kw) -> requests.Response:
        kw.setdefault("timeout", SETTINGS.get("timeout", 20))
        ultimo = None
        for tentativa in range(2):
            try:
                r = self.session.request(metodo, url, **kw)
                if r.status_code == 429:
                    time.sleep(2 + tentativa * 3)
                    continue
                r.raise_for_status()
                return r
            except requests.RequestException as e:
                ultimo = e
                time.sleep(1)
        raise FonteErro(f"{self.nome}: {ultimo or 'limite de requisições atingido'}")

    def montar(self, titulo: str, url: str, empresa: str = "", local: str = "", descricao: str = "",
               modalidade: str = "", tags=None, salario: str = "", contrato: str = "", publicada: str = "",
               senioridade: str = "", cidade: str = "", uf: str = "") -> Vaga:
        tags = [t for t in (tags or []) if t]
        descricao = limpar_html(descricao)
        if not (cidade or uf) and local:
            cidade, uf = separar_cidade_uf(local)
        contexto = " ".join([titulo, local, " ".join(tags), descricao[:800]])
        titulo = re.sub(r"[\s|–—-]+$", "", " ".join((titulo or "").split()))
        return Vaga(
            titulo=titulo, empresa=" ".join((empresa or "").split()), url=url,
            fonte=self.nome, cidade=cidade, uf=uf,
            modalidade=modalidade or detectar_modalidade(" ".join([titulo, local, " ".join(tags)])) or detectar_modalidade(descricao[:1500]),
            senioridade=senioridade or detectar_senioridade(titulo, " ".join(tags)),
            salario=salario, contrato=contrato or detectar_contrato(contexto), descricao=descricao,
            tags=tags, publicada_em=publicada,
        )
