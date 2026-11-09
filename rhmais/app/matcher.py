"""Motor de compatibilidade candidato × vaga (score 0–100 explicável)."""
from __future__ import annotations

from difflib import SequenceMatcher

from .models import Candidato, Vaga
from .textutils import (ORDEM_SENIORIDADE, extrair_skills, extrair_valor_salario, normalizar,
                        skill_no_texto, tokens)

PESOS = {"cargo": 35, "skills": 30, "modalidade": 12, "local": 13, "senioridade": 10}


def _score_cargo(cargos: list[str], titulo: str) -> tuple[float, str]:
    if not cargos:
        return 0.5, "Sem cargo desejado"
    t_tok = tokens(titulo)
    t_norm = normalizar(titulo)
    melhor, melhor_cargo = 0.0, ""
    for cargo in cargos:
        c_tok = tokens(cargo)
        if not c_tok:
            continue
        cobertura = len(c_tok & t_tok) / len(c_tok)
        similar = SequenceMatcher(None, normalizar(cargo), t_norm).ratio()
        contem = 1.0 if normalizar(cargo) in t_norm else 0.0
        s = max(cobertura * 0.85 + similar * 0.15, contem)
        if s > melhor:
            melhor, melhor_cargo = s, cargo
    return melhor, (f"Título compatível com “{melhor_cargo}”" if melhor >= 0.5 else "Título pouco relacionado")


def avaliar(c: Candidato, v: Vaga) -> Vaga:
    texto = normalizar(" ".join([v.titulo, " ".join(v.tags), v.descricao]))
    det: dict = {}

    # 1) Cargo
    s_cargo, msg_cargo = _score_cargo(c.cargos, v.titulo)
    det["cargo"] = msg_cargo

    # 2) Skills
    skills_c = c.lista("skills")
    batem = [s for s in skills_c if skill_no_texto(s, texto)]
    pedidas = extrair_skills(" ".join([v.titulo, " ".join(v.tags), v.descricao]))
    norm_c = {normalizar(s) for s in skills_c}
    faltam_todas = [s for s in pedidas if normalizar(s) not in norm_c]
    faltam = faltam_todas[:8]
    if skills_c:
        # quanto das skills do candidato aparecem na vaga (até 5 contam) +
        # quanto do que a vaga pede o candidato cobre
        lado_candidato = min(1.0, len(batem) / min(len(skills_c), 5))
        lado_vaga = (len(pedidas) - len(faltam_todas)) / len(pedidas) if pedidas else lado_candidato
        s_skills = min(1.0, 0.65 * lado_candidato + 0.35 * lado_vaga)
    else:
        s_skills = 0.5
    det["skills_ok"] = batem
    det["skills_faltam"] = faltam

    # 3) Modalidade
    prefs = c.lista("modalidades") or ["Presencial", "Híbrido", "Remoto"]
    if not v.modalidade:
        s_mod, det["modalidade"] = 0.5, "Modalidade não informada"
    elif v.modalidade in prefs:
        s_mod, det["modalidade"] = 1.0, f"{v.modalidade} (aceita)"
    else:
        s_mod, det["modalidade"] = 0.0, f"{v.modalidade} (fora da preferência)"

    # 4) Localização
    if v.modalidade == "Remoto":
        s_loc, det["local"] = 1.0, "Remoto: sem restrição geográfica"
    elif not v.uf and not v.cidade:
        s_loc, det["local"] = 0.45, "Local não informado"
    elif c.cidade and v.cidade and normalizar(c.cidade) == normalizar(v.cidade):
        s_loc, det["local"] = 1.0, "Mesma cidade"
    elif c.uf and v.uf == c.uf:
        s_loc, det["local"] = 0.75, "Mesmo estado"
    elif c.aceita_mudanca:
        s_loc, det["local"] = 0.55, "Outro estado (aceita mudança)"
    else:
        s_loc, det["local"] = 0.0, "Outro estado"

    # 5) Senioridade
    if not c.senioridade or not v.senioridade:
        s_sen, det["senioridade"] = 0.6, "Nível não informado"
    else:
        try:
            dist = abs(ORDEM_SENIORIDADE.index(c.senioridade) - ORDEM_SENIORIDADE.index(v.senioridade))
        except ValueError:
            dist = 1
        s_sen = {0: 1.0, 1: 0.5}.get(dist, 0.0)
        det["senioridade"] = "Nível igual" if dist == 0 else f"Vaga {v.senioridade} × candidato {c.senioridade}"

    total = (s_cargo * PESOS["cargo"] + s_skills * PESOS["skills"] + s_mod * PESOS["modalidade"]
             + s_loc * PESOS["local"] + s_sen * PESOS["senioridade"])

    # Penalidades duras: cargo sem relação derruba o score
    if s_cargo < 0.25 and len(batem) < 2:
        total *= 0.55
    if s_mod == 0.0:
        total *= 0.8
    if s_loc == 0.0:
        total *= 0.75
    # Tecnologia/competência exigida no próprio título que o candidato não tem
    no_titulo = [s for s in extrair_skills(v.titulo) if normalizar(s) not in norm_c]
    if no_titulo and skills_c and not any(normalizar(s) in norm_c for s in extrair_skills(v.titulo)):
        total *= 0.8
        det["alerta"] = "Título exige " + ", ".join(no_titulo[:3])

    # Salário (informativo, leve ajuste)
    valor = extrair_valor_salario(v.salario)
    if valor and c.pretensao_salarial:
        if valor >= c.pretensao_salarial:
            det["salario"] = "Salário atende à pretensão"
            total = min(100, total + 3)
        elif valor < c.pretensao_salarial * 0.8:
            det["salario"] = "Salário abaixo da pretensão"
            total -= 5
        else:
            det["salario"] = "Salário próximo da pretensão"

    det["parciais"] = {"cargo": round(s_cargo * 100), "skills": round(s_skills * 100),
                       "modalidade": round(s_mod * 100), "local": round(s_loc * 100),
                       "senioridade": round(s_sen * 100)}
    v.score = round(max(0.0, min(100.0, total)), 1)
    v.detalhes_score = det
    return v


def classificar(score: float) -> str:
    if score >= 75:
        return "Excelente"
    if score >= 60:
        return "Alta"
    if score >= 45:
        return "Média"
    return "Baixa"
