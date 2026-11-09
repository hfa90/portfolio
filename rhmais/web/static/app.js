/* RH+ Match — interface web (SPA sem dependências). */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const main = $("#conteudo");
const ROTULO_PARCIAL = { cargo: "Cargo", skills: "Competências", modalidade: "Modalidade", local: "Localização", senioridade: "Senioridade" };

let META = null;
const estado = {
  candidatoBusca: null,      // id do candidato selecionado na busca
  busca: null,               // último status de busca retornado pela API
  filtros: { mod: "Todas", score: 40, texto: "" },
  vagaSel: null,             // idx da vaga selecionada
  pipeCand: "", pipeStatus: "", pipeSel: null,
  candSel: null,
};

/* ------------------------------------------------------------- utilidades */
async function api(url, opts = {}) {
  const o = { ...opts, headers: { ...(opts.headers || {}) } };
  if (o.body && !(o.body instanceof FormData)) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(o.body); }
  const r = await fetch(url, o);
  if (!r.ok) {
    let msg = `Erro ${r.status}`;
    try { const j = await r.json(); msg = j.erro || j.detail?.[0]?.msg || msg; } catch { /* sem json */ }
    throw new Error(msg);
  }
  const tipo = r.headers.get("content-type") || "";
  if (tipo.includes("application/json")) return r.json();
  return r;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3200);
}
const falha = (e) => toast("⚠ " + (e.message || e));

async function baixar(resp) {
  const blob = await resp.blob();
  const cd = resp.headers.get("content-disposition") || "";
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = m ? decodeURIComponent(m[1]) : "exportacao.xlsx";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function modal(html) { $("#modalCorpo").innerHTML = html; $("#modal").showModal(); }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-fechar]")) $("#modal").close(); });

function barras(itens, cor, vazio) {
  if (!itens.length) return `<div class="vazio">${esc(vazio)}</div>`;
  const max = Math.max(...itens.map((i) => i[1]), 1);
  return `<div class="barras">${itens.map(([n, v]) => `
    <div class="barra"><span class="trunc" title="${esc(n)}">${esc(n)}</span>
      <div class="trilho"><div style="width:${(v / max) * 100}%;background:${cor}"></div></div><b>${v}</b></div>`).join("")}</div>`;
}
const corParcial = (v) => (v >= 70 ? "var(--verde)" : v >= 40 ? "var(--lar)" : "var(--verm)");
const scoreTag = (s, faixa) => `<span class="score f-${esc((faixa || "").toLowerCase())}">${Math.round(s || 0)}</span>`;
const dataCurta = (iso) => (iso ? iso.slice(0, 10).split("-").slice(1).reverse().join("/") : "—");
const topo = (titulo, sub, acoes = "") => `<div class="topo"><div><h1>${titulo}</h1><p>${sub}</p></div><div class="acoes">${acoes}</div></div>`;

/* ------------------------------------------------------------- tema */
function aplicarTema(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("rh_tema", t); } catch { /* ok */ } }
(() => {
  let t = null; try { t = localStorage.getItem("rh_tema"); } catch { /* ok */ }
  aplicarTema(t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
})();
$("#btnTema").onclick = () => aplicarTema(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

/* ------------------------------------------------------------- roteador */
const PAGINAS = { painel: pgPainel, candidatos: pgCandidatos, busca: pgBusca, pipeline: pgPipeline, config: pgConfig };
async function rotear() {
  const [, nome = "painel", arg] = location.hash.split("/");
  const pg = PAGINAS[nome] ? nome : "painel";
  $$("nav a").forEach((a) => a.classList.toggle("ativo", a.dataset.page === pg));
  try { await PAGINAS[pg](arg); } catch (e) { main.innerHTML = `<div class="card vazio">⚠ ${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", rotear);

/* ============================================================= PAINEL */
async function pgPainel() {
  const d = await api("/api/painel");
  const kpi = (rot, val, sub, ico, cor) => `<div class="card kpi"><i style="background:${cor}22;color:${cor}">${ico}</i>
    <small>${rot}</small><b>${val}</b><span>${sub}</span></div>`;
  main.innerHTML = topo(`Olá, ${esc(META.empresa || "equipe")} 👋`, "Visão geral da operação de recrutamento") + `
    <div class="kpis">
      ${kpi("CANDIDATOS", d.candidatos, "perfis cadastrados", "●", "var(--prim)")}
      ${kpi("VAGAS MAPEADAS", d.vagas, "vagas salvas no banco", "◆", "var(--verde)")}
      ${kpi("NO PIPELINE", d.pipeline_ativo, "oportunidades em andamento", "▲", "var(--lar)")}
      ${kpi("CONTRATAÇÕES", d.contratados, `${d.entrevistas} em entrevista`, "★", "var(--verde)")}
    </div>
    <div class="grid2">
      <div class="card"><h3>Funil do pipeline</h3>${barras(d.funil, "var(--prim)", "Adicione vagas ao pipeline a partir da busca")}</div>
      <div class="card"><h3>Vagas coletadas por canal</h3>${barras(d.por_fonte, "var(--verde)", "Faça a primeira busca para popular este gráfico")}</div>
      <div class="card"><h3>Competências mais pedidas pelo mercado</h3>${barras(d.skills, "var(--lar)", "Disponível após as primeiras buscas")}</div>
      <div class="card"><div class="topo" style="margin:0 0 6px;align-items:center"><h3 style="margin:0">Últimas buscas</h3>
        <a class="btn sec peq" href="#/busca" style="text-decoration:none">Nova busca</a></div>
        ${d.buscas.length ? d.buscas.map((b) => `<div class="linha-busca"><div class="trunc"><b>${esc(b.nome || "Busca livre")}</b>
          <span class="muted"> ${esc(b.termos)}</span></div><div style="white-space:nowrap"><span class="muted">${esc((b.criada_em || "").slice(5))}</span>
          <span class="chip ok">${b.compativeis} compatíveis</span></div></div>`).join("")
          : `<div class="vazio">Nenhuma busca ainda. Cadastre um candidato e clique em “Buscar vagas”.</div>`}
      </div>
    </div>`;
}

/* ============================================================= CANDIDATOS */
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
    const lista = await api("/api/candidatos?q=" + encodeURIComponent($("#qCand").value.trim()));
    $("#listaCand").innerHTML = lista.length ? lista.map((c) => `<tr data-id="${c.id}" class="${c.id === estado.candSel ? "sel" : ""}">
      <td class="trunc"><b>${esc(c.nome)}</b></td><td class="trunc">${esc(c.cargo_desejado)}</td>
      <td class="trunc muted">${esc([c.cidade, c.uf].filter(Boolean).join(" / ") || "—")}</td></tr>`).join("")
      : `<tr><td colspan="3" class="vazio">Nenhum candidato cadastrado.</td></tr>`;
  };
  let tq; $("#qCand").oninput = () => { clearTimeout(tq); tq = setTimeout(carregar, 200); };
  $("#listaCand").onclick = async (e) => {
    const tr = e.target.closest("tr[data-id]"); if (!tr) return;
    estado.candSel = +tr.dataset.id;
    $$("#listaCand tr").forEach((x) => x.classList.toggle("sel", x === tr));
    formCandidato(await api("/api/candidatos/" + tr.dataset.id), carregar);
  };
  $("#listaCand").ondblclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) irBusca(+tr.dataset.id); };
  $("#btnNovo").onclick = () => { estado.candSel = null; $$("#listaCand tr").forEach((x) => x.classList.remove("sel")); formCandidato({}, carregar); };
  $("#btnImportar").onclick = () => $("#arqCv").click();
  $("#arqCv").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const fd = new FormData(); fd.append("arq", f);
    try {
      toast("Lendo currículo…");
      const dados = await api("/api/curriculo", { method: "POST", body: fd });
      estado.candSel = null;
      formCandidato({ modalidades: "Presencial,Híbrido,Remoto", ...dados }, carregar, true);
      toast("Currículo lido. Revise os campos e salve.");
    } catch (err) { falha(err); }
  };
  await carregar();
  const atual = estado.candSel ? await api("/api/candidatos/" + estado.candSel).catch(() => ({})) : {};
  formCandidato(atual, carregar);
}

function formCandidato(c, recarregar, importado = false) {
  const mods = (c.modalidades ?? "Presencial,Híbrido,Remoto").split(",").map((s) => s.trim());
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
      ${sel("senioridade", "Senioridade", META.senioridades, "Não definido")}
      ${campo("pretensao_salarial", "Pretensão salarial (R$)", "Ex.: 5500")}
      ${campo("cidade", "Cidade", "Ex.: São Paulo")}
      ${sel("uf", "UF", META.ufs, "--")}
      <div class="campo full"><span style="font-size:12px;font-weight:600;color:var(--texto2)">Modalidades aceitas</span>
        <div class="checks">${META.modalidades.map((m) => `<label><input type="checkbox" name="mod" value="${m}" ${mods.includes(m) ? "checked" : ""}>${m}</label>`).join("")}
          <label style="margin-left:10px"><span class="switch"><input type="checkbox" name="aceita_mudanca" ${c.aceita_mudanca ? "checked" : ""}><span></span></span>Aceita mudança de cidade</label></div></div>
      <label class="campo full">Resumo profissional / observações do recrutador<textarea name="resumo">${esc(c.resumo || "")}</textarea></label>
    </form>
    <div class="rodape" style="margin-top:16px">
      ${novo ? "<span></span>" : `<button class="btn perigo" id="btnExcluir">Excluir</button>`}
      <button class="btn" id="btnSalvar">Salvar</button></div>`;
  if (c.pretensao_salarial === 0) $("#fCand [name=pretensao_salarial]").value = "";

  $("#btnSalvar").onclick = async () => {
    const f = $("#fCand"); const g = (n) => f.elements[n].value.trim();
    let pret = g("pretensao_salarial").replace(/R\$|\s/g, "");
    pret = pret.includes(",") ? pret.replace(/\./g, "").replace(",", ".") : pret;
    const dados = {
      nome: g("nome"), email: g("email"), telefone: g("telefone"), cargo_desejado: g("cargo_desejado"),
      cargos_alternativos: g("cargos_alternativos"), skills: g("skills"), senioridade: g("senioridade"),
      cidade: g("cidade"), uf: g("uf"), resumo: f.elements.resumo.value.trim(),
      pretensao_salarial: parseFloat(pret) || 0, aceita_mudanca: f.elements.aceita_mudanca.checked ? 1 : 0,
      modalidades: $$("input[name=mod]:checked", f).map((x) => x.value).join(","),
    };
    if (!dados.nome || !dados.cargo_desejado) return toast("Informe pelo menos o nome e o cargo desejado.");
    try {
      const r = await api(novo ? "/api/candidatos" : "/api/candidatos/" + c.id, { method: novo ? "POST" : "PUT", body: dados });
      estado.candSel = r.id; toast("Candidato salvo.");
      await recarregar(); formCandidato(await api("/api/candidatos/" + r.id), recarregar);
    } catch (e) { falha(e); }
  };
  if (!novo) {
    $("#btnExcluir").onclick = async () => {
      if (!confirm(`Excluir ${c.nome}? O pipeline desse candidato também será removido.`)) return;
      try { await api("/api/candidatos/" + c.id, { method: "DELETE" }); estado.candSel = null; toast("Candidato excluído."); await recarregar(); formCandidato({}, recarregar); }
      catch (e) { falha(e); }
    };
    $("#btnBuscarPerfil").onclick = () => irBusca(c.id);
  }
}

function irBusca(cid) { estado.candidatoBusca = cid; location.hash = "#/busca"; }

/* ============================================================= BUSCA */
let pollTimer = null;
async function pgBusca() {
  const cands = await api("/api/candidatos");
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
        ${META.fontes.map((f) => `<label class="${f.disponivel ? "" : "off"}" title="${esc(f.descricao)}"><input type="checkbox" value="${f.id}" ${f.ativa && f.disponivel ? "checked" : ""} ${f.disponivel ? "" : "disabled"}>${esc(f.nome)}${f.disponivel ? "" : " (sem chave)"}</label>`).join("")}
        <button class="btn neutro peq" id="btnPortais" style="margin-left:auto">Mais portais ↗</button></div>
      <div id="statusFontes" class="canais" style="margin-top:8px"></div>
      <div class="progresso" id="prog" hidden><div style="width:3%"></div></div>
    </div>
    <div class="split">
      <div class="card">
        <div class="filtros">
          <div class="seg" id="fMod">${["Todas", ...META.modalidades].map((m) => `<button data-v="${m}" class="${estado.filtros.mod === m ? "on" : ""}">${m}</button>`).join("")}</div>
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

  const preencherTermos = async () => {
    const id = +$("#selCand").value;
    if (!id) { $("#termos").value = ""; return; }
    if (estado.busca && estado.busca.candidato_id === id) { $("#termos").value = estado.busca.termos.join(", "); return; }
    const c = await api("/api/candidatos/" + id); $("#termos").value = c.termos_sugeridos.join(", ");
  };
  $("#selCand").onchange = () => { estado.candidatoBusca = +$("#selCand").value || null; preencherTermos(); };
  await preencherTermos();
  $("#termos").onkeydown = (e) => { if (e.key === "Enter") $("#btnBuscar").click(); };
  $("#btnBuscar").onclick = iniciarBusca;
  $("#btnPortais").onclick = abrirPortais;
  $("#fMod").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; estado.filtros.mod = b.dataset.v; $$("#fMod button").forEach((x) => x.classList.toggle("on", x === b)); renderVagas(); };
  $("#fScore").oninput = (e) => { estado.filtros.score = +e.target.value; $("#lblScore").textContent = e.target.value; renderVagas(); };
  $("#fTexto").oninput = (e) => { estado.filtros.texto = e.target.value; renderVagas(); };
  $("#tbVagas").onclick = (e) => { const tr = e.target.closest("tr[data-idx]"); if (tr) { estado.vagaSel = +tr.dataset.idx; marcarSel(); detalharVaga(); } };
  $("#tbVagas").ondblclick = (e) => { const tr = e.target.closest("tr[data-idx]"); if (tr) window.open(vagaPorIdx(+tr.dataset.idx).url, "_blank", "noopener"); };
  $("#btnExcel").onclick = () => exportar("excel");
  $("#btnRelatorio").onclick = () => exportar("relatorio");
  renderStatus(); renderVagas();
  if (buscando) acompanhar();
}

const vagasVisiveis = () => {
  const vs = estado.busca?.vagas || []; const f = estado.filtros; const t = f.texto.trim().toLowerCase();
  return vs.filter((v) => v.score >= f.score && (f.mod === "Todas" || v.modalidade === f.mod)
    && (!t || `${v.titulo} ${v.empresa} ${v.local} ${v.fonte}`.toLowerCase().includes(t)));
};
const vagaPorIdx = (i) => (estado.busca?.vagas || []).find((v) => v.idx === i);

function renderVagas() {
  if (!$("#tbVagas")) return;
  const vs = vagasVisiveis();
  const b = estado.busca;
  $("#tbVagas").innerHTML = vs.map((v) => `<tr data-idx="${v.idx}">
    <td class="c">${scoreTag(v.score, v.faixa)}</td><td class="trunc" title="${esc(v.titulo)}"><b>${esc(v.titulo)}</b></td>
    <td class="trunc">${esc(v.empresa || "—")}</td><td class="trunc">${esc(v.local)}</td><td>${esc(v.modalidade || "—")}</td>
    <td class="muted">${esc(v.fonte)}</td><td class="c muted">${dataCurta(v.publicada_em)}</td></tr>`).join("")
    || `<tr><td colspan="7" class="vazio">${b?.vagas ? "Nenhuma vaga com esses filtros. Reduza o score mínimo." : (b?.estado === "buscando" ? "Buscando nos canais…" : "Os resultados aparecem aqui.")}</td></tr>`;
  if (b?.vagas) {
    const exc = vs.filter((v) => v.score >= 75).length;
    let txt = `${vs.length} vagas exibidas · ${exc} excelentes · ${b.vagas.length} analisadas no total`;
    const ne = Object.keys(b.erros || {}).length; if (ne) txt += ` · ${ne} canal(is) indisponível(is)`;
    $("#lblTotal").textContent = txt;
  }
  if (!vs.some((v) => v.idx === estado.vagaSel)) estado.vagaSel = vs[0]?.idx ?? null;
  marcarSel(); detalharVaga();
}
function marcarSel() { $$("#tbVagas tr").forEach((tr) => tr.classList.toggle("sel", +tr.dataset.idx === estado.vagaSel)); }

function detalharVaga() {
  const el = $("#detVaga"); if (!el) return;
  const v = estado.vagaSel != null ? vagaPorIdx(estado.vagaSel) : null;
  if (!v) { el.innerHTML = `<div class="vazio"><div class="ico">🎯</div><b>Selecione uma vaga</b><br>para ver por que ela combina com o candidato.</div>`; return; }
  const d = v.detalhes_score || {};
  const obs = [d.cargo, d.local, d.senioridade, d.salario, d.alerta].filter(Boolean).join(" · ");
  el.innerHTML = `<div class="det">
    <div class="det-topo"><div class="bola f-${v.faixa.toLowerCase()}"><b>${Math.round(v.score)}</b><small>${v.faixa}</small></div>
      <div><h2>${esc(v.titulo)}</h2><p>${esc(v.empresa || "Empresa não divulgada")}</p></div></div>
    <div>${[v.local, v.modalidade, v.senioridade, v.contrato, v.salario, v.fonte].filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
    <h4>Por que combina</h4>
    <div class="barras">${Object.entries(d.parciais || {}).map(([k, val]) => `<div class="barra"><span>${ROTULO_PARCIAL[k] || k}</span>
      <div class="trilho"><div style="width:${val}%;background:${corParcial(val)}"></div></div><b>${val}%</b></div>`).join("")}</div>
    <p class="muted" style="font-size:12px">${esc(obs)}</p>
    ${d.skills_ok?.length ? `<h4>Competências que o candidato tem</h4>${d.skills_ok.map((s) => `<span class="chip ok">${esc(s)}</span>`).join("")}` : ""}
    ${d.skills_faltam?.length ? `<h4>Pedidas na vaga e ausentes no perfil</h4>${d.skills_faltam.map((s) => `<span class="chip gap">${esc(s)}</span>`).join("")}` : ""}
    <h4>Descrição</h4><div class="desc">${esc(v.descricao || "Descrição completa no anúncio.")}</div>
    <div class="det-acoes"><a class="btn neutro" href="${esc(v.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir vaga ↗</a>
      <button class="btn" id="btnPipe">+ Adicionar ao pipeline</button></div></div>`;
  $("#btnPipe").onclick = async () => {
    try { const r = await api("/api/pipeline", { method: "POST", body: { busca_id: estado.busca.id, idx: v.idx } });
      toast(r.novo ? "Vaga adicionada ao pipeline." : "Essa vaga já está no pipeline do candidato."); } catch (e) { falha(e); }
  };
}

function renderStatus() {
  const el = $("#statusFontes"); if (!el) return;
  const b = estado.busca;
  if (!b) { el.innerHTML = ""; $("#prog").hidden = true; return; }
  const ent = Object.entries(b.progresso || {});
  el.innerHTML = ent.map(([nome, p]) => p.status === "ok" ? `<span class="chip ok">✓ ${esc(nome)} · ${p.qtd}</span>`
    : p.status === "erro" ? `<span class="chip erro" title="${esc(b.erros?.[nome] || "")}">✕ ${esc(nome)}</span>`
    : `<span class="chip prim">◌ ${esc(nome)}…</span>`).join("");
  const feitas = ent.filter(([, p]) => p.status === "ok" || p.status === "erro").length;
  $("#prog").hidden = b.estado !== "buscando";
  $("#prog div").style.width = Math.max(3, (feitas / Math.max(1, ent.length)) * 100) + "%";
}

async function iniciarBusca() {
  const btn = $("#btnBuscar");
  if (estado.busca?.estado === "buscando") {
    btn.disabled = true; btn.textContent = "Cancelando…";
    try { await api(`/api/buscas/${estado.busca.id}/cancelar`, { method: "POST" }); } catch (e) { falha(e); }
    return;
  }
  const cid = +$("#selCand").value;
  if (!cid) return toast("Cadastre e selecione um candidato para buscar vagas.");
  const fontes = $$(".canais input[type=checkbox]:checked").map((x) => x.value);
  const termos = $("#termos").value.split(",").map((t) => t.trim()).filter(Boolean);
  if (!fontes.length || !termos.length) return toast("Selecione ao menos um canal e informe um termo de busca.");
  try {
    const { id } = await api("/api/buscas", { method: "POST", body: { candidato_id: cid, fontes, termos } });
    estado.busca = { id, estado: "buscando", progresso: {}, termos, candidato_id: cid };
    estado.vagaSel = null;
    btn.textContent = "■ Cancelar";
    $("#lblTotal").textContent = `Buscando “${termos.join(", ")}” em ${fontes.length} canais…`;
    renderVagas(); acompanhar();
  } catch (e) { falha(e); }
}

function acompanhar() {
  clearTimeout(pollTimer);
  const passo = async () => {
    try {
      const b = await api("/api/buscas/" + estado.busca.id);
      estado.busca = b;
      renderStatus();
      if (b.estado === "buscando") { pollTimer = setTimeout(passo, 700); return; }
      const btn = $("#btnBuscar"); if (btn) { btn.disabled = false; btn.textContent = "🔎 Buscar vagas"; }
      if (b.estado === "erro") falha(new Error(b.erro || "Erro na busca"));
      else toast(`Busca concluída: ${b.vagas.length} vagas analisadas.`);
      renderVagas();
    } catch (e) {
      falha(e); estado.busca = null; const btn = $("#btnBuscar"); if (btn) { btn.disabled = false; btn.textContent = "🔎 Buscar vagas"; }
    }
  };
  passo();
}

async function exportar(tipo) {
  const vs = vagasVisiveis();
  if (!estado.busca?.vagas || !vs.length) return toast("Faça uma busca primeiro.");
  const corpo = { indices: vs.map((v) => v.idx) };
  try {
    if (tipo === "excel") { await baixar(await api(`/api/buscas/${estado.busca.id}/excel`, { method: "POST", body: corpo })); return; }
    const janela = window.open("", "_blank");
    const html = await (await api(`/api/buscas/${estado.busca.id}/relatorio`, { method: "POST", body: corpo })).text();
    if (janela) { janela.document.open(); janela.document.write(html); janela.document.close(); }
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = "relatorio.html"; a.click(); }
  } catch (e) { falha(e); }
}

async function abrirPortais() {
  const cid = +$("#selCand").value;
  const c = cid ? await api("/api/candidatos/" + cid) : null;
  const termo = ($("#termos").value.split(",")[0] || "").trim() || c?.cargo_desejado || "vagas";
  const remoto = c ? c.modalidades === "Remoto" : false;
  const qs = new URLSearchParams({ termo, cidade: c?.cidade || "", uf: c?.uf || "", remoto });
  const links = await api("/api/links?" + qs);
  modal(`<h3 style="margin:0 0 4px">Busca pronta em outros portais</h3>
    <p class="muted" style="margin:0">Termo: “${esc(termo)}”. Estes sites não oferecem integração pública; a pesquisa abre já filtrada em nova aba.</p>
    <div class="links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.nome)} ↗</a>`).join("")}</div>
    <div class="rodape"><button class="btn neutro" data-fechar>Fechar</button></div>`);
}

/* ============================================================= PIPELINE */
async function pgPipeline() {
  const cands = await api("/api/candidatos");
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
    itens = await api("/api/pipeline" + (estado.pipeCand ? "?candidato_id=" + estado.pipeCand : ""));
    const cont = {}; itens.forEach((i) => { cont[i.status] = (cont[i.status] || 0) + 1; });
    $("#funil").innerHTML = [["", "Todas", itens.length], ...META.status.map((s) => [s, s, cont[s] || 0])].map(([v, rot, n]) =>
      `<button data-v="${esc(v)}" class="${estado.pipeStatus === v ? "on" : ""}"><b>${n}</b><small>${esc(rot)}</small></button>`).join("");
    render();
  };
  const visiveis = () => itens.filter((i) => !estado.pipeStatus || i.status === estado.pipeStatus);
  const render = () => {
    const vs = visiveis();
    $("#tbPipe").innerHTML = vs.map((i) => `<tr data-id="${i.id}" class="${i.id === estado.pipeSel ? "sel" : ""}">
      <td class="trunc">${esc(i.candidato)}</td><td class="trunc" title="${esc(i.titulo)}"><b>${esc(i.titulo)}</b></td><td class="trunc">${esc(i.empresa || "—")}</td>
      <td class="c">${scoreTag(i.score, i.faixa)}</td><td><span class="chip ${i.status === "Contratado" ? "ok" : i.status === "Descartada" ? "" : "prim"}">${esc(i.status)}</span></td>
      <td class="c muted">${esc((i.atualizado_em || "").slice(0, 16).split(" ").map((p, k) => k ? p : p.split("-").slice(1).reverse().join("/")).join(" "))}</td></tr>`).join("")
      || `<tr><td colspan="6" class="vazio">Nenhuma vaga no pipeline. Adicione a partir da tela de busca.</td></tr>`;
    if (!vs.some((i) => i.id === estado.pipeSel)) estado.pipeSel = vs[0]?.id ?? null;
    $$("#tbPipe tr").forEach((tr) => tr.classList.toggle("sel", +tr.dataset.id === estado.pipeSel));
    detalhe();
  };
  const detalhe = () => {
    const it = itens.find((i) => i.id === estado.pipeSel);
    if (!it) { $("#detPipe").innerHTML = `<div class="vazio"><div class="ico">📋</div><b>Selecione uma oportunidade</b><br>para atualizar a etapa e as notas.</div>`; return; }
    let det = {}; try { det = JSON.parse(it.detalhes || "{}"); } catch { /* ok */ }
    const local = [it.cidade, it.uf].filter(Boolean).join(" / ") || (it.modalidade === "Remoto" ? "Remoto" : "");
    $("#detPipe").innerHTML = `<div class="det">
      <div class="det-topo"><div class="bola f-${it.faixa.toLowerCase()}"><b>${Math.round(it.score || 0)}</b><small>${it.faixa}</small></div>
        <div><h2>${esc(it.titulo)}</h2><p>${esc(it.empresa || "Empresa não divulgada")} · para <b>${esc(it.candidato)}</b></p></div></div>
      <div>${[local, it.modalidade, it.senioridade, it.contrato, it.salario, it.fonte].filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
      ${det.skills_ok?.length ? `<h4>Competências que batem</h4>${det.skills_ok.map((s) => `<span class="chip ok">${esc(s)}</span>`).join("")}` : ""}
      <h4>Etapa</h4><select id="pStatus">${META.status.map((s) => `<option ${s === it.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <h4>Notas do recrutador</h4><textarea id="pNotas" placeholder="Retorno da empresa, datas de entrevista, feedback…">${esc(it.notas || "")}</textarea>
      <div class="det-acoes"><button class="btn perigo" id="pRem">Remover</button>
        <div class="acoes"><a class="btn neutro" href="${esc(it.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir vaga ↗</a><button class="btn" id="pSalvar">Salvar</button></div></div></div>`;
    $("#pSalvar").onclick = async () => {
      try { await api("/api/pipeline/" + it.id, { method: "PATCH", body: { status: $("#pStatus").value, notas: $("#pNotas").value.trim() } });
        toast("Pipeline atualizado."); await carregar(); } catch (e) { falha(e); }
    };
    $("#pRem").onclick = async () => {
      if (!confirm("Remover esta vaga do pipeline?")) return;
      try { await api("/api/pipeline/" + it.id, { method: "DELETE" }); estado.pipeSel = null; toast("Removida do pipeline."); await carregar(); } catch (e) { falha(e); }
    };
  };
  $("#pCand").onchange = (e) => { estado.pipeCand = e.target.value; carregar(); };
  $("#funil").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; estado.pipeStatus = b.dataset.v; $$("#funil button").forEach((x) => x.classList.toggle("on", x === b)); render(); };
  $("#tbPipe").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) { estado.pipeSel = +tr.dataset.id; render(); } };
  $("#pExcel").onclick = async () => { try { await baixar(await api("/api/pipeline-excel" + (estado.pipeCand ? "?candidato_id=" + estado.pipeCand : ""))); } catch (e) { falha(e); } };
  await carregar();
}

/* ============================================================= CONFIG */
async function pgConfig() {
  const cfg = await api("/api/config");
  const chaves = [["adzuna_app_id", "Adzuna – App ID", "https://developer.adzuna.com/signup"], ["adzuna_app_key", "Adzuna – App Key", "https://developer.adzuna.com/signup"],
    ["jooble_key", "Jooble – API Key", "https://br.jooble.org/api/about"], ["github_token", "GitHub – token pessoal", "https://github.com/settings/tokens"]];
  const seg = (id, ops, val) => `<div class="seg" id="${id}">${ops.map((o) => `<button type="button" data-v="${o}" class="${String(val) === String(o) ? "on" : ""}">${o}</button>`).join("")}</div>`;
  main.innerHTML = topo("Canais & Configurações", "Escolha onde buscar e ajuste o sistema", `<button class="btn" id="cSalvar">Salvar configurações</button>`) + `
    <div class="card" style="margin-bottom:14px"><div class="topo" style="align-items:center;margin-bottom:10px"><h3 style="margin:0">Canais de vagas integrados</h3>
      <button class="btn sec peq" id="cTestar">Testar conexões</button></div>
      ${META.fontes.map((f) => `<div class="fonte-linha"><label class="switch"><input type="checkbox" data-fonte="${f.id}" ${cfg.fontes_ativas.includes(f.id) ? "checked" : ""}><span></span></label>
        <div class="txt"><b>${esc(f.nome)}</b><small>${esc(f.descricao)}</small></div>
        <span class="muted" id="st-${f.id}" style="font-size:12px;font-weight:600"></span><span class="chip">${esc(f.cobertura)}</span></div>`).join("")}
    </div>
    <div class="card" style="margin-bottom:14px"><h3>Chaves de API (opcionais, gratuitas) — ampliam a cobertura</h3>
      <p class="muted" style="margin-top:-4px">Adzuna e Jooble agregam vagas de centenas de sites brasileiros. O token do GitHub aumenta o limite de consultas às comunidades.</p>
      <div class="form">${chaves.map(([k, rot, url]) => `<label class="campo"><span style="display:flex;justify-content:space-between">${rot}<a href="${url}" target="_blank" rel="noopener" style="font-weight:400">obter chave ↗</a></span>
        <input type="password" data-chave="${k}" value="${esc(cfg[k])}" autocomplete="off"></label>`).join("")}</div>
    </div>
    <div class="card"><h3>Preferências</h3><div class="form">
      <label class="campo full">Nome da consultoria (aparece nos relatórios)<input type="text" id="cEmpresa" value="${esc(cfg.empresa_nome || "")}"></label>
      <div class="campo">Páginas lidas por canal ${seg("cPag", [1, 2, 3, 5], cfg.paginas_por_fonte)}</div>
      <div class="campo">Score mínimo padrão ${seg("cScore", [30, 40, 50, 60], cfg.score_minimo_padrao)}</div>
    </div></div>`;
  $$(".seg").forEach((s) => (s.onclick = (e) => { const b = e.target.closest("button"); if (b) $$("button", s).forEach((x) => x.classList.toggle("on", x === b)); }));
  $$("[data-chave]").forEach((i) => (i.onfocus = () => { if (i.value === "••••••••") i.select(); }));
  $("#cSalvar").onclick = async () => {
    const dados = {
      empresa_nome: $("#cEmpresa").value, paginas_por_fonte: +$("#cPag .on").dataset.v, score_minimo_padrao: +$("#cScore .on").dataset.v,
      fontes_ativas: $$("[data-fonte]:checked").map((x) => x.dataset.fonte),
    };
    $$("[data-chave]").forEach((i) => { dados[i.dataset.chave] = i.value; });
    try { await api("/api/config", { method: "PUT", body: dados }); META = await api("/api/meta"); estado.filtros.score = META.score_minimo_padrao; toast("Configurações salvas."); }
    catch (e) { falha(e); }
  };
  $("#cTestar").onclick = async () => {
    const btn = $("#cTestar"); btn.disabled = true; btn.textContent = "Testando…";
    await Promise.all(META.fontes.map(async (f) => {
      const el = $("#st-" + f.id); el.textContent = "…"; el.style.color = "";
      try {
        const r = await api(`/api/fontes/${f.id}/testar`);
        if (r.status === "online") { el.textContent = `✓ online · ${r.qtd}`; el.style.color = "var(--verde)"; }
        else if (r.status === "sem_chave") el.textContent = "sem chave";
        else { el.textContent = "✕ indisponível"; el.title = r.erro || ""; el.style.color = "var(--lar)"; }
      } catch { el.textContent = "✕ erro"; el.style.color = "var(--lar)"; }
    }));
    btn.disabled = false; btn.textContent = "Testar conexões";
  };
}

/* ------------------------------------------------------------- início */
(async () => {
  try {
    META = await api("/api/meta");
    estado.filtros.score = META.score_minimo_padrao;
    $("#versao").textContent = `${META.app} Web · v${META.versao}`;
  } catch (e) { main.innerHTML = `<div class="card vazio">Não foi possível conectar ao servidor: ${esc(e.message)}</div>`; return; }
  rotear();
})();
