// Edição de textos: textos adicionados e texto já existente no PDF
import { toast } from './util.js';
import { S, FONTS, pageById, srcKey } from './state.js';
import { pdfjsLib } from './pdf.js';
import { SLOTS, visibleRecs } from './render.js';
import { measure, renderEls } from './elements.js';
import { addEl, renderSel, setTool } from './select.js';
import { syncProps, renderLayers } from './panel.js';
import { commit } from './history.js';

export let EDIT = null; // { pageId, elId, node }

function readText(n) { return n.innerText.replace(/ /g, ' ').replace(/\r/g, '').replace(/\n$/, ''); }

export function startEdit(page, el) {
  if (EDIT) finishEdit();
  if (S.tool !== 'select' && S.tool !== 'edittext' && S.tool !== 'text') setTool('select');
  S.sel = { pageId: page.id, ids: [el.id] };
  const rec = SLOTS.get(page.id); const n = rec && rec.els.querySelector(`[data-node="${el.id}"]`); if (!n) return;
  EDIT = { pageId: page.id, elId: el.id, node: n };
  n.contentEditable = 'true'; n.spellcheck = true; n.classList.add('editing');
  n.addEventListener('input', onEditInput); n.addEventListener('blur', onEditBlur);
  n.addEventListener('keydown', onEditKey); n.addEventListener('paste', onEditPaste);
  n.focus({ preventScroll: true });
  const r = document.createRange(); r.selectNodeContents(n); r.collapse(false);
  const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
  renderSel(); syncProps(); renderLayers();
}
function onEditInput() {
  if (!EDIT) return; const page = pageById(EDIT.pageId); const el = page && page.els.find((x) => x.id === EDIT.elId); if (!el) return;
  el.text = readText(EDIT.node); measure(el, EDIT.node); renderSel();
}
function onEditBlur() { if (EDIT) finishEdit(); }
function onEditKey(e) { if (e.key === 'Escape') { e.preventDefault(); finishEdit(); } e.stopPropagation(); }
function onEditPaste(e) { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); }
export function finishEdit() {
  const e = EDIT; if (!e) return; EDIT = null;
  const n = e.node;
  n.removeEventListener('input', onEditInput); n.removeEventListener('blur', onEditBlur);
  n.removeEventListener('keydown', onEditKey); n.removeEventListener('paste', onEditPaste);
  n.contentEditable = 'false'; n.classList.remove('editing');
  const page = pageById(e.pageId); const el = page && page.els.find((x) => x.id === e.elId);
  if (el) {
    el.text = readText(n);
    if (!el.text.trim()) { page.els = page.els.filter((x) => x !== el); if (S.sel) S.sel.ids = S.sel.ids.filter((id) => id !== el.id); if (S.sel && !S.sel.ids.length) S.sel = null; }
  }
  if (page) renderEls(page);
  renderSel(); syncProps(); commit();
}

// ---------- texto existente ----------
const TXT = new Map(); // srcKey -> Promise<linhas>
export const clearTextCache = () => TXT.clear();

/**
 * Extrai o texto da página e junta os pedaços que o pdf.js separa
 * (palavras, kerning) em linhas contínuas com a mesma fonte e tamanho.
 */
export function textItems(page) {
  if (!page.docId || !S.docs[page.docId]) return Promise.resolve([]);
  const key = srcKey(page);
  if (!TXT.has(key)) TXT.set(key, extract(page).catch((e) => { TXT.delete(key); throw e; }));
  return TXT.get(key);
}
async function extract(page) {
  const pp = await S.docs[page.docId].pdf.getPage(page.index + 1);
  const tc = await pp.getTextContent();
  const vp = pp.getViewport({ scale: 1, rotation: 0 });
  const lines = []; let cur = null;
  for (const it of tc.items) {
    if (typeof it.str !== 'string') continue;
    const t = pdfjsLib.Util.transform(vp.transform, it.transform);
    if (Math.abs(t[1]) > 1e-3 || Math.abs(t[2]) > 1e-3) { cur = null; continue; } // texto girado/inclinado
    const size = Math.abs(t[3]); if (size < 2) continue;
    const r = { str: it.str, x: t[4], base: t[5], w: it.width, size, fontName: it.fontName };
    const blank = !r.str.trim();
    if (cur && Math.abs(r.base - cur.base) < cur.size * 0.25 && Math.abs(r.size - cur.size) < Math.max(0.6, cur.size * 0.08) && r.fontName === cur.fontName) {
      const gap = r.x - (cur.x + cur.w);
      if (gap > -cur.size * 0.3 && gap < cur.size * 1.2) {
        if (blank) { cur.space = true; cur.w = Math.max(cur.w, r.x + r.w - cur.x); }
        else {
          const sp = cur.space || (gap > cur.size * 0.15 && !/\s$/.test(cur.str) && !/^\s/.test(r.str));
          cur.str += (sp ? ' ' : '') + r.str; cur.w = r.x + r.w - cur.x; cur.space = false;
        }
        if (it.hasEOL) cur = null;
        continue;
      }
    }
    if (blank) { if (it.hasEOL) cur = null; continue; }
    cur = { ...r, space: false }; lines.push(cur);
    if (it.hasEOL) cur = null;
  }
  const st = tc.styles || {};
  return lines.map((l) => {
    const str = l.str.trimEnd();
    return { str, x: l.x, base: l.base, w: l.w, size: l.size, top: l.base - l.size * 0.92, h: l.size * 1.18, fontName: l.fontName, family: (st[l.fontName] || {}).fontFamily || '', pp, key: `${Math.round(l.x * 10)}:${Math.round(l.base * 10)}` };
  }).filter((l) => l.str);
}

export function clearHints(rec) { rec.hints.replaceChildren(); rec.hintsOn = false; rec.hintTok = (rec.hintTok || 0) + 1; }

/** Desenha os realces clicáveis de uma página visível. Retorna o nº de linhas. */
export async function renderPageHints(pageId) {
  const rec = SLOTS.get(pageId), page = pageById(pageId); if (!rec || !page) return 0;
  if (S.tool !== 'edittext') { clearHints(rec); return 0; }
  const tok = rec.hintTok = (rec.hintTok || 0) + 1;
  let items = [];
  try { items = await textItems(page); } catch (e) { console.error(e); }
  if (rec.hintTok !== tok || S.tool !== 'edittext' || !rec.slot.isConnected || !rec.visible) return items.length;
  const used = new Set(page.els.map((e) => e.src).filter(Boolean)), z = S.zoom;
  rec.hints.replaceChildren(...items.flatMap((it, i) => {
    if (used.has(it.key)) return [];
    const d = document.createElement('div'); d.className = 'hint'; d.dataset.hint = i; d.title = 'Clique para editar';
    Object.assign(d.style, { left: it.x * z + 'px', top: it.top * z + 'px', width: Math.max(it.w, 2) * z + 'px', height: it.h * z + 'px' });
    return [d];
  }));
  rec.hintsOn = true;
  return items.length;
}
export async function refreshHints({ warn = false } = {}) {
  const recs = visibleRecs();
  if (S.tool !== 'edittext') { for (const [, r] of SLOTS) if (r.hintsOn) clearHints(r); return; }
  const counts = await Promise.all(recs.map(([id]) => renderPageHints(id)));
  if (warn && S.tool === 'edittext' && recs.length && !counts.some(Boolean)) {
    toast('Nenhum texto editável nesta parte do documento. Se o PDF for digitalizado (imagem), use Corretivo + Texto.');
  }
}

export function editExisting(page, it, hintNode) {
  let name = '';
  try { const fo = it.pp.commonObjs.get(it.fontName); name = (fo && (fo.name || fo.loadedName)) || ''; } catch { /* fonte ainda não carregada */ }
  const all = name + ' ' + it.family;
  const fam = /courier|mono/i.test(all) ? 'Courier' : (/times|georgia|garamond|roman|minion|cambria|book|serif/i.test(all) && !/sans/i.test(all)) ? 'Times' : 'Helvetica';
  const bold = /bold|black|heavy|semibold|demi/i.test(name), italic = /italic|oblique/i.test(name);
  const size = Math.round(it.size * 10) / 10;
  const pad = Math.max(0.6, size * 0.06);
  if (hintNode) hintNode.remove();
  addEl(page, { type: 'whiteout', x: it.x - pad, y: it.top - pad, w: it.w + pad * 2, h: it.h + pad * 2, fill: '#ffffff', burn: false, src: it.key }, { sel: false });
  const t = addEl(page, { type: 'text', x: it.x, y: it.base - FONTS[fam].k * size, text: it.str, font: fam, size, bold, italic, color: S.defs.edittext.color, opacity: 1, rot: 0, align: 'left', src: it.key }, { sel: false });
  startEdit(page, t);
}
