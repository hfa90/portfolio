"""Comunidades brasileiras no GitHub, portais remotos e APIs com chave."""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from ..config import SETTINGS
from ..textutils import data_iso, normalizar, uf_de
from .base import Filtros, Fonte

REPOS_BR = [
    "backend-br/vagas", "frontendbr/vagas", "react-brasil/vagas", "qa-brasil/vagas",
    "androiddevbr/vagas", "soujava/vagas-java", "phpdevbr/vagas", "datascience-br/vagas", "uxbrasil/vagas",
]
ACEITA_BRASIL = ("brazil", "brasil", "latam", "latin america", "south america", "americas",
                 "worldwide", "anywhere", "global")


class GitHubBR(Fonte):
    id = "github_br"
    nome = "Comunidades GitHub BR"
    descricao = "Vagas publicadas nas comunidades brasileiras (backend-br, frontendbr, react-brasil, QA, dados, UX…)."
    cobertura = "Brasil · tecnologia"
    site = "https://github.com/backend-br/vagas"

    def buscar(self, f: Filtros):
        token = SETTINGS.get("github_token")
        headers = {"Accept": "application/vnd.github+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        desde = (datetime.now() - timedelta(days=120)).strftime("%Y-%m-%d")
        repos = " ".join(f"repo:{r}" for r in REPOS_BR)
        q = f"{f.termo} in:title,body is:issue state:open created:>{desde} {repos}"
        dados = self.get("https://api.github.com/search/issues",
                         params={"q": q, "per_page": 50, "sort": "created"}, headers=headers).json()
        vagas = []
        for it in dados.get("items", []):
            titulo = it.get("title", "")
            labels = [l.get("name", "") for l in it.get("labels", [])]
            if any(l.lower() in ("stale", "link-quebrado", "fechada") for l in labels):
                continue
            prefixo = " ".join(re.findall(r"\[([^\]]+)\]", titulo))
            limpo = re.sub(r"\[[^\]]+\]\s*", "", titulo).strip()
            principal = re.split(r"\s+\|\s+", limpo)[0]
            empresa = ""
            m = re.search(r"\s(?:-|—|@|na|no|at)\s+([^\-—@]+)$", principal)
            if m and len(m.group(1)) <= 40:
                empresa = m.group(1).strip()
                principal = principal[:m.start()].strip()
            limpo = principal or limpo
            local = " ".join([prefixo] + labels)
            vagas.append(self.montar(
                titulo=limpo, url=it.get("html_url", ""), empresa=empresa, descricao=it.get("body") or "",
                tags=labels, uf=uf_de(local), publicada=data_iso(it.get("created_at", "")),
                modalidade=next((m for m in ("Remoto", "Híbrido", "Presencial")
                                 if m.lower() in normalizar(local).replace("hibrido", "híbrido")), ""),
            ))
        return vagas


class Remotive(Fonte):
    id = "remotive"
    nome = "Remotive"
    descricao = "Vagas 100% remotas internacionais que aceitam profissionais do Brasil/LatAm."
    cobertura = "Internacional · remoto"
    site = "https://remotive.com"

    def buscar(self, f: Filtros):
        dados = self.get("https://remotive.com/api/remote-jobs", params={"search": f.termo, "limit": 60}).json()
        vagas = []
        for j in dados.get("jobs", []):
            loc = (j.get("candidate_required_location") or "").lower()
            if loc and not any(a in loc for a in ACEITA_BRASIL):
                continue
            vagas.append(self.montar(
                titulo=j.get("title", ""), url=j.get("url", ""), empresa=j.get("company_name", ""),
                descricao=j.get("description", ""), modalidade="Remoto", salario=j.get("salary") or "",
                tags=(j.get("tags") or [])[:10] + [f"Região: {j.get('candidate_required_location') or 'Global'}"],
                contrato=(j.get("job_type") or "").replace("_", " ").title(),
                publicada=data_iso(j.get("publication_date", "")),
            ))
        return vagas


class Himalayas(Fonte):
    id = "himalayas"
    nome = "Himalayas"
    descricao = "Portal global de vagas remotas, filtrado para vagas abertas ao Brasil."
    cobertura = "Internacional · remoto"
    site = "https://himalayas.app"

    def buscar(self, f: Filtros):
        vagas = []
        for pagina in range(1, max(1, f.paginas) + 1):
            dados = self.get("https://himalayas.app/jobs/api/search",
                             params={"q": f.termo, "page": pagina}).json()
            jobs = dados.get("jobs", [])
            for j in jobs:
                restr = [str(r).lower() for r in (j.get("locationRestrictions") or [])]
                if restr and not any(any(a in r for a in ACEITA_BRASIL) for r in restr):
                    continue
                sal = ""
                if j.get("minSalary"):
                    sal = f"{j.get('currency', 'USD')} {j['minSalary']:,}".replace(",", ".")
                    if j.get("maxSalary"):
                        sal += f" – {j['maxSalary']:,}".replace(",", ".")
                pub = j.get("pubDate")
                vagas.append(self.montar(
                    titulo=j.get("title", ""), url=j.get("applicationLink") or j.get("guid") or "",
                    empresa=j.get("companyName", ""), descricao=j.get("description") or j.get("excerpt") or "",
                    modalidade="Remoto", salario=sal, contrato=j.get("employmentType") or "",
                    tags=list(j.get("categories") or [])[:8] + list(j.get("seniority") or []),
                    publicada=data_iso(str(pub)) if pub else "",
                ))
            if not jobs:
                break
        return vagas


class Adzuna(Fonte):
    id = "adzuna"
    nome = "Adzuna"
    descricao = "Agregador que reúne vagas de centenas de sites brasileiros (requer chave gratuita)."
    cobertura = "Brasil · agregador"
    requer_chave = True
    site = "https://developer.adzuna.com"

    def disponivel(self):
        return bool(SETTINGS.get("adzuna_app_id") and SETTINGS.get("adzuna_app_key"))

    def buscar(self, f: Filtros):
        vagas = []
        for pagina in range(1, max(1, f.paginas) + 1):
            params = {"app_id": SETTINGS["adzuna_app_id"], "app_key": SETTINGS["adzuna_app_key"],
                      "what": f.termo, "results_per_page": 50, "content-type": "application/json"}
            dados = self.get(f"https://api.adzuna.com/v1/api/jobs/br/search/{pagina}", params=params).json()
            res = dados.get("results", [])
            for j in res:
                local = (j.get("location") or {}).get("display_name", "")
                sal = ""
                if j.get("salary_min"):
                    sal = f"R$ {int(j['salary_min']):,}".replace(",", ".")
                vagas.append(self.montar(
                    titulo=j.get("title", ""), url=j.get("redirect_url", ""),
                    empresa=(j.get("company") or {}).get("display_name", ""), local=local,
                    descricao=j.get("description", ""), salario=sal,
                    contrato=(j.get("contract_type") or "").replace("_", " "),
                    publicada=data_iso(j.get("created", "")),
                ))
            if not res:
                break
        return vagas


class Jooble(Fonte):
    id = "jooble"
    nome = "Jooble"
    descricao = "Agregador internacional com grande base brasileira (requer chave gratuita)."
    cobertura = "Brasil · agregador"
    requer_chave = True
    site = "https://br.jooble.org/api/about"

    def disponivel(self):
        return bool(SETTINGS.get("jooble_key"))

    def buscar(self, f: Filtros):
        vagas = []
        local = f.cidade or ""
        for pagina in range(1, max(1, f.paginas) + 1):
            dados = self.post(f"https://br.jooble.org/api/{SETTINGS['jooble_key']}",
                              json={"keywords": f.termo, "location": local, "page": str(pagina)}).json()
            jobs = dados.get("jobs", [])
            for j in jobs:
                vagas.append(self.montar(
                    titulo=j.get("title", ""), url=j.get("link", ""), empresa=j.get("company", ""),
                    local=j.get("location", ""), descricao=j.get("snippet", ""), salario=j.get("salary", ""),
                    contrato=j.get("type", ""), tags=[f"via {j.get('source', '')}"] if j.get("source") else [],
                    publicada=data_iso(j.get("updated", "")),
                ))
            if not jobs:
                break
        return vagas
