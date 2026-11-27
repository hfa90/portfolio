// Páginas, miniaturas, rasterização sob demanda e zoom
import { $, $$, clamp, icon, canvasBlob } from './util.js';
import { S, pageById, totalRot, dispDims, srcKey } from './state.js';
import { renderEls, makeNode } from './elements.js';
import { renderSel } from './select.js';
import { renderPageHints, clearHints, EDIT, finishEdit } from './textedit.js';
import { renderLayers } from './panel.js';

export const viewer = $('#viewer');
export const SLOTS = new Map(); // pageId -> rec
const SLOT_REC = new WeakMap(); // slot -> rec
let pagesBox = null;
let io = null, tio = null;
let renderQ = Promise.resolve(), thumbQ = Promise.resolve();

// ---------- cache de rasterização com limite de memória (LRU) ----------
const RC = new Map();
let rcBytes = 0;
const RC_MAX = 160 * 1024 * 1024; // ~160 MB de pixels
const cBytes = (c) => c.width * c.height * 4;
// renderizações canceladas (documento fechado ou zoom trocado no meio) não são erro
const report = (e) => { if (!/Cancel|destroyed|Worker was terminated/i.test((e && (e.name + ' ' + e.message)) || '')) console.error(e); };
function rcGet(k) { const c = RC.get(k); if (c) { RC.delete(k); RC.set(k, c); } return c; }
function rcPut(k, c) {
  RC.set(k, c); rcBytes += cBytes(c);
  while (rcBytes > RC_MAX && RC.size > 1) {
    const [k0, c0] = RC.entries().next().value; RC.delete(k0); rcBytes -= cBytes(c0);
  }
}
const TC = new Map(); // miniaturas: chave -> URL de JPEG
export function clearCaches() {
  RC.clear(); rcBytes = 0;
  for (const u of TC.values()) u.then((x) => URL.revokeObjectURL(x)).catch(() => {});
  TC.clear();
}
export const cacheStats = () => ({ entries: RC.size, mb: Math.round(rcBytes / 1048576), domCanvases: $$('.cv canvas').length });

/** Desenha a página (sem rotação) num canvas. dpr=false para exportação. */
export async function rasterize(page, scale, { dpr = true } = {}) {
  const k = dpr ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(page.w * scale * k)); c.height = Math.max(1, Math.round(page.h * scale * k));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  const doc = page.docId && S.docs[page.docId]; if (!doc) return c;
  const pp = await doc.pdf.getPage(page.index + 1);
  const vp = pp.getViewport({ scale: scale * k, rotation: 0 });
  await pp.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}
function cloneCanvas(src) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }

export function pgTransform(p, z) {
  switch (totalRot(p)) {
    case 90: return `translate(${p.h * z}px,0) rotate(90deg)`;
    case 180: return `translate(${p.w * z}px,${p.h * z}px) rotate(180deg)`;
    case 270: return `translate(0,${p.w * z}px) rotate(270deg)`;
    default: return 'none';
  }
}

// ---------- páginas ----------
export function rebuildPages() {
  if (EDIT) finishEdit();
  if (io) io.disconnect();
  io = new IntersectionObserver(onIO, { root: viewer, rootMargin: '900px 0px' });
  SLOTS.clear();
  pagesBox = document.createElement('div'); pagesBox.className = 'pages';
  const z = S.zoom, n = S.pages.length;
  S.pages.forEach((p, i) => {
    const [dw, dh] = dispDims(p);
    const wrap = document.createElement('section'); wrap.className = 'pwrap';
    wrap.innerHTML = `<div class="slot" data-page="${p.id}" style="width:${dw * z}px;height:${dh * z}px"><div class="pg" style="width:${p.w * z}px;height:${p.h * z}px;transform:${pgTransform(p, z)}"><div class="cv"></div><div class="hints"></div><div class="els"></div><div class="selx"></div></div></div><div class="pnum">Página ${i + 1} de ${n}</div>`;
    pagesBox.appendChild(wrap);
    const slot = wrap.firstElementChild;
    const rec = { slot, cv: $('.cv', slot), els: $('.els', slot), hints: $('.hints', slot), selx: $('.selx', slot), visible: false, rz: null, pending: false, hintsOn: false };
    SLOTS.set(p.id, rec); SLOT_REC.set(slot, rec);
  });
  viewer.replaceChildren(pagesBox);
  for (const p of S.pages) { renderEls(p); io.observe(SLOTS.get(p.id).slot); }
  renderSel();
  updatePageInd();
}
export function rebuild() { rebuildPages(); renderThumbs(); renderLayers(); }
export const pagesEl = () => pagesBox;

function onIO(entries) {
  for (const en of entries) {
    const rec = SLOT_REC.get(en.target); if (!rec) continue;
    rec.visible = en.isIntersecting;
    if (rec.visible) { ensureRendered(rec); if (S.tool === 'edittext') renderPageHints(rec.slot.dataset.page); }
    else releaseRec(rec);
  }
}
/** Libera o canvas e os realces de páginas longe da área visível. */
function releaseRec(rec) {
  if (rec.rz != null) { rec.cv.replaceChildren(); rec.rz = null; }
  if (rec.hintsOn) clearHints(rec);
}
export const visibleRecs = () => [...SLOTS.entries()].filter(([, r]) => r.visible);

function ensureRendered(rec) {
  if (rec.rz === S.zoom || rec.pending) return;
  rec.pending = true;
  renderQ = renderQ.then(async () => {
    rec.pending = false;
    if (!rec.visible || !rec.slot.isConnected || rec.rz === S.zoom) return;
    const page = pageById(rec.slot.dataset.page); if (!page) return;
    const z = S.zoom, key = srcKey(page) + '@' + z;
    let c = rcGet(key);
    if (!c) { c = await rasterize(page, z); rcPut(key, c); }
    if (!rec.slot.isConnected || S.zoom !== z || !rec.visible) return;
    rec.cv.replaceChildren(c.isConnected ? cloneCanvas(c) : c); rec.rz = z;
  }).catch(report);
}

// ---------- miniaturas ----------
const TW = 128;
const thumbScale = (p) => TW / dispDims(p)[0];
export function renderThumbs() {
  const box = $('#thumbs'); box.replaceChildren();
  if (tio) tio.disconnect();
  tio = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { tio.unobserve(en.target); drawThumb(en.target); } }), { root: box, rootMargin: '400px 0px' });
  const n = S.pages.length;
  S.pages.forEach((p, i) => {
    const dh = dispDims(p)[1], sc = thumbScale(p);
    const d = document.createElement('div'); d.className = 'thumb' + (p.id === S.cur ? ' on' : ''); d.dataset.page = p.id;
    d.draggable = true; d.tabIndex = 0; d.setAttribute('role', 'listitem'); d.setAttribute('aria-label', `Página ${i + 1} de ${n}`);
    d.innerHTML = `<div class="tcv" style="width:${TW}px;height:${dh * sc}px"><div class="tpg" style="width:${p.w * sc}px;height:${p.h * sc}px;transform:${pgTransform(p, sc)}"><img class="traster" alt=""><div class="tels"></div></div></div><div class="tbar"><span class="tnum">${i + 1}</span><span class="tacts">`
      + `<button type="button" data-ta="rotl" title="Girar à esquerda" aria-label="Girar página ${i + 1} à esquerda">${icon('rotl')}</button>`
      + `<button type="button" data-ta="rotr" title="Girar à direita" aria-label="Girar página ${i + 1} à direita">${icon('rotr')}</button>`
      + `<button type="button" data-ta="dup" title="Duplicar página" aria-label="Duplicar página ${i + 1}">${icon('copy')}</button>`
      + `<button type="button" class="del" data-ta="del" title="Excluir página" aria-label="Excluir página ${i + 1}">${icon('trash')}</button></span></div>`;
    box.appendChild(d); tio.observe(d);
    renderThumbEls(p, d);
  });
}
/** Mostra na miniatura os elementos adicionados (textos, assinaturas, formas). */
export function renderThumbEls(p, d) {
  d = d || $(`#thumbs .thumb[data-page="${p.id}"]`); if (!d) return;
  const sc = thumbScale(p), box = d.querySelector('.tels');
  box.replaceChildren(...p.els.map((el, i) => makeNode(el, i, p, sc)));
}
function drawThumb(d) {
  const p = pageById(d.dataset.page); if (!p) return;
  thumbQ = thumbQ.then(async () => {
    if (!d.isConnected) return;
    const sc = thumbScale(p), key = srcKey(p) + '@' + sc.toFixed(4);
    if (!TC.has(key)) TC.set(key, rasterize(p, sc).then((c) => canvasBlob(c, 'image/jpeg', 0.85)).then((b) => URL.createObjectURL(b)).catch((e) => { TC.delete(key); throw e; }));
    const url = await TC.get(key);
    const img = d.querySelector('.traster'); if (img) img.src = url;
  }).catch(report);
}

// ---------- página atual ----------
export function updatePageInd() {
  const i = S.pages.findIndex((p) => p.id === S.cur);
  $('#pageInd').textContent = S.pages.length ? `Página ${i + 1} de ${S.pages.length}` : '';
}
export function setCur(id, scroll) {
  if (!pageById(id)) return;
  const changed = S.cur !== id; S.cur = id;
  $$('#thumbs .thumb').forEach((t) => t.classList.toggle('on', t.dataset.page === id));
  if (changed) { updatePageInd(); renderLayers(); }
  if (scroll) { const r = SLOTS.get(id); if (r) r.slot.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  const th = $(`#thumbs .thumb[data-page="${id}"]`); if (th) th.scrollIntoView({ block: 'nearest' });
}
export function detectCur() {
  const vr = viewer.getBoundingClientRect(), mid = vr.top + vr.height * 0.35;
  let best = null, bd = Infinity;
  for (const [id, rec] of SLOTS) {
    const r = rec.slot.getBoundingClientRect();
    const d = mid >= r.top && mid <= r.bottom ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (d < bd) { bd = d; best = id; }
  }
  if (best && best !== S.cur) setCur(best, false);
}

// ---------- zoom ----------
/** Muda o zoom mantendo fixo o ponto sob `focus` ({x, y} em coordenadas da tela). */
export function setZoom(z, focus) {
  z = clamp(Math.round(z * 100) / 100, 0.25, 4); if (z === S.zoom) return;
  const vr = viewer.getBoundingClientRect();
  const fx = focus ? focus.x - vr.left : viewer.clientWidth / 2, fy = focus ? focus.y - vr.top : viewer.clientHeight / 2;
  const cx = viewer.scrollLeft + fx, cy = viewer.scrollTop + fy, k = z / S.zoom;
  S.zoom = z; $('#zoomLbl').textContent = Math.round(z * 100) + '%';
  rebuildPages();
  viewer.scrollLeft = cx * k - fx; viewer.scrollTop = cy * k - fy;
  detectCur();
}
export function fitZoom() {
  const maxW = Math.max(...S.pages.map((p) => dispDims(p)[0]));
  return clamp(Math.floor(((viewer.clientWidth - 60) / maxW) * 100) / 100, 0.25, 1.4);
}
export function fitWidth() { setZoom(fitZoom()); }
