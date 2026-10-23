/* =====================================================================
   Prospecta — front-end estático (GitHub Pages) + Supabase
   ===================================================================== */
'use strict';

/* ------------------------------------------------------------ utilitários */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ic = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n) => Number(n || 0).toLocaleString('pt-BR');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtData(iso, comHora = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('pt-BR') + (comHora ? ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
}
function fmtDuracao(seg) {
  seg = Math.max(0, Math.round(seg || 0));
  const m = Math.floor(seg / 60), s = seg % 60;
  return m ? `${m}min ${String(s).padStart(2, '0')}s` : `${s}s`;
}
const ls = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } },
};

const STATUS = {
  novo: { label: 'Novo', cor: '#1C4ED8' },
  contatado: { label: 'Contatado', cor: '#5B3FC4' },
  negociacao: { label: 'Em negociação', cor: '#C2610C' },
  cliente: { label: 'Cliente', cor: '#0A8754' },
  descartado: { label: 'Descartado', cor: '#64748B' },
};
const statusBadge = (s) => `<span class="badge st-${s}">${STATUS[s]?.label || s}</span>`;

const FONTES = {
  extensao: { label: 'Extensão do Chrome', curto: 'Extensão', icone: 'puzzle', desc: 'No seu navegador · grátis' },
  nuvem: { label: 'Robô na nuvem', curto: 'Nuvem', icone: 'cloud', desc: 'Servidor 24h · sem PC ligado' },
  desktop: { label: 'Robô no meu PC', curto: 'PC', icone: 'monitor', desc: 'ProspectaRobo.exe · grátis' },
  places: { label: 'Google Places API', curto: 'Places API', icone: 'api', desc: 'Oficial · mais precisa · paga' },
};

const SUGESTOES = [
  'Restaurantes', 'Padarias', 'Academias', 'Clínicas odontológicas', 'Clínicas médicas', 'Salões de beleza',
  'Barbearias', 'Pet shops', 'Clínicas veterinárias', 'Oficinas mecânicas', 'Imobiliárias', 'Escritórios de contabilidade',
  'Escritórios de advocacia', 'Farmácias', 'Mercados', 'Lojas de roupas', 'Hotéis', 'Escolas', 'Construtoras',
  'Lojas de materiais de construção', 'Auto peças', 'Óticas', 'Estúdios de pilates', 'Agências de marketing',
  'Lavanderias', 'Floriculturas', 'Hamburguerias', 'Pizzarias', 'Cafeterias', 'Distribuidoras',
];

/* ------------------------------------------------------------ Supabase */
const C = window.PROSPECTA;
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'prospecta-auth' },
});
const TRADUCOES = [
  [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/Email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
  [/User already registered/i, 'Este e-mail já tem conta. Use "Entrar".'],
  [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/relation .*prospecta_.* does not exist|Could not find the (table|function)/i, 'O banco ainda não foi configurado: rode o arquivo supabase/schema.sql no SQL Editor do Supabase.'],
  [/Failed to fetch|NetworkError/i, 'Sem conexão com o servidor. Verifique sua internet.'],
  [/JWT expired/i, 'Sessão expirada. Entre novamente.'],
  [/rate limit/i, 'Muitas tentativas. Aguarde um minuto e tente de novo.'],
];
const traduzir = (m) => (TRADUCOES.find(([re]) => re.test(m || '')) || [null, m])[1];
const ok = (r) => { if (r.error) throw new Error(traduzir(r.error.message)); return r.data; };

let usuario = null;

/* ------------------------------------------------------------ configurações */
const CFG_PADRAO = {
  mensagem: 'Olá! Tudo bem? Falo com a {empresa}? Vi vocês no Google Maps aqui em {bairro} e gostaria de apresentar uma solução que pode ajudar a atrair mais clientes. Podemos conversar?',
  headless: true,
  concorrencia: 3,
  mapa: 'google',
  fonte: 'extensao',
};
const cfg = Object.assign({}, CFG_PADRAO, ls.get('prospecta.cfg', {}));
const salvarCfgLocal = () => ls.set('prospecta.cfg', cfg);
async function salvarCfgRemoto() {
  salvarCfgLocal();
  try {
    await sb.from('prospecta_config').upsert({ owner: usuario.id, mensagem: cfg.mensagem, preferencias: { headless: cfg.headless, concorrencia: cfg.concorrencia, mapa: cfg.mapa, fonte: cfg.fonte }, atualizado_em: new Date().toISOString() });
  } catch { /* offline: fica só local */ }
}
async function carregarCfgRemoto() {
  try {
    const { data } = await sb.from('prospecta_config').select('*').maybeSingle();
    if (data) { if (data.mensagem) cfg.mensagem = data.mensagem; Object.assign(cfg, data.preferencias || {}); salvarCfgLocal(); }
  } catch { /* */ }
}

/* ------------------------------------------------------------ camada de dados */
const ORDENS = { nome: 'nome', bairro: 'bairro', cidade: 'cidade', avaliacao: 'avaliacao', num_avaliacoes: 'num_avaliacoes', score: 'score', criado_em: 'criado_em', status: 'status', categoria: 'categoria' };
const limpaBusca = (s) => s.replace(/[,()%*\\]/g, ' ').trim();

function filtrar(q, f) {
  if (f.q) {
    const t = `%${limpaBusca(f.q)}%`;
    q = q.or(['nome', 'categoria', 'endereco', 'telefone', 'email', 'notas', 'tags', 'cnpj', 'razao_social'].map((c) => `${c}.ilike.${t}`).join(','));
  }
  for (const c of ['status', 'bairro', 'cidade', 'categoria', 'uf', 'fonte']) if (f[c]) q = q.eq(c, f[c]);
  if (f.search_id) q = q.eq('prospecta_lead_buscas.busca_id', f.search_id);
  if (f.com_telefone) q = q.not('telefone', 'is', null).neq('telefone', '');
  if (f.whatsapp) q = q.eq('celular', true);
  if (f.com_email) q = q.not('email', 'is', null).neq('email', '');
  if (f.com_cnpj) q = q.not('cnpj', 'is', null).neq('cnpj', '');
  if (f.sem_site) q = q.or('site.is.null,site.eq.');
  if (f.com_site) q = q.not('site', 'is', null).neq('site', '');
  if (f.ids) q = q.in('id', String(f.ids).split(',').map(Number));
  return q;
}

const db = {
  stats: async () => ok(await sb.rpc('prospecta_estatisticas')),
  async filtros() {
    const [o, b] = await Promise.all([
      sb.rpc('prospecta_opcoes_filtro'),
      sb.from('prospecta_buscas').select('id,termo,local,fonte,criado_em').order('criado_em', { ascending: false }).limit(100),
    ]);
    return { ...ok(o), buscas: ok(b) };
  },
  async leads(f, { page = 1, per_page = 25, order = 'criado_em', dir = 'desc' } = {}) {
    let q = sb.from('prospecta_leads').select(f.search_id ? '*, prospecta_lead_buscas!inner(busca_id)' : '*', { count: 'exact' });
    q = filtrar(q, f).order(ORDENS[order] || 'criado_em', { ascending: dir === 'asc', nullsFirst: false }).order('id', { ascending: false });
    if (per_page) q = q.range((page - 1) * per_page, page * per_page - 1);
    const r = await q;
    return { items: ok(r), total: r.count || 0 };
  },
  async todosLeads(f, limite = 20000) {
    const todos = [];
    for (let pg = 1; todos.length < limite; pg++) {
      const { items } = await db.leads(f, { page: pg, per_page: 1000, order: 'nome', dir: 'asc' });
      todos.push(...items);
      if (items.length < 1000) break;
    }
    return todos;
  },
  async lead(id) {
    const [l, a, b] = await Promise.all([
      sb.from('prospecta_leads').select('*').eq('id', id).single(),
      sb.from('prospecta_atividades').select('*').eq('lead_id', id).order('criado_em', { ascending: false }).limit(100),
      sb.from('prospecta_lead_buscas').select('busca:prospecta_buscas(id,termo,local,fonte,criado_em)').eq('lead_id', id),
    ]);
    return { ...ok(l), atividades: ok(a), buscas: ok(b).map((x) => x.busca).filter(Boolean) };
  },
  atualizar: async (id, campos) => ok(await sb.from('prospecta_leads').update(campos).eq('id', id).select().single()),
  atividade: async (lead_id, tipo, descricao) => ok(await sb.from('prospecta_atividades').insert({ lead_id, tipo, descricao })),
  async massa(ids, acao, valor) {
    if (acao === 'excluir') return ok(await sb.from('prospecta_leads').delete().in('id', ids));
    if (acao === 'status') return ok(await sb.from('prospecta_leads').update({ status: valor }).in('id', ids));
    if (acao === 'tag') {
      const atuais = ok(await sb.from('prospecta_leads').select('id,tags').in('id', ids));
      for (const l of atuais) {
        const tags = (l.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
        if (!tags.includes(valor)) tags.push(valor);
        ok(await sb.from('prospecta_leads').update({ tags: tags.join(', ') }).eq('id', l.id));
      }
    }
  },
  async enriquecer(lead_id, cnpj) {
    const { data, error } = await sb.functions.invoke('enriquecer', { body: { lead_id, cnpj } });
    if (error) {
      let msg = error.message;
      try { const b = await error.context.json(); msg = b.erro || msg; } catch { /* */ }
      if (/Failed to send|not found|404/i.test(msg)) msg = 'A função "enriquecer" ainda não foi publicada no Supabase (veja o README).';
      throw new Error(msg);
    }
    return data;
  },
  async buscas() {
    const r = ok(await sb.from('prospecta_buscas').select('*, prospecta_lead_buscas(count)').order('criado_em', { ascending: false }).limit(300));
    return r.map((b) => ({ ...b, total_leads: b.prospecta_lead_buscas?.[0]?.count || 0 }));
  },
  excluirBusca: async (id, apagar) => ok(await sb.rpc('prospecta_excluir_busca', { p_busca: id, p_apagar_leads: apagar })),
  criarBusca: async (d) => ok(await sb.from('prospecta_buscas').insert(d).select().single()),
  busca: async (id) => ok(await sb.from('prospecta_buscas').select('*').eq('id', id).single()),
  async leadsDaBusca(id) {
    return ok(await sb.from('prospecta_leads')
      .select('id,nome,categoria,telefone,telefone_e164,celular,bairro,cidade,latitude,longitude,status,criado_em,avaliacao,num_avaliacoes,prospecta_lead_buscas!inner(busca_id)')
      .eq('prospecta_lead_buscas.busca_id', id).order('id', { ascending: true }).limit(1000));
  },
  cancelar: async (b) => ok(await sb.from('prospecta_buscas').update(b.status === 'pendente'
    ? { cancelar: true, status: 'cancelada', fase: 'cancelado', finalizado_em: new Date().toISOString() }
    : { cancelar: true }).eq('id', b.id)),
  robos: async () => ok(await sb.from('prospecta_robos').select('*').order('ultimo_sinal', { ascending: false })),
};

/* ------------------------------------------------------------ toast / modal */
function toast(msg, tipo = 'ok', acao) {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `${ic(tipo === 'err' ? 'alert' : tipo === 'info' ? 'info' : 'check')}<span style="flex:1">${esc(msg)}</span>`;
  if (acao) {
    const b = document.createElement('button');
    b.className = 'btn sm'; b.style.cssText = 'background:#fff;color:#0E1726;border:0';
    b.textContent = acao.label;
    b.onclick = () => { acao.fn(); el.remove(); };
    el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), acao ? 8000 : 4000);
}

function modal({ titulo, texto = '', corpo = '', confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false, aoAbrir, largura }) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" ${largura ? `style="width:min(${largura}px,100%)"` : ''}>
      <div class="modal-h"><h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}</div>
      ${corpo ? `<div class="modal-b">${corpo}</div>` : '<div style="height:8px"></div>'}
      <div class="modal-f">${cancelar ? `<button class="btn" data-x>${esc(cancelar)}</button>` : ''}
      ${confirmar ? `<button class="btn ${perigo ? 'danger solid' : 'primary'}" data-ok>${esc(confirmar)}</button>` : ''}</div></div>`;
    const fechar = (v) => { bg.remove(); resolve(v); };
    bg.addEventListener('click', (e) => { if (e.target === bg) fechar(false); });
    $('[data-x]', bg)?.addEventListener('click', () => fechar(false));
    $('[data-ok]', bg)?.addEventListener('click', () => fechar(bg));
    document.body.appendChild(bg);
    aoAbrir?.(bg, fechar);
  });
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado para a área de transferência'); }
  catch { toast('Não foi possível copiar', 'err'); }
}

/* ------------------------------------------------------------ helpers de lead */
const iniciais = (nome) => (nome || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const PALETA = ['#1C4ED8', '#0A8754', '#5B3FC4', '#C2610C', '#0E7490', '#BE185D', '#4338CA', '#15803D'];
const corDe = (s) => PALETA[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETA.length];

function linkWhats(lead) {
  const num = (lead.telefone_e164 || '').replace(/\D/g, '');
  if (!num) return '';
  const msg = (cfg.mensagem || '')
    .replaceAll('{empresa}', lead.nome || '')
    .replaceAll('{bairro}', lead.bairro || lead.cidade || 'sua região')
    .replaceAll('{cidade}', lead.cidade || '')
    .replaceAll('{categoria}', (lead.categoria || '').toLowerCase());
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
const linkSite = (s) => (!s ? '' : /^https?:/i.test(s) ? s : 'http://' + s);
const dominio = (s) => { try { return new URL(linkSite(s)).hostname.replace(/^www\./, ''); } catch { return s; } };
const enderecoCurto = (l) => [l.rua, l.numero].filter(Boolean).join(', ') || l.complemento || l.endereco || '';
const fmtCnpj = (c) => (c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const fmtMoeda = (v) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));

function estrelas(l) {
  if (!l.avaliacao) return '<span class="muted">—</span>';
  return `<span class="stars">${ic('star', 'xs')}${String(l.avaliacao).replace('.', ',')}<small>(${nf(l.num_avaliacoes)})</small></span>`;
}
function scoreHtml(s) {
  const cor = s >= 70 ? 'var(--success)' : s >= 40 ? 'var(--warning)' : 'var(--danger)';
  return `<span class="score"><span class="ring"><i style="width:${s}%;background:${cor}"></i></span><b class="num" style="font-size:12.5px">${s}</b></span>`;
}

async function registrarContato(lead, tipo) {
  const desc = { whatsapp: 'Mensagem de WhatsApp aberta', ligacao: 'Ligação iniciada', email: 'E-mail iniciado' }[tipo];
  try { await db.atividade(lead.id, tipo, desc); } catch { /* */ }
  if (lead.status === 'novo') {
    toast(`${desc} para ${lead.nome}.`, 'info', {
      label: 'Marcar contatado',
      fn: async () => { await db.atualizar(lead.id, { status: 'contatado' }); lead.status = 'contatado'; toast('Status atualizado'); refreshAtual(); if (drawer.id === lead.id) abrirLead(lead.id); },
    });
  }
}

/* ------------------------------------------------------------ mapa */
const TILES = {
  google: { url: 'https://{s}.google.com/vt/lyrs=m&hl=pt-BR&x={x}&y={y}&z={z}', sub: ['mt0', 'mt1', 'mt2', 'mt3'], attr: 'Dados do mapa © Google' },
  satelite: { url: 'https://{s}.google.com/vt/lyrs=y&hl=pt-BR&x={x}&y={y}&z={z}', sub: ['mt0', 'mt1', 'mt2', 'mt3'], attr: 'Imagens © Google' },
  osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', sub: ['a', 'b', 'c'], attr: '© OpenStreetMap' },
};
function criarMapa(el, centro, zoom) {
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(centro, zoom);
  map._camada = null;
  map.trocarCamada = (tipo) => {
    if (map._camada) map.removeLayer(map._camada);
    const t = TILES[tipo] || TILES.google;
    map._camada = L.tileLayer(t.url, { maxZoom: 20, subdomains: t.sub, attribution: t.attr }).addTo(map);
  };
  map.trocarCamada(cfg.mapa);
  return map;
}
const pinIcon = (n, status = 'novo') => L.divIcon({
  className: '', html: `<div class="pin ${status}"><span>${n}</span></div>`,
  iconSize: [26, 26], iconAnchor: [13, 31], popupAnchor: [0, -28],
});
function popupLead(l) {
  const wa = l.celular ? linkWhats(l) : '';
  return `<div class="pop"><b>${esc(l.nome)}</b><div class="meta">${esc(l.categoria || '')}${l.bairro ? ' · ' + esc(l.bairro) : ''}</div>
    ${l.telefone ? `<div>${ic('phone', 'xs')} ${esc(l.telefone)}</div>` : ''}
    ${l.avaliacao ? `<div style="margin-top:3px">${estrelas(l)}</div>` : ''}
    <div class="acts"><button class="btn sm primary" onclick="abrirLead(${l.id})">Detalhes</button>
    ${wa ? `<a class="btn sm whats" target="_blank" href="${wa}">${ic('whats', 'sm')}</a>` : ''}
    ${l.telefone_e164 ? `<a class="btn sm" href="tel:${esc(l.telefone_e164)}">${ic('phone', 'sm')}</a>` : ''}</div></div>`;
}
async function geocodificar(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Falha ao localizar');
  return r.json();
}

/* ------------------------------------------------------------ estado global */
const state = {
  rota: 'painel', mapaProsp: null, mapaLeads: null, marcadores: null, prefill: null, robos: [],
  leads: { f: {}, page: 1, per_page: 25, order: 'criado_em', dir: 'desc', sel: new Set(), modo: 'tabela', itens: [], total: 0 },
};
const job = { id: null, busca: null, resultados: [], vistos: new Set(), timer: null, extDesde: null, extTimer: null };

/* ------------------------------------------------------------ roteador */
const ROTAS = {
  painel: { titulo: 'Painel', sub: 'Visão geral da sua base de prospecção', render: renderPainel },
  prospeccao: { titulo: 'Prospecção no mapa', sub: 'Encontre empresas por bairro, rua, cidade ou área do mapa', render: renderProspeccao },
  leads: { titulo: 'Leads', sub: 'Empresas capturadas e seu andamento comercial', render: renderLeads },
  buscas: { titulo: 'Histórico de buscas', sub: 'Todas as prospecções realizadas', render: renderBuscas },
};

function navegar() {
  if (!usuario) return;
  const [rota, qs] = (location.hash.replace(/^#\/?/, '') || 'painel').split('?');
  const r = ROTAS[rota] ? rota : 'painel';
  if (state.mapaProsp) { state.mapaProsp.remove(); state.mapaProsp = null; }
  if (state.mapaLeads) { state.mapaLeads.remove(); state.mapaLeads = null; }
  state.rota = r;
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
  $('#pageTitle').textContent = ROTAS[r].titulo;
  $('#pageSub').textContent = ROTAS[r].sub;
  $('#topActions').innerHTML = '';
  $('#sidebar').classList.remove('open');
  ROTAS[r].render(new URLSearchParams(qs || ''));
  atualizarContador();
}
function refreshAtual() {
  if (state.rota === 'leads') carregarLeads();
  else if (state.rota === 'painel') renderPainel();
}
async function atualizarContador() {
  try { const r = await sb.from('prospecta_leads').select('id', { count: 'exact', head: true }); $('#navCount').textContent = nf(r.count); } catch { /* */ }
}
const erroHtml = (e) => `<div class="card"><div class="empty"><div class="ill" style="background:var(--danger-50);color:var(--danger)">${ic('alert')}</div><h4>Não foi possível carregar</h4><p>${esc(e.message)}</p></div></div>`;

/* =====================================================================
   LOGIN
   ===================================================================== */
function renderAuth(modo = 'entrar', aviso) {
  $('#auth').classList.remove('hidden');
  const box = $('#authBox');
  const titulos = {
    entrar: ['Entrar', 'Acesse sua base de prospecção.', 'Entrar'],
    criar: ['Criar conta', 'Leva menos de um minuto. Cada conta tem sua própria base de leads.', 'Criar conta'],
    recuperar: ['Recuperar senha', 'Enviaremos um link para você criar uma nova senha.', 'Enviar link'],
  }[modo];
  box.innerHTML = `
    <h3>${titulos[0]}</h3><p>${titulos[1]}</p>
    ${aviso ? `<div class="auth-msg ${aviso.tipo}">${esc(aviso.texto)}</div>` : ''}
    <form id="authForm">
      <div class="field"><label for="aEmail">E-mail</label><input class="input" id="aEmail" type="email" required autocomplete="username" value="${esc(ls.get('prospecta.email', ''))}"></div>
      ${modo !== 'recuperar' ? `<div class="field"><label for="aSenha">Senha</label><input class="input" id="aSenha" type="password" required minlength="6" autocomplete="${modo === 'criar' ? 'new-password' : 'current-password'}"></div>` : ''}
      <button class="btn primary lg block" id="aBtn">${titulos[2]}</button>
    </form>
    <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:13px">
      ${modo === 'entrar' ? '<button class="linkbtn" data-m="criar">Criar conta</button><button class="linkbtn" data-m="recuperar">Esqueci a senha</button>'
        : '<button class="linkbtn" data-m="entrar">← Voltar para entrar</button>'}
    </div>`;
  $$('[data-m]', box).forEach((b) => b.onclick = () => renderAuth(b.dataset.m));
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#aEmail').value.trim(), senha = $('#aSenha')?.value;
    ls.set('prospecta.email', email);
    const btn = $('#aBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      if (modo === 'entrar') ok(await sb.auth.signInWithPassword({ email, password: senha }));
      else if (modo === 'criar') {
        const d = ok(await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin + location.pathname } }));
        if (!d.session) renderAuth('entrar', { tipo: 'ok', texto: 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.' });
      } else {
        ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
        renderAuth('entrar', { tipo: 'ok', texto: 'Se o e-mail existir, você receberá o link para criar uma nova senha.' });
      }
    } catch (err) {
      renderAuth(modo, { tipo: 'err', texto: err.message });
    }
  };
  setTimeout(() => ($('#aSenha') && $('#aEmail').value ? $('#aSenha') : $('#aEmail')).focus(), 50);
}

async function novaSenha() {
  const m = await modal({
    titulo: 'Criar nova senha', corpo: '<div class="field"><label>Nova senha</label><input class="input" id="nsenha" type="password" minlength="6"></div>',
    confirmar: 'Salvar senha', cancelar: null, aoAbrir: (bg) => $('#nsenha', bg).focus(),
  });
  const v = m && $('#nsenha', m).value;
  if (!v || v.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres', 'err');
  try { ok(await sb.auth.updateUser({ password: v })); toast('Senha alterada'); } catch (e) { toast(e.message, 'err'); }
}

async function aoEntrar(sessao) {
  usuario = sessao.user;
  $('#auth').classList.add('hidden');
  $('#userEmail').textContent = usuario.email;
  $('#userAv').textContent = (usuario.email || '?')[0].toUpperCase();
  await carregarCfgRemoto();
  atualizarRobos();
  // reata a uma busca em andamento (ex.: após recarregar a página)
  try {
    const salvo = sessionStorage.getItem('prospecta.busca');
    const { data } = await sb.from('prospecta_buscas').select('id').in('status', ['pendente', 'executando'])
      .gte('criado_em', new Date(Date.now() - 3 * 3600e3).toISOString()).order('criado_em', { ascending: false }).limit(5);
    const alvo = (data || []).find((b) => b.id === salvo) || (data || [])[0];
    if (alvo) iniciarAcompanhamento(alvo.id);
  } catch { /* */ }
  navegar();
}

/* ------------------------------------------------------------ robôs (sinal de vida) */
const roboOnline = (tipo) => state.robos.some((r) => r.tipo === tipo && Date.now() - new Date(r.ultimo_sinal) < 75_000);
async function atualizarRobos() {
  try { state.robos = await db.robos(); } catch { state.robos = []; }
  $$('[data-dot]').forEach((d) => {
    const t = d.dataset.dot;
    d.className = 'dot ' + (roboOnline(t) ? 'on' : 'off');
    d.title = roboOnline(t) ? 'Robô online' : 'Robô offline';
  });
}

/* =====================================================================
   PAINEL
   ===================================================================== */
async function renderPainel() {
  $('#topActions').innerHTML = `<a class="btn primary" href="#/prospeccao">${ic('target', 'sm')}<span class="lbl">Nova prospecção</span></a>`;
  const v = $('#view');
  v.innerHTML = `<div class="kpis">${'<div class="card kpi"><div class="skeleton" style="width:50%"></div><div class="skeleton" style="height:28px;width:40%;margin-top:14px"></div></div>'.repeat(4)}</div>`;
  let s;
  try { s = await db.stats(); } catch (e) { v.innerHTML = erroHtml(e); return; }
  if (state.rota !== 'painel') return;

  if (!s.total) {
    v.innerHTML = `<div class="card"><div class="empty" style="padding:72px 20px">
      <div class="ill">${ic('map')}</div>
      <h4>Comece sua primeira prospecção</h4>
      <p>Escolha um segmento e uma região. O sistema coleta nome, telefone, endereço, bairro,<br>avaliação e site de cada empresa — e monta sua lista de leads.</p>
      <a class="btn primary lg" href="#/prospeccao">${ic('target')}Iniciar prospecção</a></div></div>`;
    return;
  }
  const kpi = (titulo, valor, rodape, icone, cor, fundo) => `<div class="card kpi">
    <div class="top">${titulo}<span class="ico" style="background:${fundo};color:${cor}">${ic(icone)}</span></div>
    <div class="val">${valor}</div><div class="foot">${rodape}</div></div>`;
  const mapaDia = Object.fromEntries((s.por_dia || []).map((d) => [d.dia, d.n]));
  const dias = [...Array(14)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const k = d.toLocaleDateString('sv-SE');
    return { k, n: mapaDia[k] || 0, rot: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) };
  });
  const maxDia = Math.max(1, ...dias.map((d) => d.n));
  const maxSt = Math.max(1, ...Object.values(s.por_status));
  const rank = (lista, vazio) => lista.length ? `<ul class="rank">${lista.map((r, i) => `<li><span class="pos">${i + 1}</span><span class="nm">${esc(r.nome)}</span><span class="n">${nf(r.n)}</span></li>`).join('')}</ul>` : `<p class="muted">${vazio}</p>`;
  const fontes = Object.entries(s.por_fonte || {}).map(([k, n]) => ({ nome: FONTES[k]?.label || k, n })).sort((a, b) => b.n - a.n);
  let recentes = [];
  try { recentes = (await db.buscas()).slice(0, 6); } catch { /* */ }

  v.innerHTML = `
  <div class="kpis">
    ${kpi('Total de leads', nf(s.total), `${nf(s.buscas)} buscas realizadas`, 'building', 'var(--primary)', 'var(--primary-50)')}
    ${kpi('Com telefone', nf(s.com_telefone), `${pct(s.com_telefone, s.total)}% da base · ${nf(s.celular)} celulares`, 'phone', 'var(--violet)', 'var(--violet-50)')}
    ${kpi('E-mail / CNPJ', `${nf(s.com_email)} <span style="font-size:18px;color:var(--muted)">/ ${nf(s.com_cnpj)}</span>`, `${nf(s.sem_site)} empresas sem site`, 'mail', 'var(--success)', 'var(--success-50)')}
    ${kpi('Clientes convertidos', nf(s.por_status.cliente), `Taxa de conversão de ${pct(s.por_status.cliente, s.total)}%`, 'trend', 'var(--warning)', 'var(--warning-50)')}
  </div>
  <div class="grid-2">
    <div class="card"><div class="card-h"><div><h3>Leads capturados</h3><div class="sub">Últimos 14 dias</div></div></div>
      <div class="card-b"><div class="bars">${dias.map((d) => `<div class="b"><i class="${d.n ? '' : 'zero'}" data-v="${d.n} leads" style="height:${Math.max(2, (d.n / maxDia) * 100)}%"></i><span>${d.rot}</span></div>`).join('')}</div></div></div>
    <div class="card"><div class="card-h"><div><h3>Funil comercial</h3><div class="sub">Distribuição por etapa</div></div><a class="btn sm" href="#/leads">Ver leads</a></div>
      <div class="card-b"><div class="funnel">${Object.entries(STATUS).map(([k, st]) => `
        <div class="fr"><span>${st.label}</span><div class="track"><i style="width:${(s.por_status[k] / maxSt) * 100}%;background:${st.cor}"></i></div><span class="n">${nf(s.por_status[k])}</span></div>`).join('')}
      </div></div></div>
  </div>
  <div class="grid-3" style="margin-bottom:18px">
    <div class="card"><div class="card-h"><h3>Bairros com mais leads</h3></div><div class="card-b">${rank(s.top_bairros, 'Sem dados de bairro ainda.')}</div></div>
    <div class="card"><div class="card-h"><h3>Segmentos principais</h3></div><div class="card-b">${rank(s.top_categorias, 'Sem categorias ainda.')}</div></div>
    <div class="card"><div class="card-h"><h3>Leads por fonte</h3></div><div class="card-b">${rank(fontes, 'Sem dados ainda.')}</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Buscas recentes</h3><a class="btn sm ghost" href="#/buscas">Ver todas</a></div><div class="card-b">
    <ul class="rank">${recentes.map((b) => `<li style="cursor:pointer" onclick="location.hash='#/leads?search_id=${b.id}'"><span class="pos">${ic(FONTES[b.fonte]?.icone || 'search', 'xs')}</span>
      <span class="nm"><b style="font-weight:600">${esc(b.termo)}</b> <span class="muted">· ${esc(b.modo === 'area' ? 'área do mapa' : b.local || '')} · ${FONTES[b.fonte]?.curto || ''} · ${fmtData(b.criado_em)}</span></span><span class="n">${nf(b.total_leads)}</span></li>`).join('')}</ul>
  </div></div>`;
}

/* =====================================================================
   PROSPECÇÃO
   ===================================================================== */
function renderProspeccao() {
  const pre = state.prefill || ls.get('prospecta.form', {});
  state.prefill = null;
  const modo = pre.modo || 'local';
  let fonte = pre.fonte || cfg.fonte || 'extensao';
  const rodando = ['pendente', 'executando'].includes(job.busca?.status);

  $('#view').innerHTML = `
  <div class="prospect">
    <div class="prospect-side">
      <div class="card"><div class="card-h"><div><h3>Nova prospecção</h3><div class="sub">Coleta direta do Google Maps, sem IA</div></div></div>
        <div class="card-b">
          <div class="field"><label>Motor de captura</label>
            <div class="fontes" id="fFonte">${Object.entries(FONTES).map(([k, f]) => `
              <button type="button" class="fonte ${k === fonte ? 'on' : ''}" data-v="${k}">
                ${k === 'nuvem' || k === 'desktop' ? `<span class="dot" data-dot="${k}"></span>` : ''}
                <b><span class="ico">${ic(f.icone, 'sm')}</span>${f.label}</b><small>${f.desc}</small></button>`).join('')}
            </div>
            <div class="fonte-info" id="fonteInfo"></div></div>

          <div class="field"><label for="fTermo">Segmento ou palavra-chave</label>
            <div class="input-icon">${ic('search', 'sm')}<input class="input" id="fTermo" list="dlSeg" placeholder="Ex.: clínicas odontológicas" value="${esc(pre.termo || '')}"></div>
            <datalist id="dlSeg">${SUGESTOES.map((s) => `<option value="${s}">`).join('')}</datalist></div>

          <div class="field"><label>Onde buscar</label>
            <div class="segmented" id="fModo">
              <button type="button" data-v="local" class="${modo === 'local' ? 'active' : ''}">${ic('pin', 'sm')}Bairro / rua / cidade</button>
              <button type="button" data-v="area" class="${modo === 'area' ? 'active' : ''}">${ic('map', 'sm')}Área do mapa</button>
            </div></div>

          <div id="boxLocal" class="${modo === 'local' ? '' : 'hidden'}">
            <div class="field"><label for="fLocal">Local</label>
              <div class="input-icon">${ic('pin', 'sm')}<input class="input" id="fLocal" placeholder="Ex.: Moema, São Paulo  ·  Rua Augusta, São Paulo" value="${esc(pre.local || '')}"></div>
              <span class="hint">Informe bairro, rua ou cidade. O mapa se posiciona automaticamente.</span></div>
            <label class="check"><input type="checkbox" id="fEstrito" ${pre.filtro_estrito ? 'checked' : ''}><span class="box"></span>
              <span><b>Somente dentro do local informado</b><small>Descarta empresas cujo endereço não contém o bairro/rua digitado.</small></span></label>
          </div>

          <div id="boxArea" class="${modo === 'area' ? '' : 'hidden'}">
            <div class="tip" style="margin-bottom:14px">${ic('info', 'sm')}<span>A busca usa a <b>área visível do mapa</b>. Arraste e dê zoom até enquadrar a região desejada.</span></div>
            <div class="field" id="boxGrade"><label for="fGrade">Cobertura da área</label>
              <select class="select" id="fGrade">
                <option value="1" ${pre.grade == 1 ? 'selected' : ''}>Padrão — uma busca no centro</option>
                <option value="2" ${pre.grade == 2 ? 'selected' : ''}>Varredura 2×2 — 4 sub-regiões</option>
                <option value="3" ${pre.grade == 3 ? 'selected' : ''}>Varredura 3×3 — 9 sub-regiões</option>
              </select>
              <span class="hint">Divide a área e busca em cada parte, superando o limite de resultados por busca do Google.</span></div>
          </div>

          <div class="field" id="boxMax"><label>Quantidade máxima de empresas</label>
            <div class="range-row"><input type="range" id="fMax" min="10" max="500" step="10" value="${pre.max_resultados || 60}"><output id="oMax" class="num">${pre.max_resultados || 60}</output></div></div>

          <label class="check" style="padding-top:0" id="boxEnr"><input type="checkbox" id="fEnr" ${pre.enriquecer ? 'checked' : ''}><span class="box"></span>
            <span><b>Buscar e-mail e redes sociais</b><small>Visita o site de cada empresa (deixa a busca mais lenta).</small></span></label>

          <div style="margin-top:10px">
            <button class="btn primary lg block ${rodando ? 'hidden' : ''}" id="btnIniciar">${ic('play', 'sm')}<span id="lblIniciar">Iniciar prospecção</span></button>
            <button class="btn danger lg block ${rodando ? '' : 'hidden'}" id="btnCancelar">${ic('stop', 'sm')}Interromper busca</button>
          </div>
        </div></div>

      <div class="card progress-card ${job.busca || job.extDesde ? '' : 'hidden'}" id="cardProg"></div>
    </div>

    <div class="prospect-main">
      <div class="card map-card">
        <div class="map" id="mapProsp"></div>
        <div class="map-search">
          <div class="input-icon">${ic('search', 'sm')}<input class="input" id="geoQ" placeholder="Ir para endereço, bairro ou cidade…" autocomplete="off"></div>
          <div class="geo-results hidden" id="geoRes"></div>
        </div>
        <div class="map-tools">
          <div class="map-pill" id="tilePick">
            <button data-t="google" class="${cfg.mapa === 'google' ? 'active' : ''}">Mapa</button>
            <button data-t="satelite" class="${cfg.mapa === 'satelite' ? 'active' : ''}">Satélite</button>
            <button data-t="osm" class="${cfg.mapa === 'osm' ? 'active' : ''}">OSM</button>
          </div>
          <button class="btn icon" id="btnLocate" title="Minha localização" style="box-shadow:var(--shadow)">${ic('locate', 'sm')}</button>
        </div>
        <div class="map-info" id="mapInfo">${ic('target', 'xs')}<span></span></div>
      </div>

      <div class="card live-list">
        <div class="card-h"><div><h3>Resultados desta busca</h3><div class="sub" id="liveSub">Os dados aparecem aqui em tempo real</div></div>
          <a class="btn sm ${job.busca ? '' : 'hidden'}" id="btnVerLeads" href="#/leads?search_id=${job.busca?.id || ''}">${ic('list', 'sm')}Abrir na lista</a></div>
        <div class="live-scroll" id="liveList"></div>
      </div>
    </div>
  </div>`;

  // ---------- mapa
  const ult = ls.get('prospecta.mapa', { c: [-23.5505, -46.6333], z: 13 });
  const map = criarMapa('mapProsp', pre.lat ? [pre.lat, pre.lng] : ult.c, pre.zoom || ult.z);
  state.mapaProsp = map;
  state.marcadores = L.layerGroup().addTo(map);
  const centroMk = L.marker(map.getCenter(), { icon: L.divIcon({ className: '', html: '<div class="area-center"></div>', iconSize: [18, 18] }), interactive: false }).addTo(map);
  const infoMapa = () => {
    const c = map.getCenter();
    centroMk.setLatLng(c);
    $('#mapInfo span').textContent = `Centro ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)} · zoom ${map.getZoom()}`;
    ls.set('prospecta.mapa', { c: [c.lat, c.lng], z: map.getZoom() });
  };
  map.on('move', infoMapa); infoMapa();
  setTimeout(() => map.invalidateSize(), 60);

  $$('#tilePick button').forEach((b) => b.onclick = () => {
    $$('#tilePick button').forEach((x) => x.classList.toggle('active', x === b));
    cfg.mapa = b.dataset.t; salvarCfgLocal(); map.trocarCamada(cfg.mapa);
  });
  $('#btnLocate').onclick = () => {
    if (!navigator.geolocation) return toast('Geolocalização indisponível', 'err');
    navigator.geolocation.getCurrentPosition((p) => map.flyTo([p.coords.latitude, p.coords.longitude], 15),
      () => toast('Não foi possível obter sua localização', 'err'));
  };

  // ---------- geocodificação (OpenStreetMap Nominatim — gratuito, sem IA)
  const geoRes = $('#geoRes');
  const irPara = (x) => {
    if (x.boundingbox) {
      const [s, n, w, e] = x.boundingbox.map(Number);
      map.flyToBounds([[s, w], [n, e]], { maxZoom: 16, duration: 0.8 });
    } else map.flyTo([+x.lat, +x.lon], 15);
  };
  const buscarGeo = debounce(async (q) => {
    if (q.length < 3) { geoRes.classList.add('hidden'); return; }
    try {
      const r = await geocodificar(q);
      geoRes.innerHTML = r.length ? r.map((x, i) => `<button data-i="${i}">${esc(x.display_name)}</button>`).join('') : '<button disabled>Nenhum local encontrado</button>';
      geoRes.classList.remove('hidden');
      $$('button[data-i]', geoRes).forEach((b) => b.onclick = () => {
        const x = r[b.dataset.i];
        irPara(x);
        $('#geoQ').value = x.display_name.split(',').slice(0, 2).join(',');
        geoRes.classList.add('hidden');
      });
    } catch { /* offline */ }
  }, 450);
  $('#geoQ').addEventListener('input', (e) => buscarGeo(e.target.value.trim()));
  $('#geoQ').addEventListener('blur', () => setTimeout(() => geoRes.classList.add('hidden'), 200));

  // ---------- formulário
  let modoAtual = modo;
  const infoFonte = () => {
    const el = $('#fonteInfo');
    const ext = fonte === 'extensao', places = fonte === 'places';
    $('#lblIniciar').textContent = ext ? 'Abrir no Google Maps' : 'Iniciar prospecção';
    $('#boxEnr').classList.toggle('hidden', ext || places);
    $('#boxMax').classList.toggle('hidden', ext);
    $('#boxGrade').classList.toggle('hidden', ext);
    $('#fMax').max = places ? 180 : 500;
    if (fonte === 'extensao') el.innerHTML = `<div class="tip">${ic('puzzle', 'sm')}<span>O Google Maps abre em outra aba. Lá, clique no botão <b>Prospecta</b> e em <b>Capturar resultados</b> — o progresso aparece aqui. <a href="${C.EXTENSAO_URL}" target="_blank">Instalar a extensão</a></span></div>`;
    else if (fonte === 'desktop') el.innerHTML = roboOnline('desktop')
      ? `<div class="tip">${ic('check', 'sm')}<span>Robô do seu PC <b>online</b>. A busca roda no seu computador.</span></div>`
      : `<div class="tip" style="background:var(--warning-50);border-color:#F5D9B0;color:#7A3E06">${ic('alert', 'sm')}<span>Robô do PC offline. <a href="${C.ROBO_EXE_URL}">Baixe o ProspectaRobo.exe</a>, execute e entre com sua conta. A busca fica na fila até ele ligar.</span></div>`;
    else if (fonte === 'nuvem') el.innerHTML = roboOnline('nuvem')
      ? `<div class="tip">${ic('check', 'sm')}<span>Robô na nuvem <b>online</b>. Pode fechar o navegador — a busca continua.</span></div>`
      : `<div class="tip" style="background:var(--warning-50);border-color:#F5D9B0;color:#7A3E06">${ic('alert', 'sm')}<span>Robô na nuvem offline. Publique o robô (pasta <code>robo/</code>, ver README) — a busca fica na fila até ele ligar.</span></div>`;
    else el.innerHTML = `<div class="tip">${ic('api', 'sm')}<span>Usa a API oficial do Google (endereço já estruturado). Até 60 resultados por região; use a varredura para mais. Cobrança por uso na sua conta Google Cloud.</span></div>`;
  };
  $$('#fFonte .fonte').forEach((b) => b.onclick = () => {
    fonte = b.dataset.v;
    $$('#fFonte .fonte').forEach((x) => x.classList.toggle('on', x === b));
    cfg.fonte = fonte; salvarCfgLocal();
    infoFonte();
  });
  atualizarRobos().then(infoFonte);
  infoFonte();

  $$('#fModo button').forEach((b) => b.onclick = () => {
    modoAtual = b.dataset.v;
    $$('#fModo button').forEach((x) => x.classList.toggle('active', x === b));
    $('#boxLocal').classList.toggle('hidden', modoAtual !== 'local');
    $('#boxArea').classList.toggle('hidden', modoAtual !== 'area');
  });
  $('#fMax').oninput = (e) => { $('#oMax').textContent = e.target.value; };
  $('#fLocal').addEventListener('change', async (e) => {
    const q = e.target.value.trim();
    if (q.length < 3) return;
    try { const r = await geocodificar(q); if (r[0]) irPara(r[0]); } catch { /* */ }
  });

  $('#btnIniciar').onclick = async () => {
    const termo = $('#fTermo').value.trim();
    const local = $('#fLocal').value.trim();
    if (termo.length < 2) { $('#fTermo').focus(); return toast('Informe o segmento ou palavra-chave', 'err'); }
    if (modoAtual === 'local' && !local) { $('#fLocal').focus(); return toast('Informe o bairro, rua ou cidade', 'err'); }
    const b = map.getBounds(), c = map.getCenter();
    ls.set('prospecta.form', { termo, local, modo: modoAtual, fonte, grade: +$('#fGrade').value, max_resultados: +$('#fMax').value, enriquecer: $('#fEnr').checked, filtro_estrito: $('#fEstrito').checked });

    if (fonte === 'extensao') {
      const consulta = modoAtual === 'local' ? `${termo} em ${local}` : termo;
      const pos = modoAtual === 'area' ? `/@${c.lat.toFixed(6)},${c.lng.toFixed(6)},${map.getZoom()}z` : '';
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(consulta)}${pos}?hl=pt-BR`, '_blank', 'noopener');
      aguardarExtensao();
      return;
    }
    const dados = {
      termo, local: modoAtual === 'local' ? local : null, modo: modoAtual, fonte,
      latitude: c.lat, longitude: c.lng, zoom: map.getZoom(),
      bounds: { norte: b.getNorth(), sul: b.getSouth(), leste: b.getEast(), oeste: b.getWest() },
      grade: modoAtual === 'area' ? +$('#fGrade').value : 1,
      max_resultados: +$('#fMax').value,
      opcoes: { enriquecer: $('#fEnr').checked, filtro_estrito: $('#fEstrito').checked, headless: cfg.headless, concorrencia: cfg.concorrencia },
    };
    const btn = $('#btnIniciar'); btn.disabled = true;
    try {
      const busca = await db.criarBusca(dados);
      iniciarAcompanhamento(busca.id, true);
      if (fonte === 'places') {
        const { error } = await sb.functions.invoke('places-search', { body: { busca_id: busca.id } });
        if (error) {
          let msg = error.message;
          try { const j = await error.context.json(); msg = j.erro || msg; } catch { /* */ }
          if (/Failed to send|not found|404/i.test(msg)) msg = 'A função "places-search" ainda não foi publicada no Supabase (veja o README).';
          await sb.from('prospecta_buscas').update({ status: 'erro', fase: 'erro', erro: msg, finalizado_em: new Date().toISOString() }).eq('id', busca.id);
          toast(msg, 'err');
        }
      } else {
        toast(roboOnline(fonte) ? 'Busca enviada para o robô' : 'Busca na fila — aguardando o robô ficar online', roboOnline(fonte) ? 'ok' : 'info');
      }
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; }
  };
  $('#btnCancelar').onclick = cancelarJob;

  pintarResultados(job.resultados, true);
  atualizarJobUI();
}

function itemAoVivo(l, i) {
  const novo = job.busca && new Date(l.criado_em) >= new Date(job.busca.criado_em);
  return `<div class="live-item" onclick="abrirLead(${l.id})">
    <span class="idx">${i}</span>
    <span class="nm"><b>${esc(l.nome)}</b><small>${esc(l.categoria || '—')}</small></span>
    <span class="cell">${l.telefone ? `<span class="phone">${l.celular ? `<span class="wa-dot" title="Celular / WhatsApp">${ic('whats', 'xs')}</span>` : ''}${esc(l.telefone)}</span>` : '<span class="muted">Sem telefone</span>'}</span>
    <span class="cell">${esc(l.bairro || l.cidade || '—')}</span>
    <span>${novo ? '<span class="badge b-ok plain">Novo</span>' : '<span class="badge b-muted plain">Já na base</span>'}</span>
  </div>`;
}

function pintarResultados(lista, reset = false) {
  const el = $('#liveList');
  if (!el) return;
  if (reset) {
    el.innerHTML = '';
    state.marcadores?.clearLayers();
    if ($('#liveSub')) $('#liveSub').textContent = 'Os dados aparecem aqui em tempo real';
    if (!lista.length) {
      el.innerHTML = `<div class="empty" style="padding:34px 20px"><div class="ill">${ic('building')}</div><h4>Nenhum resultado ainda</h4><p>Escolha o motor, configure a busca ao lado e clique em <b>Iniciar</b>.</p></div>`;
      return;
    }
  } else if (lista.length && $('.empty', el)) el.innerHTML = '';
  const base = reset ? 0 : job.resultados.length - lista.length;
  el.insertAdjacentHTML('afterbegin', lista.map((l, k) => itemAoVivo(l, base + k + 1)).reverse().join(''));
  lista.forEach((l, k) => {
    if (l.latitude && state.marcadores) L.marker([l.latitude, l.longitude], { icon: pinIcon(base + k + 1) }).bindPopup(popupLead(l)).addTo(state.marcadores);
  });
  if ($('#liveSub')) $('#liveSub').textContent = `${nf(job.resultados.length)} empresas salvas`;
}

/* ------------------------------------------------------------ acompanhamento */
function iniciarAcompanhamento(id, novo = false) {
  pararEsperaExtensao();
  job.id = id; job.busca = null; job.resultados = []; job.vistos = new Set(); job.ultSalvos = -1;
  sessionStorage.setItem('prospecta.busca', id);
  if (novo) pintarResultados([], true);
  clearInterval(job.timer);
  job.timer = setInterval(pollJob, 1600);
  pollJob();
}

async function pollJob() {
  if (!job.id || job.polling) return;
  job.polling = true;
  try {
    const b = await db.busca(job.id);
    job.busca = b;
    if (b.salvos !== job.ultSalvos) {
      job.ultSalvos = b.salvos;
      const todos = await db.leadsDaBusca(job.id);
      const novos = todos.filter((l) => !job.vistos.has(l.id));
      novos.forEach((l) => job.vistos.add(l.id));
      if (novos.length) {
        job.resultados.push(...novos);
        if (state.rota === 'prospeccao') pintarResultados(novos);
      }
    }
    atualizarJobUI();
    if (!['pendente', 'executando'].includes(b.status)) {
      clearInterval(job.timer); job.timer = null;
      sessionStorage.removeItem('prospecta.busca');
      const msg = b.status === 'concluida' ? `Prospecção concluída: ${b.salvos} empresas (${b.novos} novas)` :
        b.status === 'cancelada' ? `Busca interrompida: ${b.salvos} empresas salvas` : `A busca falhou: ${b.erro || 'erro desconhecido'}`;
      toast(msg, b.status === 'erro' ? 'err' : 'ok', b.salvos ? { label: 'Ver leads', fn: () => { location.hash = `#/leads?search_id=${b.id}`; } } : null);
      if (state.rota === 'prospeccao' && state.mapaProsp) {
        const pts = job.resultados.filter((l) => l.latitude).map((l) => [l.latitude, l.longitude]);
        if (pts.length) state.mapaProsp.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
      }
      atualizarContador();
    }
  } catch (e) {
    clearInterval(job.timer); job.timer = null;
    toast(e.message, 'err');
  } finally { job.polling = false; }
}

// Fonte "extensão": a busca é criada pela própria extensão; o site procura por ela
function aguardarExtensao() {
  pararEsperaExtensao();
  clearInterval(job.timer); job.timer = null;
  job.id = null; job.busca = null; job.resultados = []; job.vistos = new Set();
  sessionStorage.removeItem('prospecta.busca');
  pintarResultados([], true);
  job.extDesde = new Date(Date.now() - 5000).toISOString();
  atualizarJobUI();
  const inicio = Date.now();
  job.extTimer = setInterval(async () => {
    if (Date.now() - inicio > 20 * 60e3) { pararEsperaExtensao(); atualizarJobUI(); return; }
    const { data } = await sb.from('prospecta_buscas').select('id').eq('fonte', 'extensao').gte('criado_em', job.extDesde).order('criado_em', { ascending: false }).limit(1);
    if (data?.[0]) { toast('Captura pela extensão iniciada'); iniciarAcompanhamento(data[0].id, true); }
  }, 2500);
}
function pararEsperaExtensao() { clearInterval(job.extTimer); job.extTimer = null; job.extDesde = null; }

async function cancelarJob() {
  if (job.extDesde && !job.busca) { pararEsperaExtensao(); atualizarJobUI(); return; }
  if (!job.busca) return;
  try { await db.cancelar(job.busca); toast('Interrompendo a busca…', 'info'); pollJob(); } catch (e) { toast(e.message, 'err'); }
}

const FASES = {
  pendente: 'Na fila — aguardando o robô', iniciando: 'Iniciando navegador', coletando: 'Coletando empresas na lista do mapa',
  extraindo: 'Extraindo dados de cada empresa', concluido: 'Concluído', cancelado: 'Cancelado', erro: 'Erro',
};
function progresso(b) {
  if (!b) return null;
  if (b.status === 'pendente' || b.fase === 'iniciando') return null;
  if (b.fase === 'coletando') return b.encontrados ? Math.min(40, (b.encontrados / (b.max_resultados || 60)) * 40) : null;
  if (b.fase === 'extraindo') return 40 + (b.encontrados ? Math.min(1, b.processados / b.encontrados) * 60 : 0);
  return 100;
}

function atualizarJobUI() {
  const b = job.busca;
  const rodando = ['pendente', 'executando'].includes(b?.status) || (!!job.extDesde && !b);
  const sj = $('#sideJob');
  if (rodando) {
    const p = progresso(b);
    sj.classList.remove('hidden');
    sj.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span class="spinner" style="width:12px;height:12px;color:#5B8CFF"></span><b style="font-weight:600">${b ? (b.status === 'pendente' ? 'Na fila…' : 'Prospectando…') : 'Aguardando extensão…'}</b></div>
      <div style="margin-top:4px;color:#A9B5CC">${b ? `${esc(b.termo)} · ${nf(b.salvos)} salvas` : 'Clique em Capturar no Google Maps'}</div><div class="bar"><i style="width:${p ?? 8}%"></i></div>`;
    sj.onclick = () => { location.hash = '#/prospeccao'; };
  } else sj.classList.add('hidden');

  if (state.rota !== 'prospeccao') return;
  $('#btnIniciar')?.classList.toggle('hidden', rodando);
  $('#btnCancelar')?.classList.toggle('hidden', !rodando);
  const card = $('#cardProg');
  if (!card) return;
  if (!b && !job.extDesde) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  if (!b) {
    card.innerHTML = `<div class="card-h"><div><h3>Aguardando a extensão</h3><div class="sub">Google Maps aberto em outra aba</div></div><span class="badge b-run">Esperando</span></div>
      <div class="card-b"><div class="pbar indet"><i></i></div>
      <ol style="margin:14px 0 0;padding-left:18px;color:var(--text-2);line-height:1.7;font-size:13px">
        <li>Na aba do Google Maps, clique no botão <b>Prospecta</b> (canto superior direito).</li>
        <li>Confira a busca e clique em <b>Capturar resultados</b>.</li>
        <li>O progresso aparece aqui automaticamente.</li></ol>
      <p class="muted" style="margin:10px 0 0">Não tem a extensão? <a href="${C.EXTENSAO_URL}" target="_blank">Veja como instalar</a>.</p></div>`;
    return;
  }
  const btnVer = $('#btnVerLeads');
  if (btnVer) { btnVer.classList.remove('hidden'); btnVer.href = `#/leads?search_id=${b.id}`; }
  const p = progresso(b);
  const ativo = ['pendente', 'executando'].includes(b.status);
  const badge = { pendente: '<span class="badge b-warn">Na fila</span>', executando: '<span class="badge b-run">Em andamento</span>', concluida: '<span class="badge b-ok">Concluída</span>', cancelada: '<span class="badge b-warn">Interrompida</span>', erro: '<span class="badge b-err">Erro</span>' }[b.status] || '';
  const inicio = new Date(b.iniciado_em || b.criado_em), fim = b.finalizado_em ? new Date(b.finalizado_em) : new Date();
  const espera = b.status === 'pendente' && ['nuvem', 'desktop'].includes(b.fonte) && !roboOnline(b.fonte)
    ? `<div class="tip" style="margin-bottom:12px;background:var(--warning-50);border-color:#F5D9B0;color:#7A3E06">${ic('alert', 'sm')}<span>${b.fonte === 'desktop' ? `O robô do seu PC está offline. <a href="${C.ROBO_EXE_URL}">Baixe e abra o ProspectaRobo.exe</a>.` : 'O robô na nuvem está offline. Verifique o serviço publicado.'}</span></div>` : '';
  card.innerHTML = `<div class="card-h"><div><h3>${esc(FASES[b.status === 'pendente' ? 'pendente' : b.fase] || 'Preparando')}</h3><div class="sub">${FONTES[b.fonte]?.label || ''} · ${fmtDuracao((fim - inicio) / 1000)}</div></div>${badge}</div>
    <div class="card-b">${espera}
      <div class="pbar ${ativo && p === null ? 'indet' : ''}"><i style="width:${ativo ? (p ?? 0) : 100}%"></i></div>
      <div class="stats">
        <div class="stat"><b>${nf(b.encontrados)}</b><span>Encontradas</span></div>
        <div class="stat"><b>${nf(b.processados)}</b><span>Processadas</span></div>
        <div class="stat"><b>${nf(b.salvos)}</b><span>Salvas · ${nf(b.novos)} novas</span></div>
      </div>
      <div class="logbox" id="logbox">${(b.logs || []).slice(-40).map((l) => `<div class="${esc(l.nivel)}"><span class="t">${esc(l.t)}</span>${esc(l.msg)}</div>`).join('') || '<div><span class="t">--:--:--</span>Aguardando…</div>'}</div>
    </div>`;
  const lb = $('#logbox'); if (lb) lb.scrollTop = lb.scrollHeight;
}

/* =====================================================================
   LEADS
   ===================================================================== */
async function renderLeads(qs) {
  const L_ = state.leads;
  if (qs && [...qs.keys()].length) { L_.f = {}; L_.page = 1; for (const [k, v] of qs) L_.f[k] = v; }
  L_.sel.clear();

  $('#topActions').innerHTML = `
    <div class="dropdown"><button class="btn" id="btnExport">${ic('download', 'sm')}<span class="lbl">Exportar</span></button></div>
    <a class="btn primary" href="#/prospeccao">${ic('target', 'sm')}<span class="lbl">Nova prospecção</span></a>`;
  $('#btnExport').onclick = (e) => menuExportar(e.currentTarget);

  let opc = { bairros: [], cidades: [], categorias: [], buscas: [] };
  try { opc = await db.filtros(); } catch (e) { $('#view').innerHTML = erroHtml(e); return; }
  if (state.rota !== 'leads') return;
  const opts = (lista, sel, rot) => `<option value="">${rot}</option>` + lista.map((x) => `<option ${x == sel ? 'selected' : ''} value="${esc(x)}">${esc(x)}</option>`).join('');
  const f = L_.f;
  const chip = (k, rot) => `<button class="chip ${f[k] ? 'on' : ''}" data-chip="${k}">${f[k] ? ic('check', 'xs') : ''}${rot}</button>`;

  $('#view').innerHTML = `
  <div class="card">
    <div class="toolbar">
      <div class="grow input-icon">${ic('search', 'sm')}<input class="input" id="lq" placeholder="Buscar por nome, telefone, endereço, e-mail, CNPJ, nota…" value="${esc(f.q || '')}"></div>
      <select class="select" data-f="status"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      <select class="select" data-f="cidade">${opts(opc.cidades, f.cidade, 'Todas as cidades')}</select>
      <select class="select" data-f="bairro">${opts(opc.bairros, f.bairro, 'Todos os bairros')}</select>
      <select class="select" data-f="categoria">${opts(opc.categorias, f.categoria, 'Todos os segmentos')}</select>
      <select class="select" data-f="fonte"><option value="">Todas as fontes</option>${Object.entries(FONTES).map(([k, x]) => `<option value="${k}" ${f.fonte === k ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
      <select class="select" data-f="search_id"><option value="">Todas as buscas</option>${opc.buscas.map((b) => `<option value="${b.id}" ${f.search_id == b.id ? 'selected' : ''}>${esc(b.termo)}${b.local ? ' — ' + esc(b.local) : ''} (${fmtData(b.criado_em, false)})</option>`).join('')}</select>
    </div>
    <div class="chips">
      ${chip('com_telefone', 'Com telefone')}${chip('whatsapp', 'Celular / WhatsApp')}${chip('com_email', 'Com e-mail')}${chip('com_cnpj', 'Com CNPJ')}${chip('com_site', 'Com site')}${chip('sem_site', 'Sem site')}
      <button class="btn sm ghost" id="limpar">${ic('x', 'xs')}Limpar filtros</button>
      <div style="margin-left:auto" class="segmented" id="modoVis">
        <button data-m="tabela" class="${L_.modo === 'tabela' ? 'active' : ''}">${ic('list', 'sm')}Tabela</button>
        <button data-m="mapa" class="${L_.modo === 'mapa' ? 'active' : ''}">${ic('map', 'sm')}Mapa</button>
      </div>
    </div>
    <div id="bulk"></div>
    <div id="leadsBody"></div>
  </div>`;

  const aplicar = () => { L_.page = 1; carregarLeads(); };
  $('#lq').addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); aplicar(); }, 350));
  $$('[data-f]').forEach((s) => s.onchange = () => { f[s.dataset.f] = s.value; aplicar(); });
  $$('[data-chip]').forEach((c) => c.onclick = () => {
    const k = c.dataset.chip;
    f[k] = f[k] ? '' : '1';
    if (k === 'sem_site' && f[k]) f.com_site = '';
    if (k === 'com_site' && f[k]) f.sem_site = '';
    renderLeads();
  });
  $('#limpar').onclick = () => { L_.f = {}; L_.page = 1; history.replaceState(null, '', '#/leads'); renderLeads(); };
  $$('#modoVis button').forEach((b) => b.onclick = () => { L_.modo = b.dataset.m; $$('#modoVis button').forEach((x) => x.classList.toggle('active', x === b)); carregarLeads(); });
  carregarLeads();
}

async function carregarLeads() {
  const L_ = state.leads;
  const body = $('#leadsBody');
  if (!body) return;
  if (state.mapaLeads) { state.mapaLeads.remove(); state.mapaLeads = null; }

  if (L_.modo === 'mapa') {
    body.innerHTML = '<div class="leads-map"><div class="map" id="mapLeads" style="border-radius:0 0 14px 14px"></div></div>';
    let itens = [];
    try { itens = await db.todosLeads(L_.f, 3000); } catch (e) { body.innerHTML = erroHtml(e); return; }
    const ult = ls.get('prospecta.mapa', { c: [-23.55, -46.63], z: 12 });
    const map = criarMapa('mapLeads', ult.c, ult.z);
    state.mapaLeads = map;
    const pts = [];
    itens.forEach((l, i) => {
      if (!l.latitude) return;
      pts.push([l.latitude, l.longitude]);
      L.marker([l.latitude, l.longitude], { icon: pinIcon(i + 1, l.status) }).bindPopup(popupLead(l)).addTo(map);
    });
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    setTimeout(() => map.invalidateSize(), 60);
    renderBulk();
    return;
  }

  body.innerHTML = `<div style="padding:18px">${'<div class="skeleton" style="margin:12px 0"></div>'.repeat(6)}</div>`;
  let r;
  try { r = await db.leads(L_.f, { page: L_.page, per_page: L_.per_page, order: L_.order, dir: L_.dir }); }
  catch (e) { body.innerHTML = erroHtml(e); return; }
  L_.itens = r.items; L_.total = r.total;

  if (!r.items.length) {
    const temFiltro = Object.values(L_.f).some(Boolean);
    body.innerHTML = `<div class="empty"><div class="ill">${ic(temFiltro ? 'search' : 'users')}</div>
      <h4>${temFiltro ? 'Nenhum lead com esses filtros' : 'Sua lista de leads está vazia'}</h4>
      <p>${temFiltro ? 'Ajuste ou limpe os filtros para ver mais resultados.' : 'Faça uma prospecção no mapa para começar a capturar empresas.'}</p>
      ${temFiltro ? '' : `<a class="btn primary" href="#/prospeccao">${ic('target', 'sm')}Nova prospecção</a>`}</div>`;
    renderBulk();
    return;
  }

  const th = (k, rot) => `<th class="sortable ${L_.order === k ? 'sorted' : ''}" data-o="${k}">${rot}<span class="arr">${L_.order === k ? (L_.dir === 'asc' ? '↑' : '↓') : '↕'}</span></th>`;
  const todos = r.items.every((l) => L_.sel.has(l.id));
  const pags = Math.max(1, Math.ceil(r.total / L_.per_page));
  body.innerHTML = `<div class="table-wrap"><table class="t">
    <thead><tr><th style="width:38px"><input type="checkbox" id="selAll" ${todos ? 'checked' : ''}></th>
      ${th('nome', 'Empresa')}<th>Telefone</th><th>Endereço</th>${th('bairro', 'Bairro / Cidade')}${th('avaliacao', 'Avaliação')}${th('score', 'Score')}${th('status', 'Status')}<th style="text-align:right">Ações</th></tr></thead>
    <tbody>${r.items.map((l) => `
      <tr data-id="${l.id}" class="${L_.sel.has(l.id) ? 'sel' : ''}">
        <td data-stop><input type="checkbox" class="sel" data-id="${l.id}" ${L_.sel.has(l.id) ? 'checked' : ''}></td>
        <td class="co"><b title="${esc(l.nome)}">${esc(l.nome)}</b><small>${esc(l.categoria || '—')}${l.situacao && l.situacao !== 'Ativo' ? ` · <span style="color:var(--danger)">${esc(l.situacao)}</span>` : ''}${l.cnpj ? ' · CNPJ' : ''}</small></td>
        <td class="nw">${l.telefone ? `<span class="phone">${l.celular ? `<span class="wa-dot" title="Celular / provável WhatsApp">${ic('whats', 'xs')}</span>` : ''}${esc(l.telefone)}</span>` : '<span class="muted">—</span>'}</td>
        <td><div class="addr" title="${esc(l.endereco)}">${esc(enderecoCurto(l)) || '<span class="muted">—</span>'}</div></td>
        <td class="co loc"><b style="font-weight:550">${esc(l.bairro) || '<span class="muted">—</span>'}</b><small>${l.cidade ? esc(l.cidade) + (l.uf ? ' / ' + esc(l.uf) : '') : ''}</small></td>
        <td>${estrelas(l)}</td>
        <td>${scoreHtml(l.score || 0)}</td>
        <td data-stop><select class="status-select st-${l.status}" data-id="${l.id}">${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select></td>
        <td data-stop><div class="row-acts">
          ${l.celular ? `<a class="btn icon sm ghost whats" title="WhatsApp" data-wa="${l.id}" target="_blank" href="${linkWhats(l)}">${ic('whats', 'sm')}</a>` : ''}
          ${l.telefone_e164 ? `<a class="btn icon sm ghost" title="Ligar" data-tel="${l.id}" href="tel:${esc(l.telefone_e164)}">${ic('phone', 'sm')}</a>` : ''}
          ${l.site ? `<a class="btn icon sm ghost" title="Site" target="_blank" href="${esc(linkSite(l.site))}">${ic('globe', 'sm')}</a>` : ''}
          ${l.maps_url ? `<a class="btn icon sm ghost" title="Abrir no Google Maps" target="_blank" href="${esc(l.maps_url)}">${ic('pin', 'sm')}</a>` : ''}
        </div></td>
      </tr>`).join('')}</tbody></table></div>
    <div class="pager"><span>Mostrando <b>${nf((L_.page - 1) * L_.per_page + 1)}–${nf(Math.min(L_.page * L_.per_page, r.total))}</b> de <b>${nf(r.total)}</b> leads</span>
      <div class="pg">
        <select class="select" id="perPage" style="height:32px;width:auto;font-size:12.5px">${[25, 50, 100, 200].map((n) => `<option ${n === L_.per_page ? 'selected' : ''} value="${n}">${n} por página</option>`).join('')}</select>
        <button class="btn icon sm" id="pgPrev" ${L_.page <= 1 ? 'disabled' : ''}>${ic('chev-l', 'sm')}</button>
        <span class="num">${L_.page} / ${pags}</span>
        <button class="btn icon sm" id="pgNext" ${L_.page >= pags ? 'disabled' : ''}>${ic('chev-r', 'sm')}</button>
      </div></div>`;

  $$('tbody tr', body).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('[data-stop]')) abrirLead(+tr.dataset.id); }));
  $$('th[data-o]', body).forEach((t) => t.onclick = () => {
    const k = t.dataset.o;
    if (L_.order === k) L_.dir = L_.dir === 'asc' ? 'desc' : 'asc';
    else { L_.order = k; L_.dir = ['nome', 'bairro', 'cidade', 'status'].includes(k) ? 'asc' : 'desc'; }
    carregarLeads();
  });
  $$('input.sel', body).forEach((c) => c.onchange = () => {
    const id = +c.dataset.id;
    c.checked ? L_.sel.add(id) : L_.sel.delete(id);
    c.closest('tr').classList.toggle('sel', c.checked);
    renderBulk();
  });
  $('#selAll').onchange = (e) => { r.items.forEach((l) => (e.target.checked ? L_.sel.add(l.id) : L_.sel.delete(l.id))); carregarLeads(); };
  $$('.status-select', body).forEach((s) => s.onchange = async () => {
    try {
      await db.atualizar(+s.dataset.id, { status: s.value });
      s.className = `status-select st-${s.value}`;
      const l = L_.itens.find((x) => x.id === +s.dataset.id); if (l) l.status = s.value;
      toast(`Status alterado para ${STATUS[s.value].label}`);
    } catch (e) { toast(e.message, 'err'); }
  });
  $$('[data-wa]', body).forEach((a) => a.addEventListener('click', () => registrarContato(L_.itens.find((x) => x.id === +a.dataset.wa), 'whatsapp')));
  $$('[data-tel]', body).forEach((a) => a.addEventListener('click', () => registrarContato(L_.itens.find((x) => x.id === +a.dataset.tel), 'ligacao')));
  $('#perPage').onchange = (e) => { L_.per_page = +e.target.value; L_.page = 1; carregarLeads(); };
  $('#pgPrev').onclick = () => { L_.page--; carregarLeads(); };
  $('#pgNext').onclick = () => { L_.page++; carregarLeads(); };
  renderBulk();
}

function renderBulk() {
  const L_ = state.leads, el = $('#bulk');
  if (!el) return;
  if (!L_.sel.size) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="bulkbar">${ic('check', 'sm')}${nf(L_.sel.size)} selecionado(s)
    <select class="select" id="bkStatus"><option value="">Alterar status…</option>${Object.entries(STATUS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('')}</select>
    <button class="btn sm" id="bkEnr">${ic('refresh', 'xs')}Enriquecer</button>
    <button class="btn sm" id="bkTag">${ic('note', 'xs')}Adicionar tag</button>
    <button class="btn sm" id="bkExp">${ic('download', 'xs')}Exportar seleção</button>
    <button class="btn sm danger" id="bkDel">${ic('trash', 'xs')}Excluir</button>
    <button class="btn sm ghost" id="bkClear" style="margin-left:auto">Limpar seleção</button></div>`;
  const ids = [...L_.sel];
  $('#bkStatus').onchange = async (e) => {
    if (!e.target.value) return;
    try { await db.massa(ids, 'status', e.target.value); toast(`${ids.length} lead(s) movidos para ${STATUS[e.target.value].label}`); L_.sel.clear(); carregarLeads(); }
    catch (err) { toast(err.message, 'err'); }
  };
  $('#bkEnr').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    let n = 0, achou = 0;
    for (const id of ids) {
      b.innerHTML = `<span class="spinner"></span>${++n}/${ids.length}`;
      try { const r = await db.enriquecer(id); if (r.encontrados?.length) achou++; }
      catch (err) { toast(err.message, 'err'); break; }
    }
    toast(`Enriquecimento concluído: ${achou} de ${ids.length} com dados novos`);
    carregarLeads();
  };
  $('#bkTag').onclick = async () => {
    const m = await modal({ titulo: 'Adicionar tag', texto: `Aplicar uma tag aos ${ids.length} leads selecionados.`, corpo: '<input class="input" id="tagIn" placeholder="Ex.: prioridade, visita, campanha-out">', confirmar: 'Aplicar', aoAbrir: (bg) => $('#tagIn', bg).focus() });
    const v = m && $('#tagIn', m).value.trim();
    if (!v) return;
    try { await db.massa(ids, 'tag', v); toast('Tag aplicada'); carregarLeads(); } catch (err) { toast(err.message, 'err'); }
  };
  $('#bkExp').onclick = (e) => menuExportar(e.currentTarget, ids);
  $('#bkDel').onclick = async () => {
    if (!(await modal({ titulo: 'Excluir leads', texto: `Excluir definitivamente ${ids.length} lead(s)? Esta ação não pode ser desfeita.`, confirmar: 'Excluir', perigo: true }))) return;
    try { await db.massa(ids, 'excluir'); toast('Leads excluídos'); L_.sel.clear(); carregarLeads(); atualizarContador(); } catch (err) { toast(err.message, 'err'); }
  };
  $('#bkClear').onclick = () => { L_.sel.clear(); carregarLeads(); };
}

/* ------------------------------------------------------------ exportação (no navegador) */
const COLUNAS = [
  ['nome', 'Empresa', 34], ['categoria', 'Categoria', 22], ['telefone', 'Telefone', 17], ['whatsapp', 'WhatsApp', 30],
  ['email', 'E-mail', 28], ['site', 'Site', 30], ['instagram', 'Instagram', 30], ['facebook', 'Facebook', 30], ['linkedin', 'LinkedIn', 30],
  ['endereco', 'Endereço completo', 50], ['rua', 'Rua', 30], ['numero', 'Número', 9], ['complemento', 'Complemento', 16],
  ['bairro', 'Bairro', 20], ['cidade', 'Cidade', 18], ['uf', 'UF', 5], ['cep', 'CEP', 11], ['latitude', 'Latitude', 11], ['longitude', 'Longitude', 11],
  ['avaliacao', 'Avaliação', 10], ['num_avaliacoes', 'Nº avaliações', 13], ['horario', 'Horário', 40], ['situacao', 'Situação', 14],
  ['cnpj', 'CNPJ', 20], ['razao_social', 'Razão social', 34], ['porte', 'Porte', 16], ['abertura', 'Abertura', 12], ['cnae', 'CNAE', 40],
  ['situacao_cadastral', 'Situação cadastral', 16], ['capital_social', 'Capital social', 14],
  ['site_status', 'Site status', 11], ['site_plataforma', 'Plataforma do site', 18], ['site_rastreamento', 'Rastreamento', 24],
  ['status', 'Status (funil)', 15], ['score', 'Score', 8], ['tags', 'Tags', 18], ['notas', 'Notas', 30], ['ultimo_contato', 'Último contato', 18],
  ['fonte', 'Fonte', 12], ['maps_url', 'Google Maps', 30], ['criado_em', 'Capturado em', 18],
];
function linhaExport(l) {
  const e164 = (l.telefone_e164 || '').replace(/\D/g, '');
  return COLUNAS.map(([k]) => {
    if (k === 'whatsapp') return e164 && l.celular ? `https://wa.me/${e164}` : '';
    if (k === 'status') return STATUS[l.status]?.label || l.status;
    if (k === 'fonte') return FONTES[l.fonte]?.curto || l.fonte || '';
    if (k === 'cnpj') return fmtCnpj(l.cnpj);
    if (k === 'criado_em' || k === 'ultimo_contato') return l[k] ? fmtData(l[k]) : '';
    return l[k] ?? '';
  });
}
async function exportar(formato, ids) {
  toast('Preparando arquivo…', 'info');
  try {
    const itens = await db.todosLeads(ids ? { ids: ids.join(',') } : state.leads.f);
    const nome = `leads-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
    if (formato === 'csv') {
      const cel = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const linhas = [COLUNAS.map((c) => c[1]), ...itens.map((l) => linhaExport(l).map((v, i) => (['avaliacao', 'latitude', 'longitude', 'capital_social'].includes(COLUNAS[i][0]) ? String(v).replace('.', ',') : v)))];
      const blob = new Blob(['﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome + '.csv' });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else {
      if (!window.XLSX) throw new Error('Biblioteca de Excel ainda carregando — tente de novo em alguns segundos.');
      const ws = XLSX.utils.aoa_to_sheet([COLUNAS.map((c) => c[1]), ...itens.map(linhaExport)]);
      ws['!cols'] = COLUNAS.map((c) => ({ wch: c[2] }));
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: itens.length, c: COLUNAS.length - 1 } }) };
      ws['!freeze'] = { xSplit: 1, ySplit: 1 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');
      XLSX.writeFile(wb, nome + '.xlsx');
    }
    toast(`${nf(itens.length)} leads exportados`);
  } catch (e) { toast(e.message, 'err'); }
}
function menuExportar(btn, ids) {
  $$('.menu').forEach((m) => m.remove());
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = `<button data-f="xlsx">${ic('download', 'sm')}<span>Excel (.xlsx)<small>Planilha com filtros</small></span></button>
                 <button data-f="csv">${ic('download', 'sm')}<span>CSV<small>Separado por ponto e vírgula</small></span></button>`;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(m);
  $$('button', m).forEach((b) => b.onclick = () => { m.remove(); exportar(b.dataset.f, ids); });
  setTimeout(() => document.addEventListener('click', function f(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', f); } }), 0);
}

/* ------------------------------------------------------------ ficha do lead */
const drawer = { id: null };
async function abrirLead(id) {
  drawer.id = id;
  const d = $('#drawer');
  $('#overlay').classList.add('open'); d.classList.add('open');
  d.innerHTML = `<div class="drawer-b">${'<div class="skeleton" style="margin:16px 0"></div>'.repeat(8)}</div>`;
  let l;
  try { l = await db.lead(id); } catch (e) { d.innerHTML = `<div class="drawer-b">${erroHtml(e)}</div>`; return; }
  if (drawer.id !== id) return;

  const wa = l.telefone_e164 ? linkWhats(l) : '';
  const linha = (rot, val, copiavel) => val ? `<dt>${rot}</dt><dd>${val}${copiavel ? `<button class="copy" data-copy="${esc(copiavel)}" title="Copiar">${ic('copy', 'xs')}</button>` : ''}</dd>` : '';
  const ext = (url, txt) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>`;
  const horarios = (l.horario || '').split(/\s*[|;]\s*/).filter(Boolean);
  const socios = Array.isArray(l.socios) ? l.socios : [];

  d.innerHTML = `
    <div class="drawer-h">
      <div class="tt">
        <div class="avatar" style="background:${corDe(l.nome)}">${esc(iniciais(l.nome))}</div>
        <div style="flex:1;min-width:0"><h2>${esc(l.nome)}</h2><div class="cat">${esc(l.categoria || 'Sem categoria')}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${statusBadge(l.status)}
            ${l.situacao && l.situacao !== 'Ativo' ? `<span class="badge b-err">${esc(l.situacao)}</span>` : ''}
            ${l.situacao_cadastral && l.situacao_cadastral !== 'ATIVA' ? `<span class="badge b-err">CNPJ ${esc(l.situacao_cadastral)}</span>` : ''}
            <span class="badge b-muted plain">Score ${l.score}</span>
            ${l.fonte ? `<span class="badge b-muted plain">${FONTES[l.fonte]?.curto || esc(l.fonte)}</span>` : ''}</div></div>
        <button class="btn icon ghost" id="dClose" aria-label="Fechar">${ic('x')}</button>
      </div>
      <div class="quick">
        <a class="btn whats" ${wa ? `href="${wa}" target="_blank"` : 'style="opacity:.45;pointer-events:none"'} id="qWa">${ic('whats')}WhatsApp</a>
        <a class="btn" ${l.telefone_e164 ? `href="tel:${esc(l.telefone_e164)}"` : 'style="opacity:.45;pointer-events:none"'} id="qTel">${ic('phone')}Ligar</a>
        <a class="btn" ${l.site ? `href="${esc(linkSite(l.site))}" target="_blank"` : 'style="opacity:.45;pointer-events:none"'}>${ic('globe')}Site</a>
        <a class="btn" ${l.maps_url ? `href="${esc(l.maps_url)}" target="_blank"` : 'style="opacity:.45;pointer-events:none"'}>${ic('pin')}Maps</a>
      </div>
    </div>
    <div class="drawer-b">
      <div class="sec"><h4>Etapa do funil</h4>
        <div class="status-picker">${Object.entries(STATUS).map(([k, s]) => `<button data-st="${k}" class="${l.status === k ? 'on st-' + k : ''}">${s.label}</button>`).join('')}</div></div>

      <div class="sec"><h4>Contato</h4><dl class="dl">
        ${linha('Telefone', l.telefone ? esc(l.telefone) + (l.celular ? ' <span class="badge b-ok plain" style="font-size:11px">Celular</span>' : ' <span class="badge b-muted plain" style="font-size:11px">Fixo</span>') : '<span class="muted">Não informado</span>', l.telefone)}
        ${linha('E-mail', l.email ? `<a href="mailto:${esc(l.email)}" id="qMail">${esc(l.email)}</a>` : '<span class="muted">Não encontrado</span>', l.email)}
        ${linha('Site', l.site ? ext(linkSite(l.site), dominio(l.site)) : '<span class="muted">Não possui</span>', l.site)}
        ${l.instagram ? linha('Instagram', ext(l.instagram, l.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@'))) : ''}
        ${l.facebook ? linha('Facebook', ext(l.facebook, 'Abrir página')) : ''}
        ${l.linkedin ? linha('LinkedIn', ext(l.linkedin, 'Abrir perfil')) : ''}
        ${l.whatsapp_link ? linha('Link WhatsApp', ext(l.whatsapp_link, 'Do site')) : ''}
      </dl>
      <button class="btn sm" id="dEnr" style="margin-top:12px">${ic('refresh', 'xs')}Enriquecer (site, CNPJ, CEP)</button>
      ${l.enriquecido_em ? `<span class="muted" style="font-size:12px;margin-left:8px">último: ${fmtData(l.enriquecido_em)}</span>` : ''}</div>

      <div class="sec"><h4>Receita Federal</h4>
        ${l.cnpj ? `<dl class="dl">
          ${linha('CNPJ', `<span class="num">${esc(fmtCnpj(l.cnpj))}</span>`, l.cnpj)}
          ${linha('Razão social', esc(l.razao_social))}
          ${linha('Fantasia', esc(l.nome_fantasia))}
          ${linha('Situação', l.situacao_cadastral ? `<span class="badge ${l.situacao_cadastral === 'ATIVA' ? 'b-ok' : 'b-err'} plain">${esc(l.situacao_cadastral)}</span>` : '')}
          ${linha('Porte', esc(l.porte))}
          ${linha('Abertura', l.abertura ? `${fmtData(l.abertura, false)} <span class="muted">(${Math.floor((Date.now() - new Date(l.abertura)) / 31557600000)} anos)</span>` : '')}
          ${linha('Atividade', esc(l.cnae))}
          ${linha('Capital social', esc(fmtMoeda(l.capital_social)))}
          ${socios.length ? `<dt>Sócios</dt><dd><div class="hours">${socios.map((s) => `${esc(s.nome)} <span class="muted">· ${esc(s.qualificacao || '')}</span>`).join('<br>')}</div></dd>` : ''}
        </dl>` : `<p class="muted" style="margin:0 0 10px;font-size:13px">CNPJ ainda não identificado. O enriquecimento procura no site da empresa — ou informe abaixo.</p>`}
        <div class="row" style="margin-top:10px"><input class="input" id="dCnpj" placeholder="Consultar CNPJ (só números)" value="${esc(l.cnpj ? '' : '')}" inputmode="numeric"><button class="btn" id="dCnpjBtn" style="flex:none">Consultar</button></div>
      </div>

      ${l.site_status ? `<div class="sec"><h4>Diagnóstico do site</h4><div class="kv">
        <div><b>Status</b>${l.site_status === 'online' ? '<span style="color:var(--success)">● Online</span>' : `<span style="color:var(--danger)">● ${esc(l.site_status)}</span>`}</div>
        <div><b>HTTPS</b>${l.site_https ? 'Sim' : '<span style="color:var(--danger)">Não</span>'}</div>
        <div><b>Plataforma</b>${esc(l.site_plataforma || '—')}</div>
        <div><b>Rastreamento</b>${esc(l.site_rastreamento || '—')}</div></div></div>` : ''}

      <div class="sec"><h4>Endereço</h4><dl class="dl">
        ${linha('Rua', esc([l.rua, l.numero].filter(Boolean).join(', ')) || '<span class="muted">—</span>')}
        ${l.complemento ? linha('Complemento', esc(l.complemento)) : ''}
        ${linha('Bairro', esc(l.bairro) || '<span class="muted">—</span>')}
        ${linha('Cidade', esc([l.cidade, l.uf].filter(Boolean).join(' / ')) || '<span class="muted">—</span>')}
        ${l.cep ? linha('CEP', esc(l.cep), l.cep) : ''}
        ${linha('Completo', esc(l.endereco) || '<span class="muted">—</span>', l.endereco)}
        ${l.latitude ? linha('Coordenadas', `<span class="num">${Number(l.latitude).toFixed(6)}, ${Number(l.longitude).toFixed(6)}</span>`, `${l.latitude},${l.longitude}`) : ''}
        ${l.plus_code ? linha('Plus Code', esc(l.plus_code)) : ''}
      </dl></div>

      <div class="sec"><h4>No Google Maps</h4><dl class="dl">
        ${linha('Avaliação', estrelas(l))}
        ${l.faixa_preco ? linha('Preço', esc(l.faixa_preco)) : ''}
        ${linha('Situação', esc(l.situacao || '—'))}
        ${horarios.length ? `<dt>Horário</dt><dd><div class="hours">${horarios.map(esc).join('<br>')}</div></dd>` : ''}
      </dl></div>

      <div class="sec"><h4>Tags</h4><input class="input" id="dTags" value="${esc(l.tags || '')}" placeholder="Separe por vírgula: prioridade, visita…"></div>

      <div class="sec"><h4>Anotações</h4>
        <textarea class="textarea" id="dNotas" placeholder="Informações da conversa, nome do responsável, melhor horário…">${esc(l.notas || '')}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn sm primary" id="dSalvar">${ic('check', 'xs')}Salvar</button></div></div>

      <div class="sec"><h4>Histórico</h4>
        <div class="row" style="margin-bottom:12px"><input class="input" id="dAtv" placeholder="Registrar interação (ex.: retornar sexta às 10h)"><button class="btn" id="dAtvBtn" style="flex:none">Registrar</button></div>
        <ul class="timeline">${(l.atividades || []).map((a) => `<li>${esc(a.descricao)}<small>${fmtData(a.criado_em)} · ${esc(a.tipo)}</small></li>`).join('')}</ul></div>

      <div class="sec"><h4>Origem</h4>
        <div class="text-2" style="font-size:13px">${(l.buscas || []).map((b) => `<div>${esc(b.termo)}${b.local ? ' — ' + esc(b.local) : ''} <span class="muted">(${FONTES[b.fonte]?.curto || ''} · ${fmtData(b.criado_em, false)})</span></div>`).join('') || '—'}
        <div class="muted" style="margin-top:4px">Capturado em ${fmtData(l.criado_em)}</div></div></div>

      <button class="btn danger sm" id="dDel">${ic('trash', 'xs')}Excluir lead</button>
    </div>`;

  $('#dClose').onclick = fecharLead;
  $$('[data-copy]', d).forEach((b) => b.onclick = () => copiar(b.dataset.copy));
  $$('[data-st]', d).forEach((b) => b.onclick = async () => {
    try { await db.atualizar(id, { status: b.dataset.st }); toast(`Status alterado para ${STATUS[b.dataset.st].label}`); abrirLead(id); refreshAtual(); }
    catch (e) { toast(e.message, 'err'); }
  });
  $('#qWa').addEventListener('click', () => registrarContato(l, 'whatsapp'));
  $('#qTel').addEventListener('click', () => registrarContato(l, 'ligacao'));
  $('#qMail')?.addEventListener('click', () => registrarContato(l, 'email'));
  $('#dSalvar').onclick = async () => {
    try { await db.atualizar(id, { notas: $('#dNotas').value, tags: $('#dTags').value }); toast('Alterações salvas'); refreshAtual(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const addAtv = async () => {
    const v = $('#dAtv').value.trim(); if (!v) return;
    try { await db.atividade(id, 'contato', v); abrirLead(id); } catch (e) { toast(e.message, 'err'); }
  };
  $('#dAtvBtn').onclick = addAtv;
  $('#dAtv').addEventListener('keydown', (e) => { if (e.key === 'Enter') addAtv(); });
  const enriquecer = async (btn, cnpj) => {
    const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Consultando…';
    try {
      const r = await db.enriquecer(id, cnpj);
      toast(r.encontrados?.length ? `Encontrado: ${r.encontrados.join(', ')}` : 'Nenhum dado novo encontrado', r.encontrados?.length ? 'ok' : 'info');
      abrirLead(id); refreshAtual();
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.innerHTML = html; }
  };
  $('#dEnr').onclick = (e) => enriquecer(e.currentTarget);
  $('#dCnpjBtn').onclick = (e) => {
    const c = $('#dCnpj').value.replace(/\D/g, '');
    if (c.length !== 14) return toast('Informe os 14 dígitos do CNPJ', 'err');
    enriquecer(e.currentTarget, c);
  };
  $('#dDel').onclick = async () => {
    if (!(await modal({ titulo: 'Excluir lead', texto: `Excluir <b>${esc(l.nome)}</b> da sua base?`, confirmar: 'Excluir', perigo: true }))) return;
    try { await db.massa([id], 'excluir'); toast('Lead excluído'); fecharLead(); refreshAtual(); atualizarContador(); } catch (e) { toast(e.message, 'err'); }
  };
}
function fecharLead() {
  drawer.id = null;
  $('#overlay').classList.remove('open'); $('#drawer').classList.remove('open');
}
window.abrirLead = abrirLead;

/* =====================================================================
   HISTÓRICO DE BUSCAS
   ===================================================================== */
async function renderBuscas() {
  $('#topActions').innerHTML = `<a class="btn primary" href="#/prospeccao">${ic('target', 'sm')}<span class="lbl">Nova prospecção</span></a>`;
  const v = $('#view');
  v.innerHTML = `<div class="card"><div style="padding:18px">${'<div class="skeleton" style="margin:12px 0"></div>'.repeat(5)}</div></div>`;
  let lista;
  try { lista = await db.buscas(); } catch (e) { v.innerHTML = erroHtml(e); return; }
  if (state.rota !== 'buscas') return;
  if (!lista.length) {
    v.innerHTML = `<div class="card"><div class="empty"><div class="ill">${ic('history')}</div><h4>Nenhuma busca realizada</h4><p>As prospecções que você fizer ficam registradas aqui.</p><a class="btn primary" href="#/prospeccao">${ic('target', 'sm')}Nova prospecção</a></div></div>`;
    return;
  }
  const st = { concluida: 'b-ok|Concluída', executando: 'b-run|Executando', pendente: 'b-warn|Na fila', cancelada: 'b-warn|Interrompida', erro: 'b-err|Erro' };
  v.innerHTML = `<div class="card"><div class="table-wrap"><table class="t">
    <thead><tr><th>Busca</th><th>Onde</th><th>Motor</th><th>Data</th><th>Status</th><th>Encontradas</th><th>Leads</th><th>Novos</th><th style="text-align:right">Ações</th></tr></thead>
    <tbody>${lista.map((b) => {
      const [cls, rot] = (st[b.status] || 'b-muted|' + b.status).split('|');
      const onde = b.modo === 'area' ? `Área do mapa${b.grade > 1 ? ` (grade ${b.grade}×${b.grade})` : ''}` : esc(b.local || '—');
      return `<tr data-id="${b.id}">
        <td class="co"><b>${esc(b.termo)}</b><small>até ${nf(b.max_resultados)} empresas</small></td>
        <td class="text-2">${onde}</td>
        <td class="nw text-2">${ic(FONTES[b.fonte]?.icone || 'search', 'xs')} ${FONTES[b.fonte]?.curto || esc(b.fonte)}</td>
        <td class="nw text-2">${fmtData(b.criado_em)}</td>
        <td><span class="badge ${cls}" title="${esc(b.erro || '')}">${rot}</span></td>
        <td class="num">${nf(b.encontrados)}</td><td class="num"><b>${nf(b.total_leads)}</b></td><td class="num">${nf(b.novos)}</td>
        <td data-stop><div class="row-acts">
          <a class="btn sm" href="#/leads?search_id=${b.id}">${ic('list', 'xs')}Ver leads</a>
          <button class="btn sm" data-rep="${b.id}">${ic('refresh', 'xs')}Repetir</button>
          <button class="btn icon sm ghost danger" data-del="${b.id}" title="Excluir">${ic('trash', 'sm')}</button></div></td></tr>`;
    }).join('')}</tbody></table></div></div>`;

  $$('tbody tr').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('[data-stop]')) location.hash = `#/leads?search_id=${tr.dataset.id}`; }));
  $$('[data-rep]').forEach((b) => b.onclick = () => {
    const s = lista.find((x) => x.id === b.dataset.rep);
    state.prefill = { termo: s.termo, local: s.local, modo: s.modo, fonte: s.fonte, grade: s.grade, max_resultados: s.max_resultados, lat: s.latitude, lng: s.longitude, zoom: s.zoom, ...(s.opcoes || {}) };
    location.hash = '#/prospeccao';
  });
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    const m = await modal({
      titulo: 'Excluir busca', texto: 'O registro desta busca será removido do histórico.',
      corpo: `<label class="check"><input type="checkbox" id="delLeads"><span class="box"></span><span><b>Excluir também os leads desta busca</b><small>Leads que aparecem em outras buscas são mantidos.</small></span></label>`,
      confirmar: 'Excluir', perigo: true,
    });
    if (!m) return;
    try { await db.excluirBusca(b.dataset.del, $('#delLeads', m).checked); toast('Busca excluída'); renderBuscas(); atualizarContador(); }
    catch (e) { toast(e.message, 'err'); }
  });
}

/* ------------------------------------------------------------ configurações */
async function abrirConfig() {
  await atualizarRobos();
  const robo = (tipo, titulo, ajuda) => {
    const r = state.robos.find((x) => x.tipo === tipo);
    const on = roboOnline(tipo);
    return `<div class="robo-row"><span class="dot ${on ? 'on' : 'off'}" style="position:static"></span>
      <div class="grow"><b>${titulo}</b><small>${on ? `Online · ${esc(r?.host || '')} · v${esc(r?.versao || '')}` : r ? `Offline · último sinal ${fmtData(r.ultimo_sinal)}` : 'Nunca conectado'}</small></div>${ajuda}</div>`;
  };
  const m = await modal({
    titulo: 'Configurações', largura: 560,
    corpo: `
      <div class="field"><label>Motores de captura</label><div class="robos">
        ${robo('desktop', 'Robô no meu PC', `<a class="btn sm" href="${C.ROBO_EXE_URL}">${ic('download', 'xs')}Baixar .exe</a>`)}
        ${robo('nuvem', 'Robô na nuvem', '<span class="muted" style="font-size:12px">ver README</span>')}
        <div class="robo-row"><span class="ico" style="color:var(--primary)">${ic('puzzle', 'sm')}</span><div class="grow"><b>Extensão do Chrome</b><small>Captura no seu navegador, direto no Google Maps</small></div><a class="btn sm" target="_blank" href="${C.EXTENSAO_URL}">Instalar</a></div>
      </div></div>
      <div class="field"><label>Mensagem padrão do WhatsApp</label>
        <textarea class="textarea" id="cMsg" rows="4">${esc(cfg.mensagem)}</textarea>
        <span class="hint">Variáveis: <code>{empresa}</code> <code>{bairro}</code> <code>{cidade}</code> <code>{categoria}</code></span></div>
      <div class="field"><label>Abas simultâneas nos robôs</label>
        <div class="range-row"><input type="range" id="cConc" min="1" max="6" value="${cfg.concorrencia}"><output id="oConc" class="num">${cfg.concorrencia}</output></div>
        <span class="hint">Mais abas = mais rápido, porém aumenta a chance do Google limitar o acesso. Recomendado: 2 a 3.</span></div>
      <label class="check"><input type="checkbox" id="cVis" ${!cfg.headless ? 'checked' : ''}><span class="box"></span>
        <span><b>Mostrar o navegador no robô do PC</b><small>Útil para acompanhar ou resolver uma verificação do Google.</small></span></label>
      <div style="display:flex;gap:10px;margin-top:6px"><button class="btn sm" id="cSenha">${ic('shield', 'xs')}Alterar senha</button></div>`,
    confirmar: 'Salvar',
    aoAbrir: (bg) => {
      $('#cConc', bg).oninput = (e) => { $('#oConc', bg).textContent = e.target.value; };
      $('#cSenha', bg).onclick = () => { bg.remove(); novaSenha(); };
    },
  });
  if (!m) return;
  cfg.mensagem = $('#cMsg', m).value;
  cfg.concorrencia = +$('#cConc', m).value;
  cfg.headless = !$('#cVis', m).checked;
  await salvarCfgRemoto();
  toast('Configurações salvas');
}

/* ------------------------------------------------------------ boot */
document.addEventListener('DOMContentLoaded', async () => {
  $('#overlay').onclick = fecharLead;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharLead(); });
  $('#btnConfig').onclick = abrirConfig;
  $('#btnSair').onclick = async () => { await sb.auth.signOut(); };
  $('#menuToggle').onclick = () => $('#sidebar').classList.toggle('open');
  window.addEventListener('hashchange', navegar);
  setInterval(() => { if (usuario) atualizarRobos(); }, 20000);

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') { setTimeout(novaSenha, 300); }
    if (evento === 'SIGNED_OUT') {
      usuario = null; clearInterval(job.timer); pararEsperaExtensao();
      job.id = null; job.busca = null; job.resultados = [];
      $('#view').innerHTML = ''; renderAuth();
    }
    if (evento === 'SIGNED_IN' && sessao && (!usuario || usuario.id !== sessao.user.id)) aoEntrar(sessao);
  });
  const { data } = await sb.auth.getSession();
  if (data.session) aoEntrar(data.session);
  else renderAuth();
});
