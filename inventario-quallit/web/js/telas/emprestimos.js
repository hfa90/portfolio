// Inventário Quallit — tela: emprestimos (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { criarAssinatura } from '../assinatura.js';
import { recarregarMaquina } from '../dados.js';
import { confirmar } from '../dialogos.js';
import { $, $$, ESTILO_CLIENTE_DOC, MQ, STATUS, TIPO, acharMaquina, dataHora, imprimirQuandoPronto, logoClienteDoc, debounce, erroMsg, esc, extrairCodigo, noCD, pill, rel, sb, setores, state, statusPill, toast, up, titulo } from '../nucleo.js';
import { ehErroDeRede } from '../offline.js';
import { rerender } from '../rotas.js';
import { lerCamera } from '../telas/inventarios.js';
import { abrirMaquina, campo, modal, opts } from '../telas/maquinas.js';
import { abasEmprestimos, renderColaboradores, renderTermos } from './termos.js';

/* =====================================================================
   EMPRÉSTIMOS
   ===================================================================== */
export const EMP_COLS = 'id, maquina_id, colaborador, matricula, setor, contato, retirado_em, previsto_devolucao, devolvido_em, status_anterior, status_retorno, condicao_devolucao, obs_retirada, obs_devolucao, entregue_por, recebido_por';
export const COND = { ok: 'Sem problemas', avaria: 'Com avaria', faltando_item: 'Faltando item' };
export const atrasado = (e) => !e.devolvido_em && e.previsto_devolucao && new Date(e.previsto_devolucao) < new Date();
export function duracao(ms) {
  ms = Math.abs(ms);
  const min = Math.round(ms / 6e4);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}
export function prazo(e) {
  if (!e.previsto_devolucao) return '<span class="muted">sem data</span>';
  const diff = new Date(e.previsto_devolucao) - Date.now();
  if (diff < 0) return `${pill('atrasado há ' + duracao(diff), 'bad')}<span class="sub">${dataHora(e.previsto_devolucao)}</span>`;
  return `em ${duracao(diff)}<span class="sub">${dataHora(e.previsto_devolucao)}</span>`;
}
export const paraInputLocal = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export async function carregarEmprestimos() {
  const { data: d, error } = await sb.from('emprestimos')
    .select(EMP_COLS + ', maquinas(hostname, ativo, modelo, tipo)').order('retirado_em', { ascending: false }).limit(500);
  if (error) { if (!ehErroDeRede(error)) toast(erroMsg(error), true); return; }
  state.emprestimos = d || [];
}

export function renderEmprestimos() {
  if (state.empAba === 'termos') return renderTermos();
  if (state.empAba === 'colaboradores') return renderColaboradores();
  const el = $('#view-emprestimos');
  const E = state.emprestimos.filter(noCD);
  const abertos = E.filter((e) => !e.devolvido_em)
    .sort((a, b) => new Date(a.previsto_devolucao || 8.64e15) - new Date(b.previsto_devolucao || 8.64e15));
  const atrasados = abertos.filter(atrasado).length;
  const dev7 = E.filter((e) => e.devolvido_em && Date.now() - new Date(e.devolvido_em) < 7 * 864e5).length;
  const disponiveis = MQ().filter((m) => m.tipo === 'notebook' && m.status === 'estoque' && !m.emprestimo_atual).length;
  const busca = $('#emp-busca')?.value || '';
  const host = (e) => e.maquinas?.hostname || '(removida)';

  el.innerHTML = `
    <div class="view-head">
      ${titulo('Empréstimos e termos', '', `Empréstimos têm prazo de devolução; o equipamento fixo de cada colaborador fica em <b>Termos de uso</b>.`)}
      <div class="actions"><button class="btn btn--primary" id="btn-novo-emp">+ Novo empréstimo</button></div>
    </div>
    ${abasEmprestimos('emprestimos')}
    <div class="kpis">
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Emprestados agora</div><div class="kpi-value">${abertos.length}</div><div class="kpi-sub">em aberto</div></div>
      <div class="card kpi ${atrasados ? 'kpi--bad' : ''}" style="cursor:default"><div class="kpi-label">Atrasados</div><div class="kpi-value">${atrasados}</div><div class="kpi-sub">devolução vencida</div></div>
      <div class="card kpi kpi--ok" style="cursor:default"><div class="kpi-label">Notebooks disponíveis</div><div class="kpi-value">${disponiveis}</div><div class="kpi-sub">status Estoque</div></div>
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Devolvidos (7 dias)</div><div class="kpi-value">${dev7}</div><div class="kpi-sub">últimos 7 dias</div></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-pad" style="padding-bottom:0"><div class="card-head"><h2>Em aberto</h2></div></div>
      ${abertos.length ? `<div class="table-wrap" style="max-height:none"><table><thead><tr><th>Equipamento</th><th>Colaborador</th><th>Retirada</th><th>Devolução</th><th>Entregue por</th><th></th></tr></thead><tbody>
        ${abertos.map((e) => `<tr data-maq="${e.maquina_id}" class="${atrasado(e) ? 'row-bad' : ''}">
          <td class="host"><span class="mono">${esc(host(e))}</span><span class="sub mono">${esc(e.maquinas?.ativo || '')}</span></td>
          <td>${esc(e.colaborador)}<span class="sub">${esc([e.matricula, e.setor, e.contato].filter(Boolean).join(' · '))}</span></td>
          <td>${dataHora(e.retirado_em)}<span class="sub">${rel(e.retirado_em)}</span></td>
          <td>${prazo(e)}</td>
          <td>${esc((e.entregue_por || '').split('@')[0])}</td>
          <td class="acoes"><button class="btn btn--sm btn--primary" data-devolver="${e.id}">Devolução</button> <button class="btn btn--sm btn--ghost" data-termo="${e.id}">Termo</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhum equipamento emprestado no momento.</div>'}
    </div>
    <div class="card">
      <div class="toolbar"><h2 style="margin-right:auto">Histórico</h2>
        <div class="search" style="flex:0 1 320px"><input id="emp-busca" type="search" placeholder="Buscar colaborador, matrícula, hostname…" value="${esc(busca)}"></div></div>
      <div class="table-wrap" style="max-height:520px"><table><thead><tr><th>Equipamento</th><th>Colaborador</th><th>Retirada</th><th>Devolução</th><th>Duração</th><th>Condição</th><th></th></tr></thead><tbody id="emp-hist"></tbody></table></div>
    </div>`;

  const desenharHist = () => {
    const termos = up($('#emp-busca').value).split(/\s+/).filter(Boolean);
    const lista = E.filter((e) => e.devolvido_em).filter((e) => {
      const t = up([e.colaborador, e.matricula, e.setor, host(e), e.maquinas?.ativo].join(' '));
      return termos.every((x) => t.includes(x));
    });
    $('#emp-hist').innerHTML = lista.length ? lista.map((e) => `<tr data-maq="${e.maquina_id}">
      <td class="host"><span class="mono">${esc(host(e))}</span><span class="sub mono">${esc(e.maquinas?.ativo || '')}</span></td>
      <td>${esc(e.colaborador)}<span class="sub">${esc(e.matricula || '')}</span></td>
      <td>${dataHora(e.retirado_em)}</td><td>${dataHora(e.devolvido_em)}</td>
      <td>${duracao(new Date(e.devolvido_em) - new Date(e.retirado_em))}</td>
      <td>${pill(COND[e.condicao_devolucao] || '—', e.condicao_devolucao === 'ok' ? 'ok' : e.condicao_devolucao ? 'bad' : '')}</td>
      <td class="acoes"><button class="btn btn--sm btn--ghost" data-termo="${e.id}">Termo</button></td></tr>`).join('')
      : `<tr><td colspan="7" class="empty">${E.some((e) => e.devolvido_em) ? 'Nada encontrado.' : 'Nenhuma devolução registrada ainda.'}</td></tr>`;
  };
  desenharHist();
  $('#emp-busca').oninput = debounce(desenharHist, 120);
  $('#btn-novo-emp').onclick = () => modalEmprestimo();
  el.onclick = (ev) => {
    const dv = ev.target.closest('[data-devolver]'); if (dv) return modalDevolucao(dv.dataset.devolver);
    const tm = ev.target.closest('[data-termo]'); if (tm) return imprimirTermo(tm.dataset.termo);
    if (ev.target.closest('button, input, a')) return;
    const tr = ev.target.closest('tr[data-maq]'); if (tr) abrirMaquina(tr.dataset.maq);
  };
}

export function cardMaquinaEmp(m) {
  if (!m) return '';
  const indisponivel = m.emprestimo_atual ? `Já emprestado para ${esc(m.emprestimo_atual.colaborador)}` : ['descartado', 'extraviado'].includes(m.status) ? `Status: ${STATUS[m.status]}` : '';
  return `<div class="emp-maq ${indisponivel ? 'emp-maq--bad' : ''}">
    <div class="emp-maq-top"><strong class="mono">${esc(m.hostname)}</strong>${statusPill(m.status)}</div>
    <span>${esc([m.ativo && 'Patrimônio ' + m.ativo, TIPO[m.tipo], m.modelo].filter(Boolean).join(' · '))}</span>
    ${indisponivel ? `<span class="erro">${indisponivel}</span>` : ''}</div>`;
}

export function modalEmprestimo(pre = null) {
  let maq = pre;
  const disponiveis = MQ().filter((m) => !m.emprestimo_atual && !['descartado', 'extraviado'].includes(m.status))
    .sort((a, b) => (['notebook', 'coletor'].includes(a.tipo) ? 0 : 1) - (['notebook', 'coletor'].includes(b.tipo) ? 0 : 1) || (a.ativo || a.hostname).localeCompare(b.ativo || b.hostname));
  const colaboradores = [...new Set(state.emprestimos.map((e) => e.colaborador))];
  const ACESSORIOS = ['Carregador', 'Mouse', 'Mochila / case', 'Headset', 'Coletor / leitor'];
  modal(`
    <form id="emp-form" autocomplete="off">
      <div class="modal-head"><h2>Novo empréstimo</h2></div>
      <div class="modal-body">
        <label>Equipamento *
          <span class="input-row"><input id="emp-maq" list="dl-emp-maq" class="mono" placeholder="Bipe a etiqueta ou digite patrimônio / hostname" value="${pre ? esc(pre.ativo || pre.hostname) : ''}">
          <button type="button" class="btn" id="emp-cam" title="Ler com a câmera">📷</button></span></label>
        <datalist id="dl-emp-maq">${disponiveis.map((m) => `<option value="${esc(m.ativo || m.hostname)}">${esc(m.hostname)} · ${esc(TIPO[m.tipo])} ${esc(m.modelo || '')}</option>`).join('')}</datalist>
        <div id="emp-maq-info">${cardMaquinaEmp(pre)}</div>
        <div class="form-grid">
          ${campo('colaborador', 'Colaborador *', '', 'text', 'required list="dl-emp-col"')}
          ${campo('matricula', 'Matrícula', '', 'text', 'class="mono"')}
          ${campo('setor', 'Setor', '', 'text', 'list="dl-emp-set"')}
          ${campo('contato', 'Telefone / ramal', '', 'tel')}
          <label class="full">Devolução prevista<input type="datetime-local" name="previsto" id="emp-prev"></label>
          <div class="full rapidos">
            <button type="button" class="chip-btn" data-prazo="8h">+8 h (fim do turno)</button>
            <button type="button" class="chip-btn" data-prazo="amanha">Amanhã 08:00</button>
            <button type="button" class="chip-btn" data-prazo="7d">+7 dias</button>
            <button type="button" class="chip-btn" data-prazo="">Sem data</button>
          </div>
          <div class="full"><span class="lbl">Acessórios entregues</span>
            <div class="checks">${ACESSORIOS.map((a) => `<label class="check"><input type="checkbox" name="acc" value="${a}"> ${a}</label>`).join('')}</div></div>
          <label class="full">Observações<textarea name="obs" placeholder="Estado do equipamento, riscos, etiqueta, etc."></textarea></label>
        </div>
        <datalist id="dl-emp-col">${colaboradores.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <datalist id="dl-emp-set">${setores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        <div>
          <div class="sig-head"><span class="lbl">Assinatura do colaborador</span><button type="button" class="btn btn--ghost btn--sm" id="sig-limpar">Limpar</button></div>
          <canvas class="sig" id="sig"></canvas>
          <p class="muted mini">Assine com o dedo, a caneta ou o mouse.</p>
        </div>
        <label class="check"><input type="checkbox" id="emp-termo" checked> Imprimir termo de responsabilidade ao salvar</label>
        <p class="erro" id="emp-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="emp-salvar">Registrar empréstimo</button></div>
    </form>`, (dlg) => {
    const ass = criarAssinatura($('#sig'));
    $('#sig-limpar').onclick = () => ass.limpar();
    const inp = $('#emp-maq');
    const resolver = () => { maq = acharMaquina(inp.value); $('#emp-maq-info').innerHTML = inp.value.trim() ? (maq ? cardMaquinaEmp(maq) : '<span class="erro">Equipamento não encontrado no inventário.</span>') : ''; };
    inp.oninput = resolver;
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); resolver(); $('#emp-form [name=colaborador]').focus(); } };
    $('#emp-cam').onclick = async () => { const v = await lerCamera(); if (v) { inp.value = extrairCodigo(v); resolver(); } };
    const setPrazo = (tipo) => {
      const d = new Date();
      if (tipo === '8h') d.setHours(d.getHours() + 8);
      else if (tipo === 'amanha') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
      else if (tipo === '7d') d.setDate(d.getDate() + 7);
      $('#emp-prev').value = tipo ? paraInputLocal(d) : '';
      $$('.chip-btn', dlg).forEach((b) => b.classList.toggle('on', b.dataset.prazo === tipo));
    };
    $$('.chip-btn', dlg).forEach((b) => (b.onclick = () => setPrazo(b.dataset.prazo)));
    setPrazo('8h');
    if (!pre) setTimeout(() => inp.focus(), 50);

    $('#emp-form').onsubmit = async (e) => {
      e.preventDefault();
      const erro = (t) => { $('#emp-erro').textContent = t; };
      resolver();
      if (!maq) return erro('Informe um equipamento válido.');
      if (maq.emprestimo_atual) return erro('Este equipamento já está emprestado. Registre a devolução antes.');
      const fd = new FormData(e.target);
      const colaborador = String(fd.get('colaborador') || '').trim();
      if (!colaborador) return erro('Informe o colaborador.');
      if (ass.vazia() && !(await confirmar('O termo vai sair sem a assinatura do colaborador.', { titulo: 'Registrar sem assinatura?', ok: 'Registrar assim mesmo' }))) return;
      const acc = fd.getAll('acc');
      const janela = $('#emp-termo').checked ? window.open('', '_blank') : null;
      $('#emp-salvar').disabled = true;
      const previsto = fd.get('previsto');
      const { data: novo, error } = await sb.from('emprestimos').insert({
        maquina_id: maq.id,
        colaborador,
        matricula: String(fd.get('matricula') || '').trim() || null,
        setor: String(fd.get('setor') || '').trim() || null,
        contato: String(fd.get('contato') || '').trim() || null,
        previsto_devolucao: previsto ? new Date(previsto).toISOString() : null,
        obs_retirada: [acc.length && 'Acessórios: ' + acc.join(', '), String(fd.get('obs') || '').trim()].filter(Boolean).join('\n') || null,
        assinatura_retirada: ass.imagem(),
      }).select('id').single();
      $('#emp-salvar').disabled = false;
      if (error) { janela?.close(); return erro(error.code === '23505' ? 'Este equipamento já tem um empréstimo em aberto.' : erroMsg(error)); }
      dlg.close();
      toast(`Empréstimo registrado: ${maq.hostname} → ${colaborador}`);
      if (janela) imprimirTermo(novo.id, janela);
      await Promise.all([recarregarMaquina(maq.id), carregarEmprestimos()]);
      if (state.drawerId === maq.id) abrirMaquina(maq.id, true);
      rerender();
    };
  });
}

export async function modalDevolucao(empId) {
  let e = state.emprestimos.find((x) => x.id === empId);
  if (!e) {
    const { data: d } = await sb.from('emprestimos').select(EMP_COLS + ', maquinas(hostname, ativo, modelo, tipo)').eq('id', empId).single();
    e = d;
  }
  if (!e) return toast('Empréstimo não encontrado', true);
  if (e.devolvido_em) return toast('Este empréstimo já foi devolvido');
  modal(`
    <form id="dev-form">
      <div class="modal-head"><h2>Registrar devolução</h2>
        <p class="muted" style="margin:4px 0 0"><b class="mono">${esc(e.maquinas?.hostname || '')}</b> · ${esc(e.colaborador)} · retirado ${dataHora(e.retirado_em)} (${duracao(Date.now() - new Date(e.retirado_em))})${atrasado(e) ? ' · ' + pill('atrasado', 'bad') : ''}</p></div>
      <div class="modal-body">
        ${e.obs_retirada ? `<div class="banner banner--info"><div><strong>Entregue com</strong><span>${esc(e.obs_retirada).replace(/\n/g, '<br>')}</span></div></div>` : ''}
        <div><span class="lbl">Condição do equipamento</span>
          <div class="checks">${Object.entries(COND).map(([k, l], i) => `<label class="check"><input type="radio" name="cond" value="${k}" ${i === 0 ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
        <label>Volta para<select name="status" id="dev-status">${opts([['estoque', 'Estoque'], ['em_uso', 'Em uso'], ['manutencao', 'Manutenção']], 'estoque')}</select></label>
        <label>Observações<textarea name="obs" placeholder="Avarias, itens faltando, etc."></textarea></label>
        <div>
          <div class="sig-head"><span class="lbl">Assinatura de quem devolveu (opcional)</span><button type="button" class="btn btn--ghost btn--sm" id="sig-limpar">Limpar</button></div>
          <canvas class="sig" id="sig"></canvas>
        </div>
        <p class="erro" id="dev-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="dev-salvar">Confirmar devolução</button></div>
    </form>`, (dlg) => {
    const ass = criarAssinatura($('#sig'));
    $('#sig-limpar').onclick = () => ass.limpar();
    $$('[name=cond]', dlg).forEach((r) => (r.onchange = () => { $('#dev-status').value = r.value === 'avaria' ? 'manutencao' : 'estoque'; }));
    $('#dev-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      $('#dev-salvar').disabled = true;
      const { data: upd, error } = await sb.from('emprestimos').update({
        devolvido_em: new Date().toISOString(),
        condicao_devolucao: fd.get('cond'),
        status_retorno: fd.get('status'),
        obs_devolucao: String(fd.get('obs') || '').trim() || null,
        assinatura_devolucao: ass.imagem(),
        recebido_por: state.user?.email,
      }).eq('id', e.id).is('devolvido_em', null).select('id');
      $('#dev-salvar').disabled = false;
      if (error) return ($('#dev-erro').textContent = erroMsg(error));
      if (!upd?.length) return ($('#dev-erro').textContent = 'Este empréstimo já havia sido devolvido.');
      dlg.close();
      toast(`Devolução registrada: ${e.maquinas?.hostname || ''}`);
      await Promise.all([recarregarMaquina(e.maquina_id), carregarEmprestimos()]);
      if (state.drawerId === e.maquina_id) abrirMaquina(e.maquina_id, true);
      rerender();
    };
  });
}

export async function imprimirTermo(id, janela) {
  const w = janela || window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para imprimir o termo.', true);
  w.document.write('<p style="font:16px sans-serif;padding:24px">Gerando termo…</p>');
  const { data: e, error } = await sb.from('emprestimos').select('*, maquinas(hostname, ativo, modelo, fabricante, numero_serie, tipo)').eq('id', id).single();
  if (error) { w.close(); return toast(erroMsg(error), true); }
  const m = e.maquinas || {};
  const linha = (l, v) => `<tr><th>${l}</th><td>${esc(v || '—')}</td></tr>`;
  const ass = (img, nome, legenda) => `<div class="ass">${img ? `<img src="${img}" alt="">` : '<div class="vazio"></div>'}<div class="nome">${esc(nome || '')}</div><div class="leg">${legenda}</div></div>`;
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de responsabilidade — ${esc(m.hostname)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font: 12.5px/1.5 "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; } .sub { color: #555; margin: 0 0 18px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; margin: 18px 0 6px; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
    th { width: 34%; color: #555; font-weight: 600; } ol { padding-left: 18px; margin: 6px 0; } li { margin: 3px 0; }
    .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 28px; }
    .ass img { height: 70px; max-width: 100%; display: block; object-fit: contain; object-position: left bottom; }
    .ass .vazio { height: 70px; } .ass .nome { border-top: 1px solid #111; padding-top: 4px; font-weight: 600; } .ass .leg { color: #555; font-size: 11px; }
    .rodape { margin-top: 26px; color: #777; font-size: 10.5px; } pre { font: inherit; white-space: pre-wrap; margin: 0; }
    @media screen { body { max-width: 760px; margin: 28px auto; padding: 0 20px; } }
    ${ESTILO_CLIENTE_DOC}
  </style></head><body>
  ${logoClienteDoc()}
  <h1>Termo de responsabilidade — empréstimo de equipamento</h1>
  <p class="sub">TI · Centro de Distribuição · Nº ${esc(e.id.slice(0, 8).toUpperCase())}</p>
  <h2>Equipamento</h2>
  <table>${linha('Hostname', m.hostname)}${linha('Patrimônio', m.ativo)}${linha('Tipo / modelo', [TIPO[m.tipo], m.fabricante, m.modelo].filter(Boolean).join(' · '))}${linha('Nº de série', m.numero_serie)}<tr><th>Acessórios e observações</th><td><pre>${esc(e.obs_retirada || 'Nenhum')}</pre></td></tr></table>
  <h2>Colaborador</h2>
  <table>${linha('Nome', e.colaborador)}${linha('Matrícula', e.matricula)}${linha('Setor', e.setor)}${linha('Contato', e.contato)}</table>
  <h2>Período</h2>
  <table>${linha('Retirada', dataHora(e.retirado_em))}${linha('Devolução prevista', e.previsto_devolucao ? dataHora(e.previsto_devolucao) : 'Sem data definida')}${linha('Entregue por', e.entregue_por)}
    ${e.devolvido_em ? linha('Devolvido em', dataHora(e.devolvido_em)) + linha('Condição na devolução', COND[e.condicao_devolucao]) + linha('Recebido por', e.recebido_por) + (e.obs_devolucao ? linha('Observações da devolução', e.obs_devolucao) : '') : ''}</table>
  <h2>Compromissos</h2>
  <ol>
    <li>Utilizar o equipamento exclusivamente para atividades de trabalho, zelando pela sua guarda e conservação.</li>
    <li>Devolver o equipamento e os acessórios listados na data prevista, nas mesmas condições em que foram recebidos.</li>
    <li>Comunicar imediatamente à TI qualquer defeito, dano, perda, furto ou roubo.</li>
    <li>Não instalar programas, alterar configurações nem retirar etiquetas de patrimônio sem autorização da TI.</li>
    <li>Estar ciente de que danos por mau uso ou extravio poderão ser apurados conforme as políticas internas da empresa.</li>
  </ol>
  <div class="assinaturas">
    ${ass(e.assinatura_retirada, e.colaborador, 'Colaborador — retirada')}
    ${e.devolvido_em ? ass(e.assinatura_devolucao, e.colaborador, 'Colaborador — devolução') : ass(null, (e.entregue_por || '').split('@')[0], 'TI — responsável pela entrega')}
  </div>
  <p class="rodape">Documento gerado pelo Inventário Quallit em ${dataHora(new Date().toISOString())}.</p>
  </body></html>`);
  w.document.close();
  imprimirQuandoPronto(w);
}
