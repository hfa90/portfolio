"""Atalhos de busca pronta nos portais que não oferecem API pública.

Abrem a pesquisa já preenchida no navegador do recrutador, respeitando os termos
de uso desses sites (LinkedIn, Indeed, Catho, Glassdoor etc. proíbem coleta automática).
"""
from __future__ import annotations

from urllib.parse import quote_plus

from ..textutils import slug


def links_busca(termo: str, cidade: str = "", uf: str = "", remoto: bool = False) -> list[tuple[str, str]]:
    q = quote_plus(termo)
    local = quote_plus(", ".join(p for p in (cidade, uf) if p) or "Brasil")
    s = slug(termo)
    lin = f"https://www.linkedin.com/jobs/search/?keywords={q}&location={local}"
    if remoto:
        lin += "&f_WT=2"
    return [
        ("Google Vagas (agrega dezenas de sites)", f"https://www.google.com/search?q={q}+vagas+{local}&ibp=htl;jobs"),
        ("LinkedIn Vagas", lin),
        ("Indeed Brasil", f"https://br.indeed.com/jobs?q={q}&l={'' if remoto else local}" + ("&sc=0kf%3Aattr(DSQF7)%3B" if remoto else "")),
        ("Catho", f"https://www.catho.com.br/vagas/{s}/"),
        ("Glassdoor", f"https://www.glassdoor.com.br/Vaga/{s}-vagas-SRCH_KO0,{len(s)}.htm"),
        ("BNE – Banco Nacional de Empregos", f"https://www.bne.com.br/vagas-de-emprego-para-{s}"),
        ("Trabalha Brasil", f"https://www.trabalhabrasil.com.br/vagas-empregos/{s}"),
        ("Empregos.com.br", f"https://www.empregos.com.br/vagas/{s}"),
        ("Sólides Vagas", f"https://vagas.solides.com.br/vagas/todos/{s}"),
        ("99Jobs", f"https://99jobs.com/opportunities/filtered_search?search%5Bterm%5D={q}"),
        ("CIEE (estágio/aprendiz)", "https://portal.ciee.org.br/quero-uma-vaga/"),
        ("Nube (estágio)", "https://www.nube.com.br/candidato/vagas"),
        ("Emprega Brasil / SINE (governo)", "https://empregabrasil.mte.gov.br/"),
    ]
