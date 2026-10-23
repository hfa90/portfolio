"""Scraper do Google Maps com Playwright (navegador real, sem API paga e sem IA).

Fluxo:
 1. abre a busca do Google Maps (por texto ou pela área do mapa),
 2. rola a lista lateral de resultados até atingir o limite ou o fim da lista,
 3. abre cada empresa (em paralelo, N abas) e lê os dados do painel de detalhes,
 4. normaliza endereço/telefone e, opcionalmente, visita o site para achar e-mail e redes sociais.

Os seletores do Google Maps mudam de tempos em tempos; por isso cada campo tem
mais de uma estratégia de leitura (classe CSS, atributos data-item-id e aria-label).
Se algum campo parar de vir, ajuste o JS em `JS_DETALHES`.
"""
from __future__ import annotations

import asyncio
import re
from typing import Awaitable, Callable
from urllib.parse import parse_qs, quote, urlparse

import httpx
from playwright.async_api import Browser, Page, async_playwright

from . import parser
from .enrich import HEADERS, enriquecer_site

LogFn = Callable[[str], None]

SELETOR_FEED = 'div[role="feed"]'
SELETOR_LINKS = 'div[role="feed"] a[href*="/maps/place/"]'

JS_FIM_DA_LISTA = """() => {
  const f = document.querySelector('div[role="feed"]');
  if (!f) return false;
  const t = (f.innerText || '').slice(-800);
  return /final da lista|end of the list|chegou ao fim/i.test(t) || !!f.querySelector('span.HlvSq');
}"""

JS_LINKS = """() => {
  const vistos = new Set(); const out = [];
  document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]').forEach(a => {
    if (vistos.has(a.href)) return; vistos.add(a.href);
    const card = a.closest('div.Nv2PK') || a.parentElement;
    out.push({ href: a.href, nome: a.getAttribute('aria-label') || '', card: card ? (card.innerText || '') : '' });
  });
  return out;
}"""

JS_DETALHES = r"""() => {
  const main = document.querySelector('div[role="main"][aria-label]') || document.querySelector('div[role="main"]') || document.body;
  const txt = el => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
  const attr = (el, a) => (el && el.getAttribute(a)) || '';
  const r = {};

  r.nome = txt(main.querySelector('h1.DUwDvf')) || txt(main.querySelector('h1')) || attr(main, 'aria-label');
  r.categoria = txt(main.querySelector('button.DkEaL')) || txt(main.querySelector('button[jsaction*="category"]'));

  const f7 = main.querySelector('div.F7nice');
  if (f7) {
    r.avaliacao = txt(f7.querySelector('span[aria-hidden="true"]'));
    const rv = f7.querySelector('span[aria-label*="avalia"], span[aria-label*="review"], span[aria-label*="coment"]');
    r.num_avaliacoes = rv ? attr(rv, 'aria-label') : '';
    if (!r.num_avaliacoes) { const m = txt(f7).match(/\(([\d.,]+)\)/); if (m) r.num_avaliacoes = m[1]; }
  }
  if (!r.avaliacao) {
    const st = main.querySelector('span[role="img"][aria-label*="estrela"], span[role="img"][aria-label*="star"]');
    if (st) r.avaliacao = (attr(st, 'aria-label').match(/[\d]+[.,]?\d*/) || [''])[0];
  }

  const end = main.querySelector('[data-item-id="address"]');
  r.endereco = end ? (attr(end, 'aria-label').replace(/^\s*(Endereço|Address)\s*:\s*/i, '') || txt(end)) : '';

  const tel = main.querySelector('[data-item-id^="phone:tel:"]');
  r.telefone = tel ? (attr(tel, 'aria-label').replace(/^\s*(Telefone|Phone)\s*:\s*/i, '') || attr(tel, 'data-item-id').replace('phone:tel:', '')) : '';
  r.telefone_bruto = tel ? attr(tel, 'data-item-id').replace('phone:tel:', '') : '';

  const site = main.querySelector('a[data-item-id="authority"]') || main.querySelector('a[aria-label^="Website"], a[aria-label^="Site"]');
  r.site = site ? site.href : '';

  const oloc = main.querySelector('[data-item-id="oloc"]');
  r.plus_code = oloc ? attr(oloc, 'aria-label').replace(/^\s*Plus Code\s*:\s*/i, '') : '';

  let horario = '';
  const tabela = main.querySelector('table.eK4R0e') || main.querySelector('div.t39EBf table') || main.querySelector('table');
  if (tabela) {
    const linhas = [];
    tabela.querySelectorAll('tr').forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 2) {
        const h = attr(tds[1], 'aria-label') || txt(tds[1]);
        linhas.push(txt(tds[0]) + ': ' + h.replace(/\s*Copiar horário.*$/i, ''));
      }
    });
    horario = linhas.join(' | ');
  }
  if (!horario) {
    const oh = main.querySelector('div.t39EBf[aria-label], [aria-label*="horário de funcionamento"], [aria-label*="Ocultar horário"], [data-item-id="oh"]');
    horario = oh ? attr(oh, 'aria-label').replace(/\.\s*Ocultar.*$/i, '') : '';
  }
  r.horario = horario;

  const preco = main.querySelector('span[aria-label^="Preço"], span[aria-label^="Price"]');
  r.faixa_preco = preco ? attr(preco, 'aria-label') : '';

  const corpo = main.innerText || '';
  r.situacao = /Fechado permanentemente|Permanently closed/i.test(corpo) ? 'Fechado permanentemente'
             : /Fechado temporariamente|Temporarily closed/i.test(corpo) ? 'Fechado temporariamente' : 'Ativo';
  return r;
}"""

RE_TEL_CARD = re.compile(r"(\(?\d{2}\)?\s?\d{4,5}-?\d{4}|0800\s?\d{3}\s?\d{4}|\+55[\d\s()-]{10,16})")


def _site_real(url: str) -> str:
    """O Google às vezes devolve /url?q=<site>; desembrulha."""
    if not url:
        return ""
    p = urlparse(url)
    if "google." in p.netloc and p.path.startswith("/url"):
        q = parse_qs(p.query).get("q") or parse_qs(p.query).get("url")
        return q[0] if q else ""
    return url


def montar_url_busca(termo: str, local: str = "", lat=None, lng=None, zoom=None) -> str:
    consulta = f"{termo} em {local}" if local else termo
    url = f"https://www.google.com/maps/search/{quote(consulta)}/"
    if lat is not None and lng is not None:
        url += f"@{float(lat):.6f},{float(lng):.6f},{float(zoom or 15):.1f}z"
    return url + "?hl=pt-BR"


def centros_da_grade(bounds: dict, n: int) -> list[tuple[float, float]]:
    s, w, no, e = bounds["sul"], bounds["oeste"], bounds["norte"], bounds["leste"]
    dlat, dlng = (no - s) / n, (e - w) / n
    return [(s + (i + 0.5) * dlat, w + (j + 0.5) * dlng) for i in range(n) for j in range(n)]


class GoogleMapsScraper:
    def __init__(self, headless: bool = True, concorrencia: int = 3, log: LogFn = print):
        self.headless = headless
        self.concorrencia = max(1, min(int(concorrencia), 6))
        self.log = log

    # ------------------------------------------------------------------ navegador
    async def _abrir_navegador(self, pw) -> Browser:
        args = ["--disable-blink-features=AutomationControlled", "--lang=pt-BR"]
        tentativas = [{}, {"channel": "msedge"}, {"channel": "chrome"}]
        ultimo_erro = None
        for extra in tentativas:
            try:
                b = await pw.chromium.launch(headless=self.headless, args=args, **extra)
                if extra:
                    self.log(f"Usando navegador instalado: {extra['channel']}")
                return b
            except Exception as e:  # Chromium do Playwright não instalado, tenta Edge/Chrome
                ultimo_erro = e
        raise RuntimeError(
            "Não foi possível abrir o navegador. Rode 'python -m playwright install chromium'. "
            f"Detalhe: {ultimo_erro}"
        )

    @staticmethod
    async def _bloquear_pesados(route):
        if route.request.resource_type in ("image", "media", "font"):
            await route.abort()
        else:
            await route.continue_()

    async def _aceitar_consentimento(self, page: Page) -> None:
        if "consent.google" not in page.url:
            return
        for rotulo in ("Aceitar tudo", "Accept all", "Rejeitar tudo", "Reject all"):
            btn = page.get_by_role("button", name=rotulo)
            if await btn.count():
                await btn.first.click()
                await page.wait_for_load_state("domcontentloaded")
                self.log("Tela de consentimento do Google aceita.")
                return

    # ------------------------------------------------------------------ lista
    async def coletar_links(self, page: Page, url: str, limite: int, deve_parar: Callable[[], bool],
                            ao_encontrar: Callable[[int], None] | None = None) -> list[dict]:
        await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        await self._aceitar_consentimento(page)

        try:
            await page.wait_for_selector(f'{SELETOR_FEED}, h1.DUwDvf', timeout=25_000)
        except Exception:
            corpo = (await page.inner_text("body"))[:2000] if await page.query_selector("body") else ""
            if re.search(r"não encontrou|não foi possível encontrar|can't find|no results", corpo, re.I):
                self.log("O Google Maps não encontrou resultados para esta busca.")
                return []
            self.log("A lista de resultados não carregou a tempo.")
            return []

        # Busca muito específica abre direto uma empresa (sem lista)
        if not await page.query_selector(SELETOR_FEED):
            self.log("A busca abriu diretamente uma única empresa.")
            return [{"href": page.url, "nome": "", "card": ""}]

        feed = page.locator(SELETOR_FEED).first
        ultimo, parado = 0, 0
        while not deve_parar():
            qtd = await page.locator(SELETOR_LINKS).count()
            if ao_encontrar and qtd != ultimo:
                ao_encontrar(qtd)
            if qtd >= limite:
                break
            await feed.evaluate("el => el.scrollTo(0, el.scrollHeight)")
            await page.wait_for_timeout(1200)
            if await page.evaluate(JS_FIM_DA_LISTA):
                self.log("Fim da lista de resultados alcançado.")
                break
            novo = await page.locator(SELETOR_LINKS).count()
            parado = parado + 1 if novo == ultimo else 0
            ultimo = novo
            if parado and parado % 3 == 0:  # "chacoalha" a lista quando trava carregando
                await feed.evaluate("el => el.scrollBy(0, -500)")
                await page.wait_for_timeout(700)
            if parado >= 9:
                self.log("A lista parou de crescer; seguindo com o que foi encontrado.")
                break

        links = await page.evaluate(JS_LINKS)
        return links[:limite]

    # ------------------------------------------------------------------ detalhes
    async def extrair_detalhes(self, page: Page, link: dict) -> dict:
        await page.goto(link["href"], wait_until="domcontentloaded", timeout=45_000)
        try:
            await page.wait_for_selector("h1.DUwDvf, div[role='main'] h1", timeout=15_000)
        except Exception:
            pass
        try:
            await page.wait_for_selector(
                '[data-item-id="address"], [data-item-id^="phone:tel:"], a[data-item-id="authority"]', timeout=5_000)
        except Exception:
            pass
        await page.wait_for_timeout(300)
        bruto = await page.evaluate(JS_DETALHES)
        return self.normalizar(bruto, link, page.url)

    @staticmethod
    def normalizar(bruto: dict, link: dict, url_final: str = "") -> dict:
        nome = (bruto.get("nome") or link.get("nome") or "").strip()
        telefone_txt = bruto.get("telefone") or bruto.get("telefone_bruto") or ""
        if not telefone_txt and link.get("card"):  # fallback: telefone do cartão da lista
            m = RE_TEL_CARD.search(link["card"])
            telefone_txt = m.group(1) if m else ""
        tel = parser.limpar_telefone(telefone_txt)
        endereco = (bruto.get("endereco") or "").strip()
        lat, lng = parser.coords_da_url(url_final)
        if lat is None:
            lat, lng = parser.coords_da_url(link.get("href"))

        lead = {
            "place_key": parser.chave_do_lugar(link.get("href") or url_final, nome, endereco),
            "nome": nome,
            "categoria": (bruto.get("categoria") or "").strip(),
            **tel,
            "site": _site_real(bruto.get("site") or ""),
            "endereco": endereco,
            **parser.parse_endereco(endereco),
            "latitude": lat,
            "longitude": lng,
            "avaliacao": parser.parse_numero_br(bruto.get("avaliacao")),
            "num_avaliacoes": parser.parse_avaliacoes(bruto.get("num_avaliacoes")),
            "horario": bruto.get("horario") or "",
            "plus_code": bruto.get("plus_code") or "",
            "situacao": bruto.get("situacao") or "",
            "faixa_preco": bruto.get("faixa_preco") or "",
            "maps_url": link.get("href") or url_final,
            "email": "", "instagram": "", "facebook": "", "linkedin": "", "whatsapp_link": "",
        }
        lead["score"] = parser.calcular_score(lead)
        return lead

    # ------------------------------------------------------------------ orquestração
    async def executar(
        self,
        termo: str,
        local: str = "",
        modo: str = "local",
        lat: float | None = None,
        lng: float | None = None,
        zoom: float | None = None,
        bounds: dict | None = None,
        grade: int = 1,
        limite: int = 60,
        enriquecer: bool = False,
        deve_parar: Callable[[], bool] = lambda: False,
        ao_fase: Callable[[str], None] = lambda f: None,
        ao_encontrar: Callable[[int], None] = lambda n: None,
        ao_lead: Callable[[dict], Awaitable[None] | None] = lambda l: None,
        ao_erro_item: Callable[[str], None] = lambda m: None,
    ) -> int:
        async with async_playwright() as pw:
            browser = await self._abrir_navegador(pw)
            context = await browser.new_context(
                locale="pt-BR",
                timezone_id="America/Sao_Paulo",
                viewport={"width": 1366, "height": 900},
                user_agent=HEADERS["User-Agent"],
            )
            await context.route("**/*", self._bloquear_pesados)
            try:
                # 1) coleta de links ------------------------------------------------
                ao_fase("coletando")
                pagina_lista = await context.new_page()
                links: list[dict] = []
                vistos: set[str] = set()

                if modo == "area" and bounds and grade > 1:
                    centros = centros_da_grade(bounds, grade)
                    zoom_celula = float(zoom or 15) + (1 if grade == 2 else 2)
                    self.log(f"Varredura em grade {grade}x{grade}: {len(centros)} regiões.")
                    for idx, (clat, clng) in enumerate(centros, 1):
                        if deve_parar() or len(links) >= limite:
                            break
                        self.log(f"Região {idx}/{len(centros)}…")
                        url = montar_url_busca(termo, "", clat, clng, zoom_celula)
                        parciais = await self.coletar_links(pagina_lista, url, limite, deve_parar)
                        for l in parciais:
                            k = parser.chave_do_lugar(l["href"], l["nome"])
                            if k not in vistos:
                                vistos.add(k)
                                links.append(l)
                        ao_encontrar(min(len(links), limite))
                    links = links[:limite]
                else:
                    if modo == "area":
                        url = montar_url_busca(termo, "", lat, lng, zoom)
                    else:
                        url = montar_url_busca(termo, local, lat, lng, zoom)
                    self.log(f"Abrindo Google Maps: {url}")
                    links = await self.coletar_links(pagina_lista, url, limite, deve_parar, ao_encontrar)

                await pagina_lista.close()
                ao_encontrar(len(links))
                self.log(f"{len(links)} empresas encontradas na lista.")
                if not links or deve_parar():
                    return len(links)

                # 2) detalhes em paralelo -----------------------------------------
                ao_fase("extraindo")
                fila: asyncio.Queue = asyncio.Queue()
                for l in links:
                    fila.put_nowait(l)

                http = httpx.AsyncClient(headers=HEADERS, timeout=8, follow_redirects=True, verify=False) if enriquecer else None

                async def trabalhador(n: int):
                    page = await context.new_page()
                    try:
                        while not deve_parar():
                            try:
                                link = fila.get_nowait()
                            except asyncio.QueueEmpty:
                                break
                            lead = None
                            for tentativa in (1, 2):
                                try:
                                    lead = await self.extrair_detalhes(page, link)
                                    break
                                except Exception as e:
                                    if tentativa == 2:
                                        ao_erro_item(f"Falha ao ler '{link.get('nome') or link['href'][:60]}': {e.__class__.__name__}")
                                    else:
                                        await page.wait_for_timeout(1500)
                            if not lead or not lead.get("nome"):
                                continue
                            if http and lead.get("site"):
                                try:
                                    extra = await enriquecer_site(lead["site"], http)
                                    lead.update({k: v for k, v in extra.items() if v})
                                    lead["score"] = parser.calcular_score(lead)
                                except Exception:
                                    pass
                            r = ao_lead(lead)
                            if asyncio.iscoroutine(r):
                                await r
                    finally:
                        await page.close()

                try:
                    await asyncio.gather(*(trabalhador(i) for i in range(self.concorrencia)))
                finally:
                    if http:
                        await http.aclose()
                return len(links)
            finally:
                await context.close()
                await browser.close()
