// Complementos ao docx-preview para o Word -> PDF:
//  - âncoras (imagens, formas e caixas de texto flutuantes) posicionadas como no
//    Word: relativas à página, margem, parágrafo, linha ou caractere;
//  - tabulações calculadas como no Word (paradas do parágrafo e do estilo,
//    padrão a cada N pt, parada implícita do recuo deslocado, alinhamentos e
//    preenchimento pontilhado).
// O .docx é ajustado antes de ir para o docx-preview: cada âncora vira um
// marcador (bookmark, que o docx-preview desenha como <span id>) e o conteúdo
// das caixas de texto vai para tabelas no fim do documento, para ser montado
// com os mesmos estilos; depois tudo é reposicionado no HTML.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const EMU = 12700; // por pt
const PX = 4 / 3; // px por pt

const kid = (el, ns, name) => (el ? Array.from(el.children).find((c) => c.namespaceURI === ns && c.localName === name) || null : null);
const desc = (el, ns, name) => (el ? el.getElementsByTagNameNS(ns, name)[0] || null : null);
const attr = (el, name) => (el ? el.getAttribute(name) ?? el.getAttribute(name.replace(/^.*:/, '')) : null);
const wattr = (el, name) => (el ? el.getAttributeNS(W, name) || el.getAttribute('w:' + name) : null);
const tw = (v) => (v == null || v === '' ? null : parseFloat(v) / 20); // twips -> pt

async function rels(zip, part) {
  const p = part.replace(/^(.*\/)?([^/]+)$/, (m, d, f) => `${d || ''}_rels/${f}.rels`);
  const f = zip.file(p); const map = new Map();
  if (!f) return map;
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  for (const r of Array.from(doc.getElementsByTagName('Relationship'))) map.set(r.getAttribute('Id'), { target: r.getAttribute('Target'), mode: r.getAttribute('TargetMode') });
  return map;
}
const resolve = (base, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const s of target.split('/')) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); }
  return parts.join('/');
};

function posOf(el) {
  if (!el) return { rel: 'column', align: null, off: 0 };
  const off = kid(el, WP, 'posOffset'), al = kid(el, WP, 'align'), pct = desc(el, 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing', 'pctPosHOffset') || desc(el, 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing', 'pctPosVOffset');
  return { rel: el.getAttribute('relativeFrom') || 'column', align: al ? al.textContent.trim() : null, off: off ? parseFloat(off.textContent) / EMU : 0, pct: pct ? parseFloat(pct.textContent) / 100000 : null };
}
const colorOf = (el) => {
  if (!el) return null;
  const s = desc(el, A, 'srgbClr'); if (s) return '#' + s.getAttribute('val');
  const sys = desc(el, A, 'sysClr'); if (sys) return '#' + (sys.getAttribute('lastClr') || '000000');
  return null;
};

/**
 * Tira as âncoras do XML (exceto as que empurram o texto para baixo, que o
 * docx-preview já trata) e anota o necessário para recolocá-las.
 * Devolve { anchors: Map(id -> info), txbx: [{ id, xml, width }] }
 */
export async function extractAnchors(zip, state) {
  const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  let docXml = null;
  for (const part of parts) {
    const text = await zip.file(part).async('string');
    if (!/wp:anchor|<wp:anchor/.test(text) && !/:anchor /.test(text)) { if (part === 'word/document.xml') docXml = text; continue; }
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) continue;
    const rel = await rels(zip, part);
    let changed = false;
    for (const anchor of Array.from(doc.getElementsByTagNameNS(WP, 'anchor'))) {
      if (kid(anchor, WP, 'wrapTopAndBottom')) continue;
      const drawing = anchor.parentElement; // w:drawing
      // dentro de mc:AlternateContent a âncora fica em mc:Choice: troca o bloco inteiro
      let holder = drawing;
      const alt = drawing.parentElement && drawing.parentElement.namespaceURI === MC ? drawing.parentElement.parentElement : null;
      if (alt && alt.localName === 'AlternateContent') holder = alt;
      const run = holder.parentElement; if (!run || run.localName !== 'r') continue;
      const para = run.parentElement; if (!para) continue;
      const id = state.n++;
      const ext = kid(anchor, WP, 'extent');
      const info = {
        id, part,
        w: ext ? parseFloat(ext.getAttribute('cx')) / EMU : 0, h: ext ? parseFloat(ext.getAttribute('cy')) / EMU : 0,
        H: posOf(kid(anchor, WP, 'positionH')), V: posOf(kid(anchor, WP, 'positionV')),
        behind: anchor.getAttribute('behindDoc') === '1', z: parseInt(anchor.getAttribute('relativeHeight') || '0', 10),
      };
      const xfrm = desc(anchor, A, 'xfrm');
      if (xfrm) { info.rot = (parseFloat(xfrm.getAttribute('rot') || '0') / 60000) || 0; info.flipH = xfrm.getAttribute('flipH') === '1'; info.flipV = xfrm.getAttribute('flipV') === '1'; }
      const blip = desc(anchor, A, 'blip');
      if (blip) {
        const rid = blip.getAttributeNS(R, 'embed') || blip.getAttribute('r:embed');
        const t = rid && rel.get(rid);
        if (t && t.mode !== 'External') info.img = resolve(part, t.target);
        const src = desc(anchor, A, 'srcRect');
        if (src) info.crop = ['l', 't', 'r', 'b'].map((k) => (parseFloat(src.getAttribute(k) || '0') / 100000) || 0);
      }
      const spPr = desc(anchor, 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape', 'spPr');
      if (spPr) {
        const fill = kid(spPr, A, 'solidFill'); if (fill) info.fill = colorOf(fill);
        const ln = kid(spPr, A, 'ln');
        if (ln && !kid(ln, A, 'noFill')) { info.line = colorOf(kid(ln, A, 'solidFill')) || '#000000'; info.lineW = (parseFloat(ln.getAttribute('w') || '9525') / EMU); }
        const geom = kid(spPr, A, 'prstGeom'); info.geom = geom ? geom.getAttribute('prst') : 'rect';
      }
      const txbx = desc(anchor, 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape', 'txbx');
      const content = txbx && desc(txbx, W, 'txbxContent');
      if (content) {
        const body = desc(anchor, 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape', 'bodyPr');
        const ins = (k, d) => (body && body.getAttribute(k) != null ? parseFloat(body.getAttribute(k)) / EMU : d);
        info.ins = [ins('lIns', 7.2), ins('tIns', 3.6), ins('rIns', 7.2), ins('bIns', 3.6)];
        info.noWrap = body && body.getAttribute('wrap') === 'none';
        info.anchorV = body ? body.getAttribute('anchor') || 't' : 't';
        info.vert = body && /vert/.test(body.getAttribute('vert') || '') && body.getAttribute('vert') !== 'horz' ? body.getAttribute('vert') : null;
        const inner = Array.from(content.children).map((c) => new XMLSerializer().serializeToString(c)).join('');
        state.txbx.push({ id, xml: inner, width: Math.max(4, info.w - info.ins[0] - info.ins[2]), noWrap: info.noWrap });
        info.txbx = true;
      }
      if (!info.img && !info.txbx && !info.fill && !info.line) { /* forma vazia */ }
      state.anchors.set(id, info);
      // marcador no lugar da âncora
      const bm = doc.createElementNS(W, 'w:bookmarkStart');
      bm.setAttributeNS(W, 'w:id', String(900000 + id)); bm.setAttributeNS(W, 'w:name', `hfa_anc_${id}`);
      para.insertBefore(bm, run);
      holder.remove();
      if (!run.children.length || Array.from(run.children).every((c) => c.localName === 'rPr')) run.remove();
      changed = true;
    }
    const out = changed ? new XMLSerializer().serializeToString(doc) : text;
    if (changed) zip.file(part, out);
    if (part === 'word/document.xml') docXml = out;
  }
  // conteúdo das caixas de texto: tabelas 1x1 com a largura da caixa, no fim do corpo
  if (state.txbx.length && docXml) {
    const ns = 'xmlns:w="' + W + '"';
    const tables = state.txbx.map((t) => {
      const wtw = Math.round((t.noWrap ? 2000 : t.width) * 20);
      const xml = t.xml.replace(/^(<w:p\b[^>]*>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?)/, `$1<w:bookmarkStart w:id="${800000 + t.id}" w:name="hfa_txb_${t.id}"/>`);
      const first = /^<w:p\b/.test(t.xml) ? xml : `<w:p><w:bookmarkStart w:id="${800000 + t.id}" w:name="hfa_txb_${t.id}"/></w:p>${t.xml}`;
      return `<w:tbl><w:tblPr><w:tblW w:w="${wtw}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${wtw}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${wtw}" w:type="dxa"/></w:tcPr>${first}</w:tc></w:tr></w:tbl><w:p/>`;
    }).join('');
    // namespaces dos fragmentos já estão no <w:document>; remove declarações repetidas
    const clean = tables.replace(new RegExp(` ${ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '');
    const at = docXml.lastIndexOf('<w:sectPr');
    const end = docXml.lastIndexOf('</w:body>');
    const pos = at > docXml.lastIndexOf('</w:p>') ? at : end;
    zip.file('word/document.xml', docXml.slice(0, pos) + clean + docXml.slice(pos));
  }
}

/** Depois de renderizar: separa o conteúdo das caixas de texto (antes de paginar). */
export function takeTextboxes(body, state) {
  for (const t of state.txbx) {
    const mark = body.querySelector(`[id="hfa_txb_${t.id}"]`);
    const table = mark && mark.closest('table');
    if (!table) continue;
    const cell = table.querySelector('td');
    const tpl = document.createElement('div');
    if (cell) Array.from(cell.childNodes).forEach((n) => tpl.appendChild(n));
    state.content.set(t.id, tpl);
    const next = table.nextElementSibling;
    if (next && next.tagName === 'P' && !next.textContent.trim()) next.remove();
    table.remove();
  }
}

/** Recoloca as âncoras em cada página (depois da paginação). */
export async function placeAnchors(body, state, zip) {
  const urls = new Map();
  const imgUrl = async (path) => {
    if (!urls.has(path)) {
      const f = zip.file(path);
      urls.set(path, f ? URL.createObjectURL(new Blob([await f.async('uint8array')], { type: /\.png$/i.test(path) ? 'image/png' : /\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.gif$/i.test(path) ? 'image/gif' : /\.svg$/i.test(path) ? 'image/svg+xml' : 'application/octet-stream' })) : null);
    }
    return urls.get(path);
  };
  const secs = Array.from(body.querySelectorAll('.docx-wrapper > section.docx'));
  for (const sec of secs) {
    const sr = sec.getBoundingClientRect(), cs = getComputedStyle(sec);
    const pad = { l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight), t: parseFloat(cs.paddingTop), b: parseFloat(cs.paddingBottom) };
    const pageW = sr.width, pageH = parseFloat(cs.minHeight) || sr.height;
    const marks = Array.from(sec.querySelectorAll('[id^="hfa_anc_"]'));
    for (const m of marks) {
      const info = state.anchors.get(+m.id.slice(8)); if (!info) continue;
      const w = info.w * PX, h = info.h * PX;
      const p = m.closest('p') || m.parentElement;
      const pr = p.getBoundingClientRect(), mr = m.getBoundingClientRect();
      const frameH = (rel) => {
        switch (rel) {
          case 'page': return [0, pageW];
          case 'leftMargin': case 'insideMargin': return [0, pad.l];
          case 'rightMargin': case 'outsideMargin': return [pageW - pad.r, pad.r];
          case 'character': return [mr.left - sr.left, 0];
          default: return [pad.l, pageW - pad.l - pad.r]; // margin, column
        }
      };
      const frameV = (rel) => {
        switch (rel) {
          case 'page': return [0, pageH];
          case 'topMargin': case 'insideMargin': return [0, pad.t];
          case 'bottomMargin': case 'outsideMargin': return [pageH - pad.b, pad.b];
          case 'paragraph': return [pr.top - sr.top, pr.height];
          case 'line': return [mr.top - sr.top, mr.height];
          default: return [pad.t, pageH - pad.t - pad.b]; // margin
        }
      };
      const [fx, fw] = frameH(info.H.rel), [fy, fh] = frameV(info.V.rel);
      let x = fx + (info.H.pct != null ? info.H.pct * fw : info.H.off * PX), y = fy + (info.V.pct != null ? info.V.pct * fh : info.V.off * PX);
      if (info.H.align === 'center') x = fx + (fw - w) / 2; else if (info.H.align === 'right' || info.H.align === 'outside') x = fx + fw - w; else if (info.H.align === 'left' || info.H.align === 'inside') x = fx;
      if (info.V.align === 'center') y = fy + (fh - h) / 2; else if (info.V.align === 'bottom' || info.V.align === 'outside') y = fy + fh - h; else if (info.V.align === 'top' || info.V.align === 'inside') y = fy;
      const box = document.createElement('div');
      box.className = 'hfa-anchor';
      box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;margin:0;z-index:${info.behind ? -1 : 5};overflow:visible`;
      const tf = [];
      if (info.rot) tf.push(`rotate(${info.rot}deg)`);
      if (info.flipH) tf.push('scaleX(-1)'); if (info.flipV) tf.push('scaleY(-1)');
      if (tf.length) box.style.transform = tf.join(' ');
      if (info.fill) box.style.background = info.fill;
      if (info.line) box.style.border = `${Math.max(0.5, info.lineW) * PX}px solid ${info.line}`;
      if (info.geom === 'ellipse') box.style.borderRadius = '50%';
      else if (info.geom === 'roundRect') box.style.borderRadius = `${Math.min(w, h) * 0.1667}px`;
      if (info.img) {
        const url = await imgUrl(info.img);
        if (url) {
          const img = document.createElement('img'); img.src = url; img.alt = '';
          img.style.cssText = 'display:block;width:100%;height:100%;position:relative';
          if (info.crop && info.crop.some((v) => v)) {
            const [l, t, r, b] = info.crop, sx = 1 / (1 - l - r || 1), sy = 1 / (1 - t - b || 1);
            box.style.overflow = 'hidden';
            img.style.cssText = `display:block;position:absolute;width:${100 * sx}%;height:${100 * sy}%;left:${-100 * l * sx}%;top:${-100 * t * sy}%`;
          }
          try { await img.decode(); } catch { /* formato que o navegador não abre */ }
          box.appendChild(img);
        }
      }
      if (info.txbx) {
        const tpl = state.content.get(info.id);
        const inner = document.createElement('div');
        const [l, t, r] = info.ins;
        inner.style.cssText = `position:absolute;left:${l * PX}px;top:${t * PX}px;width:${info.noWrap ? 'max-content' : (info.w - l - r) * PX + 'px'}`;
        if (tpl) Array.from(tpl.childNodes).forEach((n) => inner.appendChild(n.cloneNode(true))); // cópia: cabeçalhos repetem
        box.appendChild(inner);
        sec.appendChild(box);
        if (info.anchorV === 'ctr' || info.anchorV === 'b') {
          const ih = inner.getBoundingClientRect().height, avail = h - (t + info.ins[3]) * PX;
          inner.style.top = `${t * PX + (info.anchorV === 'ctr' ? (avail - ih) / 2 : avail - ih)}px`;
        }
        continue;
      }
      sec.appendChild(box);
    }
  }
}

// ---------- tabulações ----------
/** Paradas de tabulação por estilo (com herança) a partir de styles.xml. */
export async function readTabs(zip) {
  const f = zip.file('word/styles.xml'); const out = new Map();
  let def = 35.4;
  const set = zip.file('word/settings.xml');
  if (set) { const m = /defaultTabStop\s+w:val="(\d+)"/.exec(await set.async('string')); if (m) def = +m[1] / 20; }
  if (!f) return { styles: out, def };
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  const raw = new Map();
  for (const st of Array.from(doc.getElementsByTagNameNS(W, 'style'))) {
    const id = wattr(st, 'styleId'); if (!id) continue;
    const based = kid(st, W, 'basedOn');
    const tabs = desc(kid(st, W, 'pPr'), W, 'tabs');
    raw.set(id, { based: based && wattr(based, 'val'), tabs: tabs ? parseTabs(tabs) : [] });
  }
  const res = (id, depth = 0) => {
    if (out.has(id)) return out.get(id);
    const e = raw.get(id); if (!e || depth > 10) return [];
    const merged = mergeTabs(e.based ? res(e.based, depth + 1) : [], e.tabs);
    out.set(id, merged); return merged;
  };
  for (const id of raw.keys()) res(id);
  return { styles: out, def };
}
function parseTabs(el) {
  return Array.from(el.children).filter((c) => c.localName === 'tab').map((t) => ({ val: wattr(t, 'val') || 'left', pos: tw(wattr(t, 'pos')) || 0, leader: wattr(t, 'leader') || 'none' }));
}
function mergeTabs(base, own) {
  const out = base.filter((b) => !own.some((o) => Math.abs(o.pos - b.pos) < 0.5));
  for (const o of own) if (o.val !== 'clear') out.push(o);
  return out.sort((a, b) => a.pos - b.pos);
}
/** Marca no XML as paradas efetivas de cada parágrafo que tem tabulação. */
export async function markTabs(zip, tabInfo) {
  const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  let k = 0;
  for (const part of parts) {
    const text = await zip.file(part).async('string');
    if (!/<w:tab\/>|<w:tab \/>|<w:tab>/.test(text) && !/<w:ptab/.test(text)) continue;
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) continue;
    let changed = false;
    for (const p of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
      const hasTab = Array.from(p.getElementsByTagNameNS(W, 'tab')).some((t) => t.parentElement && t.parentElement.localName === 'r');
      if (!hasTab) continue;
      const pPr = kid(p, W, 'pPr');
      const sty = kid(pPr, W, 'pStyle');
      const base = (sty && tabInfo.styles.get(wattr(sty, 'val'))) || tabInfo.styles.get('Normal') || [];
      const own = kid(pPr, W, 'tabs');
      const tabs = mergeTabs(base, own ? parseTabs(own) : []);
      const enc = tabs.map((t) => `${t.val[0]}${t.leader !== 'none' ? t.leader[0] : ''}${Math.round(t.pos * 10)}`).join('_');
      const bm = doc.createElementNS(W, 'w:bookmarkStart');
      bm.setAttributeNS(W, 'w:id', String(700000 + k)); bm.setAttributeNS(W, 'w:name', `hfa_tab_${k++}_${enc}`);
      const first = Array.from(p.children).find((c) => c.localName !== 'pPr');
      p.insertBefore(bm, first || null);
      changed = true;
    }
    if (changed) zip.file(part, new XMLSerializer().serializeToString(doc));
  }
}

const LEADER = { d: '.', h: '-', u: '_', m: '·' };
/** Recalcula a largura de cada tabulação como o Word faz. */
export function layoutTabs(body, def) {
  const ps = Array.from(body.querySelectorAll('p')).filter((p) => p.querySelector('.docx-tab-stop'));
  for (const p of ps) {
    const bm = p.querySelector('[id^="hfa_tab_"]');
    const stops = bm ? bm.id.split('_').slice(3).filter(Boolean).map((s) => {
      const m = /^([lrcdbn])([dhum]?)(-?\d+)$/.exec(s); if (!m) return null;
      return { val: { l: 'left', r: 'right', c: 'center', d: 'decimal', b: 'bar', n: 'num' }[m[1]] || 'left', leader: m[2] || null, pos: +m[3] / 10 };
    }).filter(Boolean) : [];
    const cs = getComputedStyle(p);
    // origem: borda esquerda do texto da coluna (célula ou página), sem o recuo do parágrafo
    const cell = p.closest('td,th');
    const host = cell || p.closest('section');
    const hcs = getComputedStyle(host);
    const originPx = host.getBoundingClientRect().left + parseFloat(hcs.paddingLeft) + parseFloat(hcs.borderLeftWidth || 0);
    const indL = (p.getBoundingClientRect().left + parseFloat(cs.paddingLeft) - originPx) / PX; // recuo esquerdo em pt
    const hanging = parseFloat(cs.textIndent) < 0;
    for (const span of Array.from(p.querySelectorAll('.docx-tab-stop'))) {
      span.style.wordSpacing = '0'; span.textContent = '​';
      span.style.display = 'inline-block'; span.style.width = '0px'; span.style.whiteSpace = 'pre'; span.style.overflow = 'hidden'; span.style.verticalAlign = 'baseline';
      const x = (span.getBoundingClientRect().left - originPx) / PX;
      const cands = stops.filter((s) => s.val !== 'bar' && s.pos > x + 0.3);
      if (hanging && indL > x + 0.3) cands.push({ val: 'left', pos: indL, leader: null });
      cands.sort((a, b) => a.pos - b.pos);
      let stop = cands[0];
      if (!stop) { const n = Math.floor((x + 0.3) / def) + 1; stop = { val: 'left', pos: n * def, leader: null }; }
      let width = stop.pos - x;
      if (stop.val === 'right' || stop.val === 'center' || stop.val === 'decimal') {
        // texto até a próxima tabulação (ou fim do parágrafo)
        const r = document.createRange(); r.setStartAfter(span);
        const next = span.nextElementSibling && Array.from(p.querySelectorAll('.docx-tab-stop')).find((t) => span.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (next) r.setEndBefore(next); else r.setEndAfter(p.lastChild);
        let tw2 = r.getBoundingClientRect().width / PX;
        if (stop.val === 'decimal') { const t = r.toString(); const k = t.search(/[.,]\d/); if (k >= 0) { const r2 = document.createRange(); r2.setStart(r.startContainer, r.startOffset); try { r2.setEnd(...endAt(r, k)); tw2 = r2.getBoundingClientRect().width / PX; } catch { /* */ } } }
        width = stop.pos - x - (stop.val === 'center' ? tw2 / 2 : tw2);
      }
      width = Math.max(0.5, width);
      span.style.width = `${width * PX}px`;
      if (stop.leader && LEADER[stop.leader]) { span.textContent = LEADER[stop.leader].repeat(Math.ceil(width / 2.5) + 2); span.style.textAlign = 'right'; span.style.direction = 'rtl'; }
    }
  }
}
function endAt(range, k) {
  const w = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  let n = w.currentNode.nodeType === 3 ? w.currentNode : w.nextNode(), left = k;
  while (n) { if (range.intersectsNode(n)) { const start = n === range.startContainer ? range.startOffset : 0; const len = n.nodeValue.length - start; if (left <= len) return [n, start + left]; left -= len; } n = w.nextNode(); }
  throw new Error('fim');
}

// ---------- espaçamento e escala de caracteres ----------
// O docx-preview ignora <w:spacing> e <w:w> do run. Eles viram um estilo de
// caractere sintético (classe CSS) e são aplicados depois da renderização.
export async function markRuns(zip) {
  const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  for (const part of parts) {
    const text = await zip.file(part).async('string');
    if (!/<w:rPr>[\s\S]*?<w:(spacing|w) w:val/.test(text)) continue;
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) continue;
    let changed = false;
    for (const rPr of Array.from(doc.getElementsByTagNameNS(W, 'rPr'))) {
      if (!rPr.parentElement || rPr.parentElement.localName !== 'r') continue;
      const sp = kid(rPr, W, 'spacing'), sc = kid(rPr, W, 'w');
      const spv = sp ? parseInt(wattr(sp, 'val') || '0', 10) : 0, scv = sc ? parseInt(wattr(sc, 'val') || '100', 10) : 100;
      if ((!spv && scv === 100) || kid(rPr, W, 'rStyle')) continue;
      const st = doc.createElementNS(W, 'w:rStyle');
      st.setAttributeNS(W, 'w:val', `hfasp_${spv}_w${scv}`);
      rPr.insertBefore(st, rPr.firstChild);
      changed = true;
    }
    if (changed) zip.file(part, new XMLSerializer().serializeToString(doc));
  }
}
export function applyRuns(body) {
  for (const el of Array.from(body.querySelectorAll('[class*="hfasp_"]'))) {
    const m = /hfasp_(-?\d+)_w(\d+)/.exec(el.className); if (!m) continue;
    const sp = +m[1] / 20, sc = +m[2] / 100;
    let ls = sp * PX;
    if (sc !== 1) {
      const n = el.textContent.length || 1;
      ls += (el.getBoundingClientRect().width * (sc - 1)) / n;
      el.dataset.hfaScale = String(sc);
    }
    if (ls) el.style.letterSpacing = `${ls}px`;
  }
}
