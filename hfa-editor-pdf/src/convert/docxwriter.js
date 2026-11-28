// Montagem de arquivos .docx (WordprocessingML) sem dependências.
// Gera o XML de cada parte; quem chama compacta com o JSZip.
//
// Unidades: pt na API; twips (1/20 pt), meios-pontos e EMU (1/12700 pt) só aqui.

const tw = (pt) => Math.round(pt * 20);
const emu = (pt) => Math.round(pt * 12700);
// remove caracteres proibidos no XML 1.0 (controles), que fariam o Word recusar o arquivo
const BAD = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;
export const xml = (s) => String(s).replace(BAD, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (c) => (c || '#000000').replace('#', '').toUpperCase();

const NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
  + 'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" '
  + 'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
  + 'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" '
  + 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
  + 'mc:Ignorable="w14 wp14"';

/**
 * Propriedades de texto: { font, size, bold, italic, underline, strike, color, rise, scale, spacing }
 * rise em pt (positivo = para cima), scale em % (largura dos caracteres), spacing em pt.
 */
export function rPr(f = {}) {
  let s = '';
  if (f.font) s += `<w:rFonts w:ascii="${xml(f.font)}" w:hAnsi="${xml(f.font)}" w:cs="${xml(f.font)}" w:eastAsia="${xml(f.font)}"/>`;
  if (f.bold) s += '<w:b/><w:bCs/>';
  if (f.italic) s += '<w:i/><w:iCs/>';
  if (f.strike) s += '<w:strike/>';
  if (f.hidden) s += '<w:vanish/>';
  if (f.color && hex(f.color) !== '000000') s += `<w:color w:val="${hex(f.color)}"/>`;
  if (f.spacing) s += `<w:spacing w:val="${tw(f.spacing)}"/>`;
  if (f.scale && Math.abs(f.scale - 100) >= 1) s += `<w:w w:val="${Math.max(1, Math.min(600, Math.round(f.scale)))}"/>`;
  if (f.rise) s += `<w:position w:val="${Math.round(f.rise * 2)}"/>`;
  if (f.size) { const hp = Math.max(2, Math.round(f.size * 2)); s += `<w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/>`; }
  if (f.underline) s += '<w:u w:val="single"/>';
  if (f.shade) s += `<w:shd w:val="clear" w:color="auto" w:fill="${hex(f.shade)}"/>`;
  // texto 100% transparente (OCR sobre a imagem digitalizada): continua selecionável e pesquisável
  if (f.transparent) s += `<w14:textFill><w14:solidFill><w14:srgbClr w14:val="${hex(f.color)}"><w14:alpha w14:val="100000"/></w14:srgbClr></w14:solidFill></w14:textFill>`;
  return s ? `<w:rPr>${s}</w:rPr>` : '';
}

/** Trecho de texto; tabulações e quebras viram os elementos próprios do Word. */
export function run(text, f = {}) {
  let body = '';
  const parts = String(text).split(/(\t|\n)/);
  for (const p of parts) {
    if (p === '\t') body += '<w:tab/>';
    else if (p === '\n') body += '<w:br/>';
    else if (p) body += `<w:t xml:space="preserve">${xml(p)}</w:t>`;
  }
  return body ? `<w:r>${rPr(f)}${body}</w:r>` : '';
}

/**
 * Parágrafo. o: { align, left, right, firstLine (negativo = recuo deslocado), before, after,
 *   line (pt), lineRule ('exact'|'atLeast'|'auto' — em 'auto', line é múltiplo), tabs: [{pos, type}],
 *   keepNext, sect (xml do sectPr), runFont (rPr do sinal de parágrafo), border, shade }
 */
export function para(content, o = {}) {
  let p = '';
  if (o.style) p += `<w:pStyle w:val="${o.style}"/>`;
  if (o.keepNext) p += '<w:keepNext/>';
  if (o.keepLines) p += '<w:keepLines/>';
  if (o.pageBreakBefore) p += '<w:pageBreakBefore/>';
  if (o.frame) p += o.frame;
  p += '<w:widowControl w:val="0"/>';
  if (o.border) p += `<w:pBdr>${o.border}</w:pBdr>`;
  if (o.shade) p += `<w:shd w:val="clear" w:color="auto" w:fill="${hex(o.shade)}"/>`;
  if (o.tabs && o.tabs.length) p += `<w:tabs>${o.tabs.map((t) => `<w:tab w:val="${t.type || 'left'}" w:pos="${tw(t.pos)}"/>`).join('')}</w:tabs>`;
  const sp = [];
  sp.push(`w:before="${tw(Math.max(0, o.before || 0))}"`, `w:after="${tw(Math.max(0, o.after || 0))}"`);
  if (o.line) {
    if (o.lineRule === 'auto') sp.push(`w:line="${Math.round(o.line * 240)}"`, 'w:lineRule="auto"');
    else sp.push(`w:line="${Math.max(1, tw(o.line))}"`, `w:lineRule="${o.lineRule || 'exact'}"`);
  }
  p += `<w:spacing ${sp.join(' ')}/>`;
  const ind = [];
  if (o.left) ind.push(`w:left="${tw(o.left)}"`);
  if (o.right) ind.push(`w:right="${tw(o.right)}"`);
  if (o.firstLine > 0) ind.push(`w:firstLine="${tw(o.firstLine)}"`);
  else if (o.firstLine < 0) ind.push(`w:hanging="${tw(-o.firstLine)}"`);
  if (ind.length) p += `<w:ind ${ind.join(' ')}/>`;
  if (o.align && o.align !== 'left') p += `<w:jc w:val="${o.align === 'justify' ? 'both' : o.align}"/>`;
  if (o.runFont) p += o.runFont;
  if (o.sect) p += o.sect;
  return `<w:p><w:pPr>${p}</w:pPr>${content || ''}</w:p>`;
}

/** Seção (tamanho e margens da página). m: { top, right, bottom, left } em pt */
export function sectPr(w, h, m, o = {}) {
  const orient = w > h ? ' w:orient="landscape"' : '';
  const cols = o.cols && o.cols.length > 1
    ? `<w:cols w:num="${o.cols.length}" w:space="${tw(o.colSpace || 18)}" w:equalWidth="0">${o.cols.map((c) => `<w:col w:w="${tw(c.w)}" w:space="${tw(c.space || 0)}"/>`).join('')}</w:cols>`
    : '<w:cols w:space="708"/>';
  return `<w:sectPr>${o.type ? `<w:type w:val="${o.type}"/>` : ''}<w:pgSz w:w="${tw(w)}" w:h="${tw(h)}"${orient}/>`
    + `<w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.right)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.left)}" w:header="${tw(Math.min(m.top, 18))}" w:footer="${tw(Math.min(m.bottom, 18))}" w:gutter="0"/>`
    + `${cols}<w:docGrid w:linePitch="360"/></w:sectPr>`;
}

const BORDER = (side, b) => (b ? `<w:${side} w:val="${b.dash ? 'dashed' : 'single'}" w:sz="${Math.max(2, Math.min(96, Math.round(b.width * 8)))}" w:space="0" w:color="${hex(b.color)}"/>` : `<w:${side} w:val="nil"/>`);

/**
 * Tabela. t: { left (recuo em pt), cols: [larguras pt], rows: [{ height, cells: [{ span, vmerge, borders:{top,left,bottom,right}, shade, content, valign }] }] }
 * O conteúdo de cada célula é XML de parágrafos (precisa terminar em parágrafo).
 */
export function table(t) {
  const total = t.cols.reduce((a, b) => a + b, 0);
  let s = '<w:tbl><w:tblPr><w:tblW w:w="' + tw(total) + '" w:type="dxa"/>';
  if (t.left) s += `<w:tblInd w:w="${tw(t.left)}" w:type="dxa"/>`;
  s += '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
  s += '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="' + tw(t.pad ?? 2) + '" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="' + tw(t.pad ?? 2) + '" w:type="dxa"/></w:tblCellMar>';
  s += '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>';
  s += `<w:tblGrid>${t.cols.map((c) => `<w:gridCol w:w="${tw(c)}"/>`).join('')}</w:tblGrid>`;
  for (const r of t.rows) {
    s += `<w:tr><w:trPr><w:cantSplit/>${r.height ? `<w:trHeight w:val="${tw(r.height)}" w:hRule="${r.exact ? 'exact' : 'atLeast'}"/>` : ''}</w:trPr>`;
    let ci = 0;
    for (const c of r.cells) {
      const span = c.span || 1;
      const w = t.cols.slice(ci, ci + span).reduce((a, b) => a + b, 0); ci += span;
      let pr = `<w:tcW w:w="${tw(w)}" w:type="dxa"/>`;
      if (span > 1) pr += `<w:gridSpan w:val="${span}"/>`;
      if (c.vmerge) pr += c.vmerge === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
      const b = c.borders || {};
      pr += `<w:tcBorders>${BORDER('top', b.top)}${BORDER('left', b.left)}${BORDER('bottom', b.bottom)}${BORDER('right', b.right)}</w:tcBorders>`;
      if (c.shade) pr += `<w:shd w:val="clear" w:color="auto" w:fill="${hex(c.shade)}"/>`;
      if (c.valign && c.valign !== 'top') pr += `<w:vAlign w:val="${c.valign}"/>`;
      s += `<w:tc><w:tcPr>${pr}</w:tcPr>${c.content || para('', { line: 1, lineRule: 'exact', runFont: rPr({ size: 1 }) })}</w:tc>`;
    }
    s += '</w:tr>';
  }
  return s + '</w:tbl>';
}

/** Documento em construção: corpo, imagens e relações. */
export class DocxBuilder {
  constructor() { this.body = []; this.media = []; this.rels = []; this.shapeId = 1; this.z = 251658240; }

  /** Guarda uma imagem (bytes PNG/JPEG) e devolve o rId. */
  addImage(bytes, ext) {
    const n = this.media.length + 1, name = `image${n}.${ext}`, id = `rIdImg${n}`;
    this.media.push({ name, bytes, ext });
    this.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    return id;
  }
  addLink(url) {
    const id = `rIdLnk${this.rels.length + 1}`;
    this.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(url)}" TargetMode="External"/>`);
    return id;
  }

  anchorHead(x, y, w, h, { behind = false, name = 'Forma', rot = 0 } = {}) {
    const id = this.shapeId++; this.z += 2;
    return {
      id, open: `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${this.z}" behindDoc="${behind ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">`
        + '<wp:simplePos x="0" y="0"/>'
        + `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(x)}</wp:posOffset></wp:positionH>`
        + `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(y)}</wp:posOffset></wp:positionV>`
        + `<wp:extent cx="${emu(w)}" cy="${emu(h)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>`
        + `<wp:docPr id="${id}" name="${name} ${id}"/>`,
      xfrm: `<a:xfrm${rot ? ` rot="${Math.round(rot * 60000)}"` : ''}><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>`,
    };
  }

  /** Imagem flutuante em posição absoluta na página (pt, origem no canto superior esquerdo). */
  imageRun(rId, x, y, w, h, o = {}) {
    const a = this.anchorHead(x, y, w, h, { ...o, name: 'Imagem' });
    return '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>' + a.open
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
      + `<pic:nvPicPr><pic:cNvPr id="${a.id}" name="Imagem ${a.id}"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr>${a.xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
      + '</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
  }

  /** Caixa de texto sem borda, sem margens internas e sem quebra automática. */
  textboxRun(x, y, w, h, paragraphs, o = {}) {
    const a = this.anchorHead(x, y, w, h, { ...o, name: 'Caixa de texto' });
    return '<w:r><w:rPr><w:noProof/></w:rPr><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>' + a.open
      + '<wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>'
      + `<wps:cNvSpPr txBox="1"/><wps:spPr>${a.xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>`
      + `<wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx>`
      + `<wps:bodyPr rot="0" vert="horz" wrap="${o.wrap ? 'square' : 'none'}" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0" upright="1"><a:noAutofit/></wps:bodyPr>`
      + '</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>'
      + `<mc:Fallback><w:pict><v:shape id="hfa_tb${a.id}" type="#_x0000_t202" style="position:absolute;margin-left:${x.toFixed(2)}pt;margin-top:${y.toFixed(2)}pt;width:${w.toFixed(2)}pt;height:${h.toFixed(2)}pt;z-index:${a.id};mso-position-horizontal-relative:page;mso-position-vertical-relative:page" filled="f" stroked="f"><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:f"><w:txbxContent>${paragraphs}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
  }

  /** Arquivos do pacote: { caminho: string | Uint8Array } */
  files({ title = '', fonts = [], defFont = 'Calibri', defSize = 11 } = {}) {
    const f = {};
    const hasPng = this.media.some((m) => m.ext === 'png'), hasJpg = this.media.some((m) => m.ext === 'jpeg');
    f['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + (hasPng ? '<Default Extension="png" ContentType="image/png"/>' : '') + (hasJpg ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '')
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
      + '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    f['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    f['word/_rels/document.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
      + '<Relationship Id="rIdFonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>'
      + this.rels.join('') + '</Relationships>';
    f['word/document.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${this.body.join('')}</w:body></w:document>`;
    f['word/styles.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${xml(defFont)}" w:hAnsi="${xml(defFont)}" w:cs="${xml(defFont)}" w:eastAsia="${xml(defFont)}"/><w:sz w:val="${Math.round(defSize * 2)}"/><w:szCs w:val="${Math.round(defSize * 2)}"/><w:lang w:val="pt-BR" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>`
      + '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
      + '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>'
      + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="2"/></w:pPr></w:style>'
      + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
      + '</w:styles>';
    // doNotExpandShiftReturn: linhas justificadas terminadas em quebra manual não se esticam
    f['word/settings.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">'
      + '<w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:autoHyphenation w:val="0"/><w:characterSpacingControl w:val="doNotCompress"/>'
      + '<w:compat><w:doNotExpandShiftReturn/><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>'
      + '<w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
      + '<w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
      + '<w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/></w:compat>'
      + '<w:themeFontLang w:val="pt-BR"/><w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/></w:settings>';
    f['word/fontTable.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + [...new Set([defFont, ...fonts])].map((n) => `<w:font w:name="${xml(n)}"/>`).join('') + '</w:fonts>';
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    f['docProps/core.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${xml(title)}</dc:title><dc:creator>HFA Editor PDF</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    f['docProps/app.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>HFA Editor PDF</Application></Properties>';
    for (const m of this.media) f['word/media/' + m.name] = m.bytes;
    return f;
  }
}
