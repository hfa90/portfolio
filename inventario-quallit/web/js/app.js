import { abrirAvisos, atualizarSininho, carregarAvisos, total as totalPendencias } from './telas/avisos.js';
import { abrirCentral, iniciarNotificacoes } from './notificacoes.js';
import { carregarHist, carregarMaquinas } from './dados.js';
import { $, $$, ehAdmin, erroMsg, esc, sb, state, store, toast } from './nucleo.js';
import { ehErroDeRede, idbGet, idbSet } from './offline.js';
import { iniciarRelogios } from './prazo.js';
import { iniciarRealtime, navegar, renderSidebar } from './rotas.js';
import { atualizarBadge, atualizarPendentes, sincronizar } from './sincronia.js';
import { fecharDrawer } from './telas/maquinas.js';
import { dicaVersao, textoVersao } from './versao.js';
import { carregarSolicitacoes } from './telas/patrimonio.js';
import { cartaoAppAndroid, verificarAtualizacaoApp } from './app-android.js';

/* =====================================================================
   App instalável (PWA) — guarda os arquivos para abrir sem internet
   ===================================================================== */
function registrarSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(async () => {
    const reg = await navigator.serviceWorker.ready;
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
      .filter((u) => /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(u));
    reg.active?.postMessage({ tipo: 'cachear', urls });
  }).catch(() => { /* sem service worker: segue online */ });
}

/* =====================================================================
   Auth / inicialização
   ===================================================================== */
function aplicarTema() {
  const t = store.get('tema');
  if (t) document.documentElement.dataset.theme = t;
}
$('#btn-tema').onclick = () => {
  const atual = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const novo = atual === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo; store.set('tema', novo);
};
$('#btn-sair').onclick = () => sb.auth.signOut();
// o sininho abre a central de notificações; as pendências do sistema ficam num botão dentro dela
$('#btn-avisos').onclick = () => { fecharMenu(); abrirCentral(); };
$('#btn-avisos-topo').onclick = () => abrirCentral();

/* ---- celular: menu lateral deslizante (☰) e título da tela na barra superior ---- */
function abrirMenu() { $('#app').classList.add('menu-aberto'); $('#menu-fundo').hidden = false; $('#btn-menu').setAttribute('aria-expanded', 'true'); }
function fecharMenu() { $('#app').classList.remove('menu-aberto'); $('#menu-fundo').hidden = true; $('#btn-menu').setAttribute('aria-expanded', 'false'); }
$('#btn-menu').onclick = () => ($('#app').classList.contains('menu-aberto') ? fecharMenu() : abrirMenu());
$('#menu-fundo').onclick = fecharMenu;
$('#menu-lateral').addEventListener('click', (e) => { if (e.target.closest('.nav-item, #btn-sair')) fecharMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
function atualizarTopo() {
  const ativo = $('.nav-item.active');
  $('#topo-titulo').textContent = ativo ? ativo.textContent.replace(/\d+$/, '').trim() : 'Inventário';
}
window.addEventListener('hashchange', () => setTimeout(atualizarTopo, 0));

/* ---- celular: tabelas viram "cartões" (cada célula ganha o nome da coluna, que o CSS mostra ao lado) ---- */
function rotularTabelas() {
  document.querySelectorAll('.view table:not(.heatmap), #modal table').forEach((t) => {
    if (t.closest('#view-maquinas .table-wrap')) return;   // Máquinas: no celular, use os cartões
    if (t.closest('.etq-area')) return;                     // folha de etiquetas: é o que vai para a impressora
    const nomes = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!nomes.length) return;
    t.classList.add('tabela-cartoes');
    t.querySelectorAll('tbody tr').forEach((tr) => {
      if (tr.dataset.rotulado === String(tr.cells.length)) return;
      let col = 0;
      [...tr.cells].forEach((td) => { if (!td.hasAttribute('data-rotulo')) td.dataset.rotulo = td.colSpan > 1 ? '' : nomes[col] || ''; col += td.colSpan || 1; });
      tr.dataset.rotulado = String(tr.cells.length);
    });
  });
}
/* ---- filtros em uso ficam em evidência (campo destacado e botão "Limpar" chamativo) ---- */
function marcarFiltros() {
  document.querySelectorAll('.toolbar').forEach((tb) => {
    let algum = false;
    tb.querySelectorAll('select, .search input, input[type=date]').forEach((el) => {
      const on = el.tagName === 'SELECT' ? el.selectedIndex > 0 : !!el.value.trim();
      el.classList.toggle('filtro-on', on);
      algum ||= on;
    });
    tb.querySelectorAll('[id$="limpar"]').forEach((b) => b.classList.toggle('btn-limpar-on', algum));
  });
}
document.addEventListener('input', (e) => { if (e.target.closest?.('.toolbar')) marcarFiltros(); });
document.addEventListener('change', (e) => { if (e.target.closest?.('.toolbar')) marcarFiltros(); });

let rotularPendente = false;
new MutationObserver(() => {
  if (rotularPendente) return;
  rotularPendente = true;
  requestAnimationFrame(() => { rotularPendente = false; rotularTabelas(); marcarFiltros(); });
}).observe(document.body, { childList: true, subtree: true });
$$('.nav-item').forEach((b) => (b.onclick = () => (location.hash = '#' + b.dataset.view)));
$('#drawer-bg').onclick = fecharDrawer;
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.menu-mais[open], details.ajuda[open]').forEach((d) => {
    if (!d.contains(e.target) || (d.classList.contains('menu-mais') && e.target.closest('.menu-lista button, .menu-lista a'))) d.open = false;
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.drawerId && !$('#modal').open) fecharDrawer();
  if (e.key === '/' && state.view === 'maquinas' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); $('#f-q')?.focus(); }
});

$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true; $('#login-erro').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('senha') });
  btn.disabled = false;
  if (error) $('#login-erro').textContent = error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : error.message;
};

async function carregarPerfil(userId) {
  const [p, c] = await Promise.all([
    sb.from('perfis').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('cds').select('*').order('codigo'),
  ]);
  if (ehErroDeRede(p.error) || ehErroDeRede(c.error)) {
    const cache = await idbGet('perfil:' + userId);
    if (cache) { state.perfil = cache.perfil; state.cds = cache.cds; return true; }
  }
  if (p.error && /perfis|relation|does not exist|schema cache/i.test(p.error.message)) {
    // banco ainda sem o 04: funciona como antes (todos administradores, um CD)
    state.perfil = { papel: 'admin', nome: state.user.email, ativo: true, legado: true };
    state.cds = [];
    return true;
  }
  if (!p.data || !p.data.ativo) return false;
  state.perfil = p.data;
  state.cds = c.data || [];
  idbSet('perfil:' + userId, { perfil: state.perfil, cds: state.cds });
  return true;
}

function semAcesso() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-form').innerHTML = `
    <div class="marcas"><div class="brand brand--lg"><span class="brand-mark"></span><div><strong>Inventário</strong><small>Quallit · CD</small></div></div><span class="marca-div" aria-hidden="true"></span><img class="logo-rd" src="img/cliente-rd.png" alt="RaiaDrogasil S.A." width="266" height="199"></div>
    <h2>Acesso não liberado</h2>
    <p class="muted" style="margin:0">O usuário <b>${esc(state.user?.email || '')}</b> ainda não tem permissão ou foi desativado. Peça ao administrador para liberar o seu acesso.</p>
    <button type="button" class="btn btn--block" id="sem-sair">Sair</button>`;
  $('#sem-sair').onclick = () => sb.auth.signOut();
}

let iniciado = false;
async function entrar(session) {
  state.user = session.user;
  if (iniciado) return;
  iniciado = true;
  if (!(await carregarPerfil(session.user.id))) return semAcesso();
  state.cdAtual = ehAdmin() ? (store.get('cd-atual') || '') : state.perfil.cd_id;
  if (state.cdAtual && !state.cds.some((c) => c.id === state.cdAtual)) state.cdAtual = '';
  $('#login').hidden = true; $('#app').hidden = false;
  renderSidebar();
  $('#view-painel').innerHTML = '<div class="skeleton">Carregando inventário…</div>';
  try {
    await Promise.all([carregarMaquinas(), carregarHist(), carregarSolicitacoes()]);
  } catch (e) {
    $('#view-painel').innerHTML = `<div class="card card-pad"><h2>Não foi possível carregar</h2><p class="erro">${esc(erroMsg(e))}</p>
      <p class="muted">Verifique se as migrações do banco foram aplicadas (<code>supabase db push --remote</code>; veja o README).</p></div>`;
    return;
  }
  iniciarRealtime();
  window.addEventListener('hashchange', navegar);
  navegar();
  atualizarTopo();
  registrarSW();
  iniciarRelogios();
  atualizarBadge();
  atualizarPendentes().then(sincronizar);
  setInterval(sincronizar, 20_000);
  carregarAvisos();   // só o número no sininho: nada abre sozinho ao entrar
  iniciarNotificacoes({
    sb, userId: session.user.id, escopo: 'painel',
    aoMudar: atualizarSininho,
    aoAbrir: (n) => { if (n.link) { if (location.hash === n.link) navegar(); else location.hash = n.link; } },
    avisar: (t, erro) => toast(t, erro),
    extra: { rotulo: 'Pendências do sistema', contar: totalPendencias, abrir: abrirAvisos },
  }).catch(() => { /* sem a tabela de notificações (migração 20261116000001): o sininho segue só com as pendências */ });
}

aplicarTema();
$('#versao').textContent = textoVersao();
$('#versao').title = dicaVersao();
sb.auth.onAuthStateChange((ev, session) => {
  if (session) setTimeout(() => entrar(session), 0); // fora do lock de auth do supabase-js
  else {
    if (iniciado) return location.reload();
    $('#app').hidden = true; $('#login').hidden = false;
    cartaoAppAndroid($('#app-android-login')); // aviso do app Android (QR no computador, download no Android)
  }
});

// dentro do app Android: avisa quando há uma versão nova do app para instalar (motivo, botão e passo a passo)
verificarAtualizacaoApp();
