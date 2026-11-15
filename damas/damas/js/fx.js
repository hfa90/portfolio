// Sons sintetizados (Web Audio) + háptico (iOS 18+ via switch, Android via vibrate)
let ctx = null;
let enabled = { sound: true, haptic: true };
export function setFx(opts) { Object.assign(enabled, opts); }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// desbloqueia o áudio no primeiro toque (exigência do iOS)
['pointerdown', 'touchend', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, () => { const c = ac(); if (c) { const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } }, { once: true, passive: true })
);

let noiseBuf = null;
function noise(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function wood(c, t, { freq = 1700, body = 420, vol = 0.55, decay = 0.07 } = {}) {
  const out = c.createGain(); out.gain.value = vol; out.connect(c.destination);
  // impacto (ruído filtrado)
  const n = c.createBufferSource(); n.buffer = noise(c);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * (0.92 + Math.random() * 0.16); bp.Q.value = 1.4;
  const ng = c.createGain(); ng.gain.setValueAtTime(0.9, t); ng.gain.exponentialRampToValueAtTime(0.001, t + decay * 0.6);
  n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t); n.stop(t + 0.1);
  // corpo (ressonância da madeira)
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(body * (0.95 + Math.random() * 0.1), t); o.frequency.exponentialRampToValueAtTime(body * 0.55, t + decay);
  const og = c.createGain(); og.gain.setValueAtTime(0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + decay * 1.6);
  o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.25);
}

function tone(c, t, f, dur, type = 'sine', vol = 0.18) {
  const o = c.createOscillator(); o.type = type; o.frequency.value = f;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  pick() { const c = enabled.sound && ac(); if (c) wood(c, c.currentTime, { freq: 2600, body: 700, vol: 0.18, decay: 0.04 }); },
  place() { const c = enabled.sound && ac(); if (c) wood(c, c.currentTime); },
  capture() { const c = enabled.sound && ac(); if (!c) return; const t = c.currentTime; wood(c, t, { vol: 0.6 }); wood(c, t + 0.07, { freq: 1200, body: 300, vol: 0.4, decay: 0.09 }); },
  promote() { const c = enabled.sound && ac(); if (!c) return; const t = c.currentTime; [784, 988, 1175, 1568].forEach((f, i) => tone(c, t + i * 0.07, f, 0.35, 'triangle', 0.12)); },
  error() { const c = enabled.sound && ac(); if (!c) return; const t = c.currentTime; tone(c, t, 180, 0.12, 'square', 0.05); tone(c, t + 0.1, 150, 0.15, 'square', 0.05); },
  message() { const c = enabled.sound && ac(); if (!c) return; const t = c.currentTime; tone(c, t, 1318, 0.18, 'sine', 0.14); tone(c, t + 0.09, 1760, 0.25, 'sine', 0.12); },
  send() { const c = enabled.sound && ac(); if (!c) return; const t = c.currentTime; const o = c.createOscillator(); const g = c.createGain(); o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.12); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.2); },
  win() { const c = enabled.sound && ac(); if (!c) return; const t = c.currentTime; [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(c, t + i * 0.11, f, 0.4, 'triangle', 0.14)); },
  lose() { const c = enabled.sound && ac(); if (!c) return; const t = c.currentTime; [392, 349, 311, 262].forEach((f, i) => tone(c, t + i * 0.16, f, 0.45, 'sine', 0.13)); },
  join() { const c = enabled.sound && ac(); if (!c) return; const t = c.currentTime; tone(c, t, 880, 0.2, 'sine', 0.12); tone(c, t + 0.12, 1320, 0.3, 'sine', 0.1); },
};

// ---------- háptico ----------
let label = null;
export function haptic(kind = 'light') {
  if (!enabled.haptic) return;
  if (navigator.vibrate) {
    navigator.vibrate(kind === 'heavy' ? [18] : kind === 'error' ? [12, 60, 12] : kind === 'success' ? [10, 50, 20] : [8]);
    return;
  }
  // iOS 18+: alternar um <input switch> dispara o Taptic Engine
  label = label || document.getElementById('haptic-label');
  if (!label) return;
  try {
    label.click();
    if (kind === 'error' || kind === 'success') setTimeout(() => label.click(), 90);
  } catch (_) {}
}
