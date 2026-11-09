import { talvezMostrarResumoSemana } from './telas/resumo-semana.js';
import { carregarHist, carregarMaquinas } from './dados.js';
import { $, $$, MQ, cdCod, dataHora, ehAdmin, erroMsg, esc, sb, state, store, toast } from './nucleo.js';
import { ehErroDeRede, idbGet, idbSet } from './offline.js';
import { iniciarRelogios } from './prazo.js';
import { iniciarRealtime, navegar, renderSidebar } from './rotas.js';
import { atualizarBadge, atualizarPendentes, sincronizar } from './sincronia.js';
import { fecharDrawer, modal } from './telas/maquinas.js';
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
$$('.nav-item').forEach((b) => (b.onclick = () => (location.hash = '#' + b.dataset.view)));
$('#drawer-bg').onclick = fecharDrawer;
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
  const atrasados = MQ().filter((m) => (m.alertas || []).includes('emprestimo_atrasado')).length;
  if (atrasados) toast(`${atrasados} empréstimo(s) com devolução atrasada`, true);
  const pecas = MQ().filter((m) => (m.alertas || []).includes('hw_reduzido')).length;
  if (pecas) toast(`${pecas} máquina(s) com memória ou disco reduzido — confira`, true);
  if (ehAdmin()) mostrarAvisosAdmin().then(talvezMostrarResumoSemana);
}

/* ---- Administrador: ao entrar, vê quem fez e finalizou inventários desde o último acesso
   (e as solicitações de baixa/transferência aguardando aprovação). "Marcar como visto" zera a lista. */
async function mostrarAvisosAdmin() {
  const { data: av, error } = await sb.rpc('avisos_admin');
  if (error || !av) return;   // banco sem a migração: sem avisos
  const invs = av.inventarios || [];
  const pend = av.patrimonio_pendentes || 0;
  if (!invs.length && !pend) return;
  const pctDe = (c) => (c.total_esperadas ? Math.min(100, Math.round((100 * (c.total_encontradas || 0)) / c.total_esperadas)) : null);
  const nome = (e) => esc(String(e || '—').split('@')[0]);
  modal(`
    <div class="modal-head"><h2>🔔 Desde o seu último acesso</h2>
      <p class="muted" style="margin:4px 0 0">${av.desde ? `Desde ${dataHora(av.desde)}` : 'Últimos 7 dias'} · ${invs.length} inventário(s) finalizado(s)${pend ? ` · ${pend} solicitação(ões) de patrimônio aguardando você` : ''}</p></div>
    <div class="modal-body">
      ${pend ? `<div class="banner banner--warn"><div><strong>${pend} solicitação(ões) de baixa/transferência aguardando aprovação</strong><span>Abra <b>Patrimônio</b> para aprovar ou recusar.</span></div><a class="btn btn--sm btn--primary" href="#patrimonio" data-close>Ver</a></div>` : ''}
      ${invs.map((c) => { const p = pctDe(c); return `
        <div class="card card-pad aviso-inv" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
            <div><strong>${esc(c.nome)}</strong> <span class="pill pill--cd">${esc(cdCod(c.cd_id))}</span>
              <div class="muted" style="font-size:13px">${esc(c.setor || 'Todos os setores')} · finalizado por <b>${nome(c.finalizado_por)}</b> em ${dataHora(c.finalizado_em)}</div>
              <div class="muted" style="font-size:13px">Criado por ${nome(c.criado_por)}${(c.leitores || []).length ? ` · bipado por ${c.leitores.map(nome).join(', ')}` : ''}</div></div>
            <div style="text-align:right">${p != null ? `<b class="${p >= 98 ? 't-ok' : p < 90 ? 't-bad' : 't-warn'}" style="font-size:20px">${p}%</b><div class="muted" style="font-size:12px">${c.total_encontradas}/${c.total_esperadas} · ${c.total_faltando} faltando</div>` : ''}</div>
          </div>
          ${c.resumo ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Resumo enviado no grupo${c.resumo_enviado_em ? ' · ' + dataHora(c.resumo_enviado_em) : ''}</summary><pre class="mono" style="white-space:pre-wrap;font-size:12px;margin:6px 0 0">${esc(c.resumo)}</pre></details>` : '<p class="muted" style="font-size:12.5px;margin:8px 0 0">Finalizado antes da exigência do resumo.</p>'}
          <div style="margin-top:8px"><a class="btn btn--sm" href="#conferencia/${c.id}" data-close>Abrir inventário</a></div>
        </div>`; }).join('')}
    </div>
    <div class="modal-foot"><button class="btn" data-close>Ver depois</button><button class="btn btn--primary" id="av-visto">Marcar como visto</button></div>`, (dlg) => {
    $('#av-visto', dlg).onclick = async () => {
      const { error: e2 } = await sb.rpc('marcar_avisos_vistos');
      if (e2) return toast(erroMsg(e2), true);
      dlg.close(); toast('Avisos marcados como vistos');
    };
  });
}

aplicarTema();
sb.auth.onAuthStateChange((ev, session) => {
  if (session) setTimeout(() => entrar(session), 0); // fora do lock de auth do supabase-js
  else {
    if (iniciado) return location.reload();
    $('#app').hidden = true; $('#login').hidden = false;
  }
});
