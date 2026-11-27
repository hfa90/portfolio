// Geometria e desenho (HTML/SVG) dos elementos adicionados
import { esc, f2, rotVec, clamp } from './util.js';
import { S, FONTS, LH, TYPE, elType } from './state.js';
import { SLOTS } from './render.js';
import { EDIT, finishEdit } from './textedit.js';

export function lineGeom(el) {
  const { x1, y1, x2, y2 } = el;
  if (el.type !== 'arrow') return { ex: x2, ey: y2 };
  const a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
  const L = Math.min(Math.max(9, el.width * 4), len), W = L * 0.55;
  const bx = x2 - L * Math.cos(a), by = y2 - L * Math.sin(a);
  const px = -Math.sin(a) * W, py = Math.cos(a) * W;
  return { ex: bx, ey: by, pts: [[x2, y2], [bx + px, by + py], [bx - px, by - py]] };
}

export function pathD(pts) {
  if (!pts.length) return '';
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
  if (pts.length < 3) {
    for (let i = 1; i < pts.length; i++) d += ` L${f2(pts[i][0])} ${f2(pts[i][1])}`;
    if (pts.length === 1) d += ` L${f2(pts[0][0] + 0.01)} ${f2(pts[0][1])}`;
    return d;
  }
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
    case 'whiteout': {
      const mark = el.burn ? `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="url(#hfa-hatch)" pointer-events="none"/>` : '';
      return `<rect data-el="${id}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.fill || '#ffffff'}" pointer-events="all"/>${mark}`;
    }
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

/** Cria o nó DOM de um elemento na escala z (usado na página e nas miniaturas). */
export function makeNode(el, i, page, z) {
  let n;
  if (el.type === 'text') {
    n = document.createElement('div'); n.className = 'el el-text'; n.dataset.el = el.id;
    const f = FONTS[el.font] || FONTS.Helvetica;
    Object.assign(n.style, {
      left: el.x * z + 'px', top: el.y * z + 'px', fontSize: el.size * z + 'px', fontFamily: f.css,
      fontWeight: el.bold ? '700' : '400', fontStyle: el.italic ? 'italic' : 'normal', color: el.color,
      opacity: el.opacity ?? 1, transform: el.rot ? `rotate(${el.rot}deg)` : '', textAlign: el.align || 'left',
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
export function measure(el, n) { if (el.type === 'text' && n && n.isConnected) { el.w = n.offsetWidth / S.zoom; el.h = n.offsetHeight / S.zoom; } }

export function renderEls(page) {
  const rec = SLOTS.get(page.id); if (!rec) return;
  if (EDIT && EDIT.pageId === page.id) finishEdit();
  const z = S.zoom, frag = document.createDocumentFragment();
  const nodes = page.els.map((el, i) => { const n = makeNode(el, i, page, z); frag.appendChild(n); return n; });
  rec.els.replaceChildren(frag);
  page.els.forEach((el, i) => measure(el, nodes[i]));
}
export function updateNode(page, el) {
  const rec = SLOTS.get(page.id); if (!rec) return;
  const old = rec.els.querySelector(`[data-node="${el.id}"]`);
  const n = makeNode(el, page.els.indexOf(el), page, S.zoom);
  if (old) old.replaceWith(n); else rec.els.appendChild(n);
  measure(el, n);
}

export function rotBox(x, y, w, h, rot) {
  if (!rot) return { x, y, w, h };
  const pts = [[0, 0], [w, 0], [w, h], [0, h]].map(([a, b]) => { const [u, v] = rotVec(a, b, rot); return [x + u, y + v]; });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const mx = Math.min(...xs), my = Math.min(...ys);
  return { x: mx, y: my, w: Math.max(...xs) - mx, h: Math.max(...ys) - my };
}
/** Tamanho sem rotação (w, h) de texto ou imagem. */
export const ownSize = (el) => (el.type === 'text' ? [el.w || 8, el.h || el.size * LH] : [el.w, el.h]);
export function bbox(el) {
  switch (el.type) {
    case 'text': case 'image': { const [w, h] = ownSize(el); return rotBox(el.x, el.y, w, h, el.rot); }
    case 'line': case 'arrow': return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
    case 'draw': {
      const xs = el.pts.map((p) => p[0]), ys = el.pts.map((p) => p[1]);
      const mx = Math.min(...xs), my = Math.min(...ys);
      return { x: mx, y: my, w: Math.max(Math.max(...xs) - mx, 1), h: Math.max(Math.max(...ys) - my, 1) };
    }
    default: return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}
export function unionBox(els) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of els) { const b = bbox(el); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function translateEl(el, o, dx, dy) {
  if (el.type === 'line' || el.type === 'arrow') { el.x1 = o.x1 + dx; el.y1 = o.y1 + dy; el.x2 = o.x2 + dx; el.y2 = o.y2 + dy; }
  else if (el.type === 'draw') el.pts = o.pts.map((p) => [p[0] + dx, p[1] + dy]);
  else { el.x = o.x + dx; el.y = o.y + dy; }
}
export function applyBox(el, o, ob, nb) {
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
/** Gira texto/imagem para `deg` mantendo o centro no lugar. */
export function rotateAroundCenter(el, deg) {
  const [w, h] = ownSize(el), r0 = el.rot || 0;
  const [cx, cy] = rotVec(w / 2, h / 2, r0); const mx = el.x + cx, my = el.y + cy;
  const r = ((Math.round(deg * 10) / 10 % 360) + 360) % 360;
  const [nx, ny] = rotVec(w / 2, h / 2, r);
  el.rot = r; el.x = mx - nx; el.y = my - ny;
}
export function elLabel(el) {
  if (el.type === 'text') return '“' + (el.text.split('\n')[0].slice(0, 40) || 'Texto vazio') + '”';
  if (el.type === 'image' && el.sig) return 'Assinatura';
  return TYPE[elType(el)].label;
}
export const elIcon = (el) => (el.type === 'image' && el.sig ? 'sign' : TYPE[elType(el)].icon);
