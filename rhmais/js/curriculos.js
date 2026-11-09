/* RH+ Match — currículos: modelos de layout, adaptação por vaga com IA (salva por vaga), currículo base e padrão. */
import { localVaga } from "../supabase/functions/_shared/nucleo.js";
import {
  $, baixarBlob, ctx, dataHora, ehAdmin, erroFuncao, esc, estado, falha, ligarSegmentados, lerCurriculo,
  main, modal, q, sb, segmentado, slugArq, toast, topo, traduzErro,
} from "./base.js";

/* ============================================================= modelos de layout */
const BASE_CV = `.cv{font-family:Calibri,"Segoe UI",Arial,sans-serif;color:#1d2433;font-size:11pt;line-height:1.45;max-width:780px;margin:auto}
.cv h1{font-size:22pt;margin:0;color:#111633}.cv .titulo{font-size:12.5pt;margin:2px 0 4px;font-weight:600}
.cv .contato{color:#5B6478;margin:0 0 6px;font-size:10pt}.cv h2{font-size:11.5pt;margin:16px 0 6px}
.cv p{margin:0 0 6px}.cv ul{margin:2px 0 8px;padding-left:18px}.cv li{margin:2px 0}.cv .exp{margin-bottom:8px}
.cv .exp-topo span{float:right;color:#5B6478;font-size:10pt}.cv .skills{line-height:1.7}
.cv .novo{background:#E3F7EF;color:#0B6B4C;border-radius:3px;padding:0 2px}`;

export const MODELOS = [
  { id: "classico", nome: "Clássico", desc: "Limpo e tradicional, aceito por qualquer recrutador e por sistemas de triagem (ATS).",
    css: `.m-classico .titulo{color:#4F46E5}.m-classico h2{text-transform:uppercase;letter-spacing:.06em;color:#111633;border-bottom:1.5px solid #4F46E5;padding-bottom:2px}` },
  { id: "moderno", nome: "Moderno", desc: "Faixa de cor lateral e competências em destaque. Bom para tecnologia, marketing e comercial.",
    css: `.m-moderno{border-left:6px solid #4F46E5;padding-left:22px}.m-moderno h1{font-size:24pt;letter-spacing:-.01em}
.m-moderno .titulo{color:#4F46E5}.m-moderno h2{color:#4F46E5;font-size:11pt;text-transform:uppercase;letter-spacing:.1em}
.m-moderno .skills{line-height:2}.m-moderno .skills .sk{display:inline-block;background:#EEF0FF;color:#3730A3;border-radius:4px;padding:0 7px;margin:0 4px 4px 0}` },
  { id: "executivo", nome: "Executivo", desc: "Tipografia serifada e sóbria, para cargos de gestão, jurídico, financeiro e diretoria.",
    css: `.m-executivo{font-family:Georgia,"Times New Roman",serif;font-size:10.5pt}.m-executivo h1{text-align:center;font-size:21pt;letter-spacing:.04em;text-transform:uppercase}
.m-executivo .titulo,.m-executivo .contato{text-align:center}.m-executivo .titulo{color:#333;font-style:italic;font-weight:400}
.m-executivo h2{font-size:11pt;text-transform:uppercase;letter-spacing:.14em;color:#111633;border-top:1px solid #111633;border-bottom:1px solid #111633;padding:3px 0;text-align:center}` },
  { id: "compacto", nome: "Compacto", desc: "Cabe em uma página: fonte menor e espaços enxutos. Ideal para quem tem muitas experiências.",
    css: `.m-compacto{font-size:9.5pt;line-height:1.3}.m-compacto h1{font-size:17pt}.m-compacto .titulo{color:#0E7A55;font-size:11pt}
.m-compacto h2{font-size:10pt;margin:9px 0 3px;text-transform:uppercase;color:#0E7A55;border-bottom:1px solid #CFE9DE}
.m-compacto ul{margin:1px 0 4px}.m-compacto li{margin:0}.m-compacto .exp{margin-bottom:4px}` },
  { id: "criativo", nome: "Criativo", desc: "Cabeçalho colorido e visual marcante, para design, comunicação, eventos e atendimento.",
    css: `.m-criativo .cab{background:linear-gradient(135deg,#0F766E,#4F46E5);color:#fff;border-radius:10px;padding:18px 22px;margin-bottom:10px}
.m-criativo .cab h1,.m-criativo .cab .titulo,.m-criativo .cab .contato{color:#fff}.m-criativo .cab .contato{opacity:.9}
.m-criativo h2{color:#0F766E;font-size:12pt}.m-criativo h2::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;background:#0F766E;margin-right:7px}
.m-criativo .skills .sk{display:inline-block;border:1px solid #0F766E;color:#0F766E;border-radius:999px;padding:0 9px;margin:0 4px 5px 0}` },
];
const modeloValido = (m) => (MODELOS.some((x) => x.id === m) ? m : "classico");
export const CSS_CV = BASE_CV + MODELOS.map((m) => m.css).join("\n");

export function htmlCurriculo(cv, destacar = false, modelo = "classico") {
  const m = modeloValido(modelo);
  const novo = (t, ehNovo) => (ehNovo && destacar ? `<span class="novo">${esc(t)}</span>` : esc(t));
  const lista = (titulo, itens) => (itens?.length ? `<h2>${titulo}</h2><ul>${itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
  const pilulas = m === "moderno" || m === "criativo";
  const skills = (cv.competencias || []).map((s) => (pilulas ? `<span class="sk">${novo(s.nome, s.nova)}</span>` : novo(s.nome, s.nova)));
  return `<div class="cv m-${m}">
    <div class="cab"><h1>${esc(cv.nome)}</h1>
    ${cv.titulo_profissional ? `<p class="titulo">${esc(cv.titulo_profissional)}</p>` : ""}
    ${cv.contato?.length ? `<p class="contato">${cv.contato.map(esc).join(" · ")}</p>` : ""}</div>
    ${cv.resumo ? `<h2>Resumo profissional</h2><p>${esc(cv.resumo)}</p>` : ""}
    ${skills.length ? `<h2>Competências</h2><p class="skills">${skills.join(pilulas ? " " : " · ")}</p>` : ""}
    ${cv.experiencias?.length ? `<h2>Experiência profissional</h2>${cv.experiencias.map((x) => `
      <div class="exp"><div class="exp-topo"><b>${esc(x.cargo)}</b>${x.empresa ? ` — ${esc(x.empresa)}` : ""}<span>${esc([x.periodo, x.local].filter(Boolean).join(" · "))}</span></div>
      <ul>${(x.itens || []).map((i) => `<li>${novo(i.texto, i.novo)}</li>`).join("")}</ul></div>`).join("")}` : ""}
    ${lista("Formação", cv.formacao)}${lista("Certificações e cursos", cv.certificacoes)}${lista("Idiomas", cv.idiomas)}
    ${(cv.outras_secoes || []).map((s) => lista(esc(s.titulo), s.itens)).join("")}
  </div>`;
}

export function documentoCurriculo(cv, modelo = "classico", paraWord = false) {
  const cab = paraWord ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` : `<!doctype html><html lang="pt-BR">`;
  return `${cab}<head><meta charset="utf-8"><title>Currículo – ${esc(cv.nome)}</title><style>body{margin:24px}${CSS_CV}
    .cv .exp-topo span{float:none;display:block}@page{margin:16mm}</style></head><body>${htmlCurriculo(cv, false, modelo)}</body></html>`;
}

/** Texto corrido a partir do currículo estruturado (para reaproveitar o currículo base como entrada da IA). */
export function cvParaTexto(cv) {
  const l = [cv.nome, cv.titulo_profissional, (cv.contato || []).join(" | "), "", "RESUMO", cv.resumo, "", "COMPETÊNCIAS",
    (cv.competencias || []).map((s) => s.nome).join(", "), "", "EXPERIÊNCIA"];
  for (const x of cv.experiencias || []) {
    l.push(`${x.cargo} — ${x.empresa} (${[x.periodo, x.local].filter(Boolean).join(", ")})`);
    for (const i of x.itens || []) l.push(`- ${i.texto}`);
    l.push("");
  }
  const sec = (t, a) => { if (a?.length) l.push(t, ...a.map((i) => `- ${i}`), ""); };
  sec("FORMAÇÃO", cv.formacao); sec("CERTIFICAÇÕES", cv.certificacoes); sec("IDIOMAS", cv.idiomas);
  for (const s of cv.outras_secoes || []) sec(String(s.titulo || "").toUpperCase(), s.itens);
  return l.filter((x) => x !== undefined && x !== null).join("\n");
}

/* ============================================================= acesso ao banco */
const COLS = "id, tipo, titulo, modelo, conteudo, padrao, vaga_url, vaga_titulo, vaga_empresa, candidato_id, criado_em, atualizado_em";
const filtroCand = (r, candidatoId) => (candidatoId ? r.eq("candidato_id", candidatoId) : r.is("candidato_id", null));

export async function adaptadoParaVaga(vagaUrl, candidatoId) {
  if (!vagaUrl) return null;
  return q(filtroCand(sb.from("curriculos").select(COLS).eq("tipo", "adaptado").eq("vaga_url", vagaUrl), candidatoId).maybeSingle());
}
/** Currículo para usar como ponto de partida: o padrão; senão o base mais recente. */
export async function curriculoDePartida(candidatoId) {
  const lista = await q(filtroCand(sb.from("curriculos").select(COLS), candidatoId).order("padrao", { ascending: false }).order("criado_em", { ascending: false }).limit(10));
  return lista.find((c) => c.padrao) || lista.find((c) => c.tipo === "base") || null;
}
async function salvarAdaptado(cv, vaga, candidato) {
  const existente = await adaptadoParaVaga(vaga.url, candidato?.id);
  const dados = {
    tipo: "adaptado", conteudo: cv, titulo: `${vaga.titulo}${vaga.empresa ? " — " + vaga.empresa : ""}`.slice(0, 200),
    vaga_url: vaga.url || null, vaga_titulo: vaga.titulo || "", vaga_empresa: vaga.empresa || "",
    candidato_id: candidato?.id ?? null, atualizado_em: new Date().toISOString(),
  };
  if (existente) return q(sb.from("curriculos").update(dados).eq("id", existente.id).select(COLS).single());
  return q(sb.from("curriculos").insert({ ...dados, owner: ctx.usuario.id, modelo: modeloValido(ctx.perfil?.modelo_curriculo) }).select(COLS).single());
}

/* ============================================================= adaptar para uma vaga */
export async function abrirAdaptador(vaga, candidato) {
  const candId = candidato?.id ?? null;
  let salvo = null, partida = null;
  try { [salvo, partida] = await Promise.all([adaptadoParaVaga(vaga.url, candId), curriculoDePartida(candId)]); }
  catch (e) { falha(e); }
  if (salvo) {
    modal(`<h3 style="margin:0 0 6px">✨ Currículo já adaptado para esta vaga</h3>
      <p class="muted" style="margin:0 0 14px"><b>${esc(vaga.titulo)}</b> · ${esc(vaga.empresa || "")}<br>Gerado em ${dataHora(salvo.atualizado_em)}. Você pode abri-lo sem gastar uma nova geração.</p>
      <div class="rodape"><button class="btn neutro" id="cvRefazer">Gerar de novo</button><button class="btn" id="cvAbrirSalvo">Abrir currículo salvo</button></div>`);
    $("#cvAbrirSalvo").onclick = () => mostrarCurriculo(salvo);
    $("#cvRefazer").onclick = () => formularioAdaptacao(vaga, candidato, partida);
    return;
  }
  formularioAdaptacao(vaga, candidato, partida);
}

function formularioAdaptacao(vaga, candidato, partida) {
  modal(`<h3 style="margin:0 0 2px">✨ Adaptar currículo para esta vaga</h3>
    <p class="muted" style="margin:0 0 12px"><b>${esc(vaga.titulo)}</b> · ${esc(vaga.empresa || "Empresa não divulgada")}</p>
    <p style="margin:0 0 10px;font-size:13px">A IA reescreve o resumo, reorganiza as competências e destaca nas experiências o que mais conta para esta vaga. <b>Empresas, cargos e datas não são alterados</b> e nada é inventado: os acréscimos aparecem marcados para revisão. O resultado fica <b>salvo para esta vaga</b>.</p>
    ${partida ? `<div class="card" style="padding:10px 12px;margin-bottom:10px;background:var(--cinza)"><label class="checks" style="font-size:14px"><input type="checkbox" id="cvUsarBase" checked>
      Usar o currículo salvo “${esc(partida.titulo || "Currículo base")}”${partida.padrao ? " (padrão)" : ""}</label></div>` : ""}
    <div id="cvAnexoArea" ${partida ? "hidden" : ""}>
      <label class="btn sec" style="display:inline-block;cursor:pointer">📎 Anexar currículo (PDF, DOCX ou TXT)<input type="file" id="cvArq" accept=".pdf,.docx,.txt" hidden></label>
      <span class="muted" id="cvNome" style="margin-left:8px;font-size:13px"></span>
      <label class="campo" style="margin-top:12px">Texto do currículo (pode revisar ou colar aqui)
        <textarea id="cvTexto" style="min-height:200px;font-size:13px" placeholder="O texto extraído do arquivo aparece aqui."></textarea></label>
    </div>
    <div class="msg muted" id="cvMsg" style="font-size:13px;min-height:18px;margin-top:6px"></div>
    <div class="rodape"><button class="btn neutro" data-fechar>Cancelar</button><button class="btn ia" id="cvGerar">Gerar currículo adaptado</button></div>`, true);
  $("#cvUsarBase")?.addEventListener("change", (e) => { $("#cvAnexoArea").hidden = e.target.checked; });
  $("#cvArq").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#cvNome").textContent = "Lendo " + f.name + "…";
    try { $("#cvTexto").value = (await lerCurriculo(f)).trim(); $("#cvNome").textContent = f.name; }
    catch (err) { $("#cvNome").textContent = ""; $("#cvMsg").textContent = "⚠ " + traduzErro(err); }
  };
  $("#cvGerar").onclick = async () => {
    const usarBase = partida && $("#cvUsarBase")?.checked;
    const curriculo = usarBase ? cvParaTexto(partida.conteudo) : $("#cvTexto").value.trim();
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
      let reg = { conteudo: r.data.curriculo, modelo: ctx.perfil?.modelo_curriculo, vaga_titulo: vaga.titulo, vaga_empresa: vaga.empresa, tipo: "adaptado" };
      try { reg = await salvarAdaptado(r.data.curriculo, vaga, candidato); toast("Currículo adaptado e salvo para esta vaga."); }
      catch (e) { falha(e); }
      mostrarCurriculo(reg);
    } catch (err) {
      btn.disabled = false; btn.textContent = "Gerar currículo adaptado";
      $("#cvMsg").textContent = "⚠ " + traduzErro(err);
    }
  };
}

/* ============================================================= visualizar / modelo / baixar */
export function mostrarCurriculo(reg, aoMudar) {
  const cv = reg.conteudo || {};
  let modelo = modeloValido(reg.modelo || ctx.perfil?.modelo_curriculo);
  const novos = (cv.competencias || []).filter((s) => s.nova).length + (cv.experiencias || []).reduce((a, x) => a + (x.itens || []).filter((i) => i.novo).length, 0);
  const subt = reg.tipo === "base" ? "Currículo base" : [reg.vaga_titulo, reg.vaga_empresa].filter(Boolean).join(" · ");
  modal(`<style>${CSS_CV}</style>
    <div class="topo" style="align-items:center;margin-bottom:10px"><div><h3 style="margin:0">${reg.tipo === "base" ? "Currículo base" : "Currículo adaptado"}${reg.padrao ? ' <span class="chip ok">Padrão</span>' : ""}</h3>
      <p class="muted" style="margin:2px 0 0">${esc(subt)}</p></div>
      <div class="acoes"><button class="btn neutro peq" id="cvWord">⬇ Word (.doc)</button><button class="btn neutro peq" id="cvPdf">🖨 Imprimir / PDF</button>
        ${reg.id && !reg.padrao ? `<button class="btn sec peq" id="cvPadrao">★ Usar como padrão</button>` : ""}</div></div>
    <div class="campo" style="margin-bottom:10px">Modelo ${segmentado("cvModelo", MODELOS.map((m) => [m.id, m.nome]), modelo)}
      <small class="muted" id="cvModeloDesc">${esc(MODELOS.find((m) => m.id === modelo).desc)}</small></div>
    <div class="cv-layout">
      <div class="cv-folha" id="cvFolha">${htmlCurriculo(cv, true, modelo)}</div>
      <aside class="cv-notas">
        ${cv.observacoes ? `<p><b>${reg.tipo === "base" ? "Observação" : "O que mudou"}</b><br>${esc(cv.observacoes)}</p>` : ""}
        ${novos ? `<p><span class="novo-tag">verde</span> = ${novos} acréscimo(s) da IA. Confira se são verdadeiros antes de enviar.</p>` : ""}
        ${(cv.competencias || []).some((s) => s.nova) ? `<p><b>Competências acrescentadas</b></p><ul>${cv.competencias.filter((s) => s.nova).map((s) => `<li><b>${esc(s.nome)}</b>: ${esc(s.justificativa)}</li>`).join("")}</ul>` : ""}
        ${cv.lacunas?.length ? `<p><b>Pedido na vaga e não comprovado no currículo</b> (não foi incluído)</p><ul>${cv.lacunas.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        ${cv.palavras_chave?.length ? `<p><b>Palavras-chave da vaga presentes</b><br>${cv.palavras_chave.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</p>` : ""}
        ${reg.id ? `<p class="muted" style="font-size:12px">💾 Salvo em Currículos${reg.atualizado_em ? " · " + dataHora(reg.atualizado_em) : ""}.</p>` : ""}
      </aside>
    </div>
    <div class="rodape"><span class="muted" style="font-size:12px">Gerado com IA (Claude, da Anthropic). Revise antes de enviar.</span><button class="btn" data-fechar>Fechar</button></div>`, true);
  ligarSegmentados($("#modalCorpo"));
  $("#cvModelo").addEventListener("mudou", async (e) => {
    modelo = modeloValido(e.detail);
    $("#cvFolha").innerHTML = htmlCurriculo(cv, true, modelo);
    $("#cvModeloDesc").textContent = MODELOS.find((m) => m.id === modelo).desc;
    if (reg.id) { try { await q(sb.from("curriculos").update({ modelo }).eq("id", reg.id)); reg.modelo = modelo; aoMudar?.(); } catch (err) { falha(err); } }
  });
  const nomeArq = () => `curriculo_${slugArq(cv.nome)}_${slugArq(reg.vaga_empresa || reg.vaga_titulo || "base")}`;
  $("#cvWord").onclick = () => baixarBlob(new Blob(["﻿" + documentoCurriculo(cv, modelo, true)], { type: "application/msword" }), nomeArq() + ".doc");
  $("#cvPdf").onclick = () => {
    const html = documentoCurriculo(cv, modelo).replace("</body>", "<script>onload=()=>setTimeout(()=>print(),300)<\/script></body>");
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    if (!window.open(url, "_blank")) baixarBlob(new Blob([html], { type: "text/html" }), nomeArq() + ".html");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const bp = $("#cvPadrao");
  if (bp) bp.onclick = async () => {
    try { await q(sb.rpc("definir_curriculo_padrao", { p_id: reg.id })); reg.padrao = true; bp.remove(); toast("Este é agora o currículo padrão (usado nas candidaturas)."); aoMudar?.(); }
    catch (err) { falha(err); }
  };
}

/* ============================================================= importar currículo base (IA estrutura o texto) */
export function importarCurriculoBase(candidato, aoSalvar) {
  modal(`<h3 style="margin:0 0 4px">Importar currículo base</h3>
    <p class="muted" style="margin:0 0 12px">${candidato ? `Para <b>${esc(candidato.nome)}</b>. ` : ""}A IA organiza o currículo nas seções (resumo, competências, experiências…) <b>sem alterar o conteúdo</b>. Ele fica salvo e serve de ponto de partida para as adaptações por vaga.</p>
    <label class="btn sec" style="display:inline-block;cursor:pointer">📎 Escolher arquivo (PDF, DOCX ou TXT)<input type="file" id="cbArq" accept=".pdf,.docx,.txt" hidden></label>
    <span class="muted" id="cbNome" style="margin-left:8px;font-size:13px"></span>
    <label class="campo" style="margin-top:12px">Texto do currículo<textarea id="cbTexto" style="min-height:200px;font-size:13px" placeholder="O texto extraído do arquivo aparece aqui (ou cole)."></textarea></label>
    <div class="msg muted" id="cbMsg" style="font-size:13px;min-height:18px;margin-top:6px"></div>
    <div class="rodape"><button class="btn neutro" data-fechar>Cancelar</button><button class="btn ia" id="cbGerar">Organizar e salvar</button></div>`, true);
  $("#cbArq").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#cbNome").textContent = "Lendo " + f.name + "…";
    try { $("#cbTexto").value = (await lerCurriculo(f)).trim(); $("#cbNome").textContent = f.name; }
    catch (err) { $("#cbNome").textContent = ""; $("#cbMsg").textContent = "⚠ " + traduzErro(err); }
  };
  $("#cbGerar").onclick = async () => {
    const texto = $("#cbTexto").value.trim();
    if (texto.length < 200) return ($("#cbMsg").textContent = "Anexe o currículo (ou cole o texto completo).");
    const btn = $("#cbGerar"); btn.disabled = true; btn.textContent = "Organizando…";
    $("#cbMsg").textContent = "A IA está organizando o currículo (cerca de 20 a 60 segundos).";
    try {
      const r = await sb.functions.invoke("adaptar-curriculo", { body: { modo: "estruturar", curriculo: texto } });
      if (r.error) throw new Error(await erroFuncao(r, "adaptar-curriculo"));
      const cv = r.data.curriculo;
      const temPadrao = await curriculoDePartida(candidato?.id ?? null);
      const reg = await q(sb.from("curriculos").insert({
        owner: ctx.usuario.id, tipo: "base", titulo: `Currículo base — ${cv.nome || candidato?.nome || ""}`.slice(0, 200), conteudo: cv,
        modelo: modeloValido(ctx.perfil?.modelo_curriculo), candidato_id: candidato?.id ?? null, padrao: !temPadrao?.padrao,
      }).select(COLS).single());
      toast(reg.padrao ? "Currículo base salvo e definido como padrão." : "Currículo base salvo.");
      aoSalvar?.(); mostrarCurriculo(reg, aoSalvar);
    } catch (err) { btn.disabled = false; btn.textContent = "Organizar e salvar"; $("#cbMsg").textContent = "⚠ " + traduzErro(err); }
  };
}

/* ============================================================= página "Currículos" */
export async function pgCurriculos({ meuPerfil } = {}) {
  const admin = ehAdmin();
  const cands = admin ? await q(sb.from("candidatos").select("id, nome").order("nome")) : [];
  const nomeCand = Object.fromEntries(cands.map((c) => [c.id, c.nome]));
  main.innerHTML = topo("Currículos", admin ? "Currículos base e adaptados dos seus candidatos" : "Seu currículo base e as versões adaptadas para cada vaga", `
      ${admin ? `<select id="cvCand" style="width:220px"><option value="">Todos os candidatos</option>${cands.map((c) => `<option value="${c.id}" ${String(c.id) === estado.cvFiltro ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>` : ""}
      <button class="btn ia" id="cvImportar">⬆ Importar currículo base</button>`) + `
    <div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:6px">Modelo padrão para novos currículos</h3>
      <p class="muted" style="margin:0 0 10px;font-size:13px">Escolha o visual usado ao gerar e baixar currículos. Dá para trocar em cada currículo depois.</p>
      ${segmentado("cvModeloPadrao", MODELOS.map((m) => [m.id, m.nome]), modeloValido(ctx.perfil?.modelo_curriculo))}</div>
    <div id="cvLista"></div>`;
  ligarSegmentados(main);
  $("#cvModeloPadrao").addEventListener("mudou", async (e) => {
    try { await q(sb.from("perfis").update({ modelo_curriculo: e.detail, atualizado_em: new Date().toISOString() }).eq("id", ctx.usuario.id));
      ctx.perfil.modelo_curriculo = e.detail; toast(`Modelo padrão: ${MODELOS.find((m) => m.id === e.detail).nome}.`); } catch (err) { falha(err); }
  });
  const carregar = async () => {
    let r = sb.from("curriculos").select(COLS).order("padrao", { ascending: false }).order("atualizado_em", { ascending: false });
    if (admin && estado.cvFiltro) r = r.eq("candidato_id", +estado.cvFiltro);
    const lista = await q(r);
    $("#cvLista").innerHTML = lista.length ? `<div class="cv-grade">${lista.map((c) => `
      <div class="card cv-cartao" data-id="${c.id}">
        <div class="cv-mini"><b>${esc(c.conteudo?.nome || "")}</b><small>${esc(c.conteudo?.titulo_profissional || "")}</small></div>
        <div style="flex:1;min-width:0"><div class="trunc"><b>${esc(c.tipo === "base" ? "Currículo base" : c.vaga_titulo || c.titulo)}</b></div>
          <div class="muted trunc" style="font-size:13px">${esc(c.tipo === "base" ? (nomeCand[c.candidato_id] || "") : [c.vaga_empresa, nomeCand[c.candidato_id]].filter(Boolean).join(" · "))}</div>
          <div style="margin-top:4px">${c.padrao ? '<span class="chip ok">★ Padrão</span>' : ""}<span class="chip">${esc(MODELOS.find((m) => m.id === c.modelo)?.nome || "Clássico")}</span><span class="chip">${dataHora(c.atualizado_em)}</span></div></div>
        <div class="acoes"><button class="btn neutro peq" data-acao="abrir">Abrir</button>${c.vaga_url ? `<a class="btn neutro peq" href="${esc(c.vaga_url)}" target="_blank" rel="noopener" style="text-decoration:none">Vaga ↗</a>` : ""}<button class="btn perigo peq" data-acao="excluir">Excluir</button></div>
      </div>`).join("")}</div>`
      : `<div class="card vazio"><div class="ico">📄</div><b>Nenhum currículo salvo ainda</b><br>Importe seu currículo base ou adapte um currículo a partir de uma vaga em “Buscar vagas”.</div>`;
    $("#cvLista").onclick = async (e) => {
      const b = e.target.closest("[data-acao]"); const card = e.target.closest("[data-id]"); if (!b || !card) return;
      const reg = lista.find((x) => x.id === +card.dataset.id);
      if (b.dataset.acao === "abrir") mostrarCurriculo(reg, () => carregar().catch(falha));
      if (b.dataset.acao === "excluir") {
        if (!confirm("Excluir este currículo? Não é possível desfazer.")) return;
        try { await q(sb.from("curriculos").delete().eq("id", reg.id)); toast("Currículo excluído."); await carregar(); } catch (err) { falha(err); }
      }
    };
  };
  $("#cvCand")?.addEventListener("change", (e) => { estado.cvFiltro = e.target.value; carregar().catch(falha); });
  $("#cvImportar").onclick = async () => {
    let cand = null;
    if (admin) {
      if (!estado.cvFiltro) return toast("Escolha o candidato no seletor ao lado para importar o currículo dele.");
      cand = cands.find((c) => c.id === +estado.cvFiltro);
    } else cand = await meuPerfil?.();
    importarCurriculoBase(cand, () => carregar().catch(falha));
  };
  await carregar();
}
