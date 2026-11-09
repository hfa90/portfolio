/* RH+ Match — vagas publicadas na plataforma, candidaturas, mensagens e página pública da vaga. */
import { AREAS, MODALIDADES, REGIMES, SENIORIDADES, UFS, avaliar, classificar, localVaga } from "../../supabase/functions/_shared/nucleo.js";
import {
  $, $$, abrirSheet, ctx, dataHora, ehAdmin, esc, falha, main, modal, q, sb, toast, topo,
} from "./base.js";
import { abrirAdaptador, mostrarCurriculo } from "./curriculos.js";

export const ETAPAS = {
  enviada: ["Enviada", "prim"], em_analise: ["Em análise", "prim"], entrevista: ["Entrevista", "lar"], aprovada: ["Aprovada", "ok"],
  reprovada: ["Não seguiu", ""], contratada: ["Contratada", "ok"], desistiu: ["Desistência", ""],
};
const ORDEM_ETAPAS = ["enviada", "em_analise", "entrevista", "aprovada", "contratada"];
const etapaChip = (s) => { const [r, c] = ETAPAS[s] || [s, ""]; return `<span class="chip ${c}">${esc(r)}</span>`; };
const COLS_VP = "id, owner, organizacao, titulo, descricao, requisitos, beneficios, cidade, uf, regiao, modalidade, regime, area, senioridade, salario_min, salario_max, mostrar_salario, email_contato, status, expira_em, criado_em, atualizado_em";
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const salarioTexto = (v) => {
  if (!v.mostrar_salario || (!v.salario_min && !v.salario_max)) return "";
  if (v.salario_min && v.salario_max && v.salario_min !== v.salario_max) return `${brl(v.salario_min)} a ${brl(v.salario_max)}`;
  return brl(v.salario_max || v.salario_min);
};
export const linkPublico = (id) => `${location.origin}${location.pathname}#/vaga/${id}`;

/** Converte uma vaga publicada no formato das vagas da busca (para pontuar, listar e salvar). */
export function vagaPublicadaParaBusca(vp) {
  return {
    titulo: vp.titulo, empresa: vp.organizacao || "", url: linkPublico(vp.id), fonte: "RH+ Match", plataforma_id: vp.id,
    cidade: vp.cidade || "", uf: vp.uf || "", modalidade: vp.modalidade || "", senioridade: vp.senioridade || "",
    salario: salarioTexto(vp), contrato: vp.regime || "", tags: [vp.area].filter(Boolean),
    descricao: [vp.descricao, vp.requisitos && "Requisitos:\n" + vp.requisitos, vp.beneficios && "Benefícios:\n" + vp.beneficios].filter(Boolean).join("\n\n"),
    publicada_em: String(vp.criado_em || "").slice(0, 10),
  };
}

/** Vagas abertas na plataforma que combinam com algum dos termos. */
export async function buscarVagasPlataforma(termos) {
  const limpos = termos.map((t) => t.replace(/[%,()*]/g, " ").trim()).filter(Boolean);
  let r = sb.from("vagas_publicadas").select(COLS_VP).eq("status", "aberta").order("criado_em", { ascending: false }).limit(200);
  const palavras = [...new Set(limpos.flatMap((t) => t.split(/\s+/)).filter((p) => p.length >= 4))].slice(0, 8);
  if (palavras.length) r = r.or(palavras.flatMap((p) => [`titulo.ilike.%${p}%`, `area.ilike.%${p}%`]).join(","));
  return (await q(r)).map(vagaPublicadaParaBusca);
}

const minhaCandidatura = async (vagaId) => q(sb.from("candidaturas").select("id, status, criado_em").eq("vaga_id", vagaId).eq("candidato", ctx.usuario.id).maybeSingle());

/* ============================================================= CANDIDATAR-SE */
export async function candidatar(vaga, candidato) {
  if (!candidato) {
    return modal(`<h3 style="margin:0 0 8px">Complete seu perfil primeiro</h3><p class="muted">Para se candidatar, preencha “Meu perfil” (cargo, competências e cidade). É rápido.</p>
      <div class="rodape"><button class="btn neutro" data-fechar>Agora não</button><a class="btn" href="#/perfil" data-fechar style="text-decoration:none">Completar perfil</a></div>`);
  }
  const ja = await minhaCandidatura(vaga.plataforma_id);
  if (ja) return toast(`Você já se candidatou a esta vaga (${ETAPAS[ja.status]?.[0] || ja.status}).`);
  const cvs = await q(sb.from("curriculos").select("id, tipo, titulo, modelo, conteudo, padrao, vaga_url, vaga_titulo").order("padrao", { ascending: false }).order("atualizado_em", { ascending: false }).limit(30));
  const paraVaga = cvs.find((c) => c.vaga_url === vaga.url);
  const ordem = [paraVaga, ...cvs.filter((c) => c !== paraVaga)].filter(Boolean);
  const rotulo = (c) => (c === paraVaga ? "✨ Adaptado para esta vaga" : c.tipo === "base" ? "Currículo base" : "Adaptado: " + (c.vaga_titulo || c.titulo)) + (c.padrao ? " · padrão" : "");
  modal(`<h3 style="margin:0 0 2px">Candidatar-se</h3>
    <p class="muted" style="margin:0 0 14px"><b>${esc(vaga.titulo)}</b> · ${esc(vaga.empresa || "")}</p>
    ${ordem.length ? `<div class="campo">Currículo que será enviado<div class="opcoes-cv">${ordem.map((c, i) => `<label class="opcao"><input type="radio" name="cvEscolha" value="${c.id}" ${i === 0 ? "checked" : ""}>
        <span><b>${esc(rotulo(c))}</b><small>${esc(c.conteudo?.titulo_profissional || "")}</small></span><a data-ver="${c.id}">ver</a></label>`).join("")}</div></div>
      ${paraVaga ? "" : `<p style="font-size:13px;margin:8px 0 0">💡 Dica: <a id="cAdaptar" style="cursor:pointer;font-weight:600">adapte seu currículo para esta vaga</a> antes de enviar e aumente suas chances.</p>`}`
      : `<div class="card" style="background:var(--lar-s);border-color:var(--lar)"><b>Você ainda não tem currículo salvo.</b><br><span style="font-size:14px">Adapte um currículo para esta vaga (a IA faz em cerca de 1 minuto) ou importe seu currículo base em “Currículos”.</span>
        <div style="margin-top:10px"><button class="btn ia peq" id="cAdaptar">✨ Adaptar currículo para esta vaga</button></div></div>`}
    <label class="campo" style="margin-top:14px">Mensagem para a empresa (opcional)<textarea id="cMsg" style="min-height:90px" maxlength="3000" placeholder="Conte em poucas linhas por que você combina com a vaga."></textarea></label>
    <p class="muted" style="font-size:12px;margin:8px 0 0">A empresa verá seu nome, e-mail, telefone, cidade, cargo desejado, competências e o currículo escolhido.</p>
    <div class="rodape"><button class="btn neutro" data-fechar>Cancelar</button><button class="btn" id="cEnviar" ${ordem.length ? "" : "disabled"}>Enviar candidatura</button></div>`);
  $("#cAdaptar")?.addEventListener("click", () => abrirAdaptador(vaga, candidato));
  $$("[data-ver]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const c = cvs.find((x) => x.id === +a.dataset.ver); mostrarCurriculo(c); }));
  $("#cEnviar").onclick = async () => {
    const cv = cvs.find((c) => c.id === +($("input[name=cvEscolha]:checked")?.value || 0));
    const btn = $("#cEnviar"); btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const pont = avaliar(candidato, vaga);
      const perfil = { nome: candidato.nome, email: candidato.email || ctx.usuario.email, telefone: candidato.telefone, cidade: candidato.cidade, uf: candidato.uf,
        cargo_desejado: candidato.cargo_desejado, skills: candidato.skills, senioridade: candidato.senioridade, pretensao_salarial: candidato.pretensao_salarial,
        modalidades: candidato.modalidades, aceita_mudanca: candidato.aceita_mudanca, resumo: candidato.resumo };
      const nova = await q(sb.from("candidaturas").insert({
        vaga_id: vaga.plataforma_id, candidato: ctx.usuario.id, perfil, curriculo: cv?.conteudo || null, curriculo_modelo: cv?.modelo || "classico",
        mensagem: $("#cMsg").value.trim(), score: pont.score, detalhes: pont.detalhes_score,
      }).select("id").single());
      $("#modal").close(); toast("Candidatura enviada! Acompanhe em “Candidaturas”.");
      notificar("nova_candidatura", nova.id);
    } catch (e) { btn.disabled = false; btn.textContent = "Enviar candidatura"; falha(e); }
  };
}

/** Avisa por e-mail (não bloqueia a tela; se o e-mail não estiver configurado, segue sem avisar). */
export async function notificar(tipo, candidaturaId) {
  try { await sb.functions.invoke("notificar", { body: { tipo, candidatura_id: candidaturaId } }); } catch { /* aviso por e-mail é opcional */ }
}

/* ============================================================= MENSAGENS */
async function conversa(el, candidatura) {
  const carregar = async () => {
    const msgs = await q(sb.from("mensagens").select("id, autor, texto, criado_em, lida_em").eq("candidatura_id", candidatura.id).order("criado_em"));
    el.innerHTML = `<div class="conversa">${msgs.length ? msgs.map((m) => `<div class="balao ${m.autor === ctx.usuario.id ? "meu" : ""}"><p>${esc(m.texto)}</p><small>${dataHora(m.criado_em)}${m.autor === ctx.usuario.id && m.lida_em ? " · lida" : ""}</small></div>`).join("")
        : `<p class="muted" style="text-align:center;font-size:13px;margin:6px 0">Nenhuma mensagem ainda.</p>`}</div>
      <div class="enviar-msg"><textarea id="mTexto" rows="2" maxlength="4000" placeholder="Escreva uma mensagem…"></textarea><button class="btn" id="mEnviar">Enviar</button></div>`;
    const conv = $(".conversa", el); conv.scrollTop = conv.scrollHeight;
    const naoLidas = msgs.filter((m) => m.autor !== ctx.usuario.id && !m.lida_em).map((m) => m.id);
    if (naoLidas.length) sb.from("mensagens").update({ lida_em: new Date().toISOString() }).in("id", naoLidas).then(() => {});
    $("#mEnviar", el).onclick = async () => {
      const t = $("#mTexto", el).value.trim(); if (!t) return;
      const ultimaMinhaNaoLida = [...msgs].reverse().find((m) => m.autor === ctx.usuario.id && !m.lida_em);
      try {
        await q(sb.from("mensagens").insert({ candidatura_id: candidatura.id, autor: ctx.usuario.id, texto: t }));
        if (!ultimaMinhaNaoLida) notificar("mensagem", candidatura.id);   // evita um e-mail por mensagem enquanto a anterior não foi lida
        await carregar();
      } catch (e) { falha(e); }
    };
  };
  await carregar();
}

/* ============================================================= MINHAS VAGAS (empresa) */
export async function pgVagas() {
  main.innerHTML = topo("Minhas vagas", "Vagas que você publicou na plataforma e as candidaturas recebidas", `<button class="btn" id="vNova">+ Publicar vaga</button>`) + `<div id="vLista"><div class="vazio">Carregando…</div></div>`;
  $("#vNova").onclick = () => formVaga({}, () => pgVagas());
  const [vagas, resumo] = await Promise.all([
    q(sb.from("vagas_publicadas").select(COLS_VP).eq("owner", ctx.usuario.id).order("criado_em", { ascending: false })),
    q(sb.rpc("resumo_minhas_vagas")),
  ]);
  const porVaga = Object.fromEntries(resumo.map((r) => [r.vaga_id, r]));
  const rotSt = { aberta: ["Aberta", "ok"], pausada: ["Pausada", "lar"], encerrada: ["Encerrada", ""], rascunho: ["Rascunho", ""] };
  $("#vLista").innerHTML = vagas.length ? `<div class="vaga-grade">${vagas.map((v) => {
    const r = porVaga[v.id] || {}; const [rs, cs] = rotSt[v.status] || [v.status, ""];
    return `<div class="card vaga-cartao" data-id="${v.id}">
      <div class="topo" style="margin:0 0 6px;align-items:flex-start"><div style="min-width:0"><h3 style="margin:0">${esc(v.titulo)}</h3>
        <div class="muted" style="font-size:13px">${esc([v.organizacao, localVaga(v), v.modalidade, v.regime].filter(Boolean).join(" · "))}</div></div>
        <span class="chip ${cs}">${rs}</span></div>
      <div class="vaga-num"><button class="btn sec peq" data-acao="cands">👥 ${r.total || 0} candidatura(s)${r.novas ? ` · <b>${r.novas} nova(s)</b>` : ""}${r.nao_lidas ? ` · 💬 ${r.nao_lidas}` : ""}</button>
        <span class="muted" style="font-size:12px">Publicada em ${dataHora(v.criado_em)}${v.expira_em ? ` · até ${new Date(v.expira_em + "T12:00").toLocaleDateString("pt-BR")}` : ""}</span></div>
      <div class="acoes" style="margin-top:10px;justify-content:flex-end">
        <button class="btn neutro peq" data-acao="link">🔗 Copiar link</button>
        <button class="btn neutro peq" data-acao="editar">Editar</button>
        ${v.status === "aberta" ? `<button class="btn neutro peq" data-acao="pausar">Pausar</button><button class="btn neutro peq" data-acao="encerrar">Encerrar</button>`
          : `<button class="btn neutro peq" data-acao="abrir">Reabrir</button>`}
        <button class="btn perigo peq" data-acao="excluir">Excluir</button></div></div>`;
  }).join("")}</div>`
    : `<div class="card vazio"><div class="ico">📣</div><b>Você ainda não publicou vagas</b><br>Publique uma vaga e receba candidaturas com o currículo e a compatibilidade de cada candidato.
      <div style="margin-top:14px"><button class="btn" id="vNova2">+ Publicar primeira vaga</button></div></div>`;
  $("#vNova2")?.addEventListener("click", () => formVaga({}, () => pgVagas()));
  $("#vLista").onclick = async (e) => {
    const b = e.target.closest("[data-acao]"), card = e.target.closest("[data-id]"); if (!b || !card) return;
    const v = vagas.find((x) => x.id === +card.dataset.id);
    const mudar = async (status, msg) => { try { await q(sb.from("vagas_publicadas").update({ status }).eq("id", v.id)); toast(msg); pgVagas(); } catch (err) { falha(err); } };
    switch (b.dataset.acao) {
      case "cands": return pgCandidaturasDaVaga(v);
      case "editar": return formVaga(v, () => pgVagas());
      case "link": try { await navigator.clipboard.writeText(linkPublico(v.id)); toast("Link da vaga copiado. Divulgue onde quiser!"); } catch { modal(`<p>Link da vaga:</p><input type="text" value="${esc(linkPublico(v.id))}" readonly onclick="this.select()"><div class="rodape"><span></span><button class="btn" data-fechar>OK</button></div>`); } return;
      case "pausar": return mudar("pausada", "Vaga pausada: ela some das buscas até você reabrir.");
      case "encerrar": if (confirm("Encerrar esta vaga? Ela sai das buscas; as candidaturas continuam guardadas.")) return mudar("encerrada", "Vaga encerrada."); return;
      case "abrir": return mudar("aberta", "Vaga reaberta.");
      case "excluir":
        if (!confirm(`Excluir a vaga “${v.titulo}” e TODAS as candidaturas e mensagens dela? Não é possível desfazer.`)) return;
        try { await q(sb.from("vagas_publicadas").delete().eq("id", v.id)); toast("Vaga excluída."); pgVagas(); } catch (err) { falha(err); }
    }
  };
}

function formVaga(v, aoSalvar) {
  const sel = (n, rot, ops, val, vazio = "—") => `<label class="campo">${rot}<select name="${n}"><option value="">${vazio}</option>${ops.map((o) => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
  const nova = !v.id;
  modal(`<h3 style="margin:0 0 12px">${nova ? "Publicar vaga" : "Editar vaga"}</h3>
    <form class="form" id="fVaga" autocomplete="off">
      <label class="campo full">Título da vaga *<input type="text" name="titulo" maxlength="160" required value="${esc(v.titulo || "")}" placeholder="Ex.: Analista de RH Pleno"></label>
      <label class="campo">Empresa (como aparece para o candidato)<input type="text" name="organizacao" maxlength="160" value="${esc(v.organizacao ?? (ctx.cfg.empresa_nome || ctx.perfil?.organizacao || ""))}" placeholder="Ou deixe “Confidencial”"></label>
      ${sel("area", "Área", AREAS, v.area)}
      <label class="campo">Cidade<input type="text" name="cidade" value="${esc(v.cidade || "")}" placeholder="Ex.: Campinas"></label>
      ${sel("uf", "UF", UFS, v.uf, "--")}
      ${sel("modalidade", "Modalidade", MODALIDADES, v.modalidade)}
      ${sel("regime", "Regime de contratação", REGIMES, v.regime)}
      ${sel("senioridade", "Nível", SENIORIDADES, v.senioridade)}
      <label class="campo">E-mail para receber avisos<input type="email" name="email_contato" value="${esc(v.email_contato || ctx.usuario.email)}"></label>
      <label class="campo">Salário de (R$)<input type="number" name="salario_min" min="0" step="50" value="${v.salario_min ?? ""}"></label>
      <label class="campo">até (R$)<input type="number" name="salario_max" min="0" step="50" value="${v.salario_max ?? ""}"></label>
      <label class="checks full"><input type="checkbox" name="mostrar_salario" ${v.mostrar_salario === false ? "" : "checked"}>Mostrar o salário no anúncio</label>
      <label class="campo full">Descrição da vaga *<textarea name="descricao" maxlength="20000" style="min-height:140px" placeholder="Atividades, rotina, equipe, horário…">${esc(v.descricao || "")}</textarea></label>
      <label class="campo full">Requisitos<textarea name="requisitos" maxlength="8000" placeholder="Formação, experiência, ferramentas, idiomas… (um por linha)">${esc(v.requisitos || "")}</textarea></label>
      <label class="campo full">Benefícios<textarea name="beneficios" maxlength="4000" style="min-height:70px" placeholder="VR, VT, plano de saúde…">${esc(v.beneficios || "")}</textarea></label>
      <label class="campo">Anúncio válido até (opcional)<input type="date" name="expira_em" value="${esc(v.expira_em || "")}"></label>
    </form>
    <div class="rodape"><button class="btn neutro" data-fechar>Cancelar</button><button class="btn" id="vSalvar">${nova ? "Publicar vaga" : "Salvar alterações"}</button></div>`, true);
  $("#vSalvar").onclick = async () => {
    const f = $("#fVaga"); const g = (n) => f.elements[n].value.trim();
    const num = (n) => (g(n) === "" ? null : Math.max(0, Number(g(n))));
    const dados = {
      titulo: g("titulo"), organizacao: g("organizacao"), area: g("area"), cidade: g("cidade"), uf: g("uf"), modalidade: g("modalidade"),
      regime: g("regime"), senioridade: g("senioridade"), email_contato: g("email_contato"), salario_min: num("salario_min"), salario_max: num("salario_max"),
      mostrar_salario: f.elements.mostrar_salario.checked, descricao: g("descricao"), requisitos: g("requisitos"), beneficios: g("beneficios"),
      expira_em: g("expira_em") || null,
    };
    if (dados.titulo.length < 3 || !dados.descricao) return toast("Preencha o título e a descrição da vaga.");
    if (dados.salario_min && dados.salario_max && dados.salario_min > dados.salario_max) return toast("O salário inicial está maior que o final.");
    try {
      if (nova) await q(sb.from("vagas_publicadas").insert({ ...dados, owner: ctx.usuario.id, status: "aberta" }));
      else await q(sb.from("vagas_publicadas").update(dados).eq("id", v.id));
      $("#modal").close(); toast(nova ? "Vaga publicada! Ela já aparece nas buscas dos candidatos." : "Vaga atualizada."); aoSalvar?.();
    } catch (e) { falha(e); }
  };
}

/* ============================================================= CANDIDATURAS DE UMA VAGA (empresa) */
async function pgCandidaturasDaVaga(vaga) {
  main.innerHTML = topo(`Candidaturas · ${esc(vaga.titulo)}`, esc([vaga.organizacao, localVaga(vaga)].filter(Boolean).join(" · ")),
    `<button class="btn neutro" id="cvVoltar">← Minhas vagas</button>`) + `
    <div class="funil" id="cfFunil"></div>
    <div class="split"><div class="card"><div class="tabela-wrap" style="max-height:calc(100vh - 290px);min-height:260px"><table>
      <thead><tr><th class="c">SCORE</th><th>CANDIDATO</th><th>CARGO / CIDADE</th><th>ETAPA</th><th class="c">RECEBIDA</th></tr></thead><tbody id="tbCands"></tbody></table></div></div>
      <div class="card detalhe" id="detCand"></div></div>`;
  $("#cvVoltar").onclick = () => pgVagas();
  let lista = [], sel = null, filtro = "";
  const carregar = async () => {
    lista = await q(sb.from("candidaturas").select("id, perfil, curriculo, curriculo_modelo, mensagem, score, detalhes, status, motivo, criado_em, atualizado_em").eq("vaga_id", vaga.id).order("score", { ascending: false }));
    const cont = {}; lista.forEach((c) => { cont[c.status] = (cont[c.status] || 0) + 1; });
    $("#cfFunil").innerHTML = [["", "Todas", lista.length], ...Object.keys(ETAPAS).map((s) => [s, ETAPAS[s][0], cont[s] || 0])].map(([v, r, n]) =>
      `<button data-v="${v}" class="${filtro === v ? "on" : ""}"><b>${n}</b><small>${esc(r)}</small></button>`).join("");
    render();
  };
  const render = () => {
    const vs = lista.filter((c) => !filtro || c.status === filtro);
    $("#tbCands").innerHTML = vs.map((c) => `<tr data-id="${c.id}" class="${c.id === sel ? "sel" : ""}">
      <td class="c"><span class="score f-${classificar(c.score || 0).toLowerCase()}">${Math.round(c.score || 0)}</span></td>
      <td class="trunc"><b>${esc(c.perfil?.nome || "Candidato")}</b></td><td class="trunc">${esc([c.perfil?.cargo_desejado, c.perfil?.cidade].filter(Boolean).join(" · "))}</td>
      <td>${etapaChip(c.status)}</td><td class="c muted">${dataHora(c.criado_em)}</td></tr>`).join("")
      || `<tr><td colspan="5" class="vazio">Nenhuma candidatura ${filtro ? "nesta etapa" : "ainda. Compartilhe o link da vaga para atrair candidatos"}.</td></tr>`;
    if (!vs.some((c) => c.id === sel)) sel = vs[0]?.id ?? null;
    $$("#tbCands tr").forEach((tr) => tr.classList.toggle("sel", +tr.dataset.id === sel));
    detalhe();
  };
  const detalhe = () => {
    const c = lista.find((x) => x.id === sel), el = $("#detCand");
    if (!c) { el.innerHTML = `<div class="vazio"><div class="ico">👤</div><b>Selecione uma candidatura</b></div>`; return; }
    const p = c.perfil || {}, d = c.detalhes || {}, faixa = classificar(c.score || 0);
    const tel = String(p.telefone || "").replace(/\D/g, "");
    el.innerHTML = `<div class="det">
      <div class="det-topo"><div class="bola f-${faixa.toLowerCase()}"><b>${Math.round(c.score || 0)}</b><small>${faixa}</small></div>
        <div><h2>${esc(p.nome || "Candidato")}</h2><p>${esc([p.cargo_desejado, p.senioridade].filter(Boolean).join(" · "))}</p></div></div>
      <div>${[p.cidade && `${p.cidade}/${p.uf || ""}`, p.modalidades && p.modalidades.replace(/,/g, ", "), p.pretensao_salarial ? "Pretensão " + brl(p.pretensao_salarial) : "", p.aceita_mudanca ? "Aceita mudança" : ""].filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
      <div class="acoes" style="margin:10px 0">${p.email ? `<a class="btn neutro peq" href="mailto:${esc(p.email)}" style="text-decoration:none">✉ ${esc(p.email)}</a>` : ""}${tel ? `<a class="btn neutro peq" href="https://wa.me/${tel.length <= 11 ? "55" + tel : tel}" target="_blank" rel="noopener" style="text-decoration:none">WhatsApp</a>` : ""}</div>
      ${d.skills_ok?.length ? `<h4>Competências que batem com a vaga</h4>${d.skills_ok.map((s) => `<span class="chip ok">${esc(s)}</span>`).join("")}` : ""}
      ${d.skills_faltam?.length ? `<h4>Pedidas na vaga e ausentes no perfil</h4>${d.skills_faltam.map((s) => `<span class="chip gap">${esc(s)}</span>`).join("")}` : ""}
      ${c.mensagem ? `<h4>Mensagem do candidato</h4><div class="desc">${esc(c.mensagem)}</div>` : ""}
      <button class="btn sec" id="cdCv" style="width:100%;margin-top:12px" ${c.curriculo ? "" : "disabled"}>📄 ${c.curriculo ? "Ver currículo enviado" : "Sem currículo anexado"}</button>
      <h4>Etapa</h4><div class="grid-etapa"><select id="cdEtapa">${Object.keys(ETAPAS).filter((s) => s !== "desistiu").map((s) => `<option value="${s}" ${s === c.status ? "selected" : ""}>${ETAPAS[s][0]}</option>`).join("")}</select></div>
      ${c.status === "desistiu" ? `<p class="muted" style="font-size:13px">O candidato desistiu desta vaga.</p>` : ""}
      <label class="campo" style="margin-top:8px">Mensagem ao candidato junto com a mudança (opcional)<textarea id="cdMotivo" style="min-height:70px" placeholder="Ex.: convite para entrevista dia 12, às 14h">${esc(c.motivo || "")}</textarea></label>
      <button class="btn" id="cdSalvar" style="width:100%;margin-top:8px" ${c.status === "desistiu" ? "disabled" : ""}>Salvar etapa e avisar o candidato</button>
      <h4>Conversa</h4><div id="cdConversa"></div></div>`;
    $("#cdCv").onclick = () => c.curriculo && mostrarCurriculo({ conteudo: c.curriculo, modelo: c.curriculo_modelo, tipo: "adaptado", vaga_titulo: vaga.titulo, vaga_empresa: p.nome });
    $("#cdSalvar").onclick = async () => {
      const st = $("#cdEtapa").value;
      try { await q(sb.rpc("mudar_status_candidatura", { p_id: c.id, p_status: st, p_motivo: $("#cdMotivo").value.trim() }));
        toast("Etapa atualizada. O candidato será avisado."); notificar("status", c.id); await carregar(); } catch (e) { falha(e); }
    };
    conversa($("#cdConversa"), c).catch(falha);
  };
  $("#cfFunil").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; filtro = b.dataset.v; $$("#cfFunil button").forEach((x) => x.classList.toggle("on", x === b)); render(); };
  $("#tbCands").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) { sel = +tr.dataset.id; render(); abrirSheet($("#detCand"), "Candidatura"); } };
  await carregar();
}

/* ============================================================= MINHAS CANDIDATURAS (candidato) */
export const abasCandidato = (ativa) => `<div class="seg abas" style="margin-bottom:14px"><a href="#/candidaturas" class="${ativa === "c" ? "on" : ""}">Pela plataforma</a><a href="#/pipeline" class="${ativa === "p" ? "on" : ""}">Vagas que acompanho</a></div>`;

export async function pgCandidaturas() {
  main.innerHTML = topo("Candidaturas", "Acompanhe cada candidatura e converse com as empresas") + abasCandidato("c") + `
    <div class="split"><div class="card"><div class="tabela-wrap" style="max-height:calc(100vh - 290px);min-height:260px"><table>
      <thead><tr><th>VAGA</th><th>EMPRESA</th><th>ETAPA</th><th class="c">ATUALIZADA</th></tr></thead><tbody id="tbMinhas"></tbody></table></div></div>
      <div class="card detalhe" id="detMinha"></div></div>`;
  let lista = [], sel = null;
  const carregar = async () => {
    lista = await q(sb.from("candidaturas").select("id, vaga_id, status, motivo, mensagem, curriculo, curriculo_modelo, score, criado_em, atualizado_em, vagas_publicadas(id, titulo, organizacao, cidade, uf, modalidade, regime, status)")
      .eq("candidato", ctx.usuario.id).order("atualizado_em", { ascending: false }));
    render();
  };
  const render = () => {
    $("#tbMinhas").innerHTML = lista.map((c) => { const v = c.vagas_publicadas || {}; return `<tr data-id="${c.id}" class="${c.id === sel ? "sel" : ""}">
      <td class="trunc"><b>${esc(v.titulo || "Vaga removida")}</b></td><td class="trunc">${esc(v.organizacao || "—")}</td><td>${etapaChip(c.status)}</td><td class="c muted">${dataHora(c.atualizado_em)}</td></tr>`; }).join("")
      || `<tr><td colspan="4" class="vazio">Você ainda não se candidatou pela plataforma. Em “Buscar vagas”, as vagas com o selo <b>RH+ Match</b> aceitam candidatura direta.</td></tr>`;
    if (!lista.some((c) => c.id === sel)) sel = lista[0]?.id ?? null;
    $$("#tbMinhas tr").forEach((tr) => tr.classList.toggle("sel", +tr.dataset.id === sel));
    detalhe();
  };
  const detalhe = () => {
    const c = lista.find((x) => x.id === sel), el = $("#detMinha");
    if (!c) { el.innerHTML = `<div class="vazio"><div class="ico">📨</div><b>Suas candidaturas aparecem aqui</b></div>`; return; }
    const v = c.vagas_publicadas || {};
    const idx = ORDEM_ETAPAS.indexOf(c.status);
    el.innerHTML = `<div class="det">
      <div class="det-topo"><div><h2>${esc(v.titulo || "Vaga")}</h2><p>${esc([v.organizacao, localVaga(v), v.modalidade, v.regime].filter(Boolean).join(" · "))}</p></div></div>
      ${v.status && v.status !== "aberta" ? `<p class="chip">Vaga ${esc(v.status)}</p>` : ""}
      <h4>Andamento</h4>
      ${["reprovada", "desistiu"].includes(c.status) ? `<p>${etapaChip(c.status)}</p>` : `<ol class="linha-tempo">${ORDEM_ETAPAS.map((s, i) => `<li class="${i <= idx ? "feito" : ""}">${ETAPAS[s][0]}</li>`).join("")}</ol>`}
      ${c.motivo ? `<h4>Mensagem da empresa</h4><div class="desc">${esc(c.motivo)}</div>` : ""}
      <div class="acoes" style="margin-top:12px"><a class="btn neutro peq" href="#/vaga/${c.vaga_id}" style="text-decoration:none">Ver vaga</a>
        ${c.curriculo ? `<button class="btn neutro peq" id="mcCv">Currículo enviado</button>` : ""}
        ${["reprovada", "desistiu", "contratada"].includes(c.status) ? "" : `<button class="btn perigo peq" id="mcDesistir">Desistir</button>`}</div>
      <h4>Conversa com a empresa</h4><div id="mcConversa"></div></div>`;
    $("#mcCv")?.addEventListener("click", () => mostrarCurriculo({ conteudo: c.curriculo, modelo: c.curriculo_modelo, tipo: "adaptado", vaga_titulo: v.titulo, vaga_empresa: v.organizacao }));
    $("#mcDesistir")?.addEventListener("click", async () => {
      if (!confirm("Desistir desta candidatura? A empresa será informada.")) return;
      try { await q(sb.rpc("mudar_status_candidatura", { p_id: c.id, p_status: "desistiu", p_motivo: "" })); toast("Candidatura retirada."); await carregar(); } catch (e) { falha(e); }
    });
    conversa($("#mcConversa"), c).catch(falha);
  };
  $("#tbMinhas").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) { sel = +tr.dataset.id; render(); abrirSheet($("#detMinha"), "Candidatura"); } };
  await carregar();
}

/* ============================================================= PÁGINA DA VAGA (abre também sem login) */
export async function pgVagaPublica(id, { logado, meuPerfil, irLogin } = {}) {
  const v = await q(sb.from("vagas_publicadas").select(COLS_VP).eq("id", id).maybeSingle());
  if (!v) { main.innerHTML = `<div class="card vazio" style="max-width:640px;margin:40px auto"><div class="ico">🔎</div><b>Vaga não encontrada ou encerrada</b><br><a href="../">Conheça o RH+ Match</a></div>`; return; }
  const vb = vagaPublicadaParaBusca(v);
  const sal = salarioTexto(v);
  let blocoAcao = "";
  if (!logado) blocoAcao = `<button class="btn" id="vpEntrar" style="width:100%">Candidatar-se</button><p class="muted" style="font-size:13px;text-align:center;margin:8px 0 0">Entre ou crie sua conta grátis para se candidatar.</p>`;
  else if (v.owner === ctx.usuario.id) blocoAcao = `<a class="btn" href="#/vagas" style="width:100%;text-decoration:none">Ver candidaturas desta vaga</a>`;
  else if (!ehAdmin()) blocoAcao = `<button class="btn" id="vpCandidatar" style="width:100%">Candidatar-se</button><button class="btn ia" id="vpAdaptar" style="width:100%;margin-top:8px">✨ Adaptar meu currículo para esta vaga</button>`;
  main.innerHTML = `<div class="vaga-publica">
    ${logado ? "" : `<div class="vp-topo"><a href="../" class="marca-mini"><img src="../icons/icon-192.png" alt="" width="28" height="28">RH+ Match</a><a href="#/" id="vpLogin">Entrar</a></div>`}
    <div class="card">
      <span class="chip prim">Vaga publicada no RH+ Match</span>${v.status !== "aberta" ? ` <span class="chip">Vaga ${esc(v.status)}</span>` : ""}
      <h1 style="margin:10px 0 4px;font-size:28px">${esc(v.titulo)}</h1>
      <p class="muted" style="margin:0 0 10px;font-size:16px">${esc(v.organizacao || "Empresa confidencial")}</p>
      <div>${[localVaga(v), v.modalidade, v.regime, v.senioridade, v.area, sal].filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
      <div id="vpScore"></div>
      <h3 style="margin-top:18px">Sobre a vaga</h3><div class="desc">${esc(v.descricao)}</div>
      ${v.requisitos ? `<h3 style="margin-top:16px">Requisitos</h3><div class="desc">${esc(v.requisitos)}</div>` : ""}
      ${v.beneficios ? `<h3 style="margin-top:16px">Benefícios</h3><div class="desc">${esc(v.beneficios)}</div>` : ""}
      <p class="muted" style="font-size:12px;margin-top:14px">Publicada em ${new Date(v.criado_em).toLocaleDateString("pt-BR")}${v.expira_em ? ` · inscrições até ${new Date(v.expira_em + "T12:00").toLocaleDateString("pt-BR")}` : ""}</p>
      ${v.status === "aberta" ? `<div style="margin-top:16px">${blocoAcao}</div>` : ""}
      <div class="acoes" style="margin-top:14px;justify-content:center"><button class="btn neutro peq" id="vpCompartilhar">Compartilhar vaga</button></div>
    </div></div>`;
  document.title = `${v.titulo} · ${v.organizacao || "RH+ Match"}`;
  $("#vpCompartilhar").onclick = async () => {
    const url = linkPublico(v.id), texto = `Vaga: ${v.titulo}${v.organizacao ? " — " + v.organizacao : ""}`;
    if (navigator.share) { try { await navigator.share({ title: texto, url }); } catch { /* cancelado */ } return; }
    modal(`<h3 style="margin:0 0 10px">Compartilhar vaga</h3><div class="links">
      <a href="https://wa.me/?text=${encodeURIComponent(texto + " " + url)}" target="_blank" rel="noopener">WhatsApp ↗</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener">LinkedIn ↗</a>
      <a href="mailto:?subject=${encodeURIComponent(texto)}&body=${encodeURIComponent(url)}">E-mail</a></div>
      <input type="text" value="${esc(url)}" readonly onclick="this.select()"><div class="rodape"><span></span><button class="btn" data-fechar>Fechar</button></div>`);
  };
  if (!logado) {
    const ir = () => { try { sessionStorage.setItem("rh_destino", `#/vaga/${v.id}`); } catch { /* ok */ } irLogin?.(); };
    $("#vpEntrar")?.addEventListener("click", ir); $("#vpLogin")?.addEventListener("click", (e) => { e.preventDefault(); ir(); });
    return;
  }
  if (!ehAdmin()) {
    const eu = await meuPerfil?.();
    if (eu) {
      const s = avaliar(eu, vb); const faixa = classificar(s.score);
      $("#vpScore").innerHTML = `<div class="vp-score"><span class="score f-${faixa.toLowerCase()}">${Math.round(s.score)}</span><span>Compatibilidade <b>${faixa.toLowerCase()}</b> com o seu perfil</span></div>`;
    }
    const ja = await minhaCandidatura(v.id);
    if (ja) { const b = $("#vpCandidatar"); if (b) { b.disabled = true; b.textContent = `Você já se candidatou · ${ETAPAS[ja.status]?.[0] || ja.status}`; } }
    $("#vpCandidatar")?.addEventListener("click", () => candidatar(vb, eu));
    $("#vpAdaptar")?.addEventListener("click", () => abrirAdaptador(vb, eu));
  }
}
