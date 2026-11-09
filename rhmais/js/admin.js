/* RH+ Match — telas de administração: Ajustes (admin/master), chaves da plataforma e Usuários (master). */
import { FONTES } from "../supabase/functions/_shared/nucleo.js";
import {
  $, $$, CFG_PADRAO, cartaoConta, ctx, dataHora, ehMaster, esc, estado, falha, fonteDisponivel, ligarCartaoConta,
  ligarSegmentados, main, q, sb, segmentado, toast, topo,
} from "./base.js";

const CHAVES = [
  ["adzuna_app_id", "Adzuna – App ID", "https://developer.adzuna.com/signup"],
  ["adzuna_app_key", "Adzuna – App Key", "https://developer.adzuna.com/signup"],
  ["jooble_key", "Jooble – API Key", "https://br.jooble.org/api/about"],
  ["github_token", "GitHub – token pessoal", "https://github.com/settings/tokens"],
];

export async function carregarStatusChaves() {
  try { ctx.chaves = (await q(sb.rpc("chaves_plataforma_status"))) || {}; } catch { ctx.chaves = {}; }
}

/* ============================================================= AJUSTES */
export async function pgConfig() {
  const cfg = ctx.cfg;
  main.innerHTML = topo("Ajustes", "Canais de vagas, preferências e conta") + `
    <div class="card" style="margin-bottom:14px"><div class="topo" style="align-items:center;margin-bottom:10px"><h3 style="margin:0">Canais de vagas</h3>
      <button class="btn sec peq" id="cTestar">Testar conexões</button></div>
      ${FONTES.map((f) => `<div class="fonte-linha"><label class="switch"><input type="checkbox" data-fonte="${f.id}" ${cfg.fontes_ativas.includes(f.id) ? "checked" : ""}><span></span></label>
        <div class="txt"><b>${esc(f.nome)}</b><small>${esc(f.descricao)}</small></div>
        <span class="muted" id="st-${f.id}" style="font-size:12px;font-weight:600">${fonteDisponivel(f) ? "" : "sem chave"}</span><span class="chip">${esc(f.cobertura)}</span></div>`).join("")}
    </div>
    <div class="card" style="margin-bottom:14px"><h3>Preferências</h3><div class="form">
      <label class="campo full">Nome da empresa/consultoria (aparece nos relatórios)<input type="text" id="cEmpresa" value="${esc(cfg.empresa_nome || ctx.perfil?.organizacao || "")}"></label>
      <div class="campo">Páginas lidas por canal ${segmentado("cPag", [1, 2, 3, 5], cfg.paginas_por_fonte)}</div>
      <div class="campo">Score mínimo padrão ${segmentado("cScore", [30, 40, 50, 60], cfg.score_minimo_padrao)}</div>
    </div>
    <div class="barra-salvar"><span class="muted" id="cMsg"></span><button class="btn" id="cSalvar">Salvar canais e preferências</button></div></div>
    ${ehMaster() ? `<div class="card" style="margin-bottom:14px"><h3>Chaves de API da plataforma <span class="chip prim">só o master</span></h3>
      <p class="muted" style="margin-top:-4px">Adzuna e Jooble agregam vagas de centenas de sites brasileiros; o token do GitHub aumenta o limite de consultas.
        As chaves valem para <b>todos os usuários</b>, ficam guardadas no servidor e nunca são exibidas de volta. Deixe um campo em branco para manter a chave atual.</p>
      <div class="form">${CHAVES.map(([k, rot, url]) => `<label class="campo"><span style="display:flex;justify-content:space-between;gap:8px">${rot}
          <span>${ctx.chaves[k] ? `<span class="chip ok">✓ configurada</span> <a data-remover="${k}" style="font-weight:400;cursor:pointer">remover</a> ·` : '<span class="chip">não configurada</span>'} <a href="${url}" target="_blank" rel="noopener" style="font-weight:400">obter ↗</a></span></span>
        <input type="password" data-chave="${k}" placeholder="${ctx.chaves[k] ? "•••••••• (manter a atual)" : "Cole a chave aqui"}" autocomplete="off"></label>`).join("")}</div>
      <div class="barra-salvar"><span class="muted" id="kMsg"></span><button class="btn" id="kSalvar">Salvar chaves</button></div></div>` : ""}
    ${cartaoConta()}`;
  ligarSegmentados(main);
  ligarCartaoConta();

  $("#cSalvar").onclick = async () => {
    const btn = $("#cSalvar"); btn.disabled = true; $("#cMsg").textContent = "Salvando…";
    const dados = {
      owner: ctx.usuario.id, empresa_nome: $("#cEmpresa").value.trim(), paginas_por_fonte: +($("#cPag .on")?.dataset.v || 2),
      score_minimo_padrao: +($("#cScore .on")?.dataset.v || 40), fontes_ativas: $$("[data-fonte]:checked").map((x) => x.dataset.fonte),
      atualizado_em: new Date().toISOString(),
    };
    try {
      ctx.cfg = { ...CFG_PADRAO, ...(await q(sb.from("configuracoes").upsert(dados).select("empresa_nome, paginas_por_fonte, score_minimo_padrao, fontes_ativas").single())) };
      estado.filtros.score = ctx.cfg.score_minimo_padrao;
      $("#cMsg").textContent = "✓ Salvo"; toast("Canais e preferências salvos.");
    } catch (e) { $("#cMsg").textContent = ""; falha(e); }
    finally { btn.disabled = false; }
  };

  if (ehMaster()) {
    $("#kSalvar").onclick = async () => {
      const chaves = {};
      for (const i of $$("[data-chave]")) if (i.value.trim()) chaves[i.dataset.chave] = i.value.trim();
      if (!Object.keys(chaves).length) return ($("#kMsg").textContent = "Nada para salvar: cole ao menos uma chave.");
      await salvarChaves(chaves, "Chaves de API salvas.");
    };
    $$("[data-remover]").forEach((a) => (a.onclick = async () => {
      if (!confirm("Remover esta chave? O canal deixa de funcionar até uma nova chave ser salva.")) return;
      await salvarChaves({ [a.dataset.remover]: "" }, "Chave removida.");
    }));
    const salvarChaves = async (chaves, msg) => {
      const btn = $("#kSalvar"); btn.disabled = true; $("#kMsg").textContent = "Salvando…";
      try {
        ctx.chaves = await q(sb.rpc("salvar_chaves_plataforma", { p_chaves: chaves }));
        toast(msg); await pgConfig();
        $("#kMsg").textContent = "✓ " + msg;
      } catch (e) { $("#kMsg").textContent = ""; falha(e); btn.disabled = false; }
    };
  }

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

/* ============================================================= USUÁRIOS (master) */
const ROTULO_PAPEL = { master: "Master", admin: "Administrador", candidato: "Candidato" };
export async function pgUsuarios() {
  main.innerHTML = topo("Usuários", "Quem tem acesso de administrador (empresas, RH, headhunters) e pedidos de acesso") + `
    <div class="card" style="margin-bottom:14px"><h3>Pedidos de acesso de administrador</h3><div id="uSolic"><div class="vazio">Carregando…</div></div></div>
    <div class="card"><div class="topo" style="align-items:center;margin-bottom:10px"><h3 style="margin:0">Todos os usuários</h3>
      <input type="search" id="uBusca" placeholder="Buscar por e-mail, nome ou empresa" style="max-width:280px"></div>
      <div class="tabela-wrap"><table><thead><tr><th>USUÁRIO</th><th>EMPRESA</th><th>PAPEL</th><th>ÚLTIMO ACESSO</th></tr></thead><tbody id="uLista"></tbody></table></div></div>`;
  let usuarios = [];
  const carregar = async () => {
    const [solic, us] = await Promise.all([
      q(sb.from("solicitacoes_admin").select("id, usuario, organizacao, tipo_org, telefone, mensagem, status, criado_em").order("criado_em", { ascending: false }).limit(50)),
      q(sb.rpc("listar_usuarios")),
    ]);
    usuarios = us;
    const emailDe = Object.fromEntries(us.map((u) => [u.id, u.email]));
    const pend = solic.filter((s) => s.status === "pendente");
    $("#uSolic").innerHTML = pend.length ? pend.map((s) => `<div class="linha-solic" data-id="${s.id}">
        <div style="flex:1;min-width:0"><b>${esc(s.organizacao || "(sem empresa)")}</b> <span class="chip">${esc(s.tipo_org || "—")}</span>
          <div class="muted" style="font-size:13px">${esc(emailDe[s.usuario] || "")}${s.telefone ? " · " + esc(s.telefone) : ""} · ${dataHora(s.criado_em)}</div>
          ${s.mensagem ? `<div style="font-size:13px;margin-top:4px">“${esc(s.mensagem)}”</div>` : ""}</div>
        <div class="acoes"><button class="btn perigo peq" data-dec="0">Recusar</button><button class="btn sucesso peq" data-dec="1">Aprovar como administrador</button></div></div>`).join("")
      : `<div class="vazio" style="padding:14px">Nenhum pedido pendente.</div>`;
    render();
  };
  const render = () => {
    const t = $("#uBusca").value.trim().toLowerCase();
    const vs = usuarios.filter((u) => !t || `${u.email} ${u.nome} ${u.organizacao}`.toLowerCase().includes(t));
    $("#uLista").innerHTML = vs.map((u) => `<tr data-id="${u.id}">
      <td><b>${esc(u.nome || u.email)}</b>${u.nome ? `<div class="muted" style="font-size:12px">${esc(u.email)}</div>` : ""}</td>
      <td>${esc([u.organizacao, u.tipo_org].filter(Boolean).join(" · ") || "—")}</td>
      <td>${u.papel === "master" ? '<span class="chip prim">Master</span>' : `<select data-papel style="min-width:150px">${["candidato", "admin"].map((p) => `<option value="${p}" ${p === u.papel ? "selected" : ""}>${ROTULO_PAPEL[p]}</option>`).join("")}</select>`}</td>
      <td class="muted">${u.ultimo_acesso ? dataHora(u.ultimo_acesso) : "nunca"}</td></tr>`).join("") || `<tr><td colspan="4" class="vazio">Nenhum usuário.</td></tr>`;
  };
  $("#uBusca").oninput = render;
  $("#uLista").addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-papel]"); if (!sel) return;
    const tr = sel.closest("tr"); const u = usuarios.find((x) => x.id === tr.dataset.id);
    if (!confirm(`Alterar ${u.email} para ${ROTULO_PAPEL[sel.value]}?`)) { sel.value = u.papel; return; }
    try { await q(sb.rpc("definir_papel", { p_usuario: u.id, p_papel: sel.value })); u.papel = sel.value; toast("Papel atualizado."); }
    catch (err) { sel.value = u.papel; falha(err); }
  });
  $("#uSolic").onclick = async (e) => {
    const b = e.target.closest("[data-dec]"); if (!b) return;
    const id = +b.closest("[data-id]").dataset.id, aprovar = b.dataset.dec === "1";
    if (!confirm(aprovar ? "Aprovar este pedido? A conta passa a ser administradora." : "Recusar este pedido?")) return;
    try { await q(sb.rpc("decidir_solicitacao", { p_id: id, p_aprovar: aprovar })); toast(aprovar ? "Acesso de administrador aprovado." : "Pedido recusado."); await carregar(); }
    catch (err) { falha(err); }
  };
  await carregar();
}
