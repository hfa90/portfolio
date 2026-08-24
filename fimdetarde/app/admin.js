import { supabase, brl, toast, el } from './shared/lib.js';
import { APP_BASE_URL } from './shared/config.js';

const app = document.getElementById('app');
const state = { staff: null, tab: 'mesas', tables: [], categories: [], items: [], staffList: [] };

boot();

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { renderLogin(); return; }
  await loadStaff(session.user.id);
}

async function loadStaff(authId) {
  const { data: staff } = await supabase.from('staff').select('*').eq('auth_id', authId).maybeSingle();
  if (!staff || staff.role !== 'admin') { renderLogin('Essa conta não tem acesso de administrador.'); await supabase.auth.signOut(); return; }
  state.staff = staff;
  renderShell();
}

function renderLogin(errorMsg) {
  app.className = 'login-wrap';
  app.innerHTML = '';
  const card = el(`<div class="login-card card">
    <div class="brand-mark">FT</div>
    <h2>Admin</h2>
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

async function renderShell() {
  app.className = '';
  app.innerHTML = '';
  const header = el(`<div class="topbar">
    <div class="brand"><div class="brand-mark">FT</div><div><div class="brand-name">Fim de Tarde</div><div class="brand-sub">Admin · ${state.staff.name}</div></div></div>
    <button class="icon-btn" id="btn-logout" title="Sair">⏻</button>
  </div>`);
  app.appendChild(header);
  header.querySelector('#btn-logout').onclick = async () => { await supabase.auth.signOut(); renderLogin(); };

  const tabs = el(`<div class="admin-tabs"><div class="tabs" style="max-width:420px;">
    <div class="tab ${state.tab === 'mesas' ? 'active' : ''}" data-t="mesas">Mesas</div>
    <div class="tab ${state.tab === 'cardapio' ? 'active' : ''}" data-t="cardapio">Cardápio</div>
    <div class="tab ${state.tab === 'equipe' ? 'active' : ''}" data-t="equipe">Equipe</div>
  </div></div>`);
  app.appendChild(tabs);
  tabs.querySelectorAll('.tab').forEach(t => t.onclick = () => { state.tab = t.dataset.t; renderShell(); });

  const shell = el(`<div class="shell-wide"></div>`);
  app.appendChild(shell);

  if (state.tab === 'mesas') await renderMesas(shell);
  else if (state.tab === 'cardapio') await renderCardapio(shell);
  else await renderEquipe(shell);
}

// ---------------------------------------------------------------- MESAS
async function renderMesas(shell) {
  const { data: tables } = await supabase.from('tables').select('*').order('number');
  state.tables = tables || [];

  const form = el(`<div class="add-form card">
    <div class="field"><label>Número da nova mesa</label><input id="new-table-num" type="number" min="1" /></div>
    <button class="btn btn-primary" id="add-table">Criar mesa + QR</button>
  </div>`);
  shell.appendChild(form);
  form.querySelector('#add-table').onclick = async () => {
    const num = Number(form.querySelector('#new-table-num').value);
    if (!num) return;
    const { error } = await supabase.from('tables').insert({ number: num });
    if (error) { toast(error.message, 'error'); return; }
    renderShell();
  };

  const grid = el(`<div class="grid-tables"></div>`);
  shell.appendChild(grid);
  state.tables.forEach(t => {
    const link = `${APP_BASE_URL}cliente.html?mesa=${t.qr_token}`;
    const card = el(`<div class="card table-card">
      <span class="badge badge-${t.status === 'ocupada' ? 'preparo' : 'aberta'}">${t.status === 'ocupada' ? 'Ocupada' : 'Livre'}</span>
      <div class="num">Mesa ${t.number}</div>
      <div class="qr-holder"></div>
      <button class="btn btn-ghost btn-sm print-btn">Imprimir</button>
    </div>`);
    const box = el(`<div class="qr-box"></div>`);
    card.querySelector('.qr-holder').appendChild(box);
    // eslint-disable-next-line no-undef
    new QRCode(box, { text: link, width: 160, height: 160, colorDark: '#0F2027', colorLight: '#ffffff' });
    card.querySelector('.print-btn').onclick = () => window.print();
    grid.appendChild(card);
  });
}

// ---------------------------------------------------------------- CARDÁPIO
async function renderCardapio(shell) {
  const { data: categories } = await supabase.from('menu_categories').select('*').order('sort_order');
  const { data: items } = await supabase.from('menu_items').select('*').order('sort_order');
  state.categories = categories || [];
  state.items = items || [];

  const catForm = el(`<div class="add-form card">
    <div class="field"><label>Nova categoria</label><input id="new-cat-name" placeholder="Ex: Petiscos" /></div>
    <div class="field"><label>Estação</label>
      <select id="new-cat-station"><option value="bar">Bar</option><option value="cozinha">Cozinha</option></select>
    </div>
    <button class="btn btn-primary" id="add-cat">Adicionar categoria</button>
  </div>`);
  shell.appendChild(catForm);
  catForm.querySelector('#add-cat').onclick = async () => {
    const name = catForm.querySelector('#new-cat-name').value.trim();
    const station = catForm.querySelector('#new-cat-station').value;
    if (!name) return;
    await supabase.from('menu_categories').insert({ name, station, sort_order: state.categories.length + 1 });
    renderShell();
  };

  state.categories.forEach(cat => {
    const block = el(`<div class="card" style="margin-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3>${cat.name} <span class="badge badge-${cat.station === 'bar' ? 'aberta' : 'preparo'}">${cat.station}</span></h3>
      </div>
      <div class="items-holder"></div>
      <div class="add-form">
        <div class="field"><label>Item</label><input class="ni-name" placeholder="Nome" /></div>
        <div class="field"><label>Preço</label><input class="ni-price" type="number" step="0.01" min="0" /></div>
        <button class="btn btn-ghost btn-sm add-item">+ item</button>
      </div>
    </div>`);
    const holder = block.querySelector('.items-holder');
    state.items.filter(i => i.category_id === cat.id).forEach(item => {
      const row = el(`<div class="menu-item-row">
        <span>${item.name} <span class="mono" style="color:var(--accent-2)">${brl(item.price)}</span></span>
        <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;">
          <input type="checkbox" ${item.available ? 'checked' : ''} class="avail-toggle" /> disponível
        </label>
      </div>`);
      row.querySelector('.avail-toggle').onchange = async (e) => {
        await supabase.from('menu_items').update({ available: e.target.checked }).eq('id', item.id);
      };
      holder.appendChild(row);
    });
    block.querySelector('.add-item').onclick = async () => {
      const name = block.querySelector('.ni-name').value.trim();
      const price = Number(block.querySelector('.ni-price').value);
      if (!name || !price) return;
      await supabase.from('menu_items').insert({ category_id: cat.id, name, price });
      renderShell();
    };
    shell.appendChild(block);
  });
}

// ---------------------------------------------------------------- EQUIPE
async function renderEquipe(shell) {
  const { data: staffList } = await supabase.from('staff').select('*').order('created_at');
  state.staffList = staffList || [];

  shell.appendChild(el(`<div class="card">
    <h3>Adicionar um novo membro da equipe</h3>
    <p style="font-size:.85rem;">1. Crie o login em <b>Authentication &gt; Users</b> no painel do Supabase (e-mail + senha).<br/>
    2. Copie o UUID do usuário criado e cole abaixo.</p>
  </div>`));

  const form = el(`<div class="add-form card">
    <div class="field"><label>UUID do usuário (Supabase Auth)</label><input id="new-staff-uuid" placeholder="xxxxxxxx-xxxx-..." /></div>
    <div class="field"><label>Nome</label><input id="new-staff-name" /></div>
    <div class="field"><label>Função</label>
      <select id="new-staff-role"><option value="garcom">Garçom</option><option value="cozinha">Cozinha/Bar</option><option value="admin">Admin</option></select>
    </div>
    <button class="btn btn-primary" id="add-staff">Adicionar</button>
  </div>`);
  shell.appendChild(form);
  form.querySelector('#add-staff').onclick = async () => {
    const auth_id = form.querySelector('#new-staff-uuid').value.trim();
    const name = form.querySelector('#new-staff-name').value.trim();
    const role = form.querySelector('#new-staff-role').value;
    if (!auth_id || !name) return;
    const { error } = await supabase.from('staff').insert({ auth_id, name, role });
    if (error) { toast(error.message, 'error'); return; }
    renderShell();
  };

  const list = el(`<div class="card" style="margin-top:16px;"></div>`);
  shell.appendChild(list);
  state.staffList.forEach(s => {
    const row = el(`<div class="staff-row">
      <span>${s.name} <span class="badge badge-${s.role === 'admin' ? 'preparo' : 'aberta'}">${s.role}</span></span>
      <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;">
        <input type="checkbox" ${s.active ? 'checked' : ''} class="active-toggle" /> ativo
      </label>
    </div>`);
    row.querySelector('.active-toggle').onchange = async (e) => {
      await supabase.from('staff').update({ active: e.target.checked }).eq('id', s.id);
    };
    list.appendChild(row);
  });
}
