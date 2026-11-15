// Construção do mundo 3D: pista, cenário, céu, carros e efeitos
import * as THREE from 'three';
import { distToTrack } from './tracks.js';

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTex(w, h, draw, { repeat = false, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  return t;
}
function noise(ctx, w, h, base, vary, count, size = 2, seed = 1) {
  const r = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = (r() - 0.5) * vary;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

// ---------------------------------------------------------------- texturas
const TEX = {};
function asphaltTex(night) {
  return canvasTex(256, 512, (g, w, h) => {
    noise(g, w, h, night ? '#2a2a33' : '#3b3b40', 0.18, 9000, 2, 3);
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
    g.fillStyle = night ? 'rgba(255,220,120,.9)' : 'rgba(255,255,255,.85)';
    g.fillRect(w / 2 - 3, 0, 6, h * 0.45);
    // marcas de pneu
    g.fillStyle = 'rgba(0,0,0,.12)';
    g.fillRect(w * 0.3, 0, 22, h); g.fillRect(w * 0.62, 0, 22, h);
  }, { repeat: true });
}
function curbTex() {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#d8262c'; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = '#f4f4f4'; g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 0, 6, h);
  }, { repeat: true });
}
function groundTex(kind) {
  const cfg = { sand: ['#e3c48f', 0.2], city: ['#26232e', 0.25], snow: ['#f3f7fb', 0.08], desert: ['#c9874f', 0.22] }[kind];
  return canvasTex(512, 512, (g, w, h) => {
    noise(g, w, h, cfg[0], cfg[1], 26000, 3, 7);
    if (kind === 'city') { g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 3; for (let i = 0; i < w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }
    if (kind === 'snow') { g.fillStyle = 'rgba(160,190,220,.10)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 40, 12, Math.random() * 3, 0, 7); g.fill(); } }
  }, { repeat: true });
}
function wallTex(kind) {
  return canvasTex(128, 64, (g, w, h) => {
    if (kind === 'tire') { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1d6fd8' : '#f2f2f2'; g.fillRect(i * 16, 0, 16, h); } g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 8, w, 8); }
    else if (kind === 'neon') { noise(g, w, h, '#2e2c38', 0.2, 600, 2); g.fillStyle = '#ff2fd6'; g.fillRect(0, 6, w, 5); g.fillStyle = '#20e8ff'; g.fillRect(0, h - 12, w, 5); }
    else if (kind === 'snow') { noise(g, w, h, '#e9f1f8', 0.12, 800, 3); g.fillStyle = '#d8262c'; for (let i = 0; i < 4; i++) g.fillRect(i * 32, h - 14, 16, 10); }
    else { noise(g, w, h, '#a2552d', 0.3, 1400, 4); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, h - 10, w, 10); }
  }, { repeat: true });
}
function checkerTex() {
  return canvasTex(256, 64, (g, w, h) => {
    const s = 16; for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5'; g.fillRect(x * s, y * s, s, s); }
  });
}
function bannerTex(text) {
  return canvasTex(1024, 128, (g, w, h) => {
    const s = 32; for (let y = 0; y < 4; y++) for (let x = 0; x < 32; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5'; g.fillRect(x * s, y * s, s, s); }
    g.fillStyle = '#111'; g.fillRect(180, 10, 664, 108);
    g.font = '800 78px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif';
    g.fillStyle = '#ffd60a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  });
}
function arrowTex() {
  return canvasTex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,150,0,.35)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffe14d'; g.lineWidth = 16; g.lineJoin = 'round'; g.lineCap = 'round';
    for (let k = 0; k < 2; k++) { const y = 70 + k * 128; g.beginPath(); g.moveTo(18, y + 40); g.lineTo(w / 2, y - 20); g.lineTo(w - 18, y + 40); g.stroke(); }
  }, { repeat: true });
}
function windowTex() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#0d0d16'; g.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) {
      const on = r() < 0.42;
      g.fillStyle = on ? ['#ffd98a', '#9fe6ff', '#ff9fe8', '#fff1c9'][(r() * 4) | 0] : '#1b1b2a';
      g.fillRect(x, y, 8, 9);
    }
  }, { repeat: true });
}
export function softTex() {
  if (TEX.soft) return TEX.soft;
  return (TEX.soft = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
}

// ---------------------------------------------------------------- tiras ao longo da pista
function strip(t, offA, offB, y, vScale, mat, { yB = y, close = true } = {}) {
  const N = t.N, pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const k = i % N;
    if (i > 0) s += Math.hypot(t.px[k] - t.px[(k - 1 + N) % N], t.pz[k] - t.pz[(k - 1 + N) % N]);
    pos.push(t.px[k] + t.nx[k] * offA, y, t.pz[k] + t.nz[k] * offA);
    pos.push(t.px[k] + t.nx[k] * offB, yB, t.pz[k] + t.nz[k] * offB);
    uv.push(0, s / vScale, 1, s / vScale);
    if (i < N || close) { const a = i * 2; if (i < N) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  return m;
}
function wallStrip(t, off, height, mat) {
  const N = t.N, pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const k = i % N;
    if (i > 0) s += Math.hypot(t.px[k] - t.px[(k - 1 + N) % N], t.pz[k] - t.pz[(k - 1 + N) % N]);
    const x = t.px[k] + t.nx[k] * off, z = t.pz[k] + t.nz[k] * off;
    pos.push(x, 0, z, x, height, z);
    uv.push(s / 4, 0, s / 4, 1);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// ---------------------------------------------------------------- instâncias de cenário
function scatter(t, count, minD, maxD, seed, extraTest) {
  const r = rng(seed), out = [];
  const b = t.bounds, pad = maxD;
  let tries = 0;
  while (out.length < count && tries++ < count * 40) {
    const x = b.minX - pad + r() * (b.maxX - b.minX + pad * 2);
    const z = b.minZ - pad + r() * (b.maxZ - b.minZ + pad * 2);
    const d = distToTrack(t, x, z, 4);
    if (d < minD || d > maxD) continue;
    if (extraTest && !extraTest(x, z, r)) continue;
    out.push({ x, z, s: 0.7 + r() * 0.7, r: r() * Math.PI * 2, d, rr: r() });
  }
  return out;
}
function instanced(geo, mat, items, fn, { cast = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => { o.position.set(it.x, 0, it.z); o.rotation.set(0, it.r, 0); o.scale.setScalar(it.s); if (fn) fn(o, it); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

function palms(t, group) {
  const items = scatter(t, 140, t.wall + 6, 140, 21);
  const trunk = new THREE.CylinderGeometry(0.25, 0.42, 9, 6); trunk.translate(0, 4.5, 0);
  trunk.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.12, 0, 0, 0));
  group.add(instanced(trunk, new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 1, flatShading: true }), items));
  const leaf = new THREE.ConeGeometry(4.2, 2.6, 7, 1, true); leaf.translate(1.1, 9.2, 0);
  group.add(instanced(leaf, new THREE.MeshStandardMaterial({ color: '#2f8f3b', roughness: 0.8, flatShading: true, side: THREE.DoubleSide }), items));
  const umb = scatter(t, 40, t.wall + 3, 30, 33);
  const cone = new THREE.ConeGeometry(2.2, 0.9, 10); cone.translate(0, 2.8, 0);
  const pole = new THREE.CylinderGeometry(0.06, 0.06, 2.8, 5); pole.translate(0, 1.4, 0);
  group.add(instanced(pole, new THREE.MeshStandardMaterial({ color: '#ddd' }), umb));
  const um = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.6 }), umb.length);
  const o = new THREE.Object3D(); const cols = ['#ff4d6d', '#ffd60a', '#30d158', '#0a84ff', '#ff9f0a'];
  umb.forEach((it, i) => { o.position.set(it.x, 0, it.z); o.scale.setScalar(1); o.rotation.set(0.1, it.r, 0.08); o.updateMatrix(); um.setMatrixAt(i, o.matrix); um.setColorAt(i, new THREE.Color(cols[i % 5])); });
  um.castShadow = true; group.add(um);
}
function ocean(t, group) {
  const b = t.bounds;
  const geo = new THREE.PlaneGeometry(4000, 1600, 80, 30); geo.rotateX(-Math.PI / 2);
  geo.translate((b.minX + b.maxX) / 2, 0.25, b.maxZ + 60 + 800);
  const mat = new THREE.MeshStandardMaterial({ color: '#1f7fb0', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.94, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  const base = geo.attributes.position.array.slice();
  group.add(m);
  // espuma da arrebentação
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(4000, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.6, fog: true }));
  foam.position.set((b.minX + b.maxX) / 2, 0.3, b.maxZ + 62);
  group.add(foam);
  return (time) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) p[i + 1] = base[i + 1] + Math.sin(base[i] * 0.05 + time * 1.3) * 0.35 + Math.cos(base[i + 2] * 0.07 + time) * 0.3;
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
    foam.material.opacity = 0.45 + Math.sin(time * 1.5) * 0.2;
  };
}
function oceanTest(t) { return (x, z) => z < t.bounds.maxZ + 50; }

function buildings(t, group) {
  const items = scatter(t, 240, t.wall + 26, 230, 41);
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const wt = windowTex();
  const mat = new THREE.MeshStandardMaterial({ color: '#30304a', roughness: 0.6, metalness: 0.3, emissive: '#ffffff', emissiveMap: wt, emissiveIntensity: 1.2, map: wt });
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    const w = 10 + it.rr * 18, d = 10 + ((it.rr * 7) % 1) * 18, h = 18 + Math.pow(it.rr, 2) * 90 + (it.d > 60 ? 40 : 0);
    o.position.set(it.x, 0, it.z); o.rotation.set(0, Math.round(it.r / (Math.PI / 2)) * (Math.PI / 2), 0); o.scale.set(w, h, d); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
  });
  m.castShadow = false; m.receiveShadow = false; group.add(m);
  // postes com luz
  const lamps = [];
  for (let i = 0; i < t.N; i += 18) for (const s of [1, -1]) lamps.push({ x: t.px[i] + t.nx[i] * s * (t.wall + 1.2), z: t.pz[i] + t.nz[i] * s * (t.wall + 1.2), s: 1, r: 0 });
  const pole = new THREE.CylinderGeometry(0.12, 0.15, 8, 5); pole.translate(0, 4, 0);
  group.add(instanced(pole, new THREE.MeshStandardMaterial({ color: '#555' }), lamps, null, { cast: false }));
  const head = new THREE.SphereGeometry(0.45, 8, 6); head.translate(0, 8.1, 0);
  group.add(instanced(head, new THREE.MeshBasicMaterial({ color: '#ffe7b0' }), lamps, null, { cast: false }));
  const glow = new THREE.SpriteMaterial({ map: softTex(), color: '#ffcf7a', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  lamps.forEach((l, k) => { if (k % 2) return; const s = new THREE.Sprite(glow); s.position.set(l.x, 8.1, l.z); s.scale.setScalar(5); group.add(s); });
}
function stars(group) {
  const n = 1500, p = new Float32Array(n * 3), r = rng(5);
  for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, ph = r() * Math.PI * 0.45; p[i * 3] = Math.cos(th) * Math.cos(ph) * 1400; p[i * 3 + 1] = Math.sin(ph) * 1400 + 40; p[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * 1400; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false }));
  group.add(s); return s;
}
function pines(t, group) {
  const items = scatter(t, 320, t.wall + 5, 160, 51);
  const trunk = new THREE.CylinderGeometry(0.3, 0.4, 3, 5); trunk.translate(0, 1.5, 0);
  group.add(instanced(trunk, new THREE.MeshStandardMaterial({ color: '#5b3d26', flatShading: true }), items));
  const g1 = new THREE.ConeGeometry(3.4, 5, 7); g1.translate(0, 4.5, 0);
  const g2 = new THREE.ConeGeometry(2.6, 4.2, 7); g2.translate(0, 7.2, 0);
  const g3 = new THREE.ConeGeometry(1.7, 3.4, 7); g3.translate(0, 9.6, 0);
  const green = new THREE.MeshStandardMaterial({ color: '#1f5a3e', flatShading: true, roughness: 0.9 });
  const snow = new THREE.MeshStandardMaterial({ color: '#f4f8ff', flatShading: true, roughness: 0.7 });
  group.add(instanced(g1, green, items)); group.add(instanced(g2, green, items));
  group.add(instanced(g3, snow, items));
  // montanhas
  const b = t.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, R = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 380;
  const r = rng(77);
  const mg = new THREE.ConeGeometry(1, 1, 9, 3);
  const pp = mg.attributes.position; for (let i = 0; i < pp.count; i++) { if (pp.getY(i) < 0.49) { pp.setX(i, pp.getX(i) * (0.85 + r() * 0.3)); pp.setZ(i, pp.getZ(i) * (0.85 + r() * 0.3)); pp.setY(i, pp.getY(i) + (r() - 0.5) * 0.1); } }
  mg.computeVertexNormals(); mg.translate(0, 0.5, 0);
  const mats = new THREE.MeshStandardMaterial({ color: '#c8d3e0', flatShading: true, roughness: 0.95 });
  const ms = [];
  for (let k = 0; k < 26; k++) { const a = (k / 26) * Math.PI * 2 + r() * 0.2; ms.push({ x: cx + Math.cos(a) * (R + r() * 200), z: cz + Math.sin(a) * (R + r() * 200), s: 1, r: r() * 6, h: 140 + r() * 220, w: 150 + r() * 160 }); }
  group.add(instanced(mg, mats, ms, (o, it) => o.scale.set(it.w, it.h, it.w), { cast: false }));
  const cap = mg.clone(); cap.scale(0.42, 0.3, 0.42); cap.translate(0, 0.7, 0);
  group.add(instanced(cap, new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true }), ms, (o, it) => o.scale.set(it.w, it.h, it.w), { cast: false }));
}
function snowfall(group) {
  const n = 2200, p = new Float32Array(n * 3), r = rng(8);
  for (let i = 0; i < n; i++) { p[i * 3] = (r() - 0.5) * 160; p[i * 3 + 1] = r() * 60; p[i * 3 + 2] = (r() - 0.5) * 160; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff', size: 0.35, map: softTex(), transparent: true, depthWrite: false, opacity: 0.9 }));
  group.add(pts);
  return (dt, cam) => {
    const a = g.attributes.position.array;
    for (let i = 0; i < n; i++) {
      a[i * 3 + 1] -= dt * (4 + (i % 7));
      a[i * 3] += Math.sin(i + a[i * 3 + 1] * 0.1) * dt * 0.8;
      if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 60;
    }
    pts.position.set(Math.round(cam.x / 160) * 160, 0, Math.round(cam.z / 160) * 160);
    // repete o volume ao redor da câmera
    g.attributes.position.needsUpdate = true;
  };
}
function desert(t, group) {
  const items = scatter(t, 150, t.wall + 6, 150, 61);
  const trunk = new THREE.CylinderGeometry(0.55, 0.65, 6, 8); trunk.translate(0, 3, 0);
  const arm1 = new THREE.CylinderGeometry(0.38, 0.4, 2.6, 7); arm1.translate(1.3, 3.8, 0);
  const arm1b = new THREE.CylinderGeometry(0.38, 0.38, 1.6, 7); arm1b.rotateZ(Math.PI / 2); arm1b.translate(0.75, 2.6, 0);
  const arm2 = new THREE.CylinderGeometry(0.34, 0.36, 2.0, 7); arm2.translate(-1.15, 4.4, 0);
  const arm2b = new THREE.CylinderGeometry(0.34, 0.34, 1.3, 7); arm2b.rotateZ(Math.PI / 2); arm2b.translate(-0.6, 3.5, 0);
  const cm = new THREE.MeshStandardMaterial({ color: '#4c8a3c', roughness: 0.8 });
  [trunk, arm1, arm1b, arm2, arm2b].forEach((g) => group.add(instanced(g, cm, items)));
  const rocks = scatter(t, 120, t.wall + 4, 90, 63);
  const rg = new THREE.DodecahedronGeometry(1.6, 0);
  group.add(instanced(rg, new THREE.MeshStandardMaterial({ color: '#9b4f2c', flatShading: true }), rocks, (o, it) => o.scale.set(it.s * 1.4, it.s * 0.8, it.s)));
  // mesas
  const b = t.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, R = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 220;
  const r = rng(91), ms = [];
  for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2 + r() * 0.15; ms.push({ x: cx + Math.cos(a) * (R + r() * 260), z: cz + Math.sin(a) * (R + r() * 260), s: 1, r: r() * 6, h: 40 + r() * 110, w: 40 + r() * 90 }); }
  const mg = new THREE.CylinderGeometry(0.85, 1, 1, 8, 4); const pp = mg.attributes.position;
  for (let i = 0; i < pp.count; i++) { const k = 0.9 + r() * 0.2; pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); }
  mg.computeVertexNormals(); mg.translate(0, 0.5, 0);
  group.add(instanced(mg, new THREE.MeshStandardMaterial({ color: '#b5582b', flatShading: true, roughness: 1 }), ms, (o, it) => o.scale.set(it.w, it.h, it.w * 0.8), { cast: false }));
}

// ---------------------------------------------------------------- céu
function sky(theme) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(theme.skyTop) }, mid: { value: new THREE.Color(theme.skyMid) }, bot: { value: new THREE.Color(theme.skyBottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(smoothstep(0.0, 0.6, h), 0.8)) : bot; c = mix(bot, c, smoothstep(-0.02, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), mat);
  m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- mundo
export function createWorld(t) {
  const th = t.def.theme;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
  const skyMesh = sky(th); scene.add(skyMesh);
  const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemi); scene.add(hemi);
  const sun = new THREE.DirectionalLight(th.sunColor, th.sunIntensity);
  const sunDir = new THREE.Vector3(...th.sun).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  // sol visível
  let sunSprite = null;
  if (!th.night) {
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: th.sunColor, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    sunSprite.scale.setScalar(360); scene.add(sunSprite);
  } else {
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: '#cfd8ff', fog: false, depthWrite: false, transparent: true }));
    moon.scale.setScalar(120); sunSprite = moon; scene.add(moon);
  }

  const group = new THREE.Group(); scene.add(group);
  const b = t.bounds;
  // chão
  const gt = groundTex(th.ground); gt.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: th.ground === 'snow' ? 0.7 : 1, color: '#ffffff' }));
  ground.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  ground.receiveShadow = true; group.add(ground);
  // acostamento
  const shoulderMat = new THREE.MeshStandardMaterial({ color: th.ground === 'city' ? '#4a4652' : th.ground === 'snow' ? '#dfe7ef' : th.ground === 'sand' ? '#cfae78' : '#b8784a', roughness: 1 });
  [1, -1].forEach((s) => { const m = strip(t, s * (t.half + 1.3), s * (t.wall + 0.3), 0.012, 6, shoulderMat); m.receiveShadow = true; group.add(m); });
  // asfalto
  const at = asphaltTex(th.night);
  const road = strip(t, t.half, -t.half, 0.03, 14, new THREE.MeshStandardMaterial({ map: at, roughness: th.night ? 0.55 : 0.85, metalness: th.night ? 0.15 : 0 }));
  road.receiveShadow = true; group.add(road);
  // zebras
  const ct = curbTex();
  const curbMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7 });
  [1, -1].forEach((s) => { const m = strip(t, s * t.half, s * (t.half + 1.3), 0.05, 3.2, curbMat, { yB: 0.03 }); m.receiveShadow = true; group.add(m); });
  // muros
  const wt = wallTex(th.wall);
  const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.8, side: THREE.DoubleSide, emissive: th.wall === 'neon' ? '#ffffff' : '#000000', emissiveMap: th.wall === 'neon' ? wt : null, emissiveIntensity: th.wall === 'neon' ? 0.9 : 0 });
  [1, -1].forEach((s) => { const w = wallStrip(t, s * (t.wall + 0.4), th.wall === 'snow' ? 1.4 : 1.1, wallMat); w.castShadow = true; w.receiveShadow = true; group.add(w); });

  // largada
  const i0 = 0;
  const ang = Math.atan2(t.tx[i0], t.tz[i0]);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(t.width, 2.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: 0.8 }));
  line.position.set(t.px[i0], 0.06, t.pz[i0]); line.rotation.y = ang + Math.PI / 2; line.receiveShadow = true;
  const lineHolder = new THREE.Group(); lineHolder.position.copy(line.position); lineHolder.rotation.y = ang; line.position.set(0, 0, 0); line.rotation.set(0, 0, 0);
  line.geometry = new THREE.PlaneGeometry(t.width, 2.4).rotateX(-Math.PI / 2); lineHolder.add(line);
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#d8d8dc', metalness: 0.5, roughness: 0.35 });
  [1, -1].forEach((s) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8, 0.9), pillarMat); p.position.set(s * (t.half + 3), 4, 0); p.castShadow = true; lineHolder.add(p); });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(t.width + 7, 2.2, 0.8), [pillarMat, pillarMat, pillarMat, pillarMat, new THREE.MeshBasicMaterial({ map: bannerTex('LARGADA') }), new THREE.MeshBasicMaterial({ map: bannerTex('LARGADA') })]);
  beam.position.set(0, 8, 0); beam.castShadow = true; lineHolder.add(beam);
  group.add(lineHolder);

  // pads de turbo
  const padTex = arrowTex();
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, fog: true });
  for (const p of t.pads) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 7).rotateX(-Math.PI / 2), padMat);
    m.position.set(t.px[p.i] + t.nx[p.i] * p.lat, 0.07, t.pz[p.i] + t.nz[p.i] * p.lat);
    m.rotation.y = Math.atan2(t.tx[p.i], t.tz[p.i]) + Math.PI;
    group.add(m);
  }

  // cenário temático
  let anim = null, snowAnim = null, starPts = null;
  if (t.def.id === 'praia') { palms(t, group); anim = ocean(t, group); }
  if (t.def.id === 'cidade') { buildings(t, group); starPts = stars(group); }
  if (t.def.id === 'neve') { pines(t, group); snowAnim = snowfall(group); }
  if (t.def.id === 'deserto') { desert(t, group); }

  let time = 0;
  function update(dt, camPos, focus) {
    time += dt;
    skyMesh.position.copy(camPos);
    if (starPts) starPts.position.copy(camPos);
    sunSprite.position.copy(camPos).addScaledVector(sunDir, 1500);
    sun.position.copy(focus).addScaledVector(sunDir, 150);
    sun.target.position.copy(focus);
    padTex.offset.y = (padTex.offset.y - dt * 1.8) % 1;
    if (anim) anim(time);
    if (snowAnim) snowAnim(dt, camPos);
  }
  return { scene, update, sun };
}

// ---------------------------------------------------------------- carros
const bodyShape = (() => {
  const s = new THREE.Shape();
  const P = [[-2.25, 0.32], [2.15, 0.32], [2.3, 0.5], [2.25, 0.68], [1.55, 0.86], [0.55, 0.98], [-0.05, 1.42], [-1.0, 1.44], [-1.75, 1.05], [-2.28, 0.98], [-2.32, 0.6]];
  s.moveTo(P[0][0], P[0][1]); P.slice(1).forEach((p) => s.lineTo(p[0], p[1])); s.closePath();
  return s;
})();
const glassShape = (() => {
  const s = new THREE.Shape();
  const P = [[0.5, 0.99], [-0.05, 1.38], [-0.98, 1.4], [-1.66, 1.04]];
  s.moveTo(P[0][0], P[0][1]); P.slice(1).forEach((p) => s.lineTo(p[0], p[1])); s.closePath();
  return s;
})();
let carGeo = null;
function carGeos() {
  if (carGeo) return carGeo;
  const body = new THREE.ExtrudeGeometry(bodyShape, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 3, curveSegments: 4 });
  body.translate(0, 0, -0.92); body.rotateY(-Math.PI / 2); // comprimento no eixo z, frente em +z
  const glass = new THREE.ExtrudeGeometry(glassShape, { depth: 1.9, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  glass.translate(0, 0.01, -0.95); glass.rotateY(-Math.PI / 2);
  const tire = new THREE.CylinderGeometry(0.4, 0.4, 0.34, 18); tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.26, 0.26, 0.36, 10); rim.rotateZ(Math.PI / 2);
  const spoiler = new THREE.BoxGeometry(2.0, 0.07, 0.42);
  const strut = new THREE.BoxGeometry(0.08, 0.32, 0.18);
  const light = new THREE.BoxGeometry(0.5, 0.14, 0.06);
  const flame = new THREE.ConeGeometry(0.16, 1.1, 8); flame.rotateX(-Math.PI / 2); flame.translate(0, 0, -0.55);
  const stripe = new THREE.BoxGeometry(0.34, 0.02, 4.3);
  return (carGeo = { body, glass, tire, rim, spoiler, strut, light, flame, stripe });
}

export function createCarMesh(color, envMap) {
  const G = carGeos();
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMap, envMapIntensity: 1.1 });
  const body = new THREE.Mesh(G.body, paint); body.castShadow = true; body.receiveShadow = true;
  const glass = new THREE.Mesh(G.glass, new THREE.MeshPhysicalMaterial({ color: '#0b1018', metalness: 0.9, roughness: 0.05, envMap, envMapIntensity: 1.4 }));
  const stripe = new THREE.Mesh(G.stripe, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
  stripe.position.set(0, 0.99, 0.15); stripe.scale.set(1, 1, 0.98);
  const stripeH = new THREE.Mesh(G.stripe, stripe.material); stripeH.position.set(0, 0.9, 1.15); stripeH.scale.set(1, 1, 0.24); stripeH.rotation.x = 0.12;
  g.add(body, glass, stripeH);
  const dark = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.6 });
  const sp = new THREE.Mesh(G.spoiler, paint); sp.position.set(0, 1.42, -2.0); sp.castShadow = true;
  [-0.7, 0.7].forEach((x) => { const s = new THREE.Mesh(G.strut, dark); s.position.set(x, 1.22, -2.0); g.add(s); });
  g.add(sp);
  const head = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff6d8', emissiveIntensity: 1.5 });
  const tail = new THREE.MeshStandardMaterial({ color: '#600', emissive: '#ff1a1a', emissiveIntensity: 0.6 });
  [-0.62, 0.62].forEach((x) => {
    const h = new THREE.Mesh(G.light, head); h.position.set(x, 0.66, 2.3); g.add(h);
    const tl = new THREE.Mesh(G.light, tail); tl.position.set(x, 0.78, -2.37); g.add(tl);
  });
  const tireM = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 });
  const rimM = new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.9, roughness: 0.25, envMap });
  const wheels = [], steerers = [];
  [[0.98, 1.38], [-0.98, 1.38], [0.98, -1.4], [-0.98, -1.4]].forEach(([x, z], k) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.4, z);
    const w = new THREE.Group();
    const t1 = new THREE.Mesh(G.tire, tireM); t1.castShadow = true;
    const r1 = new THREE.Mesh(G.rim, rimM);
    w.add(t1, r1); pivot.add(w); g.add(pivot);
    wheels.push(w); if (k < 2) steerers.push(pivot);
  });
  // chamas do turbo
  const flameM = new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [-0.45, 0.45].map((x) => { const f = new THREE.Mesh(G.flame, flameM); f.position.set(x, 0.5, -2.35); f.visible = false; g.add(f); return f; });
  // sombra de contato
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softTex(), color: '#000', transparent: true, opacity: 0.45, depthWrite: false }));
  blob.position.y = 0.04; g.add(blob);

  let spin = 0;
  return {
    group: g, paint,
    update(car, dt, braking) {
      g.position.set(car.x, 0, car.z);
      g.rotation.y = car.h;
      // inclinação na curva e na frenagem
      const roll = -(car.steer || 0) * Math.min(1, Math.abs(car.speed) / 40) * 0.05 + (car.drifting ? car.driftDir * 0.03 : 0);
      body.rotation.z = glass.rotation.z = roll;
      spin += (car.speed / 0.4) * dt;
      wheels.forEach((w) => (w.rotation.x = spin));
      steerers.forEach((p) => (p.rotation.y = -(car.steer || 0) * 0.45));
      tail.emissiveIntensity = braking ? 3.2 : 0.6;
      const b = car.boost > 0;
      flames.forEach((f) => { f.visible = b; if (b) { const s = 0.8 + Math.random() * 0.6; f.scale.set(1, 1, s); } });
    },
  };
}

export function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 30px -apple-system, "SF Pro Text", Helvetica, Arial, sans-serif';
  const w = Math.min(240, g.measureText(name).width + 44);
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 46, 23); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc((256 - w) / 2 + 22, 31, 8, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(name, (256 - w) / 2 + 36, 32, w - 46);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  s.scale.set(4.4, 1.1, 1); s.position.y = 2.6; s.renderOrder = 10;
  return s;
}

// ---------------------------------------------------------------- partículas (fumaça/poeira)
export class Smoke {
  constructor(scene, color) {
    this.pool = [];
    const mat = new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(mat.clone()); s.visible = false; scene.add(s);
      this.pool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
    }
    this.k = 0;
  }
  emit(x, y, z, vx, vz, size = 1, life = 0.9, alpha = 0.55) {
    const p = this.pool[this.k++ % this.pool.length];
    p.s.visible = true; p.s.position.set(x, y, z); p.life = 0; p.max = life; p.size = size; p.alpha = alpha;
    p.vx = vx + (Math.random() - 0.5) * 2; p.vy = 0.8 + Math.random(); p.vz = vz + (Math.random() - 0.5) * 2;
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.life += dt;
      if (p.life >= p.max) { p.s.visible = false; continue; }
      const f = p.life / p.max;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.vx *= 0.96; p.vz *= 0.96;
      p.s.scale.setScalar(p.size * (1 + f * 3));
      p.s.material.opacity = p.alpha * (1 - f);
    }
  }
}
