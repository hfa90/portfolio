// Inventário Quallit — tela: maquinas (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { recarregarMaquina } from '../dados.js';
import { confirmar } from '../dialogos.js';
import { $, $$, PROPRIEDADE, ALERTAS, CAMPOS_HIST, CAMPOS_HW, F_PADRAO, MQ, SIT, STATUS, TIPO, cdCod, cdNome, cdsAtivos, data, dataBR, dataHora, debounce, dot, ehAdmin, erroMsg, esc, garantiaFaixa, gb, idadeFaixa, menuMais, mostrarColCD, noCD, pill, ramFaixa, rel, sb, setores, situacao, soFamilia, soGrupo, soLabel, state, statusPill, store, tags, tipoDisco, titulo, toast, up } from '../nucleo.js';
import { criarXlsx } from '../planilha.js';
import { rerender } from '../rotas.js';
import { modalLinkInstalacao } from '../telas/coleta.js';
import { COND, EMP_COLS, imprimirTermo, modalDevolucao, modalEmprestimo } from '../telas/emprestimos.js';
import { irEtiquetas } from '../telas/etiquetas.js';
import { modalImportarColeta, modalImportarCompras } from '../telas/importacao.js';
import { ORDEM_GAR, PALETA, contar, fmtValorHist, reducao } from '../telas/painel.js';
import { modalSolicitacao, solicitacaoAberta } from '../telas/patrimonio.js';
import { MOTIVO, carregarPosses, historicoResponsaveis, imprimirTermoPosse, modalDevolucaoPosse, modalPosse } from './termos.js';

/* =====================================================================
   MÁQUINAS (lista)
   ===================================================================== */
export const COLS = [
  { k: 'sel', l: '<input type="checkbox" id="sel-todos" title="Selecionar todos os filtrados">', v: (m) => (state.sel.has(m.id) ? 0 : 1),
    c: (m) => `<input type="checkbox" class="sel" data-sel="${m.id}" ${state.sel.has(m.id) ? 'checked' : ''} aria-label="Selecionar ${esc(m.hostname)}">`, cls: 'td-sel' },
  { k: 'situacao', l: '', v: (m) => (m.ultimo_online ? -new Date(m.ultimo_online) : 0), c: (m) => dot(m) },
  { k: 'hostname', l: 'Hostname', v: (m) => m.hostname, c: (m) => `<span class="mono">${esc(m.hostname)}</span>`, cls: 'host' },
  { k: 'cd', l: 'CD', soCD: true, v: (m) => cdCod(m.cd_id), c: (m) => `<span class="pill pill--cd" title="${esc(cdNome(m.cd_id))}">${esc(cdCod(m.cd_id))}</span>` },
  { k: 'ativo', l: 'Patrimônio', v: (m) => m.ativo || '', c: (m) => (m.ativo ? `<span class="mono">${esc(m.ativo)}</span>` : '<span class="muted">—</span>') },
  { k: 'tipo', l: 'Tipo', v: (m) => m.tipo, c: (m) => esc(TIPO[m.tipo]) + (m.propriedade === 'alugado' ? ' ' + pill('Alugado', 'info') : '') },
  { k: 'modelo', l: 'Modelo', v: (m) => m.modelo || '', c: (m) => `${esc(m.modelo || '—')}<span class="sub">${esc(m.fabricante || '')}</span>` },
  { k: 'so', l: 'Sistema', v: (m) => soLabel(m), c: (m) => `${esc(soLabel(m))}<span class="sub">${esc(m.so_build ? 'build ' + m.so_build : '')}</span>` },
  { k: 'memoria_gb', l: 'RAM', v: (m) => Number(m.memoria_gb) || 0, c: (m) => gb(m.memoria_gb), cls: 'num' },
  { k: 'armazenamento_total_gb', l: 'Armazenamento', v: (m) => Number(m.armazenamento_total_gb) || 0, c: (m) => {
      const pct = m.livre_pct != null ? 100 - m.livre_pct : null;
      return `${gb(m.armazenamento_total_gb)} <span class="muted">${esc(tipoDisco(m) === 'Sem dado' ? '' : tipoDisco(m))}</span>${pct != null ? `<span class="meter" title="${m.livre_pct}% livre"><i class="${pct > 90 ? 'bad' : pct > 75 ? 'warn' : ''}" style="width:${pct}%"></i></span>` : ''}`;
    } },
  { k: 'usuario_logado', l: 'Usuário / setor', v: (m) => m.usuario_logado || '', c: (m) => `${esc((m.usuario_logado || '—').split('\\').pop())}<span class="sub">${esc(m.setor || '')}</span>` },
  { k: 'ultimo_online', l: 'Última coleta', v: (m) => (m.ultimo_online ? new Date(m.ultimo_online).getTime() : 0), c: (m) => `${rel(m.ultimo_online)}<span class="sub">${m.ultimo_online ? dataHora(m.ultimo_online) : ''}</span>` },
  { k: 'status', l: 'Status', v: (m) => STATUS[m.status], c: (m) => statusPill(m.status) },
  { k: 'alertas', l: 'Alertas', v: (m) => (m.alertas || []).length, c: (m) => tags(m) },
];

export const colsVisiveis = () => COLS.filter((c) => !c.soCD || mostrarColCD());
export function filtrar() {
  const f = state.f;
  const termos = up(f.q).split(/\s+/).filter(Boolean);
  return MQ().filter((m) => {
    if (f.status === '_ativos' ? m.status === 'descartado' : f.status && m.status !== f.status) return false;
    if (f.tipo && m.tipo !== f.tipo) return false;
    if (f.situacao && situacao(m) !== f.situacao) return false;
    if (f.so && soGrupo(m) !== f.so) return false;
    if (f.ram && ramFaixa(m) !== f.ram) return false;
    if (f.disco && tipoDisco(m) !== f.disco) return false;
    if (f.setor && (f.setor === '_vazio' ? m.setor : m.setor !== f.setor)) return false;
    if (f.idade && idadeFaixa(m) !== f.idade) return false;
    if (f.garantia && garantiaFaixa(m) !== f.garantia) return false;
    if (f.prop && (m.propriedade || 'proprio') !== f.prop) return false;
    if (f.alerta) {
      const a = m.alertas || [];
      if (f.alerta === '_grave' ? !a.some((x) => ALERTAS[x]?.grave) : !a.includes(f.alerta)) return false;
    }
    if (termos.length) {
      const txt = up([m.hostname, m.ativo, m.numero_serie, m.usuario_logado, m.ip, m.mac, m.modelo, m.fabricante,
        m.setor, m.localizacao, m.responsavel, m.cpu, m.observacoes].join(' '));
      if (!termos.every((t) => txt.includes(t))) return false;
    }
    return true;
  });
}
export function ordenar(lista) {
  const col = COLS.find((c) => c.k === state.sort.col) || COLS[1];
  const d = state.sort.dir;
  return lista.sort((a, b) => {
    const x = col.v(a), y = col.v(b);
    if (typeof x === 'number') return (x - y) * d;
    if (!x && y) return 1; if (x && !y) return -1;
    return String(x).localeCompare(String(y), 'pt-BR', { numeric: true }) * d;
  });
}

export function opts(pares, sel) {
  return pares.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
export function renderMaquinas() {
  const el = $('#view-maquinas');
  if (!state.maqMontada) {
    el.innerHTML = `
      <div class="view-head">
        ${titulo('Máquinas', '', 'Veja em tabela, cartões, quadro ou mosaico. Clique numa máquina para ver detalhes, editar e ver o histórico. Selecione várias pela caixinha para imprimir etiquetas. O link de registro de computadores e coletores fica em <b>Coleta</b>.')}
        <div class="actions">
          ${menuMais(`
            <button type="button" id="btn-etq">Etiquetas</button>
            <button type="button" id="btn-programa">Programas instalados <small>quem tem um programa</small></button>
            <button type="button" id="btn-coleta">Importar coleta <small>planilha do COLETAR.bat</small></button>
            <button type="button" id="btn-import">Importar compras <small>notas e garantias</small></button>`)}
          <button class="btn" id="btn-exportar" title="Planilha do Excel: o que está na tela ou o inventário completo">Exportar</button>
          <button class="btn btn--primary" id="btn-nova">+ Nova máquina</button>
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <div class="search"><input id="f-q" type="search" placeholder="Buscar hostname, patrimônio, série, usuário, IP, modelo…" autocomplete="off"></div>
          <select id="f-tipo"></select><select id="f-situacao"></select><select id="f-setor"></select>
          <button type="button" class="btn btn--ghost" id="btn-mais-filtros" aria-expanded="false">Mais filtros</button>
        </div>
        <div class="toolbar toolbar--extra" id="filtros-extra" hidden>
          <select id="f-status"></select><select id="f-prop"></select><select id="f-alerta"></select><select id="f-so"></select><select id="f-garantia"></select>
        </div>
        <div class="barra-modos"><div class="seg seg--modos" id="modos"></div><span id="modo-opts" class="modo-opts"></span><span class="count" id="count"></span></div>
        <div class="chips" id="chips-wrap" style="padding:0 12px 10px;align-items:center"><span id="chips" style="display:contents"></span></div>
        <div class="sel-bar" id="sel-bar" hidden></div>
        <div class="table-wrap"><table><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
        <div id="maq-alt" class="maq-alt" hidden></div>
      </div>`;
    $('#f-q').oninput = debounce((e) => { state.f.q = e.target.value; renderTabela(); }, 120);
    ['tipo', 'status', 'situacao', 'so', 'alerta', 'setor', 'garantia', 'prop'].forEach((k) => {
      $('#f-' + k).onchange = (e) => { state.f[k] = e.target.value; mostrarFiltrosExtra(); renderTabela(); };
    });
    $('#thead').onclick = (e) => {
      const th = e.target.closest('th'); if (!th) return;
      const k = th.dataset.col;
      if (k === 'sel') {
        if (e.target.id !== 'sel-todos') return;
        const lista = filtrar();
        if (e.target.checked) lista.forEach((m) => state.sel.add(m.id)); else lista.forEach((m) => state.sel.delete(m.id));
        return renderTabela();
      }
      state.sort = { col: k, dir: state.sort.col === k ? -state.sort.dir : 1 };
      renderTabela();
    };
    $('#tbody').onclick = (e) => {
      const cb = e.target.closest('[data-sel]');
      if (cb) { cb.checked ? state.sel.add(cb.dataset.sel) : state.sel.delete(cb.dataset.sel); return renderSelBar(); }
      if (e.target.closest('.td-sel')) return;
      const tr = e.target.closest('tr[data-id]'); if (tr) abrirMaquina(tr.dataset.id);
    };
    $('#modos').onclick = (e) => { const b = e.target.closest('[data-modo]'); if (!b) return; state.modo = b.dataset.modo; store.set('maq-modo', state.modo); renderTabela(); };
    $('#modo-opts').onchange = (e) => {
      const map = { 'opt-agrup': 'agrup', 'opt-metrica': 'metrica', 'opt-mosgrupo': 'mosGrupo' };
      if (!map[e.target.id]) return;
      state.modoOpts[map[e.target.id]] = e.target.value; state.modoOpts.destaque = '';
      store.set('maq-modo-opts', JSON.stringify(state.modoOpts)); renderTabela();
    };
    ligarModoAlt();
    $('#btn-etq').onclick = () => irEtiquetas(state.sel.size ? [...state.sel] : filtrar().map((m) => m.id));
    $('#btn-import').onclick = modalImportarCompras;
    $('#btn-coleta').onclick = modalImportarColeta;
    $('#btn-programa').onclick = modalBuscarPrograma;
    $('#btn-exportar').onclick = () => modalExportar([{ v: 'tela', rotulo: `Só o que está na tela (${filtrar().length} máquinas)`, sub: 'com os filtros e a busca atuais, todas as colunas do painel', gerar: exportarTela }]);
    $('#btn-mais-filtros').onclick = () => { state.maisFiltros = $('#filtros-extra').hidden; mostrarFiltrosExtra(); };
    $('#btn-nova').onclick = () => modalNovaMaquina();
    state.maqMontada = true;
  }
  syncToolbar();
  renderTabela();
  if (matchMedia('(min-width: 821px)').matches) $('#f-q').focus();
}
export function syncToolbar() {
  if (!state.maqMontada) return;
  const f = state.f;
  $('#f-q').value = f.q;
  $('#f-tipo').innerHTML = opts([['', 'Todos os tipos'], ...Object.entries(TIPO)], f.tipo);
  $('#f-status').innerHTML = opts([['_ativos', 'Status: ativos'], ['', 'Todos (inclui descartados)'], ...Object.entries(STATUS)], f.status);
  $('#f-situacao').innerHTML = opts([['', 'Qualquer data de coleta'], ...Object.entries(SIT)], f.situacao);
  const sos = contar(MQ(), soGrupo).map(([k]) => [k, k]);
  $('#f-so').innerHTML = opts([['', 'Todos os sistemas'], ...sos], f.so);
  $('#f-alerta').innerHTML = opts([['', 'Sem filtro de alerta'], ['_grave', 'Alertas importantes'], ...Object.entries(ALERTAS).map(([k, a]) => [k, a.l])], f.alerta);
  $('#f-garantia').innerHTML = opts([['', 'Qualquer garantia'], ...ORDEM_GAR.map((g) => [g, g])], f.garantia);
  $('#f-prop').innerHTML = opts([['', 'Próprios e alugados'], ['proprio', 'Só próprios'], ['alugado', 'Só alugados']], f.prop);
  $('#f-setor').innerHTML = opts([['', 'Todos os setores'], ['_vazio', 'Sem setor'], ...setores().map((s) => [s, s])], f.setor);
  mostrarFiltrosExtra();
}
// filtros menos usados ficam numa segunda linha: abre sozinha quando algum deles está em uso (ex.: vindo do Painel)
function mostrarFiltrosExtra() {
  const f = state.f;
  const ativos = ['status', 'prop', 'alerta', 'so', 'garantia'].filter((k) => f[k] !== F_PADRAO[k]).length;
  const aberto = !!(state.maisFiltros || ativos);
  $('#filtros-extra').hidden = !aberto;
  const b = $('#btn-mais-filtros');
  b.textContent = (aberto ? 'Menos filtros' : 'Mais filtros') + (ativos ? ` (${ativos})` : '');
  b.setAttribute('aria-expanded', aberto);
  b.classList.toggle('filtro-on', ativos > 0);
}
export function renderTabela() {
  if (!state.maqMontada || state.view !== 'maquinas') return;
  const lista = ordenar(filtrar());
  const cols = colsVisiveis();
  $('#thead').innerHTML = `<tr>${cols.map((c) => `<th data-col="${c.k}" class="${c.cls || ''}">${c.l}</th>`).join('')}</tr>`;
  $$('#view-maquinas th').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.col === state.sort.col);
    th.classList.toggle('asc', state.sort.dir === 1);
  });
  // chips para filtros vindos do painel que não têm select
  const chips = [];
  if (state.f.ram) chips.push(['ram', 'RAM', state.f.ram]);
  if (state.f.disco) chips.push(['disco', 'Disco', state.f.disco]);
  if (state.f.idade) chips.push(['idade', 'Idade', state.f.idade]);
  const algum = Object.keys(F_PADRAO).some((k) => state.f[k] !== F_PADRAO[k]);
  $('#chips').innerHTML = chips.map(([k, l, v]) => `<button class="chip" data-k="${k}">${l}: <b>${esc(v)}</b><span>×</span></button>`).join('')
    + (algum ? '<button class="btn btn--sm btn-limpar-on" id="limpar" title="Voltar todos os filtros e a busca ao padrão">✕ Limpar filtros</button>' : '');
  $$('#chips .chip').forEach((c) => (c.onclick = () => { state.f[c.dataset.k] = ''; renderTabela(); }));
  $('#limpar')?.addEventListener('click', () => { state.f = { ...F_PADRAO }; state.maisFiltros = false; syncToolbar(); renderTabela(); });
  $('#count').textContent = `${lista.length} de ${MQ().length} máquinas`;
  renderSelBar(lista);
  $('#modos').innerHTML = MODOS.map(([k, i, l]) => `<button class="${state.modo === k ? 'on' : ''}" data-modo="${k}" title="${l}"><span class="seg-ico">${i}</span><span class="seg-txt">${l}</span></button>`).join('');
  $('#modo-opts').innerHTML = opcoesModo();
  const tab = state.modo === 'tabela';
  $('#view-maquinas .table-wrap').hidden = !tab;
  $('#maq-alt').hidden = tab;
  if (!tab) {
    $('#maq-alt').className = 'maq-alt maq-alt--' + state.modo;
    $('#maq-alt').innerHTML = !lista.length ? '<div class="empty">Nenhuma máquina encontrada com esses filtros.</div>'
      : state.modo === 'cartoes' ? renderCartoes(lista) : state.modo === 'quadro' ? renderQuadro(lista) : renderMosaico(lista);
    return;
  }
  $('#tbody').innerHTML = lista.length
    ? lista.map((m) => `<tr data-id="${m.id}" class="${state.flash.has(m.id) ? 'flash' : ''}">${cols.map((c) => `<td class="${c.cls || ''}">${c.c(m)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" class="empty">Nenhuma máquina encontrada com esses filtros.</td></tr>`;
}

// ---- modos de visualização da lista de máquinas
export const MODOS = [['tabela', '☰', 'Tabela'], ['cartoes', '▦', 'Cartões'], ['quadro', '▥', 'Quadro'], ['mosaico', '▩', 'Mosaico']];
export const AGRUP = {
  status:   { l: 'Status', chave: (m) => m.status, rot: (k) => STATUS[k] || k, ordem: Object.keys(STATUS), editavel: 'status',
              cor: (k) => ({ em_uso: '#16a36a', estoque: '#3a5fd0', manutencao: '#e0a10b', emprestado: '#8e5bd6', descartado: '#94a3b8', extraviado: '#d6342a' }[k]) },
  situacao: { l: 'Contato', chave: (m) => situacao(m), rot: (k) => SIT[k], ordem: Object.keys(SIT),
              cor: (k) => ({ online: '#16a36a', recente: '#3a5fd0', ausente: '#e0a10b', offline: '#d6342a', nunca: '#94a3b8' }[k]) },
  alerta:   { l: 'Problema principal', chave: (m) => (m.alertas || []).find((a) => ALERTAS[a]?.grave) || (m.alertas || [])[0] || '',
              rot: (k) => (k ? ALERTAS[k]?.l || k : 'Sem alertas'), cor: (k) => (!k ? '#16a36a' : ALERTAS[k]?.grave ? '#d6342a' : '#e0a10b') },
  setor:    { l: 'Setor', chave: (m) => m.setor || '', rot: (k) => k || 'Sem setor', editavel: 'setor' },
  so:       { l: 'Sistema', chave: soGrupo, rot: (k) => k, cor: (k) => (/Windows 11/.test(k) ? '#16a36a' : /Windows (10|8|7)/.test(k) ? '#d6342a' : '#94a3b8') },
  tipo:     { l: 'Tipo', chave: (m) => m.tipo, rot: (k) => TIPO[k] || k },
  cd:       { l: 'CD', chave: (m) => m.cd_id, rot: (k) => `${cdCod(k)} · ${cdNome(k)}`, editavel: 'cd_id', soAdmin: true },
};
export const METRICA_MOS = {
  contato:  { l: 'Última coleta', v: (m) => situacao(m), leg: [['online', SIT.online, '#16a36a'], ['recente', SIT.recente, '#3a5fd0'], ['ausente', SIT.ausente, '#e0a10b'], ['offline', SIT.offline, '#d6342a'], ['nunca', SIT.nunca, '#94a3b8']] },
  alertas:  { l: 'Alertas', v: (m) => ((m.alertas || []).some((a) => ALERTAS[a]?.grave) ? 'grave' : (m.alertas || []).length ? 'leve' : 'ok'), leg: [['ok', 'Sem alertas', '#16a36a'], ['leve', 'Só alertas leves', '#e0a10b'], ['grave', 'Alerta importante', '#d6342a']] },
  disco:    { l: 'Uso do disco', v: (m) => { if (m.livre_pct == null) return 'nd'; const u = 100 - m.livre_pct; return u > 90 ? 'critico' : u > 75 ? 'alto' : u > 50 ? 'medio' : 'baixo'; },
              leg: [['baixo', 'Até 50%', '#16a36a'], ['medio', '50–75%', '#1c9ba9'], ['alto', '75–90%', '#e0a10b'], ['critico', 'Acima de 90%', '#d6342a'], ['nd', 'Sem dado', '#94a3b8']] },
  ram:      { l: 'Memória', v: ramFaixa, leg: [['4 GB ou menos', '4 GB ou menos', '#d6342a'], ['8 GB', '8 GB', '#e0a10b'], ['16 GB', '16 GB', '#16a36a'], ['32 GB ou mais', '32 GB ou mais', '#0f6f7a'], ['Sem dado', 'Sem dado', '#94a3b8']] },
  so:       { l: 'Sistema', v: (m) => (/Windows 11/.test(soFamilia(m)) ? 'w11' : /Windows (10|8|7)/.test(soFamilia(m)) ? 'w10' : m.so_nome ? 'outro' : 'nd'),
              leg: [['w11', 'Windows 11', '#16a36a'], ['w10', 'Windows 10 ou anterior', '#d6342a'], ['outro', 'Outro', '#3a5fd0'], ['nd', 'Sem dado', '#94a3b8']] },
  idade:    { l: 'Idade', v: idadeFaixa, leg: [['0 a 2 anos', '0 a 2 anos', '#16a36a'], ['3 a 4 anos', '3 a 4 anos', '#e0a10b'], ['5 anos ou mais', '5 anos ou mais', '#d6342a'], ['Sem data de compra', 'Sem data', '#94a3b8']] },
  garantia: { l: 'Garantia', v: garantiaFaixa, leg: [['Vigente', 'Vigente', '#16a36a'], ['Vence em 90 dias', 'Vence em 90 dias', '#3a5fd0'], ['Vence em 30 dias', 'Vence em 30 dias', '#e0a10b'], ['Vencida', 'Vencida', '#d6342a'], ['Sem informação', 'Sem informação', '#94a3b8']] },
};
export const icoTipo = (t) => (t === 'notebook' ? '💻' : t === 'coletor' ? '📟' : t === 'servidor' ? '🗄️' : '🖥️');
// resumo da bateria do coletor: "85% · boa · capacidade 92% · 310 ciclos"
export const SAUDE_BAT = { boa: 'boa', desconhecida: 'desconhecida', superaquecida: 'superaquecida', defeito: 'com defeito', sobretensao: 'sobretensão', falha: 'com falha', fria: 'fria demais' };
export function bateriaTxt(m) {
  const b = m.bateria || {};
  return [b.nivel != null && b.nivel + '%', b.saude && (SAUDE_BAT[b.saude] || b.saude), b.capacidade_pct != null && 'capacidade ' + b.capacidade_pct + '%', b.ciclos != null && b.ciclos + ' ciclos'].filter(Boolean).join(' · ');
}

export function opcoesModo() {
  const o = state.modoOpts;
  const gruposVis = Object.entries(AGRUP).filter(([, g]) => !g.soAdmin || (ehAdmin() && state.cds.length > 1));
  if (state.modo === 'quadro') return `<label class="opt-modo">Colunas por <select id="opt-agrup">${opts(gruposVis.map(([k, g]) => [k, g.l]), o.agrup)}</select></label>
    ${AGRUP[o.agrup]?.editavel && (o.agrup !== 'cd' || ehAdmin()) ? '<span class="muted" style="font-size:12.5px">↔ arraste os cartões para mudar</span>' : ''}`;
  if (state.modo === 'mosaico') return `<label class="opt-modo">Cor por <select id="opt-metrica">${opts(Object.entries(METRICA_MOS).map(([k, x]) => [k, x.l]), o.metrica)}</select></label>
    <label class="opt-modo">Agrupar <select id="opt-mosgrupo">${opts([['', 'Sem grupos'], ...gruposVis.filter(([k]) => ['setor', 'tipo', 'cd', 'status'].includes(k)).map(([k, g]) => [k, g.l])], o.mosGrupo)}</select></label>`;
  return '';
}

export function cartaoMaq(m, compacto = false) {
  const usado = m.livre_pct != null ? Math.round(100 - m.livre_pct) : null;
  const ag = AGRUP[state.modoOpts.agrup];
  const arrastavel = compacto && ag?.editavel && (state.modoOpts.agrup !== 'cd' || ehAdmin()) && !m.emprestimo_atual;
  return `<div class="mcard ${compacto ? 'mcard--c' : ''} ${state.sel.has(m.id) ? 'sel' : ''} ${state.flash.has(m.id) ? 'flash' : ''}" data-id="${m.id}" ${arrastavel ? 'draggable="true"' : ''} tabindex="0">
    <div class="mc-topo">${compacto ? '' : `<input type="checkbox" class="sel" data-sel="${m.id}" ${state.sel.has(m.id) ? 'checked' : ''} aria-label="Selecionar">`}
      ${dot(m)}<span class="mc-host mono">${esc(m.hostname)}</span>${mostrarColCD() && state.modoOpts.agrup !== 'cd' ? `<span class="pill pill--cd">${esc(cdCod(m.cd_id))}</span>` : ''}<span class="mc-tipo" title="${esc(TIPO[m.tipo])}">${icoTipo(m.tipo)}</span></div>
    <div class="mc-mod">${esc(m.modelo || 'Modelo não informado')}${m.ativo ? ` · <span class="mono">${esc(m.ativo)}</span>` : ''}</div>
    ${compacto ? '' : `<div class="mc-specs">
      <span class="spec-chip"><small>RAM</small><b>${gb(m.memoria_gb)}</b></span>
      <span class="spec-chip"><small>${esc(['Sem dado', 'Não identificado'].includes(tipoDisco(m)) ? 'Disco' : tipoDisco(m))}</small><b>${gb(m.armazenamento_total_gb)}</b>${usado != null ? `<span class="meter meter--b"><i class="${usado > 90 ? 'bad' : usado > 75 ? 'warn' : ''}" style="width:${usado}%"></i></span>` : ''}</span>
      <span class="spec-chip"><small>Sistema</small><b>${esc(soFamilia(m).replace('Windows ', 'Win ') + (m.so_display_version ? ' ' + m.so_display_version : ''))}</b></span>
    </div>`}
    <div class="mc-pe"><span class="muted">${rel(m.ultimo_online)}${m.usuario_logado ? ' · ' + esc(m.usuario_logado.split('\\').pop()) : ''}</span>${compacto ? '' : statusPill(m.status)}</div>
    ${(m.alertas || []).length ? `<div class="mc-al">${tags(m, compacto ? 1 : 3)}</div>` : ''}
  </div>`;
}

export function renderCartoes(lista) {
  const lim = state.limiteCartoes || 240;
  return `<div class="mgrid">${lista.slice(0, lim).map((m) => cartaoMaq(m)).join('')}</div>
    ${lista.length > lim ? `<div class="mais-cartoes"><button class="btn" id="mais-cartoes">Mostrar mais ${Math.min(240, lista.length - lim)} de ${lista.length - lim}</button></div>` : ''}`;
}

export function renderQuadro(lista) {
  const ag = AGRUP[state.modoOpts.agrup] || AGRUP.status;
  const grupos = new Map();
  for (const m of lista) { const k = ag.chave(m); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(m); }
  let chaves = [...grupos.keys()];
  const editavel = ag.editavel && (state.modoOpts.agrup !== 'cd' || ehAdmin());
  if (editavel) {
    // colunas vazias também viram destino para arrastar
    if (state.modoOpts.agrup === 'status') chaves = Object.keys(STATUS).filter((k) => k !== 'descartado' || grupos.has(k));
    if (state.modoOpts.agrup === 'setor') chaves = [...new Set(['', ...setores(), ...chaves])];
    if (state.modoOpts.agrup === 'cd') chaves = [...new Set([...state.cds.filter((c) => c.ativo).map((c) => c.id), ...chaves])];
  }
  chaves.sort((a, b) => (ag.ordem ? ag.ordem.indexOf(a) - ag.ordem.indexOf(b) : (grupos.get(b)?.length || 0) - (grupos.get(a)?.length || 0)));
  const coresLivres = PALETA;
  return `<div class="quadro" data-agrup="${state.modoOpts.agrup}">${chaves.map((k, i) => {
    const ms = grupos.get(k) || [];
    const cor = (ag.cor && ag.cor(k)) || coresLivres[i % coresLivres.length];
    const bloqueada = editavel && state.modoOpts.agrup === 'status' && k === 'emprestado';
    return `<section class="coluna ${bloqueada ? 'bloq' : ''}" data-col-valor="${esc(k)}" ${editavel && !bloqueada ? 'data-alvo' : ''} style="--cor:${cor}">
      <header><span class="col-ponto"></span><strong>${esc(ag.rot(k))}</strong><span class="col-n">${ms.length}</span></header>
      <div class="col-cartoes">${ms.slice(0, 80).map((m) => cartaoMaq(m, true)).join('')}${ms.length > 80 ? `<div class="muted" style="text-align:center;font-size:12.5px;padding:6px">+ ${ms.length - 80} — use os filtros</div>` : ''}
      ${!ms.length ? `<div class="col-vazia">${editavel && !bloqueada ? 'Solte aqui' : 'Vazio'}</div>` : ''}</div>
    </section>`;
  }).join('')}</div>`;
}

export function renderMosaico(lista) {
  const mt = METRICA_MOS[state.modoOpts.metrica] || METRICA_MOS.contato;
  const corDe = Object.fromEntries(mt.leg.map(([k, , c]) => [k, c]));
  const cont = contar(lista, mt.v);
  const destaque = state.modoOpts.destaque;
  const grupoK = state.modoOpts.mosGrupo;
  const ag = grupoK ? AGRUP[grupoK] : null;
  const blocos = new Map();
  for (const m of lista) { const g = ag ? ag.chave(m) : ''; if (!blocos.has(g)) blocos.set(g, []); blocos.get(g).push(m); }
  const ordem = [...blocos.keys()].sort((a, b) => (ag?.ordem ? ag.ordem.indexOf(a) - ag.ordem.indexOf(b) : blocos.get(b).length - blocos.get(a).length));
  const tile = (m) => { const v = mt.v(m); return `<button class="tile ${destaque && destaque !== v ? 'apagado' : ''}" style="background:${corDe[v] || '#94a3b8'}" data-id="${m.id}" data-v="${esc(v)}" aria-label="${esc(m.hostname)}"></button>`; };
  return `<div class="mos-legenda">${mt.leg.filter(([k]) => cont.some(([c]) => c === k)).map(([k, l, c]) => { const n = (cont.find(([x]) => x === k) || [, 0])[1];
      return `<button class="mleg ${destaque === k ? 'on' : ''} ${destaque && destaque !== k ? 'off' : ''}" data-dest="${esc(k)}"><i style="background:${c}"></i>${esc(l)} <b>${n}</b><small>${Math.round((100 * n) / (lista.length || 1))}%</small></button>`; }).join('')}
      ${destaque ? '<button class="btn btn--ghost btn--sm" data-dest="">Mostrar todas</button>' : ''}</div>
    ${ordem.map((g) => `<div class="mos-bloco">${ag ? `<h4>${esc(ag.rot(g))} <span class="muted">${blocos.get(g).length}</span></h4>` : ''}<div class="mosaico">${blocos.get(g).map(tile).join('')}</div></div>`).join('')}
    <div class="mos-dica" id="mos-dica" hidden></div>`;
}

export function ligarModoAlt() {
  const alt = $('#maq-alt');
  alt.onclick = (e) => {
    const cb = e.target.closest('[data-sel]');
    if (cb) { e.stopPropagation(); cb.checked ? state.sel.add(cb.dataset.sel) : state.sel.delete(cb.dataset.sel); cb.closest('.mcard')?.classList.toggle('sel', cb.checked); return renderSelBar(); }
    const leg = e.target.closest('[data-dest]');
    if (leg) { state.modoOpts.destaque = state.modoOpts.destaque === leg.dataset.dest ? '' : leg.dataset.dest; return renderTabela(); }
    if (e.target.id === 'mais-cartoes') { state.limiteCartoes = (state.limiteCartoes || 240) + 240; return renderTabela(); }
    const c = e.target.closest('[data-id]'); if (c) abrirMaquina(c.dataset.id);
  };
  alt.onkeydown = (e) => { if (e.key === 'Enter' && e.target.dataset?.id) abrirMaquina(e.target.dataset.id); };
  // dica flutuante do mosaico
  alt.onmouseover = (e) => {
    const t = e.target.closest('.tile'); const d = $('#mos-dica');
    if (!t || !d) { if (d) d.hidden = true; return; }
    const m = state.maquinas.find((x) => x.id === t.dataset.id); if (!m) return;
    const mt = METRICA_MOS[state.modoOpts.metrica];
    const rot = mt.leg.find(([k]) => k === t.dataset.v)?.[1] || t.dataset.v;
    d.innerHTML = `<strong class="mono">${esc(m.hostname)}</strong><span>${esc(m.ativo || 'sem patrimônio')} · ${esc(TIPO[m.tipo])} ${esc(m.modelo || '')}</span><span>${esc(mt.l)}: <b>${esc(rot)}</b></span><span class="muted">${esc(m.setor || 'sem setor')} · ${rel(m.ultimo_online)}</span>`;
    const r = t.getBoundingClientRect(), base = alt.getBoundingClientRect();
    d.style.left = Math.min(r.left - base.left, base.width - 240) + 'px'; d.style.top = (r.bottom - base.top + 8) + 'px'; d.hidden = false;
  };
  alt.onmouseleave = () => { const d = $('#mos-dica'); if (d) d.hidden = true; };
  // arrastar e soltar no quadro
  alt.ondragstart = (e) => { const c = e.target.closest('.mcard[draggable]'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastando'); };
  alt.ondragend = (e) => { e.target.closest?.('.mcard')?.classList.remove('arrastando'); $$('.coluna.sobre', alt).forEach((x) => x.classList.remove('sobre')); };
  alt.ondragover = (e) => { const col = e.target.closest('.coluna[data-alvo]'); if (!col) return; e.preventDefault(); $$('.coluna.sobre', alt).forEach((x) => x !== col && x.classList.remove('sobre')); col.classList.add('sobre'); };
  alt.ondrop = async (e) => {
    const col = e.target.closest('.coluna[data-alvo]'); if (!col) return;
    e.preventDefault(); col.classList.remove('sobre');
    const id = e.dataTransfer.getData('text/plain');
    const m = state.maquinas.find((x) => x.id === id); if (!m) return;
    const ag = AGRUP[state.modoOpts.agrup];
    const campo = ag.editavel; const novo = col.dataset.colValor || null; const antigo = m[campo] ?? null;
    if ((antigo || '') === (novo || '')) return;
    const { error } = await sb.from('maquinas').update({ [campo]: novo }).eq('id', id);
    if (error) return toast(erroMsg(error), true);
    await recarregarMaquina(id); renderTabela();
    toastAcao(`${m.hostname} → ${ag.rot(novo || '')}`, 'Desfazer', async () => {
      const r = await sb.from('maquinas').update({ [campo]: antigo }).eq('id', id);
      if (r.error) return toast(erroMsg(r.error), true);
      await recarregarMaquina(id); renderTabela();
    });
  };
}
export function toastAcao(msg, rotulo, fn) {
  const el = document.createElement('div');
  el.className = 'toast toast--acao';
  el.innerHTML = `<span>${esc(msg)}</span><button>${esc(rotulo)}</button>`;
  el.querySelector('button').onclick = () => { el.remove(); fn(); };
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 7000);
}

export function renderSelBar(lista = filtrar()) {
  const bar = $('#sel-bar');
  if (!bar) return;
  // remove da seleção o que não existe mais
  for (const id of state.sel) if (!state.maquinas.some((m) => m.id === id)) state.sel.delete(id);
  const n = state.sel.size;
  const todos = $('#sel-todos');
  if (todos) {
    const vis = lista.filter((m) => state.sel.has(m.id)).length;
    todos.checked = lista.length > 0 && vis === lista.length;
    todos.indeterminate = vis > 0 && vis < lista.length;
  }
  bar.hidden = !n;
  $('#btn-etq').textContent = n ? `Etiquetas (${n})` : 'Etiquetas';
  if (!n) return;
  bar.innerHTML = `<strong>${n} selecionada${n > 1 ? 's' : ''}</strong>
    <button class="btn btn--sm btn--primary" id="sel-etq">Imprimir etiquetas</button>
    <button class="btn btn--sm" id="sel-prop">Próprio / alugado</button>
    <button class="btn btn--sm" id="sel-limpar">Limpar seleção</button>`;
  $('#sel-prop').onclick = () => modalPropriedade([...state.sel]);
  $('#sel-etq').onclick = () => irEtiquetas([...state.sel]);
  $('#sel-limpar').onclick = () => { state.sel.clear(); renderTabela(); };
}

export function baixarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// linhas[0] = cabeçalho → planilha de uma aba (colunas com largura pelo conteúdo)
export function planilhaSimples(nomeAba, linhas) {
  const [cab, ...corpo] = linhas;
  const colunas = cab.map((t, i) => ({ t, w: Math.min(42, Math.max(9, String(t).length + 2, ...corpo.slice(0, 200).map((l) => String(l[i] ?? '').length + 1))) }));
  return criarXlsx([{ nome: nomeAba, colunas, linhas: corpo.map((l) => l.map((v) => (v === undefined ? '' : v))) }]);
}
export const hojeISO = () => new Date().toISOString().slice(0, 10);
export function exportarTela() {
  const cab = ['CD', 'Hostname', 'Patrimônio', 'Tipo', 'Status', 'Fabricante', 'Modelo', 'Nº série', 'Processador', 'RAM (GB)', 'Slots RAM',
    'Armazenamento (GB)', 'Livre (GB)', 'Tipo disco', 'Sistema', 'Versão', 'Build', 'Arquitetura', 'IP', 'MAC', 'Domínio', 'Usuário',
    'Setor', 'Localização', 'Responsável', 'Última coleta', 'Situação', 'Alertas', 'Observações',
    'Data de compra', 'Fornecedor', 'Nota fiscal', 'Valor', 'Fim da garantia', 'Situação garantia', 'Emprestado para', 'Devolução prevista', 'Bateria (coletor)', 'Propriedade', 'Locadora', 'Contrato', 'Fim do aluguel'];
  const linhas = ordenar(filtrar()).map((m) => [cdNome(m.cd_id), m.hostname, m.ativo, TIPO[m.tipo], STATUS[m.status], m.fabricante, m.modelo, m.numero_serie,
    m.cpu, numXl(m.memoria_gb), numXl(m.memoria_slots_total), numXl(m.armazenamento_total_gb), numXl(m.armazenamento_livre_gb), tipoDisco(m), m.so_nome,
    m.so_display_version, m.so_build, m.so_arquitetura, m.ip, m.mac, m.dominio, m.usuario_logado, m.setor, m.localizacao,
    m.responsavel, dataHora(m.ultimo_online), SIT[situacao(m)], (m.alertas || []).map((a) => ALERTAS[a]?.l || a).join(', '), m.observacoes,
    dataBR(m.data_compra), m.fornecedor, m.nota_fiscal, numXl(m.valor_compra), dataBR(m.garantia_fim), garantiaFaixa(m),
    m.emprestimo_atual?.colaborador, m.emprestimo_atual?.previsto_devolucao ? dataHora(m.emprestimo_atual.previsto_devolucao) : '', m.tipo === 'coletor' ? bateriaTxt(m) : '',
    PROPRIEDADE[m.propriedade || 'proprio'], m.locadora, m.contrato, dataBR(m.aluguel_fim)]);
  return { blob: planilhaSimples('Máquinas', [cab, ...linhas]), nome: `maquinas-filtradas-${hojeISO()}.xlsx`, total: linhas.length };
}

/* ---- Baixar inventário (.xlsx no formato do Invent_local)
   Admin: um CD ou todos (uma aba "Todos os CDs" + uma aba por CD). Field: só o próprio CD.
   A planilha pode ser reimportada em Máquinas → Importar coleta (coluna DADOS oculta). */
export const COLS_INV = [
  { t: 'CD', w: 10 }, { t: 'HOSTNAME', w: 18 }, { t: 'PATRIMONIO', w: 13 }, { t: 'SETOR', w: 16 }, { t: 'LOCALIZACAO', w: 14 },
  { t: 'RESPONSAVEL', w: 16 }, { t: 'TIPO', w: 10 }, { t: 'STATUS', w: 12 }, { t: 'FABRICANTE', w: 13 }, { t: 'MODELO', w: 22 },
  { t: 'NUMERO DE SERIE', w: 22 }, { t: 'SISTEMA OPERACIONAL', w: 34 }, { t: 'VERSAO', w: 8 }, { t: 'BUILD', w: 12 },
  { t: 'PROCESSADOR', w: 34 }, { t: 'NUCLEOS', w: 9 }, { t: 'RAM (GB)', w: 9 }, { t: 'MODULOS DE RAM', w: 30 },
  { t: 'ARMAZENAMENTO (GB)', w: 12 }, { t: 'LIVRE (GB)', w: 10 }, { t: 'DISCOS', w: 32 }, { t: 'IP', w: 14 }, { t: 'MAC', w: 18 },
  { t: 'DOMINIO', w: 14 }, { t: 'USUARIO', w: 22 }, { t: 'WINDOWS INSTALADO EM', w: 12 }, { t: 'ULTIMA COLETA', w: 16 },
  { t: 'BITLOCKER', w: 13 }, { t: 'ANTIVIRUS', w: 30 }, { t: 'ULTIMA ATUALIZACAO DO WINDOWS', w: 14 }, { t: 'PROGRAMAS INSTALADOS', w: 11 },
  { t: 'BATERIA (coletor)', w: 30 }, { t: 'OBSERVACOES', w: 30 }, { t: 'DADOS (nao editar)', w: 10, oculta: true },
];
export const segCols = (m) => {
  const s = m.seguranca || {};
  if (!Object.keys(s).length) return ['', '', '', numXl(m.programas_qtd)];
  return [BL_TXT[s.bitlocker] ? s.bitlocker : '', (s.antivirus || []).map((a) => `${a.nome}${!a.ativo ? ' (desligado)' : !a.atualizado ? ' (desatualizado)' : ''}`).join(' / '),
    s.ultima_atualizacao?.data ? data(s.ultima_atualizacao.data) : '', numXl(m.programas_qtd)];
};
export const numXl = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const numBR = (v) => String(v ?? '').replace('.', ',');
export function linhaInventario(m) {
  const mods = (m.memoria_modulos || []).filter(Boolean).map((x) => `${numBR(x.tamanho_gb)} GB ${x.tipo || ''} ${x.velocidade ? x.velocidade + ' MHz' : ''}`.replace(/\s+/g, ' ').trim()).join(' + ');
  const dsk = (m.discos || []).filter(Boolean).map((x) => `${x.tipo || ''} ${x.tamanho_gb != null ? x.tamanho_gb + ' GB' : ''} (${x.modelo || ''})`.replace(/\s+/g, ' ').replace(' ()', '').trim()).join(' / ');
  const chaves = ['hostname', 'tipo', 'ativo', 'fabricante', 'modelo', 'numero_serie', 'cpu', 'cpu_nucleos', 'memoria_gb', 'memoria_slots_total',
    'memoria_modulos', 'armazenamento_total_gb', 'armazenamento_livre_gb', 'discos', 'volumes', 'so_nome', 'so_versao', 'so_build',
    'so_display_version', 'so_arquitetura', 'so_instalado_em', 'ultimo_boot', 'ip', 'mac', 'dominio', 'usuario_logado', 'setor', 'localizacao', 'responsavel', 'bateria', 'seguranca'];
  const vazio = (v) => v == null || v === '' || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  const dados = Object.fromEntries(chaves.filter((k) => !vazio(m[k])).map((k) => [k, m[k]]));
  if (m.ultimo_online) dados.coletado_em = m.ultimo_online;
  let json = JSON.stringify(dados);
  if (json.length > 32000) { delete dados.volumes; delete dados.memoria_modulos; json = JSON.stringify(dados); } // limite de uma célula do Excel
  return [cdCod(m.cd_id), m.hostname, m.ativo, m.setor, m.localizacao, m.responsavel, m.tipo, STATUS[m.status] || m.status, m.fabricante, m.modelo,
    m.numero_serie, m.so_nome, m.so_display_version, m.so_build, m.cpu, numXl(m.cpu_nucleos), numXl(m.memoria_gb), mods,
    numXl(m.armazenamento_total_gb), numXl(m.armazenamento_livre_gb), dsk, m.ip, m.mac, m.dominio, m.usuario_logado,
    m.so_instalado_em ? data(m.so_instalado_em) : '', m.ultimo_online ? dataHora(m.ultimo_online) : '', ...segCols(m), m.tipo === 'coletor' ? bateriaTxt(m) : '', m.observacoes, json.length > 32000 ? '' : json];
}
export const ordemInv = (a, b) => cdCod(a.cd_id).localeCompare(cdCod(b.cd_id), 'pt-BR') || String(a.hostname || '').localeCompare(String(b.hostname || ''), 'pt-BR');
export function gerarInventarioXlsx(cdId, descartados) {
  const meuCD = ehAdmin() ? null : state.perfil?.cd_id;
  if (!ehAdmin() && !meuCD) throw new Error('seu usuário não está vinculado a nenhum CD');
  const alvo = meuCD || cdId;   // Field: sempre o próprio CD, mesmo que peça outro
  const base = state.maquinas.filter((m) => (descartados || m.status !== 'descartado') && (!alvo || m.cd_id === alvo)).sort(ordemInv);
  const aba = (nome, lista) => ({ nome, colunas: COLS_INV, linhas: lista.map(linhaInventario) });
  const hoje = new Date().toISOString().slice(0, 10);
  if (alvo) {
    const cod = cdCod(alvo);
    return { blob: criarXlsx([aba(`${cod} - ${cdNome(alvo)}`, base)]), nome: `inventario-${cod.replace(/\W+/g, '-')}-${hoje}.xlsx`, total: base.length };
  }
  // uma aba por CD (CDs inativos sem máquinas ficam de fora)
  const porCD = state.cds.slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR'))
    .map((c) => ({ c, lista: base.filter((m) => m.cd_id === c.id) }))
    .filter(({ c, lista }) => lista.length || c.ativo)
    .map(({ c, lista }) => aba(`${c.codigo} - ${c.nome}`, lista));
  return { blob: criarXlsx([aba('Todos os CDs', base), ...porCD]), nome: `inventario-todos-os-CDs-${hoje}.xlsx`, total: base.length };
}
// Exportar (sempre Excel .xlsx). extras: opções da tela atual, ex. [{ v, rotulo, sub, gerar: () => ({ blob, nome, total }) }]
export function modalExportar(extras = []) {
  const adm = ehAdmin();
  const meu = state.perfil?.cd_id;
  const cdIni = state.cdAtual || cdsAtivos()[0]?.id || state.cds[0]?.id || '';
  const qtd = (cd, desc) => state.maquinas.filter((m) => (desc || m.status !== 'descartado') && (!cd || m.cd_id === cd)).length;
  const marcado = extras.length ? extras[0].v : adm && !state.cdAtual && state.cds.length > 1 ? 'todos' : 'cd';
  const radio = (v, rotulo, sub = '') => `<label class="check full exp-op"><input type="radio" name="escopo" value="${v}" ${v === marcado ? 'checked' : ''}> <span><b>${rotulo}</b>${sub ? `<small class="muted" style="display:block">${sub}</small>` : ''}</span></label>`;
  modal(`
    <div class="modal-head"><h2>Exportar para o Excel</h2>
      <p class="muted" style="margin:4px 0 0">Planilha .xlsx. O inventário completo sai no formato do Invent_local e pode ser reimportado em <i>Importar coleta</i>.</p></div>
    <form class="modal-body" id="inv-form">
      ${extras.map((x) => radio(x.v, x.rotulo, x.sub)).join('')}
      ${radio('cd', adm ? 'Inventário completo de um CD' : `Inventário completo do ${esc(cdCod(meu))}`, 'todas as máquinas do CD, sem os filtros da tela')}
      ${adm ? `<label class="full" id="inv-cd-wrap" style="margin-left:26px">CD<select name="cd_id">${opts(state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}${c.ativo ? '' : ' (inativo)'}`]), cdIni)}</select></label>` : ''}
      ${adm && state.cds.length > 1 ? radio('todos', 'Inventário completo de todos os CDs', 'uma aba com tudo + uma aba por CD') : ''}
      <label class="check full" id="inv-desc-wrap"><input type="checkbox" name="descartados"> Incluir máquinas descartadas</label>
      ${state.cacheEm ? `<p class="muted full">Sem internet: a planilha usa a cópia salva em ${dataHora(state.cacheEm)}.</p>` : ''}
      <p class="muted full" id="inv-resumo"></p>
    </form>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="inv-ok">Baixar .xlsx</button></div>`, (dlg) => {
    const f = $('#inv-form', dlg);
    const ler = () => {
      const esc0 = [...f.querySelectorAll('[name=escopo]')].find((r) => r.checked)?.value || 'cd';
      return { esc0, cd: esc0 === 'todos' ? '' : adm ? f.cd_id?.value : meu, desc: f.descartados.checked };
    };
    const atualizar = () => {
      const { esc0, cd, desc } = ler();
      const extra = extras.find((x) => x.v === esc0);
      if ($('#inv-cd-wrap', dlg)) $('#inv-cd-wrap', dlg).hidden = esc0 !== 'cd';
      $('#inv-desc-wrap', dlg).hidden = !!extra;
      const n = extra ? null : qtd(cd, desc);
      $('#inv-resumo', dlg).textContent = extra ? '' : `${n} máquina${n === 1 ? '' : 's'}${cd ? ` no ${cdCod(cd)}` : ` em ${state.cds.length} CDs`}.`;
    };
    f.onchange = atualizar; atualizar();
    $('#inv-ok', dlg).onclick = () => {
      try {
        const { esc0, cd, desc } = ler();
        const extra = extras.find((x) => x.v === esc0);
        const r = extra ? extra.gerar() : gerarInventarioXlsx(cd, desc);
        baixarBlob(r.blob, r.nome);
        dlg.close(); toast(r.total != null ? `Planilha baixada: ${r.total} linha(s).` : 'Planilha baixada.');
      } catch (e) { toast('Não foi possível gerar a planilha: ' + (e.message || e), true); }
    };
  });
}
export const modalBaixarInventario = () => modalExportar();

/* =====================================================================
   DRAWER — detalhe da máquina
   ===================================================================== */
export function idadeTexto(d) {
  const meses = Math.floor((Date.now() - new Date(d + 'T12:00:00')) / (30.44 * 864e5));
  if (meses < 0) return '—';
  const a = Math.floor(meses / 12), mm = meses % 12;
  return [a && `${a} ano${a > 1 ? 's' : ''}`, mm && `${mm} ${mm > 1 ? 'meses' : 'mês'}`].filter(Boolean).join(' e ') || 'menos de 1 mês';
}
export function garantiaPill(m) {
  const g = garantiaFaixa(m);
  if (g === 'Sem informação') return '';
  return pill(g === 'Vigente' || g === 'Vence em 90 dias' ? `Garantia até ${dataBR(m.garantia_fim)}` : `Garantia: ${g.toLowerCase()}`, { Vigente: 'ok', 'Vence em 90 dias': 'info', 'Vence em 30 dias': 'warn', Vencida: 'bad' }[g]);
}

export async function fecharDrawer() {
  if (state.drawerDirty && !(await confirmar('As alterações desta máquina ainda não foram salvas.', { titulo: 'Descartar alterações?', ok: 'Descartar', perigo: true }))) return;
  $('#drawer').classList.remove('open');
  $('#drawer-bg').hidden = true;
  state.drawerId = null; state.drawerDirty = false;
}
export const spec = (l, v, full = false) => `<div class="spec ${full ? 'spec--full' : ''}"><dt>${l}</dt><dd>${v ?? '—'}</dd></div>`;
export const campo = (nome, label, valor, tipo = 'text', extra = '') =>
  `<label>${label}<input name="${nome}" type="${tipo}" value="${esc(valor ?? '')}" ${extra}></label>`;
export const sel = (nome, label, mapa, valor) => `<label>${label}<select name="${nome}">${opts(Object.entries(mapa), valor)}</select></label>`;


/* ---- Segurança e programas (Invent_local 2.1) ---- */
export const BL_TXT = { ligado: 'Ligado', desligado: 'Desligado', criptografando: 'Criptografando…', descriptografando: 'Descriptografando…', suspenso: 'Suspenso', indisponivel: 'Não disponível (Windows Home ou sem permissão)' };
export function secaoSeguranca(m) {
  const s = m.seguranca || {};
  const bl = s.bitlocker || 'indisponivel';
  const blCor = bl === 'ligado' ? 'ok' : bl === 'indisponivel' ? '' : 'bad';
  const avs = (s.antivirus || []).map((a) => `${esc(a.nome)} ${a.ativo ? (a.atualizado ? pill('ativo', 'ok') : pill('desatualizado', 'warn')) : pill('desligado', 'bad')}`).join('<br>') || pill('nenhum encontrado', 'bad');
  const up = s.ultima_atualizacao;
  const diasUp = up?.data ? Math.floor((new Date(m.ultimo_online || Date.now()) - new Date(up.data)) / 864e5) : null;
  return `<div><div class="section-title"><h3>Segurança</h3><span class="muted" style="font-size:12.5px">na coleta de ${data(m.ultimo_online)}</span></div>
    <dl class="specs" style="margin:0">
      ${spec('BitLocker (disco do sistema)', pill(BL_TXT[bl] || bl, blCor))}
      ${spec('Antivírus', avs, true)}
      ${s.defender ? spec('Microsoft Defender', `${s.defender.tempo_real ? 'proteção em tempo real ligada' : '<b class="t-bad">tempo real desligado</b>'}${s.defender.assinatura_em ? ' · assinaturas de ' + data(s.defender.assinatura_em) : ''}`) : ''}
      ${spec('Última atualização do Windows', up?.data ? `${data(up.data)} ${diasUp != null && diasUp > 45 ? pill(`${diasUp} dias`, 'warn') : ''}<span class="sub">${esc(up.titulo || '')}</span>` : '—', true)}
      ${s.firewall ? spec('Firewall', s.firewall.ligado ? pill('ligado', 'ok') + ` <span class="muted">${esc((s.firewall.perfis || []).join(', '))}</span>` : pill('desligado', 'bad')) : ''}
    </dl></div>`;
}
export async function listarProgramas(m) {
  const el = $('#d-prog');
  el.innerHTML = '<p class="muted">Carregando…</p>';
  const { data: r, error } = await sb.from('maquina_programas').select('programas, atualizado_em').eq('maquina_id', m.id).maybeSingle();
  if (error) { el.innerHTML = `<p class="erro">${esc(erroMsg(error))}</p>`; return; }
  const lista = (r?.programas || []).map((x) => (Array.isArray(x) ? { n: x[0], v: x[1], f: x[2] } : x));
  if (!lista.length) { el.innerHTML = '<p class="muted">Lista não disponível. Passe o Invent_local de novo nesta máquina.</p>'; return; }
  el.innerHTML = `<input type="search" id="d-prog-q" placeholder="Filtrar programas…" style="margin-bottom:8px">
    <div style="max-height:320px;overflow:auto"><table class="mini-table"><thead><tr><th>Programa</th><th>Versão</th><th>Fabricante</th></tr></thead><tbody id="d-prog-tb"></tbody></table></div>`;
  const desenhar = (q = '') => {
    const f = q.trim().toLowerCase();
    $('#d-prog-tb').innerHTML = lista.filter((x) => !f || `${x.n} ${x.f || ''}`.toLowerCase().includes(f))
      .map((x) => `<tr><td>${esc(x.n)}</td><td class="mono">${esc(x.v || '—')}</td><td class="muted">${esc(x.f || '')}</td></tr>`).join('');
  };
  $('#d-prog-q').oninput = (e) => desenhar(e.target.value);
  desenhar();
}
// "quem tem o programa X?" (auditoria de software)
export function modalBuscarPrograma() {
  modal(`
    <div class="modal-head"><h2>Quem tem o programa…</h2>
      <p class="muted" style="margin:4px 0 0">Procura nos programas instalados coletados pelo Invent_local (computadores ${ehAdmin() ? 'de todos os CDs que você vê' : 'do seu CD'}).</p></div>
    <div class="modal-body">
      <input type="search" id="bp-q" placeholder="Ex.: WinRAR, AnyDesk, Office, Chrome…" autocomplete="off">
      <div id="bp-res" style="max-height:52vh;overflow:auto"></div>
    </div>
    <div class="modal-foot"><button class="btn" id="bp-sel" disabled>Selecionar na lista de máquinas</button><button class="btn btn--primary" data-close>Fechar</button></div>`, (dlg) => {
    let ids = [];
    const buscar = debounce(async () => {
      const q = $('#bp-q', dlg).value.trim();
      if (q.length < 2) { $('#bp-res', dlg).innerHTML = ''; ids = []; $('#bp-sel', dlg).disabled = true; return; }
      $('#bp-res', dlg).innerHTML = '<p class="muted">Procurando…</p>';
      const { data: r, error } = await sb.rpc('buscar_programa', { p_texto: q });
      if (error) { $('#bp-res', dlg).innerHTML = `<p class="erro">${esc(erroMsg(error))}</p>`; return; }
      const porMaq = new Map();
      (r || []).forEach((x) => { const m = state.maquinas.find((y) => y.id === x.maquina_id); if (m && noCD(m)) porMaq.set(m.id, { m, progs: [...(porMaq.get(m.id)?.progs || []), `${x.nome} ${x.versao || ''}`.trim()] }); });
      ids = [...porMaq.keys()];
      $('#bp-sel', dlg).disabled = !ids.length;
      $('#bp-res', dlg).innerHTML = ids.length ? `<p class="muted" style="margin:8px 0">${ids.length} máquina(s)</p><table class="mini-table"><thead><tr><th>Máquina</th><th>Setor</th><th>Programa encontrado</th></tr></thead><tbody>
        ${[...porMaq.values()].sort((a, b) => a.m.hostname.localeCompare(b.m.hostname)).map(({ m, progs }) => `<tr data-id="${m.id}" style="cursor:pointer"><td class="mono">${esc(m.hostname)}<span class="sub">${esc(m.ativo || '')}</span></td><td>${esc(m.setor || '—')}</td><td>${progs.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted" style="margin:8px 0">Nenhuma máquina com esse programa.</p>';
      $$('tr[data-id]', dlg).forEach((tr) => (tr.onclick = () => { dlg.close(); abrirMaquina(tr.dataset.id); }));
    }, 300);
    $('#bp-q', dlg).oninput = buscar;
    $('#bp-sel', dlg).onclick = () => { state.sel = new Set(ids); dlg.close(); location.hash = '#maquinas'; renderTabela?.(); toast(`${ids.length} máquina(s) selecionada(s)`); };
    $('#bp-q', dlg).focus();
  });
}

export async function abrirMaquina(id, silencioso = false) {
  let m = state.maquinas.find((x) => x.id === id);
  if (!m) m = await recarregarMaquina(id);
  if (!m) return toast('Máquina não encontrada', true);
  state.drawerId = id; state.drawerDirty = false;
  const d = $('#drawer');
  const manual = m.origem === 'manual';
  const usado = m.livre_pct != null ? 100 - m.livre_pct : null;
  const mods = m.memoria_modulos || [];
  const uptime = m.ultimo_boot ? rel(m.ultimo_boot).replace('há ', '') : null;

  d.innerHTML = `
    <div class="drawer-head">
      <div class="top">${dot(m)}<h2>${esc(m.hostname)}</h2>${statusPill(m.status)}
        <button class="btn btn--ghost btn--sm close" id="d-fechar" aria-label="Fechar">✕</button></div>
      <div class="muted">${esc(TIPO[m.tipo])} · ${esc(m.modelo || 'modelo não informado')} ·
        Última coleta: <strong style="color:var(--ink)">${rel(m.ultimo_online)}</strong>
        ${m.origem === 'agente' ? '· dados do agente antigo (passe o Invent_local para atualizar)' : m.origem === 'planilha' ? '· via Invent_local' : '· cadastro manual'}</div>
      ${(m.alertas || []).length ? `<div>${tags(m, 9)}</div>` : ''}
    </div>
    <div class="drawer-body">
      ${(m.alertas || []).includes('fora_do_cd') && m.rede ? `<div class="banner banner--bad"><div><strong>🌐 Na rede de outro CD</strong>
          <span>O IP ${esc(m.ip || '')} pertence à faixa ${esc(m.rede.cidr)} do <b>${esc(cdCod(m.rede.cd_id))}</b>${m.rede.setor ? ' · ' + esc(m.rede.setor) : ''}, mas a máquina está cadastrada no <b>${esc(cdCod(m.cd_id))}</b>. Foi transferida?</span></div>
          ${ehAdmin() ? `<button class="btn btn--sm btn--primary" id="d-mover-cd">Mover para ${esc(cdCod(m.rede.cd_id))}</button>` : ''}</div>` : ''}
      ${m.hw_reducao ? (() => { const h = m.hw_reducao; const nome = h.campo === 'memoria_gb' ? 'A memória' : 'O armazenamento';
        return `<div class="banner banner--bad"><div><strong>⚠ ${nome} diminuiu de ${gb(h.de)} para ${gb(h.para)}</strong>
          <span>Detectado em ${dataHora(h.em)}. Pode ser um pente/disco com defeito ou uma peça retirada da máquina. Confira fisicamente.</span></div>
          <button class="btn btn--sm" id="d-verificado">Marcar como verificado</button></div>`; })() : ''}
      ${(() => { const s = solicitacaoAberta(m.id); return s ? `<div class="banner banner--warn"><div><strong>${s.tipo === 'baixa' ? '🗑️ Baixa solicitada' : `🚚 Transferência para ${esc(cdCod(s.cd_destino))} solicitada`}</strong>
          <span>Por ${esc(String(s.solicitado_por).split('@')[0])} em ${dataHora(s.solicitado_em)} · ${esc(s.motivo_categoria)} · aguardando aprovação do administrador</span></div>
          <a class="btn btn--sm" href="#patrimonio">Ver pedido</a></div>` : ''; })()}
      ${m.posse_atual ? `<div class="banner banner--info"><div><strong>👤 Com ${esc(m.posse_atual.colaborador)}${m.posse_atual.matricula ? ' (' + esc(m.posse_atual.matricula) + ')' : ''} · termo de uso</strong>
          <span>Desde ${dataHora(m.posse_atual.entregue_em)}${m.posse_atual.setor ? ' · ' + esc(m.posse_atual.setor) : ''}${m.posse_atual.cargo ? ' · ' + esc(m.posse_atual.cargo) : ''}</span></div>
          <button class="btn btn--sm" id="d-posse-termo">Termo</button><button class="btn btn--sm btn--primary" id="d-posse-dev">Devolução</button></div>` : ''}
      ${m.emprestimo_atual ? (() => { const e = m.emprestimo_atual; const atras = e.previsto_devolucao && new Date(e.previsto_devolucao) < new Date();
        return `<div class="banner ${atras ? 'banner--bad' : 'banner--info'}"><div><strong>${atras ? 'Devolução atrasada · ' : ''}Emprestado para ${esc(e.colaborador)}${e.matricula ? ' (' + esc(e.matricula) + ')' : ''}</strong>
          <span>Desde ${dataHora(e.retirado_em)}${e.previsto_devolucao ? ' · devolução prevista ' + dataHora(e.previsto_devolucao) : ''}</span></div>
          <button class="btn btn--sm btn--primary" id="d-devolver">Registrar devolução</button></div>`; })() : ''}
      <div class="big-specs">
        <div class="big-spec"><div class="l">Memória</div><div class="v">${gb(m.memoria_gb)}</div>
          <div class="l">${mods.length ? `${mods.length} módulo(s)${m.memoria_slots_total ? ' de ' + m.memoria_slots_total + ' slots' : ''}` : '&nbsp;'}</div></div>
        <div class="big-spec"><div class="l">Armazenamento</div><div class="v">${gb(m.armazenamento_total_gb)}</div>
          <div class="l">${esc(tipoDisco(m))}${m.armazenamento_livre_gb != null ? ' · ' + gb(m.armazenamento_livre_gb) + ' livre' : ''}</div>
          ${usado != null ? `<div class="progress" style="margin-top:6px"><i style="width:${usado}%;background:${usado > 90 ? 'var(--bad)' : usado > 75 ? 'var(--warn)' : 'var(--ink-2)'}"></i></div>` : ''}</div>
        ${m.tipo === 'coletor' ? (() => { const b = m.bateria || {}; const ruim = (m.alertas || []).includes('bateria_ruim');
          return `<div class="big-spec"><div class="l">Bateria</div><div class="v ${ruim ? 't-bad' : ''}">${b.capacidade_pct != null ? b.capacidade_pct + '%' : b.nivel != null ? b.nivel + '%' : '—'}</div>
          <div class="l">${esc(b.capacidade_pct != null ? 'da capacidade original' : b.nivel != null ? 'de carga' : 'sem leitura')}${b.saude ? ' · saúde ' + esc(SAUDE_BAT[b.saude] || b.saude) : ''}${b.ciclos != null ? ' · ' + b.ciclos + ' ciclos' : ''}</div></div>`; })() : ''}
        <div class="big-spec"><div class="l">Sistema</div><div class="v" style="font-size:16px">${esc(soFamilia(m))}</div>
          <div class="l">${esc([m.so_display_version, m.so_build && 'build ' + m.so_build].filter(Boolean).join(' · ') || '&nbsp;')}</div></div>
      </div>

      <form id="d-form">
        <div class="section-title"><h3>Controle de inventário</h3></div>
        <div class="form-grid">
          ${ehAdmin() ? `<label>CD<select name="cd_id">${opts(state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}`]), m.cd_id)}</select></label>` : `<label>CD<input value="${esc(cdCod(m.cd_id) + ' · ' + cdNome(m.cd_id))}" disabled></label>`}
          ${campo('ativo', 'Patrimônio', m.ativo, 'text', 'class="mono" placeholder="Nº da etiqueta"')}
          ${sel('status', 'Status', STATUS, m.status)}
          ${sel('tipo', 'Tipo', TIPO, m.tipo)}
          ${campo('setor', 'Setor', m.setor, 'text', 'list="dl-setores"')}
          ${campo('localizacao', 'Localização', m.localizacao, 'text', 'placeholder="Ex.: Expedição, doca 3"')}
          ${campo('responsavel', 'Responsável', m.responsavel)}
          <label class="full">Observações<textarea name="observacoes">${esc(m.observacoes || '')}</textarea></label>
        </div>
        ${manual ? `
        <div class="section-title" style="margin-top:18px"><h3>Dados técnicos (cadastro manual)</h3></div>
        <div class="form-grid">
          ${campo('hostname', 'Hostname', m.hostname, 'text', 'class="mono" required')}
          ${campo('numero_serie', 'Nº de série', m.numero_serie, 'text', 'class="mono"')}
          ${campo('fabricante', 'Fabricante', m.fabricante)}
          ${campo('modelo', 'Modelo', m.modelo)}
          ${campo('memoria_gb', 'Memória (GB)', m.memoria_gb, 'number', 'step="0.5" min="0"')}
          ${campo('armazenamento_total_gb', 'Armazenamento (GB)', m.armazenamento_total_gb, 'number', 'min="0"')}
          ${campo('so_nome', 'Sistema operacional', m.so_nome, 'text', 'list="dl-so"')}
          ${campo('cpu', 'Processador', m.cpu)}
        </div>` : ''}
        <div class="section-title" style="margin-top:18px"><h3>Propriedade</h3><span>${m.propriedade === 'alugado' ? pill(m.aluguel_fim ? `Alugado até ${dataBR(m.aluguel_fim)}` : 'Alugado', (m.alertas || []).includes('aluguel_vencendo') ? 'bad' : 'info') : pill('Próprio')}</span></div>
        <div class="form-grid">
          ${sel('propriedade', 'Próprio ou alugado', PROPRIEDADE, m.propriedade || 'proprio')}
          ${campo('locadora', 'Locadora', m.locadora, 'text', 'list="dl-locadoras" maxlength="80"')}
          ${campo('contrato', 'Contrato', m.contrato, 'text', 'class="mono" maxlength="60"')}
          ${campo('aluguel_fim', 'Fim do aluguel', m.aluguel_fim, 'date')}
        </div>
        <datalist id="dl-locadoras">${locadoras().map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
        <div class="section-title" style="margin-top:18px"><h3>Compra e garantia</h3><span>${garantiaPill(m)}</span></div>
        <div class="form-grid">
          ${campo('data_compra', 'Data de compra', m.data_compra, 'date')}
          ${campo('garantia_fim', 'Fim da garantia', m.garantia_fim, 'date')}
          ${campo('fornecedor', 'Fornecedor', m.fornecedor, 'text', 'list="dl-forn"')}
          ${campo('nota_fiscal', 'Nota fiscal', m.nota_fiscal, 'text', 'class="mono"')}
          ${campo('valor_compra', 'Valor (R$)', m.valor_compra, 'number', 'step="0.01" min="0"')}
          <label>Idade<input value="${m.data_compra ? esc(idadeTexto(m.data_compra)) : '—'}" disabled></label>
        </div>
        <datalist id="dl-forn">${[...new Set(MQ().map((x) => x.fornecedor).filter(Boolean))].map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
        <datalist id="dl-setores">${setores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        <datalist id="dl-so"><option value="Microsoft Windows 11 Pro"><option value="Microsoft Windows 10 Pro"><option value="Microsoft Windows 11 Enterprise"></datalist>
      </form>

      ${!manual ? `
      <div><div class="section-title"><h3>Identificação</h3></div>
        <dl class="specs" style="margin:0">
          ${spec('Fabricante', esc(m.fabricante))}${spec('Modelo', esc(m.modelo))}
          ${spec('Nº de série', `<span class="mono">${esc(m.numero_serie || '—')}</span>`)}${spec('Processador', esc(m.cpu) + (m.cpu_nucleos ? ` <span class="muted">· ${m.cpu_nucleos} núcleos</span>` : ''))}
        </dl></div>` : ''}

      ${mods.length ? `<div><div class="section-title"><h3>Módulos de memória</h3></div>
        <table class="mini-table"><thead><tr><th>Slot</th><th>Tamanho</th><th>Tipo</th><th>Velocidade</th><th>Fabricante</th></tr></thead><tbody>
        ${mods.map((x) => `<tr><td>${esc(x.slot)}</td><td>${gb(x.tamanho_gb)}</td><td>${esc(x.tipo || '—')}</td><td>${x.velocidade ? x.velocidade + ' MHz' : '—'}</td><td>${esc(x.fabricante || '—')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}

      ${(m.discos || []).length ? `<div><div class="section-title"><h3>Discos</h3></div>
        <table class="mini-table"><thead><tr><th>Modelo</th><th>Tipo</th><th>Tamanho</th><th>Saúde</th></tr></thead><tbody>
        ${m.discos.map((x) => `<tr><td>${esc(x.modelo)}<br><span class="muted mono">${esc(x.barramento || '')} ${esc(x.serie || '')}</span></td><td>${pill(x.tipo, x.tipo === 'SSD' ? 'ok' : x.tipo === 'HDD' ? 'bad' : '')}</td><td>${gb(x.tamanho_gb)}</td><td>${esc(x.saude || '—')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}

      ${(m.volumes || []).length ? `<div><div class="section-title"><h3>Volumes</h3></div>
        <table class="mini-table"><thead><tr><th>Unidade</th><th>Total</th><th>Livre</th><th>Uso</th></tr></thead><tbody>
        ${m.volumes.map((v) => { const u = v.total_gb ? Math.round(100 - (100 * v.livre_gb) / v.total_gb) : 0; return `<tr><td class="mono">${esc(v.letra)} ${esc(v.rotulo || '')}</td><td>${gb(v.total_gb)}</td><td>${gb(v.livre_gb, 1)}</td><td>${u}%<span class="meter"><i class="${u > 90 ? 'bad' : u > 75 ? 'warn' : ''}" style="width:${u}%"></i></span></td></tr>`; }).join('')}
        </tbody></table></div>` : ''}

      ${!manual ? `<div><div class="section-title"><h3>Sistema e rede</h3></div>
        <dl class="specs" style="margin:0">
          ${spec('Sistema operacional', esc(soLabel(m)), true)}
          ${spec('Versão / build', `<span class="mono">${esc(m.so_versao || '—')} · ${esc(m.so_build || '—')}</span>`)}${spec('Arquitetura', esc(m.so_arquitetura))}
          ${spec('Instalado em', data(m.so_instalado_em))}${spec('Último boot', m.ultimo_boot ? `${dataHora(m.ultimo_boot)} <span class="muted">(ligada há ${uptime})</span>` : '—')}
          ${spec('IP', `<span class="mono">${esc(m.ip || '—')}</span>`)}${spec('MAC', `<span class="mono">${esc(m.mac || '—')}</span>`)}
          ${spec('Domínio', esc(m.dominio))}${spec('Usuário logado', esc(m.usuario_logado))}
          ${spec('Primeiro registro', dataHora(m.criado_em))}${spec('Última coleta', dataHora(m.ultimo_online))}
        </dl></div>` : ''}

      ${m.tipo !== 'coletor' && m.seguranca && Object.keys(m.seguranca).length ? secaoSeguranca(m) : ''}
      ${m.programas_qtd ? `<div><div class="section-title"><h3>Programas instalados (${m.programas_qtd})</h3><button class="btn btn--sm btn--ghost" id="d-prog-ver">Ver lista</button></div><div id="d-prog"></div></div>` : ''}
      <div id="d-emp-wrap"></div>
      <div><div class="section-title"><h3>Histórico</h3></div><div class="timeline" id="d-hist"><p class="muted">Carregando…</p></div></div>
    </div>
    <div class="drawer-foot">
      ${ehAdmin() ? '<button class="btn btn--danger btn--sm" id="d-excluir">Excluir</button>' : ''}
      ${m.origem === 'manual' || situacao(m) === 'offline' ? '<button class="btn btn--sm" id="d-link">Link de registro</button>' : ''}
      <button class="btn btn--sm" id="d-etq">Etiqueta</button>
      ${!solicitacaoAberta(m.id) && m.status !== 'descartado' ? '<button class="btn btn--sm" id="d-baixa">Solicitar baixa</button>' : ''}
      ${!solicitacaoAberta(m.id) && m.status !== 'descartado' && state.cds.filter((c) => c.ativo).length > 1 ? '<button class="btn btn--sm" id="d-transf">Transferir de CD</button>' : ''}
      ${!m.emprestimo_atual && !m.posse_atual && !['descartado', 'extraviado'].includes(m.status) ? '<button class="btn btn--sm" id="d-emprestar">Emprestar</button><button class="btn btn--sm" id="d-posse">Termo de uso</button>' : ''}
      <span class="spacer"></span>
      <button class="btn" id="d-cancelar">Fechar</button>
      <button class="btn btn--primary" id="d-salvar" disabled>Salvar alterações</button>
    </div>`;

  if (!silencioso) { d.classList.add('open'); $('#drawer-bg').hidden = false; }
  $('#d-fechar').onclick = $('#d-cancelar').onclick = fecharDrawer;
  $('#d-prog-ver')?.addEventListener('click', () => listarProgramas(m));
  $('#d-mover-cd')?.addEventListener('click', async () => {
    const { error } = await sb.from('maquinas').update({ cd_id: m.rede.cd_id }).eq('id', id);
    if (error) return toast(erroMsg(error), true);
    await sb.rpc('aplicar_redes').then(() => {}, () => {});
    await recarregarMaquina(id); toast(`${m.hostname} movida para ${cdCod(m.rede.cd_id)}`); abrirMaquina(id, true); rerender();
  });
  const form = $('#d-form');
  form.oninput = () => { state.drawerDirty = true; $('#d-salvar').disabled = false; };
  form.onsubmit = (e) => { e.preventDefault(); salvar(); };
  $('#d-salvar').onclick = salvar;
  $('#d-etq').onclick = () => { fecharDrawer(); irEtiquetas([id]); };
  $('#d-emprestar')?.addEventListener('click', () => modalEmprestimo(m));
  $('#d-posse')?.addEventListener('click', () => modalPosse(m));
  $('#d-posse-dev')?.addEventListener('click', async () => { await carregarPosses(); modalDevolucaoPosse([m.posse_atual.id]); });
  $('#d-posse-termo')?.addEventListener('click', () => imprimirTermoPosse(m.posse_atual.id));
  $('#d-devolver')?.addEventListener('click', () => modalDevolucao(m.emprestimo_atual.id));
  $('#d-verificado')?.addEventListener('click', async () => {
    const { error } = await sb.from('maquinas').update({ hw_verificado_em: new Date().toISOString() }).eq('id', id);
    if (error) return toast(erroMsg(error), true);
    await recarregarMaquina(id); toast('Alerta marcado como verificado'); abrirMaquina(id, true); rerender();
  });
  $('#d-baixa')?.addEventListener('click', () => modalSolicitacao(m, 'baixa'));
  $('#d-transf')?.addEventListener('click', () => modalSolicitacao(m, 'transferencia'));
  $('#d-link')?.addEventListener('click', () => modalLinkInstalacao({ ativo: m.ativo, setor: m.setor, localizacao: m.localizacao, responsavel: m.responsavel }));
  $('#d-excluir')?.addEventListener('click', async () => {
    if (!(await confirmar(`${m.hostname} e todo o histórico dela serão apagados. Prefira "Solicitar baixa" para manter o registro.`, { titulo: 'Excluir definitivamente?', ok: 'Excluir', perigo: true, digitar: 'EXCLUIR' }))) return;
    const { error } = await sb.from('maquinas').delete().eq('id', id);
    if (error) return toast(erroMsg(error), true);
    state.maquinas = state.maquinas.filter((x) => x.id !== id);
    state.drawerDirty = false; fecharDrawer(); rerender(); toast('Máquina excluída');
  });

  async function salvar() {
    const fd = new FormData(form);
    const diff = {};
    for (const [k, v0] of fd.entries()) {
      let v = String(v0).trim();
      if (k === 'hostname') v = v.toUpperCase();
      const novo = v === '' ? null : ['memoria_gb', 'armazenamento_total_gb', 'valor_compra'].includes(k) ? Number(v) : v;
      const atual = m[k] ?? null;
      if (String(novo ?? '') !== String(atual ?? '') && !(typeof novo === 'number' && Number(atual) === novo)) diff[k] = novo;
    }
    if (!Object.keys(diff).length) { state.drawerDirty = false; return toast('Nada para salvar'); }
    $('#d-salvar').disabled = true;
    const { error } = await sb.from('maquinas').update(diff).eq('id', id);
    if (error) { $('#d-salvar').disabled = false; return toast(erroMsg(error), true); }
    state.drawerDirty = false;
    await recarregarMaquina(id);
    toast('Alterações salvas');
    abrirMaquina(id, true); rerender();
  }

  const [{ data: hist }, { data: emps }, posses] = await Promise.all([
    sb.from('maquinas_historico').select('*').eq('maquina_id', id).order('criado_em', { ascending: false }).limit(100),
    sb.from('emprestimos').select(EMP_COLS).eq('maquina_id', id).order('retirado_em', { ascending: false }).limit(30),
    historicoResponsaveis(id),
  ]);
  if (state.drawerId !== id) return;
  if (posses.length) {
    $('#d-emp-wrap').insertAdjacentHTML('beforebegin', `<div><div class="section-title"><h3>Quem já teve este equipamento (${posses.length})</h3></div>
      <table class="mini-table"><thead><tr><th>Colaborador</th><th>Entregue</th><th>Devolvido</th><th></th></tr></thead><tbody>
      ${posses.map((p) => `<tr><td>${esc(p.colaborador)}${p.matricula ? `<br><span class="muted">${esc(p.matricula)}</span>` : ''}</td><td>${dataHora(p.entregue_em)}</td>
        <td>${p.devolvido_em ? dataHora(p.devolvido_em) + (p.motivo_devolucao ? '<br><span class="muted">' + esc(MOTIVO[p.motivo_devolucao]) + '</span>' : '') : pill('em vigor', 'ok')}</td>
        <td><button class="btn btn--sm btn--ghost" data-termo-posse="${p.id}">Termo</button></td></tr>`).join('')}
      </tbody></table></div>`);
    $$('[data-termo-posse]', $('#drawer')).forEach((b) => (b.onclick = () => imprimirTermoPosse(b.dataset.termoPosse)));
  }
  if ((emps || []).length) {
    $('#d-emp-wrap').innerHTML = `<div class="section-title"><h3>Empréstimos (${emps.length})</h3></div>
      <table class="mini-table"><thead><tr><th>Colaborador</th><th>Retirada</th><th>Devolução</th><th></th></tr></thead><tbody>
      ${emps.map((e) => `<tr><td>${esc(e.colaborador)}${e.matricula ? `<br><span class="muted">${esc(e.matricula)}</span>` : ''}</td><td>${dataHora(e.retirado_em)}</td>
        <td>${e.devolvido_em ? dataHora(e.devolvido_em) + (e.condicao_devolucao && e.condicao_devolucao !== 'ok' ? ' ' + pill(COND[e.condicao_devolucao], 'bad') : '') : pill('em aberto', 'info')}</td>
        <td><button class="btn btn--sm btn--ghost" data-termo="${e.id}">Termo</button></td></tr>`).join('')}
      </tbody></table>`;
    $$('[data-termo]', $('#d-emp-wrap')).forEach((b) => (b.onclick = () => imprimirTermo(b.dataset.termo)));
  }
  $('#d-hist').innerHTML = (hist || []).length ? hist.map((h) => `
    <div class="tl ${reducao(h) ? 'bad' : CAMPOS_HW.includes(h.campo) ? 'hw' : ''}"><span class="b"></span><div>
      ${h.campo === 'cadastro' ? '<strong>Cadastrada no inventário</strong>' : h.campo === 'hw_verificado' ? '<strong>Alerta de peça verificado</strong>' : `<strong>${esc(CAMPOS_HIST[h.campo] || h.campo)}</strong>: <span class="chg-old">${esc(fmtValorHist(h.campo, h.valor_anterior))}</span> → <span class="chg-new">${esc(fmtValorHist(h.campo, h.valor_novo))}</span>`}
      <small>${dataHora(h.criado_em)} · ${esc(h.origem)}</small></div></div>`).join('') : '<p class="muted">Sem registros.</p>';
}

/* =====================================================================
   Modal genérico
   ===================================================================== */
export function modal(html, onOpen) {
  const dlg = $('#modal');
  dlg.innerHTML = html;
  dlg.showModal();
  $$('[data-close]', dlg).forEach((b) => (b.onclick = () => dlg.close()));
  fecharAoClicarFora(dlg);
  onOpen?.(dlg);
  return dlg;
}

// Clique no fundo escuro (fora da janela) fecha. Em formulário já preenchido não fecha, para não perder o que foi digitado.
// Só conta se o clique começou e terminou fora: arrastar uma seleção de texto até a borda não fecha.
export function fecharAoClicarFora(dlg) {
  dlg.dataset.mexeu = '';
  if (dlg.dataset.foraLigado) return;
  dlg.dataset.foraLigado = '1';
  const fora = (e) => {
    if (e.target !== dlg) return false;
    const r = dlg.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let comecouFora = false;
  dlg.addEventListener('pointerdown', (e) => { comecouFora = fora(e); });
  dlg.addEventListener('input', () => { dlg.dataset.mexeu = '1'; });
  dlg.addEventListener('click', (e) => {
    if (comecouFora && fora(e) && !dlg.dataset.mexeu) dlg.close();
    comecouFora = false;
  });
}

export function modalNovaMaquina(pre = {}) {
  modal(`
    <form method="dialog" id="nova-form">
      <div class="modal-head"><h2>Cadastrar máquina</h2><p class="muted" style="margin:4px 0 0">Prefira o Invent_local (Coleta → Como coletar): ele preenche os dados técnicos sozinho. Se ele for usado depois, reconhece a máquina pelo nº de série, patrimônio ou hostname.</p></div>
      <div class="modal-body"><div class="form-grid">
        ${ehAdmin() ? `<label class="full">CD *<select name="cd_id" required>${opts(cdsAtivos().map((c) => [c.id, `${c.codigo} · ${c.nome}`]), pre.cd_id || state.cdAtual || cdsAtivos()[0]?.id)}</select></label>` : ''}
        ${campo('hostname', 'Hostname *', pre.hostname, 'text', 'class="mono" required')}
        ${campo('ativo', 'Patrimônio', pre.ativo, 'text', 'class="mono"')}
        ${sel('tipo', 'Tipo', TIPO, pre.tipo || 'desktop')}
        ${sel('status', 'Status', STATUS, pre.status || 'estoque')}
        ${sel('propriedade', 'Próprio ou alugado', PROPRIEDADE, pre.propriedade || 'proprio')}${campo('locadora', 'Locadora (se alugado)', '', 'text', 'list="dl-loc2" maxlength="80"')}
        ${campo('fabricante', 'Fabricante', '')}${campo('modelo', 'Modelo', '')}
        ${campo('numero_serie', 'Nº de série', pre.numero_serie, 'text', 'class="mono"')}
        ${campo('memoria_gb', 'Memória (GB)', '', 'number', 'step="0.5" min="0"')}
        ${campo('armazenamento_total_gb', 'Armazenamento (GB)', '', 'number', 'min="0"')}
        ${campo('so_nome', 'Sistema operacional', '', 'text', 'list="dl-so2"')}
        ${campo('setor', 'Setor', pre.setor, 'text', 'list="dl-set2"')}${campo('localizacao', 'Localização', pre.localizacao)}
      </div>
      <datalist id="dl-loc2">${locadoras().map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
      <datalist id="dl-set2">${setores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <datalist id="dl-so2"><option value="Microsoft Windows 11 Pro"><option value="Microsoft Windows 10 Pro"></datalist>
      <p class="erro" id="nova-erro"></p></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" value="ok">Cadastrar</button></div>
    </form>`, (dlg) => {
    $('#nova-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const row = {};
      for (const [k, v] of Object.entries(fd)) { const t = String(v).trim(); if (t) row[k] = ['memoria_gb', 'armazenamento_total_gb'].includes(k) ? Number(t) : t; }
      row.hostname = row.hostname.toUpperCase();
      const { data: d, error } = await sb.from('maquinas').insert(row).select('id').single();
      if (error) { $('#nova-erro').textContent = erroMsg(error); return; }
      dlg.close();
      await recarregarMaquina(d.id);
      rerender(); toast('Máquina cadastrada');
      pre.onDone ? pre.onDone(d.id) : abrirMaquina(d.id);
    };
  });
}

/* ---- Próprio x alugado ---- */
export const locadoras = () => [...new Set(MQ().map((x) => x.locadora).filter(Boolean))].sort();
export function modalPropriedade(ids) {
  if (!ids.length) return;
  const lista = ids.map((id) => MQ().find((m) => m.id === id)).filter(Boolean);
  const um = lista.length === 1 ? lista[0] : {};
  modal(`
    <form method="dialog" id="prop-form">
      <div class="modal-head"><h2>Próprio ou alugado</h2><p class="muted" style="margin:4px 0 0">${lista.length} equipamento(s) selecionado(s).</p></div>
      <div class="modal-body"><div class="form-grid">
        ${sel('propriedade', 'Propriedade', PROPRIEDADE, um.propriedade || 'alugado')}
        ${campo('locadora', 'Locadora', um.locadora, 'text', 'list="dl-loc3" maxlength="80"')}
        ${campo('contrato', 'Contrato', um.contrato, 'text', 'class="mono" maxlength="60"')}
        ${campo('aluguel_fim', 'Fim do aluguel', um.aluguel_fim, 'date')}
      </div>
      <datalist id="dl-loc3">${locadoras().map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
      <p class="muted" style="margin:0;font-size:12.5px">Alugado não entra no planejamento de renovação nem no alerta de garantia: quem troca é a locadora. O painel avisa 30 dias antes do fim do aluguel.</p>
      <p class="erro" id="prop-erro"></p></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn--primary" value="ok">Salvar</button></div>
    </form>`, (dlg) => {
    const f = $('#prop-form', dlg);
    const ajustar = () => f.querySelectorAll('[name=locadora],[name=contrato],[name=aluguel_fim]').forEach((i) => { i.closest('label').hidden = f.propriedade.value !== 'alugado'; });
    f.propriedade.onchange = ajustar; ajustar();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const alugado = f.propriedade.value === 'alugado';
      const v = (n) => (alugado ? f[n].value.trim() || null : null);
      const { error } = await sb.from('maquinas').update({ propriedade: f.propriedade.value, locadora: v('locadora'), contrato: v('contrato'), aluguel_fim: v('aluguel_fim') }).in('id', lista.map((m) => m.id));
      if (error) { $('#prop-erro', dlg).textContent = erroMsg(error); return; }
      await Promise.all(lista.map((m) => recarregarMaquina(m.id)));
      dlg.close(); state.sel.clear(); renderTabela(); toast(`${lista.length} equipamento(s) atualizado(s)`);
    };
  });
}
