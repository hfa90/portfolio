// Central de notificações (painel e app de conferência).
// - Lista do sininho, ao vivo (Supabase Realtime na tabela notificacoes): aviso novo toca um som e aparece na hora.
// - Push no celular/computador (Web Push): a pessoa liga em "Ajustes" do sininho. Funciona no Chrome/Edge do
//   computador e do Android e no iPhone com o app na Tela de Início (iOS 16.4+). A função notificar-push envia.
// - Ajustes: tipos que a pessoa quer receber, push ligado/desligado e horário de silêncio.
// Quem gera os avisos é o banco (migração 20261116000001_notificacoes.sql).

export const TIPOS = {
  inventario_novo:       { l: 'Inventário novo ou começando', i: '📋' },
  inventario_em_breve:   { l: 'Inventário vai começar (30 min antes)', i: '⏰' },
  inventario_prazo:      { l: 'Prazo acabando (1 hora antes)', i: '⌛' },
  inventario_atrasado:   { l: 'Inventário atrasado', i: '🚨' },
  inventario_finalizado: { l: 'Inventário finalizado', i: '✅' },
  maquina_problema:      { l: 'Máquina com problema novo', i: '⚠️' },
  maquinas_novas:        { l: 'Máquinas novas no inventário', i: '🖥️' },
  emprestimo_atrasado:   { l: 'Devolução de empréstimo atrasada', i: '📦' },
  patrimonio:            { l: 'Pedidos de baixa e transferência', i: '📝' },
};
const ICONE_TESTE = { i: '🔔' };

const ua = navigator.userAgent;
const noIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const dentroDoApp = /InventarioQuallitAndroid/.test(ua);
export const pushSuportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function quando(iso) {
  const d = new Date(iso), s = (Date.now() - d) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

let audio;
function tocar(prioridade) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const notas = prioridade >= 3 ? [[880, 0.12], [660, 0.12], [880, 0.2]] : [[988, 0.1], [1319, 0.22]];
    let t = audio.currentTime;
    for (const [f, d] of notas) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.02); t += d + 0.04;
    }
  } catch { /* sem áudio */ }
}

const S = { sb: null, uid: null, escopo: 'painel', lista: [], naoLidas: 0, canal: null, aoMudar: null, aoAbrir: null, avisar: null, extra: null };

// base64url → Uint8Array (chave pública do push)
function chaveBytes(b64) {
  const p = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/**
 * Liga a central. opções:
 *  sb, userId, escopo ('painel'|'campo'),
 *  aoMudar(n)    → atualizar o número no sininho,
 *  aoAbrir(n)    → o que fazer ao tocar num aviso (navegar),
 *  avisar(texto) → mostrar um aviso curto na tela,
 *  extra         → { rotulo, contar(), abrir() } botão para as pendências do sistema (painel)
 */
export async function iniciarNotificacoes(op) {
  Object.assign(S, { sb: op.sb, uid: op.userId, escopo: op.escopo || 'painel', aoMudar: op.aoMudar, aoAbrir: op.aoAbrir, avisar: op.avisar, extra: op.extra || null });
  await recarregar();
  if (S.canal) S.sb.removeChannel(S.canal);
  S.canal = S.sb.channel('notificacoes-' + S.uid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${S.uid}` }, (p) => {
      if (S.lista.some((n) => n.id === p.new.id)) return;
      S.lista.unshift(p.new);
      contar();
      tocar(p.new.prioridade);
      S.avisar?.(`${p.new.titulo}`);
      if (document.querySelector('.nt-folha')) desenharLista();
    })
    .subscribe();
  // ao voltar para o app (celular), busca o que chegou enquanto estava fechado
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recarregar(); });
  // tocou no push com o app aberto: o service worker avisa qual foi
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.tipo === 'notificacao-aberta') abrirPorId(Number(e.data.id));
  });
  const id = Number(new URLSearchParams(location.search).get('notif'));
  if (id) { history.replaceState(null, '', location.pathname + location.hash); abrirPorId(id); }
  // inscrição do push já existente: renova no banco (o navegador pode ter trocado a chave)
  if (pushSuportado && Notification.permission === 'granted') inscreverPush(false).catch(() => {});
}

async function recarregar() {
  const { data, error } = await S.sb.from('notificacoes').select('*').order('criada_em', { ascending: false }).limit(80);
  if (error) return;
  S.lista = data || [];
  contar();
  if (document.querySelector('.nt-folha')) desenharLista();
}

function contar() {
  S.naoLidas = S.lista.filter((n) => !n.lida_em).length;
  S.aoMudar?.(S.naoLidas);
  try { navigator.setAppBadge?.(S.naoLidas || undefined); if (!S.naoLidas) navigator.clearAppBadge?.(); } catch { /* sem número no ícone */ }
}
export const naoLidas = () => S.naoLidas;

async function marcarLidas(ids) {
  const agora = new Date().toISOString();
  for (const n of S.lista) if (!n.lida_em && (!ids || ids.includes(n.id))) n.lida_em = agora;
  contar();
  await S.sb.rpc('marcar_notificacoes_lidas', { p_ids: ids || null });
}

async function abrirPorId(id) {
  let n = S.lista.find((x) => x.id === id);
  if (!n) { const { data } = await S.sb.from('notificacoes').select('*').eq('id', id).maybeSingle(); n = data; }
  if (!n) return;
  if (!n.lida_em) marcarLidas([n.id]);
  fecharCentral();
  S.aoAbrir?.(n);
}

// ---------- push ----------
async function chavePublica() {
  const { data, error } = await S.sb.functions.invoke('notificar-push', { method: 'GET' });
  if (error || !data?.chavePublica) throw new Error('Não consegui falar com o servidor de notificações');
  return data.chavePublica;
}
async function inscreverPush(pedir = true) {
  if (!pushSuportado) throw new Error('Este navegador não recebe notificações');
  if (pedir && Notification.permission !== 'granted') {
    const r = await Notification.requestPermission();
    if (r !== 'granted') throw new Error(r === 'denied'
      ? 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço).'
      : 'Permissão não concedida');
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(await chavePublica()) });
  const j = sub.toJSON();
  const aparelho = noIOS ? 'iPhone/iPad' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Navegador';
  const { error } = await S.sb.from('notif_push').upsert({
    user_id: S.uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, escopo: S.escopo, aparelho,
  }, { onConflict: 'endpoint' });
  if (error) throw error;
  return true;
}
async function desinscreverPush() {
  const reg = await navigator.serviceWorker?.ready;
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await S.sb.from('notif_push').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
}
async function pushAtivoAqui() {
  if (!pushSuportado || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

// ---------- tela ----------
export function fecharCentral() { document.querySelector('.nt-fundo')?.remove(); }

export function abrirCentral() {
  fecharCentral();
  const fundo = document.createElement('div');
  fundo.className = 'nt-fundo';
  fundo.innerHTML = `
    <section class="nt-folha" role="dialog" aria-modal="true" aria-labelledby="nt-titulo">
      <header class="nt-topo">
        <h2 id="nt-titulo">Notificações</h2>
        <button type="button" class="nt-icone" data-acao="ajustes" aria-label="Ajustes das notificações" title="Ajustes">⚙</button>
        <button type="button" class="nt-icone" data-acao="fechar" aria-label="Fechar">✕</button>
      </header>
      <div class="nt-corpo" id="nt-corpo"></div>
    </section>`;
  fundo.addEventListener('click', (e) => {
    if (e.target === fundo) return fecharCentral();
    const a = e.target.closest('[data-acao]')?.dataset.acao;
    if (a === 'fechar') fecharCentral();
    if (a === 'ajustes') desenharAjustes();
    if (a === 'lista') desenharLista();
  });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { fecharCentral(); document.removeEventListener('keydown', esc); } });
  document.body.append(fundo);
  desenharLista();
}

let filtro = 'todas';
function desenharLista() {
  const corpo = document.getElementById('nt-corpo'); if (!corpo) return;
  const lista = filtro === 'naolidas' ? S.lista.filter((n) => !n.lida_em) : S.lista;
  const extra = S.extra && S.extra.contar() ? S.extra : null;
  corpo.innerHTML = `
    <div class="nt-barra">
      <div class="nt-filtros" role="tablist">
        <button type="button" role="tab" data-f="todas" aria-selected="${filtro === 'todas'}">Todas</button>
        <button type="button" role="tab" data-f="naolidas" aria-selected="${filtro === 'naolidas'}">Não lidas${S.naoLidas ? ` <b>${S.naoLidas}</b>` : ''}</button>
      </div>
      ${S.naoLidas ? '<button type="button" class="nt-link" id="nt-todas-lidas">Marcar todas como lidas</button>' : ''}
    </div>
    ${extra ? `<button type="button" class="nt-extra" id="nt-extra"><span>📌</span><span><b>${esc(extra.rotulo)}</b><small>${extra.contar()} item(ns) pedindo atenção</small></span><span>›</span></button>` : ''}
    ${(!pushSuportado || Notification.permission === 'default') && !sessionStorageGet('nt-dica') ? dicaPush() : ''}
    ${lista.length ? `<ul class="nt-lista">${lista.map(itemHTML).join('')}</ul>` : `
      <div class="nt-vazio"><span>🔔</span><b>${filtro === 'naolidas' ? 'Tudo lido' : 'Nenhuma notificação ainda'}</b>
      <small>Inventários novos, prazos, atrasos e problemas nas máquinas aparecem aqui.</small></div>`}`;
  corpo.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filtro = b.dataset.f; desenharLista(); }));
  corpo.querySelector('#nt-todas-lidas')?.addEventListener('click', () => { marcarLidas(null); desenharLista(); });
  corpo.querySelector('#nt-extra')?.addEventListener('click', () => { fecharCentral(); extra.abrir(); });
  corpo.querySelector('#nt-ligar')?.addEventListener('click', ligarPushUI);
  corpo.querySelector('#nt-dica-fechar')?.addEventListener('click', () => { sessionStorageSet('nt-dica', '1'); desenharLista(); });
  corpo.querySelectorAll('.nt-item').forEach((li) => (li.onclick = () => abrirPorId(Number(li.dataset.id))));
}

function itemHTML(n) {
  const t = TIPOS[n.tipo] || ICONE_TESTE;
  return `<li class="nt-item${n.lida_em ? '' : ' nt-item--nova'} nt-p${n.prioridade}" data-id="${n.id}" tabindex="0" role="button">
    <span class="nt-ic" aria-hidden="true">${t.i}</span>
    <span class="nt-txt"><b>${esc(String(n.titulo).replace(/^\S+\s/, (m) => (/\p{Extended_Pictographic}/u.test(m) ? '' : m)))}</b>
      ${n.corpo ? `<span>${esc(n.corpo)}</span>` : ''}<small>${quando(n.criada_em)}</small></span>
    ${n.lida_em ? '' : '<span class="nt-ponto" aria-label="não lida"></span>'}
  </li>`;
}

function dicaPush() {
  if (dentroDoApp) return '';
  if (noIOS && !instalado) return `<div class="nt-dica"><b>Receba no iPhone mesmo com o app fechado</b><span>Abra este site no Safari, toque em <b>Compartilhar → Adicionar à Tela de Início</b>, abra pelo ícone e ligue as notificações aqui.</span><button type="button" class="nt-link" id="nt-dica-fechar">Agora não</button></div>`;
  if (!pushSuportado) return '';
  return `<div class="nt-dica"><b>Receba mesmo com o app fechado</b><span>Ligue as notificações neste aparelho para saber na hora de inventários, prazos e problemas.</span>
    <div class="nt-dica-acoes"><button type="button" class="nt-botao" id="nt-ligar">Ligar notificações</button><button type="button" class="nt-link" id="nt-dica-fechar">Agora não</button></div></div>`;
}
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* sem armazenamento */ } }

async function ligarPushUI() {
  try {
    await inscreverPush(true);
    S.avisar?.('Notificações ligadas neste aparelho');
    if (document.querySelector('.nt-ajustes')) desenharAjustes(); else desenharLista();
  } catch (e) { S.avisar?.(e.message || String(e), true); }
}

async function desenharAjustes() {
  const corpo = document.getElementById('nt-corpo'); if (!corpo) return;
  corpo.innerHTML = '<p class="nt-carregando">Carregando…</p>';
  const [{ data: pref }, ativo] = await Promise.all([
    S.sb.from('notif_preferencias').select('*').eq('user_id', S.uid).maybeSingle(),
    pushAtivoAqui(),
  ]);
  const p = pref || { desligados: [], push: true, silencio_inicio: null, silencio_fim: null };
  const hm = (t) => (t ? String(t).slice(0, 5) : '');
  let estadoPush;
  if (dentroDoApp) estadoPush = '<span class="nt-cinza">No app Android, os avisos aparecem neste sininho, com som, enquanto o app está aberto. Para recebê-los com o app fechado, use também o site no Chrome com as notificações ligadas.</span>';
  else if (noIOS && !instalado) estadoPush = '<span class="nt-cinza">No iPhone, adicione o site à <b>Tela de Início</b> (Safari → Compartilhar) e abra pelo ícone para poder ligar.</span>';
  else if (!pushSuportado) estadoPush = '<span class="nt-cinza">Este navegador não recebe notificações.</span>';
  else if (Notification.permission === 'denied') estadoPush = '<span class="nt-cinza">Bloqueadas neste navegador: libere em configurações do site (cadeado ao lado do endereço) e volte aqui.</span>';
  else estadoPush = ativo
    ? '<span class="nt-ok">✓ Ligadas neste aparelho</span> <button type="button" class="nt-link" id="nt-desligar">Desligar aqui</button> <button type="button" class="nt-link" id="nt-testar">Enviar um teste</button>'
    : '<button type="button" class="nt-botao" id="nt-ligar">Ligar neste aparelho</button>';
  corpo.innerHTML = `
    <div class="nt-ajustes">
      <button type="button" class="nt-link nt-voltar" data-acao="lista">‹ Voltar</button>
      <h3>Neste aparelho</h3>
      <div class="nt-caixa">${estadoPush}</div>
      <h3>O que você quer receber</h3>
      <div class="nt-caixa nt-tipos">
        ${Object.entries(TIPOS).map(([k, t]) => `<label class="nt-chave"><span>${t.i} ${esc(t.l)}</span>
          <input type="checkbox" data-tipo="${k}" ${p.desligados.includes(k) ? '' : 'checked'}><i aria-hidden="true"></i></label>`).join('')}
      </div>
      <h3>Silêncio</h3>
      <div class="nt-caixa">
        <label class="nt-chave"><span>Avisar no celular/computador (push)</span><input type="checkbox" id="nt-push" ${p.push ? 'checked' : ''}><i aria-hidden="true"></i></label>
        <div class="nt-silencio"><span>Sem push das</span><input type="time" id="nt-si" value="${hm(p.silencio_inicio)}"><span>às</span><input type="time" id="nt-sf" value="${hm(p.silencio_fim)}"></div>
        <small class="nt-cinza">No silêncio, os avisos continuam no sininho; só o urgente (inventário atrasado) toca. Deixe em branco para não ter silêncio.</small>
      </div>
      <button type="button" class="nt-botao nt-salvar" id="nt-salvar">Salvar</button>
    </div>`;
  corpo.querySelector('#nt-ligar')?.addEventListener('click', ligarPushUI);
  corpo.querySelector('#nt-desligar')?.addEventListener('click', async () => { await desinscreverPush(); S.avisar?.('Notificações desligadas neste aparelho'); desenharAjustes(); });
  // teste de ponta a ponta: o banco cria um aviso só para você e o servidor manda o push
  corpo.querySelector('#nt-testar')?.addEventListener('click', async () => {
    const { error } = await S.sb.rpc('testar_notificacao');
    S.avisar?.(error ? 'Não foi possível testar: ' + error.message : 'Teste enviado: em alguns segundos chega a notificação', !!error);
  });
  corpo.querySelector('#nt-salvar').onclick = async () => {
    const desligados = [...corpo.querySelectorAll('[data-tipo]')].filter((c) => !c.checked).map((c) => c.dataset.tipo);
    const si = corpo.querySelector('#nt-si').value || null, sf = corpo.querySelector('#nt-sf').value || null;
    const { error } = await S.sb.from('notif_preferencias').upsert({
      user_id: S.uid, desligados, push: corpo.querySelector('#nt-push').checked,
      silencio_inicio: si && sf ? si : null, silencio_fim: si && sf ? sf : null, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) return S.avisar?.('Não foi possível salvar: ' + error.message, true);
    S.avisar?.('Ajustes salvos');
    desenharLista();
  };
}
