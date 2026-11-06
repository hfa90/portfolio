import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, URL_PUBLICA } from './config.js';
import { idbGet, idbSet, filaListar, filaAdicionar, filaRemover, ehErroDeRede } from './offline.js';
import { criarAssinatura } from './assinatura.js';
import { MODELOS, montarFolhas } from './etiquetas.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =====================================================================
   Utilidades
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const up = (v) => String(v ?? '').trim().toUpperCase();
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } },
};

const STATUS = { em_uso: 'Em uso', estoque: 'Estoque', manutencao: 'Manutenção', emprestado: 'Emprestado', descartado: 'Descartado', extraviado: 'Extraviado' };
const STATUS_COR = { em_uso: 'ok', estoque: 'info', manutencao: 'warn', emprestado: 'info', descartado: '', extraviado: 'bad' };
const TIPO = { desktop: 'Desktop', notebook: 'Notebook', servidor: 'Servidor', outro: 'Outro' };
const SIT = { online: 'Online agora', recente: 'Até 7 dias', ausente: '7 a 30 dias', offline: 'Mais de 30 dias', nunca: 'Nunca reportou' };
const SIT_COR = { online: 'ok', recente: 'info', ausente: 'warn', offline: 'bad', nunca: 'idle' };
const ALERTAS = {
  hw_reduzido:        { l: 'Peça removida?', d: 'Memória ou armazenamento diminuiu — pente com defeito ou peça retirada', grave: true },
  emprestimo_atrasado:{ l: 'Devolução atrasada', d: 'Empréstimo com data de devolução vencida', grave: true },
  so_sem_suporte:     { l: 'Windows sem suporte', d: 'Windows 10 ou anterior — fim do suporte Microsoft em 14/10/2025', grave: true },
  estoque_online:     { l: 'Estoque ligada', d: 'Marcada como estoque/descartada/extraviada, mas reportou nos últimos 3 dias', grave: true },
  hostname_duplicado: { l: 'Hostname duplicado', d: 'Mais de uma máquina ativa com o mesmo nome', grave: true },
  disco_cheio:        { l: 'Disco cheio', d: 'Menos de 15 GB ou 10% livre', grave: true },
  ram_baixa:          { l: 'RAM < 8 GB', d: 'Memória abaixo de 8 GB', grave: false },
  hdd:                { l: 'Disco HDD', d: 'Possui disco mecânico (candidato a troca por SSD)', grave: false },
  sem_contato:        { l: 'Sem contato', d: 'Não reporta há mais de 30 dias', grave: false },
  sem_ativo:          { l: 'Sem patrimônio', d: 'Sem número de patrimônio cadastrado', grave: false },
  garantia_vencendo:  { l: 'Garantia vencendo', d: 'Garantia termina nos próximos 30 dias', grave: false },
  renovacao:          { l: 'Mais de 5 anos', d: 'Comprada há mais de 5 anos — candidata a renovação', grave: false },
};
const CAMPOS_HIST = {
  cadastro: 'Cadastro', hostname: 'Hostname', ativo: 'Patrimônio', tipo: 'Tipo', status: 'Status', numero_serie: 'Nº de série',
  fabricante: 'Fabricante', modelo: 'Modelo', cpu: 'Processador', memoria_gb: 'Memória', armazenamento_total_gb: 'Armazenamento',
  so_nome: 'Sistema', so_display_version: 'Versão do SO', so_build: 'Build', setor: 'Setor', localizacao: 'Localização', responsavel: 'Responsável',
  cd_id: 'CD', data_compra: 'Data de compra', fornecedor: 'Fornecedor', nota_fiscal: 'Nota fiscal', garantia_fim: 'Fim da garantia', hw_verificado: 'Verificação',
};
const CAMPOS_HW = ['memoria_gb', 'armazenamento_total_gb', 'cpu', 'numero_serie', 'so_nome', 'so_display_version'];

function situacao(m) {
  if (!m.ultimo_online) return 'nunca';
  const h = (Date.now() - new Date(m.ultimo_online)) / 36e5;
  if (h < 2) return 'online';
  if (h < 24 * 7) return 'recente';
  if (h < 24 * 30) return 'ausente';
  return 'offline';
}
function soFamilia(m) {
  const n = m.so_nome || '';
  const r = n.match(/Windows (Server \d{4}|\d+)/i);
  if (r) return 'Windows ' + r[1];
  if (/mac/i.test(n)) return 'macOS';
  if (/linux|ubuntu/i.test(n)) return 'Linux';
  return n ? n.replace(/^Microsoft\s+/i, '') : 'Sem dado';
}
const soGrupo = (m) => (m.so_nome ? soFamilia(m) + (m.so_display_version ? ' · ' + m.so_display_version : '') : 'Sem dado');
const soLabel = (m) => (m.so_nome ? m.so_nome.replace(/^Microsoft\s+/i, '') + (m.so_display_version ? ' ' + m.so_display_version : '') : '—');
function ramFaixa(m) {
  const g = Number(m.memoria_gb);
  if (!g) return 'Sem dado';
  if (g <= 4.5) return '4 GB ou menos';
  if (g <= 8.5) return '8 GB';
  if (g <= 16.5) return '16 GB';
  return '32 GB ou mais';
}
function tipoDisco(m) {
  const t = new Set((m.discos || []).map((d) => d.tipo));
  if (t.has('SSD') && t.has('HDD')) return 'SSD + HDD';
  if (t.has('SSD')) return 'SSD';
  if (t.has('HDD')) return 'HDD';
  return (m.discos || []).length ? 'Não identificado' : 'Sem dado';
}
function gb(v, dec = 0) {
  if (v == null || v === '') return '—';
  v = Number(v);
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + ' TB';
  return (dec ? v.toFixed(dec) : Math.round(v)).toString().replace('.', ',') + ' GB';
}
function rel(ts) {
  if (!ts) return 'nunca';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d < 60) return `há ${d} dia${d > 1 ? 's' : ''}`;
  return new Date(ts).toLocaleDateString('pt-BR');
}
function idadeFaixa(m) {
  if (!m.data_compra) return 'Sem data de compra';
  const anos = (Date.now() - new Date(m.data_compra + 'T12:00:00')) / (365.25 * 864e5);
  if (anos < 3) return '0 a 2 anos';
  if (anos < 5) return '3 a 4 anos';
  return '5 anos ou mais';
}
function garantiaFaixa(m) {
  if (!m.garantia_fim) return 'Sem informação';
  const dias = (new Date(m.garantia_fim + 'T23:59:59') - Date.now()) / 864e5;
  if (dias < 0) return 'Vencida';
  if (dias <= 30) return 'Vence em 30 dias';
  if (dias <= 90) return 'Vence em 90 dias';
  return 'Vigente';
}
const dataBR = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
const moeda = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
// aceita patrimônio, hostname, nº de série ou a URL do QR code da etiqueta (…#maquina/PAT123)
function extrairCodigo(bruto) {
  let c = String(bruto || '').trim();
  const i = c.indexOf('#maquina/');
  if (i >= 0) { try { c = decodeURIComponent(c.slice(i + 9)); } catch { c = c.slice(i + 9); } }
  return c.trim();
}
function acharMaquina(bruto) {
  const c = up(extrairCodigo(bruto));
  if (!c) return null;
  const c2 = c.replace(/^0+/, '');
  return state.maquinas.find((x) => up(x.ativo) === c || up(x.hostname) === c || up(x.numero_serie) === c || x.id === c.toLowerCase()
    || (c2 && up(x.ativo) && up(x.ativo).replace(/^0+/, '') === c2)) || null;
}
const dataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const data = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR') : '—');
const pill = (txt, cor = '') => `<span class="pill ${cor ? 'pill--' + cor : ''}">${esc(txt)}</span>`;
const statusPill = (s) => pill(STATUS[s] || s, STATUS_COR[s]);
const dot = (m) => `<span class="dot dot--${situacao(m)}" title="${esc(SIT[situacao(m)])}"></span>`;
const tags = (m, max = 2) => {
  const a = m.alertas || [];
  const out = a.slice(0, max).map((k) => `<span class="tag ${ALERTAS[k]?.grave ? 'tag--bad' : ''}" title="${esc(ALERTAS[k]?.d)}">${esc(ALERTAS[k]?.l || k)}</span>`).join('');
  return out + (a.length > max ? `<span class="tag">+${a.length - max}</span>` : '');
};

function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), err ? 6000 : 3500);
}
function erroMsg(e) {
  if (!e) return 'Erro desconhecido';
  if (e.code === '23505') return 'Já existe outra máquina com esse patrimônio ou número de série.';
  return e.message || String(e);
}

let audioCtx;
function beep(tipo) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const seq = { ok: [[880, 0.09]], warn: [[660, 0.08], [660, 0.08]], bad: [[220, 0.28]] }[tipo];
    let t = audioCtx.currentTime;
    for (const [f, d] of seq) {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.frequency.value = f; o.type = 'square'; g.gain.value = 0.05;
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + d); t += d + 0.05;
    }
  } catch { /* sem áudio */ }
}

/* =====================================================================
   Estado
   ===================================================================== */
const F_PADRAO = { q: '', tipo: '', status: '_ativos', situacao: '', so: '', alerta: '', ram: '', disco: '', setor: '', idade: '', garantia: '' };
const state = {
  user: null,
  maquinas: [],
  hist: [],
  view: 'painel',
  f: { ...F_PADRAO },
  sort: { col: 'hostname', dir: 1 },
  maqMontada: false,
  flash: new Set(),
  drawerId: null,
  drawerDirty: false,
  confs: [],
  conf: null,
  confItens: [],
  confTab: 'faltando',
  tokens: [],
  sel: new Set(),
  emprestimos: [],
  empHist: [],
  offline: false,
  cacheEm: null,
  pendentes: 0,
  etqIds: null,
  perfil: null,
  cds: [],
  cdAtual: '',
  usuarios: null,
};
// ---- CD atual e perfil (admin vê todos ou escolhe um CD; Field fica preso ao seu)
const ehAdmin = () => state.perfil?.papel === 'admin';
const noCD = (r) => !state.cdAtual || r.cd_id === state.cdAtual;
const MQ = () => state.maquinas.filter(noCD);
const cdDe = (id) => state.cds.find((c) => c.id === id);
const cdNome = (id) => cdDe(id)?.nome || '—';
const cdCod = (id) => cdDe(id)?.codigo || '—';
const cdsAtivos = () => state.cds.filter((c) => c.ativo);
const mostrarColCD = () => ehAdmin() && !state.cdAtual && state.cds.length > 1;
const ativas = () => MQ().filter((m) => m.status !== 'descartado');
const setores = () => [...new Set(MQ().map((m) => m.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/* =====================================================================
   Dados
   ===================================================================== */
async function carregarMaquinas() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data: d, error } = await sb.from('vw_maquinas').select('*').order('hostname').range(from, from + 999);
    if (error) {
      // sem internet: usa a última cópia salva no aparelho
      if (ehErroDeRede(error)) {
        const cache = await idbGet('maquinas');
        if (cache) { state.maquinas = cache.lista; state.cacheEm = cache.em; definirOffline(true); return; }
      }
      throw error;
    }
    all.push(...d);
    if (d.length < 1000) break;
  }
  state.maquinas = all;
  state.cacheEm = null;
  definirOffline(false);
  idbSet('maquinas', { em: Date.now(), lista: all });
}
async function carregarHist() {
  const { data: d } = await sb.from('maquinas_historico')
    .select('*, maquinas(hostname, cd_id)').order('criado_em', { ascending: false }).limit(60);
  state.hist = d || [];
}
async function recarregarMaquina(id) {
  const { data: d } = await sb.from('vw_maquinas').select('*').eq('id', id).maybeSingle();
  const i = state.maquinas.findIndex((m) => m.id === id);
  if (d) { if (i >= 0) state.maquinas[i] = d; else state.maquinas.push(d); }
  else if (i >= 0) state.maquinas.splice(i, 1);
  return d;
}

/* =====================================================================
   Realtime
   ===================================================================== */
const rerender = debounce(() => {
  atualizarBadge();
  if (state.view === 'emprestimos') renderEmprestimos(false);
  if (state.view === 'painel') renderPainel();
  if (state.view === 'maquinas') renderTabela();
  if (state.view === 'conferencia' && state.conf) renderConfDetalhe(false);
}, 400);

function iniciarRealtime() {
  const live = $('.live');
  sb.channel('inventario')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'maquinas' }, async (p) => {
      live.classList.add('flash'); setTimeout(() => live.classList.remove('flash'), 400);
      if (p.eventType === 'DELETE') {
        state.maquinas = state.maquinas.filter((m) => m.id !== p.old.id);
      } else {
        const m = await recarregarMaquina(p.new.id);
        if (p.eventType === 'INSERT' && m) toast(`Nova máquina: ${m.hostname}`);
        state.flash.add(p.new.id);
        setTimeout(() => state.flash.delete(p.new.id), 2000);
        if (state.drawerId === p.new.id && !state.drawerDirty) abrirMaquina(p.new.id, true);
      }
      carregarHist().then(rerender);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimos' }, () => {
      if (state.view === 'emprestimos') carregarEmprestimos().then(rerender);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conferencia_itens' }, (p) => {
      if (state.conf && p.new.conferencia_id === state.conf.id && !state.confItens.some((i) => i.id === p.new.id)) {
        state.confItens.push(p.new);
        rerender();
      }
    })
    .subscribe((st) => {
      live.classList.toggle('on', st === 'SUBSCRIBED');
      $('#live-txt').textContent = st === 'SUBSCRIBED' ? 'ao vivo' : 'reconectando…';
    });
  // mantém "há X min" e a situação online atualizados
  setInterval(rerender, 60_000);
}

/* =====================================================================
   Navegação
   ===================================================================== */
function navegar() {
  const [view, ...resto] = (location.hash.slice(1) || 'painel').split('/');
  const arg = resto.join('/');
  // QR code da etiqueta: #maquina/<patrimônio ou hostname> abre a ficha
  if (view === 'maquina') {
    const m = acharMaquina(decodeURIComponent(arg));
    history.replaceState(null, '', '#maquinas');
    navegar();
    if (m) abrirMaquina(m.id); else toast(`Máquina "${decodeURIComponent(arg)}" não encontrada no inventário`, true);
    return;
  }
  state.view = ['painel', 'maquinas', 'emprestimos', 'etiquetas', 'conferencia', 'agente', 'relatorios', 'usuarios'].includes(view) ? view : 'painel';
  if (state.view === 'usuarios' && !ehAdmin()) { history.replaceState(null, '', '#painel'); state.view = 'painel'; }
  if (state.view !== 'etiquetas') $('#view-etiquetas').innerHTML = ''; // remove o @page das etiquetas
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + state.view));
  window.scrollTo(0, 0);
  if (state.view === 'painel') renderPainel();
  if (state.view === 'maquinas') renderMaquinas();
  if (state.view === 'conferencia') arg ? abrirConferencia(arg) : renderConferencias();
  if (state.view === 'agente') renderAgente();
  if (state.view === 'emprestimos') carregarEmprestimos().then(() => renderEmprestimos(true));
  if (state.view === 'etiquetas') renderEtiquetas();
  if (state.view === 'relatorios') renderRelatorios(arg || 'parque');
  if (state.view === 'usuarios') renderUsuarios(arg || 'usuarios');
}
function irMaquinas(filtros = {}) {
  state.f = { ...F_PADRAO, ...filtros };
  if (location.hash === '#maquinas') { syncToolbar(); renderTabela(); } else location.hash = '#maquinas';
}

/* =====================================================================
   PAINEL
   ===================================================================== */
function contar(lista, fn) {
  const m = new Map();
  for (const x of lista) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function barras(pares, filtroKey, corFn = () => '', limite = 8) {
  if (!pares.length) return '<p class="muted">Sem dados ainda.</p>';
  const max = Math.max(...pares.map((p) => p[1]));
  return `<div class="bars">${pares.slice(0, limite).map(([k, n]) => `
    <button class="bar" data-f="${filtroKey}" data-v="${esc(k)}" title="Ver ${n} máquina(s)">
      <span class="bar-label">${esc(k)}</span>
      <span class="bar-track"><span class="bar-fill ${corFn(k)}" style="width:${(n / max) * 100}%"></span></span>
      <span class="bar-n">${n}</span>
    </button>`).join('')}</div>`;
}

function renderPainel() {
  const el = $('#view-painel');
  const L = ativas();
  const by = (fn) => L.filter(fn).length;
  const online = by((m) => situacao(m) === 'online');
  const comAlerta = by((m) => (m.alertas || []).some((a) => ALERTAS[a]?.grave));
  const kpi = (label, valor, sub, cls, filtros) =>
    `<button class="card kpi ${cls}" data-filtros='${esc(JSON.stringify(filtros))}'>
       <div class="kpi-label">${label}</div><div class="kpi-value">${valor}</div><div class="kpi-sub">${sub}</div></button>`;

  const alertaCont = Object.keys(ALERTAS).map((k) => [k, by((m) => (m.alertas || []).includes(k))]).filter((x) => x[1] > 0);
  const corSO = (k) => (/Windows 11|Server/.test(k) ? 'c-ok' : /Windows (10|8|7)/.test(k) ? 'c-bad' : 'c-idle');
  const corRAM = (k) => ({ '4 GB ou menos': 'c-bad', '8 GB': 'c-warn', '16 GB': 'c-ok', '32 GB ou mais': 'c-ok' }[k] || 'c-idle');
  const corDisco = (k) => ({ SSD: 'c-ok', HDD: 'c-bad', 'SSD + HDD': 'c-warn' }[k] || 'c-idle');
  const corSit = (k) => 'c-' + (SIT_COR[Object.keys(SIT).find((s) => SIT[s] === k)] || 'idle');
  const ordemSit = Object.values(SIT);
  const ordemRam = ['4 GB ou menos', '8 GB', '16 GB', '32 GB ou mais', 'Sem dado'];

  el.innerHTML = `
    <div class="view-head">
      <div><h1>Painel</h1><p>Atualizado ao vivo conforme os agentes reportam · ${MQ().length} registros</p></div>
      <div class="actions"><button class="btn" data-go="maquinas">Ver todas as máquinas →</button></div>
    </div>
    ${MQ().length === 0 ? `
      <div class="card card-pad empty">
        <h2>Nenhuma máquina ainda</h2>
        <p>Instale o agente coletor nas máquinas ou cadastre manualmente.</p>
        <div class="actions" style="justify-content:center"><a class="btn btn--primary" href="#agente">Instalar agente</a></div>
      </div>` : `
    <div class="kpis">
      ${kpi('Máquinas ativas', L.length, `${by((m) => m.tipo === 'desktop')} desktops · ${by((m) => m.tipo === 'notebook')} notebooks`, '', {})}
      ${kpi('<span class="dot dot--online"></span> Online agora', online, 'reportaram nas últimas 2h', 'kpi--ok', { situacao: 'online' })}
      ${kpi('Sem contato +30 dias', by((m) => situacao(m) === 'offline'), 'verificar se ainda existem', 'kpi--bad', { situacao: 'offline' })}
      ${kpi('Em estoque', by((m) => m.status === 'estoque'), `${by((m) => m.status === 'manutencao')} em manutenção`, '', { status: 'estoque' })}
      ${kpi('Precisam de atenção', comAlerta, 'alertas importantes', 'kpi--warn', { alerta: '_grave' })}
      ${kpi('Nunca reportaram', by((m) => situacao(m) === 'nunca'), 'cadastro manual, sem agente', '', { situacao: 'nunca' })}
      ${kpi('Emprestados', by((m) => m.emprestimo_atual), `${by((m) => (m.alertas || []).includes('emprestimo_atrasado'))} com devolução atrasada`, by((m) => (m.alertas || []).includes('emprestimo_atrasado')) ? 'kpi--bad' : '', { status: 'emprestado' })}
    </div>
    <div class="grid-3">
      <div class="card card-pad"><div class="card-head"><h2>Sistema operacional</h2></div>${barras(contar(L, soGrupo), 'so', corSO)}</div>
      <div class="card card-pad"><div class="card-head"><h2>Memória RAM</h2></div>${barras(contar(L, ramFaixa).sort((a, b) => ordemRam.indexOf(a[0]) - ordemRam.indexOf(b[0])), 'ram', corRAM)}</div>
      <div class="card card-pad"><div class="card-head"><h2>Armazenamento</h2></div>${barras(contar(L, tipoDisco), 'disco', corDisco)}</div>
      <div class="card card-pad"><div class="card-head"><h2>Último contato</h2></div>${barras(contar(L, (m) => SIT[situacao(m)]).sort((a, b) => ordemSit.indexOf(a[0]) - ordemSit.indexOf(b[0])), 'situacao', corSit)}</div>
      <div class="card card-pad"><div class="card-head"><h2>Status</h2></div>${barras(contar(MQ(), (m) => STATUS[m.status]), 'status')}</div>
      <div class="card card-pad"><div class="card-head"><h2>Setores</h2></div>${barras(contar(L, (m) => m.setor || 'Sem setor'), 'setor', () => 'c-info')}</div>
      <div class="card card-pad"><div class="card-head"><h2>Idade do parque</h2><span class="muted" style="font-size:12px">pela data de compra</span></div>${barras(contar(L, idadeFaixa).sort((a, b) => ORDEM_IDADE.indexOf(a[0]) - ORDEM_IDADE.indexOf(b[0])), 'idade', (k) => ({ '0 a 2 anos': 'c-ok', '3 a 4 anos': 'c-warn', '5 anos ou mais': 'c-bad' }[k] || 'c-idle'))}</div>
      <div class="card card-pad"><div class="card-head"><h2>Garantia</h2></div>${barras(contar(L, garantiaFaixa).sort((a, b) => ORDEM_GAR.indexOf(a[0]) - ORDEM_GAR.indexOf(b[0])), 'garantia', (k) => ({ Vigente: 'c-ok', 'Vence em 90 dias': 'c-info', 'Vence em 30 dias': 'c-warn', Vencida: 'c-bad' }[k] || 'c-idle'))}</div>
      <div class="card card-pad"><div class="card-head"><h2>Emprestados agora</h2><a href="#emprestimos" class="muted" style="font-size:12.5px">ver todos →</a></div>
        ${(() => {
          const emp = L.filter((m) => m.emprestimo_atual).sort((a, b) => new Date(a.emprestimo_atual.previsto_devolucao || 8.64e15) - new Date(b.emprestimo_atual.previsto_devolucao || 8.64e15));
          if (!emp.length) return '<p class="muted">Nenhum notebook emprestado.</p>';
          return `<div class="feed">${emp.slice(0, 6).map((m) => { const e = m.emprestimo_atual; const atras = e.previsto_devolucao && new Date(e.previsto_devolucao) < new Date();
            return `<div class="feed-item"><a data-id="${m.id}" class="mono">${esc(m.hostname)}</a><span class="t">${atras ? pill('atrasado', 'bad') : e.previsto_devolucao ? 'até ' + dataHora(e.previsto_devolucao) : ''}</span><span class="d">${esc(e.colaborador)} · desde ${rel(e.retirado_em).replace('há ', '')}</span></div>`; }).join('')}</div>`;
        })()}
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card card-pad">
        <div class="card-head"><h2>Pontos de atenção</h2></div>
        ${alertaCont.length ? `<div class="alert-list">${alertaCont.map(([k, n]) => `
          <button class="alert-row" data-alerta="${k}">
            <span class="tag ${ALERTAS[k].grave ? 'tag--bad' : ''}">${esc(ALERTAS[k].l)}</span>
            <small>${esc(ALERTAS[k].d)}</small><span class="n">${n}</span>
          </button>`).join('')}</div>` : '<p class="muted">Tudo em ordem. 🎉</p>'}
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>Alterações recentes</h2><span class="muted" style="font-size:12px">troca de peças, SO, status…</span></div>
        <div class="feed">${(() => { const hs = state.hist.filter((h) => !state.cdAtual || h.maquinas?.cd_id === state.cdAtual).slice(0, 40); return hs.length ? hs.map(feedItem).join('') : '<p class="muted">Nenhuma alteração registrada.</p>'; })()}</div>
      </div>
    </div>`}`;

  $$('.kpi', el).forEach((b) => (b.onclick = () => irMaquinas(JSON.parse(b.dataset.filtros))));
  $$('.bar', el).forEach((b) => (b.onclick = () => {
    let v = b.dataset.v; const f = b.dataset.f;
    if (f === 'situacao') v = Object.keys(SIT).find((k) => SIT[k] === v);
    if (f === 'status') { v = Object.keys(STATUS).find((k) => STATUS[k] === v); return irMaquinas({ status: v }); }
    if (f === 'setor' && v === 'Sem setor') v = '_vazio';
    irMaquinas({ [f]: v });
  }));
  $$('.alert-row', el).forEach((b) => (b.onclick = () => irMaquinas({ alerta: b.dataset.alerta })));
  $$('[data-go]', el).forEach((b) => (b.onclick = () => irMaquinas()));
  $$('.feed a', el).forEach((a) => (a.onclick = () => abrirMaquina(a.dataset.id)));
}

const ORDEM_IDADE = ['0 a 2 anos', '3 a 4 anos', '5 anos ou mais', 'Sem data de compra'];
const ORDEM_GAR = ['Vigente', 'Vence em 90 dias', 'Vence em 30 dias', 'Vencida', 'Sem informação'];
const reducao = (h) => ['memoria_gb', 'armazenamento_total_gb'].includes(h.campo) && h.valor_anterior != null && h.valor_novo != null
  && Number(h.valor_novo) < Number(h.valor_anterior) - (h.campo === 'memoria_gb' ? 0.5 : 10);

function fmtValorHist(campo, v) {
  if (v == null || v === '') return '—';
  if (campo === 'memoria_gb' || campo === 'armazenamento_total_gb') return gb(v);
  if (campo === 'status') return STATUS[v] || v;
  if (campo === 'tipo') return TIPO[v] || v;
  if (campo === 'data_compra' || campo === 'garantia_fim') return dataBR(v);
  if (campo === 'cd_id') return cdNome(v);
  return v;
}
function feedItem(h) {
  const host = h.maquinas?.hostname || '(removida)';
  const desc = h.campo === 'cadastro'
    ? 'Nova máquina cadastrada'
    : h.campo === 'hw_verificado' ? 'Alerta de peça marcado como verificado'
    : `${esc(CAMPOS_HIST[h.campo] || h.campo)}: <span class="chg-old">${esc(fmtValorHist(h.campo, h.valor_anterior))}</span> → <span class="chg-new">${esc(fmtValorHist(h.campo, h.valor_novo))}</span>`;
  return `<div class="feed-item ${reducao(h) ? 'feed-item--bad' : ''}"><a data-id="${h.maquina_id}" class="mono">${reducao(h) ? '⚠ ' : ''}${esc(host)}</a><span class="t">${rel(h.criado_em)}</span>
    <span class="d">${desc} <span class="muted">· ${esc(h.origem === 'agente' ? 'agente' : h.origem)}</span></span></div>`;
}

/* =====================================================================
   MÁQUINAS (lista)
   ===================================================================== */
const COLS = [
  { k: 'sel', l: '<input type="checkbox" id="sel-todos" title="Selecionar todos os filtrados">', v: (m) => (state.sel.has(m.id) ? 0 : 1),
    c: (m) => `<input type="checkbox" class="sel" data-sel="${m.id}" ${state.sel.has(m.id) ? 'checked' : ''} aria-label="Selecionar ${esc(m.hostname)}">`, cls: 'td-sel' },
  { k: 'situacao', l: '', v: (m) => (m.ultimo_online ? -new Date(m.ultimo_online) : 0), c: (m) => dot(m) },
  { k: 'hostname', l: 'Hostname', v: (m) => m.hostname, c: (m) => `<span class="mono">${esc(m.hostname)}</span>`, cls: 'host' },
  { k: 'cd', l: 'CD', soCD: true, v: (m) => cdCod(m.cd_id), c: (m) => `<span class="pill pill--cd" title="${esc(cdNome(m.cd_id))}">${esc(cdCod(m.cd_id))}</span>` },
  { k: 'ativo', l: 'Patrimônio', v: (m) => m.ativo || '', c: (m) => (m.ativo ? `<span class="mono">${esc(m.ativo)}</span>` : '<span class="muted">—</span>') },
  { k: 'tipo', l: 'Tipo', v: (m) => m.tipo, c: (m) => esc(TIPO[m.tipo]) },
  { k: 'modelo', l: 'Modelo', v: (m) => m.modelo || '', c: (m) => `${esc(m.modelo || '—')}<span class="sub">${esc(m.fabricante || '')}</span>` },
  { k: 'so', l: 'Sistema', v: (m) => soLabel(m), c: (m) => `${esc(soLabel(m))}<span class="sub">${esc(m.so_build ? 'build ' + m.so_build : '')}</span>` },
  { k: 'memoria_gb', l: 'RAM', v: (m) => Number(m.memoria_gb) || 0, c: (m) => gb(m.memoria_gb), cls: 'num' },
  { k: 'armazenamento_total_gb', l: 'Armazenamento', v: (m) => Number(m.armazenamento_total_gb) || 0, c: (m) => {
      const pct = m.livre_pct != null ? 100 - m.livre_pct : null;
      return `${gb(m.armazenamento_total_gb)} <span class="muted">${esc(tipoDisco(m) === 'Sem dado' ? '' : tipoDisco(m))}</span>${pct != null ? `<span class="meter" title="${m.livre_pct}% livre"><i class="${pct > 90 ? 'bad' : pct > 75 ? 'warn' : ''}" style="width:${pct}%"></i></span>` : ''}`;
    } },
  { k: 'usuario_logado', l: 'Usuário / setor', v: (m) => m.usuario_logado || '', c: (m) => `${esc((m.usuario_logado || '—').split('\\').pop())}<span class="sub">${esc(m.setor || '')}</span>` },
  { k: 'ultimo_online', l: 'Último contato', v: (m) => (m.ultimo_online ? new Date(m.ultimo_online).getTime() : 0), c: (m) => `${rel(m.ultimo_online)}<span class="sub">${m.ultimo_online ? dataHora(m.ultimo_online) : ''}</span>` },
  { k: 'status', l: 'Status', v: (m) => STATUS[m.status], c: (m) => statusPill(m.status) },
  { k: 'alertas', l: 'Alertas', v: (m) => (m.alertas || []).length, c: (m) => tags(m) },
];

const colsVisiveis = () => COLS.filter((c) => !c.soCD || mostrarColCD());
function filtrar() {
  const f = state.f;
  const termos = up(f.q).split(/\s+/).filter(Boolean);
  return MQ().filter((m) => {
    if (f.status === '_ativos' ? m.status === 'descartado' : f.status && m.status !== f.status) return false;
    if (f.tipo && m.tipo !== f.tipo) return false;
    if (f.situacao && situacao(m) !== f.situacao) return false;
    if (f.so && soGrupo(m) !== f.so) return false;
    if (f.ram && ramFaixa(m) !== f.ram) return false;
    if (f.disco && tipoDisco(m) !== f.disco) return false;
    if (f.setor && (f.setor === '_vazio' ? m.setor : m.setor !== f.setor)) return false;
    if (f.idade && idadeFaixa(m) !== f.idade) return false;
    if (f.garantia && garantiaFaixa(m) !== f.garantia) return false;
    if (f.alerta) {
      const a = m.alertas || [];
      if (f.alerta === '_grave' ? !a.some((x) => ALERTAS[x]?.grave) : !a.includes(f.alerta)) return false;
    }
    if (termos.length) {
      const txt = up([m.hostname, m.ativo, m.numero_serie, m.usuario_logado, m.ip, m.mac, m.modelo, m.fabricante,
        m.setor, m.localizacao, m.responsavel, m.cpu, m.observacoes].join(' '));
      if (!termos.every((t) => txt.includes(t))) return false;
    }
    return true;
  });
}
function ordenar(lista) {
  const col = COLS.find((c) => c.k === state.sort.col) || COLS[1];
  const d = state.sort.dir;
  return lista.sort((a, b) => {
    const x = col.v(a), y = col.v(b);
    if (typeof x === 'number') return (x - y) * d;
    if (!x && y) return 1; if (x && !y) return -1;
    return String(x).localeCompare(String(y), 'pt-BR', { numeric: true }) * d;
  });
}

function opts(pares, sel) {
  return pares.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
function renderMaquinas() {
  const el = $('#view-maquinas');
  if (!state.maqMontada) {
    el.innerHTML = `
      <div class="view-head">
        <div><h1>Máquinas</h1><p>Clique em uma linha para ver detalhes, editar e o histórico.</p></div>
        <div class="actions">
          <button class="btn" id="btn-link">Link de instalação</button>
          <button class="btn" id="btn-etq">Etiquetas</button>
          <button class="btn" id="btn-import">Importar compras</button>
          <button class="btn" id="btn-csv">Exportar CSV</button>
          <button class="btn btn--primary" id="btn-nova">+ Nova máquina</button>
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search"><input id="f-q" type="search" placeholder="Buscar hostname, patrimônio, série, usuário, IP, modelo…" autocomplete="off"></div>
          <select id="f-tipo"></select><select id="f-status"></select><select id="f-situacao"></select>
          <select id="f-so"></select><select id="f-alerta"></select><select id="f-setor"></select><select id="f-garantia"></select>
        </div>
        <div class="chips" id="chips-wrap" style="padding-bottom:10px;align-items:center"><span id="chips" style="display:contents"></span><span class="count" id="count"></span></div>
        <div class="sel-bar" id="sel-bar" hidden></div>
        <div class="table-wrap"><table><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
      </div>`;
    $('#f-q').oninput = debounce((e) => { state.f.q = e.target.value; renderTabela(); }, 120);
    ['tipo', 'status', 'situacao', 'so', 'alerta', 'setor', 'garantia'].forEach((k) => {
      $('#f-' + k).onchange = (e) => { state.f[k] = e.target.value; renderTabela(); };
    });
    $('#thead').onclick = (e) => {
      const th = e.target.closest('th'); if (!th) return;
      const k = th.dataset.col;
      if (k === 'sel') {
        if (e.target.id !== 'sel-todos') return;
        const lista = filtrar();
        if (e.target.checked) lista.forEach((m) => state.sel.add(m.id)); else lista.forEach((m) => state.sel.delete(m.id));
        return renderTabela();
      }
      state.sort = { col: k, dir: state.sort.col === k ? -state.sort.dir : 1 };
      renderTabela();
    };
    $('#tbody').onclick = (e) => {
      const cb = e.target.closest('[data-sel]');
      if (cb) { cb.checked ? state.sel.add(cb.dataset.sel) : state.sel.delete(cb.dataset.sel); return renderSelBar(); }
      if (e.target.closest('.td-sel')) return;
      const tr = e.target.closest('tr[data-id]'); if (tr) abrirMaquina(tr.dataset.id);
    };
    $('#btn-etq').onclick = () => irEtiquetas(state.sel.size ? [...state.sel] : filtrar().map((m) => m.id));
    $('#btn-import').onclick = modalImportarCompras;
    $('#btn-csv').onclick = exportarCSV;
    $('#btn-link').onclick = () => modalLinkInstalacao();
    $('#btn-nova').onclick = () => modalNovaMaquina();
    state.maqMontada = true;
  }
  syncToolbar();
  renderTabela();
  if (matchMedia('(min-width: 821px)').matches) $('#f-q').focus();
}
function syncToolbar() {
  if (!state.maqMontada) return;
  const f = state.f;
  $('#f-q').value = f.q;
  $('#f-tipo').innerHTML = opts([['', 'Todos os tipos'], ...Object.entries(TIPO)], f.tipo);
  $('#f-status').innerHTML = opts([['_ativos', 'Status: ativos'], ['', 'Todos (inclui descartados)'], ...Object.entries(STATUS)], f.status);
  $('#f-situacao').innerHTML = opts([['', 'Qualquer contato'], ...Object.entries(SIT)], f.situacao);
  const sos = contar(MQ(), soGrupo).map(([k]) => [k, k]);
  $('#f-so').innerHTML = opts([['', 'Todos os sistemas'], ...sos], f.so);
  $('#f-alerta').innerHTML = opts([['', 'Sem filtro de alerta'], ['_grave', 'Alertas importantes'], ...Object.entries(ALERTAS).map(([k, a]) => [k, a.l])], f.alerta);
  $('#f-garantia').innerHTML = opts([['', 'Qualquer garantia'], ...ORDEM_GAR.map((g) => [g, g])], f.garantia);
  $('#f-setor').innerHTML = opts([['', 'Todos os setores'], ['_vazio', 'Sem setor'], ...setores().map((s) => [s, s])], f.setor);
}
function renderTabela() {
  if (!state.maqMontada || state.view !== 'maquinas') return;
  const lista = ordenar(filtrar());
  const cols = colsVisiveis();
  $('#thead').innerHTML = `<tr>${cols.map((c) => `<th data-col="${c.k}" class="${c.cls || ''}">${c.l}</th>`).join('')}</tr>`;
  $$('#view-maquinas th').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.col === state.sort.col);
    th.classList.toggle('asc', state.sort.dir === 1);
  });
  // chips para filtros vindos do painel que não têm select
  const chips = [];
  if (state.f.ram) chips.push(['ram', 'RAM', state.f.ram]);
  if (state.f.disco) chips.push(['disco', 'Disco', state.f.disco]);
  if (state.f.idade) chips.push(['idade', 'Idade', state.f.idade]);
  const algum = Object.keys(F_PADRAO).some((k) => state.f[k] !== F_PADRAO[k]);
  $('#chips').innerHTML = chips.map(([k, l, v]) => `<button class="chip" data-k="${k}">${l}: <b>${esc(v)}</b><span>×</span></button>`).join('')
    + (algum ? '<button class="btn btn--ghost btn--sm" id="limpar">Limpar filtros</button>' : '');
  $$('#chips .chip').forEach((c) => (c.onclick = () => { state.f[c.dataset.k] = ''; renderTabela(); }));
  $('#limpar')?.addEventListener('click', () => { state.f = { ...F_PADRAO }; syncToolbar(); renderTabela(); });
  $('#count').textContent = `${lista.length} de ${MQ().length} máquinas`;
  renderSelBar(lista);
  $('#tbody').innerHTML = lista.length
    ? lista.map((m) => `<tr data-id="${m.id}" class="${state.flash.has(m.id) ? 'flash' : ''}">${cols.map((c) => `<td class="${c.cls || ''}">${c.c(m)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" class="empty">Nenhuma máquina encontrada com esses filtros.</td></tr>`;
}

function renderSelBar(lista = filtrar()) {
  const bar = $('#sel-bar');
  if (!bar) return;
  // remove da seleção o que não existe mais
  for (const id of state.sel) if (!state.maquinas.some((m) => m.id === id)) state.sel.delete(id);
  const n = state.sel.size;
  const todos = $('#sel-todos');
  if (todos) {
    const vis = lista.filter((m) => state.sel.has(m.id)).length;
    todos.checked = lista.length > 0 && vis === lista.length;
    todos.indeterminate = vis > 0 && vis < lista.length;
  }
  bar.hidden = !n;
  $('#btn-etq').textContent = n ? `Etiquetas (${n})` : 'Etiquetas';
  if (!n) return;
  bar.innerHTML = `<strong>${n} selecionada${n > 1 ? 's' : ''}</strong>
    <button class="btn btn--sm btn--primary" id="sel-etq">Imprimir etiquetas</button>
    <button class="btn btn--sm" id="sel-limpar">Limpar seleção</button>`;
  $('#sel-etq').onclick = () => irEtiquetas([...state.sel]);
  $('#sel-limpar').onclick = () => { state.sel.clear(); renderTabela(); };
}

function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + conteudo], { type: tipo }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCel = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function exportarCSV() {
  const cab = ['CD', 'Hostname', 'Patrimônio', 'Tipo', 'Status', 'Fabricante', 'Modelo', 'Nº série', 'Processador', 'RAM (GB)', 'Slots RAM',
    'Armazenamento (GB)', 'Livre (GB)', 'Tipo disco', 'Sistema', 'Versão', 'Build', 'Arquitetura', 'IP', 'MAC', 'Domínio', 'Usuário',
    'Setor', 'Localização', 'Responsável', 'Último contato', 'Situação', 'Alertas', 'Observações',
    'Data de compra', 'Fornecedor', 'Nota fiscal', 'Valor', 'Fim da garantia', 'Situação garantia', 'Emprestado para', 'Devolução prevista'];
  const linhas = ordenar(filtrar()).map((m) => [cdNome(m.cd_id), m.hostname, m.ativo, TIPO[m.tipo], STATUS[m.status], m.fabricante, m.modelo, m.numero_serie,
    m.cpu, m.memoria_gb, m.memoria_slots_total, m.armazenamento_total_gb, m.armazenamento_livre_gb, tipoDisco(m), m.so_nome,
    m.so_display_version, m.so_build, m.so_arquitetura, m.ip, m.mac, m.dominio, m.usuario_logado, m.setor, m.localizacao,
    m.responsavel, dataHora(m.ultimo_online), SIT[situacao(m)], (m.alertas || []).map((a) => ALERTAS[a]?.l || a).join(', '), m.observacoes,
    dataBR(m.data_compra), m.fornecedor, m.nota_fiscal, m.valor_compra != null ? String(m.valor_compra).replace('.', ',') : '', dataBR(m.garantia_fim), garantiaFaixa(m),
    m.emprestimo_atual?.colaborador, m.emprestimo_atual?.previsto_devolucao ? dataHora(m.emprestimo_atual.previsto_devolucao) : '']);
  baixar(`inventario-${new Date().toISOString().slice(0, 10)}.csv`, [cab, ...linhas].map((l) => l.map(csvCel).join(';')).join('\r\n'));
}

/* =====================================================================
   DRAWER — detalhe da máquina
   ===================================================================== */
function idadeTexto(d) {
  const meses = Math.floor((Date.now() - new Date(d + 'T12:00:00')) / (30.44 * 864e5));
  if (meses < 0) return '—';
  const a = Math.floor(meses / 12), mm = meses % 12;
  return [a && `${a} ano${a > 1 ? 's' : ''}`, mm && `${mm} ${mm > 1 ? 'meses' : 'mês'}`].filter(Boolean).join(' e ') || 'menos de 1 mês';
}
function garantiaPill(m) {
  const g = garantiaFaixa(m);
  if (g === 'Sem informação') return '';
  return pill(g === 'Vigente' || g === 'Vence em 90 dias' ? `Garantia até ${dataBR(m.garantia_fim)}` : `Garantia: ${g.toLowerCase()}`, { Vigente: 'ok', 'Vence em 90 dias': 'info', 'Vence em 30 dias': 'warn', Vencida: 'bad' }[g]);
}

function fecharDrawer() {
  if (state.drawerDirty && !confirm('Descartar alterações não salvas?')) return;
  $('#drawer').classList.remove('open');
  $('#drawer-bg').hidden = true;
  state.drawerId = null; state.drawerDirty = false;
}
const spec = (l, v, full = false) => `<div class="spec ${full ? 'spec--full' : ''}"><dt>${l}</dt><dd>${v ?? '—'}</dd></div>`;
const campo = (nome, label, valor, tipo = 'text', extra = '') =>
  `<label>${label}<input name="${nome}" type="${tipo}" value="${esc(valor ?? '')}" ${extra}></label>`;
const sel = (nome, label, mapa, valor) => `<label>${label}<select name="${nome}">${opts(Object.entries(mapa), valor)}</select></label>`;

async function abrirMaquina(id, silencioso = false) {
  let m = state.maquinas.find((x) => x.id === id);
  if (!m) m = await recarregarMaquina(id);
  if (!m) return toast('Máquina não encontrada', true);
  state.drawerId = id; state.drawerDirty = false;
  const d = $('#drawer');
  const manual = m.origem === 'manual';
  const usado = m.livre_pct != null ? 100 - m.livre_pct : null;
  const mods = m.memoria_modulos || [];
  const uptime = m.ultimo_boot ? rel(m.ultimo_boot).replace('há ', '') : null;

  d.innerHTML = `
    <div class="drawer-head">
      <div class="top">${dot(m)}<h2>${esc(m.hostname)}</h2>${statusPill(m.status)}
        <button class="btn btn--ghost btn--sm close" id="d-fechar" aria-label="Fechar">✕</button></div>
      <div class="muted">${esc(TIPO[m.tipo])} · ${esc(m.modelo || 'modelo não informado')} ·
        Último contato: <strong style="color:var(--ink)">${rel(m.ultimo_online)}</strong>
        ${m.origem === 'agente' ? `· via agente ${esc(m.agente_versao || '')}` : '· cadastro manual'}</div>
      ${(m.alertas || []).length ? `<div>${tags(m, 9)}</div>` : ''}
    </div>
    <div class="drawer-body">
      ${m.hw_reducao ? (() => { const h = m.hw_reducao; const nome = h.campo === 'memoria_gb' ? 'A memória' : 'O armazenamento';
        return `<div class="banner banner--bad"><div><strong>⚠ ${nome} diminuiu de ${gb(h.de)} para ${gb(h.para)}</strong>
          <span>Detectado em ${dataHora(h.em)}. Pode ser um pente/disco com defeito ou uma peça retirada da máquina. Confira fisicamente.</span></div>
          <button class="btn btn--sm" id="d-verificado">Marcar como verificado</button></div>`; })() : ''}
      ${m.emprestimo_atual ? (() => { const e = m.emprestimo_atual; const atras = e.previsto_devolucao && new Date(e.previsto_devolucao) < new Date();
        return `<div class="banner ${atras ? 'banner--bad' : 'banner--info'}"><div><strong>${atras ? 'Devolução atrasada · ' : ''}Emprestado para ${esc(e.colaborador)}${e.matricula ? ' (' + esc(e.matricula) + ')' : ''}</strong>
          <span>Desde ${dataHora(e.retirado_em)}${e.previsto_devolucao ? ' · devolução prevista ' + dataHora(e.previsto_devolucao) : ''}</span></div>
          <button class="btn btn--sm btn--primary" id="d-devolver">Registrar devolução</button></div>`; })() : ''}
      <div class="big-specs">
        <div class="big-spec"><div class="l">Memória</div><div class="v">${gb(m.memoria_gb)}</div>
          <div class="l">${mods.length ? `${mods.length} módulo(s)${m.memoria_slots_total ? ' de ' + m.memoria_slots_total + ' slots' : ''}` : '&nbsp;'}</div></div>
        <div class="big-spec"><div class="l">Armazenamento</div><div class="v">${gb(m.armazenamento_total_gb)}</div>
          <div class="l">${esc(tipoDisco(m))}${m.armazenamento_livre_gb != null ? ' · ' + gb(m.armazenamento_livre_gb) + ' livre' : ''}</div>
          ${usado != null ? `<div class="progress" style="margin-top:6px"><i style="width:${usado}%;background:${usado > 90 ? 'var(--bad)' : usado > 75 ? 'var(--warn)' : 'var(--ink-2)'}"></i></div>` : ''}</div>
        <div class="big-spec"><div class="l">Sistema</div><div class="v" style="font-size:16px">${esc(soFamilia(m))}</div>
          <div class="l">${esc([m.so_display_version, m.so_build && 'build ' + m.so_build].filter(Boolean).join(' · ') || '&nbsp;')}</div></div>
      </div>

      <form id="d-form">
        <div class="section-title"><h3>Controle de inventário</h3></div>
        <div class="form-grid">
          ${ehAdmin() ? `<label>CD<select name="cd_id">${opts(state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}`]), m.cd_id)}</select></label>` : `<label>CD<input value="${esc(cdCod(m.cd_id) + ' · ' + cdNome(m.cd_id))}" disabled></label>`}
          ${campo('ativo', 'Patrimônio', m.ativo, 'text', 'class="mono" placeholder="Nº da etiqueta"')}
          ${sel('status', 'Status', STATUS, m.status)}
          ${sel('tipo', 'Tipo', TIPO, m.tipo)}
          ${campo('setor', 'Setor', m.setor, 'text', 'list="dl-setores"')}
          ${campo('localizacao', 'Localização', m.localizacao, 'text', 'placeholder="Ex.: Expedição, doca 3"')}
          ${campo('responsavel', 'Responsável', m.responsavel)}
          <label class="full">Observações<textarea name="observacoes">${esc(m.observacoes || '')}</textarea></label>
        </div>
        ${manual ? `
        <div class="section-title" style="margin-top:18px"><h3>Dados técnicos (cadastro manual)</h3></div>
        <div class="form-grid">
          ${campo('hostname', 'Hostname', m.hostname, 'text', 'class="mono" required')}
          ${campo('numero_serie', 'Nº de série', m.numero_serie, 'text', 'class="mono"')}
          ${campo('fabricante', 'Fabricante', m.fabricante)}
          ${campo('modelo', 'Modelo', m.modelo)}
          ${campo('memoria_gb', 'Memória (GB)', m.memoria_gb, 'number', 'step="0.5" min="0"')}
          ${campo('armazenamento_total_gb', 'Armazenamento (GB)', m.armazenamento_total_gb, 'number', 'min="0"')}
          ${campo('so_nome', 'Sistema operacional', m.so_nome, 'text', 'list="dl-so"')}
          ${campo('cpu', 'Processador', m.cpu)}
        </div>` : ''}
        <div class="section-title" style="margin-top:18px"><h3>Compra e garantia</h3><span>${garantiaPill(m)}</span></div>
        <div class="form-grid">
          ${campo('data_compra', 'Data de compra', m.data_compra, 'date')}
          ${campo('garantia_fim', 'Fim da garantia', m.garantia_fim, 'date')}
          ${campo('fornecedor', 'Fornecedor', m.fornecedor, 'text', 'list="dl-forn"')}
          ${campo('nota_fiscal', 'Nota fiscal', m.nota_fiscal, 'text', 'class="mono"')}
          ${campo('valor_compra', 'Valor (R$)', m.valor_compra, 'number', 'step="0.01" min="0"')}
          <label>Idade<input value="${m.data_compra ? esc(idadeTexto(m.data_compra)) : '—'}" disabled></label>
        </div>
        <datalist id="dl-forn">${[...new Set(MQ().map((x) => x.fornecedor).filter(Boolean))].map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
        <datalist id="dl-setores">${setores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        <datalist id="dl-so"><option value="Microsoft Windows 11 Pro"><option value="Microsoft Windows 10 Pro"><option value="Microsoft Windows 11 Enterprise"></datalist>
      </form>

      ${!manual ? `
      <div><div class="section-title"><h3>Identificação</h3></div>
        <dl class="specs" style="margin:0">
          ${spec('Fabricante', esc(m.fabricante))}${spec('Modelo', esc(m.modelo))}
          ${spec('Nº de série', `<span class="mono">${esc(m.numero_serie || '—')}</span>`)}${spec('Processador', esc(m.cpu) + (m.cpu_nucleos ? ` <span class="muted">· ${m.cpu_nucleos} núcleos</span>` : ''))}
        </dl></div>` : ''}

      ${mods.length ? `<div><div class="section-title"><h3>Módulos de memória</h3></div>
        <table class="mini-table"><thead><tr><th>Slot</th><th>Tamanho</th><th>Tipo</th><th>Velocidade</th><th>Fabricante</th></tr></thead><tbody>
        ${mods.map((x) => `<tr><td>${esc(x.slot)}</td><td>${gb(x.tamanho_gb)}</td><td>${esc(x.tipo || '—')}</td><td>${x.velocidade ? x.velocidade + ' MHz' : '—'}</td><td>${esc(x.fabricante || '—')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}

      ${(m.discos || []).length ? `<div><div class="section-title"><h3>Discos</h3></div>
        <table class="mini-table"><thead><tr><th>Modelo</th><th>Tipo</th><th>Tamanho</th><th>Saúde</th></tr></thead><tbody>
        ${m.discos.map((x) => `<tr><td>${esc(x.modelo)}<br><span class="muted mono">${esc(x.barramento || '')} ${esc(x.serie || '')}</span></td><td>${pill(x.tipo, x.tipo === 'SSD' ? 'ok' : x.tipo === 'HDD' ? 'bad' : '')}</td><td>${gb(x.tamanho_gb)}</td><td>${esc(x.saude || '—')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}

      ${(m.volumes || []).length ? `<div><div class="section-title"><h3>Volumes</h3></div>
        <table class="mini-table"><thead><tr><th>Unidade</th><th>Total</th><th>Livre</th><th>Uso</th></tr></thead><tbody>
        ${m.volumes.map((v) => { const u = v.total_gb ? Math.round(100 - (100 * v.livre_gb) / v.total_gb) : 0; return `<tr><td class="mono">${esc(v.letra)} ${esc(v.rotulo || '')}</td><td>${gb(v.total_gb)}</td><td>${gb(v.livre_gb, 1)}</td><td>${u}%<span class="meter"><i class="${u > 90 ? 'bad' : u > 75 ? 'warn' : ''}" style="width:${u}%"></i></span></td></tr>`; }).join('')}
        </tbody></table></div>` : ''}

      ${!manual ? `<div><div class="section-title"><h3>Sistema e rede</h3></div>
        <dl class="specs" style="margin:0">
          ${spec('Sistema operacional', esc(soLabel(m)), true)}
          ${spec('Versão / build', `<span class="mono">${esc(m.so_versao || '—')} · ${esc(m.so_build || '—')}</span>`)}${spec('Arquitetura', esc(m.so_arquitetura))}
          ${spec('Instalado em', data(m.so_instalado_em))}${spec('Último boot', m.ultimo_boot ? `${dataHora(m.ultimo_boot)} <span class="muted">(ligada há ${uptime})</span>` : '—')}
          ${spec('IP', `<span class="mono">${esc(m.ip || '—')}</span>`)}${spec('MAC', `<span class="mono">${esc(m.mac || '—')}</span>`)}
          ${spec('Domínio', esc(m.dominio))}${spec('Usuário logado', esc(m.usuario_logado))}
          ${spec('Primeiro registro', dataHora(m.criado_em))}${spec('Último contato', dataHora(m.ultimo_online))}
        </dl></div>` : ''}

      <div id="d-emp-wrap"></div>
      <div><div class="section-title"><h3>Histórico</h3></div><div class="timeline" id="d-hist"><p class="muted">Carregando…</p></div></div>
    </div>
    <div class="drawer-foot">
      ${ehAdmin() ? '<button class="btn btn--danger btn--sm" id="d-excluir">Excluir</button>' : ''}
      ${m.origem === 'manual' || situacao(m) === 'offline' ? '<button class="btn btn--sm" id="d-link">Link de instalação</button>' : ''}
      <button class="btn btn--sm" id="d-etq">Etiqueta</button>
      ${!m.emprestimo_atual && !['descartado', 'extraviado'].includes(m.status) ? '<button class="btn btn--sm" id="d-emprestar">Emprestar</button>' : ''}
      <span class="spacer"></span>
      <button class="btn" id="d-cancelar">Fechar</button>
      <button class="btn btn--primary" id="d-salvar" disabled>Salvar alterações</button>
    </div>`;

  if (!silencioso) { d.classList.add('open'); $('#drawer-bg').hidden = false; }
  $('#d-fechar').onclick = $('#d-cancelar').onclick = fecharDrawer;
  const form = $('#d-form');
  form.oninput = () => { state.drawerDirty = true; $('#d-salvar').disabled = false; };
  form.onsubmit = (e) => { e.preventDefault(); salvar(); };
  $('#d-salvar').onclick = salvar;
  $('#d-etq').onclick = () => { fecharDrawer(); irEtiquetas([id]); };
  $('#d-emprestar')?.addEventListener('click', () => modalEmprestimo(m));
  $('#d-devolver')?.addEventListener('click', () => modalDevolucao(m.emprestimo_atual.id));
  $('#d-verificado')?.addEventListener('click', async () => {
    const { error } = await sb.from('maquinas').update({ hw_verificado_em: new Date().toISOString() }).eq('id', id);
    if (error) return toast(erroMsg(error), true);
    await recarregarMaquina(id); toast('Alerta marcado como verificado'); abrirMaquina(id, true); rerender();
  });
  $('#d-link')?.addEventListener('click', () => modalLinkInstalacao({ ativo: m.ativo, setor: m.setor, localizacao: m.localizacao, responsavel: m.responsavel }));
  $('#d-excluir')?.addEventListener('click', async () => {
    if (!confirm(`Excluir ${m.hostname} definitivamente? Prefira marcar como "Descartado" para manter o histórico.`)) return;
    const { error } = await sb.from('maquinas').delete().eq('id', id);
    if (error) return toast(erroMsg(error), true);
    state.maquinas = state.maquinas.filter((x) => x.id !== id);
    state.drawerDirty = false; fecharDrawer(); rerender(); toast('Máquina excluída');
  });

  async function salvar() {
    const fd = new FormData(form);
    const diff = {};
    for (const [k, v0] of fd.entries()) {
      let v = String(v0).trim();
      if (k === 'hostname') v = v.toUpperCase();
      const novo = v === '' ? null : ['memoria_gb', 'armazenamento_total_gb', 'valor_compra'].includes(k) ? Number(v) : v;
      const atual = m[k] ?? null;
      if (String(novo ?? '') !== String(atual ?? '') && !(typeof novo === 'number' && Number(atual) === novo)) diff[k] = novo;
    }
    if (!Object.keys(diff).length) { state.drawerDirty = false; return toast('Nada para salvar'); }
    $('#d-salvar').disabled = true;
    const { error } = await sb.from('maquinas').update(diff).eq('id', id);
    if (error) { $('#d-salvar').disabled = false; return toast(erroMsg(error), true); }
    state.drawerDirty = false;
    await recarregarMaquina(id);
    toast('Alterações salvas');
    abrirMaquina(id, true); rerender();
  }

  const [{ data: hist }, { data: emps }] = await Promise.all([
    sb.from('maquinas_historico').select('*').eq('maquina_id', id).order('criado_em', { ascending: false }).limit(100),
    sb.from('emprestimos').select(EMP_COLS).eq('maquina_id', id).order('retirado_em', { ascending: false }).limit(30),
  ]);
  if (state.drawerId !== id) return;
  if ((emps || []).length) {
    $('#d-emp-wrap').innerHTML = `<div class="section-title"><h3>Empréstimos (${emps.length})</h3></div>
      <table class="mini-table"><thead><tr><th>Colaborador</th><th>Retirada</th><th>Devolução</th><th></th></tr></thead><tbody>
      ${emps.map((e) => `<tr><td>${esc(e.colaborador)}${e.matricula ? `<br><span class="muted">${esc(e.matricula)}</span>` : ''}</td><td>${dataHora(e.retirado_em)}</td>
        <td>${e.devolvido_em ? dataHora(e.devolvido_em) + (e.condicao_devolucao && e.condicao_devolucao !== 'ok' ? ' ' + pill(COND[e.condicao_devolucao], 'bad') : '') : pill('em aberto', 'info')}</td>
        <td><button class="btn btn--sm btn--ghost" data-termo="${e.id}">Termo</button></td></tr>`).join('')}
      </tbody></table>`;
    $$('[data-termo]', $('#d-emp-wrap')).forEach((b) => (b.onclick = () => imprimirTermo(b.dataset.termo)));
  }
  $('#d-hist').innerHTML = (hist || []).length ? hist.map((h) => `
    <div class="tl ${reducao(h) ? 'bad' : CAMPOS_HW.includes(h.campo) ? 'hw' : ''}"><span class="b"></span><div>
      ${h.campo === 'cadastro' ? '<strong>Cadastrada no inventário</strong>' : h.campo === 'hw_verificado' ? '<strong>Alerta de peça verificado</strong>' : `<strong>${esc(CAMPOS_HIST[h.campo] || h.campo)}</strong>: <span class="chg-old">${esc(fmtValorHist(h.campo, h.valor_anterior))}</span> → <span class="chg-new">${esc(fmtValorHist(h.campo, h.valor_novo))}</span>`}
      <small>${dataHora(h.criado_em)} · ${esc(h.origem)}</small></div></div>`).join('') : '<p class="muted">Sem registros.</p>';
}

/* =====================================================================
   Modal genérico
   ===================================================================== */
function modal(html, onOpen) {
  const dlg = $('#modal');
  dlg.innerHTML = html;
  dlg.showModal();
  $$('[data-close]', dlg).forEach((b) => (b.onclick = () => dlg.close()));
  onOpen?.(dlg);
  return dlg;
}

function modalNovaMaquina(pre = {}) {
  modal(`
    <form method="dialog" id="nova-form">
      <div class="modal-head"><h2>Cadastrar máquina</h2><p class="muted" style="margin:4px 0 0">Prefira instalar o agente: ele preenche e mantém tudo atualizado sozinho. Se o agente for instalado depois, ele reconhece a máquina pelo nº de série, patrimônio ou hostname.</p></div>
      <div class="modal-body"><div class="form-grid">
        ${ehAdmin() ? `<label class="full">CD *<select name="cd_id" required>${opts(cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`]), pre.cd_id || state.cdAtual || cdsAtivos()[0]?.id)}</select></label>` : ''}
        ${campo('hostname', 'Hostname *', pre.hostname, 'text', 'class="mono" required')}
        ${campo('ativo', 'Patrimônio', pre.ativo, 'text', 'class="mono"')}
        ${sel('tipo', 'Tipo', TIPO, pre.tipo || 'desktop')}
        ${sel('status', 'Status', STATUS, pre.status || 'estoque')}
        ${campo('fabricante', 'Fabricante', '')}${campo('modelo', 'Modelo', '')}
        ${campo('numero_serie', 'Nº de série', pre.numero_serie, 'text', 'class="mono"')}
        ${campo('memoria_gb', 'Memória (GB)', '', 'number', 'step="0.5" min="0"')}
        ${campo('armazenamento_total_gb', 'Armazenamento (GB)', '', 'number', 'min="0"')}
        ${campo('so_nome', 'Sistema operacional', '', 'text', 'list="dl-so2"')}
        ${campo('setor', 'Setor', pre.setor, 'text', 'list="dl-set2"')}${campo('localizacao', 'Localização', pre.localizacao)}
      </div>
      <datalist id="dl-set2">${setores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <datalist id="dl-so2"><option value="Microsoft Windows 11 Pro"><option value="Microsoft Windows 10 Pro"></datalist>
      <p class="erro" id="nova-erro"></p></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" value="ok">Cadastrar</button></div>
    </form>`, (dlg) => {
    $('#nova-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const row = {};
      for (const [k, v] of Object.entries(fd)) { const t = String(v).trim(); if (t) row[k] = ['memoria_gb', 'armazenamento_total_gb'].includes(k) ? Number(t) : t; }
      row.hostname = row.hostname.toUpperCase();
      const { data: d, error } = await sb.from('maquinas').insert(row).select('id').single();
      if (error) { $('#nova-erro').textContent = erroMsg(error); return; }
      dlg.close();
      await recarregarMaquina(d.id);
      rerender(); toast('Máquina cadastrada');
      pre.onDone ? pre.onDone(d.id) : abrirMaquina(d.id);
    };
  });
}

/* =====================================================================
   CONFERÊNCIA física (leitor de código de barras / câmera)
   ===================================================================== */
async function renderConferencias() {
  state.conf = null;
  const el = $('#view-conferencia');
  el.innerHTML = `<div class="skeleton">Carregando inventários…</div>`;
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
      <div><h1>Inventários</h1><p>Contagem física com leitor ou câmera: bipe as etiquetas e veja na hora o que foi encontrado, o que falta e o que não está cadastrado.${ehAdmin() ? ' Como administrador, você vê os inventários de todos os CDs e pode editar, reabrir e excluir.' : ''}</p></div>
      <div class="actions">${ehAdmin() ? '<a class="btn" href="#relatorios/inventarios">Relatório de inventários</a>' : ''}<button class="btn btn--primary" id="btn-nova-conf">+ Novo inventário</button></div>
    </div>
    <div class="card" style="margin-bottom:14px"><div class="toolbar">
      <div class="search"><input id="cf-q" type="search" placeholder="Buscar inventário, setor, responsável…" value="${esc(f.q)}"></div>
      <select id="cf-status">${opts([['', 'Todos os status'], ['aberta', 'Abertos'], ['finalizada', 'Finalizados']], f.status)}</select>
      <span class="count" id="cf-count"></span>
    </div></div>
    <div id="cf-lista"></div>`;

  const desenhar = () => {
    const termos = up(f.q).split(/\s+/).filter(Boolean);
    const lista = confs.filter(noCD).filter((c) => !f.status || c.status === f.status)
      .filter((c) => { const t = up([c.nome, c.setor, c.criado_por, cdNome(c.cd_id), cdCod(c.cd_id)].join(' ')); return termos.every((x) => t.includes(x)); });
    $('#cf-count').textContent = `${lista.length} inventário(s)`;
    $('#cf-lista').innerHTML = lista.length ? `<div class="conf-list">${lista.map((c) => {
      const r = resumoConf(c);
      return `<button class="card conf-card" data-id="${c.id}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h2>${esc(c.nome)}</h2>${pill(c.status === 'aberta' ? 'Aberto' : 'Finalizado', c.status === 'aberta' ? 'info' : 'ok')}</div>
        <div class="muted">${mostrarColCD() ? `<span class="pill pill--cd">${esc(cdCod(c.cd_id))}</span> ` : ''}${esc(c.setor || 'Todos os setores')} · ${data(c.criado_em)} · ${esc((c.criado_por || '').split('@')[0])}</div>
        <div class="progress"><i style="width:${r.pct}%"></i></div>
        <div><strong>${r.encontradas}</strong> de ${r.esperadas} encontradas (${r.pct}%)${r.faltando ? ` · <span style="color:var(--bad)">${r.faltando} faltando</span>` : ''}</div></button>`;
    }).join('')}</div>` : `<div class="card card-pad empty"><h2>${confs.length ? 'Nada encontrado com esses filtros' : 'Nenhum inventário ainda'}</h2><p>Crie um para fazer a contagem física de um setor ou do CD inteiro.</p></div>`;
    $$('.conf-card', el).forEach((b) => (b.onclick = () => (location.hash = '#conferencia/' + b.dataset.id)));
  };
  $('#cf-q').oninput = debounce((e) => { f.q = e.target.value; desenhar(); }, 120);
  $('#cf-status').onchange = (e) => { f.status = e.target.value; desenhar(); };
  $('#btn-nova-conf').onclick = () => modalConf();
  desenhar();
}

// números de um inventário (usa o resultado congelado quando finalizado)
function resumoConf(c, itens = c.conferencia_itens || []) {
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

function esperadasDe(c) {
  return state.maquinas.filter((m) => m.cd_id === c.cd_id && !['descartado', 'extraviado'].includes(m.status) && (!c.setor || m.setor === c.setor));
}

// criar (todos) ou editar (admin) um inventário
function modalConf(c = null) {
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

async function excluirConf(c) {
  const r = resumoConf(c, state.conf?.id === c.id ? state.confItens : c.conferencia_itens);
  const txt = prompt(`Excluir o inventário "${c.nome}" (${cdCod(c.cd_id)}) com ${r.encontradas + r.desconhecidas + r.fora} leitura(s)?\nIsso não pode ser desfeito. Digite EXCLUIR para confirmar.`);
  if (txt === null) return false;
  if (txt.trim().toUpperCase() !== 'EXCLUIR') { toast('Exclusão cancelada', true); return false; }
  const { error } = await sb.from('conferencias').delete().eq('id', c.id);
  if (error) { toast(erroMsg(error), true); return false; }
  toast('Inventário excluído');
  return true;
}

async function abrirConferencia(id) {
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

function calcularConf(c, itens) {
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
const confCalculo = () => calcularConf(state.conf, state.confItens);

function renderConfDetalhe(montar) {
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
    <button class="btn" id="conf-csv">Exportar CSV</button>
    ${ehAdmin() ? '<button class="btn" id="conf-editar">Editar</button><button class="btn btn--danger" id="conf-excluir">Excluir</button>' : ''}
    ${aberta ? '<button class="btn btn--primary" id="conf-fim">Finalizar inventário</button>'
             : `${ehAdmin() ? '<button class="btn" id="conf-reabrir">Reabrir</button>' : ''}${k.faltando.length ? `<button class="btn btn--danger" id="conf-extraviar">Marcar ${k.faltando.length} faltantes como extraviadas</button>` : ''}`}`;
  $('#conf-csv').onclick = exportarConf;
  $('#conf-relatorio').onclick = () => relatorioInventario(c.id);
  $('#conf-editar')?.addEventListener('click', () => modalConf(c));
  $('#conf-excluir')?.addEventListener('click', async () => { if (await excluirConf(c)) location.hash = '#conferencia'; });
  $('#conf-fim')?.addEventListener('click', async () => {
    if (state.pendentes) return toast('Ainda há leituras salvas no aparelho aguardando envio. Aguarde a internet voltar para finalizar.', true);
    if (k.faltando.length && !confirm(`Ainda faltam ${k.faltando.length} máquinas. Finalizar mesmo assim?${ehAdmin() ? '' : ' Depois de finalizado, só um administrador pode reabrir.'}`)) return;
    // congela o resultado para os relatórios
    const { error } = await sb.from('conferencias').update({
      status: 'finalizada', finalizado_em: new Date().toISOString(), finalizado_por: state.user?.email,
      total_esperadas: k.esperadasN, total_encontradas: k.achadasEsperadas, total_faltando: k.faltando.length,
      total_desconhecidas: k.desconhecidos.length, total_fora: k.foraDoEsperado.length,
      faltantes: k.faltando.map((m) => ({ id: m.id, hostname: m.hostname, ativo: m.ativo, modelo: m.modelo, tipo: m.tipo, setor: m.setor, localizacao: m.localizacao, ultimo_online: m.ultimo_online })),
    }).eq('id', c.id);
    if (error) return toast(erroMsg(error), true);
    toast('Inventário finalizado');
    abrirConferencia(c.id);
  });
  $('#conf-reabrir')?.addEventListener('click', async () => {
    const { error } = await sb.from('conferencias').update({ status: 'aberta', finalizado_em: null, faltantes: null }).eq('id', c.id);
    if (error) return toast(erroMsg(error), true);
    abrirConferencia(c.id);
  });
  $('#conf-extraviar')?.addEventListener('click', async () => {
    if (!confirm(`Alterar o status de ${k.faltando.length} máquinas para "Extraviado"? Isso fica registrado no histórico de cada uma.`)) return;
    const ids = k.faltando.filter((m) => !m.removida).map((m) => m.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from('maquinas').update({ status: 'extraviado' }).in('id', ids.slice(i, i + 200));
      if (error) return toast(erroMsg(error), true);
    }
    await carregarMaquinas(); toast('Status atualizado'); renderConfDetalhe(false);
  });

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
    html = k.faltando.length ? `<table><thead><tr><th></th><th>Hostname</th><th>Patrimônio</th><th>Tipo</th><th>Modelo</th><th>Setor / local</th><th>Último contato</th><th>Usuário</th></tr></thead><tbody>
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

function cadastrarDesconhecido(codigo, itemId) {
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

function mostrarResultado(cls, titulo, detalhe = '', acao = '') {
  const r = $('#scan-result');
  if (!r) return;
  r.className = `scan-result ${cls} pop`;
  r.innerHTML = `<strong>${titulo}</strong><span>${detalhe}</span>${acao}`;
  beep(cls);
}

async function processarLeitura(bruto) {
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

async function abrirCamera() {
  const v = await lerCamera();
  if (v) processarLeitura(v);
  $('#scan-input')?.focus();
}

// Lê um código com a câmera. Usa o leitor nativo (Android/Chrome) ou jsQR como alternativa (iPhone, só QR code).
function carregarScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('falha ao carregar ' + src));
    document.head.append(s);
  });
}
function lerCamera() {
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

function exportarConf() {
  const k = confCalculo();
  const cab = ['Situação', 'Hostname', 'Patrimônio', 'Nº série', 'Tipo', 'Modelo', 'Setor', 'Localização', 'Código lido', 'Local da leitura', 'Lido em', 'Lido por'];
  const lin = [
    ...k.encontradas.map(({ item, m }) => [k.foraDoEsperado.some((x) => x.m.id === m.id) ? 'Encontrada (fora do esperado)' : 'Encontrada', m.hostname, m.ativo, m.numero_serie, TIPO[m.tipo], m.modelo, m.setor, m.localizacao, item.codigo_lido, item.localizacao, dataHora(item.lido_em), item.lido_por]),
    ...k.faltando.map((m) => ['Faltando', m.hostname, m.ativo, m.numero_serie, TIPO[m.tipo], m.modelo, m.setor, m.localizacao, '', '', '', '']),
    ...k.desconhecidos.map((i) => ['Não cadastrada', '', '', '', '', '', '', '', i.codigo_lido, i.localizacao, dataHora(i.lido_em), i.lido_por]),
  ];
  baixar(`conferencia-${state.conf.nome.replace(/\W+/g, '-')}.csv`, [cab, ...lin].map((l) => l.map(csvCel).join(';')).join('\r\n'));
}

/* =====================================================================
   OFFLINE — fila de leituras e sincronização
   ===================================================================== */
function definirOffline(v) {
  state.offline = v;
  atualizarBanner();
}
async function atualizarPendentes() {
  state.pendentes = (await filaListar()).length;
  atualizarBanner();
}
function atualizarBanner() {
  const b = $('#net-banner');
  if (!b) return;
  const off = state.offline || !navigator.onLine;
  if (!off && !state.pendentes) { b.hidden = true; return; }
  b.hidden = false;
  b.className = 'net-banner ' + (off ? 'off' : 'sync');
  b.innerHTML = off
    ? `<span><strong>📴 Sem internet.</strong> A conferência continua funcionando: as leituras ficam salvas no aparelho${state.pendentes ? ` (<b>${state.pendentes}</b> aguardando envio)` : ''}.${state.cacheEm ? ` Lista de máquinas de ${dataHora(state.cacheEm)}.` : ''}</span>`
    : `<span><strong>Internet de volta.</strong> ${state.pendentes} leitura(s) aguardando envio.</span><button class="btn btn--sm" id="btn-sync">Enviar agora</button>`;
  $('#btn-sync')?.addEventListener('click', sincronizar);
}
let sincronizando = false;
async function sincronizar() {
  if (sincronizando || !navigator.onLine) return;
  const fila = await filaListar();
  if (!fila.length) { if (state.offline) tentarReconectar(); return; }
  sincronizando = true;
  let enviados = 0;
  try {
    for (const it of fila) {
      const { id, pendente, ...dados } = it;
      const { data: srv, error } = await sb.from('conferencia_itens').insert(dados).select().single();
      if (error && error.code !== '23505') {
        if (!ehErroDeRede(error)) toast('Não foi possível enviar leituras pendentes: ' + erroMsg(error), true);
        break;
      }
      await filaRemover(id); // enviado (ou já lido por outra pessoa)
      enviados++;
      if (state.conf?.id === it.conferencia_id) {
        state.confItens = state.confItens.filter((x) => x.id !== id);
        if (srv && !state.confItens.some((x) => x.id === srv.id)) state.confItens.push(srv);
      }
    }
  } finally { sincronizando = false; }
  await atualizarPendentes();
  if (enviados) { toast(`${enviados} leitura(s) offline enviada(s)`); tentarReconectar(); rerender(); }
}
async function tentarReconectar() {
  try {
    await carregarMaquinas();
    if (!state.offline) { await carregarHist(); rerender(); }
  } catch { /* continua offline */ }
}
window.addEventListener('online', () => { sincronizar(); tentarReconectar(); });
window.addEventListener('offline', () => definirOffline(true));

function atualizarBadge() {
  const n = MQ().filter((m) => (m.alertas || []).includes('emprestimo_atrasado')).length;
  const b = $('#badge-emp');
  if (!b) return;
  b.hidden = !n; b.textContent = n;
}

/* =====================================================================
   EMPRÉSTIMOS
   ===================================================================== */
const EMP_COLS = 'id, maquina_id, colaborador, matricula, setor, contato, retirado_em, previsto_devolucao, devolvido_em, status_anterior, status_retorno, condicao_devolucao, obs_retirada, obs_devolucao, entregue_por, recebido_por';
const COND = { ok: 'Sem problemas', avaria: 'Com avaria', faltando_item: 'Faltando item' };
const atrasado = (e) => !e.devolvido_em && e.previsto_devolucao && new Date(e.previsto_devolucao) < new Date();
function duracao(ms) {
  ms = Math.abs(ms);
  const min = Math.round(ms / 6e4);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}
function prazo(e) {
  if (!e.previsto_devolucao) return '<span class="muted">sem data</span>';
  const diff = new Date(e.previsto_devolucao) - Date.now();
  if (diff < 0) return `${pill('atrasado há ' + duracao(diff), 'bad')}<span class="sub">${dataHora(e.previsto_devolucao)}</span>`;
  return `em ${duracao(diff)}<span class="sub">${dataHora(e.previsto_devolucao)}</span>`;
}
const paraInputLocal = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function carregarEmprestimos() {
  const { data: d, error } = await sb.from('emprestimos')
    .select(EMP_COLS + ', maquinas(hostname, ativo, modelo, tipo)').order('retirado_em', { ascending: false }).limit(500);
  if (error) { if (!ehErroDeRede(error)) toast(erroMsg(error), true); return; }
  state.emprestimos = d || [];
}

function renderEmprestimos() {
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
      <div><h1>Empréstimos de notebooks</h1><p>Quem está com cada equipamento, até quando, com termo assinado na tela.</p></div>
      <div class="actions"><button class="btn btn--primary" id="btn-novo-emp">+ Novo empréstimo</button></div>
    </div>
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

function cardMaquinaEmp(m) {
  if (!m) return '';
  const indisponivel = m.emprestimo_atual ? `Já emprestado para ${esc(m.emprestimo_atual.colaborador)}` : ['descartado', 'extraviado'].includes(m.status) ? `Status: ${STATUS[m.status]}` : '';
  return `<div class="emp-maq ${indisponivel ? 'emp-maq--bad' : ''}">
    <div class="emp-maq-top"><strong class="mono">${esc(m.hostname)}</strong>${statusPill(m.status)}</div>
    <span>${esc([m.ativo && 'Patrimônio ' + m.ativo, TIPO[m.tipo], m.modelo].filter(Boolean).join(' · '))}</span>
    ${indisponivel ? `<span class="erro">${indisponivel}</span>` : ''}</div>`;
}

function modalEmprestimo(pre = null) {
  let maq = pre;
  const disponiveis = MQ().filter((m) => !m.emprestimo_atual && !['descartado', 'extraviado'].includes(m.status))
    .sort((a, b) => (a.tipo === 'notebook' ? 0 : 1) - (b.tipo === 'notebook' ? 0 : 1) || (a.ativo || a.hostname).localeCompare(b.ativo || b.hostname));
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
      if (ass.vazia() && !confirm('Registrar sem a assinatura do colaborador?')) return;
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

async function modalDevolucao(empId) {
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

async function imprimirTermo(id, janela) {
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
  </style></head><body>
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
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
  </body></html>`);
  w.document.close();
}

/* =====================================================================
   ETIQUETAS (QR code + código de barras)
   ===================================================================== */
function irEtiquetas(ids) {
  state.etqIds = ids && ids.length ? ids : null;
  if (location.hash === '#etiquetas') renderEtiquetas(); else location.hash = '#etiquetas';
}
function baseIndex() {
  return URL_PUBLICA ? URL_PUBLICA.replace(/\/?$/, '/') : new URL('.', location.href).href;
}
function renderEtiquetas() {
  const el = $('#view-etiquetas');
  const ids = state.etqIds;
  const lista = (ids ? ids.map((id) => state.maquinas.find((m) => m.id === id)).filter(Boolean) : ativas())
    .sort((a, b) => (a.ativo || a.hostname).localeCompare(b.ativo || b.hostname, 'pt-BR', { numeric: true }));
  let cfg = { modelo: 'a4_24', barras: true, setor: false, titulo: 'PATRIMÔNIO TI', pular: 0 };
  try { cfg = { ...cfg, ...JSON.parse(store.get('etq-cfg') || '{}') }; } catch { /* padrão */ }
  if (!MODELOS[cfg.modelo]) cfg.modelo = 'a4_24';
  const semPat = lista.filter((m) => !m.ativo).length;

  el.innerHTML = `
    <div class="view-head no-print">
      <div><h1>Etiquetas</h1><p>${lista.length} etiqueta(s)${ids ? ' selecionada(s)' : ' (todas as máquinas ativas)'}. O QR code abre a ficha da máquina pela câmera do celular e é lido na conferência; o código de barras serve para leitores comuns.</p></div>
      <div class="actions"><a class="btn" href="#maquinas">← Máquinas</a><button class="btn btn--primary" id="etq-imprimir" ${lista.length ? '' : 'disabled'}>Imprimir</button></div>
    </div>
    <div class="card etq-toolbar no-print">
      <label>Modelo de etiqueta<select id="etq-modelo">${opts(Object.entries(MODELOS).map(([k, v]) => [k, v.nome]), cfg.modelo)}</select></label>
      <label>Texto do topo<input id="etq-titulo" value="${esc(cfg.titulo)}" maxlength="26"></label>
      <label id="etq-pular-wrap">Começar na posição<input id="etq-pular" type="number" min="1" value="${cfg.pular + 1}"></label>
      <div class="checks">
        <label class="check"><input type="checkbox" id="etq-barras" ${cfg.barras ? 'checked' : ''}> Código de barras</label>
        <label class="check"><input type="checkbox" id="etq-setor" ${cfg.setor ? 'checked' : ''}> Mostrar setor</label>
      </div>
    </div>
    ${semPat ? `<p class="aviso-linha no-print">${semPat} máquina(s) sem patrimônio: a etiqueta usa o hostname no QR code e no código de barras.</p>` : ''}
    <p class="muted no-print" id="etq-info"></p>
    <div id="etq-area" class="etq-area"></div>
    <style id="etq-style"></style>`;

  const desenhar = () => {
    cfg = {
      modelo: $('#etq-modelo').value,
      titulo: $('#etq-titulo').value.trim(),
      pular: Math.max(0, (Number($('#etq-pular').value) || 1) - 1),
      barras: $('#etq-barras').checked,
      setor: $('#etq-setor').checked,
    };
    store.set('etq-cfg', JSON.stringify(cfg));
    const md = MODELOS[cfg.modelo];
    $('#etq-pular-wrap').hidden = md.colunas * md.linhas === 1;
    if (!window.qrcode) { setTimeout(desenhar, 300); return; }
    const r = montarFolhas(lista, cfg.modelo, baseIndex(), { ...cfg, pular: md.colunas * md.linhas === 1 ? 0 : cfg.pular });
    $('#etq-style').textContent = r.css;
    $('#etq-area').innerHTML = r.html;
    $('#etq-info').textContent = `${r.total} etiqueta(s) em ${r.paginas} ${md.pagina === 'A4' ? 'folha(s) A4' : 'etiqueta(s) do rolo'}. Na impressão, use escala 100% (“Tamanho real”) e sem margens.`;
  };
  ['etq-modelo', 'etq-titulo', 'etq-pular', 'etq-barras', 'etq-setor'].forEach((id) => ($('#' + id).oninput = desenhar));
  $('#etq-imprimir').onclick = () => window.print();
  desenhar();
}

/* =====================================================================
   IMPORTAR COMPRAS / GARANTIAS (CSV)
   ===================================================================== */
function lerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim()));
}
const normCab = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const CAB_IMPORT = {
  codigo: ['patrimonio', 'ativo', 'hostname', 'serie', 'numero_serie', 'n_serie', 'n_de_serie', 'codigo'],
  data_compra: ['data_compra', 'data_da_compra', 'compra', 'data_aquisicao', 'aquisicao'],
  fornecedor: ['fornecedor', 'vendedor', 'loja'],
  nota_fiscal: ['nota_fiscal', 'nf', 'nota', 'nfe', 'nf_e'],
  valor_compra: ['valor', 'valor_compra', 'preco', 'valor_r', 'custo'],
  garantia_fim: ['garantia_fim', 'fim_garantia', 'fim_da_garantia', 'garantia', 'garantia_ate', 'vencimento_garantia'],
};
function lerDataBR(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function lerValor(v) {
  v = String(v || '').replace(/[R$\s]/g, '');
  if (!v) return null;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function modalImportarCompras() {
  let plano = [];
  modal(`
    <div class="modal-head"><h2>Importar compras e garantias</h2>
      <p class="muted" style="margin:4px 0 0">Planilha em CSV (no Excel: <i>Salvar como → CSV</i>). Colunas reconhecidas: <code>patrimonio</code> (ou hostname / serie), <code>data_compra</code>, <code>fornecedor</code>, <code>nota_fiscal</code>, <code>valor</code>, <code>garantia_fim</code>. Datas em dd/mm/aaaa.</p></div>
    <div class="modal-body">
      <div class="actions"><input type="file" id="imp-arq" accept=".csv,text/csv,text/plain"><button type="button" class="btn btn--sm btn--ghost" id="imp-modelo">Baixar planilha modelo</button></div>
      <label>…ou cole o conteúdo aqui<textarea id="imp-txt" rows="5" class="mono" style="font-size:12px" placeholder="patrimonio;data_compra;fornecedor;nota_fiscal;valor;garantia_fim"></textarea></label>
      <div id="imp-prev"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="imp-ok" disabled>Aplicar</button></div>`, (dlg) => {
    const analisar = () => {
      const linhas = lerCSV($('#imp-txt').value);
      plano = [];
      if (linhas.length < 2) { $('#imp-prev').innerHTML = ''; $('#imp-ok').disabled = true; return; }
      const cab = linhas[0].map(normCab);
      const idx = Object.fromEntries(Object.entries(CAB_IMPORT).map(([k, nomes]) => [k, cab.findIndex((c) => nomes.includes(c))]));
      if (idx.codigo < 0) { $('#imp-prev').innerHTML = '<p class="erro">Não encontrei a coluna de identificação (patrimonio, hostname ou serie).</p>'; $('#imp-ok').disabled = true; return; }
      const nao = []; let invalidas = 0;
      for (const l of linhas.slice(1)) {
        const cod = (l[idx.codigo] || '').trim();
        if (!cod) continue;
        const m = acharMaquina(cod);
        if (!m) { nao.push(cod); continue; }
        const dados = {};
        const pegar = (k) => (idx[k] >= 0 ? (l[idx[k]] || '').trim() : '');
        if (pegar('data_compra')) { const d = lerDataBR(pegar('data_compra')); if (d) dados.data_compra = d; else invalidas++; }
        if (pegar('garantia_fim')) { const d = lerDataBR(pegar('garantia_fim')); if (d) dados.garantia_fim = d; else invalidas++; }
        if (pegar('fornecedor')) dados.fornecedor = pegar('fornecedor');
        if (pegar('nota_fiscal')) dados.nota_fiscal = pegar('nota_fiscal');
        if (pegar('valor_compra')) { const v = lerValor(pegar('valor_compra')); if (v != null) dados.valor_compra = v; else invalidas++; }
        if (Object.keys(dados).length) plano.push({ m, dados });
      }
      $('#imp-prev').innerHTML = `
        <div class="banner ${plano.length ? 'banner--info' : 'banner--bad'}"><div><strong>${plano.length} máquina(s) serão atualizadas</strong>
          <span>${nao.length ? `${nao.length} código(s) não encontrados: ${esc(nao.slice(0, 12).join(', '))}${nao.length > 12 ? '…' : ''}.` : 'Todos os códigos foram encontrados.'}${invalidas ? ` ${invalidas} valor(es) de data/valor inválidos foram ignorados.` : ''}</span></div></div>
        ${plano.length ? `<table class="mini-table"><thead><tr><th>Máquina</th><th>Compra</th><th>Garantia</th><th>Fornecedor</th><th>NF</th><th>Valor</th></tr></thead><tbody>
          ${plano.slice(0, 8).map(({ m, dados: d }) => `<tr><td class="mono">${esc(m.hostname)}</td><td>${dataBR(d.data_compra)}</td><td>${dataBR(d.garantia_fim)}</td><td>${esc(d.fornecedor || '—')}</td><td>${esc(d.nota_fiscal || '—')}</td><td>${moeda(d.valor_compra)}</td></tr>`).join('')}
          ${plano.length > 8 ? `<tr><td colspan="6" class="muted">… e mais ${plano.length - 8}</td></tr>` : ''}</tbody></table>` : ''}`;
      $('#imp-ok').disabled = !plano.length;
    };
    $('#imp-txt').oninput = debounce(analisar, 200);
    $('#imp-arq').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const buf = await f.arrayBuffer();
      let txt = new TextDecoder('utf-8').decode(buf);
      if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf); // CSV salvo pelo Excel em ANSI
      $('#imp-txt').value = txt; analisar();
    };
    $('#imp-modelo').onclick = () => baixar('modelo-compras.csv', 'patrimonio;data_compra;fornecedor;nota_fiscal;valor;garantia_fim\r\nPAT000123;15/03/2023;Dell Computadores;000123456;4.899,00;15/03/2026\r\n');
    $('#imp-ok').onclick = async () => {
      const btn = $('#imp-ok'); btn.disabled = true;
      let ok = 0, falhas = 0;
      for (const { m, dados } of plano) {
        btn.textContent = `Aplicando ${ok + falhas + 1}/${plano.length}…`;
        const { error } = await sb.from('maquinas').update(dados).eq('id', m.id);
        error ? falhas++ : ok++;
      }
      dlg.close();
      await carregarMaquinas(); rerender(); if (state.view === 'maquinas') renderTabela();
      toast(`${ok} máquina(s) atualizada(s)${falhas ? `, ${falhas} com erro` : ''}`, !!falhas);
    };
  });
}

/* =====================================================================
   App instalável (PWA) — guarda os arquivos para abrir sem internet
   ===================================================================== */
function registrarSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(async () => {
    const reg = await navigator.serviceWorker.ready;
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
      .filter((u) => /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(u));
    reg.active?.postMessage({ tipo: 'cachear', urls });
  }).catch(() => { /* sem service worker: segue online */ });
}

/* =====================================================================
   LINK DE INSTALAÇÃO (para enviar ao colaborador)
   ===================================================================== */
const tokensLink = new Map(); // um token de link por CD
async function obterTokenLink(cd, novo = false) {
  const chave = cd || 'meu';
  if (tokensLink.has(chave) && !novo) return tokensLink.get(chave);
  const { data: t, error } = await sb.rpc('obter_token_link', { p_cd: cd || null, p_novo: novo });
  if (error) throw error;
  tokensLink.set(chave, t);
  return t;
}
function baseInstalar() {
  const base = URL_PUBLICA ? URL_PUBLICA.replace(/\/?$/, '/') : new URL('.', location.href).href;
  return base + 'instalar.html';
}

async function modalLinkInstalacao(pre = {}) {
  let cd = ehAdmin() ? (pre.cd_id || state.cdAtual || cdsAtivos()[0]?.id) : state.perfil?.cd_id;
  let token;
  try { token = await obterTokenLink(cd); } catch (e) {
    return toast('Não foi possível obter o token de links. Rode os arquivos sql/02 e sql/04 no Supabase. (' + erroMsg(e) + ')', true);
  }
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
  modal(`
    <div class="modal-head"><h2>Link de instalação</h2>
      <p class="muted" style="margin:4px 0 0">Envie para o colaborador abrir <b>no computador</b>. Ele clica em Baixar, abre o arquivo e pronto: a máquina é reconhecida sozinha.</p></div>
    <div class="modal-body">
      <div class="form-grid" id="lk-form">
        ${ehAdmin() ? `<label class="full">CD onde a máquina será cadastrada<select id="lk-cd">${opts(cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`]), cd)}</select></label>` : `<label class="full">CD<input value="${esc(cdCod(cd) + ' · ' + cdNome(cd))}" disabled></label>`}
        ${campo('pat', 'Patrimônio (opcional)', pre.ativo, 'text', 'class="mono" placeholder="Etiqueta da máquina"')}
        ${campo('setor', 'Setor', pre.setor, 'text', 'list="dl-lk-set"')}
        ${campo('loc', 'Localização', pre.localizacao)}
        ${campo('resp', 'Responsável', pre.responsavel)}
      </div>
      <datalist id="dl-lk-set">${setores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <p class="muted" style="margin:0;font-size:12.5px">Setor, localização e responsável só são gravados se a máquina ainda não tiver esses dados. Deixe tudo vazio para um link genérico que serve para qualquer computador.</p>
      <label>Link<input id="lk-url" readonly class="mono" style="font-size:12px"></label>
      ${local ? `<p class="tag" style="white-space:normal;padding:8px 10px;font-size:12.5px;font-weight:500">O painel está aberto em <b>${esc(location.host || 'arquivo local')}</b>, então este link só funciona neste computador. Publique a pasta <code>web</code> (ex.: GitHub Pages) e preencha <code>URL_PUBLICA</code> em <code>js/config.js</code>.</p>` : ''}
      <div class="actions">
        <button class="btn btn--primary" id="lk-copiar">Copiar link</button>
        <button class="btn" id="lk-msg">Copiar mensagem</button>
        <a class="btn" id="lk-wa" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn" id="lk-mail">E-mail</a>
        <a class="btn btn--ghost" id="lk-abrir" target="_blank" rel="noopener">Abrir página ↗</a>
      </div>
    </div>
    <div class="modal-foot" style="justify-content:space-between">
      ${ehAdmin() ? '<button class="btn btn--ghost btn--sm" id="lk-rotacionar" title="Links enviados antes deixam de funcionar">Invalidar links antigos deste CD</button>' : '<span></span>'}
      <button class="btn" data-close>Fechar</button>
    </div>`, () => {
    const atualizar = () => {
      const q = new URLSearchParams({ k: token });
      for (const n of ['pat', 'setor', 'loc', 'resp']) {
        const v = $(`#lk-form [name=${n}]`).value.trim();
        if (v) q.set(n, v);
      }
      const url = `${baseInstalar()}#${q.toString()}`;
      const texto = `Olá! A TI está atualizando o inventário de computadores. Abra este link NO SEU COMPUTADOR, clique em "Baixar instalador" e depois abra o arquivo baixado. Leva menos de 1 minuto:\n${url}`;
      $('#lk-url').value = url;
      $('#lk-abrir').href = url;
      $('#lk-wa').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
      $('#lk-mail').href = 'mailto:?subject=' + encodeURIComponent('Registro do computador no inventário de TI') + '&body=' + encodeURIComponent(texto);
      $('#lk-msg').onclick = () => navigator.clipboard.writeText(texto).then(() => toast('Mensagem copiada'));
    };
    $('#lk-form').oninput = (e) => { if (e.target.id !== 'lk-cd') atualizar(); };
    $('#lk-cd')?.addEventListener('change', async (e) => {
      cd = e.target.value;
      try { token = await obterTokenLink(cd); atualizar(); } catch (er) { toast(erroMsg(er), true); }
    });
    $('#lk-copiar').onclick = () => navigator.clipboard.writeText($('#lk-url').value).then(() => toast('Link copiado'));
    $('#lk-url').onclick = (e) => e.target.select();
    $('#lk-rotacionar')?.addEventListener('click', async () => {
      if (!confirm(`Gerar um novo token de links para ${cdCod(cd)}? Todos os links já enviados deste CD param de funcionar (as máquinas instaladas com eles também deixam de reportar até serem reinstaladas).`)) return;
      try { token = await obterTokenLink(cd, true); atualizar(); toast('Novo token gerado'); } catch (e) { toast(erroMsg(e), true); }
    });
    atualizar();
  });
}

/* =====================================================================
   AGENTE
   ===================================================================== */
async function renderAgente() {
  const el = $('#view-agente');
  const { data: tokens } = ehAdmin() ? await sb.from('agente_tokens').select('id, descricao, ativo, criado_em, ultimo_uso, cd_id').order('criado_em') : { data: [] };
  state.tokens = tokens || [];
  const versoes = contar(MQ().filter((m) => m.origem === 'agente'), (m) => m.agente_versao || '?');
  const comAgente = MQ().filter((m) => m.origem === 'agente').length;

  el.innerHTML = `
    <div class="view-head"><div><h1>Agente coletor</h1>
      <p>Script PowerShell que roda em cada máquina e envia RAM, discos, SO, versão, série, usuário e IP. Executa ao ligar, no logon e a cada 1 hora — é isso que mantém o "último contato" sempre correto.</p></div></div>
    <div class="card card-pad" style="margin-bottom:16px;display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)">
      <div style="flex:1 1 320px"><h2>Mais fácil: envie um link para o colaborador</h2>
        <p class="muted" style="margin:4px 0 0">Ele abre no computador, clica em <b>Baixar</b> e abre o arquivo. O instalador já vem configurado (patrimônio e setor opcionais), funciona sem ser administrador e a página mostra a máquina reconhecida ao vivo.</p></div>
      <button class="btn btn--primary" id="btn-link-agente">Gerar link de instalação</button>
    </div>
    <div class="grid-2">
      <div class="card card-pad">
        <div class="card-head"><h2>Instalação</h2></div>
        <ol class="steps">
          <li><div><strong>Copie a pasta <code>agente</code></strong><p>Para um pendrive ou uma pasta compartilhada da rede. Ela já contém o <code>config.json</code> com a URL e o token.</p></div></li>
          <li><div><strong>Execute <code>INSTALAR.bat</code> como administrador</strong><p>Informe o nº de patrimônio quando pedir (opcional — pode preencher depois no painel).</p></div></li>
          <li><div><strong>Pronto</strong><p>A máquina aparece aqui em segundos. O agente fica em <code>C:\\ProgramData\\InventarioQuallit</code> e roda como SYSTEM pela tarefa agendada <code>InventarioQuallit</code>.</p></div></li>
        </ol>
        <h3 style="margin:20px 0 8px">Instalar em massa (GPO / SCCM / Intune / PDQ)</h3>
        <pre class="code">powershell.exe -NoProfile -ExecutionPolicy Bypass -File "\\\\SERVIDOR\\Compartilhamento\\agente\\instalar-agente.ps1"</pre>
        <h3 style="margin:20px 0 8px">Só ver o que seria enviado (teste)</h3>
        <pre class="code">powershell -ExecutionPolicy Bypass -File coletor.ps1 -SoMostrar</pre>
        <p class="muted">Rede com proxy? Preencha <code>"proxy": "http://proxy:porta"</code> no <code>config.json</code>.</p>
      </div>
      <div class="stack">
        <div class="card card-pad">
          <div class="card-head"><h2>Cobertura</h2></div>
          <div class="kpis" style="margin:0">
            <div class="card kpi" style="cursor:default"><div class="kpi-label">Com agente</div><div class="kpi-value">${comAgente}</div><div class="kpi-sub">de ${MQ().length} máquinas</div></div>
            <div class="card kpi" style="cursor:default"><div class="kpi-label">Sem agente</div><div class="kpi-value">${MQ().length - comAgente}</div><div class="kpi-sub">cadastro manual</div></div>
          </div>
          ${versoes.length ? `<h3 style="margin:16px 0 8px">Versões do agente</h3>${barras(versoes, 'x')}` : ''}
        </div>
        ${ehAdmin() ? `<div class="card card-pad">
          <div class="card-head"><h2>Tokens do agente</h2><button class="btn btn--sm" id="btn-token">+ Gerar token</button></div>
          <p class="muted" style="margin-top:0">O agente só consegue gravar com um token ativo. Se um token vazar, revogue e gere outro (atualize o <code>config.json</code>).</p>
          <table class="mini-table"><thead><tr><th>Descrição</th><th>CD</th><th>Criado</th><th>Último uso</th><th></th></tr></thead><tbody>
            ${state.tokens.filter(noCD).map((t) => `<tr><td>${esc(t.descricao)} ${t.ativo ? '' : pill('revogado', 'bad')}</td><td>${esc(cdCod(t.cd_id))}</td><td>${data(t.criado_em)}</td><td>${rel(t.ultimo_uso)}</td>
              <td><button class="btn btn--sm ${t.ativo ? 'btn--danger' : ''}" data-tok="${t.id}" data-ativo="${t.ativo}">${t.ativo ? 'Revogar' : 'Reativar'}</button></td></tr>`).join('')}
          </tbody></table>
        </div>` : ''}
      </div>
    </div>`;
  $$('.bar', el).forEach((b) => (b.style.cursor = 'default'));
  $('#btn-link-agente').onclick = () => modalLinkInstalacao();
  $$('[data-tok]', el).forEach((b) => (b.onclick = async () => {
    const ativo = b.dataset.ativo === 'true';
    if (ativo && !confirm('Revogar este token? Agentes usando ele param de reportar.')) return;
    const { error } = await sb.from('agente_tokens').update({ ativo: !ativo }).eq('id', b.dataset.tok);
    if (error) return toast(erroMsg(error), true);
    renderAgente();
  }));
  $('#btn-token')?.addEventListener('click', async () => {
    const desc = prompt('Descrição do token (ex.: "Implantação GPO 2026")');
    if (desc === null) return;
    const { data: tok, error } = await sb.rpc('gerar_token_agente', { p_descricao: desc, p_cd: state.cdAtual || cdsAtivos()[0]?.id || null });
    if (error) return toast(erroMsg(error), true);
    modal(`<div class="modal-head"><h2>Novo token gerado</h2></div>
      <div class="modal-body"><p style="margin:0">Copie agora — ele <strong>não será exibido novamente</strong>. Cole no campo <code>agente_token</code> do <code>config.json</code>.</p>
      <div class="token-box" id="tok">${esc(tok)}</div></div>
      <div class="modal-foot"><button class="btn" id="tok-copiar">Copiar</button><button class="btn btn--primary" data-close>Fechei, já copiei</button></div>`,
    () => { $('#tok-copiar').onclick = () => navigator.clipboard.writeText(tok).then(() => toast('Copiado')); });
    renderAgente();
  });
}

/* =====================================================================
   USUÁRIOS E CDs (somente administrador)
   ===================================================================== */
async function chamarAdmin(body) {
  const { data: d, error } = await sb.functions.invoke('admin-usuarios', { body });
  if (error) {
    let msg = error.message;
    const status = error.context?.status;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* sem corpo */ }
    const e = new Error(msg);
    if (status === 404 || /Failed to send|FunctionsFetchError|FunctionsRelayError/i.test(`${error.name} ${error.message}`)) e.semFuncao = true;
    throw e;
  }
  if (d?.error) throw new Error(d.error);
  return d;
}
function gerarSenha() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const v = crypto.getRandomValues(new Uint32Array(10));
  let s = [...v].map((n) => abc[n % abc.length]).join('');
  if (!/\d/.test(s)) s = s.slice(0, 9) + '7';
  return s;
}
const PAPEL = { admin: 'Administrador', field: 'Field' };
const urlPainel = () => baseIndex();

async function renderUsuarios(aba = 'usuarios') {
  const el = $('#view-usuarios');
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Usuários e CDs</h1><p>Crie acessos para os Fields de cada CD e para outros administradores. Fields enxergam apenas o próprio CD.</p></div>
      <div class="actions" id="us-acoes"></div>
    </div>
    <div class="tabs tabs--page"><a class="tab ${aba === 'usuarios' ? 'active' : ''}" href="#usuarios/usuarios">Usuários</a><a class="tab ${aba === 'cds' ? 'active' : ''}" href="#usuarios/cds">CDs</a></div>
    <div id="us-corpo"><div class="skeleton">Carregando…</div></div>`;
  if (aba === 'cds') return renderCDsAdmin();
  return renderListaUsuarios();
}

async function renderListaUsuarios(recarregar = true) {
  const corpo = $('#us-corpo');
  $('#us-acoes').innerHTML = '<button class="btn btn--primary" id="btn-novo-us">+ Novo usuário</button>';
  $('#btn-novo-us').onclick = () => modalUsuario();
  if (recarregar || !state.usuarios) {
    try {
      state.usuarios = (await chamarAdmin({ acao: 'listar' })).usuarios;
      state.usuariosSemFuncao = false;
    } catch (e) {
      if (!e.semFuncao) { corpo.innerHTML = `<div class="card card-pad erro">${esc(e.message)}</div>`; return; }
      state.usuariosSemFuncao = true;
      const { data: perfis } = await sb.from('perfis').select('*').order('nome');
      state.usuarios = (perfis || []).map((p) => ({ id: p.user_id, nome: p.nome, email: p.email, papel: p.papel, cd_id: p.cd_id, ativo: p.ativo }));
    }
  }
  const f = state.usFiltro || (state.usFiltro = { q: '', papel: '', cd: '', status: '' });
  if (state.cdAtual && !f.cdTocado) f.cd = state.cdAtual;
  corpo.innerHTML = `
    ${state.usuariosSemFuncao ? `<div class="banner banner--bad" style="margin-bottom:14px"><div><strong>Falta publicar a função de usuários no Supabase</strong>
      <span>Sem ela, a lista abaixo é só leitura. No Supabase: <b>Edge Functions → Deploy a new function → Via Editor</b>, nome <code>admin-usuarios</code>, cole o arquivo <code>supabase/functions/admin-usuarios/index.ts</code> e clique em <b>Deploy</b>.</span></div></div>` : ''}
    <div class="card">
      <div class="toolbar">
        <div class="search"><input id="us-q" type="search" placeholder="Buscar nome ou e-mail…" value="${esc(f.q)}"></div>
        <select id="us-papel">${opts([['', 'Todos os perfis'], ['admin', 'Administradores'], ['field', 'Fields']], f.papel)}</select>
        <select id="us-cd">${opts([['', 'Todos os CDs'], ...state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}`])], f.cd)}</select>
        <select id="us-status">${opts([['', 'Ativos e inativos'], ['ativo', 'Ativos'], ['inativo', 'Desativados']], f.status)}</select>
        <span class="count" id="us-count"></span>
      </div>
      <div class="table-wrap" style="max-height:none"><table><thead><tr><th>Nome</th><th>Perfil</th><th>CD</th><th>Status</th><th>Último acesso</th><th></th></tr></thead><tbody id="us-tbody"></tbody></table></div>
    </div>`;
  const desenhar = () => {
    const termos = up(f.q).split(/\s+/).filter(Boolean);
    const lista = state.usuarios
      .filter((u) => !f.papel || u.papel === f.papel)
      .filter((u) => !f.cd || u.cd_id === f.cd)
      .filter((u) => !f.status || (f.status === 'ativo' ? u.ativo : !u.ativo))
      .filter((u) => termos.every((t) => up(`${u.nome} ${u.email}`).includes(t)))
      .sort((a, b) => (a.papel === b.papel ? 0 : a.papel === 'admin' ? -1 : 1) || String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR'));
    $('#us-count').textContent = `${lista.length} usuário(s)`;
    const ro = state.usuariosSemFuncao;
    $('#us-tbody').innerHTML = lista.length ? lista.map((u) => `<tr data-us="${u.id}">
      <td><strong>${esc(u.nome || '—')}</strong>${u.id === state.user.id ? ' <span class="pill">você</span>' : ''}<span class="sub">${esc(u.email || '')}</span></td>
      <td>${u.sem_perfil ? pill('sem acesso', 'warn') : pill(PAPEL[u.papel] || u.papel, u.papel === 'admin' ? 'brand' : '')}</td>
      <td>${u.papel === 'admin' ? '<span class="muted">Todos</span>' : `<span class="pill pill--cd">${esc(cdCod(u.cd_id))}</span> ${esc(cdNome(u.cd_id))}`}</td>
      <td>${u.ativo ? pill('Ativo', 'ok') : pill('Desativado', 'bad')}</td>
      <td>${u.ultimo_acesso ? `${rel(u.ultimo_acesso)}<span class="sub">${dataHora(u.ultimo_acesso)}</span>` : '<span class="muted">nunca</span>'}</td>
      <td class="acoes">${ro ? '' : `<button class="btn btn--sm" data-ac="editar">${u.sem_perfil ? 'Liberar acesso' : 'Editar'}</button>
        <button class="btn btn--sm btn--ghost" data-ac="senha">Senha</button>
        ${u.id !== state.user.id ? '<button class="btn btn--sm btn--ghost btn--txt-bad" data-ac="excluir">Excluir</button>' : ''}`}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">Nenhum usuário com esses filtros.</td></tr>';
  };
  $('#us-q').oninput = debounce((e) => { f.q = e.target.value; desenhar(); }, 120);
  $('#us-papel').onchange = (e) => { f.papel = e.target.value; desenhar(); };
  $('#us-cd').onchange = (e) => { f.cd = e.target.value; f.cdTocado = true; desenhar(); };
  $('#us-status').onchange = (e) => { f.status = e.target.value; desenhar(); };
  $('#us-tbody').onclick = async (e) => {
    const b = e.target.closest('[data-ac]'); if (!b) return;
    const u = state.usuarios.find((x) => x.id === b.closest('tr').dataset.us);
    if (b.dataset.ac === 'editar') modalUsuario(u);
    if (b.dataset.ac === 'senha') modalSenha(u);
    if (b.dataset.ac === 'excluir') {
      if (!confirm(`Excluir o usuário ${u.nome || u.email}? O login deixa de existir. (Para bloquear temporariamente, use Editar → Desativar.)`)) return;
      try { await chamarAdmin({ acao: 'excluir', id: u.id }); toast('Usuário excluído'); renderListaUsuarios(); } catch (er) { toast(er.message, true); }
    }
  };
  desenhar();
}

function modalUsuario(u = null) {
  const novo = !u;
  let papel = u?.papel || 'field';
  const senha = novo ? gerarSenha() : '';
  modal(`
    <form id="us-form" autocomplete="off">
      <div class="modal-head"><h2>${novo ? 'Novo usuário' : u.sem_perfil ? 'Liberar acesso' : 'Editar usuário'}</h2></div>
      <div class="modal-body">
        <div class="papeis">
          <label class="papel"><input type="radio" name="papel" value="field" ${papel === 'field' ? 'checked' : ''}><span><b>Field</b><small>Trabalha em um CD: máquinas, inventários, empréstimos e etiquetas só daquele CD.</small></span></label>
          <label class="papel"><input type="radio" name="papel" value="admin" ${papel === 'admin' ? 'checked' : ''}><span><b>Administrador</b><small>Todos os CDs, usuários, exclusões e relatórios gerais.</small></span></label>
        </div>
        <div class="form-grid">
          ${campo('nome', 'Nome *', u?.nome || '', 'text', 'required')}
          ${campo('email', 'E-mail (login) *', u?.email || '', 'email', 'required autocomplete="off"')}
          <label class="full" id="us-cd-wrap">CD *<select name="cd_id">${opts([['', 'Selecione o CD'], ...cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`])], u?.cd_id || state.cdAtual || '')}</select></label>
          ${novo ? `<label class="full">Senha inicial *<span class="input-row"><input name="senha" id="us-senha" class="mono" value="${senha}" minlength="8" required><button type="button" class="btn" id="us-gerar">Gerar</button></span><small class="muted">Mínimo 8 caracteres. Você verá a senha para enviar ao usuário.</small></label>`
               : `<label class="check full"><input type="checkbox" name="ativo" ${u.ativo || u.sem_perfil ? 'checked' : ''}> Acesso ativo (desmarque para bloquear o login sem excluir)</label>`}
        </div>
        <p class="erro" id="us-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="us-salvar">${novo ? 'Criar usuário' : 'Salvar'}</button></div>
    </form>`, (dlg) => {
    const sincPapel = () => { papel = $('#us-form [name=papel]:checked').value; $('#us-cd-wrap').hidden = papel === 'admin'; };
    $$('#us-form [name=papel]').forEach((r) => (r.onchange = sincPapel));
    sincPapel();
    $('#us-gerar')?.addEventListener('click', () => { $('#us-senha').value = gerarSenha(); });
    $('#us-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        acao: novo ? 'criar' : 'atualizar',
        id: u?.id,
        nome: String(fd.get('nome')).trim(),
        email: String(fd.get('email')).trim(),
        papel,
        cd_id: papel === 'field' ? fd.get('cd_id') || null : null,
      };
      if (papel === 'field' && !body.cd_id) return ($('#us-erro').textContent = 'Escolha o CD do Field.');
      if (novo) body.senha = String(fd.get('senha'));
      else body.ativo = !!fd.get('ativo');
      $('#us-salvar').disabled = true;
      try {
        await chamarAdmin(body);
        dlg.close();
        if (novo) mostrarCredenciais(body.nome, body.email, body.senha, 'Usuário criado');
        else toast('Usuário atualizado');
        renderListaUsuarios();
      } catch (er) {
        $('#us-erro').textContent = er.message;
        $('#us-salvar').disabled = false;
      }
    };
  });
}

function mostrarCredenciais(nome, email, senha, titulo) {
  const texto = `Olá, ${nome}! Seu acesso ao Inventário Quallit:\n${urlPainel()}\nLogin: ${email}\nSenha: ${senha}`;
  modal(`
    <div class="modal-head"><h2>${esc(titulo)}</h2><p class="muted" style="margin:4px 0 0">Envie estes dados ao usuário. A senha não fica visível depois.</p></div>
    <div class="modal-body"><div class="token-box" style="white-space:pre-line">${esc(texto)}</div></div>
    <div class="modal-foot"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">WhatsApp</a>
      <button class="btn" id="cred-copiar">Copiar</button><button class="btn btn--primary" data-close>Concluir</button></div>`,
  () => { $('#cred-copiar').onclick = () => navigator.clipboard.writeText(texto).then(() => toast('Copiado')); });
}

function modalSenha(u) {
  modal(`
    <form id="pw-form">
      <div class="modal-head"><h2>Alterar senha</h2><p class="muted" style="margin:4px 0 0">${esc(u.nome || '')} · ${esc(u.email)}</p></div>
      <div class="modal-body">
        <label>Nova senha<span class="input-row"><input name="senha" id="pw-senha" class="mono" minlength="8" required value="${gerarSenha()}"><button type="button" class="btn" id="pw-gerar">Gerar</button></span></label>
        <p class="erro" id="pw-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="pw-salvar">Alterar senha</button></div>
    </form>`, (dlg) => {
    $('#pw-gerar').onclick = () => { $('#pw-senha').value = gerarSenha(); };
    $('#pw-form').onsubmit = async (e) => {
      e.preventDefault();
      const senha = $('#pw-senha').value;
      $('#pw-salvar').disabled = true;
      try {
        await chamarAdmin({ acao: 'senha', id: u.id, senha });
        dlg.close();
        mostrarCredenciais(u.nome || u.email, u.email, senha, 'Senha alterada');
      } catch (er) { $('#pw-erro').textContent = er.message; $('#pw-salvar').disabled = false; }
    };
  });
}

async function recarregarCDs() {
  const { data: d } = await sb.from('cds').select('*').order('codigo');
  state.cds = d || [];
  if (state.cdAtual && !state.cds.some((c) => c.id === state.cdAtual)) state.cdAtual = '';
  renderSidebar();
}

async function renderCDsAdmin() {
  $('#us-acoes').innerHTML = '<button class="btn btn--primary" id="btn-novo-cd">+ Novo CD</button>';
  $('#btn-novo-cd').onclick = () => modalCD();
  const { data: perfis } = await sb.from('perfis').select('cd_id, papel, ativo');
  const fields = (id) => (perfis || []).filter((p) => p.cd_id === id && p.papel === 'field' && p.ativo).length;
  const maqs = (id) => state.maquinas.filter((m) => m.cd_id === id && m.status !== 'descartado').length;
  $('#us-corpo').innerHTML = `<div class="card"><div class="table-wrap" style="max-height:none"><table>
    <thead><tr><th>Código</th><th>Nome</th><th>Cidade / UF</th><th class="num">Máquinas</th><th class="num">Fields ativos</th><th>Status</th><th></th></tr></thead>
    <tbody>${state.cds.map((c) => `<tr data-cd="${c.id}">
      <td><span class="pill pill--cd">${esc(c.codigo)}</span></td><td><strong>${esc(c.nome)}</strong></td>
      <td>${esc([c.cidade, c.uf].filter(Boolean).join(' / ') || '—')}</td>
      <td class="num">${maqs(c.id)}</td><td class="num">${fields(c.id)}</td>
      <td>${c.ativo ? pill('Ativo', 'ok') : pill('Inativo', 'bad')}</td>
      <td class="acoes"><button class="btn btn--sm" data-ac="editar">Editar</button> <button class="btn btn--sm btn--ghost" data-ac="relatorio">Relatório</button> <button class="btn btn--sm btn--ghost btn--txt-bad" data-ac="excluir">Excluir</button></td></tr>`).join('')}</tbody>
  </table></div></div>
  <p class="muted" style="font-size:12.5px">Um CD com máquinas ou usuários não pode ser excluído — desative-o em <i>Editar</i>.</p>`;
  $('#us-corpo').onclick = async (e) => {
    const b = e.target.closest('[data-ac]'); if (!b) return;
    const c = state.cds.find((x) => x.id === b.closest('tr').dataset.cd);
    if (b.dataset.ac === 'editar') modalCD(c);
    if (b.dataset.ac === 'relatorio') relatorioCD(c.id);
    if (b.dataset.ac === 'excluir') {
      if (!confirm(`Excluir o CD ${c.codigo} · ${c.nome}?`)) return;
      const { error } = await sb.from('cds').delete().eq('id', c.id);
      if (error) return toast(error.code === '23503' ? 'Este CD tem máquinas, inventários ou usuários. Desative-o em vez de excluir.' : erroMsg(error), true);
      toast('CD excluído'); await recarregarCDs(); renderCDsAdmin();
    }
  };
}

function modalCD(c = null) {
  modal(`
    <form id="cd-form">
      <div class="modal-head"><h2>${c ? 'Editar CD' : 'Novo CD'}</h2></div>
      <div class="modal-body"><div class="form-grid">
        ${campo('codigo', 'Código *', c?.codigo || '', 'text', 'required class="mono" placeholder="Ex.: CD03" maxlength="12"')}
        ${campo('nome', 'Nome *', c?.nome || '', 'text', 'required placeholder="Ex.: CD Embu das Artes"')}
        ${campo('cidade', 'Cidade', c?.cidade || '')}
        ${campo('uf', 'UF', c?.uf || '', 'text', 'maxlength="2" style="text-transform:uppercase"')}
        ${c ? `<label class="check full"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> CD ativo</label>` : ''}
      </div><p class="erro" id="cd-erro"></p></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary">${c ? 'Salvar' : 'Criar CD'}</button></div>
    </form>`, (dlg) => {
    $('#cd-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const row = { codigo: String(fd.get('codigo')).trim().toUpperCase(), nome: String(fd.get('nome')).trim(),
        cidade: String(fd.get('cidade')).trim() || null, uf: String(fd.get('uf')).trim().toUpperCase() || null };
      if (c) row.ativo = !!fd.get('ativo');
      const { error } = c ? await sb.from('cds').update(row).eq('id', c.id) : await sb.from('cds').insert(row);
      if (error) return ($('#cd-erro').textContent = error.code === '23505' ? 'Já existe um CD com esse código.' : erroMsg(error));
      dlg.close(); toast(c ? 'CD atualizado' : 'CD criado');
      await recarregarCDs(); renderCDsAdmin();
    };
  });
}

/* =====================================================================
   RELATÓRIOS
   ===================================================================== */
const METRICAS = [
  { k: 'total', l: 'Máquinas', f: () => true, ir: {} },
  { k: 'desk', l: 'Desktops', f: (m) => m.tipo === 'desktop', ir: { tipo: 'desktop' } },
  { k: 'note', l: 'Notebooks', f: (m) => m.tipo === 'notebook', ir: { tipo: 'notebook' } },
  { k: 'online', l: 'Online 24h', f: (m) => m.ultimo_online && Date.now() - new Date(m.ultimo_online) < 864e5, pct: true },
  { k: 'semc', l: 'Sem contato 30d', a: 'sem_contato', ruim: true },
  { k: 'so', l: 'Windows sem suporte', a: 'so_sem_suporte', ruim: true },
  { k: 'peca', l: 'Peça removida', a: 'hw_reduzido', ruim: true },
  { k: 'ram', l: 'RAM < 8 GB', a: 'ram_baixa' },
  { k: 'hdd', l: 'Disco HDD', a: 'hdd' },
  { k: 'cheio', l: 'Disco cheio', a: 'disco_cheio' },
  { k: 'gar', l: 'Garantia ≤ 30d', a: 'garantia_vencendo' },
  { k: 'ren', l: 'Mais de 5 anos', a: 'renovacao' },
  { k: 'emp', l: 'Emprestados', f: (m) => !!m.emprestimo_atual, ir: { status: 'emprestado' } },
  { k: 'atr', l: 'Devolução atrasada', a: 'emprestimo_atrasado', ruim: true },
  { k: 'pat', l: 'Sem patrimônio', a: 'sem_ativo' },
];
const temMetrica = (mt, m) => (mt.a ? (m.alertas || []).includes(mt.a) : mt.f(m));

function dadosParque(tipo = '') {
  const base = state.maquinas.filter((m) => m.status !== 'descartado' && (!tipo || m.tipo === tipo) && noCD(m));
  const cdsVis = state.cds.length ? state.cds.filter((c) => noCD({ cd_id: c.id }) && (c.ativo || base.some((m) => m.cd_id === c.id))) : [{ id: null, codigo: '—', nome: 'Todas' }];
  const linhas = cdsVis.map((c) => {
    const ms = state.cds.length ? base.filter((m) => m.cd_id === c.id) : base;
    return { cd: c, ms, v: Object.fromEntries(METRICAS.map((mt) => [mt.k, ms.filter((m) => temMetrica(mt, m)).length])) };
  });
  const total = { cd: { codigo: 'Total', nome: '' }, ms: base, v: Object.fromEntries(METRICAS.map((mt) => [mt.k, base.filter((m) => temMetrica(mt, m)).length])) };
  return { linhas, total, base };
}

async function renderRelatorios(aba = 'parque') {
  const el = $('#view-relatorios');
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Relatórios</h1><p>${ehAdmin() ? (state.cdAtual ? `CD selecionado: <b>${esc(cdCod(state.cdAtual))} · ${esc(cdNome(state.cdAtual))}</b>. Escolha "Todos os CDs" no menu lateral para o consolidado.` : 'Visão consolidada de todos os CDs. Clique em um número para abrir a lista de máquinas.') : `Relatórios do ${esc(cdNome(state.cdAtual))}.`}</p></div>
      <div class="actions" id="rel-acoes"></div>
    </div>
    <div class="tabs tabs--page"><a class="tab ${aba === 'parque' ? 'active' : ''}" href="#relatorios/parque">Parque de máquinas</a><a class="tab ${aba === 'inventarios' ? 'active' : ''}" href="#relatorios/inventarios">Inventários</a></div>
    <div id="rel-corpo"></div>`;
  if (aba === 'inventarios') return renderRelInventarios();
  return renderRelParque();
}

function renderRelParque() {
  const f = state.relParque || (state.relParque = { tipo: '' });
  $('#rel-acoes').innerHTML = `<button class="btn" id="rp-csv">Exportar CSV</button><button class="btn btn--primary" id="rp-imprimir">Relatório geral (PDF)</button>`;
  const desenhar = () => {
    const { linhas, total } = dadosParque(f.tipo);
    const cel = (r, mt) => {
      const n = r.v[mt.k], t = r.v.total;
      const txt = mt.pct ? `${n}<small>${t ? Math.round((100 * n) / t) : 0}%</small>` : n;
      return `<td class="num ${mt.ruim && n ? 'cel-ruim' : ''}">${(mt.a || mt.ir) && n && r.cd.id !== undefined ? `<a data-cd="${r.cd.id || ''}" data-m="${mt.k}">${txt}</a>` : txt}</td>`;
    };
    $('#rel-corpo').innerHTML = `
      <div class="card" style="margin-bottom:12px"><div class="toolbar">
        <select id="rp-tipo">${opts([['', 'Desktops e notebooks'], ['desktop', 'Só desktops'], ['notebook', 'Só notebooks']], f.tipo)}</select>
        <span class="count">${linhas.length} CD(s) · descartadas não entram</span></div></div>
      <div class="card"><div class="table-wrap" style="max-height:none"><table class="rel-tab">
        <thead><tr><th>CD</th>${METRICAS.map((mt) => `<th class="num">${mt.l}</th>`).join('')}<th></th></tr></thead>
        <tbody>${linhas.map((r) => `<tr><td><span class="pill pill--cd">${esc(r.cd.codigo)}</span> ${esc(r.cd.nome)}</td>${METRICAS.map((mt) => cel(r, mt)).join('')}
          <td class="acoes">${r.cd.id ? `<button class="btn btn--sm btn--ghost" data-relcd="${r.cd.id}">Relatório</button>` : ''}</td></tr>`).join('')}
          ${linhas.length > 1 ? `<tr class="row-total"><td>Total</td>${METRICAS.map((mt) => `<td class="num">${total.v[mt.k]}${mt.pct ? `<small>${total.v.total ? Math.round((100 * total.v[mt.k]) / total.v.total) : 0}%</small>` : ''}</td>`).join('')}<td></td></tr>` : ''}
        </tbody></table></div></div>`;
    $('#rp-tipo').onchange = (e) => { f.tipo = e.target.value; desenhar(); };
    $$('#rel-corpo [data-relcd]').forEach((b) => (b.onclick = () => relatorioCD(b.dataset.relcd)));
    $$('#rel-corpo a[data-m]').forEach((a) => (a.onclick = () => {
      const mt = METRICAS.find((x) => x.k === a.dataset.m);
      if (ehAdmin() && a.dataset.cd) { state.cdAtual = a.dataset.cd; store.set('cd-atual', state.cdAtual); renderSidebar(); }
      irMaquinas({ ...(mt.ir || {}), ...(mt.a ? { alerta: mt.a } : {}), ...(f.tipo ? { tipo: f.tipo } : {}) });
    }));
  };
  $('#rp-csv').onclick = () => {
    const { linhas, total } = dadosParque(f.tipo);
    const rows = [['Código', 'CD', ...METRICAS.map((m) => m.l)], ...linhas.map((r) => [r.cd.codigo, r.cd.nome, ...METRICAS.map((m) => r.v[m.k])]), ['Total', '', ...METRICAS.map((m) => total.v[m.k])]];
    baixar(`parque-por-cd-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((l) => l.map(csvCel).join(';')).join('\r\n'));
  };
  $('#rp-imprimir').onclick = () => relatorioGeralParque(f.tipo);
  desenhar();
}

async function carregarConfsRelatorio() {
  const { data: confs, error } = await sb.from('conferencias').select('*').order('criado_em', { ascending: false });
  if (error) throw error;
  const abertas = confs.filter((c) => c.status === 'aberta' || c.total_esperadas == null).map((c) => c.id);
  const itens = [];
  for (let i = 0; i < abertas.length; i += 100) {
    const { data: d } = await sb.from('conferencia_itens').select('conferencia_id, maquina_id').in('conferencia_id', abertas.slice(i, i + 100));
    itens.push(...(d || []));
  }
  confs.forEach((c) => { c.r = resumoConf(c, itens.filter((i) => i.conferencia_id === c.id)); });
  return confs;
}

async function renderRelInventarios() {
  const corpo = $('#rel-corpo');
  corpo.innerHTML = '<div class="skeleton">Carregando inventários…</div>';
  let confs;
  try { confs = await carregarConfsRelatorio(); } catch (e) { corpo.innerHTML = `<div class="card card-pad erro">${esc(erroMsg(e))}</div>`; return; }
  state.relConfs = confs;
  const f = state.relInv || (state.relInv = { q: '', cd: '', status: '', de: '', ate: '', resp: '' });
  if (!f.cdTocado) f.cd = state.cdAtual || '';
  const responsaveis = [...new Set(confs.map((c) => c.criado_por).filter(Boolean))].sort();
  $('#rel-acoes').innerHTML = `<button class="btn" id="ri-csv">Exportar CSV</button><button class="btn btn--primary" id="ri-imprimir">Imprimir lista (PDF)</button>`;
  corpo.innerHTML = `
    <div class="card" style="margin-bottom:12px"><div class="toolbar filtros-rel">
      <div class="search"><input id="ri-q" type="search" placeholder="Buscar inventário ou setor…" value="${esc(f.q)}"></div>
      ${ehAdmin() && state.cds.length > 1 ? `<select id="ri-cd">${opts([['', 'Todos os CDs'], ...state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}`])], f.cd)}</select>` : ''}
      <select id="ri-status">${opts([['', 'Todos os status'], ['aberta', 'Abertos'], ['finalizada', 'Finalizados']], f.status)}</select>
      <select id="ri-resp">${opts([['', 'Qualquer responsável'], ...responsaveis.map((r) => [r, r])], f.resp)}</select>
      <label class="periodo">De<input type="date" id="ri-de" value="${f.de}"></label>
      <label class="periodo">Até<input type="date" id="ri-ate" value="${f.ate}"></label>
      <button class="btn btn--ghost btn--sm" id="ri-limpar">Limpar</button>
    </div></div>
    <div class="kpis" id="ri-kpis"></div>
    ${ehAdmin() && !f.cd && state.cds.length > 1 ? '<div class="card card-pad" style="margin-bottom:12px"><div class="card-head"><h2>Último inventário de cada CD</h2></div><div id="ri-ultimos"></div></div>' : ''}
    <div class="card"><div class="table-wrap" style="max-height:none"><table class="rel-tab">
      <thead><tr><th>Inventário</th>${ehAdmin() ? '<th>CD</th>' : ''}<th>Setor</th><th>Status</th><th>Responsável</th><th>Início</th><th>Finalizado</th>
        <th class="num">Esperadas</th><th class="num">Encontradas</th><th class="num">Faltando</th><th class="num">Não cad.</th><th class="num">Fora</th><th>Acuracidade</th><th></th></tr></thead>
      <tbody id="ri-tbody"></tbody></table></div></div>`;
  const filtrados = () => {
    const termos = up(f.q).split(/\s+/).filter(Boolean);
    const de = f.de ? new Date(f.de + 'T00:00:00') : null, ate = f.ate ? new Date(f.ate + 'T23:59:59') : null;
    return confs.filter((c) => (!f.cd || c.cd_id === f.cd) && (!f.status || c.status === f.status) && (!f.resp || c.criado_por === f.resp)
      && (!de || new Date(c.criado_em) >= de) && (!ate || new Date(c.criado_em) <= ate)
      && termos.every((t) => up(`${c.nome} ${c.setor} ${cdCod(c.cd_id)} ${cdNome(c.cd_id)}`).includes(t)));
  };
  const somar = (l) => l.reduce((a, c) => ({ esp: a.esp + c.r.esperadas, enc: a.enc + c.r.encontradas, fal: a.fal + c.r.faltando, des: a.des + c.r.desconhecidas, fora: a.fora + c.r.fora }), { esp: 0, enc: 0, fal: 0, des: 0, fora: 0 });
  const barraAc = (p) => `<div class="ac"><span class="meter"><i class="${p < 90 ? (p < 70 ? 'bad' : 'warn') : 'ok'}" style="width:${p}%"></i></span><b>${p}%</b></div>`;
  const desenhar = () => {
    const l = filtrados();
    const t = somar(l);
    const acur = t.esp ? Math.round((100 * t.enc) / t.esp) : 0;
    $('#ri-kpis').innerHTML = `
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Inventários</div><div class="kpi-value">${l.length}</div><div class="kpi-sub">${l.filter((c) => c.status === 'aberta').length} em aberto</div></div>
      <div class="card kpi kpi--ok" style="cursor:default"><div class="kpi-label">Acuracidade geral</div><div class="kpi-value">${acur}%</div><div class="kpi-sub">encontradas ÷ esperadas</div></div>
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Máquinas conferidas</div><div class="kpi-value">${t.enc}</div><div class="kpi-sub">de ${t.esp} esperadas</div></div>
      <div class="card kpi ${t.fal ? 'kpi--bad' : ''}" style="cursor:default"><div class="kpi-label">Faltando</div><div class="kpi-value">${t.fal}</div><div class="kpi-sub">somando os inventários</div></div>
      <div class="card kpi ${t.des ? 'kpi--warn' : ''}" style="cursor:default"><div class="kpi-label">Não cadastradas</div><div class="kpi-value">${t.des}</div><div class="kpi-sub">códigos desconhecidos</div></div>`;
    if ($('#ri-ultimos')) {
      const ult = state.cds.map((cd) => ({ cd, c: confs.find((c) => c.cd_id === cd.id) }));
      $('#ri-ultimos').innerHTML = `<table class="mini-table"><thead><tr><th>CD</th><th>Último inventário</th><th>Data</th><th>Status</th><th>Acuracidade</th></tr></thead><tbody>
        ${ult.map(({ cd, c }) => `<tr><td><span class="pill pill--cd">${esc(cd.codigo)}</span> ${esc(cd.nome)}</td>${c ? `<td><a data-rel="${c.id}">${esc(c.nome)}</a></td><td>${data(c.criado_em)}</td><td>${pill(c.status === 'aberta' ? 'Aberto' : 'Finalizado', c.status === 'aberta' ? 'info' : 'ok')}</td><td>${barraAc(c.r.pct)}</td>` : '<td colspan="4" class="muted">Nenhum inventário ainda</td>'}</tr>`).join('')}
      </tbody></table>`;
    }
    $('#ri-tbody').innerHTML = l.length ? l.map((c) => `<tr data-conf="${c.id}">
      <td><a data-rel="${c.id}"><strong>${esc(c.nome)}</strong></a></td>${ehAdmin() ? `<td><span class="pill pill--cd" title="${esc(cdNome(c.cd_id))}">${esc(cdCod(c.cd_id))}</span></td>` : ''}
      <td>${esc(c.setor || 'Todos')}</td><td>${pill(c.status === 'aberta' ? 'Aberto' : 'Finalizado', c.status === 'aberta' ? 'info' : 'ok')}</td>
      <td>${esc((c.criado_por || '').split('@')[0])}</td><td>${data(c.criado_em)}</td><td>${c.finalizado_em ? data(c.finalizado_em) : '—'}</td>
      <td class="num">${c.r.esperadas}</td><td class="num">${c.r.encontradas}</td><td class="num ${c.r.faltando ? 'cel-ruim' : ''}">${c.r.faltando}</td><td class="num">${c.r.desconhecidas}</td><td class="num">${c.r.fora}</td>
      <td>${barraAc(c.r.pct)}</td>
      <td class="acoes"><button class="btn btn--sm btn--ghost" data-ac="abrir">Abrir</button>${ehAdmin() ? '<button class="btn btn--sm btn--ghost" data-ac="editar">Editar</button><button class="btn btn--sm btn--ghost btn--txt-bad" data-ac="excluir">Excluir</button>' : ''}</td></tr>`).join('')
      + (l.length > 1 ? `<tr class="row-total"><td colspan="${ehAdmin() ? 7 : 6}">Total (${l.length})</td><td class="num">${t.esp}</td><td class="num">${t.enc}</td><td class="num">${t.fal}</td><td class="num">${t.des}</td><td class="num">${t.fora}</td><td>${barraAc(acur)}</td><td></td></tr>` : '')
      : `<tr><td colspan="14" class="empty">Nenhum inventário com esses filtros.</td></tr>`;
  };
  const bind = (id, k, ev = 'onchange') => { const e = $('#' + id); if (e) e[ev] = (x) => { f[k] = x.target.value; if (k === 'cd') f.cdTocado = true; desenhar(); }; };
  $('#ri-q').oninput = debounce((x) => { f.q = x.target.value; desenhar(); }, 150);
  bind('ri-cd', 'cd'); bind('ri-status', 'status'); bind('ri-resp', 'resp'); bind('ri-de', 'de'); bind('ri-ate', 'ate');
  $('#ri-limpar').onclick = () => { Object.assign(f, { q: '', cd: ehAdmin() ? '' : f.cd, status: '', de: '', ate: '', resp: '', cdTocado: true }); renderRelInventarios(); };
  corpo.onclick = async (e) => {
    const rel = e.target.closest('[data-rel]'); if (rel) return relatorioInventario(rel.dataset.rel);
    const b = e.target.closest('[data-ac]'); if (!b) return;
    const c = confs.find((x) => x.id === b.closest('tr').dataset.conf);
    if (b.dataset.ac === 'abrir') location.hash = '#conferencia/' + c.id;
    if (b.dataset.ac === 'editar') modalConf(c);
    if (b.dataset.ac === 'excluir' && await excluirConf(c)) renderRelInventarios();
  };
  $('#ri-csv').onclick = () => {
    const l = filtrados();
    const rows = [['Inventário', 'Código CD', 'CD', 'Setor', 'Status', 'Responsável', 'Início', 'Finalizado', 'Esperadas', 'Encontradas', 'Faltando', 'Não cadastradas', 'Fora do esperado', 'Acuracidade %'],
      ...l.map((c) => [c.nome, cdCod(c.cd_id), cdNome(c.cd_id), c.setor || 'Todos', c.status === 'aberta' ? 'Aberto' : 'Finalizado', c.criado_por, dataHora(c.criado_em), c.finalizado_em ? dataHora(c.finalizado_em) : '', c.r.esperadas, c.r.encontradas, c.r.faltando, c.r.desconhecidas, c.r.fora, c.r.pct])];
    baixar(`inventarios-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(csvCel).join(';')).join('\r\n'));
  };
  $('#ri-imprimir').onclick = () => {
    const l = filtrados(); const t = somar(l);
    const filtrosTxt = [f.cd && `CD ${cdCod(f.cd)}`, f.status && (f.status === 'aberta' ? 'abertos' : 'finalizados'), f.resp && `responsável ${f.resp}`, f.de && `de ${dataBR(f.de)}`, f.ate && `até ${dataBR(f.ate)}`, f.q && `busca "${f.q}"`].filter(Boolean).join(' · ') || 'sem filtros';
    abrirRelatorio('Relatório de inventários', `${l.length} inventário(s) · ${esc(filtrosTxt)}`, `
      ${kpisRel([['Inventários', l.length], ['Acuracidade geral', (t.esp ? Math.round((100 * t.enc) / t.esp) : 0) + '%', 'ok'], ['Encontradas', `${t.enc} / ${t.esp}`], ['Faltando', t.fal, t.fal ? 'bad' : ''], ['Não cadastradas', t.des]])}
      <table><thead><tr><th>Inventário</th><th>CD</th><th>Setor</th><th>Status</th><th>Responsável</th><th>Início</th><th>Fim</th><th class="n">Esp.</th><th class="n">Enc.</th><th class="n">Falt.</th><th class="n">Não cad.</th><th class="n">Acur.</th></tr></thead><tbody>
      ${l.map((c) => `<tr><td>${esc(c.nome)}</td><td>${esc(cdCod(c.cd_id))}</td><td>${esc(c.setor || 'Todos')}</td><td>${c.status === 'aberta' ? 'Aberto' : 'Finalizado'}</td><td>${esc((c.criado_por || '').split('@')[0])}</td><td>${data(c.criado_em)}</td><td>${c.finalizado_em ? data(c.finalizado_em) : '—'}</td><td class="n">${c.r.esperadas}</td><td class="n">${c.r.encontradas}</td><td class="n">${c.r.faltando}</td><td class="n">${c.r.desconhecidas}</td><td class="n">${c.r.pct}%</td></tr>`).join('')}
      <tr class="total"><td colspan="7">Total</td><td class="n">${t.esp}</td><td class="n">${t.enc}</td><td class="n">${t.fal}</td><td class="n">${t.des}</td><td class="n">${t.esp ? Math.round((100 * t.enc) / t.esp) : 0}%</td></tr></tbody></table>`);
  };
  desenhar();
}

// ---------------------------------------------------------------- janelas de relatório (imprimir / PDF)
function kpisRel(itens) {
  return `<div class="kpis">${itens.map(([l, v, cls]) => `<div class="kpi ${cls || ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
}
function distRel(titulo, pares) {
  const tot = pares.reduce((a, p) => a + p[1], 0) || 1;
  return `<div><h2>${titulo}</h2><table><tbody>${pares.map(([k, n]) => `<tr><td>${esc(k)}</td><td style="width:45%"><div class="bar"><i style="width:${(100 * n) / tot}%"></i></div></td><td class="n">${n}</td><td class="n">${Math.round((100 * n) / tot)}%</td></tr>`).join('')}</tbody></table></div>`;
}
const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" xmlns:c2pa="http://c2pa.org/manifest"><metadata><c2pa:manifest>AAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYTo5Nzg2NTliNC01NGQxLTRlN2YtOWM1Zi1hZWQ4ZTE3MTM3ZTgAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaB78rESD5ZblQB3/0hn5UosAAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDpmNjM2NWRlZS1mOGM1LTQ3YTQtYjFmZi1iOWI1ZGQ5Zjc3OTdscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNoCesrCbNp4DJjzijMdXnmiAAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFggLJSXadGHdbHznwllDKwHoYNJM5mV0Fv72djZuoR3LVWkZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaC7PzB8TTrDn3hOQd6aVvicAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRNAAAAAAAAAAAAAAAAAGRoYXNoWCDRjn7YobVZOix//VLHStZRBGZmSuHPZdcUegbZukrqhWRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBh9Zmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjk3ODY1OWI0LTU0ZDEtNGU3Zi05YzVmLWFlZDhlMTcxMzdlOC9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOmQ2YjE3M2MzLWQ2YzktNGEyMS1iZjhiLTg2ZWY3NmNlYTAxZnJjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCAslJdp0Yd1sfOfCWUMrAehg0kzmZXQW/vZ2Nm6hHctVaJjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFggjjvl4ivi27bjwwzebsFqgijdiYjRK52skrOtiEwDNpeiY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFggwEHycfQfdEJHnJKHsIwdKUH6dd/0beX1mTyvWxwV/8d0Y2xhaW1fZ2VuZXJhdG9yX2luZm+jZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g/oGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd/3cyjxFA3Qo5S46fX0/ihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB/wQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj+OPEz5o+nMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn/aArXyTwFAZfKrPzxF2vPoJNf1+UCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9+1rdDwSPLMOPOjKuiXjoU/pUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQMe+2kGPMyWwbrxfGjBxuk9gPWb3iThBvZN51FJ3G4tiu9pgKql3cUwCEgq7o7CePAfEE6HPGxuA/pW8brpuhzc=</c2pa:manifest></metadata><defs><mask id="qmr" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><rect width="200" height="200" fill="#fff"/><line x1="124" y1="124" x2="157" y2="157" stroke="#000" stroke-width="45" stroke-linecap="round"/></mask></defs><circle cx="99.5" cy="99.5" r="65" fill="none" stroke="#1C9BA9" stroke-width="33" mask="url(#qmr)"/><line x1="125" y1="125" x2="156" y2="156" stroke="#FF8221" stroke-width="31" stroke-linecap="round"/></svg>';
function abrirRelatorio(titulo, subtitulo, corpo, janela) {
  const w = janela || window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para abrir o relatório.', true);
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    @page { size: A4; margin: 13mm 11mm; }
    body { font: 12px/1.45 "Segoe UI", Arial, sans-serif; color: #0e1d20; margin: 0; background: #fff; }
    .barra { position: sticky; top: 0; background: #0c2226; color: #fff; padding: 10px 18px; display: flex; gap: 10px; justify-content: space-between; align-items: center; }
    .barra button { background: #1c9ba9; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 600; cursor: pointer; font: inherit; }
    main { max-width: 1040px; margin: 0 auto; padding: 22px 20px; }
    header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #1c9ba9; padding-bottom: 10px; margin-bottom: 14px; position: relative; }
    header::after { content: ""; position: absolute; left: 0; bottom: -3px; width: 70px; height: 3px; background: #ff8221; }
    header svg { width: 44px; height: 44px; flex: none; } header h1 { font-size: 19px; margin: 0; } header p { margin: 2px 0 0; color: #557276; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; margin: 12px 0 6px; }
    .kpi { border: 1px solid #dde6e8; border-radius: 8px; padding: 8px 10px; } .kpi b { display: block; font-size: 19px; } .kpi span { color: #627a7f; font-size: 11px; }
    .kpi.bad b { color: #cc2b20; } .kpi.ok b { color: #127f8b; } .kpi.warn b { color: #b25f00; }
    h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; color: #127f8b; margin: 18px 0 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; } th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e3eaec; vertical-align: top; }
    th { background: #f1f5f6; font-weight: 600; color: #33474b; } .n { text-align: right; white-space: nowrap; }
    tr.total td { font-weight: 700; border-top: 2px solid #0e1d20; background: #f6f9fa; }
    .ruim { color: #cc2b20; font-weight: 700; }
    .bar { height: 7px; background: #ecf1f2; border-radius: 9px; overflow: hidden; } .bar i { display: block; height: 100%; background: #1c9ba9; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; } .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 18px; }
    .tag { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #fdf1df; color: #b25f00; margin: 1px; white-space: nowrap; }
    .tag.bad { background: #fde8e6; color: #cc2b20; } .mono { font-family: Consolas, monospace; } .muted { color: #7a8f93; }
    footer { margin-top: 22px; color: #8a9b9e; font-size: 10px; border-top: 1px solid #e3eaec; padding-top: 6px; }
    @media print { .barra { display: none; } main { padding: 0; max-width: none; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
  </style></head><body><div class="barra"><span>${esc(titulo)}</span><button onclick="print()">Imprimir / Salvar PDF</button></div>
  <main><header>${LOGO_SVG}<div><h1>${esc(titulo)}</h1><p>${subtitulo}</p></div></header>${corpo}
  <footer>Inventário Quallit · gerado em ${dataHora(new Date().toISOString())} por ${esc(state.perfil?.nome || state.user?.email || '')}</footer></main></body></html>`);
  w.document.close();
}

function relatorioGeralParque(tipo = '') {
  const { linhas, total, base } = dadosParque(tipo);
  const pct = (n, t) => (t ? Math.round((100 * n) / t) : 0);
  const sub = `${state.cdAtual ? esc(cdCod(state.cdAtual) + ' · ' + cdNome(state.cdAtual)) : `${linhas.length} CD(s)`} · ${tipo ? (tipo === 'desktop' ? 'só desktops' : 'só notebooks') : 'desktops e notebooks'} · ${data(new Date().toISOString())}`;
  abrirRelatorio('Relatório geral do parque', sub, `
    ${kpisRel([['Máquinas', total.v.total], ['Online 24h', pct(total.v.online, total.v.total) + '%', 'ok'], ['Sem contato 30d', total.v.semc, total.v.semc ? 'bad' : ''],
      ['Windows sem suporte', total.v.so, total.v.so ? 'bad' : ''], ['Peça removida', total.v.peca, total.v.peca ? 'bad' : ''], ['Emprestados', total.v.emp], ['Mais de 5 anos', total.v.ren, total.v.ren ? 'warn' : '']])}
    <h2>Indicadores por CD</h2>
    <table><thead><tr><th>CD</th>${METRICAS.map((m) => `<th class="n">${m.l}</th>`).join('')}</tr></thead><tbody>
      ${linhas.map((r) => `<tr><td><b>${esc(r.cd.codigo)}</b> ${esc(r.cd.nome)}</td>${METRICAS.map((m) => `<td class="n ${m.ruim && r.v[m.k] ? 'ruim' : ''}">${r.v[m.k]}${m.pct ? ` (${pct(r.v[m.k], r.v.total)}%)` : ''}</td>`).join('')}</tr>`).join('')}
      ${linhas.length > 1 ? `<tr class="total"><td>Total</td>${METRICAS.map((m) => `<td class="n">${total.v[m.k]}</td>`).join('')}</tr>` : ''}
    </tbody></table>
    <div class="grid3">
      ${distRel('Sistema operacional', contar(base, soGrupo))}
      ${distRel('Memória RAM', contar(base, ramFaixa).sort((a, b) => ['4 GB ou menos', '8 GB', '16 GB', '32 GB ou mais', 'Sem dado'].indexOf(a[0]) - ['4 GB ou menos', '8 GB', '16 GB', '32 GB ou mais', 'Sem dado'].indexOf(b[0])))}
      ${distRel('Armazenamento', contar(base, tipoDisco))}
      ${distRel('Idade do parque', contar(base, idadeFaixa).sort((a, b) => ORDEM_IDADE.indexOf(a[0]) - ORDEM_IDADE.indexOf(b[0])))}
      ${distRel('Garantia', contar(base, garantiaFaixa).sort((a, b) => ORDEM_GAR.indexOf(a[0]) - ORDEM_GAR.indexOf(b[0])))}
      ${distRel('Status', contar(base, (m) => STATUS[m.status]))}
    </div>`);
}

async function relatorioCD(cdId) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para abrir o relatório.', true);
  w.document.write('<p style="font:16px sans-serif;padding:24px">Gerando relatório…</p>');
  const cd = cdDe(cdId) || { codigo: '—', nome: '' };
  const ms = state.maquinas.filter((m) => m.cd_id === cdId && m.status !== 'descartado');
  const v = Object.fromEntries(METRICAS.map((mt) => [mt.k, ms.filter((m) => temMetrica(mt, m)).length]));
  const graves = ms.filter((m) => (m.alertas || []).some((a) => ALERTAS[a]?.grave)).sort((a, b) => (b.alertas || []).length - (a.alertas || []).length);
  const emp = ms.filter((m) => m.emprestimo_atual);
  const { data: confs } = await sb.from('conferencias').select('*').eq('cd_id', cdId).order('criado_em', { ascending: false }).limit(8);
  const pct = (n) => (v.total ? Math.round((100 * n) / v.total) : 0);
  abrirRelatorio(`Relatório do CD ${cd.codigo}`, `${esc(cd.nome)}${cd.cidade ? ' · ' + esc(cd.cidade) + (cd.uf ? '/' + esc(cd.uf) : '') : ''} · ${data(new Date().toISOString())}`, `
    ${kpisRel([['Máquinas', v.total], ['Desktops / notebooks', `${v.desk} / ${v.note}`], ['Online 24h', pct(v.online) + '%', 'ok'], ['Sem contato 30d', v.semc, v.semc ? 'bad' : ''],
      ['Windows sem suporte', v.so, v.so ? 'bad' : ''], ['Peça removida', v.peca, v.peca ? 'bad' : ''], [v.atr ? `Emprestados · ${v.atr} atrasado(s)` : 'Emprestados', v.emp, v.atr ? 'bad' : ''], ['Garantia ≤ 30d', v.gar, v.gar ? 'warn' : '']])}
    <div class="grid3">
      ${distRel('Sistema operacional', contar(ms, soGrupo))}
      ${distRel('Memória RAM', contar(ms, ramFaixa))}
      ${distRel('Armazenamento', contar(ms, tipoDisco))}
      ${distRel('Idade', contar(ms, idadeFaixa).sort((a, b) => ORDEM_IDADE.indexOf(a[0]) - ORDEM_IDADE.indexOf(b[0])))}
      ${distRel('Garantia', contar(ms, garantiaFaixa).sort((a, b) => ORDEM_GAR.indexOf(a[0]) - ORDEM_GAR.indexOf(b[0])))}
      ${distRel('Setores', contar(ms, (m) => m.setor || 'Sem setor'))}
    </div>
    <h2>Máquinas com alertas importantes (${graves.length})</h2>
    ${graves.length ? `<table><thead><tr><th>Hostname</th><th>Patrimônio</th><th>Tipo / modelo</th><th>Setor</th><th>Último contato</th><th>Alertas</th></tr></thead><tbody>
      ${graves.map((m) => `<tr><td class="mono">${esc(m.hostname)}</td><td class="mono">${esc(m.ativo || '—')}</td><td>${esc(TIPO[m.tipo])} ${esc(m.modelo || '')}</td><td>${esc(m.setor || '—')}</td><td>${m.ultimo_online ? dataHora(m.ultimo_online) : 'nunca'}</td>
        <td>${(m.alertas || []).map((a) => `<span class="tag ${ALERTAS[a]?.grave ? 'bad' : ''}">${esc(ALERTAS[a]?.l || a)}</span>`).join('')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nenhum alerta importante. 🎉</p>'}
    <h2>Empréstimos em aberto (${emp.length})</h2>
    ${emp.length ? `<table><thead><tr><th>Equipamento</th><th>Colaborador</th><th>Retirada</th><th>Devolução prevista</th></tr></thead><tbody>
      ${emp.map((m) => { const e = m.emprestimo_atual; const at = e.previsto_devolucao && new Date(e.previsto_devolucao) < new Date();
        return `<tr><td class="mono">${esc(m.hostname)} ${esc(m.ativo || '')}</td><td>${esc(e.colaborador)} ${esc(e.matricula || '')}</td><td>${dataHora(e.retirado_em)}</td><td class="${at ? 'ruim' : ''}">${e.previsto_devolucao ? dataHora(e.previsto_devolucao) : '—'}${at ? ' (atrasado)' : ''}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">Nenhum equipamento emprestado.</p>'}
    <h2>Últimos inventários</h2>
    ${(confs || []).length ? `<table><thead><tr><th>Inventário</th><th>Setor</th><th>Status</th><th>Início</th><th class="n">Esperadas</th><th class="n">Encontradas</th><th class="n">Faltando</th><th class="n">Acuracidade</th></tr></thead><tbody>
      ${confs.map((c) => { const r = resumoConf(c, []); const ok = c.status === 'finalizada' && c.total_esperadas != null;
        return `<tr><td>${esc(c.nome)}</td><td>${esc(c.setor || 'Todos')}</td><td>${c.status === 'aberta' ? 'Aberto' : 'Finalizado'}</td><td>${data(c.criado_em)}</td><td class="n">${ok ? r.esperadas : '—'}</td><td class="n">${ok ? r.encontradas : '—'}</td><td class="n">${ok ? r.faltando : '—'}</td><td class="n">${ok ? r.pct + '%' : 'em andamento'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">Nenhum inventário registrado.</p>'}`, w);
}

async function relatorioInventario(confId) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para abrir o relatório.', true);
  w.document.write('<p style="font:16px sans-serif;padding:24px">Gerando relatório…</p>');
  const [{ data: c, error }, { data: itens }] = await Promise.all([
    sb.from('conferencias').select('*').eq('id', confId).single(),
    sb.from('conferencia_itens').select('*').eq('conferencia_id', confId).order('lido_em'),
  ]);
  if (error) { w.close(); return toast(erroMsg(error), true); }
  const k = calcularConf(c, itens || []);
  const pct = k.esperadasN ? Math.round((100 * k.achadasEsperadas) / k.esperadasN) : 0;
  const tabelaMaq = (lista, extra) => `<table><thead><tr><th>Hostname</th><th>Patrimônio</th><th>Tipo / modelo</th><th>Setor / local</th>${extra.cab}</tr></thead><tbody>
    ${lista.map((x) => { const m = x.m || x; return `<tr><td class="mono">${esc(m.hostname)}</td><td class="mono">${esc(m.ativo || '—')}</td><td>${esc(TIPO[m.tipo] || '')} ${esc(m.modelo || '')}</td><td>${esc(m.setor || '—')}${m.localizacao ? ' · ' + esc(m.localizacao) : ''}</td>${extra.cel(x)}</tr>`; }).join('')}</tbody></table>`;
  abrirRelatorio(`Inventário: ${c.nome}`, `${esc(cdCod(c.cd_id))} · ${esc(cdNome(c.cd_id))} · ${esc(c.setor || 'todos os setores')} · ${c.status === 'aberta' ? 'em andamento' : 'finalizado em ' + dataHora(c.finalizado_em)}`, `
    ${kpisRel([['Acuracidade', pct + '%', pct >= 95 ? 'ok' : pct >= 80 ? 'warn' : 'bad'], ['Encontradas', `${k.achadasEsperadas} / ${k.esperadasN}`], ['Faltando', k.faltando.length, k.faltando.length ? 'bad' : ''],
      ['Fora do esperado', k.foraDoEsperado.length, k.foraDoEsperado.length ? 'warn' : ''], ['Não cadastradas', k.desconhecidos.length, k.desconhecidos.length ? 'warn' : ''], ['Leituras', (itens || []).length]])}
    <table style="margin-top:8px"><tbody>
      <tr><th style="width:22%">Iniciado</th><td>${dataHora(c.criado_em)} por ${esc(c.criado_por || '—')}</td><th style="width:22%">Finalizado</th><td>${c.finalizado_em ? `${dataHora(c.finalizado_em)} por ${esc(c.finalizado_por || '—')}` : '—'}</td></tr>
    </tbody></table>
    <h2>Faltando (${k.faltando.length})</h2>
    ${k.faltando.length ? tabelaMaq(k.faltando, { cab: '<th>Último contato</th>', cel: (m) => `<td>${m.ultimo_online ? dataHora(m.ultimo_online) : 'nunca'}</td>` }) : '<p class="muted">Nenhuma máquina faltando.</p>'}
    ${k.foraDoEsperado.length ? `<h2>Encontradas fora do esperado (${k.foraDoEsperado.length})</h2>${tabelaMaq(k.foraDoEsperado, { cab: '<th>Motivo</th><th>Lida em</th>', cel: (x) => `<td>${x.m.cd_id !== c.cd_id ? 'Outro CD: ' + esc(cdCod(x.m.cd_id)) : ['extraviado', 'descartado'].includes(x.m.status) ? 'Estava ' + esc(STATUS[x.m.status]) : 'Outro setor'}</td><td>${dataHora(x.item.lido_em)}</td>` })}` : ''}
    ${k.desconhecidos.length ? `<h2>Códigos não cadastrados (${k.desconhecidos.length})</h2><table><thead><tr><th>Código lido</th><th>Local</th><th>Lido em</th><th>Por</th></tr></thead><tbody>
      ${k.desconhecidos.map((i) => `<tr><td class="mono">${esc(i.codigo_lido)}</td><td>${esc(i.localizacao || '—')}</td><td>${dataHora(i.lido_em)}</td><td>${esc(i.lido_por || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    <h2>Encontradas (${k.encontradas.length - k.foraDoEsperado.length})</h2>
    ${tabelaMaq(k.encontradas.filter((x) => !k.foraDoEsperado.includes(x)), { cab: '<th>Lida em</th><th>Local da leitura</th><th>Por</th>', cel: (x) => `<td>${dataHora(x.item.lido_em)}</td><td>${esc(x.item.localizacao || '—')}</td><td>${esc((x.item.lido_por || '').split('@')[0])}</td>` })}`, w);
}

/* =====================================================================
   Auth / inicialização
   ===================================================================== */
function aplicarTema() {
  const t = store.get('tema');
  if (t) document.documentElement.dataset.theme = t;
}
$('#btn-tema').onclick = () => {
  const atual = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const novo = atual === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo; store.set('tema', novo);
};
$('#btn-sair').onclick = () => sb.auth.signOut();
$$('.nav-item').forEach((b) => (b.onclick = () => (location.hash = '#' + b.dataset.view)));
$('#drawer-bg').onclick = fecharDrawer;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.drawerId && !$('#modal').open) fecharDrawer();
  if (e.key === '/' && state.view === 'maquinas' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); $('#f-q')?.focus(); }
});

$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true; $('#login-erro').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('senha') });
  btn.disabled = false;
  if (error) $('#login-erro').textContent = error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : error.message;
};

async function carregarPerfil(userId) {
  const [p, c] = await Promise.all([
    sb.from('perfis').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('cds').select('*').order('codigo'),
  ]);
  if (ehErroDeRede(p.error) || ehErroDeRede(c.error)) {
    const cache = await idbGet('perfil:' + userId);
    if (cache) { state.perfil = cache.perfil; state.cds = cache.cds; return true; }
  }
  if (p.error && /perfis|relation|does not exist|schema cache/i.test(p.error.message)) {
    // banco ainda sem o 04: funciona como antes (todos administradores, um CD)
    state.perfil = { papel: 'admin', nome: state.user.email, ativo: true, legado: true };
    state.cds = [];
    return true;
  }
  if (!p.data || !p.data.ativo) return false;
  state.perfil = p.data;
  state.cds = c.data || [];
  idbSet('perfil:' + userId, { perfil: state.perfil, cds: state.cds });
  return true;
}

function renderSidebar() {
  const box = $('#cd-box');
  const admin = ehAdmin();
  $$('[data-admin]').forEach((el) => (el.hidden = !admin));
  $('#user-email').innerHTML = `<strong>${esc(state.perfil?.nome || state.user?.email || '')}</strong><span>${admin ? 'Administrador' : 'Field'}</span>`;
  if (!state.cds.length) { box.hidden = true; return; }
  box.hidden = false;
  if (admin) {
    box.innerHTML = `<label class="cd-label" for="cd-sel">CD</label>
      <select id="cd-sel">${opts([['', `Todos os CDs (${state.cds.length})`], ...state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}${c.ativo ? '' : ' (inativo)'}`])], state.cdAtual)}</select>`;
    $('#cd-sel').onchange = (e) => {
      state.cdAtual = e.target.value;
      store.set('cd-atual', state.cdAtual);
      state.sel.clear();
      state.maqMontada && renderTabela();
      navegar();
    };
  } else {
    box.innerHTML = `<span class="cd-label">CD</span><div class="cd-fixo"><b>${esc(cdCod(state.cdAtual))}</b> ${esc(cdNome(state.cdAtual))}</div>`;
  }
}

function semAcesso() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-form').innerHTML = `
    <div class="brand brand--lg"><span class="brand-mark"></span><div><strong>Inventário</strong><small>Quallit · CD</small></div></div>
    <h2>Acesso não liberado</h2>
    <p class="muted" style="margin:0">O usuário <b>${esc(state.user?.email || '')}</b> ainda não tem permissão ou foi desativado. Peça ao administrador para liberar o seu acesso.</p>
    <button type="button" class="btn btn--block" id="sem-sair">Sair</button>`;
  $('#sem-sair').onclick = () => sb.auth.signOut();
}

let iniciado = false;
async function entrar(session) {
  state.user = session.user;
  if (iniciado) return;
  iniciado = true;
  if (!(await carregarPerfil(session.user.id))) return semAcesso();
  state.cdAtual = ehAdmin() ? (store.get('cd-atual') || '') : state.perfil.cd_id;
  if (state.cdAtual && !state.cds.some((c) => c.id === state.cdAtual)) state.cdAtual = '';
  $('#login').hidden = true; $('#app').hidden = false;
  renderSidebar();
  $('#view-painel').innerHTML = '<div class="skeleton">Carregando inventário…</div>';
  try {
    await Promise.all([carregarMaquinas(), carregarHist()]);
  } catch (e) {
    $('#view-painel').innerHTML = `<div class="card card-pad"><h2>Não foi possível carregar</h2><p class="erro">${esc(erroMsg(e))}</p>
      <p class="muted">Verifique se o arquivo <code>sql/01_schema.sql</code> foi executado no SQL Editor do Supabase.</p></div>`;
    return;
  }
  iniciarRealtime();
  window.addEventListener('hashchange', navegar);
  navegar();
  registrarSW();
  atualizarBadge();
  atualizarPendentes().then(sincronizar);
  setInterval(sincronizar, 20_000);
  const atrasados = MQ().filter((m) => (m.alertas || []).includes('emprestimo_atrasado')).length;
  if (atrasados) toast(`${atrasados} empréstimo(s) com devolução atrasada`, true);
  const pecas = MQ().filter((m) => (m.alertas || []).includes('hw_reduzido')).length;
  if (pecas) toast(`${pecas} máquina(s) com memória ou disco reduzido — confira`, true);
}

aplicarTema();
sb.auth.onAuthStateChange((ev, session) => {
  if (session) setTimeout(() => entrar(session), 0); // fora do lock de auth do supabase-js
  else {
    if (iniciado) return location.reload();
    $('#app').hidden = true; $('#login').hidden = false;
  }
});
