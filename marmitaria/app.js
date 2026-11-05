// =========================================================
// MARMITA CONTROL v2 — núcleo (estado, utilidades, dados, navegação)
// Os demais arquivos (app-*.js) adicionam cada tela.
// =========================================================

const state = {
  clientes: [],        // todos (inclui arquivados)
  produtos: [],        // ativos
  produtosTodos: [],   // todos, inclusive desativados (pedidos antigos dependem deles)
  pedidos: [],         // TODOS os pedidos desde o início, com itens e cliente
  pagamentos: [],      // recebimentos registrados (tabela nova)
  despesas: [],
  carrinho: {},
  clienteSelecionado: null,
  view: 'dashboard',
  viewAnterior: null,
  pedidoEditando: null,
  editClienteId: null,
  editProdutoId: null,
  itensEditando: null,
  fichaClienteId: null,
  rec: {               // recursos do banco (liberados pelo melhorias-v2.sql)
    clientesExtra: false, produtosExtra: false, pedidosExtra: false, pagamentos: false, despesas: false,
  },
  cfg: {},
  quinzenaConfig: { ativa: false, dia1: 15, dia2: 30 },
};

// ---------------------------------------------------------
// Utilidades
// ---------------------------------------------------------
const $ = (id) => document.getElementById(id);
const BRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v) => Number(v) || 0;
const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;

// Escapa texto vindo do banco antes de colocar em innerHTML
// (nomes cadastrados pela loja online não podem virar código na página)
function esc(v) {
  return (v === null || v === undefined ? '' : String(v))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalize(str) {
  return (str || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const soDigitos = (s) => (s || '').replace(/\D/g, '');

function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('toast-error', isError);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function fmtData(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
const fmtDataCurta = (iso) => fmtData(iso).slice(0, 5);

function isoFromDate(d) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
const hojeISO = () => isoFromDate(new Date());
const dateFromISO = (iso) => new Date(iso + 'T12:00:00');
function addDias(iso, n) { const d = dateFromISO(iso); d.setDate(d.getDate() + n); return isoFromDate(d); }
function diasEntre(isoA, isoB) { return Math.round((dateFromISO(isoB) - dateFromISO(isoA)) / 86400000); }

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_SEMANA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemanaCurto = (iso) => DIAS_SEMANA_CURTO[dateFromISO(iso).getDay()];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesNome = (d) => MESES[d.getMonth()];
function mesLabel(ym) { const [y, m] = ym.split('-').map(Number); return `${MESES_CURTO[m - 1]}/${String(y).slice(2)}`; }
function mesesEntre(ymIni, ymFim) {
  const out = []; let [y, m] = ymIni.split('-').map(Number); const [y2, m2] = ymFim.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

function semanaRange(refDate, semanasAtras) {
  const d = new Date(refDate);
  d.setDate(d.getDate() - semanasAtras * 7);
  const offsetSeg = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const inicio = new Date(d); inicio.setDate(d.getDate() - offsetSeg);
  const fim = new Date(inicio); fim.setDate(inicio.getDate() + 6);
  return { inicio: isoFromDate(inicio), fim: isoFromDate(fim) };
}

function emptyMsg(txt) { return `<div class="empty">${esc(txt)}</div>`; }

function formatarTelefone(v) {
  let d = soDigitos(v);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}
function linkWhats(telefone, msg) {
  const n = soDigitos(telefone);
  const final = n.length <= 11 ? '55' + n : n;
  return `https://wa.me/${final}?text=${encodeURIComponent(msg)}`;
}
function abrirLinkWhats(telefone, msg) {
  if (!telefone) return toast('Este cliente não tem WhatsApp cadastrado', true);
  window.open(linkWhats(telefone, msg), '_blank');
}

function iniciais(nome) {
  const partes = (nome || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

const FORMA_PEDIDO_TXT = { imediato: 'Na hora', mais_tarde: 'Mais tarde', quinzena: 'Quinzena' };
const FORMAS_REC = [
  { id: 'pix', nome: 'Pix' }, { id: 'dinheiro', nome: 'Dinheiro' },
  { id: 'cartao', nome: 'Cartão' }, { id: 'outro', nome: 'Outro' },
];
const formaRecNome = (id) => FORMAS_REC.find(f => f.id === id)?.nome || 'Não informado';

// ---------------------------------------------------------
// Regras de dinheiro (fiado)
// ---------------------------------------------------------
// Quanto ainda falta pagar de um pedido (considera abatimentos parciais)
function saldoPedido(p) {
  if (p.status_pagamento !== 'pendente') return 0;
  return Math.max(0, num(p.valor_total) - num(p.valor_pago));
}
function custoPedido(p) {
  return (p.itens_pedido || []).reduce((s, it) => s + num(it.custo_unitario) * num(it.quantidade), 0);
}
const pendentes = () => state.pedidos.filter(p => p.status_pagamento === 'pendente');
function saldoCliente(clienteId) {
  return state.pedidos.reduce((s, p) => s + (p.cliente_id === clienteId ? saldoPedido(p) : 0), 0);
}
function clientePorId(id) { return state.clientes.find(c => c.id === id); }
const clienteAtivo = (c) => c && c.ativo !== false;

// ---------------------------------------------------------
// Fiado por quinzena
// ---------------------------------------------------------
function ultimoDiaDoMes(ano, mes) { return new Date(ano, mes, 0).getDate(); }
function quinzenaVencimento(dataISO) {
  if (!state.quinzenaConfig.ativa) return null;
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const ult = ultimoDiaDoMes(ano, mes);
  const c1 = Math.min(state.quinzenaConfig.dia1, ult);
  const c2 = Math.min(state.quinzenaConfig.dia2, ult);
  const pad = (n) => String(n).padStart(2, '0');
  if (dia <= c1) return `${ano}-${pad(mes)}-${pad(c1)}`;
  if (dia <= c2) return `${ano}-${pad(mes)}-${pad(c2)}`;
  let a = ano, m = mes + 1; if (m > 12) { m = 1; a++; }
  return `${a}-${pad(m)}-${pad(Math.min(state.quinzenaConfig.dia1, ultimoDiaDoMes(a, m)))}`;
}
function isQuinzenaVencida(p) {
  if (p.status_pagamento !== 'pendente' || p.forma_pagamento !== 'quinzena') return false;
  const venc = quinzenaVencimento(p.data_pedido);
  return !!venc && venc < hojeISO();
}

// ---------------------------------------------------------
// Ajustes salvos no aparelho
// ---------------------------------------------------------
function lerLocal(chave, padrao) {
  try { const raw = localStorage.getItem(chave); if (raw) return { ...padrao, ...JSON.parse(raw) }; } catch (e) { /* sem storage */ }
  return { ...padrao };
}
function salvarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem storage: vale só nesta sessão */ }
}

// ---------------------------------------------------------
// Boot / login
// ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('COLE_AQUI')) $('configWarning').classList.remove('hidden');
  setupLogin();
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await mostrarApp();
  else $('loginScreen').classList.remove('hidden');

  supabaseClient.auth.onAuthStateChange((_e, s) => {
    if (s) mostrarApp();
    else { $('app').classList.add('hidden'); $('loginScreen').classList.remove('hidden'); }
  });
}

function setupLogin() {
  $('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btnLogin');
    btn.disabled = true; btn.textContent = 'Entrando...';
    const { error } = await supabaseClient.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginSenha').value });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) toast('E-mail ou senha incorretos', true);
  });
  $('btnLogout').addEventListener('click', () => supabaseClient.auth.signOut());
}

let appJaIniciado = false;
async function mostrarApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  if (appJaIniciado) return;
  appJaIniciado = true;
  await init();
}

async function init() {
  state.cfg = lerLocal('marmita_cfg', { nome: '', pix: '', inatividade: 14 });
  state.quinzenaConfig = lerLocal('marmita_quinzena_config', { ativa: false, dia1: 15, dia2: 30 });
  updateClock(); setInterval(updateClock, 60000);

  setupNav();
  setupSheets();
  setupAjustes();
  setupNovoPedido();
  setupPedidos();
  setupFiado();
  setupClientes();
  setupProdutos();
  setupFinanceiro();

  $('btnRecarregar').addEventListener('click', async () => { await refreshAll(); toast('Dados atualizados ✓'); });

  await detectarRecursos();
  await refreshAll();
  switchView('dashboard');
}

function updateClock() {
  $('clockDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

// ---------------------------------------------------------
// Recursos do banco: o painel liga cada função nova só se a
// coluna/tabela existir (melhorias-v2.sql). Sem o SQL, tudo
// que já existia continua funcionando normalmente.
// ---------------------------------------------------------
async function detectarRecursos() {
  const testa = async (tabela, colunas) => {
    const { error } = await supabaseClient.from(tabela).select(colunas).limit(1);
    return !error;
  };
  const [a, b, c, d, e] = await Promise.all([
    testa('clientes', 'apelido,empresa,endereco,aniversario,limite_fiado,ativo'),
    testa('produtos', 'categoria,descricao'),
    testa('pedidos', 'valor_pago,forma_recebimento'),
    testa('pagamentos', 'id'),
    testa('despesas', 'id'),
  ]);
  state.rec = { clientesExtra: a, produtosExtra: b, pedidosExtra: c, pagamentos: d, despesas: e };
  document.querySelectorAll('[data-rec]').forEach(el => el.classList.toggle('hidden', !state.rec[el.dataset.rec]));
  renderRecursosStatus();
}

// ---------------------------------------------------------
// Carregamento de dados — SEMPRE paginado.
// O Supabase devolve no máximo 1000 linhas por consulta; sem
// paginar, os pedidos mais antigos sumiriam do histórico.
// ---------------------------------------------------------
async function buscarTudo(tabela, select, ordens) {
  const TAM = 1000;
  let todos = [], de = 0;
  for (;;) {
    let q = supabaseClient.from(tabela).select(select);
    ordens.forEach(([col, asc]) => { q = q.order(col, { ascending: asc }); });
    const { data, error } = await q.range(de, de + TAM - 1);
    if (error) throw error;
    todos = todos.concat(data || []);
    if (!data || data.length < TAM) break;
    de += TAM;
  }
  return todos;
}

async function loadClientes() {
  try { state.clientes = await buscarTudo('clientes', '*', [['nome', true], ['id', true]]); }
  catch (e) { toast('Erro ao carregar clientes: ' + e.message, true); }
}
async function loadProdutos() {
  try {
    state.produtosTodos = await buscarTudo('produtos', '*', [['nome', true], ['id', true]]);
    state.produtos = state.produtosTodos.filter(p => p.ativo);
  } catch (e) { toast('Erro ao carregar produtos: ' + e.message, true); }
}
async function loadPedidos() {
  try {
    state.pedidos = await buscarTudo('pedidos',
      '*, clientes(id,nome,whatsapp), itens_pedido(*, produtos(nome))',
      [['data_pedido', false], ['created_at', false], ['id', true]]);
  } catch (e) { toast('Erro ao carregar pedidos: ' + e.message, true); }
}
async function loadPagamentos() {
  if (!state.rec.pagamentos) { state.pagamentos = []; return; }
  try { state.pagamentos = await buscarTudo('pagamentos', '*', [['data_pagamento', false], ['created_at', false]]); }
  catch (e) { state.pagamentos = []; }
}
async function loadDespesas() {
  if (!state.rec.despesas) { state.despesas = []; return; }
  try { state.despesas = await buscarTudo('despesas', '*', [['data', false], ['created_at', false]]); }
  catch (e) { state.despesas = []; }
}

async function refreshAll() {
  await Promise.all([loadClientes(), loadProdutos(), loadPedidos(), loadPagamentos(), loadDespesas()]);
  // o join de pedidos traz só id/nome/whatsapp: completa com o cadastro inteiro
  const mapa = new Map(state.clientes.map(c => [c.id, c]));
  state.pedidos.forEach(p => { if (mapa.has(p.cliente_id)) p.clientes = mapa.get(p.cliente_id); });
  invalidarStats();
  renderAllViews();
}
async function recarregarPedidos() {
  await Promise.all([loadPedidos(), loadPagamentos()]);
  const mapa = new Map(state.clientes.map(c => [c.id, c]));
  state.pedidos.forEach(p => { if (mapa.has(p.cliente_id)) p.clientes = mapa.get(p.cliente_id); });
  invalidarStats();
  renderAllViews();
}

// ---------------------------------------------------------
// Estatísticas por cliente (cache — recalculado quando os dados mudam)
// ---------------------------------------------------------
let _stats = null;
function invalidarStats() { _stats = null; }
function statsClientes() {
  if (_stats) return _stats;
  const m = new Map();
  // pedidos estão do mais novo para o mais antigo
  state.pedidos.forEach(p => {
    let s = m.get(p.cliente_id);
    if (!s) { s = { total: 0, qtd: 0, primeiro: p.data_pedido, ultimo: p.data_pedido, saldo: 0, maisAntigoAberto: null }; m.set(p.cliente_id, s); }
    s.total += num(p.valor_total);
    s.qtd += 1;
    if (p.data_pedido < s.primeiro) s.primeiro = p.data_pedido;
    if (p.data_pedido > s.ultimo) s.ultimo = p.data_pedido;
    const sp = saldoPedido(p);
    if (sp > 0) {
      s.saldo += sp;
      if (!s.maisAntigoAberto || p.data_pedido < s.maisAntigoAberto) s.maisAntigoAberto = p.data_pedido;
    }
  });
  _stats = m;
  return m;
}
const statsDe = (clienteId) => statsClientes().get(clienteId) || { total: 0, qtd: 0, primeiro: null, ultimo: null, saldo: 0, maisAntigoAberto: null };

// ---------------------------------------------------------
// Navegação
// ---------------------------------------------------------
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9v-5h6v5h2.5a1 1 0 0 0 1-1v-9"/></svg>',
  'novo-pedido': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pedidos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21Z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  cobranca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16v12H4z"/><path d="M4 11h16"/><path d="M8 3v4M16 3v4"/><path d="M8 15h3"/></svg>',
  mais: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c1-3.4 3.4-5 6-5s5 1.6 6 5"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6M18 15.4c1.4.7 2.4 2.2 3 4.6"/></svg>',
  produtos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18l-1.5 8.5a2 2 0 0 1-2 1.5h-11a2 2 0 0 1-2-1.5Z"/><path d="M7 10V8a5 5 0 0 1 10 0v2"/></svg>',
  financeiro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
};

const VIEW_TITLES = {
  dashboard: 'Painel', 'novo-pedido': 'Novo pedido', pedidos: 'Pedidos', cobranca: 'Fiado',
  clientes: 'Clientes', cliente: 'Ficha do cliente', produtos: 'Produtos', financeiro: 'Financeiro', ajustes: 'Ajustes',
};

function setupNav() {
  document.querySelectorAll('.nav-item, .bn-item, .mais-item').forEach(btn => {
    const ico = btn.querySelector('.nav-ico, .bn-ico');
    if (ico && ICONS[btn.dataset.view]) ico.innerHTML = ICONS[btn.dataset.view];
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view], [data-goto]');
    if (!btn || btn.closest('.sheet-overlay:not(#maisOverlay)')) return;
    const v = btn.dataset.view || btn.dataset.goto;
    if (!v) return;
    if (v === 'mais') { openSheet('maisOverlay'); return; }
    if (btn.classList.contains('mais-item')) closeSheet('maisOverlay');
    if (v === 'novo-pedido' && state.pedidoEditando) resetFormPedido();
    switchView(v);
  });
  $('btnVoltar').addEventListener('click', () => switchView(state.viewAnterior && state.viewAnterior !== 'cliente' ? state.viewAnterior : 'clientes'));
}

function switchView(view) {
  if (view !== state.view) state.viewAnterior = state.view;
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + view).classList.add('active');
  $('viewTitle').textContent = VIEW_TITLES[view] || view;
  $('btnVoltar').classList.toggle('hidden', view !== 'cliente');

  const navView = view === 'cliente' ? 'clientes' : view;
  const noMais = ['clientes', 'produtos', 'financeiro', 'ajustes'].includes(navView);
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === navView));
  document.querySelectorAll('.bn-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === navView || (b.dataset.view === 'mais' && noMais)));

  window.scrollTo(0, 0);
  const sc = document.querySelector('.view-scroll'); if (sc) sc.scrollTop = 0;
  if (view === 'financeiro') renderFinanceiro();
  if (view === 'cliente') renderFichaCliente();
}

function renderAllViews() {
  renderDashboard();
  renderProdutosGridPedido();
  renderPedidosList();
  renderCobranca();
  renderClientesList();
  renderProdutosList();
  if (state.view === 'financeiro') renderFinanceiro();
  if (state.view === 'cliente') renderFichaCliente();
  const nDevendo = new Set(pendentes().map(p => p.cliente_id)).size;
  const badge = $('navBadgeFiado');
  badge.textContent = nDevendo; badge.classList.toggle('hidden', nDevendo === 0);
}

// ---------------------------------------------------------
// Sheets (janelas que sobem de baixo / modais)
// ---------------------------------------------------------
function openSheet(id) {
  const el = $(id);
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  const first = el.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea');
  if (first && window.matchMedia('(min-width: 900px)').matches) setTimeout(() => first.focus(), 120);
}
function closeSheet(id) {
  const el = $(id);
  el.classList.remove('show');
  setTimeout(() => el.classList.add('hidden'), 220);
}
function setupSheets() {
  document.querySelectorAll('.sheet-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => { if (e.target === ov) closeSheet(ov.id); });
  });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet(b.dataset.close)));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const aberto = [...document.querySelectorAll('.sheet-overlay.show')].pop();
    if (aberto) closeSheet(aberto.id);
  });
}

// ---------------------------------------------------------
// Ajustes
// ---------------------------------------------------------
function setupAjustes() {
  $('cfgNome').value = state.cfg.nome || '';
  $('cfgPix').value = state.cfg.pix || '';
  $('cfgInatividade').value = state.cfg.inatividade || 14;
  if (state.cfg.nome) $('brandNome').textContent = state.cfg.nome;
  $('btnSalvarCfg').addEventListener('click', () => {
    state.cfg.nome = $('cfgNome').value.trim();
    state.cfg.pix = $('cfgPix').value.trim();
    state.cfg.inatividade = Math.min(120, Math.max(3, Number($('cfgInatividade').value) || 14));
    salvarLocal('marmita_cfg', state.cfg);
    $('brandNome').textContent = state.cfg.nome || 'Marmita Control';
    renderAllViews();
    toast('Ajustes salvos ✓');
  });

  // quinzena
  const toggle = $('quinzenaAtivaToggle'), d1 = $('quinzenaDia1'), d2 = $('quinzenaDia2');
  toggle.checked = state.quinzenaConfig.ativa;
  d1.value = state.quinzenaConfig.dia1; d2.value = state.quinzenaConfig.dia2;
  $('quinzenaCamposWrap').classList.toggle('hidden', !state.quinzenaConfig.ativa);
  toggle.addEventListener('change', () => {
    state.quinzenaConfig.ativa = toggle.checked;
    $('quinzenaCamposWrap').classList.toggle('hidden', !toggle.checked);
    salvarLocal('marmita_quinzena_config', state.quinzenaConfig);
    renderAllViews();
    toast(toggle.checked ? 'Vencimento por quinzena ligado ✓' : 'Vencimento por quinzena desligado');
  });
  const aplicar = () => {
    const v1 = Math.min(31, Math.max(1, Number(d1.value) || 15));
    let v2 = Math.min(31, Math.max(1, Number(d2.value) || 30));
    if (v2 <= v1) v2 = Math.min(31, v1 + 1);
    d1.value = v1; d2.value = v2;
    state.quinzenaConfig.dia1 = v1; state.quinzenaConfig.dia2 = v2;
    salvarLocal('marmita_quinzena_config', state.quinzenaConfig);
    renderAllViews();
    toast('Dias de corte atualizados ✓');
  };
  d1.addEventListener('change', aplicar); d2.addEventListener('change', aplicar);

  $('btnBackup').addEventListener('click', baixarBackup);
}

function renderRecursosStatus() {
  const itens = [
    ['clientesExtra', 'Cadastro completo de clientes, limite de fiado e arquivar'],
    ['produtosExtra', 'Categorias e descrição dos produtos'],
    ['pedidosExtra', 'Pagamento parcial (abater fiado aos poucos) e forma de recebimento'],
    ['pagamentos', 'Histórico de recebimentos'],
    ['despesas', 'Despesas e lucro líquido'],
  ];
  const faltando = itens.filter(([k]) => !state.rec[k]).length;
  $('recursosStatus').innerHTML = `
    <ul class="rec-list">${itens.map(([k, t]) => `<li class="${state.rec[k] ? 'ok' : 'off'}">${state.rec[k] ? '✓' : '○'} ${t}</li>`).join('')}</ul>
    ${faltando ? `<p class="hint">Para ligar o que está com ○, abra o Supabase → <strong>SQL Editor</strong>, cole o arquivo
      <code>melhorias-v2.sql</code> e clique em <strong>Run</strong>. Ele só adiciona colunas e tabelas — nenhum dado é apagado.
      Depois toque em <strong>Atualizar</strong>.</p>` : '<p class="hint">Tudo ligado.</p>'}`;
}

async function baixarBackup() {
  const btn = $('btnBackup');
  btn.disabled = true; btn.textContent = 'Gerando backup...';
  try {
    const tabelas = ['clientes', 'produtos', 'pedidos', 'itens_pedido'];
    if (state.rec.pagamentos) tabelas.push('pagamentos');
    if (state.rec.despesas) tabelas.push('despesas');
    const dados = {};
    for (const t of tabelas) dados[t] = await buscarTudo(t, '*', [['id', true]]);
    baixarArquivo(`backup-marmita_${hojeISO()}.json`,
      JSON.stringify({ gerado_em: new Date().toISOString(), ...dados }, null, 1), 'application/json');
    toast('Backup baixado ✓');
  } catch (e) {
    toast('Erro no backup: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Baixar backup completo (JSON)';
  }
}

function baixarArquivo(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------
// Componentes compartilhados
// ---------------------------------------------------------
// barras horizontais: [{label, valor, sub?, destaque?}]
function barrasHTML(linhas, fmt = BRL) {
  if (!linhas.length) return emptyMsg('Sem dados no período');
  const max = Math.max(1, ...linhas.map(l => l.valor));
  return linhas.map(l => `
    <div class="bar-row${l.destaque ? ' bar-row-hl' : ''}">
      <span class="bar-label">${esc(l.label)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</span>
      <div class="bar-track"><div class="bar-fill${l.cor ? ' bar-' + l.cor : ''}" style="width:${(l.valor / max * 100).toFixed(1)}%"></div></div>
      <span class="bar-value num">${fmt(l.valor)}</span>
    </div>`).join('');
}

// Comanda de pedido (lista, painel, ficha)
function ticketHTML(p, opts = {}) {
  const cliente = p.clientes?.nome || '—';
  const itensTxt = (p.itens_pedido || []).map(it => `${num(it.quantidade)}× ${esc(it.produtos?.nome || 'item')}`).join(', ');
  const pago = p.status_pagamento === 'pago';
  const parcial = !pago && num(p.valor_pago) > 0;
  const stamp = pago
    ? `<span class="stamp stamp-ok">Pago${p.data_pagamento ? ' ' + fmtDataCurta(p.data_pagamento) : ''}</span>`
    : parcial ? `<span class="stamp stamp-part">Falta ${BRL(saldoPedido(p))}</span>`
      : `<span class="stamp stamp-due">Em aberto</span>`;
  const meta = [fmtData(p.data_pedido) + ' ' + diaSemanaCurto(p.data_pedido), FORMA_PEDIDO_TXT[p.forma_pagamento] || p.forma_pagamento];
  if (p.origem === 'loja') meta.push('Loja online');
  if (pago && p.forma_recebimento) meta.push(formaRecNome(p.forma_recebimento));
  const vencida = isQuinzenaVencida(p);
  const taxa = num(p.taxa_quinzena) > 0 ? `<span class="ticket-taxa">+ ${BRL(p.taxa_quinzena)} taxa</span>` : '';
  const temItens = (p.itens_pedido || []).length > 0;

  return `
  <article class="ticket${pago ? ' is-paid' : ''}${vencida ? ' is-late' : ''}">
    <div class="ticket-top">
      <div>
        ${opts.semCliente ? '' : `<button class="ticket-cliente" data-ficha="${esc(p.cliente_id)}">${esc(cliente)}</button>`}
        <div class="ticket-meta">${meta.map(esc).join(' • ')}${vencida ? ` <span class="tag tag-due">venceu ${fmtDataCurta(quinzenaVencimento(p.data_pedido))}</span>` : ''}</div>
      </div>
      ${stamp}
    </div>
    <div class="ticket-itens">${itensTxt || 'sem itens'}</div>
    ${p.observacoes ? `<div class="ticket-obs">${esc(p.observacoes)}</div>` : ''}
    <div class="ticket-foot">
      <span class="ticket-total num">${BRL(p.valor_total)}${taxa}</span>
      <div class="ticket-actions">
        ${!pago ? `<button class="btn btn-primary btn-sm" data-receber-pedido="${p.id}">Receber</button>` : ''}
        <details class="menu">
          <summary class="btn btn-ghost btn-sm" aria-label="Mais ações">•••</summary>
          <div class="menu-pop">
            <button data-edit-pedido="${p.id}">Editar pedido</button>
            ${temItens ? `<button data-editar-itens-pedido="${p.id}">Editar preços</button>` : ''}
            ${!pago && p.clientes?.whatsapp ? `<button data-whats-pedido="${p.id}">Cobrar no WhatsApp</button>` : ''}
            ${pago ? `<button data-reabrir-pedido="${p.id}">Voltar para em aberto</button>` : ''}
            <button class="danger" data-del-pedido="${p.id}">Excluir pedido</button>
          </div>
        </details>
      </div>
    </div>
  </article>`;
}

// Delegação única: os botões das comandas funcionam em qualquer tela
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-ficha]');
  if (!t || t.closest('summary')) return;
  const d = t.dataset;
  if (t.closest('.menu-pop')) t.closest('details')?.removeAttribute('open');
  if (d.receberPedido) {
    const p = state.pedidos.find(x => x.id === d.receberPedido);
    if (p) abrirReceber(p.cliente_id, [p.id]);
  } else if (d.delPedido) excluirPedido(d.delPedido);
  else if (d.whatsPedido) {
    const p = state.pedidos.find(x => x.id === d.whatsPedido);
    if (p) cobrarWhatsapp(p.cliente_id, [p]);
  } else if (d.editPedido) editarPedido(d.editPedido);
  else if (d.editarItensPedido) abrirEditarItens(d.editarItensPedido);
  else if (d.reabrirPedido) reabrirPedido(d.reabrirPedido);
  else if (d.ficha) abrirFicha(d.ficha);
});
// fecha menus "•••" ao clicar fora
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.menu[open]').forEach(m => { if (!m.contains(e.target)) m.removeAttribute('open'); });
});

async function excluirPedido(pedidoId) {
  const p = state.pedidos.find(x => x.id === pedidoId);
  const desc = p ? `${p.clientes?.nome || ''} de ${fmtData(p.data_pedido)} (${BRL(p.valor_total)})` : '';
  if (!confirm(`Excluir o pedido ${desc}?\n\nEle sai do histórico e dos relatórios. Não dá para desfazer.`)) return;
  const { error } = await supabaseClient.from('pedidos').delete().eq('id', pedidoId);
  if (error) return toast('Erro: ' + error.message, true);
  toast('Pedido excluído');
  await recarregarPedidos();
}

async function reabrirPedido(pedidoId) {
  if (!confirm('Voltar este pedido para "em aberto"? Use quando marcou como pago por engano.')) return;
  const upd = { status_pagamento: 'pendente', data_pagamento: null };
  if (state.rec.pedidosExtra) { upd.valor_pago = 0; upd.forma_recebimento = null; }
  const { error } = await supabaseClient.from('pedidos').update(upd).eq('id', pedidoId);
  if (error) return toast('Erro: ' + error.message, true);
  toast('Pedido voltou para em aberto');
  await recarregarPedidos();
}
