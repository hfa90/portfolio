// Interface da conversão PDF <-> Word (diálogo, progresso e download).
// Os módulos pesados só são carregados quando o usuário converte.
import { $, $$, toast } from '../util.js';

export const isDocx = (f) => f && (/\.docx$/i.test(f.name) || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
const isDoc = (f) => f && /\.(doc|rtf|odt)$/i.test(f.name);
const baseName = (n) => (n || 'documento').replace(/\.(pdf|docx)$/i, '');

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Word -> bytes de PDF (usado também para abrir .docx direto no editor). */
export async function wordToPdfBytes(file, { localFonts = false, onProgress } = {}) {
  const { docxToPdf } = await import('./docx2pdf.js');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('NOT_DOCX');
  return docxToPdf(bytes, { localFonts, onProgress, title: baseName(file.name) });
}

const ST = { dir: 'p2w', file: null, source: null, busy: false, onOpenPdf: null, lastPdf: null };

function setDir(dir) {
  ST.dir = dir;
  $$('#convDlg [data-conv]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.conv === dir)));
  $$('#convDlg [data-for]').forEach((el) => { el.hidden = el.dataset.for !== dir; });
  $('#convIn').accept = dir === 'p2w' ? 'application/pdf,.pdf' : '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ST.file && ((dir === 'p2w') !== /\.pdf$/i.test(ST.file.name))) setFile(null);
  $('#convGo').textContent = dir === 'p2w' ? 'Converter para Word' : 'Converter para PDF';
  resetResult();
}
function setFile(f) {
  ST.file = f;
  $('#convName').textContent = f ? `${f.name} · ${(f.size / 1024 / 1024).toFixed(2)} MB` : 'Nenhum arquivo escolhido';
  $('#convGo').disabled = !f && !ST.source;
  resetResult();
}
function resetResult() { $('#convResult').hidden = true; $('#convResult').replaceChildren(); $('#convProg').hidden = true; }
function progress(pct, text) {
  $('#convProg').hidden = false;
  const bar = $('#convBar');
  if (pct == null) bar.removeAttribute('value'); else bar.value = Math.round(pct);
  $('#convStatus').textContent = text || '';
}
function result(lines, actions = []) {
  const box = $('#convResult'); box.replaceChildren();
  const ul = document.createElement('ul');
  for (const [kind, t] of lines) { const li = document.createElement('li'); li.className = kind; li.textContent = t; ul.appendChild(li); }
  box.appendChild(ul);
  if (actions.length) {
    const row = document.createElement('div'); row.className = 'row';
    for (const [label, fn, primary] of actions) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (primary ? 'btn-primary' : 'btn-ghost'); b.textContent = label; b.addEventListener('click', fn); row.appendChild(b); }
    box.appendChild(row);
  }
  box.hidden = false;
}

/**
 * Abre o conversor. o: { dir: 'p2w'|'w2p', file, source: { name, getBytes } (documento aberto no editor) }
 */
export function openConverter(o = {}) {
  const dlg = $('#convDlg');
  ST.source = o.source || null;
  dlg.classList.toggle('from-editor', !!ST.source);
  setDir(o.dir || (o.file && isDocx(o.file) ? 'w2p' : 'p2w'));
  setFile(o.file || null);
  $('#convTitle').textContent = ST.source ? 'Exportar para o Word' : 'Converter PDF ⇄ Word';
  if (!dlg.open) dlg.showModal();
  if (o.file || ST.source) $('#convGo').focus();
}

async function run() {
  if (ST.busy) return;
  const dir = ST.dir;
  ST.busy = true; $('#convGo').disabled = true; resetResult();
  const t0 = performance.now();
  try {
    if (dir === 'p2w') {
      const mode = $('#convDlg input[name="convMode"]:checked').value;
      progress(null, 'Preparando…');
      const name = ST.source ? ST.source.name : ST.file.name;
      const bytes = ST.source ? await ST.source.getBytes() : new Uint8Array(await ST.file.arrayBuffer());
      const { pdfToDocx } = await import('./pdf2docx.js');
      let blob, stats;
      try {
        ({ blob, stats } = await pdfToDocx(bytes, { mode, title: baseName(name), onProgress: (i, n) => progress((100 * i) / n, i < n ? `Página ${i + 1} de ${n}…` : 'Gerando o arquivo .docx…') }));
      } catch (e) {
        if (/password|encrypt/i.test(e.message || e.name || '')) throw new Error('PDF protegido por senha ou criptografado: desbloqueie-o antes de converter.');
        throw e;
      }
      const out = baseName(name) + '.docx';
      download(blob, out);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const lines = [['ok', `“${out}” baixado: ${stats.pages} página(s) em ${secs} s (${(blob.size / 1024 / 1024).toFixed(2)} MB).`]];
      if (stats.tables) lines.push(['', `${stats.tables} tabela(s) recriada(s) como tabelas do Word.`]);
      if (stats.fallback) lines.push(['', `${stats.fallback} página(s) com muitos elementos sobrepostos (cartaz, panfleto) saíram com o layout idêntico para não desmontar.`]);
      if (stats.scanned) lines.push(['warn', `${stats.scanned} página(s) digitalizada(s) com texto reconhecido (OCR): o texto veio da camada do PDF.`]);
      if (stats.noText) lines.push(['warn', `${stats.noText} página(s) sem texto (imagem digitalizada sem OCR): entraram como imagem.`]);
      progress(100, 'Pronto.');
      result(lines);
    } else {
      const localFonts = $('#convLocal').checked && 'queryLocalFonts' in window;
      progress(null, 'Lendo o documento…');
      const { bytes, stats } = await wordToPdfBytes(ST.file, { localFonts, onProgress: (s, i, n) => progress(n ? (100 * i) / n : null, n ? `${s} página ${i + 1} de ${n}` : s) });
      const out = baseName(ST.file.name) + '.pdf';
      const blob = new Blob([bytes], { type: 'application/pdf' });
      download(blob, out);
      ST.lastPdf = { bytes, name: out };
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const lines = [['ok', `“${out}” baixado: ${stats.pages} página(s) em ${secs} s (${(blob.size / 1024 / 1024).toFixed(2)} MB).`]];
      if (localFonts && !stats.localFonts) lines.push(['warn', 'O navegador não liberou as fontes do computador: foram usadas fontes com as mesmas medidas das do Office.']);
      if (stats.lostImages) lines.push(['warn', `${stats.lostImages} imagem(ns) em formato que o navegador não abre (EMF/WMF/TIFF) ficaram de fora.`]);
      if (stats.lostChars) lines.push(['warn', `${stats.lostChars} caractere(s) sem fonte disponível (ideogramas, emojis coloridos) ficaram de fora.`]);
      progress(100, 'Pronto.');
      const actions = ST.onOpenPdf ? [['Abrir no editor', () => { $('#convDlg').close(); ST.onOpenPdf(new File([bytes], out, { type: 'application/pdf' })); }, true]] : [];
      result(lines, actions);
    }
  } catch (e) {
    console.error(e);
    const raw = e.message || String(e);
    const msg = raw === 'NOT_DOCX' ? 'esse arquivo não é um .docx. Arquivos .doc antigos precisam ser salvos como .docx no Word antes.'
      : /Invalid PDF|InvalidPDF|PDF header|bad XRef/i.test(raw + e.name) ? 'o arquivo não é um PDF válido ou está corrompido.'
      : /end of central directory|zip/i.test(raw) ? 'o arquivo .docx está corrompido ou incompleto.'
      : raw;
    $('#convProg').hidden = true;
    result([['err', 'Não foi possível converter: ' + msg]]);
  } finally {
    ST.busy = false; $('#convGo').disabled = !ST.file && !ST.source;
  }
}

/** Liga os eventos do diálogo. onOpenPdf(file): abre um PDF no editor. */
export function bindConverter({ onOpenPdf }) {
  ST.onOpenPdf = onOpenPdf;
  const dlg = $('#convDlg');
  if (!('queryLocalFonts' in window)) $('#convLocalWrap').hidden = true;
  $$('#convDlg [data-conv]').forEach((b) => b.addEventListener('click', () => setDir(b.dataset.conv)));
  $('#convPick').addEventListener('click', () => $('#convIn').click());
  $('#convIn').addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (isDoc(f)) return result([['err', 'Arquivos .doc, .rtf e .odt precisam ser salvos como .docx antes.']]);
    setDir(isDocx(f) ? 'w2p' : 'p2w'); setFile(f);
  });
  const pane = $('#convDrop');
  pane.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); pane.classList.add('over'); });
  pane.addEventListener('dragleave', () => pane.classList.remove('over'));
  pane.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); pane.classList.remove('over');
    const f = Array.from(e.dataTransfer.files)[0]; if (!f) return;
    setDir(isDocx(f) ? 'w2p' : 'p2w'); setFile(f);
  });
  $('#convGo').addEventListener('click', run);
  dlg.addEventListener('cancel', (e) => { if (ST.busy) e.preventDefault(); });
  dlg.addEventListener('close', () => { ST.source = null; });
  $$('[data-open-conv]').forEach((b) => b.addEventListener('click', () => openConverter({ dir: b.dataset.openConv })));
}
