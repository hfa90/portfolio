/* RH+ Match Web — frontend estático (GitHub Pages) + Supabase (Auth, Postgres com RLS, Edge Function de busca). */
import {
  FONTES, MODALIDADES, SENIORIDADES, STATUS_PIPELINE, UFS, analisarCurriculo, classificar, consolidar, extrairSkills,
  linksBusca, localVaga, termosDoCandidato,
} from "./supabase/functions/_shared/nucleo.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const main = $("#conteudo");
const ROTULO_PARCIAL = { cargo: "Cargo", skills: "Competências", modalidade: "Modalidade", local: "Localização", senioridade: "Senioridade" };
const CFG_PADRAO = { empresa_nome: "Minha Consultoria de RH", paginas_por_fonte: 2, score_minimo_padrao: 40,
  fontes_ativas: FONTES.map((f) => f.id), adzuna_app_id: "", adzuna_app_key: "", jooble_key: "", github_token: "" };

// Retorno de links enviados por e-mail (confirmação de conta, nova senha). Lido ANTES de o
// supabase-js consumir o hash da URL.
const RETORNO = (() => {
  const h = new URLSearchParams(location.hash.replace(/^#\/?/, "")), q = new URLSearchParams(location.search);
  const g = (k) => h.get(k) || q.get(k) || "";
  return { tipo: g("type"), erro: g("error_description") || g("error"), codigo: g("error_code") };
})();
const sb = window.supabase.createClient(window.RH_CONFIG.supabaseUrl, window.RH_CONFIG.supabaseKey);
let USUARIO = null;
let CFG = { ...CFG_PADRAO };
const estado = {
  candidatoBusca: null, busca: null, filtros: { mod: "Todas", score: 40, texto: "" }, vagaSel: null,
  pipeCand: "", pipeStatus: "", pipeSel: null, candSel: null,
};

/* ------------------------------------------------------------- utilidades */
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3400);
}
const falha = (e) => toast("⚠ " + traduzErro(e));
function traduzErro(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link enviado antes de entrar.";
  if (/User already registered/i.test(m)) return "Este e-mail já tem cadastro. Faça login.";
  if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/schema cache|does not exist/i.test(m)) return "Banco ainda não configurado: execute supabase/schema.sql no Supabase.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor.";
  return m;
}
/** Desembrulha {data, error} do supabase-js. */
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }

function baixarBlob(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
const carimbo = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
const scripts = {};
function carregarScript(url) {
  return (scripts[url] ||= new Promise((ok, erro) => {
    const s = document.createElement("script"); s.src = url; s.onload = ok;
    s.onerror = () => { delete scripts[url]; erro(new Error("Não foi possível carregar " + url)); };
    document.head.appendChild(s);
  }));
}

function modal(html, largo = false) {
  $("#modal").classList.toggle("largo", largo);
  $("#modalCorpo").innerHTML = html;
  if (!$("#modal").open) { $("#modal").showModal(); history.pushState({ ...(history.state || {}), modal: true }, ""); }
}
// fechar o diálogo (botão, Esc ou toque fora) também desfaz a entrada no histórico, para o "voltar" do Android funcionar
$("#modal").addEventListener("close", () => { if (history.state?.modal) history.back(); });

/* ------------------------------------------------------------- telas cheias no celular/tablet */
const mqCompacto = matchMedia("(max-width: 899px)");
let sheetAtual = null;
function abrirSheet(el, titulo) {
  if (!mqCompacto.matches || !el) return;
  if (sheetAtual && sheetAtual !== el) sheetAtual.classList.remove("sheet-aberta");
  sheetAtual = el;
  el.classList.add("sheet-aberta"); el.scrollTop = 0;
  document.body.classList.add("sheet-on");
  $("#sheetBarra").hidden = false; $("#sheetTitulo").textContent = titulo || "";
  if (!history.state?.sheet) history.pushState({ sheet: true }, "");
}
function fecharSheet() {
  sheetAtual?.classList.remove("sheet-aberta"); sheetAtual = null;
  document.body.classList.remove("sheet-on"); $("#sheetBarra").hidden = true;
}
const voltarSheet = () => (history.state?.sheet ? history.back() : fecharSheet());
$("#sheetVoltar").onclick = voltarSheet;
addEventListener("popstate", (e) => {
  if (!e.state?.modal && $("#modal").open) $("#modal").close();
  if (!e.state?.sheet && sheetAtual) fecharSheet();
});
mqCompacto.addEventListener("change", () => { if (!mqCompacto.matches) fecharSheet(); });

/* ------------------------------------------------------------- instalação (PWA) */
let pedidoInstalacao = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalacao = e; $("#cInstalar")?.removeAttribute("hidden"); });
addEventListener("appinstalled", () => { pedidoInstalacao = null; toast("RH+ Match instalado. Abra pelo ícone na tela inicial."); });
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/** Extrai a mensagem de erro de uma chamada a Edge Function. */
async function erroFuncao(r, nome) {
  let msg = r.error?.message || "Erro desconhecido";
  try { msg = (await r.error.context.json()).erro || msg; } catch { /* sem corpo JSON */ }
  if (/Failed to send|not found|404/i.test(msg)) msg = `Função ${nome} indisponível (publique a Edge Function no Supabase).`;
  return msg;
}
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-fechar]")) $("#modal").close(); });

function barras(itens, cor, vazio) {
  if (!itens.length) return `<div class="vazio">${esc(vazio)}</div>`;
  const max = Math.max(...itens.map((i) => i[1]), 1);
  return `<div class="barras">${itens.map(([n, v]) => `<div class="barra"><span class="trunc" title="${esc(n)}">${esc(n)}</span>
      <div class="trilho"><div style="width:${(v / max) * 100}%;background:${cor}"></div></div><b>${v}</b></div>`).join("")}</div>`;
}
const corParcial = (v) => (v >= 70 ? "var(--verde)" : v >= 40 ? "var(--lar)" : "var(--verm)");
const scoreTag = (s) => `<span class="score f-${classificar(s || 0).toLowerCase()}">${Math.round(s || 0)}</span>`;
const dataCurta = (iso) => (iso ? String(iso).slice(0, 10).split("-").slice(1).reverse().join("/") : "—");
const dataHora = (ts) => { if (!ts) return ""; const d = new Date(ts); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const topo = (titulo, sub, acoes = "") => `<div class="topo"><div><h1>${titulo}</h1><p>${sub}</p></div><div class="acoes">${acoes}</div></div>`;
const fonteDisponivel = (f) => !f.chaves || f.chaves.every((k) => CFG[k]);

/* ------------------------------------------------------------- tema */
function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("rh_tema", t); } catch { /* ok */ }
  atualizarCorBarra();
}
// cor da barra de status / navegador acompanha o tema (no celular a área do topo é o fundo da página)
function atualizarCorBarra() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const escuro = document.documentElement.dataset.theme === "dark";
  meta.content = matchMedia("(max-width: 767px)").matches && !document.body.classList.contains("sem-sessao")
    ? (escuro ? "#0E1220" : "#F4F6FB") : (escuro ? "#0A0D1A" : "#111633");
}
matchMedia("(max-width: 767px)").addEventListener("change", atualizarCorBarra);
$("#btnTema").onclick = () => aplicarTema(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

/* ------------------------------------------------------------- autenticação */
const urlApp = () => location.origin + location.pathname;

function telaLogin(modo = "entrar", msg = "") {
  document.body.classList.add("sem-sessao"); atualizarCorBarra();
  const titulos = { entrar: "Entrar", criar: "Criar conta", esqueci: "Recuperar senha", nova: "Definir nova senha" };
  main.innerHTML = `<div class="login"><div class="card">
    <div class="brand"><span class="logo" style="color:#fff">R+</span><div><b>RH+ Match</b><small>Inteligência em recolocação</small></div></div>
    <h2 style="margin:0 0 14px;font-size:18px">${titulos[modo]}</h2>
    <form id="fLogin">
      ${modo !== "nova" ? `<label class="campo">E-mail<input type="email" name="email" required autocomplete="email"></label>` : ""}
      ${modo !== "esqueci" ? `<label class="campo">${modo === "nova" ? "Nova senha" : "Senha"}<input type="password" name="senha" required minlength="6" autocomplete="${modo === "entrar" ? "current-password" : "new-password"}"></label>` : ""}
      <button class="btn" type="submit">${modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : modo === "esqueci" ? "Enviar link" : "Salvar senha"}</button>
      <div class="msg" id="msgLogin">${esc(msg)}</div>
      <div class="alt">${modo === "entrar" ? `<a data-modo="criar">Criar conta</a><a data-modo="esqueci">Esqueci a senha</a>` : modo === "nova" ? "" : `<a data-modo="entrar">← Voltar ao login</a>`}</div>
      ${modo === "entrar" ? `<div class="alt"><a id="reenviar" hidden>Reenviar e-mail de confirmação</a></div>` : ""}
    </form></div></div>`;
  $$("[data-modo]").forEach((a) => (a.onclick = () => telaLogin(a.dataset.modo)));
  const reenviar = $("#reenviar");
  if (reenviar) {
    reenviar.hidden = !/expir|Confirme seu e-mail/i.test(msg);
    reenviar.onclick = async () => {
      const email = $("#fLogin").email.value.trim();
      if (!email) return ($("#msgLogin").textContent = "Digite seu e-mail acima e clique em reenviar.");
      try { await q(sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: urlApp() } }));
        $("#msgLogin").textContent = "Enviamos um novo link de confirmação. Verifique sua caixa de entrada (e o spam)."; }
      catch (err) { $("#msgLogin").textContent = traduzErro(err); }
    };
  }
  $("#fLogin").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = $("button", f), msg = $("#msgLogin");
    const email = f.email?.value.trim(), senha = f.senha?.value;
    btn.disabled = true; msg.textContent = "Aguarde…";
    try {
      if (modo === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) { msg.textContent = traduzErro(error); if ($("#reenviar")) $("#reenviar").hidden = !/Confirme seu e-mail/i.test(msg.textContent); return; }
      }
      else if (modo === "criar") {
        const d = await q(sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: urlApp() } }));
        if (!d.session) return telaLogin("entrar", "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.");
      } else if (modo === "esqueci") {
        await q(sb.auth.resetPasswordForEmail(email, { redirectTo: urlApp() }));
        msg.textContent = "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.";
      } else if (modo === "nova") {
        await q(sb.auth.updateUser({ password: senha })); toast("Senha alterada."); location.hash = "#/painel"; iniciarApp();
      }
    } catch (err) { msg.textContent = traduzErro(err); }
    finally { btn.disabled = false; }
  };
}

$("#btnSair").onclick = async () => { await sb.auth.signOut(); };

let appIniciado = false;
async function iniciarApp() {
  document.body.classList.remove("sem-sessao");
  atualizarCorBarra();
  $("#usuario").textContent = USUARIO?.email || "";
  try {
    const c = await q(sb.from("configuracoes").select("*").maybeSingle());
    CFG = { ...CFG_PADRAO, ...(c || {}) };
  } catch (e) { CFG = { ...CFG_PADRAO }; falha(e); }
  estado.filtros.score = CFG.score_minimo_padrao;
  appIniciado = true;
  rotear();
}

function limparUrl() { history.replaceState(null, "", location.pathname + "#/painel"); }

function telaConfirmada() {
  document.body.classList.add("sem-sessao"); atualizarCorBarra();
  main.innerHTML = `<div class="login"><div class="card" style="text-align:center">
    <div class="brand" style="justify-content:center"><span class="logo" style="color:#fff">R+</span><div style="text-align:left"><b>RH+ Match</b><small>Inteligência em recolocação</small></div></div>
    <div style="font-size:44px;line-height:1">✅</div>
    <h2 style="margin:10px 0 6px;font-size:20px">E-mail confirmado!</h2>
    <p class="muted" style="margin:0 0 18px">Sua conta <b>${esc(USUARIO?.email || "")}</b> está ativa e pronta para uso.</p>
    <button class="btn" id="btnAcessar" style="width:100%">Acessar minha conta</button>
  </div></div>`;
  $("#btnAcessar").onclick = () => { location.hash = "#/painel"; iniciarApp(); };
}

let retornoTratado = false;
sb.auth.onAuthStateChange((evento, sessao) => {
  if (evento === "PASSWORD_RECOVERY") { USUARIO = sessao?.user || null; limparUrl(); telaLogin("nova"); return; }
  const novo = sessao?.user || null;
  const mudou = (novo?.id || null) !== (USUARIO?.id || null);
  USUARIO = novo;
  if (!retornoTratado && (RETORNO.tipo || RETORNO.erro)) {
    retornoTratado = true;
    limparUrl();
    if (RETORNO.erro && !USUARIO) {
      const expirado = /expir|invalid/i.test(RETORNO.erro + RETORNO.codigo);
      return telaLogin("entrar", expirado ? "Este link de confirmação expirou ou já foi usado. Se sua conta já foi confirmada, basta entrar. Se não, peça um novo link abaixo."
        : "Não foi possível validar o link: " + RETORNO.erro);
    }
    if (["signup", "email", "email_change", "invite"].includes(RETORNO.tipo)) {
      if (USUARIO) return setTimeout(telaConfirmada, 0);
      return telaLogin("entrar", "E-mail confirmado! Agora é só entrar com seu e-mail e senha.");
    }
  }
  if (!USUARIO) { appIniciado = false; Object.assign(estado, { busca: null, candSel: null, candidatoBusca: null, pipeSel: null }); telaLogin(); }
  else if (mudou || !appIniciado) setTimeout(iniciarApp, 0);
});

/* ------------------------------------------------------------- roteador */
const PAGINAS = { painel: pgPainel, candidatos: pgCandidatos, busca: pgBusca, pipeline: pgPipeline, config: pgConfig };
async function rotear() {
  fecharSheet(); atualizarCorBarra();
  if (!USUARIO || !appIniciado) return;
  const [, nome = "painel"] = location.hash.split("/");
  const pg = PAGINAS[nome] ? nome : "painel";
  $$("nav a").forEach((a) => a.classList.toggle("ativo", a.dataset.page === pg));
  try { await PAGINAS[pg](); } catch (e) { main.innerHTML = `<div class="card vazio">⚠ ${esc(traduzErro(e))}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", rotear);

/* ============================================================= PAINEL */
async function pgPainel() {
  const [d, buscas] = await Promise.all([
    q(sb.rpc("painel_resumo")),
    q(sb.from("buscas").select("termos, compativeis, criada_em, candidatos(nome)").order("criada_em", { ascending: false }).limit(6)),
  ]);
  const st = d.status || {};
  const ativos = Object.entries(st).filter(([s]) => s !== "Descartada" && s !== "Contratado").reduce((a, [, n]) => a + n, 0);
  const kpi = (rot, val, sub, ico, cor) => `<div class="card kpi"><i style="background:color-mix(in srgb, ${cor} 14%, transparent);color:${cor}">${ico}</i>
    <small>${rot}</small><b>${val}</b><span>${sub}</span></div>`;
  main.innerHTML = topo(`Olá, ${esc(CFG.empresa_nome || "equipe")} 👋`, "Visão geral da operação de recrutamento") + `
    <div class="kpis">
      ${kpi("CANDIDATOS", d.candidatos, "perfis cadastrados", "●", "var(--prim)")}
      ${kpi("VAGAS MAPEADAS", d.vagas, "vagas salvas no banco", "◆", "var(--verde)")}
      ${kpi("NO PIPELINE", ativos, "oportunidades em andamento", "▲", "var(--lar)")}
      ${kpi("CONTRATAÇÕES", st.Contratado || 0, `${st.Entrevista || 0} em entrevista`, "★", "var(--verde)")}
    </div>
    <div class="grid2">
      <div class="card"><h3>Funil do pipeline</h3>${barras(STATUS_PIPELINE.filter((s) => st[s]).map((s) => [s, st[s]]), "var(--prim)", "Adicione vagas ao pipeline a partir da busca")}</div>
      <div class="card"><h3>Vagas coletadas por canal</h3>${barras(d.por_fonte || [], "var(--verde)", "Faça a primeira busca para popular este gráfico")}</div>
      <div class="card"><h3>Competências mais pedidas pelo mercado</h3>${barras(d.skills || [], "var(--lar)", "Disponível após as primeiras buscas")}</div>
      <div class="card"><div class="topo" style="margin:0 0 6px;align-items:center"><h3 style="margin:0">Últimas buscas</h3>
        <a class="btn sec peq" href="#/busca" style="text-decoration:none">Nova busca</a></div>
        ${buscas.length ? buscas.map((b) => `<div class="linha-busca"><div class="trunc"><b>${esc(b.candidatos?.nome || "Busca livre")}</b>
          <span class="muted"> ${esc(b.termos)}</span></div><div style="white-space:nowrap"><span class="muted">${dataHora(b.criada_em)}</span>
          <span class="chip ok">${b.compativeis} compatíveis</span></div></div>`).join("")
          : `<div class="vazio">Nenhuma busca ainda. Cadastre um candidato e clique em “Buscar vagas”.</div>`}
      </div>
    </div>`;
}

/* ============================================================= CANDIDATOS */
const COLS_CAND = "id, nome, email, telefone, cargo_desejado, cargos_alternativos, skills, senioridade, cidade, uf, modalidades, pretensao_salarial, aceita_mudanca, resumo";
const listarCandidatos = (filtro = "") => {
  let r = sb.from("candidatos").select(COLS_CAND).order("nome");
  const f = filtro.replace(/[%,()*]/g, " ").trim();
  if (f) r = r.or(["nome", "cargo_desejado", "skills", "cidade"].map((c) => `${c}.ilike.%${f}%`).join(","));
  return q(r);
};
const obterCandidato = async (id) => q(sb.from("candidatos").select(COLS_CAND).eq("id", id).maybeSingle());

async function pgCandidatos() {
  main.innerHTML = topo("Candidatos", "Perfis que o sistema usa para encontrar as vagas certas", `
      <button class="btn sec" id="btnImportar">⬆ Importar currículo</button>
      <button class="btn" id="btnNovo">+ Novo candidato</button>
      <input type="file" id="arqCv" accept=".pdf,.docx,.txt" hidden>`) + `
    <div class="split-cand">
      <div class="card"><input type="search" id="qCand" placeholder="🔍 Buscar por nome, cargo, skill ou cidade" style="margin-bottom:12px">
        <div class="tabela-wrap" style="max-height:calc(100vh - 230px)"><table><thead><tr><th>NOME</th><th>CARGO DESEJADO</th><th>LOCAL</th></tr></thead>
        <tbody id="listaCand"></tbody></table></div></div>
      <div class="card" id="formCand"></div>
    </div>`;
  const carregar = async () => {
    const lista = await listarCandidatos($("#qCand").value);
    $("#listaCand").innerHTML = lista.length ? lista.map((c) => `<tr data-id="${c.id}" class="${c.id === estado.candSel ? "sel" : ""}">
      <td class="trunc"><b>${esc(c.nome)}</b></td><td class="trunc">${esc(c.cargo_desejado)}</td>
      <td class="trunc muted">${esc([c.cidade, c.uf].filter(Boolean).join(" / ") || "—")}</td></tr>`).join("")
      : `<tr><td colspan="3" class="vazio">Nenhum candidato cadastrado.</td></tr>`;
  };
  let tq; $("#qCand").oninput = () => { clearTimeout(tq); tq = setTimeout(() => carregar().catch(falha), 250); };
  $("#listaCand").onclick = async (e) => {
    const tr = e.target.closest("tr[data-id]"); if (!tr) return;
    estado.candSel = +tr.dataset.id;
    $$("#listaCand tr").forEach((x) => x.classList.toggle("sel", x === tr));
    try { const c = await obterCandidato(estado.candSel) || {}; formCandidato(c, carregar); abrirSheet($("#formCand"), c.nome || "Candidato"); } catch (err) { falha(err); }
  };
  $("#listaCand").ondblclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) irBusca(+tr.dataset.id); };
  $("#btnNovo").onclick = () => { estado.candSel = null; $$("#listaCand tr").forEach((x) => x.classList.remove("sel")); formCandidato({}, carregar); abrirSheet($("#formCand"), "Novo candidato"); };
  $("#btnImportar").onclick = () => $("#arqCv").click();
  $("#arqCv").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      toast("Lendo currículo…");
      const dados = analisarCurriculo(await lerCurriculo(f));
      estado.candSel = null;
      formCandidato({ modalidades: MODALIDADES.join(","), ...dados }, carregar, true);
      abrirSheet($("#formCand"), "Novo candidato");
      toast("Currículo lido. Revise os campos e salve.");
    } catch (err) { falha(err); }
  };
  await carregar();
  formCandidato(estado.candSel ? (await obterCandidato(estado.candSel)) || {} : {}, carregar);
}

async function lerCurriculo(arq) {
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
      let linha = "", out = [], y = null;
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

function formCandidato(c, recarregar, importado = false) {
  const mods = (c.modalidades ?? MODALIDADES.join(",")).split(",").map((s) => s.trim());
  const campo = (k, rot, dica = "", cls = "", tipo = "text") => `<label class="campo ${cls}">${rot}
    <input type="${tipo}" name="${k}" value="${esc(c[k] ?? "")}" placeholder="${esc(dica)}"></label>`;
  const sel = (k, rot, ops, vazio) => `<label class="campo">${rot}<select name="${k}"><option value="">${vazio}</option>
    ${ops.map((o) => `<option ${c[k] === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
  const novo = !c.id;
  $("#formCand").innerHTML = `
    <div class="topo" style="align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:17px">${novo ? (importado ? "Novo candidato (do currículo)" : "Novo candidato") : esc(c.nome)}</h3>
      ${novo ? "" : `<button class="btn sucesso" id="btnBuscarPerfil">Buscar vagas para este perfil →</button>`}</div>
    <form class="form" id="fCand" autocomplete="off">
      ${campo("nome", "Nome completo *", "Ex.: Mariana Souza")}
      ${campo("email", "E-mail", "nome@email.com", "", "email")}
      ${campo("telefone", "Telefone / WhatsApp", "(11) 99999-0000")}
      ${campo("cargo_desejado", "Cargo desejado *", "Ex.: Analista de RH")}
      ${campo("cargos_alternativos", "Cargos alternativos (separe por vírgula)", "Ex.: Analista de Recrutamento, Business Partner", "full")}
      ${campo("skills", "Competências / skills (separe por vírgula)", "Ex.: Recrutamento e Seleção, Departamento Pessoal, Excel, Inglês", "full")}
      ${sel("senioridade", "Senioridade", SENIORIDADES, "Não definido")}
      ${campo("pretensao_salarial", "Pretensão salarial (R$)", "Ex.: 5500")}
      ${campo("cidade", "Cidade", "Ex.: São Paulo")}
      ${sel("uf", "UF", UFS, "--")}
      <div class="campo full"><span style="font-size:12px;font-weight:600;color:var(--texto2)">Modalidades aceitas</span>
        <div class="checks">${MODALIDADES.map((m) => `<label><input type="checkbox" name="mod" value="${m}" ${mods.includes(m) ? "checked" : ""}>${m}</label>`).join("")}
          <label style="margin-left:10px"><span class="switch"><input type="checkbox" name="aceita_mudanca" ${c.aceita_mudanca ? "checked" : ""}><span></span></span>Aceita mudança de cidade</label></div></div>
      <label class="campo full">Resumo profissional / observações do recrutador<textarea name="resumo">${esc(c.resumo || "")}</textarea></label>
    </form>
    <div class="rodape" style="margin-top:16px">
      ${novo ? "<span></span>" : `<button class="btn perigo" id="btnExcluir">Excluir</button>`}
      <button class="btn" id="btnSalvar">Salvar</button></div>`;
  if (!Number(c.pretensao_salarial)) $("#fCand [name=pretensao_salarial]").value = "";

  $("#btnSalvar").onclick = async () => {
    const f = $("#fCand"); const g = (n) => f.elements[n].value.trim();
    let pret = g("pretensao_salarial").replace(/R\$|\s/g, "");
    pret = pret.includes(",") ? pret.replace(/\./g, "").replace(",", ".") : pret;
    const dados = {
      nome: g("nome"), email: g("email"), telefone: g("telefone"), cargo_desejado: g("cargo_desejado"),
      cargos_alternativos: g("cargos_alternativos"), skills: g("skills"), senioridade: g("senioridade"),
      cidade: g("cidade"), uf: g("uf"), resumo: f.elements.resumo.value.trim(),
      pretensao_salarial: parseFloat(pret) || 0, aceita_mudanca: f.elements.aceita_mudanca.checked,
      modalidades: $$("input[name=mod]:checked", f).map((x) => x.value).join(","),
    };
    if (!dados.nome || !dados.cargo_desejado) return toast("Informe pelo menos o nome e o cargo desejado.");
    try {
      const salvo = await q(novo ? sb.from("candidatos").insert(dados).select(COLS_CAND).single()
        : sb.from("candidatos").update(dados).eq("id", c.id).select(COLS_CAND).single());
      estado.candSel = salvo.id; toast("Candidato salvo.");
      await recarregar(); formCandidato(salvo, recarregar);
    } catch (e) { falha(e); }
  };
  if (!novo) {
    $("#btnExcluir").onclick = async () => {
      if (!confirm(`Excluir ${c.nome}? O pipeline desse candidato também será removido. Não é possível desfazer.`)) return;
      try { await q(sb.from("candidatos").delete().eq("id", c.id)); estado.candSel = null; toast("Candidato excluído."); await recarregar(); formCandidato({}, recarregar); if (sheetAtual) voltarSheet(); }
      catch (e) { falha(e); }
    };
    $("#btnBuscarPerfil").onclick = () => irBusca(c.id);
  }
}

function irBusca(cid) { estado.candidatoBusca = cid; location.hash = "#/busca"; }

/* ============================================================= BUSCA */
async function pgBusca() {
  const cands = await listarCandidatos();
  if (!estado.candidatoBusca || !cands.some((c) => c.id === estado.candidatoBusca)) estado.candidatoBusca = cands[0]?.id ?? null;
  const buscando = estado.busca?.estado === "buscando";
  main.innerHTML = topo("Buscar vagas", "Varre os canais de vagas do Brasil e ranqueia pela aderência ao perfil") + `
    <div class="card" style="margin-bottom:14px">
      <div class="barra-busca">
        <label class="campo">Candidato<select id="selCand">${cands.length ? cands.map((c) => `<option value="${c.id}" ${c.id === estado.candidatoBusca ? "selected" : ""}>${esc(c.nome)} · ${esc(c.cargo_desejado)}</option>`).join("") : `<option value="">Cadastre um candidato primeiro</option>`}</select></label>
        <label class="campo">Termos<input type="text" id="termos" placeholder="Cargos a pesquisar, separados por vírgula"></label>
        <button class="btn" id="btnBuscar" style="height:38px">${buscando ? "■ Cancelar" : "🔎 Buscar vagas"}</button>
      </div>
      <div class="canais"><b class="muted" style="font-size:12px">Canais</b>
        ${FONTES.map((f) => { const d = fonteDisponivel(f); return `<label class="${d ? "" : "off"}" title="${esc(f.descricao)}"><input type="checkbox" value="${f.id}" ${d && CFG.fontes_ativas.includes(f.id) ? "checked" : ""} ${d ? "" : "disabled"}>${esc(f.nome)}${d ? "" : " (sem chave)"}</label>`; }).join("")}
        <button class="btn neutro peq" id="btnPortais" style="margin-left:auto">Mais portais ↗</button></div>
      <div id="statusFontes" class="canais" style="margin-top:8px"></div>
      <div class="progresso" id="prog" hidden><div style="width:3%"></div></div>
    </div>
    <div class="split">
      <div class="card">
        <div class="filtros">
          <div class="seg" id="fMod">${["Todas", ...MODALIDADES].map((m) => `<button data-v="${m}" class="${estado.filtros.mod === m ? "on" : ""}">${m}</button>`).join("")}</div>
          <span class="muted">Score mín.</span><input type="range" id="fScore" min="0" max="90" step="5" value="${estado.filtros.score}"><b id="lblScore">${estado.filtros.score}</b>
          <input type="search" id="fTexto" placeholder="Filtrar por empresa, cidade…" value="${esc(estado.filtros.texto)}">
        </div>
        <div class="tabela-wrap" style="max-height:calc(100vh - 330px);min-height:260px"><table>
          <thead><tr><th class="c">SCORE</th><th>CARGO</th><th>EMPRESA</th><th>LOCAL</th><th>MODALIDADE</th><th>CANAL</th><th class="c">DATA</th></tr></thead>
          <tbody id="tbVagas"></tbody></table></div>
        <div class="rodape"><span class="muted" id="lblTotal">Selecione um candidato e clique em Buscar.</span>
          <div class="acoes"><button class="btn neutro peq" id="btnExcel">Exportar Excel</button><button class="btn sec peq" id="btnRelatorio">Relatório p/ cliente</button></div></div>
      </div>
      <div class="card detalhe" id="detVaga"></div>
    </div>`;

  const preencherTermos = () => {
    const c = cands.find((x) => x.id === +$("#selCand").value);
    if (!c) { $("#termos").value = ""; return; }
    $("#termos").value = estado.busca?.candidato.id === c.id ? estado.busca.termos.join(", ") : termosDoCandidato(c).join(", ");
  };
  $("#selCand").onchange = () => { estado.candidatoBusca = +$("#selCand").value || null; preencherTermos(); };
  preencherTermos();
  $("#termos").onkeydown = (e) => { if (e.key === "Enter") $("#btnBuscar").click(); };
  $("#btnBuscar").onclick = () => iniciarBusca(cands);
  $("#btnPortais").onclick = () => abrirPortais(cands);
  $("#fMod").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; estado.filtros.mod = b.dataset.v; $$("#fMod button").forEach((x) => x.classList.toggle("on", x === b)); renderVagas(); };
  $("#fScore").oninput = (e) => { estado.filtros.score = +e.target.value; $("#lblScore").textContent = e.target.value; renderVagas(); };
  $("#fTexto").oninput = (e) => { estado.filtros.texto = e.target.value; renderVagas(); };
  $("#tbVagas").onclick = (e) => { const tr = e.target.closest("tr[data-idx]"); if (tr) { estado.vagaSel = +tr.dataset.idx; marcarSel(); detalharVaga(); abrirSheet($("#detVaga"), "Vaga"); } };
  $("#tbVagas").ondblclick = (e) => { const tr = e.target.closest("tr[data-idx]"); if (tr) window.open(estado.busca.vagas[+tr.dataset.idx].url, "_blank", "noopener"); };
  $("#btnExcel").onclick = () => exportarExcel(vagasVisiveis(), estado.busca?.candidato).catch(falha);
  $("#btnRelatorio").onclick = () => abrirRelatorio(vagasVisiveis(), estado.busca?.candidato);
  renderStatus(); renderVagas();
}

const vagasVisiveis = () => {
  const vs = estado.busca?.vagas || []; const f = estado.filtros; const t = f.texto.trim().toLowerCase();
  return vs.filter((v) => v.score >= f.score && (f.mod === "Todas" || v.modalidade === f.mod)
    && (!t || `${v.titulo} ${v.empresa} ${localVaga(v)} ${v.fonte}`.toLowerCase().includes(t)));
};

function renderVagas() {
  if (!$("#tbVagas")) return;
  const vs = vagasVisiveis(), b = estado.busca;
  $("#tbVagas").innerHTML = vs.map((v) => `<tr data-idx="${v.idx}">
    <td class="c">${scoreTag(v.score)}</td><td class="trunc" title="${esc(v.titulo)}"><b>${esc(v.titulo)}</b></td>
    <td class="trunc">${esc(v.empresa || "—")}</td><td class="trunc">${esc(localVaga(v))}</td><td>${esc(v.modalidade || "—")}</td>
    <td class="muted">${esc(v.fonte)}</td><td class="c muted">${dataCurta(v.publicada_em)}</td></tr>`).join("")
    || `<tr><td colspan="7" class="vazio">${b?.estado === "buscando" ? "Buscando nos canais…" : b?.vagas?.length ? "Nenhuma vaga com esses filtros. Reduza o score mínimo." : b ? "Nenhuma vaga encontrada." : "Os resultados aparecem aqui."}</td></tr>`;
  if (b && b.estado !== "buscando") {
    let txt = `${vs.length} vagas exibidas · ${vs.filter((v) => v.score >= 75).length} excelentes · ${b.vagas.length} analisadas no total`;
    const ne = Object.values(b.progresso).filter((p) => p.status === "erro").length;
    if (ne) txt += ` · ${ne} canal(is) indisponível(is)`;
    $("#lblTotal").textContent = txt;
  } else if (b) $("#lblTotal").textContent = `Buscando “${b.termos.join(", ")}” em ${Object.keys(b.progresso).length} canais…`;
  if (!vs.some((v) => v.idx === estado.vagaSel)) estado.vagaSel = vs[0]?.idx ?? null;
  marcarSel(); detalharVaga();
}
function marcarSel() { $$("#tbVagas tr").forEach((tr) => tr.classList.toggle("sel", +tr.dataset.idx === estado.vagaSel)); }

function detalharVaga() {
  const el = $("#detVaga"); if (!el) return;
  const v = estado.vagaSel != null ? estado.busca?.vagas[estado.vagaSel] : null;
  if (!v) { el.innerHTML = `<div class="vazio"><div class="ico">🎯</div><b>Selecione uma vaga</b><br>para ver por que ela combina com o candidato.</div>`; return; }
  const d = v.detalhes_score || {}, faixa = classificar(v.score);
  const obs = [d.cargo, d.local, d.senioridade, d.salario, d.alerta].filter(Boolean).join(" · ");
  el.innerHTML = `<div class="det">
    <div class="det-topo"><div class="bola f-${faixa.toLowerCase()}"><b>${Math.round(v.score)}</b><small>${faixa}</small></div>
      <div><h2>${esc(v.titulo)}</h2><p>${esc(v.empresa || "Empresa não divulgada")}</p></div></div>
    <div>${[localVaga(v), v.modalidade, v.senioridade, v.contrato, v.salario, v.fonte].filter(Boolean).map((t) => `<span class="chip">${esc(String(t).slice(0, 40))}</span>`).join("")}</div>
    <h4>Por que combina</h4>
    <div class="barras">${Object.entries(d.parciais || {}).map(([k, val]) => `<div class="barra"><span>${ROTULO_PARCIAL[k] || k}</span>
      <div class="trilho"><div style="width:${val}%;background:${corParcial(val)}"></div></div><b>${val}%</b></div>`).join("")}</div>
    <p class="muted" style="font-size:12px">${esc(obs)}</p>
    ${d.skills_ok?.length ? `<h4>Competências que o candidato tem</h4>${d.skills_ok.map((s) => `<span class="chip ok">${esc(s)}</span>`).join("")}` : ""}
    ${d.skills_faltam?.length ? `<h4>Pedidas na vaga e ausentes no perfil</h4>${d.skills_faltam.map((s) => `<span class="chip gap">${esc(s)}</span>`).join("")}` : ""}
    <h4>Descrição</h4><div class="desc">${esc((v.descricao || "Descrição completa no anúncio.").slice(0, 2500))}</div>
    <button class="btn ia" id="btnAdaptar" style="width:100%;margin-top:14px">✨ Adaptar currículo para esta vaga</button>
    <div class="det-acoes"><a class="btn neutro" href="${esc(v.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir vaga ↗</a>
      <button class="btn" id="btnPipe">+ Adicionar ao pipeline</button></div></div>`;
  $("#btnPipe").onclick = () => adicionarPipeline(v).catch(falha);
  $("#btnAdaptar").onclick = () => abrirAdaptador(v, estado.busca.candidato);
}

function renderStatus() {
  const el = $("#statusFontes"); if (!el) return;
  const b = estado.busca;
  if (!b) { el.innerHTML = ""; $("#prog").hidden = true; return; }
  const ent = Object.entries(b.progresso);
  el.innerHTML = ent.map(([nome, p]) => p.status === "ok" ? `<span class="chip ok">✓ ${esc(nome)} · ${p.qtd}</span>`
    : p.status === "erro" ? `<span class="chip erro" title="${esc(p.erro || "")}">✕ ${esc(nome)}</span>`
    : `<span class="chip prim">◌ ${esc(nome)}…</span>`).join("");
  const feitas = ent.filter(([, p]) => p.status !== "buscando").length;
  $("#prog").hidden = b.estado !== "buscando";
  $("#prog div").style.width = Math.max(3, (feitas / Math.max(1, ent.length)) * 100) + "%";
}

async function iniciarBusca(cands) {
  const btn = $("#btnBuscar");
  if (estado.busca?.estado === "buscando") { estado.busca.cancelada = true; finalizarBusca(estado.busca); return; }
  const candidato = cands.find((c) => c.id === +$("#selCand").value);
  if (!candidato) return toast("Cadastre e selecione um candidato para buscar vagas.");
  const fontes = $$(".canais input[type=checkbox]:checked").map((x) => FONTES.find((f) => f.id === x.value));
  const termos = $("#termos").value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5);
  if (!fontes.length || !termos.length) return toast("Selecione ao menos um canal e informe um termo de busca.");

  const b = { id: Date.now(), estado: "buscando", candidato, termos, progresso: {}, brutas: [], vagas: [], cancelada: false };
  fontes.forEach((f) => (b.progresso[f.nome] = { status: "buscando", qtd: 0 }));
  estado.busca = b; estado.vagaSel = null;
  btn.textContent = "■ Cancelar";
  renderStatus(); renderVagas();
  const skills = String(candidato.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
  await Promise.all(fontes.map(async (f) => {
    try {
      const r = await sb.functions.invoke("buscar-vagas", {
        body: { fonte: f.id, termos, cidade: candidato.cidade || "", uf: candidato.uf || "", skills, paginas: CFG.paginas_por_fonte },
      });
      if (r.error) throw new Error(await erroFuncao(r, "buscar-vagas"));
      const vagas = r.data?.vagas || [];
      if (!vagas.length && r.data?.erro) throw new Error(r.data.erro);
      b.brutas.push(...vagas);
      b.progresso[f.nome] = { status: "ok", qtd: vagas.length };
    } catch (e) { b.progresso[f.nome] = { status: "erro", qtd: 0, erro: e.message }; }
    if (estado.busca === b && b.estado === "buscando") renderStatus();
  }));
  if (b.estado === "buscando") finalizarBusca(b);
}

async function finalizarBusca(b) {
  b.estado = "concluida";
  b.vagas = consolidar(b.candidato, b.brutas).map((v, idx) => ({ ...v, idx }));
  const btn = $("#btnBuscar"); if (btn && estado.busca === b) { btn.disabled = false; btn.textContent = "🔎 Buscar vagas"; }
  if (estado.busca === b) { renderStatus(); renderVagas(); }
  toast(b.cancelada ? `Busca cancelada: ${b.vagas.length} vagas até aqui.` : `Busca concluída: ${b.vagas.length} vagas analisadas.`);
  try {
    const okFontes = Object.entries(b.progresso).filter(([, p]) => p.status === "ok").map(([n]) => n);
    await q(sb.from("buscas").insert({ candidato_id: b.candidato.id, termos: b.termos.join(", "), total: b.vagas.length,
      compativeis: b.vagas.filter((v) => v.score >= CFG.score_minimo_padrao).length, fontes: okFontes.join(", ") }));
    const salvar = b.vagas.filter((v) => v.score >= 30);
    for (let i = 0; i < salvar.length; i += 200) await salvarVagas(salvar.slice(i, i + 200));
  } catch (e) { falha(e); }
}

const linhaVaga = (v) => ({
  owner: USUARIO.id, url: v.url, titulo: v.titulo, empresa: v.empresa || "", fonte: v.fonte, cidade: v.cidade || "", uf: v.uf || "",
  modalidade: v.modalidade || "", senioridade: v.senioridade || "", salario: v.salario || "", contrato: v.contrato || "",
  descricao: (v.descricao || "").slice(0, 20000), tags: v.tags || [], skills: extrairSkills([v.titulo, (v.tags || []).join(" "), v.descricao].join(" ")),
  publicada_em: /^\d{4}-\d{2}-\d{2}$/.test(v.publicada_em || "") ? v.publicada_em : null,
});
async function salvarVagas(vagas) {
  if (!vagas.length) return [];
  const unicas = [...new Map(vagas.map((v) => [v.url, linhaVaga(v)])).values()];
  return q(sb.from("vagas").upsert(unicas, { onConflict: "owner,url" }).select("id, url"));
}

async function adicionarPipeline(v) {
  const [salva] = await salvarVagas([v]);
  const { error } = await sb.from("pipeline").insert({ candidato_id: estado.busca.candidato.id, vaga_id: salva.id, score: v.score, detalhes: v.detalhes_score });
  if (error && error.code === "23505") return toast("Essa vaga já está no pipeline do candidato.");
  if (error) throw error;
  toast("Vaga adicionada ao pipeline.");
}

function abrirPortais(cands) {
  const c = cands.find((x) => x.id === +$("#selCand").value);
  const termo = ($("#termos").value.split(",")[0] || "").trim() || c?.cargo_desejado || "vagas";
  const remoto = c ? c.modalidades === "Remoto" : false;
  modal(`<h3 style="margin:0 0 4px">Busca pronta em outros portais</h3>
    <p class="muted" style="margin:0">Termo: “${esc(termo)}”. Estes sites não oferecem integração pública; a pesquisa abre já filtrada em nova aba.</p>
    <div class="links">${linksBusca(termo, c?.cidade || "", c?.uf || "", remoto).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join("")}</div>
    <div class="rodape"><button class="btn neutro" data-fechar>Fechar</button></div>`);
}

/* ---------------------------------------------------------------- exportações */
async function novaPlanilha() {
  await carregarScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
  return new window.ExcelJS.Workbook();
}
function cabecalho(ws, cols, larguras) {
  ws.columns = cols.map((h, i) => ({ header: h, width: larguras[i] }));
  ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
async function salvarPlanilha(wb, nome) {
  baixarBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nome);
}

async function exportarExcel(vagas, candidato) {
  if (!vagas.length) return toast("Faça uma busca primeiro.");
  const wb = await novaPlanilha(), ws = wb.addWorksheet("Vagas compatíveis");
  cabecalho(ws, ["Score", "Compatibilidade", "Cargo", "Empresa", "Local", "Modalidade", "Nível", "Contrato", "Salário", "Skills que batem",
    "Skills a desenvolver", "Fonte", "Publicada", "Link"], [8, 15, 45, 28, 22, 13, 12, 12, 16, 35, 35, 18, 12, 12]);
  const cores = { Excelente: "FFD1FAE5", Alta: "FFE0E7FF", Média: "FFFEF3C7", Baixa: "FFF3F4F6" };
  for (const v of vagas) {
    const faixa = classificar(v.score), d = v.detalhes_score || {};
    const r = ws.addRow([v.score, faixa, v.titulo, v.empresa, localVaga(v), v.modalidade, v.senioridade, v.contrato, v.salario,
      (d.skills_ok || []).join(", "), (d.skills_faltam || []).join(", "), v.fonte, v.publicada_em, { text: "Abrir vaga", hyperlink: v.url }]);
    r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cores[faixa] } };
    r.getCell(14).font = { color: { argb: "FF4F46E5" }, underline: true };
  }
  ws.autoFilter = { from: "A1", to: "N1" };
  if (candidato) {
    const p = wb.addWorksheet("Candidato");
    p.columns = [{ width: 22 }, { width: 70 }];
    [["Nome", candidato.nome], ["Cargo desejado", candidato.cargo_desejado], ["Cargos alternativos", candidato.cargos_alternativos],
      ["Skills", candidato.skills], ["Senioridade", candidato.senioridade], ["Cidade/UF", `${candidato.cidade}/${candidato.uf}`],
      ["Modalidades", candidato.modalidades], ["Pretensão", Number(candidato.pretensao_salarial) || 0], ["Gerado em", new Date().toLocaleString("pt-BR")]]
      .forEach((l) => { const r = p.addRow(l); r.getCell(1).font = { bold: true }; });
  }
  const primeiro = (candidato?.nome || "busca").split(" ")[0].toLowerCase();
  await salvarPlanilha(wb, `vagas_${primeiro}_${carimbo()}.xlsx`);
}

function abrirRelatorio(vagas, c) {
  if (!vagas.length || !c) return toast("Faça uma busca primeiro.");
  const empresa = esc(CFG.empresa_nome || "RH+ Match");
  const linhas = vagas.slice(0, 25).map((v) => {
    const d = v.detalhes_score || {}, faixa = classificar(v.score);
    return `<article class="vaga"><div class="score s-${faixa.toLowerCase()}"><b>${Math.round(v.score)}</b><small>${faixa}</small></div>
      <div class="info"><h3><a href="${esc(v.url)}">${esc(v.titulo)}</a></h3>
      <p class="meta">${esc(v.empresa || "Empresa confidencial")} · ${esc(localVaga(v))} · ${esc(v.modalidade || "Modalidade n/i")}${v.contrato ? " · " + esc(v.contrato) : ""}${v.salario ? " · " + esc(v.salario) : ""} · via ${esc(v.fonte)}</p>
      <p class="why">${esc(d.cargo || "")} · ${esc(d.local || "")} · ${esc(d.senioridade || "")}</p>
      <div>${(d.skills_ok || []).map((s) => `<span class="tag ok">${esc(s)}</span>`).join("")}${(d.skills_faltam || []).slice(0, 5).map((s) => `<span class="tag gap">${esc(s)}</span>`).join("")}</div></div></article>`;
  }).join("");
  const exc = vagas.filter((v) => v.score >= 75).length, altas = vagas.filter((v) => v.score >= 60 && v.score < 75).length;
  const cargos = [c.cargo_desejado, ...String(c.cargos_alternativos || "").split(",")].map((s) => s.trim()).filter(Boolean).join(", ");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório de vagas – ${esc(c.nome)}</title><style>
body{font-family:Segoe UI,Arial,sans-serif;background:#F4F6FB;color:#141A2E;margin:0;padding:32px}.wrap{max-width:960px;margin:auto}
header{background:#111633;color:#fff;border-radius:16px;padding:28px 32px}header h1{margin:0 0 4px;font-size:26px}header p{margin:0;opacity:.8}
.kpis{display:flex;gap:12px;margin:18px 0;flex-wrap:wrap}.kpi{flex:1;min-width:160px;background:#fff;border:1px solid #E3E7F0;border-radius:12px;padding:14px 18px}
.kpi b{font-size:26px;display:block}.kpi span{color:#5B6478;font-size:13px}
.perfil{background:#fff;border:1px solid #E3E7F0;border-radius:12px;padding:16px 20px;margin-bottom:18px;font-size:14px;line-height:1.6}
.vaga{display:flex;gap:16px;background:#fff;border:1px solid #E3E7F0;border-radius:12px;padding:16px;margin-bottom:10px;page-break-inside:avoid}
.score{min-width:70px;height:70px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}
.score b{font-size:24px}.score small{font-size:11px}.s-excelente{background:#0E9F6E}.s-alta{background:#4F46E5}.s-média{background:#D97706}.s-baixa{background:#9AA3BA}
h3{margin:0 0 4px;font-size:16px}h3 a{color:#141A2E;text-decoration:none}.meta{margin:0;color:#5B6478;font-size:13px}.why{margin:6px 0;font-size:12px;color:#5B6478}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:6px;margin:2px 4px 0 0}.ok{background:#E3F7EF;color:#0E7A55}.gap{background:#FDF1DE;color:#A35A00}
footer{text-align:center;color:#9AA3BA;font-size:12px;margin-top:24px}@media print{body{background:#fff;padding:0}}
</style></head><body><div class="wrap">
<header><h1>Oportunidades para ${esc(c.nome)}</h1><p>${esc(c.cargo_desejado)} · ${esc(c.senioridade || "")} · ${esc(c.cidade)}/${esc(c.uf)} — preparado por ${empresa} em ${new Date().toLocaleDateString("pt-BR")}</p></header>
<div class="kpis"><div class="kpi"><b>${vagas.length}</b><span>vagas selecionadas para o perfil</span></div>
<div class="kpi"><b>${exc}</b><span>compatibilidade excelente (75+)</span></div><div class="kpi"><b>${altas}</b><span>compatibilidade alta (60–74)</span></div></div>
<div class="perfil"><b>Perfil buscado:</b> ${esc(cargos)}<br><b>Competências:</b> ${esc(c.skills)}<br><b>Modalidades aceitas:</b> ${esc(String(c.modalidades || "").replace(/,/g, ", "))}</div>
${linhas}<footer>Gerado pelo RH+ Match · Os links levam ao anúncio original de cada portal.</footer></div></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const w = window.open(url, "_blank");
  if (!w) baixarBlob(new Blob([html], { type: "text/html" }), `relatorio_${c.nome.split(" ")[0].toLowerCase()}_${carimbo()}.html`);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ============================================================= CURRÍCULO ADAPTADO COM IA */
const slugArq = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

function abrirAdaptador(vaga, candidato) {
  modal(`<h3 style="margin:0 0 2px">✨ Adaptar currículo para esta vaga</h3>
    <p class="muted" style="margin:0 0 12px"><b>${esc(vaga.titulo)}</b> · ${esc(vaga.empresa || "Empresa não divulgada")}</p>
    <p style="margin:0 0 10px;font-size:13px">Anexe o currículo do candidato. A IA reescreve o resumo, reorganiza as competências e destaca nas experiências o que mais conta para esta vaga. <b>Empresas, cargos e datas não são alterados</b> e nada é inventado: os acréscimos aparecem marcados para você revisar.</p>
    <label class="btn sec" style="display:inline-block;cursor:pointer">📎 Anexar currículo (PDF, DOCX ou TXT)<input type="file" id="cvArq" accept=".pdf,.docx,.txt" hidden></label>
    <span class="muted" id="cvNome" style="margin-left:8px;font-size:13px"></span>
    <label class="campo" style="margin-top:12px">Texto do currículo (pode revisar ou colar aqui)
      <textarea id="cvTexto" style="min-height:220px;font-size:13px" placeholder="O texto extraído do arquivo aparece aqui."></textarea></label>
    <div class="msg muted" id="cvMsg" style="font-size:13px;min-height:18px;margin-top:6px"></div>
    <div class="rodape"><button class="btn neutro" data-fechar>Cancelar</button><button class="btn ia" id="cvGerar">Gerar currículo adaptado</button></div>`, true);
  $("#cvArq").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#cvNome").textContent = "Lendo " + f.name + "…";
    try { $("#cvTexto").value = (await lerCurriculo(f)).trim(); $("#cvNome").textContent = f.name; }
    catch (err) { $("#cvNome").textContent = ""; $("#cvMsg").textContent = "⚠ " + traduzErro(err); }
  };
  $("#cvGerar").onclick = async () => {
    const curriculo = $("#cvTexto").value.trim();
    if (curriculo.length < 200) return ($("#cvMsg").textContent = "Anexe o currículo (ou cole o texto completo) antes de gerar.");
    const btn = $("#cvGerar"); btn.disabled = true; btn.textContent = "Gerando…";
    $("#cvMsg").textContent = "A IA está adaptando o currículo. Isso costuma levar de 30 segundos a 2 minutos.";
    try {
      const r = await sb.functions.invoke("adaptar-curriculo", { body: {
        curriculo,
        vaga: { titulo: vaga.titulo, empresa: vaga.empresa, descricao: String(vaga.descricao || "").slice(0, 15000), local: localVaga(vaga),
          modalidade: vaga.modalidade, senioridade: vaga.senioridade, contrato: vaga.contrato, tags: (vaga.tags || []).slice(0, 20) },
        candidato: candidato ? { cargo_desejado: candidato.cargo_desejado, skills: candidato.skills } : null,
      } });
      if (r.error) throw new Error(await erroFuncao(r, "adaptar-curriculo"));
      mostrarAdaptado(r.data.curriculo, vaga);
    } catch (err) {
      btn.disabled = false; btn.textContent = "Gerar currículo adaptado";
      $("#cvMsg").textContent = "⚠ " + traduzErro(err);
    }
  };
}

function htmlCurriculo(cv, destacar) {
  const novo = (t, ehNovo) => ehNovo && destacar ? `<span class="novo">${esc(t)}</span>` : esc(t);
  const lista = (titulo, itens) => itens?.length ? `<h2>${titulo}</h2><ul>${itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
  return `<div class="cv">
    <h1>${esc(cv.nome)}</h1>
    ${cv.titulo_profissional ? `<p class="titulo">${esc(cv.titulo_profissional)}</p>` : ""}
    ${cv.contato?.length ? `<p class="contato">${cv.contato.map(esc).join(" · ")}</p>` : ""}
    ${cv.resumo ? `<h2>Resumo profissional</h2><p>${esc(cv.resumo)}</p>` : ""}
    ${cv.competencias?.length ? `<h2>Competências</h2><p class="skills">${cv.competencias.map((s) => novo(s.nome, s.nova)).join(" · ")}</p>` : ""}
    ${cv.experiencias?.length ? `<h2>Experiência profissional</h2>${cv.experiencias.map((x) => `
      <div class="exp"><div class="exp-topo"><b>${esc(x.cargo)}</b>${x.empresa ? ` — ${esc(x.empresa)}` : ""}<span>${esc([x.periodo, x.local].filter(Boolean).join(" · "))}</span></div>
      <ul>${(x.itens || []).map((i) => `<li>${novo(i.texto, i.novo)}</li>`).join("")}</ul></div>`).join("")}` : ""}
    ${lista("Formação", cv.formacao)}${lista("Certificações e cursos", cv.certificacoes)}${lista("Idiomas", cv.idiomas)}
    ${(cv.outras_secoes || []).map((s) => lista(esc(s.titulo), s.itens)).join("")}
  </div>`;
}
const CSS_CV = `.cv{font-family:Calibri,Segoe UI,Arial,sans-serif;color:#1d2433;font-size:11pt;line-height:1.45;max-width:780px;margin:auto}
.cv h1{font-size:22pt;margin:0;color:#111633}.cv .titulo{font-size:12.5pt;color:#4F46E5;margin:2px 0 4px;font-weight:600}
.cv .contato{color:#5B6478;margin:0 0 6px;font-size:10pt}.cv h2{font-size:11.5pt;text-transform:uppercase;letter-spacing:.06em;color:#111633;border-bottom:1.5px solid #4F46E5;padding-bottom:2px;margin:16px 0 6px}
.cv p{margin:0 0 6px}.cv ul{margin:2px 0 8px;padding-left:18px}.cv li{margin:2px 0}.cv .exp{margin-bottom:8px}
.cv .exp-topo span{float:right;color:#5B6478;font-size:10pt}.cv .skills{line-height:1.7}
.cv .novo{background:#E3F7EF;color:#0B6B4C;border-radius:3px;padding:0 2px}`;

function documentoCurriculo(cv, paraWord = false) {
  const cab = paraWord ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` : `<!doctype html><html lang="pt-BR">`;
  return `${cab}<head><meta charset="utf-8"><title>Currículo – ${esc(cv.nome)}</title><style>body{margin:24px}${CSS_CV}
    .cv .exp-topo span{float:none;display:block}@page{margin:18mm}</style></head><body>${htmlCurriculo(cv, false)}</body></html>`;
}

function mostrarAdaptado(cv, vaga) {
  const novos = (cv.competencias || []).filter((s) => s.nova).length + (cv.experiencias || []).reduce((a, x) => a + (x.itens || []).filter((i) => i.novo).length, 0);
  modal(`<style>${CSS_CV}</style>
    <div class="topo" style="align-items:center;margin-bottom:10px"><div><h3 style="margin:0">Currículo adaptado</h3>
      <p class="muted" style="margin:2px 0 0">${esc(vaga.titulo)} · ${esc(vaga.empresa || "")}</p></div>
      <div class="acoes"><button class="btn neutro peq" id="cvWord">⬇ Word (.doc)</button><button class="btn neutro peq" id="cvPdf">🖨 Imprimir / PDF</button></div></div>
    <div class="cv-layout">
      <div class="cv-folha">${htmlCurriculo(cv, true)}</div>
      <aside class="cv-notas">
        <p><b>O que mudou</b><br>${esc(cv.observacoes || "")}</p>
        ${novos ? `<p><span class="novo-tag">verde</span> = ${novos} acréscimo(s) da IA. Confira se são verdadeiros antes de enviar.</p>` : ""}
        ${(cv.competencias || []).some((s) => s.nova) ? `<p><b>Competências acrescentadas</b></p><ul>${cv.competencias.filter((s) => s.nova).map((s) => `<li><b>${esc(s.nome)}</b>: ${esc(s.justificativa)}</li>`).join("")}</ul>` : ""}
        ${cv.lacunas?.length ? `<p><b>Pedido na vaga e não comprovado no currículo</b> (não foi incluído)</p><ul>${cv.lacunas.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        ${cv.palavras_chave?.length ? `<p><b>Palavras-chave da vaga presentes</b><br>${cv.palavras_chave.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</p>` : ""}
      </aside>
    </div>
    <div class="rodape"><span class="muted" style="font-size:12px">Gerado com IA (Claude, da Anthropic). Revise antes de enviar.</span><button class="btn" data-fechar>Fechar</button></div>`, true);
  const nomeArq = `curriculo_${slugArq(cv.nome)}_${slugArq(vaga.empresa || vaga.titulo)}`;
  $("#cvWord").onclick = () => baixarBlob(new Blob(["﻿" + documentoCurriculo(cv, true)], { type: "application/msword" }), nomeArq + ".doc");
  $("#cvPdf").onclick = () => {
    const html = documentoCurriculo(cv).replace("</body>", "<script>onload=()=>setTimeout(()=>print(),300)<\/script></body>");
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    if (!window.open(url, "_blank")) baixarBlob(new Blob([html], { type: "text/html" }), nomeArq + ".html");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
}

/* ============================================================= PIPELINE */
async function pgPipeline() {
  const cands = await listarCandidatos();
  main.innerHTML = topo("Pipeline", "Acompanhe cada indicação até a contratação", `
      <select id="pCand" style="width:240px"><option value="">Todos os candidatos</option>${cands.map((c) => `<option value="${c.id}" ${String(c.id) === estado.pipeCand ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
      <button class="btn neutro" id="pExcel">Exportar Excel</button>`) + `
    <div class="funil" id="funil"></div>
    <div class="split"><div class="card"><div class="tabela-wrap" style="max-height:calc(100vh - 290px);min-height:260px"><table>
      <thead><tr><th>CANDIDATO</th><th>VAGA</th><th>EMPRESA</th><th class="c">SCORE</th><th>ETAPA</th><th class="c">ATUALIZADO</th></tr></thead>
      <tbody id="tbPipe"></tbody></table></div></div>
      <div class="card detalhe" id="detPipe"></div></div>`;
  let itens = [];
  const carregar = async () => {
    let r = sb.from("pipeline").select("id, score, status, notas, detalhes, atualizado_em, candidato_id, candidatos(nome), vagas(titulo, empresa, url, fonte, cidade, uf, modalidade, salario, contrato, senioridade, descricao, tags)")
      .order("atualizado_em", { ascending: false }).order("score", { ascending: false });
    if (estado.pipeCand) r = r.eq("candidato_id", +estado.pipeCand);
    itens = (await q(r)).map((i) => ({ ...i.vagas, ...i, candidato: i.candidatos?.nome || "" }));
    const cont = {}; itens.forEach((i) => { cont[i.status] = (cont[i.status] || 0) + 1; });
    $("#funil").innerHTML = [["", "Todas", itens.length], ...STATUS_PIPELINE.map((s) => [s, s, cont[s] || 0])].map(([v, rot, n]) =>
      `<button data-v="${esc(v)}" class="${estado.pipeStatus === v ? "on" : ""}"><b>${n}</b><small>${esc(rot)}</small></button>`).join("");
    render();
  };
  const visiveis = () => itens.filter((i) => !estado.pipeStatus || i.status === estado.pipeStatus);
  const render = () => {
    const vs = visiveis();
    $("#tbPipe").innerHTML = vs.map((i) => `<tr data-id="${i.id}">
      <td class="trunc">${esc(i.candidato)}</td><td class="trunc" title="${esc(i.titulo)}"><b>${esc(i.titulo)}</b></td><td class="trunc">${esc(i.empresa || "—")}</td>
      <td class="c">${scoreTag(i.score)}</td><td><span class="chip ${i.status === "Contratado" ? "ok" : i.status === "Descartada" ? "" : "prim"}">${esc(i.status)}</span></td>
      <td class="c muted">${dataHora(i.atualizado_em)}</td></tr>`).join("")
      || `<tr><td colspan="6" class="vazio">Nenhuma vaga no pipeline. Adicione a partir da tela de busca.</td></tr>`;
    if (!vs.some((i) => i.id === estado.pipeSel)) estado.pipeSel = vs[0]?.id ?? null;
    $$("#tbPipe tr").forEach((tr) => tr.classList.toggle("sel", +tr.dataset.id === estado.pipeSel));
    detalhe();
  };
  const detalhe = () => {
    const it = itens.find((i) => i.id === estado.pipeSel);
    if (!it) { $("#detPipe").innerHTML = `<div class="vazio"><div class="ico">📋</div><b>Selecione uma oportunidade</b><br>para atualizar a etapa e as notas.</div>`; return; }
    const det = it.detalhes || {}, faixa = classificar(it.score || 0);
    $("#detPipe").innerHTML = `<div class="det">
      <div class="det-topo"><div class="bola f-${faixa.toLowerCase()}"><b>${Math.round(it.score || 0)}</b><small>${faixa}</small></div>
        <div><h2>${esc(it.titulo)}</h2><p>${esc(it.empresa || "Empresa não divulgada")} · para <b>${esc(it.candidato)}</b></p></div></div>
      <div>${[localVaga(it), it.modalidade, it.senioridade, it.contrato, it.salario, it.fonte].filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
      ${det.skills_ok?.length ? `<h4>Competências que batem</h4>${det.skills_ok.map((s) => `<span class="chip ok">${esc(s)}</span>`).join("")}` : ""}
      <h4>Etapa</h4><select id="pStatus">${STATUS_PIPELINE.map((s) => `<option ${s === it.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <h4>Notas do recrutador</h4><textarea id="pNotas" placeholder="Retorno da empresa, datas de entrevista, feedback…">${esc(it.notas || "")}</textarea>
      <button class="btn ia" id="pAdaptar" style="width:100%;margin-top:14px">✨ Adaptar currículo para esta vaga</button>
      <div class="det-acoes"><button class="btn perigo" id="pRem">Remover</button>
        <div class="acoes"><a class="btn neutro" href="${esc(it.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir vaga ↗</a><button class="btn" id="pSalvar">Salvar</button></div></div></div>`;
    $("#pAdaptar").onclick = async () => {
      try { abrirAdaptador(it, await obterCandidato(it.candidato_id)); } catch (e) { falha(e); }
    };
    $("#pSalvar").onclick = async () => {
      try { await q(sb.from("pipeline").update({ status: $("#pStatus").value, notas: $("#pNotas").value.trim() }).eq("id", it.id));
        toast("Pipeline atualizado."); await carregar(); } catch (e) { falha(e); }
    };
    $("#pRem").onclick = async () => {
      if (!confirm("Remover esta vaga do pipeline? Não é possível desfazer.")) return;
      try { await q(sb.from("pipeline").delete().eq("id", it.id)); estado.pipeSel = null; toast("Removida do pipeline."); await carregar(); } catch (e) { falha(e); }
    };
  };
  $("#pCand").onchange = (e) => { estado.pipeCand = e.target.value; carregar().catch(falha); };
  $("#funil").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; estado.pipeStatus = b.dataset.v; $$("#funil button").forEach((x) => x.classList.toggle("on", x === b)); render(); };
  $("#tbPipe").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) { estado.pipeSel = +tr.dataset.id; render(); abrirSheet($("#detPipe"), "Oportunidade"); } };
  $("#pExcel").onclick = async () => {
    if (!itens.length) return toast("O pipeline está vazio.");
    try {
      const wb = await novaPlanilha(), ws = wb.addWorksheet("Pipeline");
      cabecalho(ws, ["Candidato", "Vaga", "Empresa", "Local", "Modalidade", "Score", "Status", "Notas", "Atualizado", "Fonte", "Link"], [24, 42, 26, 20, 12, 8, 18, 40, 16, 18, 50]);
      itens.forEach((i) => ws.addRow([i.candidato, i.titulo, i.empresa, localVaga(i), i.modalidade, i.score, i.status, i.notas, dataHora(i.atualizado_em), i.fonte, i.url]));
      await salvarPlanilha(wb, `pipeline_${carimbo()}.xlsx`);
    } catch (e) { falha(e); }
  };
  await carregar();
}

/* ============================================================= CONFIG */
async function pgConfig() {
  const chaves = [["adzuna_app_id", "Adzuna – App ID", "https://developer.adzuna.com/signup"], ["adzuna_app_key", "Adzuna – App Key", "https://developer.adzuna.com/signup"],
    ["jooble_key", "Jooble – API Key", "https://br.jooble.org/api/about"], ["github_token", "GitHub – token pessoal", "https://github.com/settings/tokens"]];
  const seg = (id, ops, val) => `<div class="seg" id="${id}">${ops.map((o) => `<button type="button" data-v="${o}" class="${String(val) === String(o) ? "on" : ""}">${o}</button>`).join("")}</div>`;
  main.innerHTML = topo("Canais & Configurações", "Escolha onde buscar e ajuste o sistema", `<button class="btn" id="cSalvar">Salvar configurações</button>`) + `
    <div class="card" style="margin-bottom:14px"><div class="topo" style="align-items:center;margin-bottom:10px"><h3 style="margin:0">Canais de vagas integrados</h3>
      <button class="btn sec peq" id="cTestar">Testar conexões</button></div>
      ${FONTES.map((f) => `<div class="fonte-linha"><label class="switch"><input type="checkbox" data-fonte="${f.id}" ${CFG.fontes_ativas.includes(f.id) ? "checked" : ""}><span></span></label>
        <div class="txt"><b>${esc(f.nome)}</b><small>${esc(f.descricao)}</small></div>
        <span class="muted" id="st-${f.id}" style="font-size:12px;font-weight:600"></span><span class="chip">${esc(f.cobertura)}</span></div>`).join("")}
    </div>
    <div class="card" style="margin-bottom:14px"><h3>Chaves de API (opcionais, gratuitas) — ampliam a cobertura</h3>
      <p class="muted" style="margin-top:-4px">Adzuna e Jooble agregam vagas de centenas de sites brasileiros. O token do GitHub aumenta o limite de consultas às comunidades. As chaves ficam salvas na sua conta e só você tem acesso.</p>
      <div class="form">${chaves.map(([k, rot, url]) => `<label class="campo"><span style="display:flex;justify-content:space-between">${rot}<a href="${url}" target="_blank" rel="noopener" style="font-weight:400">obter chave ↗</a></span>
        <input type="password" data-chave="${k}" value="${esc(CFG[k] || "")}" autocomplete="off"></label>`).join("")}</div>
    </div>
    <div class="card" style="margin-bottom:14px"><h3>Conta e aplicativo</h3>
      <p class="muted" style="margin:-4px 0 12px">Conectado como <b>${esc(USUARIO?.email || "")}</b></p>
      <div class="acoes">
        <button class="btn sec" id="cInstalar" ${pedidoInstalacao || (ehIOS() && !instalado()) ? "" : "hidden"}>📲 Instalar no aparelho</button>
        <button class="btn neutro" id="cTema">◐ Tema claro/escuro</button>
        <button class="btn perigo" id="cSair">Sair da conta</button>
      </div>
      ${instalado() ? `<p class="muted" style="margin:10px 0 0;font-size:13px">✓ Você está usando o app instalado.</p>` : ""}
    </div>
    <div class="card"><h3>Preferências</h3><div class="form">
      <label class="campo full">Nome da consultoria (aparece nos relatórios)<input type="text" id="cEmpresa" value="${esc(CFG.empresa_nome || "")}"></label>
      <div class="campo">Páginas lidas por canal ${seg("cPag", [1, 2, 3, 5], CFG.paginas_por_fonte)}</div>
      <div class="campo">Score mínimo padrão ${seg("cScore", [30, 40, 50, 60], CFG.score_minimo_padrao)}</div>
    </div></div>`;
  $$(".seg").forEach((s) => (s.onclick = (e) => { const b = e.target.closest("button"); if (b) $$("button", s).forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#cTema").onclick = () => $("#btnTema").click();
  $("#cSair").onclick = () => { if (confirm("Sair da sua conta neste aparelho?")) sb.auth.signOut(); };
  $("#cInstalar").onclick = async () => {
    if (pedidoInstalacao) { pedidoInstalacao.prompt(); await pedidoInstalacao.userChoice; pedidoInstalacao = null; $("#cInstalar").hidden = true; return; }
    modal(`<h3 style="margin:0 0 8px">Instalar no iPhone / iPad</h3>
      <ol style="margin:0 0 14px;padding-left:20px;line-height:1.8">
        <li>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
        <li>Escolha <b>Adicionar à Tela de Início</b>.</li>
        <li>Toque em <b>Adicionar</b>. O RH+ Match passa a abrir em tela cheia, como um app.</li></ol>
      <div class="rodape"><span></span><button class="btn" data-fechar>Entendi</button></div>`);
  };
  $("#cSalvar").onclick = async () => {
    const dados = {
      owner: USUARIO.id, empresa_nome: $("#cEmpresa").value.trim(), paginas_por_fonte: +($("#cPag .on")?.dataset.v || 2),
      score_minimo_padrao: +($("#cScore .on")?.dataset.v || 40), fontes_ativas: $$("[data-fonte]:checked").map((x) => x.dataset.fonte),
      atualizado_em: new Date().toISOString(),
    };
    $$("[data-chave]").forEach((i) => { dados[i.dataset.chave] = i.value.trim(); });
    try {
      CFG = { ...CFG_PADRAO, ...(await q(sb.from("configuracoes").upsert(dados).select("*").single())) };
      estado.filtros.score = CFG.score_minimo_padrao; toast("Configurações salvas.");
    } catch (e) { falha(e); }
  };
  $("#cTestar").onclick = async () => {
    const btn = $("#cTestar"); btn.disabled = true; btn.textContent = "Testando…";
    await Promise.all(FONTES.map(async (f) => {
      const el = $("#st-" + f.id); el.textContent = "…"; el.style.color = ""; el.title = "";
      if (!fonteDisponivel(f)) { el.textContent = "sem chave"; return; }
      try {
        const r = await sb.functions.invoke("buscar-vagas", { body: { fonte: f.id, termo: "analista", paginas: 1, skills: ["Python"] } });
        if (r.error) throw r.error;
        if (r.data?.erro && !r.data.vagas?.length) throw new Error(r.data.erro);
        el.textContent = `✓ online · ${r.data.vagas.length}`; el.style.color = "var(--verde)";
      } catch (e) { el.textContent = "✕ indisponível"; el.title = e.message || ""; el.style.color = "var(--lar)"; }
    }));
    btn.disabled = false; btn.textContent = "Testar conexões";
  };
}
