// =========================================================
// MARMITA CONTROL v2 — Clientes: cadastro, lista e ficha
// =========================================================

let filtroClientes = 'ativos';

function setupClientes() {
  $('buscaClientes').addEventListener('input', renderClientesList);
  $('ordemClientes').addEventListener('change', renderClientesList);
  $('filtroClientesChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fcl]'); if (!b) return;
    filtroClientes = b.dataset.fcl;
    $('filtroClientesChips').querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    renderClientesList();
  });
  $('btnNovoCliente').addEventListener('click', () => abrirFormCliente(null));
  $('formCliente').addEventListener('submit', salvarCliente);
  $('clWhats').addEventListener('blur', () => { if ($('clWhats').value) $('clWhats').value = formatarTelefone($('clWhats').value); });
  ['clNome', 'clWhats'].forEach(id => $(id).addEventListener('input', checarDuplicadoCliente));
}

// ---------------------------------------------------------
// Cadastro
// ---------------------------------------------------------
function acharDuplicadoCliente(nome, whats, ignorarId) {
  const n = normalize(nome).trim(), w = soDigitos(whats).slice(-8);
  return state.clientes.find(c => c.id !== ignorarId && (
    (n && normalize(c.nome).trim() === n) || (w.length === 8 && soDigitos(c.whatsapp).slice(-8) === w)));
}

function checarDuplicadoCliente() {
  const dup = acharDuplicadoCliente($('clNome').value, $('clWhats').value, state.editClienteId);
  const box = $('clDuplicado');
  box.classList.toggle('hidden', !dup);
  if (dup) box.innerHTML = `Parecido com <strong>${esc(dup.nome)}</strong>${dup.whatsapp ? ' (' + esc(dup.whatsapp) + ')' : ''}, que já está cadastrado. <button type="button" class="link-btn" data-ficha="${esc(dup.id)}">Abrir ficha</button>`;
}

function abrirFormCliente(id) {
  const c = id ? clientePorId(id) : null;
  state.editClienteId = id;
  $('clienteSheetTitulo').textContent = c ? 'Editar cliente' : 'Novo cliente';
  $('clNome').value = c?.nome || '';
  $('clWhats').value = c?.whatsapp || '';
  $('clObs').value = c?.observacoes || '';
  $('clApelido').value = c?.apelido || '';
  $('clEmpresa').value = c?.empresa || '';
  $('clEndereco').value = c?.endereco || '';
  $('clAniversario').value = c?.aniversario || '';
  $('clLimite').value = c?.limite_fiado ?? '';
  $('listaEmpresas').innerHTML = [...new Set(state.clientes.map(x => x.empresa).filter(Boolean))].sort().map(e => `<option value="${esc(e)}">`).join('');
  $('clDuplicado').classList.add('hidden');
  openSheet('clienteOverlay');
}

async function salvarCliente(e) {
  e.preventDefault();
  const nome = $('clNome').value.trim();
  if (!nome) return toast('O nome é obrigatório', true);
  const whats = $('clWhats').value.trim();
  const payload = { nome, whatsapp: whats ? formatarTelefone(whats) : null, observacoes: $('clObs').value.trim() || null };
  if (state.rec.clientesExtra) {
    Object.assign(payload, {
      apelido: $('clApelido').value.trim() || null,
      empresa: $('clEmpresa').value.trim() || null,
      endereco: $('clEndereco').value.trim() || null,
      aniversario: $('clAniversario').value || null,
      limite_fiado: $('clLimite').value === '' ? null : num($('clLimite').value),
    });
  }
  const dup = acharDuplicadoCliente(nome, whats, state.editClienteId);
  if (dup && !state.editClienteId && !confirm(`Já existe "${dup.nome}". Cadastrar outro cliente mesmo assim?`)) return;

  const btn = $('clSalvar');
  btn.disabled = true;
  try {
    if (state.editClienteId) {
      const { error } = await supabaseClient.from('clientes').update(payload).eq('id', state.editClienteId);
      if (error) throw error;
      toast('Cliente atualizado ✓');
    } else {
      const { error } = await supabaseClient.from('clientes').insert(payload);
      if (error) throw error;
      toast('Cliente cadastrado ✓');
    }
    closeSheet('clienteOverlay');
    await refreshAll();
  } catch (err) {
    toast('Erro ao salvar: ' + (err?.message || 'tente de novo'), true);
  } finally { btn.disabled = false; }
}

// Arquivar em vez de excluir: o histórico do cliente nunca é apagado
async function arquivarCliente(id, arquivar = true) {
  const c = clientePorId(id);
  if (!c) return;
  if (!state.rec.clientesExtra) {
    const qtd = statsDe(id).qtd;
    if (qtd > 0) return toast(`Para arquivar, rode o melhorias-v2.sql. Excluir apagaria ${plural(qtd, 'pedido')} do histórico.`, true);
    if (!confirm(`Excluir "${c.nome}"? Ele não tem nenhum pedido.`)) return;
    const { error } = await supabaseClient.from('clientes').delete().eq('id', id);
    if (error) return toast('Erro: ' + error.message, true);
    toast('Cliente excluído');
    if (state.view === 'cliente') switchView('clientes');
    return refreshAll();
  }
  const s = statsDe(id);
  if (arquivar && s.saldo > 0.004 && !confirm(`${c.nome} ainda deve ${BRL(s.saldo)}. Arquivar mesmo assim?`)) return;
  if (arquivar && !confirm(`Arquivar "${c.nome}"?\nEle some das buscas, mas o histórico de pedidos continua guardado. Dá para reativar depois.`)) return;
  const { error } = await supabaseClient.from('clientes').update({ ativo: !arquivar }).eq('id', id);
  if (error) return toast('Erro: ' + error.message, true);
  toast(arquivar ? 'Cliente arquivado' : 'Cliente reativado ✓');
  await refreshAll();
}

// ---------------------------------------------------------
// Lista
// ---------------------------------------------------------
function renderClientesList() {
  const stats = statsClientes();
  const hoje = hojeISO();
  const limiteSumido = state.cfg.inatividade || 14;
  const busca = normalize($('buscaClientes').value.trim());
  const bd = soDigitos($('buscaClientes').value);

  let lista = state.clientes.map(c => ({ c, s: stats.get(c.id) || { total: 0, qtd: 0, ultimo: null, saldo: 0 } }));
  lista = lista.filter(({ c, s }) => {
    if (filtroClientes === 'ativos') return clienteAtivo(c);
    if (filtroClientes === 'arquivados') return !clienteAtivo(c);
    if (filtroClientes === 'devendo') return s.saldo > 0.004;
    if (filtroClientes === 'sumidos') return clienteAtivo(c) && s.qtd >= 3 && diasEntre(s.ultimo, hoje) >= limiteSumido;
    return true;
  });
  if (busca) lista = lista.filter(({ c }) => normalize(`${c.nome} ${c.apelido || ''} ${c.empresa || ''}`).includes(busca) || (bd.length >= 4 && soDigitos(c.whatsapp).includes(bd)));

  const ordem = $('ordemClientes').value;
  lista.sort((a, b) => ordem === 'gasto' ? b.s.total - a.s.total
    : ordem === 'recente' ? (b.s.ultimo || '').localeCompare(a.s.ultimo || '')
      : ordem === 'pedidos' ? b.s.qtd - a.s.qtd
        : ordem === 'divida' ? b.s.saldo - a.s.saldo
          : a.c.nome.localeCompare(b.c.nome));

  const totalGasto = lista.reduce((s, x) => s + x.s.total, 0);
  $('clientesResumo').innerHTML = `${plural(lista.length, 'cliente')} · ${BRL(totalGasto)} em compras no histórico`;

  $('listaClientes').innerHTML = lista.map(({ c, s }) => {
    const dias = s.ultimo ? diasEntre(s.ultimo, hoje) : null;
    return `
    <button class="cliente-card${!clienteAtivo(c) ? ' is-archived' : ''}" data-ficha="${esc(c.id)}">
      <span class="avatar">${esc(iniciais(c.nome))}</span>
      <span class="cliente-card-main">
        <strong>${esc(c.nome)}${c.apelido ? ` <small>(${esc(c.apelido)})</small>` : ''}</strong>
        <small>${[c.empresa, c.whatsapp ? formatarTelefone(c.whatsapp) : 'sem WhatsApp'].filter(Boolean).map(esc).join(' · ')}</small>
        <small>${s.qtd ? `${plural(s.qtd, 'pedido')} · ${BRL(s.total)} · último ${dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`}` : 'nenhum pedido ainda'}</small>
      </span>
      ${s.saldo > 0.004 ? `<span class="cliente-card-due num">deve ${BRL(s.saldo)}</span>` : ''}
      ${!clienteAtivo(c) ? '<span class="tag">arquivado</span>' : ''}
    </button>`;
  }).join('') || emptyMsg(busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente nesta lista');
}

// ---------------------------------------------------------
// FICHA DO CLIENTE — histórico desde o primeiro pedido
// ---------------------------------------------------------
let fichaMesFiltro = 'todos';
let fichaLimite = 20;

function abrirFicha(clienteId) {
  if (!clientePorId(clienteId)) return;
  document.querySelectorAll('.sheet-overlay.show').forEach(o => closeSheet(o.id));
  state.fichaClienteId = clienteId;
  fichaMesFiltro = 'todos'; fichaLimite = 20;
  switchView('cliente');
}

function renderFichaCliente() {
  const c = clientePorId(state.fichaClienteId);
  const el = $('fichaCliente');
  if (!c) { el.innerHTML = emptyMsg('Cliente não encontrado'); return; }
  const hoje = hojeISO();
  const peds = state.pedidos.filter(p => p.cliente_id === c.id); // mais novo → mais antigo
  const s = statsDe(c.id);
  const media = mediaDiasPagamento(c.id);
  const desde = s.primeiro || (c.created_at || '').slice(0, 10);
  const semanasAtivo = s.primeiro ? Math.max(1, diasEntre(s.primeiro, hoje) / 7) : 1;
  const freq = s.qtd / semanasAtivo;
  const taxas = peds.reduce((sum, p) => sum + num(p.taxa_quinzena), 0);
  const diasSemPedir = s.ultimo ? diasEntre(s.ultimo, hoje) : null;
  const limite = num(c.limite_fiado);
  const totalPago = peds.reduce((sum, p) => sum + (p.status_pagamento === 'pago' ? num(p.valor_total) : num(p.valor_pago)), 0);

  // produtos favoritos
  const prods = {};
  peds.forEach(p => (p.itens_pedido || []).forEach(it => {
    const n = it.produtos?.nome || 'Item';
    prods[n] = prods[n] || { qtd: 0, valor: 0 };
    prods[n].qtd += num(it.quantidade); prods[n].valor += num(it.subtotal);
  }));
  const favoritos = Object.entries(prods).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 8);

  // por mês, dia da semana e dia do mês
  const meses = s.primeiro ? mesesEntre(s.primeiro.slice(0, 7), hoje.slice(0, 7)) : [];
  const porMes = Object.fromEntries(meses.map(m => [m, { valor: 0, qtd: 0 }]));
  const porDiaSem = [0, 0, 0, 0, 0, 0, 0].map(() => ({ qtd: 0, valor: 0 }));
  const porDiaMes = Array.from({ length: 31 }, () => 0);
  peds.forEach(p => {
    const m = p.data_pedido.slice(0, 7);
    if (porMes[m]) { porMes[m].valor += num(p.valor_total); porMes[m].qtd += 1; }
    const ds = dateFromISO(p.data_pedido).getDay();
    porDiaSem[ds].qtd += 1; porDiaSem[ds].valor += num(p.valor_total);
    porDiaMes[Number(p.data_pedido.slice(8, 10)) - 1] += 1;
  });
  const maxDiaMes = Math.max(1, ...porDiaMes);
  const ordemSemana = [1, 2, 3, 4, 5, 6, 0];
  const melhorDia = ordemSemana.reduce((best, d) => porDiaSem[d].qtd > porDiaSem[best].qtd ? d : best, 1);

  // formas de pagamento usadas
  const formas = {};
  peds.forEach(p => { formas[p.forma_pagamento] = (formas[p.forma_pagamento] || 0) + 1; });

  // recebimentos
  const receb = recebimentosAgrupados(c.id);

  // pedidos filtrados por mês
  const pedsFiltrados = fichaMesFiltro === 'todos' ? peds : peds.filter(p => p.data_pedido.startsWith(fichaMesFiltro));

  el.innerHTML = `
  <div class="ficha-top">
    <div class="ficha-id">
      <span class="avatar avatar-lg">${esc(iniciais(c.nome))}</span>
      <div>
        <h2 class="ficha-nome">${esc(c.nome)}${!clienteAtivo(c) ? ' <span class="tag">arquivado</span>' : ''}</h2>
        <p class="ficha-sub">${[c.apelido && `“${c.apelido}”`, c.empresa, c.whatsapp && formatarTelefone(c.whatsapp)].filter(Boolean).map(esc).join(' · ') || 'sem contato cadastrado'}</p>
        ${c.endereco ? `<p class="ficha-sub">${esc(c.endereco)}</p>` : ''}
        ${c.aniversario ? `<p class="ficha-sub">Aniversário: ${fmtData(c.aniversario).slice(0, 5)}</p>` : ''}
        ${c.observacoes ? `<p class="ficha-obs">${esc(c.observacoes)}</p>` : ''}
      </div>
    </div>

    <div class="cupom">
      <span class="cupom-label">${s.saldo > 0.004 ? 'Deve hoje' : 'Situação'}</span>
      <span class="cupom-valor num ${s.saldo > 0.004 ? 'due' : 'ok'}">${s.saldo > 0.004 ? BRL(s.saldo) : 'Em dia'}</span>
      <span class="cupom-sub">${s.saldo > 0.004 ? `em aberto desde ${fmtData(s.maisAntigoAberto)} (${plural(diasEntre(s.maisAntigoAberto, hoje), 'dia')})` : 'nenhum fiado em aberto'}</span>
      ${limite > 0 ? `<div class="limite"><div class="limite-bar"><div style="width:${Math.min(100, s.saldo / limite * 100)}%"></div></div><small>limite de fiado ${BRL(limite)}</small></div>` : ''}
      <div class="cupom-actions">
        <button class="btn btn-yolk" data-acao="pedido">Novo pedido</button>
        ${s.saldo > 0.004 ? '<button class="btn btn-primary" data-acao="receber">Receber</button>' : ''}
        ${c.whatsapp && s.saldo > 0.004 ? '<button class="btn btn-whats" data-acao="cobrar">Cobrar</button>' : ''}
      </div>
    </div>
  </div>

  <div class="ficha-tools">
    <button class="btn btn-ghost btn-sm" data-acao="editar">Editar cadastro</button>
    ${c.whatsapp ? '<button class="btn btn-ghost btn-sm" data-acao="extrato">Enviar extrato do mês</button>' : ''}
    ${c.whatsapp ? `<a class="btn btn-ghost btn-sm" href="${linkWhats(c.whatsapp, '')}" target="_blank" rel="noopener">Abrir conversa</a>` : ''}
    <button class="btn btn-ghost btn-sm" data-acao="${clienteAtivo(c) ? 'arquivar' : 'reativar'}">${clienteAtivo(c) ? (state.rec.clientesExtra ? 'Arquivar' : 'Excluir') : 'Reativar'}</button>
  </div>

  ${s.qtd === 0 ? emptyMsg('Este cliente ainda não fez nenhum pedido.') : `
  <div class="kpi-grid kpi-grid-6">
    <div class="kpi"><span class="kpi-label">Total gasto</span><span class="kpi-value num">${BRL(s.total)}</span><span class="kpi-sub">${BRL(totalPago)} já pagos</span></div>
    <div class="kpi"><span class="kpi-label">Pedidos</span><span class="kpi-value num">${s.qtd}</span><span class="kpi-sub">cliente desde ${fmtData(desde)}</span></div>
    <div class="kpi"><span class="kpi-label">Ticket médio</span><span class="kpi-value num">${BRL(s.total / s.qtd)}</span><span class="kpi-sub">por pedido</span></div>
    <div class="kpi"><span class="kpi-label">Frequência</span><span class="kpi-value num">${freq.toFixed(1).replace('.', ',')}×</span><span class="kpi-sub">pedidos por semana</span></div>
    <div class="kpi"><span class="kpi-label">Último pedido</span><span class="kpi-value num">${diasSemPedir === 0 ? 'Hoje' : diasSemPedir === 1 ? 'Ontem' : `${diasSemPedir} dias`}</span><span class="kpi-sub">${fmtData(s.ultimo)}</span></div>
    <div class="kpi"><span class="kpi-label">Paga o fiado em</span><span class="kpi-value num">${media === null ? '—' : plural(media, 'dia')}</span><span class="kpi-sub">em média${taxas ? ` · ${BRL(taxas)} em taxas` : ''}</span></div>
  </div>

  <div class="section-head"><h2>Gasto mês a mês</h2></div>
  <div class="card"><div class="mensal-chart mensal-1">${(() => {
    const max = Math.max(1, ...meses.map(m => porMes[m].valor));
    return meses.map(m => `<div class="mc-col" title="${mesLabel(m)}: ${BRL(porMes[m].valor)} em ${plural(porMes[m].qtd, 'pedido')}">
      <span class="mc-val num">${porMes[m].valor ? BRL(porMes[m].valor).replace('R$', '').trim() : ''}</span>
      <div class="mc-bars"><div class="mc-bar mc-venda" style="height:${porMes[m].valor / max * 100}%"></div></div>
      <span class="mc-lbl">${mesLabel(m)}</span></div>`).join('');
  })()}</div></div>

  <div class="fin-cols">
    <div>
      <div class="section-head"><h2>Dias da semana em que mais compra</h2></div>
      <div class="card bar-chart">${barrasHTML(ordemSemana.map(d => ({ label: DIAS_SEMANA[d], valor: porDiaSem[d].qtd, sub: BRL(porDiaSem[d].valor), destaque: d === melhorDia })), v => plural(v, 'pedido'))}</div>
    </div>
    <div>
      <div class="section-head"><h2>Produtos favoritos</h2></div>
      <div class="card bar-chart">${barrasHTML(favoritos.map(([n, v]) => ({ label: n, valor: v.qtd, sub: BRL(v.valor) })), v => `${v}×`)}</div>
    </div>
  </div>

  <div class="section-head"><h2>Dias do mês em que mais compra</h2></div>
  <div class="card">
    <div class="dias-mes">${porDiaMes.map((q, i) => `<span class="dm" style="--a:${(q / maxDiaMes).toFixed(2)}" title="Dia ${i + 1}: ${plural(q, 'pedido')}"><b>${i + 1}</b><small>${q || ''}</small></span>`).join('')}</div>
    <p class="hint">Quanto mais escuro, mais pedidos nesse dia do mês. Formas usadas: ${Object.entries(formas).map(([f, q]) => `${FORMA_PEDIDO_TXT[f] || f} ${q}×`).join(', ')}.</p>
  </div>

  <div class="section-head"><h2>Pagamentos recebidos</h2></div>
  <div class="card simple-list">${receb.slice(0, 15).map(g => `
    <div class="row-item"><div class="row-main"><span class="row-title">${fmtData(g.data)}</span>
      <span class="row-sub">${plural(g.pedidos, 'pedido')}${g.formas.size ? ' · ' + [...g.formas].join(', ') : ''}${g.obs.length ? ' · ' + esc(g.obs.join('; ')) : ''}</span></div>
      <span class="row-value num ok">+ ${BRL(g.valor)}</span></div>`).join('') || emptyMsg('Nenhum pagamento de fiado registrado')}
    ${receb.length > 15 ? `<div class="empty">e mais ${receb.length - 15} pagamentos anteriores</div>` : ''}
  </div>

  <div class="section-head"><h2>Todos os pedidos</h2>
    <select id="fichaMes" aria-label="Filtrar por mês">
      <option value="todos">Desde o início (${s.qtd})</option>
      ${meses.slice().reverse().filter(m => porMes[m].qtd).map(m => `<option value="${m}" ${m === fichaMesFiltro ? 'selected' : ''}>${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)} (${porMes[m].qtd})</option>`).join('')}
    </select>
  </div>
  <div class="ticket-list">${pedsFiltrados.slice(0, fichaLimite).map(p => ticketHTML(p, { semCliente: true })).join('')}</div>
  ${pedsFiltrados.length > fichaLimite ? `<button class="btn btn-ghost btn-block" id="fichaMais">Mostrar mais (${pedsFiltrados.length - fichaLimite} restantes)</button>` : ''}
  `}`;

  const sel = $('fichaMes');
  if (sel) sel.onchange = () => { fichaMesFiltro = sel.value; fichaLimite = 20; renderFichaCliente(); };
  const mais = $('fichaMais');
  if (mais) mais.onclick = () => { fichaLimite += 40; renderFichaCliente(); };

  el.querySelectorAll('[data-acao]').forEach(b => b.onclick = () => {
    const a = b.dataset.acao;
    if (a === 'pedido') novoPedidoPara(c.id);
    else if (a === 'receber') abrirReceber(c.id);
    else if (a === 'cobrar') cobrarWhatsapp(c.id);
    else if (a === 'editar') abrirFormCliente(c.id);
    else if (a === 'extrato') extratoWhatsapp(c.id, hoje.slice(0, 7) + '-01', hoje);
    else if (a === 'arquivar') arquivarCliente(c.id, true);
    else if (a === 'reativar') arquivarCliente(c.id, false);
  });
  $('viewTitle').textContent = c.nome;
}
