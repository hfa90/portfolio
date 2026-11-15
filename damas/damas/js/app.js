import * as E from './engine.js';
import { Net } from './net.js';
import { sfx, haptic, setFx } from './fx.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const LS_SESSION = 'damas.session.v1';
const LS_BACKUP = 'damas.backup.v1';
const LS_PREFS = 'damas.prefs.v1';
const TAB_ID = Math.random().toString(36).slice(2);

const read = (st, k) => { try { return JSON.parse(st.getItem(k)); } catch (_) { return null; } };
const write = (st, k, v) => { try { v == null ? st.removeItem(k) : st.setItem(k, JSON.stringify(v)); } catch (_) {} };

let prefs = Object.assign({ name: '', sound: true, haptic: true, level: 'medio', color: '1' }, read(localStorage, LS_PREFS) || {});
const savePrefs = () => write(localStorage, LS_PREFS, prefs);
setFx({ sound: prefs.sound, haptic: prefs.haptic });

let S = null;           // sessão (persistida)
let net = null;         // conexão P2P
let busy = false;       // animação em andamento
let sel = null;         // casa selecionada
let legal = [];         // lances legais do lado da vez
let drag = null;
let els = new Array(64).fill(null);
let sq = 40;
let aiReq = 0, thinking = false;
let typingTimer = null, lastTypingSent = 0;
let resultShownRound = null;

function save() {
  if (!S) { write(sessionStorage, LS_SESSION, null); write(localStorage, LS_BACKUP, null); return; }
  write(sessionStorage, LS_SESSION, S);
  write(localStorage, LS_BACKUP, { S, tab: TAB_ID, beat: Date.now() });
}
setInterval(() => { if (S) { const b = read(localStorage, LS_BACKUP); if (b && b.tab === TAB_ID) { b.beat = Date.now(); write(localStorage, LS_BACKUP, b); } } }, 2500);

// ======================================================================
// BLOQUEIOS DE GESTO (experiência de app nativo)
// ======================================================================
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) { e.preventDefault(); return; }
  const sc = e.target.closest && e.target.closest('.scrollable, .scrollable-x');
  if (!sc) e.preventDefault();
}, { passive: false });
document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea, .bubble')) e.preventDefault(); });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// ======================================================================
// ELEMENTOS
// ======================================================================
const appEl = $('#app');
appEl.addEventListener('scroll', () => { appEl.scrollTop = 0; appEl.scrollLeft = 0; });
$$('.screen').forEach((sc) => sc.addEventListener('scroll', () => { sc.scrollTop = 0; sc.scrollLeft = 0; }));
const boardEl = $('#board'), squaresEl = $('#squares'), piecesEl = $('#pieces'), hintsEl = $('#hints');
const CROWN = '<svg viewBox="0 0 24 24"><path fill="url(#gold)" stroke="#6d4808" stroke-width=".7" stroke-linejoin="round" d="M2.6 7.6 7.4 12 12 4.4l4.6 7.6 4.8-4.4-2 10.6H4.6L2.6 7.6Z"/><rect x="4.6" y="18.8" width="14.8" height="2.4" rx="1.1" fill="url(#gold)" stroke="#6d4808" stroke-width=".6"/><circle cx="12" cy="4" r="1.4" fill="#fff3b0"/></svg>';
document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".45" stop-color="#f4c443"/><stop offset="1" stop-color="#a86f0c"/></linearGradient></defs></svg>');

// granulação determinística da madeira
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function buildSquares(container, seed = 11) {
  const r = rng(seed);
  container.innerHTML = '';
  for (let vr = 0; vr < 8; vr++)
    for (let vc = 0; vc < 8; vc++) {
      const d = document.createElement('div');
      d.className = 'sq ' + (E.isDark(vr, vc) ? 'd' : 'l');
      d.style.setProperty('--ga', (r() > 0.5 ? 90 : 0) + (r() * 8 - 4) + 'deg');
      d.style.setProperty('--gp', `${Math.floor(r() * 180)}px ${Math.floor(r() * 180)}px`);
      container.appendChild(d);
    }
}
buildSquares(squaresEl);

function makePiece(p) {
  const el = document.createElement('div');
  el.className = 'piece';
  el.innerHTML = `<div class="disc"><div class="crown">${CROWN}</div></div>`;
  setPieceKind(el, p);
  return el;
}
function setPieceKind(el, p) {
  el.classList.toggle('w', p > 0);
  el.classList.toggle('b', p < 0);
  el.classList.toggle('k', Math.abs(p) === E.KING);
}

// ---------- tabuleiro decorativo da home ----------
(function hero() {
  const host = $('#hero-board');
  host.innerHTML = '<div class="frame"><div class="board"><div class="squares"></div><div class="pieces"></div></div></div>';
  buildSquares($('.squares', host), 5);
  const pc = $('.pieces', host);
  const pos = { 0: [[0, 1], [0, 5], [1, 2], [1, 6], [2, 1], [2, 3], [3, 6]], 1: [[5, 0], [5, 4], [6, 1], [6, 5], [7, 2], [4, 3], [7, 6]] };
  pc.style.fontSize = '10.5px';
  pos[0].forEach(([r, c]) => { const e = makePiece(-1); e.style.transform = `translate(${c * 100}%, ${r * 100}%)`; pc.appendChild(e); });
  pos[1].forEach(([r, c], i) => { const e = makePiece(i === 5 ? 2 : 1); e.style.transform = `translate(${c * 100}%, ${r * 100}%)`; pc.appendChild(e); });
})();

// ======================================================================
// GEOMETRIA
// ======================================================================
const flipped = () => S && S.mode !== 'local' && S.myColor === E.BLACK;
const viewRC = (i) => { const [r, c] = E.rc(i); return flipped() ? [7 - r, 7 - c] : [r, c]; };
const pos = (i) => { const [r, c] = viewRC(i); return [c * sq, r * sq]; };
const T = ([x, y], extra = '') => `translate3d(${x}px, ${y}px, 0)${extra}`;
const sqEl = (i) => { const [r, c] = viewRC(i); return squaresEl.children[r * 8 + c]; };

function squareAt(clientX, clientY) {
  const rect = boardEl.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return -1;
  let vc = Math.floor(x / (rect.width / 8)), vr = Math.floor(y / (rect.height / 8));
  if (flipped()) { vc = 7 - vc; vr = 7 - vr; }
  return E.idx(vr, vc);
}

function layout() {
  const body = $('.game-body');
  const bw = body.clientWidth - 24;
  const cards = $$('.player-card', body).reduce((a, c) => a + c.offsetHeight, 0);
  const bh = body.clientHeight - cards - 24 - 8;
  const size = Math.max(220, Math.floor(Math.min(bw, bh, 720)));
  document.documentElement.style.setProperty('--board-size', size + 'px');
  requestAnimationFrame(() => {
    sq = boardEl.clientWidth / 8;
    piecesEl.style.fontSize = sq * 0.42 + 'px';
    hintsEl.style.fontSize = sq * 0.42 + 'px';
    if (!busy) render();
  });
}
new ResizeObserver(() => layout()).observe($('.game-body'));
window.addEventListener('orientationchange', () => setTimeout(layout, 300));

function buildCoords() {
  const files = 'abcdefgh'.split(''), ranks = '87654321'.split('');
  const f = flipped() ? [...files].reverse() : files, r = flipped() ? [...ranks].reverse() : ranks;
  $('.coords.files').innerHTML = f.map((x) => `<span>${x}</span>`).join('');
  $('.coords.ranks').innerHTML = r.map((x) => `<span>${x}</span>`).join('');
}

// ======================================================================
// RENDERIZAÇÃO
// ======================================================================
function render() {
  if (!S) return;
  const b = S.game.board;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    let el = els[i];
    if (p && !el) { el = makePiece(p); piecesEl.appendChild(el); els[i] = el; }
    if (!p && el) { el.remove(); els[i] = null; continue; }
    if (el) {
      setPieceKind(el, p);
      if (!(drag && drag.moved && drag.i === i)) el.style.transform = T(pos(i));
    }
  }
  // remove órfãos
  $$('.piece', piecesEl).forEach((el) => { if (!els.includes(el)) el.remove(); });
  renderHints();
}

function movesFrom(i) { return legal.filter((m) => m.from === i); }

function renderHints() {
  hintsEl.innerHTML = '';
  $$('.sq.last, .sq.sel', squaresEl).forEach((e) => e.classList.remove('last', 'sel'));
  els.forEach((e) => e && e.classList.remove('can', 'threat'));
  const last = S.game.last;
  if (last) { sqEl(last.from).classList.add('last'); sqEl(last.to).classList.add('last'); }
  if (!canInteract()) return;
  if (sel != null) {
    sqEl(sel).classList.add('sel');
    const ms = movesFrom(sel);
    const shown = new Set();
    for (const m of ms) {
      const to = E.moveTo(m);
      m.captured.forEach((c) => els[c] && els[c].classList.add('threat'));
      m.path.slice(0, -1).forEach((p) => { if (!shown.has('s' + p)) { shown.add('s' + p); addHint(p, 'step'); } });
      if (!shown.has(to)) { shown.add(to); addHint(to, m.captured.length ? 'cap' : ''); }
    }
  } else if (legal.length && legal[0].captured.length) {
    new Set(legal.map((m) => m.from)).forEach((f) => els[f] && els[f].classList.add('can'));
  }
}
function addHint(i, cls) {
  const h = document.createElement('div');
  h.className = 'hint ' + cls;
  h.dataset.sq = i;
  h.style.transform = T(pos(i));
  hintsEl.appendChild(h);
}

function interactiveColor() {
  if (!S || S.game.winner != null) return 0;
  if (S.mode === 'local') return S.game.turn;
  return S.game.turn === S.myColor ? S.myColor : 0;
}
function canInteract() {
  if (!S || busy || thinking || S.game.winner != null) return false;
  if (S.mode === 'online' && !S.started) return false;
  return interactiveColor() !== 0;
}

// ---------- cartões dos jogadores ----------
function initials(n) { return (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'; }
function updateUI() {
  if (!S) return;
  const g = S.game;
  const cnt = E.countPieces(g.board);
  let top, bottom;
  const lvl = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }[S.level] || '';
  if (S.mode === 'local') {
    top = { name: 'Escuras', color: E.BLACK, av: 'Es', cls: 'ai' };
    bottom = { name: 'Claras', color: E.WHITE, av: 'Cl', cls: 'me' };
  } else {
    const oc = -S.myColor;
    top = S.mode === 'ai'
      ? { name: `Máquina · ${lvl}`, color: oc, av: '🤖', cls: 'ai' }
      : { name: S.oppName || 'Aguardando…', color: oc, av: initials(S.oppName), cls: '' };
    bottom = { name: S.mode === 'ai' ? (prefs.name || 'Você') : (S.myName || 'Você'), color: S.myColor, av: initials(S.mode === 'ai' ? (prefs.name || 'Você') : S.myName), cls: 'me' };
  }
  [[$('#card-top'), top], [$('#card-bottom'), bottom]].forEach(([card, p]) => {
    const av = $('.avatar', card);
    av.className = 'avatar ' + p.cls + (p.color === E.WHITE ? ' cw' : ' cb');
    $('span', av).textContent = p.av;
    $('.pname', card).textContent = p.name;
    const myTurn = g.winner == null && g.turn === p.color;
    card.classList.toggle('turn', myTurn);
    const st = $('.pstate', card);
    st.classList.remove('dots');
    if (g.winner != null) st.textContent = g.winner === 0 ? 'Empate' : g.winner === p.color ? 'Vencedor' : '';
    else if (myTurn) {
      const isMe = card.id === 'card-bottom' || S.mode === 'local';
      if (S.mode === 'ai' && card.id === 'card-top') { st.textContent = 'Pensando'; st.classList.add('dots'); }
      else if (S.mode === 'online' && card.id === 'card-top') { st.textContent = 'Jogando'; st.classList.add('dots'); }
      else st.textContent = isMe && legal.length && legal[0].captured.length ? 'Sua vez · captura obrigatória' : (S.mode === 'local' ? 'Vez de jogar' : 'Sua vez');
    } else st.textContent = '';
    // bandeja de capturas
    const taken = 12 - (p.color === E.WHITE ? cnt.b : cnt.w);
    const tray = $('.tray', card);
    const prev = +tray.dataset.n || 0;
    if (prev !== taken) {
      const cls = p.color === E.WHITE ? 'b' : 'w';
      tray.innerHTML = taken ? Array.from({ length: Math.min(taken, 5) }, (_, k) => `<i class="mini ${cls}${k === Math.min(taken, 5) - 1 && taken > prev ? ' pop' : ''}"></i>`).join('') + `<em>${taken}</em>` : '';
      tray.dataset.n = taken;
    }
  });
  $('#nav-title').textContent = S.mode === 'ai' ? 'Contra a máquina' : S.mode === 'local' ? 'Dois jogadores' : (S.oppName ? `vs ${S.oppName}` : 'Sala ' + S.room);
  $('#btn-undo').hidden = S.mode === 'online';
  $('#btn-undo').disabled = !S.hist.length || g.winner != null;
  $('#btn-chat').hidden = S.mode !== 'online';
  $('#btn-resign').disabled = g.winner != null || (S.mode === 'online' && !S.started);
  const badge = $('#chat-badge');
  badge.hidden = !S.unread; badge.textContent = S.unread > 9 ? '9+' : S.unread;
  // sala de espera
  const w = $('#waiting');
  const needWait = S.mode === 'online' && !S.started;
  if (needWait) {
    w.hidden = false; w.classList.remove('hide');
    const host = S.role === 'host';
    $('#wait-title').textContent = host ? 'Aguardando adversário' : 'Entrando na sala…';
    $('#wait-sub').textContent = host ? 'Envie o convite. Assim que seu amigo abrir o link, a partida começa.' : 'Conectando ao aparelho do seu adversário.';
    $('#wait-actions').hidden = !host;
    $('#qr').hidden = !host;
    $('#room-code').textContent = S.room;
    if (host) renderQR();
  } else if (!w.hidden && !w.classList.contains('hide')) {
    w.classList.add('hide');
    setTimeout(() => { w.hidden = true; w.classList.remove('hide'); }, 350);
  }
}
function renderStatus(st) {
  const pill = $('#status-pill');
  if (!S || S.mode !== 'online' || !S.started) { pill.hidden = true; return; }
  pill.hidden = false;
  pill.classList.toggle('off', st !== 'connected');
  $('span', pill).textContent = st === 'connected' ? 'Conectado' : 'Reconectando…';
}

// ======================================================================
// INTERAÇÃO NO TABULEIRO (arrastar e tocar)
// ======================================================================
function select(i) { sel = i; renderHints(); }
function deselect() { sel = null; renderHints(); }

boardEl.addEventListener('pointerdown', (e) => {
  if (!canInteract() || drag) return;
  if (e.button > 0) return;
  const i = squareAt(e.clientX, e.clientY);
  if (i < 0) return;
  const p = S.game.board[i];
  // toque no destino com uma peça já selecionada
  if (sel != null && p === 0) {
    const ms = movesFrom(sel).filter((m) => E.moveTo(m) === i);
    if (ms.length) { userMove(ms[0], false); return; }
    deselect(); return;
  }
  if (p && E.colorOf(p) === interactiveColor()) {
    const ms = movesFrom(i);
    if (!ms.length) {
      const el = els[i];
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      haptic('error'); sfx.error();
      if (legal.length && legal[0].captured.length) {
        toast(legal[0].captured.length > 1 ? `Captura obrigatória de ${legal[0].captured.length} peças` : 'Captura obrigatória!', '⚠️');
        new Set(legal.map((m) => m.from)).forEach((f) => { const x = els[f]; if (x) { x.classList.remove('can'); void x.offsetWidth; x.classList.add('can'); } });
      }
      deselect();
      return;
    }
    if (sel !== i) { sfx.pick(); haptic('light'); }
    select(i);
    drag = { i, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, el: els[i], touch: e.pointerType !== 'mouse', hover: -1 };
    try { boardEl.setPointerCapture(e.pointerId); } catch (_) {}
  } else deselect();
});

boardEl.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; drag.el.classList.add('lifted'); }
  if (!drag.moved) return;
  const rect = boardEl.getBoundingClientRect();
  const lift = drag.touch ? sq * 0.55 : 0;
  const x = e.clientX - rect.left - sq / 2, y = e.clientY - rect.top - sq / 2 - lift;
  drag.el.style.transform = T([x, y]);
  drag.x = x; drag.y = y;
  const over = squareAt(rect.left + x + sq / 2, rect.top + y + sq / 2);
  if (over !== drag.hover) {
    $$('.hint.hover', hintsEl).forEach((h) => h.classList.remove('hover'));
    const h = hintsEl.querySelector(`.hint[data-sq="${over}"]:not(.step)`);
    if (h) { h.classList.add('hover'); haptic('light'); }
    drag.hover = over;
  }
});

function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  try { boardEl.releasePointerCapture(e.pointerId); } catch (_) {}
  if (!d.moved) return; // foi só um toque: mantém seleção
  const rect = boardEl.getBoundingClientRect();
  const target = cancel ? -1 : squareAt(rect.left + d.x + sq / 2, rect.top + d.y + sq / 2);
  const ms = movesFrom(d.i).filter((m) => E.moveTo(m) === target);
  if (ms.length) { userMove(ms[0], true, [d.x, d.y]); return; }
  // volta para a casa de origem
  d.el.classList.remove('lifted');
  const from = [d.x, d.y], to = pos(d.i);
  d.el.style.transform = T(to);
  d.el.animate([{ transform: T(from) }, { transform: T(to) }], { duration: 320, easing: 'cubic-bezier(.34,1.4,.64,1)' });
  if (target !== d.i && target >= 0) { haptic('error'); }
  renderHints();
}
boardEl.addEventListener('pointerup', (e) => endDrag(e, false));
boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));

// ======================================================================
// ANIMAÇÃO DE LANCES
// ======================================================================
function anim(el, a, b, dur, lift, king) {
  el.style.transform = T(b);
  const base = king ? 'translateY(-.14em)' : 'translateY(0)';
  if (lift) {
    el.firstElementChild.animate(
      [{ transform: base }, { transform: 'translateY(-.55em) scale(1.13)', offset: 0.45 }, { transform: base }],
      { duration: dur, easing: 'ease-in-out' }
    );
  }
  return el.animate([{ transform: T(a) }, { transform: T(b) }], { duration: dur, easing: 'cubic-bezier(.45,.05,.25,1)' }).finished;
}

function vanish(ci, delay = 0) {
  const c = els[ci];
  if (!c) return;
  els[ci] = null;
  const p = pos(ci);
  const a = c.animate(
    [{ transform: T(p), opacity: 1, filter: 'brightness(1)' }, { transform: T(p, ' scale(1.15)'), opacity: 1, filter: 'brightness(1.8)', offset: 0.25 }, { transform: T([p[0], p[1] - sq * 0.25], ' scale(.3)'), opacity: 0, filter: 'brightness(1)' }],
    { duration: 380, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }
  );
  a.finished.then(() => c.remove());
}

async function animateMove(m, dragged = false, dragPos = null) {
  const el = els[m.from];
  if (!el) return;
  els[m.from] = null;
  el.style.zIndex = 30;
  const king = Math.abs(S.game.board[m.from]) === E.KING;
  let cur = dragPos || pos(m.from);
  if (dragged) {
    el.classList.remove('lifted');
    await anim(el, cur, pos(E.moveTo(m)), 130, false, king);
    if (m.captured.length) { sfx.capture(); haptic('heavy'); } else { sfx.place(); haptic('light'); }
    m.captured.forEach((c, k) => { vanish(c, k * 90); if (k) setTimeout(() => sfx.capture(), k * 90); });
  } else {
    for (let k = 0; k < m.path.length; k++) {
      const next = pos(m.path[k]);
      const dist = Math.max(Math.abs(next[0] - cur[0]), Math.abs(next[1] - cur[1])) / sq;
      await anim(el, cur, next, 190 + dist * 55, true, king);
      if (m.captured[k] != null) { sfx.capture(); haptic('heavy'); vanish(m.captured[k]); }
      else { sfx.place(); haptic('light'); }
      cur = next;
    }
  }
  el.style.zIndex = '';
  els[E.moveTo(m)] = el;
}

async function userMove(m, dragged, dragPos) {
  busy = true; sel = null;
  hintsEl.innerHTML = '';
  els.forEach((e) => e && e.classList.remove('can', 'threat'));
  await animateMove(m, dragged, dragPos);
  busy = false;
  commit(m, false);
}

function commit(m, remote) {
  const before = S.game;
  if (S.mode !== 'online') { S.hist.push(before); if (S.hist.length > 150) S.hist.shift(); }
  S.game = E.applyMove(before, m);
  sel = null;
  legal = S.game.winner == null ? E.legalMoves(S.game.board, S.game.turn) : [];
  save();
  render();
  if (S.game.last && S.game.last.promoted) {
    const el = els[S.game.last.to];
    if (el) { el.classList.remove('promote'); void el.offsetWidth; el.classList.add('promote'); }
    sfx.promote(); haptic('success');
  }
  updateUI();
  if (S.mode === 'online' && !remote) net && net.send({ t: 'move', m, round: S.round, ply: before.ply });
  if (S.game.winner != null) { gameOver(true); return; }
  if (S.mode === 'ai' && S.game.turn !== S.myColor) aiThink();
}

// ======================================================================
// IA
// ======================================================================
let worker = null;
function getWorker() {
  if (worker === false) return null;
  if (!worker) {
    try { worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' }); }
    catch (_) { worker = false; return null; }
    worker.onerror = () => { worker = false; };
  }
  return worker;
}
function askAI(state, level) {
  return new Promise((resolve) => {
    const w = getWorker();
    const id = ++aiReq;
    if (!w) {
      const L = { facil: { depth: 2, timeMs: 300, randomness: 60 }, medio: { depth: 5, timeMs: 700, randomness: 8 }, dificil: { depth: 12, timeMs: 1600 } }[level];
      setTimeout(() => resolve({ id, move: E.searchBest(state, L) }), 30);
      return;
    }
    const h = (e) => { if (e.data.id === id) { w.removeEventListener('message', h); resolve(e.data); } };
    w.addEventListener('message', h);
    w.postMessage({ id, state, level });
  });
}
async function aiThink() {
  if (!S || S.mode !== 'ai' || S.game.winner != null || S.game.turn === S.myColor) return;
  thinking = true; updateUI(); renderHints();
  const t0 = Date.now();
  const snapshot = S.game;
  const { id, move } = await askAI(snapshot, S.level);
  const wait = Math.max(0, 550 + Math.random() * 350 - (Date.now() - t0));
  await new Promise((r) => setTimeout(r, wait));
  if (!S || id !== aiReq || S.game !== snapshot || !move) { thinking = false; return; }
  thinking = false;
  busy = true;
  await animateMove(move);
  busy = false;
  commit(move, true);
}

// ======================================================================
// FIM DE JOGO
// ======================================================================
function gameOver(live) {
  const g = S.game;
  // as mensagens são apagadas ao fim da partida
  if (S.mode === 'online' && S.chat.length) {
    S.chat = []; S.unread = 0; renderChat();
    if (live) setTimeout(() => toast('Mensagens da partida apagadas', '🗑️'), 1800);
  }
  if ($('#sheet-chat').classList.contains('show')) closeSheets();
  S.rematch = { me: false, opp: false };
  save(); updateUI(); renderHints();
  if (resultShownRound === S.round + ':' + g.ply) return;
  resultShownRound = S.round + ':' + g.ply;
  const me = S.mode === 'local' ? null : S.myColor;
  let title, sub, emblem = 'win', icon = '🏆';
  const opp = S.mode === 'ai' ? 'A máquina' : (S.oppName || 'Seu adversário');
  const reasons = {
    capturas: (w) => (w ? 'Você capturou todas as peças.' : 'Todas as suas peças foram capturadas.'),
    bloqueio: (w) => (w ? 'O adversário ficou sem lances.' : 'Você ficou sem lances possíveis.'),
    desistencia: (w) => (w ? `${opp} desistiu.` : 'Você desistiu da partida.'),
    abandono: () => `${opp} saiu da sala.`,
  };
  if (g.winner === 0) { title = 'Empate'; sub = '20 lances seguidos de damas sem captura.'; emblem = 'draw'; icon = '🤝'; }
  else if (me == null) { title = g.winner === E.WHITE ? 'Claras vencem!' : 'Escuras vencem!'; sub = g.reason === 'desistencia' ? 'O adversário desistiu.' : g.reason === 'bloqueio' ? 'O adversário ficou sem lances.' : 'Todas as peças adversárias foram capturadas.'; }
  else if (g.winner === me) { title = 'Vitória!'; sub = (reasons[g.reason] || reasons.capturas)(true); }
  else { title = 'Derrota'; sub = (reasons[g.reason] || reasons.capturas)(false); emblem = 'lose'; icon = '😔'; }
  $('#result-title').textContent = title;
  $('#result-sub').textContent = sub;
  const em = $('#result-emblem'); em.className = 'result-emblem ' + emblem; em.textContent = icon;
  const rb = $('#btn-rematch');
  rb.disabled = !!S.oppLeft; rb.textContent = S.oppLeft ? 'Adversário saiu' : 'Revanche';
  setTimeout(() => {
    if (!S) return;
    $('#result').classList.add('show');
    if (live) {
      if (emblem === 'win') { sfx.win(); haptic('success'); confetti(); }
      else if (emblem === 'lose') { sfx.lose(); haptic('error'); }
      else sfx.join();
    }
  }, live ? 850 : 0);
}
function hideResult() { $('#result').classList.remove('show'); }

function confetti() {
  const cv = $('#confetti'), c = cv.getContext('2d');
  const dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; c.scale(dpr, dpr);
  const colors = ['#ffd60a', '#ff9f0a', '#30d158', '#0a84ff', '#ff375f', '#bf5af2', '#fff'];
  const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.38, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 4, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, col: colors[(Math.random() * colors.length) | 0] }));
  const t0 = performance.now();
  (function f(t) {
    c.clearRect(0, 0, innerWidth, innerHeight);
    P.forEach((p) => { p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore(); });
    if (t - t0 < 3200) requestAnimationFrame(f); else c.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

// ======================================================================
// SESSÕES / MODOS
// ======================================================================
const SCREEN_ORDER = ['hub', 'home', 'game'];
function showScreen(name, instant) {
  const k = SCREEN_ORDER.indexOf(name);
  const els = SCREEN_ORDER.map((n) => $('#screen-' + n));
  els.forEach((el, i) => {
    el.classList.toggle('instant', !!instant);
    el.classList.toggle('active', i === k);
    el.classList.toggle('behind', i < k);
  });
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((s) => s.classList.remove('instant'))));
}

function openGame(instant) {
  els.forEach((e) => e && e.remove());
  els = new Array(64).fill(null);
  piecesEl.innerHTML = '';
  sel = null; busy = false; thinking = false; aiReq++;
  $$('.tray').forEach((t) => { t.dataset.n = ''; t.innerHTML = ''; });
  legal = S.game.winner == null ? E.legalMoves(S.game.board, S.game.turn) : [];
  buildCoords();
  showScreen('game', instant);
  hideResult();
  updateUI();
  layout();
  render();
  renderChat();
  renderStatus(net ? net.status : 'connecting');
}

function startAI() {
  const color = prefs.color === '0' ? (Math.random() < 0.5 ? 1 : -1) : +prefs.color;
  S = { mode: 'ai', game: E.newGame(), myColor: color, level: prefs.level, hist: [], chat: [], unread: 0, round: 1 };
  save(); closeSheets(); openGame();
  if (color === E.BLACK) setTimeout(aiThink, 650);
}
function startLocal() {
  S = { mode: 'local', game: E.newGame(), myColor: E.WHITE, hist: [], chat: [], unread: 0, round: 1 };
  save(); openGame();
}

const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 32) | 0]).join('');
function inviteLink() {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('sala', S.room);
  if (S.myName) u.searchParams.set('de', S.myName);
  return u.toString();
}

function createRoom() {
  const name = $('#name-host').value.trim() || 'Jogador';
  prefs.name = name; savePrefs();
  S = { mode: 'online', role: 'host', room: code(), myName: name, oppName: '', myColor: E.WHITE, round: 1, game: E.newGame(), started: false, hist: [], chat: [], unread: 0, rematch: { me: false, opp: false } };
  save(); closeSheets(); openGame(); startNet();
}
function joinRoom(room, from) {
  const name = $('#name-guest').value.trim() || 'Convidado';
  prefs.name = name; savePrefs();
  if (net) { net.destroy(); net = null; }
  S = { mode: 'online', role: 'guest', room, myName: name, oppName: from || '', myColor: E.BLACK, round: 0, game: E.newGame(), started: false, hist: [], chat: [], unread: 0, rematch: { me: false, opp: false } };
  history.replaceState(null, '', location.pathname);
  save(); closeSheets(); openGame(); startNet();
}

function startNet() {
  if (net) net.destroy();
  net = new Net({
    room: S.room, role: S.role,
    onMessage, onOpen: sendHello,
    onStatus: (st) => renderStatus(st),
  });
  net.start();
}
function sendHello() {
  if (!S || !net) return;
  net.send({ t: 'hello', name: S.myName, round: S.round, game: S.game, color: S.myColor, oppLeft: false }, { queue: false });
}

function newer(round, ply) { return round > S.round || (round === S.round && ply > S.game.ply); }

async function onMessage(msg) {
  if (!S || S.mode !== 'online' || !msg) return;
  switch (msg.t) {
    case 'hello': {
      const first = !S.started;
      S.oppName = msg.name || S.oppName;
      S.started = true;
      if (newer(msg.round, msg.game.ply)) {
        const newRound = msg.round > S.round;
        S.game = msg.game; S.round = msg.round; S.myColor = -msg.color;
        if (newRound) { S.chat = []; S.unread = 0; S.rematch = { me: false, opp: false }; hideResult(); }
        save();
        openGame(true);
        if (S.game.winner != null) gameOver(false);
      } else if (msg.round < S.round || (msg.round === S.round && msg.game.ply < S.game.ply)) {
        sendHello(); // o meu estado é o mais novo
      }
      save(); updateUI(); renderStatus(net.status); renderChat();
      if (first) { sfx.join(); haptic('success'); toast(S.role === 'host' ? `${S.oppName} entrou na partida` : `Você entrou na sala de ${S.oppName}`, '🎉'); }
      break;
    }
    case 'sync': sendHello(); break;
    case 'move': {
      if (msg.round === S.round && msg.ply === S.game.ply && S.game.winner == null) {
        const ok = E.legalMoves(S.game.board, S.game.turn).find((m) => E.sameMove(m, msg.m));
        if (!ok) { net.send({ t: 'sync' }); return; }
        while (busy) await new Promise((r) => setTimeout(r, 50));
        sel = null; busy = true; renderHints();
        await animateMove(ok);
        busy = false;
        commit(ok, true);
      } else if (newer(msg.round, msg.ply)) net.send({ t: 'sync' });
      break;
    }
    case 'chat': {
      if (S.game.winner != null || S.chat.some((c) => c.id === msg.id)) return;
      S.chat.push({ id: msg.id, from: 'op', text: String(msg.text).slice(0, 240), ts: msg.ts || Date.now() });
      $('#typing').hidden = true;
      if ($('#sheet-chat').classList.contains('show')) { renderChat(); sfx.message(); }
      else { S.unread = (S.unread || 0) + 1; updateUI(); sfx.message(); haptic('light'); toast(`${S.oppName}: ${msg.text}`, '💬', 3200, openChat); }
      save(); break;
    }
    case 'typing': {
      if (!$('#sheet-chat').classList.contains('show')) return;
      $('#typing').hidden = false; scrollChat();
      clearTimeout(typingTimer); typingTimer = setTimeout(() => ($('#typing').hidden = true), 3000);
      break;
    }
    case 'resign': {
      if (msg.round !== S.round || S.game.winner != null) return;
      S.game = { ...S.game, winner: S.myColor, reason: 'desistencia' };
      legal = []; gameOver(true); break;
    }
    case 'rematch': {
      if (msg.round !== S.round) return;
      S.rematch.opp = true;
      if (S.rematch.me) startRematch();
      else { $('#btn-rematch').textContent = 'Aceitar revanche'; toast(`${S.oppName} quer revanche!`, '🔁', 3000); haptic('light'); }
      save(); break;
    }
    case 'bye': {
      S.oppLeft = true;
      S.chat = []; S.unread = 0; renderChat();
      if (S.game.winner == null && S.started) {
        S.game = { ...S.game, winner: S.myColor, reason: 'abandono' }; legal = [];
        gameOver(true);
      } else { $('#btn-rematch').disabled = true; $('#btn-rematch').textContent = 'Adversário saiu'; }
      toast(`${S.oppName || 'O adversário'} saiu da sala`, '👋', 3000);
      save(); break;
    }
  }
}

function startRematch() {
  S.round += 1;
  S.myColor = -S.myColor;
  S.game = E.newGame();
  S.rematch = { me: false, opp: false };
  S.chat = []; S.unread = 0;
  save(); openGame(true);
  toast(S.myColor === E.WHITE ? 'Nova partida · você começa' : 'Nova partida · adversário começa', '♟️');
  haptic('success');
}

function rematch() {
  if (S.mode !== 'online') {
    const color = S.mode === 'ai' ? -S.myColor : E.WHITE;
    S = { ...S, game: E.newGame(), myColor: color, hist: [], round: (S.round || 1) + 1 };
    save(); openGame();
    if (S.mode === 'ai' && S.myColor === E.BLACK) setTimeout(aiThink, 650);
    return;
  }
  if (S.oppLeft) return;
  S.rematch.me = true;
  net.send({ t: 'rematch', round: S.round });
  if (S.rematch.opp) startRematch();
  else { $('#btn-rematch').textContent = 'Aguardando adversário…'; save(); }
}

function leave() {
  if (S && S.mode === 'online' && net) { net.send({ t: 'bye' }, { queue: false }); const n = net; setTimeout(() => n.destroy(), 300); net = null; }
  aiReq++; thinking = false;
  S = null; save();
  hideResult(); closeSheets();
  $('#waiting').hidden = true;
  showScreen('home');
}

function resign() {
  if (!S || S.game.winner != null) return;
  const loser = S.mode === 'local' ? S.game.turn : S.myColor;
  S.game = { ...S.game, winner: -loser, reason: 'desistencia' };
  legal = []; aiReq++; thinking = false;
  if (S.mode === 'online') net && net.send({ t: 'resign', round: S.round });
  gameOver(true);
}

function undo() {
  if (!S || S.mode === 'online' || !S.hist.length || busy) return;
  aiReq++; thinking = false;
  if (S.mode === 'ai') {
    let g = S.hist.pop();
    while (S.hist.length && g.turn !== S.myColor) g = S.hist.pop();
    if (g.turn !== S.myColor) { S.hist.push(g); return; }
    S.game = g;
  } else S.game = S.hist.pop();
  sel = null;
  legal = E.legalMoves(S.game.board, S.game.turn);
  save(); render(); updateUI(); haptic('light'); sfx.pick();
}

// ======================================================================
// CHAT
// ======================================================================
const chatList = $('#chat-list');
function fmtTime(ts) { const d = new Date(ts); return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function renderChat() {
  if (!S) { chatList.innerHTML = ''; return; }
  $('#chat-name').textContent = S.oppName || 'Adversário';
  $('#chat-avatar').textContent = initials(S.oppName);
  if (!S.chat.length) { chatList.innerHTML = '<div class="chat-empty">Diga oi para o seu adversário 👋<br/>As mensagens são apagadas quando a partida termina.</div>'; return; }
  let html = '', prev = null;
  for (const m of S.chat) {
    if (!prev || m.ts - prev.ts > 5 * 60 * 1000) html += `<div class="stamp">${fmtTime(m.ts)}</div>`;
    const first = !prev || prev.from !== m.from;
    html += `<div class="bubble ${m.from === 'me' ? 'me' : 'op'}${first ? ' first' : ''}">${esc(m.text)}</div>`;
    prev = m;
  }
  chatList.innerHTML = html;
  scrollChat();
}
function scrollChat() { requestAnimationFrame(() => { chatList.scrollTop = chatList.scrollHeight; }); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function sendChat(text) {
  text = (text || '').trim();
  if (!text || !S || S.mode !== 'online' || S.game.winner != null) return;
  const m = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), from: 'me', text, ts: Date.now() };
  S.chat.push(m); save();
  net && net.send({ t: 'chat', id: m.id, text: m.text, ts: m.ts });
  sfx.send(); haptic('light');
  renderChat();
}
function openChat() {
  if (!S || S.mode !== 'online') return;
  if (S.game.winner != null) { toast('A partida terminou — o chat foi encerrado', '💬'); return; }
  S.unread = 0; save(); updateUI(); renderChat();
  openSheet('sheet-chat');
}
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const i = $('#chat-text');
  sendChat(i.value); i.value = ''; $('.send').disabled = true;
});
$('#chat-text').addEventListener('input', (e) => {
  $('.send').disabled = !e.target.value.trim();
  if (Date.now() - lastTypingSent > 1800 && net) { lastTypingSent = Date.now(); net.send({ t: 'typing' }, { queue: false }); }
});
$('.send').disabled = true;
$('#quick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) sendChat(b.textContent); });

// teclado virtual do iOS: mantém o chat colado acima do teclado
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', (kb > 40 ? kb : 0) + 'px');
    $('#sheet-chat').classList.toggle('kbd', kb > 40);
    if (kb > 40) $('#sheet-chat').style.height = Math.min(vv.height - 20 - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0), 640) + 'px';
    else $('#sheet-chat').style.height = '';
    scrollChat();
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}
document.addEventListener('focusout', () => setTimeout(() => window.scrollTo(0, 0), 50));

// ======================================================================
// SHEETS, ALERTAS, TOASTS
// ======================================================================
const backdrop = $('#backdrop');
function openSheet(id) {
  closeSheets(true);
  backdrop.classList.add('show');
  $('#' + id).classList.add('show');
}
function closeSheets(keepBackdrop) {
  $$('.sheet.show, .action-sheet.show').forEach((s) => { s.classList.remove('show'); s.style.transform = ''; });
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (!keepBackdrop) backdrop.classList.remove('show');
  $('#typing').hidden = true;
}
backdrop.addEventListener('click', () => closeSheets());

// arrastar para fechar (como no iOS)
$$('.sheet').forEach((sheet) => {
  let st = null;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button, .scrollable, .scrollable-x, .segmented')) return;
    st = { y: e.clientY, t: Date.now(), id: e.pointerId };
    sheet.classList.add('dragging');
    try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dy = e.clientY - st.y;
    sheet.style.transform = `translate3d(0, ${dy > 0 ? dy : dy / 6}px, 0)`;
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dy = e.clientY - st.y, v = dy / (Date.now() - st.t);
    sheet.classList.remove('dragging');
    sheet.style.transform = '';
    if (dy > 110 || v > 0.6) closeSheets();
    st = null;
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
});

function actions(list) {
  const g = $('#as-group');
  g.innerHTML = '';
  list.forEach((a) => {
    const b = document.createElement('button');
    b.textContent = a.label; if (a.danger) b.className = 'danger';
    b.onclick = () => { closeSheets(); setTimeout(a.fn, 200); };
    g.appendChild(b);
  });
  closeSheets(true);
  backdrop.classList.add('show');
  $('#action-sheet').classList.add('show');
}

function alertBox(title, msg, buttons) {
  $('#alert-title').textContent = title;
  $('#alert-msg').textContent = msg;
  const box = $('#alert-actions'); box.innerHTML = '';
  buttons.forEach((b) => {
    const el = document.createElement('button');
    el.textContent = b.label; el.className = b.style || '';
    el.onclick = () => { $('#alert').classList.remove('show'); backdrop.classList.remove('show'); b.fn && setTimeout(b.fn, 120); };
    box.appendChild(el);
  });
  backdrop.classList.add('show');
  $('#alert').classList.add('show');
  haptic('light');
}

let toastT = null, toastTap = null;
function toast(text, icon = '♟️', ms = 2200, onTap = null) {
  const is = $('#island');
  $('#island-text').textContent = text;
  $('#island-icon').textContent = icon;
  toastTap = onTap;
  is.classList.remove('show'); void is.offsetWidth; is.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => is.classList.remove('show'), ms);
}
$('#island').addEventListener('click', () => { $('#island').classList.remove('show'); toastTap && toastTap(); });

// ---------- QR / compartilhar ----------
let qrFor = null;
function renderQR() {
  const link = inviteLink();
  if (qrFor === link) return;
  const box = $('#qr');
  if (!window.qrcode) { box.innerHTML = ''; setTimeout(renderQR, 600); return; }
  try {
    const q = window.qrcode(0, 'M'); q.addData(link); q.make();
    box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    qrFor = link;
  } catch (_) { box.innerHTML = ''; }
}
async function copyLink() {
  const link = inviteLink();
  try { await navigator.clipboard.writeText(link); }
  catch (_) { const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast('Link do convite copiado', '🔗'); haptic('success');
}
async function share() {
  const link = inviteLink();
  if (navigator.share) {
    try { await navigator.share({ title: 'Damas', text: `${S.myName} te desafiou para uma partida de Damas! ♟️`, url: link }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copyLink();
}

// ======================================================================
// AÇÕES
// ======================================================================
const ACT = {
  hub: () => showScreen('hub'),
  'open-damas': () => showScreen('home'),
  'open-ai': () => openSheet('sheet-ai'),
  'open-online': () => { $('#name-host').value = prefs.name || ''; openSheet('sheet-online'); },
  'start-local': startLocal,
  'start-ai': startAI,
  'create-room': createRoom,
  'join-room': () => joinRoom(pendingJoin.room, pendingJoin.from),
  'close-sheet': () => closeSheets(),
  share, copy: copyLink,
  chat: openChat,
  undo,
  home: leave,
  rematch,
  resign: () => alertBox('Desistir da partida?', S.mode === 'online' ? 'Seu adversário vence e as mensagens serão apagadas.' : 'A partida será encerrada como derrota.', [{ label: 'Cancelar', style: 'bold' }, { label: 'Desistir', style: 'danger', fn: resign }]),
  leave: () => {
    if (!S) return;
    const live = S.game.winner == null && (S.mode !== 'online' || S.started) && S.game.ply > 0;
    if (!live && !(S.mode === 'online' && !S.started)) { leave(); return; }
    alertBox(
      S.mode === 'online' && !S.started ? 'Cancelar convite?' : 'Sair da partida?',
      S.mode === 'online' ? (S.started ? 'Você perde a partida e as mensagens serão apagadas.' : 'O link do convite deixará de funcionar.') : 'O progresso desta partida será perdido.',
      [{ label: 'Ficar', style: 'bold' }, { label: 'Sair', style: 'danger', fn: leave }]
    );
  },
  menu: () => {
    if (!S) return;
    const list = [];
    if (S.mode !== 'online') list.push({ label: 'Desfazer lance', fn: undo });
    if (S.mode === 'online') list.push({ label: 'Mensagens', fn: openChat });
    if (S.mode === 'online' && S.role === 'host' && !S.started) list.push({ label: 'Copiar link do convite', fn: copyLink });
    list.push({ label: prefs.sound ? 'Desativar sons' : 'Ativar sons', fn: () => toggleSound(!prefs.sound) });
    if (S.game.winner == null) list.push({ label: 'Desistir', danger: true, fn: ACT.resign });
    actions(list);
  },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const fn = ACT[b.dataset.action];
  if (fn) { haptic('light'); fn(); }
});

// segmentados
$$('.segmented').forEach((seg) => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
  prefs[seg.dataset.name] = b.dataset.value; savePrefs(); haptic('light');
}));
$$('.segmented').forEach((seg) => { const v = prefs[seg.dataset.name]; if (v != null) $$('button', seg).forEach((x) => x.classList.toggle('on', x.dataset.value === String(v))); });

function toggleSound(on) { prefs.sound = on; savePrefs(); setFx({ sound: on }); $('#opt-sound').checked = on; }
$('#opt-sound').checked = prefs.sound; $('#opt-haptic').checked = prefs.haptic;
$('#opt-sound').addEventListener('change', (e) => toggleSound(e.target.checked));
$('#opt-haptic').addEventListener('change', (e) => { prefs.haptic = e.target.checked; savePrefs(); setFx({ haptic: prefs.haptic }); haptic('light'); });
['name-host', 'name-guest'].forEach((id) => $('#' + id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (id === 'name-host' ? createRoom : ACT['join-room'])(); } }));

// ---------- ciclo de vida ----------
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && net) net.wake(); });
window.addEventListener('pagehide', () => { if (net) net.destroy(); });
window.addEventListener('pageshow', (e) => { if (e.persisted && S && S.mode === 'online') startNet(); });
window.addEventListener('online', () => net && net.wake());

// ---------- instalação PWA ----------
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (isIOS && !standalone) $('#install-card').hidden = false;
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e;
  $('#install-card').hidden = false; $('#install-btn').hidden = false;
  $('#install-text').textContent = 'Jogue em tela cheia, como um app.';
});
$('#install-btn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#install-card').hidden = true; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

// ======================================================================
// INICIALIZAÇÃO (restaura a partida após recarregar a página)
// ======================================================================
let pendingJoin = null;
(function init() {
  const params = new URLSearchParams(location.search);
  const room = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const from = (params.get('de') || '').slice(0, 18);
  let saved = read(sessionStorage, LS_SESSION);
  if (!saved) {
    const b = read(localStorage, LS_BACKUP);
    if (b && b.S && (b.tab === TAB_ID || Date.now() - b.beat > 6000)) saved = b.S;
  }
  if (room && !(saved && saved.mode === 'online' && saved.room === room)) {
    pendingJoin = { room, from };
    $('#join-title').textContent = from ? `${from} te desafiou!` : 'Você foi desafiado!';
    $('#join-sub').textContent = 'Escolha seu nome e entre na sala para começar a partida.';
    $('#name-guest').value = prefs.name || '';
    if (saved) S = null;
    showScreen('home', true);
    setTimeout(() => openSheet('sheet-join'), 350);
    return;
  }
  if (room) history.replaceState(null, '', location.pathname);
  if (saved && saved.game) {
    S = saved;
    S.hist = S.hist || []; S.chat = S.chat || []; S.rematch = S.rematch || { me: false, opp: false };
    save();
    openGame(true);
    if (S.mode === 'online') startNet();
    if (S.game.winner != null) gameOver(false);
    else if (S.mode === 'ai' && S.game.turn !== S.myColor) setTimeout(aiThink, 500);
  }
})();
