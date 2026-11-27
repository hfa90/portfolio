// Acesso às bibliotecas de PDF (servidas localmente em vendor/)
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';
import * as PDFLib from '../vendor/pdf-lib/pdf-lib.esm.min.js';
import { uid } from './util.js';
import { S } from './state.js';

export { pdfjsLib, PDFLib };

const PDFJS = new URL('../vendor/pdfjs/', import.meta.url).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';

/**
 * Abre um PDF. O pdf-lib analisa o arquivo uma única vez aqui (para detectar
 * criptografia) e o resultado fica guardado em doc.lib para a exportação.
 */
export async function loadDoc(bytes, name, id) {
  let lib;
  try { lib = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) { if (/encrypt/i.test(e.message || '')) throw new Error('ENCRYPTED'); throw e; }
  const pdf = await pdfjsLib.getDocument({
    data: bytes.slice(), isEvalSupported: false,
    cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/',
  }).promise;
  return { id: id || uid('d'), name, bytes, pdf, lib };
}

/** Documento pdf-lib intacto (recarrega se a exportação anterior o modificou). */
export async function getLib(docId) {
  const d = S.docs[docId];
  if (!d.lib) d.lib = await PDFLib.PDFDocument.load(d.bytes, { updateMetadata: false });
  return d.lib;
}

let fkP = null;
/** Carrega o fontkit sob demanda (só quando um texto precisa de fonte TrueType). */
export function loadFontkit() {
  if (window.fontkit) return Promise.resolve(window.fontkit);
  fkP = fkP || new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/fontkit/fontkit.umd.min.js', import.meta.url).href;
    s.onload = () => res(window.fontkit); s.onerror = () => { fkP = null; rej(new Error('fontkit não carregou')); };
    document.head.appendChild(s);
  });
  return fkP;
}
const ttfCache = new Map();
export function loadTTF(name) {
  if (!ttfCache.has(name)) {
    ttfCache.set(name, fetch(new URL(`../vendor/dejavu/${name}.ttf`, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error('fonte ' + name); return r.arrayBuffer();
    }).catch((e) => { ttfCache.delete(name); throw e; }));
  }
  return ttfCache.get(name);
}
