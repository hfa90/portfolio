// =========================================================
// MARMITA CONTROL — comportamento de app no celular + PWA
// =========================================================
const ehCelular = () => window.matchMedia('(max-width: 900px)').matches;
const ehStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------------------------------------------------------
// PWA: service worker e botão de instalar
// ---------------------------------------------------------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sem PWA: o site funciona igual */ });
  });
}

let pedidoInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pedidoInstalacao = e;
  atualizarCardInstalar();
});
window.addEventListener('appinstalled', () => { pedidoInstalacao = null; atualizarCardInstalar(); toast('Aplicativo instalado ✓'); });

function atualizarCardInstalar() {
  const txt = document.getElementById('instalarTxt'), btn = document.getElementById('btnInstalar');
  if (!txt || !btn) return;
  btn.classList.add('hidden');
  if (ehStandalone()) {
    txt.textContent = 'Você está usando o aplicativo instalado ✓';
  } else if (pedidoInstalacao) {
    txt.textContent = 'Use como um aplicativo: abre em tela cheia, com ícone na tela de início.';
    btn.classList.remove('hidden');
  } else if (ehIOS()) {
    txt.innerHTML = 'No iPhone: abra no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> (quadrado com seta) e depois em <strong>Adicionar à Tela de Início</strong>.';
  } else {
    txt.innerHTML = 'No Android: abra no <strong>Chrome</strong>, toque no menu <strong>⋮</strong> e em <strong>Instalar app</strong> (ou "Adicionar à tela inicial").';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  atualizarCardInstalar();
  document.getElementById('btnInstalar')?.addEventListener('click', async () => {
    if (!pedidoInstalacao) return;
    pedidoInstalacao.prompt();
    await pedidoInstalacao.userChoice;
    pedidoInstalacao = null;
    atualizarCardInstalar();
  });
  if (ehStandalone()) document.documentElement.classList.add('standalone');
  configurarGestos();
});

// atalhos do ícone (segurar o ícone do app): ?tela=novo-pedido
function telaInicialPedida() {
  const tela = new URLSearchParams(location.search).get('tela');
  if (tela && document.getElementById('view-' + tela)) {
    history.replaceState(null, '', location.pathname);
    return tela;
  }
  return null;
}

// ---------------------------------------------------------
// Gestos nativos (só no celular)
// ---------------------------------------------------------
function configurarGestos() {
  // iOS ignora user-scalable=no: bloqueia a pinça direto no evento
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

  // duplo toque não dá zoom: resolvido no CSS (touch-action), sem atrasar toques rápidos no "+"

  // título grande que encolhe ao rolar (com folga para não piscar)
  let rolou = false;
  window.addEventListener('scroll', () => {
    if (!ehCelular()) return;
    const y = window.scrollY;
    if (!rolou && y > 40) { rolou = true; document.body.classList.add('rolou'); }
    else if (rolou && y < 8) { rolou = false; document.body.classList.remove('rolou'); }
  }, { passive: true });

  configurarPuxarParaAtualizar();
  configurarArrastarFolhas();
}

function configurarPuxarParaAtualizar() {
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
  document.body.appendChild(ind);
  const LIMITE = 75;
  let inicioY = null, inicioX = 0, dist = 0, ocupado = false;

  const podeComecar = (e) => ehCelular() && !ocupado && window.scrollY <= 0 &&
    !document.querySelector('.sheet-overlay.show') && !document.getElementById('app').classList.contains('hidden') &&
    !e.target.closest('.periodo-scroll, .mensal-chart, input, textarea, select');

  window.addEventListener('touchstart', (e) => {
    if (!podeComecar(e)) { inicioY = null; return; }
    inicioY = e.touches[0].clientY; inicioX = e.touches[0].clientX; dist = 0;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (inicioY === null) return;
    const dy = e.touches[0].clientY - inicioY, dx = Math.abs(e.touches[0].clientX - inicioX);
    if (dy <= 0 || dx > dy || window.scrollY > 0) { dist = 0; ind.style.opacity = 0; return; }
    dist = Math.min(dy * 0.5, LIMITE * 1.4);
    ind.style.opacity = Math.min(1, dist / LIMITE);
    ind.style.transform = `translateY(${dist - 40}px) scale(${0.7 + 0.3 * Math.min(1, dist / LIMITE)}) rotate(${dist * 3}deg)`;
    ind.classList.toggle('pronto', dist >= LIMITE);
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (inicioY === null) return;
    inicioY = null;
    if (dist < LIMITE) { ind.style.transition = 'all .2s'; ind.style.opacity = 0; ind.style.transform = 'translateY(-40px) scale(.7)';
      setTimeout(() => { ind.style.transition = ''; }, 220); return; }
    ocupado = true;
    ind.classList.add('girando');
    ind.style.transform = `translateY(${LIMITE - 40}px) scale(1)`;
    try { await refreshAll(); toast('Atualizado ✓'); } catch (e) { toast('Sem conexão para atualizar', true); }
    ind.classList.remove('girando', 'pronto');
    ind.style.transition = 'all .2s'; ind.style.opacity = 0; ind.style.transform = 'translateY(-40px) scale(.7)';
    setTimeout(() => { ind.style.transition = ''; ocupado = false; }, 220);
  });
}

// folhas (janelas de baixo) fecham arrastando para baixo
function configurarArrastarFolhas() {
  document.querySelectorAll('.sheet-overlay').forEach(ov => {
    const sheet = ov.querySelector('.sheet');
    if (!sheet) return;
    let y0 = null, dy = 0;
    sheet.addEventListener('touchstart', (e) => {
      if (!ehCelular() || e.target.closest('input, textarea, select, .rec-lista')) { y0 = null; return; }
      const noTopo = sheet.scrollTop <= 0 || e.target.closest('.sheet-grabber, .sheet-title');
      y0 = noTopo ? e.touches[0].clientY : null; dy = 0;
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) { sheet.style.transform = ''; sheet.classList.remove('arrastando'); return; }
      sheet.classList.add('arrastando');
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      if (y0 === null) return;
      y0 = null;
      sheet.classList.remove('arrastando');
      if (dy > 110) {
        sheet.style.transform = 'translateY(100%)';
        closeSheet(ov.id);
        setTimeout(() => { sheet.style.transform = ''; }, 260);
      } else sheet.style.transform = '';
    });
  });
}
