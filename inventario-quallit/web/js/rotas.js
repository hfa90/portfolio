// Inventário Quallit — rotas (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { carregarPosses } from './telas/termos.js';
import { carregarHist, recarregarMaquina } from './dados.js';
import { $, $$, F_PADRAO, acharMaquina, cdCod, cdNome, debounce, ehAdmin, esc, noCD, sb, state, store, toast } from './nucleo.js';
import { atualizarBadge } from './sincronia.js';
import { atualizarSininho } from './telas/avisos.js';
import { renderColeta } from './telas/coleta.js';
import { carregarEmprestimos, renderEmprestimos } from './telas/emprestimos.js';
import { renderEtiquetas } from './telas/etiquetas.js';
import { abrirConferencia, renderAgendados, renderConfDetalhe, renderConferencias } from './telas/inventarios.js';
import { abrirMaquina, opts, renderMaquinas, renderTabela, syncToolbar } from './telas/maquinas.js';
import { desenharPrazosPainel, renderPainel } from './telas/painel.js';
import { renderPatrimonio } from './telas/patrimonio.js';
import { renderRelatorios } from './telas/relatorios.js';
import { renderUsuarios } from './telas/usuarios.js';

/* =====================================================================
   Realtime
   ===================================================================== */
export const rerender = debounce(() => {
  atualizarBadge(); atualizarSininho();
  if (state.view === 'emprestimos') renderEmprestimos(false);
  if (state.view === 'painel') renderPainel();
  if (state.view === 'maquinas') renderTabela();
  if (state.view === 'conferencia' && state.conf) renderConfDetalhe(false);
}, 400);

export function iniciarRealtime() {
  const live = $('.live');
  sb.channel('inventario')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'maquinas' }, async (p) => {
      live.classList.add('flash'); setTimeout(() => live.classList.remove('flash'), 400);
      if (p.eventType === 'DELETE') {
        state.maquinas = state.maquinas.filter((m) => m.id !== p.old.id);
      } else {
        const m = await recarregarMaquina(p.new.id);
        if (p.eventType === 'INSERT' && m) toast(`Nova máquina: ${m.hostname}`);
        state.flash.add(p.new.id);
        setTimeout(() => state.flash.delete(p.new.id), 2000);
        if (state.drawerId === p.new.id && !state.drawerDirty) abrirMaquina(p.new.id, true);
      }
      carregarHist().then(rerender);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimos' }, () => {
      if (state.view === 'emprestimos') carregarEmprestimos().then(rerender);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conferencias' }, (p) => {
      if (!noCD(p.new)) return;
      state.resumoInvEm = 0;
      if (p.new.agendamento_id) toast(`Novo inventário programado: ${p.new.nome}`);
      if (state.view === 'conferencia' && !state.conf && location.hash === '#conferencia') renderConferencias();
      if (state.view === 'painel') desenharPrazosPainel();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conferencia_itens' }, (p) => {
      if (state.conf && p.new.conferencia_id === state.conf.id && !state.confItens.some((i) => i.id === p.new.id)) {
        state.confItens.push(p.new);
        rerender();
      }
    })
    .subscribe((st) => {
      live.classList.toggle('on', st === 'SUBSCRIBED');
      $('#live-txt').textContent = st === 'SUBSCRIBED' ? 'ao vivo' : 'reconectando…';
    });
  // mantém "há X min" e a situação da coleta atualizados
  setInterval(rerender, 60_000);
}

/* =====================================================================
   Navegação
   ===================================================================== */
export function navegar() {
  let [view, ...resto] = (location.hash.slice(1) || 'painel').split('/');
  if (view === 'agente') view = 'coleta';   // endereço antigo (antes da remoção do agente)
  const arg = resto.join('/');
  // QR code da etiqueta: #maquina/<patrimônio ou hostname> abre a ficha
  if (view === 'maquina') {
    const m = acharMaquina(decodeURIComponent(arg));
    history.replaceState(null, '', '#maquinas');
    navegar();
    if (m) abrirMaquina(m.id); else toast(`Máquina "${decodeURIComponent(arg)}" não encontrada no inventário`, true);
    return;
  }
  state.view = ['painel', 'maquinas', 'emprestimos', 'etiquetas', 'conferencia', 'patrimonio', 'coleta', 'relatorios', 'usuarios'].includes(view) ? view : 'painel';
  // Field: menu enxuto (Relatórios e Redes e setores são do administrador)
  if (['usuarios', 'relatorios'].includes(state.view) && !ehAdmin()) { history.replaceState(null, '', '#painel'); state.view = 'painel'; }
  if (state.view !== 'etiquetas') $('#view-etiquetas').innerHTML = ''; // remove o @page das etiquetas
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + state.view));
  window.scrollTo(0, 0);
  if (state.view === 'painel') renderPainel();
  if (state.view === 'maquinas') renderMaquinas();
  if (state.view === 'conferencia') arg === 'agendados' ? renderAgendados() : arg ? abrirConferencia(arg) : renderConferencias();
  if (state.view === 'coleta') renderColeta(arg === 'redes' && ehAdmin() ? 'redes' : 'instalacao');
  if (state.view === 'emprestimos') { state.empAba = arg || 'emprestimos'; Promise.all([carregarEmprestimos(), carregarPosses()]).then(() => renderEmprestimos(true)); }
  if (state.view === 'etiquetas') renderEtiquetas();
  if (state.view === 'relatorios') renderRelatorios(arg || 'parque');
  if (state.view === 'patrimonio') renderPatrimonio(arg || 'pendentes');
  if (state.view === 'usuarios') renderUsuarios(arg || 'usuarios');
}
export function irMaquinas(filtros = {}) {
  state.f = { ...F_PADRAO, ...filtros };
  if (location.hash === '#maquinas') { syncToolbar(); renderTabela(); } else location.hash = '#maquinas';
}

export function renderSidebar() {
  const box = $('#cd-box');
  const admin = ehAdmin();
  $$('[data-admin]').forEach((el) => (el.hidden = !admin));
  $('#user-email').innerHTML = `<strong>${esc(state.perfil?.nome || state.user?.email || '')}</strong><span>${admin ? 'Administrador' : 'Field'}</span>`;
  if (!state.cds.length) { box.hidden = true; return; }
  box.hidden = false;
  if (admin) {
    box.innerHTML = `<label class="cd-label" for="cd-sel">CD</label>
      <select id="cd-sel">${opts([['', `Todos os CDs (${state.cds.length})`], ...state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}${c.ativo ? '' : ' (inativo)'}`])], state.cdAtual)}</select>`;
    $('#cd-sel').onchange = (e) => {
      state.cdAtual = e.target.value;
      store.set('cd-atual', state.cdAtual);
      state.sel.clear();
      state.maqMontada && renderTabela();
      navegar();
    };
  } else {
    box.innerHTML = `<span class="cd-label">CD</span><div class="cd-fixo"><b>${esc(cdCod(state.cdAtual))}</b> ${esc(cdNome(state.cdAtual))}</div>`;
  }
}
