// Geração de etiquetas com QR code (qrcode-generator) e código de barras Code 128 (JsBarcode).
// As duas bibliotecas são carregadas por <script> no index.html (window.qrcode / window.JsBarcode).

export const MODELOS = {
  termica_50x30: { nome: 'Rolo térmico 50 × 30 mm', pagina: '50mm 30mm', w: 50, h: 30, colunas: 1, linhas: 1, mt: 0, ml: 0, gap: 0, compacta: true },
  termica_60x40: { nome: 'Rolo térmico 60 × 40 mm', pagina: '60mm 40mm', w: 60, h: 40, colunas: 1, linhas: 1, mt: 0, ml: 0, gap: 0 },
  termica_100x50: { nome: 'Rolo térmico 100 × 50 mm', pagina: '100mm 50mm', w: 100, h: 50, colunas: 1, linhas: 1, mt: 0, ml: 0, gap: 0, grande: true },
  a4_24: { nome: 'Folha A4 · 24 etiquetas (70 × 37 mm)', pagina: 'A4', w: 70, h: 37.12, colunas: 3, linhas: 8, mt: 0, ml: 0, gap: 0 },
  a4_14: { nome: 'Folha A4 · 14 etiquetas (99 × 38,1 mm · tipo Pimaco A4263)', pagina: 'A4', w: 99, h: 38.1, colunas: 2, linhas: 7, mt: 15.15, ml: 4.75, gap: 2.5, grande: true },
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function codigoDaMaquina(m) { return m.ativo || m.hostname; }

export function qrSvg(texto) {
  if (!window.qrcode) return '<div class="etq-erro">QR indisponível</div>';
  const q = window.qrcode(0, 'M');
  q.addData(texto);
  q.make();
  return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

export function barrasSvg(texto) {
  if (!window.JsBarcode) return '';
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    window.JsBarcode(svg, texto, { format: 'CODE128', displayValue: false, margin: 0, height: 40, width: 1.6 });
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.removeAttribute('width'); svg.removeAttribute('height');
    return svg.outerHTML;
  } catch { return ''; }
}

export function etiquetaHTML(m, urlBase, op) {
  const codigo = codigoDaMaquina(m);
  const url = `${urlBase}#maquina/${encodeURIComponent(codigo)}`;
  return `<div class="etq">
    <div class="etq-qr">${qrSvg(url)}</div>
    <div class="etq-info">
      <div class="etq-org">${esc(op.titulo || 'PATRIMÔNIO TI')}</div>
      <div class="etq-pat">${esc(m.ativo || 'SEM PATRIMÔNIO')}</div>
      <div class="etq-host">${esc(m.hostname)}</div>
      ${op.setor && m.setor ? `<div class="etq-setor">${esc(m.setor)}</div>` : ''}
      ${op.barras ? `<div class="etq-barras">${barrasSvg(codigo)}</div>` : ''}
    </div>
  </div>`;
}

// devolve { css, html } das páginas prontas para imprimir
export function montarFolhas(lista, modeloId, urlBase, op = {}) {
  const md = MODELOS[modeloId];
  const porPagina = md.colunas * md.linhas;
  const pular = Math.max(0, Math.min(porPagina - 1, Number(op.pular) || 0));
  const itens = [...Array(pular).fill(null), ...lista];
  const paginas = [];
  for (let i = 0; i < itens.length; i += porPagina) paginas.push(itens.slice(i, i + porPagina));
  const [pw, ph] = md.pagina === 'A4' ? [210, 297] : [md.w, md.h];

  const css = `
    @page { size: ${md.pagina === 'A4' ? 'A4 portrait' : md.pagina}; margin: 0; }
    .etq-pagina { width: ${pw}mm; height: ${ph}mm; padding: ${md.mt}mm 0 0 ${md.ml}mm; display: grid;
      grid-template-columns: repeat(${md.colunas}, ${md.w}mm); grid-auto-rows: ${md.h}mm; column-gap: ${md.gap}mm;
      align-content: start; overflow: hidden; }
    .etq { width: ${md.w}mm; height: ${md.h}mm; }`;

  const classe = md.compacta ? 'etq-compacta' : md.grande ? 'etq-grande' : '';
  const html = paginas.map((pg) => `<div class="etq-pagina ${classe}">${pg.map((m) => (m ? etiquetaHTML(m, urlBase, op) : '<div class="etq etq-vazia"></div>')).join('')}</div>`).join('');
  return { css, html, paginas: paginas.length, total: lista.length };
}
