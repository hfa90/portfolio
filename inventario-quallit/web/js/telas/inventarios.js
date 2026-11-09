// Inventário Quallit — tela: inventarios (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { carregarMaquinas, recarregarMaquina } from '../dados.js';
import { confirmar } from '../dialogos.js';
import { $, $$, STATUS, TIPO, acharMaquina, beep, cdCod, cdNome, cdsAtivos, data, dataHora, debounce, dot, ehAdmin, erroMsg, esc, extrairCodigo, gb, mostrarColCD, noCD, pill, rel, sb, soFamilia, state, store, toast, up, titulo } from '../nucleo.js';
import { ehErroDeRede, filaAdicionar, filaListar, idbGet, idbSet } from '../offline.js';
import { DIAS_SEMANA, anelPrazo, descreverAgendamento, estadoPrazo, etiquetaPrazo, fmtDuracao, proximasExecucoes, relogioCompleto } from '../prazo.js';
import { copiarTexto, linkWhatsApp, montarResumo } from '../resumo.js';
import { atualizarPendentes, definirOffline } from '../sincronia.js';
import { baseIndex } from '../telas/etiquetas.js';
import { abrirMaquina, baixarBlob, campo, hojeISO, modal, modalNovaMaquina, opts, planilhaSimples } from '../telas/maquinas.js';
import { relatorioInventario } from '../telas/relatorios.js';

/* =====================================================================
   CONFERÊNCIA física (leitor de código de barras / câmera)
   ===================================================================== */
/* =====================================================================
   INVENTÁRIOS PROGRAMADOS (agendamentos)
   ===================================================================== */
export const ICO_REC = { unica: '📌', diaria: '🔁', semanal: '🗓️', mensal: '📆' };
export const REC = { unica: 'Única vez', diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' };
export const abasInventario = (aba) => `<div class="tabs tabs--page"><a class="tab ${aba === 'lista' ? 'active' : ''}" href="#conferencia">Inventários</a><a class="tab ${aba === 'agendados' ? 'active' : ''}" href="#conferencia/agendados">Agendados</a></div>`;

export async function renderAgendados() {
  state.conf = null;
  const el = $('#view-conferencia');
  el.innerHTML = `<div class="view-head">${titulo('Inventários', '', `Inventários programados: no horário, cada CD recebe um inventário aberto com prazo para concluir.`)}
      <div class="actions">${ehAdmin() ? '<button class="btn btn--primary" id="btn-novo-ag">+ Programar inventário</button>' : ''}</div></div>
    ${abasInventario('agendados')}<div id="ag-corpo"><div class="skeleton">Carregando…</div></div>`;
  $('#btn-novo-ag')?.addEventListener('click', () => modalAgendamento());
  try { await sb.rpc('gerar_inventarios_agendados'); } catch { /* ok */ }
  const { data: ags, error } = await sb.from('agendamentos').select('*').order('criado_em', { ascending: false });
  const corpo = $('#ag-corpo');
  if (!corpo) return;
  if (error) {
    corpo.innerHTML = /agendamentos|does not exist|schema cache/i.test(error.message)
      ? '<div class="card card-pad"><h2>Falta um passo no banco</h2><p class="muted">Aplique as migrações do banco (<code>supabase db push --remote</code>; veja o README) para liberar os inventários programados.</p></div>'
      : `<div class="card card-pad erro">${esc(erroMsg(error))}</div>`;
    return;
  }
  const lista = ags.filter((a) => !state.cdAtual || !a.cd_id || a.cd_id === state.cdAtual);
  if (!lista.length) {
    corpo.innerHTML = `<div class="card card-pad empty"><h2>Nenhum inventário programado</h2>
      <p>${ehAdmin() ? 'Programe inventários diários, semanais ou mensais para um CD ou para todos, com prazo para concluir.' : 'O administrador ainda não programou inventários para o seu CD.'}</p>
      ${ehAdmin() ? '<div class="actions" style="justify-content:center"><button class="btn btn--primary" id="btn-novo-ag2">+ Programar inventário</button></div>' : ''}</div>`;
    $('#btn-novo-ag2')?.addEventListener('click', () => modalAgendamento());
    return;
  }
  const ordenados = [...lista].sort((a, b) => (b.ativo - a.ativo) || new Date(a.proxima_execucao || 8.64e15) - new Date(b.proxima_execucao || 8.64e15));
  corpo.innerHTML = `<div class="ag-lista">${ordenados.map((a) => {
    const prox = a.ativo && a.proxima_execucao ? new Date(a.proxima_execucao) : null;
    const pseudo = prox ? { status: 'aberta', inicio_em: a.proxima_execucao, prazo_em: new Date(prox.getTime() + a.prazo_horas * 3600_000).toISOString() } : null;
    const situ = a.ativo ? (prox ? 'Ativo' : 'Sem próximas datas') : a.recorrencia === 'unica' && a.ultima_execucao ? 'Executado' : 'Pausado';
    return `<div class="card ag-card ${a.ativo ? '' : 'ag-off'}">
      <span class="ag-ico">${ICO_REC[a.recorrencia]}</span>
      <div class="ag-txt">
        <div class="ag-tit"><strong>${esc(a.nome)}</strong>${a.cd_id ? `<span class="pill pill--cd">${esc(cdCod(a.cd_id))}</span>` : '<span class="pill pill--brand">Todos os CDs</span>'}${a.setor ? `<span class="pill">${esc(a.setor)}</span>` : ''}${pill(situ, a.ativo ? 'ok' : '')}</div>
        <span class="ag-desc">${esc(descreverAgendamento(a))}</span>
        <span class="ag-quando">${prox ? `Próximo: <b>${prox.toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</b> ${etiquetaPrazo(pseudo)}` : ''}${a.ultima_execucao ? ` <span class="muted">· último ${dataHora(a.ultima_execucao)}</span>` : ''}</span>
      </div>
      ${ehAdmin() ? `<div class="ag-acoes"><button class="btn btn--sm" data-ag-ed="${a.id}">Editar</button>
        <button class="btn btn--sm btn--ghost" data-ag-tg="${a.id}">${a.ativo ? 'Pausar' : 'Retomar'}</button>
        <button class="btn btn--sm btn--ghost btn--txt-bad" data-ag-del="${a.id}">Excluir</button></div>` : ''}
    </div>`; }).join('')}</div>`;
  corpo.onclick = async (e) => {
    const b = e.target.closest('[data-ag-ed], [data-ag-tg], [data-ag-del]'); if (!b) return;
    const a = ags.find((x) => x.id === (b.dataset.agEd || b.dataset.agTg || b.dataset.agDel));
    if (b.dataset.agEd) return modalAgendamento(a);
    if (b.dataset.agTg) {
      const { error: er } = await sb.from('agendamentos').update({ ativo: !a.ativo }).eq('id', a.id);
      if (er) return toast(erroMsg(er), true);
      toast(a.ativo ? 'Agendamento pausado' : 'Agendamento retomado'); return renderAgendados();
    }
    if (b.dataset.agDel) {
      if (!(await confirmar(`Os inventários já gerados por "${a.nome}" continuam existindo.`, { titulo: 'Excluir o agendamento?', ok: 'Excluir', perigo: true }))) return;
      const { error: er } = await sb.from('agendamentos').delete().eq('id', a.id);
      if (er) return toast(erroMsg(er), true);
      toast('Agendamento excluído'); renderAgendados();
    }
  };
}

export function modalAgendamento(a = null) {
  const hoje = new Date().toISOString().slice(0, 10);
  const v = { nome: 'Inventário diário', cd_id: state.cdAtual || '', setor: '', recorrencia: 'diaria', dias_semana: [1], dia_mes: 1, hora: '08:00', data_inicio: hoje, data_fim: '', prazo_horas: 8, ...(a || {}) };
  v.hora = String(v.hora).slice(0, 5);
  const PRAZOS = [[2, '2h'], [4, '4h'], [8, '8h'], [12, '12h'], [24, '1 dia'], [48, '2 dias'], [168, '7 dias']];
  const setoresTodos = [...new Set(state.maquinas.map((m) => m.setor).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
  modal(`
    <form id="ag-form">
      <div class="modal-head"><h2>${a ? 'Editar inventário programado' : 'Programar inventário'}</h2>
        <p class="muted" style="margin:4px 0 0">No horário marcado, cada CD escolhido recebe um inventário aberto. Admin e Fields acompanham a contagem regressiva até o prazo.</p></div>
      <div class="modal-body">
        <div class="form-grid">
          ${campo('nome', 'Nome *', v.nome, 'text', 'required')}
          <label>Para qual CD<select name="cd_id">${opts([['', `Todos os CDs (${cdsAtivos().length})`], ...cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`])], v.cd_id || '')}</select></label>
          <label class="full">Setor (opcional)<input name="setor" list="dl-ag-set" value="${esc(v.setor || '')}" placeholder="Vazio = CD inteiro"></label>
        </div>
        <datalist id="dl-ag-set">${setoresTodos.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        <div><span class="lbl">Frequência</span><div class="seg seg--larga" id="ag-rec">${Object.entries(REC).map(([k, l]) => `<button type="button" data-rec="${k}" class="${v.recorrencia === k ? 'on' : ''}">${ICO_REC[k]} ${l}</button>`).join('')}</div></div>
        <div class="form-grid">
          <label><span id="ag-lbl-data">${v.recorrencia === 'unica' ? 'Data' : 'A partir de'}</span><input type="date" name="data_inicio" value="${v.data_inicio}" required></label>
          <label>Horário de início<input type="time" name="hora" value="${v.hora}" required></label>
          <div class="full" id="ag-semana"><span class="lbl">Dias da semana</span><div class="dias">${DIAS_SEMANA.map((d, i) => `<label class="dia"><input type="checkbox" name="dias" value="${i}" ${(v.dias_semana || []).includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
            <div class="rapidos" style="margin-top:6px"><button type="button" class="chip-btn" data-dias="1,2,3,4,5">Seg a sex</button><button type="button" class="chip-btn" data-dias="0,1,2,3,4,5,6">Todos</button><button type="button" class="chip-btn" data-dias="1">Só segunda</button></div></div>
          <label id="ag-mes">Dia do mês<select name="dia_mes">${opts([...Array(28)].map((_, i) => [String(i + 1), `Dia ${i + 1}`]).concat([['31', 'Último dia do mês']]), String(v.dia_mes || 1))}</select></label>
          <label id="ag-fim">Termina em (opcional)<input type="date" name="data_fim" value="${v.data_fim || ''}"></label>
        </div>
        <div><span class="lbl">Prazo para concluir cada inventário</span>
          <div class="rapidos">${PRAZOS.map(([h, l]) => `<button type="button" class="chip-btn ${v.prazo_horas === h ? 'on' : ''}" data-prazo-h="${h}">${l}</button>`).join('')}
            <label class="prazo-livre">ou <input type="number" name="prazo_horas" min="1" max="2160" value="${v.prazo_horas}"> horas</label></div></div>
        <div class="ag-previa" id="ag-previa"></div>
        <p class="erro" id="ag-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="ag-salvar">${a ? 'Salvar' : 'Programar'}</button></div>
    </form>`, (dlg) => {
    let rec = v.recorrencia;
    const form = $('#ag-form');
    const ler = () => {
      const fd = new FormData(form);
      return {
        nome: String(fd.get('nome') || '').trim(), cd_id: fd.get('cd_id') || null, setor: String(fd.get('setor') || '').trim() || null,
        recorrencia: rec, dias_semana: fd.getAll('dias').map(Number), dia_mes: Number(fd.get('dia_mes')) || 1,
        hora: fd.get('hora') || '08:00', data_inicio: fd.get('data_inicio') || hoje, data_fim: rec === 'unica' ? null : fd.get('data_fim') || null,
        prazo_horas: Math.max(1, Math.min(2160, Number(fd.get('prazo_horas')) || 8)),
      };
    };
    const atualizar = () => {
      $('#ag-semana').hidden = rec !== 'semanal';
      $('#ag-mes').hidden = rec !== 'mensal';
      $('#ag-fim').hidden = rec === 'unica';
      $('#ag-lbl-data').textContent = rec === 'unica' ? 'Data' : 'A partir de';
      const x = ler();
      $$('[data-prazo-h]', dlg).forEach((b) => b.classList.toggle('on', Number(b.dataset.prazoH) === x.prazo_horas));
      const prox = proximasExecucoes(x, 4);
      const alvo = x.cd_id ? `${cdCod(x.cd_id)} · ${cdNome(x.cd_id)}` : `todos os ${cdsAtivos().length} CDs`;
      $('#ag-previa').innerHTML = prox.length ? `<strong>${esc(descreverAgendamento(x))}</strong>
        <span class="muted">Cria um inventário para ${esc(alvo)}${x.setor ? ` (setor ${esc(x.setor)})` : ''}. Próximas execuções:</span>
        <ul>${prox.map((d) => { const fim = new Date(d.getTime() + x.prazo_horas * 3600_000);
          return `<li><b>${d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</b> → prazo até ${fim.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</li>`; }).join('')}</ul>`
        : '<span class="erro">Com essas opções não há próximas execuções (verifique a data, os dias da semana ou a data de término).</span>';
    };
    $('#ag-rec').onclick = (e) => { const b = e.target.closest('[data-rec]'); if (!b) return; rec = b.dataset.rec; $$('#ag-rec button').forEach((x) => x.classList.toggle('on', x === b));
      if (!a && $('#ag-form [name=nome]').value.match(/^Inventário (diário|semanal|mensal|único)$/)) $('#ag-form [name=nome]').value = { unica: 'Inventário único', diaria: 'Inventário diário', semanal: 'Inventário semanal', mensal: 'Inventário mensal' }[rec];
      atualizar(); };
    $$('[data-prazo-h]', dlg).forEach((b) => (b.onclick = () => { $('#ag-form [name=prazo_horas]').value = b.dataset.prazoH; atualizar(); }));
    $$('[data-dias]', dlg).forEach((b) => (b.onclick = () => { const ds = b.dataset.dias.split(',').map(Number); $$('#ag-form [name=dias]').forEach((c) => (c.checked = ds.includes(Number(c.value)))); atualizar(); }));
    form.oninput = atualizar; form.onchange = atualizar;
    atualizar();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const x = ler();
      if (!x.nome) return ($('#ag-erro').textContent = 'Informe o nome.');
      if (rec === 'semanal' && !x.dias_semana.length) return ($('#ag-erro').textContent = 'Escolha pelo menos um dia da semana.');
      if (!proximasExecucoes(x, 1).length) return ($('#ag-erro').textContent = 'Não há próximas execuções com essas opções.');
      $('#ag-salvar').disabled = true;
      const row = { ...x, dia_mes: rec === 'mensal' ? x.dia_mes : null, dias_semana: rec === 'semanal' ? x.dias_semana : [], ativo: true };
      const { error } = a ? await sb.from('agendamentos').update(row).eq('id', a.id) : await sb.from('agendamentos').insert(row);
      $('#ag-salvar').disabled = false;
      if (error) return ($('#ag-erro').textContent = erroMsg(error));
      dlg.close();
      const { data: n } = await sb.rpc('gerar_inventarios_agendados');
      toast(n ? `Programado! ${n} inventário(s) já foram abertos.` : 'Inventário programado');
      state.resumoInvEm = 0;
      renderAgendados();
    };
  });
}

export async function renderConferencias() {
  state.conf = null;
  const el = $('#view-conferencia');
  el.innerHTML = `<div class="skeleton">Carregando inventários…</div>`;
  if (navigator.onLine) { try { await sb.rpc('gerar_inventarios_agendados'); } catch { /* sem o 05 */ } }
  let { data: confs, error } = await sb.from('conferencias').select('*, conferencia_itens(maquina_id)').order('criado_em', { ascending: false });
  if (error && ehErroDeRede(error)) { confs = (await idbGet('confs')) || []; error = null; definirOffline(true); }
  if (error) { el.innerHTML = `<div class="card card-pad erro">${esc(erroMsg(error))}</div>`; return; }
  if (!state.offline) idbSet('confs', confs);
  // leituras ainda não enviadas contam no progresso
  const fila = await filaListar();
  confs.forEach((c) => fila.filter((i) => i.conferencia_id === c.id).forEach((i) => c.conferencia_itens.push({ maquina_id: i.maquina_id })));
  state.confs = confs;
  const f = state.confFiltro || (state.confFiltro = { q: '', status: '' });

  el.innerHTML = `
    <div class="view-head">
      ${titulo('Inventários', '', `Contagem física com leitor ou câmera: bipe as etiquetas e veja na hora o que foi encontrado, o que falta e o que não está cadastrado.${ehAdmin() ? ' Como administrador, você vê os inventários de todos os CDs e pode editar, reabrir e excluir.' : ''}`)}
      <div class="actions"><button class="btn" id="btn-app-campo">📱 App do celular</button><button class="btn btn--primary" id="btn-nova-conf">+ Novo inventário</button></div>
    </div>
    ${abasInventario('lista')}
    <div class="card" style="margin-bottom:14px"><div class="toolbar">
      <div class="search"><input id="cf-q" type="search" placeholder="Buscar inventário, setor, responsável…" value="${esc(f.q)}"></div>
      <select id="cf-status">${opts([['', 'Todos os status'], ['aberta', 'Abertos'], ['finalizada', 'Finalizados']], f.status)}</select>
      <span class="count" id="cf-count"></span>
    </div></div>
    <div id="cf-lista"></div>`;

  const desenhar = () => {
    const termos = up(f.q).split(/\s+/).filter(Boolean);
    const lista = confs.filter(noCD).filter((c) => !f.status || c.status === f.status)
      .sort((a, b) => ((a.status === 'aberta') === (b.status === 'aberta') ? 0 : a.status === 'aberta' ? -1 : 1)
        || (a.status === 'aberta' ? new Date(a.prazo_em || 8.64e15) - new Date(b.prazo_em || 8.64e15) : new Date(b.criado_em) - new Date(a.criado_em)))
      .filter((c) => { const t = up([c.nome, c.setor, c.criado_por, cdNome(c.cd_id), cdCod(c.cd_id)].join(' ')); return termos.every((x) => t.includes(x)); });
    $('#cf-count').textContent = `${lista.length} inventário(s)`;
    $('#cf-lista').innerHTML = lista.length ? `<div class="conf-list">${lista.map((c) => {
      const r = resumoConf(c);
      return `<button class="card conf-card ${c.prazo_em ? 'com-prazo' : ''}" data-id="${c.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">${c.prazo_em ? anelPrazo(c, { tam: 50, progresso: r.esperadas ? r.encontradas / r.esperadas : 0 }) : ''}<h2 style="flex:1">${c.agendamento_id ? '<span title="Programado">🔁</span> ' : ''}${esc(c.nome)}</h2>${pill(c.status === 'aberta' ? 'Aberto' : 'Finalizado', c.status === 'aberta' ? 'info' : 'ok')}</div>
        ${c.prazo_em ? `<div>${etiquetaPrazo(c)}</div>` : ''}
        <div class="muted">${mostrarColCD() ? `<span class="pill pill--cd">${esc(cdCod(c.cd_id))}</span> ` : ''}${esc(c.setor || 'Todos os setores')} · ${data(c.criado_em)} · ${esc((c.criado_por || '').split('@')[0])}</div>
        <div class="progress"><i style="width:${r.pct}%"></i></div>
        <div><strong>${r.encontradas}</strong> de ${r.esperadas} encontradas (${r.pct}%)${r.faltando ? ` · <span style="color:var(--bad)">${r.faltando} faltando</span>` : ''}</div></button>`;
    }).join('')}</div>` : `<div class="card card-pad empty"><h2>${confs.length ? 'Nada encontrado com esses filtros' : 'Nenhum inventário ainda'}</h2><p>Crie um para fazer a contagem física de um setor ou do CD inteiro.</p></div>`;
    $$('.conf-card', el).forEach((b) => (b.onclick = () => (location.hash = '#conferencia/' + b.dataset.id)));
  };
  $('#cf-q').oninput = debounce((e) => { f.q = e.target.value; desenhar(); }, 120);
  $('#cf-status').onchange = (e) => { f.status = e.target.value; desenhar(); };
  $('#btn-nova-conf').onclick = () => modalConf();
  $('#btn-app-campo').onclick = modalAppCampo;
  desenhar();
}

// QR code para abrir/instalar o app de conferência no celular
export function modalAppCampo() {
  const url = baseIndex() + 'campo/';
  let qr = '';
  if (window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }
  const texto = `App de conferência do inventário (abra no celular e instale): ${url}`;
  modal(`
    <div class="modal-head"><h2>App de conferência no celular</h2>
      <p class="muted" style="margin:4px 0 0">Aponte a câmera do celular para o QR code. Depois de entrar, toque em <b>⋮ → Instalar o app</b> (Android) ou <b>Compartilhar → Adicionar à Tela de Início</b> (iPhone).</p></div>
    <div class="modal-body" style="justify-items:center;text-align:center">
      <div class="qr-box">${qr}</div>
      <code style="word-break:break-all;font-size:12.5px">${esc(url)}</code>
      <p class="muted" style="margin:0;font-size:13px">Funciona sem internet depois de aberto uma vez: as leituras ficam no celular e são enviadas ao finalizar o inventário.</p>
    </div>
    <div class="modal-foot"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">WhatsApp</a>
      <button class="btn" id="campo-copiar">Copiar link</button><a class="btn btn--primary" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a></div>`,
  () => { $('#campo-copiar').onclick = () => navigator.clipboard.writeText(url).then(() => toast('Link copiado')); });
}

// números de um inventário (usa o resultado congelado quando finalizado)
export function resumoConf(c, itens = c.conferencia_itens || []) {
  if (c.status === 'finalizada' && c.total_esperadas != null) {
    const esperadas = c.total_esperadas, encontradas = c.total_encontradas || 0;
    return { esperadas, encontradas, faltando: c.total_faltando || 0, desconhecidas: c.total_desconhecidas || 0, fora: c.total_fora || 0,
      pct: esperadas ? Math.min(100, Math.round((encontradas / esperadas) * 100)) : 0 };
  }
  const esp = esperadasDe(c);
  const ids = new Set(esp.map((m) => m.id));
  const lidos = new Set(itens.map((i) => i.maquina_id).filter(Boolean));
  const encontradas = [...lidos].filter((id) => ids.has(id)).length;
  return { esperadas: esp.length, encontradas, faltando: esp.length - encontradas, desconhecidas: itens.filter((i) => !i.maquina_id).length,
    fora: [...lidos].filter((id) => !ids.has(id)).length, pct: esp.length ? Math.min(100, Math.round((encontradas / esp.length) * 100)) : 0 };
}

export function esperadasDe(c) {
  return state.maquinas.filter((m) => m.cd_id === c.cd_id && !['descartado', 'extraviado'].includes(m.status) && (!c.setor || m.setor === c.setor));
}

// criar (todos) ou editar (admin) um inventário
export function modalConf(c = null) {
  const cdInicial = c?.cd_id || state.cdAtual || state.perfil?.cd_id || cdsAtivos()[0]?.id;
  const setoresDoCD = (cd) => [...new Set(state.maquinas.filter((m) => m.cd_id === cd).map((m) => m.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const optsSetor = (cd, atual) => `<option value="">Todos os setores (CD inteiro)</option>${[...new Set([...setoresDoCD(cd), ...(atual ? [atual] : [])])].map((s) => `<option ${s === atual ? 'selected' : ''}>${esc(s)}</option>`).join('')}`;
  modal(`
    <form id="conf-form">
      <div class="modal-head"><h2>${c ? 'Editar inventário' : 'Novo inventário'}</h2></div>
      <div class="modal-body">
        ${campo('nome', 'Nome *', c?.nome || `Inventário ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`, 'text', 'required')}
        ${ehAdmin() ? `<label>CD *<select name="cd_id" id="conf-cd">${opts(state.cds.map((x) => [x.id, `${x.codigo} · ${x.nome}`]), cdInicial)}</select></label>` : `<label>CD<input value="${esc(cdCod(cdInicial) + ' · ' + cdNome(cdInicial))}" disabled></label>`}
        <label>Setor (opcional)<select name="setor" id="conf-setor">${optsSetor(cdInicial, c?.setor)}</select></label>
        <p class="muted" style="margin:0">Máquinas esperadas: todas do CD${' '}(ou do setor escolhido) com status diferente de Descartado/Extraviado.</p>
        <p class="erro" id="conf-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary">${c ? 'Salvar' : 'Começar'}</button></div>
    </form>`, (dlg) => {
    $('#conf-cd')?.addEventListener('change', (e) => { $('#conf-setor').innerHTML = optsSetor(e.target.value, ''); });
    $('#conf-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const row = { nome: fd.nome.trim(), setor: fd.setor || null };
      if (ehAdmin()) row.cd_id = fd.cd_id;
      const q = c ? sb.from('conferencias').update(row).eq('id', c.id) : sb.from('conferencias').insert(row);
      const { data: d, error } = await q.select('id').single();
      if (error) { $('#conf-erro').textContent = erroMsg(error); return; }
      dlg.close();
      toast(c ? 'Inventário atualizado' : 'Inventário criado');
      if (location.hash === '#conferencia/' + d.id) abrirConferencia(d.id); else location.hash = '#conferencia/' + d.id;
    };
  });
}

export async function excluirConf(c) {
  const r = resumoConf(c, state.conf?.id === c.id ? state.confItens : c.conferencia_itens);
  if (!(await confirmar(`"${c.nome}" (${cdCod(c.cd_id)}) tem ${r.encontradas + r.desconhecidas + r.fora} leitura(s). Isso não pode ser desfeito.`, { titulo: 'Excluir o inventário?', ok: 'Excluir', perigo: true, digitar: 'EXCLUIR' }))) return false;
  const { error } = await sb.from('conferencias').delete().eq('id', c.id);
  if (error) { toast(erroMsg(error), true); return false; }
  toast('Inventário excluído');
  return true;
}

export async function abrirConferencia(id) {
  const el = $('#view-conferencia');
  el.innerHTML = `<div class="skeleton">Carregando…</div>`;
  let [{ data: c, error }, { data: itens, error: e2 }] = await Promise.all([
    sb.from('conferencias').select('*').eq('id', id).maybeSingle(),
    sb.from('conferencia_itens').select('*').eq('conferencia_id', id).order('lido_em', { ascending: false }),
  ]);
  if ((error && ehErroDeRede(error)) || (e2 && ehErroDeRede(e2))) {
    const cache = await idbGet('conf:' + id);
    if (cache) { c = cache.c; itens = cache.itens; error = null; definirOffline(true); }
  } else if (c) {
    idbSet('conf:' + id, { c, itens: itens || [] });
  }
  if (error || !c) { el.innerHTML = `<div class="card card-pad erro">${error && ehErroDeRede(error) ? 'Sem internet e esta conferência ainda não foi aberta neste aparelho. Abra-a uma vez com internet para usar offline.' : 'Conferência não encontrada.'}</div>`; return; }
  const pend = (await filaListar()).filter((i) => i.conferencia_id === id);
  state.conf = c; state.confItens = [...(itens || []), ...pend]; state.confTab = 'faltando';
  renderConfDetalhe(true);
}

export function calcularConf(c, itens) {
  const congelado = c.status === 'finalizada' && Array.isArray(c.faltantes);
  const esperadasVivas = esperadasDe(c);
  const idsEsperados = new Set(esperadasVivas.map((m) => m.id));
  const lidos = new Set(itens.filter((i) => i.maquina_id).map((i) => i.maquina_id));
  const encontradas = itens.filter((i) => i.maquina_id).map((i) => ({
    item: i, m: state.maquinas.find((m) => m.id === i.maquina_id) || { id: i.maquina_id, hostname: '(fora do seu acesso)', ativo: i.codigo_lido, tipo: 'outro', status: '', cd_id: null },
  }));
  const desconhecidos = itens.filter((i) => !i.maquina_id);
  let faltando, esperadasN, foraDoEsperado, achadasEsperadas;
  if (congelado) {
    faltando = c.faltantes.map((f) => state.maquinas.find((m) => m.id === f.id) || { ...f, removida: true });
    foraDoEsperado = encontradas.filter((x) => x.m.cd_id !== c.cd_id || (c.setor && x.m.setor !== c.setor));
    esperadasN = c.total_esperadas ?? faltando.length + (c.total_encontradas || 0);
    achadasEsperadas = c.total_encontradas ?? encontradas.length - foraDoEsperado.length;
  } else {
    faltando = esperadasVivas.filter((m) => !lidos.has(m.id));
    foraDoEsperado = encontradas.filter((x) => !idsEsperados.has(x.m.id));
    esperadasN = esperadasVivas.length;
    achadasEsperadas = encontradas.length - foraDoEsperado.length;
  }
  return { esperadasN, encontradas, faltando, desconhecidos, foraDoEsperado, achadasEsperadas, congelado };
}
export const confCalculo = () => calcularConf(state.conf, state.confItens);

// Finalizar: só depois de copiar/compartilhar o resumo para o grupo (fica gravado no inventário)
export function resumoDoInventario(c, k) {
  const p = estadoPrazo({ ...c, status: 'finalizada', finalizado_em: new Date().toISOString() });
  return montarResumo({
    nome: c.nome, cd: `${cdCod(c.cd_id)} · ${cdNome(c.cd_id)}`, setor: c.setor, por: state.user?.email, quando: Date.now(),
    esperadas: k.esperadasN, encontradas: k.achadasEsperadas,
    faltando: k.faltando.map((m) => ({ ativo: m.ativo, hostname: m.hostname })),
    desconhecidas: k.desconhecidos.map((i) => i.codigo_lido), fora: k.foraDoEsperado.length,
    leitores: (state.confItens || []).map((i) => i.lido_por),
    prazo: p ? { noPrazo: p.estado === 'cumprido', txt: p.estado === 'cumprido' ? `sobraram ${fmtDuracao(p.sobra)}` : `${fmtDuracao(-p.sobra)} depois do prazo` } : null,
  });
}
export function modalFinalizarConf(c, k) {
  const texto = resumoDoInventario(c, k);
  let enviado = false;
  modal(`
    <div class="modal-head"><h2>Finalizar inventário</h2>
      <p class="muted" style="margin:4px 0 0">Para finalizar, <b>envie este resumo no grupo</b> do CD (WhatsApp/Teams). Ele também fica gravado no inventário e o administrador é avisado.</p></div>
    <div class="modal-body">
      ${k.faltando.length ? `<div class="banner banner--warn"><div><strong>Ainda faltam ${k.faltando.length} máquina(s)</strong><span>Elas vão para a lista de faltantes do resumo.${ehAdmin() ? '' : ' Depois de finalizado, só um administrador pode reabrir.'}</span></div></div>` : ''}
      <label>Resumo<textarea id="fin-texto" rows="12" readonly class="mono" style="font-size:12.5px">${esc(texto)}</textarea></label>
      <div class="actions">
        <button type="button" class="btn btn--primary" id="fin-copiar">📋 Copiar resumo</button>
        <a class="btn" id="fin-wa" href="${linkWhatsApp(texto)}" target="_blank" rel="noopener">Enviar no WhatsApp</a>
        <span class="muted" id="fin-ok" style="font-size:13px"></span>
      </div>
      <label class="check"><input type="checkbox" id="fin-colei" disabled> Enviei o resumo no grupo</label>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="fin-confirmar" disabled>Finalizar inventário</button></div>`, (dlg) => {
    const liberar = () => { enviado = true; $('#fin-colei', dlg).disabled = false; $('#fin-ok', dlg).textContent = '✓ Agora cole no grupo e marque a caixa abaixo.'; };
    $('#fin-copiar', dlg).onclick = async () => { if (await copiarTexto(texto, $('#fin-texto', dlg))) { toast('Resumo copiado'); liberar(); } else toast('Não consegui copiar: selecione o texto e use Ctrl+C', true); };
    $('#fin-wa', dlg).onclick = liberar;
    $('#fin-colei', dlg).onchange = (e) => { $('#fin-confirmar', dlg).disabled = !(enviado && e.target.checked); };
    $('#fin-confirmar', dlg).onclick = async () => {
      $('#fin-confirmar', dlg).disabled = true;
      // congela o resultado para os relatórios
      const { error } = await sb.from('conferencias').update({
        status: 'finalizada', finalizado_em: new Date().toISOString(), finalizado_por: state.user?.email,
        total_esperadas: k.esperadasN, total_encontradas: k.achadasEsperadas, total_faltando: k.faltando.length,
        total_desconhecidas: k.desconhecidos.length, total_fora: k.foraDoEsperado.length,
        faltantes: k.faltando.map((m) => ({ id: m.id, hostname: m.hostname, ativo: m.ativo, modelo: m.modelo, tipo: m.tipo, setor: m.setor, localizacao: m.localizacao, ultimo_online: m.ultimo_online })),
        resumo: texto, resumo_enviado_em: new Date().toISOString(),
      }).eq('id', c.id);
      if (error) { $('#fin-confirmar', dlg).disabled = false; return toast(erroMsg(error), true); }
      dlg.close();
      toast('Inventário finalizado');
      abrirConferencia(c.id);
    };
  });
}

export function renderConfDetalhe(montar) {
  const el = $('#view-conferencia');
  const c = state.conf;
  const k = confCalculo();
  const pct = k.esperadasN ? Math.min(100, Math.round((k.achadasEsperadas / k.esperadasN) * 100)) : 0;
  const aberta = c.status === 'aberta';

  if (montar || !$('#scan-input') && aberta) {
    el.innerHTML = `
      <div class="view-head">
        <div><a href="#conferencia" class="muted" style="text-decoration:none">← Inventários</a>
          <h1 style="margin-top:4px">${esc(c.nome)}</h1>
          <p><span class="pill pill--cd" title="${esc(cdNome(c.cd_id))}">${esc(cdCod(c.cd_id))}</span> ${esc(cdNome(c.cd_id))} · ${esc(c.setor || 'Todos os setores')} · iniciada ${dataHora(c.criado_em)} por ${esc(c.criado_por || '—')}${c.finalizado_em ? ' · finalizada ' + dataHora(c.finalizado_em) : ''}</p></div>
        <div class="actions" id="conf-acoes"></div>
      </div>
      <div id="conf-prazo" style="margin-bottom:14px"></div>
      <div class="scan-wrap">
        <div class="card scan-box">
          ${aberta ? `
          <form id="scan-form" autocomplete="off">
            <input id="scan-input" class="scan-input" placeholder="Bipe ou digite patrimônio / hostname / série" autofocus>
          </form>
          <div class="scan-row">
            <label>Localização atual (opcional)<input id="scan-local" placeholder="Ex.: Expedição — doca 3"></label>
            <label style="display:flex;align-items:center;gap:6px;flex:0 0 auto;font-weight:400"><input type="checkbox" id="scan-gravar"> Gravar no cadastro</label>
            ${navigator.mediaDevices?.getUserMedia ? '<button class="btn" type="button" id="btn-camera">📷 Câmera</button>' : ''}
          </div>` : `<p class="muted" style="margin:0">Conferência finalizada. Reabra para continuar bipando.</p>`}
          <div id="scan-result" class="scan-result"><span class="muted">${aberta ? 'Aguardando leitura… O leitor USB funciona como teclado: é só bipar com o campo acima selecionado.' : 'Resultado final abaixo.'}</span></div>
        </div>
        <div class="card conf-stats" id="conf-stats"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="tabs" id="conf-tabs"></div>
        <div class="table-wrap" style="max-height:none" id="conf-tabela"></div>
      </div>`;
    if (aberta) {
      const inp = $('#scan-input');
      $('#scan-form').onsubmit = (e) => { e.preventDefault(); const v = inp.value; inp.value = ''; processarLeitura(v); inp.focus(); };
      $('#btn-camera')?.addEventListener('click', abrirCamera);
      const loc = store.get('conf-local'); if (loc) $('#scan-local').value = loc;
      $('#scan-local').onchange = (e) => store.set('conf-local', e.target.value);
      inp.focus();
    }
  }

  $('#conf-acoes').innerHTML = `
    <button class="btn" id="conf-relatorio">Relatório</button>
    ${!aberta && c.resumo ? '<button class="btn" id="conf-resumo">Resumo enviado</button>' : ''}
    <button class="btn" id="conf-csv">Exportar (Excel)</button>
    ${ehAdmin() ? '<button class="btn" id="conf-editar">Editar</button><button class="btn btn--danger" id="conf-excluir">Excluir</button>' : ''}
    ${aberta ? '<button class="btn btn--primary" id="conf-fim">Finalizar inventário</button>'
             : `${ehAdmin() ? '<button class="btn" id="conf-reabrir">Reabrir</button>' : ''}${k.faltando.length ? `<button class="btn btn--danger" id="conf-extraviar">Marcar ${k.faltando.length} faltantes como extraviadas</button>` : ''}`}`;
  $('#conf-csv').onclick = exportarConf;
  $('#conf-relatorio').onclick = () => relatorioInventario(c.id);
  $('#conf-resumo')?.addEventListener('click', () => modal(`
    <div class="modal-head"><h2>Resumo enviado no grupo</h2><p class="muted" style="margin:4px 0 0">Finalizado por ${esc(c.finalizado_por || '—')}${c.resumo_enviado_em ? ' · resumo copiado em ' + dataHora(c.resumo_enviado_em) : ''}</p></div>
    <div class="modal-body"><textarea id="rs-texto" rows="14" readonly class="mono" style="font-size:12.5px">${esc(c.resumo)}</textarea></div>
    <div class="modal-foot"><button class="btn" id="rs-copiar">Copiar</button><button class="btn btn--primary" data-close>Fechar</button></div>`,
    (dlg) => { $('#rs-copiar', dlg).onclick = async () => { if (await copiarTexto(c.resumo, $('#rs-texto', dlg))) toast('Resumo copiado'); }; }));
  $('#conf-editar')?.addEventListener('click', () => modalConf(c));
  $('#conf-excluir')?.addEventListener('click', async () => { if (await excluirConf(c)) location.hash = '#conferencia'; });
  $('#conf-fim')?.addEventListener('click', () => {
    if (state.pendentes) return toast('Ainda há leituras salvas no aparelho aguardando envio. Aguarde a internet voltar para finalizar.', true);
    modalFinalizarConf(c, k);
  });
  $('#conf-reabrir')?.addEventListener('click', async () => {
    const { error } = await sb.from('conferencias').update({ status: 'aberta', finalizado_em: null, faltantes: null, resumo: null, resumo_enviado_em: null }).eq('id', c.id);
    if (error) return toast(erroMsg(error), true);
    abrirConferencia(c.id);
  });
  $('#conf-extraviar')?.addEventListener('click', async () => {
    if (!(await confirmar(`O status de ${k.faltando.length} máquina(s) passa para "Extraviado". Isso fica registrado no histórico de cada uma.`, { titulo: 'Marcar faltantes como extraviadas?', ok: 'Marcar como extraviadas', perigo: true }))) return;
    const ids = k.faltando.filter((m) => !m.removida).map((m) => m.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from('maquinas').update({ status: 'extraviado' }).in('id', ids.slice(i, i + 200));
      if (error) return toast(erroMsg(error), true);
    }
    await carregarMaquinas(); toast('Status atualizado'); renderConfDetalhe(false);
  });

  if (c.prazo_em && $('#conf-prazo')) {
    const prim = state.confItens.map((i) => i.lido_em).filter(Boolean).sort()[0];
    $('#conf-prazo').innerHTML = relogioCompleto(c, { encontradas: k.achadasEsperadas, esperadas: k.esperadasN, primeiraLeitura: prim });
  }
  $('#conf-stats').innerHTML = `
    <h3>Progresso</h3>
    <div><span class="conf-big">${k.achadasEsperadas}</span><span class="muted"> / ${k.esperadasN}</span></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="muted">${pct}% das máquinas esperadas foram encontradas</div>
    <div class="alert-list">
      <div class="alert-row" style="cursor:default"><span class="dot dot--offline"></span>Faltando<span class="n">${k.faltando.length}</span></div>
      <div class="alert-row" style="cursor:default"><span class="dot dot--ausente"></span>Fora do esperado<span class="n">${k.foraDoEsperado.length}</span></div>
      <div class="alert-row" style="cursor:default"><span class="dot dot--nunca"></span>Não cadastradas<span class="n">${k.desconhecidos.length}</span></div>
    </div>`;

  const tabs = [['faltando', 'Faltando', k.faltando.length], ['encontradas', 'Encontradas', k.encontradas.length], ['desconhecidos', 'Não cadastradas', k.desconhecidos.length]];
  $('#conf-tabs').innerHTML = tabs.map(([id, l, n]) => `<button class="tab ${state.confTab === id ? 'active' : ''}" data-tab="${id}">${l}<span class="n">${n}</span></button>`).join('');
  $$('#conf-tabs .tab').forEach((b) => (b.onclick = () => { state.confTab = b.dataset.tab; renderConfDetalhe(false); }));

  let html = '';
  if (state.confTab === 'faltando') {
    html = k.faltando.length ? `<table><thead><tr><th></th><th>Hostname</th><th>Patrimônio</th><th>Tipo</th><th>Modelo</th><th>Setor / local</th><th>Última coleta</th><th>Usuário</th></tr></thead><tbody>
      ${k.faltando.map((m) => `<tr data-id="${m.id}"><td>${dot(m)}</td><td class="host mono">${esc(m.hostname)}</td><td class="mono">${esc(m.ativo || '—')}</td><td>${esc(TIPO[m.tipo])}</td><td>${esc(m.modelo || '—')}</td><td>${esc(m.setor || '—')}<span class="sub">${esc(m.localizacao || '')}</span></td><td>${rel(m.ultimo_online)}${m.ip ? `<span class="sub mono">${esc(m.ip)}</span>` : ''}</td><td>${esc((m.usuario_logado || '—').split('\\').pop())}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Nada faltando. 🎉</div>';
  } else if (state.confTab === 'encontradas') {
    html = k.encontradas.length ? `<table><thead><tr><th>Lida em</th><th>Hostname</th><th>Patrimônio</th><th>Código lido</th><th>Local da leitura</th><th>Por</th><th></th></tr></thead><tbody>
      ${k.encontradas.sort((a, b) => new Date(b.item.lido_em) - new Date(a.item.lido_em)).map(({ item, m }) => {
        const fora = k.foraDoEsperado.some((x) => x.m.id === m.id);
        return `<tr data-id="${m.id}"><td>${dataHora(item.lido_em)}${item.pendente ? ' <span class="tag">📴 pendente</span>' : ''}</td><td class="host mono">${esc(m.hostname)}</td><td class="mono">${esc(m.ativo || '—')}</td><td class="mono">${esc(item.codigo_lido)}</td><td>${esc(item.localizacao || '—')}</td><td>${esc(item.lido_por || '')}</td><td>${fora ? `<span class="tag">${m.status === 'extraviado' || m.status === 'descartado' ? STATUS[m.status] : 'Outro setor: ' + esc(m.setor || '—')}</span>` : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">Nenhuma leitura ainda.</div>';
  } else {
    html = k.desconhecidos.length ? `<table><thead><tr><th>Lida em</th><th>Código lido</th><th>Local</th><th>Por</th><th></th></tr></thead><tbody>
      ${k.desconhecidos.map((i) => `<tr><td>${dataHora(i.lido_em)}</td><td class="mono host">${esc(i.codigo_lido)}</td><td>${esc(i.localizacao || '—')}</td><td>${esc(i.lido_por || '')}</td><td><button class="btn btn--sm" data-cadastrar="${esc(i.codigo_lido)}" data-item="${i.id}">Cadastrar</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Nenhum código desconhecido.</div>';
  }
  $('#conf-tabela').innerHTML = html;
  $$('#conf-tabela tr[data-id]').forEach((tr) => (tr.onclick = () => abrirMaquina(tr.dataset.id)));
  $$('#conf-tabela [data-cadastrar]').forEach((b) => (b.onclick = () => cadastrarDesconhecido(b.dataset.cadastrar, Number(b.dataset.item))));
}

export function cadastrarDesconhecido(codigo, itemId) {
  modalNovaMaquina({
    ativo: codigo, hostname: '', setor: state.conf?.setor || '', cd_id: state.conf?.cd_id, localizacao: $('#scan-local')?.value || '',
    onDone: async (maqId) => {
      if (itemId) {
        await sb.from('conferencia_itens').update({ maquina_id: maqId }).eq('id', itemId);
        const it = state.confItens.find((i) => i.id === itemId); if (it) it.maquina_id = maqId;
      }
      renderConfDetalhe(false);
    },
  });
}

export function mostrarResultado(cls, titulo, detalhe = '', acao = '') {
  const r = $('#scan-result');
  if (!r) return;
  r.className = `scan-result ${cls} pop`;
  r.innerHTML = `<strong>${titulo}</strong><span>${detalhe}</span>${acao}`;
  beep(cls);
}

export async function processarLeitura(bruto) {
  const codigo = extrairCodigo(bruto); // aceita também a URL do QR code
  if (!codigo) return;
  const c = up(codigo);
  const m = acharMaquina(codigo);
  const ja = state.confItens.find((i) => (m && i.maquina_id === m.id) || up(i.codigo_lido) === c);
  if (ja) {
    return mostrarResultado('warn', `Já lida — ${esc(m?.hostname || codigo)}`, `Lida em ${dataHora(ja.lido_em)}${ja.lido_por ? ' por ' + esc(ja.lido_por) : ''}`);
  }
  const local = $('#scan-local')?.value.trim() || null;
  const novo = { conferencia_id: state.conf.id, maquina_id: m?.id || null, codigo_lido: codigo, localizacao: local };
  let item, offline = false;
  const res = navigator.onLine ? await sb.from('conferencia_itens').insert(novo).select().single() : { error: { message: 'Failed to fetch' } };
  if (res.error) {
    if (res.error.code === '23505') return mostrarResultado('warn', 'Já lida', esc(codigo));
    if (!ehErroDeRede(res.error)) return mostrarResultado('bad', 'Erro ao gravar', esc(erroMsg(res.error)));
    // sem internet: guarda no aparelho e envia depois
    item = { ...novo, id: 'local-' + crypto.randomUUID(), lido_por: state.user?.email, lido_em: new Date().toISOString(), pendente: true };
    await filaAdicionar(item);
    offline = true;
    definirOffline(true);
    atualizarPendentes();
  } else item = res.data;
  if (!state.confItens.some((i) => i.id === item.id)) state.confItens.push(item);
  const avisoOff = offline ? '<span class="offline-tag">📴 salva no aparelho — envia quando a internet voltar</span>' : '';

  if (!m) {
    mostrarResultado('bad', `Não cadastrada: ${esc(codigo)}`, 'Esse código não existe no inventário.' + avisoOff,
      offline ? '' : `<div style="margin-top:6px"><button class="btn btn--sm" id="r-cad">Cadastrar agora</button></div>`);
    $('#r-cad')?.addEventListener('click', () => cadastrarDesconhecido(codigo, item.id));
  } else {
    const esperada = esperadasDe(state.conf).some((x) => x.id === m.id);
    const det = `${esc(m.ativo ? 'Patrimônio ' + m.ativo : 'Sem patrimônio')} · ${esc(TIPO[m.tipo])} ${esc(m.modelo || '')} · ${gb(m.memoria_gb)} RAM · ${esc(soFamilia(m))}`;
    if (esperada) mostrarResultado('ok', `✓ ${esc(m.hostname)}`, det + avisoOff);
    else if (['extraviado', 'descartado'].includes(m.status)) mostrarResultado('warn', `${esc(m.hostname)} — estava como ${STATUS[m.status]}`, det + ' · ajuste o status no cadastro.');
    else if (m.cd_id !== state.conf.cd_id) mostrarResultado('warn', `${esc(m.hostname)} — pertence a outro CD`, `Cadastrada em: ${esc(cdCod(m.cd_id))} · ${esc(cdNome(m.cd_id))} · ${det}`);
    else mostrarResultado('warn', `${esc(m.hostname)} — pertence a outro setor`, `Cadastrada em: ${esc(m.setor || 'sem setor')} · ${det}`);
    if (!offline && local && $('#scan-gravar')?.checked && m.localizacao !== local) {
      sb.from('maquinas').update({ localizacao: local }).eq('id', m.id).then(() => recarregarMaquina(m.id));
    }
  }
  renderConfDetalhe(false);
}

export async function abrirCamera() {
  const v = await lerCamera();
  if (v) processarLeitura(v);
  $('#scan-input')?.focus();
}

// Lê um código com a câmera. Usa o leitor nativo (Android/Chrome) ou jsQR como alternativa (iPhone, só QR code).
// impressão digital (SRI) das bibliotecas externas: o navegador recusa o arquivo se ele for alterado no CDN
const SRI_SCRIPTS = { 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js': 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx' };
export function carregarScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement('script'); s.src = src; if (SRI_SCRIPTS[src]) { s.integrity = SRI_SCRIPTS[src]; s.crossOrigin = 'anonymous'; } s.onload = res; s.onerror = () => rej(new Error('falha ao carregar ' + src));
    document.head.append(s);
  });
}
export function lerCamera() {
  return new Promise((resolve) => {
    let stream, rodando = true, resultado = null;
    const dlg = $('#modal-cam');
    dlg.innerHTML = `
      <div class="modal-head"><h2>Ler com a câmera</h2></div>
      <div class="modal-body"><div class="cam-wrap"><video id="cam" class="camera" playsinline muted></video><span class="cam-mira"></span></div>
        <p class="muted" style="margin:0" id="cam-dica">Aponte para o QR code ou o código de barras da etiqueta.</p></div>
      <div class="modal-foot"><button class="btn" data-close>Fechar</button></div>`;
    dlg.showModal();
    $('[data-close]', dlg).onclick = () => dlg.close();
    dlg.addEventListener('close', () => { rodando = false; stream?.getTracks().forEach((t) => t.stop()); resolve(resultado); }, { once: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
        const v = $('#cam', dlg); v.srcObject = stream; await v.play();
        let detectar;
        let nativo = null;
        if ('BarcodeDetector' in window) {
          try {
            const fmts = await BarcodeDetector.getSupportedFormats();
            nativo = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix', 'itf'].filter((f) => fmts.includes(f)) });
          } catch { nativo = null; }
        }
        if (nativo) {
          detectar = async () => { const r = await nativo.detect(v); return r[0]?.rawValue; };
        } else {
          await carregarScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
          $('#cam-dica', dlg).textContent = 'Aponte para o QR code da etiqueta (neste aparelho a câmera lê só QR code).';
          const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
          detectar = async () => {
            if (!v.videoWidth) return null;
            const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * w);
            cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h);
            return window.jsQR(cx.getImageData(0, 0, w, h).data, w, h)?.data;
          };
        }
        const loop = async () => {
          if (!rodando) return;
          try { const val = await detectar(); if (val) { resultado = val; return dlg.close(); } } catch { /* frame inválido */ }
          setTimeout(loop, 200);
        };
        loop();
      } catch (e) {
        dlg.close(); toast('Não foi possível abrir a câmera: ' + e.message, true);
      }
    })();
  });
}

export function exportarConf() {
  const k = confCalculo();
  const cab = ['Situação', 'Hostname', 'Patrimônio', 'Nº série', 'Tipo', 'Modelo', 'Setor', 'Localização', 'Código lido', 'Local da leitura', 'Lido em', 'Lido por'];
  const lin = [
    ...k.encontradas.map(({ item, m }) => [k.foraDoEsperado.some((x) => x.m.id === m.id) ? 'Encontrada (fora do esperado)' : 'Encontrada', m.hostname, m.ativo, m.numero_serie, TIPO[m.tipo], m.modelo, m.setor, m.localizacao, item.codigo_lido, item.localizacao, dataHora(item.lido_em), item.lido_por]),
    ...k.faltando.map((m) => ['Faltando', m.hostname, m.ativo, m.numero_serie, TIPO[m.tipo], m.modelo, m.setor, m.localizacao, '', '', '', '']),
    ...k.desconhecidos.map((i) => ['Não cadastrada', '', '', '', '', '', '', '', i.codigo_lido, i.localizacao, dataHora(i.lido_em), i.lido_por]),
  ];
  baixarBlob(planilhaSimples('Inventário', [cab, ...lin]), `inventario-${state.conf.nome.replace(/\W+/g, '-')}-${hojeISO()}.xlsx`);
}
