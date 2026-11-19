// Inventário Quallit — tela: patrimonio (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { recarregarMaquina } from '../dados.js';
import { confirmar } from '../dialogos.js';
import { $, $$, TIPO, cdCod, cdNome, cdsAtivos, dataBR, dataHora, ehAdmin, erroMsg, esc, noCD, pill, sb, state, toast, titulo } from '../nucleo.js';
import { rerender } from '../rotas.js';
import { abrirMaquina, modal, opts } from '../telas/maquinas.js';
import { abrirRelatorio } from '../telas/relatorios.js';

/* =====================================================================
   PATRIMÔNIO: baixa e transferência (solicitar → administrador aprova → termo)
   ===================================================================== */
export const MOTIVOS_BAIXA = ['Defeito sem conserto', 'Conserto não compensa', 'Obsoleto', 'Perda ou extravio', 'Furto ou roubo', 'Sinistro (queda, líquido, incêndio)', 'Venda', 'Doação', 'Devolução ao fornecedor/locadora'];
export const DESTINOS_BAIXA = ['Descarte / reciclagem (empresa certificada)', 'Venda', 'Doação', 'Devolvido ao fornecedor/locadora', 'Não se aplica (perda/roubo)'];
export const MOTIVOS_TRANSF = ['Mudança de operação', 'Reposição/troca', 'Remanejamento de equipe', 'Empréstimo entre CDs', 'Outro'];
export const SOL_STATUS = { pendente: ['Aguardando aprovação', 'warn'], aprovada: ['Aprovada', 'ok'], recusada: ['Recusada', 'bad'], cancelada: ['Cancelada', ''] };
export async function carregarSolicitacoes() {
  const { data: d, error } = await sb.from('solicitacoes_patrimonio').select('*').order('solicitado_em', { ascending: false }).limit(500);
  state.solic = error ? [] : d || [];   // banco sem a migração: sem pedidos
  atualizarBadgePatrimonio();
}
export const solicitacaoAberta = (maqId) => (state.solic || []).find((s) => s.maquina_id === maqId && s.status === 'pendente');
export function atualizarBadgePatrimonio() {
  const b = $('#badge-pat'); if (!b) return;
  const n = (state.solic || []).filter((s) => s.status === 'pendente' && noCD({ cd_id: s.cd_origem })).length;
  b.hidden = !n; b.textContent = n;
}
export function modalSolicitacao(m, tipo) {
  const baixa = tipo === 'baixa';
  const destinos = cdsAtivos().filter((c) => c.id !== m.cd_id);
  modal(`
    <div class="modal-head"><h2>${baixa ? 'Solicitar baixa patrimonial' : 'Solicitar transferência de CD'}</h2>
      <p class="muted" style="margin:4px 0 0"><b class="mono">${esc(m.hostname)}</b> · patrimônio ${esc(m.ativo || '—')} · ${esc(TIPO[m.tipo])} ${esc(m.modelo || '')} · ${esc(cdCod(m.cd_id))}</p></div>
    <form class="modal-body" id="sol-form">
      <div class="form-grid">
        ${baixa ? '' : `<label>CD de destino *<select name="cd_destino" required>${opts([['', 'Escolha o CD'], ...destinos.map((c) => [c.id, `${c.codigo} · ${c.nome}`])], '')}</select></label>
          <label>Setor no destino<input name="setor_destino" maxlength="60"></label>
          <label class="full">Responsável no destino<input name="responsavel_destino" maxlength="80" placeholder="Quem vai receber o equipamento"></label>`}
        <label class="full">Motivo *<select name="motivo_categoria" required>${opts([['', 'Escolha o motivo'], ...(baixa ? MOTIVOS_BAIXA : MOTIVOS_TRANSF).map((x) => [x, x])], '')}</select></label>
        <label class="full">Descreva o motivo *<textarea name="motivo" required rows="3" maxlength="1000" placeholder="${baixa ? 'Ex.: placa-mãe queimada após pico de energia; orçamento R$ 1.200 (60% do valor de um novo)' : 'Ex.: abertura do turno da noite no CD02'}"></textarea></label>
        ${baixa ? `<label class="full">Laudo técnico<textarea name="laudo" rows="4" maxlength="3000" placeholder="O que foi testado, peças com defeito, orçamento, nº do chamado/boletim de ocorrência…"></textarea></label>
          <label class="full">Destino do equipamento<select name="destino_final">${opts([['', 'A definir'], ...DESTINOS_BAIXA.map((x) => [x, x])], '')}</select></label>` : ''}
      </div>
      <p class="muted" style="font-size:12.5px;margin:0">${ehAdmin() ? 'Como administrador, você pode aprovar já ao enviar.' : 'O pedido vai para aprovação do administrador. Nada muda na máquina até a aprovação.'}</p>
      ${ehAdmin() ? '<label class="check"><input type="checkbox" name="aprovar_ja"> Aprovar agora</label>' : ''}
    </form>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="sol-ok">Enviar pedido</button></div>`, (dlg) => {
    $('#sol-ok', dlg).onclick = async () => {
      const f = $('#sol-form', dlg);
      if (!f.reportValidity()) return;
      const fd = Object.fromEntries(new FormData(f));
      const row = {
        maquina_id: m.id, tipo, cd_origem: m.cd_id, motivo_categoria: fd.motivo_categoria, motivo: fd.motivo.trim(),
        laudo: (fd.laudo || '').trim() || null, destino_final: fd.destino_final || null,
        cd_destino: fd.cd_destino || null, setor_destino: (fd.setor_destino || '').trim() || null, responsavel_destino: (fd.responsavel_destino || '').trim() || null,
        maquina: { hostname: m.hostname, ativo: m.ativo, tipo: m.tipo, fabricante: m.fabricante, modelo: m.modelo, numero_serie: m.numero_serie, setor: m.setor, localizacao: m.localizacao, responsavel: m.responsavel, status: m.status, data_compra: m.data_compra, valor_compra: m.valor_compra, nota_fiscal: m.nota_fiscal },
      };
      $('#sol-ok', dlg).disabled = true;
      const { data: s, error } = await sb.from('solicitacoes_patrimonio').insert(row).select().single();
      if (error) { $('#sol-ok', dlg).disabled = false; return toast(/solicitacoes_patrimonio|schema cache/.test(error.message) ? 'Aplique as migrações do banco antes (veja o README).' : /solic_uma_pendente/.test(error.message) ? 'Já existe um pedido em aberto para esta máquina.' : erroMsg(error), true); }
      if (fd.aprovar_ja) {
        const r = await sb.rpc('decidir_solicitacao', { p_id: s.id, p_aprovar: true, p_obs: 'Aprovado na solicitação' });
        if (r.error) toast(erroMsg(r.error), true);
      }
      dlg.close();
      await Promise.all([carregarSolicitacoes(), recarregarMaquina(m.id)]);
      toast(fd.aprovar_ja ? (baixa ? 'Baixa aprovada e aplicada' : 'Transferência aprovada e aplicada') : 'Pedido enviado para aprovação');
      abrirMaquina(m.id, true); rerender();
    };
  });
}
export async function renderPatrimonio(aba = 'pendentes') {
  const el = $('#view-patrimonio');
  await carregarSolicitacoes();
  const todas = (state.solic || []).filter((s) => noCD({ cd_id: s.cd_origem }) || (state.cdAtual && s.cd_destino === state.cdAtual));
  const lista = aba === 'pendentes' ? todas.filter((s) => s.status === 'pendente') : todas.filter((s) => s.status !== 'pendente');
  const nome = (e) => esc(String(e || '—').split('@')[0]);
  el.innerHTML = `
    <div class="view-head">${titulo('Patrimônio', '', `Baixas e transferências entre CDs: quem pede informa motivo e laudo, o administrador aprova e o sistema aplica sozinho. Cada pedido tem um <b>termo</b> para imprimir e assinar.`)}</div>
    <div class="tabs tabs--page"><a class="tab ${aba === 'pendentes' ? 'active' : ''}" href="#patrimonio/pendentes">Aguardando aprovação (${todas.filter((s) => s.status === 'pendente').length})</a><a class="tab ${aba === 'historico' ? 'active' : ''}" href="#patrimonio/historico">Histórico</a></div>
    <div class="card">${lista.length ? `<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Equipamento</th><th>Motivo</th><th>Solicitado</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((s) => { const mq = s.maquina || {}; const [stTxt, stCor] = SOL_STATUS[s.status] || [s.status, '']; return `<tr>
        <td>${s.tipo === 'baixa' ? '🗑️ <b>Baixa</b>' : `🚚 <b>Transferência</b><span class="sub">${esc(cdCod(s.cd_origem))} → ${esc(cdCod(s.cd_destino))}</span>`}</td>
        <td><span class="mono">${esc(mq.hostname || '—')}</span><span class="sub">${esc(mq.ativo || 'sem patrimônio')} · ${esc(mq.modelo || '')}</span></td>
        <td>${esc(s.motivo_categoria)}<span class="sub">${esc(s.motivo).slice(0, 120)}</span></td>
        <td>${nome(s.solicitado_por)}<span class="sub">${dataHora(s.solicitado_em)}</span></td>
        <td>${pill(stTxt, stCor)}${s.decidido_por && s.status !== 'pendente' ? `<span class="sub">${nome(s.decidido_por)} · ${dataHora(s.decidido_em)}</span>` : ''}${s.decisao_obs ? `<span class="sub">${esc(s.decisao_obs)}</span>` : ''}</td>
        <td class="acoes-linha">
          <button class="btn btn--sm" data-termo="${s.id}">Termo</button>
          ${s.status === 'pendente' && ehAdmin() ? `<button class="btn btn--sm btn--primary" data-aprovar="${s.id}">Aprovar</button><button class="btn btn--sm btn--danger" data-recusar="${s.id}">Recusar</button>` : ''}
          ${s.status === 'pendente' && (ehAdmin() || s.solicitado_por === state.user?.email) ? `<button class="btn btn--sm btn--ghost" data-cancelar="${s.id}">Cancelar</button>` : ''}
        </td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="card-pad empty"><p class="muted">${aba === 'pendentes' ? 'Nenhum pedido aguardando aprovação.' : 'Nenhum pedido decidido ainda.'} Para pedir, abra a máquina e use <b>Solicitar baixa</b> ou <b>Transferir de CD</b>.</p></div>`}</div>`;
  const achar = (id) => state.solic.find((s) => s.id === id);
  $$('[data-termo]', el).forEach((b) => (b.onclick = () => termoPatrimonio(achar(b.dataset.termo))));
  $$('[data-aprovar]', el).forEach((b) => (b.onclick = () => decidirSolicitacao(achar(b.dataset.aprovar), true)));
  $$('[data-recusar]', el).forEach((b) => (b.onclick = () => decidirSolicitacao(achar(b.dataset.recusar), false)));
  $$('[data-cancelar]', el).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar('Cancelar este pedido?', { ok: 'Cancelar pedido', perigo: true }))) return;
    const { error } = await sb.rpc('cancelar_solicitacao', { p_id: b.dataset.cancelar });
    if (error) return toast(erroMsg(error), true);
    toast('Pedido cancelado'); renderPatrimonio(aba);
  }));
}
export function decidirSolicitacao(s, aprovar) {
  const mq = s.maquina || {};
  modal(`
    <div class="modal-head"><h2>${aprovar ? 'Aprovar' : 'Recusar'} ${s.tipo === 'baixa' ? 'baixa' : 'transferência'}</h2>
      <p class="muted" style="margin:4px 0 0"><b class="mono">${esc(mq.hostname)}</b> · ${esc(mq.ativo || 'sem patrimônio')} · ${esc(s.motivo_categoria)}</p></div>
    <div class="modal-body">
      <p style="margin:0">${aprovar ? (s.tipo === 'baixa' ? 'A máquina passa para <b>Descartado</b> e sai dos inventários e da lista de ativas.' : `A máquina passa para o <b>${esc(cdCod(s.cd_destino))} · ${esc(cdNome(s.cd_destino))}</b>${s.setor_destino ? ', setor ' + esc(s.setor_destino) : ''}.`) : 'O pedido é encerrado e nada muda na máquina.'}</p>
      <label>${aprovar ? 'Observação (opcional)' : 'Motivo da recusa *'}<textarea id="dec-obs" rows="3" maxlength="1000"></textarea></label>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Voltar</button><button class="btn ${aprovar ? 'btn--primary' : 'btn--danger'}" id="dec-ok">${aprovar ? 'Aprovar e aplicar' : 'Recusar pedido'}</button></div>`, (dlg) => {
    $('#dec-ok', dlg).onclick = async () => {
      const obs = $('#dec-obs', dlg).value.trim();
      if (!aprovar && !obs) return toast('Informe o motivo da recusa', true);
      $('#dec-ok', dlg).disabled = true;
      const { error } = await sb.rpc('decidir_solicitacao', { p_id: s.id, p_aprovar: aprovar, p_obs: obs || null });
      if (error) { $('#dec-ok', dlg).disabled = false; return toast(erroMsg(error), true); }
      dlg.close();
      await recarregarMaquina(s.maquina_id);
      toast(aprovar ? 'Aprovado e aplicado. Imprima o termo para as assinaturas.' : 'Pedido recusado');
      renderPatrimonio('pendentes'); rerender();
    };
  });
}
export function termoPatrimonio(s) {
  const mq = s.maquina || {};
  const baixa = s.tipo === 'baixa';
  const linha = (l, v) => `<tr><th style="width:30%">${l}</th><td>${v || '—'}</td></tr>`;
  const assin = (papel, nomeP) => `<div style="flex:1;min-width:200px;text-align:center"><div style="border-top:1px solid #0e1d20;margin-top:48px;padding-top:4px"><b>${esc(papel)}</b><br><span class="muted">${esc(nomeP || 'Nome:')}</span></div><div class="muted" style="margin-top:4px">Data: ____/____/______</div></div>`;
  const [stTxt] = SOL_STATUS[s.status] || [s.status];
  abrirRelatorio(baixa ? 'Termo de baixa patrimonial' : 'Termo de transferência de patrimônio',
    `Pedido nº ${esc(s.id.slice(0, 8).toUpperCase())} · ${esc(stTxt)} · ${dataHora(s.solicitado_em)}`, `
    <h2>Equipamento</h2>
    <table>${linha('Patrimônio', `<b class="mono">${esc(mq.ativo)}</b>`)}${linha('Hostname', `<span class="mono">${esc(mq.hostname)}</span>`)}${linha('Tipo / modelo', esc([TIPO[mq.tipo], mq.fabricante, mq.modelo].filter(Boolean).join(' · ')))}
      ${linha('Nº de série', `<span class="mono">${esc(mq.numero_serie)}</span>`)}${linha('Setor / localização', esc([mq.setor, mq.localizacao].filter(Boolean).join(' · ')))}${linha('Responsável', esc(mq.responsavel))}
      ${mq.data_compra ? linha('Compra', `${dataBR(mq.data_compra)}${mq.nota_fiscal ? ' · NF ' + esc(mq.nota_fiscal) : ''}${mq.valor_compra != null ? ' · R$ ' + String(mq.valor_compra).replace('.', ',') : ''}`) : ''}</table>
    <h2>${baixa ? 'Baixa' : 'Transferência'}</h2>
    <table>${baixa ? '' : linha('De', `${esc(cdCod(s.cd_origem))} · ${esc(cdNome(s.cd_origem))}`) + linha('Para', `<b>${esc(cdCod(s.cd_destino))} · ${esc(cdNome(s.cd_destino))}</b>${s.setor_destino ? ' · setor ' + esc(s.setor_destino) : ''}`) + linha('Responsável no destino', esc(s.responsavel_destino))}
      ${baixa ? linha('CD', `${esc(cdCod(s.cd_origem))} · ${esc(cdNome(s.cd_origem))}`) : ''}
      ${linha('Motivo', `<b>${esc(s.motivo_categoria)}</b><br>${esc(s.motivo)}`)}
      ${baixa ? linha('Laudo técnico', `<div style="white-space:pre-wrap">${esc(s.laudo || 'Não informado')}</div>`) + linha('Destino do equipamento', esc(s.destino_final || 'A definir')) : ''}
      ${linha('Solicitado por', `${esc(s.solicitado_por)} em ${dataHora(s.solicitado_em)}`)}
      ${linha('Decisão', s.status === 'pendente' ? '<span class="tag">aguardando aprovação</span>' : `${esc(stTxt)} por ${esc(s.decidido_por)} em ${dataHora(s.decidido_em)}${s.decisao_obs ? '<br>' + esc(s.decisao_obs) : ''}`)}</table>
    <p style="margin-top:14px">${baixa ? 'Declaramos que o equipamento acima foi avaliado e, pelos motivos descritos, está sendo baixado do patrimônio da empresa, com o destino indicado.'
      : 'Declaramos a transferência do equipamento acima entre os centros de distribuição indicados. O responsável no destino confirma o recebimento em perfeito estado, salvo observações abaixo.'}</p>
    <p class="muted">Observações: ______________________________________________________________________________________</p>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:10px">
      ${assin('Solicitante', String(s.solicitado_por || '').split('@')[0])}
      ${assin('Aprovação (TI / Administrador)', s.decidido_por ? String(s.decidido_por).split('@')[0] : '')}
      ${assin(baixa ? 'Gestor do CD' : 'Recebedor no destino', s.responsavel_destino || '')}
    </div>`);
}
