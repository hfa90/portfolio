// Salvamento automático no IndexedDB (fica só neste navegador)
//
// Chaves: "session" -> { fileName, pages, docIds, assetIds, zoom, cur, savedAt }
//         "doc:<id>" -> { id, name, bytes }      (gravado uma vez por PDF)
//         "asset:<id>" -> { data, type, w, h }    (gravado uma vez por imagem)
import { S } from './state.js';

const DB = 'hfa-editor-pdf', STORE = 'kv';
let dbP = null, timer = 0, saving = Promise.resolve();
const savedDocs = new Set(), savedAssets = new Set();

function db() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('sem IndexedDB'));
  dbP = dbP || new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => { dbP = null; rej(r.error); };
  });
  return dbP;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE); let out;
    Promise.resolve(fn(st)).then((v) => { out = v; });
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function saveNow() {
  if (!S.pages.length) return;
  const docIds = [...new Set(S.pages.map((p) => p.docId).filter(Boolean))];
  const assetIds = [...new Set(S.pages.flatMap((p) => p.els.map((e) => e.asset)).filter(Boolean))];
  const session = { v: 1, fileName: S.fileName, pages: S.pages, docIds, assetIds, zoom: S.zoom, cur: S.cur, savedAt: Date.now() };
  await tx('readwrite', async (st) => {
    for (const id of docIds) if (!savedDocs.has(id)) { const d = S.docs[id]; st.put({ id, name: d.name, bytes: d.bytes }, 'doc:' + id); savedDocs.add(id); }
    for (const id of assetIds) if (!savedAssets.has(id) && S.assets[id]) { st.put(S.assets[id], 'asset:' + id); savedAssets.add(id); }
    st.put(session, 'session');
    const keys = await req(st.getAllKeys());
    for (const k of keys) {
      if (k.startsWith('doc:') && !docIds.includes(k.slice(4))) { st.delete(k); savedDocs.delete(k.slice(4)); }
      if (k.startsWith('asset:') && !assetIds.includes(k.slice(6))) { st.delete(k); savedAssets.delete(k.slice(6)); }
    }
  });
}
/** Agenda um salvamento (chamado a cada alteração). */
export function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(() => { saving = saving.then(saveNow).catch((e) => console.warn('autosave:', e)); }, 1200);
}
export const flushSave = () => { clearTimeout(timer); saving = saving.then(saveNow).catch((e) => console.warn('autosave:', e)); return saving; };

export async function peekSession() {
  try { return await tx('readonly', (st) => req(st.get('session'))); } catch { return null; }
}
export async function loadSession() {
  const s = await peekSession(); if (!s) return null;
  const data = await tx('readonly', async (st) => {
    const docs = await Promise.all(s.docIds.map((id) => req(st.get('doc:' + id))));
    const assets = await Promise.all(s.assetIds.map((id) => req(st.get('asset:' + id))));
    return { docs, assets };
  });
  s.docIds.forEach((id) => savedDocs.add(id)); s.assetIds.forEach((id) => savedAssets.add(id));
  return { session: s, docs: data.docs.filter(Boolean), assets: Object.fromEntries(s.assetIds.map((id, i) => [id, data.assets[i]]).filter(([, a]) => a)) };
}
export async function clearSession() {
  clearTimeout(timer); savedDocs.clear(); savedAssets.clear();
  try { await saving; await tx('readwrite', (st) => { st.clear(); }); } catch { /* sem IndexedDB */ }
}
