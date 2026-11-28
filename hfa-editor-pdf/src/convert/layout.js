// Análise de layout de uma página lida por pdfread.js:
// caracteres -> trechos de linha -> parágrafos; vetores -> tabelas, sublinhados e figuras.
// Funções puras (sem DOM), para poderem ser testadas isoladamente.

// ---------- fontes ----------
const KNOWN = {
  timesnewroman: 'Times New Roman', times: 'Times New Roman', timesroman: 'Times New Roman', tinos: 'Times New Roman', liberationserif: 'Times New Roman', nimbusroman: 'Times New Roman',
  arial: 'Arial', helvetica: 'Arial', helveticaneue: 'Arial', arimo: 'Arial', liberationsans: 'Arial', nimbussans: 'Arial',
  couriernew: 'Courier New', courier: 'Courier New', cousine: 'Courier New', liberationmono: 'Courier New', nimbusmono: 'Courier New',
  calibri: 'Calibri', carlito: 'Calibri', calibrilight: 'Calibri Light', cambria: 'Cambria', caladea: 'Cambria', cambriamath: 'Cambria Math',
  candara: 'Candara', consolas: 'Consolas', constantia: 'Constantia', corbel: 'Corbel', georgia: 'Georgia', verdana: 'Verdana', tahoma: 'Tahoma',
  trebuchetms: 'Trebuchet MS', trebuchet: 'Trebuchet MS', segoeui: 'Segoe UI', garamond: 'Garamond', bookantiqua: 'Book Antiqua',
  palatinolinotype: 'Palatino Linotype', palatino: 'Palatino Linotype', centurygothic: 'Century Gothic', century: 'Century', aptos: 'Aptos',
  arialnarrow: 'Arial Narrow', arialblack: 'Arial Black', lucidaconsole: 'Lucida Console', lucidasans: 'Lucida Sans', symbol: 'Symbol',
  wingdings: 'Wingdings', dejavusans: 'DejaVu Sans', dejavuserif: 'DejaVu Serif', dejavusansmono: 'DejaVu Sans Mono', inter: 'Inter',
  roboto: 'Roboto', opensans: 'Open Sans', lato: 'Lato', montserrat: 'Montserrat', sourcesanspro: 'Source Sans Pro', notosans: 'Noto Sans', notoserif: 'Noto Serif',
};
const STYLE_WORDS = /(regular|bold|italic|oblique|semibold|demibold|demi|black|heavy|medium|light|thin|book|roman|condensed|narrow|extrabold|ultrabold|mt|psmt|ps)$/i;

/** Nome da fonte no PDF -> { family, bold, italic } para o Word. */
export function wordFont(info) {
  const raw = ((info && info.name) || '').replace(/^[A-Z]{6}\+/, '');
  const lower = raw.toLowerCase();
  const bold = !!(info && info.bold) || /bold|black|heavy|semibold|demi/.test(lower);
  const italic = !!(info && info.italic) || /italic|oblique|kursiv/.test(lower);
  let base = raw.split(/[,-]/)[0].replace(/_/g, '');
  let key = base.toLowerCase().replace(/\s+/g, '');
  for (let k = 0; k < 4 && !KNOWN[key] && STYLE_WORDS.test(key); k++) { key = key.replace(STYLE_WORDS, ''); base = base.replace(STYLE_WORDS, ''); }
  if (lower.startsWith('calibri') && /light/.test(lower)) return { family: 'Calibri Light', bold, italic };
  if (KNOWN[key]) return { family: KNOWN[key], bold, italic };
  if (/^(f|t|tt|c|r)\d+(_\d+)?$/i.test(base) || base.length < 3 || /^g_d/i.test(base)) {
    const fam = info && info.mono ? 'Courier New' : info && info.serif ? 'Times New Roman' : 'Arial';
    return { family: fam, bold, italic };
  }
  // "OpenSans" -> "Open Sans"
  return { family: base.replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'Arial', bold, italic };
}

// ---------- texto ----------
const LIG = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
// caracteres da área privada usados pelas fontes Symbol/Wingdings em marcadores de lista
export const PUA = {
  '\uf0b7': '•', '\uf0a7': '▪', '\uf06e': '■', '\uf0a8': '□', '\uf0d8': '➢', '\uf0e8': '➔', '\uf0fc': '✓', '\uf0fb': '✗', '\uf076': '❖',
  '\uf06f': '○', '\uf06c': '●', '\uf0b2': '◆', '\uf0a2': '◦', '\uf02d': '–', '\uf0be': '—', '\uf0e0': '→', '\uf0f0': '⇨', '\uf0d2': '®', '\uf0d3': '©', '\uf0e4': '™',
};
const cleanCh = (c) => LIG[c] || PUA[c] || c.replace(/ /g, ' ');
const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

/** Remove cópias do mesmo caractere desenhadas quase no mesmo lugar (negrito falso). */
function dedupe(gs) {
  const out = [];
  const byKey = new Map();
  for (const g of gs) {
    const k = g.ch;
    const list = byKey.get(k);
    const tol = 0.16 * g.size;
    const prev = list && list.find((p) => Math.abs(p.g.x - g.x) < tol && Math.abs(p.g.y - g.y) < tol && Math.abs(p.g.size - g.size) < 0.1 * g.size);
    if (prev) {
      // mesma cor: negrito falso; cor diferente: sombra -> fica a cópia de cima (a última desenhada)
      if (prev.g.color === g.color) prev.g.fakeBold = true;
      else { out[prev.i] = g; prev.g = g; }
      continue;
    }
    const rec = { g, i: out.length };
    if (list) list.push(rec); else byKey.set(k, [rec]);
    out.push(g);
  }
  return out;
}

/**
 * Agrupa caracteres (já sem rotação) em linhas pela linha de base.
 * Índices e expoentes menores, colados a um texto maior, entram na linha dele.
 */
export function buildLines(glyphs) {
  const gs = dedupe(glyphs.filter((g) => g.size > 0.5)).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const g of gs) {
    let best = null, bd = Infinity;
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 8; i--) {
      const L = lines[i];
      const d = Math.abs(L.y - g.y);
      if (d <= 0.28 * Math.min(L.size, g.size) + 0.3 && d < bd) { best = L; bd = d; }
    }
    if (best) { best.glyphs.push(g); if (g.size > best.size) best.size = g.size; if (!g.space) best.ySum += g.y * g.size, best.wSum += g.size; }
    else lines.push({ y: g.y, size: g.size, glyphs: [g], ySum: g.space ? 0 : g.y * g.size, wSum: g.space ? 0 : g.size });
  }
  for (const L of lines) { if (L.wSum) L.y = L.ySum / L.wSum; L.glyphs.sort((a, b) => a.x - b.x); }
  // expoentes/índices: linha só com caracteres pequenos, encostada numa linha maior
  const big = lines.filter((L) => L.glyphs.some((g) => !g.space));
  for (const S of big.slice()) {
    if (S.glyphs.length > 12) continue;
    const host = big.find((L) => L !== S && S.size < 0.85 * L.size && Math.abs(S.y - L.y) < 0.55 * L.size
      && S.glyphs.every((g) => L.glyphs.some((h) => !h.space && Math.abs(g.x - (h.x + h.w)) < 0.6 * L.size || Math.abs(h.x - (g.x + g.w)) < 0.6 * L.size)));
    if (host) { host.glyphs.push(...S.glyphs); host.glyphs.sort((a, b) => a.x - b.x); S.glyphs = []; }
  }
  return lines.filter((L) => L.glyphs.some((g) => !g.space)).map((L) => finishLine(L));
}
function finishLine(L) {
  const solid = L.glyphs.filter((g) => !g.space);
  const sizes = solid.map((g) => g.size);
  L.size = median(sizes) || L.size;
  // tamanho dominante pelo número de caracteres
  const cnt = new Map(); for (const s of sizes) { const k = Math.round(s * 2) / 2; cnt.set(k, (cnt.get(k) || 0) + 1); }
  L.size = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const main = solid.filter((g) => Math.abs(g.size - L.size) < 0.15 * L.size);
  if (main.length) L.y = median(main.map((g) => g.y));
  L.x0 = Math.min(...solid.map((g) => g.x)); L.x1 = Math.max(...solid.map((g) => g.x + g.w));
  L.top = L.y - 0.8 * L.size; L.bottom = L.y + 0.25 * L.size;
  return L;
}

export const MARKER = /^([•◦▪▫■□●○‣⁃∙·\-–—*➢➤►▶✓✔❖➔→☐☑☒]|\(?\d{1,3}[.)]|\(?\d{1,2}(\.\d{1,2}){1,3}\.?|\(?[a-zA-Z][.)]|\(?[ivxlcdmIVXLCDM]{1,5}[.)])$/;

/** Divide a linha onde há um espaço grande (colunas, tabulação) ou uma régua vertical. */
export function splitSegments(line, vrules = []) {
  const segs = [];
  let cur = null, lastEnd = -Infinity, sawSpace = false, nat = 0;
  for (const g of line.glyphs) {
    if (g.space) { sawSpace = true; nat = Math.max(nat, g.nat || 0); continue; }
    const gap = g.x - lastEnd;
    const crossRule = cur && vrules.some((r) => r.x > lastEnd - 0.5 && r.x < g.x + 0.5 && r.y0 < line.y && r.y1 > line.y - 0.6 * line.size);
    const big = sawSpace ? gap > 3 * line.size : gap > 1.25 * line.size;
    const back = cur && gap < -0.3 * Math.min(g.size, line.size); // texto sobreposto: trecho separado
    // marcador sozinho no começo (•, ☐, 1.) fica no mesmo trecho do texto: vira lista com tabulação
    const markOnly = cur && !crossRule && !back && gap < 4 * line.size && MARKER.test(cur.glyphs.filter((q) => !q.space).map((q) => q.ch).join(''));
    if (!cur || crossRule || back || (big && !markOnly)) { cur = { glyphs: [], y: line.y, size: line.size }; segs.push(cur); }
    else if (sawSpace || gap > 0.22 * Math.min(line.size, g.size)) cur.glyphs.push({ space: true, x: lastEnd, w: Math.max(0, gap), nat, ch: ' ', size: g.size });
    cur.glyphs.push(g); lastEnd = g.x + g.w; sawSpace = false; nat = 0;
  }
  for (const s of segs) {
    const solid = s.glyphs.filter((g) => !g.space);
    s.x0 = Math.min(...solid.map((g) => g.x)); s.x1 = Math.max(...solid.map((g) => g.x + g.w));
    s.top = s.y - 0.8 * s.size; s.bottom = s.y + 0.25 * s.size;
    s.text = s.glyphs.map((g) => cleanCh(g.ch)).join('');
  }
  return segs;
}

const BULLET = /^\s*([•◦▪▫■□●○‣⁃∙·\-–—*➢➤►▶✓✔☐☑☒]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|[ivxlcdm]{1,5}[.)])\s/i;
const firstWordW = (s) => {
  let w = 0;
  for (const g of s.glyphs) { if (g.space) break; w = g.x + g.w - s.x0; }
  return w;
};

/**
 * Junta trechos de linhas consecutivas em parágrafos.
 * region: { x0, x1 } (margens do texto da página ou da célula)
 */
export function buildParagraphs(segs, region) {
  const sorted = segs.slice().sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const paras = [];
  const open = []; // parágrafos que ainda podem receber linhas
  const width = region.x1 - region.x0;
  for (const s of sorted) {
    let target = null;
    for (const P of open) {
      const A = P.segs[P.segs.length - 1];
      const pitch = s.y - A.y;
      if (pitch <= 0.5 * A.size) continue;
      if (Math.abs(s.size - A.size) > 0.16 * A.size) continue;
      if (pitch < 0.9 * A.size || pitch > 1.8 * A.size) continue;
      if (P.segs.length >= 2 && Math.abs(pitch - P.pitch) > 0.12 * P.pitch + 0.6) continue;
      if (s.x1 < A.x0 - 1 || s.x0 > A.x1 + 1) continue; // sem sobreposição horizontal
      if (BULLET.test(s.text)) continue;
      const leftOk = Math.abs(s.x0 - P.bodyLeft) < 2.5
        || (P.segs.length === 1 && s.x0 < A.x0 - 2 && A.x0 - s.x0 < 8 * A.size) // recuo de primeira linha
        || (P.segs.length === 1 && s.x0 > A.x0 + 2 && hangStart(A, s.x0)); // recuo deslocado (lista)
      const centered = Math.abs((s.x0 + s.x1) / 2 - (A.x0 + A.x1) / 2) < 2.5 && (P.align === 'center' || P.segs.length === 1);
      if (!leftOk && !centered) continue;
      const free = centered && !leftOk ? width - (A.x1 - A.x0) : region.x1 - A.x1;
      if (free > firstWordW(s) + 0.5 * A.size) continue; // a linha anterior não estava cheia
      target = P; if (centered && !leftOk) P.align = 'center';
      break;
    }
    if (target) {
      if (target.segs.length === 1) { target.pitch = s.y - target.segs[0].y; target.bodyLeft = s.x0; }
      target.segs.push(s);
    } else {
      const P = { segs: [s], bodyLeft: s.x0, pitch: 0, align: null };
      paras.push(P); open.push(P);
    }
    // parágrafos cuja última linha ficou muito acima não recebem mais nada
    for (let i = open.length - 1; i >= 0; i--) { const A = open[i].segs[open[i].segs.length - 1]; if (s.y - A.y > 2 * A.size) open.splice(i, 1); }
  }
  for (const P of paras) finishPara(P, region);
  return paras.sort((a, b) => a.top - b.top || a.x0 - b.x0);
}
function hangStart(A, x) {
  // a linha seguinte começa onde começa a segunda palavra da anterior (marcador de lista)
  let seenSpace = false;
  for (const g of A.glyphs) { if (g.space) { seenSpace = true; continue; } if (seenSpace) return Math.abs(g.x - x) < 2.5; }
  return false;
}
/** Altura "exata" mínima para a linha não ter o topo cortado (expoentes, letras maiores). */
export function needL(seg) {
  let up = 0;
  for (const g of seg.glyphs) if (!g.space) up = Math.max(up, seg.y - g.y + 0.95 * g.size);
  return up / 0.8;
}
function finishPara(P, region) {
  const S = P.segs, n = S.length;
  P.size = median(S.map((s) => s.size));
  P.x0 = Math.min(...S.map((s) => s.x0)); P.x1 = Math.max(...S.map((s) => s.x1));
  P.firstX = S[0].x0; P.bodyLeft = n > 1 ? median(S.slice(1).map((s) => s.x0)) : S[0].x0;
  P.L = n > 1 ? median(S.slice(1).map((s, i) => s.y - S[i].y)) : Math.max(Math.round(P.size * 1.2 * 100) / 100, needL(S[0]));
  P.top = S[0].y - 0.8 * P.L;
  P.bottom = P.top + n * P.L;
  if (!P.align) {
    const rc = (region.x0 + region.x1) / 2;
    if (n > 1) {
      const rights = S.slice(0, -1).map((s) => s.x1), lefts = S.slice(1).map((s) => s.x0);
      const centers = S.map((s) => (s.x0 + s.x1) / 2);
      const spread = (a) => Math.max(...a) - Math.min(...a);
      if (spread(rights) < 2 && spread(lefts) < 2.5 && Math.max(...rights) > region.x1 - 3 && S.slice(0, -1).some((s) => s.glyphs.some((g) => g.space))) {
        P.align = S[n - 1].x1 < Math.max(...rights) - 2 || n > 2 ? 'justify' : 'left';
      } else if (spread(centers) < 2.5 && spread(S.map((s) => s.x0)) > 3) P.align = 'center';
      else if (spread(S.map((s) => s.x1)) < 2 && spread(S.map((s) => s.x0)) > 3) P.align = 'right';
      else P.align = 'left';
    } else {
      const s = S[0], c = (s.x0 + s.x1) / 2;
      if (Math.abs(c - rc) < 3 && s.x0 - region.x0 > 12) P.align = 'center';
      else if (Math.abs(s.x1 - region.x1) < 3 && s.x0 - region.x0 > 30) P.align = 'right';
      else P.align = 'left';
    }
  }
}

// ---------- vetores ----------
export const isWhite = (c) => !c || (/^#[0-9a-f]{6}$/i.test(c) && [1, 3, 5].every((i) => parseInt(c.slice(i, i + 2), 16) > 245));

/** Extrai réguas horizontais/verticais e retângulos preenchidos dos caminhos. */
export function rulesOf(paths) {
  const H = [], V = [], shades = [], J = [];
  paths.forEach((p, pi) => {
    if (p.curve) return;
    const strokeOk = p.stroke && p.strokeAlpha > 0.1 && !isWhite(p.stroke);
    const fillOk = p.fill && p.fillAlpha > 0.1;
    p.subpaths.forEach((sp) => {
      if (sp.length < 2) return;
      const xs = sp.map((q) => q.x), ys = sp.map((q) => q.y);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const axis = sp.every((q, i) => i === 0 || Math.abs(q.x - sp[i - 1].x) < 0.6 || Math.abs(q.y - sp[i - 1].y) < 0.6);
      if (fillOk && axis && sp.length >= 4) {
        const w = bx1 - bx0, h = by1 - by0;
        if (w <= 3 && h <= 3) { J.push({ x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, pi }); return; } // cruzamento de bordas
        if (isWhite(p.fill)) { if (w > 3 && h > 3) shades.push({ bbox: [bx0, by0, bx1, by1], color: '#ffffff', pi, white: true }); return; }
        if (h <= 2.6 && w > 3) { H.push({ y: (by0 + by1) / 2, x0: bx0, x1: bx1, width: Math.max(0.25, h), color: p.fill, pi }); return; }
        if (w <= 2.6 && h > 3) { V.push({ x: (bx0 + bx1) / 2, y0: by0, y1: by1, width: Math.max(0.25, w), color: p.fill, pi }); return; }
        shades.push({ bbox: [bx0, by0, bx1, by1], color: p.fill, pi });
        if (!strokeOk) return;
      }
      if (!strokeOk) return;
      for (let i = 1; i < sp.length; i++) {
        const a = sp[i - 1], b = sp[i];
        if (Math.abs(a.y - b.y) < 0.6 && Math.abs(a.x - b.x) > 1.5) H.push({ y: (a.y + b.y) / 2, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), width: p.lineWidth, color: p.stroke, dash: p.dash, pi });
        else if (Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) > 1.5) V.push({ x: (a.x + b.x) / 2, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), width: p.lineWidth, color: p.stroke, dash: p.dash, pi });
      }
    });
  });
  return { H, V, shades, J };
}

function mergeSegs(list, pos, a0, a1, tol = 1.2) {
  const s = list.slice().sort((p, q) => p[pos] - q[pos] || p[a0] - q[a0]);
  const out = [];
  for (const r of s) {
    const last = out.find((o) => Math.abs(o[pos] - r[pos]) <= tol && r[a0] <= o[a1] + 1.5 && r[a1] >= o[a0] - 1.5);
    if (last) { last[a0] = Math.min(last[a0], r[a0]); last[a1] = Math.max(last[a1], r[a1]); last.pis.add(r.pi); last.width = Math.max(last.width, r.width); }
    else out.push({ ...r, pis: new Set([r.pi]) });
  }
  return out;
}
function cluster(vals, tol) {
  const s = vals.slice().sort((a, b) => a - b), out = [];
  for (const v of s) { const l = out[out.length - 1]; if (l && v - l.max <= tol) { l.max = v; l.sum += v; l.n++; } else out.push({ min: v, max: v, sum: v, n: 1 }); }
  return out.map((c) => c.sum / c.n);
}

function squeeze(v, min = 3.5) {
  const out = v.slice();
  for (let i = 1; i < out.length;) {
    if (out[i] - out[i - 1] < min) { if (i === out.length - 1) out.splice(i - 1, 1); else out.splice(i, 1); } else i++;
  }
  return out;
}

/**
 * Encontra tabelas desenhadas com réguas. Cada tabela:
 * { bbox, xs, ys, regions: [{ r0, r1, c0, c1, borders, shade }], pis: Set (caminhos usados) }
 */
export function detectTables(rules, pageW, pageH, textBoxes = []) {
  const H = mergeSegs(rules.H, 'y', 'x0', 'x1'), V = mergeSegs(rules.V, 'x', 'y0', 'y1');
  const n = H.length + V.length, parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < H.length; i++) {
    for (let j = 0; j < V.length; j++) {
      const h = H[i], v = V[j];
      if (v.x >= h.x0 - 2.5 && v.x <= h.x1 + 2.5 && h.y >= v.y0 - 2.5 && h.y <= v.y1 + 2.5) parent[find(i)] = find(H.length + j);
    }
  }
  const comps = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!comps.has(r)) comps.set(r, { H: [], V: [] }); (i < H.length ? comps.get(r).H : comps.get(r).V).push(i < H.length ? H[i] : V[i - H.length]); }
  const tables = [];
  for (const c of comps.values()) {
    if (c.H.length < 2 || c.V.length < 2) continue;
    const x0 = Math.min(...c.H.map((h) => h.x0), ...c.V.map((v) => v.x)), x1 = Math.max(...c.H.map((h) => h.x1), ...c.V.map((v) => v.x));
    const y0 = Math.min(...c.V.map((v) => v.y0), ...c.H.map((h) => h.y)), y1 = Math.max(...c.V.map((v) => v.y1), ...c.H.map((h) => h.y));
    if (x1 - x0 < 15 || y1 - y0 < 6) continue;
    // linhas de grade quase coladas (bordas duplas, barras decorativas) viram uma só:
    // colunas ou linhas de 1-3 pt quebram a tabela no Word
    const xs = squeeze(cluster([x0, x1, ...c.V.map((v) => v.x)], 1.6)), ys = squeeze(cluster([y0, y1, ...c.H.map((h) => h.y)], 1.6));
    const R = ys.length - 1, C = xs.length - 1;
    if (R < 1 || C < 1 || R * C > 4000) continue;
    // moldura da página inteira não é tabela
    if (R === 1 && C === 1 && (x1 - x0) * (y1 - y0) > 0.45 * pageW * pageH) continue;
    // gráficos (muitas linhas sem texto) não são tabela
    const inside = textBoxes.filter((b) => b[0] >= x0 - 1 && b[2] <= x1 + 1 && b[1] >= y0 - 1 && b[3] <= y1 + 1).length;
    if (!inside && R * C > 1) continue;
    const covH = (y, a, b) => { let best = null; for (const h of c.H) if (Math.abs(h.y - y) < 3.6) { const ov = Math.min(b, h.x1) - Math.max(a, h.x0); if (ov >= 0.7 * (b - a)) best = h; } return best; };
    const covV = (x, a, b) => { let best = null; for (const v of c.V) if (Math.abs(v.x - x) < 3.6) { const ov = Math.min(b, v.y1) - Math.max(a, v.y0); if (ov >= 0.7 * (b - a)) best = v; } return best; };
    const hE = [], vE = [];
    for (let r = 0; r <= R; r++) { hE[r] = []; for (let k = 0; k < C; k++) hE[r][k] = covH(ys[r], xs[k], xs[k + 1]); }
    for (let r = 0; r < R; r++) { vE[r] = []; for (let k = 0; k <= C; k++) vE[r][k] = covV(xs[k], ys[r], ys[r + 1]); }
    // células unidas: sem régua entre elas
    const id = (r, k) => r * C + k, par = Array.from({ length: R * C }, (_, i) => i);
    const f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
    for (let r = 0; r < R; r++) for (let k = 0; k < C; k++) {
      if (k + 1 < C && !vE[r][k + 1]) par[f(id(r, k + 1))] = f(id(r, k));
      if (r + 1 < R && !hE[r + 1][k]) par[f(id(r + 1, k))] = f(id(r, k));
    }
    const groups = new Map();
    for (let r = 0; r < R; r++) for (let k = 0; k < C; k++) { const g = f(id(r, k)); if (!groups.has(g)) groups.set(g, []); groups.get(g).push([r, k]); }
    const regions = [];
    for (const cells of groups.values()) {
      const r0 = Math.min(...cells.map((q) => q[0])), r1 = Math.max(...cells.map((q) => q[0])), c0 = Math.min(...cells.map((q) => q[1])), c1 = Math.max(...cells.map((q) => q[1]));
      if (cells.length === (r1 - r0 + 1) * (c1 - c0 + 1)) regions.push({ r0, r1, c0, c1 });
      else cells.forEach(([r, k]) => regions.push({ r0: r, r1: r, c0: k, c1: k }));
    }
    const bd = (s) => (s ? { width: s.width, color: s.color, dash: s.dash } : null);
    for (const g of regions) {
      g.bbox = [xs[g.c0], ys[g.r0], xs[g.c1 + 1], ys[g.r1 + 1]];
      g.borders = { top: bd(hE[g.r0][g.c0]), bottom: bd(hE[g.r1 + 1][g.c0]), left: bd(vE[g.r0][g.c0]), right: bd(vE[g.r0][g.c1 + 1]) };
    }
    const pis = new Set(); c.H.forEach((h) => h.pis.forEach((p) => pis.add(p))); c.V.forEach((v) => v.pis.forEach((p) => pis.add(p)));
    (rules.J || []).forEach((j) => { if (j.x >= x0 - 2 && j.x <= x1 + 2 && j.y >= y0 - 2 && j.y <= y1 + 2) pis.add(j.pi); });
    // preenchimentos de célula
    for (const sh of rules.shades) {
      const [a, b, cc, d] = sh.bbox;
      if (a < x0 - 2 || cc > x1 + 2 || b < y0 - 2 || d > y1 + 2) continue;
      let used = false;
      for (const g of regions) {
        const [gx0, gy0, gx1, gy1] = g.bbox;
        const ov = Math.max(0, Math.min(cc, gx1) - Math.max(a, gx0)) * Math.max(0, Math.min(d, gy1) - Math.max(b, gy0));
        if (ov > 0.8 * (gx1 - gx0) * (gy1 - gy0)) { if (!sh.white) g.shade = sh.color; used = true; }
      }
      if (used) pis.add(sh.pi);
    }
    tables.push({ bbox: [x0, y0, x1, y1], xs, ys, regions, pis });
  }
  return tables;
}

/**
 * Sublinhados e tachados: réguas finas logo abaixo (ou no meio) do texto.
 * Marca os caracteres (g.underline / g.strike) e devolve os índices dos caminhos usados.
 */
export function markDecorations(lines, rules) {
  const used = new Set();
  for (const h of rules.H) {
    if (h.width > 2.2) continue;
    for (const L of lines) {
      const dy = h.y - L.y;
      const under = dy >= -0.05 * L.size && dy <= 0.35 * L.size;
      const strike = dy <= -0.15 * L.size && dy >= -0.45 * L.size;
      if (!under && !strike) continue;
      if (h.width > 0.2 * L.size) continue;
      const hit = L.glyphs.filter((g) => !g.space && g.x + g.w / 2 >= h.x0 - 0.5 && g.x + g.w / 2 <= h.x1 + 0.5);
      const covered = hit.reduce((a, g) => a + g.w, 0);
      if (!hit.length || covered < 0.5 * (h.x1 - h.x0)) continue;
      hit.forEach((g) => { if (under) g.underline = true; else g.strike = true; });
      L.glyphs.forEach((g) => { if (g.space && g.x >= h.x0 && g.x + g.w <= h.x1 + 0.5) { if (under) g.underline = true; else g.strike = true; } });
      used.add(h.pi);
      break;
    }
  }
  return used;
}

/** Agrupa caixas que se tocam (figuras). */
export function clusterBoxes(boxes, pad = 3) {
  const bs = boxes.map((b) => b.slice());
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (a[0] - pad <= b[2] && b[0] - pad <= a[2] && a[1] - pad <= b[3] && b[1] - pad <= a[3]) {
          bs[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
          bs.splice(j, 1); changed = true; break outer;
        }
      }
    }
  }
  return bs;
}

// ---------- trechos formatados ----------
/**
 * Converte os caracteres de um trecho em runs { text, f } agrupando formatação igual.
 * fontOf(name) -> { family, bold, italic }; linkAt(x, y) -> url | null
 */
export function runsOf(seg, fontOf, linkAt = () => null, exact = false, fit = exact === true) {
  const out = [];
  let last = null, lastSolid = null;
  for (const g of seg.glyphs) {
    let key, f;
    if (g.space) {
      if (!lastSolid) continue;
      f = { ...last.f, spacing: 0 };
      f.underline = !!g.underline && !!last.f.underline; f.strike = !!g.strike && !!last.f.strike;
      key = last.key.replace(/\|u[01]\|s[01]$/, `|u${f.underline ? 1 : 0}|s${f.strike ? 1 : 0}`);
      if (exact) { // espaço com a largura exata do PDF (justificação, alinhamento por espaços)
        const extra = Math.round((g.w - (g.nat || 0.25 * g.size)) * 20) / 20;
        // no modo editável só os espaços bem largos (colunas alinhadas com espaços)
        if (exact === 'wide' ? extra >= 1.5 : Math.abs(extra) >= 0.3) { f.spacing = extra; key += '|sp' + extra; }
      }
    } else {
      const fi = PUA[g.ch] ? { family: 'Segoe UI Symbol', bold: false, italic: false } : fontOf(g.font);
      const big = Math.abs(g.size - seg.size) < 0.12 * seg.size;
      const rise = big ? 0 : Math.round((seg.y - g.y) * 2) / 2;
      f = {
        font: fi.family, bold: fi.bold || !!g.fakeBold, italic: fi.italic, size: Math.round(g.size * 2) / 2,
        color: g.color, rise: Math.abs(rise) >= 0.5 ? rise : 0, underline: !!g.underline, strike: !!g.strike,
        transparent: !!g.invisible, link: linkAt(g.x + g.w / 2, g.y - 0.3 * g.size),
      };
      if (fit && fi.scale && Math.abs(fi.scale - 1) > (exact === true ? 0.015 : 0.02)) f.scale = Math.round(fi.scale * 100);
      key = [f.font, f.bold, f.italic, f.size, f.color, f.rise, f.transparent, f.link, f.scale].join('|') + `|u${f.underline ? 1 : 0}|s${f.strike ? 1 : 0}`;
      lastSolid = g;
    }
    const ch = g.space ? ' ' : cleanCh(g.ch);
    if (last && last.key === key) last.text += ch;
    else { last = { key, f, text: ch }; out.push(last); }
  }
  // espaço final não acrescenta nada
  while (out.length && /^\s*$/.test(out[out.length - 1].text)) out.pop();
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  return out.map(({ text, f }) => ({ text, f }));
}
