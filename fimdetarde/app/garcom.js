import { supabase, brl, toast, statusLabel, el, timeAgo } from './shared/lib.js';

const app = document.getElementById('app');

const state = {
  staff: null,
  categories: [],
  items: [],
  view: 'dashboard',   // dashboard | detail
  currentSession: null,
  currentTable: null,
  comandas: [],
  orders: [],
  orderItems: [],
  scanCart: {},          // used inside "adicionar pedido" picker
  scanTargetComandaId: null, // null = pedido da mesa
};

boot();

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { renderLogin(); return; }
  await loadStaff(session.user.id);
}

async function loadStaff(authId) {
  const { data: staff } = await supabase.from('staff').select('*').eq('auth_id', authId).maybeSingle();
  if (!staff || !staff.active) {
    renderLogin('Sua conta não está liberada como equipe. Fale com o admin.');
    await supabase.auth.signOut();
    return;
  }
  state.staff = staff;
  await loadMenu();
  renderDashboard();
}

async function loadMenu() {
  const { data: categories } = await supabase.from('menu_categories').select('*').order('sort_order');
  const { data: items } = await supabase.from('menu_items').select('*').eq('available', true).order('sort_order');
  state.categories = categories || [];
  state.items = items || [];
}

// ---------------------------------------------------------------- LOGIN
function renderLogin(errorMsg) {
  app.className = 'login-wrap';
  app.innerHTML = '';
  const card = el(`<div class="login-card card">
    <div class="brand-mark">FT</div>
    <h2>Painel do Garçom</h2>
    <p>Fim de Tarde</p>
    ${errorMsg ? `<p style="color:var(--danger)">${errorMsg}</p>` : ''}
    <div class="field" style="text-align:left"><label>E-mail</label><input id="email" type="email" /></div>
    <div class="field" style="text-align:left"><label>Senha</label><input id="pass" type="password" /></div>
    <button class="btn btn-primary btn-block" id="login-btn">Entrar</button>
  </div>`);
  app.appendChild(card);
  card.querySelector('#login-btn').onclick = async () => {
    const email = card.querySelector('#email').value.trim();
    const password = card.querySelector('#pass').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { toast('Login inválido: ' + error.message, 'error'); return; }
    await loadStaff(data.user.id);
  };
}

// ---------------------------------------------------------------- SHELL
function shellHeader(subtitle) {
  return el(`<div class="topbar">
    <div class="brand">
      <div class="brand-mark">FT</div>
      <div>
        <div class="brand-name">Fim de Tarde</div>
        <div class="brand-sub">${subtitle}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="icon-btn" id="btn-scan" title="Escanear QR">▦</button>
      <button class="icon-btn" id="btn-logout" title="Sair">⏻</button>
    </div>
  </div>`);
}

function bindShell(header) {
  header.querySelector('#btn-scan').onclick = openScanner;
  header.querySelector('#btn-logout').onclick = async () => { await supabase.auth.signOut(); renderLogin(); };
}

// ---------------------------------------------------------------- DASHBOARD
async function renderDashboard() {
  state.view = 'dashboard';
  app.className = '';
  app.innerHTML = '';
  const header = shellHeader(`Olá, ${state.staff.name.split(' ')[0]} · mesas abertas`);
  app.appendChild(header);
  bindShell(header);

  const shell = el(`<div class="shell-wide"></div>`);
  shell.appendChild(el(`<h2>Mesas em atendimento</h2>`));
  const grid = el(`<div class="grid-sessions"></div>`);
  shell.appendChild(grid);
  app.appendChild(shell);

  const { data: sessions } = await supabase
    .from('sessions').select('*, tables(number)').eq('status', 'aberta').order('opened_at');

  if (!sessions || !sessions.length) {
    grid.appendChild(el(`<div class="empty"><div class="glyph">🌅</div><p>Nenhuma mesa aberta agora.</p></div>`));
    return;
  }

  const sessionIds = sessions.map(s => s.id);
  const { data: orders } = await supabase.from('orders').select('id, session_id').in('session_id', sessionIds);
  const orderIds = (orders || []).map(o => o.id);
  const { data: items } = orderIds.length
    ? await supabase.from('order_items').select('order_id, status').in('order_id', orderIds)
    : { data: [] };
  const orderToSession = Object.fromEntries((orders || []).map(o => [o.id, o.session_id]));

  sessions.forEach(s => {
    const pending = (items || []).filter(i => orderToSession[i.order_id] === s.id && ['pendente', 'preparo'].includes(i.status)).length;
    const card = el(`<div class="card session-card">
      <div class="top"><span class="num">Mesa ${s.tables.number}</span><span class="badge badge-aberta">Aberta</span></div>
      <div class="pending-pill">${pending} item(ns) pendente(s)</div>
      <p style="margin-top:10px;font-size:.78rem;">Aberta há ${timeAgo(s.opened_at)}</p>
    </div>`);
    card.onclick = () => openSession(s.id);
    grid.appendChild(card);
  });
}

// ---------------------------------------------------------------- SESSION DETAIL
async function openSession(sessionId) {
  const { data: session } = await supabase.from('sessions').select('*, tables(*)').eq('id', sessionId).single();
  state.currentSession = session;
  state.currentTable = session.tables;
  await refreshSessionData();
  renderDetail();
}

async function refreshSessionData() {
  const sid = state.currentSession.id;
  const { data: comandas } = await supabase.from('comandas').select('*').eq('session_id', sid).order('created_at');
  const { data: orders } = await supabase.from('orders').select('*').eq('session_id', sid);
  const orderIds = (orders || []).map(o => o.id);
  const { data: orderItems } = orderIds.length
    ? await supabase.from('order_items').select('*').in('order_id', orderIds).order('created_at')
    : { data: [] };
  const idToComanda = Object.fromEntries((orders || []).map(o => [o.id, o.comanda_id]));
  (orderItems || []).forEach(i => i.comanda_id = idToComanda[i.order_id]);

  state.comandas = comandas || [];
  state.orders = orders || [];
  state.orderItems = orderItems || [];
}

function renderDetail() {
  state.view = 'detail';
  app.className = '';
  app.innerHTML = '';
  const header = shellHeader(`Mesa ${state.currentTable.number}`);
  app.appendChild(header);
  bindShell(header);

  const shell = el(`<div class="shell"></div>`);
  const back = el(`<div class="back-row"><button class="btn btn-ghost btn-sm" id="btn-back">← Mesas</button>
    <button class="btn btn-danger btn-sm" id="btn-fechar" style="margin-left:auto;">Fechar conta</button></div>`);
  shell.appendChild(back);
  app.appendChild(shell);
  back.querySelector('#btn-back').onclick = renderDashboard;
  back.querySelector('#btn-fechar').onclick = openCloseBillModal;

  // pedido da mesa (compartilhado)
  shell.appendChild(comandaBlock({ id: null, nome: 'Pedido da mesa (compartilhado)' }));

  // comandas individuais
  state.comandas.forEach(c => shell.appendChild(comandaBlock(c)));

  const addBtn = el(`<button class="btn btn-primary btn-block" style="margin-top:10px;">+ Adicionar pedido</button>`);
  addBtn.onclick = () => openMenuPicker(null);
  shell.appendChild(addBtn);
}

function comandaBlock(comanda) {
  const items = state.orderItems.filter(i => (comanda.id === null ? i.comanda_id === null : i.comanda_id === comanda.id));
  const total = items.reduce((s, i) => s + i.quantity * Number(i.unit_price), 0);
  const block = el(`<div class="comanda-block card">
    <div class="comanda-head">
      <h3>${comanda.nome}</h3>
      <span class="mono">${brl(total)}</span>
    </div>
    <div class="items-list"></div>
    ${comanda.id ? `<button class="btn btn-ghost btn-sm add-for-comanda" style="margin-top:8px;">+ pedido para ${comanda.nome.split(' ')[0]}</button>` : ''}
  </div>`);
  const list = block.querySelector('.items-list');
  if (!items.length) {
    list.appendChild(el(`<p style="font-size:.82rem;">Nenhum item ainda.</p>`));
  } else {
    items.forEach(i => list.appendChild(itemLine(i)));
  }
  const addFor = block.querySelector('.add-for-comanda');
  if (addFor) addFor.onclick = () => openMenuPicker(comanda.id);
  return block;
}

function itemLine(item) {
  const row = el(`<div class="item-line">
    <div>
      <div>${item.quantity}× ${item.item_name}</div>
      <div class="meta">${statusLabel(item.status)} · ${timeAgo(item.created_at)}</div>
    </div>
    <div class="item-actions"></div>
  </div>`);
  const actions = row.querySelector('.item-actions');
  if (item.status === 'pronto') {
    const btn = el(`<button class="btn btn-neon btn-sm">Entregar</button>`);
    btn.onclick = () => updateItemStatus(item.id, 'entregue');
    actions.appendChild(btn);
  }
  if (!['entregue', 'cancelado'].includes(item.status)) {
    const cancel = el(`<button class="btn btn-danger btn-sm">Cancelar</button>`);
    cancel.onclick = () => updateItemStatus(item.id, 'cancelado');
    actions.appendChild(cancel);
  }
  return row;
}

async function updateItemStatus(id, status) {
  const { error } = await supabase.from('order_items').update({ status }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  await refreshSessionData();
  renderDetail();
}

// ---------------------------------------------------------------- MENU PICKER (garçom lança pedido)
function openMenuPicker(comandaId) {
  state.scanCart = {};
  const backdrop = el(`<div class="modal-backdrop">
    <div class="modal menu-picker">
      <h3>Novo pedido</h3>
      <div id="picker-list"></div>
      <button class="btn btn-primary btn-block" id="picker-submit" style="margin-top:14px;" disabled>Selecione itens</button>
    </div>
  </div>`);
  document.body.appendChild(backdrop);
  const list = backdrop.querySelector('#picker-list');
  state.categories.forEach(cat => {
    const catItems = state.items.filter(i => i.category_id === cat.id);
    if (!catItems.length) return;
    list.appendChild(el(`<div class="cat-title"><h3>${cat.name}</h3></div>`));
    catItems.forEach(item => {
      const row = el(`<div class="item-line">
        <div><div>${item.name}</div><div class="meta">${brl(item.price)}</div></div>
        <div class="stepper">
          <button data-d="-1">−</button><span class="n" data-qty>0</span><button data-d="1">+</button>
        </div>
      </div>`);
      const qtyEl = row.querySelector('[data-qty]');
      row.querySelectorAll('button').forEach(b => b.onclick = () => {
        const cur = state.scanCart[item.id]?.qty || 0;
        const next = Math.max(0, cur + Number(b.dataset.d));
        if (next === 0) delete state.scanCart[item.id];
        else state.scanCart[item.id] = { item, qty: next };
        qtyEl.textContent = next;
        const submitBtn = backdrop.querySelector('#picker-submit');
        const count = Object.values(state.scanCart).reduce((s, c) => s + c.qty, 0);
        submitBtn.disabled = count === 0;
        submitBtn.textContent = count ? `Lançar pedido (${count})` : 'Selecione itens';
      });
      list.appendChild(row);
    });
  });
  backdrop.querySelector('#picker-submit').onclick = async () => {
    await submitStaffOrder(comandaId);
    backdrop.remove();
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

async function submitStaffOrder(comandaId) {
  const cart = Object.values(state.scanCart);
  if (!cart.length) return;
  const catByItem = Object.fromEntries(state.items.map(i => [i.id, state.categories.find(c => c.id === i.category_id)]));

  const { data: order, error } = await supabase.from('orders').insert({
    session_id: state.currentSession.id,
    comanda_id: comandaId,
    origem: 'garcom',
    staff_id: state.staff.id,
  }).select().single();
  if (error) { toast(error.message, 'error'); return; }

  const rows = cart.map(c => ({
    order_id: order.id,
    menu_item_id: c.item.id,
    item_name: c.item.name,
    unit_price: c.item.price,
    quantity: c.qty,
    station: catByItem[c.item.id]?.station || 'bar',
  }));
  await supabase.from('order_items').insert(rows);
  toast('Pedido lançado!', 'success');
  await refreshSessionData();
  renderDetail();
}

// ---------------------------------------------------------------- FECHAR CONTA
function openCloseBillModal() {
  const total = state.orderItems
    .filter(i => i.status !== 'cancelado')
    .reduce((s, i) => s + i.quantity * Number(i.unit_price), 0);
  const backdrop = el(`<div class="modal-backdrop">
    <div class="modal">
      <h3>Fechar conta — Mesa ${state.currentTable.number}</h3>
      <div class="ticket">
        <div class="ticket-total"><span>Total</span><span>${brl(total)}</span></div>
      </div>
      <div class="field" style="margin-top:14px;">
        <label>Dividir igualmente entre quantas pessoas?</label>
        <input id="people" type="number" min="1" value="${state.currentSession.people_count || 1}" />
      </div>
      <div class="card-flat" id="per-person" style="text-align:center;margin-bottom:14px;"></div>
      <button class="btn btn-primary btn-block" id="confirm-close">Confirmar pagamento e fechar mesa</button>
    </div>
  </div>`);
  document.body.appendChild(backdrop);
  const peopleInput = backdrop.querySelector('#people');
  const perPerson = backdrop.querySelector('#per-person');
  const recalc = () => { const n = Math.max(1, Number(peopleInput.value) || 1); perPerson.textContent = `${brl(total / n)} por pessoa`; };
  recalc();
  peopleInput.oninput = recalc;

  backdrop.querySelector('#confirm-close').onclick = async () => {
    const n = Math.max(1, Number(peopleInput.value) || 1);
    await supabase.from('sessions').update({
      status: 'fechada', people_count: n, closed_by: state.staff.id, closed_at: new Date().toISOString(),
    }).eq('id', state.currentSession.id);
    await supabase.from('comandas').update({ status: 'fechada' }).eq('session_id', state.currentSession.id);
    await supabase.from('tables').update({ status: 'livre' }).eq('id', state.currentTable.id);
    toast('Mesa fechada. Até a próxima! 🌅', 'success');
    backdrop.remove();
    renderDashboard();
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

// ---------------------------------------------------------------- QR SCANNER
let scannerInstance = null;

function openScanner() {
  const backdrop = el(`<div class="modal-backdrop">
    <div class="modal">
      <h3>Escanear QR</h3>
      <div id="qr-reader"></div>
      <div class="scan-fallback">
        <div class="field"><label>Ou digite o número da mesa</label><input id="manual-mesa" inputmode="numeric" /></div>
        <button class="btn btn-ghost btn-block" id="manual-go">Abrir mesa</button>
      </div>
    </div>
  </div>`);
  document.body.appendChild(backdrop);

  scannerInstance = new Html5Qrcode('qr-reader');
  scannerInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    async (decodedText) => {
      await handleScanResult(decodedText);
      closeScanner(backdrop);
    },
    () => {}
  ).catch(() => {
    backdrop.querySelector('#qr-reader').innerHTML = '<p style="font-size:.85rem;">Câmera indisponível. Use a busca manual abaixo.</p>';
  });

  backdrop.querySelector('#manual-go').onclick = async () => {
    const num = Number(backdrop.querySelector('#manual-mesa').value);
    if (!num) return;
    const { data: table } = await supabase.from('tables').select('*').eq('number', num).maybeSingle();
    if (!table) { toast('Mesa não encontrada', 'error'); return; }
    const { data: session } = await supabase.from('sessions').select('*').eq('table_id', table.id).eq('status', 'aberta').maybeSingle();
    if (!session) { toast('Essa mesa não está aberta ainda', 'error'); return; }
    closeScanner(backdrop);
    openSession(session.id);
  };

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeScanner(backdrop); });
}

function closeScanner(backdrop) {
  if (scannerInstance) { scannerInstance.stop().catch(() => {}); scannerInstance = null; }
  backdrop.remove();
}

async function handleScanResult(decodedText) {
  let mesaToken = null, comandaToken = null;
  try {
    const url = new URL(decodedText);
    mesaToken = url.searchParams.get('mesa');
    comandaToken = url.searchParams.get('comanda');
  } catch {
    mesaToken = decodedText;
  }
  if (!mesaToken) { toast('QR não reconhecido', 'error'); return; }

  const { data: table } = await supabase.from('tables').select('*').eq('qr_token', mesaToken).maybeSingle();
  if (!table) { toast('Mesa não encontrada para esse QR', 'error'); return; }
  const { data: session } = await supabase.from('sessions').select('*').eq('table_id', table.id).eq('status', 'aberta').maybeSingle();
  if (!session) { toast('Essa mesa não tem sessão aberta', 'error'); return; }

  await openSession(session.id);

  if (comandaToken) {
    const { data: comanda } = await supabase.from('comandas').select('*').eq('qr_token', comandaToken).maybeSingle();
    if (comanda) toast(`Comanda de ${comanda.nome} localizada`, 'success');
  }
}
