// =========================================================
// MARMITA CONTROL v2 — Fiado: cobrança, recebimentos, mensagens
// =========================================================

function setupFiado() {
  $('buscaCobranca').addEventListener('input', renderCobranca);
  $('ordemCobranca').addEventListener('change', renderCobranca);
  $('formReceber').addEventListener('submit', confirmarRecebimento);
  $('recValor').addEventListener('input', previewRecebimento);
  $('recFormas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-forma]'); if (!b) return;
    recState.forma = b.dataset.forma; renderFormasReceber();
  });
  $('recLista').addEventListener('change', () => {
    const marcados = idsMarcadosReceber();
    const soma = recState.pedidos.filter(p => marcados.includes(p.id)).reduce((s, p) => s + saldoPedido(p), 0);
    $('recValor').value = soma.toFixed(2);
    previewRecebimento();
  });
}

// ---------------------------------------------------------
// Grupos de devedores
// ---------------------------------------------------------
function gruposDevedores(filtro = () => true) {
  const por = {};
  pendentes().filter(filtro).forEach(p => {
    const sp = saldoPedido(p);
    if (sp <= 0.004) return;
    if (!por[p.cliente_id]) por[p.cliente_id] = { cliente: clientePorId(p.cliente_id) || p.clientes, pedidos: [], total: 0, maisAntigo: p.data_pedido, vencido: false, totalVencido: 0 };
    const g = por[p.cliente_id];
    g.pedidos.push(p);
    g.total += sp;
    if (p.data_pedido < g.maisAntigo) g.maisAntigo = p.data_pedido;
    if (isQuinzenaVencida(p)) { g.vencido = true; g.totalVencido += sp; }
  });
  Object.values(por).forEach(g => g.pedidos.sort((a, b) => a.data_pedido.localeCompare(b.data_pedido)));
  return Object.values(por);
}

// tempo médio que o cliente leva para pagar fiado (pedidos já quitados)
function mediaDiasPagamento(clienteId) {
  const pagos = state.pedidos.filter(p => p.cliente_id === clienteId && p.status_pagamento === 'pago' &&
    p.forma_pagamento !== 'imediato' && p.data_pagamento);
  if (!pagos.length) return null;
  return Math.round(pagos.reduce((s, p) => s + Math.max(0, diasEntre(p.data_pedido, p.data_pagamento)), 0) / pagos.length);
}

// ---------------------------------------------------------
// TELA FIADO
// ---------------------------------------------------------
function renderCobranca() {
  const hoje = hojeISO();
  let grupos = gruposDevedores();
  const totalGeral = grupos.reduce((s, g) => s + g.total, 0);

  // faixas de idade do fiado
  const faixas = [['Até 7 dias', 0, 7], ['8 a 15 dias', 8, 15], ['16 a 30 dias', 16, 30], ['Mais de 30 dias', 31, 99999]];
  const porFaixa = faixas.map(() => 0);
  pendentes().forEach(p => {
    const d = diasEntre(p.data_pedido, hoje);
    const i = faixas.findIndex(([, a, b]) => d >= a && d <= b);
    if (i >= 0) porFaixa[i] += saldoPedido(p);
  });
  const recebidoMes = recebimentos().filter(r => r.data.startsWith(hoje.slice(0, 7))).reduce((s, r) => s + r.valor, 0);

  $('fiadoResumo').innerHTML = `
    <div class="fiado-total">
      <span class="kpi-label">Total em aberto</span>
      <span class="fiado-total-valor num">${BRL(totalGeral)}</span>
      <span class="kpi-sub">${plural(grupos.length, 'cliente')} devendo · ${BRL(recebidoMes)} recebidos este mês</span>
    </div>
    <div class="faixas">${faixas.map(([nome], i) => `
      <div class="faixa${i === 3 && porFaixa[i] > 0 ? ' faixa-alerta' : ''}"><span>${nome}</span><strong class="num">${BRL(porFaixa[i])}</strong></div>`).join('')}
    </div>`;

  const busca = normalize($('buscaCobranca').value.trim());
  if (busca) grupos = grupos.filter(g => normalize(`${g.cliente?.nome} ${g.cliente?.apelido || ''} ${g.cliente?.empresa || ''}`).includes(busca));
  const ordem = $('ordemCobranca').value;
  grupos.sort((a, b) => ordem === 'valor' ? b.total - a.total
    : ordem === 'nome' ? (a.cliente?.nome || '').localeCompare(b.cliente?.nome || '')
      : (b.vencido - a.vencido) || a.maisAntigo.localeCompare(b.maisAntigo));

  const banner = $('cobrancaAtrasoBanner');
  const vencidos = grupos.filter(g => g.vencido);
  if (state.quinzenaConfig.ativa && vencidos.length) {
    banner.classList.remove('hidden');
    banner.innerHTML = `<strong>${plural(vencidos.length, 'cliente')}</strong> ainda ${vencidos.length === 1 ? 'deve' : 'devem'} da quinzena anterior: <strong>${BRL(vencidos.reduce((s, g) => s + g.totalVencido, 0))}</strong> atrasado.`;
  } else banner.classList.add('hidden');

  $('listaCobranca').innerHTML = grupos.map(g => {
    const c = g.cliente || {};
    const dias = diasEntre(g.maisAntigo, hoje);
    const limite = num(c.limite_fiado);
    const media = mediaDiasPagamento(c.id);
    const pctLimite = limite > 0 ? Math.min(100, g.total / limite * 100) : 0;
    return `
    <article class="fiado-card${g.vencido ? ' is-late' : ''}${dias > 30 ? ' is-old' : ''}">
      <div class="fiado-head">
        <span class="avatar">${esc(iniciais(c.nome))}</span>
        <button class="fiado-nome" data-ficha="${esc(c.id)}">
          <strong>${esc(c.nome || '—')}</strong>
          <small>${plural(g.pedidos.length, 'pedido')} desde ${fmtData(g.maisAntigo)} · ${plural(dias, 'dia')}${media !== null ? ` · costuma pagar em ${media} dias` : ''}</small>
        </button>
        <span class="fiado-valor num">${BRL(g.total)}</span>
      </div>
      ${limite > 0 ? `<div class="limite"><div class="limite-bar"><div style="width:${pctLimite}%"></div></div><small>${pctLimite >= 100 ? 'Passou do limite' : 'Limite'} de ${BRL(limite)}</small></div>` : ''}
      ${g.vencido ? `<div class="tag tag-due">Quinzena vencida: ${BRL(g.totalVencido)}</div>` : ''}
      <details class="fiado-pedidos">
        <summary>Ver pedidos em aberto</summary>
        <div class="mini-list">${g.pedidos.map(p => `
          <div class="mini-row"><span>${fmtData(p.data_pedido)} ${diaSemanaCurto(p.data_pedido)}</span>
            <span class="mini-itens">${(p.itens_pedido || []).map(it => `${num(it.quantidade)}× ${esc(it.produtos?.nome || '')}`).join(', ')}</span>
            <span class="num">${num(p.valor_pago) > 0 ? `<s>${BRL(p.valor_total)}</s> ` : ''}${BRL(saldoPedido(p))}</span></div>`).join('')}
        </div>
      </details>
      <div class="fiado-actions">
        ${c.whatsapp ? `<button class="btn btn-whats btn-sm" data-cobrar="${esc(c.id)}">Cobrar no WhatsApp</button>` : '<span class="hint">Sem WhatsApp</span>'}
        <button class="btn btn-primary btn-sm" data-receber-cliente="${esc(c.id)}">Receber</button>
      </div>
    </article>`;
  }).join('') || emptyMsg(busca ? 'Nenhum devedor com esse nome' : 'Ninguém devendo. Tudo em dia!');

  $('listaCobranca').querySelectorAll('[data-cobrar]').forEach(b => b.onclick = () => cobrarWhatsapp(b.dataset.cobrar));
  $('listaCobranca').querySelectorAll('[data-receber-cliente]').forEach(b => b.onclick = () => abrirReceber(b.dataset.receberCliente));

  renderPeriodoCards();
  renderRecebimentosRecentes();
}

// ---------------------------------------------------------
// Mensagens de WhatsApp
// ---------------------------------------------------------
function rodapePix() {
  return state.cfg.pix ? `\n\nPix: *${state.cfg.pix}*` : '';
}
function cobrarWhatsapp(clienteId, pedidosEspecificos) {
  const c = clientePorId(clienteId);
  if (!c?.whatsapp) return toast('Este cliente não tem WhatsApp cadastrado', true);
  const lista = (pedidosEspecificos || pendentes().filter(p => p.cliente_id === clienteId))
    .filter(p => saldoPedido(p) > 0).sort((a, b) => a.data_pedido.localeCompare(b.data_pedido));
  if (!lista.length) return toast('Este cliente não deve nada', true);
  const total = lista.reduce((s, p) => s + saldoPedido(p), 0);
  const linhas = lista.map(p => {
    const itens = (p.itens_pedido || []).map(it => `${num(it.quantidade)}x ${it.produtos?.nome || ''}`).join(', ');
    const parcial = num(p.valor_pago) > 0 ? ` (já pagou ${BRL(p.valor_pago)})` : '';
    return `• ${fmtDataCurta(p.data_pedido)} — ${itens} — ${BRL(saldoPedido(p))}${parcial}`;
  }).join('\n');
  const vencido = lista.some(isQuinzenaVencida);
  const intro = vencido
    ? `Oi, ${primeiroNome(c)}! Tudo bem? Seu fiado da quinzena passada ainda está em aberto:`
    : `Oi, ${primeiroNome(c)}! Tudo bem? Segue sua conta em aberto${state.cfg.nome ? ' na ' + state.cfg.nome : ''}:`;
  abrirLinkWhats(c.whatsapp, `${intro}\n\n${linhas}\n\n*Total: ${BRL(total)}*${rodapePix()}\n\nObrigado! 🙏`);
}

// extrato completo de um período (ficha do cliente)
function extratoWhatsapp(clienteId, de, ate) {
  const c = clientePorId(clienteId);
  if (!c?.whatsapp) return toast('Este cliente não tem WhatsApp cadastrado', true);
  const lista = state.pedidos.filter(p => p.cliente_id === clienteId && p.data_pedido >= de && p.data_pedido <= ate)
    .sort((a, b) => a.data_pedido.localeCompare(b.data_pedido));
  if (!lista.length) return toast('Nenhum pedido nesse período', true);
  const total = lista.reduce((s, p) => s + num(p.valor_total), 0);
  const aberto = lista.reduce((s, p) => s + saldoPedido(p), 0);
  const linhas = lista.map(p => {
    const itens = (p.itens_pedido || []).map(it => `${num(it.quantidade)}x ${it.produtos?.nome || ''}`).join(', ');
    return `${p.status_pagamento === 'pago' ? '✅' : '⏳'} ${fmtDataCurta(p.data_pedido)} — ${itens} — ${BRL(p.valor_total)}`;
  }).join('\n');
  const msg = `Oi, ${primeiroNome(c)}! Seu extrato de ${fmtData(de)} a ${fmtData(ate)}:\n\n${linhas}\n\nTotal comprado: ${BRL(total)}\n` +
    (aberto > 0 ? `*Em aberto: ${BRL(aberto)}*${rodapePix()}` : 'Tudo pago ✅') + '\n\nObrigado pela preferência! 🍱';
  abrirLinkWhats(c.whatsapp, msg);
}

// ---------------------------------------------------------
// RECEBER PAGAMENTO (total ou parcial)
// ---------------------------------------------------------
const recState = { clienteId: null, pedidos: [], forma: 'pix' };

function abrirReceber(clienteId, pedidoIds) {
  const c = clientePorId(clienteId);
  const abertos = pendentes().filter(p => p.cliente_id === clienteId && saldoPedido(p) > 0.004)
    .sort((a, b) => a.data_pedido.localeCompare(b.data_pedido) || (a.created_at || '').localeCompare(b.created_at || ''));
  if (!abertos.length) return toast('Nada em aberto para este cliente', true);
  recState.clienteId = clienteId;
  recState.pedidos = abertos;
  recState.forma = 'pix';
  const marcados = new Set(pedidoIds || abertos.map(p => p.id));

  $('recClienteNome').textContent = c?.nome || '—';
  $('recResumo').textContent = `${plural(abertos.length, 'pedido')} em aberto, total de ${BRL(abertos.reduce((s, p) => s + saldoPedido(p), 0))}. Marque o que está sendo pago.`;
  $('recLista').innerHTML = abertos.map(p => `
    <label class="rec-row">
      <input type="checkbox" value="${p.id}" ${marcados.has(p.id) ? 'checked' : ''}>
      <span class="rec-data">${fmtData(p.data_pedido)}</span>
      <span class="rec-itens">${(p.itens_pedido || []).map(it => `${num(it.quantidade)}× ${esc(it.produtos?.nome || '')}`).join(', ')}</span>
      <span class="num">${BRL(saldoPedido(p))}</span>
    </label>`).join('');
  $('recValor').value = abertos.filter(p => marcados.has(p.id)).reduce((s, p) => s + saldoPedido(p), 0).toFixed(2);
  $('recData').value = hojeISO();
  $('recObs').value = '';
  renderFormasReceber();
  previewRecebimento();
  openSheet('receberOverlay');
}

function renderFormasReceber() {
  $('recFormas').innerHTML = FORMAS_REC.map(f =>
    `<button type="button" class="chip${f.id === recState.forma ? ' active' : ''}" data-forma="${f.id}">${f.nome}</button>`).join('');
}
function idsMarcadosReceber() {
  return [...$('recLista').querySelectorAll('input:checked')].map(i => i.value);
}

// Distribui o valor nos pedidos marcados, do mais antigo para o mais novo
function planoRecebimento(valor) {
  const marcados = idsMarcadosReceber();
  let resta = Math.round(valor * 100) / 100;
  const quita = [], abate = [];
  for (const p of recState.pedidos.filter(x => marcados.includes(x.id))) {
    if (resta <= 0.004) break;
    const devido = saldoPedido(p);
    if (resta >= devido - 0.004) { quita.push({ p, valor: devido }); resta -= devido; }
    else { abate.push({ p, valor: resta }); resta = 0; }
  }
  const totalMarcado = recState.pedidos.filter(x => marcados.includes(x.id)).reduce((s, p) => s + saldoPedido(p), 0);
  return { quita, abate, sobra: Math.max(0, resta), totalMarcado };
}

function previewRecebimento() {
  const valor = num($('recValor').value);
  const box = $('recPreview');
  const btn = $('recSalvar');
  if (!idsMarcadosReceber().length) { box.innerHTML = 'Marque pelo menos um pedido.'; btn.disabled = true; return; }
  if (valor <= 0) { box.innerHTML = 'Digite o valor recebido.'; btn.disabled = true; return; }
  const { quita, abate, sobra, totalMarcado } = planoRecebimento(valor);
  btn.disabled = false;
  const partes = [];
  if (quita.length) partes.push(`Quita ${plural(quita.length, 'pedido')}`);
  if (abate.length) {
    if (!state.rec.pedidosExtra) {
      box.innerHTML = `Para receber só uma parte (${BRL(valor)} de ${BRL(totalMarcado)}), rode o <code>melhorias-v2.sql</code> no Supabase. Por enquanto, desmarque pedidos até o total bater com o valor.`;
      btn.disabled = true; return;
    }
    partes.push(`abate ${BRL(abate[0].valor)} do pedido de ${fmtData(abate[0].p.data_pedido)} (faltarão ${BRL(saldoPedido(abate[0].p) - abate[0].valor)})`);
  }
  if (sobra > 0.004) {
    box.innerHTML = `O valor passa ${BRL(sobra)} do total marcado (${BRL(totalMarcado)}). Marque mais pedidos ou diminua o valor.`;
    btn.disabled = true; return;
  }
  const saldoDepois = recState.pedidos.reduce((s, p) => s + saldoPedido(p), 0) - valor;
  box.innerHTML = `${partes.join(' e ')}. Depois disso o cliente fica devendo <strong>${BRL(Math.max(0, saldoDepois))}</strong>.`;
}

async function confirmarRecebimento(e) {
  e.preventDefault();
  const valor = Math.round(num($('recValor').value) * 100) / 100;
  const data = $('recData').value || hojeISO();
  const obs = $('recObs').value.trim() || null;
  const { quita, abate, sobra } = planoRecebimento(valor);
  if (sobra > 0.004 || valor <= 0) return;
  if (abate.length && !state.rec.pedidosExtra) return;

  const btn = $('recSalvar');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    // 1) pedidos quitados
    if (quita.length) {
      const upd = { status_pagamento: 'pago', data_pagamento: data };
      if (state.rec.pedidosExtra) upd.forma_recebimento = recState.forma;
      // valor_pago precisa ser por pedido; sem a coluna, um update só resolve
      if (state.rec.pedidosExtra) {
        for (const { p } of quita) {
          const { error } = await supabaseClient.from('pedidos').update({ ...upd, valor_pago: num(p.valor_total) }).eq('id', p.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabaseClient.from('pedidos').update(upd).in('id', quita.map(q => q.p.id));
        if (error) throw error;
      }
    }
    // 2) abatimento parcial
    for (const { p, valor: v } of abate) {
      const { error } = await supabaseClient.from('pedidos').update({ valor_pago: Math.round((num(p.valor_pago) + v) * 100) / 100 }).eq('id', p.id);
      if (error) throw error;
    }
    // 3) histórico do recebimento
    if (state.rec.pagamentos) {
      const { error } = await supabaseClient.from('pagamentos').insert({
        cliente_id: recState.clienteId, valor, data_pagamento: data, forma: recState.forma, observacoes: obs,
        pedidos_ids: [...quita, ...abate].map(x => x.p.id),
      });
      if (error) throw error;
    }
    toast(abate.length ? `Recebido ${BRL(valor)} (parcial) ✓` : `Recebido ${BRL(valor)} ✓`);
    closeSheet('receberOverlay');
    await recarregarPedidos();
  } catch (err) {
    console.error(err);
    toast('Erro ao registrar: ' + (err?.message || 'tente de novo'), true);
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar recebimento';
  }
}

// ---------------------------------------------------------
// Recebimentos (dinheiro que entrou)
// Junta a tabela "pagamentos" com os pedidos antigos que foram
// marcados como pagos antes dela existir (ou pagos na hora).
// ---------------------------------------------------------
function recebimentos() {
  const ligados = new Set();
  const out = [];
  state.pagamentos.forEach(pg => {
    (pg.pedidos_ids || []).forEach(id => ligados.add(id));
    out.push({ data: pg.data_pagamento, valor: num(pg.valor), forma: pg.forma, clienteId: pg.cliente_id, origem: 'pagamento', pedidos: (pg.pedidos_ids || []).length, obs: pg.observacoes });
  });
  state.pedidos.forEach(p => {
    if (p.status_pagamento !== 'pago' || !p.data_pagamento || ligados.has(p.id)) return;
    out.push({ data: p.data_pagamento, valor: num(p.valor_total), forma: p.forma_recebimento || null, clienteId: p.cliente_id, origem: p.forma_pagamento === 'imediato' ? 'na_hora' : 'pedido', pedidos: 1 });
  });
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

// agrupa por cliente+dia para ficar legível
function recebimentosAgrupados(filtroCliente) {
  const grupos = {};
  recebimentos().filter(r => r.origem !== 'na_hora' && (!filtroCliente || r.clienteId === filtroCliente)).forEach(r => {
    const k = `${r.data}|${r.clienteId}`;
    if (!grupos[k]) grupos[k] = { data: r.data, clienteId: r.clienteId, valor: 0, pedidos: 0, formas: new Set(), obs: [] };
    grupos[k].valor += r.valor; grupos[k].pedidos += r.pedidos;
    if (r.forma) grupos[k].formas.add(formaRecNome(r.forma));
    if (r.obs) grupos[k].obs.push(r.obs);
  });
  return Object.values(grupos).sort((a, b) => b.data.localeCompare(a.data));
}

function renderRecebimentosRecentes() {
  const lista = recebimentosAgrupados().slice(0, 12);
  $('listaRecebimentos').innerHTML = lista.map(g => {
    const c = clientePorId(g.clienteId);
    return `<div class="row-item">
      <span class="avatar avatar-ok">${esc(iniciais(c?.nome))}</span>
      <button class="row-main" data-ficha="${esc(g.clienteId)}"><span class="row-title">${esc(c?.nome || '—')}</span>
        <span class="row-sub">${fmtData(g.data)} · ${plural(g.pedidos, 'pedido')}${g.formas.size ? ' · ' + [...g.formas].join(', ') : ''}${g.obs.length ? ' · ' + esc(g.obs.join('; ')) : ''}</span></button>
      <span class="row-value num ok">+ ${BRL(g.valor)}</span></div>`;
  }).join('') || emptyMsg('Nenhum recebimento de fiado ainda');
}

// ---------------------------------------------------------
// DEVEDORES POR PERÍODO
// ---------------------------------------------------------
function filtroPeriodoDevedores(tipo, ref) {
  if (tipo === 'dia') return (p) => p.data_pedido === ref;
  if (tipo === 'semana') { const [i, f] = ref.split('_'); return (p) => p.data_pedido >= i && p.data_pedido <= f; }
  if (tipo === 'mes') return (p) => p.data_pedido.startsWith(ref);
  if (tipo === 'quinzena_atrasada') return isQuinzenaVencida;
  return () => true;
}

function renderPeriodoCards() {
  const hoje = hojeISO();
  const hd = dateFromISO(hoje);
  const dias = [], semanas = [], meses = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDias(hoje, -i);
    dias.push({ tipo: 'dia', ref: iso, label: i === 0 ? 'Hoje' : i === 1 ? 'Ontem' : fmtDataCurta(iso), sub: diaSemanaCurto(iso) });
  }
  for (let i = 0; i < 4; i++) {
    const { inicio, fim } = semanaRange(hd, i);
    semanas.push({ tipo: 'semana', ref: `${inicio}_${fim}`, label: i === 0 ? 'Esta semana' : `${fmtDataCurta(inicio)}–${fmtDataCurta(fim)}`, sub: '' });
  }
  for (let i = 0; i < 6; i++) {
    const d = new Date(hd.getFullYear(), hd.getMonth() - i, 1);
    meses.push({ tipo: 'mes', ref: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: i === 0 ? 'Este mês' : mesNome(d), sub: d.getFullYear() !== hd.getFullYear() ? String(d.getFullYear()) : '' });
  }
  const card = (it) => {
    const gs = gruposDevedores(filtroPeriodoDevedores(it.tipo, it.ref));
    const total = gs.reduce((s, g) => s + g.total, 0);
    const lbl = `${it.label}${it.sub ? ' · ' + it.sub : ''}`;
    return `<button type="button" class="periodo-card${gs.length ? '' : ' is-ok'}" data-ptipo="${it.tipo}" data-pref="${it.ref}" data-plabel="${esc(lbl)}">
      <span class="periodo-card-label">${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}
      <span class="periodo-card-valor num">${gs.length ? BRL(total) : '—'}</span>
      <small>${gs.length ? plural(gs.length, 'devendo', 'devendo') : 'tudo pago'}</small></button>`;
  };
  $('periodoCardsDias').innerHTML = dias.map(card).join('');
  $('periodoCardsSemanas').innerHTML = semanas.map(card).join('');
  $('periodoCardsMeses').innerHTML = meses.map(card).join('');

  const wrap = $('quinzenaAtrasadaWrap');
  if (state.quinzenaConfig.ativa) {
    const gs = gruposDevedores(isQuinzenaVencida);
    wrap.classList.remove('hidden');
    wrap.innerHTML = gs.length ? `<button type="button" class="periodo-card periodo-card-alert" data-ptipo="quinzena_atrasada" data-pref="" data-plabel="Quinzena anterior (atrasado)">
        <span class="periodo-card-label">Devendo da quinzena anterior</span>
        <span class="periodo-card-valor num">${BRL(gs.reduce((s, g) => s + g.totalVencido, 0))}</span>
        <small>${plural(gs.length, 'cliente')} — toque para ver</small></button>` : '<div class="empty">Ninguém atrasado da quinzena anterior</div>';
  } else { wrap.classList.add('hidden'); wrap.innerHTML = ''; }

  document.querySelectorAll('#view-cobranca [data-ptipo]').forEach(b => {
    b.onclick = () => abrirDevedoresPopup(b.dataset.ptipo, b.dataset.pref, b.dataset.plabel);
  });
}

function abrirDevedoresPopup(tipo, ref, label) {
  const filtro = filtroPeriodoDevedores(tipo, ref);
  const gs = gruposDevedores(filtro).sort((a, b) => b.total - a.total);
  const total = gs.reduce((s, g) => s + g.total, 0);
  $('devedoresTitulo').textContent = label || 'Devedores';
  $('devedoresResumo').textContent = gs.length ? `${plural(gs.length, 'cliente')} devendo · total ${BRL(total)}` : 'Ninguém devendo neste período.';
  $('devedoresLista').innerHTML = gs.map(g => `
    <div class="row-item">
      <span class="avatar">${esc(iniciais(g.cliente?.nome))}</span>
      <div class="row-main"><span class="row-title">${esc(g.cliente?.nome || '—')}${g.vencido ? ' <span class="tag tag-due">vencido</span>' : ''}</span>
        <span class="row-sub">${plural(g.pedidos.length, 'pedido')}${g.cliente?.whatsapp ? '' : ' · sem WhatsApp'}</span></div>
      <span class="row-value num due">${BRL(g.total)}</span>
      ${g.cliente?.whatsapp ? `<button class="btn btn-whats btn-sm" data-dev-whats="${esc(g.cliente.id)}">Cobrar</button>` : ''}
    </div>`).join('') || emptyMsg('Ninguém devendo neste período');
  $('devedoresLista').querySelectorAll('[data-dev-whats]').forEach(b => b.onclick = () => {
    const g = gs.find(x => x.cliente?.id === b.dataset.devWhats);
    if (g) cobrarWhatsapp(g.cliente.id, g.pedidos);
  });
  openSheet('devedoresOverlay');
}
