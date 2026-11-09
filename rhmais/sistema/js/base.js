/* RH+ Match — base compartilhada entre os módulos: cliente Supabase, estado, utilidades de interface. */
import { FONTES } from "../../supabase/functions/_shared/nucleo.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const main = $("#conteudo");
// Retorno de links enviados por e-mail (confirmação de conta, nova senha): lido ANTES de o supabase-js consumir o hash.
export const RETORNO = (() => {
  const h = new URLSearchParams(location.hash.replace(/^#\/?/, "")), qs = new URLSearchParams(location.search);
  const g = (k) => h.get(k) || qs.get(k) || "";
  return { tipo: g("type"), erro: g("error_description") || g("error"), codigo: g("error_code") };
})();
export const sb = window.supabase.createClient(window.RH_CONFIG.supabaseUrl, window.RH_CONFIG.supabaseKey);

export const CFG_PADRAO = { empresa_nome: "", paginas_por_fonte: 2, score_minimo_padrao: 40, fontes_ativas: FONTES.map((f) => f.id) };
export const ROTULO_PARCIAL = { cargo: "Cargo", skills: "Competências", modalidade: "Modalidade", local: "Localização", senioridade: "Senioridade" };

/** Contexto da sessão (mutável; os módulos leem sempre daqui). */
export const ctx = {
  usuario: null,          // auth user
  perfil: null,           // linha de public.perfis
  papel: "candidato",     // master | admin | candidato
  cfg: { ...CFG_PADRAO }, // preferências da conta (public.configuracoes)
  chaves: {},             // quais chaves de API da plataforma estão configuradas (booleans)
};
export const ehAdmin = () => ctx.papel === "admin" || ctx.papel === "master";
export const ehMaster = () => ctx.papel === "master";

export const estado = {
  candidatoBusca: null, busca: null, vagaSel: null, filtrosAbertos: false,
  filtros: { mod: "Todas", score: 40, texto: "", cidade: "", uf: "", regiao: "", regime: "", senioridade: "", salMin: "", dias: "", canal: "", soPlataforma: false, ordem: "score" },
  pipeCand: "", pipeStatus: "", pipeSel: null, candSel: null, cvFiltro: "",
};

/* ------------------------------------------------------------- utilidades */
let toastTimer;
export function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3400);
}
export function traduzErro(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link enviado antes de entrar.";
  if (/User already registered/i.test(m)) return "Este e-mail já tem cadastro. Faça login.";
  if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/schema cache|does not exist/i.test(m)) return "Recurso do banco indisponível. Avise o administrador.";
  if (/row-level security|permission denied/i.test(m)) return "Você não tem permissão para esta ação.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor.";
  return m;
}
export const falha = (e) => toast("⚠ " + traduzErro(e));
/** Desembrulha {data, error} do supabase-js. */
export async function q(p) { const { data, error } = await p; if (error) throw error; return data; }

export function baixarBlob(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
export const carimbo = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
export const slugArq = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

const scripts = {};
export function carregarScript(url) {
  return (scripts[url] ||= new Promise((ok, erro) => {
    const s = document.createElement("script"); s.src = url; s.onload = ok;
    s.onerror = () => { delete scripts[url]; erro(new Error("Não foi possível carregar " + url)); };
    document.head.appendChild(s);
  }));
}

/** Extrai a mensagem de erro de uma chamada a Edge Function. */
export async function erroFuncao(r, nome) {
  let msg = r.error?.message || "Erro desconhecido";
  try { msg = (await r.error.context.json()).erro || msg; } catch { /* sem corpo JSON */ }
  if (/Failed to send|not found|404/i.test(msg)) msg = `Função ${nome} indisponível no momento.`;
  return msg;
}

/* ------------------------------------------------------------- diálogo */
export function modal(html, largo = false) {
  $("#modal").classList.toggle("largo", largo);
  $("#modalCorpo").innerHTML = html;
  if (!$("#modal").open) { $("#modal").showModal(); history.pushState({ ...(history.state || {}), modal: true }, ""); }
}
// fechar o diálogo (botão, Esc ou toque fora) também desfaz a entrada no histórico, para o "voltar" do Android funcionar
$("#modal").addEventListener("close", () => { if (history.state?.modal) history.back(); });
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-fechar]")) $("#modal").close(); });

/* ------------------------------------------------------------- telas cheias no celular/tablet */
const mqCompacto = matchMedia("(max-width: 899px)");
let sheetAtual = null;
export const temSheet = () => !!sheetAtual;
export function abrirSheet(el, titulo) {
  if (!mqCompacto.matches || !el) return;
  if (sheetAtual && sheetAtual !== el) sheetAtual.classList.remove("sheet-aberta");
  sheetAtual = el;
  el.classList.add("sheet-aberta"); el.scrollTop = 0;
  document.body.classList.add("sheet-on");
  $("#sheetBarra").hidden = false; $("#sheetTitulo").textContent = titulo || "";
  if (!history.state?.sheet) history.pushState({ sheet: true }, "");
}
export function fecharSheet() {
  sheetAtual?.classList.remove("sheet-aberta"); sheetAtual = null;
  document.body.classList.remove("sheet-on"); $("#sheetBarra").hidden = true;
}
export const voltarSheet = () => (history.state?.sheet ? history.back() : fecharSheet());
$("#sheetVoltar").onclick = voltarSheet;
addEventListener("popstate", (e) => {
  if (!e.state?.modal && $("#modal").open) $("#modal").close();
  if (!e.state?.sheet && sheetAtual) fecharSheet();
});
mqCompacto.addEventListener("change", () => { if (!mqCompacto.matches) fecharSheet(); });

/* ------------------------------------------------------------- tema e barra de status */
export function atualizarCorBarra() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const escuro = document.documentElement.dataset.theme === "dark";
  meta.content = matchMedia("(max-width: 767px)").matches && !document.body.classList.contains("sem-sessao")
    ? (escuro ? "#0E1220" : "#F4F6FB") : (escuro ? "#0A0D1A" : "#111633");
}
export function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("rh_tema", t); } catch { /* ok */ }
  atualizarCorBarra();
}
export const alternarTema = () => aplicarTema(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
matchMedia("(max-width: 767px)").addEventListener("change", atualizarCorBarra);

/* ------------------------------------------------------------- instalação (PWA) */
export const pwa = { pedido: null };
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pwa.pedido = e; $("#cInstalar")?.removeAttribute("hidden"); });
addEventListener("appinstalled", () => { pwa.pedido = null; toast("RH+ Match instalado. Abra pelo ícone na tela inicial."); });
export const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Cartão "Conta e aplicativo" (usado em Meu perfil e em Ajustes). */
export function cartaoConta() {
  const papel = { master: "Master", admin: "Administrador", candidato: "Candidato" }[ctx.papel];
  return `<div class="card" style="margin-bottom:14px"><h3>Conta e aplicativo</h3>
    <p class="muted" style="margin:-4px 0 12px">Conectado como <b>${esc(ctx.usuario?.email || "")}</b> · <span class="chip prim">${papel}</span></p>
    <div class="acoes">
      <button class="btn sec" id="cInstalar" ${pwa.pedido || (ehIOS() && !instalado()) ? "" : "hidden"}>📲 Instalar no aparelho</button>
      <button class="btn neutro" id="cTema">◐ Tema claro/escuro</button>
      <button class="btn perigo" id="cSair">Sair da conta</button>
    </div>
    ${instalado() ? `<p class="muted" style="margin:10px 0 0;font-size:13px">✓ Você está usando o app instalado.</p>` : ""}
  </div>`;
}
export function ligarCartaoConta() {
  $("#cTema").onclick = alternarTema;
  $("#cSair").onclick = () => { if (confirm("Sair da sua conta neste aparelho?")) sb.auth.signOut(); };
  $("#cInstalar").onclick = async () => {
    if (pwa.pedido) { pwa.pedido.prompt(); await pwa.pedido.userChoice; pwa.pedido = null; $("#cInstalar").hidden = true; return; }
    modal(`<h3 style="margin:0 0 8px">Instalar no iPhone / iPad</h3>
      <ol style="margin:0 0 14px;padding-left:20px;line-height:1.8">
        <li>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
        <li>Escolha <b>Adicionar à Tela de Início</b>.</li>
        <li>Toque em <b>Adicionar</b>. O RH+ Match passa a abrir em tela cheia, como um app.</li></ol>
      <div class="rodape"><span></span><button class="btn" data-fechar>Entendi</button></div>`);
  };
}

/* ------------------------------------------------------------- pequenos componentes */
export function barras(itens, cor, vazio) {
  if (!itens.length) return `<div class="vazio">${esc(vazio)}</div>`;
  const max = Math.max(...itens.map((i) => i[1]), 1);
  return `<div class="barras">${itens.map(([n, v]) => `<div class="barra"><span class="trunc" title="${esc(n)}">${esc(n)}</span>
      <div class="trilho"><div style="width:${(v / max) * 100}%;background:${cor}"></div></div><b>${v}</b></div>`).join("")}</div>`;
}
export const corParcial = (v) => (v >= 70 ? "var(--verde)" : v >= 40 ? "var(--lar)" : "var(--verm)");
export const dataCurta = (iso) => (iso ? String(iso).slice(0, 10).split("-").slice(1).reverse().join("/") : "—");
export const dataHora = (ts) => { if (!ts) return ""; const d = new Date(ts); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
export const topo = (titulo, sub, acoes = "") => `<div class="topo"><div><h1>${titulo}</h1><p>${sub}</p></div><div class="acoes">${acoes}</div></div>`;
export const fonteDisponivel = (f) => !f.chaves || f.chaves.every((k) => ctx.chaves[k]);
export const segmentado = (id, ops, val) => `<div class="seg" id="${id}">${ops.map((o) => {
  const [v, r] = Array.isArray(o) ? o : [o, o];
  return `<button type="button" data-v="${esc(v)}" class="${String(val) === String(v) ? "on" : ""}">${esc(r)}</button>`;
}).join("")}</div>`;
export function ligarSegmentados(raiz = document) {
  $$(".seg", raiz).forEach((s) => (s.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$("button", s).forEach((x) => x.classList.toggle("on", x === b));
    s.dispatchEvent(new CustomEvent("mudou", { detail: b.dataset.v }));
  }));
}

/* ------------------------------------------------------------- leitura de currículo (PDF, DOCX, TXT) no navegador */
export async function lerCurriculo(arq) {
  if (arq.size > 10 * 1024 * 1024) throw new Error("Arquivo maior que 10 MB.");
  const ext = arq.name.toLowerCase().split(".").pop();
  if (ext === "pdf") {
    await carregarScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await arq.arrayBuffer()) }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      let linha = "", y = null; const out = [];
      for (const it of c.items) {
        const yy = it.transform?.[5];
        if (y !== null && yy !== undefined && Math.abs(yy - y) > 2) { out.push(linha); linha = ""; }
        linha += (linha && !linha.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
        if (it.hasEOL) { out.push(linha); linha = ""; }
        y = yy ?? y;
      }
      out.push(linha); paginas.push(out.join("\n"));
    }
    return paginas.join("\n");
  }
  if (ext === "docx") {
    await carregarScript("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js");
    return (await window.mammoth.extractRawText({ arrayBuffer: await arq.arrayBuffer() })).value;
  }
  if (ext === "txt") return arq.text();
  throw new Error("Envie um arquivo PDF, DOCX ou TXT.");
}

/* ------------------------------------------------------------- planilhas */
export async function novaPlanilha() {
  await carregarScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
  return new window.ExcelJS.Workbook();
}
export function cabecalhoPlanilha(ws, cols, larguras) {
  ws.columns = cols.map((h, i) => ({ header: h, width: larguras[i] }));
  ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
export async function salvarPlanilha(wb, nome) {
  baixarBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nome);
}
