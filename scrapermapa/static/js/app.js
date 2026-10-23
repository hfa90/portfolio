/* =====================================================================
   Prospecta — front-end (vanilla JS + Leaflet)
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

function fmtData(iso, comHora = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('pt-BR') + (comHora ? ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
}
function fmtRel(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `há ${Math.floor(s / 86400)} d`;
  return fmtData(iso, false);
}
function fmtDuracao(seg) {
  seg = Math.round(seg || 0);
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

const SUGESTOES = [
  'Restaurantes', 'Padarias', 'Academias', 'Clínicas odontológicas', 'Clínicas médicas', 'Salões de beleza',
  'Barbearias', 'Pet shops', 'Clínicas veterinárias', 'Oficinas mecânicas', 'Imobiliárias', 'Escritórios de contabilidade',
  'Escritórios de advocacia', 'Farmácias', 'Mercados', 'Lojas de roupas', 'Hotéis', 'Escolas', 'Construtoras',
  'Lojas de materiais de construção', 'Auto peças', 'Óticas', 'Estúdios de pilates', 'Agências de marketing',
  'Lavanderias', 'Floriculturas', 'Hamburguerias', 'Pizzarias', 'Cafeterias', 'Distribuidoras',
];

/* ------------------------------------------------------------ configurações */
const CFG_PADRAO = {
  mensagem: 'Olá! Tudo bem? Falo com a {empresa}? Vi vocês no Google Maps aqui em {bairro} e gostaria de apresentar uma solução que pode ajudar a atrair mais clientes. Podemos conversar?',
  headless: true,
  concorrencia: 3,
  mapa: 'google',
};
const cfg = Object.assign({}, CFG_PADRAO, ls.get('prospecta.cfg', {}));
const salvarCfg = () => ls.set('prospecta.cfg', cfg);

/* ------------------------------------------------------------ API */
const api = {
  async req(metodo, url, corpo) {
    const op = { method: metodo, headers: {} };
    if (corpo !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    const r = await fetch(url, op);
    if (!r.ok) {
      let msg = `Erro ${r.status}`;
      try { const j = await r.json(); msg = typeof j.detail === 'string' ? j.detail : (j.detail?.[0]?.msg || msg); } catch { /* */ }
      throw new Error(msg);
    }
    return r.status === 204 ? null : r.json();
  },
  get: (u) => api.req('GET', u),
  post: (u, b) => api.req('POST', u, b ?? {}),
  patch: (u, b) => api.req('PATCH', u, b),
  del: (u) => api.req('DELETE', u),
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
  setTimeout(() => el.remove(), acao ? 7000 : 3600);
}

function modal({ titulo, texto = '', corpo = '', confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false, aoAbrir }) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog">
      <div class="modal-h"><h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}</div>
      ${corpo ? `<div class="modal-b">${corpo}</div>` : '<div style="height:8px"></div>'}
      <div class="modal-f">${cancelar ? `<button class="btn" data-x>${esc(cancelar)}</button>` : ''}
      <button class="btn ${perigo ? 'danger solid' : 'primary'}" data-ok>${esc(confirmar)}</button></div></div>`;
    const fechar = (v) => { bg.remove(); resolve(v); };
    bg.addEventListener('click', (e) => { if (e.target === bg) fechar(false); });
    $('[data-x]', bg)?.addEventListener('click', () => fechar(false));
    $('[data-ok]', bg).addEventListener('click', () => fechar(bg));
    document.body.appendChild(bg);
    aoAbrir?.(bg);
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
  try { await api.post(`/api/leads/${lead.id}/atividades`, { tipo, descricao: desc }); } catch { /* */ }
  if (lead.status === 'novo') {
    toast(`${desc} para ${lead.nome}.`, 'info', {
      label: 'Marcar contatado',
      fn: async () => { await api.patch(`/api/leads/${lead.id}`, { status: 'contatado' }); lead.status = 'contatado'; toast('Status atualizado'); refreshAtual(); if (drawer.id === lead.id) abrirLead(lead.id); },
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
  rota: 'painel',
  mapaProsp: null,
  mapaLeads: null,
  marcadores: null,
  prefill: null,
  leads: {
    f: {}, page: 1, per_page: 25, order: 'criado_em', dir: 'desc', sel: new Set(), modo: 'tabela', itens: [], total: 0,
  },
};
const job = { id: null, since: 0, resultados: [], dados: null, timer: null };

/* ------------------------------------------------------------ roteador */
const ROTAS = {
  painel: { titulo: 'Painel', sub: 'Visão geral da sua base de prospecção', render: renderPainel },
  prospeccao: { titulo: 'Prospecção no mapa', sub: 'Encontre empresas por bairro, rua, cidade ou área do mapa', render: renderProspeccao },
  leads: { titulo: 'Leads', sub: 'Empresas capturadas e seu andamento comercial', render: renderLeads },
  buscas: { titulo: 'Histórico de buscas', sub: 'Todas as prospecções realizadas', render: renderBuscas },
};

function navegar() {
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
  try { const s = await api.get('/api/estatisticas'); $('#navCount').textContent = nf(s.total); return s; } catch { return null; }
}

/* =====================================================================
   PAINEL
   ===================================================================== */
async function renderPainel() {
  $('#topActions').innerHTML = `<a class="btn primary" href="#/prospeccao">${ic('target', 'sm')}<span class="lbl">Nova prospecção</span></a>`;
  const v = $('#view');
  v.innerHTML = `<div class="kpis">${'<div class="card kpi"><div class="skeleton" style="width:50%"></div><div class="skeleton" style="height:28px;width:40%;margin-top:14px"></div></div>'.repeat(4)}</div>`;
  let s;
  try { s = await api.get('/api/estatisticas'); } catch (e) { v.innerHTML = erroHtml(e); return; }
  if (state.rota !== 'painel') return;

  if (!s.total) {
    v.innerHTML = `<div class="card"><div class="empty" style="padding:80px 20px">
      <div class="ill">${ic('map')}</div>
      <h4>Comece sua primeira prospecção</h4>
      <p>Escolha um segmento e uma região no mapa. O sistema coleta nome, telefone, endereço,<br>bairro, avaliação e site de cada empresa — e monta sua lista de leads.</p>
      <a class="btn primary lg" href="#/prospeccao">${ic('target')}Iniciar prospecção</a></div></div>`;
    return;
  }

  const kpi = (titulo, valor, rodape, icone, cor, fundo) => `<div class="card kpi">
    <div class="top">${titulo}<span class="ico" style="background:${fundo};color:${cor}">${ic(icone)}</span></div>
    <div class="val">${valor}</div><div class="foot">${rodape}</div></div>`;

  // últimos 14 dias
  const mapaDia = Object.fromEntries(s.por_dia.map((d) => [d.dia, d.n]));
  const dias = [...Array(14)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const k = d.toLocaleDateString('sv-SE');
    return { k, n: mapaDia[k] || 0, rot: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) };
  });
  const maxDia = Math.max(1, ...dias.map((d) => d.n));
  const maxSt = Math.max(1, ...Object.values(s.por_status));
  const rank = (lista, vazio) => lista.length ? `<ul class="rank">${lista.map((r, i) => `<li><span class="pos">${i + 1}</span><span class="nm">${esc(r.nome)}</span><span class="n">${nf(r.n)}</span></li>`).join('')}</ul>` : `<p class="muted">${vazio}</p>`;

  v.innerHTML = `
  <div class="kpis">
    ${kpi('Total de leads', nf(s.total), `${nf(s.buscas)} buscas realizadas`, 'building', 'var(--primary)', 'var(--primary-50)')}
    ${kpi('Com telefone', nf(s.com_telefone), `${pct(s.com_telefone, s.total)}% da base`, 'phone', 'var(--violet)', 'var(--violet-50)')}
    ${kpi('Celular / WhatsApp', nf(s.celular), `${nf(s.com_email)} com e-mail · ${nf(s.sem_site)} sem site`, 'whats', 'var(--success)', 'var(--success-50)')}
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
  <div class="grid-3">
    <div class="card"><div class="card-h"><h3>Bairros com mais leads</h3></div><div class="card-b">${rank(s.top_bairros, 'Sem dados de bairro ainda.')}</div></div>
    <div class="card"><div class="card-h"><h3>Segmentos principais</h3></div><div class="card-b">${rank(s.top_categorias, 'Sem categorias ainda.')}</div></div>
    <div class="card"><div class="card-h"><h3>Buscas recentes</h3><a class="btn sm ghost" href="#/buscas">Ver todas</a></div><div class="card-b">
      <ul class="rank">${s.buscas_recentes.map((b) => `<li style="cursor:pointer" onclick="location.hash='#/leads?search_id=${b.id}'"><span class="pos">${ic('search', 'xs')}</span>
        <span class="nm"><b style="font-weight:600">${esc(b.termo)}</b> <span class="muted">· ${esc(b.modo === 'area' ? 'área do mapa' : b.local || '')}</span></span><span class="n">${nf(b.total_leads)}</span></li>`).join('')}</ul>
    </div></div>
  </div>`;
}
const erroHtml = (e) => `<div class="card"><div class="empty"><div class="ill" style="background:var(--danger-50);color:var(--danger)">${ic('alert')}</div><h4>Não foi possível carregar</h4><p>${esc(e.message)}</p></div></div>`;

/* =====================================================================
   PROSPECÇÃO
   ===================================================================== */
function renderProspeccao() {
  const pre = state.prefill || ls.get('prospecta.form', {});
  state.prefill = null;
  const modo = pre.modo || 'local';
  const rodando = job.dados?.status === 'executando';

  $('#view').innerHTML = `
  <div class="prospect">
    <div class="prospect-side">
      <div class="card"><div class="card-h"><div><h3>Nova prospecção</h3><div class="sub">Coleta direta do Google Maps, sem IA</div></div></div>
        <div class="card-b">
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
            <div class="field"><label for="fGrade">Cobertura da área</label>
              <select class="select" id="fGrade">
                <option value="1" ${pre.grade == 1 ? 'selected' : ''}>Padrão — uma busca no centro</option>
                <option value="2" ${pre.grade == 2 ? 'selected' : ''}>Varredura 2×2 — 4 sub-regiões</option>
                <option value="3" ${pre.grade == 3 ? 'selected' : ''}>Varredura 3×3 — 9 sub-regiões</option>
              </select>
              <span class="hint">A varredura divide a área e busca em cada parte, superando o limite de ~120 resultados do Google.</span></div>
          </div>

          <div class="field"><label>Quantidade máxima de empresas</label>
            <div class="range-row"><input type="range" id="fMax" min="10" max="500" step="10" value="${pre.max_resultados || 60}"><output id="oMax" class="num">${pre.max_resultados || 60}</output></div></div>

          <label class="check" style="padding-top:0"><input type="checkbox" id="fEnr" ${pre.enriquecer ? 'checked' : ''}><span class="box"></span>
            <span><b>Buscar e-mail e redes sociais</b><small>Visita o site de cada empresa (deixa a busca mais lenta).</small></span></label>

          <div style="margin-top:10px">
            <button class="btn primary lg block ${rodando ? 'hidden' : ''}" id="btnIniciar">${ic('play', 'sm')}Iniciar prospecção</button>
            <button class="btn danger lg block ${rodando ? '' : 'hidden'}" id="btnCancelar">${ic('stop', 'sm')}Interromper busca</button>
          </div>
        </div></div>

      <div class="card progress-card ${job.dados ? '' : 'hidden'}" id="cardProg"></div>
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
          <a class="btn sm ${job.dados ? '' : 'hidden'}" id="btnVerLeads" href="#/leads?search_id=${job.dados?.search_id || ''}">${ic('list', 'sm')}Abrir na lista</a></div>
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
    cfg.mapa = b.dataset.t; salvarCfg(); map.trocarCamada(cfg.mapa);
  });
  $('#btnLocate').onclick = () => {
    if (!navigator.geolocation) return toast('Geolocalização indisponível', 'err');
    navigator.geolocation.getCurrentPosition((p) => map.flyTo([p.coords.latitude, p.coords.longitude], 15),
      () => toast('Não foi possível obter sua localização', 'err'));
  };

  // ---------- geocodificação (OpenStreetMap Nominatim — gratuito, sem IA)
  const geoRes = $('#geoRes');
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
  const irPara = (x) => {
    if (x.boundingbox) {
      const [s, n, w, e] = x.boundingbox.map(Number);
      map.flyToBounds([[s, w], [n, e]], { maxZoom: 16, duration: 0.8 });
    } else map.flyTo([+x.lat, +x.lon], 15);
  };
  $('#geoQ').addEventListener('input', (e) => buscarGeo(e.target.value.trim()));
  $('#geoQ').addEventListener('blur', () => setTimeout(() => geoRes.classList.add('hidden'), 200));

  // ---------- formulário
  let modoAtual = modo;
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
    const corpo = {
      termo, local, modo: modoAtual,
      lat: c.lat, lng: c.lng, zoom: map.getZoom(),
      bounds: { norte: b.getNorth(), sul: b.getSouth(), leste: b.getEast(), oeste: b.getWest() },
      grade: +$('#fGrade').value,
      max_resultados: +$('#fMax').value,
      enriquecer: $('#fEnr').checked,
      filtro_estrito: $('#fEstrito').checked,
      headless: cfg.headless,
      concorrencia: cfg.concorrencia,
    };
    if (modoAtual === 'local') { delete corpo.lat; delete corpo.lng; delete corpo.zoom; }
    ls.set('prospecta.form', { termo, local, modo: modoAtual, grade: corpo.grade, max_resultados: corpo.max_resultados, enriquecer: corpo.enriquecer, filtro_estrito: corpo.filtro_estrito });
    $('#btnIniciar').disabled = true;
    try {
      const r = await api.post('/api/buscas', corpo);
      iniciarAcompanhamento(r.job_id, true);
      toast('Prospecção iniciada');
    } catch (e) { toast(e.message, 'err'); }
    finally { $('#btnIniciar').disabled = false; }
  };
  $('#btnCancelar').onclick = cancelarJob;

  // restaura resultados do job atual
  pintarResultados(job.resultados, true);
  atualizarJobUI();
}

function itemAoVivo(l, i) {
  return `<div class="live-item" onclick="abrirLead(${l.id})">
    <span class="idx">${i}</span>
    <span class="nm"><b>${esc(l.nome)}</b><small>${esc(l.categoria || '—')}</small></span>
    <span class="cell">${l.telefone ? `<span class="phone">${l.celular ? `<span class="wa-dot" title="Celular / WhatsApp">${ic('whats', 'xs')}</span>` : ''}${esc(l.telefone)}</span>` : '<span class="muted">Sem telefone</span>'}</span>
    <span class="cell">${esc(l.bairro || l.cidade || '—')}</span>
    <span>${l.novo === false ? '<span class="badge b-muted plain">Já na base</span>' : '<span class="badge b-ok plain">Novo</span>'}</span>
  </div>`;
}

function pintarResultados(lista, reset = false) {
  const el = $('#liveList');
  if (!el) return;
  if (reset) {
    el.innerHTML = '';
    state.marcadores?.clearLayers();
    if (!lista.length) {
      el.innerHTML = `<div class="empty" style="padding:34px 20px"><div class="ill">${ic('building')}</div><h4>Nenhum resultado ainda</h4><p>Configure a busca ao lado e clique em <b>Iniciar prospecção</b>.</p></div>`;
      return;
    }
  } else if (lista.length && $('.empty', el)) el.innerHTML = '';
  const inicio = job.resultados.length - lista.length;
  const base = reset ? 0 : inicio;
  // mais recentes no topo
  el.insertAdjacentHTML('afterbegin', lista.map((l, k) => itemAoVivo(l, base + k + 1)).reverse().join(''));
  lista.forEach((l, k) => {
    if (l.latitude && state.marcadores) {
      L.marker([l.latitude, l.longitude], { icon: pinIcon(base + k + 1) }).bindPopup(popupLead(l)).addTo(state.marcadores);
    }
  });
  $('#liveSub') && ($('#liveSub').textContent = `${nf(job.resultados.length)} empresas salvas`);
}

/* ------------------------------------------------------------ acompanhamento do job */
function iniciarAcompanhamento(id, novo = false) {
  job.id = id; job.since = 0; job.resultados = []; job.dados = { status: 'executando', fase: 'iniciando', encontrados: 0, processados: 0, salvos: 0, logs: [], params: {} };
  sessionStorage.setItem('prospecta.job', id);
  if (novo) pintarResultados([], true);
  clearInterval(job.timer);
  job.timer = setInterval(pollJob, 1200);
  pollJob();
  atualizarJobUI();
}

async function pollJob() {
  if (!job.id) return;
  try {
    const d = await api.get(`/api/jobs/${job.id}?desde=${job.since}`);
    job.dados = d;
    if (d.resultados.length) {
      job.resultados.push(...d.resultados);
      job.since += d.resultados.length;
      if (state.rota === 'prospeccao') pintarResultados(d.resultados);
    }
    atualizarJobUI();
    if (d.status !== 'executando') {
      clearInterval(job.timer); job.timer = null;
      sessionStorage.removeItem('prospecta.job');
      const msg = d.status === 'concluido' ? `Prospecção concluída: ${d.salvos} empresas (${d.novos} novas)` :
        d.status === 'cancelado' ? `Busca interrompida: ${d.salvos} empresas salvas` : `A busca falhou: ${d.erro || 'erro desconhecido'}`;
      toast(msg, d.status === 'erro' ? 'err' : 'ok', d.salvos ? { label: 'Ver leads', fn: () => { location.hash = `#/leads?search_id=${d.search_id}`; } } : null);
      if (state.rota === 'prospeccao' && state.marcadores && job.resultados.some((l) => l.latitude)) {
        const pts = job.resultados.filter((l) => l.latitude).map((l) => [l.latitude, l.longitude]);
        state.mapaProsp.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
      }
      atualizarContador();
    }
  } catch (e) {
    clearInterval(job.timer); job.timer = null;
    sessionStorage.removeItem('prospecta.job');
    if (job.dados) job.dados.status = 'erro';
    atualizarJobUI();
    toast(e.message, 'err');
  }
}

async function cancelarJob() {
  if (!job.id) return;
  try { await api.post(`/api/jobs/${job.id}/cancelar`); toast('Interrompendo a busca…', 'info'); } catch (e) { toast(e.message, 'err'); }
}

function atualizarJobUI() {
  const d = job.dados;
  const rodando = d?.status === 'executando';
  // barra lateral
  const sj = $('#sideJob');
  if (rodando) {
    const p = progresso(d);
    sj.classList.remove('hidden');
    sj.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span class="spinner" style="width:12px;height:12px;color:#5B8CFF"></span><b style="font-weight:600">Prospectando…</b></div>
      <div style="margin-top:4px;color:#A9B5CC">${esc(d.params?.termo || '')} · ${nf(d.salvos)} salvas</div><div class="bar"><i style="width:${p ?? 8}%"></i></div>`;
    sj.onclick = () => { location.hash = '#/prospeccao'; };
  } else sj.classList.add('hidden');

  if (state.rota !== 'prospeccao') return;
  $('#btnIniciar')?.classList.toggle('hidden', rodando);
  $('#btnCancelar')?.classList.toggle('hidden', !rodando);
  const card = $('#cardProg');
  if (!card || !d) return;
  card.classList.remove('hidden');
  const btnVer = $('#btnVerLeads');
  if (btnVer && d.search_id) { btnVer.classList.remove('hidden'); btnVer.href = `#/leads?search_id=${d.search_id}`; }

  const p = progresso(d);
  const badge = { executando: '<span class="badge b-run">Em andamento</span>', concluido: '<span class="badge b-ok">Concluída</span>', cancelado: '<span class="badge b-warn">Interrompida</span>', erro: '<span class="badge b-err">Erro</span>' }[d.status] || '';
  const logsVisiveis = (d.logs || []).slice(-40);
  card.innerHTML = `<div class="card-h"><div><h3>${esc(d.fase_rotulo || 'Preparando')}</h3><div class="sub">${d.decorrido ? 'Tempo: ' + fmtDuracao(d.decorrido) : '&nbsp;'}</div></div>${badge}</div>
    <div class="card-b">
      <div class="pbar ${rodando && p === null ? 'indet' : ''}"><i style="width:${rodando ? (p ?? 0) : 100}%"></i></div>
      <div class="stats">
        <div class="stat"><b>${nf(d.encontrados)}</b><span>Encontradas</span></div>
        <div class="stat"><b>${nf(d.processados)}</b><span>Processadas</span></div>
        <div class="stat"><b>${nf(d.salvos)}</b><span>Salvas${d.novos !== undefined ? ` · ${nf(d.novos)} novas` : ''}</span></div>
      </div>
      <div class="logbox" id="logbox">${logsVisiveis.map((l) => `<div class="${l.nivel}"><span class="t">${l.t}</span>${esc(l.msg)}</div>`).join('') || '<div><span class="t">--:--:--</span>Aguardando…</div>'}</div>
    </div>`;
  const lb = $('#logbox'); if (lb) lb.scrollTop = lb.scrollHeight;
}
function progresso(d) {
  if (!d) return null;
  if (d.fase === 'coletando') { const m = d.params?.max_resultados || 60; return d.encontrados ? Math.min(40, (d.encontrados / m) * 40) : null; }
  if (d.fase === 'extraindo') return 40 + (d.encontrados ? (d.processados / d.encontrados) * 60 : 0);
  if (d.fase === 'iniciando') return null;
  return 100;
}

/* =====================================================================
   LEADS
   ===================================================================== */
async function renderLeads(qs) {
  const L_ = state.leads;
  if (qs && [...qs.keys()].length) {
    L_.f = {}; L_.page = 1;
    for (const [k, v] of qs) L_.f[k] = v;
  }
  L_.sel.clear();

  $('#topActions').innerHTML = `
    <div class="dropdown"><button class="btn" id="btnExport">${ic('download', 'sm')}<span class="lbl">Exportar</span></button></div>
    <a class="btn primary" href="#/prospeccao">${ic('target', 'sm')}<span class="lbl">Nova prospecção</span></a>`;
  $('#btnExport').onclick = (e) => menuExportar(e.currentTarget);

  let opc = { bairros: [], cidades: [], categorias: [], buscas: [] };
  try { opc = await api.get('/api/leads/filtros'); } catch { /* */ }
  if (state.rota !== 'leads') return;
  const opts = (lista, sel, rot) => `<option value="">${rot}</option>` + lista.map((x) => `<option ${x == sel ? 'selected' : ''} value="${esc(x)}">${esc(x)}</option>`).join('');
  const f = L_.f;
  const chip = (k, rot) => `<button class="chip ${f[k] ? 'on' : ''}" data-chip="${k}">${f[k] ? ic('check', 'xs') : ''}${rot}</button>`;

  $('#view').innerHTML = `
  <div class="card">
    <div class="toolbar">
      <div class="grow input-icon">${ic('search', 'sm')}<input class="input" id="lq" placeholder="Buscar por nome, telefone, endereço, e-mail, nota…" value="${esc(f.q || '')}"></div>
      <select class="select" data-f="status"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      <select class="select" data-f="cidade">${opts(opc.cidades, f.cidade, 'Todas as cidades')}</select>
      <select class="select" data-f="bairro">${opts(opc.bairros, f.bairro, 'Todos os bairros')}</select>
      <select class="select" data-f="categoria">${opts(opc.categorias, f.categoria, 'Todos os segmentos')}</select>
      <select class="select" data-f="search_id"><option value="">Todas as buscas</option>${opc.buscas.map((b) => `<option value="${b.id}" ${f.search_id == b.id ? 'selected' : ''}>#${b.id} · ${esc(b.termo)}${b.local ? ' — ' + esc(b.local) : ''}</option>`).join('')}</select>
    </div>
    <div class="chips">
      ${chip('com_telefone', 'Com telefone')}${chip('whatsapp', 'Celular / WhatsApp')}${chip('com_email', 'Com e-mail')}${chip('com_site', 'Com site')}${chip('sem_site', 'Sem site')}
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

function paramsFiltro(extra = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...state.leads.f, ...extra })) if (v !== '' && v != null) p.set(k, v);
  return p;
}

async function carregarLeads() {
  const L_ = state.leads;
  const body = $('#leadsBody');
  if (!body) return;
  if (state.mapaLeads) { state.mapaLeads.remove(); state.mapaLeads = null; }

  if (L_.modo === 'mapa') {
    body.innerHTML = '<div class="leads-map"><div class="map" id="mapLeads" style="border-radius:0 0 14px 14px"></div></div>';
    const p = paramsFiltro({ per_page: 3000, page: 1 });
    const r = await api.get('/api/leads?' + p);
    const ult = ls.get('prospecta.mapa', { c: [-23.55, -46.63], z: 12 });
    const map = criarMapa('mapLeads', ult.c, ult.z);
    state.mapaLeads = map;
    const pts = [];
    r.items.forEach((l, i) => {
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
  try { r = await api.get('/api/leads?' + paramsFiltro({ page: L_.page, per_page: L_.per_page, order: L_.order, dir: L_.dir })); }
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
        <td class="co"><b title="${esc(l.nome)}">${esc(l.nome)}</b><small>${esc(l.categoria || '—')}${l.situacao && l.situacao !== 'Ativo' ? ` · <span style="color:var(--danger)">${esc(l.situacao)}</span>` : ''}</small></td>
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
          <a class="btn icon sm ghost" title="Abrir no Google Maps" target="_blank" href="${esc(l.maps_url)}">${ic('pin', 'sm')}</a>
        </div></td>
      </tr>`).join('')}</tbody></table></div>
    <div class="pager"><span>Mostrando <b>${nf((L_.page - 1) * L_.per_page + 1)}–${nf(Math.min(L_.page * L_.per_page, r.total))}</b> de <b>${nf(r.total)}</b> leads</span>
      <div class="pg">
        <select class="select" id="perPage" style="height:32px;width:auto;font-size:12.5px">${[25, 50, 100, 200].map((n) => `<option ${n === L_.per_page ? 'selected' : ''} value="${n}">${n} por página</option>`).join('')}</select>
        <button class="btn icon sm" id="pgPrev" ${L_.page <= 1 ? 'disabled' : ''}>${ic('chev-l', 'sm')}</button>
        <span class="num">${L_.page} / ${pags}</span>
        <button class="btn icon sm" id="pgNext" ${L_.page >= pags ? 'disabled' : ''}>${ic('chev-r', 'sm')}</button>
      </div></div>`;

  $$('tbody tr', body).forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return;
    abrirLead(+tr.dataset.id);
  }));
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
  $('#selAll').onchange = (e) => { r.items.forEach((l) => e.target.checked ? L_.sel.add(l.id) : L_.sel.delete(l.id)); carregarLeads(); };
  $$('.status-select', body).forEach((s) => s.onchange = async () => {
    try {
      await api.patch(`/api/leads/${s.dataset.id}`, { status: s.value });
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
    <button class="btn sm" id="bkTag">${ic('note', 'xs')}Adicionar tag</button>
    <button class="btn sm" id="bkExp">${ic('download', 'xs')}Exportar seleção</button>
    <button class="btn sm danger" id="bkDel">${ic('trash', 'xs')}Excluir</button>
    <button class="btn sm ghost" id="bkClear" style="margin-left:auto">Limpar seleção</button></div>`;
  const ids = [...L_.sel];
  $('#bkStatus').onchange = async (e) => {
    if (!e.target.value) return;
    await api.post('/api/leads/massa', { ids, acao: 'status', valor: e.target.value });
    toast(`${ids.length} lead(s) movidos para ${STATUS[e.target.value].label}`); L_.sel.clear(); carregarLeads();
  };
  $('#bkTag').onclick = async () => {
    const m = await modal({ titulo: 'Adicionar tag', texto: `Aplicar uma tag aos ${ids.length} leads selecionados.`, corpo: '<input class="input" id="tagIn" placeholder="Ex.: prioridade, visita, campanha-out">', confirmar: 'Aplicar', aoAbrir: (bg) => $('#tagIn', bg).focus() });
    const v = m && $('#tagIn', m).value.trim();
    if (!v) return;
    await api.post('/api/leads/massa', { ids, acao: 'tag', valor: v }); toast('Tag aplicada'); carregarLeads();
  };
  $('#bkExp').onclick = (e) => menuExportar(e.currentTarget, ids);
  $('#bkDel').onclick = async () => {
    if (!(await modal({ titulo: 'Excluir leads', texto: `Excluir definitivamente ${ids.length} lead(s)? Esta ação não pode ser desfeita.`, confirmar: 'Excluir', perigo: true }))) return;
    await api.post('/api/leads/massa', { ids, acao: 'excluir' }); toast('Leads excluídos'); L_.sel.clear(); carregarLeads(); atualizarContador();
  };
  $('#bkClear').onclick = () => { L_.sel.clear(); carregarLeads(); };
}

function menuExportar(btn, ids) {
  $$('.menu').forEach((m) => m.remove());
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = `<button data-f="xlsx">${ic('download', 'sm')}<span>Excel (.xlsx)<small>Planilha formatada com links</small></span></button>
                 <button data-f="csv">${ic('download', 'sm')}<span>CSV<small>Separado por ponto e vírgula</small></span></button>`;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(m);
  $$('button', m).forEach((b) => b.onclick = () => {
    const p = ids ? new URLSearchParams({ ids: ids.join(',') }) : paramsFiltro();
    p.set('formato', b.dataset.f);
    window.location = '/api/leads/exportar?' + p;
    m.remove();
  });
  setTimeout(() => document.addEventListener('click', function f(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', f); } }), 0);
}

/* ------------------------------------------------------------ drawer do lead */
const drawer = { id: null };
async function abrirLead(id) {
  drawer.id = id;
  const d = $('#drawer');
  $('#overlay').classList.add('open'); d.classList.add('open');
  d.innerHTML = `<div class="drawer-b">${'<div class="skeleton" style="margin:16px 0"></div>'.repeat(8)}</div>`;
  let l;
  try { l = await api.get(`/api/leads/${id}`); } catch (e) { d.innerHTML = `<div class="drawer-b">${erroHtml(e)}</div>`; return; }
  if (drawer.id !== id) return;

  const wa = l.telefone_e164 ? linkWhats(l) : '';
  const linha = (rot, val, copiavel) => val ? `<dt>${rot}</dt><dd>${val}${copiavel ? `<button class="copy" data-copy="${esc(copiavel)}" title="Copiar">${ic('copy', 'xs')}</button>` : ''}</dd>` : '';
  const ext = (url, txt) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>`;
  const horarios = (l.horario || '').split(/\s*[|;]\s*/).filter(Boolean);

  d.innerHTML = `
    <div class="drawer-h">
      <div class="tt">
        <div class="avatar" style="background:${corDe(l.nome)}">${esc(iniciais(l.nome))}</div>
        <div style="flex:1;min-width:0"><h2>${esc(l.nome)}</h2><div class="cat">${esc(l.categoria || 'Sem categoria')}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${statusBadge(l.status)}
            ${l.situacao && l.situacao !== 'Ativo' ? `<span class="badge b-err">${esc(l.situacao)}</span>` : ''}
            <span class="badge b-muted plain">Score ${l.score}</span></div></div>
        <button class="btn icon ghost" id="dClose" aria-label="Fechar">${ic('x')}</button>
      </div>
      <div class="quick">
        <a class="btn whats ${wa ? '' : 'disabled'}" ${wa ? `href="${wa}" target="_blank"` : 'aria-disabled="true" style="opacity:.45;pointer-events:none"'} id="qWa">${ic('whats')}WhatsApp</a>
        <a class="btn" ${l.telefone_e164 ? `href="tel:${esc(l.telefone_e164)}"` : 'style="opacity:.45;pointer-events:none"'} id="qTel">${ic('phone')}Ligar</a>
        <a class="btn" ${l.site ? `href="${esc(linkSite(l.site))}" target="_blank"` : 'style="opacity:.45;pointer-events:none"'}>${ic('globe')}Site</a>
        <a class="btn" href="${esc(l.maps_url)}" target="_blank">${ic('pin')}Maps</a>
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
      ${l.site ? `<button class="btn sm" id="dEnr" style="margin-top:12px">${ic('refresh', 'xs')}Buscar e-mail e redes no site</button>` : ''}</div>

      <div class="sec"><h4>Endereço</h4><dl class="dl">
        ${linha('Rua', esc([l.rua, l.numero].filter(Boolean).join(', ')) || '<span class="muted">—</span>')}
        ${l.complemento ? linha('Complemento', esc(l.complemento)) : ''}
        ${linha('Bairro', esc(l.bairro) || '<span class="muted">—</span>')}
        ${linha('Cidade', esc([l.cidade, l.uf].filter(Boolean).join(' / ')) || '<span class="muted">—</span>')}
        ${l.cep ? linha('CEP', esc(l.cep), l.cep) : ''}
        ${linha('Completo', esc(l.endereco) || '<span class="muted">—</span>', l.endereco)}
        ${l.latitude ? linha('Coordenadas', `<span class="num">${l.latitude.toFixed(6)}, ${l.longitude.toFixed(6)}</span>`, `${l.latitude},${l.longitude}`) : ''}
        ${l.plus_code ? linha('Plus Code', esc(l.plus_code)) : ''}
      </dl></div>

      <div class="sec"><h4>No Google Maps</h4><dl class="dl">
        ${linha('Avaliação', estrelas(l))}
        ${l.faixa_preco ? linha('Preço', esc(l.faixa_preco)) : ''}
        ${linha('Situação', esc(l.situacao || '—'))}
        ${horarios.length ? `<dt>Horário</dt><dd><div class="hours">${horarios.map(esc).join('<br>')}</div></dd>` : ''}
      </dl></div>

      <div class="sec"><h4>Tags</h4>
        <input class="input" id="dTags" value="${esc(l.tags || '')}" placeholder="Separe por vírgula: prioridade, visita…"></div>

      <div class="sec"><h4>Anotações</h4>
        <textarea class="textarea" id="dNotas" placeholder="Informações da conversa, nome do responsável, melhor horário…">${esc(l.notas || '')}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn sm primary" id="dSalvar">${ic('check', 'xs')}Salvar</button></div></div>

      <div class="sec"><h4>Histórico</h4>
        <div class="row" style="margin-bottom:12px"><input class="input" id="dAtv" placeholder="Registrar interação (ex.: retornar sexta às 10h)"><button class="btn" id="dAtvBtn" style="flex:none">Registrar</button></div>
        <ul class="timeline">${(l.atividades || []).map((a) => `<li>${esc(a.descricao)}<small>${fmtData(a.criado_em)} · ${esc(a.tipo)}</small></li>`).join('')}</ul></div>

      <div class="sec"><h4>Origem</h4>
        <div class="text-2" style="font-size:13px">${(l.buscas || []).map((b) => `<div>#${b.id} · ${esc(b.termo)}${b.local ? ' — ' + esc(b.local) : ''} <span class="muted">(${fmtData(b.criado_em, false)})</span></div>`).join('') || '—'}
        <div class="muted" style="margin-top:4px">Capturado em ${fmtData(l.criado_em)}</div></div></div>

      <button class="btn danger sm" id="dDel">${ic('trash', 'xs')}Excluir lead</button>
    </div>`;

  $('#dClose').onclick = fecharLead;
  $$('[data-copy]', d).forEach((b) => b.onclick = () => copiar(b.dataset.copy));
  $$('[data-st]', d).forEach((b) => b.onclick = async () => {
    await api.patch(`/api/leads/${id}`, { status: b.dataset.st });
    toast(`Status alterado para ${STATUS[b.dataset.st].label}`);
    abrirLead(id); refreshAtual();
  });
  $('#qWa').addEventListener('click', () => registrarContato(l, 'whatsapp'));
  $('#qTel').addEventListener('click', () => registrarContato(l, 'ligacao'));
  $('#qMail')?.addEventListener('click', () => registrarContato(l, 'email'));
  $('#dSalvar').onclick = async () => {
    await api.patch(`/api/leads/${id}`, { notas: $('#dNotas').value, tags: $('#dTags').value });
    toast('Alterações salvas'); refreshAtual();
  };
  const addAtv = async () => {
    const v = $('#dAtv').value.trim(); if (!v) return;
    await api.post(`/api/leads/${id}/atividades`, { tipo: 'contato', descricao: v });
    abrirLead(id);
  };
  $('#dAtvBtn').onclick = addAtv;
  $('#dAtv').addEventListener('keydown', (e) => { if (e.key === 'Enter') addAtv(); });
  $('#dEnr')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner"></span>Consultando site…';
    try {
      const r = await api.post(`/api/leads/${id}/enriquecer`);
      toast(r.encontrados.length ? `Encontrado: ${r.encontrados.join(', ')}` : 'Nenhum dado novo no site', r.encontrados.length ? 'ok' : 'info');
      abrirLead(id); refreshAtual();
    } catch (err) { toast(err.message, 'err'); b.disabled = false; }
  });
  $('#dDel').onclick = async () => {
    if (!(await modal({ titulo: 'Excluir lead', texto: `Excluir <b>${esc(l.nome)}</b> da sua base?`, confirmar: 'Excluir', perigo: true }))) return;
    await api.post('/api/leads/massa', { ids: [id], acao: 'excluir' });
    toast('Lead excluído'); fecharLead(); refreshAtual(); atualizarContador();
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
  try { lista = await api.get('/api/buscas'); } catch (e) { v.innerHTML = erroHtml(e); return; }
  if (state.rota !== 'buscas') return;
  if (!lista.length) {
    v.innerHTML = `<div class="card"><div class="empty"><div class="ill">${ic('history')}</div><h4>Nenhuma busca realizada</h4><p>As prospecções que você fizer ficam registradas aqui.</p><a class="btn primary" href="#/prospeccao">${ic('target', 'sm')}Nova prospecção</a></div></div>`;
    return;
  }
  const st = { concluida: 'b-ok|Concluída', executando: 'b-run|Executando', cancelada: 'b-warn|Interrompida', erro: 'b-err|Erro', interrompida: 'b-warn|Interrompida' };
  v.innerHTML = `<div class="card"><div class="table-wrap"><table class="t">
    <thead><tr><th>#</th><th>Busca</th><th>Onde</th><th>Data</th><th>Status</th><th>Encontradas</th><th>Leads</th><th>Novos</th><th style="text-align:right">Ações</th></tr></thead>
    <tbody>${lista.map((b) => {
      const [cls, rot] = (st[b.status] || 'b-muted|' + b.status).split('|');
      const onde = b.modo === 'area' ? `Área do mapa${b.grade > 1 ? ` (grade ${b.grade}×${b.grade})` : ''}` : esc(b.local || '—');
      return `<tr data-id="${b.id}">
        <td class="muted num">${b.id}</td>
        <td class="co"><b>${esc(b.termo)}</b><small>até ${nf(b.max_resultados)} empresas</small></td>
        <td class="text-2">${onde}</td>
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
    const s = lista.find((x) => x.id === +b.dataset.rep);
    state.prefill = { termo: s.termo, local: s.local, modo: s.modo, grade: s.grade, max_resultados: s.max_resultados, lat: s.latitude, lng: s.longitude, zoom: s.zoom };
    location.hash = '#/prospeccao';
  });
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    const m = await modal({
      titulo: 'Excluir busca', texto: 'O registro desta busca será removido do histórico.',
      corpo: `<label class="check"><input type="checkbox" id="delLeads"><span class="box"></span><span><b>Excluir também os leads desta busca</b><small>Leads que aparecem em outras buscas são mantidos.</small></span></label>`,
      confirmar: 'Excluir', perigo: true,
    });
    if (!m) return;
    await api.del(`/api/buscas/${b.dataset.del}?apagar_leads=${$('#delLeads', m).checked}`);
    toast('Busca excluída'); renderBuscas(); atualizarContador();
  });
}

/* ------------------------------------------------------------ configurações */
async function abrirConfig() {
  const m = await modal({
    titulo: 'Configurações',
    corpo: `
      <div class="field"><label>Mensagem padrão do WhatsApp</label>
        <textarea class="textarea" id="cMsg" rows="4">${esc(cfg.mensagem)}</textarea>
        <span class="hint">Variáveis: <code>{empresa}</code> <code>{bairro}</code> <code>{cidade}</code> <code>{categoria}</code></span></div>
      <div class="field"><label>Abas simultâneas na extração</label>
        <div class="range-row"><input type="range" id="cConc" min="1" max="6" value="${cfg.concorrencia}"><output id="oConc" class="num">${cfg.concorrencia}</output></div>
        <span class="hint">Mais abas = mais rápido, porém aumenta a chance do Google limitar o acesso. Recomendado: 2 a 3.</span></div>
      <label class="check"><input type="checkbox" id="cVis" ${!cfg.headless ? 'checked' : ''}><span class="box"></span>
        <span><b>Mostrar o navegador durante a busca</b><small>Útil para acompanhar ou resolver uma verificação do Google.</small></span></label>`,
    confirmar: 'Salvar',
    aoAbrir: (bg) => { $('#cConc', bg).oninput = (e) => { $('#oConc', bg).textContent = e.target.value; }; },
  });
  if (!m) return;
  cfg.mensagem = $('#cMsg', m).value;
  cfg.concorrencia = +$('#cConc', m).value;
  cfg.headless = !$('#cVis', m).checked;
  salvarCfg();
  toast('Configurações salvas');
}

/* ------------------------------------------------------------ boot */
document.addEventListener('DOMContentLoaded', async () => {
  $('#overlay').onclick = fecharLead;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharLead(); });
  $('#btnConfig').onclick = abrirConfig;
  $('#menuToggle').onclick = () => $('#sidebar').classList.toggle('open');
  window.addEventListener('hashchange', navegar);

  // reata a uma busca em andamento (ex.: após recarregar a página)
  try {
    const ativos = await api.get('/api/jobs');
    const salvo = sessionStorage.getItem('prospecta.job');
    const alvo = ativos.find((j) => j.id === salvo) || ativos[0];
    if (alvo) iniciarAcompanhamento(alvo.id);
  } catch { /* */ }
  navegar();
});
