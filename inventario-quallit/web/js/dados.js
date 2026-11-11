// Inventário Quallit — dados (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { sb, state } from './nucleo.js';
import { ehErroDeRede, idbGet, idbSet } from './offline.js';
import { definirOffline } from './sincronia.js';

/* =====================================================================
   Dados
   ===================================================================== */
export async function carregarMaquinas() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data: d, error } = await sb.from('vw_maquinas').select('*').order('hostname').range(from, from + 999);
    if (error) {
      // sem internet: usa a última cópia salva no aparelho
      if (ehErroDeRede(error)) {
        const cache = await idbGet('maquinas');
        if (cache) { state.maquinas = cache.lista; state.cacheEm = cache.em; definirOffline(true); return; }
      }
      throw error;
    }
    all.push(...d);
    if (d.length < 1000) break;
  }
  state.maquinas = all;
  state.cacheEm = null;
  definirOffline(false);
  idbSet('maquinas', { em: Date.now(), lista: all });
}
export async function carregarHist() {
  const { data: d } = await sb.from('maquinas_historico')
    .select('*, maquinas(hostname, cd_id)').order('criado_em', { ascending: false }).limit(60);
  state.hist = d || [];
}
export async function recarregarMaquina(id) {
  const { data: d } = await sb.from('vw_maquinas').select('*').eq('id', id).maybeSingle();
  const i = state.maquinas.findIndex((m) => m.id === id);
  if (d) { if (i >= 0) state.maquinas[i] = d; else state.maquinas.push(d); }
  else if (i >= 0) state.maquinas.splice(i, 1);
  return d;
}
