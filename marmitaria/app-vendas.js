// =========================================================
// MARMITA CONTROL v2 — Painel, Novo pedido, Pedidos
// =========================================================

// ---------------------------------------------------------
// PAINEL
// ---------------------------------------------------------
function renderDashboard() {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const pedHoje = state.pedidos.filter(p => p.data_pedido === hoje);
  const pedMes = state.pedidos.filter(p => p.data_pedido.startsWith(mesAtual));
  const abertos = pendentes();

  const totalHoje = pedHoje.reduce((s, p) => s + num(p.valor_total), 0);
  const totalMes = pedMes.reduce((s, p) => s + num(p.valor_total), 0);
  const totalAberto = abertos.reduce((s, p) => s + saldoPedido(p), 0);
  const custoMes = pedMes.reduce((s, p) => s + custoPedido(p), 0);
  const despMes = state.despesas.filter(d => d.data.startsWith(mesAtual)).reduce((s, d) => s + num(d.valor), 0);
  const lucroMes = totalMes - custoMes - despMes;
  const devendo = new Set(abertos.map(p => p.cliente_id)).size;

  // comparação com o mesmo ponto do mês passado
  const d = dateFromISO(hoje); d.setMonth(d.getMonth() - 1);
  const mesPassado = isoFromDate(d).slice(0, 7);
  const limiteDia = hoje.slice(8, 10);
  const totalMesPassadoAteHoje = state.pedidos
    .filter(p => p.data_pedido.startsWith(mesPassado) && p.data_pedido.slice(8, 10) <= limiteDia)
    .reduce((s, p) => s + num(p.valor_total), 0);

  const h = new Date().getHours();
  $('greetingHello').textContent = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}${state.cfg.nome ? ', ' + state.cfg.nome : ''}!`;
  $('greetingSub').textContent = pedHoje.length === 0
    ? 'Nenhum pedido registrado hoje ainda.'
    : `Hoje: ${plural(pedHoje.length, 'pedido')}, ${BRL(totalHoje)}.` + (totalAberto > 0 ? ` Fiado em aberto: ${BRL(totalAberto)} com ${plural(devendo, 'cliente')}.` : ' Nenhum fiado em aberto.');

  $('kpiHoje').textContent = BRL(totalHoje);
  $('kpiHojeCount').textContent = plural(pedHoje.length, 'pedido');
  $('kpiAReceber').textContent = BRL(totalAberto);
  $('kpiAReceberCount').textContent = `${plural(devendo, 'cliente')} devendo`;
  $('kpiMes').textContent = BRL(totalMes);
  $('kpiMesCount').innerHTML = `${plural(pedMes.length, 'pedido')}${totalMesPassadoAteHoje > 0 ? ' ' + variacaoHTML(totalMes, totalMesPassadoAteHoje, 'vs. mês passado') : ''}`;
  $('kpiLucro').textContent = BRL(lucroMes);
  $('kpiLucroMargem').textContent = totalMes > 0 ? `margem de ${(lucroMes / totalMes * 100).toFixed(0)}%${despMes ? ' já tirando despesas' : ''}` : '—';

  // últimos 7 dias
  const linhas7 = [];
  for (let i = 6; i >= 0; i--) {
    const iso = addDias(hoje, -i);
    const doDia = state.pedidos.filter(p => p.data_pedido === iso);
    linhas7.push({ label: `${diaSemanaCurto(iso)} ${fmtDataCurta(iso)}`, sub: i === 0 ? 'hoje' : plural(doDia.length, 'pedido'),
      valor: doDia.reduce((s, p) => s + num(p.valor_total), 0), destaque: i === 0 });
  }
  $('dashUltimos7').innerHTML = barrasHTML(linhas7);

  // destaques do mês
  const porCli = {}, porProd = {}, porDiaSem = [0, 0, 0, 0, 0, 0, 0];
  pedMes.forEach(p => {
    porCli[p.cliente_id] = (porCli[p.cliente_id] || 0) + num(p.valor_total);
    porDiaSem[dateFromISO(p.data_pedido).getDay()] += num(p.valor_total);
    (p.itens_pedido || []).forEach(it => { const n = it.produtos?.nome || 'Item'; porProd[n] = (porProd[n] || 0) + num(it.quantidade); });
  });
  const topCli = Object.entries(porCli).sort((a, b) => b[1] - a[1])[0];
  const topProd = Object.entries(porProd).sort((a, b) => b[1] - a[1])[0];
  const topDia = porDiaSem.indexOf(Math.max(...porDiaSem));
  $('destCliente').textContent = topCli ? `${clientePorId(topCli[0])?.nome || '—'} · ${BRL(topCli[1])}` : 'Sem pedidos no mês';
  $('destProduto').textContent = topProd ? `${topProd[0]} · ${topProd[1]} vendidos` : 'Sem pedidos no mês';
  $('destDia').textContent = pedMes.length ? `${DIAS_SEMANA[topDia]} · ${BRL(porDiaSem[topDia])}` : '—';

  // fiado mais antigo (por cliente)
  const stats = statsClientes();
  const devedores = [...stats.entries()].filter(([, s]) => s.saldo > 0.004)
    .sort((a, b) => a[1].maisAntigoAberto.localeCompare(b[1].maisAntigoAberto)).slice(0, 5);
  $('dashPendentes').innerHTML = devedores.map(([cid, s]) => {
    const c = clientePorId(cid);
    const dias = diasEntre(s.maisAntigoAberto, hoje);
    return `<div class="row-item" data-ficha="${esc(cid)}" role="button" tabindex="0">
      <span class="avatar">${esc(iniciais(c?.nome))}</span>
      <div class="row-main"><span class="row-title">${esc(c?.nome || '—')}</span>
        <span class="row-sub">em aberto desde ${fmtData(s.maisAntigoAberto)} (${plural(dias, 'dia')})</span></div>
      <span class="row-value num due">${BRL(s.saldo)}</span></div>`;
  }).join('') || emptyMsg('Nenhum fiado em aberto');

  renderClientesInativos();
  renderAniversarios();

  $('dashUltimos').innerHTML = state.pedidos.slice(0, 5).map(p => ticketHTML(p)).join('') || emptyMsg('Nenhum pedido registrado ainda');
}

function variacaoHTML(atual, anterior, txt) {
  if (!anterior) return '';
  const v = (atual - anterior) / anterior * 100;
  const cls = v >= 0 ? 'up' : 'down';
  return `<span class="var ${cls}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(0)}% ${txt}</span>`;
}

function clientesSumidos() {
  const hoje = hojeISO();
  const limite = state.cfg.inatividade || 14;
  return [...statsClientes().entries()]
    .map(([cid, s]) => ({ c: clientePorId(cid), s, dias: diasEntre(s.ultimo, hoje) }))
    .filter(x => x.c && clienteAtivo(x.c) && x.s.qtd >= 3 && x.dias >= limite)
    .sort((a, b) => b.s.total - a.s.total);
}

function renderClientesInativos() {
  const lista = clientesSumidos().slice(0, 6);
  $('dashInativos').innerHTML = lista.map(({ c, s, dias }) => `
    <div class="row-item">
      <span class="avatar">${esc(iniciais(c.nome))}</span>
      <button class="row-main" data-ficha="${esc(c.id)}"><span class="row-title">${esc(c.nome)}</span>
        <span class="row-sub">sem pedir há ${dias} dias · já gastou ${BRL(s.total)}</span></button>
      ${c.whatsapp ? `<button class="btn btn-whats btn-sm" data-reativar="${esc(c.id)}">Chamar</button>` : ''}
    </div>`).join('') || emptyMsg('Todos os clientes frequentes estão pedindo');
  $('dashInativos').querySelectorAll('[data-reativar]').forEach(b => b.onclick = () => {
    const c = clientePorId(b.dataset.reativar);
    abrirLinkWhats(c?.whatsapp, `Oi, ${primeiroNome(c)}! Faz um tempinho que você não pede com a gente, tudo bem? Quer que eu separe uma marmita pra você hoje? 🍱`);
  });
}

function renderAniversarios() {
  if (!state.rec.clientesExtra) return;
  const mes = hojeISO().slice(5, 7);
  const lista = state.clientes.filter(c => clienteAtivo(c) && c.aniversario && c.aniversario.slice(5, 7) === mes)
    .sort((a, b) => a.aniversario.slice(8).localeCompare(b.aniversario.slice(8)));
  $('dashAniversariosWrap').classList.toggle('hidden', lista.length === 0);
  $('dashAniversarios').innerHTML = lista.map(c => `
    <div class="row-item"><span class="avatar">${esc(iniciais(c.nome))}</span>
      <button class="row-main" data-ficha="${esc(c.id)}"><span class="row-title">${esc(c.nome)}</span>
      <span class="row-sub">dia ${c.aniversario.slice(8, 10)}</span></button>
      ${c.whatsapp ? `<button class="btn btn-whats btn-sm" data-parabens="${esc(c.id)}">Parabéns</button>` : ''}</div>`).join('');
  $('dashAniversarios').querySelectorAll('[data-parabens]').forEach(b => b.onclick = () => {
    const c = clientePorId(b.dataset.parabens);
    abrirLinkWhats(c?.whatsapp, `Feliz aniversário, ${primeiroNome(c)}! 🎉 Muito obrigado por ser nosso cliente.`);
  });
}

function primeiroNome(c) { return (c?.apelido || c?.nome || '').trim().split(/\s+/)[0] || ''; }

// ---------------------------------------------------------
// NOVO PEDIDO
// ---------------------------------------------------------
let catPedidoAtiva = 'todas';
let formaRecPedido = 'pix';

function setupNovoPedido() {
  $('dataPedido').value = hojeISO();
  const busca = $('clienteBusca'), sug = $('clienteSugestoes');

  busca.addEventListener('input', () => {
    const qRaw = busca.value.trim();
    const q = normalize(qRaw), qd = soDigitos(qRaw);
    if (!q) { sug.classList.add('hidden'); return; }
    const stats = statsClientes();
    const matches = state.clientes.filter(c => clienteAtivo(c) && (
      normalize(c.nome).includes(q) || normalize(c.apelido).includes(q) || normalize(c.empresa).includes(q) ||
      (qd.length >= 4 && soDigitos(c.whatsapp).includes(qd))))
      .sort((a, b) => (stats.get(b.id)?.qtd || 0) - (stats.get(a.id)?.qtd || 0)).slice(0, 8);
    sug.innerHTML = matches.map(c => {
      const s = stats.get(c.id);
      return `<button type="button" class="suggestion-item" data-cliente-id="${esc(c.id)}">
        <span>${esc(c.nome)}${c.apelido ? ` <small>(${esc(c.apelido)})</small>` : ''}</span>
        <small>${s?.saldo > 0 ? `deve ${BRL(s.saldo)}` : c.empresa ? esc(c.empresa) : c.whatsapp ? esc(formatarTelefone(c.whatsapp)) : ''}</small></button>`;
    }).join('') + `<button type="button" class="suggestion-item suggestion-new" data-novo-cliente="1">Criar cliente “${esc(qRaw)}”</button>`;
    sug.classList.remove('hidden');
  });
  busca.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sug.querySelector('.suggestion-item')?.click(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.cliente-picker')) sug.classList.add('hidden'); });

  sug.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    sug.classList.add('hidden');
    if (item.dataset.novoCliente) { $('novoClienteBox').classList.remove('hidden'); $('novoClienteWhats').focus(); }
    else selecionarCliente(clientePorId(item.dataset.clienteId));
  });

  $('btnCriarCliente').addEventListener('click', async () => {
    const nome = busca.value.trim();
    const whats = $('novoClienteWhats').value.trim();
    if (!nome) return toast('Digite o nome do cliente', true);
    const dup = acharDuplicadoCliente(nome, whats);
    if (dup && !confirm(`Já existe "${dup.nome}" cadastrado. Criar outro mesmo assim?`)) { selecionarCliente(dup); $('novoClienteBox').classList.add('hidden'); return; }
    const { data, error } = await supabaseClient.from('clientes').insert({ nome, whatsapp: whats ? formatarTelefone(whats) : null }).select().single();
    if (error) return toast('Erro: ' + error.message, true);
    state.clientes.push(data);
    state.clientes.sort((a, b) => a.nome.localeCompare(b.nome));
    selecionarCliente(data);
    $('novoClienteBox').classList.add('hidden');
    $('novoClienteWhats').value = '';
    toast('Cliente criado ✓');
    renderClientesList();
  });

  document.querySelectorAll('.pay-opt').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    atualizarPagamentoUI();
  }));
  $('formaRecBox').addEventListener('click', (e) => {
    const b = e.target.closest('[data-forma]'); if (!b) return;
    formaRecPedido = b.dataset.forma; atualizarPagamentoUI();
  });
  $('taxaQuinzena').addEventListener('input', atualizarResumo);
  $('buscaProdutoPedido').addEventListener('input', renderProdutosGridPedido);
  $('catChipsPedido').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    catPedidoAtiva = b.dataset.cat; renderProdutosGridPedido();
  });
  $('btnCancelarEdicao').addEventListener('click', () => { resetFormPedido(); switchView('pedidos'); });
  $('formPedido').addEventListener('submit', salvarPedido);
  atualizarPagamentoUI();
}

function formaPagamentoAtual() { return document.querySelector('.pay-opt.active')?.dataset.pay || 'imediato'; }

function atualizarPagamentoUI() {
  const forma = formaPagamentoAtual();
  $('taxaBox').classList.toggle('hidden', forma !== 'quinzena');
  $('resumoTaxaRow').style.display = forma === 'quinzena' ? 'flex' : 'none';
  const mostraRec = forma === 'imediato' && state.rec.pedidosExtra && !state.pedidoEditando;
  $('formaRecBox').classList.toggle('hidden', !mostraRec);
  $('formaRecBox').innerHTML = FORMAS_REC.map(f =>
    `<button type="button" class="chip${f.id === formaRecPedido ? ' active' : ''}" data-forma="${f.id}">${f.nome}</button>`).join('');
  atualizarResumo();
}

function selecionarCliente(cliente) {
  if (!cliente) return;
  state.clienteSelecionado = cliente;
  const s = statsDe(cliente.id);
  const chip = $('clienteSelecionado');
  chip.classList.remove('hidden');
  chip.innerHTML = `<span class="avatar avatar-sm">${esc(iniciais(cliente.nome))}</span>
    <div class="chip-main"><strong>${esc(cliente.nome)}</strong>
    <small>${s.qtd ? `${plural(s.qtd, 'pedido')} · último em ${fmtData(s.ultimo)}` : 'cliente novo'}</small></div>
    ${s.qtd && !state.pedidoEditando ? '<button type="button" class="btn btn-ghost btn-sm" id="btnRepetir">Repetir último</button>' : ''}
    <button type="button" class="btn btn-ghost btn-sm" id="btnTrocarCliente">Trocar</button>`;
  $('clienteBusca').value = '';
  $('clienteBusca').classList.add('hidden');
  $('btnTrocarCliente').onclick = () => {
    state.clienteSelecionado = null;
    chip.classList.add('hidden'); $('clienteAviso').classList.add('hidden');
    $('clienteBusca').classList.remove('hidden'); $('clienteBusca').focus();
  };
  const rep = $('btnRepetir');
  if (rep) rep.onclick = () => repetirUltimoPedido(cliente.id);
  atualizarAvisoCliente();
}

function atualizarAvisoCliente() {
  const c = state.clienteSelecionado;
  const aviso = $('clienteAviso');
  if (!c) { aviso.classList.add('hidden'); return; }
  const s = statsDe(c.id);
  const msgs = [];
  if (s.saldo > 0.004) msgs.push(`Já deve <strong>${BRL(s.saldo)}</strong> (em aberto desde ${fmtData(s.maisAntigoAberto)}).`);
  const limite = num(c.limite_fiado);
  if (limite > 0 && formaPagamentoAtual() !== 'imediato') {
    const total = totalCarrinho() + s.saldo;
    if (total > limite) msgs.push(`Com este pedido passa do limite de fiado (${BRL(limite)}).`);
  }
  if (c.observacoes) msgs.push(`Obs.: ${esc(c.observacoes)}`);
  aviso.innerHTML = msgs.join('<br>');
  aviso.classList.toggle('hidden', msgs.length === 0);
  aviso.classList.toggle('aviso-forte', limite > 0 && totalCarrinho() + s.saldo > limite && formaPagamentoAtual() !== 'imediato');
}

function repetirUltimoPedido(clienteId) {
  const ultimo = state.pedidos.find(p => p.cliente_id === clienteId && (p.itens_pedido || []).length);
  if (!ultimo) return;
  state.carrinho = {};
  const faltando = [];
  ultimo.itens_pedido.forEach(it => {
    const prod = state.produtosTodos.find(p => p.id === it.produto_id);
    if (prod && prod.ativo) state.carrinho[it.produto_id] = (state.carrinho[it.produto_id] || 0) + num(it.quantidade);
    else faltando.push(it.produtos?.nome || 'item');
  });
  document.querySelectorAll('.pay-opt').forEach(b => b.classList.toggle('active', b.dataset.pay === ultimo.forma_pagamento));
  if (ultimo.forma_pagamento === 'quinzena') $('taxaQuinzena').value = num(ultimo.taxa_quinzena);
  renderProdutosGridPedido();
  atualizarPagamentoUI();
  toast(faltando.length ? `Itens repetidos. Desativado: ${faltando.join(', ')}` : `Repetido o pedido de ${fmtData(ultimo.data_pedido)} ✓`);
}

function editarPedido(pedidoId) {
  const p = state.pedidos.find(x => x.id === pedidoId);
  if (!p) return;
  state.pedidoEditando = pedidoId;
  resetFormPedido(true);
  const c = clientePorId(p.cliente_id) || p.clientes;
  if (c) selecionarCliente(c);
  state.carrinho = {};
  (p.itens_pedido || []).forEach(it => { state.carrinho[it.produto_id] = (state.carrinho[it.produto_id] || 0) + num(it.quantidade); });
  document.querySelectorAll('.pay-opt').forEach(b => b.classList.toggle('active', b.dataset.pay === p.forma_pagamento));
  $('taxaQuinzena').value = p.taxa_quinzena || 0;
  $('dataPedido').value = p.data_pedido;
  $('obsPedido').value = p.observacoes || '';
  $('btnSalvarPedido').textContent = 'Salvar alterações';
  $('btnCancelarEdicao').classList.remove('hidden');
  renderProdutosGridPedido();
  atualizarPagamentoUI();
  switchView('novo-pedido');
  $('viewTitle').textContent = 'Editar pedido';
}

function produtosParaGrid() {
  const ids = new Set(state.produtos.map(p => p.id));
  const extras = Object.keys(state.carrinho).filter(id => !ids.has(id))
    .map(id => state.produtosTodos.find(p => p.id === id)).filter(Boolean);
  return [...state.produtos, ...extras];
}

// produtos mais vendidos aparecem primeiro no novo pedido
function vendidosPorProduto() {
  const m = {};
  state.pedidos.forEach(p => (p.itens_pedido || []).forEach(it => { m[it.produto_id] = (m[it.produto_id] || 0) + num(it.quantidade); }));
  return m;
}

function renderProdutosGridPedido() {
  const grid = $('itensProdutos');
  const vendidos = vendidosPorProduto();
  let lista = produtosParaGrid().sort((a, b) => (vendidos[b.id] || 0) - (vendidos[a.id] || 0));

  // chips de categoria
  const cats = [...new Set(lista.map(p => p.categoria).filter(Boolean))].sort();
  $('catChipsPedido').classList.toggle('hidden', cats.length === 0);
  if (!cats.includes(catPedidoAtiva)) catPedidoAtiva = 'todas';
  $('catChipsPedido').innerHTML = cats.length ? ['todas', ...cats].map(c =>
    `<button type="button" class="chip${c === catPedidoAtiva ? ' active' : ''}" data-cat="${esc(c)}">${c === 'todas' ? 'Todas' : esc(c)}</button>`).join('') : '';

  const q = normalize($('buscaProdutoPedido').value.trim());
  if (catPedidoAtiva !== 'todas') lista = lista.filter(p => p.categoria === catPedidoAtiva || state.carrinho[p.id]);
  if (q) lista = lista.filter(p => normalize(p.nome).includes(q) || state.carrinho[p.id]);

  grid.innerHTML = lista.map(p => {
    const qtd = state.carrinho[p.id] || 0;
    return `
    <div class="produto-card${qtd ? ' active' : ''}" id="prodcard-${p.id}">
      <button type="button" class="produto-add" data-qty-plus="${p.id}" aria-label="Adicionar ${esc(p.nome)}">
        ${p.imagem_url ? `<img src="${esc(p.imagem_url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <span class="produto-nome">${esc(p.nome)}${!p.ativo ? ' <small>(desativado)</small>' : ''}</span>
        <span class="produto-preco num">${BRL(p.preco_venda)}</span>
      </button>
      <div class="qty-row">
        <button type="button" class="qty-btn" data-qty-minus="${p.id}" aria-label="Tirar um">−</button>
        <span class="qty-val num" id="qtyval-${p.id}">${qtd}</span>
        <button type="button" class="qty-btn" data-qty-plus="${p.id}" aria-label="Pôr mais um">+</button>
      </div>
    </div>`;
  }).join('') || emptyMsg(state.produtos.length ? 'Nenhum produto com esse filtro' : 'Cadastre produtos na tela Produtos');

  grid.querySelectorAll('[data-qty-plus]').forEach(b => b.onclick = () => alterarQtd(b.dataset.qtyPlus, 1));
  grid.querySelectorAll('[data-qty-minus]').forEach(b => b.onclick = () => alterarQtd(b.dataset.qtyMinus, -1));
  atualizarResumo();
}

function alterarQtd(produtoId, delta) {
  const nova = Math.max(0, (state.carrinho[produtoId] || 0) + delta);
  if (nova === 0) delete state.carrinho[produtoId]; else state.carrinho[produtoId] = nova;
  const val = $(`qtyval-${produtoId}`), card = $(`prodcard-${produtoId}`);
  if (val) val.textContent = nova;
  if (card) card.classList.toggle('active', nova > 0);
  atualizarResumo();
}

function totalCarrinho() {
  return Object.entries(state.carrinho).reduce((s, [id, q]) => {
    const p = state.produtosTodos.find(x => x.id === id);
    return s + (p ? num(p.preco_venda) * q : 0);
  }, 0);
}

function atualizarResumo() {
  const totalProdutos = totalCarrinho();
  const taxa = formaPagamentoAtual() === 'quinzena' ? num($('taxaQuinzena').value) : 0;
  $('resumoItens').innerHTML = Object.entries(state.carrinho).map(([id, q]) => {
    const p = state.produtosTodos.find(x => x.id === id);
    return p ? `<div class="resumo-row"><span>${q}× ${esc(p.nome)}</span><span class="num">${BRL(num(p.preco_venda) * q)}</span></div>` : '';
  }).join('');
  $('resumoProdutos').textContent = BRL(totalProdutos);
  $('resumoTaxa').textContent = BRL(taxa);
  $('resumoTotal').textContent = BRL(totalProdutos + taxa);
  if (state.clienteSelecionado) atualizarAvisoCliente();
}

async function salvarPedido(e) {
  e.preventDefault();
  if (!state.clienteSelecionado) return toast('Escolha ou crie um cliente', true);
  const itens = Object.entries(state.carrinho);
  if (!itens.length) return toast('Adicione pelo menos um item', true);

  const forma = formaPagamentoAtual();
  const taxa = forma === 'quinzena' ? num($('taxaQuinzena').value) : 0;
  const dataPedido = $('dataPedido').value || hojeISO();
  const obs = $('obsPedido').value.trim() || null;
  const editando = !!state.pedidoEditando;
  const btn = $('btnSalvarPedido');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    let valorProdutos = 0;
    const itensPayload = itens.map(([produtoId, qtd]) => {
      const prod = state.produtosTodos.find(p => p.id === produtoId);
      if (!prod) throw new Error('Um dos produtos não foi encontrado. Toque em Atualizar e tente de novo.');
      const subtotal = num(prod.preco_venda) * qtd;
      valorProdutos += subtotal;
      return { produto_id: produtoId, quantidade: qtd, preco_unitario: prod.preco_venda, custo_unitario: prod.custo, subtotal };
    });

    let pedidoId;
    if (editando) {
      pedidoId = state.pedidoEditando;
      const antigo = state.pedidos.find(p => p.id === pedidoId);
      // preserva o preço combinado nos itens que já existiam no pedido
      itensPayload.forEach(it => {
        const velho = (antigo?.itens_pedido || []).find(x => x.produto_id === it.produto_id);
        if (velho) {
          it.preco_unitario = velho.preco_unitario; it.custo_unitario = velho.custo_unitario;
          valorProdutos += num(velho.preco_unitario) * it.quantidade - it.subtotal;
          it.subtotal = num(velho.preco_unitario) * it.quantidade;
        }
      });
      const { error } = await supabaseClient.from('pedidos').update({
        cliente_id: state.clienteSelecionado.id, data_pedido: dataPedido, forma_pagamento: forma,
        taxa_quinzena: taxa, valor_produtos: valorProdutos, valor_total: valorProdutos + taxa, observacoes: obs,
      }).eq('id', pedidoId);
      if (error) throw error;
      const { error: errDel } = await supabaseClient.from('itens_pedido').delete().eq('pedido_id', pedidoId);
      if (errDel) throw errDel;
    } else {
      const pago = forma === 'imediato';
      const payload = {
        cliente_id: state.clienteSelecionado.id, data_pedido: dataPedido, forma_pagamento: forma, taxa_quinzena: taxa,
        status_pagamento: pago ? 'pago' : 'pendente', valor_produtos: valorProdutos, valor_total: valorProdutos + taxa,
        data_pagamento: pago ? dataPedido : null, observacoes: obs,
      };
      if (pago && state.rec.pedidosExtra) { payload.forma_recebimento = formaRecPedido; payload.valor_pago = valorProdutos + taxa; }
      const { data: pedido, error } = await supabaseClient.from('pedidos').insert(payload).select().single();
      if (error) throw error;
      pedidoId = pedido.id;
    }

    const { error: errItens } = await supabaseClient.from('itens_pedido').insert(itensPayload.map(it => ({ ...it, pedido_id: pedidoId })));
    if (errItens) throw errItens;

    toast(editando ? 'Pedido atualizado ✓' : `Pedido registrado: ${BRL(valorProdutos + taxa)} ✓`);
    const voltarParaFicha = editando && state.viewAnterior === 'cliente';
    resetFormPedido();
    await recarregarPedidos();
    switchView(voltarParaFicha ? 'cliente' : editando ? 'pedidos' : 'novo-pedido');
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar: ' + (err?.message || 'tente de novo'), true);
  } finally {
    btn.disabled = false;
    btn.textContent = state.pedidoEditando ? 'Salvar alterações' : 'Registrar pedido';
  }
}

function resetFormPedido(preservarEdicao) {
  state.carrinho = {};
  state.clienteSelecionado = null;
  if (!preservarEdicao) state.pedidoEditando = null;
  $('clienteSelecionado').classList.add('hidden');
  $('clienteAviso').classList.add('hidden');
  $('novoClienteBox').classList.add('hidden');
  $('clienteBusca').classList.remove('hidden');
  $('clienteBusca').value = '';
  $('obsPedido').value = '';
  $('taxaQuinzena').value = 0;
  $('buscaProdutoPedido').value = '';
  $('dataPedido').value = hojeISO();
  document.querySelectorAll('.pay-opt').forEach(b => b.classList.toggle('active', b.dataset.pay === 'imediato'));
  if (!preservarEdicao) {
    $('btnSalvarPedido').textContent = 'Registrar pedido';
    $('btnCancelarEdicao').classList.add('hidden');
  }
  renderProdutosGridPedido();
  atualizarPagamentoUI();
}

// usado pela ficha do cliente
function novoPedidoPara(clienteId) {
  if (state.pedidoEditando) resetFormPedido();
  switchView('novo-pedido');
  selecionarCliente(clientePorId(clienteId));
}

// ---------------------------------------------------------
// PEDIDOS (histórico completo)
// ---------------------------------------------------------
let limitePedidos = 50;
function setupPedidos() {
  ['filtroStatus', 'filtroForma', 'filtroDe', 'filtroAte'].forEach(id => $(id).addEventListener('change', () => { limitePedidos = 50; renderPedidosList(); }));
  $('buscaPedidos').addEventListener('input', () => { limitePedidos = 50; renderPedidosList(); });
  $('btnLimparFiltro').addEventListener('click', () => {
    $('filtroDe').value = ''; $('filtroAte').value = ''; $('filtroStatus').value = 'todos';
    $('filtroForma').value = 'todas'; $('buscaPedidos').value = '';
    limitePedidos = 50; renderPedidosList();
  });
  $('btnMaisPedidos').addEventListener('click', () => { limitePedidos += 100; renderPedidosList(); });
  setupEditItensPopup();
}

function pedidosFiltrados() {
  const de = $('filtroDe').value, ate = $('filtroAte').value;
  const status = $('filtroStatus').value, forma = $('filtroForma').value;
  const busca = normalize($('buscaPedidos').value.trim());
  return state.pedidos.filter(p => {
    if (de && p.data_pedido < de) return false;
    if (ate && p.data_pedido > ate) return false;
    if (status === 'pago' && p.status_pagamento !== 'pago') return false;
    if (status === 'pendente' && p.status_pagamento !== 'pendente') return false;
    if (status === 'parcial' && !(p.status_pagamento === 'pendente' && num(p.valor_pago) > 0)) return false;
    if (forma !== 'todas' && p.forma_pagamento !== forma) return false;
    if (busca) {
      const alvo = normalize([p.clientes?.nome, p.clientes?.apelido, p.observacoes,
        ...(p.itens_pedido || []).map(it => it.produtos?.nome)].join(' '));
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

function renderPedidosList() {
  const lista = pedidosFiltrados();
  const total = lista.reduce((s, p) => s + num(p.valor_total), 0);
  const aberto = lista.reduce((s, p) => s + saldoPedido(p), 0);
  $('pedidosResumo').innerHTML = `${plural(lista.length, 'pedido')} · <strong>${BRL(total)}</strong>${aberto > 0 ? ` · <span class="due">${BRL(aberto)} em aberto</span>` : ''}`;
  $('listaPedidos').innerHTML = lista.slice(0, limitePedidos).map(p => ticketHTML(p)).join('') || emptyMsg('Nenhum pedido encontrado');
  $('btnMaisPedidos').classList.toggle('hidden', lista.length <= limitePedidos);
  $('btnMaisPedidos').textContent = `Mostrar mais (${lista.length - Math.min(limitePedidos, lista.length)} restantes)`;
}

// ---------------------------------------------------------
// EDITAR PREÇOS DE UM PEDIDO (só este pedido)
// ---------------------------------------------------------
function abrirEditarItens(pedidoId) {
  const p = state.pedidos.find(x => x.id === pedidoId);
  if (!p || !(p.itens_pedido || []).length) return;
  state.itensEditando = pedidoId;
  $('editItensCliente').textContent = p.clientes?.nome || '—';
  $('editItensLista').innerHTML = p.itens_pedido.map(it => `
    <div class="edit-item-row">
      <div class="edit-item-nome">${esc(it.produtos?.nome || 'Item')} <small>×${num(it.quantidade)}</small></div>
      <div class="money-input"><span>R$</span><input type="number" min="0" step="0.01" inputmode="decimal"
        value="${num(it.preco_unitario).toFixed(2)}" data-item-preco="${it.id}" data-item-qtd="${num(it.quantidade)}"></div>
      <div class="edit-item-subtotal num" data-item-subtotal="${it.id}"></div>
    </div>`).join('');
  $('editItensLista').querySelectorAll('[data-item-preco]').forEach(inp => inp.addEventListener('input', () => previewEditItens(p)));
  previewEditItens(p);
  openSheet('editItensOverlay');
}
function previewEditItens(p) {
  let total = 0;
  $('editItensLista').querySelectorAll('[data-item-preco]').forEach(inp => {
    const sub = Math.max(0, num(inp.value)) * num(inp.dataset.itemQtd);
    total += sub;
    $('editItensLista').querySelector(`[data-item-subtotal="${inp.dataset.itemPreco}"]`).textContent = BRL(sub);
  });
  $('editItensTotalProdutos').textContent = BRL(total);
  $('editItensTotalGeral').textContent = BRL(total + num(p.taxa_quinzena));
}
async function salvarEditItens() {
  const p = state.pedidos.find(x => x.id === state.itensEditando);
  if (!p) return;
  const btn = $('editItensSalvar');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    let valorProdutos = 0;
    for (const inp of $('editItensLista').querySelectorAll('[data-item-preco]')) {
      const preco = Math.max(0, num(inp.value));
      const subtotal = preco * num(inp.dataset.itemQtd);
      valorProdutos += subtotal;
      const { error } = await supabaseClient.from('itens_pedido').update({ preco_unitario: preco, subtotal }).eq('id', inp.dataset.itemPreco);
      if (error) throw error;
    }
    const { error } = await supabaseClient.from('pedidos')
      .update({ valor_produtos: valorProdutos, valor_total: valorProdutos + num(p.taxa_quinzena) }).eq('id', p.id);
    if (error) throw error;
    toast('Preços deste pedido atualizados ✓');
    closeSheet('editItensOverlay');
    state.itensEditando = null;
    await recarregarPedidos();
  } catch (err) {
    toast('Erro ao salvar: ' + (err?.message || 'tente de novo'), true);
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar preços';
  }
}
function setupEditItensPopup() {
  $('editItensSalvar').addEventListener('click', salvarEditItens);
  $('editItensCancelar').addEventListener('click', () => { state.itensEditando = null; closeSheet('editItensOverlay'); });
}
