import { supabase, toast, timeAgo, el } from './shared/lib.js';

const app = document.getElementById('app');
const state = { staff: null, station: 'todos', items: [] };

boot();

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { renderLogin(); return; }
  await loadStaff(session.user.id);
}

async function loadStaff(authId) {
  const { data: staff } = await supabase.from('staff').select('*').eq('auth_id', authId).maybeSingle();
  if (!staff || !staff.active) { renderLogin('Conta não liberada como equipe.'); await supabase.auth.signOut(); return; }
  state.staff = staff;
  await renderBoard();
  subscribeRealtime();
}

function renderLogin(errorMsg) {
  app.className = 'login-wrap';
  app.innerHTML = '';
  const card = el(`<div class="login-card card">
    <div class="brand-mark">FT</div>
    <h2>Painel Cozinha/Bar</h2>
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

async function fetchItems() {
  const { data } = await supabase
    .from('order_items')
    .select(`*, orders ( id, comanda_id, sessions ( id, tables ( number ) ), comandas ( nome ) )`)
    .in('status', ['pendente', 'preparo', 'pronto'])
    .order('created_at');
  state.items = data || [];
}

async function renderBoard() {
  await fetchItems();
  app.className = '';
  app.innerHTML = '';

  const header = el(`<div class="topbar">
    <div class="brand">
      <div class="brand-mark">FT</div>
      <div><div class="brand-name">Fim de Tarde</div><div class="brand-sub">Cozinha &amp; Bar · ${state.staff.name}</div></div>
    </div>
    <button class="icon-btn" id="btn-logout" title="Sair">⏻</button>
  </div>`);
  app.appendChild(header);
  header.querySelector('#btn-logout').onclick = async () => { await supabase.auth.signOut(); renderLogin(); };

  const stationTabs = el(`<div class="station-tabs"><div class="tabs" style="max-width:420px;">
    <div class="tab ${state.station === 'todos' ? 'active' : ''}" data-s="todos">Tudo</div>
    <div class="tab ${state.station === 'bar' ? 'active' : ''}" data-s="bar">Bar</div>
    <div class="tab ${state.station === 'cozinha' ? 'active' : ''}" data-s="cozinha">Cozinha</div>
  </div></div>`);
  app.appendChild(stationTabs);
  stationTabs.querySelectorAll('.tab').forEach(t => t.onclick = () => { state.station = t.dataset.s; renderBoard(); });

  const filtered = state.station === 'todos' ? state.items : state.items.filter(i => i.station === state.station);

  const board = el(`<div class="board"></div>`);
  board.appendChild(column('pendente', 'Pendente', filtered));
  board.appendChild(column('preparo', 'Em preparo', filtered));
  board.appendChild(column('pronto', 'Pronto', filtered));
  app.appendChild(board);

  if (!state.items.length) {
    app.appendChild(el(`<div class="empty"><div class="glyph">🎤</div><p>Tudo tranquilo por aqui. Nenhum pedido em aberto.</p></div>`));
  }
}

function column(status, label, items) {
  const list = items.filter(i => i.status === status);
  const col = el(`<div class="column">
    <h3>${label} <span class="count">${list.length}</span></h3>
    <div class="col-list"></div>
  </div>`);
  const colList = col.querySelector('.col-list');
  if (!list.length) colList.appendChild(el(`<p style="font-size:.8rem;">—</p>`));
  list.forEach(i => colList.appendChild(orderCard(i)));
  return col;
}

function orderCard(item) {
  const tableNum = item.orders?.sessions?.tables?.number ?? '?';
  const who = item.orders?.comandas?.nome || 'Pedido da mesa';
  const card = el(`<div class="ticket order-card">
    <div class="top"><span class="table-tag">Mesa ${tableNum}</span><span class="meta" style="font-size:.72rem;color:var(--cream-dim)">${timeAgo(item.created_at)}</span></div>
    <div class="who">${who}</div>
    <div><span class="qty">${item.quantity}×</span> ${item.item_name}</div>
    ${item.notes ? `<div class="who">Obs: ${item.notes}</div>` : ''}
    <div class="actions"></div>
  </div>`);
  const actions = card.querySelector('.actions');
  if (item.status === 'pendente') {
    const b = el(`<button class="btn btn-primary btn-sm">Iniciar preparo</button>`);
    b.onclick = () => setStatus(item.id, 'preparo');
    actions.appendChild(b);
  } else if (item.status === 'preparo') {
    const b = el(`<button class="btn btn-neon btn-sm">Marcar pronto</button>`);
    b.onclick = () => setStatus(item.id, 'pronto');
    actions.appendChild(b);
  } else {
    actions.appendChild(el(`<span class="badge badge-pronto">Aguardando garçom</span>`));
  }
  const cancel = el(`<button class="btn btn-danger btn-sm">Cancelar</button>`);
  cancel.onclick = () => setStatus(item.id, 'cancelado');
  actions.appendChild(cancel);
  return card;
}

async function setStatus(id, status) {
  const { error } = await supabase.from('order_items').update({ status }).eq('id', id);
  if (error) toast(error.message, 'error');
  await renderBoard();
}

function subscribeRealtime() {
  supabase.channel('order_items_kitchen')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => renderBoard())
    .subscribe();
}
