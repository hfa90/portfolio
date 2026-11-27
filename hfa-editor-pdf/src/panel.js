// Painel lateral: propriedades e lista de elementos
import { $, $$, clamp, esc, icon } from './util.js';
import { S, PROPS, SWATCHES, TYPE, pageById, selection, selected, isSel, elType } from './state.js';
import { SLOTS } from './render.js';
import { updateNode, rotateAroundCenter, elLabel, elIcon } from './elements.js';
import { renderSel, select, toggleSel, deleteSel, reorderSel } from './select.js';
import { commit } from './history.js';

function ctxType() { const s = selection(); if (s) return s.els.length > 1 ? 'multi' : elType(s.els[0]); return S.tool; }

export function syncProps() {
  const t = ctxType(), s = selected(), props = (PROPS[t] || []).filter((p) => !(p === 'burn' && !s && t === 'redact'));
  const src = (s && s.el) || S.defs[t] || {};
  $$('#props [data-prop]').forEach((g) => { g.hidden = !props.includes(g.dataset.prop); });
  const multi = t === 'multi';
  $('#propsEmpty').hidden = props.length > 0;
  $('#propsEmpty').textContent = multi
    ? `${selection().els.length} elementos selecionados. Use a barra sobre a seleção para alinhar, duplicar ou excluir.`
    : 'Escolha uma ferramenta ou selecione um elemento para ajustar cor, espessura e fonte.';
  $('#propsType').textContent = props.length ? '· ' + (s && s.el.type === 'image' && s.el.sig ? 'Assinatura' : (TYPE[t] && TYPE[t].label) || '') : '';
  if (props.includes('color')) $('#pColor').value = src.color || '#111827';
  if (props.includes('fill')) {
    const solid = t === 'whiteout' || t === 'redact', on = solid || !!src.fill;
    $('#pFillOnWrap').hidden = solid; $('#pFillOn').checked = on;
    $('#pFill').value = src.fill || S.fillColor; $('#pFill').disabled = !on;
    $('#pFillLbl').textContent = solid ? 'Cor do bloco' : '';
  }
  if (props.includes('burn')) $('#pBurn').checked = !!src.burn;
  if (props.includes('width')) { $('#pWidth').value = src.width; $('#pWidthV').textContent = src.width + ' pt'; }
  if (props.includes('opacity')) { const v = Math.round((src.opacity ?? 1) * 100); $('#pOpacity').value = v; $('#pOpacityV').textContent = v + '%'; }
  if (props.includes('font')) {
    $('#pFont').value = src.font || 'Helvetica'; $('#pSize').value = Math.round((src.size || 14) * 10) / 10;
    $('#pBold').setAttribute('aria-pressed', String(!!src.bold)); $('#pItalic').setAttribute('aria-pressed', String(!!src.italic));
  }
  if (props.includes('align')) $$('#pAlign [data-align]').forEach((b) => b.setAttribute('aria-pressed', String((src.align || 'left') === b.dataset.align)));
  if (props.includes('rotate')) { $('#pRot').value = Math.round(src.rot || 0); $('#pRot').disabled = !s; }
}

function setProp(prop, val, final) {
  const t = ctxType(), s = selected(), d = S.defs[t];
  if (t === 'multi') return;
  if (prop === 'fillOn') { prop = 'fill'; val = val ? $('#pFill').value : null; $('#pFill').disabled = !val; }
  else if (prop === 'fill') { S.fillColor = val; if (t !== 'whiteout' && t !== 'redact') { $('#pFillOn').checked = true; $('#pFill').disabled = false; } }
  if (prop === 'rot') {
    if (!s) return;
    rotateAroundCenter(s.el, val); updateNode(s.page, s.el); renderSel(); if (final) commit(); return;
  }
  if (d && prop !== 'burn') d[prop] = val;
  if (prop === 'burn' && !s && d) d.burn = val;
  if (t === 'edittext' && prop !== 'fill') S.defs.text[prop] = val;
  if (s) {
    if (s.el[prop] === val && !final) return;
    s.el[prop] = val; updateNode(s.page, s.el); renderSel();
    if (prop === 'burn') { syncProps(); renderLayers(); }
    if (final) commit();
  }
}

export function bindProps() {
  const sw = $('#swatches');
  sw.innerHTML = SWATCHES.map((c) => `<button type="button" class="sw" data-c="${c}" style="background:${c}" title="${c}" aria-label="Cor ${c}"></button>`).join('');
  sw.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; $('#pColor').value = b.dataset.c; setProp('color', b.dataset.c, true); });
  $('#pColor').addEventListener('input', (e) => setProp('color', e.target.value, false));
  $('#pColor').addEventListener('change', (e) => setProp('color', e.target.value, true));
  $('#pFillOn').addEventListener('change', (e) => setProp('fillOn', e.target.checked, true));
  $('#pFill').addEventListener('input', (e) => setProp('fill', e.target.value, false));
  $('#pFill').addEventListener('change', (e) => setProp('fill', e.target.value, true));
  $('#pBurn').addEventListener('change', (e) => setProp('burn', e.target.checked, true));
  $('#pWidth').addEventListener('input', (e) => { $('#pWidthV').textContent = e.target.value + ' pt'; setProp('width', +e.target.value, false); });
  $('#pWidth').addEventListener('change', (e) => setProp('width', +e.target.value, true));
  $('#pOpacity').addEventListener('input', (e) => { $('#pOpacityV').textContent = e.target.value + '%'; setProp('opacity', e.target.value / 100, false); });
  $('#pOpacity').addEventListener('change', (e) => setProp('opacity', e.target.value / 100, true));
  $('#pFont').addEventListener('change', (e) => setProp('font', e.target.value, true));
  $('#pSize').addEventListener('change', (e) => { const v = clamp(+e.target.value || 12, 3, 400); e.target.value = v; setProp('size', v, true); });
  $('#pBold').addEventListener('click', (e) => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); setProp('bold', v, true); });
  $('#pItalic').addEventListener('click', (e) => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); setProp('italic', v, true); });
  $('#pAlign').addEventListener('click', (e) => {
    const b = e.target.closest('[data-align]'); if (!b) return;
    $$('#pAlign [data-align]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); setProp('align', b.dataset.align, true);
  });
  $('#pRot').addEventListener('change', (e) => { const v = ((+e.target.value || 0) % 360 + 360) % 360; e.target.value = Math.round(v); setProp('rot', v, true); });
  $$('[data-rotby]').forEach((b) => b.addEventListener('click', () => {
    const s = selected(); if (!s) return; setProp('rot', (s.el.rot || 0) + +b.dataset.rotby, true); syncProps();
  }));
}

// ---------- painel de elementos ----------
export function renderLayers() {
  const box = $('#layers'); const page = pageById(S.cur);
  if (!page) { box.replaceChildren(); return; }
  const idx = S.pages.indexOf(page);
  $('#layersTitle').textContent = `Elementos · pág. ${idx + 1}`;
  $('#clearPage').hidden = !page.els.length;
  if (!page.els.length) { box.innerHTML = '<p class="empty">Nenhum elemento nesta página ainda. Use a barra de ferramentas para adicionar texto, formas, imagens ou assinaturas.</p>'; return; }
  const n = page.els.length;
  box.innerHTML = '<ul>' + page.els.map((el, i) => ({ el, i })).reverse().map(({ el, i }) => {
    const on = isSel(el.id);
    return `<li class="layer${on ? ' on' : ''}" data-el="${esc(el.id)}"><button type="button" class="lname" data-la="sel" aria-pressed="${on}">${icon(elIcon(el))}<span>${esc(elLabel(el))}</span></button>`
      + `<button type="button" data-la="up" ${i === n - 1 ? 'disabled' : ''} title="Trazer para frente" aria-label="Trazer para frente">${icon('up')}</button>`
      + `<button type="button" data-la="down" ${i === 0 ? 'disabled' : ''} title="Enviar para trás" aria-label="Enviar para trás">${icon('down')}</button>`
      + `<button type="button" data-la="del" title="Excluir" aria-label="Excluir">${icon('trash')}</button></li>`;
  }).join('') + '</ul>';
}
export function bindLayers() {
  $('#layers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-la]'); const li = e.target.closest('[data-el]'); if (!b || !li) return;
    const page = pageById(S.cur); if (!page) return;
    const a = b.dataset.la, id = li.dataset.el;
    if (a === 'sel' && (e.shiftKey || e.ctrlKey || e.metaKey)) { toggleSel(page, id); return; }
    select(page.id, id);
    if (a === 'del') deleteSel(); else if (a === 'up') reorderSel(1); else if (a === 'down') reorderSel(-1);
    else {
      const r = SLOTS.get(page.id);
      if (r) { const nd = r.els.querySelector(`[data-node="${id}"]`); const tgt = nd && nd.tagName.toLowerCase() !== 'svg' ? nd : r.slot; tgt.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
  });
}

// ---------- painéis móveis (celular) ----------
export function closePanels() { $('#editor').classList.remove('show-pages', 'show-side'); $('#scrim').hidden = true; }
export function togglePanel(cls) {
  const ed = $('#editor'); const on = !ed.classList.contains(cls);
  closePanels(); if (on) { ed.classList.add(cls); $('#scrim').hidden = false; }
}
