"""Enriquecimento: visita o site da empresa e extrai e-mail e redes sociais com regex."""
from __future__ import annotations

import html
import re
from urllib.parse import urljoin, urlparse

import httpx

RE_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
RE_HREF = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)

IGNORAR_EMAIL = (
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js",
    "example.com", "exemplo.com", "sentry", "wixpress", "domain.com", "seudominio", "email.com",
    "@2x", "godaddy", "yourdomain", "usuario@", "nome@", "seuemail",
)
PAGINAS_CONTATO = ("/contato", "/contact", "/fale-conosco", "/contato/", "/sobre")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6",
}


def _limpar_social(url: str) -> str:
    url = url.split("?")[0].rstrip("/")
    return url


def _extrair(conteudo: str, base: str) -> dict:
    texto = html.unescape(conteudo)
    out = {"emails": [], "instagram": "", "facebook": "", "linkedin": "", "whatsapp_link": ""}

    emails = set()
    for m in re.finditer(r"mailto:([^\"'?>\s]+)", texto, re.IGNORECASE):
        emails.add(m.group(1).strip().lower())
    for m in RE_EMAIL.finditer(texto):
        emails.add(m.group(0).strip().lower())
    out["emails"] = sorted(
        e for e in emails
        if not any(x in e for x in IGNORAR_EMAIL) and 5 < len(e) < 80
    )

    for href in RE_HREF.findall(texto):
        h = urljoin(base, href.strip())
        dominio = urlparse(h).netloc.lower()
        if not out["instagram"] and "instagram.com" in dominio and not re.search(r"/(p|reel|explore)/", h):
            out["instagram"] = _limpar_social(h)
        elif not out["facebook"] and ("facebook.com" in dominio or "fb.com" in dominio) and "sharer" not in h:
            out["facebook"] = _limpar_social(h)
        elif not out["linkedin"] and "linkedin.com" in dominio and "share" not in h:
            out["linkedin"] = _limpar_social(h)
        elif not out["whatsapp_link"] and ("wa.me" in dominio or "api.whatsapp.com" in dominio or "whatsapp.com/send" in h):
            out["whatsapp_link"] = h
    return out


async def enriquecer_site(site: str, client: httpx.AsyncClient | None = None) -> dict:
    """Retorna {'email','instagram','facebook','linkedin','whatsapp_link'} (strings, podem vir vazias)."""
    resultado = {"email": "", "instagram": "", "facebook": "", "linkedin": "", "whatsapp_link": ""}
    if not site:
        return resultado
    if not site.startswith("http"):
        site = "http://" + site
    dominio = urlparse(site).netloc.lower()
    # Sites que são redes sociais já são o próprio dado
    if "instagram.com" in dominio:
        resultado["instagram"] = _limpar_social(site)
        return resultado
    if "facebook.com" in dominio:
        resultado["facebook"] = _limpar_social(site)
        return resultado

    proprio = client is None
    client = client or httpx.AsyncClient(headers=HEADERS, timeout=8, follow_redirects=True, verify=False)
    try:
        emails: list[str] = []
        urls = [site] + [urljoin(site, p) for p in PAGINAS_CONTATO]
        for i, url in enumerate(urls):
            if i > 0 and emails and resultado["instagram"]:
                break
            if i > 2:  # no máximo home + 2 páginas de contato
                break
            try:
                r = await client.get(url)
                if r.status_code >= 400 or "text/html" not in r.headers.get("content-type", "text/html"):
                    continue
                dados = _extrair(r.text[:600_000], str(r.url))
            except Exception:
                continue
            for e in dados["emails"]:
                if e not in emails:
                    emails.append(e)
            for k in ("instagram", "facebook", "linkedin", "whatsapp_link"):
                if not resultado[k] and dados[k]:
                    resultado[k] = dados[k]
        if emails:
            # prioriza e-mail do próprio domínio
            raiz = dominio.replace("www.", "")
            emails.sort(key=lambda e: (raiz.split(".")[0] not in e, len(e)))
            resultado["email"] = emails[0]
    finally:
        if proprio:
            await client.aclose()
    return resultado
