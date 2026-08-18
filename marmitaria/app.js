// =========================================================
// MARMITA CONTROL — app.js
// =========================================================

const state = {
  clientes: [],
  produtos: [],
  pedidos: [],       // pedidos com itens e cliente já anexados
  carrinho: {},       // { produto_id: quantidade }
  clienteSelecionado: null,
  view: 'dashboard',
  pedidoEditando: null,   // id do pedido em edição, ou null se for um novo pedido
  editClienteId: null,
  editProdutoId: null,
};

// Ícones estilo SF Symbols (line icons) usados na navegação mobile/desktop
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/></svg>',
  'novo-pedido': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  pedidos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><circle cx="4" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.1" fill="currentColor" stroke="none"/></svg>',
  cobranca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M5 4h12l-2.5 4L17 12H5"/></svg>',
  mais: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/></svg>',
  produtos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z"/><path d="M3.5 8v8L12 20l8.5-4V8"/><path d="M12 12v8"/></svg>',
  financeiro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M14.7 9.8c0-1-.9-1.8-2.4-1.8-1.6 0-2.6.8-2.6 1.9 0 2.6 5.2 1.2 5.2 3.8 0 1.1-1.1 2-2.7 2s-2.7-.7-2.8-1.8"/></svg>',
};

const BRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = isError ? 'var(--danger)' : 'var(--text-main)';
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function fmtData(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function hojeISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// =========================================================
// INIT
// =========================================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('COLE_AQUI')) {
    document.getElementById('configWarning').classList.remove('hidden');
  }

  updateClock();
  setInterval(updateClock, 60000);

  setupNav();
  setupNovoPedidoForm();
  setupClientesForm();
  setupProdutosForm();
  setupFiltroPedidos();
  document.getElementById('finPeriodo').addEventListener('change', renderFinanceiro);

  await refreshAll();
  switchView('dashboard');
}

async function refreshAll() {
  await Promise.all([loadClientes(), loadProdutos(), loadPedidos()]);
  renderAllViews();
}

function updateClock() {
  const now = new Date();
  const txt = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  document.getElementById('clockDate').textContent = txt;
  document.getElementById('topbarDate').textContent = txt;
}

// =========================================================
// NAV
// =========================================================
const VIEW_TITLES = {
  dashboard: 'Painel', 'novo-pedido': 'Novo pedido', pedidos: 'Pedidos',
  cobranca: 'Cobrança', clientes: 'Clientes', produtos: 'Produtos', financeiro: 'Financeiro',
};

function setupNav() {
  // injeta os ícones nos itens de navegação (sidebar + tab bar + menu "Mais")
  document.querySelectorAll('.nav-item').forEach(btn => {
    const ico = btn.querySelector('.nav-ico');
    if (ico && ICONS[btn.dataset.view]) ico.innerHTML = ICONS[btn.dataset.view];
  });
  document.querySelectorAll('.bn-ico').forEach(span => {
    const view = span.closest('[data-view]')?.dataset.view;
    if (view && ICONS[view]) span.innerHTML = ICONS[view];
  });

  document.querySelectorAll('.nav-item, .bn-item, .mais-item, [data-goto]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view || btn.dataset.goto;
      if (!v) return;
      if (v === 'mais') { openSheet('maisOverlay'); return; }
      if (btn.classList.contains('mais-item')) closeSheet('maisOverlay');
      if (v === 'novo-pedido' && state.pedidoEditando) resetFormPedido();
      switchView(v);
    });
  });

  document.getElementById('maisOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'maisOverlay') closeSheet('maisOverlay');
  });
}

// =========================================================
// SHEET / MODAL helpers (usados pelo menu "Mais" e pelas edições)
// =========================================================
function openSheet(id) {
  document.getElementById(id).classList.remove('hidden');
  requestAnimationFrame(() => document.getElementById(id).classList.add('show'));
}
function closeSheet(id) {
  const el = document.getElementById(id);
  el.classList.remove('show');
  setTimeout(() => el.classList.add('hidden'), 250);
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('viewTitle').textContent = VIEW_TITLES[view] || view;

  const dentroDoMais = ['clientes', 'produtos', 'financeiro'].includes(view);
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.bn-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view || (b.dataset.view === 'mais' && dentroDoMais))
  );

  window.scrollTo(0, 0);
  const scroller = document.querySelector('.view-scroll');
  if (scroller) scroller.scrollTop = 0;

  if (view === 'financeiro') renderFinanceiro();
}

function renderAllViews() {
  renderDashboard();
  renderProdutosGridPedido();
  renderPedidosList();
  renderCobranca();
  renderClientesList();
  renderProdutosList();
  if (state.view === 'financeiro') renderFinanceiro();
}

// =========================================================
// DATA LOADING
// =========================================================
async function loadClientes() {
  const { data, error } = await supabaseClient.from('clientes').select('*').order('nome');
  if (error) return toast('Erro ao carregar clientes: ' + error.message, true);
  state.clientes = data || [];
}

async function loadProdutos() {
  const { data, error } = await supabaseClient.from('produtos').select('*').eq('ativo', true).order('nome');
  if (error) return toast('Erro ao carregar produtos: ' + error.message, true);
  state.produtos = data || [];
}

async function loadPedidos() {
  const { data, error } = await supabaseClient
    .from('pedidos')
    .select('*, clientes(id,nome,whatsapp), itens_pedido(*, produtos(nome))')
    .order('data_pedido', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return toast('Erro ao carregar pedidos: ' + error.message, true);
  state.pedidos = data || [];
}

// =========================================================
// DASHBOARD
// =========================================================
function renderDashboard() {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);

  const pedidosHoje = state.pedidos.filter(p => p.data_pedido === hoje);
  const pedidosMes = state.pedidos.filter(p => p.data_pedido.slice(0, 7) === mesAtual);
  const pendentes = state.pedidos.filter(p => p.status_pagamento === 'pendente');

  const totalHoje = pedidosHoje.reduce((s, p) => s + Number(p.valor_total), 0);
  const totalMes = pedidosMes.reduce((s, p) => s + Number(p.valor_total), 0);
  const totalPendente = pendentes.reduce((s, p) => s + Number(p.valor_total), 0);
  const custoMes = pedidosMes.reduce((s, p) => s + custoPedido(p), 0);
  const lucroMes = totalMes - custoMes;
  const margem = totalMes > 0 ? (lucroMes / totalMes * 100) : 0;

  const clientesDevendo = new Set(pendentes.map(p => p.cliente_id)).size;

  document.getElementById('kpiHoje').textContent = BRL(totalHoje);
  document.getElementById('kpiHojeCount').textContent = `${pedidosHoje.length} pedido${pedidosHoje.length === 1 ? '' : 's'}`;
  document.getElementById('kpiAReceber').textContent = BRL(totalPendente);
  document.getElementById('kpiAReceberCount').textContent = `${clientesDevendo} cliente${clientesDevendo === 1 ? '' : 's'} devendo`;
  document.getElementById('kpiMes').textContent = BRL(totalMes);
  document.getElementById('kpiMesCount').textContent = `${pedidosMes.length} pedido${pedidosMes.length === 1 ? '' : 's'}`;
  document.getElementById('kpiLucro').textContent = BRL(lucroMes);
  document.getElementById('kpiLucroMargem').textContent = `margem ${margem.toFixed(0)}%`;

  document.getElementById('dashPendentes').innerHTML =
    pendentes.slice(0, 5).map(ticketHTML).join('') || emptyMsg('Nenhuma pendência 🎉');
  document.getElementById('dashUltimos').innerHTML =
    state.pedidos.slice(0, 5).map(ticketHTML).join('') || emptyMsg('Nenhum pedido registrado ainda');

  bindTicketActions();
}

function custoPedido(pedido) {
  return (pedido.itens_pedido || []).reduce((s, it) => s + Number(it.custo_unitario) * Number(it.quantidade), 0);
}

function emptyMsg(txt) {
  return `<div class="simple-item" style="justify-content:center;color:var(--text-muted)">${txt}</div>`;
}

// =========================================================
// TICKET RENDERING (shared by dashboard / pedidos / cobranca)
// =========================================================
function ticketHTML(p) {
  const cliente = p.clientes?.nome || '—';
  const itensTxt = (p.itens_pedido || [])
    .map(it => `${it.quantidade}x ${it.produtos?.nome || 'item'}`)
    .join(', ');
  const pago = p.status_pagamento === 'pago';
  const stamp = pago
    ? `<span class="stamp stamp-success">✓ Pago</span>`
    : `<span class="stamp stamp-danger">Pendente</span>`;
  const taxaTxt = Number(p.taxa_quinzena) > 0 ? ` <span style="color:var(--accent-dark)">+ ${BRL(p.taxa_quinzena)} taxa</span>` : '';
  const formaTxt = p.forma_pagamento === 'quinzena' ? 'Quinzena' : 'Na hora';

  const actionBtn = pago
    ? ''
    : `<button class="btn btn-success btn-sm" data-marcar-pago="${p.id}">Marcar pago</button>`;
  const whatsBtn = (!pago && p.clientes?.whatsapp)
    ? `<button class="btn btn-whats btn-sm" data-whats-pedido="${p.id}">WhatsApp</button>`
    : '';
  const editBtn = `<button class="btn btn-edit btn-sm" data-edit-pedido="${p.id}">Editar</button>`;
  const delBtn = `<button class="btn btn-ghost btn-sm" data-del-pedido="${p.id}">Excluir</button>`;

  return `
  <div class="ticket">
    <div class="ticket-top">
      <div>
        <div class="ticket-cliente">${cliente}</div>
        <div class="ticket-meta">${fmtData(p.data_pedido)} · ${formaTxt}</div>
      </div>
      ${stamp}
    </div>
    <div class="ticket-itens">${itensTxt || 'sem itens'}</div>
    <div class="ticket-foot">
      <span class="ticket-total">${BRL(p.valor_total)}${taxaTxt}</span>
      <div class="ticket-actions">${whatsBtn}${editBtn}${actionBtn}${delBtn}</div>
    </div>
  </div>`;
}

function bindTicketActions() {
  document.querySelectorAll('[data-marcar-pago]').forEach(btn => {
    btn.onclick = () => marcarPago(btn.dataset.marcarPago);
  });
  document.querySelectorAll('[data-del-pedido]').forEach(btn => {
    btn.onclick = () => excluirPedido(btn.dataset.delPedido);
  });
  document.querySelectorAll('[data-whats-pedido]').forEach(btn => {
    btn.onclick = () => {
      const p = state.pedidos.find(x => x.id === btn.dataset.whatsPedido);
      if (p) abrirWhatsapp(p.clientes, [p]);
    };
  });
  document.querySelectorAll('[data-edit-pedido]').forEach(btn => {
    btn.onclick = () => editarPedido(btn.dataset.editPedido);
  });
}

async function marcarPago(pedidoId) {
  const { error } = await supabaseClient
    .from('pedidos')
    .update({ status_pagamento: 'pago', data_pagamento: hojeISO() })
    .eq('id', pedidoId);
  if (error) return toast('Erro: ' + error.message, true);
  toast('Pedido marcado como pago ✓');
  await loadPedidos();
  renderAllViews();
}

async function excluirPedido(pedidoId) {
  if (!confirm('Excluir este pedido? Essa ação não pode ser desfeita.')) return;
  const { error } = await supabaseClient.from('pedidos').delete().eq('id', pedidoId);
  if (error) return toast('Erro: ' + error.message, true);
  toast('Pedido excluído');
  await loadPedidos();
  renderAllViews();
}

function abrirWhatsapp(cliente, pedidosDoCliente) {
  if (!cliente?.whatsapp) return toast('Este cliente não tem WhatsApp cadastrado', true);
  const total = pedidosDoCliente.reduce((s, p) => s + Number(p.valor_total), 0);
  const linhas = pedidosDoCliente.map(p => {
    const itens = (p.itens_pedido || []).map(it => `${it.quantidade}x ${it.produtos?.nome}`).join(', ');
    return `• ${fmtData(p.data_pedido)} — ${itens} — ${BRL(p.valor_total)}`;
  }).join('\n');
  const msg = `Olá, ${cliente.nome}! Passando para lembrar da sua conta em aberto:\n\n${linhas}\n\n*Total: ${BRL(total)}*\n\nPode confirmar o pagamento? 🙏`;
  const numero = cliente.whatsapp.replace(/\D/g, '');
  const numeroFinal = numero.length <= 11 ? '55' + numero : numero;
  window.open(`https://wa.me/${numeroFinal}?text=${encodeURIComponent(msg)}`, '_blank');
}

// =========================================================
// NOVO PEDIDO
// =========================================================
function setupNovoPedidoForm() {
  const busca = document.getElementById('clienteBusca');
  const sugestoes = document.getElementById('clienteSugestoes');

  busca.addEventListener('input', () => {
    const q = busca.value.trim().toLowerCase();
    if (!q) { sugestoes.classList.add('hidden'); return; }
    const matches = state.clientes.filter(c => c.nome.toLowerCase().includes(q));
    let html = matches.map(c =>
      `<div class="suggestion-item" data-cliente-id="${c.id}">${c.nome}${c.whatsapp ? ' <span style="color:var(--text-muted)">· ' + c.whatsapp + '</span>' : ''}</div>`
    ).join('');
    html += `<div class="suggestion-item" style="color:var(--accent-dark);font-weight:700" data-novo-cliente="1">+ criar cliente "${busca.value.trim()}"</div>`;
    sugestoes.innerHTML = html;
    sugestoes.classList.remove('hidden');
  });

  sugestoes.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    if (item.dataset.novoCliente) {
      document.getElementById('novoClienteBox').classList.remove('hidden');
      sugestoes.classList.add('hidden');
    } else {
      const cliente = state.clientes.find(c => c.id === item.dataset.clienteId);
      selecionarCliente(cliente);
      sugestoes.classList.add('hidden');
    }
  });

  document.getElementById('btnCriarCliente').addEventListener('click', async () => {
    const nome = busca.value.trim();
    const whats = document.getElementById('novoClienteWhats').value.trim();
    if (!nome) return toast('Digite o nome do cliente', true);
    const { data, error } = await supabaseClient.from('clientes').insert({ nome, whatsapp: whats || null }).select().single();
    if (error) return toast('Erro: ' + error.message, true);
    state.clientes.push(data);
    selecionarCliente(data);
    document.getElementById('novoClienteBox').classList.add('hidden');
    document.getElementById('novoClienteWhats').value = '';
    toast('Cliente criado ✓');
  });

  document.querySelectorAll('.pay-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isQuinzena = btn.dataset.pay === 'quinzena';
      document.getElementById('taxaBox').classList.toggle('hidden', !isQuinzena);
      document.getElementById('resumoTaxaRow').style.display = isQuinzena ? 'flex' : 'none';
      atualizarResumo();
    });
  });

  document.getElementById('taxaQuinzena').addEventListener('input', atualizarResumo);

  document.getElementById('formPedido').addEventListener('submit', salvarPedido);
}

function selecionarCliente(cliente) {
  state.clienteSelecionado = cliente;
  const chip = document.getElementById('clienteSelecionado');
  chip.classList.remove('hidden');
  chip.innerHTML = `<span>${cliente.nome}${cliente.whatsapp ? ' · ' + cliente.whatsapp : ' · sem WhatsApp'}</span><button type="button" id="btnTrocarCliente">trocar</button>`;
  document.getElementById('clienteBusca').value = '';
  document.getElementById('clienteBusca').classList.add('hidden');
  document.getElementById('btnTrocarCliente').onclick = () => {
    state.clienteSelecionado = null;
    chip.classList.add('hidden');
    document.getElementById('clienteBusca').classList.remove('hidden');
  };
}

function editarPedido(pedidoId) {
  const p = state.pedidos.find(x => x.id === pedidoId);
  if (!p) return;

  state.pedidoEditando = pedidoId;
  resetFormPedido(true); // limpa mas preserva o modo de edição

  if (p.clientes) selecionarCliente(p.clientes);

  state.carrinho = {};
  (p.itens_pedido || []).forEach(it => { state.carrinho[it.produto_id] = Number(it.quantidade); });
  renderProdutosGridPedido();
  Object.entries(state.carrinho).forEach(([id, qtd]) => {
    const val = document.getElementById(`qtyval-${id}`);
    const card = document.getElementById(`prodcard-${id}`);
    if (val) val.textContent = qtd;
    if (card) card.classList.toggle('active', qtd > 0);
  });

  document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('active'));
  const payBtn = document.querySelector(`.pay-opt[data-pay="${p.forma_pagamento}"]`);
  if (payBtn) payBtn.classList.add('active');
  const isQuinzena = p.forma_pagamento === 'quinzena';
  document.getElementById('taxaBox').classList.toggle('hidden', !isQuinzena);
  document.getElementById('resumoTaxaRow').style.display = isQuinzena ? 'flex' : 'none';
  document.getElementById('taxaQuinzena').value = p.taxa_quinzena || 0;
  document.getElementById('obsPedido').value = p.observacoes || '';
  atualizarResumo();

  document.getElementById('btnSalvarPedido').textContent = 'Salvar alterações';
  mostrarBotaoCancelarEdicao(true);

  switchView('novo-pedido');
  document.getElementById('viewTitle').textContent = 'Editar pedido';
}

function mostrarBotaoCancelarEdicao(mostrar) {
  let btn = document.getElementById('btnCancelarEdicao');
  if (mostrar) {
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btnCancelarEdicao';
      btn.className = 'btn btn-ghost btn-block';
      btn.style.marginTop = '10px';
      btn.textContent = 'Cancelar edição';
      btn.onclick = () => { resetFormPedido(); switchView('pedidos'); };
      document.getElementById('formPedido').appendChild(btn);
    }
  } else if (btn) {
    btn.remove();
  }
}

function renderProdutosGridPedido() {
  const grid = document.getElementById('itensProdutos');
  grid.innerHTML = state.produtos.map(p => `
    <div class="produto-card" id="prodcard-${p.id}">
      <span class="produto-nome">${p.nome}</span>
      <span class="produto-preco">${BRL(p.preco_venda)}</span>
      <div class="qty-row">
        <button type="button" class="qty-btn" data-qty-minus="${p.id}">−</button>
        <span class="qty-val" id="qtyval-${p.id}">0</span>
        <button type="button" class="qty-btn" data-qty-plus="${p.id}">+</button>
      </div>
    </div>
  `).join('') || emptyMsg('Cadastre produtos na aba "Produtos" primeiro');

  grid.querySelectorAll('[data-qty-plus]').forEach(b => b.onclick = () => alterarQtd(b.dataset.qtyPlus, 1));
  grid.querySelectorAll('[data-qty-minus]').forEach(b => b.onclick = () => alterarQtd(b.dataset.qtyMinus, -1));
}

function alterarQtd(produtoId, delta) {
  const atual = state.carrinho[produtoId] || 0;
  const nova = Math.max(0, atual + delta);
  if (nova === 0) delete state.carrinho[produtoId];
  else state.carrinho[produtoId] = nova;

  document.getElementById(`qtyval-${produtoId}`).textContent = nova;
  document.getElementById(`prodcard-${produtoId}`).classList.toggle('active', nova > 0);
  atualizarResumo();
}

function atualizarResumo() {
  let totalProdutos = 0;
  for (const [id, qtd] of Object.entries(state.carrinho)) {
    const prod = state.produtos.find(p => p.id === id);
    if (prod) totalProdutos += Number(prod.preco_venda) * qtd;
  }
  const isQuinzena = document.querySelector('.pay-opt.active')?.dataset.pay === 'quinzena';
  const taxa = isQuinzena ? (Number(document.getElementById('taxaQuinzena').value) || 0) : 0;

  document.getElementById('resumoProdutos').textContent = BRL(totalProdutos);
  document.getElementById('resumoTaxa').textContent = BRL(taxa);
  document.getElementById('resumoTotal').textContent = BRL(totalProdutos + taxa);
}

async function salvarPedido(e) {
  e.preventDefault();
  if (!state.clienteSelecionado) return toast('Selecione ou crie um cliente', true);
  const itens = Object.entries(state.carrinho);
  if (itens.length === 0) return toast('Adicione ao menos um item', true);

  const isQuinzena = document.querySelector('.pay-opt.active')?.dataset.pay === 'quinzena';
  const taxa = isQuinzena ? (Number(document.getElementById('taxaQuinzena').value) || 0) : 0;
  const editando = !!state.pedidoEditando;

  let valorProdutos = 0;
  const itensPayload = itens.map(([produtoId, qtd]) => {
    const prod = state.produtos.find(p => p.id === produtoId);
    const subtotal = Number(prod.preco_venda) * qtd;
    valorProdutos += subtotal;
    return {
      produto_id: produtoId,
      quantidade: qtd,
      preco_unitario: prod.preco_venda,
      custo_unitario: prod.custo,
      subtotal,
    };
  });

  const btn = document.getElementById('btnSalvarPedido');
  btn.disabled = true; btn.textContent = 'Salvando...';

  let pedidoId;
  if (editando) {
    pedidoId = state.pedidoEditando;
    const { error } = await supabaseClient.from('pedidos').update({
      cliente_id: state.clienteSelecionado.id,
      forma_pagamento: isQuinzena ? 'quinzena' : 'imediato',
      taxa_quinzena: taxa,
      valor_produtos: valorProdutos,
      valor_total: valorProdutos + taxa,
      observacoes: document.getElementById('obsPedido').value.trim() || null,
    }).eq('id', pedidoId);
    if (error) {
      btn.disabled = false; btn.textContent = 'Salvar alterações';
      return toast('Erro ao salvar alterações: ' + error.message, true);
    }
    const { error: errDel } = await supabaseClient.from('itens_pedido').delete().eq('pedido_id', pedidoId);
    if (errDel) toast('Aviso: erro ao atualizar itens antigos: ' + errDel.message, true);
  } else {
    const { data: pedido, error } = await supabaseClient.from('pedidos').insert({
      cliente_id: state.clienteSelecionado.id,
      data_pedido: hojeISO(),
      forma_pagamento: isQuinzena ? 'quinzena' : 'imediato',
      taxa_quinzena: taxa,
      status_pagamento: isQuinzena ? 'pendente' : 'pago',
      valor_produtos: valorProdutos,
      valor_total: valorProdutos + taxa,
      data_pagamento: isQuinzena ? null : hojeISO(),
      observacoes: document.getElementById('obsPedido').value.trim() || null,
    }).select().single();
    if (error) {
      btn.disabled = false; btn.textContent = 'Registrar pedido';
      return toast('Erro ao salvar pedido: ' + error.message, true);
    }
    pedidoId = pedido.id;
  }

  const { error: errItens } = await supabaseClient.from('itens_pedido').insert(
    itensPayload.map(it => ({ ...it, pedido_id: pedidoId }))
  );
  if (errItens) toast('Pedido salvo, mas houve erro nos itens: ' + errItens.message, true);

  toast(editando ? 'Pedido atualizado ✓' : 'Pedido registrado ✓');
  resetFormPedido();
  await loadPedidos();
  renderAllViews();
  switchView('pedidos');
  btn.disabled = false; btn.textContent = 'Registrar pedido';
}

function resetFormPedido(preservarEdicao) {
  state.carrinho = {};
  state.clienteSelecionado = null;
  if (!preservarEdicao) state.pedidoEditando = null;
  document.getElementById('clienteSelecionado').classList.add('hidden');
  document.getElementById('clienteBusca').classList.remove('hidden');
  document.getElementById('clienteBusca').value = '';
  document.getElementById('obsPedido').value = '';
  document.getElementById('taxaQuinzena').value = 0;
  document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('active'));
  document.querySelector('.pay-opt[data-pay="imediato"]').classList.add('active');
  document.getElementById('taxaBox').classList.add('hidden');
  document.getElementById('resumoTaxaRow').style.display = 'none';
  if (!preservarEdicao) {
    document.getElementById('btnSalvarPedido').textContent = 'Registrar pedido';
    mostrarBotaoCancelarEdicao(false);
  }
  renderProdutosGridPedido();
  atualizarResumo();
}

// =========================================================
// PEDIDOS (lista/histórico)
// =========================================================
function setupFiltroPedidos() {
  document.getElementById('filtroData').addEventListener('change', renderPedidosList);
  document.getElementById('filtroStatus').addEventListener('change', renderPedidosList);
  document.getElementById('btnLimparFiltro').addEventListener('click', () => {
    document.getElementById('filtroData').value = '';
    document.getElementById('filtroStatus').value = 'todos';
    renderPedidosList();
  });
}

function renderPedidosList() {
  const data = document.getElementById('filtroData').value;
  const status = document.getElementById('filtroStatus').value;
  let lista = state.pedidos;
  if (data) lista = lista.filter(p => p.data_pedido === data);
  if (status !== 'todos') lista = lista.filter(p => p.status_pagamento === status);

  document.getElementById('listaPedidos').innerHTML = lista.map(ticketHTML).join('') || emptyMsg('Nenhum pedido encontrado');
  bindTicketActions();
}

// =========================================================
// COBRANÇA
// =========================================================
function renderCobranca() {
  const pendentes = state.pedidos.filter(p => p.status_pagamento === 'pendente');
  const porCliente = {};
  pendentes.forEach(p => {
    const cid = p.cliente_id;
    if (!porCliente[cid]) porCliente[cid] = { cliente: p.clientes, pedidos: [], total: 0 };
    porCliente[cid].pedidos.push(p);
    porCliente[cid].total += Number(p.valor_total);
  });

  const grupos = Object.values(porCliente).sort((a, b) => b.total - a.total);

  document.getElementById('listaCobranca').innerHTML = grupos.map(g => {
    const itensResumo = g.pedidos.map(p => {
      const itens = (p.itens_pedido || []).map(it => `${it.quantidade}x ${it.produtos?.nome}`).join(', ');
      return `${fmtData(p.data_pedido)}: ${itens} (${BRL(p.valor_total)})`;
    }).join('<br>');
    return `
    <div class="ticket">
      <div class="ticket-top">
        <div>
          <div class="ticket-cliente">${g.cliente?.nome || '—'}</div>
          <div class="ticket-meta">${g.pedidos.length} pedido${g.pedidos.length === 1 ? '' : 's'} em aberto ${g.cliente?.whatsapp ? '· ' + g.cliente.whatsapp : '· sem WhatsApp cadastrado'}</div>
        </div>
        <span class="stamp stamp-danger">Deve</span>
      </div>
      <div class="ticket-itens">${itensResumo}</div>
      <div class="ticket-foot">
        <span class="ticket-total">${BRL(g.total)}</span>
        <div class="ticket-actions">
          <button class="btn btn-whats btn-sm" data-cobrar-cliente="${g.cliente?.id}">WhatsApp</button>
          <button class="btn btn-success btn-sm" data-pagar-tudo="${g.cliente?.id}">Marcar tudo pago</button>
        </div>
      </div>
    </div>`;
  }).join('') || emptyMsg('Ninguém devendo — tudo em dia 🎉');

  document.querySelectorAll('[data-cobrar-cliente]').forEach(btn => {
    btn.onclick = () => {
      const g = grupos.find(x => x.cliente?.id === btn.dataset.cobrarCliente);
      if (g) abrirWhatsapp(g.cliente, g.pedidos);
    };
  });
  document.querySelectorAll('[data-pagar-tudo]').forEach(btn => {
    btn.onclick = () => marcarTudoPago(btn.dataset.pagarTudo);
  });
}

async function marcarTudoPago(clienteId) {
  const ids = state.pedidos.filter(p => p.cliente_id === clienteId && p.status_pagamento === 'pendente').map(p => p.id);
  if (ids.length === 0) return;
  if (!confirm(`Marcar ${ids.length} pedido(s) como pago(s)?`)) return;
  const { error } = await supabaseClient.from('pedidos')
    .update({ status_pagamento: 'pago', data_pagamento: hojeISO() })
    .in('id', ids);
  if (error) return toast('Erro: ' + error.message, true);
  toast('Pagamentos confirmados ✓');
  await loadPedidos();
  renderAllViews();
}

// =========================================================
// CLIENTES (CRUD)
// =========================================================
function setupClientesForm() {
  document.getElementById('formNovoCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('clNome').value.trim();
    const whats = document.getElementById('clWhats').value.trim();
    if (!nome) return;
    const { data, error } = await supabaseClient.from('clientes').insert({ nome, whatsapp: whats || null }).select().single();
    if (error) return toast('Erro: ' + error.message, true);
    state.clientes.push(data);
    state.clientes.sort((a, b) => a.nome.localeCompare(b.nome));
    document.getElementById('clNome').value = '';
    document.getElementById('clWhats').value = '';
    toast('Cliente adicionado ✓');
    renderClientesList();
  });

  document.getElementById('editClCancel').addEventListener('click', () => closeSheet('editClienteOverlay'));
  document.getElementById('editClienteOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'editClienteOverlay') closeSheet('editClienteOverlay');
  });
  document.getElementById('editClSalvar').addEventListener('click', async () => {
    const nome = document.getElementById('editClNome').value.trim();
    const whats = document.getElementById('editClWhats').value.trim();
    if (!nome) return toast('O nome não pode ficar vazio', true);
    const { error } = await supabaseClient.from('clientes')
      .update({ nome, whatsapp: whats || null })
      .eq('id', state.editClienteId);
    if (error) return toast('Erro: ' + error.message, true);
    toast('Cliente atualizado ✓');
    closeSheet('editClienteOverlay');
    await refreshAll();
  });
}

function abrirEditCliente(id) {
  const c = state.clientes.find(x => x.id === id);
  if (!c) return;
  state.editClienteId = id;
  document.getElementById('editClNome').value = c.nome || '';
  document.getElementById('editClWhats').value = c.whatsapp || '';
  openSheet('editClienteOverlay');
}

function renderClientesList() {
  document.getElementById('listaClientes').innerHTML = state.clientes.map(c => {
    const pendentesCliente = state.pedidos.filter(p => p.cliente_id === c.id && p.status_pagamento === 'pendente');
    const deve = pendentesCliente.reduce((s, p) => s + Number(p.valor_total), 0);
    return `
    <div class="simple-item">
      <div class="simple-item-main">
        <span class="simple-item-name">${c.nome}</span>
        <span class="simple-item-sub">${c.whatsapp || 'sem WhatsApp'} ${deve > 0 ? '· deve ' + BRL(deve) : ''}</span>
      </div>
      <div class="simple-item-actions">
        <button class="btn btn-edit btn-sm" data-edit-cliente="${c.id}">Editar</button>
        <button class="btn btn-ghost btn-sm" data-del-cliente="${c.id}">Excluir</button>
      </div>
    </div>`;
  }).join('') || emptyMsg('Nenhum cliente cadastrado ainda');

  document.querySelectorAll('[data-edit-cliente]').forEach(btn => {
    btn.onclick = () => abrirEditCliente(btn.dataset.editCliente);
  });
  document.querySelectorAll('[data-del-cliente]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Excluir cliente? Isso também apaga os pedidos dele.')) return;
      const { error } = await supabaseClient.from('clientes').delete().eq('id', btn.dataset.delCliente);
      if (error) return toast('Erro: ' + error.message, true);
      await refreshAll();
      toast('Cliente excluído');
    };
  });
}

// =========================================================
// PRODUTOS (CRUD)
// =========================================================
function setupProdutosForm() {
  document.getElementById('formNovoProduto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('prNome').value.trim();
    const custo = Number(document.getElementById('prCusto').value);
    const preco = Number(document.getElementById('prPreco').value);
    if (!nome || isNaN(custo) || isNaN(preco)) return;
    const { data, error } = await supabaseClient.from('produtos').insert({ nome, custo, preco_venda: preco }).select().single();
    if (error) return toast('Erro: ' + error.message, true);
    state.produtos.push(data);
    document.getElementById('formNovoProduto').reset();
    toast('Produto adicionado ✓');
    renderProdutosList();
    renderProdutosGridPedido();
  });

  document.getElementById('editPrCancel').addEventListener('click', () => closeSheet('editProdutoOverlay'));
  document.getElementById('editProdutoOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'editProdutoOverlay') closeSheet('editProdutoOverlay');
  });
  document.getElementById('editPrSalvar').addEventListener('click', async () => {
    const nome = document.getElementById('editPrNome').value.trim();
    const custo = Number(document.getElementById('editPrCusto').value);
    const preco = Number(document.getElementById('editPrPreco').value);
    if (!nome || isNaN(custo) || isNaN(preco)) return toast('Preencha todos os campos', true);
    const { error } = await supabaseClient.from('produtos')
      .update({ nome, custo, preco_venda: preco })
      .eq('id', state.editProdutoId);
    if (error) return toast('Erro: ' + error.message, true);
    toast('Produto atualizado ✓');
    closeSheet('editProdutoOverlay');
    await loadProdutos();
    renderProdutosList();
    renderProdutosGridPedido();
  });
}

function abrirEditProduto(id) {
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;
  state.editProdutoId = id;
  document.getElementById('editPrNome').value = p.nome || '';
  document.getElementById('editPrCusto').value = p.custo;
  document.getElementById('editPrPreco').value = p.preco_venda;
  openSheet('editProdutoOverlay');
}

function renderProdutosList() {
  document.getElementById('listaProdutos').innerHTML = state.produtos.map(p => {
    const margem = p.preco_venda > 0 ? ((p.preco_venda - p.custo) / p.preco_venda * 100) : 0;
    return `
    <div class="simple-item">
      <div class="simple-item-main">
        <span class="simple-item-name">${p.nome}</span>
        <span class="simple-item-sub">custo ${BRL(p.custo)} · venda ${BRL(p.preco_venda)}</span>
      </div>
      <div class="simple-item-actions">
        <span class="margin-tag">margem ${margem.toFixed(0)}%</span>
        <button class="btn btn-edit btn-sm" data-edit-produto="${p.id}">Editar</button>
        <button class="btn btn-ghost btn-sm" data-del-produto="${p.id}">Excluir</button>
      </div>
    </div>`;
  }).join('') || emptyMsg('Nenhum produto cadastrado ainda');

  document.querySelectorAll('[data-edit-produto]').forEach(btn => {
    btn.onclick = () => abrirEditProduto(btn.dataset.editProduto);
  });
  document.querySelectorAll('[data-del-produto]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Excluir este produto?')) return;
      const { error } = await supabaseClient.from('produtos').update({ ativo: false }).eq('id', btn.dataset.delProduto);
      if (error) return toast('Erro: ' + error.message, true);
      await loadProdutos();
      renderProdutosList();
      renderProdutosGridPedido();
      toast('Produto removido');
    };
  });
}

// =========================================================
// FINANCEIRO
// =========================================================
function renderFinanceiro() {
  const periodo = document.getElementById('finPeriodo').value;
  const hoje = hojeISO();
  let lista = state.pedidos;

  if (periodo === 'hoje') {
    lista = lista.filter(p => p.data_pedido === hoje);
  } else if (periodo === 'semana') {
    const limite = new Date(); limite.setDate(limite.getDate() - 7);
    const limiteISO = limite.toISOString().slice(0, 10);
    lista = lista.filter(p => p.data_pedido >= limiteISO);
  } else if (periodo === 'mes') {
    lista = lista.filter(p => p.data_pedido.slice(0, 7) === hoje.slice(0, 7));
  }

  const faturamento = lista.reduce((s, p) => s + Number(p.valor_total), 0);
  const custo = lista.reduce((s, p) => s + custoPedido(p), 0);
  const taxas = lista.reduce((s, p) => s + Number(p.taxa_quinzena || 0), 0);
  const lucro = faturamento - custo;
  const aberto = lista.filter(p => p.status_pagamento === 'pendente').reduce((s, p) => s + Number(p.valor_total), 0);
  const recebido = lista.filter(p => p.status_pagamento === 'pago').reduce((s, p) => s + Number(p.valor_total), 0);

  document.getElementById('finFaturamento').textContent = BRL(faturamento);
  document.getElementById('finCusto').textContent = BRL(custo);
  document.getElementById('finLucro').textContent = BRL(lucro);
  document.getElementById('finTaxas').textContent = BRL(taxas);
  document.getElementById('finAberto').textContent = BRL(aberto);
  document.getElementById('finRecebido').textContent = BRL(recebido);

  const porProduto = {};
  lista.forEach(p => (p.itens_pedido || []).forEach(it => {
    const nome = it.produtos?.nome || 'Item';
    porProduto[nome] = (porProduto[nome] || 0) + Number(it.subtotal);
  }));
  const max = Math.max(1, ...Object.values(porProduto));
  const linhas = Object.entries(porProduto).sort((a, b) => b[1] - a[1]);

  document.getElementById('finProdutos').innerHTML = linhas.map(([nome, valor]) => `
    <div class="bar-row">
      <span class="bar-label">${nome}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(valor / max * 100).toFixed(1)}%"></div></div>
      <span class="bar-value mono">${BRL(valor)}</span>
    </div>
  `).join('') || emptyMsg('Sem vendas no período');
}