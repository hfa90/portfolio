// Definição das pistas + amostragem do traçado (sem dependência de Three.js)

export const TRACKS = [
  {
    id: 'praia', name: 'Costa Dourada', sub: 'Pôr do sol à beira-mar', width: 15,
    pts: [[0, 0], [130, 0], [215, 25], [250, 95], [215, 170], [135, 190], [80, 150], [10, 175], [-85, 175], [-160, 120], [-165, 35], [-95, -5]],
    theme: {
      skyTop: '#2b3a8c', skyMid: '#ff7a59', skyBottom: '#ffd29a', fog: '#ffb889', fogNear: 160, fogFar: 950,
      sun: [0.55, 0.16, 0.82], sunColor: '#ffd7a0', sunIntensity: 2.6, hemiSky: '#ffd2b0', hemiGround: '#6a4a30', hemi: 1.1,
      ground: 'sand', wall: 'tire', smoke: '#e8d2a6', night: false,
    },
  },
  {
    id: 'cidade', name: 'Avenida Neon', sub: 'Noite na metrópole', width: 15,
    pts: [[0, 0], [170, 0], [195, 25], [195, 130], [170, 155], [115, 155], [92, 132], [92, 92], [70, 70], [-35, 70], [-58, 93], [-58, 190], [-82, 215], [-170, 215], [-195, 190], [-195, 25], [-170, 0]],
    theme: {
      skyTop: '#05030f', skyMid: '#1a0d3a', skyBottom: '#4b1d6b', fog: '#1d0f33', fogNear: 120, fogFar: 700,
      sun: [-0.3, 0.6, 0.4], sunColor: '#9fb4ff', sunIntensity: 0.9, hemiSky: '#6c7cff', hemiGround: '#2a0f3a', hemi: 0.9,
      ground: 'city', wall: 'neon', smoke: '#9a9ab0', night: true,
    },
  },
  {
    id: 'neve', name: 'Pico Gelado', sub: 'Curvas na montanha', width: 14,
    pts: [[0, 0], [105, -20], [175, 20], [165, 95], [95, 105], [65, 155], [115, 215], [45, 270], [-60, 240], [-85, 160], [-155, 125], [-165, 45], [-95, 5]],
    theme: {
      skyTop: '#4f8fd6', skyMid: '#a9d0f5', skyBottom: '#eef6ff', fog: '#dfeaf5', fogNear: 90, fogFar: 600,
      sun: [0.4, 0.45, -0.6], sunColor: '#fff6e8', sunIntensity: 2.2, hemiSky: '#e6f2ff', hemiGround: '#8a9bb0', hemi: 1.3,
      ground: 'snow', wall: 'snow', smoke: '#ffffff', night: false,
    },
  },
  {
    id: 'deserto', name: 'Cânion Vermelho', sub: 'Retas longas no deserto', width: 16,
    pts: [[0, 0], [230, 0], [310, 60], [290, 145], [190, 155], [125, 115], [45, 145], [-35, 225], [-160, 205], [-205, 115], [-145, 30]],
    theme: {
      skyTop: '#3f7bd1', skyMid: '#f2b56b', skyBottom: '#ffe0a8', fog: '#f0c48a', fogNear: 200, fogFar: 1100,
      sun: [-0.5, 0.35, 0.7], sunColor: '#ffe2b0', sunIntensity: 3.0, hemiSky: '#ffe4bf', hemiGround: '#8a4a2a', hemi: 1.0,
      ground: 'desert', wall: 'rock', smoke: '#d99a5c', night: false,
    },
  },
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];

// Catmull-Rom centrípeta fechada
function catmull(p0, p1, p2, p3, t) {
  const alpha = 0.5;
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), alpha) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => [((tb - tt) / (tb - ta)) * a[0] + ((tt - ta) / (tb - ta)) * b[0], ((tb - tt) / (tb - ta)) * a[1] + ((tt - ta) / (tb - ta)) * b[1]];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

const cache = new Map();
export function sampleTrack(def, spacing = 2) {
  if (cache.has(def.id)) return cache.get(def.id);
  const P = def.pts, n = P.length;
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 60; k++) dense.push(catmull(p0, p1, p2, p3, k / 60));
  }
  // reamostra por comprimento de arco
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[cum.length - 1];
  const N = Math.round(length / spacing);
  const px = new Float32Array(N), pz = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / N) * length;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j], b = dense[(j + 1) % dense.length];
    px[i] = a[0] + (b[0] - a[0]) * f;
    pz[i] = a[1] + (b[1] - a[1]) * f;
  }
  const tx = new Float32Array(N), tz = new Float32Array(N), nx = new Float32Array(N), nz = new Float32Array(N), curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let dx = px[b] - px[a], dz = pz[b] - pz[a];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    tx[i] = dx; tz[i] = dz;
    nx[i] = dz; nz[i] = -dx; // normal para a esquerda
  }
  for (let i = 0; i < N; i++) {
    const b = (i + 6) % N;
    const ang = Math.atan2(tx[i] * tz[b] - tz[i] * tx[b], tx[i] * tx[b] + tz[i] * tz[b]);
    curv[i] = Math.abs(ang) / 12; // rad por metro aprox.
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }
  // pads de turbo nos trechos mais retos
  const pads = [];
  const score = [];
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -20; k <= 20; k++) s += curv[(i + k + N) % N]; score.push([s, i]); }
  score.sort((a, b) => a[0] - b[0]);
  for (const [, i] of score) {
    if (i < 25 || i > N - 25) continue;
    if (pads.every((p) => Math.min(Math.abs(p.i - i), N - Math.abs(p.i - i)) > N / 5)) pads.push({ i, lat: (pads.length % 2 ? -1 : 1) * def.width * 0.2 });
    if (pads.length >= 3) break;
  }
  const t = { def, N, length, spacing, px, pz, tx, tz, nx, nz, curv, width: def.width, half: def.width / 2, wall: def.width / 2 + 3.2, bounds: { minX, maxX, minZ, maxZ }, pads };
  cache.set(def.id, t);
  return t;
}

// ponto mais próximo procurando perto do último índice conhecido
export function nearest(t, x, z, hint = -1, win = 40) {
  let best = -1, bd = Infinity;
  if (hint < 0) {
    for (let i = 0; i < t.N; i++) { const d = (t.px[i] - x) ** 2 + (t.pz[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  for (let k = -win; k <= win; k++) {
    const i = (hint + k + t.N) % t.N;
    const d = (t.px[i] - x) ** 2 + (t.pz[i] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function distToTrack(t, x, z, step = 3) {
  let bd = Infinity;
  for (let i = 0; i < t.N; i += step) { const d = (t.px[i] - x) ** 2 + (t.pz[i] - z) ** 2; if (d < bd) bd = d; }
  return Math.sqrt(bd);
}
