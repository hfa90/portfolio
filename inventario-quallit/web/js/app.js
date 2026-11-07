import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, URL_PUBLICA } from './config.js';
import { idbGet, idbSet, filaListar, filaAdicionar, filaRemover, ehErroDeRede } from './offline.js';
import { criarAssinatura } from './assinatura.js';
import { lerCSV, normCab, lerValor, lerArquivoPlanilha, coletasDaPlanilha, montarKitInventLocal, montarKitColetores, criarXlsx } from './planilha.js';
import { MODELOS, montarFolhas } from './etiquetas.js';
import { fmtDuracao, anelPrazo, etiquetaPrazo, relogioCompleto, iniciarRelogios, estadoPrazo, descreverAgendamento, proximasExecucoes, DIAS_SEMANA, ESTADOS } from './prazo.js';

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
const TIPO = { desktop: 'Desktop', notebook: 'Notebook', coletor: 'Coletor de dados', servidor: 'Servidor', outro: 'Outro' };
const SIT = { online: 'Online agora', recente: 'Até 7 dias', ausente: '7 a 30 dias', offline: 'Mais de 30 dias', nunca: 'Nunca reportou' };
const SIT_COR = { online: 'ok', recente: 'info', ausente: 'warn', offline: 'bad', nunca: 'idle' };
const ALERTAS = {
  hw_reduzido:        { l: 'Peça removida?', d: 'Memória ou armazenamento diminuiu — pente com defeito ou peça retirada', grave: true },
  emprestimo_atrasado:{ l: 'Devolução atrasada', d: 'Empréstimo com data de devolução vencida', grave: true },
  so_sem_suporte:     { l: 'Windows sem suporte', d: 'Windows 10 ou anterior — fim do suporte Microsoft em 14/10/2025', grave: true },
  estoque_online:     { l: 'Estoque ligada', d: 'Marcada como estoque/descartada/extraviada, mas reportou nos últimos 3 dias', grave: true },
  fora_do_cd:         { l: 'Fora do CD', d: 'Apareceu na rede de outro CD (pela faixa de IP cadastrada em Agente → Redes)', grave: true },
  hostname_duplicado: { l: 'Hostname duplicado', d: 'Mais de uma máquina ativa com o mesmo nome', grave: true },
  disco_cheio:        { l: 'Disco cheio', d: 'Menos de 15 GB ou 10% livre', grave: true },
  ram_baixa:          { l: 'RAM < 8 GB', d: 'Memória abaixo de 8 GB', grave: false },
  hdd:                { l: 'Disco HDD', d: 'Possui disco mecânico (candidato a troca por SSD)', grave: false },
  sem_contato:        { l: 'Sem contato', d: 'Não reporta há mais de 30 dias', grave: false },
  sem_ativo:          { l: 'Sem patrimônio', d: 'Sem número de patrimônio cadastrado', grave: false },
  garantia_vencendo:  { l: 'Garantia vencendo', d: 'Garantia termina nos próximos 30 dias', grave: false },
  renovacao:          { l: 'Mais de 5 anos', d: 'Comprada há mais de 5 anos — candidata a renovação', grave: false },
  bateria_ruim:       { l: 'Bateria ruim', d: 'Coletor com bateria com defeito ou abaixo de 80% da capacidade original — candidata a troca', grave: true },
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
  if (/android/i.test(n)) return n.replace(/^(Android\s+\d+).*/i, '$1');
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
  if (t.has('Flash')) return t.has('SD') ? 'Interna + cartão SD' : 'Memória interna';
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
  modo: (() => { try { return localStorage.getItem('maq-modo') || 'tabela'; } catch { return 'tabela'; } })(),
  modoOpts: (() => { try { return { agrup: 'status', metrica: 'contato', mosGrupo: '', destaque: '', ...JSON.parse(localStorage.getItem('maq-modo-opts') || '{}') }; } catch { return { agrup: 'status', metrica: 'contato', mosGrupo: '', destaque: '' }; } })(),
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
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conferencias' }, (p) => {
      if (!noCD(p.new)) return;
      state.resumoInvEm = 0;
      if (p.new.agendamento_id) toast(`Novo inventário programado: ${p.new.nome}`);
      if (state.view === 'conferencia' && !state.conf && location.hash === '#conferencia') renderConferencias();
      if (state.view === 'painel') desenharPrazosPainel();
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
  if (state.view === 'conferencia') arg === 'agendados' ? renderAgendados() : arg ? abrirConferencia(arg) : renderConferencias();
  if (state.view === 'agente') renderAgente(arg || 'instalacao');
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

// ---- composição do parque: uma dimensão por vez, barra empilhada 100% + legenda clicável
const PALETA = ['#1c9ba9', '#ff8221', '#3a5fd0', '#8e5bd6', '#16a36a', '#e0a10b', '#d6342a', '#64748b', '#0f6f7a', '#c2410c'];
const DIST = {
  so:       { l: 'Sistema', fn: soGrupo, f: 'so', cor: (k) => (/Windows 11|Server/.test(k) ? '#16a36a' : /Windows (10|8|7)/.test(k) ? '#d6342a' : '#94a3b8') },
  ram:      { l: 'Memória', fn: ramFaixa, f: 'ram', ordem: ['4 GB ou menos', '8 GB', '16 GB', '32 GB ou mais', 'Sem dado'], cor: (k) => ({ '4 GB ou menos': '#d6342a', '8 GB': '#e0a10b', '16 GB': '#16a36a', '32 GB ou mais': '#0f8a5f' }[k] || '#94a3b8') },
  disco:    { l: 'Armazenamento', fn: tipoDisco, f: 'disco', cor: (k) => ({ SSD: '#16a36a', HDD: '#d6342a', 'SSD + HDD': '#e0a10b' }[k] || '#94a3b8') },
  contato:  { l: 'Último contato', fn: (m) => SIT[situacao(m)], f: 'situacao', ordem: Object.values(SIT), cor: (k) => ({ 'Online agora': '#16a36a', 'Até 7 dias': '#3a5fd0', '7 a 30 dias': '#e0a10b', 'Mais de 30 dias': '#d6342a' }[k] || '#94a3b8') },
  idade:    { l: 'Idade', fn: idadeFaixa, f: 'idade', ordem: ['0 a 2 anos', '3 a 4 anos', '5 anos ou mais', 'Sem data de compra'], cor: (k) => ({ '0 a 2 anos': '#16a36a', '3 a 4 anos': '#e0a10b', '5 anos ou mais': '#d6342a' }[k] || '#94a3b8') },
  garantia: { l: 'Garantia', fn: garantiaFaixa, f: 'garantia', ordem: ['Vigente', 'Vence em 90 dias', 'Vence em 30 dias', 'Vencida', 'Sem informação'], cor: (k) => ({ Vigente: '#16a36a', 'Vence em 90 dias': '#3a5fd0', 'Vence em 30 dias': '#e0a10b', Vencida: '#d6342a' }[k] || '#94a3b8') },
  setor:    { l: 'Setores', fn: (m) => m.setor || 'Sem setor', f: 'setor' },
  status:   { l: 'Status', fn: (m) => STATUS[m.status], f: 'status' },
};
function composicao(lista, chave) {
  const d = DIST[chave];
  let pares = contar(lista, d.fn);
  if (d.ordem) pares.sort((a, b) => d.ordem.indexOf(a[0]) - d.ordem.indexOf(b[0]));
  const total = pares.reduce((s, p) => s + p[1], 0) || 1;
  const cor = (k, i) => (d.cor ? d.cor(k) : PALETA[i % PALETA.length]);
  return `<div class="pilha-barra">${pares.map(([k, n], i) => `<span style="width:${(100 * n) / total}%;background:${cor(k, i)}" title="${esc(k)}: ${n}"></span>`).join('')}</div>
    <div class="legenda">${pares.map(([k, n], i) => `<button class="leg" data-f="${d.f}" data-v="${esc(k)}"><i style="background:${cor(k, i)}"></i><span>${esc(k)}</span><b>${n}</b><small>${Math.round((100 * n) / total)}%</small></button>`).join('')}</div>`;
}
function irFiltroDist(f, v) {
  if (f === 'situacao') v = Object.keys(SIT).find((k) => SIT[k] === v);
  if (f === 'status') v = Object.keys(STATUS).find((k) => STATUS[k] === v);
  if (f === 'setor' && v === 'Sem setor') v = '_vazio';
  irMaquinas({ [f]: v });
}

// ---- saúde: % das máquinas ativas sem nenhum alerta importante
function saudeDe(lista) {
  if (!lista.length) return null;
  const ok = lista.filter((m) => !(m.alertas || []).some((a) => ALERTAS[a]?.grave)).length;
  return Math.round((100 * ok) / lista.length);
}
function anelSaude(p, tam = 120) {
  const r = 44, c = 2 * Math.PI * r;
  const cor = p == null ? '#94a3b8' : p >= 90 ? '#16a36a' : p >= 70 ? '#e0a10b' : '#d6342a';
  return `<span class="anel-saude" style="--tam:${tam}px;--cor:${cor}"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" class="as-fundo"/><circle cx="50" cy="50" r="${r}" class="as-arco" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - (p || 0) / 100)).toFixed(1)}"/></svg><b>${p == null ? '—' : p + '%'}</b></span>`;
}

// ---- inventários abertos + agendamentos (para painel e prazos)
async function carregarResumoInv() {
  try { await sb.rpc('gerar_inventarios_agendados'); } catch { /* sem o 05 ainda */ }
  const [c, a] = await Promise.all([
    sb.from('conferencias').select('*, conferencia_itens(maquina_id, lido_em)').eq('status', 'aberta').order('prazo_em', { ascending: true, nullsFirst: false }),
    sb.from('agendamentos').select('*').eq('ativo', true).order('proxima_execucao'),
  ]);
  state.resumoInv = { abertas: c.data || [], agendamentos: a.error ? null : a.data || [] };
  return state.resumoInv;
}
function infoProgresso(c) {
  const itens = c.conferencia_itens || [];
  const r = resumoConf(c, itens);
  const prim = itens.map((i) => i.lido_em).filter(Boolean).sort()[0];
  return { encontradas: r.encontradas, esperadas: r.esperadas, primeiraLeitura: prim, pct: r.pct };
}

function renderPainel() {
  const el = $('#view-painel');
  const L = ativas();
  const by = (fn) => L.filter(fn).length;
  const saude = saudeDe(L);
  const online = by((m) => situacao(m) === 'online');
  const graves = by((m) => (m.alertas || []).some((a) => ALERTAS[a]?.grave));
  const semContato = by((m) => situacao(m) === 'offline');
  const escopo = state.cdAtual ? `${cdCod(state.cdAtual)} · ${cdNome(state.cdAtual)}` : state.cds.length > 1 ? `Todos os CDs (${state.cds.length})` : '';
  state.distAba ||= store.get('dist-aba') || 'so';

  if (!state.maquinas.length || !L.length) {
    el.innerHTML = `<div class="view-head"><div><h1>Painel</h1><p>${esc(escopo)}</p></div></div>
      <div class="card card-pad empty"><h2>Nenhuma máquina ${L.length ? '' : 'neste CD '}ainda</h2>
      <p>Envie o link de registro para os colaboradores, use o Invent_local na pasta de rede ou cadastre manualmente.</p>
      <div class="actions" style="justify-content:center"><a class="btn btn--primary" href="#agente">Como coletar</a></div></div>`;
    return;
  }

  // problemas ordenados por gravidade e quantidade
  const problemas = Object.entries(ALERTAS).map(([k, a]) => ({ k, ...a, n: by((m) => (m.alertas || []).includes(k)) }))
    .filter((p) => p.n > 0).sort((a, b) => (b.grave - a.grave) || (b.n - a.n));
  const ICONE = { hw_reduzido: '🧩', emprestimo_atrasado: '⏰', so_sem_suporte: '🪟', estoque_online: '📦', hostname_duplicado: '👯', disco_cheio: '💾', ram_baixa: '🧠', hdd: '🐌', sem_contato: '📡', sem_ativo: '🏷️', garantia_vencendo: '🛡️', renovacao: '♻️' };

  el.innerHTML = `
    <div class="view-head">
      <div><h1>Painel</h1><p>${escopo ? esc(escopo) + ' · ' : ''}atualizado ao vivo</p></div>
      <div class="actions"><button class="btn" data-go="maquinas">Ver máquinas →</button></div>
    </div>

    <div class="hero">
      <div class="card hero-saude">
        ${anelSaude(saude)}
        <div class="hs-txt">
          <span class="hs-titulo">Saúde do parque</span>
          <strong>${L.length - graves} de ${L.length} máquinas sem problemas importantes</strong>
          <p class="muted">${saude >= 90 ? 'Tudo sob controle. 👌' : saude >= 70 ? 'Alguns pontos pedem atenção.' : 'Muitos problemas importantes — veja a lista ao lado.'}</p>
        </div>
      </div>
      <div class="hero-kpis">
        <button class="card kpi2" data-filtros='{}'><span class="k-rot">Máquinas</span><b>${L.length}</b>
          <span class="k-sub">${by((m) => m.tipo === 'desktop')} desktops · ${by((m) => m.tipo === 'notebook')} notebooks${by((m) => m.tipo === 'coletor') ? ` · ${by((m) => m.tipo === 'coletor')} coletores` : ''}</span></button>
        <button class="card kpi2" data-filtros='{"situacao":"online"}'><span class="k-rot"><span class="dot dot--online"></span> Online agora</span><b class="t-ok">${online}</b>
          <span class="mini-barra"><i style="width:${Math.round((100 * online) / L.length)}%;background:var(--ok)"></i></span><span class="k-sub">${Math.round((100 * online) / L.length)}% do parque</span></button>
        <button class="card kpi2" data-filtros='{"alerta":"_grave"}'><span class="k-rot">Precisam de atenção</span><b class="${graves ? 't-bad' : ''}">${graves}</b>
          <span class="k-sub">${semContato ? `${semContato} sem contato há +30 dias` : 'nenhuma sem contato prolongado'}</span></button>
        <button class="card kpi2" data-go-inv><span class="k-rot">Inventários abertos</span><b id="kpi-inv">…</b><span class="k-sub" id="kpi-inv-sub">carregando…</span></button>
      </div>
    </div>

    <div class="grid-painel">
      <div class="card card-pad">
        <div class="card-head"><h2>O que resolver agora</h2>${problemas.length ? `<span class="muted" style="font-size:12.5px">${problemas.length} tipo(s) de problema</span>` : ''}</div>
        ${problemas.length ? `<div class="acoes-lista">${problemas.slice(0, 6).map((p) => `
          <button class="acao-item ${p.grave ? 'grave' : ''}" data-alerta="${p.k}">
            <span class="ai-ico">${ICONE[p.k] || '•'}</span>
            <span class="ai-txt"><strong>${esc(p.l)}</strong><small>${esc(p.d)}</small></span>
            <span class="ai-n">${p.n}</span><span class="ai-seta">›</span>
          </button>`).join('')}</div>
          ${problemas.length > 6 ? `<button class="btn btn--ghost btn--sm" id="mais-problemas" style="margin-top:6px">Ver mais ${problemas.length - 6}</button>` : ''}`
        : '<div class="tudo-ok">✅<strong>Nenhum problema encontrado</strong><span class="muted">Todas as máquinas estão saudáveis.</span></div>'}
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>Inventários e prazos</h2><a href="#conferencia" class="muted" style="font-size:12.5px">abrir →</a></div>
        <div id="painel-prazos"><div class="skeleton" style="padding:20px">Carregando…</div></div>
      </div>
    </div>

    <div class="grid-painel">
      <div class="card card-pad">
        <div class="card-head"><h2>Composição do parque</h2></div>
        <div class="seg" id="dist-abas">${Object.entries(DIST).map(([k, d]) => `<button class="${state.distAba === k ? 'on' : ''}" data-dist="${k}">${d.l}</button>`).join('')}</div>
        <div id="dist-corpo">${composicao(L, state.distAba)}</div>
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>Atividade recente</h2></div>
        <div class="feed">${(() => { const hs = state.hist.filter((h) => !state.cdAtual || h.maquinas?.cd_id === state.cdAtual).slice(0, 7); return hs.length ? hs.map(feedItem).join('') : '<p class="muted">Nenhuma alteração registrada.</p>'; })()}</div>
      </div>
    </div>`;

  $$('.kpi2[data-filtros]', el).forEach((b) => (b.onclick = () => irMaquinas(JSON.parse(b.dataset.filtros))));
  $('[data-go-inv]', el).onclick = () => (location.hash = '#conferencia');
  $$('[data-go]', el).forEach((b) => (b.onclick = () => irMaquinas()));
  $$('.acao-item', el).forEach((b) => (b.onclick = () => irMaquinas({ alerta: b.dataset.alerta })));
  $('#mais-problemas')?.addEventListener('click', () => irMaquinas({ alerta: '_grave' }));
  $$('.feed a', el).forEach((a) => (a.onclick = () => abrirMaquina(a.dataset.id)));
  const ligarLegenda = () => $$('#dist-corpo .leg', el).forEach((b) => (b.onclick = () => irFiltroDist(b.dataset.f, b.dataset.v)));
  ligarLegenda();
  $$('[data-dist]', el).forEach((b) => (b.onclick = () => {
    state.distAba = b.dataset.dist; store.set('dist-aba', state.distAba);
    $$('[data-dist]', el).forEach((x) => x.classList.toggle('on', x === b));
    $('#dist-corpo').innerHTML = composicao(ativas(), state.distAba); ligarLegenda();
  }));
  desenharPrazosPainel();
}

async function desenharPrazosPainel() {
  const alvo = $('#painel-prazos');
  if (!alvo) return;
  const r = state.resumoInv && Date.now() - (state.resumoInvEm || 0) < 30_000 ? state.resumoInv : await carregarResumoInv();
  state.resumoInvEm = Date.now();
  if (!$('#painel-prazos')) return;
  const abertas = r.abertas.filter(noCD).sort((a, b) => new Date(a.prazo_em || 8.64e15) - new Date(b.prazo_em || 8.64e15));
  const venc = abertas.filter((c) => c.prazo_em && new Date(c.prazo_em) < new Date()).length;
  $('#kpi-inv').textContent = abertas.length;
  $('#kpi-inv').className = venc ? 't-bad' : '';
  $('#kpi-inv-sub').innerHTML = venc ? `${venc} com prazo vencido` : abertas.some((c) => c.prazo_em) ? `próximo prazo ${etiquetaPrazo(abertas.find((c) => c.prazo_em))}` : 'nenhum com prazo';
  const prox = (r.agendamentos || []).filter((a) => a.proxima_execucao && (!state.cdAtual || !a.cd_id || a.cd_id === state.cdAtual))[0];
  $('#painel-prazos').innerHTML = (abertas.length ? `<div class="prazos-lista">${abertas.slice(0, 5).map((c) => { const p = infoProgresso(c); return `
      <a class="prazo-item" href="#conferencia/${c.id}">
        ${c.prazo_em ? anelPrazo(c, { tam: 52, progresso: p.esperadas ? p.encontradas / p.esperadas : 0 }) : `<span class="sem-prazo">${p.pct}%</span>`}
        <span class="pi-txt"><strong>${esc(c.nome)}</strong><small>${mostrarColCD() ? esc(cdCod(c.cd_id)) + ' · ' : ''}${p.encontradas}/${p.esperadas} conferidas</small></span>
        ${c.prazo_em ? etiquetaPrazo(c) : '<span class="muted" style="font-size:12px">sem prazo</span>'}
      </a>`; }).join('')}</div>`
    : '<div class="tudo-ok">📋<strong>Nenhum inventário aberto</strong><span class="muted">Crie um ou programe inventários recorrentes.</span></div>')
    + (prox ? `<div class="proximo-agend">📅 Próximo programado: <b>${esc(prox.nome)}</b> · ${new Date(prox.proxima_execucao).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} <span class="muted">(em ${fmtDuracao(new Date(prox.proxima_execucao) - Date.now())})</span></div>` : '');
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
        <div><h1>Máquinas</h1><p>Veja em tabela, cartões, quadro ou mosaico. Clique numa máquina para detalhes, edição e histórico.</p></div>
        <div class="actions">
          <button class="btn" id="btn-link">Link de registro</button>
          <button class="btn" id="btn-etq">Etiquetas</button>
          <button class="btn" id="btn-coleta" title="Planilha gerada pelo COLETAR.bat (sem instalação)">Importar coleta</button>
          <button class="btn" id="btn-import">Importar compras</button>
          <button class="btn" id="btn-csv" title="Só as máquinas filtradas na tela">Exportar CSV</button>
          <button class="btn" id="btn-inv" title="Planilha .xlsx com o inventário completo do CD">Baixar inventário</button>
          <button class="btn btn--primary" id="btn-nova">+ Nova máquina</button>
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search"><input id="f-q" type="search" placeholder="Buscar hostname, patrimônio, série, usuário, IP, modelo…" autocomplete="off"></div>
          <select id="f-tipo"></select><select id="f-status"></select><select id="f-situacao"></select>
          <select id="f-so"></select><select id="f-alerta"></select><select id="f-setor"></select><select id="f-garantia"></select>
        </div>
        <div class="barra-modos"><div class="seg seg--modos" id="modos"></div><span id="modo-opts" class="modo-opts"></span><span class="count" id="count"></span></div>
        <div class="chips" id="chips-wrap" style="padding:0 12px 10px;align-items:center"><span id="chips" style="display:contents"></span></div>
        <div class="sel-bar" id="sel-bar" hidden></div>
        <div class="table-wrap"><table><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
        <div id="maq-alt" class="maq-alt" hidden></div>
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
    $('#modos').onclick = (e) => { const b = e.target.closest('[data-modo]'); if (!b) return; state.modo = b.dataset.modo; store.set('maq-modo', state.modo); renderTabela(); };
    $('#modo-opts').onchange = (e) => {
      const map = { 'opt-agrup': 'agrup', 'opt-metrica': 'metrica', 'opt-mosgrupo': 'mosGrupo' };
      if (!map[e.target.id]) return;
      state.modoOpts[map[e.target.id]] = e.target.value; state.modoOpts.destaque = '';
      store.set('maq-modo-opts', JSON.stringify(state.modoOpts)); renderTabela();
    };
    ligarModoAlt();
    $('#btn-etq').onclick = () => irEtiquetas(state.sel.size ? [...state.sel] : filtrar().map((m) => m.id));
    $('#btn-import').onclick = modalImportarCompras;
    $('#btn-coleta').onclick = modalImportarColeta;
    $('#btn-csv').onclick = exportarCSV;
    $('#btn-inv').onclick = modalBaixarInventario;
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
  $('#modos').innerHTML = MODOS.map(([k, i, l]) => `<button class="${state.modo === k ? 'on' : ''}" data-modo="${k}" title="${l}"><span class="seg-ico">${i}</span><span class="seg-txt">${l}</span></button>`).join('');
  $('#modo-opts').innerHTML = opcoesModo();
  const tab = state.modo === 'tabela';
  $('#view-maquinas .table-wrap').hidden = !tab;
  $('#maq-alt').hidden = tab;
  if (!tab) {
    $('#maq-alt').className = 'maq-alt maq-alt--' + state.modo;
    $('#maq-alt').innerHTML = !lista.length ? '<div class="empty">Nenhuma máquina encontrada com esses filtros.</div>'
      : state.modo === 'cartoes' ? renderCartoes(lista) : state.modo === 'quadro' ? renderQuadro(lista) : renderMosaico(lista);
    return;
  }
  $('#tbody').innerHTML = lista.length
    ? lista.map((m) => `<tr data-id="${m.id}" class="${state.flash.has(m.id) ? 'flash' : ''}">${cols.map((c) => `<td class="${c.cls || ''}">${c.c(m)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" class="empty">Nenhuma máquina encontrada com esses filtros.</td></tr>`;
}

// ---- modos de visualização da lista de máquinas
const MODOS = [['tabela', '☰', 'Tabela'], ['cartoes', '▦', 'Cartões'], ['quadro', '▥', 'Quadro'], ['mosaico', '▩', 'Mosaico']];
const AGRUP = {
  status:   { l: 'Status', chave: (m) => m.status, rot: (k) => STATUS[k] || k, ordem: Object.keys(STATUS), editavel: 'status',
              cor: (k) => ({ em_uso: '#16a36a', estoque: '#3a5fd0', manutencao: '#e0a10b', emprestado: '#8e5bd6', descartado: '#94a3b8', extraviado: '#d6342a' }[k]) },
  situacao: { l: 'Contato', chave: (m) => situacao(m), rot: (k) => SIT[k], ordem: Object.keys(SIT),
              cor: (k) => ({ online: '#16a36a', recente: '#3a5fd0', ausente: '#e0a10b', offline: '#d6342a', nunca: '#94a3b8' }[k]) },
  alerta:   { l: 'Problema principal', chave: (m) => (m.alertas || []).find((a) => ALERTAS[a]?.grave) || (m.alertas || [])[0] || '',
              rot: (k) => (k ? ALERTAS[k]?.l || k : 'Sem alertas'), cor: (k) => (!k ? '#16a36a' : ALERTAS[k]?.grave ? '#d6342a' : '#e0a10b') },
  setor:    { l: 'Setor', chave: (m) => m.setor || '', rot: (k) => k || 'Sem setor', editavel: 'setor' },
  so:       { l: 'Sistema', chave: soGrupo, rot: (k) => k, cor: (k) => (/Windows 11/.test(k) ? '#16a36a' : /Windows (10|8|7)/.test(k) ? '#d6342a' : '#94a3b8') },
  tipo:     { l: 'Tipo', chave: (m) => m.tipo, rot: (k) => TIPO[k] || k },
  cd:       { l: 'CD', chave: (m) => m.cd_id, rot: (k) => `${cdCod(k)} · ${cdNome(k)}`, editavel: 'cd_id', soAdmin: true },
};
const METRICA_MOS = {
  contato:  { l: 'Último contato', v: (m) => situacao(m), leg: [['online', 'Online agora', '#16a36a'], ['recente', 'Até 7 dias', '#3a5fd0'], ['ausente', '7 a 30 dias', '#e0a10b'], ['offline', 'Mais de 30 dias', '#d6342a'], ['nunca', 'Nunca reportou', '#94a3b8']] },
  alertas:  { l: 'Alertas', v: (m) => ((m.alertas || []).some((a) => ALERTAS[a]?.grave) ? 'grave' : (m.alertas || []).length ? 'leve' : 'ok'), leg: [['ok', 'Sem alertas', '#16a36a'], ['leve', 'Só alertas leves', '#e0a10b'], ['grave', 'Alerta importante', '#d6342a']] },
  disco:    { l: 'Uso do disco', v: (m) => { if (m.livre_pct == null) return 'nd'; const u = 100 - m.livre_pct; return u > 90 ? 'critico' : u > 75 ? 'alto' : u > 50 ? 'medio' : 'baixo'; },
              leg: [['baixo', 'Até 50%', '#16a36a'], ['medio', '50–75%', '#1c9ba9'], ['alto', '75–90%', '#e0a10b'], ['critico', 'Acima de 90%', '#d6342a'], ['nd', 'Sem dado', '#94a3b8']] },
  ram:      { l: 'Memória', v: ramFaixa, leg: [['4 GB ou menos', '4 GB ou menos', '#d6342a'], ['8 GB', '8 GB', '#e0a10b'], ['16 GB', '16 GB', '#16a36a'], ['32 GB ou mais', '32 GB ou mais', '#0f6f7a'], ['Sem dado', 'Sem dado', '#94a3b8']] },
  so:       { l: 'Sistema', v: (m) => (/Windows 11/.test(soFamilia(m)) ? 'w11' : /Windows (10|8|7)/.test(soFamilia(m)) ? 'w10' : m.so_nome ? 'outro' : 'nd'),
              leg: [['w11', 'Windows 11', '#16a36a'], ['w10', 'Windows 10 ou anterior', '#d6342a'], ['outro', 'Outro', '#3a5fd0'], ['nd', 'Sem dado', '#94a3b8']] },
  idade:    { l: 'Idade', v: idadeFaixa, leg: [['0 a 2 anos', '0 a 2 anos', '#16a36a'], ['3 a 4 anos', '3 a 4 anos', '#e0a10b'], ['5 anos ou mais', '5 anos ou mais', '#d6342a'], ['Sem data de compra', 'Sem data', '#94a3b8']] },
  garantia: { l: 'Garantia', v: garantiaFaixa, leg: [['Vigente', 'Vigente', '#16a36a'], ['Vence em 90 dias', 'Vence em 90 dias', '#3a5fd0'], ['Vence em 30 dias', 'Vence em 30 dias', '#e0a10b'], ['Vencida', 'Vencida', '#d6342a'], ['Sem informação', 'Sem informação', '#94a3b8']] },
};
const icoTipo = (t) => (t === 'notebook' ? '💻' : t === 'coletor' ? '📟' : t === 'servidor' ? '🗄️' : '🖥️');
// resumo da bateria do coletor: "85% · boa · capacidade 92% · 310 ciclos"
const SAUDE_BAT = { boa: 'boa', desconhecida: 'desconhecida', superaquecida: 'superaquecida', defeito: 'com defeito', sobretensao: 'sobretensão', falha: 'com falha', fria: 'fria demais' };
function bateriaTxt(m) {
  const b = m.bateria || {};
  return [b.nivel != null && b.nivel + '%', b.saude && (SAUDE_BAT[b.saude] || b.saude), b.capacidade_pct != null && 'capacidade ' + b.capacidade_pct + '%', b.ciclos != null && b.ciclos + ' ciclos'].filter(Boolean).join(' · ');
}

function opcoesModo() {
  const o = state.modoOpts;
  const gruposVis = Object.entries(AGRUP).filter(([, g]) => !g.soAdmin || (ehAdmin() && state.cds.length > 1));
  if (state.modo === 'quadro') return `<label class="opt-modo">Colunas por <select id="opt-agrup">${opts(gruposVis.map(([k, g]) => [k, g.l]), o.agrup)}</select></label>
    ${AGRUP[o.agrup]?.editavel && (o.agrup !== 'cd' || ehAdmin()) ? '<span class="muted" style="font-size:12.5px">↔ arraste os cartões para mudar</span>' : ''}`;
  if (state.modo === 'mosaico') return `<label class="opt-modo">Cor por <select id="opt-metrica">${opts(Object.entries(METRICA_MOS).map(([k, x]) => [k, x.l]), o.metrica)}</select></label>
    <label class="opt-modo">Agrupar <select id="opt-mosgrupo">${opts([['', 'Sem grupos'], ...gruposVis.filter(([k]) => ['setor', 'tipo', 'cd', 'status'].includes(k)).map(([k, g]) => [k, g.l])], o.mosGrupo)}</select></label>`;
  return '';
}

function cartaoMaq(m, compacto = false) {
  const usado = m.livre_pct != null ? Math.round(100 - m.livre_pct) : null;
  const ag = AGRUP[state.modoOpts.agrup];
  const arrastavel = compacto && ag?.editavel && (state.modoOpts.agrup !== 'cd' || ehAdmin()) && !m.emprestimo_atual;
  return `<div class="mcard ${compacto ? 'mcard--c' : ''} ${state.sel.has(m.id) ? 'sel' : ''} ${state.flash.has(m.id) ? 'flash' : ''}" data-id="${m.id}" ${arrastavel ? 'draggable="true"' : ''} tabindex="0">
    <div class="mc-topo">${compacto ? '' : `<input type="checkbox" class="sel" data-sel="${m.id}" ${state.sel.has(m.id) ? 'checked' : ''} aria-label="Selecionar">`}
      ${dot(m)}<span class="mc-host mono">${esc(m.hostname)}</span>${mostrarColCD() && state.modoOpts.agrup !== 'cd' ? `<span class="pill pill--cd">${esc(cdCod(m.cd_id))}</span>` : ''}<span class="mc-tipo" title="${esc(TIPO[m.tipo])}">${icoTipo(m.tipo)}</span></div>
    <div class="mc-mod">${esc(m.modelo || 'Modelo não informado')}${m.ativo ? ` · <span class="mono">${esc(m.ativo)}</span>` : ''}</div>
    ${compacto ? '' : `<div class="mc-specs">
      <span class="spec-chip"><small>RAM</small><b>${gb(m.memoria_gb)}</b></span>
      <span class="spec-chip"><small>${esc(['Sem dado', 'Não identificado'].includes(tipoDisco(m)) ? 'Disco' : tipoDisco(m))}</small><b>${gb(m.armazenamento_total_gb)}</b>${usado != null ? `<span class="meter meter--b"><i class="${usado > 90 ? 'bad' : usado > 75 ? 'warn' : ''}" style="width:${usado}%"></i></span>` : ''}</span>
      <span class="spec-chip"><small>Sistema</small><b>${esc(soFamilia(m).replace('Windows ', 'Win ') + (m.so_display_version ? ' ' + m.so_display_version : ''))}</b></span>
    </div>`}
    <div class="mc-pe"><span class="muted">${rel(m.ultimo_online)}${m.usuario_logado ? ' · ' + esc(m.usuario_logado.split('\\').pop()) : ''}</span>${compacto ? '' : statusPill(m.status)}</div>
    ${(m.alertas || []).length ? `<div class="mc-al">${tags(m, compacto ? 1 : 3)}</div>` : ''}
  </div>`;
}

function renderCartoes(lista) {
  const lim = state.limiteCartoes || 240;
  return `<div class="mgrid">${lista.slice(0, lim).map((m) => cartaoMaq(m)).join('')}</div>
    ${lista.length > lim ? `<div class="mais-cartoes"><button class="btn" id="mais-cartoes">Mostrar mais ${Math.min(240, lista.length - lim)} de ${lista.length - lim}</button></div>` : ''}`;
}

function renderQuadro(lista) {
  const ag = AGRUP[state.modoOpts.agrup] || AGRUP.status;
  const grupos = new Map();
  for (const m of lista) { const k = ag.chave(m); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(m); }
  let chaves = [...grupos.keys()];
  const editavel = ag.editavel && (state.modoOpts.agrup !== 'cd' || ehAdmin());
  if (editavel) {
    // colunas vazias também viram destino para arrastar
    if (state.modoOpts.agrup === 'status') chaves = Object.keys(STATUS).filter((k) => k !== 'descartado' || grupos.has(k));
    if (state.modoOpts.agrup === 'setor') chaves = [...new Set(['', ...setores(), ...chaves])];
    if (state.modoOpts.agrup === 'cd') chaves = [...new Set([...state.cds.filter((c) => c.ativo).map((c) => c.id), ...chaves])];
  }
  chaves.sort((a, b) => (ag.ordem ? ag.ordem.indexOf(a) - ag.ordem.indexOf(b) : (grupos.get(b)?.length || 0) - (grupos.get(a)?.length || 0)));
  const coresLivres = PALETA;
  return `<div class="quadro" data-agrup="${state.modoOpts.agrup}">${chaves.map((k, i) => {
    const ms = grupos.get(k) || [];
    const cor = (ag.cor && ag.cor(k)) || coresLivres[i % coresLivres.length];
    const bloqueada = editavel && state.modoOpts.agrup === 'status' && k === 'emprestado';
    return `<section class="coluna ${bloqueada ? 'bloq' : ''}" data-col-valor="${esc(k)}" ${editavel && !bloqueada ? 'data-alvo' : ''} style="--cor:${cor}">
      <header><span class="col-ponto"></span><strong>${esc(ag.rot(k))}</strong><span class="col-n">${ms.length}</span></header>
      <div class="col-cartoes">${ms.slice(0, 80).map((m) => cartaoMaq(m, true)).join('')}${ms.length > 80 ? `<div class="muted" style="text-align:center;font-size:12.5px;padding:6px">+ ${ms.length - 80} — use os filtros</div>` : ''}
      ${!ms.length ? `<div class="col-vazia">${editavel && !bloqueada ? 'Solte aqui' : 'Vazio'}</div>` : ''}</div>
    </section>`;
  }).join('')}</div>`;
}

function renderMosaico(lista) {
  const mt = METRICA_MOS[state.modoOpts.metrica] || METRICA_MOS.contato;
  const corDe = Object.fromEntries(mt.leg.map(([k, , c]) => [k, c]));
  const cont = contar(lista, mt.v);
  const destaque = state.modoOpts.destaque;
  const grupoK = state.modoOpts.mosGrupo;
  const ag = grupoK ? AGRUP[grupoK] : null;
  const blocos = new Map();
  for (const m of lista) { const g = ag ? ag.chave(m) : ''; if (!blocos.has(g)) blocos.set(g, []); blocos.get(g).push(m); }
  const ordem = [...blocos.keys()].sort((a, b) => (ag?.ordem ? ag.ordem.indexOf(a) - ag.ordem.indexOf(b) : blocos.get(b).length - blocos.get(a).length));
  const tile = (m) => { const v = mt.v(m); return `<button class="tile ${destaque && destaque !== v ? 'apagado' : ''}" style="background:${corDe[v] || '#94a3b8'}" data-id="${m.id}" data-v="${esc(v)}" aria-label="${esc(m.hostname)}"></button>`; };
  return `<div class="mos-legenda">${mt.leg.filter(([k]) => cont.some(([c]) => c === k)).map(([k, l, c]) => { const n = (cont.find(([x]) => x === k) || [, 0])[1];
      return `<button class="mleg ${destaque === k ? 'on' : ''} ${destaque && destaque !== k ? 'off' : ''}" data-dest="${esc(k)}"><i style="background:${c}"></i>${esc(l)} <b>${n}</b><small>${Math.round((100 * n) / (lista.length || 1))}%</small></button>`; }).join('')}
      ${destaque ? '<button class="btn btn--ghost btn--sm" data-dest="">Mostrar todas</button>' : ''}</div>
    ${ordem.map((g) => `<div class="mos-bloco">${ag ? `<h4>${esc(ag.rot(g))} <span class="muted">${blocos.get(g).length}</span></h4>` : ''}<div class="mosaico">${blocos.get(g).map(tile).join('')}</div></div>`).join('')}
    <div class="mos-dica" id="mos-dica" hidden></div>`;
}

function ligarModoAlt() {
  const alt = $('#maq-alt');
  alt.onclick = (e) => {
    const cb = e.target.closest('[data-sel]');
    if (cb) { e.stopPropagation(); cb.checked ? state.sel.add(cb.dataset.sel) : state.sel.delete(cb.dataset.sel); cb.closest('.mcard')?.classList.toggle('sel', cb.checked); return renderSelBar(); }
    const leg = e.target.closest('[data-dest]');
    if (leg) { state.modoOpts.destaque = state.modoOpts.destaque === leg.dataset.dest ? '' : leg.dataset.dest; return renderTabela(); }
    if (e.target.id === 'mais-cartoes') { state.limiteCartoes = (state.limiteCartoes || 240) + 240; return renderTabela(); }
    const c = e.target.closest('[data-id]'); if (c) abrirMaquina(c.dataset.id);
  };
  alt.onkeydown = (e) => { if (e.key === 'Enter' && e.target.dataset?.id) abrirMaquina(e.target.dataset.id); };
  // dica flutuante do mosaico
  alt.onmouseover = (e) => {
    const t = e.target.closest('.tile'); const d = $('#mos-dica');
    if (!t || !d) { if (d) d.hidden = true; return; }
    const m = state.maquinas.find((x) => x.id === t.dataset.id); if (!m) return;
    const mt = METRICA_MOS[state.modoOpts.metrica];
    const rot = mt.leg.find(([k]) => k === t.dataset.v)?.[1] || t.dataset.v;
    d.innerHTML = `<strong class="mono">${esc(m.hostname)}</strong><span>${esc(m.ativo || 'sem patrimônio')} · ${esc(TIPO[m.tipo])} ${esc(m.modelo || '')}</span><span>${esc(mt.l)}: <b>${esc(rot)}</b></span><span class="muted">${esc(m.setor || 'sem setor')} · ${rel(m.ultimo_online)}</span>`;
    const r = t.getBoundingClientRect(), base = alt.getBoundingClientRect();
    d.style.left = Math.min(r.left - base.left, base.width - 240) + 'px'; d.style.top = (r.bottom - base.top + 8) + 'px'; d.hidden = false;
  };
  alt.onmouseleave = () => { const d = $('#mos-dica'); if (d) d.hidden = true; };
  // arrastar e soltar no quadro
  alt.ondragstart = (e) => { const c = e.target.closest('.mcard[draggable]'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastando'); };
  alt.ondragend = (e) => { e.target.closest?.('.mcard')?.classList.remove('arrastando'); $$('.coluna.sobre', alt).forEach((x) => x.classList.remove('sobre')); };
  alt.ondragover = (e) => { const col = e.target.closest('.coluna[data-alvo]'); if (!col) return; e.preventDefault(); $$('.coluna.sobre', alt).forEach((x) => x !== col && x.classList.remove('sobre')); col.classList.add('sobre'); };
  alt.ondrop = async (e) => {
    const col = e.target.closest('.coluna[data-alvo]'); if (!col) return;
    e.preventDefault(); col.classList.remove('sobre');
    const id = e.dataTransfer.getData('text/plain');
    const m = state.maquinas.find((x) => x.id === id); if (!m) return;
    const ag = AGRUP[state.modoOpts.agrup];
    const campo = ag.editavel; const novo = col.dataset.colValor || null; const antigo = m[campo] ?? null;
    if ((antigo || '') === (novo || '')) return;
    const { error } = await sb.from('maquinas').update({ [campo]: novo }).eq('id', id);
    if (error) return toast(erroMsg(error), true);
    await recarregarMaquina(id); renderTabela();
    toastAcao(`${m.hostname} → ${ag.rot(novo || '')}`, 'Desfazer', async () => {
      const r = await sb.from('maquinas').update({ [campo]: antigo }).eq('id', id);
      if (r.error) return toast(erroMsg(r.error), true);
      await recarregarMaquina(id); renderTabela();
    });
  };
}
function toastAcao(msg, rotulo, fn) {
  const el = document.createElement('div');
  el.className = 'toast toast--acao';
  el.innerHTML = `<span>${esc(msg)}</span><button>${esc(rotulo)}</button>`;
  el.querySelector('button').onclick = () => { el.remove(); fn(); };
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 7000);
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
    'Data de compra', 'Fornecedor', 'Nota fiscal', 'Valor', 'Fim da garantia', 'Situação garantia', 'Emprestado para', 'Devolução prevista', 'Bateria (coletor)'];
  const linhas = ordenar(filtrar()).map((m) => [cdNome(m.cd_id), m.hostname, m.ativo, TIPO[m.tipo], STATUS[m.status], m.fabricante, m.modelo, m.numero_serie,
    m.cpu, m.memoria_gb, m.memoria_slots_total, m.armazenamento_total_gb, m.armazenamento_livre_gb, tipoDisco(m), m.so_nome,
    m.so_display_version, m.so_build, m.so_arquitetura, m.ip, m.mac, m.dominio, m.usuario_logado, m.setor, m.localizacao,
    m.responsavel, dataHora(m.ultimo_online), SIT[situacao(m)], (m.alertas || []).map((a) => ALERTAS[a]?.l || a).join(', '), m.observacoes,
    dataBR(m.data_compra), m.fornecedor, m.nota_fiscal, m.valor_compra != null ? String(m.valor_compra).replace('.', ',') : '', dataBR(m.garantia_fim), garantiaFaixa(m),
    m.emprestimo_atual?.colaborador, m.emprestimo_atual?.previsto_devolucao ? dataHora(m.emprestimo_atual.previsto_devolucao) : '', m.tipo === 'coletor' ? bateriaTxt(m) : '']);
  baixar(`inventario-${new Date().toISOString().slice(0, 10)}.csv`, [cab, ...linhas].map((l) => l.map(csvCel).join(';')).join('\r\n'));
}

/* ---- Baixar inventário (.xlsx no formato do Invent_local)
   Admin: um CD ou todos (uma aba "Todos os CDs" + uma aba por CD). Field: só o próprio CD.
   A planilha pode ser reimportada em Máquinas → Importar coleta (coluna DADOS oculta). */
const COLS_INV = [
  { t: 'CD', w: 10 }, { t: 'HOSTNAME', w: 18 }, { t: 'PATRIMONIO', w: 13 }, { t: 'SETOR', w: 16 }, { t: 'LOCALIZACAO', w: 14 },
  { t: 'RESPONSAVEL', w: 16 }, { t: 'TIPO', w: 10 }, { t: 'STATUS', w: 12 }, { t: 'FABRICANTE', w: 13 }, { t: 'MODELO', w: 22 },
  { t: 'NUMERO DE SERIE', w: 22 }, { t: 'SISTEMA OPERACIONAL', w: 34 }, { t: 'VERSAO', w: 8 }, { t: 'BUILD', w: 12 },
  { t: 'PROCESSADOR', w: 34 }, { t: 'NUCLEOS', w: 9 }, { t: 'RAM (GB)', w: 9 }, { t: 'MODULOS DE RAM', w: 30 },
  { t: 'ARMAZENAMENTO (GB)', w: 12 }, { t: 'LIVRE (GB)', w: 10 }, { t: 'DISCOS', w: 32 }, { t: 'IP', w: 14 }, { t: 'MAC', w: 18 },
  { t: 'DOMINIO', w: 14 }, { t: 'USUARIO', w: 22 }, { t: 'WINDOWS INSTALADO EM', w: 12 }, { t: 'ULTIMO CONTATO', w: 16 },
  { t: 'BATERIA (coletor)', w: 30 }, { t: 'OBSERVACOES', w: 30 }, { t: 'DADOS (nao editar)', w: 10, oculta: true },
];
const numXl = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const numBR = (v) => String(v ?? '').replace('.', ',');
function linhaInventario(m) {
  const mods = (m.memoria_modulos || []).filter(Boolean).map((x) => `${numBR(x.tamanho_gb)} GB ${x.tipo || ''} ${x.velocidade ? x.velocidade + ' MHz' : ''}`.replace(/\s+/g, ' ').trim()).join(' + ');
  const dsk = (m.discos || []).filter(Boolean).map((x) => `${x.tipo || ''} ${x.tamanho_gb != null ? x.tamanho_gb + ' GB' : ''} (${x.modelo || ''})`.replace(/\s+/g, ' ').replace(' ()', '').trim()).join(' / ');
  const chaves = ['hostname', 'tipo', 'ativo', 'fabricante', 'modelo', 'numero_serie', 'cpu', 'cpu_nucleos', 'memoria_gb', 'memoria_slots_total',
    'memoria_modulos', 'armazenamento_total_gb', 'armazenamento_livre_gb', 'discos', 'volumes', 'so_nome', 'so_versao', 'so_build',
    'so_display_version', 'so_arquitetura', 'so_instalado_em', 'ultimo_boot', 'ip', 'mac', 'dominio', 'usuario_logado', 'setor', 'localizacao', 'responsavel', 'bateria'];
  const vazio = (v) => v == null || v === '' || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  const dados = Object.fromEntries(chaves.filter((k) => !vazio(m[k])).map((k) => [k, m[k]]));
  if (m.ultimo_online) dados.coletado_em = m.ultimo_online;
  let json = JSON.stringify(dados);
  if (json.length > 32000) { delete dados.volumes; delete dados.memoria_modulos; json = JSON.stringify(dados); } // limite de uma célula do Excel
  return [cdCod(m.cd_id), m.hostname, m.ativo, m.setor, m.localizacao, m.responsavel, m.tipo, STATUS[m.status] || m.status, m.fabricante, m.modelo,
    m.numero_serie, m.so_nome, m.so_display_version, m.so_build, m.cpu, numXl(m.cpu_nucleos), numXl(m.memoria_gb), mods,
    numXl(m.armazenamento_total_gb), numXl(m.armazenamento_livre_gb), dsk, m.ip, m.mac, m.dominio, m.usuario_logado,
    m.so_instalado_em ? data(m.so_instalado_em) : '', m.ultimo_online ? dataHora(m.ultimo_online) : '', m.tipo === 'coletor' ? bateriaTxt(m) : '', m.observacoes, json.length > 32000 ? '' : json];
}
const ordemInv = (a, b) => cdCod(a.cd_id).localeCompare(cdCod(b.cd_id), 'pt-BR') || String(a.hostname || '').localeCompare(String(b.hostname || ''), 'pt-BR');
function gerarInventarioXlsx(cdId, descartados) {
  const meuCD = ehAdmin() ? null : state.perfil?.cd_id;
  if (!ehAdmin() && !meuCD) throw new Error('seu usuário não está vinculado a nenhum CD');
  const alvo = meuCD || cdId;   // Field: sempre o próprio CD, mesmo que peça outro
  const base = state.maquinas.filter((m) => (descartados || m.status !== 'descartado') && (!alvo || m.cd_id === alvo)).sort(ordemInv);
  const aba = (nome, lista) => ({ nome, colunas: COLS_INV, linhas: lista.map(linhaInventario) });
  const hoje = new Date().toISOString().slice(0, 10);
  if (alvo) {
    const cod = cdCod(alvo);
    return { blob: criarXlsx([aba(`${cod} - ${cdNome(alvo)}`, base)]), nome: `inventario-${cod.replace(/\W+/g, '-')}-${hoje}.xlsx`, total: base.length };
  }
  // uma aba por CD (CDs inativos sem máquinas ficam de fora)
  const porCD = state.cds.slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR'))
    .map((c) => ({ c, lista: base.filter((m) => m.cd_id === c.id) }))
    .filter(({ c, lista }) => lista.length || c.ativo)
    .map(({ c, lista }) => aba(`${c.codigo} - ${c.nome}`, lista));
  return { blob: criarXlsx([aba('Todos os CDs', base), ...porCD]), nome: `inventario-todos-os-CDs-${hoje}.xlsx`, total: base.length };
}
function modalBaixarInventario() {
  const adm = ehAdmin();
  const meu = state.perfil?.cd_id;
  const cdIni = state.cdAtual || cdsAtivos()[0]?.id || state.cds[0]?.id || '';
  const qtd = (cd, desc) => state.maquinas.filter((m) => (desc || m.status !== 'descartado') && (!cd || m.cd_id === cd)).length;
  modal(`
    <div class="modal-head"><h2>Baixar inventário</h2>
      <p class="muted" style="margin:4px 0 0">Planilha do Excel (.xlsx) no mesmo formato do Invent_local, com todas as máquinas ${adm ? 'do CD escolhido' : 'do seu CD'}, sem os filtros da tela.</p></div>
    <form class="modal-body" id="inv-form">
      ${adm ? `
        <label class="check full"><input type="radio" name="escopo" value="cd" ${state.cdAtual || state.cds.length < 2 ? 'checked' : ''}> Inventário de um CD</label>
        <label class="full" id="inv-cd-wrap">CD<select name="cd_id">${opts(state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}${c.ativo ? '' : ' (inativo)'}`]), cdIni)}</select></label>
        ${state.cds.length > 1 ? `<label class="check full"><input type="radio" name="escopo" value="todos" ${state.cdAtual ? '' : 'checked'}> Todos os CDs <span class="muted">(uma aba com tudo + uma aba por CD)</span></label>` : ''}`
      : `<label class="full">CD<input value="${esc(cdCod(meu) + ' · ' + cdNome(meu))}" disabled></label>`}
      <label class="check full"><input type="checkbox" name="descartados"> Incluir máquinas descartadas</label>
      ${state.cacheEm ? `<p class="muted full">Sem internet: a planilha usa a cópia salva em ${dataHora(state.cacheEm)}.</p>` : ''}
      <p class="muted full" id="inv-resumo"></p>
    </form>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="inv-ok">Baixar .xlsx</button></div>`, (dlg) => {
    const f = $('#inv-form', dlg);
    const ler = () => {
      const todos = adm && f.escopo && [...f.querySelectorAll('[name=escopo]')].find((r) => r.checked)?.value === 'todos';
      return { cd: adm ? (todos ? '' : f.cd_id.value) : meu, desc: f.descartados.checked };
    };
    const atualizar = () => {
      const { cd, desc } = ler();
      if (adm) $('#inv-cd-wrap', dlg).hidden = !cd;
      const n = qtd(cd, desc);
      $('#inv-resumo', dlg).textContent = `${n} máquina${n === 1 ? '' : 's'}${cd ? ` no ${cdCod(cd)}` : ` em ${state.cds.length} CDs`}.`;
    };
    f.onchange = atualizar; atualizar();
    $('#inv-ok', dlg).onclick = () => {
      try {
        const { cd, desc } = ler();
        const r = gerarInventarioXlsx(cd, desc);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(r.blob); a.download = r.nome; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        dlg.close(); toast(`Inventário baixado: ${r.total} máquina(s).`);
      } catch (e) { toast('Não foi possível gerar a planilha: ' + (e.message || e), true); }
    };
  });
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
        ${m.origem === 'agente' ? `· via agente ${esc(m.agente_versao || '')}` : m.origem === 'planilha' ? '· via coleta por planilha' : '· cadastro manual'}</div>
      ${(m.alertas || []).length ? `<div>${tags(m, 9)}</div>` : ''}
    </div>
    <div class="drawer-body">
      ${(m.alertas || []).includes('fora_do_cd') && m.rede ? `<div class="banner banner--bad"><div><strong>🌐 Na rede de outro CD</strong>
          <span>O IP ${esc(m.ip || '')} pertence à faixa ${esc(m.rede.cidr)} do <b>${esc(cdCod(m.rede.cd_id))}</b>${m.rede.setor ? ' · ' + esc(m.rede.setor) : ''}, mas a máquina está cadastrada no <b>${esc(cdCod(m.cd_id))}</b>. Foi transferida?</span></div>
          ${ehAdmin() ? `<button class="btn btn--sm btn--primary" id="d-mover-cd">Mover para ${esc(cdCod(m.rede.cd_id))}</button>` : ''}</div>` : ''}
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
        ${m.tipo === 'coletor' ? (() => { const b = m.bateria || {}; const ruim = (m.alertas || []).includes('bateria_ruim');
          return `<div class="big-spec"><div class="l">Bateria</div><div class="v ${ruim ? 't-bad' : ''}">${b.capacidade_pct != null ? b.capacidade_pct + '%' : b.nivel != null ? b.nivel + '%' : '—'}</div>
          <div class="l">${esc(b.capacidade_pct != null ? 'da capacidade original' : b.nivel != null ? 'de carga' : 'sem leitura')}${b.saude ? ' · saúde ' + esc(SAUDE_BAT[b.saude] || b.saude) : ''}${b.ciclos != null ? ' · ' + b.ciclos + ' ciclos' : ''}</div></div>`; })() : ''}
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
  $('#d-mover-cd')?.addEventListener('click', async () => {
    const { error } = await sb.from('maquinas').update({ cd_id: m.rede.cd_id }).eq('id', id);
    if (error) return toast(erroMsg(error), true);
    await sb.rpc('aplicar_redes').then(() => {}, () => {});
    await recarregarMaquina(id); toast(`${m.hostname} movida para ${cdCod(m.rede.cd_id)}`); abrirMaquina(id, true); rerender();
  });
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
/* =====================================================================
   INVENTÁRIOS PROGRAMADOS (agendamentos)
   ===================================================================== */
const ICO_REC = { unica: '📌', diaria: '🔁', semanal: '🗓️', mensal: '📆' };
const REC = { unica: 'Única vez', diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal' };
const abasInventario = (aba) => `<div class="tabs tabs--page"><a class="tab ${aba === 'lista' ? 'active' : ''}" href="#conferencia">Inventários</a><a class="tab ${aba === 'agendados' ? 'active' : ''}" href="#conferencia/agendados">Agendados</a></div>`;

async function renderAgendados() {
  state.conf = null;
  const el = $('#view-conferencia');
  el.innerHTML = `<div class="view-head"><div><h1>Inventários</h1><p>Inventários programados: no horário, cada CD recebe um inventário aberto com prazo para concluir.</p></div>
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
      if (!confirm(`Excluir o agendamento "${a.nome}"? Os inventários já gerados continuam existindo.`)) return;
      const { error: er } = await sb.from('agendamentos').delete().eq('id', a.id);
      if (er) return toast(erroMsg(er), true);
      toast('Agendamento excluído'); renderAgendados();
    }
  };
}

function modalAgendamento(a = null) {
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

async function renderConferencias() {
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
      <div><h1>Inventários</h1><p>Contagem física com leitor ou câmera: bipe as etiquetas e veja na hora o que foi encontrado, o que falta e o que não está cadastrado.${ehAdmin() ? ' Como administrador, você vê os inventários de todos os CDs e pode editar, reabrir e excluir.' : ''}</p></div>
      <div class="actions"><button class="btn" id="btn-app-campo">📱 App do celular</button>${ehAdmin() ? '<a class="btn" href="#relatorios/inventarios">Relatório de inventários</a>' : ''}<button class="btn btn--primary" id="btn-nova-conf">+ Novo inventário</button></div>
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
function modalAppCampo() {
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
   IMPORTAR COLETA POR PLANILHA (kit COLETAR.bat, sem instalação)
   Aceita a planilha do Invent_local novo (inventario-quallit.xlsx) e a antiga
   do "Invent_local" (list_info.csv: HOSTNAME,FABRICANTE,MODELO,SERIAL,ATIVO,SETOR…).
   ===================================================================== */
function maquinaDaColeta(r) {
  const s = up(r.numero_serie), a = up(r.ativo), h = up(r.hostname);
  return (s && state.maquinas.find((m) => up(m.numero_serie) === s))
    || (a && state.maquinas.find((m) => up(m.ativo) === a))
    || state.maquinas.find((m) => up(m.hostname) === h && (!m.numero_serie || !s)) || null;
}
function modalImportarColeta() {
  let lista = [];
  const cds = cdsAtivos();
  modal(`
    <div class="modal-head"><h2>Importar coleta (planilha)</h2>
      <p class="muted" style="margin:4px 0 0">Escolha a planilha do Excel <code>inventario-quallit.xlsx</code> gerada pelo <b>Invent_local</b> (COLETAR.bat, em <i>Agente coletor → Instalação</i>). A planilha antiga <code>list_info.csv</code> e o CSV também são aceitos. As máquinas são reconhecidas pelo nº de série, patrimônio ou hostname: nada é duplicado.</p></div>
    <div class="modal-body">
      <div class="actions"><input type="file" id="ic-arq" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"></div>
      <div class="form-grid" style="margin-top:10px">
        ${ehAdmin() ? `<label>CD das máquinas novas<select id="ic-cd">${opts(cds.map((c) => [c.id, `${c.codigo} · ${c.nome}`]), state.cdAtual || cds[0]?.id)}</select></label>` : ''}
        <label class="full" style="display:flex;gap:8px;align-items:flex-start;font-weight:400"><input type="checkbox" id="ic-sobre" style="width:auto;margin-top:3px">
          <span>Substituir patrimônio, setor, localização e responsável pelos da planilha<br><span class="muted" style="font-size:12.5px">Desmarcado: a planilha só preenche o que estiver vazio no sistema.</span></span></label>
      </div>
      <div id="ic-prev"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="ic-ok" disabled>Importar</button></div>`, (dlg) => {
    const mostrar = (res) => {
      if (res.erro !== undefined) { lista = []; $('#ic-prev').innerHTML = res.erro ? `<p class="erro">${esc(res.erro)}</p>` : ''; $('#ic-ok').disabled = true; return; }
      lista = res.lista;
      const novas = lista.filter((r) => !maquinaDaColeta(r)).length;
      $('#ic-prev').innerHTML = `
        <div class="banner banner--info"><div><strong>${lista.length} computador(es) na planilha: ${novas} novo(s), ${lista.length - novas} já cadastrado(s)</strong>
          <span>${res.repetidas ? `${res.repetidas} linha(s) repetida(s) do mesmo computador: vale a última. ` : ''}${res.completa ? 'Planilha completa (memória, discos, volumes, rede).' : 'Planilha simples: entram só as colunas disponíveis.'}</span></div></div>
        <table class="mini-table"><thead><tr><th></th><th>Hostname</th><th>Patrimônio</th><th>Setor</th><th>Modelo</th><th>RAM</th><th>Sistema</th></tr></thead><tbody>
          ${lista.slice(0, 10).map((r) => `<tr><td>${maquinaDaColeta(r) ? pill('atualiza') : pill('nova', 'ok')}</td><td class="mono">${esc(r.hostname)}</td><td class="mono">${esc(r.ativo || '—')}</td><td>${esc(r.setor || '—')}</td><td>${esc(r.modelo || '—')}</td><td>${r.memoria_gb != null ? esc(r.memoria_gb) + ' GB' : '—'}</td><td>${esc(r.so_nome || '—')}</td></tr>`).join('')}
          ${lista.length > 10 ? `<tr><td colspan="7" class="muted">… e mais ${lista.length - 10}</td></tr>` : ''}</tbody></table>`;
      $('#ic-ok').disabled = !lista.length;
    };
    $('#ic-arq').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { mostrar(coletasDaPlanilha(await lerArquivoPlanilha(f))); } catch (err) { mostrar({ erro: err.message }); }
    };
    $('#ic-ok').onclick = async () => {
      const btn = $('#ic-ok'); btn.disabled = true;
      const tot = { criadas: 0, atualizadas: 0, ignoradas: 0, avisos: [] };
      for (let i = 0; i < lista.length; i += 500) {
        btn.textContent = `Importando ${Math.min(i + 500, lista.length)}/${lista.length}…`;
        const { data: r, error } = await sb.rpc('importar_coletas', { p_linhas: lista.slice(i, i + 500), p_cd: $('#ic-cd')?.value || null, p_sobrescrever: $('#ic-sobre').checked });
        if (error) { btn.textContent = 'Importar'; btn.disabled = false; return toast(/importar_coletas/.test(error.message) ? 'O banco está desatualizado: aplique as migrações (supabase db push --remote) antes de importar.' : erroMsg(error), true); }
        tot.criadas += r.criadas; tot.atualizadas += r.atualizadas; tot.ignoradas += r.ignoradas; tot.avisos.push(...(r.avisos || []));
      }
      await carregarMaquinas(); rerender(); if (state.view === 'maquinas') renderTabela();
      toast(`${tot.criadas} máquina(s) nova(s), ${tot.atualizadas} atualizada(s)${tot.ignoradas ? `, ${tot.ignoradas} ignorada(s)` : ''}`, !!tot.ignoradas);
      if (!tot.avisos.length) return dlg.close();
      $('.modal-body', dlg).innerHTML = `<div class="banner banner--info"><div><strong>Importação concluída com ${tot.avisos.length} aviso(s)</strong><span>${tot.criadas} nova(s), ${tot.atualizadas} atualizada(s), ${tot.ignoradas} ignorada(s).</span></div></div>
        <table class="mini-table"><thead><tr><th>Linha</th><th>Hostname</th><th>Aviso</th></tr></thead><tbody>
        ${tot.avisos.slice(0, 50).map((a) => `<tr><td>${esc(a.linha ?? '')}</td><td class="mono">${esc(a.host || '')}</td><td>${esc(a.msg)}</td></tr>`).join('')}</tbody></table>`;
      $('.modal-foot', dlg).innerHTML = '<button class="btn btn--primary" data-close>Fechar</button>';
      $$('[data-close]', dlg).forEach((b) => (b.onclick = () => dlg.close()));
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
    return toast('Não foi possível obter o token de links. Confira se as migrações do banco foram aplicadas. (' + erroMsg(e) + ')', true);
  }
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
  modal(`
    <div class="modal-head"><h2>Link de registro</h2>
      <p class="muted" style="margin:4px 0 0">Envie para o colaborador abrir <b>no computador</b>. Ele baixa o Invent_local, abre o <b>COLETAR.bat</b> e pronto: os dados vão sozinhos para o inventário.</p></div>
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
      const texto = `Olá! A TI está atualizando o inventário de computadores. Abra este link NO SEU COMPUTADOR, informe o patrimônio e o setor, baixe o Invent_local e dê dois cliques no COLETAR.bat. Leva menos de 1 minuto:\n${url}`;
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
      if (!confirm(`Gerar um novo token de links para ${cdCod(cd)}? Todos os links já enviados deste CD param de funcionar.`)) return;
      try { token = await obterTokenLink(cd, true); atualizar(); toast('Novo token gerado'); } catch (e) { toast(erroMsg(e), true); }
    });
    atualizar();
  });
}

/* =====================================================================
   AGENTE
   ===================================================================== */
const ABAS_COLETA = [['instalacao', 'Como coletar'], ['redes', 'Redes e setores']];
async function renderAgente(aba = 'instalacao') {
  if (!ABAS_COLETA.some(([k]) => k === aba)) aba = 'instalacao';
  const el = $('#view-agente');
  const abas = `<div class="tabs tabs--page">${ABAS_COLETA.map(([k, l]) => `<a class="tab ${aba === k ? 'active' : ''}" href="#agente/${k}">${l}</a>`).join('')}</div>`;
  if (aba === 'redes') return renderRedes(el, abas);
  const L = MQ().filter((m) => m.status !== 'descartado');
  const porPlanilha = L.filter((m) => m.origem === 'planilha').length;
  const antigas = L.filter((m) => m.origem === 'agente').length;   // registradas pelo agente antigo (removido)
  const manuais = L.length - porPlanilha - antigas;
  const desatualizadas = L.filter((m) => !m.ultimo_online || Date.now() - new Date(m.ultimo_online) > 180 * 864e5).length;

  el.innerHTML = `
    <div class="view-head"><div><h1>Coleta</h1>
      <p>Os dados técnicos são lidos pelo <b>Invent_local</b> (computadores) e pelo <b>kit dos coletores</b> (Android pelo cabo USB). Nada é instalado: cada leitura gera uma planilha do Excel que entra no inventário sozinha ou pela importação.</p></div></div>
    ${abas}
    <div class="card card-pad" style="margin-bottom:16px;display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)">
      <div style="flex:1 1 320px"><h2>Mais fácil: envie um link para o colaborador</h2>
        <p class="muted" style="margin:4px 0 0">Ele abre no computador, informa patrimônio e setor, baixa o <b>Invent_local</b> e dá dois cliques no <b>COLETAR.bat</b>. Os dados vão sozinhos para o inventário e a página mostra o computador registrado. Não instala nada e não precisa de administrador.</p></div>
      <button class="btn btn--primary" id="btn-link-agente">Gerar link de registro</button>
    </div>
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="card-head"><h2>Invent_local: vários computadores pela pasta de rede</h2><button class="btn btn--sm btn--primary" id="btn-coleta-agente">Importar planilha</button></div>
      <p class="muted" style="margin-top:0">Executa-se o <b>COLETAR.bat</b>, informa-se patrimônio e setor, e os dados completos (série, RAM e módulos, discos, SO, IP, usuário) vão para a planilha do Excel <code>inventario-quallit.xlsx</code>.</p>
      <ol class="muted" style="font-size:13px;margin:0 0 10px;padding-left:18px">
        <li>Baixe o <b>Invent_local.zip</b> e extraia numa pasta de rede (ex.: <code>&#92;&#92;servidor&#92;TI&#92;Inventario</code>), com permissão de gravação para quem vai coletar.</li>
        <li>Em cada computador: abra a pasta e dê duplo clique em <b>COLETAR.bat</b>. Executar de novo atualiza a mesma linha (não duplica).</li>
        <li>No painel: <b>Máquinas → Importar coleta</b> e escolha o <code>inventario-quallit.xlsx</code>. Pode importar quantas vezes quiser.</li>
      </ol>
      <div class="actions"><button class="btn btn--sm btn--primary" id="btn-kit-zip">Baixar Invent_local.zip</button><a class="btn btn--sm btn--ghost" href="agente/planilha/LEIA-ME.txt" target="_blank" rel="noopener">LEIA-ME</a></div>
      <p class="muted" style="font-size:12.5px;margin-bottom:0">Automático, sem perguntas: use como script de logon da GPO <code>powershell -NoProfile -ExecutionPolicy Bypass -File &#92;&#92;servidor&#92;TI&#92;Inventario&#92;coletar.ps1 -Silencioso</code>. Se a planilha estiver aberta no Excel, os dados ficam salvos na pasta <code>dados</code> e a planilha é refeita na próxima execução.</p>
    </div>
    <div class="grid-2">
      <div class="card card-pad">
        <div class="card-head"><h2>📟 Coletores de dados Android (cabo USB)</h2><button class="btn btn--sm btn--primary" id="btn-coleta-coletores">Importar planilha</button></div>
        <p class="muted" style="margin-top:0">Num computador, o <b>COLETAR-COLETORES.bat</b> lê pelo cabo USB cada coletor conectado: nº de série, modelo, Android e patch, RAM, memória, <b>saúde e capacidade da bateria</b>, IP e MAC. Nada é instalado no coletor. Os dados vão para <code>coletores-quallit.xlsx</code>.</p>
        <ol class="muted" style="font-size:13px;margin:0 0 10px;padding-left:18px">
          <li>Em cada coletor (uma vez): <i>Sobre o telefone</i> → 7 toques em <b>Número da versão</b> → <i>Opções do desenvolvedor</i> → ative <b>Depuração USB</b>.</li>
          <li>Execute o <b>COLETAR-COLETORES.bat</b> no computador, conecte o coletor, toque em <b>Permitir</b> e bipe o patrimônio.</li>
          <li>Importe o <code>coletores-quallit.xlsx</code> em <b>Máquinas → Importar coleta</b>.</li>
        </ol>
        <div class="actions"><button class="btn btn--sm btn--primary" id="btn-kit-coletores">Baixar Coletores_Quallit.zip</button><a class="btn btn--sm btn--ghost" href="agente/coletores/LEIA-ME.txt" target="_blank" rel="noopener">LEIA-ME</a></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:0">Se a empresa usa MDM (SOTI, Zebra StageNow, Intune…), a Depuração USB pode estar bloqueada: peça a liberação ao responsável pelo MDM.</p>
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>Cobertura</h2></div>
        <div class="kpis" style="margin:0">
          <div class="card kpi" style="cursor:default"><div class="kpi-label">Pela coleta</div><div class="kpi-value">${porPlanilha + antigas}</div><div class="kpi-sub">de ${L.length} equipamentos</div></div>
          <div class="card kpi" style="cursor:default"><div class="kpi-label">Cadastro manual</div><div class="kpi-value">${manuais}</div><div class="kpi-sub">sem dados técnicos</div></div>
          <div class="card kpi" style="cursor:default"><div class="kpi-label">Coleta antiga</div><div class="kpi-value ${desatualizadas ? 't-warn' : ''}">${desatualizadas}</div><div class="kpi-sub">sem leitura há 6 meses</div></div>
        </div>
        ${antigas ? `<p class="muted" style="font-size:12.5px;margin:12px 0 0">${antigas} equipamento(s) ainda estão com os dados do agente antigo (removido). Na próxima vez que passarem pelo Invent_local, os dados são atualizados normalmente.</p>` : ''}
      </div>
    </div>`;
  $('#btn-link-agente').onclick = () => modalLinkInstalacao();
  $('#btn-coleta-agente').onclick = modalImportarColeta;
  $('#btn-coleta-coletores').onclick = modalImportarColeta;
  const baixarZip = async (montar, nome) => {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await montar()); a.download = nome; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) { toast('Não foi possível montar o kit: ' + err.message, true); }
  };
  $('#btn-kit-zip').onclick = () => baixarZip(montarKitInventLocal, 'Invent_local.zip');
  $('#btn-kit-coletores').onclick = () => baixarZip(montarKitColetores, 'Coletores_Quallit.zip');
}

/* ---- Redes e setores: faixa de IP → CD/setor ---- */
const ipNum = (ip) => { const p = String(ip || '').split('.').map(Number); return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] : null; };
function cidrOk(c) {
  const m = String(c || '').trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m || ipNum(m[1]) == null || +m[2] < 8 || +m[2] > 32) return null;
  const bits = +m[2], mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const base = (ipNum(m[1]) & mask) >>> 0;
  return { bits, base, mask, txt: `${[24, 16, 8, 0].map((s) => (base >>> s) & 255).join('.')}/${bits}` };
}
const ipNaRede = (ip, c) => { const n = ipNum(ip), r = cidrOk(c); return n != null && r && ((n & r.mask) >>> 0) === r.base; };

async function renderRedes(el, abas) {
  el.innerHTML = `<div class="view-head"><div><h1>Coleta</h1>
      <p>Cadastre as faixas de IP de cada CD e setor. A máquina que aparece numa faixa recebe o setor automaticamente, e o painel avisa quando ela surge na rede de outro CD.</p></div>
      <div class="actions">${ehAdmin() ? '<button class="btn" id="rd-aplicar" title="Reaplica as faixas usando o último IP de cada máquina">Aplicar agora</button><button class="btn btn--primary" id="rd-nova">+ Nova rede</button>' : ''}</div></div>
    ${abas}<div id="rd-corpo"><div class="skeleton">Carregando…</div></div>`;
  const { data: redes, error } = await sb.from('redes').select('*').order('cidr');
  const corpo = $('#rd-corpo');
  if (error) {
    corpo.innerHTML = /redes|does not exist|schema cache/i.test(error.message)
      ? '<div class="card card-pad"><h2>Falta um passo no banco</h2><p class="muted">Aplique as migrações do banco (<code>supabase db push --remote</code>; veja o README) para liberar as redes e setores.</p></div>'
      : `<div class="card card-pad erro">${esc(erroMsg(error))}</div>`;
    return;
  }
  state.redes = redes || [];
  const lista = state.redes.filter((r) => !state.cdAtual || r.cd_id === state.cdAtual);
  const maqs = MQ();
  const naRede = (r) => maqs.filter((m) => m.rede?.id === r.id || (!m.rede && ipNaRede(m.ip, r.cidr)));
  // sugestões: IPs de máquinas sem faixa, agrupados por /24
  const sem = maqs.filter((m) => m.ip && ipNum(m.ip) != null && !state.redes.some((r) => ipNaRede(m.ip, r.cidr)));
  const grupos = {};
  for (const m of sem) { const k = m.ip.split('.').slice(0, 3).join('.') + '.0/24'; (grupos[k] ||= []).push(m); }
  const moda = (arr) => { const c = {}; arr.filter(Boolean).forEach((x) => (c[x] = (c[x] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };
  const sugestoes = Object.entries(grupos).map(([cidr, ms]) => ({ cidr, ms, setor: moda(ms.map((m) => m.setor)), cd: moda(ms.map((m) => m.cd_id)) }))
    .sort((a, b) => b.ms.length - a.ms.length).slice(0, 8);

  corpo.innerHTML = `
    <div class="card"><div class="table-wrap" style="max-height:none"><table class="mini-table tab-redes">
      <thead><tr>${mostrarColCD() ? '<th>CD</th>' : ''}<th>Faixa de IP</th><th>Setor</th><th>Localização</th><th>Automático</th><th class="num">Máquinas</th>${ehAdmin() ? '<th></th>' : ''}</tr></thead>
      <tbody>${lista.length ? lista.map((r) => { const n = naRede(r); const fora = n.filter((m) => m.cd_id !== r.cd_id).length; return `<tr>
        ${mostrarColCD() ? `<td><span class="pill pill--cd">${esc(cdCod(r.cd_id))}</span></td>` : ''}
        <td><code>${esc(r.cidr)}</code>${r.descricao ? `<div class="muted" style="font-size:12px">${esc(r.descricao)}</div>` : ''}</td>
        <td>${esc(r.setor || '—')}</td><td>${esc(r.localizacao || '—')}</td>
        <td>${r.aplicar_setor ? pill('grava setor', 'ok') : pill('só identifica')}</td>
        <td class="num"><a href="#" data-ver-rede="${r.id}">${n.length}</a>${fora ? ` <span class="tag tag--bad" title="Máquinas de outro CD nesta faixa">${fora} de outro CD</span>` : ''}</td>
        ${ehAdmin() ? `<td class="acoes-linha"><button class="btn btn--sm btn--ghost" data-ed-rede="${r.id}">Editar</button><button class="btn btn--sm btn--ghost btn--danger-txt" data-del-rede="${r.id}">Excluir</button></td>` : ''}
      </tr>`; }).join('') : `<tr><td colspan="7" class="vazio-linha">Nenhuma rede cadastrada${state.cdAtual ? ' neste CD' : ''}. ${ehAdmin() ? 'Use as sugestões abaixo ou “+ Nova rede”.' : 'Peça ao administrador para cadastrar.'}</td></tr>`}</tbody>
    </table></div></div>
    ${sugestoes.length ? `<h3 class="sec-rel">Redes encontradas sem cadastro <span class="muted">agrupadas pelo IP que as máquinas informaram</span></h3>
    <div class="rede-sugs">${sugestoes.map((g) => `<div class="card rede-sug">
      <div><code>${esc(g.cidr)}</code><strong>${g.ms.length} máquina(s)</strong>
        <span class="muted">${esc([cdCod(g.cd), g.setor && 'maioria em ' + g.setor].filter(Boolean).join(' · '))}</span></div>
      ${ehAdmin() ? `<button class="btn btn--sm" data-sug="${esc(g.cidr)}" data-sug-cd="${esc(g.cd)}" data-sug-setor="${esc(g.setor)}">Cadastrar</button>` : ''}
    </div>`).join('')}</div>` : ''}
    <p class="muted dica-redes">Dica: a faixa mais específica vence (um /24 do setor tem prioridade sobre o /16 do CD inteiro). Notebooks emprestados não têm o setor alterado. Ao salvar, as faixas são aplicadas na hora com o último IP conhecido; o agente confirma na próxima coleta.</p>`;

  $$('[data-ver-rede]', corpo).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const r = state.redes.find((x) => x.id === a.dataset.verRede); state.f = { ...F_PADRAO, q: r.cidr.split('/')[0].split('.').slice(0, Math.max(1, Math.floor(cidrOk(r.cidr).bits / 8))).join('.') + '.' }; location.hash = '#maquinas'; }));
  $$('[data-ed-rede]', corpo).forEach((b) => (b.onclick = () => modalRede(state.redes.find((r) => r.id === b.dataset.edRede))));
  $$('[data-del-rede]', corpo).forEach((b) => (b.onclick = async () => {
    const r = state.redes.find((x) => x.id === b.dataset.delRede);
    if (!confirm(`Excluir a rede ${r.cidr}? As máquinas mantêm o setor atual.`)) return;
    const { error: er } = await sb.from('redes').delete().eq('id', r.id);
    if (er) return toast(erroMsg(er), true);
    await sb.rpc('aplicar_redes'); await carregarMaquinas(); toast('Rede excluída'); renderAgente('redes');
  }));
  $$('[data-sug]', corpo).forEach((b) => (b.onclick = () => modalRede(null, { cidr: b.dataset.sug, cd_id: b.dataset.sugCd, setor: b.dataset.sugSetor })));
  $('#rd-nova')?.addEventListener('click', () => modalRede());
  $('#rd-aplicar')?.addEventListener('click', async () => {
    const { data: n, error: er } = await sb.rpc('aplicar_redes');
    if (er) return toast(erroMsg(er), true);
    await carregarMaquinas(); toast(n ? `${n} máquina(s) atualizada(s)` : 'Tudo já estava de acordo com as redes'); renderAgente('redes');
  });
}

function modalRede(r = null, pre = {}) {
  const v = { cidr: '', cd_id: state.cdAtual || cdsAtivos()[0]?.id, setor: '', localizacao: '', descricao: '', aplicar_setor: true, ...pre, ...(r || {}) };
  if (!v.cd_id) v.cd_id = state.cdAtual || cdsAtivos()[0]?.id;
  const setores = [...new Set(state.maquinas.map((m) => m.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  modal(`<form id="rd-form">
    <div class="modal-head"><h2>${r ? 'Editar rede' : 'Nova rede'}</h2><p class="muted" style="margin:4px 0 0">Ex.: <code>10.12.5.0/24</code> para um setor ou <code>10.12.0.0/16</code> para o CD inteiro.</p></div>
    <div class="modal-body"><div class="form-grid">
      <label>Faixa de IP (CIDR) *<input name="cidr" class="mono" required value="${esc(v.cidr)}" placeholder="10.12.5.0/24" autocomplete="off"></label>
      <label>CD *<select name="cd_id" required>${opts(cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`]), v.cd_id)}</select></label>
      <label>Setor<input name="setor" list="dl-rd-set" value="${esc(v.setor || '')}" placeholder="Vazio = só identifica o CD"></label>
      <label>Localização<input name="localizacao" value="${esc(v.localizacao || '')}" placeholder="Ex.: Doca 2"></label>
      <label class="full">Descrição<input name="descricao" value="${esc(v.descricao || '')}" placeholder="Ex.: Wi-Fi da expedição, VLAN 20"></label>
      <label class="check full"><input type="checkbox" name="aplicar_setor" ${v.aplicar_setor ? 'checked' : ''}> Gravar setor e localização automaticamente nas máquinas desta rede</label>
      <datalist id="dl-rd-set">${setores.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
    </div>
    <div class="ag-previa" id="rd-previa"></div><p class="erro" id="rd-erro"></p></div>
    <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="rd-salvar">Salvar</button></div>
  </form>`, (dlg) => {
    const f = $('#rd-form');
    const previa = () => {
      const c = cidrOk(f.cidr.value);
      if (!c) { $('#rd-previa').innerHTML = '<span class="muted">Digite a faixa no formato <code>IP/prefixo</code>.</span>'; return; }
      const ms = MQ().filter((m) => ipNaRede(m.ip, c.txt));
      const total = 2 ** (32 - c.bits);
      $('#rd-previa').innerHTML = `<strong>${esc(c.txt)}</strong> · ${total.toLocaleString('pt-BR')} endereços<br><span class="muted">${ms.length ? `${ms.length} máquina(s) do inventário estão nesta faixa agora${f.aplicar_setor.checked && f.setor.value.trim() ? ` e passam para o setor <b>${esc(f.setor.value.trim())}</b>` : ''}.` : 'Nenhuma máquina do inventário está nesta faixa agora.'}</span>`;
    };
    f.oninput = previa; previa();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const c = cidrOk(f.cidr.value);
      if (!c) { $('#rd-erro').textContent = 'Faixa inválida. Use o formato 10.12.5.0/24 (prefixo entre 8 e 32).'; return; }
      const row = { cidr: c.txt, cd_id: f.cd_id.value, setor: f.setor.value.trim() || null, localizacao: f.localizacao.value.trim() || null, descricao: f.descricao.value.trim() || null, aplicar_setor: f.aplicar_setor.checked };
      $('#rd-salvar').disabled = true;
      const { error } = r ? await sb.from('redes').update(row).eq('id', r.id) : await sb.from('redes').insert(row);
      $('#rd-salvar').disabled = false;
      if (error) { $('#rd-erro').textContent = /redes_cidr_uk|duplicate/i.test(error.message) ? 'Essa faixa já está cadastrada.' : erroMsg(error); return; }
      const { data: n } = await sb.rpc('aplicar_redes');
      dlg.close(); await carregarMaquinas();
      toast(`Rede salva${n ? ` · ${n} máquina(s) atualizada(s)` : ''}`);
      renderAgente('redes');
    };
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
  { k: 'colet', l: 'Coletores', f: (m) => m.tipo === 'coletor', ir: { tipo: 'coletor' } },
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
  { k: 'bat', l: 'Bateria ruim', a: 'bateria_ruim', ruim: true },
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
  $('#rel-acoes').innerHTML = `<button class="btn" id="rp-csv">Exportar CSV</button><button class="btn" id="rp-inv">Baixar inventário (.xlsx)</button><button class="btn btn--primary" id="rp-imprimir">Relatório geral (PDF)</button>`;
  $('#rp-inv').onclick = modalBaixarInventario;
  const PROBLEMAS = METRICAS.filter((m) => m.a);
  const desenhar = () => {
    const { linhas, total, base } = dadosParque(f.tipo);
    const pct = (n, t) => (t ? Math.round((100 * n) / t) : 0);
    const saudeGeral = saudeDe(base);
    const graves = base.filter((m) => (m.alertas || []).some((a) => ALERTAS[a]?.grave)).length;
    const cartaoCD = (r) => {
      const t = r.v.total;
      const probs = PROBLEMAS.map((mt) => ({ mt, n: r.v[mt.k] })).filter((x) => x.n > 0)
        .sort((a, b) => (!!b.mt.ruim - !!a.mt.ruim) || b.n - a.n).slice(0, 5);
      const maxN = Math.max(1, ...probs.map((x) => x.n));
      return `<div class="card cd-saude">
        <div class="cs-topo">${anelSaude(saudeDe(r.ms), 78)}
          <div><span class="pill pill--cd">${esc(r.cd.codigo)}</span><h3>${esc(r.cd.nome || '')}</h3>
            <span class="muted">${t} máquina(s) · ${r.v.desk} desk · ${r.v.note} note</span></div></div>
        <div class="cs-online"><span>Online nas últimas 24h</span><span class="mini-barra"><i style="width:${pct(r.v.online, t)}%;background:var(--ok)"></i></span><b>${pct(r.v.online, t)}%</b></div>
        <div class="cs-probs">${probs.length ? probs.map(({ mt, n }) => `
          <button class="cs-prob ${mt.ruim ? 'ruim' : ''}" data-cd="${r.cd.id || ''}" data-m="${mt.k}">
            <span>${esc(mt.l)}</span><span class="mini-barra" title="${pct(n, t)}% do CD"><i style="width:${Math.max(8, Math.round((100 * n) / maxN))}%"></i></span><b>${n}</b></button>`).join('')
          : '<div class="cs-ok">✅ Nenhum problema encontrado</div>'}</div>
        <div class="cs-pe"><button class="btn btn--sm" data-ver="${r.cd.id || ''}">Ver máquinas</button>${r.cd.id ? `<button class="btn btn--sm btn--ghost" data-relcd="${r.cd.id}">Relatório PDF</button>` : ''}</div>
      </div>`;
    };
    // matriz: só os problemas que aparecem em algum CD
    const linhasMatriz = PROBLEMAS.filter((mt) => linhas.some((r) => r.v[mt.k] > 0));
    const celula = (r, mt) => {
      const n = r.v[mt.k], p = pct(n, r.v.total);
      const cor = mt.ruim ? '214,52,42' : '224,161,11';
      return `<td class="hm ${n ? '' : 'zero'}" style="--a:${n ? Math.max(0.12, Math.min(0.85, p / 60)) : 0};--rgb:${cor}">${n ? `<a data-cd="${r.cd.id || ''}" data-m="${mt.k}"><b>${n}</b><small>${p}%</small></a>` : '–'}</td>`;
    };
    $('#rel-corpo').innerHTML = `
      <div class="rel-filtro"><div class="seg" id="rp-tipo">${[['', 'Todos'], ['desktop', 'Desktops'], ['notebook', 'Notebooks'], ['coletor', 'Coletores']].map(([k, l]) => `<button class="${f.tipo === k ? 'on' : ''}" data-tipo="${k}">${l}</button>`).join('')}</div>
        <span class="muted" style="font-size:13px">${linhas.length} CD(s) · máquinas descartadas não entram</span></div>
      <div class="rel-resumo">
        <div class="card rr-saude">${anelSaude(saudeGeral, 92)}<div><span class="hs-titulo">Saúde geral</span><strong>${base.length - graves} de ${base.length}</strong><span class="muted">máquinas sem problemas importantes</span></div></div>
        <div class="card rr-kpi"><span class="k-rot">Máquinas</span><b>${total.v.total}</b><span class="k-sub">${total.v.desk} desktops · ${total.v.note} notebooks${total.v.colet ? ` · ${total.v.colet} coletores` : ''}</span></div>
        <div class="card rr-kpi"><span class="k-rot">Online 24h</span><b class="t-ok">${pct(total.v.online, total.v.total)}%</b><span class="k-sub">${total.v.online} máquina(s)</span></div>
        <div class="card rr-kpi"><span class="k-rot">Problemas importantes</span><b class="${graves ? 't-bad' : ''}">${graves}</b><span class="k-sub">máquinas afetadas</span></div>
      </div>
      <h3 class="sec-rel">Saúde por CD</h3>
      <div class="cds-grid">${linhas.map(cartaoCD).join('')}</div>
      ${linhas.length > 1 && linhasMatriz.length ? `
      <h3 class="sec-rel">Comparativo entre CDs <span class="muted">quanto mais forte a cor, maior a proporção do CD com o problema</span></h3>
      <div class="card"><div class="table-wrap" style="max-height:none"><table class="heatmap">
        <thead><tr><th>Problema</th>${linhas.map((r) => `<th class="num" title="${esc(r.cd.nome)}">${esc(r.cd.codigo)}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>
          <tr class="hm-online"><td>Online 24h</td>${linhas.map((r) => `<td class="hm" style="--a:${Math.max(0.1, pct(r.v.online, r.v.total) / 120)};--rgb:22,163,106"><b>${pct(r.v.online, r.v.total)}%</b></td>`).join('')}<td class="num"><b>${pct(total.v.online, total.v.total)}%</b></td></tr>
          ${linhasMatriz.map((mt) => `<tr><td>${mt.ruim ? '<span class="dot dot--offline"></span> ' : ''}${esc(mt.l)}</td>${linhas.map((r) => celula(r, mt)).join('')}<td class="num"><b>${total.v[mt.k]}</b></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}
      <details class="card tabela-completa"><summary>Ver todos os números (tabela completa)</summary>
        <div class="table-wrap" style="max-height:none"><table class="rel-tab">
          <thead><tr><th>CD</th>${METRICAS.map((mt) => `<th class="num">${mt.l}</th>`).join('')}</tr></thead>
          <tbody>${linhas.map((r) => `<tr><td><span class="pill pill--cd">${esc(r.cd.codigo)}</span> ${esc(r.cd.nome)}</td>${METRICAS.map((mt) => `<td class="num ${mt.ruim && r.v[mt.k] ? 'cel-ruim' : ''}">${r.v[mt.k]}</td>`).join('')}</tr>`).join('')}
          ${linhas.length > 1 ? `<tr class="row-total"><td>Total</td>${METRICAS.map((mt) => `<td class="num">${total.v[mt.k]}</td>`).join('')}</tr>` : ''}</tbody></table></div>
      </details>`;
    $$('#rp-tipo [data-tipo]').forEach((b) => (b.onclick = () => { f.tipo = b.dataset.tipo; desenhar(); }));
    $$('#rel-corpo [data-relcd]').forEach((b) => (b.onclick = () => relatorioCD(b.dataset.relcd)));
    const irCD = (cd) => { if (ehAdmin() && cd) { state.cdAtual = cd; store.set('cd-atual', cd); renderSidebar(); } };
    $$('#rel-corpo [data-ver]').forEach((b) => (b.onclick = () => { irCD(b.dataset.ver); irMaquinas(f.tipo ? { tipo: f.tipo } : {}); }));
    $$('#rel-corpo [data-m]').forEach((a) => (a.onclick = () => {
      const mt = METRICAS.find((x) => x.k === a.dataset.m);
      irCD(a.dataset.cd);
      irMaquinas({ ...(mt.ir || {}), ...(mt.a ? { alerta: mt.a } : {}), ...(f.tipo ? { tipo: f.tipo } : {}) });
    }));
  };
  $('#rp-csv').onclick = () => {
    const { linhas, total } = dadosParque(f.tipo);
    const rows = [['Código', 'CD', 'Saúde %', ...METRICAS.map((m) => m.l)], ...linhas.map((r) => [r.cd.codigo, r.cd.nome, saudeDe(r.ms) ?? '', ...METRICAS.map((m) => r.v[m.k])]), ['Total', '', saudeDe(total.ms) ?? '', ...METRICAS.map((m) => total.v[m.k])]];
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
      <thead><tr><th>Inventário</th>${ehAdmin() ? '<th>CD</th>' : ''}<th>Setor</th><th>Status</th><th>Responsável</th><th>Início</th><th>Finalizado</th><th>Prazo</th>
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
      <div class="card kpi ${t.des ? 'kpi--warn' : ''}" style="cursor:default"><div class="kpi-label">Não cadastradas</div><div class="kpi-value">${t.des}</div><div class="kpi-sub">códigos desconhecidos</div></div>
      ${(() => { const comPrazo = l.filter((c) => c.prazo_em); if (!comPrazo.length) return '';
        const fin = comPrazo.filter((c) => c.status === 'finalizada'); const noPrazo = fin.filter((c) => new Date(c.finalizado_em) <= new Date(c.prazo_em)).length;
        const venc = comPrazo.filter((c) => c.status === 'aberta' && new Date(c.prazo_em) < new Date()).length;
        return `<div class="card kpi ${venc ? 'kpi--bad' : 'kpi--ok'}" style="cursor:default"><div class="kpi-label">Pontualidade</div><div class="kpi-value">${fin.length ? Math.round((100 * noPrazo) / fin.length) + '%' : '—'}</div><div class="kpi-sub">${noPrazo}/${fin.length} no prazo${venc ? ` · ${venc} vencido(s) em aberto` : ''}</div></div>`; })()}`;
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
      <td>${c.prazo_em ? etiquetaPrazo(c) : '<span class="muted">—</span>'}</td>
      <td class="num">${c.r.esperadas}</td><td class="num">${c.r.encontradas}</td><td class="num ${c.r.faltando ? 'cel-ruim' : ''}">${c.r.faltando}</td><td class="num">${c.r.desconhecidas}</td><td class="num">${c.r.fora}</td>
      <td>${barraAc(c.r.pct)}</td>
      <td class="acoes"><button class="btn btn--sm btn--ghost" data-ac="abrir">Abrir</button>${ehAdmin() ? '<button class="btn btn--sm btn--ghost" data-ac="editar">Editar</button><button class="btn btn--sm btn--ghost btn--txt-bad" data-ac="excluir">Excluir</button>' : ''}</td></tr>`).join('')
      + (l.length > 1 ? `<tr class="row-total"><td colspan="${ehAdmin() ? 8 : 7}">Total (${l.length})</td><td class="num">${t.esp}</td><td class="num">${t.enc}</td><td class="num">${t.fal}</td><td class="num">${t.des}</td><td class="num">${t.fora}</td><td>${barraAc(acur)}</td><td></td></tr>` : '')
      : `<tr><td colspan="15" class="empty">Nenhum inventário com esses filtros.</td></tr>`;
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
  const sub = `${state.cdAtual ? esc(cdCod(state.cdAtual) + ' · ' + cdNome(state.cdAtual)) : `${linhas.length} CD(s)`} · ${tipo ? { desktop: 'só desktops', notebook: 'só notebooks', coletor: 'só coletores' }[tipo] || TIPO[tipo] : 'todos os equipamentos'} · ${data(new Date().toISOString())}`;
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
      <p class="muted">Verifique se as migrações do banco foram aplicadas (<code>supabase db push --remote</code>; veja o README).</p></div>`;
    return;
  }
  iniciarRealtime();
  window.addEventListener('hashchange', navegar);
  navegar();
  registrarSW();
  iniciarRelogios();
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
