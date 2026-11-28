// Word (.docx) -> PDF, 100% no navegador.
//
// 1. O docx-preview monta o documento em HTML (num Shadow DOM fora da tela).
// 2. As fontes do Office são trocadas por fontes com as MESMAS medidas
//    (Carlito = Calibri, Caladea = Cambria, Arimo = Arial, Tinos = Times New
//    Roman, Cousine = Courier New), registradas com o nome original: o texto
//    quebra nos mesmos pontos que no Word e a fonte desenhada é a mesma embutida
//    no PDF. Opcionalmente usa as fontes instaladas no computador.
// 3. Numeração de listas (contadores CSS) e campos de página (PAGE/NUMPAGES)
//    viram texto de verdade; a paginação é refeita (parágrafos quebram por
//    linha, tabelas por linha de tabela) porque o HTML não tem páginas.
// 4. Cada palavra é medida no navegador e desenhada no PDF (pdf-lib) na mesma
//    posição; fundos, bordas, imagens, sublinhados e links também.
import { PDFLib, loadFontkit, loadTTF } from '../pdf.js';
import { loadDocxPreview, loadJSZip } from './libs.js';
import { PUA } from './layout.js';
import { hollow } from './ttfhollow.js';
import { extractAnchors, takeTextboxes, placeAnchors, readTabs, markTabs, layoutTabs, markRuns, applyRuns } from './docxlayout.js';

const { PDFDocument, rgb, degrees, PDFName, PDFString, pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize,
  setCharacterSqueeze, setTextMatrix, showText, setFillingColor, setTextRenderingMode, TextRenderingMode, setStrokingColor, setLineWidth,
  rectangle, clip, endPath } = PDFLib;
const PT = 0.75; // px -> pt
const FONT_DIR = new URL('../../vendor/docfonts/', import.meta.url).href;
const METRIC = {
  Carlito: ['calibri', 'calibri light', 'carlito', 'aptos', 'aptos display', 'segoe ui', 'candara', 'corbel'],
  Caladea: ['cambria', 'caladea', 'cambria math'],
  Arimo: ['arial', 'helvetica', 'arimo', 'liberation sans', 'arial nova', 'helvetica neue', 'verdana', 'tahoma', 'trebuchet ms'],
  Tinos: ['times new roman', 'times', 'tinos', 'liberation serif', 'georgia', 'garamond', 'book antiqua', 'palatino linotype', 'century'],
  Cousine: ['courier new', 'courier', 'cousine', 'liberation mono', 'consolas', 'lucida console'],
};
const FACES = { r: '400Regular', b: '700Bold', i: '400Regular_Italic', bi: '700Bold_Italic' };
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|-apple-system|emoji|math|fangsong|inherit|initial)$/i;

function metricFor(fam) {
  const f = fam.toLowerCase();
  for (const [file, names] of Object.entries(METRIC)) if (names.includes(f)) return file;
  if (/mono|courier|consol|code/.test(f)) return 'Cousine';
  if (/serif|times|georgia|garamond|book|roman|palatino|minion|bodoni|century|baskerville/.test(f) && !/sans/.test(f)) return 'Tinos';
  return 'Arimo';
}
const firstFamily = (ff) => (ff || '').split(',')[0].trim().replace(/^["']|["']$/g, '');

// ---------- fontes ----------
/** Métricas verticais (hhea) em "em": { a: ascendente, d: descendente, g: lineGap }. */
function metricsOf(buf) {
  try {
    const v = new DataView(buf), n = v.getUint16(4);
    let head = 0, hhea = 0;
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16, tag = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
      if (tag === 'head') head = v.getUint32(o + 8); else if (tag === 'hhea') hhea = v.getUint32(o + 8);
    }
    const upm = v.getUint16(head + 18);
    return { a: v.getInt16(hhea + 4) / upm, d: -v.getInt16(hhea + 6) / upm, g: v.getInt16(hhea + 8) / upm };
  } catch { return { a: 0.9, d: 0.25, g: 0 }; }
}
const fileCache = new Map();
function fetchBytes(url) {
  if (!fileCache.has(url)) fileCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('fonte ' + url); return r.arrayBuffer(); }).catch((e) => { fileCache.delete(url); throw e; }));
  return fileCache.get(url);
}

/** Registra no documento as faces de uma família (com o nome usado no .docx). */
class FontBook {
  constructor() { this.families = new Map(); this.added = []; this.local = null; }
  async useLocal() {
    if (!('queryLocalFonts' in window)) return false;
    try { this.local = await window.queryLocalFonts(); return this.local.length > 0; } catch { this.local = null; return false; }
  }
  /** Garante as 4 faces da família `fam`. */
  async ensure(fam) {
    const key = fam.toLowerCase();
    if (this.families.has(key)) return this.families.get(key);
    const entry = { fam, faces: {} };
    this.families.set(key, entry);
    let done = false;
    if (this.local) done = await this.loadLocal(fam, entry);
    if (!done) {
      const file = metricFor(fam);
      for (const [k, suf] of Object.entries(FACES)) entry.faces[k] = { url: `${FONT_DIR}${file}_${suf}.ttf`, synthetic: false };
    }
    for (const [k, f] of Object.entries(entry.faces)) {
      const bytes = f.bytes || await fetchBytes(f.url);
      f.bytes = bytes;
      if (k === 'r') entry.m = metricsOf(bytes);
      const ff = new FontFace(fam, bytes.slice(0), { weight: k.startsWith('b') ? '700' : '400', style: k.endsWith('i') ? 'italic' : 'normal' });
      await ff.load(); document.fonts.add(ff); this.added.push(ff);
    }
    return entry;
  }
  async loadLocal(fam, entry) {
    const want = fam.toLowerCase();
    const list = this.local.filter((f) => f.family.toLowerCase() === want);
    if (!list.length) return false;
    const pick = (b, i) => list.find((f) => /bold/i.test(f.style) === b && /italic|oblique/i.test(f.style) === i && !/light|thin|semi|demi|black|medium|condensed|narrow/i.test(f.style));
    const reg = pick(false, false) || list[0];
    for (const [k, b, i] of [['r', false, false], ['b', true, false], ['i', false, true], ['bi', true, true]]) {
      const f = pick(b, i);
      try {
        const blob = await (f || reg).blob();
        const bytes = await blob.arrayBuffer();
        // fontes .ttc (coleção) não são aceitas pelo fontkit/pdf-lib
        if (new TextDecoder().decode(new Uint8Array(bytes, 0, 4)) === 'ttcf') return false;
        entry.faces[k] = { bytes, synthetic: !f && (b || i), local: true };
      } catch { return false; }
    }
    return true;
  }
  /** Face para (família, negrito, itálico). */
  face(fam, bold, italic) {
    const e = this.families.get(fam.toLowerCase()); if (!e) return null;
    return e.faces[(bold ? 'b' : '') + (italic ? 'i' : '') || 'r'] || e.faces.r;
  }
  metrics(fam) { const e = this.families.get((fam || '').toLowerCase()); return (e && e.m) || { a: 0.9, d: 0.25, g: 0 }; }
  dispose() { this.added.forEach((f) => document.fonts.delete(f)); this.added = []; }
}

// ---------- pré-processamento do .docx: campos de página ----------
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TOK = { PAGE: '⁠#PG#⁠', NUMPAGES: '⁠#NP#⁠', SECTIONPAGES: '⁠#NP#⁠' };
function fixFields(xmlText) {
  if (!/fldChar|fldSimple/.test(xmlText)) return xmlText;
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return xmlText;
  let changed = false;
  // campos simples
  for (const f of Array.from(doc.getElementsByTagNameNS(W, 'fldSimple'))) {
    const m = /^\s*(PAGE|NUMPAGES|SECTIONPAGES)\b/i.exec(f.getAttributeNS(W, 'instr') || f.getAttribute('w:instr') || '');
    if (!m) continue;
    const ts = Array.from(f.getElementsByTagNameNS(W, 't'));
    if (ts.length) { ts[0].textContent = TOK[m[1].toUpperCase()]; ts.slice(1).forEach((t) => { t.textContent = ''; }); changed = true; }
  }
  // campos complexos: begin ... instrText ... separate ... resultado ... end
  const runs = Array.from(doc.getElementsByTagNameNS(W, 'r'));
  let depth = 0, instr = '', state = 0, kind = null, first = true;
  for (const r of runs) {
    for (const c of Array.from(r.childNodes)) {
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (ln === 'fldChar') {
        const t = c.getAttributeNS(W, 'fldCharType') || c.getAttribute('w:fldCharType');
        if (t === 'begin') { depth++; if (depth === 1) { instr = ''; state = 1; kind = null; } }
        else if (t === 'separate' && depth === 1) { const m = /^\s*(PAGE|NUMPAGES|SECTIONPAGES)\b/i.exec(instr); kind = m ? m[1].toUpperCase() : null; state = 2; first = true; }
        else if (t === 'end') { depth = Math.max(0, depth - 1); if (!depth) { state = 0; kind = null; } }
      } else if (ln === 'instrText' && depth === 1 && state === 1) instr += c.textContent;
      else if (ln === 't' && state === 2 && kind && depth === 1) { c.textContent = first ? TOK[kind] : ''; first = false; changed = true; }
    }
  }
  return changed ? new XMLSerializer().serializeToString(doc) : xmlText;
}
async function prepareDocx(bytes) {
  const JSZip = await loadJSZip();
  const z = await JSZip.loadAsync(bytes);
  await readContextual(z);
  const tabs = await readTabs(z);
  const state = { n: 0, anchors: new Map(), txbx: [], content: new Map() };
  await extractAnchors(z, state);
  await markTabs(z, tabs);
  await markRuns(z);
  for (const name of Object.keys(z.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const t = await z.file(name).async('string');
    const t2 = fixFields(t);
    if (t2 !== t) z.file(name, t2);
  }
  return { blob: await z.generateAsync({ type: 'blob' }), zip: z, state, tabDef: tabs.def };
}

// ---------- renderização ----------
const OPTS = {
  className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true,
  ignoreLastRenderedPageBreak: true, experimental: true, trimXmlDeclaration: true, renderHeaders: true, renderFooters: true,
  renderFootnotes: true, renderEndnotes: true, renderChanges: false, renderComments: false, useBase64URL: false, debug: false,
};
async function render(host, blob) {
  const docx = await loadDocxPreview();
  host.shadowRoot.innerHTML = '';
  const style = document.createElement('div'), body = document.createElement('div');
  const base = document.createElement('style');
  base.textContent = ':host{all:initial}.docx-wrapper,.docx-wrapper *{font-kerning:none;font-variant-ligatures:none}.docx-wrapper{background:#fff!important;padding:0!important;display:block!important}'
    + '.docx-wrapper>section.docx{box-shadow:none!important;margin:0 0 40px 0!important}.hfa-nobefore::before{content:none!important}'
    + '.hfa-mark{white-space:pre}.hfa-exact *{line-height:0!important}';
  host.shadowRoot.append(base, style, body);
  await docx.renderAsync(blob, body, style, OPTS);
  await new Promise((r) => setTimeout(r, 650)); // tabulações são ajustadas pelo docx-preview depois de 500 ms
  return body;
}
const sectionsOf = (body) => Array.from(body.querySelectorAll('.docx-wrapper > section.docx'));

/** Famílias usadas pelos elementos com texto; genéricas recebem uma família nossa. */
function collectFamilies(body) {
  const fams = new Set();
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (!(el instanceof Element)) continue;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!hasText) continue;
    let fam = firstFamily(getComputedStyle(el).fontFamily);
    if (!fam || GENERIC.test(fam)) {
      const gen = /serif/.test(getComputedStyle(el).fontFamily) && !/sans/.test(getComputedStyle(el).fontFamily) ? 'HFA Serif' : /mono/.test(getComputedStyle(el).fontFamily) ? 'HFA Mono' : 'HFA Sans';
      el.style.fontFamily = `"${gen}"`; fam = gen;
    }
    fams.add(fam);
  }
  return fams;
}

/** Símbolos da área privada (Symbol/Wingdings) viram Unicode desenhado com DejaVu. */
function fixSymbols(body) {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const hits = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/[-]/.test(n.nodeValue)) hits.push(n);
  for (const n of hits) {
    n.nodeValue = n.nodeValue.replace(/[-]/g, (c) => PUA[c] || '•');
    if (n.parentElement) n.parentElement.style.fontFamily = '"HFA Symbols"';
  }
}

// ---------- espaçamento entre linhas como no Word ----------
// O docx-preview escreve: "auto" -> line-height: 1.15 (múltiplo do tamanho da
// fonte); "atLeast" -> calc(100% + Npt); "exact" -> Npt. No Word o múltiplo é
// sobre a altura natural da fonte e "pelo menos" é max(natural, N).
function rewriteDecl(st) {
  const lh = st.lineHeight;
  if (!lh) return;
  if (/^[\d.]+$/.test(lh)) { st.setProperty('--hfa-rule', 'auto'); st.setProperty('--hfa-mult', lh); st.lineHeight = `calc(var(--hfa-nat, 1.2) * ${lh})`; }
  else { const m = /^calc\(100% \+ ([\d.]+)pt\)$/.exec(lh); if (m) { st.setProperty('--hfa-rule', 'atleast'); st.setProperty('--hfa-L', m[1]); st.lineHeight = `max(calc(var(--hfa-nat, 1.2) * 1em), ${m[1]}pt)`; } else if (/pt$/.test(lh)) { st.setProperty('--hfa-rule', 'exact'); } }
}
function rewriteLineHeights(root) {
  for (const sh of root.styleSheets) { try { for (const r of sh.cssRules) if (r.style) rewriteDecl(r.style); } catch { /* */ } }
  root.querySelectorAll('[style]').forEach((el) => rewriteDecl(el.style));
  // margens entre parágrafos somam no Word (no CSS colapsam): viram preenchimento
  const ps = Array.from(root.querySelectorAll('p'));
  const sp = ps.map((p) => { const cs = getComputedStyle(p); return { mt: parseFloat(cs.marginTop) || 0, mb: parseFloat(cs.marginBottom) || 0, pt: cs.paddingTop, pb: cs.paddingBottom }; });
  // espaçamento contextual: entre parágrafos do mesmo estilo (listas) o Word não põe espaço
  ps.forEach((p, i) => {
    const n = p.nextElementSibling;
    const cls = [...p.classList].find((c) => contextual.has(c));
    if (cls && n && n.tagName === 'P' && n.classList.contains(cls)) { sp[i].mb = 0; sp[ps.indexOf(n)].mt = 0; }
  });
  ps.forEach((p, i) => {
    const { mt, mb, pt, pb } = sp[i];
    p.style.marginTop = '0'; p.style.marginBottom = '0';
    p.style.paddingTop = `calc(${pt} + ${mt}px)`; p.style.paddingBottom = `calc(${pb} + ${mb}px)`;
  });
}
let contextual = new Set();
/** Estilos de parágrafo com "não adicionar espaço entre parágrafos do mesmo estilo". */
async function readContextual(zip) {
  contextual = new Set();
  const f = zip.file('word/styles.xml'); if (!f) return;
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  const styles = new Map();
  for (const st of Array.from(doc.getElementsByTagNameNS(W, 'style'))) {
    const id = st.getAttributeNS(W, 'styleId') || st.getAttribute('w:styleId'); if (!id) continue;
    const based = st.getElementsByTagNameNS(W, 'basedOn')[0];
    const cs = st.getElementsByTagNameNS(W, 'contextualSpacing')[0];
    const val = cs ? (cs.getAttributeNS(W, 'val') || cs.getAttribute('w:val') || 'true') : null;
    styles.set(id, { based: based && (based.getAttributeNS(W, 'val') || based.getAttribute('w:val')), cs: val == null ? null : !/^(0|false|off)$/.test(val) });
  }
  for (const [id] of styles) {
    let cur = id, v = null;
    for (let k = 0; k < 10 && cur && v == null; k++) { const e = styles.get(cur); if (!e) break; v = e.cs; cur = e.based; }
    if (v) contextual.add('docx_' + id.replace(/[ .]+/g, '-').replace(/[&]+/g, 'and').toLowerCase());
  }
}
/** Altura natural por parágrafo e posição da linha de base como no Word. */
function applyNat(body, book) {
  const ps = Array.from(body.querySelectorAll('p'));
  // fonte dominante do parágrafo: a do texto (os <span>), não a do <p>
  const fam = new Map();
  for (const p of ps) {
    const cnt = new Map();
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const f = firstFamily(getComputedStyle(n.parentElement).fontFamily); cnt.set(f, (cnt.get(f) || 0) + n.nodeValue.length); }
    const f = [...cnt.entries()].sort((x, y) => y[1] - x[1])[0];
    fam.set(p, f ? f[0] : firstFamily(getComputedStyle(p).fontFamily));
  }
  for (const p of ps) { const m = book.metrics(fam.get(p)); p.style.setProperty('--hfa-nat', String(m.a + m.d + m.g)); }
  // Justificado: o Word comprime cada espaço até ~28% para caber mais uma palavra
  // na linha (medido no Word); o CSS só estica. Espaço negativo + justify imita isso.
  const g = document.createElement('canvas').getContext('2d');
  for (const p of ps) {
    const cs = getComputedStyle(p);
    if (cs.textAlign !== 'justify') continue;
    g.font = `${cs.fontSize} "${fam.get(p)}"`;
    p.style.wordSpacing = `${-0.28 * g.measureText(' ').width}px`;
  }
  for (const p of ps) {
    const cs = getComputedStyle(p);
    const rule = cs.getPropertyValue('--hfa-rule').trim();
    const sz = parseFloat(cs.fontSize), L = parseFloat(cs.lineHeight);
    if (!sz || !L) continue;
    const m = book.metrics(fam.get(p));
    const css = (L - (m.a + m.d) * sz) / 2 + m.a * sz; // onde o CSS põe a linha de base
    let word;
    if (rule === 'exact') word = 0.8 * L;
    else if (rule === 'atleast' && L > (m.a + m.d + m.g) * sz + 0.1) word = L - m.d * sz;
    else word = (m.g + m.a) * sz; // simples/múltiplo: o espaço extra fica abaixo
    // parágrafo vazio com altura exata: ocupa exatamente a linha (o CSS daria no mínimo 1em)
    if (rule === 'exact' && !p.textContent.trim() && !p.querySelector('img,svg,table,div')) { p.style.minHeight = '0'; p.style.height = `${L}px`; p.style.boxSizing = 'content-box'; continue; }
    // altura exata: no Word a linha nunca cresce; no CSS fontes misturadas aumentam a
    // linha. Os filhos deixam de contar (line-height 0) e só a "escora" do parágrafo,
    // com a fonte dominante, define a linha.
    if (rule === 'exact') { p.classList.add('hfa-exact'); p.style.fontFamily = `"${fam.get(p)}"`; }
    const shift = word - css;
    if (Math.abs(shift) > 0.05) { p.style.position = 'relative'; p.style.top = `${shift}px`; }
  }
}

// ---------- numeração de listas ----------
function parseCounters(v) {
  const out = [];
  if (!v || v === 'none') return out;
  const re = /([\w-]+)(?:\s+(-?\d+))?/g; let m;
  while ((m = re.exec(v))) out.push([m[1], m[2] == null ? null : +m[2]]);
  return out;
}
const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
function fmtCounter(n, style) {
  switch ((style || 'decimal').trim()) {
    case 'lower-alpha': case 'lower-latin': { let s = ''; let k = n; while (k > 0) { k--; s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); } return s || '0'; }
    case 'upper-alpha': case 'upper-latin': return fmtCounter(n, 'lower-alpha').toUpperCase();
    case 'lower-roman': { let s = '', k = n; for (const [v, r] of ROMAN) while (k >= v) { s += r; k -= v; } return s || '0'; }
    case 'upper-roman': return fmtCounter(n, 'lower-roman').toUpperCase();
    case 'decimal-leading-zero': return (n < 10 && n >= 0 ? '0' : '') + n;
    case 'disc': return '•'; case 'circle': return '◦'; case 'square': return '▪'; case 'none': return '';
    default: return String(n);
  }
}
function evalContent(content, counters) {
  if (!content || content === 'none' || content === 'normal') return null;
  let out = '';
  const re = /"((?:[^"\\]|\\.)*)"|counter\(\s*([\w-]+)\s*(?:,\s*([\w-]+)\s*)?\)/g; let m;
  while ((m = re.exec(content))) {
    if (m[1] != null) out += m[1].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
    else out += fmtCounter(counters.get(m[2]) || 0, m[3]);
  }
  return out;
}
/** Simula os contadores CSS em ordem de documento e troca os ::before por texto. */
function materializeNumbering(body) {
  const counters = new Map();
  const wrap = body.querySelector('.docx-wrapper');
  for (const [n, v] of parseCounters(getComputedStyle(wrap).counterReset)) counters.set(n, v || 0);
  const todo = [];
  for (const p of body.querySelectorAll('p')) {
    const cs = getComputedStyle(p);
    for (const [n, v] of parseCounters(cs.counterReset)) counters.set(n, v || 0);
    for (const [n, v] of parseCounters(cs.counterSet)) counters.set(n, v || 0);
    const b = getComputedStyle(p, '::before');
    if (!b.content || b.content === 'none' || b.content === 'normal') continue;
    for (const [n, v] of parseCounters(b.counterIncrement)) counters.set(n, (counters.get(n) || 0) + (v == null ? 1 : v));
    const text = evalContent(b.content, counters);
    if (text == null) continue;
    const st = {};
    for (const k of ['display', 'width', 'minWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'textDecorationLine', 'letterSpacing', 'verticalAlign', 'paddingRight', 'paddingLeft', 'marginRight', 'marginLeft', 'textIndent', 'backgroundImage', 'backgroundSize', 'backgroundRepeat', 'height', 'lineHeight']) st[k] = b[k];
    todo.push({ p, text, st });
  }
  for (const { p, text, st } of todo) {
    const s = document.createElement('span'); s.className = 'hfa-mark';
    for (const [k, v] of Object.entries(st)) if (v && v !== 'auto' && v !== 'none' && v !== 'normal' || k === 'display') s.style[k] = v;
    if (st.display === 'inline' || !st.display) s.style.display = 'inline';
    s.textContent = text.replace(/\t/g, '\u2003').replace(/[\uf000-\uf0ff]/g, (c) => PUA[c] || '\u2022');
    // marcador da fonte Symbol/Wingdings: desenhado com a DejaVu (tem os mesmos símbolos em Unicode)
    if (/symbol|wingdings/i.test(st.fontFamily || '') || /[\uf000-\uf0ff]/.test(text)) s.style.fontFamily = '"HFA Symbols"';
    p.insertBefore(s, p.firstChild); p.classList.add('hfa-nobefore');
  }
}

// ---------- paginação ----------
function pageGeom(sec) {
  const cs = getComputedStyle(sec);
  const pageH = parseFloat(cs.minHeight) || sec.getBoundingClientRect().height;
  const r = sec.getBoundingClientRect();
  const footer = sec.querySelector(':scope > footer');
  let foot = 0;
  if (footer) { const fr = footer.getBoundingClientRect(); foot = Math.max(0, fr.height + parseFloat(getComputedStyle(footer).marginBottom || 0)); }
  return { top: r.top, limit: r.top + pageH - parseFloat(cs.paddingBottom) - foot, pageH };
}
const blocksOf = (sec) => Array.from(sec.querySelectorAll(':scope > article')).flatMap((a) => Array.from(a.children).map((el) => ({ el, art: a })));

function charRect(node, i) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const rs = r.getClientRects(); return rs[0] || r.getBoundingClientRect(); }
/** Divide o parágrafo na primeira linha que passa de `limit`. Devolve o pedaço de baixo ou null. */
function splitParagraph(p, limit) {
  const texts = [];
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.length) texts.push(n);
  const chars = [];
  for (const n of texts) for (let i = 0; i < n.nodeValue.length; i++) chars.push([n, i]);
  if (chars.length < 2) return null;
  // primeiro caractere (não espaço) cuja base passa do limite
  let lo = 0, hi = chars.length - 1, first = -1;
  const bottom = (k) => { const r = charRect(chars[k][0], chars[k][1]); return r.height ? r.bottom : -Infinity; };
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bottom(mid) > limit + 0.5) { first = mid; hi = mid - 1; } else lo = mid + 1; }
  if (first <= 0) return null;
  // volta ao começo daquela linha
  const lineTop = charRect(chars[first][0], chars[first][1]).top;
  let k = first;
  while (k > 0) { const r = charRect(chars[k - 1][0], chars[k - 1][1]); if (r.height && r.bottom <= lineTop + 1) break; k--; }
  if (k <= 0) return null;
  const range = document.createRange();
  range.setStart(chars[k][0], chars[k][1]);
  range.setEndAfter(p.lastChild);
  const frag = range.extractContents();
  const np = p.cloneNode(false);
  np.classList.remove('hfa-nobefore');
  np.append(frag);
  np.style.textIndent = '0'; np.style.marginTop = '0'; np.style.paddingTop = '0';
  np.classList.add('hfa-nobefore');
  p.style.marginBottom = '0'; p.style.paddingBottom = '0';
  p.after(np);
  return np;
}
function splitTable(t, limit) {
  const rows = Array.from(t.querySelectorAll(':scope > tbody > tr, :scope > tr'));
  const idx = rows.findIndex((r) => r.getBoundingClientRect().bottom > limit + 0.5);
  if (idx <= 0) return null;
  const nt = t.cloneNode(false);
  const cg = t.querySelector(':scope > colgroup'); if (cg) nt.append(cg.cloneNode(true));
  const tb = document.createElement('tbody'); nt.append(tb);
  rows.slice(idx).forEach((r) => tb.append(r));
  t.after(nt);
  return nt;
}
/** Refaz a paginação: o que passa do fim da página vai para uma página nova. */
function paginate(body) {
  let guard = 0;
  for (let i = 0; i < sectionsOf(body).length && guard < 5000; i++, guard++) {
    const sec = sectionsOf(body)[i];
    const g = pageGeom(sec);
    const bl = blocksOf(sec);
    const over = bl.findIndex((b) => b.el.getBoundingClientRect().bottom > g.limit + 0.5);
    if (over < 0) continue;
    let moveFrom = over; let rest = null;
    const b = bl[over];
    const tag = b.el.tagName;
    if (tag === 'P') rest = splitParagraph(b.el, g.limit);
    else if (tag === 'TABLE') rest = splitTable(b.el, g.limit);
    if (rest) moveFrom = over + 1;
    else if (over === 0) { if (bl.length === 1) continue; moveFrom = 1; } // não cabe nem sozinho: fica
    const moving = [...(rest ? [{ el: rest, art: b.art }] : []), ...bl.slice(moveFrom)];
    if (!moving.length) continue;
    const ns = sec.cloneNode(false);
    const header = sec.querySelector(':scope > header'), footer = sec.querySelector(':scope > footer');
    if (header) ns.append(header.cloneNode(true));
    const arts = new Map();
    for (const m of moving) {
      if (!arts.has(m.art)) { const a = m.art.cloneNode(false); arts.set(m.art, a); ns.append(a); }
      arts.get(m.art).append(m.el);
    }
    if (footer) ns.append(footer.cloneNode(true));
    sec.after(ns);
  }
}
function fillPageFields(body) {
  const secs = sectionsOf(body), total = secs.length;
  secs.forEach((sec, i) => {
    const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeValue.includes('#PG#') || n.nodeValue.includes('#NP#')) n.nodeValue = n.nodeValue.replace(/⁠#PG#⁠/g, String(i + 1)).replace(/⁠#NP#⁠/g, String(total));
    }
  });
}

// ---------- DOM -> PDF ----------
const parseColor = (c) => {
  const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  const a = p.length > 3 ? p[3] : 1;
  if (a <= 0.01) return null;
  return { c: rgb(p[0] / 255, p[1] / 255, p[2] / 255), a };
};

class PdfWriter {
  constructor(out, book, stats) { this.full = []; this.out = out; this.book = book; this.stats = stats; this.fonts = new Map(); this.imgs = new Map(); this.fk = false; this.measure = document.createElement('canvas').getContext('2d'); this.metrics = new Map(); }
  async font(face) {
    if (!this.fk) { this.out.registerFontkit(await loadFontkit()); this.fk = true; }
    // inteira: o subset do fontkit do pdf-lib corrompe parte das fontes (ver scripts/docfonts.py)
    // a mesma fonte (ex.: Calibri e Calibri Light usam a Carlito) entra uma vez só
    const key = face.bytes;
    if (!this.fonts.has(key)) {
      this.fonts.set(key, (async () => {
        try {
          const f = await this.out.embedFont(face.bytes, { subset: !!face.subset }); f.widthOfTextAtSize('Ag', 10);
          if (!face.subset) { f.__used = new Set(); this.full.push(f); } // esvaziada antes de salvar (ver ttfhollow.js)
          return f;
        }
        catch (e) { // fonte do computador que o fontkit não lê: usa a de mesmas medidas
          console.warn('fonte', e);
          return this.out.embedFont(await fetchBytes(`${FONT_DIR}Arimo_400Regular.ttf`), { subset: false });
        }
      })());
    }
    return this.fonts.get(key);
  }
  async fallback() {
    if (!this.fb) this.fb = (async () => { if (!this.fk) { this.out.registerFontkit(await loadFontkit()); this.fk = true; } return this.out.embedFont(await loadTTF('DejaVuSans'), { subset: true }); })();
    return this.fb;
  }
  ascent(css) {
    if (!this.metrics.has(css)) { this.measure.font = css; const m = this.measure.measureText('Hgjpq'); this.metrics.set(css, [m.fontBoundingBoxAscent, m.fontBoundingBoxDescent]); }
    return this.metrics.get(css);
  }
}
const has = (font, ch) => { try { const f = font.embedder && font.embedder.font; return f ? f.hasGlyphForCodePoint(ch.codePointAt(0)) : true; } catch { return true; } };

function drawWord(pg, font, text, x, y, size, color, squeeze, bold, tc = 0) {
  const key = pg.node.newFontDictionary(font.name, font.ref);
  if (font.__used) for (const g of font.embedder.font.layout(text).glyphs) font.__used.add(g.id);
  const ops = [pushGraphicsState(), setFillingColor(color.c), beginText(), setFontAndSize(key, size)];
  if (Math.abs(squeeze - 100) > 0.5) ops.push(setCharacterSqueeze(squeeze));
  if (tc) ops.push(PDFLib.setCharacterSpacing(tc));
  if (bold) ops.push(setStrokingColor(color.c), setLineWidth(size * 0.03), setTextRenderingMode(TextRenderingMode.FillAndOutline));
  ops.push(setTextMatrix(1, 0, 0, 1, x, y), showText(font.encodeText(text)), endText(), popGraphicsState());
  if (color.a < 1) {
    const gs = pg.doc.context.obj({ Type: 'ExtGState', ca: color.a, CA: color.a });
    const gk = pg.node.newExtGState('GS', pg.doc.context.register(gs));
    ops.splice(1, 0, PDFLib.setGraphicsState(gk));
  }
  pg.pushOperators(...ops);
}

async function drawSection(sec, pg, W, pageH, wr, links) {
  const sr = sec.getBoundingClientRect();
  const X = (px) => (px - sr.left) * PT, Y = (px) => pageH - (px - sr.top) * PT;
  const inPage = (r) => r.right > sr.left - 1 && r.left < sr.left + W / PT + 1 && r.bottom > sr.top - 1 && r.top < sr.top + pageH / PT + 1;
  const pcs = getComputedStyle(sec);
  const pbg = parseColor(pcs.backgroundColor);
  if (pbg && !(pbg.c.red > 0.99 && pbg.c.green > 0.99 && pbg.c.blue > 0.99)) pg.drawRectangle({ x: 0, y: 0, width: W, height: pageH, color: pbg.c, opacity: pbg.a });

  const rect = (r, col) => { if (!col || r.width <= 0 || r.height <= 0) return; pg.drawRectangle({ x: X(r.left), y: Y(r.bottom), width: r.width * PT, height: r.height * PT, color: col.c, opacity: col.a }); };
  const behind = [], normal = [];
  const all = sec.querySelectorAll('*');
  for (const el of all) { const z = parseInt(getComputedStyle(el).zIndex, 10); (z < 0 ? behind : normal).push(el); }
  const order = [sec, ...behind, ...normal.filter((el) => !behind.some((b) => b.contains(el)))];
  for (const el of order) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') continue;
    const tag = el.tagName;
    // fundo e bordas
    if (el !== sec) {
      const bg = parseColor(cs.backgroundColor);
      const inline = cs.display === 'inline';
      const rs = inline ? Array.from(el.getClientRects()) : [el.getBoundingClientRect()];
      if (bg) rs.forEach((r) => { if (inPage(r)) rect(r, bg); });
      if (!inline) drawBorders(el, cs, rs[0], pg, X, Y);
    }
    // imagens
    if (tag === 'IMG' && el.src) await drawImg(el, cs, pg, wr, X, Y);
    else if (tag === 'svg' || el instanceof SVGSVGElement) await drawSvg(el, pg, wr, X, Y);
    if (tag === 'A' && el.href && /^(https?|mailto):/i.test(el.getAttribute('href') || '')) for (const r of el.getClientRects()) links.push({ url: el.getAttribute('href'), r: [X(r.left), Y(r.bottom), X(r.right), Y(r.top)] });
    // texto
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) await drawText(n, el, cs, pg, wr, X, Y, inPage);
  }
}

function drawBorders(el, cs, r, pg, X, Y) {
  if (!r || r.width <= 0 || r.height <= 0) return;
  const collapsed = (el.tagName === 'TD' || el.tagName === 'TH') && el.closest('table') && getComputedStyle(el.closest('table')).borderCollapse === 'collapse';
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    const w = parseFloat(cs[`border${side}Width`]), st = cs[`border${side}Style`];
    if (!w || st === 'none' || st === 'hidden') continue;
    const col = parseColor(cs[`border${side}Color`]); if (!col) continue;
    const wpt = w * PT;
    const off = collapsed ? -w / 2 : 0;
    let x0, y0, x1, y1;
    if (side === 'Top') { x0 = r.left; x1 = r.right; y0 = y1 = r.top + off + w / 2; }
    else if (side === 'Bottom') { x0 = r.left; x1 = r.right; y0 = y1 = r.bottom - off - w / 2; }
    else if (side === 'Left') { y0 = r.top; y1 = r.bottom; x0 = x1 = r.left + off + w / 2; }
    else { y0 = r.top; y1 = r.bottom; x0 = x1 = r.right - off - w / 2; }
    const o = { start: { x: X(x0), y: Y(y0) }, end: { x: X(x1), y: Y(y1) }, color: col.c, opacity: col.a };
    if (st === 'double' && w >= 3) {
      const t = wpt / 3, dx = side === 'Top' || side === 'Bottom' ? 0 : t, dy = side === 'Top' || side === 'Bottom' ? t : 0;
      pg.drawLine({ ...o, thickness: t, start: { x: o.start.x - dx, y: o.start.y + dy }, end: { x: o.end.x - dx, y: o.end.y + dy } });
      pg.drawLine({ ...o, thickness: t, start: { x: o.start.x + dx, y: o.start.y - dy }, end: { x: o.end.x + dx, y: o.end.y - dy } });
    } else {
      pg.drawLine({ ...o, thickness: wpt, dashArray: st === 'dashed' ? [wpt * 3, wpt * 2] : st === 'dotted' ? [wpt, wpt] : undefined });
    }
  }
}

async function imageBytes(src) {
  const blob = await (await fetch(src)).blob();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
}
async function toPngViaCanvas(el, w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
  const b = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new Uint8Array(await b.arrayBuffer());
}
async function embedImg(wr, el) {
  const key = el.src;
  if (wr.imgs.has(key)) return wr.imgs.get(key);
  const p = (async () => {
    try {
      const { bytes, type } = await imageBytes(el.src);
      if (/jpe?g/.test(type) || (bytes[0] === 0xff && bytes[1] === 0xd8)) return await wr.out.embedJpg(bytes);
      if (/png/.test(type) || (bytes[0] === 0x89 && bytes[1] === 0x50)) { try { return await wr.out.embedPng(bytes); } catch { /* PNG incomum: refaz no canvas */ } }
      if (!el.complete) await el.decode().catch(() => {});
      if (!el.naturalWidth) { wr.stats.lostImages++; return null; } // EMF/WMF/TIFF que o navegador não abre
      return await wr.out.embedPng(await toPngViaCanvas(el, el.naturalWidth, el.naturalHeight));
    } catch (e) { console.warn(e); wr.stats.lostImages++; return null; }
  })();
  wr.imgs.set(key, p);
  return p;
}
async function drawImg(el, cs, pg, wr, X, Y) {
  const r = el.getBoundingClientRect(); if (r.width < 0.5 || r.height < 0.5) return;
  const img = await embedImg(wr, el); if (!img) return;
  const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  const ow = el.offsetWidth || r.width, oh = el.offsetHeight || r.height;
  let ang = 0, sx = 1, sy = 1;
  const m = /matrix\(([^)]+)\)/.exec(cs.transform || '');
  if (m) { const [a, b, c, d] = m[1].split(',').map(parseFloat); ang = Math.atan2(b, a); sx = Math.hypot(a, b); sy = Math.hypot(c, d); }
  const w = ow * sx * PT, h = oh * sy * PT;
  const clipped = cs.clipPath && cs.clipPath !== 'none';
  const ops = [];
  if (clipped) { // recorte (srcRect do Word): fica só a caixa original da imagem
    pg.pushOperators(pushGraphicsState(), rectangle(X(cx - ow / 2), Y(cy + oh / 2), ow * PT, oh * PT), clip(), endPath());
  }
  const phi = -ang; // CSS gira no sentido horário com y para baixo
  const bx = -w / 2, by = -h / 2, c = Math.cos(phi), s = Math.sin(phi);
  pg.drawImage(img, { x: X(cx) + bx * c - by * s, y: Y(cy) + bx * s + by * c, width: w, height: h, rotate: degrees((phi * 180) / Math.PI) });
  if (clipped) pg.pushOperators(popGraphicsState());
  return ops;
}
async function drawSvg(el, pg, wr, X, Y) {
  const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
  try {
    const clone = el.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', r.width); clone.setAttribute('height', r.height);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const im = new Image(); im.src = url; await im.decode(); URL.revokeObjectURL(url);
    const png = await toPngViaCanvas(im, r.width * 3, r.height * 3);
    const e = await wr.out.embedPng(png);
    pg.drawImage(e, { x: X(r.left), y: Y(r.bottom), width: r.width * PT, height: r.height * PT });
  } catch (e) { console.warn('svg', e); }
}

const decoLines = (el) => {
  const out = new Set();
  for (let e = el; e && e.tagName !== 'P' && e.tagName !== 'SECTION'; e = e.parentElement) {
    const t = getComputedStyle(e).textDecorationLine || '';
    t.split(' ').forEach((x) => { if (x && x !== 'none') out.add(x); });
  }
  return out;
};

async function drawText(node, el, cs, pg, wr, X, Y, inPage) {
  const col = parseColor(cs.color); if (!col) return;
  const fam = firstFamily(cs.fontFamily);
  const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600, italic = /italic|oblique/.test(cs.fontStyle);
  const face = wr.book.face(fam, bold, italic) || wr.book.face('HFA Sans', bold, italic);
  if (!face) return;
  const font = await wr.font(face);
  const sizePx = parseFloat(cs.fontSize); const size = sizePx * PT;
  const css = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${sizePx}px "${fam}"`;
  const [asc, desc] = wr.ascent(css);
  const deco = decoLines(el);
  const text = node.nodeValue;
  // espaçamento entre letras (w:spacing) vira Tc no PDF; escala (w:w) vira Tz
  const lsPx = parseFloat(cs.letterSpacing) || 0;
  const tcPt = lsPx && !el.closest('[data-hfa-scale]') ? lsPx * PT : 0;
  const re = /\S+/g; let m;
  while ((m = re.exec(text))) {
    const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
    const rs = Array.from(range.getClientRects()).filter((r) => r.width > 0);
    if (!rs.length) continue;
    const pieces = rs.length === 1 ? [{ t: m[0], r: rs[0] }] : charsOf(node, m.index, m[0]);
    for (const pc of pieces) {
      if (!inPage(pc.r)) continue;
      const base = pc.r.top + asc * (pc.r.height / (asc + desc || pc.r.height));
      await drawPiece(pg, wr, font, pc.t, X(pc.r.left), Y(base), size, col, pc.r.width * PT, face.synthetic && bold, tcPt);
      if (deco.has('underline')) pg.drawRectangle({ x: X(pc.r.left), y: Y(base) - size * 0.12, width: pc.r.width * PT, height: Math.max(0.4, size * 0.06), color: col.c, opacity: col.a });
      if (deco.has('line-through')) pg.drawRectangle({ x: X(pc.r.left), y: Y(base) + size * 0.28, width: pc.r.width * PT, height: Math.max(0.4, size * 0.06), color: col.c, opacity: col.a });
    }
  }
  // sublinhado contínuo também sob os espaços entre palavras
  if (deco.has('underline')) {
    const range = document.createRange(); range.selectNodeContents(node);
    for (const r of range.getClientRects()) { if (!inPage(r) || r.width <= 0) continue; const base = r.top + asc * (r.height / (asc + desc || r.height)); pg.drawRectangle({ x: X(r.left), y: Y(base) - size * 0.12, width: r.width * PT, height: Math.max(0.4, size * 0.06), color: col.c, opacity: col.a }); }
  }
}
function charsOf(node, start, word) {
  const out = []; let i = 0;
  for (const ch of word) {
    const r = document.createRange(); r.setStart(node, start + i); r.setEnd(node, start + i + ch.length);
    const rr = r.getClientRects()[0]; if (rr && rr.width > 0) out.push({ t: ch, r: rr });
    i += ch.length;
  }
  return out;
}
async function drawPiece(pg, wr, font, text, x, y, size, col, widthPt, synthBold, tc = 0) {
  // caracteres que a fonte não tem: DejaVu; se nem ela tiver, o caractere é contado como perdido
  if ([...text].every((ch) => has(font, ch))) {
    const n = [...text].length;
    const w = font.widthOfTextAtSize(text, size) + tc * Math.max(0, n - 1);
    const sq = w > 0 ? Math.max(50, Math.min(200, (widthPt / w) * 100)) : 100;
    drawWord(pg, font, text, x, y, size, col, Math.abs(sq - 100) > 1.5 ? sq : 100, synthBold, tc);
    return;
  }
  const fb = await wr.fallback();
  let cx = x;
  const total = [...text].reduce((a, ch) => a + (has(font, ch) ? font : fb).widthOfTextAtSize(ch, size), 0) || 1;
  const k = widthPt / total;
  for (const ch of text) {
    const f = has(font, ch) ? font : has(fb, ch) ? fb : null;
    if (!f) { wr.stats.lostChars++; cx += size * 0.5 * k; continue; }
    drawWord(pg, f, ch, cx, y, size, col, 100, synthBold);
    cx += f.widthOfTextAtSize(ch, size) * k;
  }
}

/**
 * Converte um .docx (bytes) em PDF. o: { localFonts: bool, onProgress(fase, i, n) }
 * Devolve { bytes, stats: { pages, lostImages, lostChars, localFonts } }
 */
export async function docxToPdf(bytes, o = {}) {
  const stats = { pages: 0, lostImages: 0, lostChars: 0, localFonts: false };
  const book = new FontBook();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-30000px;top:0;width:2000px;pointer-events:none;contain:layout style';
  host.setAttribute('aria-hidden', 'true');
  host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);
  try {
    const step = (s, i, n) => o.onProgress && o.onProgress(s, i, n);
    step('Lendo o documento…');
    if (o.localFonts) stats.localFonts = await book.useLocal();
    const { blob, zip, state, tabDef } = await prepareDocx(bytes);
    // 1ª passagem: descobre as fontes usadas
    let body = await render(host, blob);
    const fams = collectFamilies(body);
    step('Carregando fontes…');
    await book.ensure('HFA Sans'); await book.ensure('HFA Serif'); await book.ensure('HFA Mono');
    for (const f of fams) await book.ensure(f);
    // símbolos
    const dj = await loadTTF('DejaVuSans');
    const sym = new FontFace('HFA Symbols', dj.slice(0)); await sym.load(); document.fonts.add(sym); book.added.push(sym);
    book.families.set('hfa symbols', { fam: 'HFA Symbols', faces: { r: { bytes: dj, subset: true }, b: { bytes: dj, synthetic: true, subset: true }, i: { bytes: dj, subset: true }, bi: { bytes: dj, synthetic: true, subset: true } } });
    // 2ª passagem: já com as fontes certas (as tabulações são calculadas com elas)
    body = await render(host, blob);
    collectFamilies(body);
    fixSymbols(body);
    for (const f of collectFamilies(body)) await book.ensure(f);
    rewriteLineHeights(host.shadowRoot);
    applyNat(body, book);
    applyRuns(body);
    await document.fonts.ready;
    step('Montando as páginas…');
    takeTextboxes(body, state);
    materializeNumbering(body);
    layoutTabs(body, tabDef);
    paginate(body);
    fillPageFields(body);
    await placeAnchors(body, state, zip);
    layoutTabs(body.querySelector('.docx-wrapper') ? body : body, tabDef); // tabulações dentro das caixas de texto
    await document.fonts.ready;
    // PDF
    const out = await PDFDocument.create();
    const wr = new PdfWriter(out, book, stats);
    const secs = sectionsOf(body);
    for (let i = 0; i < secs.length; i++) {
      step('Gerando o PDF…', i, secs.length);
      const sec = secs[i];
      const cs = getComputedStyle(sec);
      const Wpt = sec.getBoundingClientRect().width * PT, Hpt = (parseFloat(cs.minHeight) || sec.getBoundingClientRect().height) * PT;
      const pg = out.addPage([Wpt, Hpt]);
      const links = [];
      await drawSection(sec, pg, Wpt, Hpt, wr, links);
      for (const l of links) {
        const a = out.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: l.r, Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(l.url) } });
        pg.node.addAnnot(out.context.register(a));
      }
      stats.pages++;
      if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    }
    out.setProducer('HFA Editor PDF'); out.setCreator('HFA Editor PDF');
    if (o.title) out.setTitle(o.title);
    for (const f of wr.full) f.embedder.fontData = hollow(f.embedder.fontData, f.__used);
    const pdfBytes = await out.save();
    return { bytes: pdfBytes, stats };
  } finally {
    book.dispose();
    host.remove();
  }
}
