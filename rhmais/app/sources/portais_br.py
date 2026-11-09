"""Portais brasileiros: Gupy, Vagas.com, InfoJobs e Programathor."""
from __future__ import annotations

import json
import re
from urllib.parse import quote, quote_plus, urljoin

from bs4 import BeautifulSoup

from ..textutils import data_iso, extrair_skills, slug, uf_de

TECH_SLUGS = {
    "Python": "python", "JavaScript": "javascript", "TypeScript": "typescript", "Java": "java",
    "C#": "c-sharp", "PHP": "php", "Go": "golang", "Ruby": "ruby", "Kotlin": "kotlin", "Swift": "swift",
    "React": "react", "React Native": "react-native", "Angular": "angular", "Vue": "vue-js",
    "Node.js": "node-js", "Django": "django", "Flutter": "flutter", "Laravel": "laravel",
    "SQL": "sql", "AWS": "aws", "Docker": "docker", "Data Science": "data-science",
    "Machine Learning": "machine-learning", "Testes de Software (QA)": "qa", "UX/UI": "ux", "Salesforce": "salesforce",
}
from .base import Filtros, Fonte, FonteErro

MAPA_GUPY = {"remote": "Remoto", "hybrid": "Híbrido", "on-site": "Presencial"}


def _txt(el) -> str:
    return " ".join(el.get_text(" ", strip=True).split()) if el else ""


class Gupy(Fonte):
    id = "gupy"
    nome = "Gupy"
    descricao = "Maior plataforma de recrutamento do Brasil (milhares de empresas)."
    cobertura = "Brasil · todas as áreas"
    site = "https://portal.gupy.io"

    def buscar(self, f: Filtros):
        vagas = []
        for pagina in range(1, max(1, f.paginas) + 1):
            url = f"https://portal.gupy.io/job-search/term={quote(f.termo)}"
            if pagina > 1:
                url += f"&page={pagina}"
            html = self.get(url).text
            m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
            if not m:
                raise FonteErro("Gupy: formato da página mudou")
            dados = json.loads(m.group(1))["props"]["pageProps"].get("initialJobList") or {}
            itens = dados.get("data") or []
            for j in itens:
                uf = uf_de(j.get("state") or "")
                vagas.append(self.montar(
                    titulo=j.get("name", ""), url=(j.get("jobUrl") or "").split("?")[0],
                    empresa=j.get("careerPageName", ""), descricao=j.get("description", ""),
                    modalidade=MAPA_GUPY.get(j.get("workplaceType", ""), ""),
                    cidade=j.get("city") or "", uf=uf, publicada=data_iso(j.get("publishedDate", "")),
                    contrato={"vacancy_type_effective": "CLT", "vacancy_type_internship": "Estágio",
                              "vacancy_type_temporary": "Temporário", "vacancy_type_talent_pool": "Banco de talentos",
                              "vacancy_type_apprentice": "Jovem aprendiz", "vacancy_legal_entity": "PJ"
                              }.get(j.get("type", ""), ""),
                    tags=["PcD"] if j.get("disabilities") else [],
                ))
            pag = dados.get("pagination") or {}
            if not itens or pag.get("offset", 0) + pag.get("limit", 12) >= pag.get("total", 0):
                break
        return vagas


class VagasCom(Fonte):
    id = "vagas_com"
    nome = "Vagas.com"
    descricao = "Portal tradicional com vagas de todos os níveis, do operacional à diretoria."
    cobertura = "Brasil · todas as áreas"
    site = "https://www.vagas.com.br"

    def buscar(self, f: Filtros):
        urls = [f"https://www.vagas.com.br/vagas-de-{slug(f.termo)}"]
        if f.cidade:
            urls.append(f"https://www.vagas.com.br/vagas-de-{slug(f.termo)}-em-{slug(f.cidade)}")
        vagas, vistos = [], set()
        for url in urls:
            soup = BeautifulSoup(self.get(url).text, "html.parser")
            for li in soup.select("li.vaga"):
                a = li.select_one("a.link-detalhes-vaga")
                if not a:
                    continue
                link = urljoin(self.site, a.get("href", ""))
                if link in vistos:
                    continue
                vistos.add(link)
                local_el = li.select_one(".vaga-local")
                local = _txt(local_el).split("A empresa")[0].strip() if local_el else ""
                vagas.append(self.montar(
                    titulo=a.get("title") or _txt(a), url=link, empresa=_txt(li.select_one(".emprVaga")),
                    local=local, descricao=_txt(li.select_one(".detalhes")),
                    tags=[_txt(li.select_one(".nivelVaga"))], publicada=data_iso(_txt(li.select_one(".data-publicacao"))),
                ))
        return vagas


class InfoJobs(Fonte):
    id = "infojobs"
    nome = "InfoJobs"
    descricao = "Um dos maiores portais do país, forte em vagas presenciais e operacionais."
    cobertura = "Brasil · todas as áreas"
    site = "https://www.infojobs.com.br"

    def buscar(self, f: Filtros):
        vagas = []
        for pagina in range(1, max(1, f.paginas) + 1):
            url = f"https://www.infojobs.com.br/empregos.aspx?palabra={quote_plus(f.termo)}"
            if pagina > 1:
                url += f"&page={pagina}"
            soup = BeautifulSoup(self.get(url).text, "html.parser")
            cards = soup.select("div.js_vacancyLoad")
            for card in cards:
                titulo = _txt(card.select_one(".js_vacancyTitle"))
                if not titulo:
                    continue
                link = urljoin(self.site, card.get("data-href", ""))
                empresa_el = card.select_one("a[href*='empresa'], a.text-body[href]")
                local = _txt(card.select_one("div.mb-8"))
                local = re.sub(r",?\s*\d+\s*Km de você\.?", "", local).strip()
                infos = [_txt(d) for d in card.select("div.d-inline-flex > div")]
                modalidade = next((i for i in infos if i in ("Presencial", "Remoto", "Híbrido")), "")
                salario = next((i for i in infos if "R$" in i or "combinar" in i.lower()), "")
                data_el = card.select_one(".js_date")
                descs = card.select("div.text-medium")
                vagas.append(self.montar(
                    titulo=titulo, url=link, empresa=_txt(empresa_el), local=local,
                    descricao=_txt(descs[-1]) if descs else "", modalidade=modalidade, salario=salario,
                    tags=[i for i in infos if i not in (modalidade, salario)],
                    publicada=data_iso(data_el.get("data-value", "")) if data_el else "",
                ))
            if not cards:
                break
        return vagas


class Programathor(Fonte):
    id = "programathor"
    nome = "Programathor"
    descricao = "Vagas de tecnologia no Brasil com stack detalhada."
    cobertura = "Brasil · tecnologia"
    site = "https://programathor.com.br"

    def buscar(self, f: Filtros):
        # O Programathor organiza as vagas por tecnologia (/jobs-python, /jobs-react…)
        techs = [s for s in extrair_skills(f.termo) if s in TECH_SLUGS] or \
                [s for s in f.skills if s in TECH_SLUGS][:2]
        vagas = []
        for tech in techs[:2]:
            vagas += self._pagina(f"{self.site}/jobs-{TECH_SLUGS[tech]}")
        return vagas

    def _pagina(self, url: str):
        soup = BeautifulSoup(self.get(url).text, "html.parser")
        vagas = []
        for cell in soup.select("div.cell-list"):
            a = cell.find("a", href=True)
            h3 = cell.select_one("h3")
            if not a or not h3 or not a["href"].startswith("/jobs/"):
                continue
            titulo = _txt(h3).replace("NOVA", "").replace("Vencida", "").strip()
            info = {}
            for sp in cell.select(".cell-list-content-icon span"):
                icon = sp.find("i")
                if icon:
                    info[" ".join(icon.get("class", []))] = _txt(sp)
            pega = lambda chave: next((v for k, v in info.items() if chave in k), "")
            local = pega("map-marker")
            vagas.append(self.montar(
                titulo=titulo, url=urljoin(self.site, a["href"]), empresa=pega("briefcase"), local=local,
                modalidade="Remoto" if "remoto" in local.lower() else "",
                salario=pega("money"), contrato=pega("file-alt"),
                tags=[_txt(t) for t in cell.select(".tag-list")] + [pega("chart-bar")],
            ))
        return vagas
