// Utilidades gerais, ícones e mensagens
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
let _n = 0;
export const uid = (p = 'e') => p + (++_n).toString(36) + Math.random().toString(36).slice(2, 7);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const f2 = (n) => Math.round(n * 100) / 100;
export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
/** Gira o vetor (a, b) em `deg` graus (sentido horário, eixo y para baixo). */
export const rotVec = (a, b, deg) => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [a * c - b * s, a * s + b * c]; };

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
  redact: 'M3.5 5.5h17v13h-17z M6.5 9.5h11 M6.5 12h11 M6.5 14.5h7',
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
  alignL: 'M4 4v16 M8 7h10 M8 12h6 M8 17h12',
  alignCH: 'M12 3v18 M6 7h12 M8 12h8 M5 17h14',
  alignR: 'M20 4v16 M6 7h10 M10 12h6 M4 17h12',
  alignT: 'M4 4h16 M7 8v10 M12 8v6 M17 8v12',
  alignCV: 'M3 12h18 M7 6v12 M12 8v8 M17 5v14',
  alignB: 'M4 20h16 M7 6v10 M12 10v6 M17 4v12',
  txtL: 'M4 6h16 M4 10h10 M4 14h16 M4 18h10',
  txtC: 'M4 6h16 M7 10h10 M4 14h16 M7 18h10',
  txtR: 'M4 6h16 M10 10h10 M4 14h16 M10 18h10',
  rotate: 'M20 11a8 8 0 10-2.3 5.7 M20 4v7h-7',
  restore: 'M3 12a9 9 0 109-9 9.5 9.5 0 00-6.6 2.7L3 8 M3 3v5h5 M12 8v4l3 2',
};
export const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`;
export const hydrateIcons = (root = document) => $$('[data-icon]', root).forEach((e) => { if (!e.querySelector(':scope > .ic')) e.insertAdjacentHTML('afterbegin', icon(e.dataset.icon)); });

export function toast(msg, kind = '', ms) {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms || (kind === 'error' || kind === 'warn' ? 6500 : 3200));
}
export function busy(msg) { const b = $('#busy'); if (msg) { $('#busyTxt').textContent = msg; b.hidden = false; } else b.hidden = true; }

export const readURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
export const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
export const canvasBlob = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob falhou'))), type, q));
