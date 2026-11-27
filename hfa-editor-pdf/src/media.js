// Imagens (com correção de orientação EXIF) e assinaturas
import { $, $$, esc, icon, toast, LS, rotVec, readURL, loadImg, uid } from './util.js';
import { S, pageById, dispDims, totalRot } from './state.js';
import { renderEls } from './elements.js';
import { addEl, select, setTool, visibleCenter } from './select.js';
import { commit } from './history.js';

const MAX_SIDE = 2400; // fotos maiores são reduzidas (o PDF fica bem menor)

/** Lê a tag Orientation (0x0112) do EXIF de um JPEG. 1 = normal. */
export function jpegOrientation(buf) {
  try {
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return 1;
    let o = 2;
    while (o + 4 <= v.byteLength) {
      const m = v.getUint16(o); o += 2;
      if ((m & 0xff00) !== 0xff00) break;
      const len = v.getUint16(o);
      if (m === 0xffe1 && v.getUint32(o + 2) === 0x45786966) { // "Exif"
        const t = o + 8, le = v.getUint16(t) === 0x4949;
        const ifd = t + v.getUint32(t + 4, le), n = v.getUint16(ifd, le);
        for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le); }
        return 1;
      }
      if (m === 0xffda) break; // início dos dados da imagem
      o += len;
    }
  } catch { /* EXIF malformado */ }
  return 1;
}

/**
 * Converte o arquivo num recurso pronto para o PDF. O pdf-lib ignora a
 * orientação EXIF, então JPEGs girados (fotos de celular) e imagens grandes
 * passam por um canvas, que já desenha na orientação correta.
 */
export async function assetFromFile(file) {
  const buf = await file.arrayBuffer();
  const isJpg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name || '');
  const isPng = file.type === 'image/png';
  const orient = isJpg ? jpegOrientation(buf) : 1;
  const url0 = await readURL(file); const img = await loadImg(url0);
  const w0 = img.naturalWidth, h0 = img.naturalHeight; // já orientados pelo navegador
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  let url = url0, type = isJpg ? 'jpg' : 'png', w = w0, h = h0;
  if (!((isJpg && orient === 1) || isPng) || k < 1) {
    w = Math.max(1, Math.round(w0 * k)); h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
    if (isJpg) { url = c.toDataURL('image/jpeg', 0.9); type = 'jpg'; } else { url = c.toDataURL('image/png'); type = 'png'; }
  }
  const id = uid('a'); S.assets[id] = { data: url, type, w, h }; return id;
}
async function assetFromDataURL(url) { const img = await loadImg(url); const id = uid('a'); S.assets[id] = { data: url, type: 'png', w: img.naturalWidth, h: img.naturalHeight }; return id; }

export function placeImage(aid, { page, at, maxW, sig } = {}) {
  page = page || pageById(S.cur) || S.pages[0]; const a = S.assets[aid]; if (!page || !a) return;
  const [dw, dh] = dispDims(page);
  const k = Math.min(1, (maxW || dw * 0.5) / a.w, (dh * 0.5) / a.h);
  const w = a.w * k, h = a.h * k, rot = (360 - totalRot(page)) % 360;
  const c = at || visibleCenter(page); const [ox, oy] = rotVec(w / 2, h / 2, rot);
  if (S.tool !== 'select') setTool('select');
  const el = addEl(page, { type: 'image', asset: aid, x: c.x - ox, y: c.y - oy, w, h, rot, opacity: 1, sig: !!sig });
  renderEls(page); select(page.id, el.id); commit();
}
export async function insertImageFile(file, opts) {
  try { placeImage(await assetFromFile(file), opts); } catch (e) { console.error(e); toast('Não foi possível ler essa imagem.', 'error'); }
}

// ---------- assinatura ----------
const SIG_FONTS = ['Dancing Script', 'Great Vibes', 'Satisfy', 'Caveat'];
const SIG_COLORS = ['#111827', '#1d4ed8', '#b91c1c'];
const sig = { tab: 'draw', color: SIG_COLORS[0], font: SIG_FONTS[0], ink: false, saved: null, drawing: false, last: null, mid: null };
function trimToDataURL(c) {
  const ctx = c.getContext('2d'); const { width: w, height: h } = c; const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const p = 6; x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o.toDataURL('image/png');
}
function setupPad() {
  const c = $('#sigPad'); const r = c.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = 2.6;
  x.clearRect(0, 0, c.width, c.height); sig.ink = false;
}
function sigTab(t) {
  sig.tab = t;
  $$('#sigDlg [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $$('#sigDlg [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
  $('#sigKeep').closest('label').hidden = t === 'saved';
  if (t === 'draw') requestAnimationFrame(setupPad);
  if (t === 'type') { renderSigFonts(); setTimeout(() => $('#sigName').focus(), 30); }
  if (t === 'saved') renderSaved();
}
function renderSigFonts() {
  const name = $('#sigName').value.trim() || 'Sua assinatura';
  $('#sigFonts').innerHTML = SIG_FONTS.map((f) => `<button type="button" class="sigfont" data-f="${f}" aria-pressed="${f === sig.font}" style="font-family:'${f}',cursive;color:${sig.color}">${esc(name)}</button>`).join('');
}
function renderSaved() {
  const list = LS.get('hfa-sigs', []);
  $('#sigSaved').innerHTML = list.length
    ? list.map((u, i) => `<div class="sigitem" role="button" tabindex="0" data-i="${i}" aria-pressed="${sig.saved === i}"><img src="${u}" alt="Assinatura salva ${i + 1}"><button type="button" class="rm" data-rm="${i}" aria-label="Remover assinatura salva">${icon('x')}</button></div>`).join('')
    : '<p class="empty">Nenhuma assinatura salva neste navegador ainda.</p>';
}
export function openSig() {
  if (!S.pages.length) return;
  sig.saved = null;
  $('#sigColors').innerHTML = SIG_COLORS.map((c) => `<button type="button" class="sigcolor" data-sc="${c}" style="background:${c}" aria-pressed="${c === sig.color}" aria-label="Cor ${c}"></button>`).join('');
  $('#sigDlg').showModal();
  sigTab(LS.get('hfa-sigs', []).length ? 'saved' : 'draw');
}
async function confirmSig() {
  let url = null;
  if (sig.tab === 'draw') { if (!sig.ink) return toast('Desenhe sua assinatura primeiro.', 'error'); url = trimToDataURL($('#sigPad')); }
  else if (sig.tab === 'type') {
    const name = $('#sigName').value.trim(); if (!name) return toast('Digite seu nome.', 'error');
    try { await document.fonts.load(`96px "${sig.font}"`); } catch { /* usa fonte de reserva */ }
    const c = document.createElement('canvas'); const x = c.getContext('2d'); const font = `96px "${sig.font}", cursive`;
    x.font = font; const w = Math.ceil(x.measureText(name).width) + 60; c.width = Math.min(w, 4000); c.height = 200;
    x.font = font; x.fillStyle = sig.color; x.textBaseline = 'middle'; x.fillText(name, 30, 105);
    url = trimToDataURL(c);
  } else {
    const list = LS.get('hfa-sigs', []); if (sig.saved == null || !list[sig.saved]) return toast('Escolha uma assinatura salva.', 'error');
    url = list[sig.saved];
  }
  if (!url) return toast('Assinatura vazia.', 'error');
  if (sig.tab !== 'saved' && $('#sigKeep').checked) {
    const list = LS.get('hfa-sigs', []); list.unshift(url);
    if (!LS.set('hfa-sigs', list.slice(0, 6))) toast('Não foi possível salvar a assinatura neste navegador.');
  }
  $('#sigDlg').close();
  placeImage(await assetFromDataURL(url), { maxW: 170, sig: true });
}
export function bindSig() {
  const pad = $('#sigPad'); const ctx = () => pad.getContext('2d');
  const pos = (e) => { const r = pad.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  pad.addEventListener('pointerdown', (e) => {
    try { pad.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético */ }
    sig.drawing = true; sig.last = pos(e); sig.mid = sig.last;
    const x = ctx(); x.strokeStyle = sig.color; x.fillStyle = sig.color; x.beginPath(); x.arc(sig.last[0], sig.last[1], 1.3, 0, Math.PI * 2); x.fill(); sig.ink = true;
  });
  pad.addEventListener('pointermove', (e) => {
    if (!sig.drawing) return; const p = pos(e), l = sig.last; const m = [(l[0] + p[0]) / 2, (l[1] + p[1]) / 2];
    const x = ctx(); x.strokeStyle = sig.color; x.beginPath(); x.moveTo(sig.mid[0], sig.mid[1]); x.quadraticCurveTo(l[0], l[1], m[0], m[1]); x.stroke();
    sig.last = p; sig.mid = m;
  });
  const end = () => { sig.drawing = false; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  $('#sigClear').addEventListener('click', setupPad);
  $('#sigColors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sc]'); if (!b) return; sig.color = b.dataset.sc;
    $$('#sigColors [data-sc]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (sig.tab === 'type') renderSigFonts();
  });
  $('#sigName').addEventListener('input', renderSigFonts);
  $('#sigName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmSig(); } });
  $('#sigFonts').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; sig.font = b.dataset.f; renderSigFonts(); });
  $('#sigSaved').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { const list = LS.get('hfa-sigs', []); list.splice(+rm.dataset.rm, 1); LS.set('hfa-sigs', list); sig.saved = null; renderSaved(); return; }
    const it = e.target.closest('[data-i]'); if (!it) return; sig.saved = +it.dataset.i; renderSaved();
  });
  $('#sigSaved').addEventListener('keydown', (e) => { const it = e.target.closest('[data-i]'); if (it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sig.saved = +it.dataset.i; confirmSig(); } });
  $('#sigSaved').addEventListener('dblclick', (e) => { const it = e.target.closest('[data-i]'); if (it) { sig.saved = +it.dataset.i; confirmSig(); } });
  $$('#sigDlg [data-tab]').forEach((b) => b.addEventListener('click', () => sigTab(b.dataset.tab)));
  $('#sigOk').addEventListener('click', confirmSig);
}
