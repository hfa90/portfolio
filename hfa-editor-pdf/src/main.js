/* HFA Editor PDF — editor de PDF 100% no navegador (pdf.js + pdf-lib) */
import { $, $$, clamp, clone, uid, toast, busy, hydrateIcons, LS, icon } from './util.js';
import { S, pageById, dispDims, selection, selected } from './state.js';
import { loadDoc } from './pdf.js';
import { commit, commitSoon, resetHistory, setHistoryHooks, undo as hUndo, redo as hRedo, canUndo, canRedo } from './history.js';
import { viewer, rebuild, rebuildPages, renderThumbs, renderThumbEls, setCur, detectCur, setZoom, fitWidth, fitZoom, clearCaches, cacheStats } from './render.js';
import { renderEls, translateEl, updateNode } from './elements.js';
import { setTool, select, selectAll, deleteSel, duplicateSel, reorderSel, alignSel, copySel, pasteClip, clipToken, renderSel, onDown, onMove, onUp, pagePoint, bindPinch, addEl, visibleCenter } from './select.js';
import { EDIT, startEdit, finishEdit, editExisting, textItems, renderPageHints, clearTextCache } from './textedit.js';
import { bindProps, syncProps, renderLayers, bindLayers, closePanels, togglePanel } from './panel.js';
import { insertImageFile, openSig, bindSig } from './media.js';
import { exportPdf, buildPdf, exportMode } from './export.js';
import { scheduleSave, flushSave, peekSession, loadSession, clearSession } from './autosave.js';
import { bindConverter, openConverter, isDocx, wordToPdfBytes } from './convert/ui.js';

// ---------- tema ----------
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $$('[data-act="theme"]').forEach((b) => { b.innerHTML = icon(dark ? 'sun' : 'moon'); });
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const curDark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = curDark ? 'light' : 'dark'; LS.set('hfa-theme', t); applyTheme(t);
}

// ---------- histórico: o que redesenhar depois de cada alteração ----------
function updateUndo() { $('#undoBtn').disabled = !canUndo(); $('#redoBtn').disabled = !canRedo(); }
setHistoryHooks({
  commit({ changed, structural }) {
    updateUndo(); renderLayers();
    if (structural) renderThumbs(); else changed.forEach((id) => { const p = pageById(id); if (p) renderThumbEls(p); });
    if (S.tool === 'edittext') changed.forEach((id) => renderPageHints(id));
    scheduleSave();
  },
  restore({ changed, structural }) {
    if (S.sel && !selection()) S.sel = null;
    if (!pageById(S.cur)) S.cur = S.pages[0] && S.pages[0].id;
    if (structural) rebuild();
    else {
      changed.forEach((id) => { const p = pageById(id); if (p) { renderEls(p); renderThumbEls(p); if (S.tool === 'edittext') renderPageHints(id); } });
      renderSel(); renderLayers();
    }
    updateUndo(); syncProps(); scheduleSave();
  },
});
const undo = () => { finishEdit(); hUndo(); };
const redo = () => { finishEdit(); hRedo(); };

// ---------- abrir arquivos ----------
const isPdf = (f) => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
async function pagesOf(doc) {
  const out = [];
  for (let i = 0; i < doc.pdf.numPages; i++) {
    const p = await doc.pdf.getPage(i + 1); const v = p.view;
    out.push({ id: uid('p'), docId: doc.id, index: i, x0: v[0], y0: v[1], w: v[2] - v[0], h: v[3] - v[1], baseRot: p.rotate || 0, rot: 0, els: [] });
  }
  return out;
}
const blankPage = (w = 595.28, h = 841.89) => ({ id: uid('p'), docId: null, index: 0, x0: 0, y0: 0, w, h, baseRot: 0, rot: 0, els: [] });

async function openFiles(files, append = false) {
  const pdfs = Array.from(files).filter((f) => isPdf(f) || isDocx(f));
  if (!pdfs.length) return toast('Selecione um arquivo PDF (ou um .docx do Word).', 'error');
  busy(pdfs.length > 1 ? `Abrindo ${pdfs.length} arquivos…` : 'Abrindo…');
  const added = [];
  try {
    for (const f of pdfs) {
      let doc;
      try {
        if (isDocx(f)) {
          // documento do Word: convertido para PDF no próprio navegador e aberto no editor
          busy(`Convertendo “${f.name}” para PDF…`);
          const { bytes } = await wordToPdfBytes(f, { onProgress: (s, i, n) => busy(n ? `${s} ${i + 1}/${n}` : s) });
          doc = await loadDoc(bytes, f.name.replace(/\.docx$/i, '.pdf'));
        } else doc = await loadDoc(new Uint8Array(await f.arrayBuffer()), f.name);
      } catch (e) {
        console.error(e);
        toast(e.message === 'ENCRYPTED' ? `“${f.name}” é protegido por senha ou criptografado. Desbloqueie-o antes de editar.` : e.message === 'NOT_DOCX' ? `“${f.name}” não é um .docx válido.` : `Não foi possível abrir “${f.name}”. O arquivo pode estar corrompido.`, 'error');
        continue;
      }
      added.push({ doc, pages: await pagesOf(doc) });
    }
    if (!added.length) return;
    const newPages = added.flatMap((a) => a.pages);
    if (!append) {
      await resetState();
      S.fileName = added[0].doc.name;
      added.forEach((a) => { S.docs[a.doc.id] = a.doc; });
      S.pages = newPages;
      enterEditor();
      if (added.length > 1) toast(`${added.length} PDFs combinados em um só documento.`);
    } else {
      added.forEach((a) => { S.docs[a.doc.id] = a.doc; });
      const idx = Math.max(0, S.pages.findIndex((p) => p.id === S.cur));
      S.pages.splice(idx + 1, 0, ...newPages);
      commit(); rebuild(); setCur(newPages[0].id, true);
      toast(`${newPages.length} página(s) inserida(s).`, 'ok');
    }
  } finally { busy(false); }
}
async function newBlank() { await resetState(); S.fileName = 'documento.pdf'; S.pages = [blankPage()]; enterEditor(); }

async function resetState() {
  if (EDIT) finishEdit();
  Object.values(S.docs).forEach((d) => { try { d.pdf.destroy(); } catch { /* */ } });
  S.docs = {}; S.pages = []; S.assets = {}; S.sel = null; S.cur = null; S.dirty = false;
  clearCaches(); clearTextCache(); resetHistory();
  await clearSession();
}

function enterEditor({ restored = null } = {}) {
  $('#landing').hidden = true; $('#editor').hidden = false; document.body.classList.add('is-editing');
  $('#fname').textContent = S.fileName; $('#fname').title = S.fileName;
  document.title = S.fileName + ' — HFA Editor PDF';
  S.cur = restored && pageById(restored.cur) ? restored.cur : S.pages[0].id;
  commit({ silent: true }); updateUndo(); S.dirty = !!restored;
  setTool('select');
  S.zoom = restored && restored.zoom ? restored.zoom : fitZoom();
  $('#zoomLbl').textContent = Math.round(S.zoom * 100) + '%';
  rebuild(); viewer.scrollTop = 0;
  if (restored) setCur(S.cur, true);
  scheduleSave();
}
async function leaveEditor() {
  if (S.dirty && !confirm('Existem alterações que ainda não foram baixadas. Deseja sair mesmo assim? O rascunho salvo neste navegador também será descartado.')) return;
  await resetState(); viewer.replaceChildren(); $('#thumbs').replaceChildren();
  $('#editor').hidden = true; $('#landing').hidden = false; document.body.classList.remove('is-editing');
  document.title = 'HFA Editor PDF — Edite PDF grátis no navegador';
  $('#restore').hidden = true;
}

// ---------- rascunho salvo ----------
async function offerRestore() {
  const s = await peekSession(); if (!s || !s.pages || !s.pages.length) return;
  const n = s.pages.reduce((a, p) => a + p.els.length, 0);
  const when = new Date(s.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  $('#restoreTxt').textContent = `“${s.fileName}” · ${s.pages.length} página(s), ${n} elemento(s) · salvo em ${when}`;
  $('#restore').hidden = false;
}
async function restoreSession() {
  busy('Recuperando rascunho…');
  try {
    const data = await loadSession(); if (!data) { $('#restore').hidden = true; return; }
    const { session, docs, assets } = data;
    Object.values(S.docs).forEach((d) => { try { d.pdf.destroy(); } catch { /* */ } });
    S.docs = {}; clearCaches(); clearTextCache(); resetHistory();
    for (const d of docs) S.docs[d.id] = await loadDoc(d.bytes, d.name, d.id);
    S.assets = assets; S.fileName = session.fileName;
    S.pages = session.pages.filter((p) => !p.docId || S.docs[p.docId]);
    if (!S.pages.length) throw new Error('rascunho vazio');
    S.sel = null;
    enterEditor({ restored: session });
    toast('Rascunho recuperado.', 'ok');
  } catch (e) {
    console.error(e); toast('Não foi possível recuperar o rascunho.', 'error');
  } finally { busy(false); }
}

// ---------- páginas ----------
function pageAction(id, act) {
  const i = S.pages.findIndex((p) => p.id === id); if (i < 0) return;
  const p = S.pages[i];
  if (act === 'rotl' || act === 'rotr') p.rot = (p.rot + (act === 'rotl' ? 270 : 90)) % 360;
  else if (act === 'dup') {
    const c = clone(p); c.id = uid('p'); c.els.forEach((e) => { e.id = uid('e'); });
    S.pages.splice(i + 1, 0, c); S.cur = c.id;
  } else if (act === 'del') {
    if (S.pages.length === 1) return toast('O documento precisa ter pelo menos uma página.', 'error');
    if (p.els.length && !confirm(`Excluir a página ${i + 1} e os ${p.els.length} elemento(s) adicionados nela?`)) return;
    S.pages.splice(i, 1); if (S.sel && S.sel.pageId === id) S.sel = null;
    S.cur = S.pages[Math.min(i, S.pages.length - 1)].id;
  }
  commit(); rebuild(); syncProps();
  if (act === 'dup') setCur(S.cur, true);
}
function movePage(id, toIndex) {
  const i = S.pages.findIndex((p) => p.id === id); if (i < 0) return;
  const [p] = S.pages.splice(i, 1); const j = clamp(toIndex > i ? toIndex - 1 : toIndex, 0, S.pages.length);
  if (j === i) { S.pages.splice(i, 0, p); return; }
  S.pages.splice(j, 0, p); commit(); rebuild();
  const t = $(`#thumbs .thumb[data-page="${id}"]`); if (t) t.focus();
}
function addBlankAfter() {
  const cur = pageById(S.cur) || S.pages[S.pages.length - 1];
  const [w, h] = cur ? dispDims(cur) : [595.28, 841.89];
  const np = blankPage(w, h); const i = S.pages.indexOf(cur);
  S.pages.splice(i + 1, 0, np); commit(); rebuild(); setCur(np.id, true);
}
function pasteText(text) {
  const page = pageById(S.cur); if (!page) return;
  if (S.tool !== 'select') setTool('select');
  const c = visibleCenter(page), d = S.defs.text;
  const el = addEl(page, { type: 'text', x: c.x - 40, y: c.y - d.size * 0.6, text, font: d.font, size: d.size, bold: d.bold, italic: d.italic, color: d.color, opacity: d.opacity, rot: 0, align: d.align });
  renderEls(page); select(page.id, el.id); commit();
}

// ---------- eventos ----------
const typingIn = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
function bind() {
  hydrateIcons();
  applyTheme(LS.get('hfa-theme', null));
  $$('[data-act="theme"]').forEach((b) => b.addEventListener('click', toggleTheme));
  $$('.dlg [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  // início
  const fileIn = $('#fileIn'), drop = $('#drop');
  $('#pickBtn').addEventListener('click', () => fileIn.click());
  drop.addEventListener('click', (e) => { if (e.target === drop || e.target.closest('.drop-ic,.drop-hint')) fileIn.click(); });
  fileIn.addEventListener('change', () => { if (fileIn.files.length) openFiles(fileIn.files); fileIn.value = ''; });
  $('#blankBtn').addEventListener('click', newBlank);
  $('#restoreBtn').addEventListener('click', restoreSession);
  $('#discardBtn').addEventListener('click', async () => { await clearSession(); $('#restore').hidden = true; toast('Rascunho descartado.'); });

  // arrastar e soltar
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; document.body.classList.add('drag'); drop.classList.add('over'); });
  document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { document.body.classList.remove('drag'); drop.classList.remove('over'); } });
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; document.body.classList.remove('drag'); drop.classList.remove('over');
    const files = Array.from(e.dataTransfer.files);
    if ($('#editor').hidden) return openFiles(files);
    const img = files.find((f) => f.type.startsWith('image/'));
    if (img) {
      const el = document.elementFromPoint(e.clientX, e.clientY); const slot = el && el.closest('.slot');
      const page = slot && pageById(slot.dataset.page);
      return insertImageFile(img, page ? { page, at: pagePoint(e, page) } : {});
    }
    if (files.some((f) => isPdf(f) || isDocx(f))) openFiles(files, true);
  });

  // barra superior
  $('#backBtn').addEventListener('click', leaveEditor);
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#zoomIn').addEventListener('click', () => setZoom(S.zoom * 1.2));
  $('#zoomOut').addEventListener('click', () => setZoom(S.zoom / 1.2));
  $('#zoomLbl').addEventListener('click', fitWidth);
  $('#dlBtn').addEventListener('click', () => { finishEdit(); exportPdf(); });
  // exporta o documento como está no editor (com as edições) para .docx
  $('#wordBtn').addEventListener('click', () => {
    finishEdit();
    openConverter({ dir: 'p2w', source: { name: S.fileName, getBytes: async () => (await buildPdf()).bytes } });
  });
  bindConverter({ onOpenPdf: (file) => openFiles([file]) });
  $('#keysBtn').addEventListener('click', () => $('#keysDlg').showModal());

  // ferramentas
  $('#tools').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) setTool(b.dataset.tool);
    else if (b.dataset.action === 'image') $('#imgIn').click();
    else if (b.dataset.action === 'sign') openSig();
    else if (b.id === 'togglePages') togglePanel('show-pages');
    else if (b.id === 'toggleSide') togglePanel('show-side');
  });
  $('#scrim').addEventListener('click', closePanels);
  $('#imgIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) insertImageFile(f); });
  $('#pdfIn').addEventListener('change', (e) => { const fs = Array.from(e.target.files); e.target.value = ''; if (fs.length) openFiles(fs, true); });
  $('#addBlank').addEventListener('click', addBlankAfter);
  $('#addPdf').addEventListener('click', () => $('#pdfIn').click());

  // documento
  viewer.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  bindPinch();
  viewer.addEventListener('mousedown', (e) => { if (!e.target.closest('.editing')) e.preventDefault(); });
  viewer.addEventListener('dblclick', (e) => {
    const n = e.target.closest('[data-el]'); const slot = e.target.closest('.slot'); if (!n || !slot) return;
    const page = pageById(slot.dataset.page); const el = page && page.els.find((x) => x.id === n.dataset.el);
    if (el && el.type === 'text') startEdit(page, el);
  });
  viewer.addEventListener('click', async (e) => {
    const sa = e.target.closest('[data-sa]');
    if (sa) {
      const a = sa.dataset.sa, s = selected();
      if (a === 'del') deleteSel(); else if (a === 'dup') duplicateSel();
      else if (a === 'front') reorderSel(1); else if (a === 'back') reorderSel(-1);
      else if (a === 'edit' && s) startEdit(s.page, s.el);
      else if (a.startsWith('al-')) alignSel(a.slice(3));
      return;
    }
    const hint = e.target.closest('.hint');
    if (hint && S.tool === 'edittext') {
      const slot = hint.closest('.slot'); const page = pageById(slot.dataset.page);
      const items = await textItems(page); const it = items[+hint.dataset.hint];
      if (it) editExisting(page, it, hint);
    }
  });
  viewer.addEventListener('scroll', () => { if (scrollRaf) return; scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; detectCur(); }); }, { passive: true });
  viewer.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault();
    setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX, y: e.clientY });
  }, { passive: false });

  // miniaturas
  const thumbs = $('#thumbs'); let dragId = null;
  thumbs.addEventListener('click', (e) => {
    const t = e.target.closest('.thumb'); if (!t) return;
    const a = e.target.closest('[data-ta]');
    if (a) { pageAction(t.dataset.page, a.dataset.ta); return; }
    setCur(t.dataset.page, true); closePanels();
  });
  thumbs.addEventListener('keydown', (e) => {
    const t = e.target.closest('.thumb'); if (!t || e.target !== t) return;
    const i = S.pages.findIndex((p) => p.id === t.dataset.page);
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); movePage(t.dataset.page, e.key === 'ArrowUp' ? i - 1 : i + 2); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCur(t.dataset.page, true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = t[e.key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling']; if (n) n.focus(); }
  });
  const clearDrop = () => $$('.thumb.drop-before,.thumb.drop-after', thumbs).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  thumbs.addEventListener('dragstart', (e) => {
    const t = e.target.closest('.thumb'); if (!t) return; dragId = t.dataset.page;
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-hfa-page', dragId); t.classList.add('dragging');
  });
  thumbs.addEventListener('dragover', (e) => {
    if (!dragId) return; e.preventDefault(); const t = e.target.closest('.thumb'); clearDrop(); if (!t) return;
    const r = t.getBoundingClientRect(); t.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  thumbs.addEventListener('drop', (e) => {
    if (!dragId) return; e.preventDefault(); e.stopPropagation();
    const t = $('.thumb.drop-before,.thumb.drop-after', thumbs); const id = dragId; dragId = null; clearDrop();
    if (!t || t.dataset.page === id) { renderThumbs(); return; }
    const j = S.pages.findIndex((p) => p.id === t.dataset.page) + (t.classList.contains('drop-after') ? 1 : 0);
    movePage(id, j);
  });
  thumbs.addEventListener('dragend', () => { dragId = null; clearDrop(); $$('.thumb.dragging', thumbs).forEach((x) => x.classList.remove('dragging')); });

  // painel lateral
  bindLayers();
  $('#clearPage').addEventListener('click', () => {
    const page = pageById(S.cur); if (!page || !page.els.length) return;
    if (!confirm(`Remover os ${page.els.length} elemento(s) desta página?`)) return;
    page.els = []; S.sel = null; renderEls(page); renderSel(); syncProps(); commit();
  });
  bindProps(); bindSig();

  // teclado
  const TOOLKEYS = { v: 'select', e: 'edittext', t: 'text', d: 'draw', h: 'highlight', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', w: 'whiteout', x: 'redact' };
  document.addEventListener('keydown', (e) => {
    if ($('#editor').hidden || document.querySelector('dialog[open]')) return;
    const typing = typingIn(e.target);
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); finishEdit(); exportPdf(); return; }
    if (typing) return;
    if (mod) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (k === 'd') { e.preventDefault(); duplicateSel(); }
      else if (k === 'a') { e.preventDefault(); selectAll(); }
      else if (k === '=' || k === '+') { e.preventDefault(); setZoom(S.zoom * 1.2); }
      else if (k === '-') { e.preventDefault(); setZoom(S.zoom / 1.2); }
      else if (k === '0') { e.preventDefault(); fitWidth(); }
      return; // Ctrl+C / X / V seguem para os eventos copy/cut/paste
    }
    if (e.altKey) return;
    const s = selection();
    if ((e.key === 'Delete' || e.key === 'Backspace') && s) { e.preventDefault(); deleteSel(); }
    else if (e.key === 'Escape') { if (s) select(null); else setTool('select'); closePanels(); }
    else if (e.key === 'Enter' && s && s.els.length === 1 && s.els[0].type === 'text') { e.preventDefault(); startEdit(s.page, s.els[0]); }
    else if (s && e.key.startsWith('Arrow')) {
      e.preventDefault(); const st = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      s.els.forEach((el) => { translateEl(el, clone(el), dx, dy); updateNode(s.page, el); });
      renderSel(); commitSoon();
    } else if (TOOLKEYS[k]) setTool(TOOLKEYS[k]);
    else if (k === 'i') $('#imgIn').click();
    else if (k === 's') openSig();
    else if (k === '?') $('#keysDlg').showModal();
  });

  // área de transferência
  const MARK = 'hfa-editor-pdf:';
  const onCopy = (cut) => (e) => {
    if ($('#editor').hidden || typingIn(e.target) || document.querySelector('dialog[open]') || !selection()) return;
    const tok = copySel(cut); if (!tok) return;
    e.preventDefault(); e.clipboardData.setData('text/plain', MARK + tok);
  };
  document.addEventListener('copy', onCopy(false));
  document.addEventListener('cut', onCopy(true));
  document.addEventListener('paste', (e) => {
    if ($('#editor').hidden || typingIn(e.target) || document.querySelector('dialog[open]')) return;
    const cd = e.clipboardData; if (!cd) return;
    const text = cd.getData('text/plain');
    if (text && text.startsWith(MARK) && text.slice(MARK.length) === clipToken()) { e.preventDefault(); pasteClip(); return; }
    const item = Array.from(cd.items || []).find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); insertImageFile(item.getAsFile()); return; }
    if (text && text.trim() && !text.startsWith(MARK)) { e.preventDefault(); pasteText(text.replace(/\r/g, '')); return; }
    if (clipToken()) { e.preventDefault(); pasteClip(); }
  });

  window.addEventListener('beforeunload', (e) => {
    if (!$('#editor').hidden) flushSave();
    if (S.dirty && !$('#editor').hidden) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !$('#editor').hidden) flushSave(); });
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (innerWidth > 860) closePanels(); }, 150); });

  // PWA: abrir PDFs pelo sistema ("Abrir com…") quando instalado
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files || !params.files.length) return;
      const files = await Promise.all(params.files.map((h) => h.getFile()));
      openFiles(files);
    });
  }
  // no localhost o service worker fica desligado (evita cache velho durante o
  // desenvolvimento); use ?sw=1 para testá-lo localmente
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && (!local || /[?&]sw=1/.test(location.search))) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker:', e));
  }
  offerRestore();
}
let scrollRaf = 0;

bind();
// exposto para depuração e testes automatizados
window.HFA = { S, exportPdf, buildPdf, exportMode, cacheStats, rebuildPages, flushSave, select, selection };
