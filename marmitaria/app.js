// =========================================================
// MARMITA CONTROL — app.js
// =========================================================

const state = {
  clientes: [],
  produtos: [],        // produtos ativos (aparecem no grid de novo pedido)
  produtosTodos: [],   // todos os produtos, incl. inativos (usado para não quebrar pedidos antigos)
  pedidos: [],       // pedidos com itens e cliente já anexados
  carrinho: {},       // { produto_id: quantidade }
  clienteSelecionado: null,
  view: 'dashboard',
  pedidoEditando: null,   // id do pedido em edição, ou null se for um novo pedido
  editClienteId: null,
  editProdutoId: null,
  quinzenaConfig: { ativa: false, dia1: 15, dia2: 30 }, // config de corte do fiado quinzenal (persistida no localStorage)
};

function normalize(str) {
  return (str || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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

function isoFromDate(d) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const DIAS_SEMANA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function diaSemanaCurto(iso) {
  return DIAS_SEMANA_CURTO[new Date(iso + 'T12:00:00').getDay()];
}

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
function mesNome(d) {
  return MESES_NOME[d.getMonth()];
}

// semana de segunda a domingo, "semanasAtras" semanas atrás da data de referência
function semanaRange(refDate, semanasAtras) {
  const d = new Date(refDate);
  d.setDate(d.getDate() - semanasAtras * 7);
  const diaSemana = d.getDay(); // 0 = domingo
  const offsetSeg = diaSemana === 0 ? 6 : diaSemana - 1;
  const inicio = new Date(d); inicio.setDate(d.getDate() - offsetSeg);
  const fim = new Date(inicio); fim.setDate(inicio.getDate() + 6);
  return { inicio: isoFromDate(inicio), fim: isoFromDate(fim) };
}

// =========================================================
// FIADO POR QUINZENA — configuração e cálculo de vencimento
// =========================================================
function loadQuinzenaConfig() {
  try {
    const raw = localStorage.getItem('marmita_quinzena_config');
    if (raw) return { ativa: false, dia1: 15, dia2: 30, ...JSON.parse(raw) };
  } catch (e) { /* ignora e usa o padrão */ }
  return { ativa: false, dia1: 15, dia2: 30 };
}

function salvarQuinzenaConfigLocal() {
  try {
    localStorage.setItem('marmita_quinzena_config', JSON.stringify(state.quinzenaConfig));
  } catch (e) { /* localStorage indisponível — configuração não persiste, mas segue funcionando na sessão */ }
}

function ultimoDiaDoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate(); // mes 1-12
}

// Retorna a data (ISO) em que um pedido "na quinzena" feito em dataISO vence,
// de acordo com os dias de corte configurados. Retorna null se a quinzena
// estiver desativada.
function quinzenaVencimento(dataISO) {
  if (!state.quinzenaConfig.ativa) return null;
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const ultimoDia = ultimoDiaDoMes(ano, mes);
  const corte1 = Math.min(state.quinzenaConfig.dia1, ultimoDia);
  const corte2 = Math.min(state.quinzenaConfig.dia2, ultimoDia);
  const pad = (n) => String(n).padStart(2, '0');

  if (dia <= corte1) return `${ano}-${pad(mes)}-${pad(corte1)}`;
  if (dia <= corte2) return `${ano}-${pad(mes)}-${pad(corte2)}`;

  // comprou depois do 2º corte: vence no 1º corte do mês seguinte
  let anoProx = ano, mesProx = mes + 1;
  if (mesProx > 12) { mesProx = 1; anoProx++; }
  const corte1Prox = Math.min(state.quinzenaConfig.dia1, ultimoDiaDoMes(anoProx, mesProx));
  return `${anoProx}-${pad(mesProx)}-${pad(corte1Prox)}`;
}

// Um pedido está "vencido" quando: é fiado de quinzena, ainda está pendente,
// a config está ativa, e a data de vencimento já passou.
function isQuinzenaVencida(p) {
  if (p.status_pagamento !== 'pendente' || p.forma_pagamento !== 'quinzena') return false;
  const venc = quinzenaVencimento(p.data_pedido);
  if (!venc) return false;
  return venc < hojeISO();
}

function setupQuinzenaConfig() {
  const toggle = document.getElementById('quinzenaAtivaToggle');
  const dia1 = document.getElementById('quinzenaDia1');
  const dia2 = document.getElementById('quinzenaDia2');
  const camposWrap = document.getElementById('quinzenaCamposWrap');

  toggle.checked = state.quinzenaConfig.ativa;
  dia1.value = state.quinzenaConfig.dia1;
  dia2.value = state.quinzenaConfig.dia2;
  camposWrap.classList.toggle('hidden', !state.quinzenaConfig.ativa);

  toggle.addEventListener('change', () => {
    state.quinzenaConfig.ativa = toggle.checked;
    camposWrap.classList.toggle('hidden', !toggle.checked);
    salvarQuinzenaConfigLocal();
    renderFinanceiro();
    renderCobranca();
    toast(toggle.checked ? 'Controle de fiado por quinzena ativado ✓' : 'Controle de fiado por quinzena desativado');
  });

  const aplicarDias = () => {
    let v1 = Math.min(31, Math.max(1, Number(dia1.value) || 15));
    let v2 = Math.min(31, Math.max(1, Number(dia2.value) || 30));
    if (v2 <= v1) v2 = Math.min(31, v1 + 1);
    dia1.value = v1; dia2.value = v2;
    state.quinzenaConfig.dia1 = v1;
    state.quinzenaConfig.dia2 = v2;
    salvarQuinzenaConfigLocal();
    renderFinanceiro();
    renderCobranca();
    toast('Dias de corte da quinzena atualizados ✓');
  };
  dia1.addEventListener('change', aplicarDias);
  dia2.addEventListener('change', aplicarDias);
}

// =========================================================
// INIT
// =========================================================
document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('COLE_AQUI')) {
    document.getElementById('configWarning').classList.remove('hidden');
  }

  setupLogin();

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await mostrarApp();
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) {
      mostrarApp();
    } else {
      document.getElementById('app').classList.add('hidden');
      document.getElementById('loginScreen').classList.remove('hidden');
    }
  });
}

function setupLogin() {
  document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const senha = document.getElementById('loginSenha').value;
    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    btn.disabled = false;
    btn.textContent = 'Entrar';
    if (error) toast('Login inválido: verifique e-mail e senha', true);
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
  });
}

// evita reinicializar listeners do painel toda vez que o Supabase reconfirma a sessão
let appJaIniciado = false;
async function mostrarApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  if (appJaIniciado) return;
  appJaIniciado = true;
  await init();
}

async function init() {
  updateClock();
  setInterval(updateClock, 60000);

  state.quinzenaConfig = loadQuinzenaConfig();

  setupNav();
  setupNovoPedidoForm();
  setupClientesForm();
  setupProdutosForm();
  setupFiltroPedidos();
  setupQuinzenaConfig();
  setupDevedoresPopup();
  document.getElementById('buscaCobranca').addEventListener('input', renderCobranca);
  document.getElementById('buscaClientes').addEventListener('input', renderClientesList);
  document.getElementById('finPeriodo').addEventListener('change', renderFinanceiro);
  document.getElementById('btnExportarCSV').addEventListener('click', exportarPedidosCSV);

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
  const { data, error } = await supabaseClient.from('produtos').select('*').order('nome');
  if (error) return toast('Erro ao carregar produtos: ' + error.message, true);
  state.produtosTodos = data || [];
  state.produtos = state.produtosTodos.filter(p => p.ativo);
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

  renderSaudacao(totalHoje, pedidosHoje.length, totalPendente, clientesDevendo);

  document.getElementById('kpiHoje').textContent = BRL(totalHoje);
  document.getElementById('kpiHojeCount').textContent = `${pedidosHoje.length} pedido${pedidosHoje.length === 1 ? '' : 's'}`;
  document.getElementById('kpiAReceber').textContent = BRL(totalPendente);
  document.getElementById('kpiAReceberCount').textContent = `${clientesDevendo} cliente${clientesDevendo === 1 ? '' : 's'} devendo`;
  document.getElementById('kpiMes').textContent = BRL(totalMes);
  document.getElementById('kpiMesCount').textContent = `${pedidosMes.length} pedido${pedidosMes.length === 1 ? '' : 's'}`;
  document.getElementById('kpiLucro').textContent = BRL(lucroMes);
  document.getElementById('kpiLucroMargem').textContent = `margem ${margem.toFixed(0)}%`;

  // ----- gráfico dos últimos 7 dias -----
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const off = d.getTimezoneOffset();
    dias.push(new Date(d.getTime() - off * 60000).toISOString().slice(0, 10));
  }
  const porDia = dias.map(iso => ({
    iso,
    total: state.pedidos.filter(p => p.data_pedido === iso).reduce((s, p) => s + Number(p.valor_total), 0),
  }));
  const maxDia = Math.max(1, ...porDia.map(d => d.total));
  const diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  document.getElementById('dashUltimos7').innerHTML = porDia.map(d => {
    const isHoje = d.iso === hoje;
    const label = `${diasSemana[new Date(d.iso + 'T12:00:00').getDay()]} ${fmtData(d.iso).slice(0, 5)}${isHoje ? ' (hoje)' : ''}`;
    return `
    <div class="bar-row">
      <span class="bar-label">${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.total / maxDia * 100).toFixed(1)}%"></div></div>
      <span class="bar-value mono">${BRL(d.total)}</span>
    </div>`;
  }).join('');

  // ----- destaques do mês: cliente que mais compra e produto mais vendido -----
  const porClienteMes = {};
  const porProdutoMes = {};
  pedidosMes.forEach(p => {
    const cid = p.cliente_id;
    porClienteMes[cid] = porClienteMes[cid] || { nome: p.clientes?.nome || '—', total: 0 };
    porClienteMes[cid].total += Number(p.valor_total);
    (p.itens_pedido || []).forEach(it => {
      const nome = it.produtos?.nome || 'Item';
      porProdutoMes[nome] = (porProdutoMes[nome] || 0) + Number(it.quantidade);
    });
  });
  const topCliente = Object.values(porClienteMes).sort((a, b) => b.total - a.total)[0];
  const topProduto = Object.entries(porProdutoMes).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('destCliente').textContent = topCliente ? `${topCliente.nome} · ${BRL(topCliente.total)}` : 'Sem dados ainda';
  document.getElementById('destProduto').textContent = topProduto ? `${topProduto[0]} · ${topProduto[1]}x vendido${topProduto[1] === 1 ? '' : 's'}` : 'Sem dados ainda';

  document.getElementById('dashPendentes').innerHTML =
    pendentes.slice(0, 5).map(ticketHTML).join('') || emptyMsg('Nenhuma pendência 🎉');
  document.getElementById('dashUltimos').innerHTML =
    state.pedidos.slice(0, 5).map(ticketHTML).join('') || emptyMsg('Nenhum pedido registrado ainda');

  renderClientesInativos();
  bindTicketActions();
}

// Clientes que compravam com uma certa frequência e pararam de aparecer —
// sinal de alerta para o dono tentar recuperar antes que vire perda definitiva.
const INATIVIDADE_DIAS = 14;
function renderClientesInativos() {
  const el = document.getElementById('dashInativos');
  if (!el) return;

  const hoje = new Date(hojeISO() + 'T00:00:00');
  const porCliente = {};
  state.pedidos.forEach(p => {
    if (!p.cliente_id) return;
    const atual = porCliente[p.cliente_id];
    if (!atual || p.data_pedido > atual.ultimoPedido) {
      porCliente[p.cliente_id] = {
        cliente: p.clientes,
        ultimoPedido: p.data_pedido,
        totalPedidos: (atual?.totalPedidos || 0) + 1,
      };
    } else {
      atual.totalPedidos += 1;
    }
  });

  const candidatos = Object.values(porCliente)
    // só entram clientes com pelo menos 2 pedidos no histórico — cliente novo de 1 pedido
    // ainda não tem "frequência" pra dizer que sumiu
    .filter(c => c.totalPedidos >= 2 && c.cliente)
    .map(c => ({
      ...c,
      diasSemPedir: Math.floor((hoje - new Date(c.ultimoPedido + 'T00:00:00')) / 86400000),
    }))
    .filter(c => c.diasSemPedir >= INATIVIDADE_DIAS)
    .sort((a, b) => b.diasSemPedir - a.diasSemPedir)
    .slice(0, 5);

  if (candidatos.length === 0) {
    el.innerHTML = emptyMsg('Todo mundo ativo por aqui 🎉');
    return;
  }

  el.innerHTML = candidatos.map(c => `
    <div class="simple-item">
      <div class="simple-item-main">
        <span class="simple-item-name">${c.cliente.nome}</span>
        <span class="simple-item-sub">último pedido há ${c.diasSemPedir} dias · ${c.totalPedidos} pedidos no histórico</span>
      </div>
      <div class="simple-item-actions">
        ${c.cliente.whatsapp ? `<button class="btn btn-whats btn-sm" data-reativar-cliente="${c.cliente.id}">WhatsApp</button>` : ''}
      </div>
    </div>`
  ).join('');

  document.querySelectorAll('[data-reativar-cliente]').forEach(btn => {
    btn.onclick = () => {
      const c = state.clientes.find(x => x.id === btn.dataset.reativarCliente);
      if (!c?.whatsapp) return;
      const numero = c.whatsapp.replace(/\D/g, '');
      const numeroFinal = numero.length <= 11 ? '55' + numero : numero;
      const msg = `Olá, ${c.nome}! Notei que faz um tempinho que você não pede com a gente — tudo bem? Se quiser dar uma olhada no cardápio de hoje, é só me chamar por aqui 🍱`;
      window.open(`https://wa.me/${numeroFinal}?text=${encodeURIComponent(msg)}`, '_blank');
    };
  });
}

function renderSaudacao(totalHoje, qtdHoje, totalPendente, clientesDevendo) {
  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('greetingHello').textContent = `${saudacao}! 👋`;

  let sub;
  if (qtdHoje === 0) {
    sub = 'Você ainda não registrou nenhum pedido hoje.';
  } else if (totalPendente > 0) {
    sub = `Hoje: ${BRL(totalHoje)} em ${qtdHoje} pedido${qtdHoje === 1 ? '' : 's'} · ${BRL(totalPendente)} a receber de ${clientesDevendo} cliente${clientesDevendo === 1 ? '' : 's'}.`;
  } else {
    sub = `Hoje: ${BRL(totalHoje)} em ${qtdHoje} pedido${qtdHoje === 1 ? '' : 's'} · tudo recebido em dia 🎉`;
  }
  document.getElementById('greetingSub').textContent = sub;
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
  const formaTxt = { imediato: 'Na hora', mais_tarde: 'Mais tarde', quinzena: 'Quinzena' }[p.forma_pagamento] || p.forma_pagamento;
  const origemTxt = p.origem === 'loja' ? ' · <span title="Pedido feito pelo cliente na loja online">🌐 Online</span>' : '';
  const vencida = isQuinzenaVencida(p);
  const vencidoTxt = vencida ? ` <span class="mini-tag mini-tag-danger">vencido ${fmtData(quinzenaVencimento(p.data_pedido))}</span>` : '';

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
        <div class="ticket-meta">${fmtData(p.data_pedido)} · ${formaTxt}${origemTxt}${vencidoTxt}</div>
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

function abrirWhatsapp(cliente, pedidosDoCliente, urgente = false) {
  if (!cliente?.whatsapp) return toast('Este cliente não tem WhatsApp cadastrado', true);
  const total = pedidosDoCliente.reduce((s, p) => s + Number(p.valor_total), 0);
  const linhas = pedidosDoCliente.map(p => {
    const itens = (p.itens_pedido || []).map(it => `${it.quantidade}x ${it.produtos?.nome}`).join(', ');
    return `• ${fmtData(p.data_pedido)} — ${itens} — ${BRL(p.valor_total)}`;
  }).join('\n');
  const intro = urgente
    ? `Olá, ${cliente.nome}! Notei que seu fiado da quinzena passada ainda está em aberto:`
    : `Olá, ${cliente.nome}! Passando para lembrar da sua conta em aberto:`;
  const msg = `${intro}\n\n${linhas}\n\n*Total: ${BRL(total)}*\n\nPode confirmar o pagamento? 🙏`;
  const numero = cliente.whatsapp.replace(/\D/g, '');
  const numeroFinal = numero.length <= 11 ? '55' + numero : numero;
  window.open(`https://wa.me/${numeroFinal}?text=${encodeURIComponent(msg)}`, '_blank');
}

// =========================================================
// NOVO PEDIDO
// =========================================================
function setupNovoPedidoForm() {
  document.getElementById('dataPedido').value = hojeISO();
  const busca = document.getElementById('clienteBusca');
  const sugestoes = document.getElementById('clienteSugestoes');

  busca.addEventListener('input', () => {
    const q = normalize(busca.value.trim());
    if (!q) { sugestoes.classList.add('hidden'); return; }
    const matches = state.clientes.filter(c => normalize(c.nome).includes(q));
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
  document.getElementById('dataPedido').value = p.data_pedido;
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

function produtosParaGrid() {
  const idsAtivos = new Set(state.produtos.map(p => p.id));
  const extras = Object.keys(state.carrinho)
    .filter(id => !idsAtivos.has(id))
    .map(id => state.produtosTodos.find(p => p.id === id))
    .filter(Boolean);
  return [...state.produtos, ...extras];
}

function renderProdutosGridPedido() {
  const grid = document.getElementById('itensProdutos');
  const lista = produtosParaGrid();
  grid.innerHTML = lista.map(p => `
    <div class="produto-card" id="prodcard-${p.id}">
      <span class="produto-nome">${p.nome}${!p.ativo ? ' <span style="color:var(--text-muted);font-weight:400">(inativo)</span>' : ''}</span>
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
    const prod = state.produtosTodos.find(p => p.id === id);
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

  const formaPagamento = document.querySelector('.pay-opt.active')?.dataset.pay || 'imediato';
  const isQuinzena = formaPagamento === 'quinzena';
  const taxa = isQuinzena ? (Number(document.getElementById('taxaQuinzena').value) || 0) : 0;
  const dataPedido = document.getElementById('dataPedido').value || hojeISO();
  const editando = !!state.pedidoEditando;

  const btn = document.getElementById('btnSalvarPedido');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    let valorProdutos = 0;
    const itensPayload = itens.map(([produtoId, qtd]) => {
      // usamos produtosTodos (inclui inativos) para nunca travar ao editar
      // um pedido antigo que tenha um item que foi descontinuado depois
      const prod = state.produtosTodos.find(p => p.id === produtoId);
      if (!prod) throw new Error('Um dos produtos do pedido não foi encontrado. Atualize a página e tente novamente.');
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

    let pedidoId;
    if (editando) {
      pedidoId = state.pedidoEditando;
      const { error } = await supabaseClient.from('pedidos').update({
        cliente_id: state.clienteSelecionado.id,
        data_pedido: dataPedido,
        forma_pagamento: formaPagamento,
        taxa_quinzena: taxa,
        valor_produtos: valorProdutos,
        valor_total: valorProdutos + taxa,
        observacoes: document.getElementById('obsPedido').value.trim() || null,
      }).eq('id', pedidoId);
      if (error) throw error;

      const { error: errDel } = await supabaseClient.from('itens_pedido').delete().eq('pedido_id', pedidoId);
      if (errDel) throw errDel;
    } else {
      const pago = formaPagamento === 'imediato';
      const { data: pedido, error } = await supabaseClient.from('pedidos').insert({
        cliente_id: state.clienteSelecionado.id,
        data_pedido: dataPedido,
        forma_pagamento: formaPagamento,
        taxa_quinzena: taxa,
        status_pagamento: pago ? 'pago' : 'pendente',
        valor_produtos: valorProdutos,
        valor_total: valorProdutos + taxa,
        data_pagamento: pago ? dataPedido : null,
        observacoes: document.getElementById('obsPedido').value.trim() || null,
      }).select().single();
      if (error) throw error;
      pedidoId = pedido.id;
    }

    const { error: errItens } = await supabaseClient.from('itens_pedido').insert(
      itensPayload.map(it => ({ ...it, pedido_id: pedidoId }))
    );
    if (errItens) throw errItens;

    toast(editando ? 'Pedido atualizado ✓' : 'Pedido registrado ✓');
    resetFormPedido();
    await loadPedidos();
    renderAllViews();
    switchView('pedidos');
  } catch (err) {
    console.error('Erro ao salvar pedido:', err);
    toast('Erro ao salvar: ' + (err?.message || 'tente novamente'), true);
  } finally {
    btn.disabled = false;
    btn.textContent = state.pedidoEditando ? 'Salvar alterações' : 'Registrar pedido';
  }
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
  document.getElementById('dataPedido').value = hojeISO();
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
  document.getElementById('buscaPedidos').addEventListener('input', renderPedidosList);
  document.getElementById('btnLimparFiltro').addEventListener('click', () => {
    document.getElementById('filtroData').value = '';
    document.getElementById('filtroStatus').value = 'todos';
    document.getElementById('buscaPedidos').value = '';
    renderPedidosList();
  });
}

function renderPedidosList() {
  const data = document.getElementById('filtroData').value;
  const status = document.getElementById('filtroStatus').value;
  const busca = normalize(document.getElementById('buscaPedidos').value.trim());
  let lista = state.pedidos;
  if (data) lista = lista.filter(p => p.data_pedido === data);
  if (status !== 'todos') lista = lista.filter(p => p.status_pagamento === status);
  if (busca) {
    lista = lista.filter(p => {
      const nomeMatch = normalize(p.clientes?.nome).includes(busca);
      const itemMatch = (p.itens_pedido || []).some(it => normalize(it.produtos?.nome).includes(busca));
      return nomeMatch || itemMatch;
    });
  }

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

  // marca grupos com fiado de quinzena vencido (da quinzena anterior, ainda não pago)
  let grupos = Object.values(porCliente).map(g => {
    const pedidosVencidos = g.pedidos.filter(isQuinzenaVencida);
    return {
      ...g,
      vencido: pedidosVencidos.length > 0,
      totalVencido: pedidosVencidos.reduce((s, p) => s + Number(p.valor_total), 0),
    };
  });

  // quem está atrasado da quinzena anterior sobe pro topo, depois por valor
  grupos.sort((a, b) => (b.vencido - a.vencido) || (b.total - a.total));

  const buscaEl = document.getElementById('buscaCobranca');
  const busca = normalize(buscaEl ? buscaEl.value.trim() : '');
  if (busca) grupos = grupos.filter(g => normalize(g.cliente?.nome).includes(busca));

  const banner = document.getElementById('cobrancaAtrasoBanner');
  if (banner) {
    const vencidos = grupos.filter(g => g.vencido);
    if (state.quinzenaConfig.ativa && vencidos.length > 0) {
      const totalVencido = vencidos.reduce((s, g) => s + g.totalVencido, 0);
      banner.classList.remove('hidden');
      banner.innerHTML = `⚠️ <strong>${vencidos.length} cliente${vencidos.length === 1 ? '' : 's'}</strong> ainda deve fiado da <strong>quinzena anterior</strong> — total de <strong>${BRL(totalVencido)}</strong> atrasado.`;
    } else {
      banner.classList.add('hidden');
    }
  }

  document.getElementById('listaCobranca').innerHTML = grupos.map(g => `
    <div class="cobranca-grupo ${g.vencido ? 'cobranca-grupo-vencido' : ''}">
      <div class="cobranca-grupo-head">
        <div>
          <div class="ticket-cliente">${g.cliente?.nome || '—'}${g.vencido ? ' <span class="mini-tag mini-tag-danger">quinzena vencida</span>' : ''}</div>
          <div class="ticket-meta">${g.pedidos.length} pedido${g.pedidos.length === 1 ? '' : 's'} em aberto ${g.cliente?.whatsapp ? '· ' + g.cliente.whatsapp : '· sem WhatsApp cadastrado'}</div>
        </div>
        <span class="ticket-total">${BRL(g.total)}</span>
      </div>
      <div class="cobranca-grupo-actions">
        <button class="btn btn-whats btn-sm" data-cobrar-cliente="${g.cliente?.id}">WhatsApp</button>
        <button class="btn btn-success btn-sm" data-pagar-tudo="${g.cliente?.id}">Marcar tudo pago</button>
      </div>
      <div class="cobranca-grupo-pedidos ticket-list">
        ${g.pedidos.map(ticketHTML).join('')}
      </div>
    </div>
  `).join('') || emptyMsg('Ninguém devendo — tudo em dia 🎉');

  bindTicketActions();
  document.querySelectorAll('[data-cobrar-cliente]').forEach(btn => {
    btn.onclick = () => {
      const g = grupos.find(x => x.cliente?.id === btn.dataset.cobrarCliente);
      if (g) abrirWhatsapp(g.cliente, g.pedidos, g.vencido);
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
    try {
      const { error } = await supabaseClient.from('clientes')
        .update({ nome, whatsapp: whats || null })
        .eq('id', state.editClienteId);
      if (error) throw error;
      toast('Cliente atualizado ✓');
      closeSheet('editClienteOverlay');
      await refreshAll();
    } catch (err) {
      console.error('Erro ao atualizar cliente:', err);
      toast('Erro ao salvar: ' + (err?.message || 'tente novamente'), true);
    }
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
  const buscaEl = document.getElementById('buscaClientes');
  const busca = normalize(buscaEl ? buscaEl.value.trim() : '');
  const lista = busca ? state.clientes.filter(c => normalize(c.nome).includes(busca)) : state.clientes;

  document.getElementById('listaClientes').innerHTML = lista.map(c => {
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
    const imagemUrl = document.getElementById('prImagem').value.trim();
    const visivelLoja = document.getElementById('prVisivelLoja').checked;
    if (!nome || isNaN(custo) || isNaN(preco)) return;
    const { data, error } = await supabaseClient.from('produtos')
      .insert({ nome, custo, preco_venda: preco, imagem_url: imagemUrl || null, visivel_loja: visivelLoja })
      .select().single();
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
    const imagemUrl = document.getElementById('editPrImagem').value.trim();
    const visivelLoja = document.getElementById('editPrVisivelLoja').checked;
    if (!nome || isNaN(custo) || isNaN(preco)) return toast('Preencha todos os campos', true);
    try {
      const { error } = await supabaseClient.from('produtos')
        .update({ nome, custo, preco_venda: preco, imagem_url: imagemUrl || null, visivel_loja: visivelLoja })
        .eq('id', state.editProdutoId);
      if (error) throw error;
      toast('Produto atualizado ✓');
      closeSheet('editProdutoOverlay');
      await loadProdutos();
      renderProdutosList();
      renderProdutosGridPedido();
    } catch (err) {
      console.error('Erro ao atualizar produto:', err);
      toast('Erro ao salvar: ' + (err?.message || 'tente novamente'), true);
    }
  });
}

function abrirEditProduto(id) {
  const p = state.produtos.find(x => x.id === id);
  if (!p) return;
  state.editProdutoId = id;
  document.getElementById('editPrNome').value = p.nome || '';
  document.getElementById('editPrCusto').value = p.custo;
  document.getElementById('editPrPreco').value = p.preco_venda;
  document.getElementById('editPrImagem').value = p.imagem_url || '';
  document.getElementById('editPrVisivelLoja').checked = !!p.visivel_loja;
  openSheet('editProdutoOverlay');
}

function renderProdutosList() {
  document.getElementById('listaProdutos').innerHTML = state.produtos.map(p => {
    const margem = p.preco_venda > 0 ? ((p.preco_venda - p.custo) / p.preco_venda * 100) : 0;
    const thumb = p.imagem_url
      ? `<img class="produto-thumb" src="${p.imagem_url}" alt="">`
      : `<div class="produto-thumb produto-thumb-placeholder">🍱</div>`;
    const lojaBadge = p.visivel_loja
      ? `<span class="stamp stamp-success" style="transform:none">🌐 Na loja</span>`
      : `<span class="stamp" style="transform:none;color:var(--text-muted)">Oculto na loja</span>`;
    return `
    <div class="simple-item">
      ${thumb}
      <div class="simple-item-main">
        <span class="simple-item-name">${p.nome}</span>
        <span class="simple-item-sub">custo ${BRL(p.custo)} · venda ${BRL(p.preco_venda)}</span>
      </div>
      <div class="simple-item-actions">
        ${lojaBadge}
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
// EXPORTAR / BACKUP (CSV)
// =========================================================
function csvEscape(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  // aspas duplas, vírgula ou quebra de linha exigem "escapar" o campo
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportarPedidosCSV() {
  const periodo = document.getElementById('finPeriodo').value;
  const lista = filtrarPedidosPorPeriodo(periodo);

  if (lista.length === 0) return toast('Nenhum pedido no período selecionado', true);

  const cabecalho = ['Data', 'Cliente', 'WhatsApp', 'Itens', 'Forma de pagamento', 'Status', 'Valor total', 'Origem'];
  const linhas = lista.map(p => {
    const itensTxt = (p.itens_pedido || []).map(it => `${it.quantidade}x ${it.produtos?.nome || 'item'}`).join('; ');
    const formaTxt = { imediato: 'Na hora', mais_tarde: 'Mais tarde', quinzena: 'Quinzena' }[p.forma_pagamento] || p.forma_pagamento;
    return [
      fmtData(p.data_pedido),
      p.clientes?.nome || '',
      p.clientes?.whatsapp || '',
      itensTxt,
      formaTxt,
      p.status_pagamento === 'pago' ? 'Pago' : 'Pendente',
      Number(p.valor_total).toFixed(2).replace('.', ','),
      p.origem === 'loja' ? 'Loja online' : 'Painel',
    ].map(csvEscape).join(',');
  });

  // BOM (\ufeff) garante que o Excel abra os acentos corretamente
  const csv = '\ufeff' + [cabecalho.map(csvEscape).join(','), ...linhas].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pedidos_${periodo}_${hojeISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`${lista.length} pedido${lista.length === 1 ? '' : 's'} exportado${lista.length === 1 ? '' : 's'} ✓`);
}

// =========================================================
// DEVEDORES POR PERÍODO (cards clicáveis + popup no Financeiro)
// =========================================================

// devolve uma função que testa se um pedido pertence ao período pedido
function filtroPeriodoDevedores(tipo, ref) {
  if (tipo === 'dia') return (p) => p.data_pedido === ref;
  if (tipo === 'semana') {
    const [ini, fim] = ref.split('_');
    return (p) => p.data_pedido >= ini && p.data_pedido <= fim;
  }
  if (tipo === 'mes') return (p) => p.data_pedido.slice(0, 7) === ref;
  if (tipo === 'quinzena_atrasada') return (p) => isQuinzenaVencida(p);
  return () => true;
}

// agrupa pedidos pendentes de um período por cliente, já somando totais
function devedoresDoPeriodo(tipo, ref) {
  const filtro = filtroPeriodoDevedores(tipo, ref);
  const pendentes = state.pedidos.filter(p => p.status_pagamento === 'pendente' && filtro(p));
  const porCliente = {};
  pendentes.forEach(p => {
    const cid = p.cliente_id;
    if (!porCliente[cid]) porCliente[cid] = { cliente: p.clientes, pedidos: [], total: 0 };
    porCliente[cid].pedidos.push(p);
    porCliente[cid].total += Number(p.valor_total);
  });
  return Object.values(porCliente).sort((a, b) => b.total - a.total);
}

function gerarCardsPeriodo() {
  const hoje = hojeISO();
  const hojeDate = new Date(hoje + 'T12:00:00');

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(hojeDate); d.setDate(d.getDate() - i);
    const iso = isoFromDate(d);
    const label = i === 0 ? 'Hoje' : i === 1 ? 'Ontem' : fmtData(iso).slice(0, 5);
    dias.push({ tipo: 'dia', ref: iso, label, sub: diaSemanaCurto(iso) });
  }

  const semanas = [];
  for (let i = 0; i < 4; i++) {
    const { inicio, fim } = semanaRange(hojeDate, i);
    const label = i === 0 ? 'Esta semana' : `${fmtData(inicio).slice(0, 5)}–${fmtData(fim).slice(0, 5)}`;
    semanas.push({ tipo: 'semana', ref: `${inicio}_${fim}`, label, sub: '' });
  }

  const meses = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(hojeDate.getFullYear(), hojeDate.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = i === 0 ? 'Este mês' : mesNome(d);
    const sub = d.getFullYear() !== hojeDate.getFullYear() ? String(d.getFullYear()) : '';
    meses.push({ tipo: 'mes', ref: ym, label, sub });
  }

  return { dias, semanas, meses };
}

function cardPeriodoHTML(item) {
  const devedores = devedoresDoPeriodo(item.tipo, item.ref);
  const total = devedores.reduce((s, d) => s + d.total, 0);
  const qtd = devedores.length;
  const vazio = qtd === 0;
  const labelCompleto = `${item.label}${item.sub ? ' · ' + item.sub : ''}`;
  return `
  <button type="button" class="periodo-card ${vazio ? 'periodo-card-ok' : ''}"
    data-periodo-tipo="${item.tipo}" data-periodo-ref="${item.ref}" data-periodo-label="${labelCompleto}">
    <span class="periodo-card-label">${item.label}</span>
    ${item.sub ? `<span class="periodo-card-sub">${item.sub}</span>` : ''}
    <span class="periodo-card-valor mono">${vazio ? '—' : BRL(total)}</span>
    <span class="periodo-card-count">${vazio ? 'tudo em dia' : qtd + (qtd === 1 ? ' devendo' : ' devendo')}</span>
  </button>`;
}

function renderPeriodoCards() {
  const { dias, semanas, meses } = gerarCardsPeriodo();

  document.getElementById('periodoCardsDias').innerHTML = dias.map(cardPeriodoHTML).join('');
  document.getElementById('periodoCardsSemanas').innerHTML = semanas.map(cardPeriodoHTML).join('');
  document.getElementById('periodoCardsMeses').innerHTML = meses.map(cardPeriodoHTML).join('');

  const atrasadoWrap = document.getElementById('quinzenaAtrasadaWrap');
  if (state.quinzenaConfig.ativa) {
    const devedores = devedoresDoPeriodo('quinzena_atrasada', '');
    const total = devedores.reduce((s, d) => s + d.total, 0);
    atrasadoWrap.classList.remove('hidden');
    atrasadoWrap.innerHTML = devedores.length > 0 ? `
      <button type="button" class="periodo-card periodo-card-alert"
        data-periodo-tipo="quinzena_atrasada" data-periodo-ref="" data-periodo-label="Quinzena anterior (atrasado)">
        <span class="periodo-card-label">🔴 Devendo da quinzena anterior</span>
        <span class="periodo-card-valor mono">${BRL(total)}</span>
        <span class="periodo-card-count">${devedores.length} cliente${devedores.length === 1 ? '' : 's'} atrasado${devedores.length === 1 ? '' : 's'} — toque para cobrar</span>
      </button>` : `
      <div class="periodo-card-ok-full">🎉 Ninguém atrasado da quinzena anterior</div>`;
  } else {
    atrasadoWrap.classList.add('hidden');
    atrasadoWrap.innerHTML = '';
  }

  document.querySelectorAll('[data-periodo-tipo]').forEach(btn => {
    btn.onclick = () => abrirDevedoresPopup(btn.dataset.periodoTipo, btn.dataset.periodoRef, btn.dataset.periodoLabel);
  });
}

function abrirDevedoresPopup(tipo, ref, label) {
  const devedores = devedoresDoPeriodo(tipo, ref);
  const total = devedores.reduce((s, d) => s + d.total, 0);

  document.getElementById('devedoresTitulo').textContent = label || 'Devedores';
  document.getElementById('devedoresResumo').textContent = devedores.length > 0
    ? `${devedores.length} cliente${devedores.length === 1 ? '' : 's'} devendo · total ${BRL(total)}`
    : 'Ninguém devendo neste período 🎉';

  document.getElementById('devedoresLista').innerHTML = devedores.map(d => {
    const temVencido = d.pedidos.some(isQuinzenaVencida);
    const vencidoTag = temVencido ? '<span class="mini-tag mini-tag-danger">vencido</span>' : '';
    const semWhats = !d.cliente?.whatsapp;
    const iniciais = (d.cliente?.nome || '?').trim().charAt(0).toUpperCase();
    return `
    <div class="devedor-row">
      <div class="devedor-avatar">${iniciais}</div>
      <div class="devedor-info">
        <div class="devedor-nome">${d.cliente?.nome || '—'} ${vencidoTag}</div>
        <div class="devedor-sub">${d.pedidos.length} pedido${d.pedidos.length === 1 ? '' : 's'}${semWhats ? ' · sem WhatsApp' : ''}</div>
      </div>
      <div class="devedor-valor mono">${BRL(d.total)}</div>
      ${semWhats ? '' : `<button class="btn btn-whats btn-sm" data-devedor-whats="${d.cliente.id}">WhatsApp</button>`}
    </div>`;
  }).join('') || emptyMsg('Ninguém devendo neste período 🎉');

  document.querySelectorAll('[data-devedor-whats]').forEach(btn => {
    btn.onclick = () => {
      const d = devedores.find(x => x.cliente?.id === btn.dataset.devedorWhats);
      if (d) abrirWhatsapp(d.cliente, d.pedidos, d.pedidos.some(isQuinzenaVencida));
    };
  });

  openSheet('devedoresOverlay');
}

function setupDevedoresPopup() {
  document.getElementById('devedoresFechar').addEventListener('click', () => closeSheet('devedoresOverlay'));
  document.getElementById('devedoresOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'devedoresOverlay') closeSheet('devedoresOverlay');
  });
}

// =========================================================
// FINANCEIRO
// =========================================================
function filtrarPedidosPorPeriodo(periodo) {
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
  return lista;
}

function renderFinanceiro() {
  renderPeriodoCards();

  const periodo = document.getElementById('finPeriodo').value;
  const lista = filtrarPedidosPorPeriodo(periodo);

  const faturamento = lista.reduce((s, p) => s + Number(p.valor_total), 0);
  const custo = lista.reduce((s, p) => s + custoPedido(p), 0);
  const taxas = lista.reduce((s, p) => s + Number(p.taxa_quinzena || 0), 0);
  const lucro = faturamento - custo;
  const margem = faturamento > 0 ? (lucro / faturamento * 100) : 0;
  const aberto = lista.filter(p => p.status_pagamento === 'pendente').reduce((s, p) => s + Number(p.valor_total), 0);
  const recebido = lista.filter(p => p.status_pagamento === 'pago').reduce((s, p) => s + Number(p.valor_total), 0);
  const ticketMedio = lista.length > 0 ? faturamento / lista.length : 0;

  document.getElementById('finFaturamento').textContent = BRL(faturamento);
  document.getElementById('finCusto').textContent = BRL(custo);
  document.getElementById('finLucro').textContent = BRL(lucro);
  document.getElementById('finMargem').textContent = `margem ${margem.toFixed(0)}%`;
  document.getElementById('finTicketMedio').textContent = BRL(ticketMedio);
  document.getElementById('finQtdPedidos').textContent = `${lista.length} pedido${lista.length === 1 ? '' : 's'}`;
  document.getElementById('finTaxas').textContent = BRL(taxas);
  document.getElementById('finAberto').textContent = BRL(aberto);
  document.getElementById('finRecebido').textContent = BRL(recebido);

  // ----- vendas por produto -----
  const porProduto = {};
  lista.forEach(p => (p.itens_pedido || []).forEach(it => {
    const nome = it.produtos?.nome || 'Item';
    porProduto[nome] = (porProduto[nome] || 0) + Number(it.subtotal);
  }));
  const maxProduto = Math.max(1, ...Object.values(porProduto));
  const linhasProduto = Object.entries(porProduto).sort((a, b) => b[1] - a[1]);

  document.getElementById('finProdutos').innerHTML = linhasProduto.map(([nome, valor]) => `
    <div class="bar-row">
      <span class="bar-label">${nome}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(valor / maxProduto * 100).toFixed(1)}%"></div></div>
      <span class="bar-value mono">${BRL(valor)}</span>
    </div>
  `).join('') || emptyMsg('Sem vendas no período');

  // ----- vendas nos últimos 7 dias (sempre, independente do filtro de período) -----
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const off = d.getTimezoneOffset();
    dias.push(new Date(d.getTime() - off * 60000).toISOString().slice(0, 10));
  }
  const porDia = dias.map(iso => ({
    iso,
    total: state.pedidos.filter(p => p.data_pedido === iso).reduce((s, p) => s + Number(p.valor_total), 0),
  }));
  const maxDia = Math.max(1, ...porDia.map(d => d.total));
  const diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  document.getElementById('finUltimos7').innerHTML = porDia.map(d => {
    const label = `${diasSemana[new Date(d.iso + 'T12:00:00').getDay()]} ${fmtData(d.iso).slice(0, 5)}`;
    return `
    <div class="bar-row">
      <span class="bar-label">${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.total / maxDia * 100).toFixed(1)}%"></div></div>
      <span class="bar-value mono">${BRL(d.total)}</span>
    </div>`;
  }).join('');

  // ----- ranking de clientes (quem compra mais / quem compra menos) -----
  const porCliente = {};
  lista.forEach(p => {
    const cid = p.cliente_id;
    if (!porCliente[cid]) porCliente[cid] = { cliente: p.clientes, total: 0, qtd: 0 };
    porCliente[cid].total += Number(p.valor_total);
    porCliente[cid].qtd += 1;
  });
  const ranking = Object.values(porCliente).sort((a, b) => b.total - a.total);
  const medalhas = ['🥇', '🥈', '🥉'];

  document.getElementById('finRankingClientes').innerHTML = ranking.map((r, i) => `
    <div class="rank-item">
      <span class="rank-pos ${i < 3 ? 'medal' : ''}">${i < 3 ? medalhas[i] : i + 1}</span>
      <div class="rank-main">
        <div class="rank-name">${r.cliente?.nome || '—'}</div>
        <div class="rank-sub">${r.qtd} pedido${r.qtd === 1 ? '' : 's'} · ticket médio ${BRL(r.total / r.qtd)}</div>
      </div>
      <span class="rank-value">${BRL(r.total)}</span>
    </div>
  `).join('') || emptyMsg('Sem pedidos no período');
}