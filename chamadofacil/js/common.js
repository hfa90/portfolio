/* =========================================================
   CHAMADO FÁCIL — utilitários compartilhados
   ========================================================= */
(function () {
  const C = window.CF_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cf-auth' },
  });

  /* ---------- ícones (SVG inline, traço 2px) ---------- */
  const P = {
    ticket: '<path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    scanner: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M9 6h6v5H9z"/><path d="M10 15h.01M14 15h.01M10 18h.01M14 18h.01"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2.5 2.5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    barcode: '<path d="M3 5v14M7 5v14M11 5v14M14 5v14M17 5v14M21 5v14"/>',
    dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    swap: '<path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 0-5-5L13 5z"/>',
  };
  function icon(name, cls = '') {
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  }

  /* ---------- formatação ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tz = C.FUSO;
  const fmtHora = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const fmtData = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: tz });
  const fmtDataHora = (d) => `${fmtData(d)} ${fmtHora(d)}`;
  function fmtDuracao(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return `${h}h${r ? String(r).padStart(2, '0') : ''}`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  }
  function relTempo(d) {
    const ms = Date.now() - new Date(d).getTime();
    if (ms < 45000) return 'agora';
    return 'há ' + fmtDuracao(ms);
  }
  const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const primeiroNome = (nome) => { const p = String(nome || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] || ''; };
  const codigoColetor = (n) => 'COL-' + String(n).padStart(3, '0');
  const soDigitos = (s) => String(s || '').replace(/\D/g, '');

  function horaLocal(d = new Date()) {
    const s = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  }
  function turnoAtual(d = new Date()) {
    const now = horaLocal(d);
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    for (const t of C.TURNOS) {
      const a = toMin(t.inicio), b = toMin(t.fim);
      if (a < b ? now >= a && now < b : now >= a || now < b) return t;
    }
    return C.TURNOS[0];
  }

  /* ---------- janelas de turno (data do turno = dia em que ele começa) ---------- */
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const ymdLocal = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: tz });
  const somaDias = (ymd, n) => new Date(new Date(`${ymd}T12:00:00${C.OFFSET}`).getTime() + n * 864e5).toLocaleDateString('en-CA', { timeZone: tz });
  const turnoPorId = (id) => C.TURNOS.find((t) => t.id === id) || C.TURNOS[0];
  function janelaTurno(data, id) {
    const t = turnoPorId(id);
    const inicio = new Date(`${data}T${t.inicio}:00${C.OFFSET}`);
    let fim = new Date(`${data}T${t.fim}:00${C.OFFSET}`);
    if (fim <= inicio) fim = new Date(fim.getTime() + 864e5);
    return { id: t.id, data, inicio, fim };
  }
  function turnoInfo(d = new Date()) {
    const t = turnoAtual(d);
    let data = ymdLocal(d);
    if (toMin(t.inicio) > toMin(t.fim) && horaLocal(d) < toMin(t.fim)) data = somaDias(data, -1);
    return janelaTurno(data, t.id);
  }
  // Próximo fim do turno "id" depois do instante ts (igual a fim_turno() no SQL)
  function fimTurno(ts, id) {
    const d = new Date(ts);
    const t = id ? turnoPorId(id) : turnoAtual(d);
    let fim = new Date(`${ymdLocal(d)}T${t.fim}:00${C.OFFSET}`);
    if (fim <= d) fim = new Date(fim.getTime() + 864e5);
    return fim;
  }
  // Coletor em uso que passou do fim do turno + tolerância
  function estaAtrasado(c, agora = Date.now()) {
    if (c.status !== 'EM_USO' || !c.retirado_em) return false;
    const lim = c.turno_retirada ? fimTurno(c.retirado_em, c.turno_retirada).getTime() + C.TOLERANCIA_MIN * 60000
      : new Date(c.retirado_em).getTime() + C.HORAS_ALERTA * 3600e3;
    return agora > lim;
  }

  // Normaliza equipe a partir do "Setor" da WorkArea
  function equipeDoSetor(setor) {
    let s = String(setor || '').trim();
    s = s.replace(/^(EQ|SUPCD|COORDCD)\s*-\s*/i, '').replace(/\s*-\s*CD AM$/i, '').replace(/PROD/g, 'PRD').replace(/^AM - /, '');
    return s.trim();
  }
  function perfilDoCargo(cargo) {
    if (/coordenador/i.test(cargo)) return 'coordenador';
    if (/supervisor/i.test(cargo)) return 'supervisor';
    return 'colaborador';
  }

  /* ---------- Código de barras (Code 128-B, sem biblioteca externa) ---------- */
  const C128 = '212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232,2331112'.split(',');
  function barrasSvg(texto, { altura = 40, quiet = 10 } = {}) {
    const t = String(texto).replace(/[^\x20-\x7E]/g, '');
    const cod = [104];                         // Start B
    for (const ch of t) cod.push(ch.charCodeAt(0) - 32);
    let soma = 104;
    cod.slice(1).forEach((v, i) => { soma += v * (i + 1); });
    cod.push(soma % 103, 106);                // dígito verificador + Stop
    let x = quiet, rects = '';
    cod.forEach((v) => {
      [...C128[v]].forEach((w, i) => {
        w = +w;
        if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${altura}"/>`;
        x += w;
      });
    });
    const larg = x + quiet;
    return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${larg} ${altura}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${larg}" height="${altura}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  }

  /* ---------- QR code ---------- */
  function qrSvg(texto, margem = 1) {
    const q = window.qrcode(0, 'M');
    q.addData(String(texto));
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: margem, scalable: true });
  }

  /* ---------- toast ---------- */
  function toast(titulo, texto = '', tipo = 'ok', ms = 4500) {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    const ic = { ok: 'check', err: 'alert', ret: 'up', dev: 'down', info: 'bell' }[tipo] || 'bell';
    el.innerHTML = `<div class="ti">${icon(ic)}</div><div><b>${esc(titulo)}</b>${texto ? `<span>${esc(texto)}</span>` : ''}</div>`;
    box.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms);
  }

  /* ---------- sons (sem arquivos externos) ---------- */
  let actx;
  function beep(tipo = 'ok') {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { ok: [880, 1320], ret: [660, 990], dev: [990, 660], err: [220, 180], notif: [740, 988] }[tipo] || [880];
      seq.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = tipo === 'err' ? 'square' : 'sine';
        o.frequency.value = f;
        const t = actx.currentTime + i * 0.13;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + 0.13);
      });
    } catch (e) { /* sem áudio */ }
  }

  /* ---------- modal ---------- */
  function modal({ titulo, corpo, rodape = '', largo = false, onOpen }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${largo ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${titulo}</h3><button class="menu-btn" data-close aria-label="Fechar">${icon('x')}</button></div>
      <div class="modal-body">${corpo}</div>
      ${rodape ? `<div class="modal-foot">${rodape}</div>` : ''}
    </div>`;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    const api = { el: back, close, $: (s) => back.querySelector(s), $$: (s) => back.querySelectorAll(s) };
    onOpen && onOpen(api);
    return api;
  }
  function confirmar(titulo, texto, rotulo = 'Confirmar', perigo = false) {
    return new Promise((res) => {
      const m = modal({
        titulo: esc(titulo),
        corpo: `<p style="margin:0">${texto}</p>`,
        rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(rotulo)}</button>`,
      });
      m.$('[data-ok]').onclick = () => { m.close(); res(true); };
      m.el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => res(false)));
    });
  }

  /* ---------- sessão ---------- */
  const emailDe = (matricula) => `${soDigitos(matricula)}@${C.EMAIL_DOMINIO}`;
  async function entrar(matricula, cpf) {
    const { data, error } = await sb.auth.signInWithPassword({ email: emailDe(matricula), password: soDigitos(cpf) });
    if (error) throw error;
    return data;
  }
  async function meuPerfil() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb.from('colaboradores').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error || !data || !['supervisor', 'coordenador', 'admin'].includes(data.perfil)) return null;
    return data;
  }
  async function exigirLogin() {
    const p = await meuPerfil();
    if (!p) { location.replace('index.html'); throw new Error('sem sessão'); }
    return p;
  }
  async function sair() {
    await sb.auth.signOut();
    location.replace('index.html');
  }

  function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function baixarCSV(nome, linhas) {
    const csv = linhas.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Carrega todos os registros paginando (limite padrão do Supabase = 1000)
  async function buscarTudo(query) {
    const out = []; let de = 0; const passo = 1000;
    for (;;) {
      const { data, error } = await query().range(de, de + passo - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < passo) break;
      de += passo;
    }
    return out;
  }

  window.CF = {
    sb, C, icon, esc, fmtHora, fmtData, fmtDataHora, fmtDuracao, relTempo, iniciais, primeiroNome,
    codigoColetor, soDigitos, turnoAtual, turnoInfo, janelaTurno, fimTurno, estaAtrasado, ymdLocal, somaDias, equipeDoSetor, perfilDoCargo, qrSvg, barrasSvg, toast, beep, modal,
    confirmar, entrar, meuPerfil, exigirLogin, sair, debounce, baixarCSV, buscarTudo,
  };
})();
