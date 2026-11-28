// PDF -> Word (.docx), 100% no navegador.
//
// Dois modos:
//  - "flow" (editável): parágrafos reais que se reorganizam ao editar, tabelas
//    do Word a partir das réguas do PDF, sublinhados, links, imagens e figuras
//    na posição original. O espaçamento vertical é calculado para cada linha
//    cair no mesmo lugar do PDF (o Word põe a linha de base a 0,8 × a altura
//    de uma linha "exata"; medido no próprio Word).
//  - "exact" (layout idêntico): cada página tem o fundo (imagens e vetores,
//    sem o texto) e o texto em caixas de texto na posição exata.
import { readPage, renderNoText, openForConversion } from './pdfread.js';
import { buildLines, splitSegments, buildParagraphs, rulesOf, detectTables, markDecorations, clusterBoxes, runsOf, isWhite, PUA, needL, MARKER } from './layout.js';
import { DocxBuilder, para, run, rPr, sectPr, table } from './docxwriter.js';
import { zipDocx, canvasBytes } from './libs.js';
import { planFonts, addSamples } from './fontfit.js';

const BASE = 0.8; // linha de base dentro de uma linha "exata" do Word (calibrado no Word)
const MAX_PX = 18e6;

/** Converte os bytes de um PDF. o: { mode, onProgress(i, n), pages: [índices 0-based], title } */
export async function pdfToDocx(bytes, o = {}) {
  const pdf = await openForConversion(bytes);
  try { return await convert(pdf, o); } finally { pdf.destroy(); }
}
async function convert(pdf, o) {
  const samples = new Map(); // amostras de texto por fonte (documento todo)
  const mode = o.mode === 'exact' ? 'exact' : 'flow';
  const b = new DocxBuilder();
  const stats = { pages: 0, tables: 0, images: 0, scanned: 0, boxes: 0, fallback: 0, noText: 0 };
  const famCount = new Map(), sizeCount = new Map();
  const linkIds = new Map();
  const link = (url) => { if (!linkIds.has(url)) linkIds.set(url, b.addLink(url)); return linkIds.get(url); };
  const order = o.pages || Array.from({ length: pdf.numPages }, (_, i) => i);
  const parts = [];
  for (let k = 0; k < order.length; k++) {
    o.onProgress && o.onProgress(k, order.length);
    const page = await pdf.getPage(order[k] + 1);
    try {
      const ctx = await analyze(page, mode, samples);
      ctx.b = b; ctx.link = link; ctx.stats = stats;
      if (!ctx.segsAll.length && !ctx.rotated.size) stats.noText++;
      for (const s of ctx.segsAll) for (const g of s.glyphs) if (!g.space) {
        const f = ctx.fontOf(g.font).family; famCount.set(f, (famCount.get(f) || 0) + 1);
        const z = Math.round(g.size * 2) / 2; sizeCount.set(z, (sizeCount.get(z) || 0) + 1);
      }
      const last = k === order.length - 1;
      parts.push(mode === 'exact' ? await pageExact(page, ctx, last) : await pageFlow(page, ctx, last));
      stats.pages++;
    } finally { page.cleanup(); }
    await new Promise((r) => setTimeout(r, 0)); // deixa a interface respirar
  }
  b.body.push(parts.join(''));
  o.onProgress && o.onProgress(order.length, order.length);
  const top = (m) => [...m.entries()].sort((a, c) => c[1] - a[1])[0];
  const defFont = (top(famCount) || ['Calibri'])[0], defSize = (top(sizeCount) || [11])[0];
  const files = b.files({ title: o.title || '', fonts: [...famCount.keys()], defFont, defSize });
  const blob = await zipDocx(files);
  return { blob, stats };
}

// ---------- análise comum aos dois modos ----------
async function analyze(page, mode, samples) {
  const d = await readPage(page);
  let links = [];
  try {
    const vp = page.getViewport({ scale: 1 });
    links = (await page.getAnnotations({ intent: 'display' })).filter((a) => a.subtype === 'Link' && a.url && /^(https?|mailto):/i.test(a.url)).map((a) => {
      const [x0, y0] = vp.convertToViewportPoint(a.rect[0], a.rect[1]), [x1, y1] = vp.convertToViewportPoint(a.rect[2], a.rect[3]);
      return { url: a.url, box: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)] };
    });
  } catch { /* sem anotações */ }
  const linkAt = (x, y) => { const l = links.find((q) => x >= q.box[0] && x <= q.box[2] && y >= q.box[1] - 1 && y <= q.box[3] + 1); return l ? l.url : null; };

  // página digitalizada com OCR: texto invisível sobre uma imagem grande
  const solid = d.glyphs.filter((g) => !g.space && !g.type3);
  const inv = solid.filter((g) => g.invisible).length;
  const t3 = d.glyphs.filter((g) => !g.space && g.type3).length;
  const bigImg = d.images.find((im) => !im.shading && (im.bbox[2] - im.bbox[0]) * (im.bbox[3] - im.bbox[1]) > 0.5 * d.w * d.h);
  const scanned = solid.length > 0 && inv > 0.8 * solid.length && !!bigImg;
  // camada de texto invisível que é o único texto da página (OCR, PDF "achatado"
  // com o texto visível desenhado como Type3): no modo editável ela é o texto
  // Texto em fonte Type3 (desenhado) com Unicode: vira texto de verdade e sai do
  // fundo. Se a página tem uma camada invisível mais completa, ela é o texto e
  // os desenhos Type3 ficam no fundo.
  const useT3 = t3 > 0 && t3 >= 0.8 * inv;
  const onlyHidden = !useT3 && solid.length > 0 && inv > 0.8 * solid.length;
  let glyphs = d.glyphs.filter((g) => (g.type3 ? useT3 : !(useT3 && g.invisible)));
  if (mode === 'flow') glyphs = onlyHidden ? glyphs.map((g) => ({ ...g, invisible: false })) : glyphs.filter((g) => !g.invisible);

  // texto girado vai para caixas de texto giradas
  const groups = new Map();
  for (const g of glyphs) { const a = Math.abs(g.angle) < 0.5 ? 0 : Math.round(g.angle); if (!groups.has(a)) groups.set(a, []); groups.get(a).push(g); }
  const horiz = groups.get(0) || [];
  groups.delete(0);

  const rules = rulesOf(d.paths);
  const lines = buildLines(horiz);
  const decoUsed = markDecorations(lines, rules);
  const rules2 = { H: rules.H.filter((h) => !decoUsed.has(h.pi)), V: rules.V, shades: rules.shades, J: rules.J };
  const vrules = mergeV(rules.V);
  const segsAll = lines.flatMap((L) => splitSegments(L, vrules));
  addSamples(samples, segsAll);
  for (const gs of groups.values()) addSamples(samples, [{ glyphs: gs }]);
  const fontOf = planFonts(d.fonts, samples);
  return { d, fontOf, linkAt, scanned, bigImg, hideT3: useT3, rotated: groups, rules: rules2, decoUsed, lines, segsAll, vrules };
}
function mergeV(V) {
  const s = V.slice().sort((a, b) => a.x - b.x || a.y0 - b.y0), out = [];
  for (const v of s) { const l = out.find((o) => Math.abs(o.x - v.x) < 1 && v.y0 <= o.y1 + 1.5); if (l) { l.y0 = Math.min(l.y0, v.y0); l.y1 = Math.max(l.y1, v.y1); } else out.push({ ...v }); }
  return out.filter((v) => v.y1 - v.y0 > 4);
}

// ---------- runs ----------
function runsXml(runs, ctx) {
  let s = '', curLink = null, buf = '';
  const flush = () => { if (curLink) s += `<w:hyperlink r:id="${ctx.link(curLink)}" w:history="1">${buf}</w:hyperlink>`; else s += buf; buf = ''; };
  for (const r of runs) {
    const l = r.f.link || null;
    if (l !== curLink) { flush(); curLink = l; }
    buf += run(r.text, r.f);
  }
  flush();
  return s;
}
const segRuns = (seg, ctx, exact = false) => runsOf(seg, ctx.fontOf, ctx.linkAt, exact, true);

const MARK = MARKER;
/** Marcador de lista seguido de um espaço largo: { head, tail, textX } */
function bulletSplit(seg) {
  const i = seg.glyphs.findIndex((g) => g.space);
  if (i <= 0 || i > 8) return null;
  const sp = seg.glyphs[i], head = seg.glyphs.slice(0, i), tail = seg.glyphs.slice(i + 1);
  if (!tail.length || sp.w < 0.45 * seg.size) return null;
  const txt = head.map((g) => PUA[g.ch] || g.ch).join('');
  if (!MARK.test(txt)) return null;
  return { head: { ...seg, glyphs: head }, tail: { ...seg, glyphs: tail }, textX: tail[0].x };
}

/** Runs de um parágrafo inteiro: linhas unidas por espaço (o Word volta a quebrar). */
function paraRuns(P, ctx, first = null) {
  const all = [];
  const sp = P.align === 'justify' ? false : 'wide';
  P.segs.forEach((s, i) => {
    const rs = i === 0 && first ? first : segRuns(s, ctx, sp);
    if (i > 0 && rs.length && all.length) {
      const prev = all[all.length - 1];
      if (!/[-‐]$/.test(prev.text)) rs[0] = { ...rs[0], text: ' ' + rs[0].text };
    }
    all.push(...rs);
  });
  return all;
}

// ---------- modo editável ----------
async function pageFlow(page, ctx, last) {
  const { d, b, stats } = ctx;
  const W = d.w, H = d.h;
  const textBoxes = ctx.segsAll.map((s) => [s.x0, s.top, s.x1, s.bottom]);
  const tables = detectTables(ctx.rules, W, H, textBoxes);
  stats.tables += tables.length;
  if (ctx.scanned) stats.scanned++;

  // trechos dentro de tabelas vão para as células
  const inTable = new Map();
  const body = [];
  for (const s of ctx.segsAll) {
    const cx = (s.x0 + s.x1) / 2, cy = s.y - 0.3 * s.size;
    const t = tables.find((q) => cx >= q.bbox[0] - 1 && cx <= q.bbox[2] + 1 && cy >= q.bbox[1] - 1 && cy <= q.bbox[3] + 1);
    if (!t) { body.push(s); continue; }
    const g = t.regions.find((r) => cx >= r.bbox[0] - 0.5 && cx <= r.bbox[2] + 0.5 && cy >= r.bbox[1] - 0.5 && cy <= r.bbox[3] + 0.5) || t.regions[0];
    if (!inTable.has(g)) inTable.set(g, []);
    inTable.get(g).push(s);
  }

  // região do texto (margens da página)
  const xs0 = [...body.map((s) => s.x0), ...tables.map((t) => t.bbox[0])], xs1 = [...body.map((s) => s.x1), ...tables.map((t) => t.bbox[2])];
  const RL = xs0.length ? Math.max(0, Math.min(...xs0)) : 72, RR = xs1.length ? Math.min(W, Math.max(...xs1)) : W - 72;
  const region = { x0: RL, x1: RR };
  let paras = buildParagraphs(body, region);
  paras = mergeTabRows(paras);

  // blocos em ordem vertical; o que não cabe no fluxo (lado a lado) vira caixa de texto
  const blocks = [...paras.map((p) => ({ kind: 'p', p, top: p.top, bottom: p.bottom, x0: p.x0 })),
    ...tables.map((t) => ({ kind: 't', t, top: t.bbox[1], bottom: t.bbox[3], x0: t.bbox[0] }))].sort((a, c) => a.top - c.top || a.x0 - c.x0);
  // página tipo panfleto (texto espalhado sobre imagens): o fluxo de texto não
  // representa bem; essa página sai com o layout idêntico
  if (graphicPage(ctx, paras, tables)) { stats.fallback++; return pageExact(page, ctx, last); }
  const flow = [], floating = [];
  const tb = blocks.filter((x) => x.kind === 't');
  let cursor = -Infinity;
  for (const bl of blocks) {
    if (bl.kind === 't') { flow.push(bl); cursor = Math.max(cursor, bl.bottom); continue; }
    const besideTable = tb.some((t) => bl.bottom > t.top + 1 && bl.top < t.bottom - 1);
    // rodapé isolado no pé da página: posição fixa, para não ser empurrado para a página seguinte
    const footer = bl.top > 0.86 * H && bl.top - cursor > 2.5 * bl.p.L && bl.p.segs.length <= 3;
    if (besideTable || footer || bl.top < cursor - 1.2) floating.push(bl);
    else { flow.push(bl); cursor = Math.max(cursor, bl.bottom); }
  }
  flow.sort((a, c) => a.top - c.top);

  const flowRight = flow.length ? Math.max(...flow.map((f) => (f.kind === 'p' ? f.p.x1 : f.t.bbox[2]))) : RR;
  const slack = Math.max(0, Math.min(W - flowRight - 4, 8));
  const mL = clampN(RL, 0, W - 72), mR = clampN(W - flowRight - slack, 0, W - mL - 36);
  const contentR = W - mR; // borda direita da área de texto no Word
  const firstTop = flow.length ? Math.max(0, flow[0].top) : 36;
  const mT = clampN(firstTop, 0, H - 40);
  const lastBottom = flow.length ? Math.max(...flow.map((f) => f.bottom)) : mT;
  const mB = clampN(Math.min(14, H - lastBottom - 1), 0, 14);

  // âncoras: figuras, caixas de texto (fora do fluxo e giradas)
  let anchors = '';
  anchors += await figures(page, ctx, tables, { scanned: ctx.scanned });
  for (const bl of floating) anchors += floatBox(bl.p, ctx);
  anchors += rotatedBoxes(ctx);

  const out = [];
  let y = mT;
  for (const bl of flow) {
    if (bl.kind === 'p') {
      const P = bl.p;
      const before = Math.max(0, P.top - y);
      out.push({ xml: paraXml(P, ctx, { before, mL, contentR, region }), para: true });
      y = Math.max(y, P.top) + P.segs.length * P.L;
    } else {
      const t = bl.t;
      const gap = t.bbox[1] - y;
      if (gap >= 0.8) out.push({ xml: para('', { line: gap, lineRule: 'exact', runFont: rPr({ size: 1 }) }), para: true });
      out.push({ xml: tableXml(t, inTable, ctx, mL), para: false });
      y = Math.max(y, t.bbox[1]) + (t.ys[t.ys.length - 1] - t.ys[0]);
    }
  }
  const sect = sectPr(W, H, { top: mT, right: mR, bottom: mB, left: mL });
  // âncoras entram no primeiro parágrafo da página
  const firstP = out.findIndex((x) => x.para);
  if (firstP >= 0) out[firstP].xml = out[firstP].xml.replace('</w:pPr>', '</w:pPr>' + anchors);
  else out.unshift({ xml: para(anchors, { line: 1, lineRule: 'exact', runFont: rPr({ size: 1 }) }), para: true });
  // fim da página: quebra de seção (a última seção do documento fica no corpo)
  if (last) return out.map((x) => x.xml).join('') + sect;
  const lp = out[out.length - 1];
  if (lp.para) lp.xml = lp.xml.replace('</w:pPr>', sect + '</w:pPr>');
  else out.push({ xml: para('', { line: 1, lineRule: 'exact', runFont: rPr({ size: 1 }), sect }) });
  return out.map((x) => x.xml).join('');
}
const clampN = (v, a, c) => Math.max(a, Math.min(c, v));

function graphicPage(ctx, paras, tables) {
  const { d } = ctx;
  const pics = d.images.filter((im) => !im.shading && !(ctx.scanned && im === ctx.bigImg));
  const area = pics.reduce((a, im) => a + (im.bbox[2] - im.bbox[0]) * (im.bbox[3] - im.bbox[1]), 0);
  const segs = ctx.segsAll;
  if (!segs.length) return false;
  const over = segs.filter((q) => pics.some((im) => q.x1 > im.bbox[0] && q.x0 < im.bbox[2] && q.bottom > im.bbox[1] && q.top < im.bbox[3])).length;
  if (area > 0.35 * d.w * d.h && over > 0.2 * segs.length) return true;
  // muitos blocos de texto lado a lado (colunas, cartazes)
  const ps = paras.slice().sort((a, b) => a.top - b.top);
  let overlap = 0;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length && ps[j].top < ps[i].bottom - 1.2; j++) { overlap++; break; }
  const inTables = tables.reduce((a, t) => a + t.regions.length, 0);
  if (ps.length >= 8 && overlap > 0.4 * ps.length) return true;
  // muitas imagens pequenas dentro de tabelas (catálogos)
  if (tables.length && pics.length > 6 && pics.filter((im) => tables.some((t) => im.bbox[0] >= t.bbox[0] - 2 && im.bbox[2] <= t.bbox[2] + 2 && im.bbox[1] >= t.bbox[1] - 2 && im.bbox[3] <= t.bbox[3] + 2)).length > 0.5 * pics.length && inTables > 6) return true;
  return false;
}

/** Linhas soltas na mesma altura (formulários, colunas sem régua) viram uma linha com tabulações. */
function mergeTabRows(paras) {
  const single = paras.filter((p) => p.segs.length === 1);
  const used = new Set(), out = [];
  for (const p of paras) {
    if (used.has(p)) continue;
    if (p.segs.length !== 1) { out.push(p); continue; }
    const row = single.filter((q) => !used.has(q) && Math.abs(q.segs[0].y - p.segs[0].y) < 0.25 * p.size && Math.abs(q.size - p.size) < 0.3 * p.size);
    if (row.length < 2) { out.push(p); continue; }
    row.sort((a, c) => a.x0 - c.x0);
    row.forEach((q) => used.add(q));
    const segs = row.map((q) => q.segs[0]);
    const size = Math.max(...row.map((q) => q.size)), L = Math.round(size * 1.2 * 100) / 100;
    const y = Math.max(...segs.map((s) => s.y));
    out.push({ tabRow: true, cells: row, segs: [segs[0]], rowSegs: segs, size, L, top: y - BASE * L, bottom: y - BASE * L + L, x0: segs[0].x0, x1: Math.max(...segs.map((s) => s.x1)), align: 'left', firstX: segs[0].x0, bodyLeft: segs[0].x0 });
  }
  return out.sort((a, c) => a.top - c.top || a.x0 - c.x0);
}

/**
 * Borda direita em que o Word deve quebrar as linhas do parágrafo: a margem da
 * região, limitada ao ponto em que a primeira palavra da linha seguinte já
 * teria cabido na anterior (senão o Word junta linhas que o PDF separou).
 */
function wrapEdge(P, region) {
  const S = P.segs;
  if (P.align === 'justify') return P.x1;
  let ub = Infinity;
  for (let i = 0; i < S.length - 1; i++) {
    const nx = S[i + 1]; let fw = 0;
    for (const g of nx.glyphs) { if (g.space) break; fw = g.x + g.w - nx.x0; }
    ub = Math.min(ub, S[i].x1 + 0.25 * P.size + fw - 0.5);
  }
  const want = Math.max(region ? region.x1 : P.x1, P.x1 + 0.3);
  return Math.max(P.x1 + 0.3, Math.min(want, ub));
}

function paraXml(P, ctx, { before, mL, contentR, region }) {
  if (P.tabRow) {
    const segs = P.rowSegs;
    let runs = [];
    const tabs = [];
    segs.forEach((s, i) => {
      if (i) { runs.push({ text: '\t', f: { size: P.size } }); tabs.push({ pos: Math.max(0, s.x0 - mL) }); }
      runs.push(...segRuns(s, ctx, 'wide'));
    });
    runs = runs.filter((r) => r.text);
    return para(runsXml(runs, ctx), { before, line: P.L, lineRule: 'exact', left: Math.max(0, segs[0].x0 - mL), tabs, runFont: rPr({ size: P.size }) });
  }
  const bs = P.align !== 'center' && P.align !== 'right' ? bulletSplit(P.segs[0]) : null;
  const runs = paraRuns(P, ctx, bs ? [...segRuns(bs.head, ctx), { text: '	', f: {} }, ...segRuns(bs.tail, ctx, P.align === 'justify' ? false : 'wide')] : null);
  const o = { before, line: P.L, lineRule: 'exact', align: P.align, runFont: rPr({ size: P.size }) };
  if (bs) {
    const textL = P.segs.length > 1 ? P.bodyLeft : bs.textX;
    o.left = Math.max(0, textL - mL); o.firstLine = Math.max(-o.left, P.firstX - textL);
    o.tabs = [{ pos: Math.max(0, bs.textX - mL) }];
    if (P.segs.length > 1) o.right = Math.max(0, contentR - wrapEdge(P, region));
    return para(runsXml(runs, ctx), o);
  }
  if (P.align === 'center') {
    const c = (P.x0 + P.x1) / 2, half = Math.max(5, Math.min(c - mL, contentR - c));
    o.left = Math.max(0, c - half - mL); o.right = Math.max(0, contentR - (c + half));
  } else if (P.align === 'right') {
    o.left = 0; o.right = Math.max(0, contentR - P.x1);
  } else {
    o.left = Math.max(0, P.bodyLeft - mL);
    o.firstLine = P.firstX - P.bodyLeft;
    if (o.left + o.firstLine < 0) o.firstLine = -o.left;
    if (P.segs.length > 1) o.right = Math.max(0, contentR - wrapEdge(P, region));
  }
  // títulos: estilo de título para o painel de navegação do Word
  if (P.segs.length <= 2 && P.size >= 15 && runs.every((r) => r.f.bold || r.f.size >= 18)) o.style = P.size >= 20 ? 'Heading1' : 'Heading2';
  return para(runsXml(runs, ctx), o);
}

function tableXml(t, inTable, ctx, mL) {
  const R = t.ys.length - 1, C = t.xs.length - 1;
  const cols = []; for (let k = 0; k < C; k++) cols.push(t.xs[k + 1] - t.xs[k]);
  const pad = Math.max(0, Math.min(2, Math.min(...cols) / 4));
  const at = new Map();
  for (const g of t.regions) for (let r = g.r0; r <= g.r1; r++) at.set(r + ':' + g.c0, g);
  const rows = [];
  for (let r = 0; r < R; r++) {
    const cells = [];
    for (let k = 0; k < C;) {
      const g = at.get(r + ':' + k);
      if (!g) { cells.push({ span: 1, borders: {} }); k++; continue; }
      const span = g.c1 - g.c0 + 1;
      const cell = { span, borders: g.borders, shade: g.shade };
      if (g.r1 > g.r0) cell.vmerge = r === g.r0 ? 'restart' : 'continue';
      if (r === g.r0) cell.content = cellContent(g, inTable.get(g) || [], ctx, pad);
      cells.push(cell); k += span;
    }
    // o Word soma a espessura da borda inferior à altura pedida
    const bw = Math.max(0, ...t.regions.filter((g) => g.r1 === r && g.borders.bottom).map((g) => g.borders.bottom.width));
    rows.push({ height: Math.max(1, t.ys[r + 1] - t.ys[r] - bw), cells });
  }
  return table({ left: t.xs[0] - mL, cols, rows, pad });
}
function cellContent(g, segs, ctx, pad) {
  if (!segs.length) return '';
  const [x0, by0, x1] = g.bbox;
  const y0 = by0 + (g.borders.top ? g.borders.top.width : 0); // o Word começa o texto abaixo da borda
  const region = { x0: x0 + pad, x1: x1 - pad };
  const ps = mergeTabRows(buildParagraphs(segs, region));
  let y = y0, s = '';
  for (const P of ps) {
    s += paraXml(P, ctx, { before: Math.max(0, P.top - y), mL: region.x0, contentR: region.x1, region });
    y = Math.max(y, P.top) + P.segs.length * P.L;
  }
  return s;
}

/** Parágrafo que não cabe no fluxo: caixa de texto na posição exata. */
function floatBox(P, ctx) {
  ctx.stats.boxes++;
  const w = (P.x1 - P.x0) * 1.06 + P.size, h = P.bottom - P.top;
  const inner = P.tabRow ? paraXml(P, ctx, { before: 0, mL: P.x0, contentR: P.x0 + w }) : linesXml(P, ctx, P.x0);
  return ctx.b.textboxRun(P.x0, P.top, w, Math.max(h, 1), inner);
}
/** Cada linha como parágrafo próprio, no lugar exato (modo idêntico e caixas). */
function linesXml(P, ctx, boxX) {
  const S = P.segs;
  const pitches = S.slice(1).map((s, i) => s.y - S[i].y);
  const L = S.length > 1 ? Math.max(0.8, Math.min(...pitches)) : P.L;
  let s = '';
  S.forEach((seg, i) => {
    const before = i ? pitches[i - 1] - L : 0;
    s += para(runsXml(segRuns(seg, ctx, true), ctx), { before, line: L, lineRule: 'exact', left: Math.max(0, seg.x0 - boxX), runFont: rPr({ size: seg.size }) });
  });
  return s;
}
function boxFor(P, ctx, rot = 0, center = null) {
  const S = P.segs;
  const pitches = S.slice(1).map((s, i) => s.y - S[i].y);
  const L = S.length > 1 ? Math.max(0.8, Math.min(...pitches)) : P.L;
  // alguma linha precisa de mais altura que o espaço entre linhas: uma caixa por linha
  if (!center && S.length > 1 && S.some((s) => needL(s) > L + 0.3)) {
    return S.map((s) => boxFor({ ...P, segs: [s], x0: s.x0, x1: s.x1, L: Math.max(s.size * 1.2, needL(s)), size: s.size }, ctx)).join('');
  }
  const top = S[0].y - BASE * L, h = S[S.length - 1].y - S[0].y + L;
  const w = (P.x1 - P.x0) * 1.15 + P.size;
  if (!center) return ctx.b.textboxRun(P.x0, top, w, h, linesXml(P, ctx, P.x0));
  return { w, h, top, xml: (x, y) => ctx.b.textboxRun(x, y, w, h, linesXml(P, ctx, P.x0), { rot }) };
}

/** Texto girado: monta as linhas num referencial girado e devolve caixas giradas. */
function rotatedBoxes(ctx) {
  let s = '';
  for (const [ang, gs] of ctx.rotated) {
    const t = (-ang * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    const rot = (x, y) => [x * c - y * sn, x * sn + y * c];
    const local = gs.map((g) => { const [x, y] = rot(g.x, g.y); return { ...g, x, y, angle: 0 }; });
    const lines = buildLines(local);
    const segs = lines.flatMap((L) => splitSegments(L));
    if (!segs.length) continue;
    const region = { x0: Math.min(...segs.map((q) => q.x0)), x1: Math.max(...segs.map((q) => q.x1)) };
    for (const P of buildParagraphs(segs, region)) {
      const bx = boxFor(P, ctx, ang, true);
      // centro da caixa no referencial girado -> página
      const cxL = P.x0 + bx.w / 2, cyL = bx.top + bx.h / 2;
      const t2 = (ang * Math.PI) / 180, c2 = Math.cos(t2), s2 = Math.sin(t2);
      const cx = cxL * c2 - cyL * s2, cy = cxL * s2 + cyL * c2;
      s += bx.xml(cx - bx.w / 2, cy - bx.h / 2);
      ctx.stats.boxes++;
    }
  }
  return s;
}

/** Imagens e desenhos vetoriais que não viraram tabela nem sublinhado: recortes da página sem texto. */
async function figures(page, ctx, tables, { scanned }) {
  const { d } = ctx;
  const used = new Set(ctx.decoUsed); tables.forEach((t) => t.pis.forEach((p) => used.add(p)));
  const boxes = [];
  d.images.forEach((im) => { if (!(scanned && im === ctx.bigImg)) boxes.push({ b: im.bbox, img: !im.shading }); });
  d.paths.forEach((p, pi) => {
    if (used.has(pi)) return;
    const visibleFill = p.fill && p.fillAlpha > 0.05 && !isWhite(p.fill);
    const visibleStroke = p.stroke && p.strokeAlpha > 0.05 && !isWhite(p.stroke);
    if (!visibleFill && !visibleStroke) return;
    const bb = p.bbox.slice(); const lw = visibleStroke ? p.lineWidth / 2 : 0;
    boxes.push({ b: [bb[0] - lw, bb[1] - lw, bb[2] + lw, bb[3] + lw], img: false });
  });
  if (!boxes.length) return '';
  const clusters = clusterBoxes(boxes.map((x) => x.b), 2).map((bb) => [Math.max(0, bb[0] - 0.5), Math.max(0, bb[1] - 0.5), Math.min(d.w, bb[2] + 0.5), Math.min(d.h, bb[3] + 0.5)])
    .filter((bb) => bb[2] - bb[0] >= 1 && bb[3] - bb[1] >= 1);
  if (!clusters.length) return '';
  const hasImg = boxes.some((x) => x.img);
  const scale = Math.min(hasImg ? 3 : 2.5, Math.sqrt(MAX_PX / (d.w * d.h)));
  const cv = await renderNoText(page, scale, { type3: ctx.hideT3 });
  let s = '';
  for (const bb of clusters) {
    const sx = Math.floor(bb[0] * scale), sy = Math.floor(bb[1] * scale);
    const sw = Math.max(1, Math.ceil(bb[2] * scale) - sx), sh = Math.max(1, Math.ceil(bb[3] * scale) - sy);
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    c.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
    const photo = boxes.some((x) => x.img && x.b[0] >= bb[0] - 1 && x.b[2] <= bb[2] + 1 && x.b[1] >= bb[1] - 1 && x.b[3] <= bb[3] + 1) && sw * sh > 40000;
    const bytes = await canvasBytes(c, photo ? 'image/jpeg' : 'image/png', 0.9);
    const rId = ctx.b.addImage(bytes, photo ? 'jpeg' : 'png');
    const overText = ctx.segsAll.some((q) => q.x1 > bb[0] && q.x0 < bb[2] && q.bottom > bb[1] && q.top < bb[3]);
    s += ctx.b.imageRun(rId, sx / scale, sy / scale, sw / scale, sh / scale, { behind: overText });
    ctx.stats.images++;
  }
  return s;
}

// ---------- modo layout idêntico ----------
async function pageExact(page, ctx, last) {
  const { d, b, stats } = ctx;
  const W = d.w, H = d.h;
  if (ctx.scanned) stats.scanned++;
  let anchors = '';
  const hasGraphics = d.images.length || d.paths.some((p) => (p.fill && !isWhite(p.fill) && p.fillAlpha > 0.05) || (p.stroke && !isWhite(p.stroke) && p.strokeAlpha > 0.05));
  if (hasGraphics) {
    const scale = Math.min(d.images.length ? 2.5 : 2, Math.sqrt(MAX_PX / (W * H)));
    const cv = await renderNoText(page, scale, { type3: ctx.hideT3 });
    const photo = d.images.some((im) => !im.shading);
    const bytes = await canvasBytes(cv, photo ? 'image/jpeg' : 'image/png', 0.88);
    anchors += b.imageRun(b.addImage(bytes, photo ? 'jpeg' : 'png'), 0, 0, W, H, { behind: true });
    stats.images++;
  }
  const region = { x0: 0, x1: W };
  for (const P of buildParagraphs(ctx.segsAll, region)) { anchors += boxFor(P, ctx); stats.boxes++; }
  anchors += rotatedBoxes(ctx);
  const sect = sectPr(W, H, { top: 0, right: 0, bottom: 0, left: 0 });
  const p = para(anchors, { line: 1, lineRule: 'exact', runFont: rPr({ size: 1 }), sect: last ? '' : sect });
  return last ? p + sect : p;
}
