// =========================================================
// MARMITA CONTROL v2 — Financeiro e despesas
// =========================================================

function setupFinanceiro() {
  $('finPeriodo').addEventListener('change', () => {
    $('finCustomWrap').classList.toggle('hidden', $('finPeriodo').value !== 'custom');
    if ($('finPeriodo').value === 'custom' && !$('finDe').value) {
      $('finDe').value = hojeISO().slice(0, 7) + '-01'; $('finAte').value = hojeISO();
    }
    renderFinanceiro();
  });
  $('finDe').addEventListener('change', renderFinanceiro);
  $('finAte').addEventListener('change', renderFinanceiro);
  $('btnExportarCSV').addEventListener('click', exportarPedidosCSV);
  $('btnNovaDespesa').addEventListener('click', abrirFormDespesa);
  $('formDespesa').addEventListener('submit', salvarDespesa);
}

// devolve {de, ate, label} do período escolhido e o período anterior de mesmo tamanho
function periodoFinanceiro() {
  const hoje = hojeISO();
  const v = $('finPeriodo').value;
  const primeiro = state.pedidos.length ? state.pedidos[state.pedidos.length - 1].data_pedido : hoje;
  let de, ate = hoje, label;
  if (v === 'hoje') { de = hoje; label = 'Hoje'; }
  else if (v === '7d') { de = addDias(hoje, -6); label = 'Últimos 7 dias'; }
  else if (v === 'mes') { de = hoje.slice(0, 7) + '-01'; label = MESES[Number(hoje.slice(5, 7)) - 1]; }
  else if (v === 'mes_passado') {
    const d = dateFromISO(hoje.slice(0, 7) + '-01'); d.setMonth(d.getMonth() - 1);
    de = isoFromDate(d); ate = addDias(hoje.slice(0, 7) + '-01', -1); label = MESES[d.getMonth()];
  } else if (v === '90d') { de = addDias(hoje, -89); label = 'Últimos 3 meses'; }
  else if (v === 'ano') { de = hoje.slice(0, 4) + '-01-01'; label = hoje.slice(0, 4); }
  else if (v === 'custom') { de = $('finDe').value || primeiro; ate = $('finAte').value || hoje; label = 'Período escolhido'; }
  else { de = primeiro; label = 'Desde o início'; }
  if (de > ate) [de, ate] = [ate, de];
  const dur = diasEntre(de, ate) + 1;
  let ant = null;
  if (v === 'mes') { // compara com o mesmo pedaço do mês anterior
    const d = dateFromISO(de); d.setMonth(d.getMonth() - 1);
    ant = { de: isoFromDate(d), ate: addDias(isoFromDate(d), dur - 1) };
  } else if (v !== 'tudo') ant = { de: addDias(de, -dur), ate: addDias(de, -1) };
  return { de, ate, label, ant, dur };
}

function resumoPeriodo(de, ate) {
  const peds = state.pedidos.filter(p => p.data_pedido >= de && p.data_pedido <= ate);
  const vendas = peds.reduce((s, p) => s + num(p.valor_total), 0);
  const custo = peds.reduce((s, p) => s + custoPedido(p), 0);
  const despesas = state.despesas.filter(d => d.data >= de && d.data <= ate);
  const totalDesp = despesas.reduce((s, d) => s + num(d.valor), 0);
  const receb = recebimentos().filter(r => r.data >= de && r.data <= ate);
  const recebido = receb.reduce((s, r) => s + r.valor, 0);
  const aberto = peds.reduce((s, p) => s + saldoPedido(p), 0);
  return { peds, vendas, custo, despesas, totalDesp, receb, recebido, aberto, lucro: vendas - custo - totalDesp };
}

function renderFinanceiro() {
  const per = periodoFinanceiro();
  const r = resumoPeriodo(per.de, per.ate);
  const a = per.ant ? resumoPeriodo(per.ant.de, per.ant.ate) : null;
  $('finPeriodoTxt').textContent = per.de === per.ate ? `${per.label}: ${fmtData(per.de)}` : `${per.label}: ${fmtData(per.de)} a ${fmtData(per.ate)}${a ? ` (comparando com ${fmtData(per.ant.de)} a ${fmtData(per.ant.ate)})` : ''}`;

  const margem = r.vendas > 0 ? r.lucro / r.vendas * 100 : 0;
  $('finFaturamento').textContent = BRL(r.vendas);
  $('finFaturamentoVar').innerHTML = `${plural(r.peds.length, 'pedido')} · ticket ${BRL(r.peds.length ? r.vendas / r.peds.length : 0)} ${a ? variacaoHTML(r.vendas, a.vendas, '') : ''}`;
  $('finCusto').textContent = BRL(r.custo);
  $('finCustoSub').textContent = r.vendas ? `${(r.custo / r.vendas * 100).toFixed(0)}% das vendas` : '—';
  $('finDespesas').textContent = state.rec.despesas ? BRL(r.totalDesp) : '—';
  $('finDespesasSub').textContent = state.rec.despesas ? plural(r.despesas.length, 'lançamento') : 'rode o melhorias-v2.sql';
  $('finLucro').textContent = BRL(r.lucro);
  $('finMargem').innerHTML = `margem ${margem.toFixed(0)}% ${a ? variacaoHTML(r.lucro, a.lucro, '') : ''}`;
  $('finRecebido').textContent = BRL(r.recebido);
  $('finRecebidoSub').textContent = 'pagos na hora + fiado recebido';
  $('finAberto').textContent = BRL(r.aberto);
  $('finAbertoSub').textContent = `de pedidos feitos no período`;

  // mês a mês desde o início
  renderMensal();

  // dia da semana (média por dia em que abriu)
  const porDia = [0, 0, 0, 0, 0, 0, 0].map(() => ({ valor: 0, dias: new Set() }));
  r.peds.forEach(p => { const d = dateFromISO(p.data_pedido).getDay(); porDia[d].valor += num(p.valor_total); porDia[d].dias.add(p.data_pedido); });
  const melhor = porDia.reduce((bi, x, i) => x.valor > porDia[bi].valor ? i : bi, 0);
  $('finDiaSemana').innerHTML = barrasHTML([1, 2, 3, 4, 5, 6, 0].map(d => ({
    label: DIAS_SEMANA[d], valor: porDia[d].valor, destaque: d === melhor && porDia[d].valor > 0,
    sub: porDia[d].dias.size ? `média ${BRL(porDia[d].valor / porDia[d].dias.size)}/dia` : '',
  })));

  // formas de recebimento
  const formas = {};
  r.receb.forEach(x => {
    const k = x.origem === 'na_hora' && !x.forma ? 'Na hora (sem forma)' : x.forma ? formaRecNome(x.forma) : 'Fiado (sem forma)';
    formas[k] = (formas[k] || 0) + x.valor;
  });
  $('finFormas').innerHTML = barrasHTML(Object.entries(formas).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: k, valor: v, cor: 'ok' })));

  // produtos
  const porProd = {};
  r.peds.forEach(p => (p.itens_pedido || []).forEach(it => {
    const n = it.produtos?.nome || 'Item';
    porProd[n] = porProd[n] || { valor: 0, qtd: 0, lucro: 0 };
    porProd[n].valor += num(it.subtotal); porProd[n].qtd += num(it.quantidade);
    porProd[n].lucro += num(it.subtotal) - num(it.custo_unitario) * num(it.quantidade);
  }));
  $('finProdutos').innerHTML = barrasHTML(Object.entries(porProd).sort((x, y) => y[1].valor - x[1].valor).slice(0, 12)
    .map(([n, v]) => ({ label: n, valor: v.valor, sub: `${v.qtd} un · lucro ${BRL(v.lucro)}` })));

  // idade do fiado em aberto (todo o fiado, não só do período)
  const hoje = hojeISO();
  const faixas = [['Até 7 dias', 0, 7], ['8 a 15 dias', 8, 15], ['16 a 30 dias', 16, 30], ['31 a 60 dias', 31, 60], ['Mais de 60 dias', 61, 99999]];
  const valores = faixas.map(() => ({ v: 0, n: 0 }));
  pendentes().forEach(p => {
    const d = diasEntre(p.data_pedido, hoje);
    const i = faixas.findIndex(([, x, y]) => d >= x && d <= y);
    if (i >= 0) { valores[i].v += saldoPedido(p); valores[i].n += 1; }
  });
  $('finAging').innerHTML = barrasHTML(faixas.map(([n], i) => ({ label: n, valor: valores[i].v, sub: plural(valores[i].n, 'pedido'), cor: i >= 2 ? 'due' : '' })));

  renderDespesasLista(r.despesas);

  // ranking de clientes
  const porCli = {};
  r.peds.forEach(p => {
    porCli[p.cliente_id] = porCli[p.cliente_id] || { total: 0, qtd: 0, aberto: 0 };
    porCli[p.cliente_id].total += num(p.valor_total); porCli[p.cliente_id].qtd += 1; porCli[p.cliente_id].aberto += saldoPedido(p);
  });
  const ranking = Object.entries(porCli).sort((x, y) => y[1].total - x[1].total);
  $('finRankingClientes').innerHTML = ranking.slice(0, 30).map(([cid, v], i) => {
    const c = clientePorId(cid);
    return `<div class="row-item">
      <span class="rank-pos">${i + 1}</span>
      <button class="row-main" data-ficha="${esc(cid)}"><span class="row-title">${esc(c?.nome || '—')}</span>
        <span class="row-sub">${plural(v.qtd, 'pedido')} · ticket ${BRL(v.total / v.qtd)}${v.aberto > 0 ? ` · <span class="due">${BRL(v.aberto)} em aberto</span>` : ''}</span></button>
      <span class="row-value num">${BRL(v.total)}</span></div>`;
  }).join('') + (ranking.length > 30 ? `<div class="empty">e mais ${ranking.length - 30} clientes</div>` : '') || emptyMsg('Sem pedidos no período');
}

function renderMensal() {
  if (!state.pedidos.length) { $('finMensal').innerHTML = emptyMsg('Sem pedidos ainda'); return; }
  const hoje = hojeISO();
  const meses = mesesEntre(state.pedidos[state.pedidos.length - 1].data_pedido.slice(0, 7), hoje.slice(0, 7));
  const dados = meses.map(m => {
    const r = resumoPeriodo(m + '-01', m + '-31');
    return { m, vendas: r.vendas, lucro: r.lucro, qtd: r.peds.length };
  });
  const max = Math.max(1, ...dados.map(d => d.vendas));
  $('finMensal').innerHTML = dados.map(d => `
    <div class="mc-col" title="${mesLabel(d.m)}: vendas ${BRL(d.vendas)}, lucro ${BRL(d.lucro)}, ${plural(d.qtd, 'pedido')}">
      <span class="mc-val num">${BRL(d.vendas).replace('R$', '').trim()}</span>
      <div class="mc-bars">
        <div class="mc-bar mc-venda" style="height:${d.vendas / max * 100}%"></div>
        <div class="mc-bar mc-lucro" style="height:${Math.max(0, d.lucro) / max * 100}%"></div>
      </div>
      <span class="mc-lbl">${mesLabel(d.m)}</span>
    </div>`).join('');
}

// ---------------------------------------------------------
// Despesas
// ---------------------------------------------------------
function renderDespesasLista(lista) {
  const el = $('finDespesasLista');
  if (!state.rec.despesas) {
    $('btnNovaDespesa').classList.add('hidden');
    el.innerHTML = '<div class="empty">Para lançar despesas (gás, embalagens, mercado…) e ver o lucro líquido, rode o <code>melhorias-v2.sql</code> no Supabase.</div>';
    return;
  }
  $('btnNovaDespesa').classList.remove('hidden');
  const porCat = {};
  lista.forEach(d => { porCat[d.categoria] = (porCat[d.categoria] || 0) + num(d.valor); });
  el.innerHTML = (Object.keys(porCat).length > 1 ? `<div class="desp-cats">${Object.entries(porCat).sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `<span class="chip chip-static">${esc(c)} <strong class="num">${BRL(v)}</strong></span>`).join('')}</div>` : '') +
    (lista.map(d => `<div class="row-item">
      <div class="row-main"><span class="row-title">${esc(d.descricao)}</span><span class="row-sub">${fmtData(d.data)} · ${esc(d.categoria)}</span></div>
      <span class="row-value num due">− ${BRL(d.valor)}</span>
      <button class="btn btn-ghost btn-sm" data-del-desp="${d.id}" aria-label="Apagar despesa">Apagar</button></div>`).join('')
      || emptyMsg('Nenhuma despesa lançada no período'));
  el.querySelectorAll('[data-del-desp]').forEach(b => b.onclick = async () => {
    if (!confirm('Apagar esta despesa?')) return;
    const { error } = await supabaseClient.from('despesas').delete().eq('id', b.dataset.delDesp);
    if (error) return toast('Erro: ' + error.message, true);
    await loadDespesas(); renderFinanceiro(); renderDashboard();
    toast('Despesa apagada');
  });
}

function abrirFormDespesa() {
  $('dpDescricao').value = ''; $('dpValor').value = ''; $('dpData').value = hojeISO();
  $('listaCatDespesa').innerHTML = [...new Set(['Mercado', 'Gás', 'Embalagens', 'Entrega', 'Funcionário', 'Aluguel', 'Energia/Água', 'Outros', ...state.despesas.map(d => d.categoria)])]
    .map(c => `<option value="${esc(c)}">`).join('');
  openSheet('despesaOverlay');
}

async function salvarDespesa(e) {
  e.preventDefault();
  const payload = { descricao: $('dpDescricao').value.trim(), valor: num($('dpValor').value), data: $('dpData').value || hojeISO(), categoria: $('dpCategoria').value.trim() || 'Outros' };
  if (!payload.descricao) return;
  const { error } = await supabaseClient.from('despesas').insert(payload);
  if (error) return toast('Erro: ' + error.message, true);
  closeSheet('despesaOverlay');
  await loadDespesas(); renderFinanceiro(); renderDashboard();
  toast('Despesa lançada ✓');
}

// ---------------------------------------------------------
// Exportar CSV do período
// ---------------------------------------------------------
function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportarPedidosCSV() {
  const { de, ate } = periodoFinanceiro();
  const lista = state.pedidos.filter(p => p.data_pedido >= de && p.data_pedido <= ate);
  if (!lista.length) return toast('Nenhum pedido no período', true);
  const cab = ['Data', 'Dia', 'Cliente', 'WhatsApp', 'Itens', 'Forma', 'Status', 'Valor total', 'Já pago', 'Falta', 'Custo', 'Pago em', 'Recebido via', 'Origem', 'Observação'];
  const dec = (v) => num(v).toFixed(2).replace('.', ',');
  const linhas = lista.map(p => [
    fmtData(p.data_pedido), diaSemanaCurto(p.data_pedido), p.clientes?.nome || '', p.clientes?.whatsapp || '',
    (p.itens_pedido || []).map(it => `${num(it.quantidade)}x ${it.produtos?.nome || 'item'}`).join(', '),
    FORMA_PEDIDO_TXT[p.forma_pagamento] || p.forma_pagamento, p.status_pagamento === 'pago' ? 'Pago' : 'Em aberto',
    dec(p.valor_total), dec(p.status_pagamento === 'pago' ? p.valor_total : p.valor_pago), dec(saldoPedido(p)), dec(custoPedido(p)),
    fmtData(p.data_pagamento), p.forma_recebimento ? formaRecNome(p.forma_recebimento) : '', p.origem === 'loja' ? 'Loja online' : 'Painel', p.observacoes || '',
  ].map(csvEscape).join(';'));
  // ";" e BOM: o Excel em português abre direto nas colunas certas
  baixarArquivo(`pedidos_${de}_a_${ate}.csv`, '﻿' + [cab.join(';'), ...linhas].join('\n'), 'text/csv;charset=utf-8;');
  toast(`${plural(lista.length, 'pedido')} exportados ✓`);
}
