// Geração do PDF final com pdf-lib
//
// Dois modos:
//  - "inplace": o documento tem exatamente as páginas de um único PDF, na ordem
//    original. As edições são desenhadas sobre o próprio arquivo, preservando
//    formulários (AcroForm), marcadores, anexos, metadados e links.
//  - "copy": páginas reorganizadas, combinadas ou em branco. As páginas são
//    copiadas em lote (uma chamada copyPages por documento de origem), o que
//    evita duplicar fontes e imagens compartilhadas.
// Em ambos, páginas com tarja definitiva viram imagem (o conteúdo por baixo
// deixa de existir) e uma coleta de lixo remove do arquivo todo objeto que
// ficou sem referência antes de salvar.
import { f2, canvasBlob, toast, busy } from './util.js';
import { S, FONTS, LH, totalRot } from './state.js';
import { PDFLib, getLib, loadFontkit, loadTTF } from './pdf.js';
import { lineGeom, pathD } from './elements.js';
import { rasterize } from './render.js';

const { PDFDocument, StandardFonts, degrees, LineCapStyle, BlendMode, PDFName, PDFDict, PDFArray, PDFRef, PDFStream } = PDFLib;

export function exportMode() {
  const ps = S.pages;
  if (!ps.length || ps.some((p) => !p.docId)) return 'copy';
  const d = ps[0].docId, doc = S.docs[d];
  if (!doc || ps.some((p) => p.docId !== d) || ps.length !== doc.pdf.numPages || ps.some((p, i) => p.index !== i)) return 'copy';
  return 'inplace';
}

const hexRgb = (hex) => { const n = parseInt((hex || '#000000').slice(1), 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const FALLBACK = { '✓': 'v', '✔': 'v', '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '≠': '!=' };

/** Fontes do documento de saída: padrão do PDF (leve) e DejaVu (Unicode) sob demanda. */
class FontSet {
  constructor(out) { this.out = out; this.fonts = {}; this.ok = new Map(); this.fk = false; this.ttfFail = false; this.replaced = 0; }
  async std(fam, b, i) {
    const n = (FONTS[fam] || FONTS.Helvetica).std[(b ? 1 : 0) + (i ? 2 : 0)];
    if (!this.fonts[n]) this.fonts[n] = await this.out.embedFont(StandardFonts[n]);
    return this.fonts[n];
  }
  async ttf(fam, b, i) {
    if (this.ttfFail) return null;
    const n = (FONTS[fam] || FONTS.Helvetica).ttf[(b ? 1 : 0) + (i ? 2 : 0)];
    try {
      if (!this.fonts[n]) {
        if (!this.fk) { this.out.registerFontkit(await loadFontkit()); this.fk = true; }
        this.fonts[n] = await this.out.embedFont(await loadTTF(n), { subset: true });
      }
      return this.fonts[n];
    } catch (e) { console.error(e); this.ttfFail = true; return null; }
  }
  stdCan(font, ch) {
    const k = font.name + '|' + ch; let v = this.ok.get(k);
    if (v === undefined) { try { font.encodeText(ch); v = true; } catch { v = false; } this.ok.set(k, v); }
    return v;
  }
  ttfCan(font, ch) {
    try { const f = font.embedder && font.embedder.font; return f ? f.hasGlyphForCodePoint(ch.codePointAt(0)) : true; } catch { return true; }
  }
  /** Divide a linha em trechos [{font, text}] trocando de fonte só onde precisa. */
  async runs(line, fam, b, i) {
    const std = await this.std(fam, b, i);
    const chars = [...line];
    let ttf = null;
    if (chars.some((ch) => !this.stdCan(std, ch))) ttf = await this.ttf(fam, b, i);
    const out = [];
    for (let ch of chars) {
      let f = std;
      if (!this.stdCan(std, ch)) {
        if (ttf && this.ttfCan(ttf, ch)) f = ttf;
        else { this.replaced++; ch = FALLBACK[ch] ?? '?'; }
      }
      const last = out[out.length - 1];
      if (last && last.font === f) last.text += ch; else out.push({ font: f, text: ch });
    }
    return out;
  }
}

/** Remove do documento todo objeto que não é alcançável a partir do trailer. */
export function collectGarbage(doc) {
  const ctx = doc.context, seen = new Set();
  const stack = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter(Boolean);
  while (stack.length) {
    let o = stack.pop();
    if (o instanceof PDFRef) { if (seen.has(o.tag)) continue; seen.add(o.tag); o = ctx.lookup(o); if (!o) continue; }
    if (o instanceof PDFStream) o = o.dict;
    if (o instanceof PDFDict) { for (const [, v] of o.entries()) stack.push(v); }
    else if (o instanceof PDFArray) { for (const v of o.asArray()) stack.push(v); }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.tag)) { ctx.delete(ref); removed++; }
  return removed;
}

/** Tira de um formulário os campos cujos widgets estão na página. */
function removeFieldsOnPage(doc, pg) {
  if (!doc.catalog.getAcroForm()) return;
  const ctx = doc.context, annots = pg.node.Annots();
  const onPage = new Set(annots ? annots.asArray().map((r) => ctx.lookup(r)) : []);
  const form = doc.getForm();
  for (const f of form.getFields()) {
    const ws = f.acroField.getWidgets();
    if (ws.some((w) => onPage.has(w.dict) || w.P() === pg.ref)) { try { form.removeField(f); } catch (e) { console.warn(e); } }
  }
}

/**
 * Tarja definitiva: rasteriza a página com os blocos aplicados e troca todo o
 * conteúdo original (textos, imagens, anotações) por essa imagem.
 */
async function burnPage(out, pg, p, ox, oy, burns) {
  const sc = Math.min(200 / 72, Math.sqrt(16e6 / (p.w * p.h)));
  const c = await rasterize(p, sc, { dpr: false });
  const g = c.getContext('2d'), kx = c.width / p.w, ky = c.height / p.h;
  for (const b of burns) { g.fillStyle = b.fill || '#000000'; g.fillRect(Math.floor(b.x * kx), Math.floor(b.y * ky), Math.ceil(b.w * kx) + 1, Math.ceil(b.h * ky) + 1); }
  const img = await out.embedPng(await (await canvasBlob(c, 'image/png')).arrayBuffer());
  removeFieldsOnPage(out, pg);
  const ctx = out.context, node = pg.node;
  ['Annots', 'Thumb', 'PieceInfo', 'Metadata', 'B', 'AA', 'StructParents', 'Group'].forEach((k) => node.delete(PDFName.of(k)));
  node.set(PDFName.of('Contents'), ctx.obj([]));
  node.set(PDFName.of('Resources'), ctx.obj({ Font: {}, XObject: {}, ExtGState: {} }));
  node.set(PDFName.of('Annots'), ctx.obj([]));
  pg.drawImage(img, { x: ox, y: oy, width: p.w, height: p.h });
}

async function drawEls(out, pg, p, ox, oy, F, imgs, burned) {
  const X = (v) => ox + v, Y = (v) => oy + p.h - v;
  for (const el of p.els) {
    const op = el.opacity ?? 1;
    switch (el.type) {
      case 'rect': case 'ellipse': {
        const o = { borderColor: hexRgb(el.color), borderWidth: el.width, borderOpacity: op };
        if (el.fill) { o.color = hexRgb(el.fill); o.opacity = op; }
        if (el.type === 'rect') pg.drawRectangle({ x: X(el.x), y: Y(el.y + el.h), width: el.w, height: el.h, ...o });
        else pg.drawEllipse({ x: X(el.x + el.w / 2), y: Y(el.y + el.h / 2), xScale: el.w / 2, yScale: el.h / 2, ...o });
        break;
      }
      case 'highlight': pg.drawRectangle({ x: X(el.x), y: Y(el.y + el.h), width: el.w, height: el.h, color: hexRgb(el.color), opacity: op, blendMode: BlendMode.Multiply }); break;
      case 'whiteout': if (!(el.burn && burned)) pg.drawRectangle({ x: X(el.x), y: Y(el.y + el.h), width: el.w, height: el.h, color: hexRgb(el.fill || '#ffffff') }); break;
      case 'line': case 'arrow': {
        const g = lineGeom(el);
        pg.drawLine({ start: { x: X(el.x1), y: Y(el.y1) }, end: { x: X(g.ex), y: Y(g.ey) }, thickness: el.width, color: hexRgb(el.color), opacity: op, lineCap: LineCapStyle.Round });
        if (g.pts) pg.drawSvgPath(`M${g.pts.map((q) => q.map(f2).join(' ')).join(' L')} Z`, { x: ox, y: oy + p.h, color: hexRgb(el.color), opacity: op });
        break;
      }
      case 'draw': pg.drawSvgPath(pathD(el.pts), { x: ox, y: oy + p.h, borderColor: hexRgb(el.color), borderWidth: el.width, borderOpacity: op, borderLineCap: LineCapStyle.Round }); break;
      case 'text': {
        if (!el.text) break;
        const fam = FONTS[el.font] ? el.font : 'Helvetica', k = FONTS[fam].k, size = el.size;
        const rot = el.rot || 0, t = (rot * Math.PI) / 180, s = Math.sin(t), c = Math.cos(t);
        const lines = el.text.replace(/\t/g, '    ').split('\n');
        const runs = [];
        for (const line of lines) runs.push(line ? await F.runs(line, fam, el.bold, el.italic) : []);
        const widths = runs.map((rs) => rs.reduce((a, r) => a + r.font.widthOfTextAtSize(r.text, size), 0));
        const W = Math.max(0, ...widths);
        runs.forEach((rs, li) => {
          if (!rs.length) return;
          const by = (li * LH + k) * size;
          let off = el.align === 'center' ? (W - widths[li]) / 2 : el.align === 'right' ? W - widths[li] : 0;
          for (const r of rs) {
            pg.drawText(r.text, { x: X(el.x + off * c - by * s), y: Y(el.y + off * s + by * c), size, font: r.font, color: hexRgb(el.color), opacity: op, rotate: degrees(-rot) });
            off += r.font.widthOfTextAtSize(r.text, size);
          }
        });
        break;
      }
      case 'image': {
        const a = S.assets[el.asset]; if (!a) break;
        if (!imgs[el.asset]) imgs[el.asset] = a.type === 'jpg' ? await out.embedJpg(a.data) : await out.embedPng(a.data);
        const rot = el.rot || 0, t = (rot * Math.PI) / 180;
        pg.drawImage(imgs[el.asset], { x: X(el.x - el.h * Math.sin(t)), y: Y(el.y + el.h * Math.cos(t)), width: el.w, height: el.h, rotate: degrees(-rot), opacity: op });
        break;
      }
      default:
    }
  }
}

/** Monta o PDF e devolve { bytes, mode, replaced, burned }. */
export async function buildPdf() {
  const mode = exportMode();
  let out, pgs;
  if (mode === 'inplace') {
    const docId = S.pages[0].docId;
    out = await getLib(docId);
    S.docs[docId].lib = null; // será modificado: a próxima exportação recarrega
    pgs = out.getPages();
  } else {
    out = await PDFDocument.create();
    const want = new Map();
    S.pages.forEach((p) => { if (p.docId) { if (!want.has(p.docId)) want.set(p.docId, []); want.get(p.docId).push(p.index); } });
    const copied = new Map();
    for (const [docId, idx] of want) copied.set(docId, await out.copyPages(await getLib(docId), idx));
    pgs = S.pages.map((p) => {
      const pg = p.docId ? copied.get(p.docId).shift() : null;
      return pg ? out.addPage(pg) : out.addPage([p.w, p.h]);
    });
    const first = S.pages.find((p) => p.docId);
    if (first) {
      try {
        const src = await getLib(first.docId);
        const tt = src.getTitle(), au = src.getAuthor(), su = src.getSubject(), kw = src.getKeywords();
        if (tt) out.setTitle(tt); if (au) out.setAuthor(au); if (su) out.setSubject(su); if (kw) out.setKeywords([kw]);
      } catch { /* metadados ausentes */ }
    }
  }
  const F = new FontSet(out), imgs = {};
  let burned = 0;
  for (let i = 0; i < S.pages.length; i++) {
    const p = S.pages[i], pg = pgs[i];
    const ox = p.docId ? p.x0 : 0, oy = p.docId ? p.y0 : 0;
    pg.setRotation(degrees(totalRot(p)));
    const burns = p.docId ? p.els.filter((e) => e.type === 'whiteout' && e.burn) : [];
    if (burns.length) { await burnPage(out, pg, p, ox, oy, burns); burned++; }
    await drawEls(out, pg, p, ox, oy, F, imgs, burns.length > 0);
  }
  collectGarbage(out);
  out.setProducer('HFA Editor PDF'); out.setCreator('HFA Editor PDF'); out.setModificationDate(new Date());
  const bytes = await out.save();
  return { bytes, mode, replaced: F.replaced, burned };
}

export async function exportPdf() {
  if (!S.pages.length) return;
  busy('Gerando seu PDF…');
  try {
    const { bytes, replaced, burned } = await buildPdf();
    const name = S.fileName.replace(/\.pdf$/i, '') + '-editado.pdf';
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    S.dirty = false;
    toast(`“${name}” baixado (${(bytes.length / 1024 / 1024).toFixed(2)} MB).`, 'ok');
    if (burned) toast(`${burned} página(s) com tarja definitiva viraram imagem: o conteúdo coberto foi removido do arquivo.`);
    if (replaced) toast(`${replaced} caractere(s) sem suporte nas fontes do PDF (como ideogramas asiáticos ou alguns emojis) foram trocados por “?”.`, 'warn');
  } catch (e) {
    console.error(e); toast('Erro ao gerar o PDF: ' + (e.message || e), 'error');
  } finally { busy(false); }
}
