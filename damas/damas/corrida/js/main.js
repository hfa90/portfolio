import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRACKS, trackById, sampleTrack } from './tracks.js';
import { createCar, stepCar, botInput, collide, progress, MAX_SPEED } from './physics.js';
import { createWorld, createCarMesh, nameTag, Smoke } from './world.js';
import { sfx, startEngine, stopEngine, updateEngine, setSound } from './audio.js';
import { Room } from './net.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const read = (st, k) => { try { return JSON.parse(st.getItem(k)); } catch (_) { return null; } };
const write = (st, k, v) => { try { v == null ? st.removeItem(k) : st.setItem(k, JSON.stringify(v)); } catch (_) {} };
const rid = (n = 6) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 32) | 0]).join('');
const fmt = (s) => { if (!(s >= 0)) return '—'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const COLORS = ['#ff3b30', '#0a84ff', '#ffd60a', '#30d158', '#bf5af2', '#ff9f0a', '#64d2ff', '#f2f2f7'];
const BOT_NAMES = ['Faísca', 'Nitro', 'Relâmpago', 'Turbo', 'Cometa'];
const LEVEL_SKILL = { facil: 0.86, medio: 0.96, dificil: 1.04 };

// ---------------------------------------------------------------- preferências
const LS_PREFS = 'corrida.prefs.v1', SS_SESSION = 'corrida.session.v1';
const damasPrefs = read(localStorage, 'damas.prefs.v1') || {};
let prefs = Object.assign({ name: damasPrefs.name || '', color: COLORS[0], laps: '3', level: 'medio', controls: 'buttons', autoGas: true, sound: damasPrefs.sound !== false, haptic: damasPrefs.haptic !== false, track: 'praia' }, read(localStorage, LS_PREFS) || {});
const savePrefs = () => write(localStorage, LS_PREFS, prefs);
setSound(prefs.sound);

let S = read(sessionStorage, SS_SESSION); // sessão (sobrevive ao recarregar)
const save = () => write(sessionStorage, SS_SESSION, S);

// ---------------------------------------------------------------- gestos (app nativo)
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !(e.target.closest && e.target.closest('.scrollable, .scrollable-x'))) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
const appEl = $('#app');
appEl.addEventListener('scroll', () => { appEl.scrollTop = 0; appEl.scrollLeft = 0; });

let hapticLabel = $('#haptic-label');
function haptic(kind = 'light') {
  if (!prefs.haptic) return;
  if (navigator.vibrate) { navigator.vibrate(kind === 'heavy' ? 22 : kind === 'success' ? [10, 40, 20] : kind === 'error' ? [12, 50, 12] : 8); return; }
  try { hapticLabel.click(); if (kind === 'heavy' || kind === 'success') setTimeout(() => hapticLabel.click(), 70); } catch (_) {}
}

// ---------------------------------------------------------------- ilustrações
function trackArt(def) {
  const th = def.theme, t = sampleTrack(def);
  const b = t.bounds, w = b.maxX - b.minX, h = b.maxZ - b.minZ, sc = Math.min(120 / w, 84 / h);
  let d = '';
  for (let i = 0; i <= t.N; i += 4) { const k = i % t.N; d += (i ? 'L' : 'M') + (186 + (t.px[k] - b.minX) * sc).toFixed(1) + ' ' + (14 + (t.pz[k] - b.minZ) * sc).toFixed(1); }
  d += 'Z';
  const id = 'g' + def.id;
  let scene = '';
  if (def.id === 'praia') scene = `<circle cx="70" cy="122" r="34" fill="#ffe3a3" opacity=".95"/><rect y="132" width="320" height="30" fill="#2c84b8"/><rect y="132" width="320" height="3" fill="#fff" opacity=".6"/><path d="M0 160 Q160 146 320 162 V200 H0Z" fill="#e8c48a"/>${[30, 250, 290].map((x, i) => `<g transform="translate(${x} ${168 - i * 4})" fill="#1d3b2a"><path d="M0 0 Q4 -30 -2 -58" stroke="#3b2a1e" stroke-width="4" fill="none"/><path d="M-2 -58 q-26 0 -34 14 q14 -10 34 -10z M-2 -58 q26 -2 34 14 q-14 -10 -34 -10z M-2 -58 q-10 -16 -28 -14 q14 4 28 16z M-2 -58 q14 -18 30 -12 q-16 4 -30 14z"/></g>`).join('')}`;
  if (def.id === 'cidade') { let bl = ''; for (let i = 0; i < 14; i++) { const x = i * 24 - 4, hh = 50 + ((i * 37) % 70); bl += `<rect x="${x}" y="${170 - hh}" width="22" height="${hh}" fill="#141029"/>`; for (let y = 176 - hh; y < 160; y += 9) for (let k = 0; k < 3; k++) if ((i + y + k) % 3) bl += `<rect x="${x + 3 + k * 6}" y="${y}" width="3" height="4" fill="${['#ffd98a', '#9fe6ff', '#ff9fe8'][(i + k) % 3]}" opacity=".85"/>`; } scene = `${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 73) % 320}" cy="${(i * 29) % 90}" r="${i % 3 ? 0.8 : 1.3}" fill="#fff" opacity=".7"/>`).join('')}<circle cx="60" cy="40" r="14" fill="#e7ecff" opacity=".9"/>${bl}<rect y="166" width="320" height="34" fill="#0c0a18"/><rect y="166" width="320" height="2" fill="#ff2fd6"/><rect y="176" width="320" height="2" fill="#20e8ff" opacity=".8"/>`; }
  if (def.id === 'neve') scene = `<path d="M-10 170 L60 70 L95 110 L150 40 L215 120 L250 85 L330 170Z" fill="#c9d6e6"/><path d="M60 70 L45 92 L60 88 L72 96Z M150 40 L130 70 L150 64 L165 72Z M250 85 L238 100 L252 98Z" fill="#fff"/><path d="M0 160 Q160 140 320 158 V200 H0Z" fill="#f4f8fc"/>${[20, 48, 270, 300].map((x, i) => `<path transform="translate(${x} ${172 - (i % 2) * 6})" d="M0 0 L-12 0 L0 -40 L12 0Z" fill="#1f5a3e"/>`).join('')}`;
  if (def.id === 'deserto') scene = `<circle cx="250" cy="110" r="30" fill="#ffe7b8" opacity=".9"/><path d="M-10 165 V120 h18 l6 -8 h46 l8 12 V165Z M200 165 V100 l10 -6 h40 l6 10 V165Z" fill="#b5582b"/><path d="M0 158 Q160 150 320 160 V200 H0Z" fill="#d79257"/>${[120, 160].map((x) => `<g transform="translate(${x} 170)" fill="#3f7a35"><rect x="-4" y="-40" width="8" height="40" rx="4"/><rect x="4" y="-30" width="10" height="5" rx="2.5"/><rect x="10" y="-40" width="5" height="14" rx="2.5"/><rect x="-14" y="-24" width="10" height="5" rx="2.5"/><rect x="-14" y="-34" width="5" height="14" rx="2.5"/></g>`).join('')}`;
  return `<svg class="art" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${th.skyTop}"/><stop offset=".55" stop-color="${th.skyMid}"/><stop offset="1" stop-color="${th.skyBottom}"/></linearGradient></defs><rect width="320" height="200" fill="url(#${id})"/>${scene}<rect width="320" height="200" fill="url(#shade)" opacity="0"/><path d="${d}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="7" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`;
}
function carSVG(color) {
  return `<svg viewBox="0 0 120 70"><path d="M8 46 L8 38 Q10 33 22 31 L40 29 L54 17 Q58 14 66 14 L84 14 Q92 14 98 24 L104 30 Q114 32 114 40 L114 46Z" fill="${color}"/><path d="M8 46 L8 38 Q10 33 22 31 L40 29 L54 17 Q58 14 66 14 L84 14 Q92 14 98 24 L104 30 Q114 32 114 40 L114 46Z" fill="url(#cs)"/><defs><linearGradient id="cs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs><path d="M57 19 Q60 17 66 17 L80 17 L80 29 L46 29Z M84 17 Q90 17 95 25 L98 29 L84 29Z" fill="#0d1520"/><rect x="104" y="35" width="8" height="4" rx="2" fill="#fff6c8"/><rect x="8" y="35" width="6" height="4" rx="2" fill="#ff2a2a"/><path d="M4 26 h16 v3 h-16z" fill="${color}"/><circle cx="30" cy="48" r="10" fill="#111"/><circle cx="30" cy="48" r="5.5" fill="#c8ccd2"/><circle cx="92" cy="48" r="10" fill="#111"/><circle cx="92" cy="48" r="5.5" fill="#c8ccd2"/></svg>`;
}

function buildTrackCards(container, selected, onPick, readonly = false) {
  container.innerHTML = '';
  container.classList.toggle('readonly', readonly);
  TRACKS.forEach((def) => {
    const t = sampleTrack(def);
    const b = document.createElement('button');
    b.className = 'track-card' + (def.id === selected ? ' on' : '');
    b.dataset.id = def.id;
    b.innerHTML = trackArt(def) + `<span class="tc-len">${(t.length / 1000).toFixed(1)} km</span><span class="tc-check"><svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg></span><div class="tc-text"><b>${def.name}</b><small>${def.sub}</small></div>`;
    b.addEventListener('click', () => {
      if (readonly) return;
      $$('.track-card', container).forEach((x) => x.classList.toggle('on', x === b));
      haptic('light'); sfx.tap();
      onPick(def.id);
    });
    container.appendChild(b);
  });
  requestAnimationFrame(() => { const on = $('.track-card.on', container); if (on) container.scrollLeft = on.offsetLeft - (container.clientWidth - on.offsetWidth) / 2; });
}
function buildSwatches(container, selected, onPick, taken = []) {
  container.innerHTML = '';
  COLORS.forEach((c) => {
    const s = document.createElement('button');
    s.className = 'swatch' + (c === selected ? ' on' : '') + (taken.includes(c) && c !== selected ? ' taken' : '');
    s.style.background = c;
    s.addEventListener('click', () => { $$('.swatch', container).forEach((x) => x.classList.toggle('on', x === s)); haptic('light'); onPick(c); });
    container.appendChild(s);
  });
}

// ---------------------------------------------------------------- navegação
const SCREENS = ['scr-menu', 'scr-lobby', 'scr-race'];
function show(id, instant) {
  const k = SCREENS.indexOf(id);
  SCREENS.forEach((s, i) => {
    const el = $('#' + s);
    el.classList.toggle('instant', !!instant);
    el.classList.toggle('active', i === k);
    el.classList.toggle('behind', i < k);
  });
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => SCREENS.forEach((s) => $('#' + s).classList.remove('instant'))));
}

// ---------------------------------------------------------------- sheets / alertas / toast
const backdrop = $('#backdrop');
function openSheet(id) { closeSheets(true); backdrop.classList.add('show'); $('#' + id).classList.add('show'); }
function closeSheets(keep) {
  $$('.sheet.show, .action-sheet.show').forEach((s) => s.classList.remove('show'));
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (!keep) backdrop.classList.remove('show');
  if (!keep && race && race.paused && S && S.mode === 'solo') race.resume();
}
backdrop.addEventListener('click', () => closeSheets());
function actions(list, cancelLabel = 'Continuar') {
  const g = $('#as-group'); g.innerHTML = '';
  list.forEach((a) => { const b = document.createElement('button'); b.textContent = a.label; if (a.danger) b.className = 'danger'; b.onclick = () => { $('#action-sheet').classList.remove('show'); backdrop.classList.remove('show'); setTimeout(a.fn, 180); }; g.appendChild(b); });
  $('.as-cancel').textContent = cancelLabel;
  closeSheets(true); backdrop.classList.add('show'); $('#action-sheet').classList.add('show');
}
function alertBox(title, msg, buttons) {
  $('#alert-title').textContent = title; $('#alert-msg').textContent = msg;
  const box = $('#alert-actions'); box.innerHTML = '';
  buttons.forEach((b) => { const el = document.createElement('button'); el.textContent = b.label; el.className = b.style || ''; el.onclick = () => { $('#alert').classList.remove('show'); backdrop.classList.remove('show'); b.fn && setTimeout(b.fn, 120); }; box.appendChild(el); });
  backdrop.classList.add('show'); $('#alert').classList.add('show'); haptic('light');
}
let toastT = null;
function toast(text, icon = '🏁', ms = 2400) {
  const is = $('#island'); $('#island-text').textContent = text; $('#island-icon').textContent = icon;
  is.classList.remove('show'); void is.offsetWidth; is.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => is.classList.remove('show'), ms);
}

// ================================================================ MENU
function initMenu() {
  buildTrackCards($('#tracks-menu'), prefs.track, (id) => { prefs.track = id; savePrefs(); });
  const prev = () => ($('#car-preview').innerHTML = carSVG(prefs.color));
  prev();
  buildSwatches($('#swatches'), prefs.color, (c) => { prefs.color = c; savePrefs(); prev(); });
  $('#pname').value = prefs.name;
  $('#pname').addEventListener('input', (e) => { prefs.name = e.target.value.trim(); savePrefs(); });
  $$('[data-pref]').forEach((seg) => {
    const k = seg.dataset.pref;
    $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.value === String(prefs[k])));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      prefs[k] = b.dataset.value; savePrefs(); haptic('light');
      if (k === 'controls' && b.dataset.value === 'tilt') askTilt();
    });
  });
  $$('[data-pref-bool]').forEach((sw) => {
    const k = sw.dataset.prefBool; sw.checked = !!prefs[k];
    sw.addEventListener('change', () => { prefs[k] = sw.checked; savePrefs(); if (k === 'sound') setSound(sw.checked); haptic('light'); });
  });
}
const myName = () => prefs.name || 'Piloto';

// ================================================================ RENDERIZADOR
let renderer = null, envMap = null;
function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 2 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('#view').appendChild(renderer.domElement);
  const pm = new THREE.PMREMGenerator(renderer);
  envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  return renderer;
}

// ================================================================ ENTRADA
const keys = new Set();
let usingKeys = false;
const ctl = { left: false, right: false, gas: false, brake: false, drift: false };
let tiltVal = 0, tiltZero = 0, tiltOK = false;
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input')) return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'shift'].includes(k)) { e.preventDefault(); usingKeys = true; keys.add(k); }
  if (k === 'escape' || k === 'p') race && ACT.pause();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function readInput() {
  let steer = 0;
  if (keys.has('arrowleft') || keys.has('a')) steer -= 1;
  if (keys.has('arrowright') || keys.has('d')) steer += 1;
  if (prefs.controls === 'tilt' && tiltOK && !usingKeys) steer = Math.max(-1, Math.min(1, (tiltVal - tiltZero) / 20));
  else { if (ctl.left) steer -= 1; if (ctl.right) steer += 1; steer = Math.max(-1, Math.min(1, steer)); }
  const kGas = keys.has('arrowup') || keys.has('w');
  const kBrake = keys.has('arrowdown') || keys.has('s');
  const drift = keys.has(' ') || keys.has('shift') || ctl.drift;
  const brake = kBrake || ctl.brake;
  let gas = kGas || ctl.gas;
  if (!usingKeys && prefs.autoGas && !brake) gas = true;
  return { steer, gas: gas ? 1 : 0, brake: brake ? 1 : 0, drift, analog: prefs.controls === 'tilt' && !usingKeys };
}
// volante (área com esquerda/direita, permite deslizar o dedo)
(function steerPad() {
  const pad = $('#steer-pad');
  const ptrs = new Map();
  const upd = () => {
    const r = pad.getBoundingClientRect();
    let l = false, rr = false;
    for (const x of ptrs.values()) { if (x < r.left + r.width / 2) l = true; else rr = true; }
    if (l !== ctl.left || rr !== ctl.right) haptic('light');
    ctl.left = l; ctl.right = rr;
    $('.sbtn.left', pad).classList.toggle('on', l); $('.sbtn.right', pad).classList.toggle('on', rr);
  };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e.clientX); upd(); });
  pad.addEventListener('pointermove', (e) => { if (ptrs.has(e.pointerId)) { ptrs.set(e.pointerId, e.clientX); upd(); } });
  const end = (e) => { ptrs.delete(e.pointerId); upd(); };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  $$('.pedal').forEach((p) => {
    const k = p.dataset.ctl;
    p.addEventListener('pointerdown', (e) => { p.setPointerCapture(e.pointerId); ctl[k] = true; p.classList.add('on'); haptic('light'); });
    const off = () => { ctl[k] = false; p.classList.remove('on'); };
    p.addEventListener('pointerup', off); p.addEventListener('pointercancel', off); p.addEventListener('lostpointercapture', off);
  });
})();
function onTilt(e) {
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let v = e.gamma || 0;
  if (ang === 90) v = e.beta || 0; else if (ang === -90 || ang === 270) v = -(e.beta || 0);
  tiltVal = v; tiltOK = true;
}
async function askTilt() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { toast('Permissão de movimento negada — usando botões', '⚠️'); prefs.controls = 'buttons'; savePrefs(); $$('[data-pref="controls"] button').forEach((b) => b.classList.toggle('on', b.dataset.value === 'buttons')); return; }
    }
    addEventListener('deviceorientation', onTilt);
  } catch (_) {}
}
if (prefs.controls === 'tilt' && !(typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)) addEventListener('deviceorientation', onTilt);

// ================================================================ CORRIDA
let race = null;
const packState = (c, braking) => [
  Math.round(c.x * 100) / 100, Math.round(c.z * 100) / 100, Math.round(c.h * 1000) / 1000, Math.round(c.speed * 100) / 100,
  Math.round((c.steer || 0) * 100) / 100, c.lap, c.idx,
  (c.boost > 0 ? 1 : 0) | (c.drifting ? 2 : 0) | (braking ? 4 : 0) | (c.finished ? 8 : 0),
  Math.round((c.finishTime || 0) * 1000) / 1000, Math.round((c.bestLap || 0) * 1000) / 1000, c.driftDir || 0,
];
const SAVE_KEYS = ['x', 'z', 'h', 'vx', 'vz', 'speed', 'idx', 'lap', 'half', 'boost', 'finished', 'finishTime', 'bestLap', 'lastLap', 'lapStart'];

class Race {
  constructor(cfg) {
    // cfg: { id, track, laps, entries, myPid, role:'solo'|'host'|'guest', goAt, restore, level }
    this.cfg = cfg;
    this.t = sampleTrack(trackById(cfg.track));
    this.laps = cfg.laps;
    this.goAt = cfg.goAt;
    this.paused = false;
    this.finishedShown = false;
    this.lastSend = 0; this.lastSave = 0; this.lastHud = 0;
    this.shake = 0;
    this.camH = null;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.prevLights = performance.now() > cfg.goAt ? 0 : -1;
    this.wrongShown = false;
    const r = getRenderer();
    const w = createWorld(this.t);
    this.world = w; this.scene = w.scene;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 4000);
    this.smoke = new Smoke(this.scene, this.t.def.theme.smoke);
    this.cars = cfg.entries.map((e, slot) => {
      const st = createCar(this.t, slot, { lane: e.lane || 0 });
      const mesh = createCarMesh(e.color, envMap);
      this.scene.add(mesh.group);
      const local = e.pid === cfg.myPid;
      const sim = local || (e.bot && cfg.role !== 'guest');
      let tag = null;
      if (!local) { tag = nameTag(e.name, e.color); mesh.group.add(tag); }
      return { e, st, mesh, tag, local, sim, net: null, braking: false, off: false };
    });
    this.me = this.cars.find((c) => c.local);
    if (cfg.restore && cfg.restore.id === cfg.id) {
      for (const c of this.cars) { const s = cfg.restore.cars && cfg.restore.cars[c.e.pid]; if (s && c.sim) Object.assign(c.st, s); }
    }
    this.buildMinimap();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.resize();
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    startEngine();
    // UI
    $('#controls').classList.toggle('hidden', !isTouch);
    $('#controls').classList.toggle('tilt', prefs.controls === 'tilt');
    $('#controls').classList.toggle('auto-gas', !!prefs.autoGas);
    $('#results').classList.remove('show');
    $('#hud-pos-of').textContent = `º/${this.cars.length}`;
    if (isTouch && innerHeight > innerWidth) { const rt = $('#rotate-tip'); rt.classList.remove('show'); void rt.offsetWidth; rt.classList.add('show'); }
    tiltZero = 0;
  }
  get time() { return ((this.paused ? this.pausedAt : performance.now()) - this.goAt) / 1000; }
  resize() {
    const v = $('#view'); const w = v.clientWidth || innerWidth, h = v.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.portrait = h > w;
  }
  pause() { if (this.paused) return; this.paused = true; this.pausedAt = performance.now(); stopEngine(); }
  resume() { if (!this.paused) return; this.goAt += performance.now() - this.pausedAt; this.paused = false; this.last = performance.now(); startEngine(); }
  destroy() {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    stopEngine();
    this.scene.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
    renderer.renderLists.dispose();
    $('#lights').className = 'lights';
    $('#banner').className = 'banner';
    $('#speedlines').style.opacity = 0;
  }
  remoteState(pid, a) {
    const c = this.cars.find((x) => x.e.pid === pid);
    if (!c || c.sim) return;
    const first = !c.net;
    c.net = { x: a[0], z: a[1], h: a[2], speed: a[3], steer: a[4], at: performance.now() };
    c.off = false;
    const st = c.st;
    st.lap = a[5]; st.idx = a[6];
    st.boost = a[7] & 1 ? 1 : 0; st.drifting = !!(a[7] & 2); c.braking = !!(a[7] & 4);
    if (a[7] & 8) { st.finished = true; st.finishTime = a[8]; }
    st.bestLap = a[9] || 0; st.driftDir = a[10] || 0;
    if (first) { st.x = a[0]; st.z = a[1]; st.h = a[2]; }
  }
  standings() {
    const t = this.t;
    return [...this.cars].sort((a, b) => {
      if (a.st.finished && b.st.finished) return a.st.finishTime - b.st.finishTime;
      return progress(b.st, t) - progress(a.st, t);
    });
  }
  buildMinimap() {
    const t = this.t, b = t.bounds, cv = $('#minimap'), W = cv.width;
    const sc = (W - 30) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const ox = (W - (b.maxX - b.minX) * sc) / 2, oz = (W - (b.maxZ - b.minZ) * sc) / 2;
    this.mm = { sc, ox, oz, b, ctx: cv.getContext('2d') };
    const off = document.createElement('canvas'); off.width = off.height = W;
    const g = off.getContext('2d');
    g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i <= t.N; i++) { const k = i % t.N; const x = ox + (t.px[k] - b.minX) * sc, y = oz + (t.pz[k] - b.minZ) * sc; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 6; g.stroke();
    const sx = ox + (t.px[0] - b.minX) * sc, sy = oz + (t.pz[0] - b.minZ) * sc;
    g.fillStyle = '#ffd60a'; g.fillRect(sx - 6, sy - 6, 12, 12);
    this.mm.bg = off;
  }
  drawMinimap() {
    const { ctx, bg, sc, ox, oz, b } = this.mm;
    ctx.clearRect(0, 0, bg.width, bg.height);
    ctx.drawImage(bg, 0, 0);
    for (const c of [...this.cars].sort((a) => (a.local ? 1 : -1))) {
      const x = ox + (c.st.x - b.minX) * sc, y = oz + (c.st.z - b.minZ) * sc;
      ctx.beginPath(); ctx.arc(x, y, c.local ? 11 : 8, 0, 7);
      ctx.fillStyle = c.e.color; ctx.fill();
      ctx.lineWidth = c.local ? 4 : 2.5; ctx.strokeStyle = c.local ? '#fff' : 'rgba(0,0,0,.6)'; ctx.stroke();
    }
  }
  banner(text, cls = '', ms = 1400) {
    const b = $('#banner'); b.textContent = text; b.className = 'banner ' + cls;
    void b.offsetWidth; b.classList.add('show');
    clearTimeout(this.bannerT); if (ms) this.bannerT = setTimeout(() => b.classList.remove('show'), ms);
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    let dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (this.paused) dt = 0;
    const T = this.time;
    const t = this.t;
    // ---- contagem regressiva
    if (T < 0) {
      const n = Math.ceil(-T);
      const L = $('#lights');
      if (T > -3.6) L.classList.add('show');
      if (n <= 3 && n !== this.prevLights) {
        this.prevLights = n;
        $$('i', L).forEach((el, k) => el.classList.toggle('on', k < 4 - n));
        sfx.beep(); haptic('light');
      }
    } else if (this.prevLights !== 0) {
      this.prevLights = 0;
      const L = $('#lights'); L.classList.add('go', 'show');
      sfx.go(); haptic('heavy');
      setTimeout(() => L.classList.remove('show'), 900);
      setTimeout(() => (L.className = 'lights'), 1300);
      if (prefs.controls === 'tilt') tiltZero = tiltVal;
    }
    // ---- física (sub-passos)
    const running = T >= 0 && dt > 0;
    const me = this.me.st;
    const inp = readInput();
    if (running) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
      const human = this.cars.filter((c) => !c.e.bot);
      const leadHuman = Math.max(...human.map((c) => progress(c.st, t)));
      for (let s = 0; s < steps; s++) {
        const tt = T - dt + h * (s + 1);
        for (const c of this.cars) {
          if (!c.sim) continue;
          let input;
          if (c.local && !c.st.finished) input = inp;
          else {
            const p = progress(c.st, t);
            let skill = c.e.skill || 0.95;
            if (c.e.bot) { if (p > leadHuman + 50) skill *= 0.93; else if (p < leadHuman - 70) skill *= 1.07; }
            c.st.lane = (c.e.lane || 0) + Math.sin(tt * 0.3 + c.e.lane) * 2.5;
            input = botInput(c.st, t, c.local ? 0.9 : skill);
          }
          c.braking = input.brake > 0 && c.st.speed > 2;
          stepCar(c.st, input, t, h, tt);
          // eventos
          for (const ev of c.st.events) this.onEvent(c, ev, tt);
          if (!c.st.finished && c.st.lap > this.laps) {
            c.st.finished = true; c.st.finishTime = tt;
            if (c.local) this.onFinish();
          }
        }
        // colisões
        for (let a = 0; a < this.cars.length; a++) for (let b = a + 1; b < this.cars.length; b++) {
          const A = this.cars[a], B = this.cars[b];
          if (A.sim && B.sim) collide(A.st, B.st, true);
          else if (A.sim) collide(A.st, B.st, false);
          else if (B.sim) collide(B.st, A.st, false);
        }
        for (const c of this.cars) if (c.local) for (const ev of c.st.events) if (ev === 'bump') this.onEvent(c, 'bump', tt);
      }
    }
    // ---- carros remotos (interpolação)
    for (const c of this.cars) {
      if (c.sim || !c.net) continue;
      const age = Math.min(0.3, (now - c.net.at) / 1000);
      const px = c.net.x + Math.sin(c.net.h) * c.net.speed * age, pz = c.net.z + Math.cos(c.net.h) * c.net.speed * age;
      const st = c.st;
      if (Math.hypot(px - st.x, pz - st.z) > 18) { st.x = px; st.z = pz; st.h = c.net.h; }
      const k = Math.min(1, 12 * dt);
      st.x += (px - st.x) * k; st.z += (pz - st.z) * k;
      let dh = c.net.h - st.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      st.h += dh * k; st.speed = c.net.speed; st.steer = c.net.steer;
      c.off = now - c.net.at > 4000;
    }
    // ---- visual dos carros + fumaça
    for (const c of this.cars) {
      c.mesh.update(c.st, dt, c.braking);
      const st = c.st, sp = Math.abs(st.speed);
      const smoky = (st.drifting && sp > 10) || (st.slip > 5 && sp > 12) || (st.offroad && sp > 10);
      if (smoky && dt > 0 && Math.random() < 0.85) {
        const fx = Math.sin(st.h), fz = Math.cos(st.h);
        for (const side of [1, -1]) this.smoke.emit(st.x - fx * 1.5 + fz * 0.95 * side, 0.35, st.z - fz * 1.5 - fx * 0.95 * side, -st.vx * 0.1 || 0, -st.vz * 0.1 || 0, st.offroad ? 1.4 : 1, st.offroad ? 0.7 : 1.0, st.offroad ? 0.5 : 0.45);
      }
      if (c.tag) c.tag.material.opacity = c.off ? 0.4 : 1;
    }
    this.smoke.update(dt);

    // ---- câmera
    this.updateCamera(dt, T);
    this.world.update(dt, this.camera.position, this.me.mesh.group.position);
    renderer.render(this.scene, this.camera);

    // ---- áudio
    updateEngine(me.speed, T < 0 ? (inp.gas ? 1 : 0) : inp.gas, me.slip || 0, me.boost > 0);
    if (T < 0 && inp.gas) { /* ronco na largada */ }

    // ---- HUD (limitado)
    if (now - this.lastHud > 60) { this.lastHud = now; this.hud(T); this.drawMinimap(); }
    $('#speedlines').style.opacity = me.boost > 0 ? 0.9 : Math.max(0, (Math.abs(me.speed) - 46) / 14) * 0.45;

    // ---- rede
    if (now - this.lastSend > 66 && this.cfg.role !== 'solo') { this.lastSend = now; netTick(this); }
    // ---- salvar para sobreviver ao recarregar
    if (now - this.lastSave > 1000) { this.lastSave = now; this.persist(); }
    // ---- desempenho adaptativo
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 2.5) {
      const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
      const pr = renderer.getPixelRatio();
      if (fps < 45 && pr > 1) { renderer.setPixelRatio(Math.max(1, pr - 0.25)); this.resize(); }
    }
  }
  updateCamera(dt, T) {
    const st = this.me.st, cam = this.camera;
    if (this.camH == null) this.camH = st.h;
    const velH = Math.hypot(st.vx, st.vz) > 3 ? Math.atan2(st.vx, st.vz) : st.h;
    let target = st.drifting ? velH * 0.5 + st.h * 0.5 : st.h;
    if (Math.abs(target - st.h) > Math.PI) target = st.h;
    let dh = target - this.camH; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    this.camH += dh * Math.min(1, 5 * dt);
    const portrait = this.portrait;
    const spd = Math.abs(st.speed) / MAX_SPEED;
    let dist = (portrait ? 10.5 : 8.2) + spd * 1.6, height = (portrait ? 4.4 : 3.3) + spd * 0.4, ang = this.camH;
    if (T < 0) { const k = Math.max(0, Math.min(1, (T + 4.2) / 4)); const e = 1 - Math.pow(1 - k, 3); ang = this.camH + Math.PI * (1 - e) * 1.15; dist += (1 - e) * 7; height += (1 - e) * 4; }
    const px = st.x - Math.sin(ang) * dist, pz = st.z - Math.cos(ang) * dist;
    const k = T < 0 ? 1 : Math.min(1, 7 * dt);
    if (!this.camInit) { cam.position.set(px, height, pz); this.camInit = true; }
    cam.position.x += (px - cam.position.x) * k;
    cam.position.z += (pz - cam.position.z) * k;
    cam.position.y += (height - cam.position.y) * k;
    if (this.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake * 0.6; this.shake = Math.max(0, this.shake - dt * 2.2); }
    const la = portrait ? 9 : 5, ly = portrait ? 2.3 : 1.3;
    const look = new THREE.Vector3(st.x + Math.sin(st.h) * la, ly, st.z + Math.cos(st.h) * la);
    cam.lookAt(look);
    const fov = (portrait ? 70 : 60) + spd * 12 + (st.boost > 0 ? 8 : 0);
    cam.fov += (fov - cam.fov) * Math.min(1, 4 * dt);
    cam.updateProjectionMatrix();
  }
  onEvent(c, ev, tt) {
    if (!c.local) return;
    const st = c.st;
    if (ev === 'wall') { sfx.wall(st.wallHit); haptic('heavy'); this.shake = Math.max(this.shake, 0.25 + st.wallHit * 0.6); }
    else if (ev === 'bump') { sfx.bump(); haptic('light'); this.shake = Math.max(this.shake, 0.25); }
    else if (ev === 'boost') { sfx.boost(); haptic('success'); this.banner('TURBO!', 'blue', 900); }
    else if (ev === 'miniboost') { sfx.boost(); haptic('success'); this.banner(st.boost > 1 ? 'SUPER DRIFT!' : 'DRIFT TURBO!', 'blue', 900); }
    else if (ev === 'lap') {
      if (st.lap >= 2 && st.lap <= this.laps) {
        sfx.lap(); haptic('success');
        const d = $('#hud-delta'); d.textContent = 'Volta ' + fmt(st.lastLap) + (st.lastLap === st.bestLap ? ' · recorde' : ''); d.style.color = st.lastLap === st.bestLap ? '#30d158' : '#fff';
        setTimeout(() => (d.textContent = ''), 3500);
      }
      if (st.lap === this.laps && this.laps > 1) { sfx.final(); this.banner('VOLTA FINAL!', 'gold', 1800); }
    }
  }
  onFinish() {
    sfx.finish(); haptic('success');
    const pos = this.standings().indexOf(this.me) + 1;
    this.banner(pos === 1 ? 'VITÓRIA!' : `${pos}º LUGAR`, 'gold', 2200);
    setTimeout(() => { if (race === this) showResults(this); }, 1800);
  }
  hud(T) {
    const st = this.me.st;
    const order = this.standings();
    const pos = order.indexOf(this.me) + 1;
    const pe = $('#hud-pos'); if (pe.textContent !== String(pos)) { pe.textContent = pos; pe.parentElement.classList.toggle('p1', pos === 1); }
    $('#hud-lap').textContent = `${Math.min(this.laps, Math.max(1, st.lap))}/${this.laps}`;
    $('#hud-time').textContent = fmt(Math.max(0, st.finished ? st.finishTime : T));
    $('#hud-speed').textContent = Math.round(Math.abs(st.speed) * 3.6);
    const dm = $('#hud-drift'); const ch = st.drifting ? Math.min(1, st.driftCharge / 2.2) : 0; dm.style.width = ch * 100 + '%'; dm.classList.toggle('full', ch > 0.32);
    const key = order.map((c) => c.e.pid + (c.st.finished ? 'f' : '') + (c.off ? 'o' : '')).join();
    if (key !== this.stKey) {
      this.stKey = key;
      $('#standings').innerHTML = order.map((c, i) => `<div class="${c.local ? 'me' : ''}"><i style="background:${c.e.color}">${i + 1}</i>${esc(c.e.name)}${c.st.finished ? '<em>🏁</em>' : c.off ? '<em>⚠︎</em>' : ''}</div>`).join('');
    }
    // contramão
    if (st.wrong > 1.2 && !st.finished) { if (!this.wrongShown) { this.wrongShown = true; this.banner('CONTRAMÃO!', 'warn', 0); haptic('error'); } }
    else if (this.wrongShown) { this.wrongShown = false; $('#banner').classList.remove('show'); }
    if ($('#results').classList.contains('show')) renderResults(this);
  }
  persist() {
    if (!S) return;
    const cars = {};
    for (const c of this.cars) if (c.sim) { const o = {}; SAVE_KEYS.forEach((k) => (o[k] = c.st[k])); cars[c.e.pid] = o; }
    S.raceSave = { id: this.cfg.id, elapsed: this.time, cars };
    save();
  }
}

// ---------------------------------------------------------------- resultados
function showResults(r) {
  $('#results').classList.add('show');
  renderResults(r, true);
  const pos = r.standings().indexOf(r.me) + 1;
  const m = $('#res-medal');
  m.className = 'res-medal ' + (pos === 1 ? '' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : 'none');
  m.textContent = ['🏆', '🥈', '🥉', '🏁'][Math.min(3, pos - 1)];
  $('#res-title').textContent = pos === 1 ? 'Vitória!' : `${pos}º lugar`;
  $('#res-sub').textContent = `${trackById(r.cfg.track).name} · ${r.laps} voltas · melhor volta ${fmt(r.me.st.bestLap)}`;
  if (pos === 1) confetti();
  const a = $('#res-actions'); a.innerHTML = '';
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn big ' + cls; b.textContent = label; b.onclick = () => { haptic('light'); fn(); }; a.appendChild(b); };
  if (r.cfg.role === 'solo') { btn('Correr de novo', 'primary', () => startSolo()); btn('Menu', '', () => exitToMenu()); }
  else if (r.cfg.role === 'host') { btn('Voltar à sala', 'primary', () => hostBackToLobby()); btn('Encerrar sala', '', () => leaveRoom()); }
  else { a.insertAdjacentHTML('beforeend', '<div class="res-wait">Aguardando o anfitrião iniciar a próxima corrida…</div>'); btn('Sair da sala', '', () => leaveRoom()); }
}
function renderResults(r, first) {
  const order = r.standings();
  const win = order[0].st.finished ? order[0].st.finishTime : null;
  const html = order.map((c, i) => {
    const st = c.st;
    let tm = '';
    if (st.finished) tm = i === 0 ? fmt(st.finishTime) : '+' + (st.finishTime - win).toFixed(2) + 's';
    else tm = c.off ? 'Desconectado' : `Volta ${Math.max(1, Math.min(r.laps, st.lap))}/${r.laps}`;
    return `<div class="res-row ${c.local ? 'me' : ''}" style="${first ? `animation-delay:${i * 70}ms` : 'animation:none'}"><span class="rp">${i + 1}</span><span class="rc" style="background:${c.e.color}"></span><span class="rn">${esc(c.e.name)}<small>${c.e.bot ? 'Máquina' : c.local ? 'Você' : 'Online'}</small></span><span class="rt">${tm}<small>${st.bestLap ? 'melhor ' + fmt(st.bestLap) : ''}</small></span></div>`;
  }).join('');
  const list = $('#res-list');
  if (list.dataset.h !== html) { list.innerHTML = html; list.dataset.h = html; }
}
function confetti() {
  const cv = $('#confetti'), c = cv.getContext('2d'), dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ['#ffd60a', '#ff9f0a', '#30d158', '#0a84ff', '#ff375f', '#bf5af2', '#fff'];
  const P = Array.from({ length: 160 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.3, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, col: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  (function f(t) { c.clearRect(0, 0, innerWidth, innerHeight); P.forEach((p) => { p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.r += p.vr; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore(); }); if (t - t0 < 3200) requestAnimationFrame(f); else c.clearRect(0, 0, innerWidth, innerHeight); })(t0);
}

function launchRace(cfg) {
  if (race) { race.destroy(); race = null; }
  closeSheets(true); backdrop.classList.remove('show');
  show('scr-race');
  race = new Race(cfg);
  window.__race = race; // depuração
  $('#net-dot').hidden = true;
}

// ================================================================ SOLO
function startSolo() {
  const def = trackById(prefs.track);
  const used = [prefs.color];
  const pick = () => { const c = COLORS.find((x) => !used.includes(x)); used.push(c); return c; };
  const skill = LEVEL_SKILL[prefs.level] || 0.96;
  const entries = [{ pid: 'me', name: myName(), color: prefs.color, lane: 0 }];
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < 3; i++) entries.push({ pid: 'bot' + i, name: names[i], color: pick(), bot: true, skill: skill * (0.97 + i * 0.025), lane: [-3, 3, 0][i] });
  // jogador larga em último
  entries.push(entries.shift());
  S = { mode: 'solo', race: { id: rid(8), track: def.id, laps: +prefs.laps, entries, level: prefs.level }, raceSave: null };
  save();
  if (prefs.controls === 'tilt') askTilt();
  launchRace({ ...S.race, myPid: 'me', role: 'solo', goAt: performance.now() + 4600 });
}
function exitToMenu() {
  if (race) { race.destroy(); race = null; }
  S = null; save();
  $('#results').classList.remove('show');
  show('scr-menu');
}

// ================================================================ ONLINE
let room = null, lobby = null;
function inviteLink() { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('sala', S.room); u.searchParams.set('de', myName()); return u.toString(); }

function createRoom() {
  if (!prefs.name) { $('#pname').focus(); }
  const code = rid(5);
  lobby = { room: code, track: prefs.track, laps: +prefs.laps, bots: true, level: prefs.level, phase: 'lobby', race: null, players: [{ pid: 'host', name: myName(), color: prefs.color, host: true, online: true }] };
  S = { mode: 'online', room: code, isHost: true, pid: 'host', lobby };
  save();
  closeSheets();
  openRoom();
  show('scr-lobby');
  renderLobby();
}
function joinRoom(code) {
  const nm = $('#join-name').value.trim(); if (nm) { prefs.name = nm; savePrefs(); }
  S = { mode: 'online', room: code, isHost: false, pid: 'p' + rid(6).toLowerCase(), lobby: null };
  lobby = null;
  save();
  history.replaceState(null, '', location.pathname);
  closeSheets();
  openRoom();
  show('scr-lobby');
  renderLobby();
}
function openRoom() {
  if (room) room.destroy();
  room = new Room({
    room: S.room, isHost: S.isHost, pid: S.pid,
    onMessage: S.isHost ? hostMessage : guestMessage,
    onJoin: (pid) => { if (!S.isHost) room.send({ t: 'hello', name: myName(), color: prefs.color }, false); },
    onLeave: (pid) => { if (S.isHost) hostPlayerLost(pid); },
    onStatus: (st) => { netStatus(st); },
  });
  room.start();
  netStatus(room.status);
}
function netStatus(st) {
  const pill = $('#lobby-status');
  pill.classList.toggle('off', st !== 'connected');
  $('span', pill).textContent = st === 'connected' ? (S && S.isHost ? 'Sala aberta' : 'Conectado') : 'Conectando…';
  $('#net-dot').hidden = st === 'connected' || !race || race.cfg.role === 'solo';
}

// ---- anfitrião
function hostBroadcast() { if (!room) return; room.broadcast({ t: 'lobby', lobby }); S.lobby = lobby; save(); renderLobby(); }
function hostMessage(pid, m) {
  if (m.t === 'hello') {
    let p = lobby.players.find((x) => x.pid === pid);
    if (!p) {
      if (lobby.players.length >= 4) { room.sendTo(pid, { t: 'full' }); return; }
      p = { pid, name: String(m.name || 'Piloto').slice(0, 14), color: m.color, online: true };
      lobby.players.push(p);
      sfx.join(); haptic('success'); toast(`${p.name} entrou na sala`, '🏎️');
    }
    p.name = String(m.name || p.name).slice(0, 14); p.online = true;
    const taken = lobby.players.filter((x) => x !== p).map((x) => x.color);
    p.color = !taken.includes(m.color) ? m.color : (taken.includes(p.color) ? COLORS.find((c) => !taken.includes(c)) : p.color);
    hostBroadcast();
    if (lobby.phase === 'race' && race) room.sendTo(pid, { t: 'start', race: lobby.race, elapsed: race.time });
  } else if (m.t === 'color') {
    const p = lobby.players.find((x) => x.pid === pid);
    if (p && lobby.phase === 'lobby' && !lobby.players.some((x) => x !== p && x.color === m.color)) { p.color = m.color; hostBroadcast(); }
  } else if (m.t === 's') {
    if (race) race.remoteState(pid, m.c);
  } else if (m.t === 'bye') {
    const p = lobby.players.find((x) => x.pid === pid);
    lobby.players = lobby.players.filter((x) => x.pid !== pid);
    if (p) toast(`${p.name} saiu da sala`, '👋');
    hostBroadcast();
  }
}
function hostPlayerLost(pid) {
  const p = lobby && lobby.players.find((x) => x.pid === pid);
  if (!p) return;
  p.online = false; hostBroadcast();
  setTimeout(() => {
    if (!lobby) return;
    const q = lobby.players.find((x) => x.pid === pid);
    if (q && !q.online && lobby.phase === 'lobby') { lobby.players = lobby.players.filter((x) => x !== q); toast(`${q.name} desconectou`, '⚠️'); hostBroadcast(); }
  }, 20000);
}
function hostStart() {
  const humans = lobby.players.filter((p) => p.online);
  if (humans.length < 2 && !lobby.bots) { toast('Ative a máquina ou espere um amigo', '⚠️'); haptic('error'); return; }
  const used = humans.map((p) => p.color);
  const skill = LEVEL_SKILL[lobby.level] || 0.96;
  const entries = humans.map((p, i) => ({ pid: p.pid, name: p.name, color: p.color, lane: [0, -3, 3, 1][i] }));
  if (lobby.bots) { const names = [...BOT_NAMES].sort(() => Math.random() - 0.5); for (let i = 0; entries.length < 4; i++) { const c = COLORS.find((x) => !used.includes(x)); used.push(c); entries.push({ pid: 'bot' + i, name: names[i], color: c, bot: true, skill: skill * (0.97 + i * 0.03), lane: [-3, 3, 0][i % 3] }); } }
  entries.sort(() => Math.random() - 0.5);
  const raceCfg = { id: rid(8), track: lobby.track, laps: lobby.laps, entries, level: lobby.level };
  lobby.phase = 'race'; lobby.race = raceCfg;
  hostBroadcast();
  room.broadcast({ t: 'start', race: raceCfg, countdown: 4.6 });
  S.raceSave = null; save();
  launchRace({ ...raceCfg, myPid: S.pid, role: 'host', goAt: performance.now() + 4600 });
}
function hostBackToLobby() {
  if (race) { race.destroy(); race = null; }
  lobby.phase = 'lobby'; lobby.race = null; S.raceSave = null;
  hostBroadcast();
  $('#results').classList.remove('show');
  show('scr-lobby');
}
// envio periódico de estados
function netTick(r) {
  if (!room) return;
  if (r.cfg.role === 'guest') { room.send({ t: 's', c: packState(r.me.st, r.me.braking) }, false); return; }
  const cars = {};
  for (const c of r.cars) if (c.sim || c.net) cars[c.e.pid] = c.sim ? packState(c.st, c.braking) : packState(c.st, c.braking);
  room.broadcast({ t: 'snap', cars });
}

// ---- convidado
function guestMessage(_from, m) {
  if (m.t === 'lobby') {
    const was = lobby && lobby.phase;
    lobby = m.lobby; S.lobby = lobby; save();
    if (lobby.phase === 'lobby' && (race || was === 'race')) {
      if (race) { race.destroy(); race = null; }
      $('#results').classList.remove('show'); S.raceSave = null; save();
      show('scr-lobby');
    }
    renderLobby();
    const me = lobby.players.find((p) => p.pid === S.pid);
    if (me && me.color !== prefs.color) { prefs.color = me.color; savePrefs(); }
  } else if (m.t === 'start') {
    if (race && race.cfg.id === m.race.id) return;
    if (!m.race.entries.some((e) => e.pid === S.pid)) { $('#lobby-note').textContent = 'Corrida em andamento — você entra na próxima largada.'; return; }
    const restore = S.raceSave && S.raceSave.id === m.race.id ? S.raceSave : null;
    const goAt = m.elapsed != null ? performance.now() - m.elapsed * 1000 : performance.now() + (m.countdown || 4.6) * 1000;
    if (!restore) S.raceSave = null;
    save();
    if (prefs.controls === 'tilt') askTilt();
    launchRace({ ...m.race, myPid: S.pid, role: 'guest', goAt, restore });
  } else if (m.t === 'snap') {
    if (race) for (const pid in m.cars) if (pid !== S.pid) race.remoteState(pid, m.cars[pid]);
  } else if (m.t === 'full') {
    teardownRoom(); alertBox('Sala cheia', 'Essa corrida já tem 4 pilotos.', [{ label: 'OK', style: 'bold', fn: exitToMenu }]);
  } else if (m.t === 'closed') {
    teardownRoom(); alertBox('Sala encerrada', 'O anfitrião fechou a sala.', [{ label: 'OK', style: 'bold', fn: exitToMenu }]);
  }
}
function teardownRoom() { if (room) { room.destroy(); room = null; } }
function leaveRoom() {
  if (room) {
    if (S && S.isHost) room.broadcast({ t: 'closed' }); else room.send({ t: 'bye' }, false);
    const r = room; room = null; setTimeout(() => r.destroy(), 300);
  }
  lobby = null;
  exitToMenu();
}

// ---- lobby UI
function renderLobby() {
  if (!S || S.mode !== 'online') return;
  const L = lobby;
  $('#lobby-title').textContent = 'Sala ' + S.room;
  $('#room-code').textContent = S.room;
  const host = S.isHost;
  const players = L ? L.players : [];
  $('#lobby-count').textContent = `${players.length}/4`;
  let html = '';
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    if (!p) { html += `<div class="slot empty">${L && L.bots ? 'Máquina' : 'Vaga livre'}</div>`; continue; }
    html += `<div class="slot ${p.online ? '' : 'off'}"><div class="car-ic">${carSVG(p.color)}</div><div style="min-width:0"><b>${esc(p.name)}</b><small>${p.host ? 'Anfitrião' : p.online ? 'Pronto' : 'Reconectando…'}${p.pid === S.pid ? ' · <span class="me-tag">você</span>' : ''}</small></div></div>`;
  }
  if (!L) html = '<div class="slot empty" style="grid-column:span 2">Conectando à sala…</div>';
  $('#slots').innerHTML = html;
  $('#invite').hidden = !host;
  if (host) renderQR();
  buildTrackCards($('#tracks-lobby'), L ? L.track : prefs.track, (id) => { lobby.track = id; prefs.track = id; savePrefs(); hostBroadcast(); }, !host);
  $('#host-opts').hidden = !host;
  if (L) {
    $$('#lobby-laps button').forEach((b) => b.classList.toggle('on', +b.dataset.value === L.laps));
    $('#lobby-bots').checked = L.bots;
  }
  const st = $('#btn-start');
  st.hidden = !host;
  $('#lobby-note').textContent = host ? 'Envie o convite. Quando todos estiverem prontos, toque em Largar!' : L ? (L.phase === 'race' ? 'Corrida em andamento — entrando…' : `Aguardando o anfitrião largar · ${trackById(L.track).name} · ${L.laps} voltas`) : 'Conectando ao anfitrião…';
}
$('#lobby-laps').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !S || !S.isHost) return; lobby.laps = +b.dataset.value; haptic('light'); hostBroadcast(); });
$('#lobby-bots').addEventListener('change', (e) => { if (!S || !S.isHost) return; lobby.bots = e.target.checked; haptic('light'); hostBroadcast(); });

let qrFor = null;
function renderQR() {
  const link = inviteLink(); if (qrFor === link) return;
  const box = $('#qr');
  if (!window.qrcode) { setTimeout(renderQR, 600); return; }
  try { const q = window.qrcode(0, 'M'); q.addData(link); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); qrFor = link; } catch (_) {}
}
async function copyLink() { const l = inviteLink(); try { await navigator.clipboard.writeText(l); } catch (_) { const t = document.createElement('textarea'); t.value = l; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } toast('Link do convite copiado', '🔗'); haptic('success'); }
async function share() {
  const l = inviteLink();
  if (navigator.share) { try { await navigator.share({ title: 'Corrida', text: `${myName()} te chamou para uma corrida! 🏎️`, url: l }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  copyLink();
}

// ================================================================ AÇÕES
let pendingJoin = null;
const ACT = {
  solo: () => startSolo(),
  'open-online': () => openSheet('sheet-online'),
  'create-room': () => createRoom(),
  'join-room': () => joinRoom(pendingJoin),
  'close-sheet': () => closeSheets(),
  'start-online': () => hostStart(),
  'leave-room': () => alertBox(S && S.isHost ? 'Encerrar a sala?' : 'Sair da sala?', S && S.isHost ? 'Todos os pilotos serão desconectados.' : 'Você pode entrar de novo pelo mesmo link.', [{ label: 'Ficar', style: 'bold' }, { label: 'Sair', style: 'danger', fn: leaveRoom }]),
  share, copy: copyLink,
  pause: () => {
    if (!race) return;
    if (S.mode === 'solo') {
      race.pause();
      actions([
        { label: 'Reiniciar corrida', fn: () => startSolo() },
        { label: 'Sair para o menu', danger: true, fn: exitToMenu },
      ]);
    } else {
      const list = [];
      if (S.isHost) list.push({ label: 'Encerrar corrida e voltar à sala', fn: hostBackToLobby });
      list.push({ label: prefs.sound ? 'Desativar sons' : 'Ativar sons', fn: () => { prefs.sound = !prefs.sound; savePrefs(); setSound(prefs.sound); } });
      list.push({ label: S.isHost ? 'Encerrar sala' : 'Sair da sala', danger: true, fn: leaveRoom });
      actions(list);
    }
  },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
  const fn = ACT[b.dataset.action]; if (fn) { haptic('light'); fn(); }
});
$('#join-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ACT['join-room'](); } });

// ciclo de vida
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (race && S && S.mode === 'solo' && !race.paused) ACT.pause(); }
  else if (room) room.wake();
});
addEventListener('pagehide', () => { if (race) race.persist(); if (room) room.destroy(); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});

// ================================================================ INÍCIO
(function init() {
  initMenu();
  const params = new URLSearchParams(location.search);
  const code = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const from = (params.get('de') || '').slice(0, 14);
  if (code && !(S && S.mode === 'online' && S.room === code)) {
    pendingJoin = code;
    $('#join-title').textContent = from ? `${from} te chamou para correr!` : 'Você foi convidado!';
    $('#join-name').value = prefs.name;
    buildSwatches($('#join-swatches'), prefs.color, (c) => { prefs.color = c; savePrefs(); $('#car-preview').innerHTML = carSVG(c); });
    setTimeout(() => openSheet('sheet-join'), 350);
    return;
  }
  if (code) history.replaceState(null, '', location.pathname);
  if (!S) return;
  if (S.mode === 'solo' && S.race) {
    const rs = S.raceSave && S.raceSave.id === S.race.id ? S.raceSave : null;
    const goAt = rs ? performance.now() - rs.elapsed * 1000 : performance.now() + 4600;
    show('scr-race', true);
    launchRace({ ...S.race, myPid: 'me', role: 'solo', goAt, restore: rs });
    if (rs && rs.elapsed > 0) setTimeout(() => race && ACT.pause(), 300);
    return;
  }
  if (S.mode === 'online') {
    lobby = S.lobby;
    openRoom();
    if (S.isHost && lobby && lobby.phase === 'race' && lobby.race && S.raceSave && S.raceSave.id === lobby.race.id) {
      show('scr-race', true);
      launchRace({ ...lobby.race, myPid: S.pid, role: 'host', goAt: performance.now() - S.raceSave.elapsed * 1000, restore: S.raceSave });
    } else {
      if (S.isHost && lobby) { lobby.phase = 'lobby'; lobby.race = null; }
      show('scr-lobby', true);
      renderLobby();
    }
  }
})();
