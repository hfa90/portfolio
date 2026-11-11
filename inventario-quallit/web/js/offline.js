// Armazenamento local (IndexedDB) para funcionar sem internet: cache de dados e fila de leituras pendentes.
const DB = 'inventario-quallit';
const STORE = 'kv';
let dbp;

function abrir() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(modo, fn) {
  dbp ||= abrir();
  const db = await dbp;
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, modo).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function idbGet(chave) {
  try { return await tx('readonly', (s) => s.get(chave)); } catch { return undefined; }
}
export async function idbSet(chave, valor) {
  try { await tx('readwrite', (s) => s.put(valor, chave)); } catch { /* sem IndexedDB: segue sem cache */ }
}

// ---- fila de leituras feitas sem internet
export async function filaListar() { return (await idbGet('fila')) || []; }
export async function filaAdicionar(item) {
  const f = await filaListar();
  f.push(item);
  await idbSet('fila', f);
}
export async function filaRemover(localId) {
  const f = await filaListar();
  await idbSet('fila', f.filter((i) => i.id !== localId));
}

// erro de rede (sem internet / servidor inacessível) x erro de verdade
export function ehErroDeRede(e) {
  if (!navigator.onLine) return true;
  const msg = String(e?.message || e || '');
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|timeout/i.test(msg) && !e?.code;
}
