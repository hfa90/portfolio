// Inventário Quallit — tela: etiquetas (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { URL_PUBLICA } from '../config.js';
import { MODELOS, montarFolhas } from '../etiquetas.js';
import { $, ativas, esc, state, store, titulo } from '../nucleo.js';
import { opts } from '../telas/maquinas.js';

/* =====================================================================
   ETIQUETAS (QR code + código de barras)
   ===================================================================== */
export function irEtiquetas(ids) {
  state.etqIds = ids && ids.length ? ids : null;
  if (location.hash === '#etiquetas') renderEtiquetas(); else location.hash = '#etiquetas';
}
export function baseIndex() {
  return URL_PUBLICA ? URL_PUBLICA.replace(/\/?$/, '/') : new URL('.', location.href).href;
}
export function renderEtiquetas() {
  const el = $('#view-etiquetas');
  const ids = state.etqIds;
  const lista = (ids ? ids.map((id) => state.maquinas.find((m) => m.id === id)).filter(Boolean) : ativas())
    .sort((a, b) => (a.ativo || a.hostname).localeCompare(b.ativo || b.hostname, 'pt-BR', { numeric: true }));
  let cfg = { modelo: 'a4_24', barras: true, setor: false, titulo: 'PATRIMÔNIO TI', pular: 0 };
  try { cfg = { ...cfg, ...JSON.parse(store.get('etq-cfg') || '{}') }; } catch { /* padrão */ }
  if (!MODELOS[cfg.modelo]) cfg.modelo = 'a4_24';
  const semPat = lista.filter((m) => !m.ativo).length;

  el.innerHTML = `
    <div class="view-head no-print">
      ${titulo('Etiquetas', `${lista.length} etiqueta(s)${ids ? ' selecionada(s)' : ' (todas as máquinas ativas)'}`, 'O QR code abre a ficha da máquina pela câmera do celular e é lido no inventário; o código de barras serve para leitores comuns.')}
      <div class="actions"><a class="btn" href="#maquinas">← Máquinas</a><button class="btn btn--primary" id="etq-imprimir" ${lista.length ? '' : 'disabled'}>Imprimir</button></div>
    </div>
    <div class="card etq-toolbar no-print">
      <label>Modelo de etiqueta<select id="etq-modelo">${opts(Object.entries(MODELOS).map(([k, v]) => [k, v.nome]), cfg.modelo)}</select></label>
      <label>Texto do topo<input id="etq-titulo" value="${esc(cfg.titulo)}" maxlength="26"></label>
      <label id="etq-pular-wrap">Começar na posição<input id="etq-pular" type="number" min="1" value="${cfg.pular + 1}"></label>
      <div class="checks">
        <label class="check"><input type="checkbox" id="etq-barras" ${cfg.barras ? 'checked' : ''}> Código de barras</label>
        <label class="check"><input type="checkbox" id="etq-setor" ${cfg.setor ? 'checked' : ''}> Mostrar setor</label>
      </div>
    </div>
    ${semPat ? `<p class="aviso-linha no-print">${semPat} máquina(s) sem patrimônio: a etiqueta usa o hostname no QR code e no código de barras.</p>` : ''}
    <p class="muted no-print" id="etq-info"></p>
    <div id="etq-area" class="etq-area"></div>
    <style id="etq-style"></style>`;

  const desenhar = () => {
    cfg = {
      modelo: $('#etq-modelo').value,
      titulo: $('#etq-titulo').value.trim(),
      pular: Math.max(0, (Number($('#etq-pular').value) || 1) - 1),
      barras: $('#etq-barras').checked,
      setor: $('#etq-setor').checked,
    };
    store.set('etq-cfg', JSON.stringify(cfg));
    const md = MODELOS[cfg.modelo];
    $('#etq-pular-wrap').hidden = md.colunas * md.linhas === 1;
    if (!window.qrcode) { setTimeout(desenhar, 300); return; }
    const r = montarFolhas(lista, cfg.modelo, baseIndex(), { ...cfg, pular: md.colunas * md.linhas === 1 ? 0 : cfg.pular });
    $('#etq-style').textContent = r.css;
    $('#etq-area').innerHTML = r.html;
    $('#etq-info').textContent = `${r.total} etiqueta(s) em ${r.paginas} ${md.pagina === 'A4' ? 'folha(s) A4' : 'etiqueta(s) do rolo'}. Na impressão, use escala 100% (“Tamanho real”) e sem margens.`;
  };
  ['etq-modelo', 'etq-titulo', 'etq-pular', 'etq-barras', 'etq-setor'].forEach((id) => ($('#' + id).oninput = desenhar));
  $('#etq-imprimir').onclick = () => window.print();
  desenhar();
}
