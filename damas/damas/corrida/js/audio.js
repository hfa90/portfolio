// Áudio da corrida: motor sintetizado, pneus, impactos, contagem e efeitos
let ctx = null, master = null, enabled = true;
let engine = null, screech = null;

export function setSound(on) { enabled = on; if (master) master.gain.value = on ? 0.9 : 0; }
export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
['pointerdown', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, () => audioCtx(), { passive: true }));

let nb = null;
function noiseBuf(c) {
  if (nb) return nb;
  nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return nb;
}

export function startEngine() {
  const c = audioCtx(); if (!c || engine) return;
  const o1 = c.createOscillator(); o1.type = 'sawtooth';
  const o2 = c.createOscillator(); o2.type = 'square';
  const o3 = c.createOscillator(); o3.type = 'sine';
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
  const g = c.createGain(); g.gain.value = 0;
  const g2 = c.createGain(); g2.gain.value = 0.35;
  o1.connect(f); o2.connect(g2); g2.connect(f); o3.connect(f); f.connect(g); g.connect(master);
  [o1, o2, o3].forEach((o) => o.start());
  // pneus
  const n = c.createBufferSource(); n.buffer = noiseBuf(c); n.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 6;
  const sg = c.createGain(); sg.gain.value = 0;
  n.connect(bp); bp.connect(sg); sg.connect(master); n.start();
  // vento
  const w = c.createBufferSource(); w.buffer = noiseBuf(c); w.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  const wg = c.createGain(); wg.gain.value = 0;
  w.connect(lp); lp.connect(wg); wg.connect(master); w.start();
  engine = { o1, o2, o3, f, g, wg }; screech = { sg, bp };
}
export function stopEngine() {
  if (!engine) return;
  const t = ctx.currentTime;
  engine.g.gain.setTargetAtTime(0, t, 0.1); screech.sg.gain.setTargetAtTime(0, t, 0.05); engine.wg.gain.setTargetAtTime(0, t, 0.1);
  const e = engine; engine = null; screech = null;
  setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.o3.stop(); } catch (_) {} }, 600);
}
const GEARS = [0, 14, 25, 35, 45, 54, 90];
export function updateEngine(speed, throttle, slip, boost) {
  if (!engine || !ctx) return;
  const s = Math.abs(speed);
  let gear = 1; while (gear < GEARS.length - 1 && s > GEARS[gear]) gear++;
  const lo = GEARS[gear - 1], hi = GEARS[gear];
  const rpm = Math.min(1, (s - lo) / (hi - lo)) * 0.75 + 0.2 + throttle * 0.08;
  const base = 38 + rpm * 120 + gear * 6;
  const t = ctx.currentTime;
  engine.o1.frequency.setTargetAtTime(base, t, 0.03);
  engine.o2.frequency.setTargetAtTime(base * 0.5, t, 0.03);
  engine.o3.frequency.setTargetAtTime(base * 2, t, 0.03);
  engine.f.frequency.setTargetAtTime(380 + rpm * 1600 * (0.5 + throttle * 0.5) + (boost ? 700 : 0), t, 0.05);
  engine.g.gain.setTargetAtTime(0.11 + throttle * 0.08 + rpm * 0.05, t, 0.05);
  screech.sg.gain.setTargetAtTime(Math.min(0.32, Math.max(0, slip - 3) * 0.035), t, 0.04);
  screech.bp.frequency.setTargetAtTime(1500 + Math.random() * 600, t, 0.05);
  engine.wg.gain.setTargetAtTime(Math.min(0.18, s / 300), t, 0.1);
}

function tone(f, dur, type = 'sine', vol = 0.25, when = 0) {
  const c = audioCtx(); if (!c || !enabled) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(); o.type = type; o.frequency.value = f;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function burst(dur, freq, vol, type = 'lowpass', sweep = 0) {
  const c = audioCtx(); if (!c || !enabled) return;
  const t = c.currentTime;
  const n = c.createBufferSource(); n.buffer = noiseBuf(c);
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + dur + 0.05);
}
export const sfx = {
  beep: () => tone(520, 0.25, 'square', 0.12),
  go: () => { tone(1040, 0.6, 'square', 0.14); tone(780, 0.6, 'sawtooth', 0.05); },
  wall: (k = 1) => { burst(0.25, 260, 0.5 * k); tone(70, 0.2, 'sine', 0.4 * k); },
  bump: () => { burst(0.15, 600, 0.35); tone(110, 0.12, 'triangle', 0.25); },
  boost: () => burst(0.9, 300, 0.35, 'bandpass', 3000),
  lap: () => { tone(880, 0.18, 'triangle', 0.18); tone(1320, 0.3, 'triangle', 0.16, 0.12); },
  final: () => [660, 880, 1100].forEach((f, i) => tone(f, 0.25, 'triangle', 0.16, i * 0.1)),
  finish: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, 'triangle', 0.16, i * 0.11)),
  tap: () => tone(1200, 0.05, 'sine', 0.08),
  join: () => { tone(880, 0.2, 'sine', 0.14); tone(1320, 0.3, 'sine', 0.12, 0.12); },
};
