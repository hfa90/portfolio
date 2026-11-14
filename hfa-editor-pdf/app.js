/* HFA Editor PDF — editor de PDF 100% no navegador (pdf.js + pdf-lib) */
'use strict';
(() => {
  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let _n = 0;
  const uid = (p = 'e') => p + (++_n).toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const rotVec = (a, b, deg) => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [a * c - b * s, a * s + b * c]; };

  const LIBS_OK = !!(window.pdfjsLib && window.PDFLib);
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // ---------- ícones ----------
  const ICONS = {
    pointer: 'M5 3l6.5 17 2.4-7.1L21 10.5z',
    textedit: 'M4 7V4h11v3 M9.5 4v15 M7 19h5 M15.5 20l4.8-4.8a1.6 1.6 0 00-2.3-2.3L13.2 17.7 12.6 20.6z',
    text: 'M4 7V4h16v3 M9 20h6 M12 4v16',
    pen: 'M12 20h9 M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
    highlight: 'M9 11l-6 6v3h9l3-3 M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4',
    rect: 'M3.5 5.5h17v13h-17z',
    ellipse: 'M3 12a9 7 0 1018 0 9 7 0 10-18 0',
    line: 'M5 19L19 5',
    arrow: 'M5 19L19 5 M10 5h9v9',
    eraser: 'M20 20H8.5L3.6 15.1a2 2 0 010-2.8L12.3 3.6a2 2 0 012.8 0l5.3 5.3a2 2 0 010 2.8L12 20 M8 10.5l6.5 6.5',
    image: 'M3.5 4.5h17v15h-17z M3.5 16l5-5 4.5 4.5 3-3 4.5 4.5 M15.5 8.5h.01',
    sign: 'M3 17c2.5-5 4.5-8 6-8 2.5 0-1 8 1.5 8 1.6 0 2.6-4 4-4 1.2 0 1 2.5 2.4 2.5.9 0 1.6-.8 2.1-1.5 M3 21h18',
    undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 010 10h-3',
    redo: 'M15 14l5-5-5-5 M20 9H9a5 5 0 000 10h3',
    plus: 'M12 5v14 M5 12h14',
    minus: 'M5 12h14',
    download: 'M12 3v12 M7 10l5 5 5-5 M5 21h14',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5',
    rotl: 'M3 12a9 9 0 109-9 9.5 9.5 0 00-6.6 2.7L3 8 M3 3v5h5',
    rotr: 'M21 12a9 9 0 11-9-9 9.5 9.5 0 016.6 2.7L21 8 M21 3v5h-5',
    copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
    fileplus: 'M14 3H6.5A1.5 1.5 0 005 4.5v15A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V8z M14 3v5h5 M12 11v6 M9 14h6',
    filepdf: 'M14 3H6.5A1.5 1.5 0 005 4.5v15A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V8z M14 3v5h5 M9 13h1.5a1.5 1.5 0 010 3H9v-3 M9 16v2 M14 13v5 M14 13h2.5 M14 15.5h2',
    up: 'M12 19V5 M6 11l6-6 6 6',
    down: 'M12 5v14 M6 13l6 6 6-6',
    moon: 'M20.5 14.5A8.5 8.5 0 119.5 3.5a7 7 0 0011 11z',
    sun: 'M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
    back: 'M15 18l-6-6 6-6',
    x: 'M6 6l12 12 M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7',
    shield: 'M12 3l8 3v6c0 5-3.5 8.3-8 9-4.5-.7-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-4.5',
    pages: 'M8 3h10a2 2 0 012 2v12 M5 7h10a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z',
    sliders: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M16 4v4 M10 10v4 M18 16v4',
    keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
    edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  };
  const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`;
  const hydrateIcons = (root = document) => $$('[data-icon]', root).forEach((e) => { if (!e.querySelector(':scope > .ic')) e.insertAdjacentHTML('afterbegin', icon(e.dataset.icon)); });

  // ---------- fontes padrão do PDF ----------
  // k = posição da linha de base (em múltiplos do tamanho) dentro de uma linha com altura 1.2
  const FONTS = {
    Helvetica: { css: 'Helvetica, Arial, "Liberation Sans", sans-serif', k: 0.9465, std: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'] },
    Times: { css: '"Times New Roman", Times, "Liberation Serif", serif', k: 0.9375, std: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'] },
    Courier: { css: '"Courier New", Courier, "Liberation Mono", monospace', k: 0.8665, std: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] },
  };
  const LH = 1.2;

  const TYPE = {
    text: { label: 'Texto', icon: 'text' }, rect: { label: 'Retângulo', icon: 'rect' }, ellipse: { label: 'Elipse', icon: 'ellipse' },
    line: { label: 'Linha', icon: 'line' }, arrow: { label: 'Seta', icon: 'arrow' }, draw: { label: 'Desenho', icon: 'pen' },
    highlight: { label: 'Destaque', icon: 'highlight' }, whiteout: { label: 'Corretivo', icon: 'eraser' }, image: { label: 'Imagem', icon: 'image' },
    select: { label: '' }, edittext: { label: 'Editar texto', icon: 'textedit' },
  };
  const PROPS = {
    text: ['color', 'opacity', 'font'], edittext: ['color', 'font'],
    rect: ['color', 'width', 'fill', 'opacity'], ellipse: ['color', 'width', 'fill', 'opacity'],
    line: ['color', 'width', 'opacity'], arrow: ['color', 'width', 'opacity'], draw: ['color', 'width', 'opacity'],
    highlight: ['color', 'opacity'], whiteout: ['fill'], image: ['opacity'],
  };
  const SWATCHES = ['#111827', '#ffffff', '#e11d48', '#f97316', '#facc15', '#16a34a', '#2563eb', '#7c3aed'];
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  // ---------- estado ----------
  const S = {
    docs: {}, pages: [], assets: {},
    tool: 'select', sel: null, cur: null, zoom: 1, fileName: 'documento.pdf', dirty: false, fillColor: '#fde68a',
    defs: {
      text: { color: '#111827', opacity: 1, font: 'Helvetica', size: 14, bold: false, italic: false },
      edittext: { color: '#111827', font: 'Helvetica', size: 12, bold: false, italic: false },
      rect: { color: '#e11d48', width: 2, fill: null, opacity: 1 },
      ellipse: { color: '#e11d48', width: 2, fill: null, opacity: 1 },
      line: { color: '#e11d48', width: 2, opacity: 1 },
      arrow: { color: '#e11d48', width: 2.5, opacity: 1 },
      draw: { color: '#2563eb', width: 3, opacity: 1 },
      highlight: { color: '#facc15', opacity: 0.45 },
      whiteout: { fill: '#ffffff' },
      image: { opacity: 1 },
    },
  };
  const H = { stack: [], i: -1 };
  const SLOTS = new Map(); // pageId -> rec
  const SLOT_REC = new WeakMap(); // slot element -> rec
  const RC = new Map(); // cache de rasterização (página principal)
  const TC = new Map(); // cache de miniaturas
  const TXT = new Map(); // cache de textos extraídos
  let EDIT = null; // texto em edição
  let DRAG = null;
  let renderQ = Promise.resolve();
  let thumbQ = Promise.resolve();
  let io = null, tio = null;

  const viewer = $('#viewer');
  const pageById = (id) => S.pages.find((p) => p.id === id);
  const totalRot = (p) => (((p.baseRot + p.rot) % 360) + 360) % 360;
  const dispDims = (p) => (totalRot(p) % 180 ? [p.h, p.w] : [p.w, p.h]);
  const selected = () => {
    if (!S.sel) return null;
    const page = pageById(S.sel.pageId); const el = page && page.els.find((e) => e.id === S.sel.elId);
    return el ? { page, el } : null;
  };

  // ---------- UI básica ----------
  function toast(msg, kind = '') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3200);
  }
  function busy(msg) { const b = $('#busy'); if (msg) { $('#busyTxt').textContent = msg; b.hidden = false; } else b.hidden = true; }

  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $$('[data-act="theme"]').forEach((b) => { b.innerHTML = icon(dark ? 'sun' : 'moon'); });
  }
  function toggleTheme() {
    const curDark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const t = curDark ? 'light' : 'dark'; LS.set('hfa-theme', t); applyTheme(t);
  }

  // ---------- abrir arquivos ----------
  function isPdf(f) { return f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)); }

  async function loadDoc(bytes, name) {
    try { await PDFLib.PDFDocument.load(bytes, { updateMetadata: false }); }
    catch (e) { if (/encrypt/i.test(e.message || '')) throw new Error('ENCRYPTED'); throw e; }
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    return { id: uid('d'), name, bytes, pdf };
  }
  async function pagesOf(doc) {
    const out = [];
    for (let i = 0; i < doc.pdf.numPages; i++) {
      const p = await doc.pdf.getPage(i + 1); const v = p.view;
      out.push({ id: uid('p'), docId: doc.id, index: i, x0: v[0], y0: v[1], w: v[2] - v[0], h: v[3] - v[1], baseRot: p.rotate || 0, rot: 0, els: [] });
    }
    return out;
  }
  function blankPage(w = 595.28, h = 841.89) { return { id: uid('p'), docId: null, index: 0, x0: 0, y0: 0, w, h, baseRot: 0, rot: 0, els: [] }; }

  async function openFiles(files, append = false) {
    if (!LIBS_OK) return toast('Não foi possível carregar as bibliotecas de PDF. Verifique sua conexão e recarregue a página.', 'error');
    const pdfs = Array.from(files).filter(isPdf);
    if (!pdfs.length) return toast('Selecione um arquivo PDF.', 'error');
    busy(pdfs.length > 1 ? `Abrindo ${pdfs.length} PDFs…` : 'Abrindo PDF…');
    const added = [];
    try {
      for (const f of pdfs) {
        let doc;
        try { doc = await loadDoc(new Uint8Array(await f.arrayBuffer()), f.name); }
        catch (e) {
          console.error(e);
          toast(e.message === 'ENCRYPTED' ? `“${f.name}” é protegido por senha ou criptografado. Desbloqueie-o antes de editar.` : `Não foi possível abrir “${f.name}”. O arquivo pode estar corrompido.`, 'error');
          continue;
        }
        added.push({ doc, pages: await pagesOf(doc), name: f.name });
      }
      if (!added.length) return;
      const newPages = added.flatMap((a) => a.pages);
      if (!append) {
        resetState();
        S.fileName = added[0].name;
        added.forEach((a) => { S.docs[a.doc.id] = a.doc; });
        S.pages = newPages;
        enterEditor();
        if (added.length > 1) toast(`${added.length} PDFs combinados em um só documento.`);
      } else {
        added.forEach((a) => { S.docs[a.doc.id] = a.doc; });
        const idx = Math.max(0, S.pages.findIndex((p) => p.id === S.cur));
        S.pages.splice(idx + 1, 0, ...newPages);
        commit(); rebuild(); setCur(newPages[0].id, true);
        toast(`${newPages.length} página(s) inserida(s).`, 'ok');
      }
    } finally { busy(false); }
  }

  function newBlank() {
    if (!LIBS_OK) return toast('Não foi possível carregar as bibliotecas de PDF. Verifique sua conexão.', 'error');
    resetState(); S.fileName = 'documento.pdf'; S.pages = [blankPage()]; enterEditor();
  }

  function resetState() {
    EDIT = null; DRAG = null;
    Object.values(S.docs).forEach((d) => { try { d.pdf.destroy(); } catch { /* */ } });
    S.docs = {}; S.pages = []; S.assets = {}; S.sel = null; S.cur = null; S.dirty = false;
    RC.clear(); TC.clear(); TXT.clear(); H.stack = []; H.i = -1;
  }

  function enterEditor() {
    $('#landing').hidden = true; $('#editor').hidden = false; document.body.classList.add('is-editing');
    $('#fname').textContent = S.fileName; $('#fname').title = S.fileName;
    document.title = S.fileName + ' — HFA Editor PDF';
    S.cur = S.pages[0].id; commit(); S.dirty = false;
    setTool('select');
    const maxW = Math.max(...S.pages.map((p) => dispDims(p)[0]));
    S.zoom = clamp(Math.floor(((viewer.clientWidth - 60) / maxW) * 100) / 100, 0.3, 1.4);
    $('#zoomLbl').textContent = Math.round(S.zoom * 100) + '%';
    rebuild(); viewer.scrollTop = 0;
  }
  function leaveEditor() {
    if (S.dirty && !confirm('Existem alterações que ainda não foram baixadas. Deseja sair mesmo assim?')) return;
    resetState(); viewer.replaceChildren(); $('#thumbs').replaceChildren();
    $('#editor').hidden = true; $('#landing').hidden = false; document.body.classList.remove('is-editing');
    document.title = 'HFA Editor PDF — Edite PDF grátis no navegador';
  }

  // ---------- histórico ----------
  function commit() {
    const s = JSON.stringify(S.pages);
    if (H.stack[H.i] === s) return;
    H.stack = H.stack.slice(0, H.i + 1); H.stack.push(s);
    if (H.stack.length > 300) H.stack.shift();
    H.i = H.stack.length - 1; S.dirty = true;
    updateUndo(); renderLayers();
  }
  let commitT = 0;
  const commitSoon = () => { clearTimeout(commitT); commitT = setTimeout(commit, 400); };
  function restore() {
    S.pages = JSON.parse(H.stack[H.i]);
    if (!selected()) S.sel = null;
    if (!pageById(S.cur)) S.cur = S.pages[0] && S.pages[0].id;
    S.dirty = true; rebuild(); updateUndo(); syncProps();
  }
  function undo() { finishEdit(); clearTimeout(commitT); if (H.i > 0) { H.i--; restore(); } }
  function redo() { finishEdit(); if (H.i < H.stack.length - 1) { H.i++; restore(); } }
  function updateUndo() { $('#undoBtn').disabled = H.i <= 0; $('#redoBtn').disabled = H.i >= H.stack.length - 1; }

  // ---------- renderização das páginas ----------
  function pgTransform(p, z) {
    switch (totalRot(p)) {
      case 90: return `translate(${p.h * z}px,0) rotate(90deg)`;
      case 180: return `translate(${p.w * z}px,${p.h * z}px) rotate(180deg)`;
      case 270: return `translate(0,${p.w * z}px) rotate(270deg)`;
      default: return 'none';
    }
  }

  function rebuildPages() {
    if (EDIT) finishEdit();
    if (io) io.disconnect();
    io = new IntersectionObserver(onIO, { root: viewer, rootMargin: '900px 0px' });
    viewer.replaceChildren(); SLOTS.clear();
    const z = S.zoom, n = S.pages.length;
    S.pages.forEach((p, i) => {
      const [dw, dh] = dispDims(p);
      const wrap = document.createElement('section'); wrap.className = 'pwrap';
      wrap.innerHTML = `<div class="slot" data-page="${p.id}" style="width:${dw * z}px;height:${dh * z}px"><div class="pg" style="width:${p.w * z}px;height:${p.h * z}px;transform:${pgTransform(p, z)}"><div class="cv"></div><div class="hints"></div><div class="els"></div><div class="selx"></div></div></div><div class="pnum">Página ${i + 1} de ${n}</div>`;
      viewer.appendChild(wrap);
      const slot = wrap.firstElementChild;
      const rec = { slot, cv: $('.cv', slot), els: $('.els', slot), hints: $('.hints', slot), selx: $('.selx', slot), visible: false, rz: null, pending: false };
      SLOTS.set(p.id, rec); SLOT_REC.set(slot, rec);
      io.observe(slot);
      renderEls(p);
    });
    renderSel();
    if (S.tool === 'edittext') renderHints();
    updatePageInd();
  }
  function rebuild() { rebuildPages(); renderThumbs(); renderLayers(); }

  function onIO(entries) {
    for (const en of entries) {
      const rec = SLOT_REC.get(en.target); if (!rec) continue;
      rec.visible = en.isIntersecting;
      if (rec.visible) ensureRendered(rec);
    }
  }

  async function rasterize(page, scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(page.w * scale * dpr)); c.height = Math.max(1, Math.round(page.h * scale * dpr));
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    if (!page.docId) return c;
    const doc = S.docs[page.docId]; if (!doc) return c;
    const pp = await doc.pdf.getPage(page.index + 1);
    const vp = pp.getViewport({ scale: scale * dpr, rotation: 0 });
    await pp.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  }
  function cloneCanvas(src) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }
  const srcKey = (p) => (p.docId ? `${p.docId}:${p.index}` : `blank:${p.w}x${p.h}`);

  function ensureRendered(rec) {
    if (rec.rz === S.zoom || rec.pending) return;
    rec.pending = true;
    renderQ = renderQ.then(async () => {
      rec.pending = false;
      if (!rec.visible || !rec.slot.isConnected || rec.rz === S.zoom) return;
      const page = pageById(rec.slot.dataset.page); if (!page) return;
      const z = S.zoom, key = srcKey(page) + '@' + z;
      let c = RC.get(key);
      if (!c) { c = await rasterize(page, z); RC.set(key, c); }
      if (!rec.slot.isConnected || S.zoom !== z) return;
      rec.cv.replaceChildren(c.isConnected ? cloneCanvas(c) : c); rec.rz = z;
    }).catch((e) => console.error(e));
  }

  // ---------- elementos ----------
  function lineGeom(el) {
    const { x1, y1, x2, y2 } = el;
    if (el.type !== 'arrow') return { ex: x2, ey: y2 };
    const a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
    const L = Math.min(Math.max(9, el.width * 4), len), W = L * 0.55;
    const bx = x2 - L * Math.cos(a), by = y2 - L * Math.sin(a);
    const px = -Math.sin(a) * W, py = Math.cos(a) * W;
    const pts = [[x2, y2], [bx + px, by + py], [bx - px, by - py]];
    return { ex: bx, ey: by, pts };
  }
  const f2 = (n) => Math.round(n * 100) / 100;
  function pathD(pts) {
    if (!pts.length) return '';
    let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
    if (pts.length < 3) { for (let i = 1; i < pts.length; i++) d += ` L${f2(pts[i][0])} ${f2(pts[i][1])}`; if (pts.length === 1) d += ` L${f2(pts[0][0] + 0.01)} ${f2(pts[0][1])}`; return d; }
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ` Q${f2(pts[i][0])} ${f2(pts[i][1])} ${f2(mx)} ${f2(my)}`;
    }
    const l = pts[pts.length - 1]; d += ` L${f2(l[0])} ${f2(l[1])}`;
    return d;
  }

  function shapeSvg(el) {
    const id = esc(el.id), op = el.opacity ?? 1;
    switch (el.type) {
      case 'rect': return `<rect data-el="${id}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.fill || 'none'}" stroke="${el.color}" stroke-width="${el.width}" opacity="${op}" pointer-events="all"/>`;
      case 'ellipse': return `<ellipse data-el="${id}" cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="${el.fill || 'none'}" stroke="${el.color}" stroke-width="${el.width}" opacity="${op}" pointer-events="all"/>`;
      case 'highlight': return `<rect data-el="${id}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.color}" opacity="${op}" pointer-events="all"/>`;
      case 'whiteout': return `<rect data-el="${id}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.fill || '#ffffff'}" pointer-events="all"/>`;
      case 'line': case 'arrow': {
        const g = lineGeom(el), hit = Math.max(el.width + 10, 14);
        return `<g data-el="${id}" opacity="${op}"><line x1="${el.x1}" y1="${el.y1}" x2="${g.ex}" y2="${g.ey}" stroke="${el.color}" stroke-width="${el.width}" stroke-linecap="round"/>${g.pts ? `<polygon points="${g.pts.map((p) => p.join(',')).join(' ')}" fill="${el.color}"/>` : ''}<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="transparent" stroke-width="${hit}" pointer-events="stroke"/></g>`;
      }
      case 'draw': {
        const d = pathD(el.pts), hit = Math.max(el.width + 10, 14);
        return `<g data-el="${id}" opacity="${op}"><path d="${d}" fill="none" stroke="${el.color}" stroke-width="${el.width}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="transparent" stroke-width="${hit}" stroke-linecap="round" pointer-events="stroke"/></g>`;
      }
      default: return '';
    }
  }

  function makeNode(el, i, page, z) {
    let n;
    if (el.type === 'text') {
      n = document.createElement('div'); n.className = 'el el-text'; n.dataset.el = el.id;
      const f = FONTS[el.font] || FONTS.Helvetica;
      Object.assign(n.style, {
        left: el.x * z + 'px', top: el.y * z + 'px', fontSize: el.size * z + 'px', fontFamily: f.css,
        fontWeight: el.bold ? '700' : '400', fontStyle: el.italic ? 'italic' : 'normal', color: el.color,
        opacity: el.opacity ?? 1, transform: el.rot ? `rotate(${el.rot}deg)` : '',
      });
      n.textContent = el.text;
    } else if (el.type === 'image') {
      const a = S.assets[el.asset];
      n = document.createElement('img'); n.className = 'el el-img'; n.dataset.el = el.id; n.alt = ''; n.draggable = false;
      if (a) n.src = a.data;
      Object.assign(n.style, { left: el.x * z + 'px', top: el.y * z + 'px', width: el.w * z + 'px', height: el.h * z + 'px', opacity: el.opacity ?? 1, transform: el.rot ? `rotate(${el.rot}deg)` : '' });
    } else {
      n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      n.setAttribute('class', 'el el-svg' + (el.type === 'highlight' ? ' hl' : ''));
      n.setAttribute('viewBox', `0 0 ${page.w} ${page.h}`); n.setAttribute('preserveAspectRatio', 'none');
      n.innerHTML = shapeSvg(el);
    }
    n.dataset.node = el.id; n.style.zIndex = i + 1;
    return n;
  }
  function measure(el, n) { if (el.type === 'text' && n) { el.w = n.offsetWidth / S.zoom; el.h = n.offsetHeight / S.zoom; } }

  function renderEls(page) {
    const rec = SLOTS.get(page.id); if (!rec) return;
    if (EDIT && EDIT.pageId === page.id) finishEdit();
    const z = S.zoom, frag = document.createDocumentFragment();
    const nodes = page.els.map((el, i) => { const n = makeNode(el, i, page, z); frag.appendChild(n); return n; });
    rec.els.replaceChildren(frag);
    page.els.forEach((el, i) => measure(el, nodes[i]));
  }
  function updateNode(page, el) {
    const rec = SLOTS.get(page.id); if (!rec) return;
    const old = rec.els.querySelector(`[data-node="${el.id}"]`);
    const n = makeNode(el, page.els.indexOf(el), page, S.zoom);
    if (old) old.replaceWith(n); else rec.els.appendChild(n);
    measure(el, n);
  }

  function rotBox(x, y, w, h, rot) {
    if (!rot) return { x, y, w, h };
    const pts = [[0, 0], [w, 0], [w, h], [0, h]].map(([a, b]) => { const [u, v] = rotVec(a, b, rot); return [x + u, y + v]; });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const mx = Math.min(...xs), my = Math.min(...ys);
    return { x: mx, y: my, w: Math.max(...xs) - mx, h: Math.max(...ys) - my };
  }
  function bbox(el) {
    switch (el.type) {
      case 'text': return rotBox(el.x, el.y, el.w || 8, el.h || el.size * LH, el.rot);
      case 'image': return rotBox(el.x, el.y, el.w, el.h, el.rot);
      case 'line': case 'arrow': return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
      case 'draw': {
        const xs = el.pts.map((p) => p[0]), ys = el.pts.map((p) => p[1]);
        const mx = Math.min(...xs), my = Math.min(...ys);
        return { x: mx, y: my, w: Math.max(Math.max(...xs) - mx, 1), h: Math.max(Math.max(...ys) - my, 1) };
      }
      default: return { x: el.x, y: el.y, w: el.w, h: el.h };
    }
  }
  function translateEl(el, o, dx, dy) {
    if (el.type === 'line' || el.type === 'arrow') { el.x1 = o.x1 + dx; el.y1 = o.y1 + dy; el.x2 = o.x2 + dx; el.y2 = o.y2 + dy; }
    else if (el.type === 'draw') el.pts = o.pts.map((p) => [p[0] + dx, p[1] + dy]);
    else { el.x = o.x + dx; el.y = o.y + dy; }
  }
  function applyBox(el, o, ob, nb) {
    const sx = ob.w > 0.01 ? nb.w / ob.w : 1, sy = ob.h > 0.01 ? nb.h / ob.h : 1;
    const f = (x, y) => [nb.x + (x - ob.x) * sx, nb.y + (y - ob.y) * sy];
    switch (el.type) {
      case 'line': case 'arrow': [el.x1, el.y1] = f(o.x1, o.y1); [el.x2, el.y2] = f(o.x2, o.y2); break;
      case 'draw': el.pts = o.pts.map((p) => f(p[0], p[1])); break;
      case 'text': el.size = clamp(o.size * sx, 3, 400); [el.x, el.y] = f(o.x, o.y); break;
      case 'image': el.w = o.w * sx; el.h = o.h * sy; [el.x, el.y] = f(o.x, o.y); break;
      default: el.x = nb.x; el.y = nb.y; el.w = nb.w; el.h = nb.h;
    }
  }

  function renderSel() {
    for (const rec of SLOTS.values()) rec.selx.replaceChildren();
    const s = selected(); if (!s) return;
    const rec = SLOTS.get(s.page.id); if (!rec) return;
    const z = S.zoom, el = s.el, b = bbox(el);
    const isLine = el.type === 'line' || el.type === 'arrow';
    const box = document.createElement('div'); box.className = 'selbox' + (isLine ? ' line' : '');
    Object.assign(box.style, { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' });
    if (!isLine && !(EDIT && EDIT.elId === el.id)) box.innerHTML = HANDLES.map((h) => `<span class="hd hd-${h}" data-h="${h}"></span>`).join('');
    const bar = document.createElement('div'); bar.className = 'selbar';
    bar.innerHTML = (el.type === 'text' ? `<button type="button" data-sa="edit" title="Editar texto" aria-label="Editar texto">${icon('edit')}</button>` : '')
      + `<button type="button" data-sa="front" title="Trazer para frente" aria-label="Trazer para frente">${icon('up')}</button>`
      + `<button type="button" data-sa="back" title="Enviar para trás" aria-label="Enviar para trás">${icon('down')}</button>`
      + `<button type="button" data-sa="dup" title="Duplicar (Ctrl+D)" aria-label="Duplicar">${icon('copy')}</button>`
      + `<button type="button" class="del" data-sa="del" title="Excluir (Delete)" aria-label="Excluir">${icon('trash')}</button>`;
    bar.style.left = b.x * z + 'px'; bar.style.top = Math.max(b.y * z - 4, 30) + 'px';
    if (b.y * z < 44) { bar.style.top = (b.y + b.h) * z + 'px'; bar.style.transform = 'translateY(12px)'; }
    rec.selx.append(box, bar);
    if (isLine) {
      [['p1', el.x1, el.y1], ['p2', el.x2, el.y2]].forEach(([h, x, y]) => {
        const d = document.createElement('span'); d.className = 'hd pt'; d.dataset.h = h;
        d.style.left = x * z + 'px'; d.style.top = y * z + 'px'; rec.selx.appendChild(d);
      });
    }
  }

  function select(pageId, elId) {
    S.sel = pageId && elId ? { pageId, elId } : null;
    if (pageId && pageId !== S.cur) setCur(pageId, false);
    renderSel(); syncProps(); renderLayers();
  }
  function addEl(page, el, { sel = true } = {}) {
    el.id = el.id || uid('e'); page.els.push(el);
    updateNode(page, el); if (sel) select(page.id, el.id);
    return el;
  }
  function deleteSel() {
    const s = selected(); if (!s) return;
    s.page.els = s.page.els.filter((e) => e !== s.el); S.sel = null;
    renderEls(s.page); renderSel(); syncProps(); commit();
  }
  function duplicateSel() {
    const s = selected(); if (!s) return;
    const c = JSON.parse(JSON.stringify(s.el)); c.id = uid('e'); translateEl(c, JSON.parse(JSON.stringify(c)), 12, 12);
    s.page.els.push(c); renderEls(s.page); select(s.page.id, c.id); commit();
  }
  function reorderSel(dir) {
    const s = selected(); if (!s) return;
    const a = s.page.els, i = a.indexOf(s.el), j = clamp(i + dir, 0, a.length - 1); if (i === j) return;
    a.splice(i, 1); a.splice(j, 0, s.el); renderEls(s.page); renderSel(); commit();
  }

  // ---------- edição de texto ----------
  function readText(n) { return n.innerText.replace(/ /g, ' ').replace(/\r/g, '').replace(/\n$/, ''); }
  function startEdit(page, el) {
    if (EDIT) finishEdit();
    if (S.tool !== 'select' && S.tool !== 'edittext' && S.tool !== 'text') setTool('select');
    S.sel = { pageId: page.id, elId: el.id };
    const rec = SLOTS.get(page.id); const n = rec && rec.els.querySelector(`[data-node="${el.id}"]`); if (!n) return;
    EDIT = { pageId: page.id, elId: el.id, node: n };
    n.contentEditable = 'true'; n.spellcheck = true; n.classList.add('editing');
    n.addEventListener('input', onEditInput); n.addEventListener('blur', onEditBlur);
    n.addEventListener('keydown', onEditKey); n.addEventListener('paste', onEditPaste);
    n.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(n); r.collapse(false);
    const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
    renderSel(); syncProps(); renderLayers();
  }
  function onEditInput() {
    if (!EDIT) return; const s = selected(); if (!s) return;
    s.el.text = readText(EDIT.node); measure(s.el, EDIT.node); renderSel();
  }
  function onEditBlur() { if (EDIT) finishEdit(); }
  function onEditKey(e) { if (e.key === 'Escape') { e.preventDefault(); finishEdit(); } e.stopPropagation(); }
  function onEditPaste(e) { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); }
  function finishEdit() {
    const e = EDIT; if (!e) return; EDIT = null;
    const n = e.node;
    n.removeEventListener('input', onEditInput); n.removeEventListener('blur', onEditBlur);
    n.removeEventListener('keydown', onEditKey); n.removeEventListener('paste', onEditPaste);
    n.contentEditable = 'false'; n.classList.remove('editing');
    const page = pageById(e.pageId); const el = page && page.els.find((x) => x.id === e.elId);
    if (el) {
      el.text = readText(n);
      if (!el.text.trim()) { page.els = page.els.filter((x) => x !== el); if (S.sel && S.sel.elId === el.id) S.sel = null; }
    }
    if (page) renderEls(page);
    renderSel(); syncProps(); commit();
  }

  // ---------- editar texto existente ----------
  async function textItems(page) {
    if (!page.docId || !S.docs[page.docId]) return [];
    const key = srcKey(page); if (TXT.has(key)) return TXT.get(key);
    const pp = await S.docs[page.docId].pdf.getPage(page.index + 1);
    const tc = await pp.getTextContent();
    const vp = pp.getViewport({ scale: 1, rotation: 0 });
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = pdfjsLib.Util.transform(vp.transform, it.transform);
      if (Math.abs(t[1]) > 1e-3 || Math.abs(t[2]) > 1e-3) continue; // ignora texto girado/inclinado
      const size = Math.abs(t[3]); if (size < 2) continue;
      const st = tc.styles[it.fontName] || {};
      items.push({ str: it.str, x: t[4], base: t[5], w: it.width, size, top: t[5] - size * 0.92, h: size * 1.18, fontName: it.fontName, family: st.fontFamily || '', pp });
    }
    TXT.set(key, items);
    return items;
  }
  async function renderHints() {
    for (const rec of SLOTS.values()) rec.hints.replaceChildren();
    if (S.tool !== 'edittext') return;
    let any = false;
    for (const [pid, rec] of SLOTS) {
      const page = pageById(pid); if (!page) continue;
      let items = [];
      try { items = await textItems(page); } catch (e) { console.error(e); }
      if (S.tool !== 'edittext' || !rec.slot.isConnected) return;
      const z = S.zoom;
      rec.hints.replaceChildren(...items.map((it, i) => {
        const d = document.createElement('div'); d.className = 'hint'; d.dataset.hint = i; d.title = 'Clique para editar';
        Object.assign(d.style, { left: it.x * z + 'px', top: it.top * z + 'px', width: Math.max(it.w, 2) * z + 'px', height: it.h * z + 'px' });
        return d;
      }));
      if (items.length) any = true;
    }
    if (!any && S.tool === 'edittext') toast('Nenhum texto editável encontrado. Se o PDF for digitalizado (imagem), use Corretivo + Texto.');
  }
  function editExisting(page, it) {
    let name = '';
    try { const fo = it.pp.commonObjs.get(it.fontName); name = (fo && (fo.name || fo.loadedName)) || ''; } catch { /* fonte ainda não carregada */ }
    const all = name + ' ' + it.family;
    const fam = /courier|mono/i.test(all) ? 'Courier' : (/times|georgia|garamond|roman|minion|cambria|book|serif/i.test(all) && !/sans/i.test(all)) ? 'Times' : 'Helvetica';
    const bold = /bold|black|heavy|semibold|demi/i.test(name), italic = /italic|oblique/i.test(name);
    const size = Math.round(it.size * 10) / 10;
    const pad = Math.max(0.6, size * 0.06);
    addEl(page, { type: 'whiteout', x: it.x - pad, y: it.top - pad, w: it.w + pad * 2, h: it.h + pad * 2, fill: '#ffffff' }, { sel: false });
    const t = addEl(page, { type: 'text', x: it.x, y: it.base - FONTS[fam].k * size, text: it.str, font: fam, size, bold, italic, color: S.defs.edittext.color, opacity: 1, rot: 0 }, { sel: false });
    startEdit(page, t);
  }

  // ---------- coordenadas ----------
  function pagePoint(e, page) {
    const rec = SLOTS.get(page.id); const r = rec.slot.getBoundingClientRect(); const z = S.zoom;
    const dx = (e.clientX - r.left) / z, dy = (e.clientY - r.top) / z, { w, h } = page;
    switch (totalRot(page)) {
      case 90: return { x: dy, y: h - dx };
      case 180: return { x: w - dx, y: h - dy };
      case 270: return { x: w - dy, y: dx };
      default: return { x: dx, y: dy };
    }
  }
  function visibleCenter(page) {
    const rec = SLOTS.get(page.id); if (!rec) return { x: page.w / 2, y: page.h / 2 };
    const vr = viewer.getBoundingClientRect(), sr = rec.slot.getBoundingClientRect();
    const cx = clamp(vr.left + vr.width / 2, sr.left + 20, sr.right - 20), cy = clamp(vr.top + vr.height / 2, sr.top + 20, sr.bottom - 20);
    return pagePoint({ clientX: cx, clientY: cy }, page);
  }

  // ---------- ponteiro ----------
  function onDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.selbar')) return;
    const slot = e.target.closest('.slot');
    if (!slot) { if (EDIT) finishEdit(); if (S.sel) select(null); return; }
    const page = pageById(slot.dataset.page); if (!page) return;
    if (page.id !== S.cur) setCur(page.id, false);
    const nodeEl = e.target.closest('[data-el]');
    if (EDIT && nodeEl && nodeEl.dataset.el === EDIT.elId) return; // posicionar cursor
    if (e.target.closest('.hint') && !nodeEl) return; // tratado no click
    if (EDIT) finishEdit();
    const pt = pagePoint(e, page);
    const handle = e.target.closest('[data-h]');
    const s = selected();
    if (handle && s) {
      e.preventDefault();
      DRAG = { kind: 'resize', page, el: s.el, h: handle.dataset.h, o: JSON.parse(JSON.stringify(s.el)), ob: bbox(s.el), moved: false };
      return;
    }
    const el = nodeEl && page.els.find((x) => x.id === nodeEl.dataset.el);
    const tool = S.tool;
    if (tool === 'select' || tool === 'edittext' || (tool === 'text' && el && el.type === 'text')) {
      if (el) {
        if (tool === 'text') { startEdit(page, el); return; }
        select(page.id, el.id);
        DRAG = { kind: 'move', page, el, start: pt, o: JSON.parse(JSON.stringify(el)), moved: false };
      } else if (S.sel) select(null);
      return;
    }
    e.preventDefault();
    const d = S.defs[tool] || {};
    const rot = (360 - totalRot(page)) % 360;
    switch (tool) {
      case 'text': {
        const [ox, oy] = rotVec(0, d.size * 0.6, rot);
        const t = addEl(page, { type: 'text', x: pt.x - ox, y: pt.y - oy, text: '', font: d.font, size: d.size, bold: d.bold, italic: d.italic, color: d.color, opacity: d.opacity, rot });
        startEdit(page, t);
        return;
      }
      case 'rect': case 'ellipse': case 'highlight': case 'whiteout': {
        const nel = addEl(page, { type: tool, x: pt.x, y: pt.y, w: 0, h: 0, ...d }, { sel: false });
        DRAG = { kind: 'create', page, el: nel, start: pt, moved: false };
        return;
      }
      case 'line': case 'arrow': {
        const nel = addEl(page, { type: tool, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, ...d }, { sel: false });
        DRAG = { kind: 'create', page, el: nel, start: pt, moved: false };
        return;
      }
      case 'draw': {
        const nel = addEl(page, { type: 'draw', pts: [[pt.x, pt.y]], ...d }, { sel: false });
        DRAG = { kind: 'draw', page, el: nel, moved: true };
        return;
      }
      default:
    }
  }
  function onMove(e) {
    if (!DRAG) return;
    const { page, el } = DRAG; if (!SLOTS.get(page.id)) return;
    const pt = pagePoint(e, page);
    if (DRAG.kind === 'move') {
      const dx = pt.x - DRAG.start.x, dy = pt.y - DRAG.start.y;
      if (!DRAG.moved && Math.hypot(dx, dy) * S.zoom < 3) return;
      DRAG.moved = true; translateEl(el, DRAG.o, dx, dy);
    } else if (DRAG.kind === 'resize') {
      DRAG.moved = true;
      const hd = DRAG.h;
      if (hd === 'p1' || hd === 'p2') { el[hd === 'p1' ? 'x1' : 'x2'] = pt.x; el[hd === 'p1' ? 'y1' : 'y2'] = pt.y; }
      else {
        const ob = DRAG.ob; let x = ob.x, y = ob.y, x2 = ob.x + ob.w, y2 = ob.y + ob.h;
        if (hd.includes('w')) x = Math.min(pt.x, x2 - 2); if (hd.includes('e')) x2 = Math.max(pt.x, x + 2);
        if (hd.includes('n')) y = Math.min(pt.y, y2 - 2); if (hd.includes('s')) y2 = Math.max(pt.y, y + 2);
        let nb = { x, y, w: x2 - x, h: y2 - y };
        const lock = el.type === 'text' || (el.type === 'image' && (!e.shiftKey || el.rot));
        if (lock) {
          const k = hd.length === 2 ? Math.max(nb.w / ob.w, nb.h / ob.h) : (hd === 'e' || hd === 'w') ? nb.w / ob.w : nb.h / ob.h;
          const nw = ob.w * k, nh = ob.h * k;
          nb = {
            x: hd.includes('w') ? ob.x + ob.w - nw : hd.includes('e') ? ob.x : ob.x + (ob.w - nw) / 2,
            y: hd.includes('n') ? ob.y + ob.h - nh : hd.includes('s') ? ob.y : ob.y + (ob.h - nh) / 2, w: nw, h: nh,
          };
        }
        applyBox(el, DRAG.o, ob, nb);
      }
    } else if (DRAG.kind === 'create') {
      DRAG.moved = true;
      if (el.type === 'line' || el.type === 'arrow') {
        let { x, y } = pt;
        if (e.shiftKey) { // ângulos de 15°
          const a = Math.round(Math.atan2(y - el.y1, x - el.x1) / (Math.PI / 12)) * (Math.PI / 12), l = Math.hypot(x - el.x1, y - el.y1);
          x = el.x1 + l * Math.cos(a); y = el.y1 + l * Math.sin(a);
        }
        el.x2 = x; el.y2 = y;
      } else {
        let w = pt.x - DRAG.start.x, h = pt.y - DRAG.start.y;
        if (e.shiftKey && (el.type === 'rect' || el.type === 'ellipse')) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        el.x = Math.min(DRAG.start.x, DRAG.start.x + w); el.y = Math.min(DRAG.start.y, DRAG.start.y + h); el.w = Math.abs(w); el.h = Math.abs(h);
      }
    } else if (DRAG.kind === 'draw') {
      const l = el.pts[el.pts.length - 1];
      if (Math.hypot(pt.x - l[0], pt.y - l[1]) * S.zoom < 1.5) return;
      el.pts.push([pt.x, pt.y]);
    }
    updateNode(page, el);
    if (S.sel && S.sel.elId === el.id) renderSel();
  }
  function onUp() {
    if (!DRAG) return;
    const d = DRAG; DRAG = null; const { page, el } = d;
    if (d.kind === 'create') {
      const small = el.type === 'line' || el.type === 'arrow' ? Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 3 : el.w < 3 && el.h < 3;
      if (small) {
        if (el.type === 'rect' || el.type === 'ellipse') { el.x -= 50; el.y -= 30; el.w = 100; el.h = 60; }
        else { page.els = page.els.filter((x) => x !== el); renderEls(page); return; }
      }
      updateNode(page, el);
      if (el.type !== 'highlight') { setTool('select'); select(page.id, el.id); }
      commit(); return;
    }
    if (d.kind === 'draw') { updateNode(page, el); commit(); return; }
    if (d.moved) { renderSel(); commit(); }
  }

  // ---------- ferramentas ----------
  function setTool(t) {
    if (EDIT) finishEdit();
    S.tool = t; viewer.dataset.tool = t;
    $$('#tools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    if (t !== 'select' && S.sel) { S.sel = null; renderSel(); renderLayers(); }
    renderHints(); syncProps();
    closePanels();
  }

  // ---------- propriedades ----------
  function ctxType() { const s = selected(); return s ? s.el.type : S.tool; }
  function syncProps() {
    const t = ctxType(), props = PROPS[t] || [], s = selected();
    const src = (s && s.el) || S.defs[t] || {};
    $$('#props [data-prop]').forEach((g) => { g.hidden = !props.includes(g.dataset.prop); });
    $('#propsEmpty').hidden = props.length > 0;
    $('#propsType').textContent = props.length ? '· ' + (s && s.el.type === 'image' && s.el.sig ? 'Assinatura' : (TYPE[t] && TYPE[t].label) || '') : '';
    if (props.includes('color')) $('#pColor').value = src.color || '#111827';
    if (props.includes('fill')) {
      const on = t === 'whiteout' || !!src.fill;
      $('#pFillOnWrap').hidden = t === 'whiteout'; $('#pFillOn').checked = on;
      $('#pFill').value = src.fill || S.fillColor; $('#pFill').disabled = !on;
    }
    if (props.includes('width')) { $('#pWidth').value = src.width; $('#pWidthV').textContent = src.width + ' pt'; }
    if (props.includes('opacity')) { const v = Math.round((src.opacity ?? 1) * 100); $('#pOpacity').value = v; $('#pOpacityV').textContent = v + '%'; }
    if (props.includes('font')) {
      $('#pFont').value = src.font || 'Helvetica'; $('#pSize').value = Math.round((src.size || 14) * 10) / 10;
      $('#pBold').setAttribute('aria-pressed', String(!!src.bold)); $('#pItalic').setAttribute('aria-pressed', String(!!src.italic));
    }
  }
  function setProp(prop, val, final) {
    const t = ctxType(), s = selected(), d = S.defs[t];
    if (prop === 'fillOn') { prop = 'fill'; val = val ? $('#pFill').value : null; $('#pFill').disabled = !val; }
    else if (prop === 'fill') { S.fillColor = val; if (t !== 'whiteout') { $('#pFillOn').checked = true; $('#pFill').disabled = false; } }
    if (d) d[prop] = val;
    if (t === 'edittext' && prop !== 'fill') S.defs.text[prop] = val;
    if (s) {
      if (s.el[prop] === val && !final) return;
      s.el[prop] = val; updateNode(s.page, s.el); renderSel();
      if (final) commit();
    }
  }
  function bindProps() {
    const sw = $('#swatches');
    sw.innerHTML = SWATCHES.map((c) => `<button type="button" class="sw" data-c="${c}" style="background:${c}" title="${c}" aria-label="Cor ${c}"></button>`).join('');
    sw.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; $('#pColor').value = b.dataset.c; setProp('color', b.dataset.c, true); });
    $('#pColor').addEventListener('input', (e) => setProp('color', e.target.value, false));
    $('#pColor').addEventListener('change', (e) => setProp('color', e.target.value, true));
    $('#pFillOn').addEventListener('change', (e) => setProp('fillOn', e.target.checked, true));
    $('#pFill').addEventListener('input', (e) => setProp('fill', e.target.value, false));
    $('#pFill').addEventListener('change', (e) => setProp('fill', e.target.value, true));
    $('#pWidth').addEventListener('input', (e) => { $('#pWidthV').textContent = e.target.value + ' pt'; setProp('width', +e.target.value, false); });
    $('#pWidth').addEventListener('change', (e) => setProp('width', +e.target.value, true));
    $('#pOpacity').addEventListener('input', (e) => { $('#pOpacityV').textContent = e.target.value + '%'; setProp('opacity', e.target.value / 100, false); });
    $('#pOpacity').addEventListener('change', (e) => setProp('opacity', e.target.value / 100, true));
    $('#pFont').addEventListener('change', (e) => setProp('font', e.target.value, true));
    $('#pSize').addEventListener('change', (e) => { const v = clamp(+e.target.value || 12, 3, 400); e.target.value = v; setProp('size', v, true); });
    $('#pBold').addEventListener('click', (e) => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); setProp('bold', v, true); });
    $('#pItalic').addEventListener('click', (e) => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); setProp('italic', v, true); });
  }

  // ---------- painel de elementos ----------
  function elLabel(el) {
    if (el.type === 'text') return '“' + (el.text.split('\n')[0].slice(0, 40) || 'Texto vazio') + '”';
    if (el.type === 'image' && el.sig) return 'Assinatura';
    return TYPE[el.type].label;
  }
  function renderLayers() {
    const box = $('#layers'); const page = pageById(S.cur);
    if (!page) { box.replaceChildren(); return; }
    const idx = S.pages.indexOf(page);
    $('#layersTitle').textContent = `Elementos · pág. ${idx + 1}`;
    $('#clearPage').hidden = !page.els.length;
    if (!page.els.length) { box.innerHTML = '<p class="empty">Nenhum elemento nesta página ainda. Use a barra de ferramentas para adicionar texto, formas, imagens ou assinaturas.</p>'; return; }
    const n = page.els.length;
    box.innerHTML = '<ul>' + page.els.map((el, i) => ({ el, i })).reverse().map(({ el, i }) => {
      const on = S.sel && S.sel.elId === el.id;
      const ic = el.type === 'image' && el.sig ? 'sign' : TYPE[el.type].icon;
      return `<li class="layer${on ? ' on' : ''}" data-el="${esc(el.id)}"><button type="button" class="lname" data-la="sel">${icon(ic)}<span>${esc(elLabel(el))}</span></button>`
        + `<button type="button" data-la="up" ${i === n - 1 ? 'disabled' : ''} title="Trazer para frente" aria-label="Trazer para frente">${icon('up')}</button>`
        + `<button type="button" data-la="down" ${i === 0 ? 'disabled' : ''} title="Enviar para trás" aria-label="Enviar para trás">${icon('down')}</button>`
        + `<button type="button" data-la="del" title="Excluir" aria-label="Excluir">${icon('trash')}</button></li>`;
    }).join('') + '</ul>';
  }

  // ---------- páginas / miniaturas ----------
  function updatePageInd() {
    const i = S.pages.findIndex((p) => p.id === S.cur);
    $('#pageInd').textContent = S.pages.length ? `Página ${i + 1} de ${S.pages.length}` : '';
  }
  function setCur(id, scroll) {
    if (!pageById(id)) return;
    const changed = S.cur !== id; S.cur = id;
    $$('#thumbs .thumb').forEach((t) => t.classList.toggle('on', t.dataset.page === id));
    if (changed) { updatePageInd(); renderLayers(); }
    if (scroll) { const r = SLOTS.get(id); if (r) r.slot.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    const th = $(`#thumbs .thumb[data-page="${id}"]`); if (th) th.scrollIntoView({ block: 'nearest' });
  }
  let scrollRaf = 0;
  function detectCur() {
    const vr = viewer.getBoundingClientRect(), mid = vr.top + vr.height * 0.35;
    let best = null, bd = Infinity;
    for (const [id, rec] of SLOTS) {
      const r = rec.slot.getBoundingClientRect();
      const d = mid >= r.top && mid <= r.bottom ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bd) { bd = d; best = id; }
    }
    if (best && best !== S.cur) setCur(best, false);
  }

  function rotatedCopy(src, r) {
    if (!r) return src;
    const c = document.createElement('canvas'); const sw = src.width, sh = src.height;
    [c.width, c.height] = r % 180 ? [sh, sw] : [sw, sh];
    const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate((r * Math.PI) / 180); x.drawImage(src, -sw / 2, -sh / 2);
    return c;
  }
  const TW = 128;
  function renderThumbs() {
    const box = $('#thumbs'); box.replaceChildren();
    if (tio) tio.disconnect();
    tio = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { tio.unobserve(en.target); drawThumb(en.target); } }), { root: box, rootMargin: '400px 0px' });
    const n = S.pages.length;
    S.pages.forEach((p, i) => {
      const [dw, dh] = dispDims(p);
      const d = document.createElement('div'); d.className = 'thumb' + (p.id === S.cur ? ' on' : ''); d.dataset.page = p.id;
      d.draggable = true; d.tabIndex = 0; d.setAttribute('role', 'listitem'); d.setAttribute('aria-label', `Página ${i + 1} de ${n}`);
      d.innerHTML = `<div class="tcv" style="width:${TW}px;height:${(TW * dh) / dw}px"></div><div class="tbar"><span class="tnum">${i + 1}</span><span class="tacts">`
        + `<button type="button" data-ta="rotl" title="Girar à esquerda" aria-label="Girar página ${i + 1} à esquerda">${icon('rotl')}</button>`
        + `<button type="button" data-ta="rotr" title="Girar à direita" aria-label="Girar página ${i + 1} à direita">${icon('rotr')}</button>`
        + `<button type="button" data-ta="dup" title="Duplicar página" aria-label="Duplicar página ${i + 1}">${icon('copy')}</button>`
        + `<button type="button" class="del" data-ta="del" title="Excluir página" aria-label="Excluir página ${i + 1}">${icon('trash')}</button></span></div>`;
      box.appendChild(d); tio.observe(d);
    });
  }
  function drawThumb(d) {
    const p = pageById(d.dataset.page); if (!p) return;
    thumbQ = thumbQ.then(async () => {
      if (!d.isConnected) return;
      const [dw] = dispDims(p); const sc = TW / dw;
      const key = srcKey(p) + '@' + sc.toFixed(4);
      let c = TC.get(key);
      if (!c) { c = await rasterize(p, sc); TC.set(key, c); }
      const out = rotatedCopy(c, totalRot(p));
      d.querySelector('.tcv').replaceChildren(out === c ? cloneCanvas(c) : out);
    }).catch((e) => console.error(e));
  }
  function pageAction(id, act) {
    const i = S.pages.findIndex((p) => p.id === id); if (i < 0) return;
    const p = S.pages[i];
    if (act === 'rotl' || act === 'rotr') { p.rot = (p.rot + (act === 'rotl' ? 270 : 90)) % 360; }
    else if (act === 'dup') {
      const c = JSON.parse(JSON.stringify(p)); c.id = uid('p'); c.els.forEach((e) => { e.id = uid('e'); });
      S.pages.splice(i + 1, 0, c); S.cur = c.id;
    } else if (act === 'del') {
      if (S.pages.length === 1) return toast('O documento precisa ter pelo menos uma página.', 'error');
      if (p.els.length && !confirm(`Excluir a página ${i + 1} e os ${p.els.length} elemento(s) adicionados nela?`)) return;
      S.pages.splice(i, 1); if (S.sel && S.sel.pageId === id) S.sel = null;
      S.cur = S.pages[Math.min(i, S.pages.length - 1)].id;
    }
    commit(); rebuild(); syncProps();
    if (act === 'dup') setCur(S.cur, true);
  }
  function movePage(id, toIndex) {
    const i = S.pages.findIndex((p) => p.id === id); if (i < 0) return;
    const [p] = S.pages.splice(i, 1); const j = clamp(toIndex > i ? toIndex - 1 : toIndex, 0, S.pages.length);
    if (j === i) { S.pages.splice(i, 0, p); return; }
    S.pages.splice(j, 0, p); commit(); rebuild();
    const t = $(`#thumbs .thumb[data-page="${id}"]`); if (t) t.focus();
  }
  function addBlankAfter() {
    const cur = pageById(S.cur) || S.pages[S.pages.length - 1];
    const [w, h] = cur ? dispDims(cur) : [595.28, 841.89];
    const np = blankPage(w, h); const i = S.pages.indexOf(cur);
    S.pages.splice(i + 1, 0, np); commit(); rebuild(); setCur(np.id, true);
  }

  // ---------- zoom ----------
  function setZoom(z) {
    z = clamp(Math.round(z * 100) / 100, 0.25, 4); if (z === S.zoom) return;
    const ry = viewer.scrollTop / Math.max(1, viewer.scrollHeight - viewer.clientHeight);
    S.zoom = z; RC.clear(); $('#zoomLbl').textContent = Math.round(z * 100) + '%';
    rebuildPages();
    viewer.scrollTop = ry * Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    detectCur();
  }
  function fitWidth() { const maxW = Math.max(...S.pages.map((p) => dispDims(p)[0])); setZoom(Math.floor(((viewer.clientWidth - 60) / maxW) * 100) / 100); }

  // ---------- imagens e assinaturas ----------
  const readURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  async function assetFromFile(file) {
    let url = await readURL(file); const img = await loadImg(url);
    let type = file.type === 'image/jpeg' ? 'jpg' : 'png';
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0); url = c.toDataURL('image/png'); type = 'png';
    }
    const id = uid('a'); S.assets[id] = { data: url, type, w: img.naturalWidth, h: img.naturalHeight }; return id;
  }
  async function assetFromDataURL(url) { const img = await loadImg(url); const id = uid('a'); S.assets[id] = { data: url, type: 'png', w: img.naturalWidth, h: img.naturalHeight }; return id; }
  function placeImage(aid, { page, at, maxW, sig } = {}) {
    page = page || pageById(S.cur) || S.pages[0]; const a = S.assets[aid]; if (!page || !a) return;
    const [dw, dh] = dispDims(page);
    const k = Math.min(1, (maxW || dw * 0.5) / a.w, (dh * 0.5) / a.h);
    const w = a.w * k, h = a.h * k, rot = (360 - totalRot(page)) % 360;
    const c = at || visibleCenter(page); const [ox, oy] = rotVec(w / 2, h / 2, rot);
    if (S.tool !== 'select') setTool('select');
    const el = addEl(page, { type: 'image', asset: aid, x: c.x - ox, y: c.y - oy, w, h, rot, opacity: 1, sig: !!sig });
    renderEls(page); select(page.id, el.id); commit();
  }
  async function insertImageFile(file, opts) {
    try { placeImage(await assetFromFile(file), opts); } catch (e) { console.error(e); toast('Não foi possível ler essa imagem.', 'error'); }
  }

  // Assinatura
  const SIG_FONTS = ['Dancing Script', 'Great Vibes', 'Satisfy', 'Caveat'];
  const SIG_COLORS = ['#111827', '#1d4ed8', '#b91c1c'];
  const sig = { tab: 'draw', color: SIG_COLORS[0], font: SIG_FONTS[0], ink: false, saved: null, drawing: false, last: null };
  function trimToDataURL(c) {
    const ctx = c.getContext('2d'); const { width: w, height: h } = c; const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const p = 6; x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }
  function setupPad() {
    const c = $('#sigPad'); const r = c.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = 2.6;
    x.clearRect(0, 0, c.width, c.height); sig.ink = false;
  }
  function sigTab(t) {
    sig.tab = t;
    $$('#sigDlg [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('#sigDlg [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
    $('#sigKeep').closest('label').hidden = t === 'saved';
    if (t === 'draw') requestAnimationFrame(setupPad);
    if (t === 'type') { renderSigFonts(); setTimeout(() => $('#sigName').focus(), 30); }
    if (t === 'saved') renderSaved();
  }
  function renderSigFonts() {
    const name = $('#sigName').value.trim() || 'Sua assinatura';
    $('#sigFonts').innerHTML = SIG_FONTS.map((f) => `<button type="button" class="sigfont" data-f="${f}" aria-pressed="${f === sig.font}" style="font-family:'${f}',cursive;color:${sig.color}">${esc(name)}</button>`).join('');
  }
  function renderSaved() {
    const list = LS.get('hfa-sigs', []);
    $('#sigSaved').innerHTML = list.length
      ? list.map((u, i) => `<div class="sigitem" role="button" tabindex="0" data-i="${i}" aria-pressed="${sig.saved === i}"><img src="${u}" alt="Assinatura salva ${i + 1}"><button type="button" class="rm" data-rm="${i}" aria-label="Remover assinatura salva">${icon('x')}</button></div>`).join('')
      : '<p class="empty">Nenhuma assinatura salva neste navegador ainda.</p>';
  }
  function openSig() {
    if (!S.pages.length) return;
    sig.saved = null;
    $('#sigColors').innerHTML = SIG_COLORS.map((c) => `<button type="button" class="sigcolor" data-sc="${c}" style="background:${c}" aria-pressed="${c === sig.color}" aria-label="Cor ${c}"></button>`).join('');
    $('#sigDlg').showModal();
    sigTab(LS.get('hfa-sigs', []).length ? 'saved' : 'draw');
  }
  async function confirmSig() {
    let url = null;
    if (sig.tab === 'draw') { if (!sig.ink) return toast('Desenhe sua assinatura primeiro.', 'error'); url = trimToDataURL($('#sigPad')); }
    else if (sig.tab === 'type') {
      const name = $('#sigName').value.trim(); if (!name) return toast('Digite seu nome.', 'error');
      try { await document.fonts.load(`96px "${sig.font}"`); } catch { /* usa fonte de reserva */ }
      const c = document.createElement('canvas'); const x = c.getContext('2d'); const font = `96px "${sig.font}", cursive`;
      x.font = font; const w = Math.ceil(x.measureText(name).width) + 60; c.width = Math.min(w, 4000); c.height = 200;
      x.font = font; x.fillStyle = sig.color; x.textBaseline = 'middle'; x.fillText(name, 30, 105);
      url = trimToDataURL(c);
    } else {
      const list = LS.get('hfa-sigs', []); if (sig.saved == null || !list[sig.saved]) return toast('Escolha uma assinatura salva.', 'error');
      url = list[sig.saved];
    }
    if (!url) return toast('Assinatura vazia.', 'error');
    if (sig.tab !== 'saved' && $('#sigKeep').checked) {
      const list = LS.get('hfa-sigs', []); list.unshift(url);
      if (!LS.set('hfa-sigs', list.slice(0, 6))) toast('Não foi possível salvar a assinatura neste navegador.');
    }
    $('#sigDlg').close();
    placeImage(await assetFromDataURL(url), { maxW: 170, sig: true });
  }
  function bindSig() {
    const pad = $('#sigPad'); const ctx = () => pad.getContext('2d');
    const pos = (e) => { const r = pad.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    pad.addEventListener('pointerdown', (e) => {
      try { pad.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético */ }
      sig.drawing = true; sig.last = pos(e); sig.mid = sig.last;
      const x = ctx(); x.strokeStyle = sig.color; x.fillStyle = sig.color; x.beginPath(); x.arc(sig.last[0], sig.last[1], 1.3, 0, Math.PI * 2); x.fill(); sig.ink = true;
    });
    pad.addEventListener('pointermove', (e) => {
      if (!sig.drawing) return; const p = pos(e), l = sig.last; const m = [(l[0] + p[0]) / 2, (l[1] + p[1]) / 2];
      const x = ctx(); x.strokeStyle = sig.color; x.beginPath(); x.moveTo(sig.mid[0], sig.mid[1]); x.quadraticCurveTo(l[0], l[1], m[0], m[1]); x.stroke();
      sig.last = p; sig.mid = m;
    });
    const end = () => { sig.drawing = false; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    $('#sigClear').addEventListener('click', setupPad);
    $('#sigColors').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sc]'); if (!b) return; sig.color = b.dataset.sc;
      $$('#sigColors [data-sc]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (sig.tab === 'type') renderSigFonts();
    });
    $('#sigName').addEventListener('input', renderSigFonts);
    $('#sigName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmSig(); } });
    $('#sigFonts').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; sig.font = b.dataset.f; renderSigFonts(); });
    $('#sigSaved').addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { const list = LS.get('hfa-sigs', []); list.splice(+rm.dataset.rm, 1); LS.set('hfa-sigs', list); sig.saved = null; renderSaved(); return; }
      const it = e.target.closest('[data-i]'); if (!it) return; sig.saved = +it.dataset.i; renderSaved();
    });
    $('#sigSaved').addEventListener('dblclick', (e) => { const it = e.target.closest('[data-i]'); if (it) { sig.saved = +it.dataset.i; confirmSig(); } });
    $$('#sigDlg [data-tab]').forEach((b) => b.addEventListener('click', () => sigTab(b.dataset.tab)));
    $('#sigOk').addEventListener('click', confirmSig);
    $$('.dlg [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  }

  // ---------- exportação ----------
  const hexRgb = (hex) => { const n = parseInt((hex || '#000000').slice(1), 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  const FALLBACK = { '✓': 'v', '✔': 'v', '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '≠': '!=' };
  function safeText(font, s, cache) {
    let out = '';
    for (const ch of s.replace(/\t/g, '    ')) {
      let ok = cache.get(ch);
      if (ok === undefined) { try { font.encodeText(ch); ok = true; } catch { ok = false; } cache.set(ch, ok); }
      out += ok ? ch : (FALLBACK[ch] ?? '?');
    }
    return out;
  }
  async function exportPdf() {
    if (!S.pages.length) return;
    if (EDIT) finishEdit();
    busy('Gerando seu PDF…');
    try {
      const { PDFDocument, StandardFonts, degrees, LineCapStyle, BlendMode } = PDFLib;
      const out = await PDFDocument.create();
      const src = {}, fonts = {}, imgs = {}, enc = {};
      const getFont = async (fam, b, i) => {
        const n = (FONTS[fam] || FONTS.Helvetica).std[(b ? 1 : 0) + (i ? 2 : 0)];
        if (!fonts[n]) { fonts[n] = await out.embedFont(StandardFonts[n]); enc[n] = new Map(); }
        return [fonts[n], enc[n]];
      };
      for (const p of S.pages) {
        let pg;
        if (p.docId) {
          if (!src[p.docId]) src[p.docId] = await PDFDocument.load(S.docs[p.docId].bytes, { updateMetadata: false });
          [pg] = await out.copyPages(src[p.docId], [p.index]); out.addPage(pg);
        } else pg = out.addPage([p.w, p.h]);
        pg.setRotation(degrees(totalRot(p)));
        const X = (v) => p.x0 + v, Y = (v) => p.y0 + p.h - v;
        for (const el of p.els) {
          const op = el.opacity ?? 1;
          switch (el.type) {
            case 'rect': case 'ellipse': {
              const o = { borderColor: hexRgb(el.color), borderWidth: el.width, borderOpacity: op };
              if (el.fill) { o.color = hexRgb(el.fill); o.opacity = op; }
              if (el.type === 'rect') pg.drawRectangle({ x: X(el.x), y: Y(el.y + el.h), width: el.w, height: el.h, ...o });
              else pg.drawEllipse({ x: X(el.x + el.w / 2), y: Y(el.y + el.h / 2), xScale: el.w / 2, yScale: el.h / 2, ...o });
              break;
            }
            case 'highlight': pg.drawRectangle({ x: X(el.x), y: Y(el.y + el.h), width: el.w, height: el.h, color: hexRgb(el.color), opacity: op, blendMode: BlendMode.Multiply }); break;
            case 'whiteout': pg.drawRectangle({ x: X(el.x), y: Y(el.y + el.h), width: el.w, height: el.h, color: hexRgb(el.fill || '#ffffff') }); break;
            case 'line': case 'arrow': {
              const g = lineGeom(el);
              pg.drawLine({ start: { x: X(el.x1), y: Y(el.y1) }, end: { x: X(g.ex), y: Y(g.ey) }, thickness: el.width, color: hexRgb(el.color), opacity: op, lineCap: LineCapStyle.Round });
              if (g.pts) pg.drawSvgPath(`M${g.pts.map((q) => q.map(f2).join(' ')).join(' L')} Z`, { x: p.x0, y: p.y0 + p.h, color: hexRgb(el.color), opacity: op });
              break;
            }
            case 'draw': pg.drawSvgPath(pathD(el.pts), { x: p.x0, y: p.y0 + p.h, borderColor: hexRgb(el.color), borderWidth: el.width, borderOpacity: op, borderLineCap: LineCapStyle.Round }); break;
            case 'text': {
              if (!el.text) break;
              const [font, cache] = await getFont(el.font, el.bold, el.italic); const k = (FONTS[el.font] || FONTS.Helvetica).k;
              const rot = el.rot || 0, t = (rot * Math.PI) / 180, s = Math.sin(t), c = Math.cos(t);
              el.text.split('\n').forEach((line, i) => {
                if (!line) return;
                const by = (i * LH + k) * el.size;
                pg.drawText(safeText(font, line, cache), { x: X(el.x - by * s), y: Y(el.y + by * c), size: el.size, font, color: hexRgb(el.color), opacity: op, rotate: degrees(-rot) });
              });
              break;
            }
            case 'image': {
              const a = S.assets[el.asset]; if (!a) break;
              if (!imgs[el.asset]) imgs[el.asset] = a.type === 'jpg' ? await out.embedJpg(a.data) : await out.embedPng(a.data);
              const rot = el.rot || 0, t = (rot * Math.PI) / 180;
              pg.drawImage(imgs[el.asset], { x: X(el.x - el.h * Math.sin(t)), y: Y(el.y + el.h * Math.cos(t)), width: el.w, height: el.h, rotate: degrees(-rot), opacity: op });
              break;
            }
            default:
          }
        }
      }
      out.setProducer('HFA Editor PDF'); out.setCreator('HFA Editor PDF'); out.setModificationDate(new Date());
      const bytes = await out.save();
      const name = S.fileName.replace(/\.pdf$/i, '') + '-editado.pdf';
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      S.dirty = false;
      toast(`“${name}” baixado (${(bytes.length / 1024 / 1024).toFixed(2)} MB).`, 'ok');
    } catch (e) {
      console.error(e); toast('Erro ao gerar o PDF: ' + (e.message || e), 'error');
    } finally { busy(false); }
  }

  // ---------- painéis móveis ----------
  function closePanels() { $('#editor').classList.remove('show-pages', 'show-side'); $('#scrim').hidden = true; }
  function togglePanel(cls) {
    const ed = $('#editor'); const on = !ed.classList.contains(cls);
    closePanels(); if (on) { ed.classList.add(cls); $('#scrim').hidden = false; }
  }

  // ---------- eventos ----------
  function bind() {
    hydrateIcons();
    applyTheme(LS.get('hfa-theme', null));
    $$('[data-act="theme"]').forEach((b) => b.addEventListener('click', toggleTheme));

    // landing
    const fileIn = $('#fileIn'), drop = $('#drop');
    $('#pickBtn').addEventListener('click', () => fileIn.click());
    drop.addEventListener('click', (e) => { if (e.target === drop || e.target.closest('.drop-ic,.drop-hint')) fileIn.click(); });
    fileIn.addEventListener('change', () => { if (fileIn.files.length) openFiles(fileIn.files); fileIn.value = ''; });
    $('#blankBtn').addEventListener('click', newBlank);

    // arrastar e soltar global
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    let dragDepth = 0;
    document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; document.body.classList.add('drag'); drop.classList.add('over'); });
    document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { document.body.classList.remove('drag'); drop.classList.remove('over'); } });
    document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; document.body.classList.remove('drag'); drop.classList.remove('over');
      const files = Array.from(e.dataTransfer.files);
      if ($('#editor').hidden) return openFiles(files);
      const img = files.find((f) => f.type.startsWith('image/'));
      if (img) {
        const el = document.elementFromPoint(e.clientX, e.clientY); const slot = el && el.closest('.slot');
        const page = slot && pageById(slot.dataset.page);
        return insertImageFile(img, page ? { page, at: pagePoint(e, page) } : {});
      }
      if (files.some(isPdf)) openFiles(files, true);
    });

    // editor: topo
    $('#backBtn').addEventListener('click', leaveEditor);
    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);
    $('#zoomIn').addEventListener('click', () => setZoom(S.zoom * 1.2));
    $('#zoomOut').addEventListener('click', () => setZoom(S.zoom / 1.2));
    $('#zoomLbl').addEventListener('click', fitWidth);
    $('#dlBtn').addEventListener('click', exportPdf);
    $('#keysBtn').addEventListener('click', () => $('#keysDlg').showModal());

    // ferramentas
    $('#tools').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) setTool(b.dataset.tool);
      else if (b.dataset.action === 'image') $('#imgIn').click();
      else if (b.dataset.action === 'sign') openSig();
      else if (b.id === 'togglePages') togglePanel('show-pages');
      else if (b.id === 'toggleSide') togglePanel('show-side');
    });
    $('#scrim').addEventListener('click', closePanels);
    $('#imgIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) insertImageFile(f); });
    $('#pdfIn').addEventListener('change', (e) => { const fs = Array.from(e.target.files); e.target.value = ''; if (fs.length) openFiles(fs, true); });
    $('#addBlank').addEventListener('click', addBlankAfter);
    $('#addPdf').addEventListener('click', () => $('#pdfIn').click());

    // visualizador
    viewer.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    viewer.addEventListener('mousedown', (e) => { if (!e.target.closest('.editing')) e.preventDefault(); });
    viewer.addEventListener('dblclick', (e) => {
      const n = e.target.closest('[data-el]'); const slot = e.target.closest('.slot'); if (!n || !slot) return;
      const page = pageById(slot.dataset.page); const el = page && page.els.find((x) => x.id === n.dataset.el);
      if (el && el.type === 'text') startEdit(page, el);
    });
    viewer.addEventListener('click', (e) => {
      const sa = e.target.closest('[data-sa]');
      if (sa) {
        const a = sa.dataset.sa, s = selected();
        if (a === 'del') deleteSel(); else if (a === 'dup') duplicateSel();
        else if (a === 'front') reorderSel(1); else if (a === 'back') reorderSel(-1);
        else if (a === 'edit' && s) startEdit(s.page, s.el);
        return;
      }
      const hint = e.target.closest('.hint');
      if (hint && S.tool === 'edittext') {
        const slot = hint.closest('.slot'); const page = pageById(slot.dataset.page); const items = TXT.get(srcKey(page));
        const it = items && items[+hint.dataset.hint]; if (it) editExisting(page, it);
      }
    });
    viewer.addEventListener('scroll', () => { if (scrollRaf) return; scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; detectCur(); }); }, { passive: true });
    viewer.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });

    // miniaturas
    const thumbs = $('#thumbs'); let dragId = null;
    thumbs.addEventListener('click', (e) => {
      const t = e.target.closest('.thumb'); if (!t) return;
      const a = e.target.closest('[data-ta]');
      if (a) { pageAction(t.dataset.page, a.dataset.ta); return; }
      setCur(t.dataset.page, true); closePanels();
    });
    thumbs.addEventListener('keydown', (e) => {
      const t = e.target.closest('.thumb'); if (!t || e.target !== t) return;
      const i = S.pages.findIndex((p) => p.id === t.dataset.page);
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); movePage(t.dataset.page, e.key === 'ArrowUp' ? i - 1 : i + 2); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCur(t.dataset.page, true); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = t[e.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling']; if (n) n.focus(); }
    });
    const clearDrop = () => $$('.thumb.drop-before,.thumb.drop-after', thumbs).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    thumbs.addEventListener('dragstart', (e) => {
      const t = e.target.closest('.thumb'); if (!t) return; dragId = t.dataset.page;
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-hfa-page', dragId); t.classList.add('dragging');
    });
    thumbs.addEventListener('dragover', (e) => {
      if (!dragId) return; e.preventDefault(); const t = e.target.closest('.thumb'); clearDrop(); if (!t) return;
      const r = t.getBoundingClientRect(); t.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    thumbs.addEventListener('drop', (e) => {
      if (!dragId) return; e.preventDefault(); e.stopPropagation();
      const t = $('.thumb.drop-before,.thumb.drop-after', thumbs); const id = dragId; dragId = null; clearDrop();
      if (!t || t.dataset.page === id) { rebuild(); return; }
      const j = S.pages.findIndex((p) => p.id === t.dataset.page) + (t.classList.contains('drop-after') ? 1 : 0);
      movePage(id, j);
    });
    thumbs.addEventListener('dragend', () => { dragId = null; clearDrop(); $$('.thumb.dragging', thumbs).forEach((x) => x.classList.remove('dragging')); });

    // painel de elementos
    $('#layers').addEventListener('click', (e) => {
      const b = e.target.closest('[data-la]'); const li = e.target.closest('[data-el]'); if (!b || !li) return;
      const page = pageById(S.cur); if (!page) return;
      select(page.id, li.dataset.el);
      const a = b.dataset.la;
      if (a === 'del') deleteSel(); else if (a === 'up') reorderSel(1); else if (a === 'down') reorderSel(-1);
      else { const r = SLOTS.get(page.id); if (r) { const n = r.els.querySelector(`[data-node="${li.dataset.el}"]`); const tgt = n && n.tagName.toLowerCase() !== 'svg' ? n : r.slot; tgt.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
    });
    $('#clearPage').addEventListener('click', () => {
      const page = pageById(S.cur); if (!page || !page.els.length) return;
      if (!confirm(`Remover os ${page.els.length} elemento(s) desta página?`)) return;
      page.els = []; S.sel = null; renderEls(page); renderSel(); syncProps(); commit();
    });

    bindProps(); bindSig();

    // teclado
    const TOOLKEYS = { v: 'select', e: 'edittext', t: 'text', d: 'draw', h: 'highlight', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', w: 'whiteout' };
    document.addEventListener('keydown', (e) => {
      if ($('#editor').hidden || document.querySelector('dialog[open]')) return;
      const tg = e.target; const typing = tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName);
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); exportPdf(); return; }
      if (typing) return;
      if (mod) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
        else if (k === 'd') { e.preventDefault(); duplicateSel(); }
        else if (k === '=' || k === '+') { e.preventDefault(); setZoom(S.zoom * 1.2); }
        else if (k === '-') { e.preventDefault(); setZoom(S.zoom / 1.2); }
        else if (k === '0') { e.preventDefault(); fitWidth(); }
        return;
      }
      if (e.altKey) return;
      const s = selected();
      if ((e.key === 'Delete' || e.key === 'Backspace') && s) { e.preventDefault(); deleteSel(); }
      else if (e.key === 'Escape') { if (s) select(null); else setTool('select'); closePanels(); }
      else if (e.key === 'Enter' && s && s.el.type === 'text') { e.preventDefault(); startEdit(s.page, s.el); }
      else if (s && e.key.startsWith('Arrow')) {
        e.preventDefault(); const st = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
        translateEl(s.el, JSON.parse(JSON.stringify(s.el)), dx, dy); updateNode(s.page, s.el); renderSel(); commitSoon();
      } else if (TOOLKEYS[k]) setTool(TOOLKEYS[k]);
      else if (k === 'i') $('#imgIn').click();
      else if (k === 's') openSig();
      else if (k === '?') $('#keysDlg').showModal();
    });
    document.addEventListener('paste', (e) => {
      if ($('#editor').hidden) return;
      const tg = e.target; if (tg.isContentEditable || /^(INPUT|TEXTAREA)$/.test(tg.tagName)) return;
      const item = Array.from(e.clipboardData ? e.clipboardData.items : []).find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); insertImageFile(item.getAsFile()); }
    });
    window.addEventListener('beforeunload', (e) => { if (S.dirty && !$('#editor').hidden) { e.preventDefault(); e.returnValue = ''; } });
    let rz = 0;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (innerWidth > 860) closePanels(); }, 150); });

    if (!LIBS_OK) toast('As bibliotecas de PDF não carregaram. Verifique sua conexão com a internet.', 'error');
  }

  bind();
  // exposto para depuração no console
  window.HFA = { S, exportPdf };
})();
