// Física arcade dos carros + IA dos bots
import { nearest } from './tracks.js';

export const MAX_SPEED = 58;      // m/s (~209 km/h)
const ACCEL = 21, BRAKE = 38, REVERSE_MAX = 11;
const approach = (v, t, r) => (v < t ? Math.min(t, v + r) : Math.max(t, v - r));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function gridSlot(t, slot) {
  const row = slot >> 1, side = slot % 2 ? -1 : 1;
  const i = (t.N - 5 - row * 5 - (slot % 2) * 2 + t.N) % t.N;
  return { i, lat: side * t.width * 0.22 };
}

export function createCar(t, slot, extra = {}) {
  const { i, lat } = gridSlot(t, slot);
  return Object.assign({
    x: t.px[i] + t.nx[i] * lat, z: t.pz[i] + t.nz[i] * lat,
    h: Math.atan2(t.tx[i], t.tz[i]), vx: 0, vz: 0, speed: 0, steer: 0,
    idx: i, lat, lap: 0, half: false, boost: 0, drifting: false, driftCharge: 0, driftDir: 0,
    offroad: false, wallHit: 0, wrong: 0, finished: false, finishTime: 0,
    lapStart: 0, lastLap: 0, bestLap: 0, padCool: 0, bumped: 0, events: [],
  }, extra);
}

/** input: { gas 0..1, brake 0..1, steer -1..1 (positivo = direita), drift bool } */
export function stepCar(c, input, t, dt, now) {
  c.events.length = 0;
  c.steer = approach(c.steer, input.steer, (input.analog ? 12 : 5.5) * dt);
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  let fwd = c.vx * fx + c.vz * fz;
  const boosting = c.boost > 0;
  const maxS = MAX_SPEED * (boosting ? 1.32 : 1) * (c.offroad ? 0.55 : 1);

  if (input.gas > 0 && !c.finished) fwd += (ACCEL * (boosting ? 1.6 : 1)) * Math.max(0.15, 1 - Math.max(0, fwd) / maxS) * input.gas * dt;
  if (input.brake > 0 && !input.drift) {
    if (fwd > 1) fwd -= BRAKE * input.brake * dt;
    else fwd = Math.max(-REVERSE_MAX, fwd - 9 * input.brake * dt);
  }
  if (c.finished) fwd -= fwd * 0.9 * dt;
  fwd -= fwd * (0.12 + (c.offroad ? 1.0 : 0)) * dt;
  if (fwd > maxS) fwd -= (fwd - maxS) * 2.5 * dt;
  if (!input.gas && Math.abs(fwd) < 0.3) fwd = 0;

  // drift
  const spd = Math.abs(fwd);
  if (input.drift && spd > 14 && Math.abs(c.steer) > 0.25 && !c.offroad) {
    if (!c.drifting) { c.drifting = true; c.driftDir = Math.sign(c.steer); c.driftCharge = 0; }
  } else if (c.drifting && (!input.drift || spd < 10)) {
    c.drifting = false;
    if (c.driftCharge > 0.7) { c.boost = Math.min(1.6, 0.35 + c.driftCharge * 0.45); c.events.push('miniboost'); }
    c.driftCharge = 0;
  }
  if (c.drifting) c.driftCharge += dt * (0.6 + Math.abs(c.steer));

  // direção
  const sf = Math.min(1, spd / 9);
  let turn = c.steer * 2.25 * sf * (1 - 0.32 * Math.min(1, spd / MAX_SPEED));
  if (c.drifting) turn = (c.driftDir * 0.55 + c.steer * 0.75) * 2.3 * sf;
  c.h -= turn * Math.sign(fwd || 1) * dt;

  // aderência: velocidade lateral é absorvida
  const nfx = Math.sin(c.h), nfz = Math.cos(c.h);
  const grip = c.drifting ? 2.4 : c.offroad ? 5 : 9.5;
  const k = Math.min(1, grip * dt);
  c.vx += (nfx * fwd - c.vx) * k;
  c.vz += (nfz * fwd - c.vz) * k;
  c.x += c.vx * dt; c.z += c.vz * dt;
  c.speed = fwd;
  c.slip = Math.abs(-c.vx * nfz + c.vz * nfx); // velocidade lateral

  if (c.boost > 0) c.boost = Math.max(0, c.boost - dt);
  if (c.padCool > 0) c.padCool -= dt;
  if (c.bumped > 0) c.bumped -= dt;

  // pista
  const prev = c.idx;
  c.idx = nearest(t, c.x, c.z, c.idx);
  const i = c.idx;
  const dx = c.x - t.px[i], dz = c.z - t.pz[i];
  const lat = dx * t.nx[i] + dz * t.nz[i];
  c.lat = lat;
  c.offroad = Math.abs(lat) > t.half + 0.6;
  if (Math.abs(lat) > t.wall) {
    const s = Math.sign(lat), push = Math.abs(lat) - t.wall + 0.02;
    c.x -= t.nx[i] * s * push; c.z -= t.nz[i] * s * push;
    const vn = c.vx * t.nx[i] + c.vz * t.nz[i];
    if (vn * s > 0) {
      c.vx -= t.nx[i] * vn * 1.35; c.vz -= t.nz[i] * vn * 1.35;
      const impact = Math.abs(vn);
      c.vx *= 0.86; c.vz *= 0.86;
      c.h += wrap(Math.atan2(t.tx[i], t.tz[i]) - c.h) * 0.12 * Math.sign(fwd || 1) * (fwd >= 0 ? 1 : 0);
      if (impact > 3) { c.wallHit = Math.min(1, impact / 18); c.events.push('wall'); }
    }
  }
  // pads de turbo
  for (const p of t.pads) {
    const d = Math.min(Math.abs(p.i - i), t.N - Math.abs(p.i - i));
    if (d <= 2 && Math.abs(lat - p.lat) < 2.6 && c.padCool <= 0) { c.boost = Math.max(c.boost, 1.4); c.padCool = 1; c.events.push('boost'); }
  }
  // voltas
  const N = t.N;
  if (i > N * 0.4 && i < N * 0.6) c.half = true;
  if (prev > N * 0.75 && i < N * 0.25) {
    if (c.lap === 0 || c.half) {
      if (c.lap > 0) { c.lastLap = now - c.lapStart; if (!c.bestLap || c.lastLap < c.bestLap) c.bestLap = c.lastLap; }
      c.lap++; c.half = false; c.lapStart = now; c.events.push('lap');
    }
  } else if (prev < N * 0.25 && i > N * 0.75 && c.lap > 0) {
    c.lap--; c.half = true;
  }
  // contramão
  const along = nfx * t.tx[i] + nfz * t.tz[i];
  c.wrong = along < -0.4 && spd > 4 ? c.wrong + dt : 0;
}

export function progress(c, t) { return c.finished ? 1e9 - c.finishTime : c.lap * t.N + c.idx - (c.lap === 0 && c.idx > t.N / 2 ? t.N : 0); }

// colisão simples entre carros (círculos); só move quem "possui" a física
export function collide(a, b, moveB) {
  const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), R = 2.3;
  if (d >= R || d < 1e-4) return false;
  const nx = dx / d, nz = dz / d, push = (R - d) / (moveB ? 2 : 1);
  a.x += nx * push; a.z += nz * push;
  if (moveB) { b.x -= nx * push; b.z -= nz * push; }
  const rv = (a.vx - (b.vx || 0)) * nx + (a.vz - (b.vz || 0)) * nz;
  if (rv < 0) {
    a.vx -= nx * rv * 0.6; a.vz -= nz * rv * 0.6;
    if (moveB) { b.vx += nx * rv * 0.6; b.vz += nz * rv * 0.6; }
    if (a.bumped <= 0 && Math.abs(rv) > 2) { a.bumped = 0.4; a.events.push('bump'); }
  }
  return true;
}

// ---------------- IA ----------------
export function botInput(c, t, skill = 1) {
  const N = t.N;
  const spd = Math.max(0, c.speed);
  const look = Math.round(5 + spd * 0.32);
  const j = (c.idx + look) % N;
  const lane = c.lane || 0;
  const tx = t.px[j] + t.nx[j] * lane, tz = t.pz[j] + t.nz[j] * lane;
  const desired = Math.atan2(tx - c.x, tz - c.z);
  const diff = wrap(desired - c.h);
  let maxC = 0;
  for (let k = 0; k < 18 + spd * 0.5; k += 2) maxC = Math.max(maxC, t.curv[(c.idx + k) % N]);
  const target = MAX_SPEED * skill * Math.max(0.42, 1 - maxC * 9.5);
  return {
    steer: Math.max(-1, Math.min(1, -diff * 2.8)), analog: true,
    gas: spd < target ? 1 : 0.2,
    brake: spd > target + 5 ? 0.7 : 0,
    drift: false,
  };
}
