import { abrirAvisos, carregarAvisos } from './telas/avisos.js';
import { carregarHist, carregarMaquinas } from './dados.js';
import { $, $$, ehAdmin, erroMsg, esc, sb, state, store } from './nucleo.js';
import { ehErroDeRede, idbGet, idbSet } from './offline.js';
import { iniciarRelogios } from './prazo.js';
import { iniciarRealtime, navegar, renderSidebar } from './rotas.js';
import { atualizarBadge, atualizarPendentes, sincronizar } from './sincronia.js';
import { fecharDrawer } from './telas/maquinas.js';
import { carregarSolicitacoes } from './telas/patrimonio.js';

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
$('#btn-avisos').onclick = () => abrirAvisos();
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
  registrarSW();
  iniciarRelogios();
  atualizarBadge();
  atualizarPendentes().then(sincronizar);
  setInterval(sincronizar, 20_000);
  carregarAvisos();   // só o número no sininho: nada abre sozinho ao entrar
}

aplicarTema();
sb.auth.onAuthStateChange((ev, session) => {
  if (session) setTimeout(() => entrar(session), 0); // fora do lock de auth do supabase-js
  else {
    if (iniciado) return location.reload();
    $('#app').hidden = true; $('#login').hidden = false;
  }
});
