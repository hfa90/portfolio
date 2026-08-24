import { supabase, brl, qs, toast, statusLabel, el, timeAgo } from './shared/lib.js';
import { APP_BASE_URL } from './shared/config.js';

const app = document.getElementById('app');

const state = {
  table: null,
  session: null,
  comanda: null,      // null = pedindo pela mesa (compartilhado)
  categories: [],
  items: [],
  cart: {},            // menu_item_id -> { item, qty }
  tab: 'cardapio',
  knownOrderIds: new Set(),
  myItems: [],          // order_items da comanda (ou da mesa toda)
  tableItems: [],        // order_items de TODA a sessão (para "conta da mesa")
};

boot();

async function boot() {
  const mesaToken = qs('mesa');
  const comandaToken = qs('comanda');

  if (!mesaToken) {
    renderError('QR inválido', 'Escaneie o QR Code da sua mesa para começar.');
    return;
  }

  const { data: table, error: tableErr } = await supabase
    .from('tables').select('*').eq('qr_token', mesaToken).maybeSingle();

  if (tableErr || !table) {
    renderError('Mesa não encontrada', 'Esse QR Code não corresponde a nenhuma mesa ativa. Chame o garçom.');
    return;
  }
  state.table = table;

  let { data: session } = await supabase
    .from('sessions').select('*').eq('table_id', table.id).eq('status', 'aberta').maybeSingle();

  if (!session) {
    const { data: newSession, error: sErr } = await supabase
      .from('sessions').insert({ table_id: table.id }).select().single();
    if (sErr) { renderError('Não foi possível abrir a mesa', sErr.message); return; }
    session = newSession;
    await supabase.from('tables').update({ status: 'ocupada' }).eq('id', table.id);
  }
  state.session = session;

  if (comandaToken) {
    const { data: comanda } = await supabase
      .from('comandas').select('*').eq('qr_token', comandaToken).maybeSingle();
    if (comanda) state.comanda = comanda;
  }

  await loadMenu();

  if (!comandaToken) {
    renderOnboarding();
  } else {
    await refreshOrders();
    renderMain();
    subscribeRealtime();
  }
}

async function loadMenu() {
  const { data: categories } = await supabase.from('menu_categories').select('*').order('sort_order');
  const { data: items } = await supabase.from('menu_items').select('*').eq('available', true).order('sort_order');
  state.categories = categories || [];
  state.items = items || [];
}

// ---------------------------------------------------------------- ONBOARDING
function renderOnboarding() {
  app.className = '';
  app.innerHTML = '';
  const wrap = el(`<div class="shell">
    <div class="hero">
      <div class="table-chip"><span class="num">${state.table.number}</span><span>Mesa ${state.table.number}</span></div>
      <h1>Boa tarde 🌅<br>Como você quer pedir?</h1>
      <p>Fim de Tarde — karaokê, drinks e petiscos</p>
    </div>
    <div class="onboard-choices">
      <div class="choice-card" id="choice-solo">
        <div class="glyph">🙋</div>
        <div><h3>Só para mim</h3><p>Sua própria comanda, com seu QR pessoal.</p></div>
      </div>
      <div class="choice-card" id="choice-mesa">
        <div class="glyph">🍻</div>
        <div><h3>Para a mesa toda</h3><p>Pedido compartilhado, dividido entre o grupo.</p></div>
      </div>
    </div>
  </div>`);
  app.appendChild(wrap);

  wrap.querySelector('#choice-mesa').onclick = async () => {
    await refreshOrders();
    renderMain();
    subscribeRealtime();
  };
  wrap.querySelector('#choice-solo').onclick = () => renderNamePrompt();
}

function renderNamePrompt() {
  const backdrop = el(`<div class="modal-backdrop">
    <div class="modal">
      <h3>Como podemos te chamar?</h3>
      <p>Isso cria sua comanda individual dentro da mesa ${state.table.number}.</p>
      <div class="field"><input id="nome-input" placeholder="Seu nome ou apelido" maxlength="30" /></div>
      <button class="btn btn-primary btn-block" id="nome-confirm">Criar minha comanda</button>
    </div>
  </div>`);
  document.body.appendChild(backdrop);
  const input = backdrop.querySelector('#nome-input');
  input.focus();
  backdrop.querySelector('#nome-confirm').onclick = async () => {
    const nome = input.value.trim();
    if (!nome) { toast('Digite um nome', 'error'); return; }
    const { data: comanda, error } = await supabase
      .from('comandas').insert({ session_id: state.session.id, nome }).select().single();
    if (error) { toast('Erro ao criar comanda: ' + error.message, 'error'); return; }
    state.comanda = comanda;
    const url = new URL(window.location.href);
    url.searchParams.set('comanda', comanda.qr_token);
    window.history.replaceState({}, '', url);
    backdrop.remove();
    await refreshOrders();
    renderMain();
    subscribeRealtime();
  };
}

// ---------------------------------------------------------------- MAIN SCREEN
function renderMain() {
  app.className = '';
  app.innerHTML = '';

  const header = el(`<div class="topbar">
    <div class="brand">
      <div class="brand-mark">FT</div>
      <div>
        <div class="brand-name">Fim de Tarde</div>
        <div class="brand-sub">Mesa ${state.table.number}${state.comanda ? ' · ' + state.comanda.nome : ' · pedido da mesa'}</div>
      </div>
    </div>
    ${state.comanda ? `<button class="icon-btn" id="btn-my-qr" title="Minha QR">▦</button>` : ''}
  </div>`);
  app.appendChild(header);

  const shell = el(`<div class="shell"></div>`);
  const tabs = el(`<div class="tabs">
    <div class="tab ${state.tab === 'cardapio' ? 'active' : ''}" data-tab="cardapio">Cardápio</div>
    <div class="tab ${state.tab === 'comanda' ? 'active' : ''}" data-tab="comanda">${state.comanda ? 'Minha comanda' : 'Conta da mesa'}</div>
  </div>`);
  shell.appendChild(tabs);
  const content = el(`<div id="tab-content"></div>`);
  shell.appendChild(content);
  app.appendChild(shell);

  tabs.querySelectorAll('.tab').forEach(t => t.onclick = () => { state.tab = t.dataset.tab; renderMain(); });

  if (header.querySelector('#btn-my-qr')) header.querySelector('#btn-my-qr').onclick = showMyQr;

  if (state.tab === 'cardapio') renderCardapio(content);
  else renderComandaTab(content);

  renderCartBar();
}

function renderCardapio(container) {
  if (!state.categories.length) {
    container.appendChild(el(`<div class="empty"><div class="glyph">🍹</div><p>O cardápio ainda não foi cadastrado.</p></div>`));
    return;
  }
  state.categories.forEach(cat => {
    const catItems = state.items.filter(i => i.category_id === cat.id);
    if (!catItems.length) return;
    container.appendChild(el(`<div class="cat-title"><h3>${cat.name}</h3><span class="count">${catItems.length} itens</span></div>`));
    catItems.forEach(item => container.appendChild(renderItemRow(item)));
  });
}

function renderItemRow(item) {
  const inCart = state.cart[item.id];
  const row = el(`<div class="item-row">
    <div class="info">
      <h4>${item.name}</h4>
      ${item.description ? `<p>${item.description}</p>` : ''}
      <div class="price">${brl(item.price)}</div>
    </div>
    <div class="actions"></div>
  </div>`);
  const actions = row.querySelector('.actions');
  renderActions();
  function renderActions() {
    actions.innerHTML = '';
    const qty = state.cart[item.id]?.qty || 0;
    if (qty === 0) {
      const btn = el(`<button class="add-btn">Adicionar</button>`);
      btn.onclick = () => { setQty(item, 1); renderActions(); updateCartBar(); };
      actions.appendChild(btn);
    } else {
      const stepper = el(`<div class="stepper">
        <button data-d="-1">−</button><span class="n">${qty}</span><button data-d="1">+</button>
      </div>`);
      stepper.querySelectorAll('button').forEach(b => b.onclick = () => {
        setQty(item, qty + Number(b.dataset.d));
        renderActions(); updateCartBar();
      });
      actions.appendChild(stepper);
    }
  }
  return row;
}

function setQty(item, qty) {
  if (qty <= 0) delete state.cart[item.id];
  else state.cart[item.id] = { item, qty };
}

function cartCount() { return Object.values(state.cart).reduce((s, c) => s + c.qty, 0); }
function cartTotal() { return Object.values(state.cart).reduce((s, c) => s + c.qty * Number(c.item.price), 0); }

function renderCartBar() {
  document.getElementById('cart-bar')?.remove();
  if (cartCount() === 0 || state.tab !== 'cardapio') return;
  const bar = el(`<div class="cart-bar" id="cart-bar">
    <div class="inner" id="cart-inner">
      <span>🛒 ${cartCount()} ${cartCount() === 1 ? 'item' : 'itens'}</span>
      <span>${brl(cartTotal())} · Enviar pedido →</span>
    </div>
  </div>`);
  bar.querySelector('#cart-inner').onclick = submitOrder;
  document.body.appendChild(bar);
}
function updateCartBar() { renderCartBar(); }

async function submitOrder() {
  const items = Object.values(state.cart);
  if (!items.length) return;
  const catByItem = Object.fromEntries(state.items.map(i => [i.id, state.categories.find(c => c.id === i.category_id)]));

  const { data: order, error } = await supabase.from('orders').insert({
    session_id: state.session.id,
    comanda_id: state.comanda ? state.comanda.id : null,
    origem: 'cliente',
  }).select().single();
  if (error) { toast('Erro ao enviar pedido: ' + error.message, 'error'); return; }

  const rows = items.map(c => ({
    order_id: order.id,
    menu_item_id: c.item.id,
    item_name: c.item.name,
    unit_price: c.item.price,
    quantity: c.qty,
    station: catByItem[c.item.id]?.station || 'bar',
  }));
  const { error: itemsErr } = await supabase.from('order_items').insert(rows);
  if (itemsErr) { toast('Erro ao enviar itens: ' + itemsErr.message, 'error'); return; }

  state.cart = {};
  toast('Pedido enviado para o bar! 🎤', 'success');
  await refreshOrders();
  state.tab = 'comanda';
  renderMain();
}

// ---------------------------------------------------------------- COMANDA / CONTA
async function refreshOrders() {
  const { data: sessionOrders } = await supabase
    .from('orders').select('id, comanda_id, created_at').eq('session_id', state.session.id);
  const orders = sessionOrders || [];
  orders.forEach(o => state.knownOrderIds.add(o.id));

  const allIds = orders.map(o => o.id);
  if (!allIds.length) { state.myItems = []; state.tableItems = []; return; }

  const { data: allItems } = await supabase.from('order_items').select('*').in('order_id', allIds);
  const idToComanda = Object.fromEntries(orders.map(o => [o.id, o.comanda_id]));
  (allItems || []).forEach(it => it.comanda_id = idToComanda[it.order_id]);

  state.tableItems = allItems || [];
  state.myItems = state.comanda
    ? state.tableItems.filter(i => i.comanda_id === state.comanda.id)
    : state.tableItems.filter(i => i.comanda_id === null);
}

function renderComandaTab(container) {
  const list = state.myItems;
  const total = list.reduce((s, i) => s + i.quantity * Number(i.unit_price), 0);

  if (!list.length) {
    container.appendChild(el(`<div class="empty"><div class="glyph">🧾</div><p>Nenhum pedido ainda. Bora pro cardápio!</p></div>`));
  } else {
    const ticket = el(`<div class="ticket"></div>`);
    list.forEach(i => ticket.appendChild(el(`<div class="ticket-row">
      <span>${i.quantity}× ${i.item_name}</span>
      <span class="mono">${brl(i.quantity * i.unit_price)}</span>
    </div>`)));
    const totalRow = el(`<div class="ticket-total"><span>Total</span><span>${brl(total)}</span></div>`);
    ticket.appendChild(totalRow);
    container.appendChild(ticket);

    container.appendChild(el(`<div class="divider"></div>`));
    list.forEach(i => container.appendChild(el(`<div class="card-flat" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span>${i.item_name} <span style="color:var(--cream-dim)">×${i.quantity}</span></span>
      <span class="badge badge-${i.status}">${statusLabel(i.status)}</span>
    </div>`)));
  }

  // conta da mesa inteira + divisão
  if (!state.comanda || true) {
    const tableTotal = state.tableItems.reduce((s, i) => s + i.quantity * Number(i.unit_price), 0);
    const box = el(`<div class="card" style="margin-top:22px;">
      <h3>Conta da mesa ${state.table.number}</h3>
      <div class="ticket-row"><span>Total consumido pelo grupo</span><span class="mono">${brl(tableTotal)}</span></div>
      <div class="divider"></div>
      <div class="eyebrow" style="margin-bottom:8px;">Dividir igualmente entre</div>
      <div class="split-input">
        <button class="icon-btn" id="split-minus">−</button>
        <input id="split-count" type="number" min="1" value="${state.session.people_count || 1}" />
        <button class="icon-btn" id="split-plus">+</button>
        <span>pessoas</span>
      </div>
      <div class="ticket-total" id="split-result"><span>Cada um paga</span><span>${brl(tableTotal / (state.session.people_count || 1))}</span></div>
      <p style="margin-top:10px;font-size:.8rem;">Peça ao garçom para fechar a conta quando quiser pagar.</p>
    </div>`);
    container.appendChild(box);

    const input = box.querySelector('#split-count');
    const result = box.querySelector('#split-result span:last-child');
    const recalc = async () => {
      let n = Math.max(1, Number(input.value) || 1);
      input.value = n;
      result.textContent = brl(tableTotal / n);
      state.session.people_count = n;
      await supabase.from('sessions').update({ people_count: n }).eq('id', state.session.id);
    };
    box.querySelector('#split-minus').onclick = () => { input.value = Math.max(1, Number(input.value) - 1); recalc(); };
    box.querySelector('#split-plus').onclick = () => { input.value = Number(input.value) + 1; recalc(); };
    input.onchange = recalc;
  }
}

function showMyQr() {
  const link = `${APP_BASE_URL}cliente.html?mesa=${state.table.qr_token}&comanda=${state.comanda.qr_token}`;
  const backdrop = el(`<div class="modal-backdrop">
    <div class="modal" style="text-align:center;">
      <h3>QR da comanda de ${state.comanda.nome}</h3>
      <p>Mostre esta tela para o garçom lançar seu pedido sem precisar do seu celular na próxima vez.</p>
      <div id="qr-render" style="display:flex;justify-content:center;margin:18px 0;"></div>
      <button class="btn btn-ghost btn-block" id="close-qr">Fechar</button>
    </div>
  </div>`);
  document.body.appendChild(backdrop);
  const box = el(`<div class="qr-box"></div>`);
  backdrop.querySelector('#qr-render').appendChild(box);
  // eslint-disable-next-line no-undef
  new QRCode(box, { text: link, width: 190, height: 190, colorDark: '#0F2027', colorLight: '#ffffff' });
  backdrop.querySelector('#close-qr').onclick = () => backdrop.remove();
}

// ---------------------------------------------------------------- REALTIME
function subscribeRealtime() {
  supabase.channel(`order_items_session_${state.session.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, async (payload) => {
      const row = payload.new?.order_id ? payload.new : payload.old;
      if (state.knownOrderIds.has(row.order_id)) {
        await refreshOrders();
        if (state.tab === 'comanda') renderMain();
      }
    })
    .subscribe();
}

// ---------------------------------------------------------------- ERROR STATE
function renderError(title, msg) {
  app.className = 'loading-screen';
  app.innerHTML = '';
  app.appendChild(el(`<div class="empty"><div class="glyph">😕</div><h2>${title}</h2><p>${msg}</p></div>`));
}
