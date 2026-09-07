// =========================================================
// MARMITA CONTROL — loja.js
// Página pública que os clientes recebem (ex: link no WhatsApp).
// Mostra o cardápio (produtos ativos) e envia o pedido direto
// para o Supabase, caindo na tela "Pedidos" do painel normal.
// =========================================================

const state = {
  produtos: [],
  carrinho: {},       // { produto_id: quantidade }
  formaPagamento: 'imediato',
};

const BRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = isError ? 'var(--danger)' : 'var(--text-main)';
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function hojeISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('COLE_AQUI')) {
    document.getElementById('configWarning').classList.remove('hidden');
  }

  document.getElementById('lojaData').value = hojeISO();
  document.getElementById('lojaData').min = hojeISO();

  document.querySelectorAll('.pay-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.formaPagamento = btn.dataset.pay;
    });
  });

  document.getElementById('btnEnviarPedido').addEventListener('click', enviarPedido);
  document.getElementById('btnNovoPedidoLoja').addEventListener('click', recomecar);

  await loadProdutos();
  renderProdutos();
}

// =========================================================
// CARDÁPIO
// =========================================================
async function loadProdutos() {
  // custo é buscado também (mesma permissão que o painel já usa) só para
  // preencher corretamente o custo_unitario do pedido — nunca é exibido aqui.
  const { data, error } = await supabaseClient
    .from('produtos')
    .select('id,nome,preco_venda,custo,ativo')
    .eq('ativo', true)
    .order('nome');
  if (error) {
    toast('Erro ao carregar cardápio: ' + error.message, true);
    return;
  }
  state.produtos = data || [];
}

function renderProdutos() {
  const wrap = document.getElementById('lojaProdutos');
  const vazio = document.getElementById('lojaSemProdutos');

  if (state.produtos.length === 0) {
    wrap.innerHTML = '';
    vazio.classList.remove('hidden');
    return;
  }
  vazio.classList.add('hidden');

  wrap.innerHTML = state.produtos.map(p => {
    const qtd = state.carrinho[p.id] || 0;
    return `
    <div class="produto-card ${qtd > 0 ? 'active' : ''}" data-produto-card="${p.id}">
      <span class="produto-nome">${p.nome}</span>
      <span class="produto-preco mono">${BRL(p.preco_venda)}</span>
      <div class="qty-row">
        <button type="button" class="qty-btn" data-qty-menos="${p.id}">−</button>
        <span class="qty-val" data-qty-val="${p.id}">${qtd}</span>
        <button type="button" class="qty-btn" data-qty-mais="${p.id}">+</button>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('[data-qty-mais]').forEach(btn => {
    btn.onclick = () => alterarQtd(btn.dataset.qtyMais, 1);
  });
  document.querySelectorAll('[data-qty-menos]').forEach(btn => {
    btn.onclick = () => alterarQtd(btn.dataset.qtyMenos, -1);
  });

  atualizarCartBar();
}

function alterarQtd(produtoId, delta) {
  const atual = state.carrinho[produtoId] || 0;
  const nova = Math.max(0, atual + delta);
  if (nova === 0) delete state.carrinho[produtoId];
  else state.carrinho[produtoId] = nova;

  const valEl = document.querySelector(`[data-qty-val="${produtoId}"]`);
  const cardEl = document.querySelector(`[data-produto-card="${produtoId}"]`);
  if (valEl) valEl.textContent = nova;
  if (cardEl) cardEl.classList.toggle('active', nova > 0);

  atualizarCartBar();
}

function totalCarrinho() {
  return Object.entries(state.carrinho).reduce((s, [id, qtd]) => {
    const p = state.produtos.find(x => x.id === id);
    return s + (p ? Number(p.preco_venda) * qtd : 0);
  }, 0);
}

function itensCarrinho() {
  return Object.entries(state.carrinho).reduce((s, [, qtd]) => s + qtd, 0);
}

function atualizarCartBar() {
  const bar = document.getElementById('lojaCartBar');
  const qtdItens = itensCarrinho();
  if (qtdItens === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  document.getElementById('lojaCartCount').textContent = `${qtdItens} ite${qtdItens === 1 ? 'm' : 'ns'}`;
  document.getElementById('lojaCartTotal').textContent = BRL(totalCarrinho());
}

// =========================================================
// ENVIAR PEDIDO
// =========================================================
async function enviarPedido() {
  const nome = document.getElementById('lojaNome').value.trim();
  const whats = document.getElementById('lojaWhats').value.trim();
  const dataPedido = document.getElementById('lojaData').value || hojeISO();
  const obs = document.getElementById('lojaObs').value.trim();
  const itens = Object.entries(state.carrinho);

  if (itens.length === 0) return toast('Escolha ao menos um item do cardápio', true);
  if (!nome) return toast('Preencha seu nome', true);
  if (!whats) return toast('Preencha seu WhatsApp', true);

  const btn = document.getElementById('btnEnviarPedido');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    // 1) tenta encontrar um cliente já cadastrado com esse WhatsApp,
    //    senão cria um cliente novo com nome + whatsapp informados.
    const digits = whats.replace(/\D/g, '');
    let clienteId = null;

    if (digits) {
      const { data: encontrados } = await supabaseClient
        .from('clientes')
        .select('id')
        .ilike('whatsapp', `%${digits}%`)
        .limit(1);
      if (encontrados && encontrados.length) clienteId = encontrados[0].id;
    }

    if (!clienteId) {
      const { data: novoCliente, error: errCliente } = await supabaseClient
        .from('clientes')
        .insert({ nome, whatsapp: whats })
        .select()
        .single();
      if (errCliente) throw errCliente;
      clienteId = novoCliente.id;
    }

    // 2) monta os itens a partir do cardápio carregado
    let valorProdutos = 0;
    const itensPayload = itens.map(([produtoId, qtd]) => {
      const prod = state.produtos.find(p => p.id === produtoId);
      if (!prod) throw new Error('Um dos itens não está mais disponível. Atualize a página.');
      const subtotal = Number(prod.preco_venda) * qtd;
      valorProdutos += subtotal;
      return {
        produto_id: produtoId,
        quantidade: qtd,
        preco_unitario: prod.preco_venda,
        custo_unitario: prod.custo,
        subtotal,
        nome: prod.nome,
      };
    });

    // 3) cria o pedido. Pedidos feitos pela loja sempre entram como
    //    "pendente" — quem confirma o pagamento de fato é a loja no painel.
    //    Tenta marcar origem: 'loja' (exige a coluna opcional do schema);
    //    se a coluna não existir ainda, refaz sem ela.
    const payloadBase = {
      cliente_id: clienteId,
      data_pedido: dataPedido,
      forma_pagamento: state.formaPagamento,
      taxa_quinzena: 0,
      status_pagamento: 'pendente',
      valor_produtos: valorProdutos,
      valor_total: valorProdutos,
      observacoes: obs || null,
    };

    let pedido, errPedido;
    ({ data: pedido, error: errPedido } = await supabaseClient
      .from('pedidos').insert({ ...payloadBase, origem: 'loja' }).select().single());

    if (errPedido && /origem/i.test(errPedido.message || '')) {
      ({ data: pedido, error: errPedido } = await supabaseClient
        .from('pedidos').insert(payloadBase).select().single());
    }
    if (errPedido) throw errPedido;

    const { error: errItens } = await supabaseClient
      .from('itens_pedido')
      .insert(itensPayload.map(({ nome, ...it }) => ({ ...it, pedido_id: pedido.id })));
    if (errItens) throw errItens;

    mostrarSucesso(nome, itensPayload, valorProdutos);
  } catch (err) {
    console.error('Erro ao enviar pedido:', err);
    toast('Erro ao enviar: ' + (err?.message || 'tente novamente'), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar pedido';
  }
}

function mostrarSucesso(nome, itensPayload, total) {
  document.getElementById('telaPedido').classList.add('hidden');
  document.getElementById('lojaCartBar').classList.add('hidden');
  document.getElementById('telaSucesso').classList.remove('hidden');

  const linhas = itensPayload.map(it => `${it.quantidade}x ${it.nome}`).join('\n');
  document.getElementById('sucessoResumo').textContent =
    `Obrigado, ${nome.split(' ')[0]}! Recebemos seu pedido:\n\n${linhas}\n\nTotal: ${BRL(total)}\n\nEm breve entraremos em contato pelo WhatsApp para combinar entrega/retirada e pagamento.`;
}

function recomecar() {
  state.carrinho = {};
  document.getElementById('formLoja').reset();
  document.getElementById('lojaData').value = hojeISO();
  document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('active'));
  document.querySelector('.pay-opt[data-pay="imediato"]').classList.add('active');
  state.formaPagamento = 'imediato';

  document.getElementById('telaSucesso').classList.add('hidden');
  document.getElementById('telaPedido').classList.remove('hidden');
  renderProdutos();
}
