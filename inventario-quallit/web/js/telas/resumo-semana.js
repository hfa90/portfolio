// Inventário Quallit — resumo da semana por CD (texto montado no banco: função resumo_semanal).
// Copiar, mandar no WhatsApp ou abrir pronto no e-mail. O administrador vê sozinho uma vez por semana.
import { $, cdCod, erroMsg, esc, sb, state, store, toast } from '../nucleo.js';
import { copiarTexto, linkWhatsApp } from '../resumo.js';
import { modal, opts } from './maquinas.js';

// segunda-feira da semana atual (AAAA-MM-DD): marca "já vi o resumo desta semana"
const semanaAtual = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export async function modalResumoSemana({ automatico = false } = {}) {
  const { data: lista, error } = await sb.rpc('resumo_semanal', { p_cd: state.cdAtual || null });
  if (error) { if (!automatico) toast(/resumo_semanal/.test(error.message) ? 'Aplique as migrações do banco (supabase db push --remote; veja o README).' : erroMsg(error), true); return; }
  if (!lista?.length) { if (!automatico) toast('Nenhum CD ativo para resumir.', true); return; }
  if (automatico && !lista.some((r) => r.total_itens > 0)) { store.set('resumo-semana-visto', semanaAtual()); return; }
  const ordenada = [...lista].sort((a, b) => b.total_itens - a.total_itens || a.codigo.localeCompare(b.codigo));
  let atual = ordenada[0];
  const todos = () => ordenada.map((r) => r.texto).join('\n\n— — —\n\n');
  modal(`
    <div class="modal-head"><h2>📨 Resumo da semana</h2>
      <p class="muted" style="margin:4px 0 0">O que precisa de atenção em cada CD. Copie para o grupo, mande no WhatsApp ou abra pronto no e-mail.</p></div>
    <div class="modal-body">
      ${ordenada.length > 1 ? `<label>CD<select id="rs-cd">${opts([['_todos', `Todos os CDs (${ordenada.length})`], ...ordenada.map((r) => [r.cd_id, `${r.codigo} · ${r.nome} — ${r.total_itens ? r.total_itens + ' pendência(s)' : 'tudo em ordem'}`])], atual.cd_id)}</select></label>` : ''}
      <textarea id="rs-texto" rows="16" readonly class="mono" style="font-size:12.5px"></textarea>
      <div class="actions">
        <button class="btn btn--primary" id="rs-copiar">📋 Copiar</button>
        <a class="btn" id="rs-wa" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn" id="rs-mail">E-mail</a>
      </div>
      <p class="muted" style="font-size:12.5px;margin:0">Quer receber por e-mail sozinho toda segunda? Veja "Resumo semanal por e-mail" no README.</p>
    </div>
    <div class="modal-foot"><button class="btn btn--primary" data-close>Fechar</button></div>`, (dlg) => {
    const desenhar = () => {
      const sel = $('#rs-cd', dlg)?.value;
      const texto = sel === '_todos' ? todos() : (ordenada.find((r) => r.cd_id === sel) || atual).texto;
      $('#rs-texto', dlg).value = texto;
      $('#rs-wa', dlg).href = linkWhatsApp(texto);
      const assunto = sel === '_todos' ? 'Resumo da semana — todos os CDs' : `Resumo da semana — ${cdCod(sel || atual.cd_id)}`;
      // e-mail: o texto vai sem os * do WhatsApp; clientes de e-mail limitam o tamanho do link
      const corpo = texto.replace(/\*/g, '').slice(0, 1800);
      $('#rs-mail', dlg).href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    };
    $('#rs-cd', dlg)?.addEventListener('change', desenhar);
    $('#rs-copiar', dlg).onclick = async () => { if (await copiarTexto($('#rs-texto', dlg).value, $('#rs-texto', dlg))) toast('Resumo copiado'); };
    desenhar();
    store.set('resumo-semana-visto', semanaAtual());
  });
}

// administrador: mostra sozinho uma vez por semana (a partir de segunda), se houver pendência
export function talvezMostrarResumoSemana() {
  if (store.get('resumo-semana-visto') === semanaAtual()) return;
  setTimeout(() => { if (!$('#modal')?.open) modalResumoSemana({ automatico: true }); }, 1500);
}
