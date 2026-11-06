import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, URL_PUBLICA } from './config.js';

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
  so_sem_suporte:     { l: 'Windows sem suporte', d: 'Windows 10 ou anterior — fim do suporte Microsoft em 14/10/2025', grave: true },
  estoque_online:     { l: 'Estoque ligada', d: 'Marcada como estoque/descartada/extraviada, mas reportou nos últimos 3 dias', grave: true },
  hostname_duplicado: { l: 'Hostname duplicado', d: 'Mais de uma máquina ativa com o mesmo nome', grave: true },
  disco_cheio:        { l: 'Disco cheio', d: 'Menos de 15 GB ou 10% livre', grave: true },
  ram_baixa:          { l: 'RAM < 8 GB', d: 'Memória abaixo de 8 GB', grave: false },
  hdd:                { l: 'Disco HDD', d: 'Possui disco mecânico (candidato a troca por SSD)', grave: false },
  sem_contato:        { l: 'Sem contato', d: 'Não reporta há mais de 30 dias', grave: false },
  sem_ativo:          { l: 'Sem patrimônio', d: 'Sem número de patrimônio cadastrado', grave: false },
};
const CAMPOS_HIST = {
  cadastro: 'Cadastro', hostname: 'Hostname', ativo: 'Patrimônio', tipo: 'Tipo', status: 'Status', numero_serie: 'Nº de série',
  fabricante: 'Fabricante', modelo: 'Modelo', cpu: 'Processador', memoria_gb: 'Memória', armazenamento_total_gb: 'Armazenamento',
  so_nome: 'Sistema', so_display_version: 'Versão do SO', so_build: 'Build', setor: 'Setor', localizacao: 'Localização', responsavel: 'Responsável',
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
const F_PADRAO = { q: '', tipo: '', status: '_ativos', situacao: '', so: '', alerta: '', ram: '', disco: '', setor: '' };
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
};
const ativas = () => state.maquinas.filter((m) => m.status !== 'descartado');
const setores = () => [...new Set(state.maquinas.map((m) => m.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/* =====================================================================
   Dados
   ===================================================================== */
async function carregarMaquinas() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data: d, error } = await sb.from('vw_maquinas').select('*').order('hostname').range(from, from + 999);
    if (error) throw error;
    all.push(...d);
    if (d.length < 1000) break;
  }
  state.maquinas = all;
}
async function carregarHist() {
  const { data: d } = await sb.from('maquinas_historico')
    .select('*, maquinas(hostname)').order('criado_em', { ascending: false }).limit(40);
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
  const [view, arg] = (location.hash.slice(1) || 'painel').split('/');
  state.view = ['painel', 'maquinas', 'conferencia', 'agente'].includes(view) ? view : 'painel';
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + state.view));
  window.scrollTo(0, 0);
  if (state.view === 'painel') renderPainel();
  if (state.view === 'maquinas') renderMaquinas();
  if (state.view === 'conferencia') arg ? abrirConferencia(arg) : renderConferencias();
  if (state.view === 'agente') renderAgente();
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
      <div><h1>Painel</h1><p>Atualizado ao vivo conforme os agentes reportam · ${state.maquinas.length} registros</p></div>
      <div class="actions"><button class="btn" data-go="maquinas">Ver todas as máquinas →</button></div>
    </div>
    ${state.maquinas.length === 0 ? `
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
    </div>
    <div class="grid-3">
      <div class="card card-pad"><div class="card-head"><h2>Sistema operacional</h2></div>${barras(contar(L, soGrupo), 'so', corSO)}</div>
      <div class="card card-pad"><div class="card-head"><h2>Memória RAM</h2></div>${barras(contar(L, ramFaixa).sort((a, b) => ordemRam.indexOf(a[0]) - ordemRam.indexOf(b[0])), 'ram', corRAM)}</div>
      <div class="card card-pad"><div class="card-head"><h2>Armazenamento</h2></div>${barras(contar(L, tipoDisco), 'disco', corDisco)}</div>
      <div class="card card-pad"><div class="card-head"><h2>Último contato</h2></div>${barras(contar(L, (m) => SIT[situacao(m)]).sort((a, b) => ordemSit.indexOf(a[0]) - ordemSit.indexOf(b[0])), 'situacao', corSit)}</div>
      <div class="card card-pad"><div class="card-head"><h2>Status</h2></div>${barras(contar(state.maquinas, (m) => STATUS[m.status]), 'status')}</div>
      <div class="card card-pad"><div class="card-head"><h2>Setores</h2></div>${barras(contar(L, (m) => m.setor || 'Sem setor'), 'setor', () => 'c-info')}</div>
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
        <div class="feed">${state.hist.length ? state.hist.map(feedItem).join('') : '<p class="muted">Nenhuma alteração registrada.</p>'}</div>
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

function fmtValorHist(campo, v) {
  if (v == null || v === '') return '—';
  if (campo === 'memoria_gb' || campo === 'armazenamento_total_gb') return gb(v);
  if (campo === 'status') return STATUS[v] || v;
  if (campo === 'tipo') return TIPO[v] || v;
  return v;
}
function feedItem(h) {
  const host = h.maquinas?.hostname || '(removida)';
  const desc = h.campo === 'cadastro'
    ? 'Nova máquina cadastrada'
    : `${esc(CAMPOS_HIST[h.campo] || h.campo)}: <span class="chg-old">${esc(fmtValorHist(h.campo, h.valor_anterior))}</span> → <span class="chg-new">${esc(fmtValorHist(h.campo, h.valor_novo))}</span>`;
  return `<div class="feed-item"><a data-id="${h.maquina_id}" class="mono">${esc(host)}</a><span class="t">${rel(h.criado_em)}</span>
    <span class="d">${desc} <span class="muted">· ${esc(h.origem === 'agente' ? 'agente' : h.origem)}</span></span></div>`;
}

/* =====================================================================
   MÁQUINAS (lista)
   ===================================================================== */
const COLS = [
  { k: 'situacao', l: '', v: (m) => (m.ultimo_online ? -new Date(m.ultimo_online) : 0), c: (m) => dot(m) },
  { k: 'hostname', l: 'Hostname', v: (m) => m.hostname, c: (m) => `<span class="mono">${esc(m.hostname)}</span>`, cls: 'host' },
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

function filtrar() {
  const f = state.f;
  const termos = up(f.q).split(/\s+/).filter(Boolean);
  return state.maquinas.filter((m) => {
    if (f.status === '_ativos' ? m.status === 'descartado' : f.status && m.status !== f.status) return false;
    if (f.tipo && m.tipo !== f.tipo) return false;
    if (f.situacao && situacao(m) !== f.situacao) return false;
    if (f.so && soGrupo(m) !== f.so) return false;
    if (f.ram && ramFaixa(m) !== f.ram) return false;
    if (f.disco && tipoDisco(m) !== f.disco) return false;
    if (f.setor && (f.setor === '_vazio' ? m.setor : m.setor !== f.setor)) return false;
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
          <button class="btn" id="btn-csv">Exportar CSV</button>
          <button class="btn btn--primary" id="btn-nova">+ Nova máquina</button>
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search"><input id="f-q" type="search" placeholder="Buscar hostname, patrimônio, série, usuário, IP, modelo…" autocomplete="off"></div>
          <select id="f-tipo"></select><select id="f-status"></select><select id="f-situacao"></select>
          <select id="f-so"></select><select id="f-alerta"></select><select id="f-setor"></select>
        </div>
        <div class="chips" id="chips-wrap" style="padding-bottom:10px;align-items:center"><span id="chips" style="display:contents"></span><span class="count" id="count"></span></div>
        <div class="table-wrap"><table><thead><tr>${COLS.map((c) => `<th data-col="${c.k}">${c.l}</th>`).join('')}</tr></thead><tbody id="tbody"></tbody></table></div>
      </div>`;
    $('#f-q').oninput = debounce((e) => { state.f.q = e.target.value; renderTabela(); }, 120);
    ['tipo', 'status', 'situacao', 'so', 'alerta', 'setor'].forEach((k) => {
      $('#f-' + k).onchange = (e) => { state.f[k] = e.target.value; renderTabela(); };
    });
    $$('th', el).forEach((th) => (th.onclick = () => {
      const k = th.dataset.col;
      state.sort = { col: k, dir: state.sort.col === k ? -state.sort.dir : 1 };
      renderTabela();
    }));
    $('#tbody').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) abrirMaquina(tr.dataset.id); };
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
  const sos = contar(state.maquinas, soGrupo).map(([k]) => [k, k]);
  $('#f-so').innerHTML = opts([['', 'Todos os sistemas'], ...sos], f.so);
  $('#f-alerta').innerHTML = opts([['', 'Sem filtro de alerta'], ['_grave', 'Alertas importantes'], ...Object.entries(ALERTAS).map(([k, a]) => [k, a.l])], f.alerta);
  $('#f-setor').innerHTML = opts([['', 'Todos os setores'], ['_vazio', 'Sem setor'], ...setores().map((s) => [s, s])], f.setor);
}
function renderTabela() {
  if (!state.maqMontada || state.view !== 'maquinas') return;
  const lista = ordenar(filtrar());
  $$('#view-maquinas th').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.col === state.sort.col);
    th.classList.toggle('asc', state.sort.dir === 1);
  });
  // chips para filtros vindos do painel que não têm select
  const chips = [];
  if (state.f.ram) chips.push(['ram', 'RAM', state.f.ram]);
  if (state.f.disco) chips.push(['disco', 'Disco', state.f.disco]);
  const algum = Object.keys(F_PADRAO).some((k) => state.f[k] !== F_PADRAO[k]);
  $('#chips').innerHTML = chips.map(([k, l, v]) => `<button class="chip" data-k="${k}">${l}: <b>${esc(v)}</b><span>×</span></button>`).join('')
    + (algum ? '<button class="btn btn--ghost btn--sm" id="limpar">Limpar filtros</button>' : '');
  $$('#chips .chip').forEach((c) => (c.onclick = () => { state.f[c.dataset.k] = ''; renderTabela(); }));
  $('#limpar')?.addEventListener('click', () => { state.f = { ...F_PADRAO }; syncToolbar(); renderTabela(); });
  $('#count').textContent = `${lista.length} de ${state.maquinas.length} máquinas`;
  $('#tbody').innerHTML = lista.length
    ? lista.map((m) => `<tr data-id="${m.id}" class="${state.flash.has(m.id) ? 'flash' : ''}">${COLS.map((c) => `<td class="${c.cls || ''}">${c.c(m)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${COLS.length}" class="empty">Nenhuma máquina encontrada com esses filtros.</td></tr>`;
}

function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + conteudo], { type: tipo }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCel = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function exportarCSV() {
  const cab = ['Hostname', 'Patrimônio', 'Tipo', 'Status', 'Fabricante', 'Modelo', 'Nº série', 'Processador', 'RAM (GB)', 'Slots RAM',
    'Armazenamento (GB)', 'Livre (GB)', 'Tipo disco', 'Sistema', 'Versão', 'Build', 'Arquitetura', 'IP', 'MAC', 'Domínio', 'Usuário',
    'Setor', 'Localização', 'Responsável', 'Último contato', 'Situação', 'Alertas', 'Observações'];
  const linhas = ordenar(filtrar()).map((m) => [m.hostname, m.ativo, TIPO[m.tipo], STATUS[m.status], m.fabricante, m.modelo, m.numero_serie,
    m.cpu, m.memoria_gb, m.memoria_slots_total, m.armazenamento_total_gb, m.armazenamento_livre_gb, tipoDisco(m), m.so_nome,
    m.so_display_version, m.so_build, m.so_arquitetura, m.ip, m.mac, m.dominio, m.usuario_logado, m.setor, m.localizacao,
    m.responsavel, dataHora(m.ultimo_online), SIT[situacao(m)], (m.alertas || []).map((a) => ALERTAS[a]?.l || a).join(', '), m.observacoes]);
  baixar(`inventario-${new Date().toISOString().slice(0, 10)}.csv`, [cab, ...linhas].map((l) => l.map(csvCel).join(';')).join('\r\n'));
}

/* =====================================================================
   DRAWER — detalhe da máquina
   ===================================================================== */
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

      <div><div class="section-title"><h3>Histórico</h3></div><div class="timeline" id="d-hist"><p class="muted">Carregando…</p></div></div>
    </div>
    <div class="drawer-foot">
      <button class="btn btn--danger btn--sm" id="d-excluir">Excluir</button>
      ${m.origem === 'manual' || situacao(m) === 'offline' ? '<button class="btn btn--sm" id="d-link">Link de instalação</button>' : ''}
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
  $('#d-link')?.addEventListener('click', () => modalLinkInstalacao({ ativo: m.ativo, setor: m.setor, localizacao: m.localizacao, responsavel: m.responsavel }));
  $('#d-excluir').onclick = async () => {
    if (!confirm(`Excluir ${m.hostname} definitivamente? Prefira marcar como "Descartado" para manter o histórico.`)) return;
    const { error } = await sb.from('maquinas').delete().eq('id', id);
    if (error) return toast(erroMsg(error), true);
    state.maquinas = state.maquinas.filter((x) => x.id !== id);
    state.drawerDirty = false; fecharDrawer(); rerender(); toast('Máquina excluída');
  };

  async function salvar() {
    const fd = new FormData(form);
    const diff = {};
    for (const [k, v0] of fd.entries()) {
      let v = String(v0).trim();
      if (k === 'hostname') v = v.toUpperCase();
      const novo = v === '' ? null : ['memoria_gb', 'armazenamento_total_gb'].includes(k) ? Number(v) : v;
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

  const { data: hist } = await sb.from('maquinas_historico').select('*').eq('maquina_id', id).order('criado_em', { ascending: false }).limit(100);
  if (state.drawerId !== id) return;
  $('#d-hist').innerHTML = (hist || []).length ? hist.map((h) => `
    <div class="tl ${CAMPOS_HW.includes(h.campo) ? 'hw' : ''}"><span class="b"></span><div>
      ${h.campo === 'cadastro' ? '<strong>Cadastrada no inventário</strong>' : `<strong>${esc(CAMPOS_HIST[h.campo] || h.campo)}</strong>: <span class="chg-old">${esc(fmtValorHist(h.campo, h.valor_anterior))}</span> → <span class="chg-new">${esc(fmtValorHist(h.campo, h.valor_novo))}</span>`}
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
  el.innerHTML = `<div class="skeleton">Carregando conferências…</div>`;
  const { data: confs, error } = await sb.from('conferencias').select('*, conferencia_itens(maquina_id)').order('criado_em', { ascending: false });
  if (error) { el.innerHTML = `<div class="card card-pad erro">${esc(erroMsg(error))}</div>`; return; }
  state.confs = confs;
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Conferência física</h1><p>Bipe as etiquetas de patrimônio com o leitor (ou digite o hostname / nº de série). O sistema mostra o que foi encontrado, o que está faltando e o que não está cadastrado.</p></div>
      <div class="actions"><button class="btn btn--primary" id="btn-nova-conf">+ Nova conferência</button></div>
    </div>
    ${confs.length ? `<div class="conf-list">${confs.map((c) => {
      const esperadas = esperadasDe(c).length;
      const achadas = new Set(c.conferencia_itens.map((i) => i.maquina_id).filter(Boolean)).size;
      const pct = esperadas ? Math.min(100, Math.round((achadas / esperadas) * 100)) : 0;
      return `<button class="card conf-card" data-id="${c.id}">
        <div style="display:flex;justify-content:space-between;gap:8px"><h2>${esc(c.nome)}</h2>${pill(c.status === 'aberta' ? 'Aberta' : 'Finalizada', c.status === 'aberta' ? 'info' : 'ok')}</div>
        <div class="muted">${esc(c.setor || 'Todos os setores')} · ${data(c.criado_em)} · ${esc(c.criado_por || '')}</div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div><strong>${achadas}</strong> de ${esperadas} encontradas (${pct}%)</div></button>`;
    }).join('')}</div>` : `<div class="card card-pad empty"><h2>Nenhuma conferência ainda</h2><p>Crie uma para fazer a contagem física de um setor ou do CD inteiro.</p></div>`}`;
  $('#btn-nova-conf').onclick = modalNovaConf;
  $$('.conf-card', el).forEach((b) => (b.onclick = () => (location.hash = '#conferencia/' + b.dataset.id)));
}

function esperadasDe(c) {
  return state.maquinas.filter((m) => !['descartado', 'extraviado'].includes(m.status) && (!c.setor || m.setor === c.setor));
}

function modalNovaConf() {
  modal(`
    <form id="conf-form">
      <div class="modal-head"><h2>Nova conferência</h2></div>
      <div class="modal-body">
        ${campo('nome', 'Nome *', `Inventário ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`, 'text', 'required')}
        <label>Setor (opcional)<select name="setor"><option value="">Todos os setores (CD inteiro)</option>${setores().map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
        <p class="muted" style="margin:0">Máquinas esperadas: todas com status diferente de Descartado/Extraviado${setores().length ? ' do setor escolhido' : ''}.</p>
        <p class="erro" id="conf-erro"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary">Começar</button></div>
    </form>`, (dlg) => {
    $('#conf-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { data: d, error } = await sb.from('conferencias').insert({ nome: fd.nome.trim(), setor: fd.setor || null }).select('id').single();
      if (error) { $('#conf-erro').textContent = erroMsg(error); return; }
      dlg.close();
      location.hash = '#conferencia/' + d.id;
    };
  });
}

async function abrirConferencia(id) {
  const el = $('#view-conferencia');
  el.innerHTML = `<div class="skeleton">Carregando…</div>`;
  const [{ data: c, error }, { data: itens }] = await Promise.all([
    sb.from('conferencias').select('*').eq('id', id).maybeSingle(),
    sb.from('conferencia_itens').select('*').eq('conferencia_id', id).order('lido_em', { ascending: false }),
  ]);
  if (error || !c) { el.innerHTML = `<div class="card card-pad erro">Conferência não encontrada.</div>`; return; }
  state.conf = c; state.confItens = itens || []; state.confTab = 'faltando';
  renderConfDetalhe(true);
}

function confCalculo() {
  const c = state.conf;
  const esperadas = esperadasDe(c);
  const idsEsperados = new Set(esperadas.map((m) => m.id));
  const lidos = new Map(state.confItens.filter((i) => i.maquina_id).map((i) => [i.maquina_id, i]));
  const encontradas = state.confItens.filter((i) => i.maquina_id).map((i) => ({ item: i, m: state.maquinas.find((m) => m.id === i.maquina_id) })).filter((x) => x.m);
  const faltando = esperadas.filter((m) => !lidos.has(m.id));
  const desconhecidos = state.confItens.filter((i) => !i.maquina_id);
  const foraDoEsperado = encontradas.filter((x) => !idsEsperados.has(x.m.id));
  const achadasEsperadas = encontradas.length - foraDoEsperado.length;
  return { esperadas, encontradas, faltando, desconhecidos, foraDoEsperado, achadasEsperadas };
}

function renderConfDetalhe(montar) {
  const el = $('#view-conferencia');
  const c = state.conf;
  const k = confCalculo();
  const pct = k.esperadas.length ? Math.min(100, Math.round((k.achadasEsperadas / k.esperadas.length) * 100)) : 0;
  const aberta = c.status === 'aberta';

  if (montar || !$('#scan-input') && aberta) {
    el.innerHTML = `
      <div class="view-head">
        <div><a href="#conferencia" class="muted" style="text-decoration:none">← Conferências</a>
          <h1 style="margin-top:4px">${esc(c.nome)}</h1>
          <p>${esc(c.setor || 'Todos os setores')} · iniciada ${dataHora(c.criado_em)} por ${esc(c.criado_por || '—')}${c.finalizado_em ? ' · finalizada ' + dataHora(c.finalizado_em) : ''}</p></div>
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
            ${'BarcodeDetector' in window ? '<button class="btn" type="button" id="btn-camera">📷 Câmera</button>' : ''}
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
    <button class="btn" id="conf-csv">Exportar resultado</button>
    ${aberta ? '<button class="btn btn--primary" id="conf-fim">Finalizar conferência</button>'
             : `<button class="btn" id="conf-reabrir">Reabrir</button>${k.faltando.length ? `<button class="btn btn--danger" id="conf-extraviar">Marcar ${k.faltando.length} faltantes como extraviadas</button>` : ''}`}`;
  $('#conf-csv').onclick = exportarConf;
  $('#conf-fim')?.addEventListener('click', async () => {
    if (k.faltando.length && !confirm(`Ainda faltam ${k.faltando.length} máquinas. Finalizar mesmo assim?`)) return;
    await sb.from('conferencias').update({ status: 'finalizada', finalizado_em: new Date().toISOString() }).eq('id', c.id);
    abrirConferencia(c.id);
  });
  $('#conf-reabrir')?.addEventListener('click', async () => {
    await sb.from('conferencias').update({ status: 'aberta', finalizado_em: null }).eq('id', c.id);
    abrirConferencia(c.id);
  });
  $('#conf-extraviar')?.addEventListener('click', async () => {
    if (!confirm(`Alterar o status de ${k.faltando.length} máquinas para "Extraviado"? Isso fica registrado no histórico de cada uma.`)) return;
    const ids = k.faltando.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from('maquinas').update({ status: 'extraviado' }).in('id', ids.slice(i, i + 200));
      if (error) return toast(erroMsg(error), true);
    }
    await carregarMaquinas(); toast('Status atualizado'); renderConfDetalhe(false);
  });

  $('#conf-stats').innerHTML = `
    <h3>Progresso</h3>
    <div><span class="conf-big">${k.achadasEsperadas}</span><span class="muted"> / ${k.esperadas.length}</span></div>
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
        return `<tr data-id="${m.id}"><td>${dataHora(item.lido_em)}</td><td class="host mono">${esc(m.hostname)}</td><td class="mono">${esc(m.ativo || '—')}</td><td class="mono">${esc(item.codigo_lido)}</td><td>${esc(item.localizacao || '—')}</td><td>${esc(item.lido_por || '')}</td><td>${fora ? `<span class="tag">${m.status === 'extraviado' || m.status === 'descartado' ? STATUS[m.status] : 'Outro setor: ' + esc(m.setor || '—')}</span>` : ''}</td></tr>`;
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
    ativo: codigo, hostname: '', setor: state.conf?.setor || '', localizacao: $('#scan-local')?.value || '',
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
  const codigo = String(bruto || '').trim();
  if (!codigo) return;
  const c = up(codigo);
  const c2 = c.replace(/^0+/, ''); // etiquetas com zeros à esquerda
  const m = state.maquinas.find((x) => up(x.ativo) === c || up(x.hostname) === c || up(x.numero_serie) === c || (c2 && up(x.ativo).replace(/^0+/, '') === c2));
  const ja = state.confItens.find((i) => (m && i.maquina_id === m.id) || up(i.codigo_lido) === c);
  if (ja) {
    return mostrarResultado('warn', `Já lida — ${esc(m?.hostname || codigo)}`, `Lida em ${dataHora(ja.lido_em)}${ja.lido_por ? ' por ' + esc(ja.lido_por) : ''}`);
  }
  const local = $('#scan-local')?.value.trim() || null;
  const { data: item, error } = await sb.from('conferencia_itens')
    .insert({ conferencia_id: state.conf.id, maquina_id: m?.id || null, codigo_lido: codigo, localizacao: local }).select().single();
  if (error) {
    if (error.code === '23505') return mostrarResultado('warn', 'Já lida', esc(codigo));
    return mostrarResultado('bad', 'Erro ao gravar', esc(erroMsg(error)));
  }
  if (!state.confItens.some((i) => i.id === item.id)) state.confItens.push(item);

  if (!m) {
    mostrarResultado('bad', `Não cadastrada: ${esc(codigo)}`, 'Esse código não existe no inventário.',
      `<div style="margin-top:6px"><button class="btn btn--sm" id="r-cad">Cadastrar agora</button></div>`);
    $('#r-cad').onclick = () => cadastrarDesconhecido(codigo, item.id);
  } else {
    const esperada = esperadasDe(state.conf).some((x) => x.id === m.id);
    const det = `${esc(m.ativo ? 'Patrimônio ' + m.ativo : 'Sem patrimônio')} · ${esc(TIPO[m.tipo])} ${esc(m.modelo || '')} · ${gb(m.memoria_gb)} RAM · ${esc(soFamilia(m))}`;
    if (esperada) mostrarResultado('ok', `✓ ${esc(m.hostname)}`, det);
    else if (['extraviado', 'descartado'].includes(m.status)) mostrarResultado('warn', `${esc(m.hostname)} — estava como ${STATUS[m.status]}`, det + ' · ajuste o status no cadastro.');
    else mostrarResultado('warn', `${esc(m.hostname)} — pertence a outro setor`, `Cadastrada em: ${esc(m.setor || 'sem setor')} · ${det}`);
    if (local && $('#scan-gravar')?.checked && m.localizacao !== local) {
      sb.from('maquinas').update({ localizacao: local }).eq('id', m.id).then(() => recarregarMaquina(m.id));
    }
  }
  renderConfDetalhe(false);
}

async function abrirCamera() {
  let stream, rodando = true;
  const dlg = modal(`
    <div class="modal-head"><h2>Ler com a câmera</h2></div>
    <div class="modal-body"><video id="cam" class="camera" playsinline muted></video><p class="muted" style="margin:0">Aponte para o código de barras ou QR code da etiqueta.</p></div>
    <div class="modal-foot"><button class="btn" data-close>Fechar</button></div>`);
  dlg.addEventListener('close', () => { rodando = false; stream?.getTracks().forEach((t) => t.stop()); $('#scan-input')?.focus(); }, { once: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('#cam'); v.srcObject = stream; await v.play();
    const det = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'qr_code', 'data_matrix', 'itf'] });
    const loop = async () => {
      if (!rodando) return;
      try {
        const r = await det.detect(v);
        if (r.length) { dlg.close(); return processarLeitura(r[0].rawValue); }
      } catch { /* frame inválido */ }
      setTimeout(loop, 250);
    };
    loop();
  } catch (e) {
    dlg.close(); toast('Não foi possível abrir a câmera: ' + e.message, true);
  }
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
   LINK DE INSTALAÇÃO (para enviar ao colaborador)
   ===================================================================== */
let tokenLink = null;
async function obterTokenLink(novo = false) {
  if (tokenLink && !novo) return tokenLink;
  const { data: t, error } = await sb.rpc('obter_token_link', { p_novo: novo });
  if (error) throw error;
  tokenLink = t;
  return t;
}
function baseInstalar() {
  const base = URL_PUBLICA ? URL_PUBLICA.replace(/\/?$/, '/') : new URL('.', location.href).href;
  return base + 'instalar.html';
}

async function modalLinkInstalacao(pre = {}) {
  let token;
  try { token = await obterTokenLink(); } catch (e) {
    return toast('Não foi possível obter o token de links. Rode o arquivo sql/02_link_instalacao.sql no Supabase. (' + erroMsg(e) + ')', true);
  }
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
  modal(`
    <div class="modal-head"><h2>Link de instalação</h2>
      <p class="muted" style="margin:4px 0 0">Envie para o colaborador abrir <b>no computador</b>. Ele clica em Baixar, abre o arquivo e pronto: a máquina é reconhecida sozinha.</p></div>
    <div class="modal-body">
      <div class="form-grid" id="lk-form">
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
      <button class="btn btn--ghost btn--sm" id="lk-rotacionar" title="Links enviados antes deixam de funcionar">Invalidar links antigos</button>
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
    $('#lk-form').oninput = atualizar;
    $('#lk-copiar').onclick = () => navigator.clipboard.writeText($('#lk-url').value).then(() => toast('Link copiado'));
    $('#lk-url').onclick = (e) => e.target.select();
    $('#lk-rotacionar').onclick = async () => {
      if (!confirm('Gerar um novo token de links? Todos os links já enviados param de funcionar (as máquinas já instaladas com eles também deixam de reportar até serem reinstaladas).')) return;
      try { token = await obterTokenLink(true); atualizar(); toast('Novo token gerado'); } catch (e) { toast(erroMsg(e), true); }
    };
    atualizar();
  });
}

/* =====================================================================
   AGENTE
   ===================================================================== */
async function renderAgente() {
  const el = $('#view-agente');
  const { data: tokens } = await sb.from('agente_tokens').select('id, descricao, ativo, criado_em, ultimo_uso').order('criado_em');
  state.tokens = tokens || [];
  const versoes = contar(state.maquinas.filter((m) => m.origem === 'agente'), (m) => m.agente_versao || '?');
  const comAgente = state.maquinas.filter((m) => m.origem === 'agente').length;

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
            <div class="card kpi" style="cursor:default"><div class="kpi-label">Com agente</div><div class="kpi-value">${comAgente}</div><div class="kpi-sub">de ${state.maquinas.length} máquinas</div></div>
            <div class="card kpi" style="cursor:default"><div class="kpi-label">Sem agente</div><div class="kpi-value">${state.maquinas.length - comAgente}</div><div class="kpi-sub">cadastro manual</div></div>
          </div>
          ${versoes.length ? `<h3 style="margin:16px 0 8px">Versões do agente</h3>${barras(versoes, 'x')}` : ''}
        </div>
        <div class="card card-pad">
          <div class="card-head"><h2>Tokens do agente</h2><button class="btn btn--sm" id="btn-token">+ Gerar token</button></div>
          <p class="muted" style="margin-top:0">O agente só consegue gravar com um token ativo. Se um token vazar, revogue e gere outro (atualize o <code>config.json</code>).</p>
          <table class="mini-table"><thead><tr><th>Descrição</th><th>Criado</th><th>Último uso</th><th></th></tr></thead><tbody>
            ${state.tokens.map((t) => `<tr><td>${esc(t.descricao)} ${t.ativo ? '' : pill('revogado', 'bad')}</td><td>${data(t.criado_em)}</td><td>${rel(t.ultimo_uso)}</td>
              <td><button class="btn btn--sm ${t.ativo ? 'btn--danger' : ''}" data-tok="${t.id}" data-ativo="${t.ativo}">${t.ativo ? 'Revogar' : 'Reativar'}</button></td></tr>`).join('')}
          </tbody></table>
        </div>
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
  $('#btn-token').onclick = async () => {
    const desc = prompt('Descrição do token (ex.: "Implantação GPO 2026")');
    if (desc === null) return;
    const { data: tok, error } = await sb.rpc('gerar_token_agente', { p_descricao: desc });
    if (error) return toast(erroMsg(error), true);
    modal(`<div class="modal-head"><h2>Novo token gerado</h2></div>
      <div class="modal-body"><p style="margin:0">Copie agora — ele <strong>não será exibido novamente</strong>. Cole no campo <code>agente_token</code> do <code>config.json</code>.</p>
      <div class="token-box" id="tok">${esc(tok)}</div></div>
      <div class="modal-foot"><button class="btn" id="tok-copiar">Copiar</button><button class="btn btn--primary" data-close>Fechei, já copiei</button></div>`,
    () => { $('#tok-copiar').onclick = () => navigator.clipboard.writeText(tok).then(() => toast('Copiado')); });
    renderAgente();
  };
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

let iniciado = false;
async function entrar(session) {
  state.user = session.user;
  $('#login').hidden = true; $('#app').hidden = false;
  $('#user-email').textContent = session.user.email;
  if (iniciado) return;
  iniciado = true;
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
}

aplicarTema();
sb.auth.onAuthStateChange((ev, session) => {
  if (session) setTimeout(() => entrar(session), 0); // fora do lock de auth do supabase-js
  else {
    if (iniciado) return location.reload();
    $('#app').hidden = true; $('#login').hidden = false;
  }
});
