// Ferramentas, seleção (simples e múltipla), ponteiro, guias de alinhamento,
// rotação, área de transferência interna e zoom por pinça
import { $$, clamp, clone, icon, uid, rotVec } from './util.js';
import { S, HANDLES, ROTATABLE, pageById, totalRot, selection, selected, isSel } from './state.js';
import { SLOTS, viewer, setCur, setZoom, pagesEl } from './render.js';
import { bbox, unionBox, translateEl, applyBox, updateNode, renderEls, rotateAroundCenter, ownSize } from './elements.js';
import { EDIT, startEdit, finishEdit, refreshHints } from './textedit.js';
import { syncProps, renderLayers, closePanels } from './panel.js';
import { commit } from './history.js';

export let DRAG = null;

// ---------- ferramentas ----------
export function setTool(t) {
  if (EDIT) finishEdit();
  S.tool = t; viewer.dataset.tool = t;
  $$('#tools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  if (t !== 'select' && S.sel) { S.sel = null; renderSel(); renderLayers(); }
  refreshHints({ warn: t === 'edittext' });
  syncProps();
  closePanels();
}

// ---------- seleção ----------
export function select(pageId, ids) {
  ids = ids == null ? [] : Array.isArray(ids) ? ids : [ids];
  S.sel = pageId && ids.length ? { pageId, ids } : null;
  if (pageId && pageId !== S.cur) setCur(pageId, false);
  renderSel(); syncProps(); renderLayers();
}
export function toggleSel(page, id) {
  const base = S.sel && S.sel.pageId === page.id ? S.sel.ids : [];
  select(page.id, base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
}
export function selectAll() {
  const page = pageById(S.cur); if (!page || !page.els.length) return;
  if (S.tool !== 'select') setTool('select');
  select(page.id, page.els.map((e) => e.id));
}
export function addEl(page, el, { sel = true } = {}) {
  el.id = el.id || uid('e'); page.els.push(el);
  updateNode(page, el); if (sel) select(page.id, el.id);
  return el;
}
export function deleteSel() {
  const s = selection(); if (!s) return;
  const ids = new Set(s.els.map((e) => e.id));
  s.page.els = s.page.els.filter((e) => !ids.has(e.id)); S.sel = null;
  renderEls(s.page); renderSel(); syncProps(); commit();
}
function cloneEls(els, dx, dy) {
  return els.map((el) => { const c = clone(el); c.id = uid('e'); delete c.src; translateEl(c, clone(c), dx, dy); return c; });
}
export function duplicateSel() {
  const s = selection(); if (!s) return;
  const cs = cloneEls(s.els, 12, 12);
  s.page.els.push(...cs); renderEls(s.page); select(s.page.id, cs.map((c) => c.id)); commit();
}
export function reorderSel(dir) {
  const s = selection(); if (!s) return;
  const a = s.page.els;
  if (s.els.length === 1) {
    const i = a.indexOf(s.els[0]), j = clamp(i + dir, 0, a.length - 1); if (i === j) return;
    a.splice(i, 1); a.splice(j, 0, s.els[0]);
  } else {
    const ids = new Set(s.els.map((e) => e.id)), rest = a.filter((e) => !ids.has(e.id)), mine = a.filter((e) => ids.has(e.id));
    s.page.els = dir > 0 ? [...rest, ...mine] : [...mine, ...rest];
  }
  renderEls(s.page); renderSel(); renderLayers(); commit();
}
/** Alinha a seleção. Com um elemento, alinha à página; com vários, entre si. */
export function alignSel(kind) {
  const s = selection(); if (!s) return;
  const ref = s.els.length > 1 ? unionBox(s.els) : { x: 0, y: 0, w: s.page.w, h: s.page.h };
  for (const el of s.els) {
    const b = bbox(el); let dx = 0, dy = 0;
    if (kind === 'l') dx = ref.x - b.x; else if (kind === 'ch') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); else if (kind === 'r') dx = ref.x + ref.w - (b.x + b.w);
    else if (kind === 't') dy = ref.y - b.y; else if (kind === 'cv') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); else if (kind === 'b') dy = ref.y + ref.h - (b.y + b.h);
    translateEl(el, clone(el), dx, dy);
  }
  renderEls(s.page); renderSel(); commit();
}

// ---------- área de transferência interna ----------
let CLIP = null;
export function copySel(cut = false) {
  const s = selection(); if (!s) return null;
  const assets = {};
  s.els.forEach((e) => { if (e.asset && S.assets[e.asset]) assets[e.asset] = S.assets[e.asset]; });
  CLIP = { els: s.els.map(clone), assets, pageId: s.page.id, n: cut ? -1 : 0, token: uid('clip') };
  if (cut) deleteSel();
  return CLIP.token;
}
export const clipToken = () => CLIP && CLIP.token;
export function pasteClip() {
  if (!CLIP) return false;
  const page = pageById(S.cur) || S.pages[0]; if (!page) return false;
  Object.entries(CLIP.assets).forEach(([k, a]) => { if (!S.assets[k]) S.assets[k] = a; });
  CLIP.n++;
  const off = page.id === CLIP.pageId ? 12 * Math.max(CLIP.n, 0) : 0;
  if (S.tool !== 'select') setTool('select');
  const cs = cloneEls(CLIP.els, off, off);
  page.els.push(...cs); renderEls(page); select(page.id, cs.map((c) => c.id)); commit();
  return true;
}

// ---------- caixa de seleção ----------
export function renderSel() {
  for (const rec of SLOTS.values()) rec.selx.replaceChildren();
  const s = selection(); if (!s) return;
  const rec = SLOTS.get(s.page.id); if (!rec) return;
  const z = S.zoom, multi = s.els.length > 1, el = s.els[0];
  const b = multi ? unionBox(s.els) : bbox(el);
  const isLine = !multi && (el.type === 'line' || el.type === 'arrow');
  const editing = EDIT && EDIT.elId === el.id;
  const box = document.createElement('div'); box.className = 'selbox' + (isLine ? ' line' : '') + (multi ? ' multi' : '');
  Object.assign(box.style, { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' });
  if (!multi && !isLine && !editing) {
    box.innerHTML = HANDLES.map((h) => `<span class="hd hd-${h}" data-h="${h}"></span>`).join('')
      + (ROTATABLE.has(el.type) ? '<span class="hd rot" data-h="rot" title="Girar (Shift: de 15 em 15°)"></span>' : '');
  }
  if (multi) {
    s.els.forEach((e) => {
      const eb = bbox(e), sub = document.createElement('div'); sub.className = 'selbox sub';
      Object.assign(sub.style, { left: eb.x * z + 'px', top: eb.y * z + 'px', width: eb.w * z + 'px', height: eb.h * z + 'px' });
      rec.selx.appendChild(sub);
    });
  }
  const bar = document.createElement('div'); bar.className = 'selbar';
  const B = (a, ic, t, cls = '') => `<button type="button" data-sa="${a}" class="${cls}" title="${t}" aria-label="${t}">${icon(ic)}</button>`;
  bar.innerHTML = multi
    ? `<span class="selcount">${s.els.length}</span>` + B('al-l', 'alignL', 'Alinhar à esquerda') + B('al-ch', 'alignCH', 'Centralizar na horizontal') + B('al-r', 'alignR', 'Alinhar à direita')
      + B('al-t', 'alignT', 'Alinhar ao topo') + B('al-cv', 'alignCV', 'Centralizar na vertical') + B('al-b', 'alignB', 'Alinhar à base')
      + B('front', 'up', 'Trazer para frente') + B('back', 'down', 'Enviar para trás') + B('dup', 'copy', 'Duplicar (Ctrl+D)') + B('del', 'trash', 'Excluir (Delete)', 'del')
    : (el.type === 'text' ? B('edit', 'edit', 'Editar texto') : '') + B('front', 'up', 'Trazer para frente') + B('back', 'down', 'Enviar para trás')
      + B('dup', 'copy', 'Duplicar (Ctrl+D)') + B('del', 'trash', 'Excluir (Delete)', 'del');
  const rotH = !multi && !isLine && !editing && ROTATABLE.has(el.type);
  const room = rotH ? 80 : 44;
  bar.style.left = b.x * z + 'px'; bar.style.top = Math.max(b.y * z - 4, room - 14) + 'px';
  if (rotH) bar.classList.add('above-rot');
  if (b.y * z < room) { bar.style.top = (b.y + b.h) * z + 'px'; bar.style.transform = 'translateY(12px)'; }
  rec.selx.append(box, bar);
  if (isLine) {
    [['p1', el.x1, el.y1], ['p2', el.x2, el.y2]].forEach(([h, x, y]) => {
      const d = document.createElement('span'); d.className = 'hd pt'; d.dataset.h = h;
      d.style.left = x * z + 'px'; d.style.top = y * z + 'px'; rec.selx.appendChild(d);
    });
  }
}
function drawGuides(page, gx, gy) {
  const rec = SLOTS.get(page.id); if (!rec) return; const z = S.zoom;
  gx.forEach((x) => { const g = document.createElement('div'); g.className = 'guide v'; g.style.left = x * z + 'px'; rec.selx.appendChild(g); });
  gy.forEach((y) => { const g = document.createElement('div'); g.className = 'guide h'; g.style.top = y * z + 'px'; rec.selx.appendChild(g); });
}
function drawMarquee(page, r) {
  const rec = SLOTS.get(page.id); if (!rec) return; const z = S.zoom;
  const m = document.createElement('div'); m.className = 'marquee';
  Object.assign(m.style, { left: r.x * z + 'px', top: r.y * z + 'px', width: r.w * z + 'px', height: r.h * z + 'px' });
  rec.selx.appendChild(m);
}

// ---------- coordenadas ----------
export function pagePoint(e, page) {
  const rec = SLOTS.get(page.id); const r = rec.slot.getBoundingClientRect(); const z = S.zoom;
  const dx = (e.clientX - r.left) / z, dy = (e.clientY - r.top) / z, { w, h } = page;
  switch (totalRot(page)) {
    case 90: return { x: dy, y: h - dx };
    case 180: return { x: w - dx, y: h - dy };
    case 270: return { x: w - dy, y: dx };
    default: return { x: dx, y: dy };
  }
}
export function visibleCenter(page) {
  const rec = SLOTS.get(page.id); if (!rec) return { x: page.w / 2, y: page.h / 2 };
  const vr = viewer.getBoundingClientRect(), sr = rec.slot.getBoundingClientRect();
  const cx = clamp(vr.left + vr.width / 2, sr.left + 20, sr.right - 20), cy = clamp(vr.top + vr.height / 2, sr.top + 20, sr.bottom - 20);
  return pagePoint({ clientX: cx, clientY: cy }, page);
}

// ---------- guias de alinhamento ----------
function snapTargets(page, ids) {
  const xs = [0, page.w / 2, page.w], ys = [0, page.h / 2, page.h];
  for (const el of page.els) {
    if (ids.has(el.id)) continue;
    const b = bbox(el); xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}
function snap1(vals, targets, thr) {
  let best = null;
  for (const v of vals) for (const t of targets) { const d = t - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }
  return best;
}

// ---------- ponteiro ----------
export function onDown(e) {
  if (e.button !== 0 || !e.isPrimary || PINCH) return;
  if (e.target.closest('.selbar')) return;
  const slot = e.target.closest('.slot');
  if (!slot) { if (EDIT) finishEdit(); if (S.sel) select(null); return; }
  const page = pageById(slot.dataset.page); if (!page) return;
  if (page.id !== S.cur) setCur(page.id, false);
  const nodeEl = e.target.closest('[data-el]');
  if (EDIT && nodeEl && nodeEl.dataset.el === EDIT.elId) return; // posicionar o cursor
  if (e.target.closest('.hint') && !nodeEl) return; // tratado no click
  if (EDIT) finishEdit();
  const pt = pagePoint(e, page);
  const handle = e.target.closest('[data-h]');
  const one = selected();
  if (handle && one) {
    e.preventDefault();
    if (handle.dataset.h === 'rot') {
      const o = clone(one.el), [w, h] = ownSize(o), [cx, cy] = rotVec(w / 2, h / 2, o.rot || 0);
      const c = { x: o.x + cx, y: o.y + cy };
      DRAG = { kind: 'rotate', page, el: one.el, o, c, a0: Math.atan2(pt.y - c.y, pt.x - c.x), moved: false };
    } else DRAG = { kind: 'resize', page, el: one.el, h: handle.dataset.h, o: clone(one.el), ob: bbox(one.el), moved: false };
    return;
  }
  const el = nodeEl && page.els.find((x) => x.id === nodeEl.dataset.el);
  const tool = S.tool;
  if (tool === 'select' || tool === 'edittext' || (tool === 'text' && el && el.type === 'text')) {
    if (el) {
      if (tool === 'text') { startEdit(page, el); return; }
      if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSel(page, el.id); return; }
      const pre = isSel(el.id) && S.sel.pageId === page.id && S.sel.ids.length > 1;
      if (!isSel(el.id) || S.sel.pageId !== page.id) select(page.id, el.id);
      const s = selection();
      const ids = new Set(s.els.map((x) => x.id));
      DRAG = { kind: 'move', page, els: s.els, o: s.els.map(clone), ob: unionBox(s.els), start: pt, moved: false, snap: snapTargets(page, ids), hit: el.id, pre };
    } else if (tool === 'select') {
      e.preventDefault();
      const base = e.shiftKey && S.sel && S.sel.pageId === page.id ? [...S.sel.ids] : [];
      if (!base.length && S.sel) select(null);
      DRAG = { kind: 'marquee', page, start: pt, base, moved: false };
    } else if (S.sel) select(null);
    return;
  }
  e.preventDefault();
  const d = S.defs[tool] || {};
  const rot = (360 - totalRot(page)) % 360;
  switch (tool) {
    case 'text': {
      const [ox, oy] = rotVec(0, d.size * 0.6, rot);
      const t = addEl(page, { type: 'text', x: pt.x - ox, y: pt.y - oy, text: '', font: d.font, size: d.size, bold: d.bold, italic: d.italic, color: d.color, opacity: d.opacity, rot, align: d.align || 'left' });
      startEdit(page, t);
      return;
    }
    case 'rect': case 'ellipse': case 'highlight': case 'whiteout': case 'redact': {
      const props = tool === 'redact' ? { type: 'whiteout', fill: d.fill, burn: true } : tool === 'whiteout' ? { type: 'whiteout', fill: d.fill, burn: !!d.burn } : { type: tool, ...d };
      const nel = addEl(page, { x: pt.x, y: pt.y, w: 0, h: 0, ...props }, { sel: false });
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

export function onMove(e) {
  if (!DRAG || PINCH) return;
  const { page } = DRAG; if (!SLOTS.get(page.id)) return;
  const pt = pagePoint(e, page);
  if (DRAG.kind === 'move') {
    let dx = pt.x - DRAG.start.x, dy = pt.y - DRAG.start.y;
    if (!DRAG.moved && Math.hypot(dx, dy) * S.zoom < 3) return;
    DRAG.moved = true;
    const gx = [], gy = [];
    if (!e.altKey) {
      const ob = DRAG.ob, thr = 6 / S.zoom;
      const sx = snap1([ob.x + dx, ob.x + ob.w / 2 + dx, ob.x + ob.w + dx], DRAG.snap.xs, thr);
      const sy = snap1([ob.y + dy, ob.y + ob.h / 2 + dy, ob.y + ob.h + dy], DRAG.snap.ys, thr);
      if (sx) { dx += sx.d; gx.push(sx.t); }
      if (sy) { dy += sy.d; gy.push(sy.t); }
    }
    DRAG.els.forEach((el, k) => { translateEl(el, DRAG.o[k], dx, dy); updateNode(page, el); });
    renderSel(); drawGuides(page, gx, gy);
    return;
  }
  if (DRAG.kind === 'marquee') {
    const r = { x: Math.min(DRAG.start.x, pt.x), y: Math.min(DRAG.start.y, pt.y), w: Math.abs(pt.x - DRAG.start.x), h: Math.abs(pt.y - DRAG.start.y) };
    if (!DRAG.moved && Math.max(r.w, r.h) * S.zoom < 4) return;
    DRAG.moved = true;
    const hit = page.els.filter((el) => { const b = bbox(el); return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y; }).map((el) => el.id);
    const ids = [...new Set([...DRAG.base, ...hit])];
    S.sel = ids.length ? { pageId: page.id, ids } : null;
    renderSel(); drawMarquee(page, r);
    return;
  }
  const { el } = DRAG;
  if (DRAG.kind === 'rotate') {
    DRAG.moved = true;
    let deg = (DRAG.o.rot || 0) + ((Math.atan2(pt.y - DRAG.c.y, pt.x - DRAG.c.x) - DRAG.a0) * 180) / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    else { const n = Math.round(deg / 90) * 90; if (Math.abs(deg - n) < 3) deg = n; }
    Object.assign(el, clone(DRAG.o)); rotateAroundCenter(el, deg);
    updateNode(page, el); renderSel(); syncProps();
    return;
  }
  if (DRAG.kind === 'resize') {
    DRAG.moved = true;
    const hd = DRAG.h;
    if (hd === 'p1' || hd === 'p2') { el[hd === 'p1' ? 'x1' : 'x2'] = pt.x; el[hd === 'p1' ? 'y1' : 'y2'] = pt.y; }
    else {
      const ob = DRAG.ob; let x = ob.x, y = ob.y, x2 = ob.x + ob.w, y2 = ob.y + ob.h;
      if (hd.includes('w')) x = Math.min(pt.x, x2 - 2);
      if (hd.includes('e')) x2 = Math.max(pt.x, x + 2);
      if (hd.includes('n')) y = Math.min(pt.y, y2 - 2);
      if (hd.includes('s')) y2 = Math.max(pt.y, y + 2);
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
  if (isSel(el.id)) renderSel();
}

export function onUp() {
  if (!DRAG) return;
  const d = DRAG; DRAG = null; const { page, el } = d;
  if (d.kind === 'marquee') { renderSel(); syncProps(); renderLayers(); return; }
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
  if (d.moved) { renderSel(); syncProps(); commit(); }
  else if (d.kind === 'move' && d.pre) select(page.id, d.hit);
  else renderSel();
}

/** Desfaz o gesto em andamento (usado quando começa uma pinça). */
export function cancelDrag() {
  const d = DRAG; if (!d) return; DRAG = null;
  if (d.kind === 'create' || d.kind === 'draw') { d.page.els = d.page.els.filter((x) => x !== d.el); renderEls(d.page); }
  else if (d.kind === 'move') d.els.forEach((el, k) => Object.assign(el, d.o[k]));
  else if (d.kind === 'resize' || d.kind === 'rotate') Object.assign(d.el, d.o);
  if (d.kind !== 'create' && d.kind !== 'draw') renderEls(d.page);
  renderSel();
}

// ---------- zoom por pinça (toque) ----------
let PINCH = null;
const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
export function bindPinch() {
  viewer.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault(); cancelDrag(); if (EDIT) finishEdit();
    const pe = pagesEl(); if (!pe) return;
    const m = mid(e.touches), r = pe.getBoundingClientRect();
    pe.style.transformOrigin = `${m.x - r.left}px ${m.y - r.top}px`;
    PINCH = { d0: dist(e.touches), z0: S.zoom, m, k: 1, pe };
  }, { passive: false });
  viewer.addEventListener('touchmove', (e) => {
    if (!PINCH || e.touches.length !== 2) return;
    e.preventDefault();
    PINCH.k = clamp(dist(e.touches) / PINCH.d0, 0.25 / PINCH.z0, 4 / PINCH.z0);
    PINCH.pe.style.transform = `scale(${PINCH.k})`;
  }, { passive: false });
  const end = (e) => {
    if (!PINCH || e.touches.length >= 2) return;
    const p = PINCH; PINCH = null;
    p.pe.style.transform = ''; p.pe.style.transformOrigin = '';
    if (Math.abs(p.k - 1) > 0.02) setZoom(p.z0 * p.k, p.m);
  };
  viewer.addEventListener('touchend', end); viewer.addEventListener('touchcancel', end);
}
