// Estado global, constantes e consultas sobre o modelo
//
// Modelo: S.pages = [{ id, docId, index, x0, y0, w, h, baseRot, rot, els: [] }]
// Os elementos ficam em pontos PDF com origem no canto superior esquerdo da página
// (sem rotação), então zoom e giro da página não alteram os dados.

// k = posição da linha de base (em múltiplos do tamanho) dentro de uma linha com altura LH
export const FONTS = {
  Helvetica: { css: 'Helvetica, Arial, "Liberation Sans", sans-serif', k: 0.9465, std: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], ttf: ['DejaVuSans', 'DejaVuSans-Bold', 'DejaVuSans-Oblique', 'DejaVuSans-BoldOblique'] },
  Times: { css: '"Times New Roman", Times, "Liberation Serif", serif', k: 0.9375, std: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'], ttf: ['DejaVuSerif', 'DejaVuSerif-Bold', 'DejaVuSerif-Italic', 'DejaVuSerif-BoldItalic'] },
  Courier: { css: '"Courier New", Courier, "Liberation Mono", monospace', k: 0.8665, std: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'], ttf: ['DejaVuSansMono', 'DejaVuSansMono-Bold', 'DejaVuSansMono-Oblique', 'DejaVuSansMono-BoldOblique'] },
};
export const LH = 1.2;

export const TYPE = {
  text: { label: 'Texto', icon: 'text' }, rect: { label: 'Retângulo', icon: 'rect' }, ellipse: { label: 'Elipse', icon: 'ellipse' },
  line: { label: 'Linha', icon: 'line' }, arrow: { label: 'Seta', icon: 'arrow' }, draw: { label: 'Desenho', icon: 'pen' },
  highlight: { label: 'Destaque', icon: 'highlight' }, whiteout: { label: 'Corretivo', icon: 'eraser' }, redact: { label: 'Tarja definitiva', icon: 'redact' },
  image: { label: 'Imagem', icon: 'image' }, select: { label: '' }, edittext: { label: 'Editar texto', icon: 'textedit' },
};
// grupos de propriedades exibidos por tipo (ou ferramenta)
export const PROPS = {
  text: ['color', 'opacity', 'font', 'align', 'rotate'], edittext: ['color', 'font'],
  rect: ['color', 'width', 'fill', 'opacity'], ellipse: ['color', 'width', 'fill', 'opacity'],
  line: ['color', 'width', 'opacity'], arrow: ['color', 'width', 'opacity'], draw: ['color', 'width', 'opacity'],
  highlight: ['color', 'opacity'], whiteout: ['fill', 'burn'], redact: ['fill', 'burn'], image: ['opacity', 'rotate'],
};
export const SWATCHES = ['#111827', '#ffffff', '#e11d48', '#f97316', '#facc15', '#16a34a', '#2563eb', '#7c3aed'];
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const ROTATABLE = new Set(['text', 'image']);

export const S = {
  docs: {}, pages: [], assets: {},
  tool: 'select', sel: null, cur: null, zoom: 1, fileName: 'documento.pdf', dirty: false, fillColor: '#fde68a',
  defs: {
    text: { color: '#111827', opacity: 1, font: 'Helvetica', size: 14, bold: false, italic: false, align: 'left' },
    edittext: { color: '#111827', font: 'Helvetica', size: 12, bold: false, italic: false },
    rect: { color: '#e11d48', width: 2, fill: null, opacity: 1 },
    ellipse: { color: '#e11d48', width: 2, fill: null, opacity: 1 },
    line: { color: '#e11d48', width: 2, opacity: 1 },
    arrow: { color: '#e11d48', width: 2.5, opacity: 1 },
    draw: { color: '#2563eb', width: 3, opacity: 1 },
    highlight: { color: '#facc15', opacity: 0.45 },
    whiteout: { fill: '#ffffff', burn: false },
    redact: { fill: '#000000', burn: true },
    image: { opacity: 1 },
  },
};

export const pageById = (id) => S.pages.find((p) => p.id === id);
export const totalRot = (p) => (((p.baseRot + p.rot) % 360) + 360) % 360;
export const dispDims = (p) => (totalRot(p) % 180 ? [p.h, p.w] : [p.w, p.h]);
export const srcKey = (p) => (p.docId ? `${p.docId}:${p.index}` : `blank:${p.w}x${p.h}`);

/** Seleção atual: { page, els } (pode ter vários elementos da mesma página). */
export function selection() {
  if (!S.sel) return null;
  const page = pageById(S.sel.pageId); if (!page) return null;
  const els = S.sel.ids.map((id) => page.els.find((e) => e.id === id)).filter(Boolean);
  return els.length ? { page, els } : null;
}
/** Elemento único selecionado: { page, el } ou null. */
export function selected() { const s = selection(); return s && s.els.length === 1 ? { page: s.page, el: s.els[0] } : null; }
export const isSel = (id) => !!(S.sel && S.sel.ids.includes(id));
export const elType = (el) => (el.type === 'whiteout' && el.burn ? 'redact' : el.type);
