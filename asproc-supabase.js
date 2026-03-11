/**
 * ASPROC – Supabase Integration Module
 * ══════════════════════════════════════════════════════
 * Cole no <head> de cada página pública:
 *   <script src="asproc-supabase.js"></script>
 *
 * OU adicione diretamente via <script> inline.
 *
 * CONFIGURAÇÃO OBRIGATÓRIA:
 * Altere as duas constantes abaixo com suas credenciais Supabase.
 * ══════════════════════════════════════════════════════
 */

// ──────────────────────────────────────────
//  ⚠️  CONFIGURE AQUI:
// ──────────────────────────────────────────
const SUPABASE_URL = 'https://pajjntbnrmfweqrdpvpy.supabase.co';  // ← altere
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhampudGJucm1md2VxcmRwdnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzI3MDksImV4cCI6MjA4ODgwODcwOX0.a_krlTkjWT_mys_RpvzPRxyYpDn7eS9BB-OajLQepGM';                // ← altere
// ──────────────────────────────────────────

const _SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json'
};

/**
 * Busca dados de uma tabela Supabase.
 * @param {string} table  - Nome da tabela
 * @param {string} params - Query string (ex: 'publicado=eq.true&order=data_pub.desc')
 * @returns {Promise<Array>}
 */
async function sbFetch(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  const res = await fetch(url, { headers: _SB_HEADERS });
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  return res.json();
}

/**
 * Envia um registro para uma tabela Supabase (INSERT).
 * @param {string} table
 * @param {object} data
 */
async function sbInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ..._SB_HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase insert error ${res.status}`);
  }
  return res.json();
}

/* ══════════════════════════════════════════════════════
   NOTICIAS.HTML – Substituição dinâmica das notícias
   
   Adicione os atributos a seguir nos elementos HTML:
     - id="noticias-grid"         no container dos cards
     - id="noticia-destaque"      no card de destaque
     - id="noticias-loading"      spinner de loading (opcional)
   
   Chame: initNoticias()  ao carregar a página.
══════════════════════════════════════════════════════ */

async function initNoticias() {
  try {
    const data = await sbFetch('noticias', 'publicado=eq.true&order=data_pub.desc&limit=20');
    renderNoticias(data);
  } catch (e) {
    console.error('[ASPROC] Erro ao carregar notícias:', e);
  }
}

function renderNoticias(list) {
  const grid = document.getElementById('noticias-grid');
  if (!grid || !list.length) return;

  const destaque = list.find(n => n.destaque) || list[0];
  const resto = list.filter(n => n.id !== destaque.id).slice(0, 6);

  // Card destaque
  const featCard = document.getElementById('noticia-destaque');
  if (featCard && destaque) {
    const onClick = destaque.url_externa
      ? `onclick="window.open('${escUrl(destaque.url_externa)}','_blank')"`
      : '';
    featCard.setAttribute('data-tag', destaque.categoria);
    featCard.setAttribute(onClick ? 'onclick' : 'data-id', destaque.url_externa || destaque.id);
    featCard.querySelector('.feat-info-title') &&
      (featCard.querySelector('.feat-info-title').textContent = destaque.titulo);
    featCard.querySelector('.feat-date') &&
      (featCard.querySelector('.feat-date').textContent = fmtDataBR(destaque.data_pub));
  }

  // Cards normais
  grid.innerHTML = resto.map(n => `
    <a class="nc reveal" data-tag="${escHtml(n.categoria)}"
       href="${n.url_externa ? escUrl(n.url_externa) : '#'}"
       ${n.url_externa ? 'target="_blank"' : ''}>
      <div class="nc-meta-row">
        <div class="nc-date">${fmtDataBR(n.data_pub)}</div>
        <div class="nc-tag">${catLabel(n.categoria)}</div>
      </div>
      <div class="nc-title">${escHtml(n.titulo)}</div>
      <div class="nc-exc">${escHtml(n.resumo)}</div>
      <span class="nc-ler">Ler mais →</span>
    </a>`).join('');
}

/* ══════════════════════════════════════════════════════
   TRABALHE-CONOSCO.HTML – Vagas dinâmicas
   
   Adicione no container das vagas:
     id="vagas-grid"
   
   Chame: initVagas()
══════════════════════════════════════════════════════ */

async function initVagas() {
  try {
    const data = await sbFetch('vagas', 'order=created_at.desc&limit=20');
    renderVagas(data);
  } catch (e) {
    console.error('[ASPROC] Erro ao carregar vagas:', e);
  }
}

function renderVagas(list) {
  const grid = document.getElementById('vagas-grid');
  const sel = document.getElementById('cf-vaga');
  if (!grid || !list.length) return;

  // Atualizar select do formulário
  if (sel) {
    const abertas = list.filter(v => v.status === 'aberta');
    sel.innerHTML = '<option value="">Selecionar vaga…</option>' +
      abertas.map(v => `<option value="${escHtml(v.titulo)}">${escHtml(v.titulo)}</option>`).join('');
  }

  grid.innerHTML = list.map((v, i) => `
    <div class="vcard reveal" style="transition-delay:${i * 0.12}s">
      <div class="vc-body">
        <span class="vc-status ${v.status === 'aberta' ? 'ab' : 'enc'}">
          ● ${v.status === 'aberta' ? 'Aberta' : v.status === 'encerrada' ? 'Encerrada' : 'Suspensa'}
        </span>
        ${v.prazo ? `<div class="vc-prazo">⏰ Prazo: ${fmtDataBR(v.prazo)}</div>` : ''}
        <div class="vc-title">${escHtml(v.titulo)}</div>
        <div class="vc-desc">${escHtml(v.descricao)}</div>
        <div class="vc-chips">
          <span class="chip">${escHtml(v.local)}</span>
          <span class="chip">${escHtml(v.carga_horaria)}</span>
          <span class="chip">${escHtml(v.regime)}</span>
          <span class="chip">${escHtml(v.escolaridade)}</span>
        </div>
        <div class="vc-btns">
          ${v.edital_url
      ? `<a href="${escUrl(v.edital_url)}" class="vbtn-dl" target="_blank" download>⬇ Baixar Edital</a>`
      : '<span></span>'}
          ${v.status === 'aberta'
      ? `<button class="vbtn-apply" onclick="setVaga('${escHtml(v.titulo)}')">Candidatar-se →</button>`
      : `<button class="vbtn-apply" disabled style="opacity:.5;cursor:not-allowed">Encerrada</button>`}
        </div>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════
   AVISOS.HTML – Avisos dinâmicos
   
   Adicione no container dos avisos:
     id="avisos-list"
   
   Chame: initAvisos()
══════════════════════════════════════════════════════ */

async function initAvisos() {
  try {
    const data = await sbFetch('avisos', 'publicado=eq.true&order=data_pub.desc&limit=20');
    renderAvisos(data);
  } catch (e) {
    console.error('[ASPROC] Erro ao carregar avisos:', e);
  }
}

function renderAvisos(list) {
  const container = document.getElementById('avisos-list');
  if (!container || !list.length) return;

  container.innerHTML = list.map(a => `
    <div class="av-card reveal">
      <div class="av-header">
        <div><span class="badge ${tipoCss(a.tipo)}">${tipoLabel(a.tipo)}</span></div>
        <span class="av-date">${a.tipo === 'urgente' ? 'Prazo' : 'Publicado em'} ${fmtDataBR(a.data_pub)}</span>
      </div>
      <div class="av-title">${escHtml(a.titulo)}</div>
      <div class="av-desc">${escHtml(a.descricao)}</div>
      ${a.doc_url
      ? `<div class="av-actions"><a href="${escUrl(a.doc_url)}" target="_blank" class="av-btn">📄 Ver documento →</a></div>`
      : ''}
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════
   CANDIDATURA – Envio do formulário de candidatura
   
   Adapte o handler do formulário de trabalhe-conosco.html:
     submitCandidatura({ nome, email, telefone, vaga, mensagem })
══════════════════════════════════════════════════════ */

async function submitCandidatura({ nome, email, telefone, vaga, mensagem }) {
  await sbInsert('candidaturas', { nome, email, telefone, vaga, mensagem });
}

/* ══════════════════════════════════════════════════════
   MINI-FEED PARA INDEX_ASPROC.HTML
   
   Substitui os cards estáticos de notícias na home.
   Adicione id="home-noticias-grid" na section de notícias.
   Chame: initHomeNoticias()
══════════════════════════════════════════════════════ */

async function initHomeNoticias() {
  try {
    const data = await sbFetch('noticias', 'publicado=eq.true&order=data_pub.desc&limit=3');
    const grid = document.getElementById('home-noticias-grid');
    if (!grid || !data.length) return;

    grid.innerHTML = data.map((n, i) => `
      <a href="${n.url_externa ? escUrl(n.url_externa) : 'noticias.html'}"
         ${n.url_externa ? 'target="_blank"' : ''}
         class="noticia-card reveal" style="transition-delay:${i * 0.1}s">
        <div class="noticia-info">
          <div class="noticia-date">${fmtDataBR(n.data_pub)}</div>
          <h3>${escHtml(n.titulo)}</h3>
        </div>
      </a>`).join('');
  } catch (e) {
    console.error('[ASPROC] Erro ao carregar home notícias:', e);
  }
}

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escUrl(url) {
  try { return encodeURI(decodeURI(url)); }
  catch { return '#'; }
}

function fmtDataBR(d) {
  if (!d) return '';
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  try {
    const dt = new Date(d + 'T00:00:00');
    return `${meses[dt.getMonth()]} ${dt.getFullYear()}`;
  } catch { return d; }
}

function catLabel(cat) {
  const map = {
    pirarucu: '🐟 Pirarucu', olea: '🌿 Oleaginosas',
    sanear: '💧 Saneamento', comercio: '🛒 Comércio',
    vagas: '📋 Vagas', geral: '📌 Geral'
  };
  return map[cat] || cat;
}

function tipoLabel(t) {
  return { doc: '📋 Documento', urgente: '🔴 Urgente', info: 'ℹ️ Informativo' }[t] || t;
}

function tipoCss(t) {
  return { doc: 'doc', urgente: 'urgente', info: 'info' }[t] || 'info';
}
