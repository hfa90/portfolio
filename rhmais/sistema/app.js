/* RH+ Match Web — frontend estático (GitHub Pages) + Supabase (Auth, Postgres com RLS, Edge Functions).
   Papéis: master (dono da plataforma) · admin (empresas, RH, headhunters) · candidato. */
import {
  FONTES, MODALIDADES, REGIMES, REGIOES, SENIORIDADES, STATUS_PIPELINE, UFS, analisarCurriculo, classificar, consolidar,
  extrairSkills, extrairValorSalario, linksBusca, localVaga, normalizar, regiaoDe, termosDoCandidato,
} from "../supabase/functions/_shared/nucleo.js";
import {
  $, $$, CFG_PADRAO, RETORNO, ROTULO_PARCIAL, abrirSheet, alternarTema, atualizarCorBarra, barras, baixarBlob,
  cabecalhoPlanilha, carimbo, cartaoConta, corParcial, ctx, dataCurta, dataHora, ehAdmin, ehMaster, erroFuncao, esc,
  estado, falha, fecharSheet, fonteDisponivel, lerCurriculo, ligarCartaoConta, main, modal, novaPlanilha, q,
  salvarPlanilha, sb, temSheet, toast, topo, traduzErro, voltarSheet,
} from "./js/base.js";
import { abrirAdaptador, importarCurriculoBase, pgCurriculos } from "./js/curriculos.js";
import { carregarStatusChaves, pgConfig, pgUsuarios } from "./js/admin.js";
import { abasCandidato, buscarVagasPlataforma, candidatar, pgCandidaturas, pgVagaPublica, pgVagas } from "./js/vagas.js";

const scoreTag = (s) => `<span class="score f-${classificar(s || 0).toLowerCase()}">${Math.round(s || 0)}</span>`;

/* ============================================================= navegação por papel */
const ICONES = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  candidatos: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.9"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4.2-6.5 8-6.5s7 2.3 8 6.5"/>',
  busca: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  pipeline: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  curriculos: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  usuarios: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  mais: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  vagas: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  candidaturas: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
};
const MENUS = {
  candidato: [["painel", "Início"], ["busca", "Buscar vagas"], ["candidaturas", "Candidaturas"], ["curriculos", "Currículos"], ["perfil", "Meu perfil"]],
  admin: [["painel", "Painel"], ["vagas", "Minhas vagas"], ["candidatos", "Candidatos"], ["busca", "Buscar vagas"], ["pipeline", "Pipeline"], ["curriculos", "Currículos"], ["config", "Ajustes"]],
  master: [["painel", "Painel"], ["vagas", "Minhas vagas"], ["candidatos", "Candidatos"], ["busca", "Buscar vagas"], ["pipeline", "Pipeline"], ["curriculos", "Currículos"], ["usuarios", "Usuários"], ["config", "Ajustes"]],
};
// páginas acessíveis sem estar no menu
const EXTRAS = { candidato: ["pipeline", "vaga"], admin: ["vaga"], master: ["vaga"] };
const svg = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[id]}</svg>`;
function montarMenu() {
  const itens = MENUS[ctx.papel] || MENUS.candidato;
  const extras = itens.length > 5;   // no celular cabem 5 abas: as demais vão para "Mais"
  $("nav").innerHTML = itens.map(([id, rot], i) => `<a href="#/${id}" data-page="${id}" class="${extras && i >= 4 ? "extra" : ""}">${svg(id)}<span>${rot}</span></a>`).join("")
    + (extras ? `<a href="#" class="mais" id="navMais">${svg("mais")}<span>Mais</span></a>` : "");
  $("#navMais")?.addEventListener("click", (e) => {
    e.preventDefault();
    modal(`<h3 style="margin:0 0 10px">Mais opções</h3><div class="links">${itens.slice(4).map(([id, rot]) =>
      `<a href="#/${id}" data-fechar>${rot}</a>`).join("")}</div>`);
  });
}
const paginaPermitida = (p) => (MENUS[ctx.papel] || MENUS.candidato).some(([id]) => id === p) || (EXTRAS[ctx.papel] || []).includes(p);

/* ============================================================= autenticação */
$("#btnTema").onclick = alternarTema;
$("#btnSair").onclick = async () => { await sb.auth.signOut(); };
const urlApp = () => location.origin + location.pathname;
const TIPOS_ORG = ["Empresa", "RH interno", "Headhunter", "Consultoria de RH", "Agência de empregos"];

function telaLogin(modo = "entrar", msg = "") {
  document.body.classList.add("sem-sessao"); atualizarCorBarra();
  const titulos = { entrar: "Entrar", criar: "Criar conta", esqueci: "Recuperar senha", nova: "Definir nova senha" };
  const tipoInicial = new URLSearchParams(location.hash.split("?")[1] || "").get("tipo") === "empresa" ? "empresa" : "candidato";
  main.innerHTML = `<div class="login"><div class="card">
    <div class="brand"><span class="logo" style="color:#fff">R+</span><div><b>RH+ Match</b><small>Inteligência em recolocação</small></div></div>
    <h2 style="margin:0 0 14px;font-size:18px">${titulos[modo]}</h2>
    <form id="fLogin">
      ${modo === "criar" ? `<div class="seg tipo-conta" id="tipoConta"><button type="button" data-v="candidato" class="${tipoInicial === "candidato" ? "on" : ""}">Sou candidato</button><button type="button" data-v="empresa" class="${tipoInicial === "empresa" ? "on" : ""}">Sou empresa / RH</button></div>
        <label class="campo">Seu nome<input type="text" name="nome" required autocomplete="name"></label>
        <div id="camposEmpresa" ${tipoInicial === "empresa" ? "" : "hidden"}>
          <label class="campo">Empresa / consultoria<input type="text" name="organizacao" autocomplete="organization"></label>
          <label class="campo" style="margin-top:12px">Tipo<select name="tipo_org">${TIPOS_ORG.map((t) => `<option>${t}</option>`).join("")}</select></label>
          <label class="campo" style="margin-top:12px">Telefone / WhatsApp<input type="text" name="telefone" autocomplete="tel"></label>
          <p class="muted" style="font-size:12px;margin:8px 0 0">Contas de empresa passam por aprovação. Enquanto isso, você já pode entrar e usar a conta.</p>
        </div>` : ""}
      ${modo !== "nova" ? `<label class="campo">E-mail<input type="email" name="email" required autocomplete="email"></label>` : ""}
      ${modo !== "esqueci" ? `<label class="campo">${modo === "nova" ? "Nova senha" : "Senha"}<input type="password" name="senha" required minlength="6" autocomplete="${modo === "entrar" ? "current-password" : "new-password"}"></label>` : ""}
      <button class="btn" type="submit">${modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : modo === "esqueci" ? "Enviar link" : "Salvar senha"}</button>
      <div class="msg" id="msgLogin">${esc(msg)}</div>
      <div class="alt">${modo === "entrar" ? `<a data-modo="criar">Criar conta</a><a data-modo="esqueci">Esqueci a senha</a>` : modo === "nova" ? "" : `<a data-modo="entrar">← Voltar ao login</a>`}</div>
      ${modo === "entrar" ? `<div class="alt"><a id="reenviar" hidden>Reenviar e-mail de confirmação</a></div>` : ""}
    </form></div>
    <p style="text-align:center;margin-top:16px;font-size:14px"><a href="../" style="color:var(--texto2);text-decoration:none">← Conheça o RH+ Match</a></p></div>`;
  $$("[data-modo]").forEach((a) => (a.onclick = () => telaLogin(a.dataset.modo)));
  let tipo = tipoInicial;
  $("#tipoConta")?.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    tipo = b.dataset.v; $$("#tipoConta button").forEach((x) => x.classList.toggle("on", x === b));
    $("#camposEmpresa").hidden = tipo !== "empresa";
  });
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
    const f = e.target, btn = $("button[type=submit]", f), msg = $("#msgLogin");
    const email = f.email?.value.trim(), senha = f.senha?.value;
    btn.disabled = true; msg.textContent = "Aguarde…";
    try {
      if (modo === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) { msg.textContent = traduzErro(error); if ($("#reenviar")) $("#reenviar").hidden = !/Confirme seu e-mail/i.test(msg.textContent); return; }
      } else if (modo === "criar") {
        if (tipo === "empresa" && !f.organizacao.value.trim()) { msg.textContent = "Informe o nome da empresa ou consultoria."; return; }
        const data = { tipo, nome: f.nome.value.trim() };
        if (tipo === "empresa") Object.assign(data, { organizacao: f.organizacao.value.trim(), tipo_org: f.tipo_org.value, telefone: f.telefone.value.trim() });
        const d = await q(sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: urlApp(), data } }));
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

let appIniciado = false;
async function iniciarApp() {
  document.body.classList.remove("sem-sessao");
  atualizarCorBarra();
  $("#usuario").textContent = ctx.usuario?.email || "";
  try {
    const [perfil, cfg] = await Promise.all([
      q(sb.from("perfis").select("*").eq("id", ctx.usuario.id).maybeSingle()),
      q(sb.from("configuracoes").select("empresa_nome, paginas_por_fonte, score_minimo_padrao, fontes_ativas").maybeSingle()),
      carregarStatusChaves(),
    ]);
    ctx.perfil = perfil || { id: ctx.usuario.id, papel: "candidato", modelo_curriculo: "classico" };
    ctx.papel = ctx.perfil.papel || "candidato";
    ctx.cfg = { ...CFG_PADRAO, ...(cfg || {}) };
  } catch (e) { ctx.perfil = { papel: "candidato" }; ctx.papel = "candidato"; ctx.cfg = { ...CFG_PADRAO }; falha(e); }
  estado.filtros.score = ctx.cfg.score_minimo_padrao;
  montarMenu();
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
    <p class="muted" style="margin:0 0 18px">Sua conta <b>${esc(ctx.usuario?.email || "")}</b> está ativa e pronta para uso.</p>
    <button class="btn" id="btnAcessar" style="width:100%">Acessar minha conta</button>
  </div></div>`;
  $("#btnAcessar").onclick = () => { location.hash = "#/painel"; iniciarApp(); };
}

let retornoTratado = false;
sb.auth.onAuthStateChange((evento, sessao) => {
  if (evento === "PASSWORD_RECOVERY") { ctx.usuario = sessao?.user || null; limparUrl(); telaLogin("nova"); return; }
  const novo = sessao?.user || null;
  const mudou = (novo?.id || null) !== (ctx.usuario?.id || null);
  ctx.usuario = novo;
  if (!retornoTratado && (RETORNO.tipo || RETORNO.erro)) {
    retornoTratado = true;
    limparUrl();
    if (RETORNO.erro && !ctx.usuario) {
      const expirado = /expir|invalid/i.test(RETORNO.erro + RETORNO.codigo);
      return telaLogin("entrar", expirado ? "Este link de confirmação expirou ou já foi usado. Se sua conta já foi confirmada, basta entrar. Se não, peça um novo link abaixo."
        : "Não foi possível validar o link: " + RETORNO.erro);
    }
    if (["signup", "email", "email_change", "invite"].includes(RETORNO.tipo)) {
      if (ctx.usuario) return setTimeout(telaConfirmada, 0);
      return telaLogin("entrar", "E-mail confirmado! Agora é só entrar com seu e-mail e senha.");
    }
  }
  if (!ctx.usuario) {
    appIniciado = false; Object.assign(estado, { busca: null, candSel: null, candidatoBusca: null, pipeSel: null, cvFiltro: "" });
    if (vagaDaUrl()) return abrirVagaSemLogin();
    telaLogin(location.hash.startsWith("#/criar") ? "criar" : "entrar");
  } else if (mudou || !appIniciado) setTimeout(iniciarApp, 0);
});

/* página pública da vaga: abre mesmo sem login (para divulgação) */
const vagaDaUrl = () => (location.hash.match(/^#\/vaga\/(\d+)/) || [])[1];
function abrirVagaSemLogin() {
  document.body.classList.add("sem-sessao"); atualizarCorBarra();
  pgVagaPublica(+vagaDaUrl(), { logado: false, irLogin: () => telaLogin("entrar", "Entre ou crie sua conta para se candidatar a esta vaga.") }).catch(falha);
}
window.addEventListener("hashchange", () => { if (!ctx.usuario && vagaDaUrl()) abrirVagaSemLogin(); });

/* ============================================================= roteador */
const PAGINAS = {
  painel: () => (ehAdmin() ? pgPainel() : pgInicio()), candidatos: pgCandidatos, perfil: pgPerfil, busca: pgBusca, pipeline: pgPipeline,
  curriculos: () => pgCurriculos({ meuPerfil }), config: pgConfig, usuarios: pgUsuarios,
  vagas: pgVagas, candidaturas: pgCandidaturas,
  vaga: () => pgVagaPublica(+vagaDaUrl(), { logado: true, meuPerfil }),
};
async function rotear() {
  fecharSheet(); atualizarCorBarra();
  if (!ctx.usuario || !appIniciado) return;
  let destino = null; try { destino = sessionStorage.getItem("rh_destino"); sessionStorage.removeItem("rh_destino"); } catch { /* ok */ }
  if (destino && destino !== location.hash) { location.hash = destino; return; }   // volta para a vaga que a pessoa abriu antes de entrar
  const [, nome = "painel"] = location.hash.split("?")[0].split("/");
  const pg = PAGINAS[nome] && paginaPermitida(nome) ? nome : "painel";
  if (pg !== nome && nome && nome !== "painel" && PAGINAS[nome]) toast("Esta área é restrita a administradores.");
  const realce = !ehAdmin() && pg === "pipeline" ? "candidaturas" : pg;
  $$("nav a").forEach((a) => a.classList.toggle("ativo", a.dataset.page === realce));
  try { await PAGINAS[pg](); } catch (e) { main.innerHTML = `<div class="card vazio">⚠ ${esc(traduzErro(e))}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", rotear);

/* ============================================================= PAINEL (admin) */
async function pgPainel() {
  const [d, buscas, pend, resumoVagas] = await Promise.all([
    q(sb.rpc("painel_resumo")),
    q(sb.from("buscas").select("termos, compativeis, criada_em, candidatos(nome)").order("criada_em", { ascending: false }).limit(6)),
    ehMaster() ? q(sb.from("solicitacoes_admin").select("id", { count: "exact", head: false }).eq("status", "pendente")) : Promise.resolve([]),
    q(sb.rpc("resumo_minhas_vagas")),
  ]);
  const novasCand = resumoVagas.reduce((a, r) => a + Number(r.novas || 0), 0);
  const naoLidas = resumoVagas.reduce((a, r) => a + Number(r.nao_lidas || 0), 0);
  const st = d.status || {};
  const ativos = Object.entries(st).filter(([s]) => s !== "Descartada" && s !== "Contratado").reduce((a, [, n]) => a + n, 0);
  const kpi = (rot, val, sub, ico, cor) => `<div class="card kpi"><i style="background:color-mix(in srgb, ${cor} 14%, transparent);color:${cor}">${ico}</i>
    <small>${rot}</small><b>${val}</b><span>${sub}</span></div>`;
  main.innerHTML = topo(`Olá, ${esc(ctx.cfg.empresa_nome || ctx.perfil?.organizacao || ctx.perfil?.nome || "equipe")} 👋`, "Visão geral da operação de recrutamento") + `
    ${pend.length ? `<a class="card aviso" href="#/usuarios">🔔 <b>${pend.length} pedido(s) de acesso de administrador</b> aguardando sua aprovação →</a>` : ""}
    ${novasCand || naoLidas ? `<a class="card aviso" href="#/vagas">📨 ${novasCand ? `<b>${novasCand} candidatura(s) nova(s)</b>` : ""}${novasCand && naoLidas ? " e " : ""}${naoLidas ? `<b>${naoLidas} mensagem(ns) não lida(s)</b>` : ""} nas suas vagas →</a>` : ""}
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

/* ============================================================= INÍCIO (candidato) */
async function pgInicio() {
  const [eu, cvs, pipe, buscas, cands] = await Promise.all([
    meuPerfil(),
    q(sb.from("curriculos").select("id, tipo, padrao, vaga_titulo, vaga_empresa, atualizado_em").order("atualizado_em", { ascending: false }).limit(5)),
    q(sb.from("pipeline").select("status")),
    q(sb.from("buscas").select("termos, compativeis, criada_em").order("criada_em", { ascending: false }).limit(4)),
    q(sb.from("candidaturas").select("status").eq("candidato", ctx.usuario.id)),
  ]);
  const campos = eu ? ["nome", "cargo_desejado", "skills", "cidade", "uf", "senioridade"].filter((k) => eu[k]).length : 0;
  const completo = Math.round((campos / 6) * 100);
  const temBase = cvs.some((c) => c.tipo === "base" || c.padrao);
  const passos = [
    [completo >= 100, "Complete seu perfil", "Cargo, competências e cidade deixam o ranking das vagas muito mais preciso.", "#/perfil", "Completar perfil"],
    [temBase, "Importe seu currículo", "Ele vira o ponto de partida das adaptações por vaga, e você não precisa anexar toda vez.", "#/curriculos", "Importar currículo"],
    [buscas.length > 0, "Busque vagas", "O sistema varre vários portais de uma vez e mostra as mais compatíveis com você.", "#/busca", "Buscar vagas"],
  ];
  main.innerHTML = topo(`Olá, ${esc((eu?.nome || ctx.perfil?.nome || "").split(" ")[0] || "bem-vindo")} 👋`, "Seu painel para encontrar a próxima oportunidade") + `
    <div class="kpis">
      <div class="card kpi"><small>PERFIL</small><b>${completo}%</b><span>completo</span></div>
      <div class="card kpi"><small>CURRÍCULOS</small><b>${cvs.length}</b><span>salvos</span></div>
      <div class="card kpi"><small>CANDIDATURAS</small><b>${cands.length}</b><span>pela plataforma</span></div>
      <div class="card kpi"><small>ENTREVISTAS</small><b>${cands.filter((c) => c.status === "entrevista").length + pipe.filter((p) => p.status === "Entrevista").length}</b><span>em andamento</span></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Próximos passos</h3>${passos.map(([ok, tit, txt, href, rot]) => `<div class="passo ${ok ? "ok" : ""}">
        <span class="bolinha">${ok ? "✓" : ""}</span><div style="flex:1"><b>${tit}</b><div class="muted" style="font-size:13px">${txt}</div></div>
        ${ok ? "" : `<a class="btn sec peq" href="${href}" style="text-decoration:none">${rot}</a>`}</div>`).join("")}</div>
      <div class="card"><div class="topo" style="margin:0 0 6px;align-items:center"><h3 style="margin:0">Currículos recentes</h3><a class="btn neutro peq" href="#/curriculos" style="text-decoration:none">Ver todos</a></div>
        ${cvs.length ? cvs.map((c) => `<div class="linha-busca"><div class="trunc"><b>${esc(c.tipo === "base" ? "Currículo base" : c.vaga_titulo)}</b>
          <span class="muted"> ${esc(c.vaga_empresa || "")}</span></div><div style="white-space:nowrap">${c.padrao ? '<span class="chip ok">Padrão</span>' : ""}<span class="muted">${dataHora(c.atualizado_em)}</span></div></div>`).join("")
          : `<div class="vazio">Nenhum currículo salvo. Importe o seu em “Currículos”.</div>`}</div>
    </div>`;
}

/* ============================================================= CANDIDATOS / MEU PERFIL */
const COLS_CAND = "id, nome, email, telefone, cargo_desejado, cargos_alternativos, skills, senioridade, cidade, uf, modalidades, pretensao_salarial, aceita_mudanca, resumo, proprio";
const listarCandidatos = (filtro = "") => {
  let r = sb.from("candidatos").select(COLS_CAND).eq("proprio", false).order("nome");
  const f = filtro.replace(/[%,()*]/g, " ").trim();
  if (f) r = r.or(["nome", "cargo_desejado", "skills", "cidade"].map((c) => `${c}.ilike.%${f}%`).join(","));
  return q(r);
};
const obterCandidato = async (id) => q(sb.from("candidatos").select(COLS_CAND).eq("id", id).maybeSingle());
/** Para o candidato: o registro dele mesmo em "candidatos" (proprio = true). */
async function meuPerfil() { return q(sb.from("candidatos").select(COLS_CAND).eq("proprio", true).maybeSingle()); }
/** Candidatos selecionáveis na busca/pipeline: os do admin, ou o próprio perfil do candidato. */
async function candidatosDisponiveis() {
  if (ehAdmin()) return listarCandidatos();
  const eu = await meuPerfil(); return eu ? [eu] : [];
}

async function pgCandidatos() {
  main.innerHTML = topo("Candidatos", "Seu banco de talentos: perfis usados para encontrar as vagas certas", `
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
      formCandidato({ modalidades: MODALIDADES.join(","), ...dados }, carregar, { importado: true });
      abrirSheet($("#formCand"), "Novo candidato");
      toast("Currículo lido. Revise os campos e salve.");
    } catch (err) { falha(err); }
  };
  await carregar();
  formCandidato(estado.candSel ? (await obterCandidato(estado.candSel)) || {} : {}, carregar);
}

async function pgPerfil() {
  const eu = await meuPerfil();
  main.innerHTML = topo("Meu perfil", "Estas informações definem quais vagas combinam com você") + `
    <div class="card" id="formCand" style="margin-bottom:14px"></div>
    <div class="card" style="margin-bottom:14px"><h3>Visibilidade para recrutadores</h3>
      <label class="checks" style="font-size:14px"><span class="switch"><input type="checkbox" id="pVisivel" ${ctx.perfil?.visivel_recrutadores ? "checked" : ""}><span></span></span>
        Permitir que empresas e recrutadores da plataforma encontrem meu perfil e meu currículo padrão</label>
      <p class="muted" style="font-size:12px;margin:8px 0 0">Você pode desligar a qualquer momento. Seus dados nunca são exibidos publicamente na internet.</p></div>
    <div class="card" style="margin-bottom:14px" id="cardEmpresa"></div>
    ${cartaoConta()}`;
  formCandidato(eu || { nome: ctx.perfil?.nome || "", email: ctx.usuario.email, modalidades: MODALIDADES.join(",") }, async () => {}, { proprio: true });
  ligarCartaoConta();
  $("#pVisivel").onchange = async (e) => {
    try { await q(sb.from("perfis").update({ visivel_recrutadores: e.target.checked, atualizado_em: new Date().toISOString() }).eq("id", ctx.usuario.id));
      ctx.perfil.visivel_recrutadores = e.target.checked; toast(e.target.checked ? "Seu perfil está visível para recrutadores." : "Seu perfil está oculto para recrutadores."); }
    catch (err) { e.target.checked = !e.target.checked; falha(err); }
  };
  const sol = await q(sb.from("solicitacoes_admin").select("status, organizacao, criado_em").order("criado_em", { ascending: false }).limit(1));
  const ult = sol[0];
  $("#cardEmpresa").innerHTML = `<h3>Recruta ou contrata?</h3>` + (ult?.status === "pendente"
    ? `<p style="margin:0">⏳ Seu pedido de acesso como empresa/RH (<b>${esc(ult.organizacao)}</b>) está em análise.</p>`
    : `<p class="muted" style="margin:-4px 0 10px;font-size:13px">Empresas, RHs e headhunters podem cadastrar candidatos, acompanhar processos e, em breve, publicar vagas na plataforma.${ult?.status === "recusada" ? " Seu último pedido foi recusado; você pode enviar outro." : ""}</p>
       <button class="btn sec" id="pPedir">Pedir acesso de empresa / RH</button>`);
  $("#pPedir")?.addEventListener("click", () => {
    modal(`<h3 style="margin:0 0 10px">Acesso de empresa / RH</h3><form class="form" id="fSol" style="grid-template-columns:1fr">
      <label class="campo">Empresa / consultoria *<input type="text" name="organizacao" required value="${esc(ctx.perfil?.organizacao || "")}"></label>
      <label class="campo">Tipo<select name="tipo_org">${TIPOS_ORG.map((t) => `<option>${t}</option>`).join("")}</select></label>
      <label class="campo">Telefone / WhatsApp<input type="text" name="telefone" value="${esc(ctx.perfil?.telefone || "")}"></label>
      <label class="campo">Conte rapidamente como vai usar a plataforma<textarea name="mensagem" style="min-height:80px"></textarea></label></form>
      <div class="rodape"><button class="btn neutro" data-fechar>Cancelar</button><button class="btn" id="solEnviar">Enviar pedido</button></div>`);
    $("#solEnviar").onclick = async () => {
      const f = $("#fSol");
      if (!f.organizacao.value.trim()) return toast("Informe o nome da empresa.");
      try {
        await q(sb.from("solicitacoes_admin").insert({ usuario: ctx.usuario.id, organizacao: f.organizacao.value.trim(), tipo_org: f.tipo_org.value,
          telefone: f.telefone.value.trim(), mensagem: f.mensagem.value.trim() }));
        $("#modal").close(); toast("Pedido enviado. Você será avisado quando for aprovado."); pgPerfil();
      } catch (err) { falha(err); }
    };
  });
}

function formCandidato(c, recarregar, { importado = false, proprio = false } = {}) {
  const mods = (c.modalidades ?? MODALIDADES.join(",")).split(",").map((s) => s.trim());
  const campo = (k, rot, dica = "", cls = "", tipo = "text") => `<label class="campo ${cls}">${rot}
    <input type="${tipo}" name="${k}" value="${esc(c[k] ?? "")}" placeholder="${esc(dica)}"></label>`;
  const sel = (k, rot, ops, vazio) => `<label class="campo">${rot}<select name="${k}"><option value="">${vazio}</option>
    ${ops.map((o) => `<option ${c[k] === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
  const novo = !c.id;
  const titulo = proprio ? "Meus dados profissionais" : novo ? (importado ? "Novo candidato (do currículo)" : "Novo candidato") : esc(c.nome);
  $("#formCand").innerHTML = `
    <div class="topo" style="align-items:center;margin-bottom:12px"><h3 style="margin:0;font-size:17px">${titulo}</h3>
      <div class="acoes">${novo ? "" : `<button class="btn neutro peq" id="btnCvBase">📄 Currículo base</button><button class="btn sucesso" id="btnBuscarPerfil">Buscar vagas para este perfil →</button>`}</div></div>
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
      <label class="campo full">${proprio ? "Resumo profissional" : "Resumo profissional / observações do recrutador"}<textarea name="resumo">${esc(c.resumo || "")}</textarea></label>
    </form>
    <div class="rodape" style="margin-top:16px">
      ${novo || proprio ? "<span></span>" : `<button class="btn perigo" id="btnExcluir">Excluir</button>`}
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
      const salvo = await q(novo ? sb.from("candidatos").insert({ ...dados, proprio }).select(COLS_CAND).single()
        : sb.from("candidatos").update(dados).eq("id", c.id).select(COLS_CAND).single());
      if (proprio) {   // mantém o perfil da conta em sincronia
        await sb.from("perfis").update({ nome: dados.nome, telefone: dados.telefone, cidade: dados.cidade, uf: dados.uf, atualizado_em: new Date().toISOString() }).eq("id", ctx.usuario.id);
        Object.assign(ctx.perfil, { nome: dados.nome, telefone: dados.telefone, cidade: dados.cidade, uf: dados.uf });
      }
      estado.candSel = salvo.id; toast(proprio ? "Perfil salvo." : "Candidato salvo.");
      await recarregar(); formCandidato(salvo, recarregar, { proprio });
    } catch (e) { falha(e); }
  };
  if (!novo) {
    $("#btnExcluir")?.addEventListener("click", async () => {
      if (!confirm(`Excluir ${c.nome}? O pipeline desse candidato também será removido. Não é possível desfazer.`)) return;
      try { await q(sb.from("candidatos").delete().eq("id", c.id)); estado.candSel = null; toast("Candidato excluído."); await recarregar(); formCandidato({}, recarregar); if (temSheet()) voltarSheet(); }
      catch (e) { falha(e); }
    });
    $("#btnBuscarPerfil").onclick = () => irBusca(c.id);
    $("#btnCvBase").onclick = () => importarCurriculoBase(c);
  }
}

function irBusca(cid) { estado.candidatoBusca = cid; location.hash = "#/busca"; }

/* ============================================================= BUSCA */
async function pgBusca() {
  const cands = await candidatosDisponiveis();
  if (!ehAdmin() && !cands.length) {
    main.innerHTML = topo("Buscar vagas", "Varre os canais de vagas do Brasil e ranqueia pela aderência ao seu perfil") + `
      <div class="card vazio"><div class="ico">🧭</div><b>Primeiro, complete seu perfil</b><br>Com seu cargo, competências e cidade o sistema encontra as vagas certas para você.
        <div style="margin-top:14px"><a class="btn" href="#/perfil" style="text-decoration:none">Completar meu perfil</a></div></div>`;
    return;
  }
  if (!estado.candidatoBusca || !cands.some((c) => c.id === estado.candidatoBusca)) estado.candidatoBusca = cands[0]?.id ?? null;
  const buscando = estado.busca?.estado === "buscando";
  main.innerHTML = topo("Buscar vagas", ehAdmin() ? "Varre os canais de vagas do Brasil e ranqueia pela aderência ao perfil" : "Varre os canais de vagas do Brasil e ranqueia pela aderência ao seu perfil") + `
    <div class="card" style="margin-bottom:14px">
      <div class="barra-busca ${ehAdmin() ? "" : "sem-cand"}">
        ${ehAdmin() ? `<label class="campo">Candidato<select id="selCand">${cands.length ? cands.map((c) => `<option value="${c.id}" ${c.id === estado.candidatoBusca ? "selected" : ""}>${esc(c.nome)} · ${esc(c.cargo_desejado)}</option>`).join("") : `<option value="">Cadastre um candidato primeiro</option>`}</select></label>`
          : `<input type="hidden" id="selCand" value="${cands[0].id}">`}
        <label class="campo">Cargos a pesquisar<input type="text" id="termos" placeholder="Cargos separados por vírgula"></label>
        <label class="campo campo-local">Pesquisar em<span class="local-busca"><input type="text" id="locCidade" placeholder="Cidade"><select id="locUf"><option value="">UF</option>${UFS.map((u) => `<option>${u}</option>`).join("")}</select></span></label>
        <button class="btn" id="btnBuscar" style="height:38px">${buscando ? "■ Cancelar" : "🔎 Buscar vagas"}</button>
      </div>
      <div class="canais"><b class="muted" style="font-size:12px">Canais</b>
        <label title="Vagas publicadas diretamente por empresas na plataforma; aceitam candidatura pelo sistema"><input type="checkbox" value="plataforma" checked><b class="selo-rh">RH+ Match</b></label>
        ${FONTES.map((f) => { const d = fonteDisponivel(f); return `<label class="${d ? "" : "off"}" title="${esc(f.descricao)}"><input type="checkbox" value="${f.id}" ${d && ctx.cfg.fontes_ativas.includes(f.id) ? "checked" : ""} ${d ? "" : "disabled"}>${esc(f.nome)}${d ? "" : " (indisponível)"}</label>`; }).join("")}
        <button class="btn neutro peq" id="btnPortais" style="margin-left:auto">Mais portais ↗</button></div>
      <div id="statusFontes" class="canais" style="margin-top:8px"></div>
      <div class="progresso" id="prog" hidden><div style="width:3%"></div></div>
    </div>
    <div class="split">
      <div class="card">
        <div class="filtros">
          <div class="seg" id="fMod">${["Todas", ...MODALIDADES].map((m) => `<button data-v="${m}" class="${estado.filtros.mod === m ? "on" : ""}">${m}</button>`).join("")}</div>
          <button class="btn neutro peq" id="fMais">⚙ Filtros<span id="fQtd"></span></button>
          <select id="fOrdem" title="Ordenar"><option value="score">Mais compatíveis</option><option value="data">Mais recentes</option><option value="salario">Maior salário</option></select>
          <input type="search" id="fTexto" placeholder="Filtrar por palavra, empresa…" value="${esc(estado.filtros.texto)}">
        </div>
        <div class="painel-filtros" id="fPainel" ${estado.filtrosAbertos ? "" : "hidden"}>
          <label class="campo">Cidade<input type="text" id="fCidade" list="fCidades" placeholder="Qualquer" value="${esc(estado.filtros.cidade)}"><datalist id="fCidades"></datalist></label>
          <label class="campo">Estado<select id="fUf"><option value="">Todos</option>${UFS.map((u) => `<option ${estado.filtros.uf === u ? "selected" : ""}>${u}</option>`).join("")}</select></label>
          <label class="campo">Região<select id="fRegiao"><option value="">Todas</option>${Object.keys(REGIOES).map((r) => `<option ${estado.filtros.regiao === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
          <label class="campo">Regime<select id="fRegime"><option value="">Todos</option>${REGIMES.map((r) => `<option ${estado.filtros.regime === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
          <label class="campo">Nível<select id="fSen"><option value="">Todos</option>${SENIORIDADES.map((s) => `<option ${estado.filtros.senioridade === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          <label class="campo">Salário a partir de (R$)<input type="number" id="fSal" min="0" step="500" placeholder="Qualquer" value="${esc(estado.filtros.salMin)}"></label>
          <label class="campo">Publicada<select id="fDias"><option value="">Qualquer data</option>${[["1", "Últimas 24 h"], ["7", "Últimos 7 dias"], ["15", "Últimos 15 dias"], ["30", "Últimos 30 dias"]].map(([v, r]) => `<option value="${v}" ${estado.filtros.dias === v ? "selected" : ""}>${r}</option>`).join("")}</select></label>
          <label class="campo">Canal<select id="fCanal"><option value="">Todos</option>${["RH+ Match", ...FONTES.map((f) => f.nome)].map((n) => `<option ${estado.filtros.canal === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
          <label class="campo">Score mínimo: <b id="lblScore">${estado.filtros.score}</b><input type="range" id="fScore" min="0" max="90" step="5" value="${estado.filtros.score}"></label>
          <label class="checks" style="align-self:end"><input type="checkbox" id="fPlat" ${estado.filtros.soPlataforma ? "checked" : ""}>Só vagas com candidatura pelo RH+ Match</label>
          <div class="acoes" style="grid-column:1/-1;justify-content:flex-end"><button class="btn neutro peq" id="fLimpar">Limpar filtros</button></div>
        </div>
        <div class="chips-filtro" id="fChips"></div>
        <div class="tabela-wrap" style="max-height:calc(100vh - 330px);min-height:260px"><table>
          <thead><tr><th class="c">SCORE</th><th>CARGO</th><th>EMPRESA</th><th>LOCAL</th><th>MODALIDADE</th><th>CANAL</th><th class="c">DATA</th></tr></thead>
          <tbody id="tbVagas"></tbody></table></div>
        <div class="rodape"><span class="muted" id="lblTotal">${ehAdmin() ? "Selecione um candidato e clique em Buscar." : "Confira os cargos e clique em Buscar."}</span>
          <div class="acoes"><button class="btn neutro peq" id="btnExcel">Exportar Excel</button>${ehAdmin() ? `<button class="btn sec peq" id="btnRelatorio">Relatório p/ cliente</button>` : ""}</div></div>
      </div>
      <div class="card detalhe" id="detVaga"></div>
    </div>`;

  const preencherTermos = () => {
    const c = cands.find((x) => x.id === +$("#selCand").value);
    if (!c) { $("#termos").value = ""; return; }
    const mesma = estado.busca?.candidato.id === c.id;
    $("#termos").value = mesma ? estado.busca.termos.join(", ") : termosDoCandidato(c).join(", ");
    $("#locCidade").value = mesma ? estado.busca.local.cidade : c.cidade || "";
    $("#locUf").value = mesma ? estado.busca.local.uf : c.uf || "";
  };
  $("#selCand").onchange = () => { estado.candidatoBusca = +$("#selCand").value || null; preencherTermos(); };
  preencherTermos();
  $("#termos").onkeydown = (e) => { if (e.key === "Enter") $("#btnBuscar").click(); };
  $("#btnBuscar").onclick = () => iniciarBusca(cands);
  $("#btnPortais").onclick = () => abrirPortais(cands);
  $("#fMod").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; estado.filtros.mod = b.dataset.v; $$("#fMod button").forEach((x) => x.classList.toggle("on", x === b)); renderVagas(); };
  $("#fOrdem").value = estado.filtros.ordem;
  $("#fMais").onclick = () => { estado.filtrosAbertos = !estado.filtrosAbertos; $("#fPainel").hidden = !estado.filtrosAbertos; };
  const ligar = (id, chave, ev = "change", conv = (v) => v) => { $(id).addEventListener(ev, (e) => { estado.filtros[chave] = conv(e.target.type === "checkbox" ? e.target.checked : e.target.value); renderVagas(); }); };
  ligar("#fTexto", "texto", "input"); ligar("#fOrdem", "ordem"); ligar("#fCidade", "cidade", "input"); ligar("#fUf", "uf"); ligar("#fRegiao", "regiao");
  ligar("#fRegime", "regime"); ligar("#fSen", "senioridade"); ligar("#fSal", "salMin", "input"); ligar("#fDias", "dias"); ligar("#fCanal", "canal"); ligar("#fPlat", "soPlataforma");
  $("#fScore").oninput = (e) => { estado.filtros.score = +e.target.value; $("#lblScore").textContent = e.target.value; renderVagas(); };
  $("#fLimpar").onclick = () => { Object.assign(estado.filtros, FILTROS_VAZIOS, { score: ctx.cfg.score_minimo_padrao }); pgBusca(); };
  $("#fChips").onclick = (e) => {
    const b = e.target.closest("[data-limpa]"); if (!b) return;
    const k = b.dataset.limpa; estado.filtros[k] = k === "mod" ? "Todas" : k === "soPlataforma" ? false : k === "score" ? 0 : "";
    pgBusca();
  };
  $("#tbVagas").onclick = (e) => { const tr = e.target.closest("tr[data-idx]"); if (tr) { estado.vagaSel = +tr.dataset.idx; marcarSel(); detalharVaga(); abrirSheet($("#detVaga"), "Vaga"); } };
  $("#tbVagas").ondblclick = (e) => { const tr = e.target.closest("tr[data-idx]"); if (tr) window.open(estado.busca.vagas[+tr.dataset.idx].url, "_blank", "noopener"); };
  $("#btnExcel").onclick = () => exportarExcel(vagasVisiveis(), estado.busca?.candidato).catch(falha);
  $("#btnRelatorio")?.addEventListener("click", () => abrirRelatorio(vagasVisiveis(), estado.busca?.candidato));
  renderStatus(); renderVagas();
}

const FILTROS_VAZIOS = { mod: "Todas", texto: "", cidade: "", uf: "", regiao: "", regime: "", senioridade: "", salMin: "", dias: "", canal: "", soPlataforma: false, ordem: "score" };
const diasDesde = (iso) => (iso ? (Date.now() - new Date(iso + "T12:00").getTime()) / 864e5 : Infinity);
const vagasVisiveis = () => {
  const vs = estado.busca?.vagas || []; const f = estado.filtros;
  const t = normalizar(f.texto), cid = normalizar(f.cidade), sal = Number(f.salMin) || 0, dias = Number(f.dias) || 0;
  const lista = vs.filter((v) => v.score >= f.score
    && (f.mod === "Todas" || v.modalidade === f.mod)
    && (!t || normalizar(`${v.titulo} ${v.empresa} ${localVaga(v)} ${v.fonte} ${v.descricao}`).includes(t))
    && (!cid || normalizar(v.cidade).includes(cid))
    && (!f.uf || v.uf === f.uf)
    && (!f.regiao || regiaoDe(v.uf) === f.regiao)
    && (!f.regime || normalizar(v.contrato).includes(normalizar(f.regime)))
    && (!f.senioridade || v.senioridade === f.senioridade)
    && (!sal || extrairValorSalario(v.salario) >= sal)
    && (!dias || diasDesde(v.publicada_em) <= dias)
    && (!f.canal || v.fonte === f.canal)
    && (!f.soPlataforma || v.plataforma_id));
  if (f.ordem === "data") lista.sort((a, b) => String(b.publicada_em).localeCompare(String(a.publicada_em)) || b.score - a.score);
  else if (f.ordem === "salario") lista.sort((a, b) => extrairValorSalario(b.salario) - extrairValorSalario(a.salario) || b.score - a.score);
  return lista;
};

function renderChipsFiltro() {
  const f = estado.filtros;
  const ativos = [["mod", f.mod !== "Todas" && f.mod], ["cidade", f.cidade && "Cidade: " + f.cidade], ["uf", f.uf && "Estado: " + f.uf], ["regiao", f.regiao && "Região: " + f.regiao],
    ["regime", f.regime], ["senioridade", f.senioridade], ["salMin", f.salMin && `A partir de R$ ${Number(f.salMin).toLocaleString("pt-BR")}`],
    ["dias", f.dias && (f.dias === "1" ? "Últimas 24 h" : `Últimos ${f.dias} dias`)], ["canal", f.canal], ["soPlataforma", f.soPlataforma && "Candidatura pelo RH+ Match"],
    ["score", f.score > 0 && `Score ≥ ${f.score}`], ["texto", f.texto && `“${f.texto}”`]].filter(([, r]) => r);
  if ($("#fChips")) $("#fChips").innerHTML = ativos.map(([k, r]) => `<button class="chip prim" data-limpa="${k}">${esc(r)} ✕</button>`).join("");
  const n = ativos.filter(([k]) => !["mod", "texto"].includes(k)).length;
  if ($("#fQtd")) $("#fQtd").textContent = n ? ` · ${n}` : "";
  const cidades = [...new Set((estado.busca?.vagas || []).map((v) => v.cidade).filter(Boolean))].sort().slice(0, 200);
  if ($("#fCidades")) $("#fCidades").innerHTML = cidades.map((c) => `<option value="${esc(c)}">`).join("");
}

function renderVagas() {
  if (!$("#tbVagas")) return;
  renderChipsFiltro();
  const vs = vagasVisiveis(), b = estado.busca;
  $("#tbVagas").innerHTML = vs.map((v) => `<tr data-idx="${v.idx}">
    <td class="c">${scoreTag(v.score)}</td><td class="trunc" title="${esc(v.titulo)}"><b>${esc(v.titulo)}</b></td>
    <td class="trunc">${esc(v.empresa || "—")}</td><td class="trunc">${esc(localVaga(v))}</td><td>${esc(v.modalidade || "—")}</td>
    <td class="muted">${v.plataforma_id ? '<b class="selo-rh">RH+ Match</b>' : esc(v.fonte)}</td><td class="c muted">${dataCurta(v.publicada_em)}</td></tr>`).join("")
    || `<tr><td colspan="7" class="vazio">${b?.estado === "buscando" ? "Buscando nos canais…" : b?.vagas?.length ? "Nenhuma vaga com esses filtros. Remova algum filtro ou reduza o score mínimo." : b ? "Nenhuma vaga encontrada." : "Os resultados aparecem aqui."}</td></tr>`;
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
  if (!v) { el.innerHTML = `<div class="vazio"><div class="ico">🎯</div><b>Selecione uma vaga</b><br>para ver por que ela combina com o perfil.</div>`; return; }
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
    ${d.skills_ok?.length ? `<h4>Competências que ${ehAdmin() ? "o candidato tem" : "você tem"}</h4>${d.skills_ok.map((s) => `<span class="chip ok">${esc(s)}</span>`).join("")}` : ""}
    ${d.skills_faltam?.length ? `<h4>Pedidas na vaga e ausentes no perfil</h4>${d.skills_faltam.map((s) => `<span class="chip gap">${esc(s)}</span>`).join("")}` : ""}
    <h4>Descrição</h4><div class="desc">${esc((v.descricao || "Descrição completa no anúncio.").slice(0, 2500))}</div>
    ${v.plataforma_id && !ehAdmin() ? `<button class="btn" id="btnCandidatar" style="width:100%;margin-top:14px">📨 Candidatar-se pelo RH+ Match</button>` : ""}
    <button class="btn ia" id="btnAdaptar" style="width:100%;margin-top:${v.plataforma_id && !ehAdmin() ? 8 : 14}px">✨ Adaptar currículo para esta vaga</button>
    <div class="det-acoes">${v.plataforma_id ? `<a class="btn neutro" href="#/vaga/${v.plataforma_id}" style="text-decoration:none">Ver vaga</a>`
      : `<a class="btn neutro" href="${esc(v.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir vaga ↗</a>`}
      ${v.plataforma_id && !ehAdmin() ? "" : `<button class="btn" id="btnPipe">+ ${ehAdmin() ? "Adicionar ao pipeline" : "Acompanhar esta vaga"}</button>`}</div></div>`;
  $("#btnPipe")?.addEventListener("click", () => adicionarPipeline(v).catch(falha));
  $("#btnAdaptar").onclick = () => abrirAdaptador(v, estado.busca.candidato);
  $("#btnCandidatar")?.addEventListener("click", () => candidatar(v, estado.busca.candidato).catch(falha));
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
  if (!candidato) return toast(ehAdmin() ? "Cadastre e selecione um candidato para buscar vagas." : "Complete seu perfil para buscar vagas.");
  const marcados = $$(".canais input[type=checkbox]:checked").map((x) => x.value);
  const plataforma = marcados.includes("plataforma");
  const fontes = marcados.map((id) => FONTES.find((f) => f.id === id)).filter(Boolean);
  const termos = $("#termos").value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5);
  if ((!fontes.length && !plataforma) || !termos.length) return toast("Selecione ao menos um canal e informe um cargo para pesquisar.");
  const local = { cidade: $("#locCidade").value.trim(), uf: $("#locUf").value };

  const b = { id: Date.now(), estado: "buscando", candidato, termos, local, progresso: {}, brutas: [], vagas: [], cancelada: false };
  if (plataforma) b.progresso["RH+ Match"] = { status: "buscando", qtd: 0 };
  fontes.forEach((f) => (b.progresso[f.nome] = { status: "buscando", qtd: 0 }));
  estado.busca = b; estado.vagaSel = null;
  btn.textContent = "■ Cancelar";
  renderStatus(); renderVagas();
  const skills = String(candidato.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
  const tarefaPlataforma = plataforma ? (async () => {
    try { const vs = await buscarVagasPlataforma(termos); b.brutas.push(...vs); b.progresso["RH+ Match"] = { status: "ok", qtd: vs.length }; }
    catch (e) { b.progresso["RH+ Match"] = { status: "erro", qtd: 0, erro: traduzErro(e) }; }
    if (estado.busca === b && b.estado === "buscando") renderStatus();
  })() : null;
  await Promise.all([tarefaPlataforma, ...fontes.map(async (f) => {
    try {
      const r = await sb.functions.invoke("buscar-vagas", {
        body: { fonte: f.id, termos, cidade: local.cidade, uf: local.uf, skills, paginas: ctx.cfg.paginas_por_fonte },
      });
      if (r.error) throw new Error(await erroFuncao(r, "buscar-vagas"));
      const vagas = r.data?.vagas || [];
      if (!vagas.length && r.data?.erro) throw new Error(r.data.erro);
      b.brutas.push(...vagas);
      b.progresso[f.nome] = { status: "ok", qtd: vagas.length };
    } catch (e) { b.progresso[f.nome] = { status: "erro", qtd: 0, erro: e.message }; }
    if (estado.busca === b && b.estado === "buscando") renderStatus();
  })]);
  if (b.estado === "buscando") finalizarBusca(b);
}

async function finalizarBusca(b) {
  b.estado = "concluida";
  // vagas da plataforma primeiro entre as de mesma nota (aceitam candidatura direta)
  b.vagas = consolidar(b.candidato, b.brutas).sort((x, y) => y.score - x.score || (y.plataforma_id ? 1 : 0) - (x.plataforma_id ? 1 : 0)).map((v, idx) => ({ ...v, idx }));
  const btn = $("#btnBuscar"); if (btn && estado.busca === b) { btn.disabled = false; btn.textContent = "🔎 Buscar vagas"; }
  if (estado.busca === b) { renderStatus(); renderVagas(); }
  toast(b.cancelada ? `Busca cancelada: ${b.vagas.length} vagas até aqui.` : `Busca concluída: ${b.vagas.length} vagas analisadas.`);
  try {
    const okFontes = Object.entries(b.progresso).filter(([, p]) => p.status === "ok").map(([n]) => n);
    await q(sb.from("buscas").insert({ candidato_id: b.candidato.id, termos: b.termos.join(", "), total: b.vagas.length,
      compativeis: b.vagas.filter((v) => v.score >= ctx.cfg.score_minimo_padrao).length, fontes: okFontes.join(", ") }));
    const salvar = b.vagas.filter((v) => v.score >= 30);
    for (let i = 0; i < salvar.length; i += 200) await salvarVagas(salvar.slice(i, i + 200));
  } catch (e) { falha(e); }
}

const linhaVaga = (v) => ({
  owner: ctx.usuario.id, url: v.url, titulo: v.titulo, empresa: v.empresa || "", fonte: v.fonte, cidade: v.cidade || "", uf: v.uf || "",
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
  if (error && error.code === "23505") return toast(ehAdmin() ? "Essa vaga já está no pipeline do candidato." : "Você já acompanha esta vaga.");
  if (error) throw error;
  toast(ehAdmin() ? "Vaga adicionada ao pipeline." : "Vaga adicionada a “Minhas vagas”.");
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
async function exportarExcel(vagas, candidato) {
  if (!vagas.length) return toast("Faça uma busca primeiro.");
  const wb = await novaPlanilha(), ws = wb.addWorksheet("Vagas compatíveis");
  cabecalhoPlanilha(ws, ["Score", "Compatibilidade", "Cargo", "Empresa", "Local", "Modalidade", "Nível", "Contrato", "Salário", "Skills que batem",
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
  const empresa = esc(ctx.cfg.empresa_nome || ctx.perfil?.organizacao || "RH+ Match");
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

/* ============================================================= PIPELINE / MINHAS VAGAS */
async function pgPipeline() {
  const admin = ehAdmin();
  const cands = admin ? await listarCandidatos() : [];
  main.innerHTML = topo(admin ? "Pipeline" : "Candidaturas", admin ? "Acompanhe cada indicação até a contratação" : "Vagas de outros portais que você está acompanhando", `
      ${admin ? `<select id="pCand" style="width:240px"><option value="">Todos os candidatos</option>${cands.map((c) => `<option value="${c.id}" ${String(c.id) === estado.pipeCand ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>` : ""}
      <button class="btn neutro" id="pExcel">Exportar Excel</button>`) + (admin ? "" : abasCandidato("p")) + `
    <div class="funil" id="funil"></div>
    <div class="split"><div class="card"><div class="tabela-wrap" style="max-height:calc(100vh - 290px);min-height:260px"><table>
      <thead><tr><th>${admin ? "CANDIDATO" : "PERFIL"}</th><th>VAGA</th><th>EMPRESA</th><th class="c">SCORE</th><th>ETAPA</th><th class="c">ATUALIZADO</th></tr></thead>
      <tbody id="tbPipe"></tbody></table></div></div>
      <div class="card detalhe" id="detPipe"></div></div>`;
  let itens = [];
  const carregar = async () => {
    let r = sb.from("pipeline").select("id, score, status, notas, detalhes, atualizado_em, candidato_id, candidatos(nome), vagas(titulo, empresa, url, fonte, cidade, uf, modalidade, salario, contrato, senioridade, descricao, tags)")
      .order("atualizado_em", { ascending: false }).order("score", { ascending: false });
    if (admin && estado.pipeCand) r = r.eq("candidato_id", +estado.pipeCand);
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
      || `<tr><td colspan="6" class="vazio">${admin ? "Nenhuma vaga no pipeline. Adicione a partir da tela de busca." : "Você ainda não acompanha nenhuma vaga. Em “Buscar vagas”, toque em “Acompanhar esta vaga”."}</td></tr>`;
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
        <div><h2>${esc(it.titulo)}</h2><p>${esc(it.empresa || "Empresa não divulgada")}${admin ? ` · para <b>${esc(it.candidato)}</b>` : ""}</p></div></div>
      <div>${[localVaga(it), it.modalidade, it.senioridade, it.contrato, it.salario, it.fonte].filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
      ${det.skills_ok?.length ? `<h4>Competências que batem</h4>${det.skills_ok.map((s) => `<span class="chip ok">${esc(s)}</span>`).join("")}` : ""}
      <h4>Etapa</h4><select id="pStatus">${STATUS_PIPELINE.map((s) => `<option ${s === it.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <h4>${admin ? "Notas do recrutador" : "Minhas anotações"}</h4><textarea id="pNotas" placeholder="Retorno da empresa, datas de entrevista, feedback…">${esc(it.notas || "")}</textarea>
      <button class="btn ia" id="pAdaptar" style="width:100%;margin-top:14px">✨ Adaptar currículo para esta vaga</button>
      <div class="det-acoes"><button class="btn perigo" id="pRem">Remover</button>
        <div class="acoes"><a class="btn neutro" href="${esc(it.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir vaga ↗</a><button class="btn" id="pSalvar">Salvar</button></div></div></div>`;
    $("#pAdaptar").onclick = async () => {
      try { abrirAdaptador(it, await obterCandidato(it.candidato_id)); } catch (e) { falha(e); }
    };
    $("#pSalvar").onclick = async () => {
      try { await q(sb.from("pipeline").update({ status: $("#pStatus").value, notas: $("#pNotas").value.trim() }).eq("id", it.id));
        toast("Atualizado."); await carregar(); } catch (e) { falha(e); }
    };
    $("#pRem").onclick = async () => {
      if (!confirm("Remover esta vaga da lista? Não é possível desfazer.")) return;
      try { await q(sb.from("pipeline").delete().eq("id", it.id)); estado.pipeSel = null; toast("Removida."); await carregar(); } catch (e) { falha(e); }
    };
  };
  $("#pCand")?.addEventListener("change", (e) => { estado.pipeCand = e.target.value; carregar().catch(falha); });
  $("#funil").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; estado.pipeStatus = b.dataset.v; $$("#funil button").forEach((x) => x.classList.toggle("on", x === b)); render(); };
  $("#tbPipe").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) { estado.pipeSel = +tr.dataset.id; render(); abrirSheet($("#detPipe"), "Oportunidade"); } };
  $("#pExcel").onclick = async () => {
    if (!itens.length) return toast("A lista está vazia.");
    try {
      const wb = await novaPlanilha(), ws = wb.addWorksheet(admin ? "Pipeline" : "Minhas vagas");
      cabecalhoPlanilha(ws, ["Candidato", "Vaga", "Empresa", "Local", "Modalidade", "Score", "Status", "Notas", "Atualizado", "Fonte", "Link"], [24, 42, 26, 20, 12, 8, 18, 40, 16, 18, 50]);
      itens.forEach((i) => ws.addRow([i.candidato, i.titulo, i.empresa, localVaga(i), i.modalidade, i.score, i.status, i.notas, dataHora(i.atualizado_em), i.fonte, i.url]));
      await salvarPlanilha(wb, `${admin ? "pipeline" : "minhas_vagas"}_${carimbo()}.xlsx`);
    } catch (e) { falha(e); }
  };
  await carregar();
}
