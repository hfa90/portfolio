// Escolha da fonte do Word para cada fonte do PDF, medindo larguras reais.
//
// O nome da fonte no PDF nem sempre existe no computador (ou existe com outro
// nome, como "SegoeUIBlack" -> "Segoe UI Black"). Para cada fonte do PDF somamos
// a largura que o texto ocupa no PDF e comparamos com a largura do mesmo texto
// nas fontes candidatas instaladas (medida no canvas do navegador). Fica a
// candidata com largura mais parecida; a diferença que sobra vira a escala
// horizontal dos caracteres no modo "layout idêntico".
import { wordFont } from './layout.js';

const SANS = ['Arial', 'Calibri', 'Segoe UI', 'Verdana', 'Tahoma', 'Aptos', 'Arial Narrow', 'Trebuchet MS', 'Helvetica'];
const SERIF = ['Times New Roman', 'Cambria', 'Georgia', 'Garamond', 'Book Antiqua'];
const MONO = ['Courier New', 'Consolas', 'Lucida Console'];

let ctx = null;
const installedCache = new Map();
function c2d() { if (!ctx) ctx = document.createElement('canvas').getContext('2d'); return ctx; }
const fontCss = (fam, bold, italic, px = 100, generic = 'monospace') => `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px "${fam.replace(/"/g, '')}", ${generic}`;

/** A fonte está instalada? (largura muda em relação às genéricas) */
export function installed(fam) {
  if (installedCache.has(fam)) return installedCache.get(fam);
  // fontes web desta página (Inter, fontes de assinatura) não existem para o Word
  const norm = (f) => f.replace(/["']/g, '').trim().toLowerCase();
  if ([...document.fonts].some((f) => norm(f.family) === norm(fam))) { installedCache.set(fam, false); return false; }
  const g = c2d(), probe = 'mmmmmmmmmmlli1WQ@#ãç';
  let ok = false;
  for (const gen of ['monospace', 'serif', 'sans-serif']) {
    g.font = `100px ${gen}`; const a = g.measureText(probe).width;
    g.font = fontCss(fam, false, false, 100, gen); const b = g.measureText(probe).width;
    if (Math.abs(a - b) > 0.5) { ok = true; break; }
  }
  installedCache.set(fam, ok);
  return ok;
}
function width(fam, bold, italic, text) { const g = c2d(); g.font = fontCss(fam, bold, italic); return g.measureText(text).width / 100; }

function variants(base, raw) {
  const l = raw.toLowerCase(), out = [];
  if (/black|heavy/.test(l)) out.push(`${base} Black`, `${base} Heavy`);
  if (/semibold|demibold|semi-bold/.test(l)) out.push(`${base} Semibold`, `${base} SemiBold`);
  if (/semilight/.test(l)) out.push(`${base} Semilight`);
  if (/light/.test(l)) out.push(`${base} Light`);
  if (/medium/.test(l)) out.push(`${base} Medium`);
  if (/condensed|narrow|cond\b/.test(l)) out.push(`${base} Narrow`, `${base} Condensed`);
  return out;
}

/**
 * fonts: { nome-pdf: info }, samples: Map(nome-pdf -> { text, w (largura no PDF em pt), size })
 * Devolve fontOf(nome) -> { family, bold, italic, scale }
 */
export function planFonts(fonts, samples) {
  const plan = new Map();
  for (const [name, info] of Object.entries(fonts)) {
    const base = wordFont(info);
    const raw = (info && info.name || '').replace(/^[A-Z]{6}\+/, '');
    const s = samples.get(name);
    let best = { family: base.family, bold: base.bold, italic: base.italic, scale: 1 };
    if (s && s.text.length >= 2 && s.w > 0) {
      const isMono = (info && info.mono) || /mono|code|consol|courier|menlo|fixed/i.test(raw) || MONO.includes(base.family);
      const cls = isMono ? MONO : info && info.serif || SERIF.includes(base.family) ? SERIF : SANS;
      const cands = [];
      for (const v of variants(base.family, raw)) cands.push({ family: v, bold: false, italic: base.italic, named: true });
      cands.push({ family: base.family, bold: base.bold, italic: base.italic, named: true });
      for (const f of cls) cands.push({ family: f, bold: base.bold, italic: base.italic });
      let pick = null;
      for (const c of cands) {
        if (!installed(c.family)) continue;
        const r = s.w / width(c.family, c.bold, c.italic, s.text);
        c.ratio = r;
        // a própria fonte (ou a variante de peso) com largura parecida: fica
        if (c.named && Math.abs(r - 1) < 0.035) { pick = c; break; }
        if (!pick || Math.abs(Math.log(r)) < Math.abs(Math.log(pick.ratio))) pick = c;
      }
      // sem nenhuma instalada (raro): mantém o nome do PDF, o Word substitui
      if (pick) best = { family: pick.family, bold: pick.bold, italic: pick.italic, scale: pick.ratio };
      else best.scale = 1;
    }
    plan.set(name, best);
  }
  return (n) => plan.get(n) || { family: 'Arial', bold: false, italic: false, scale: 1 };
}

/** Amostras de texto por fonte, a partir dos trechos de linha da página. */
export function addSamples(samples, segs) {
  for (const s of segs) {
    for (const g of s.glyphs) {
      if (g.space || !g.font) continue;
      let o = samples.get(g.font);
      if (!o) { o = { text: '', w: 0 }; samples.set(g.font, o); }
      if (o.text.length > 400) continue;
      o.text += g.ch; o.w += g.w / g.size; // largura em "em"
    }
  }
}
