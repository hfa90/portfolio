// Resumo do inventário para colar no grupo (WhatsApp/Teams) — usado pelo painel e pelo app do celular.
// O inventário só pode ser finalizado depois que o resumo é copiado ou compartilhado: ele fica
// gravado junto com o inventário (coluna resumo) e o administrador vê quem finalizou.

const dataHoraBR = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const nomeCurto = (email) => String(email || '').split('@')[0];

// d: { nome, cd, setor, por, quando, esperadas, encontradas, faltando: [{ ativo, hostname }],
//      desconhecidas: [codigo], fora: n, leitores: [email], prazo: { noPrazo, txt } | null }
export function montarResumo(d) {
  const pct = d.esperadas ? Math.min(100, Math.round((100 * d.encontradas) / d.esperadas)) : 0;
  const ok = !d.faltando.length && !d.desconhecidas.length;
  const L = [];
  L.push(`📋 *INVENTÁRIO FINALIZADO* ${ok ? '✅' : '⚠️'}`);
  L.push(`*${d.nome}*`);
  L.push(`🏢 ${d.cd}${d.setor ? ' · Setor: ' + d.setor : ' · Todos os setores'}`);
  L.push(`👤 Finalizado por: ${nomeCurto(d.por)} · ${dataHoraBR(d.quando || Date.now())}`);
  const leitores = [...new Set((d.leitores || []).filter(Boolean).map(nomeCurto))];
  if (leitores.length) L.push(`🔎 Bipado por: ${leitores.join(', ')}`);
  if (d.prazo) L.push(d.prazo.noPrazo ? `🏁 No prazo (${d.prazo.txt})` : `🐢 Com atraso (${d.prazo.txt})`);
  L.push('');
  L.push(`✅ Encontradas: *${d.encontradas} de ${d.esperadas}* (${pct}%)`);
  L.push(`❌ Faltando: *${d.faltando.length}*`);
  d.faltando.slice(0, 25).forEach((m) => L.push(`   • ${m.ativo || 'sem patrimônio'}${m.hostname ? ' — ' + m.hostname : ''}`));
  if (d.faltando.length > 25) L.push(`   • … e mais ${d.faltando.length - 25}`);
  L.push(`❓ Não cadastradas: *${d.desconhecidas.length}*${d.desconhecidas.length ? ' (' + d.desconhecidas.slice(0, 10).join(', ') + (d.desconhecidas.length > 10 ? '…' : '') + ')' : ''}`);
  if (d.fora) L.push(`↪️ De outro setor/CD: *${d.fora}*`);
  return L.join('\n');
}

// copia o texto; devolve true se conseguiu (navegadores antigos: seleciona o texto para Ctrl+C)
export async function copiarTexto(texto, campo) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* sem permissão */ }
  if (campo) { campo.focus(); campo.select(); try { return document.execCommand('copy'); } catch { return false; } }
  return false;
}
export const linkWhatsApp = (texto) => 'https://wa.me/?text=' + encodeURIComponent(texto);
