// Histórico de desfazer/refazer com compartilhamento por página.
// Cada instantâneo guarda o JSON de cada página; páginas que não mudaram
// reutilizam a mesma string do instantâneo anterior, então 300 passos num
// documento de 500 páginas não multiplicam a memória por 300.
import { S } from './state.js';

const MAX = 300;
const H = { stack: [], i: -1 };
let hooks = { commit() {}, restore() {} };
export const setHistoryHooks = (h) => { hooks = { ...hooks, ...h }; };

export function resetHistory() { H.stack = []; H.i = -1; }
export const canUndo = () => H.i > 0;
export const canRedo = () => H.i < H.stack.length - 1;

/** Grava o estado atual. Retorna { changed: [ids], structural } ou null se nada mudou. */
export function commit({ silent = false } = {}) {
  const prev = H.stack[H.i];
  const prevMap = new Map();
  if (prev) prev.ids.forEach((id, k) => prevMap.set(id, prev.strs[k]));
  const ids = [], strs = [], changed = [];
  for (const p of S.pages) {
    let s = JSON.stringify(p);
    const o = prevMap.get(p.id);
    if (o === s) s = o; else changed.push(p.id);
    ids.push(p.id); strs.push(s);
  }
  const structural = !prev || prev.ids.length !== ids.length || prev.ids.some((x, k) => x !== ids[k]);
  if (!structural && !changed.length) return null;
  H.stack = H.stack.slice(0, H.i + 1); H.stack.push({ ids, strs });
  if (H.stack.length > MAX) H.stack.shift();
  H.i = H.stack.length - 1;
  const info = { changed, structural };
  if (!silent) { S.dirty = true; hooks.commit(info); }
  return info;
}
let t = 0;
export const commitSoon = () => { clearTimeout(t); t = setTimeout(() => commit(), 400); };
export const flushSoon = () => { if (t) { clearTimeout(t); t = 0; commit(); } };

function restore(from) {
  const snap = H.stack[H.i];
  const old = new Map(from.ids.map((id, k) => [id, from.strs[k]]));
  const changed = snap.ids.filter((id, k) => old.get(id) !== snap.strs[k]);
  const structural = from.ids.length !== snap.ids.length || from.ids.some((x, k) => x !== snap.ids[k]);
  S.pages = snap.strs.map((s) => JSON.parse(s));
  S.dirty = true;
  hooks.restore({ changed, structural });
}
export function undo() { flushSoon(); if (H.i > 0) { const f = H.stack[H.i]; H.i--; restore(f); } }
export function redo() { if (H.i < H.stack.length - 1) { const f = H.stack[H.i]; H.i++; restore(f); } }
