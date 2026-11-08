// Inventário Quallit — termos de uso (equipamento fixo do colaborador) e desligamento.
// "Posse" = equipamento de uso individual, sem prazo, com termo assinado. No desligamento, a tela
// lista tudo o que está com a pessoa (termos + empréstimos), imprime a lista de recolhimento e
// registra a devolução de tudo de uma vez.
import { criarAssinatura } from '../assinatura.js';
import { recarregarMaquina } from '../dados.js';
import { $, $$, MQ, TIPO, acharMaquina, dataHora, debounce, erroMsg, esc, extrairCodigo, noCD, pill, rel, sb, setores, state, statusPill, toast, up } from '../nucleo.js';
import { ehErroDeRede } from '../offline.js';
import { rerender } from '../rotas.js';
import { lerCamera } from './inventarios.js';
import { abrirMaquina, campo, modal, opts } from './maquinas.js';
import { COND, carregarEmprestimos } from './emprestimos.js';

export const POSSE_COLS = 'id, maquina_id, cd_id, colaborador, matricula, cargo, setor, contato, entregue_em, entregue_por, obs_entrega, devolvido_em, motivo_devolucao, condicao_devolucao, status_retorno, obs_devolucao, recebido_por';
export const MOTIVO = { desligamento: 'Desligamento', troca: 'Troca de equipamento', devolucao: 'Devolução', outro: 'Outro' };
const MAQ_COLS = 'maquinas(hostname, ativo, modelo, tipo, fabricante, numero_serie)';
const ACESSORIOS = ['Carregador', 'Mouse', 'Teclado', 'Monitor', 'Mochila / case', 'Headset', 'Dock / base', 'Coletor / leitor', 'Bateria extra'];

export async function carregarPosses() {
  const { data: d, error } = await sb.from('posses').select(`${POSSE_COLS}, ${MAQ_COLS}`).order('entregue_em', { ascending: false }).limit(3000);
  if (error) { if (!ehErroDeRede(error) && !/posses|schema cache/.test(error.message)) toast(erroMsg(error), true); state.posses = []; return; }
  state.posses = d || [];
}

export const abasEmprestimos = (aba) => `<div class="tabs tabs--page">
  <a class="tab ${aba === 'emprestimos' ? 'active' : ''}" href="#emprestimos">Empréstimos</a>
  <a class="tab ${aba === 'termos' ? 'active' : ''}" href="#emprestimos/termos">Termos de uso</a>
  <a class="tab ${aba === 'colaboradores' ? 'active' : ''}" href="#emprestimos/colaboradores">Colaboradores e desligamento</a></div>`;

const host = (x) => x.maquinas?.hostname || '(removida)';
const chave = (nome) => up(String(nome || '').trim());

/* ---------------------------------------------------------------- aba "Termos de uso" */
export function renderTermos() {
  const el = $('#view-emprestimos');
  const P = (state.posses || []).filter(noCD);
  const abertas = P.filter((p) => !p.devolvido_em);
  const busca = $('#ps-busca')?.value || '';
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Empréstimos e termos</h1><p>Equipamento fixo de cada colaborador, com termo de responsabilidade assinado na tela. Diferente do empréstimo, não tem data de devolução.</p></div>
      <div class="actions"><button class="btn btn--primary" id="btn-nova-posse">+ Entregar com termo</button></div>
    </div>
    ${abasEmprestimos('termos')}
    <div class="kpis">
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Com termo agora</div><div class="kpi-value">${abertas.length}</div><div class="kpi-sub">equipamentos</div></div>
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Colaboradores</div><div class="kpi-value">${new Set(abertas.map((p) => chave(p.colaborador))).size}</div><div class="kpi-sub">com equipamento</div></div>
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Devolvidos (30 dias)</div><div class="kpi-value">${P.filter((p) => p.devolvido_em && Date.now() - new Date(p.devolvido_em) < 30 * 864e5).length}</div><div class="kpi-sub">inclui desligamentos</div></div>
    </div>
    <div class="card">
      <div class="toolbar"><h2 style="margin-right:auto">Termos</h2>
        <select id="ps-filtro">${opts([['abertos', 'Em vigor'], ['todos', 'Todos (com devolvidos)']], state.psFiltro || 'abertos')}</select>
        <div class="search" style="flex:0 1 320px"><input id="ps-busca" type="search" placeholder="Colaborador, matrícula, patrimônio…" value="${esc(busca)}"></div></div>
      <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>Equipamento</th><th>Colaborador</th><th>Entregue</th><th>Situação</th><th></th></tr></thead><tbody id="ps-lista"></tbody></table></div>
    </div>`;
  const desenhar = () => {
    state.psFiltro = $('#ps-filtro').value;
    const termos = up($('#ps-busca').value).split(/\s+/).filter(Boolean);
    const lista = P.filter((p) => state.psFiltro === 'todos' || !p.devolvido_em)
      .filter((p) => { const t = up([p.colaborador, p.matricula, p.setor, p.cargo, host(p), p.maquinas?.ativo].join(' ')); return termos.every((x) => t.includes(x)); });
    $('#ps-lista').innerHTML = lista.length ? lista.map((p) => `<tr data-maq="${p.maquina_id}">
      <td class="host"><span class="mono">${esc(host(p))}</span><span class="sub mono">${esc(p.maquinas?.ativo || '')} · ${esc(TIPO[p.maquinas?.tipo] || '')}</span></td>
      <td>${esc(p.colaborador)}<span class="sub">${esc([p.matricula, p.cargo, p.setor].filter(Boolean).join(' · '))}</span></td>
      <td>${dataHora(p.entregue_em)}<span class="sub">${rel(p.entregue_em)}</span></td>
      <td>${p.devolvido_em ? `${pill(MOTIVO[p.motivo_devolucao] || 'Devolvido', p.motivo_devolucao === 'desligamento' ? 'warn' : '')}<span class="sub">${dataHora(p.devolvido_em)}${p.condicao_devolucao && p.condicao_devolucao !== 'ok' ? ' · ' + esc(COND[p.condicao_devolucao]) : ''}</span>` : pill('em vigor', 'ok')}</td>
      <td class="acoes">${p.devolvido_em ? '' : `<button class="btn btn--sm" data-devolver-posse="${p.id}">Devolução</button> `}<button class="btn btn--sm btn--ghost" data-termo-posse="${p.id}">Termo</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">${P.length ? 'Nada encontrado.' : 'Nenhum termo ainda. Use “+ Entregar com termo” ou, na ficha da máquina, “Termo de uso”.'}</td></tr>`;
  };
  desenhar();
  $('#ps-busca').oninput = debounce(desenhar, 120);
  $('#ps-filtro').onchange = desenhar;
  $('#btn-nova-posse').onclick = () => modalPosse();
  el.onclick = (ev) => {
    const dv = ev.target.closest('[data-devolver-posse]'); if (dv) return modalDevolucaoPosse([dv.dataset.devolverPosse]);
    const tm = ev.target.closest('[data-termo-posse]'); if (tm) return imprimirTermoPosse(tm.dataset.termoPosse);
    if (ev.target.closest('button, input, a, select')) return;
    const tr = ev.target.closest('tr[data-maq]'); if (tr) abrirMaquina(tr.dataset.maq);
  };
}

/* ---------------------------------------------------------------- aba "Colaboradores e desligamento" */
function pessoas() {
  const mapa = new Map();
  const add = (nome, matricula, item) => {
    const k = chave(nome); if (!k) return;
    if (!mapa.has(k)) mapa.set(k, { nome, matriculas: new Set(), setores: new Set(), itens: [] });
    const p = mapa.get(k);
    if (matricula) p.matriculas.add(matricula);
    if (item.setor) p.setores.add(item.setor);
    p.itens.push(item);
  };
  for (const p of (state.posses || []).filter(noCD)) if (!p.devolvido_em) add(p.colaborador, p.matricula, { tipo: 'posse', id: p.id, maquina_id: p.maquina_id, maq: p.maquinas, desde: p.entregue_em, setor: p.setor, obs: p.obs_entrega });
  for (const e of (state.emprestimos || []).filter(noCD)) if (!e.devolvido_em) add(e.colaborador, e.matricula, { tipo: 'emprestimo', id: e.id, maquina_id: e.maquina_id, maq: e.maquinas, desde: e.retirado_em, setor: e.setor, obs: e.obs_retirada, previsto: e.previsto_devolucao });
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function renderColaboradores() {
  const el = $('#view-emprestimos');
  const lista = pessoas();
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Empréstimos e termos</h1><p>Tudo o que está com cada colaborador (termos de uso e empréstimos). No <b>desligamento</b>, gere a lista de recolhimento e registre a devolução de tudo de uma vez.</p></div>
    </div>
    ${abasEmprestimos('colaboradores')}
    <div class="card">
      <div class="toolbar"><h2 style="margin-right:auto">${lista.length} colaborador(es) com equipamento</h2>
        <div class="search" style="flex:0 1 320px"><input id="cb-busca" type="search" placeholder="Nome, matrícula ou setor…"></div></div>
      <div class="table-wrap" style="max-height:640px"><table><thead><tr><th>Colaborador</th><th>Equipamentos</th><th></th></tr></thead><tbody id="cb-lista"></tbody></table></div>
    </div>`;
  const desenhar = () => {
    const termos = up($('#cb-busca').value).split(/\s+/).filter(Boolean);
    const vis = lista.filter((p) => { const t = up([p.nome, ...p.matriculas, ...p.setores].join(' ')); return termos.every((x) => t.includes(x)); });
    $('#cb-lista').innerHTML = vis.length ? vis.map((p, i) => `<tr>
      <td><strong>${esc(p.nome)}</strong><span class="sub">${esc([...p.matriculas, ...p.setores].join(' · '))}</span></td>
      <td>${p.itens.map((it) => `<div>${it.tipo === 'posse' ? pill('termo', 'ok') : pill('empréstimo', 'info')} <span class="mono">${esc(it.maq?.ativo || it.maq?.hostname || '')}</span> <span class="muted">${esc(TIPO[it.maq?.tipo] || '')} ${esc(it.maq?.modelo || '')}</span></div>`).join('')}</td>
      <td class="acoes"><button class="btn btn--sm btn--danger" data-deslig="${lista.indexOf(p)}">Desligamento</button></td></tr>`).join('')
      : `<tr><td colspan="3" class="empty">${lista.length ? 'Nada encontrado.' : 'Nenhum colaborador com equipamento no momento.'}</td></tr>`;
  };
  desenhar();
  $('#cb-busca').oninput = debounce(desenhar, 120);
  el.onclick = (ev) => { const b = ev.target.closest('[data-deslig]'); if (b) modalDesligamento(lista[+b.dataset.deslig]); };
}

function modalDesligamento(p) {
  modal(`
    <div class="modal-head"><h2>Desligamento — ${esc(p.nome)}</h2>
      <p class="muted" style="margin:4px 0 0">${p.itens.length} item(ns) com o colaborador. Imprima a lista para conferir na entrega e registre a devolução do que voltou.</p></div>
    <div class="modal-body">
      <table class="mini-table"><thead><tr><th></th><th>Equipamento</th><th>Tipo</th><th>Desde</th><th>Acessórios / observações</th></tr></thead><tbody>
        ${p.itens.map((it, i) => `<tr><td><input type="checkbox" data-i="${i}" checked></td>
          <td class="mono">${esc(it.maq?.ativo || '—')}<br><span class="muted">${esc(it.maq?.hostname || '')}</span></td>
          <td>${it.tipo === 'posse' ? 'Termo de uso' : 'Empréstimo'}<br><span class="muted">${esc(TIPO[it.maq?.tipo] || '')} ${esc(it.maq?.modelo || '')}</span></td>
          <td>${dataHora(it.desde)}</td><td style="white-space:pre-wrap">${esc(it.obs || '—')}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Fechar</button><button class="btn" id="dl-imprimir">🖨️ Lista de recolhimento</button><button class="btn btn--primary" id="dl-devolver">Registrar devolução dos marcados</button></div>`, (dlg) => {
    const marcados = () => $$('[data-i]', dlg).filter((c) => c.checked).map((c) => p.itens[+c.dataset.i]);
    $('#dl-imprimir', dlg).onclick = () => imprimirRecolhimento(p);
    $('#dl-devolver', dlg).onclick = () => {
      const it = marcados(); if (!it.length) return toast('Marque pelo menos um item', true);
      dlg.close();
      modalDevolucaoPosse(it.filter((x) => x.tipo === 'posse').map((x) => x.id), { desligamento: true, emprestimos: it.filter((x) => x.tipo === 'emprestimo').map((x) => x.id), colaborador: p.nome });
    };
  });
}

/* ---------------------------------------------------------------- entregar com termo */
export function modalPosse(pre = null) {
  let maq = pre;
  const disponiveis = MQ().filter((m) => !m.posse_atual && !m.emprestimo_atual && !['descartado', 'extraviado'].includes(m.status))
    .sort((a, b) => (a.ativo || a.hostname).localeCompare(b.ativo || b.hostname));
  const nomes = [...new Set([...(state.posses || []), ...(state.emprestimos || [])].map((x) => x.colaborador))];
  const cardMaq = (m) => !m ? '' : `<div class="emp-maq ${m.posse_atual || m.emprestimo_atual ? 'emp-maq--bad' : ''}"><div class="emp-maq-top"><strong class="mono">${esc(m.hostname)}</strong>${statusPill(m.status)}</div>
    <span>${esc([m.ativo && 'Patrimônio ' + m.ativo, TIPO[m.tipo], m.modelo].filter(Boolean).join(' · '))}</span>
    ${m.posse_atual ? `<span class="erro">Já está com ${esc(m.posse_atual.colaborador)} (termo de uso)</span>` : m.emprestimo_atual ? `<span class="erro">Emprestado para ${esc(m.emprestimo_atual.colaborador)}</span>` : ''}</div>`;
  modal(`
    <form id="ps-form" autocomplete="off">
      <div class="modal-head"><h2>Entregar equipamento com termo</h2><p class="muted" style="margin:4px 0 0">Equipamento de uso individual, sem data de devolução.</p></div>
      <div class="modal-body">
        <label>Equipamento *
          <span class="input-row"><input id="ps-maq" list="dl-ps-maq" class="mono" placeholder="Bipe a etiqueta ou digite patrimônio / hostname" value="${pre ? esc(pre.ativo || pre.hostname) : ''}">
          <button type="button" class="btn" id="ps-cam" title="Ler com a câmera">📷</button></span></label>
        <datalist id="dl-ps-maq">${disponiveis.map((m) => `<option value="${esc(m.ativo || m.hostname)}">${esc(m.hostname)} · ${esc(TIPO[m.tipo])} ${esc(m.modelo || '')}</option>`).join('')}</datalist>
        <div id="ps-maq-info">${cardMaq(pre)}</div>
        <div class="form-grid">
          ${campo('colaborador', 'Colaborador *', '', 'text', 'required list="dl-ps-col"')}
          ${campo('matricula', 'Matrícula', '', 'text', 'class="mono"')}
          ${campo('cargo', 'Cargo / função', '')}
          ${campo('setor', 'Setor', pre?.setor || '', 'text', 'list="dl-ps-set"')}
          ${campo('contato', 'Telefone / e-mail', '')}
          <div class="full"><span class="lbl">Acessórios entregues</span>
            <div class="checks">${ACESSORIOS.map((a) => `<label class="check"><input type="checkbox" name="acc" value="${a}"> ${a}</label>`).join('')}</div></div>
          <label class="full">Estado / observações<textarea name="obs" placeholder="Arranhões, etiqueta, carregador original, etc."></textarea></label>
        </div>
        <datalist id="dl-ps-col">${nomes.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <datalist id="dl-ps-set">${setores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        <div>
          <div class="sig-head"><span class="lbl">Assinatura do colaborador</span><button type="button" class="btn btn--ghost btn--sm" id="sig-limpar">Limpar</button></div>
          <canvas class="sig" id="sig"></canvas>
        </div>
        <label class="check"><input type="checkbox" id="ps-termo" checked> Imprimir o termo ao salvar</label>
        <p class="erro" id="ps-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="ps-salvar">Registrar entrega</button></div>
    </form>`, (dlg) => {
    const ass = criarAssinatura($('#sig'));
    $('#sig-limpar').onclick = () => ass.limpar();
    const inp = $('#ps-maq');
    const resolver = () => { maq = acharMaquina(inp.value); $('#ps-maq-info').innerHTML = inp.value.trim() ? (maq ? cardMaq(maq) : '<span class="erro">Equipamento não encontrado no inventário.</span>') : ''; };
    inp.oninput = resolver;
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); resolver(); $('#ps-form [name=colaborador]').focus(); } };
    $('#ps-cam').onclick = async () => { const v = await lerCamera(); if (v) { inp.value = extrairCodigo(v); resolver(); } };
    if (!pre) setTimeout(() => inp.focus(), 50);
    $('#ps-form').onsubmit = async (e) => {
      e.preventDefault();
      const erro = (t) => { $('#ps-erro').textContent = t; };
      resolver();
      if (!maq) return erro('Informe um equipamento válido.');
      if (maq.posse_atual) return erro(`Este equipamento já está com ${maq.posse_atual.colaborador}. Registre a devolução antes.`);
      if (maq.emprestimo_atual) return erro('Este equipamento está emprestado. Registre a devolução do empréstimo antes.');
      const fd = new FormData(e.target);
      const colaborador = String(fd.get('colaborador') || '').trim();
      if (!colaborador) return erro('Informe o colaborador.');
      if (ass.vazia()) return erro('Peça a assinatura do colaborador: o termo de uso precisa dela.');
      const acc = fd.getAll('acc');
      const janela = $('#ps-termo').checked ? window.open('', '_blank') : null;
      $('#ps-salvar').disabled = true;
      const t = (k) => String(fd.get(k) || '').trim() || null;
      const { data: novo, error } = await sb.from('posses').insert({
        maquina_id: maq.id, colaborador, matricula: t('matricula'), cargo: t('cargo'), setor: t('setor'), contato: t('contato'),
        obs_entrega: [acc.length && 'Acessórios: ' + acc.join(', '), t('obs')].filter(Boolean).join('\n') || null,
        assinatura_entrega: ass.imagem(),
      }).select('id').single();
      $('#ps-salvar').disabled = false;
      if (error) { janela?.close(); return erro(error.code === '23505' ? 'Este equipamento já tem um termo em vigor.' : /posses|schema cache/.test(error.message) ? 'Aplique as migrações do banco antes (veja o README).' : erroMsg(error)); }
      dlg.close();
      toast(`Termo registrado: ${maq.hostname} → ${colaborador}`);
      if (janela) imprimirTermoPosse(novo.id, janela);
      await Promise.all([recarregarMaquina(maq.id), carregarPosses()]);
      if (state.drawerId === maq.id) abrirMaquina(maq.id, true);
      rerender();
    };
  });
}

/* ---------------------------------------------------------------- devolução (uma ou várias; desligamento) */
export async function modalDevolucaoPosse(ids, { desligamento = false, emprestimos = [], colaborador = '' } = {}) {
  const itens = (state.posses || []).filter((p) => ids.includes(p.id) && !p.devolvido_em);
  const total = itens.length + emprestimos.length;
  if (!total) return toast('Nada para devolver', true);
  modal(`
    <form id="dp-form">
      <div class="modal-head"><h2>${desligamento ? 'Devolução por desligamento' : 'Registrar devolução'}</h2>
        <p class="muted" style="margin:4px 0 0">${total} item(ns)${colaborador || itens[0] ? ' · ' + esc(colaborador || itens[0].colaborador) : ''}: ${[...itens.map((p) => p.maquinas?.ativo || host(p)), ...emprestimos.map((id) => (state.emprestimos.find((e) => e.id === id)?.maquinas?.ativo) || 'empréstimo')].map(esc).join(', ')}</p></div>
      <div class="modal-body">
        <label>Motivo<select name="motivo">${opts(Object.entries(MOTIVO), desligamento ? 'desligamento' : 'devolucao')}</select></label>
        <div><span class="lbl">Condição dos equipamentos</span>
          <div class="checks">${Object.entries(COND).map(([k, l], i) => `<label class="check"><input type="radio" name="cond" value="${k}" ${i === 0 ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
        <label>Voltam para<select name="status" id="dp-status">${opts([['estoque', 'Estoque'], ['manutencao', 'Manutenção'], ['em_uso', 'Em uso']], 'estoque')}</select></label>
        <label>Observações<textarea name="obs" placeholder="Itens faltando, avarias, carregador não devolvido…"></textarea></label>
        <div>
          <div class="sig-head"><span class="lbl">Assinatura de quem devolveu</span><button type="button" class="btn btn--ghost btn--sm" id="sig-limpar">Limpar</button></div>
          <canvas class="sig" id="sig"></canvas>
        </div>
        <p class="erro" id="dp-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="dp-salvar">Confirmar devolução</button></div>
    </form>`, (dlg) => {
    const ass = criarAssinatura($('#sig'));
    $('#sig-limpar').onclick = () => ass.limpar();
    $$('[name=cond]', dlg).forEach((r) => (r.onchange = () => { $('#dp-status').value = r.value === 'avaria' ? 'manutencao' : 'estoque'; }));
    $('#dp-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const agora = new Date().toISOString();
      const obs = String(fd.get('obs') || '').trim() || null;
      $('#dp-salvar').disabled = true;
      const falhas = [];
      if (itens.length) {
        const { error } = await sb.from('posses').update({
          devolvido_em: agora, motivo_devolucao: fd.get('motivo'), condicao_devolucao: fd.get('cond'), status_retorno: fd.get('status'),
          obs_devolucao: obs, assinatura_devolucao: ass.imagem(), recebido_por: state.user?.email,
        }).in('id', itens.map((p) => p.id)).is('devolvido_em', null);
        if (error) falhas.push(erroMsg(error));
      }
      if (emprestimos.length) {
        const { error } = await sb.from('emprestimos').update({
          devolvido_em: agora, condicao_devolucao: fd.get('cond'), status_retorno: fd.get('status'),
          obs_devolucao: [fd.get('motivo') === 'desligamento' && 'Devolvido no desligamento', obs].filter(Boolean).join(' · ') || null,
          assinatura_devolucao: ass.imagem(), recebido_por: state.user?.email,
        }).in('id', emprestimos).is('devolvido_em', null);
        if (error) falhas.push(erroMsg(error));
      }
      $('#dp-salvar').disabled = false;
      if (falhas.length) return ($('#dp-erro').textContent = falhas.join(' · '));
      dlg.close();
      toast(`Devolução registrada: ${total} item(ns)`);
      const maqs = [...itens.map((p) => p.maquina_id), ...emprestimos.map((id) => state.emprestimos.find((e) => e.id === id)?.maquina_id).filter(Boolean)];
      await Promise.all([...maqs.map(recarregarMaquina), carregarPosses(), carregarEmprestimos()]);
      if (maqs.includes(state.drawerId)) abrirMaquina(state.drawerId, true);
      rerender();
    };
  });
}

/* ---------------------------------------------------------------- impressos */
const estiloDoc = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 12.5px/1.5 "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; } .sub { color: #555; margin: 0 0 18px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; margin: 18px 0 6px; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { color: #555; font-weight: 600; } .k th { width: 34%; } ol { padding-left: 18px; margin: 6px 0; } li { margin: 3px 0; }
  .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 28px; }
  .ass img { height: 70px; max-width: 100%; display: block; object-fit: contain; object-position: left bottom; }
  .ass .vazio { height: 70px; } .ass .nome { border-top: 1px solid #111; padding-top: 4px; font-weight: 600; } .ass .leg { color: #555; font-size: 11px; }
  .rodape { margin-top: 26px; color: #777; font-size: 10.5px; } pre { font: inherit; white-space: pre-wrap; margin: 0; }
  .ok { width: 22px; height: 16px; border: 1px solid #555; display: inline-block; }
  @media screen { body { max-width: 760px; margin: 28px auto; padding: 0 20px; } }`;
function escreverDoc(w, titulo, corpo) {
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${estiloDoc}</style></head><body>${corpo}
    <p class="rodape">Documento gerado pelo Inventário Quallit em ${dataHora(new Date().toISOString())}.</p></body></html>`);
  w.document.close();
  // imprime pelo código do painel (a política de segurança CSP bloqueia script embutido)
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* janela fechada */ } }, 400);
}
const assinatura = (img, nome, legenda) => `<div class="ass">${img ? `<img src="${img}" alt="">` : '<div class="vazio"></div>'}<div class="nome">${esc(nome || '')}</div><div class="leg">${legenda}</div></div>`;

export async function imprimirTermoPosse(id, janela) {
  const w = janela || window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para imprimir o termo.', true);
  w.document.write('<p style="font:16px sans-serif;padding:24px">Gerando termo…</p>');
  const { data: p, error } = await sb.from('posses').select('*, ' + MAQ_COLS).eq('id', id).single();
  if (error) { w.close(); return toast(erroMsg(error), true); }
  const m = p.maquinas || {};
  const linha = (l, v) => `<tr><th>${l}</th><td>${esc(v || '—')}</td></tr>`;
  escreverDoc(w, `Termo de uso — ${m.ativo || m.hostname}`, `
    <h1>Termo de responsabilidade — equipamento de uso individual</h1>
    <p class="sub">TI · Centro de Distribuição · Nº ${esc(p.id.slice(0, 8).toUpperCase())}</p>
    <h2>Equipamento</h2>
    <table class="k">${linha('Patrimônio', m.ativo)}${linha('Hostname', m.hostname)}${linha('Tipo / modelo', [TIPO[m.tipo], m.fabricante, m.modelo].filter(Boolean).join(' · '))}${linha('Nº de série', m.numero_serie)}<tr><th>Acessórios e estado na entrega</th><td><pre>${esc(p.obs_entrega || 'Nenhum')}</pre></td></tr></table>
    <h2>Colaborador</h2>
    <table class="k">${linha('Nome', p.colaborador)}${linha('Matrícula', p.matricula)}${linha('Cargo / função', p.cargo)}${linha('Setor', p.setor)}${linha('Contato', p.contato)}</table>
    <h2>Entrega${p.devolvido_em ? ' e devolução' : ''}</h2>
    <table class="k">${linha('Entregue em', dataHora(p.entregue_em))}${linha('Entregue por', p.entregue_por)}
      ${p.devolvido_em ? linha('Devolvido em', dataHora(p.devolvido_em)) + linha('Motivo', MOTIVO[p.motivo_devolucao]) + linha('Condição', COND[p.condicao_devolucao]) + linha('Recebido por', p.recebido_por) + (p.obs_devolucao ? linha('Observações', p.obs_devolucao) : '') : ''}</table>
    <h2>Compromissos</h2>
    <ol>
      <li>Recebo o equipamento acima para uso individual nas minhas atividades de trabalho, em perfeito estado, e me responsabilizo pela sua guarda e conservação.</li>
      <li>Devolverei o equipamento e os acessórios listados quando solicitado pela TI, em caso de troca ou no meu desligamento da empresa, nas mesmas condições em que os recebi, salvo o desgaste natural de uso.</li>
      <li>Comunicarei imediatamente à TI qualquer defeito, dano, perda, furto ou roubo (com boletim de ocorrência quando for o caso).</li>
      <li>Não instalarei programas, não alterarei configurações de segurança nem retirarei etiquetas de patrimônio sem autorização da TI.</li>
      <li>Estou ciente de que danos por mau uso ou extravio poderão ser apurados conforme as políticas internas da empresa.</li>
    </ol>
    <div class="assinaturas">
      ${assinatura(p.assinatura_entrega, p.colaborador, 'Colaborador — recebimento')}
      ${p.devolvido_em ? assinatura(p.assinatura_devolucao, p.colaborador, 'Colaborador — devolução') : assinatura(null, (p.entregue_por || '').split('@')[0], 'TI — responsável pela entrega')}
    </div>`);
}

function imprimirRecolhimento(p) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para imprimir a lista.', true);
  escreverDoc(w, `Recolhimento — ${p.nome}`, `
    <h1>Lista de recolhimento de equipamentos — desligamento</h1>
    <p class="sub">TI · Centro de Distribuição · ${dataHora(new Date().toISOString())}</p>
    <h2>Colaborador</h2>
    <table class="k"><tr><th>Nome</th><td>${esc(p.nome)}</td></tr><tr><th>Matrícula</th><td>${esc([...p.matriculas].join(', ') || '—')}</td></tr><tr><th>Setor</th><td>${esc([...p.setores].join(', ') || '—')}</td></tr></table>
    <h2>Itens a devolver (${p.itens.length})</h2>
    <table><thead><tr><th>Devolvido</th><th>Patrimônio</th><th>Equipamento</th><th>Nº de série</th><th>Acessórios entregues</th></tr></thead><tbody>
      ${p.itens.map((it) => `<tr><td><span class="ok"></span></td><td><b>${esc(it.maq?.ativo || '—')}</b><br>${esc(it.maq?.hostname || '')}</td>
        <td>${esc([TIPO[it.maq?.tipo], it.maq?.fabricante, it.maq?.modelo].filter(Boolean).join(' · '))}<br><span style="color:#777">${it.tipo === 'posse' ? 'Termo de uso' : 'Empréstimo'} desde ${dataHora(it.desde)}</span></td>
        <td>${esc(it.maq?.numero_serie || '—')}</td><td style="white-space:pre-wrap">${esc(it.obs || '—')}</td></tr>`).join('')}
    </tbody></table>
    <p style="margin-top:14px">Observações: _____________________________________________________________________________</p>
    <div class="assinaturas">
      ${assinatura(null, p.nome, 'Colaborador — entreguei os itens marcados')}
      ${assinatura(null, (state.perfil?.nome || state.user?.email || '').split('@')[0], 'TI — recebi os itens marcados')}
    </div>`);
}

// histórico de quem já teve a máquina (termos + empréstimos), para a ficha
export async function historicoResponsaveis(maquinaId) {
  const { data: d } = await sb.from('posses').select('id, colaborador, matricula, entregue_em, devolvido_em, motivo_devolucao, condicao_devolucao').eq('maquina_id', maquinaId).order('entregue_em', { ascending: false }).limit(30);
  return d || [];
}
