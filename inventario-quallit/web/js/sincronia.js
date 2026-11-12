// Inventário Quallit — sincronia (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { carregarHist, carregarMaquinas } from './dados.js';
import { $, MQ, dataHora, erroMsg, sb, state, toast } from './nucleo.js';
import { ehErroDeRede, filaListar, filaRemover } from './offline.js';
import { rerender } from './rotas.js';

/* =====================================================================
   OFFLINE — fila de leituras e sincronização
   ===================================================================== */
export function definirOffline(v) {
  state.offline = v;
  atualizarBanner();
}
export async function atualizarPendentes() {
  state.pendentes = (await filaListar()).length;
  atualizarBanner();
}
export function atualizarBanner() {
  const b = $('#net-banner');
  if (!b) return;
  const off = state.offline || !navigator.onLine;
  if (!off && !state.pendentes) { b.hidden = true; return; }
  b.hidden = false;
  b.className = 'net-banner ' + (off ? 'off' : 'sync');
  b.innerHTML = off
    ? `<span><strong>📴 Sem internet.</strong> A conferência continua funcionando: as leituras ficam salvas no aparelho${state.pendentes ? ` (<b>${state.pendentes}</b> aguardando envio)` : ''}.${state.cacheEm ? ` Lista de máquinas de ${dataHora(state.cacheEm)}.` : ''}</span>`
    : `<span><strong>Internet de volta.</strong> ${state.pendentes} leitura(s) aguardando envio.</span><button class="btn btn--sm" id="btn-sync">Enviar agora</button>`;
  $('#btn-sync')?.addEventListener('click', sincronizar);
}
export let sincronizando = false;
export async function sincronizar() {
  if (sincronizando || !navigator.onLine) return;
  const fila = await filaListar();
  if (!fila.length) { if (state.offline) tentarReconectar(); return; }
  sincronizando = true;
  let enviados = 0;
  try {
    for (const it of fila) {
      const { id, pendente, ...dados } = it;
      const { data: srv, error } = await sb.from('conferencia_itens').insert(dados).select().single();
      if (error && error.code !== '23505') {
        if (!ehErroDeRede(error)) toast('Não foi possível enviar leituras pendentes: ' + erroMsg(error), true);
        break;
      }
      await filaRemover(id); // enviado (ou já lido por outra pessoa)
      enviados++;
      if (state.conf?.id === it.conferencia_id) {
        state.confItens = state.confItens.filter((x) => x.id !== id);
        if (srv && !state.confItens.some((x) => x.id === srv.id)) state.confItens.push(srv);
      }
    }
  } finally { sincronizando = false; }
  await atualizarPendentes();
  if (enviados) { toast(`${enviados} leitura(s) offline enviada(s)`); tentarReconectar(); rerender(); }
}
export async function tentarReconectar() {
  try {
    await carregarMaquinas();
    if (!state.offline) { await carregarHist(); rerender(); }
  } catch { /* continua offline */ }
}
window.addEventListener('online', () => { sincronizar(); tentarReconectar(); });
window.addEventListener('offline', () => definirOffline(true));

export function atualizarBadge() {
  const n = MQ().filter((m) => (m.alertas || []).includes('emprestimo_atrasado')).length;
  const b = $('#badge-emp');
  if (!b) return;
  b.hidden = !n; b.textContent = n;
}
