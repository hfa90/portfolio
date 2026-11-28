// Leitura detalhada de uma página de PDF para a conversão em Word.
//
// Em vez do getTextContent (que junta e separa pedaços de texto do seu jeito e
// não informa cor), interpretamos a lista de operadores do pdf.js com as mesmas
// contas do renderizador dele (canvas.js). Assim cada caractere sai com posição
// exata, tamanho, fonte, cor e rotação, e os vetores (linhas e retângulos) saem
// com cor e espessura, para virar tabelas, sublinhados e figuras.
//
// Coordenadas: pontos PDF com origem no canto superior esquerdo da página já
// girada (o mesmo que o usuário vê).
import { pdfjsLib } from '../pdf.js';

const noText = (ctx) => { ctx.fillText = () => {}; ctx.strokeText = () => {}; return ctx; };
/**
 * Fábrica de canvas para a conversão: todo canvas que o pdf.js cria (inclusive
 * os temporários de grupos de transparência e máscaras) ignora texto, para o
 * fundo das páginas sair sem as letras que viram texto editável no Word.
 */
let hideT3 = false; // a página em desenho também esconde fontes Type3 (viram texto de verdade)
class NoTextCanvasFactory {
  constructor() {}
  create(w, h) {
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, w); canvas.height = Math.max(1, h);
    canvas.__hfaHideT3 = hideT3;
    return { canvas, context: noText(canvas.getContext('2d', { willReadFrequently: true })) };
  }
  reset(cc, w, h) { cc.canvas.width = Math.max(1, w); cc.canvas.height = Math.max(1, h); }
  destroy(cc) { if (cc.canvas) { cc.canvas.width = 0; cc.canvas.height = 0; } cc.canvas = null; cc.context = null; }
}

/** Abre o PDF para conversão (instância própria do pdf.js, com a fábrica acima). */
export function openForConversion(bytes) {
  const base = new URL('../../vendor/pdfjs/', import.meta.url).href;
  return pdfjsLib.getDocument({
    data: bytes.slice ? bytes.slice() : bytes, isEvalSupported: false, CanvasFactory: NoTextCanvasFactory,
    cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/', verbosity: 0,
  }).promise;
}

const { OPS } = pdfjsLib;
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const applyV = (m, x, y) => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/** Cor do pdf.js ('#rrggbb', [r,g,b] 0-255 ou objeto de padrão) para '#rrggbb'. */
function colorOf(args) {
  const a = args.length === 1 ? args[0] : args;
  if (typeof a === 'string') return /^#[0-9a-f]{6}$/i.test(a) ? a.toLowerCase() : '#000000';
  if ((Array.isArray(a) || ArrayBuffer.isView(a)) && a.length >= 3 && typeof a[0] === 'number') return '#' + hex2(a[0]) + hex2(a[1]) + hex2(a[2]);
  return null; // padrão/sombreamento: cor indefinida
}

function fontInfo(page, name) {
  return new Promise((res) => {
    try {
      if (page.commonObjs.has(name)) return res(page.commonObjs.get(name));
      page.commonObjs.get(name, res);
      setTimeout(() => res(null), 4000);
    } catch { res(null); }
  });
}

/**
 * Lê a página: { w, h, glyphs, paths, images, fonts }.
 *  glyph: { ch, x, y (linha de base), w (avanço), size, angle, font, color, invisible, space }
 *  path:  { subpaths: [[{x,y}...]], closed[], fill, stroke, lineWidth, bbox, rectOnly }
 *  image: { bbox, objId }
 */
export async function readPage(page) {
  const vp = page.getViewport({ scale: 1 });
  const ol = await page.getOperatorList({ intent: 'print', annotationMode: pdfjsLib.AnnotationMode.ENABLE });
  const base = vp.transform.slice();
  const fonts = {};
  const glyphs = [], paths = [], images = [];

  // fontes usadas (para nome, negrito/itálico e Type3)
  for (let i = 0; i < ol.fnArray.length; i++) {
    if (ol.fnArray[i] === OPS.setFont) {
      const n = ol.argsArray[i][0];
      if (!(n in fonts)) fonts[n] = null;
    }
  }
  await Promise.all(Object.keys(fonts).map(async (n) => { fonts[n] = await fontInfo(page, n); }));

  const newState = () => ({
    ctm: base.slice(), fill: '#000000', stroke: '#000000', fillAlpha: 1, strokeAlpha: 1, lineWidth: 1, dash: false,
    font: null, fontName: '', size: 0, dir: 1, fm: [0.001, 0, 0, 0.001, 0, 0], Tc: 0, Tw: 0, Th: 1, TL: 0, Ts: 0, mode: 0,
    Tm: [1, 0, 0, 1, 0, 0], x: 0, y: 0, lineX: 0, lineY: 0, clip: null,
  });
  let st = newState();
  const stack = [];
  let path = [], cur = null, closed = [], px = 0, py = 0, sx = 0, sy = 0, pendingClip = false;
  const pathBox = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sp of path) for (const p of sp) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
    return [x0, y0, x1, y1];
  };
  const inter = (a, b) => (!a ? b : !b ? a : [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
  const takeClip = () => { if (pendingClip && path.length) st.clip = inter(st.clip, pathBox()); pendingClip = false; };

  const startSub = (x, y) => { cur = [{ x, y }]; path.push(cur); closed.push(false); };
  const lineTo = (x, y) => { if (!cur) startSub(px, py); cur.push({ x, y }); };
  const dev = (x, y) => { const [a, b] = apply(st.ctm, x, y); return { x: a, y: b }; };

  function construct(ops, args) {
    let j = 0;
    for (let i = 0; i < ops.length; i++) {
      switch (ops[i] | 0) {
        case OPS.rectangle: {
          const x = args[j++], y = args[j++], w = args[j++], h = args[j++];
          const p0 = dev(x, y), p1 = dev(x + w, y), p2 = dev(x + w, y + h), p3 = dev(x, y + h);
          cur = [p0, p1, p2, p3, { ...p0 }]; path.push(cur); closed.push(true); cur.rect = true;
          px = sx = x; py = sy = y; cur = null;
          break;
        }
        case OPS.moveTo: px = sx = args[j++]; py = sy = args[j++]; startSub(dev(px, py).x, dev(px, py).y); cur.rect = false; break;
        case OPS.lineTo: px = args[j++]; py = args[j++]; { const d = dev(px, py); lineTo(d.x, d.y); } break;
        case OPS.curveTo: case OPS.curveTo2: case OPS.curveTo3: {
          let c1x, c1y, c2x, c2y, ex, ey;
          const op = ops[i] | 0;
          if (op === OPS.curveTo) { c1x = args[j]; c1y = args[j + 1]; c2x = args[j + 2]; c2y = args[j + 3]; ex = args[j + 4]; ey = args[j + 5]; j += 6; }
          else if (op === OPS.curveTo2) { c1x = px; c1y = py; c2x = args[j]; c2y = args[j + 1]; ex = args[j + 2]; ey = args[j + 3]; j += 4; }
          else { c1x = args[j]; c1y = args[j + 1]; c2x = ex = args[j + 2]; c2y = ey = args[j + 3]; j += 4; }
          for (let k = 1; k <= 6; k++) { // curva achatada em 6 segmentos (só precisamos da caixa)
            const t = k / 6, u = 1 - t;
            const x = u * u * u * px + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex;
            const y = u * u * u * py + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey;
            const d = dev(x, y); lineTo(d.x, d.y);
          }
          if (cur) cur.curve = true;
          px = ex; py = ey;
          break;
        }
        case OPS.closePath: if (cur) { cur.push({ ...cur[0] }); closed[closed.length - 1] = true; cur = null; px = sx; py = sy; } break;
        default:
      }
    }
  }
  function paint(fill, stroke) {
    takeClip();
    if (path.length && (fill || stroke)) {
      let [x0, y0, x1, y1] = pathBox();
      if (st.clip) { x0 = Math.max(x0, st.clip[0]); y0 = Math.max(y0, st.clip[1]); x1 = Math.min(x1, st.clip[2]); y1 = Math.min(y1, st.clip[3]); }
      const lw = st.lineWidth * Math.sqrt(Math.abs(st.ctm[0] * st.ctm[3] - st.ctm[1] * st.ctm[2])) || 0.5;
      paths.push({
        subpaths: path, closed, bbox: [x0, y0, x1, y1],
        fill: fill ? st.fill : null, stroke: stroke ? st.stroke : null,
        fillAlpha: st.fillAlpha, strokeAlpha: st.strokeAlpha,
        lineWidth: Math.max(0.1, lw), dash: st.dash,
        rectOnly: path.every((sp) => sp.rect || (!sp.curve && sp.length <= 5)), curve: path.some((sp) => sp.curve),
      });
    }
    path = []; closed = []; cur = null;
  }
  function image(objId) {
    const c = [dev(0, 0), dev(1, 0), dev(1, 1), dev(0, 1)];
    const xs = c.map((p) => p.x), ys = c.map((p) => p.y);
    images.push({ bbox: inter([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], st.clip), objId });
  }
  function showText(gl) {
    const font = st.font; if (!font || !st.size) return;
    const size = st.size, Th = st.Th * st.dir, fm0 = st.fm[0] || 0.001;
    const vertical = !!font.vertical;
    const M = mul(st.ctm, st.Tm);
    const [ux, uy] = applyV(M, 0, size); // vetor "para cima" no espaço da página
    const effSize = Math.hypot(ux, uy);
    const [bx, by] = applyV(M, Th, 0);
    const angle = Math.round((Math.atan2(by, bx) * 180) / Math.PI * 10) / 10;
    const invisible = (st.mode & 3) === 3 || st.fillAlpha < 0.02;
    const color = (st.mode & 3) === 1 ? st.stroke : st.fill;
    const type3 = !!font.isType3Font;
    let x = 0;
    for (const g of gl) {
      if (typeof g === 'number') { x += (vertical ? 1 : -1) * g * size / 1000; continue; }
      const spacing = (g.isSpace ? st.Tw : 0) + st.Tc;
      const w = vertical ? (g.vmetric ? -g.vmetric[0] : g.width) : g.width;
      const adv = w * size * fm0 + spacing * st.dir;
      if (!vertical) {
        const tx = st.x + x * Th, ty = st.y + st.Ts;
        const [ox, oy] = apply(M, tx, ty);
        const [ex, ey] = apply(M, tx + adv * Th, ty);
        const ch = g.unicode || '';
        if (ch) {
          glyphs.push({
            ch, x: ox, y: oy, w: Math.hypot(ex - ox, ey - oy), size: effSize, angle,
            font: st.fontName, color: color || '#000000', invisible, type3, space: !!g.isSpace || /^\s+$/.test(ch),
            nat: Math.abs(w * size * fm0 * Th) * (effSize / (size || 1)),
          });
        }
      }
      x += adv;
    }
    if (vertical) st.y -= x; else st.x += x * Th;
  }

  const { fnArray: fns, argsArray: argv } = ol;
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i], a = argv[i];
    switch (fn) {
      case OPS.save: stack.push({ ...st, ctm: st.ctm.slice(), Tm: st.Tm.slice() }); break;
      case OPS.restore: if (stack.length) st = stack.pop(); break;
      case OPS.transform: st.ctm = mul(st.ctm, a); break;
      case OPS.paintFormXObjectBegin: stack.push({ ...st, ctm: st.ctm.slice(), Tm: st.Tm.slice() }); if (a[0]) st.ctm = mul(st.ctm, a[0]); break;
      case OPS.paintFormXObjectEnd: if (stack.length) st = stack.pop(); break;
      case OPS.beginGroup: stack.push({ ...st, ctm: st.ctm.slice(), Tm: st.Tm.slice() }); if (a[0] && a[0].matrix) st.ctm = mul(st.ctm, a[0].matrix); break;
      case OPS.endGroup: if (stack.length) st = stack.pop(); break;
      case OPS.beginAnnotation: {
        stack.push({ ...st, ctm: st.ctm.slice(), Tm: st.Tm.slice() });
        const s = newState(); s.ctm = mul(mul(base, a[2] || [1, 0, 0, 1, 0, 0]), a[3] || [1, 0, 0, 1, 0, 0]); st = s;
        break;
      }
      case OPS.endAnnotation: if (stack.length) st = stack.pop(); break;
      case OPS.setLineWidth: st.lineWidth = a[0]; break;
      case OPS.setDash: st.dash = !!(a[0] && a[0].length); break;
      case OPS.setGState:
        for (const [k, v] of a[0]) {
          if (k === 'LW') st.lineWidth = v; else if (k === 'ca') st.fillAlpha = v; else if (k === 'CA') st.strokeAlpha = v;
          else if (k === 'D') st.dash = !!(v && v[0] && v[0].length);
        }
        break;
      case OPS.setFillRGBColor: st.fill = colorOf(a) || st.fill; break;
      case OPS.setStrokeRGBColor: st.stroke = colorOf(a) || st.stroke; break;
      case OPS.setFillGray: st.fill = '#' + hex2(a[0] * 255).repeat(3); break;
      case OPS.setStrokeGray: st.stroke = '#' + hex2(a[0] * 255).repeat(3); break;
      case OPS.setFillColorN: case OPS.setFillColor: st.fill = colorOf(a) || '#808080'; break;
      case OPS.setStrokeColorN: case OPS.setStrokeColor: st.stroke = colorOf(a) || '#808080'; break;
      case OPS.setFillTransparent: st.fillAlpha = 0; break;
      case OPS.setStrokeTransparent: st.strokeAlpha = 0; break;
      // texto
      case OPS.beginText: st.Tm = [1, 0, 0, 1, 0, 0]; st.x = st.y = st.lineX = st.lineY = 0; break;
      case OPS.setFont: {
        const f = fonts[a[0]]; let size = a[1];
        st.font = f; st.fontName = a[0]; st.fm = (f && f.fontMatrix) || [0.001, 0, 0, 0.001, 0, 0];
        if (size < 0) { size = -size; st.dir = -1; } else st.dir = 1;
        st.size = size; break;
      }
      case OPS.setTextMatrix: st.Tm = a.length === 6 ? a.slice() : a[0].slice(); st.x = st.y = st.lineX = st.lineY = 0; break;
      case OPS.moveText: st.x = st.lineX += a[0]; st.y = st.lineY += a[1]; break;
      case OPS.setLeadingMoveText: st.TL = -a[1]; st.x = st.lineX += a[0]; st.y = st.lineY += a[1]; break;
      case OPS.nextLine: st.x = st.lineX += 0; st.y = st.lineY += st.TL; break;
      case OPS.setCharSpacing: st.Tc = a[0]; break;
      case OPS.setWordSpacing: st.Tw = a[0]; break;
      case OPS.setHScale: st.Th = a[0] / 100; break;
      case OPS.setLeading: st.TL = -a[0]; break;
      case OPS.setTextRise: st.Ts = a[0]; break;
      case OPS.setTextRenderingMode: st.mode = a[0]; break;
      case OPS.showText: case OPS.showSpacedText: showText(a[0]); break;
      case OPS.nextLineShowText: st.y = st.lineY += st.TL; st.x = st.lineX; showText(a[0]); break;
      case OPS.nextLineSetSpacingShowText: st.Tw = a[0]; st.Tc = a[1]; st.y = st.lineY += st.TL; st.x = st.lineX; showText(a[2]); break;
      // caminhos
      case OPS.constructPath: construct(a[0], a[1]); break;
      case OPS.stroke: paint(false, true); break;
      case OPS.closeStroke: paint(false, true); break;
      case OPS.fill: case OPS.eoFill: paint(true, false); break;
      case OPS.fillStroke: case OPS.eoFillStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke: paint(true, true); break;
      case OPS.clip: case OPS.eoClip: pendingClip = true; break;
      case OPS.endPath: takeClip(); path = []; closed = []; cur = null; break;
      case OPS.shadingFill: // sombreamento ocupa a área de recorte: vira figura
        images.push({ bbox: st.clip ? st.clip.slice() : [0, 0, vp.width, vp.height], shading: true }); break;
      // imagens
      case OPS.paintImageXObject: case OPS.paintImageXObjectRepeat: image(a[0]); break;
      case OPS.paintInlineImageXObject: case OPS.paintInlineImageXObjectGroup: image(null); break;
      case OPS.paintImageMaskXObject: case OPS.paintImageMaskXObjectGroup: case OPS.paintSolidColorImageMask: image(null); break;
      default:
    }
  }
  // sombreamentos sem caixa conhecida não servem para nada
  const imgs = images.filter((im) => im.bbox[2] - im.bbox[0] > 0.5 && im.bbox[3] - im.bbox[1] > 0.5)
    .map((im) => ({ ...im, bbox: clipBox(im.bbox, vp.width, vp.height) })).filter((im) => im.bbox);
  const pths = paths.map((p) => ({ ...p, bbox: clipBox(p.bbox, vp.width, vp.height, true) })).filter((p) => p.bbox);
  const finfo = {};
  for (const [n, f] of Object.entries(fonts)) {
    finfo[n] = f ? { name: f.name || '', bold: !!(f.bold || f.black), italic: !!f.italic, mono: !!f.isMonospace, serif: !!f.isSerifFont, type3: !!f.isType3Font, fallback: f.fallbackName || '' } : { name: '', bold: false, italic: false };
  }
  return { w: vp.width, h: vp.height, glyphs: glyphs.filter((g) => g.x > -50 && g.x < vp.width + 50 && g.y > -50 && g.y < vp.height + 50), paths: pths, images: imgs, fonts: finfo };
}

function clipBox(b, W, H, allowThin = false) {
  const x0 = Math.max(0, b[0]), y0 = Math.max(0, b[1]), x1 = Math.min(W, b[2]), y1 = Math.min(H, b[3]);
  if (allowThin ? x1 < x0 || y1 < y0 : x1 - x0 < 0.5 || y1 - y0 < 0.5) return null;
  return [x0, y0, x1, y1];
}

/**
 * Desenha a página sem o texto (só imagens, vetores e anotações), para o fundo
 * do modo "layout idêntico" e para recortar figuras.
 */
export async function renderNoText(page, scale, { type3 = false } = {}) {
  if (type3) await patchType3(page);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  c.__hfaHideT3 = type3;
  const g = noText(c.getContext('2d'));
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  hideT3 = type3;
  try {
    await page.render({ canvasContext: g, viewport: vp, intent: 'print', annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
  } finally { hideT3 = false; }
  return c;
}

// Letras em fonte Type3 são desenhos (operadores de caminho), não fillText. Para
// tirá-las do fundo, o showType3Text do pdf.js deixa de pintar só nos canvases
// marcados pela conversão; os demais desenhos do editor não mudam.
let t3Patched = null;
function patchType3(page) {
  t3Patched = t3Patched || (async () => {
    const c = document.createElement('canvas'); c.width = c.height = 2;
    const task = page.render({ canvasContext: c.getContext('2d'), viewport: page.getViewport({ scale: 0.002 }) });
    // a tarefa interna (com o CanvasGraphics) fica registrada na página enquanto desenha
    let internal = null;
    for (const st of (page._intentStates || new Map()).values()) for (const t of st.renderTasks || []) if (t.task === task) internal = t;
    await task.promise.catch(() => {});
    const gfx = internal && internal.gfx;
    const proto = gfx && Object.getPrototypeOf(gfx);
    if (!proto || typeof proto.showType3Text !== 'function' || proto.__hfaT3) return;
    const orig = proto.showType3Text;
    proto.showType3Text = function (glyphs) {
      const cv = this.ctx && this.ctx.canvas;
      if (!cv || !cv.__hfaHideT3) return orig.call(this, glyphs);
      const vis = this.contentVisible; this.contentVisible = false;
      try { return orig.call(this, glyphs); } finally { this.contentVisible = vis; }
    };
    proto.__hfaT3 = true;
  })();
  return t3Patched;
}
