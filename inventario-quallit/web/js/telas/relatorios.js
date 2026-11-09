// Inventário Quallit — tela: relatorios (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { renderRelRenovacao } from './renovacao.js';
import { $, $$, ALERTAS, LOGO_CLIENTE_URL, STATUS, TIPO, cdCod, cdDe, cdNome, data, dataBR, dataHora, debounce, ehAdmin, erroMsg, esc, garantiaFaixa, idadeFaixa, noCD, pill, ramFaixa, rel, sb, situacao, soGrupo, state, store, tipoDisco, toast, up, titulo } from '../nucleo.js';
import { criarXlsx } from '../planilha.js';
import { etiquetaPrazo } from '../prazo.js';
import { irMaquinas, renderSidebar } from '../rotas.js';
import { calcularConf, excluirConf, modalConf, resumoConf } from '../telas/inventarios.js';
import { baixarBlob, hojeISO, modalExportar, opts, planilhaSimples } from '../telas/maquinas.js';
import { ORDEM_GAR, ORDEM_IDADE, anelSaude, barras, contar, saudeDe } from '../telas/painel.js';

/* =====================================================================
   RELATÓRIOS
   ===================================================================== */
export const METRICAS = [
  { k: 'total', l: 'Máquinas', f: () => true, ir: {} },
  { k: 'desk', l: 'Desktops', f: (m) => m.tipo === 'desktop', ir: { tipo: 'desktop' } },
  { k: 'note', l: 'Notebooks', f: (m) => m.tipo === 'notebook', ir: { tipo: 'notebook' } },
  { k: 'colet', l: 'Coletores', f: (m) => m.tipo === 'coletor', ir: { tipo: 'coletor' } },
  { k: 'online', l: 'Coletados 30d', f: (m) => situacao(m) === 'online', pct: true },
  { k: 'semc', l: 'Coleta +6 meses', a: 'sem_contato', ruim: true },
  { k: 'so', l: 'Windows sem suporte', a: 'so_sem_suporte', ruim: true },
  { k: 'peca', l: 'Peça removida', a: 'hw_reduzido', ruim: true },
  { k: 'ram', l: 'RAM < 8 GB', a: 'ram_baixa' },
  { k: 'hdd', l: 'Disco HDD', a: 'hdd' },
  { k: 'cheio', l: 'Disco cheio', a: 'disco_cheio' },
  { k: 'gar', l: 'Garantia ≤ 30d', a: 'garantia_vencendo' },
  { k: 'ren', l: 'Mais de 5 anos', a: 'renovacao' },
  { k: 'emp', l: 'Emprestados', f: (m) => !!m.emprestimo_atual, ir: { status: 'emprestado' } },
  { k: 'atr', l: 'Devolução atrasada', a: 'emprestimo_atrasado', ruim: true },
  { k: 'pat', l: 'Sem patrimônio', a: 'sem_ativo' },
  { k: 'bat', l: 'Bateria ruim', a: 'bateria_ruim', ruim: true },
  { k: 'blk', l: 'BitLocker desligado', a: 'sem_bitlocker', ruim: true },
  { k: 'av', l: 'Antivírus desligado', a: 'antivirus_off', ruim: true },
  { k: 'wu', l: 'Windows sem atualização', a: 'windows_desatualizado' },
];
export const temMetrica = (mt, m) => (mt.a ? (m.alertas || []).includes(mt.a) : mt.f(m));

export function dadosParque(tipo = '') {
  const base = state.maquinas.filter((m) => m.status !== 'descartado' && (!tipo || m.tipo === tipo) && noCD(m));
  const cdsVis = state.cds.length ? state.cds.filter((c) => noCD({ cd_id: c.id }) && (c.ativo || base.some((m) => m.cd_id === c.id))) : [{ id: null, codigo: '—', nome: 'Todas' }];
  const linhas = cdsVis.map((c) => {
    const ms = state.cds.length ? base.filter((m) => m.cd_id === c.id) : base;
    return { cd: c, ms, v: Object.fromEntries(METRICAS.map((mt) => [mt.k, ms.filter((m) => temMetrica(mt, m)).length])) };
  });
  const total = { cd: { codigo: 'Total', nome: '' }, ms: base, v: Object.fromEntries(METRICAS.map((mt) => [mt.k, base.filter((m) => temMetrica(mt, m)).length])) };
  return { linhas, total, base };
}


/* ---- Indicadores mês a mês: acerto dos inventários por CD (histórico completo) + foto mensal do parque ---- */
export const MES_TXT = (k) => { const [a, m] = k.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1] + '/' + a.slice(2); };
export const corAcerto = (p) => (p == null ? '' : p >= 98 ? '22,163,106' : p >= 90 ? '224,161,11' : '214,52,42');
export async function renderRelIndicadores() {
  const corpo = $('#rel-corpo');
  $('#rel-acoes').innerHTML = '<button class="btn" id="rid-exp">Exportar</button>';
  corpo.innerHTML = '<div class="skeleton">Calculando indicadores…</div>';
  try { await sb.rpc('registrar_indicadores'); } catch { /* sem a migração: só o acerto */ }
  const hoje = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const inicio = meses[0] + '-01';
  const [rc, rf] = await Promise.all([
    sb.from('conferencias').select('id, cd_id, finalizado_em, total_esperadas, total_encontradas, total_faltando').eq('status', 'finalizada').gte('finalizado_em', inicio).limit(5000),
    sb.from('indicadores_mensais').select('*').gte('mes', inicio).order('mes'),
  ]);
  if (rc.error) { corpo.innerHTML = `<div class="card card-pad erro">${esc(erroMsg(rc.error))}</div>`; return; }
  const cds = state.cds.filter((c) => noCD({ cd_id: c.id }) && (c.ativo || (rc.data || []).some((x) => x.cd_id === c.id)));
  const mesDe = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const vazio = () => ({ esp: 0, enc: 0, n: 0 });
  const porCD = Object.fromEntries(cds.map((c) => [c.id, Object.fromEntries(meses.map((m) => [m, vazio()]))]));
  const geral = Object.fromEntries(meses.map((m) => [m, vazio()]));
  for (const c of rc.data || []) {
    if (!porCD[c.cd_id] || c.total_esperadas == null) continue;
    const m = mesDe(c.finalizado_em); if (!geral[m]) continue;
    for (const alvo of [porCD[c.cd_id][m], geral[m]]) { alvo.esp += c.total_esperadas || 0; alvo.enc += Math.min(c.total_encontradas || 0, c.total_esperadas || 0); alvo.n++; }
  }
  const pctDe = (x) => (x.esp ? Math.round((1000 * x.enc) / x.esp) / 10 : null);
  const somaCD = (id) => meses.reduce((a, m) => ({ esp: a.esp + porCD[id][m].esp, enc: a.enc + porCD[id][m].enc, n: a.n + porCD[id][m].n }), vazio());
  const total12 = meses.reduce((a, m) => ({ esp: a.esp + geral[m].esp, enc: a.enc + geral[m].enc, n: a.n + geral[m].n }), vazio());
  const mAtual = meses[11], mAnt = meses[10];
  const ranking = cds.map((c) => ({ c, p: pctDe(somaCD(c.id)), n: somaCD(c.id).n })).filter((x) => x.p != null).sort((a, b) => b.p - a.p);

  // gráfico de barras (SVG): acerto geral por mês
  const W = 720, H = 190, bw = W / 12;
  const barras = meses.map((m, i) => { const p = pctDe(geral[m]); const h = p == null ? 0 : Math.max(2, ((p - 50) / 50) * (H - 46));
    return `<g><rect x="${i * bw + 8}" y="${H - 24 - h}" width="${bw - 16}" height="${h}" rx="4" fill="${p == null ? 'transparent' : `rgb(${corAcerto(p)})`}"><title>${MES_TXT(m)}: ${p == null ? 'sem inventário' : p + '% em ' + geral[m].n + ' inventário(s)'}</title></rect>
      <text x="${i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">${MES_TXT(m)}</text>
      ${p != null ? `<text x="${i * bw + bw / 2}" y="${H - 30 - h}" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">${Math.round(p)}%</text>` : ''}</g>`; }).join('');

  // foto mensal do parque (soma dos CDs do escopo)
  const fotos = (rf.data || []).filter((f) => cds.some((c) => c.id === f.cd_id));
  const fotoMes = meses.map((m) => { const fs = fotos.filter((f) => f.mes.slice(0, 7) === m); if (!fs.length) return null;
    const s = (k) => fs.reduce((a, f) => a + (f[k] || 0), 0);
    return { m, total: s('total'), col: s('coletados_30d'), w11: s('windows_11'), win: s('windows'), sup: s('so_sem_suporte'), grav: s('alertas_graves'), blk: s('sem_bitlocker'), av: s('antivirus_off'), colet: s('coletores'), bat: s('bateria_ruim') }; }).filter(Boolean).reverse();
  const pc = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '—');
  state.indicadores = { meses, cds, porCD, geral, pctDe, somaCD, fotoMes, pc };

  corpo.innerHTML = `
    <div class="rel-resumo">
      <div class="card rr-kpi"><span class="k-rot">Acerto em ${MES_TXT(mAtual)}</span><b style="color:rgb(${corAcerto(pctDe(geral[mAtual])) || '120,130,135'})">${pctDe(geral[mAtual]) ?? '—'}${pctDe(geral[mAtual]) != null ? '%' : ''}</b><span class="k-sub">${geral[mAtual].n} inventário(s)${pctDe(geral[mAnt]) != null ? ` · ${MES_TXT(mAnt)}: ${pctDe(geral[mAnt])}%` : ''}</span></div>
      <div class="card rr-kpi"><span class="k-rot">Acerto em 12 meses</span><b>${pctDe(total12) ?? '—'}${pctDe(total12) != null ? '%' : ''}</b><span class="k-sub">${total12.n} inventário(s) · ${total12.enc} de ${total12.esp} encontradas</span></div>
      <div class="card rr-kpi"><span class="k-rot">Melhor CD</span><b class="t-ok">${ranking[0] ? esc(cdCod(ranking[0].c.id)) : '—'}</b><span class="k-sub">${ranking[0] ? `${ranking[0].p}% em ${ranking[0].n} inventário(s)` : 'sem inventários'}</span></div>
      <div class="card rr-kpi"><span class="k-rot">Precisa de atenção</span><b class="${ranking.length > 1 && ranking.at(-1).p < 98 ? 't-bad' : ''}">${ranking.length > 1 ? esc(cdCod(ranking.at(-1).c.id)) : '—'}</b><span class="k-sub">${ranking.length > 1 ? `${ranking.at(-1).p}% em ${ranking.at(-1).n} inventário(s)` : 'só um CD com inventários'}</span></div>
    </div>
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="card-head"><h2>Acerto dos inventários mês a mês</h2><span class="muted" style="font-size:12.5px">máquinas encontradas ÷ esperadas, nos inventários finalizados</span></div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-height:240px" role="img" aria-label="Acerto dos inventários por mês">${barras}</svg>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-pad" style="padding-bottom:0"><h2>Acerto por CD</h2><p class="muted" style="margin:4px 0 0;font-size:13px">Verde: 98% ou mais · amarelo: 90 a 98% · vermelho: abaixo de 90%. Entre parênteses, quantos inventários.</p></div>
      <div class="table-wrap"><table class="heatmap"><thead><tr><th>CD</th>${meses.map((m) => `<th class="num">${MES_TXT(m)}</th>`).join('')}<th class="num">12 meses</th></tr></thead><tbody>
        ${cds.map((c) => `<tr><td><span class="pill pill--cd">${esc(c.codigo)}</span> ${esc(c.nome)}</td>${meses.map((m) => { const x = porCD[c.id][m], p = pctDe(x);
          return `<td class="hm" style="--a:${p == null ? 0 : 0.35};--rgb:${corAcerto(p) || '0,0,0'}">${p == null ? '–' : `<b>${p}%</b><small>(${x.n})</small>`}</td>`; }).join('')}
          ${(() => { const s = somaCD(c.id), p = pctDe(s); return `<td class="hm" style="--a:${p == null ? 0 : 0.5};--rgb:${corAcerto(p) || '0,0,0'}">${p == null ? '–' : `<b>${p}%</b><small>(${s.n})</small>`}</td>`; })()}</tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="card">
      <div class="card-pad" style="padding-bottom:0"><h2>Parque mês a mês</h2><p class="muted" style="margin:4px 0 0;font-size:13px">Foto do parque${state.cdAtual ? ' do CD' : ' dos CDs'} no fim de cada mês (atualizada todo dia). ${fotoMes.length <= 1 ? 'O histórico começa a ser gravado agora: os meses seguintes aparecem aqui automaticamente.' : ''}</p></div>
      ${fotoMes.length ? `<div class="table-wrap"><table><thead><tr><th>Mês</th><th class="num">Equipamentos</th><th class="num">Coletados 30d</th><th class="num">Windows 11</th><th class="num">Windows sem suporte</th><th class="num">Alertas graves</th><th class="num">Sem BitLocker</th><th class="num">Antivírus desligado</th><th class="num">Coletores · bateria ruim</th></tr></thead><tbody>
        ${fotoMes.map((f) => `<tr><td><b>${MES_TXT(f.m)}</b></td><td class="num">${f.total}</td><td class="num">${pc(f.col, f.total)}</td><td class="num">${pc(f.w11, f.win)}</td><td class="num ${f.sup ? 't-bad' : ''}">${f.sup}</td><td class="num ${f.grav ? 't-bad' : ''}">${f.grav}</td><td class="num">${f.blk}</td><td class="num">${f.av}</td><td class="num">${f.colet} · ${f.bat}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card-pad"><p class="muted">Sem dados ainda. Aplique as migrações do banco (veja o README).</p></div>'}
    </div>`;
  $('#rid-exp').onclick = () => modalExportar([{ v: 'ind', rotulo: 'Indicadores desta tela', sub: 'acerto por CD e por mês + parque mês a mês (duas abas)', gerar: exportarIndicadores }]);
}
export function exportarIndicadores() {
  const { meses, cds, porCD, pctDe, somaCD, fotoMes, pc } = state.indicadores;
  const col = (t, w = 11) => ({ t, w });
  const acerto = { nome: 'Acerto por CD', colunas: [col('CD', 10), col('Nome', 26), ...meses.map((m) => col(MES_TXT(m), 9)), col('12 meses', 10), col('Inventários', 11)],
    linhas: cds.map((c) => [c.codigo, c.nome, ...meses.map((m) => pctDe(porCD[c.id][m]) ?? ''), pctDe(somaCD(c.id)) ?? '', somaCD(c.id).n]) };
  const parque = { nome: 'Parque mês a mês', colunas: ['Mês', 'Equipamentos', 'Coletados 30d', 'Windows 11', 'Windows sem suporte', 'Alertas graves', 'Sem BitLocker', 'Antivírus desligado', 'Coletores', 'Bateria ruim'].map((t) => col(t, 14)),
    linhas: fotoMes.map((f) => [MES_TXT(f.m), f.total, pc(f.col, f.total), pc(f.w11, f.win), f.sup, f.grav, f.blk, f.av, f.colet, f.bat]) };
  return { blob: criarXlsx([acerto, parque]), nome: `indicadores-${hojeISO()}.xlsx`, total: cds.length };
}

export async function renderRelatorios(aba = 'parque') {
  const el = $('#view-relatorios');
  el.innerHTML = `
    <div class="view-head">
      ${titulo('Relatórios', state.cdAtual ? `${esc(cdCod(state.cdAtual))} · ${esc(cdNome(state.cdAtual))}` : 'Todos os CDs', 'Clique em um número para abrir a lista de máquinas. Para ver só um CD ou o consolidado de todos, troque o CD no menu lateral.')}
      <div class="actions" id="rel-acoes"></div>
    </div>
    <div class="tabs tabs--page"><a class="tab ${aba === 'parque' ? 'active' : ''}" href="#relatorios/parque">Parque de máquinas</a><a class="tab ${aba === 'inventarios' ? 'active' : ''}" href="#relatorios/inventarios">Inventários</a><a class="tab ${aba === 'indicadores' ? 'active' : ''}" href="#relatorios/indicadores">Indicadores mês a mês</a><a class="tab ${aba === 'renovacao' ? 'active' : ''}" href="#relatorios/renovacao">Renovação</a></div>
    <div id="rel-corpo"></div>`;
  if (aba === 'inventarios') return renderRelInventarios();
  if (aba === 'indicadores') return renderRelIndicadores();
  if (aba === 'renovacao') return renderRelRenovacao();
  return renderRelParque();
}

export function renderRelParque() {
  const f = state.relParque || (state.relParque = { tipo: '' });
  $('#rel-acoes').innerHTML = `<button class="btn" id="rp-csv">Exportar</button><button class="btn btn--primary" id="rp-imprimir">Relatório geral (PDF)</button>`;
  const PROBLEMAS = METRICAS.filter((m) => m.a);
  const desenhar = () => {
    const { linhas, total, base } = dadosParque(f.tipo);
    const pct = (n, t) => (t ? Math.round((100 * n) / t) : 0);
    const saudeGeral = saudeDe(base);
    const graves = base.filter((m) => (m.alertas || []).some((a) => ALERTAS[a]?.grave)).length;
    const cartaoCD = (r) => {
      const t = r.v.total;
      const probs = PROBLEMAS.map((mt) => ({ mt, n: r.v[mt.k] })).filter((x) => x.n > 0)
        .sort((a, b) => (!!b.mt.ruim - !!a.mt.ruim) || b.n - a.n).slice(0, 5);
      const maxN = Math.max(1, ...probs.map((x) => x.n));
      return `<div class="card cd-saude">
        <div class="cs-topo">${anelSaude(saudeDe(r.ms), 78)}
          <div><span class="pill pill--cd">${esc(r.cd.codigo)}</span><h3>${esc(r.cd.nome || '')}</h3>
            <span class="muted">${t} máquina(s) · ${r.v.desk} desk · ${r.v.note} note</span></div></div>
        <div class="cs-online"><span>Coletados nos últimos 30 dias</span><span class="mini-barra"><i style="width:${pct(r.v.online, t)}%;background:var(--ok)"></i></span><b>${pct(r.v.online, t)}%</b></div>
        <div class="cs-probs">${probs.length ? probs.map(({ mt, n }) => `
          <button class="cs-prob ${mt.ruim ? 'ruim' : ''}" data-cd="${r.cd.id || ''}" data-m="${mt.k}">
            <span>${esc(mt.l)}</span><span class="mini-barra" title="${pct(n, t)}% do CD"><i style="width:${Math.max(8, Math.round((100 * n) / maxN))}%"></i></span><b>${n}</b></button>`).join('')
          : '<div class="cs-ok">✅ Nenhum problema encontrado</div>'}</div>
        <div class="cs-pe"><button class="btn btn--sm" data-ver="${r.cd.id || ''}">Ver máquinas</button>${r.cd.id ? `<button class="btn btn--sm btn--ghost" data-relcd="${r.cd.id}">Relatório PDF</button>` : ''}</div>
      </div>`;
    };
    // matriz: só os problemas que aparecem em algum CD
    const linhasMatriz = PROBLEMAS.filter((mt) => linhas.some((r) => r.v[mt.k] > 0));
    const celula = (r, mt) => {
      const n = r.v[mt.k], p = pct(n, r.v.total);
      const cor = mt.ruim ? '214,52,42' : '224,161,11';
      return `<td class="hm ${n ? '' : 'zero'}" style="--a:${n ? Math.max(0.12, Math.min(0.85, p / 60)) : 0};--rgb:${cor}">${n ? `<a data-cd="${r.cd.id || ''}" data-m="${mt.k}"><b>${n}</b><small>${p}%</small></a>` : '–'}</td>`;
    };
    $('#rel-corpo').innerHTML = `
      <div class="rel-filtro"><div class="seg" id="rp-tipo">${[['', 'Todos'], ['desktop', 'Desktops'], ['notebook', 'Notebooks'], ['coletor', 'Coletores']].map(([k, l]) => `<button class="${f.tipo === k ? 'on' : ''}" data-tipo="${k}">${l}</button>`).join('')}</div>
        <span class="muted" style="font-size:13px">${linhas.length} CD(s) · máquinas descartadas não entram</span></div>
      <div class="rel-resumo">
        <div class="card rr-saude">${anelSaude(saudeGeral, 92)}<div><span class="hs-titulo">Saúde geral</span><strong>${base.length - graves} de ${base.length}</strong><span class="muted">máquinas sem problemas importantes</span></div></div>
        <div class="card rr-kpi"><span class="k-rot">Máquinas</span><b>${total.v.total}</b><span class="k-sub">${total.v.desk} desktops · ${total.v.note} notebooks${total.v.colet ? ` · ${total.v.colet} coletores` : ''}</span></div>
        <div class="card rr-kpi"><span class="k-rot">Coletados 30d</span><b class="t-ok">${pct(total.v.online, total.v.total)}%</b><span class="k-sub">${total.v.online} máquina(s)</span></div>
        <div class="card rr-kpi"><span class="k-rot">Problemas importantes</span><b class="${graves ? 't-bad' : ''}">${graves}</b><span class="k-sub">máquinas afetadas</span></div>
      </div>
      <h3 class="sec-rel">Saúde por CD</h3>
      <div class="cds-grid">${linhas.map(cartaoCD).join('')}</div>
      ${linhas.length > 1 && linhasMatriz.length ? `
      <h3 class="sec-rel">Comparativo entre CDs <span class="muted">quanto mais forte a cor, maior a proporção do CD com o problema</span></h3>
      <div class="card"><div class="table-wrap" style="max-height:none"><table class="heatmap">
        <thead><tr><th>Problema</th>${linhas.map((r) => `<th class="num" title="${esc(r.cd.nome)}">${esc(r.cd.codigo)}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>
          <tr class="hm-online"><td>Coletados 30d</td>${linhas.map((r) => `<td class="hm" style="--a:${Math.max(0.1, pct(r.v.online, r.v.total) / 120)};--rgb:22,163,106"><b>${pct(r.v.online, r.v.total)}%</b></td>`).join('')}<td class="num"><b>${pct(total.v.online, total.v.total)}%</b></td></tr>
          ${linhasMatriz.map((mt) => `<tr><td>${mt.ruim ? '<span class="dot dot--offline"></span> ' : ''}${esc(mt.l)}</td>${linhas.map((r) => celula(r, mt)).join('')}<td class="num"><b>${total.v[mt.k]}</b></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}
      <details class="card tabela-completa"><summary>Ver todos os números (tabela completa)</summary>
        <div class="table-wrap" style="max-height:none"><table class="rel-tab">
          <thead><tr><th>CD</th>${METRICAS.map((mt) => `<th class="num">${mt.l}</th>`).join('')}</tr></thead>
          <tbody>${linhas.map((r) => `<tr><td><span class="pill pill--cd">${esc(r.cd.codigo)}</span> ${esc(r.cd.nome)}</td>${METRICAS.map((mt) => `<td class="num ${mt.ruim && r.v[mt.k] ? 'cel-ruim' : ''}">${r.v[mt.k]}</td>`).join('')}</tr>`).join('')}
          ${linhas.length > 1 ? `<tr class="row-total"><td>Total</td>${METRICAS.map((mt) => `<td class="num">${total.v[mt.k]}</td>`).join('')}</tr>` : ''}</tbody></table></div>
      </details>`;
    $$('#rp-tipo [data-tipo]').forEach((b) => (b.onclick = () => { f.tipo = b.dataset.tipo; desenhar(); }));
    $$('#rel-corpo [data-relcd]').forEach((b) => (b.onclick = () => relatorioCD(b.dataset.relcd)));
    const irCD = (cd) => { if (ehAdmin() && cd) { state.cdAtual = cd; store.set('cd-atual', cd); renderSidebar(); } };
    $$('#rel-corpo [data-ver]').forEach((b) => (b.onclick = () => { irCD(b.dataset.ver); irMaquinas(f.tipo ? { tipo: f.tipo } : {}); }));
    $$('#rel-corpo [data-m]').forEach((a) => (a.onclick = () => {
      const mt = METRICAS.find((x) => x.k === a.dataset.m);
      irCD(a.dataset.cd);
      irMaquinas({ ...(mt.ir || {}), ...(mt.a ? { alerta: mt.a } : {}), ...(f.tipo ? { tipo: f.tipo } : {}) });
    }));
  };
  $('#rp-csv').onclick = () => modalExportar([{ v: 'rel', rotulo: 'Tabela deste relatório', sub: 'um CD por linha, com todos os indicadores', gerar: () => {
    const { linhas, total } = dadosParque(f.tipo);
    const rows = [['Código', 'CD', 'Saúde %', ...METRICAS.map((m) => m.l)], ...linhas.map((r) => [r.cd.codigo, r.cd.nome, saudeDe(r.ms) ?? '', ...METRICAS.map((m) => r.v[m.k])]), ['Total', '', saudeDe(total.ms) ?? '', ...METRICAS.map((m) => total.v[m.k])]];
    return { blob: planilhaSimples('Parque por CD', rows), nome: `parque-por-cd-${hojeISO()}.xlsx`, total: linhas.length };
  } }]);
  $('#rp-imprimir').onclick = () => relatorioGeralParque(f.tipo);
  desenhar();
}

export async function carregarConfsRelatorio() {
  const { data: confs, error } = await sb.from('conferencias').select('*').order('criado_em', { ascending: false });
  if (error) throw error;
  const abertas = confs.filter((c) => c.status === 'aberta' || c.total_esperadas == null).map((c) => c.id);
  const itens = [];
  for (let i = 0; i < abertas.length; i += 100) {
    const { data: d } = await sb.from('conferencia_itens').select('conferencia_id, maquina_id').in('conferencia_id', abertas.slice(i, i + 100));
    itens.push(...(d || []));
  }
  confs.forEach((c) => { c.r = resumoConf(c, itens.filter((i) => i.conferencia_id === c.id)); });
  return confs;
}

export async function renderRelInventarios() {
  const corpo = $('#rel-corpo');
  corpo.innerHTML = '<div class="skeleton">Carregando inventários…</div>';
  let confs;
  try { confs = await carregarConfsRelatorio(); } catch (e) { corpo.innerHTML = `<div class="card card-pad erro">${esc(erroMsg(e))}</div>`; return; }
  state.relConfs = confs;
  const f = state.relInv || (state.relInv = { q: '', cd: '', status: '', de: '', ate: '', resp: '' });
  if (!f.cdTocado) f.cd = state.cdAtual || '';
  const responsaveis = [...new Set(confs.map((c) => c.criado_por).filter(Boolean))].sort();
  $('#rel-acoes').innerHTML = `<button class="btn" id="ri-csv">Exportar (Excel)</button><button class="btn btn--primary" id="ri-imprimir">Imprimir lista (PDF)</button>`;
  corpo.innerHTML = `
    <div class="card" style="margin-bottom:12px"><div class="toolbar filtros-rel">
      <div class="search"><input id="ri-q" type="search" placeholder="Buscar inventário ou setor…" value="${esc(f.q)}"></div>
      ${ehAdmin() && state.cds.length > 1 ? `<select id="ri-cd">${opts([['', 'Todos os CDs'], ...state.cds.map((c) => [c.id, `${c.codigo} · ${c.nome}`])], f.cd)}</select>` : ''}
      <select id="ri-status">${opts([['', 'Todos os status'], ['aberta', 'Abertos'], ['finalizada', 'Finalizados']], f.status)}</select>
      <select id="ri-resp">${opts([['', 'Qualquer responsável'], ...responsaveis.map((r) => [r, r])], f.resp)}</select>
      <label class="periodo">De<input type="date" id="ri-de" value="${f.de}"></label>
      <label class="periodo">Até<input type="date" id="ri-ate" value="${f.ate}"></label>
      <button class="btn btn--ghost btn--sm" id="ri-limpar">Limpar</button>
    </div></div>
    <div class="kpis" id="ri-kpis"></div>
    ${ehAdmin() && !f.cd && state.cds.length > 1 ? '<div class="card card-pad" style="margin-bottom:12px"><div class="card-head"><h2>Último inventário de cada CD</h2></div><div id="ri-ultimos"></div></div>' : ''}
    <div class="card"><div class="table-wrap" style="max-height:none"><table class="rel-tab">
      <thead><tr><th>Inventário</th>${ehAdmin() ? '<th>CD</th>' : ''}<th>Setor</th><th>Status</th><th>Responsável</th><th>Início</th><th>Finalizado</th><th>Prazo</th>
        <th class="num">Esperadas</th><th class="num">Encontradas</th><th class="num">Faltando</th><th class="num">Não cad.</th><th class="num">Fora</th><th>Acuracidade</th><th></th></tr></thead>
      <tbody id="ri-tbody"></tbody></table></div></div>`;
  const filtrados = () => {
    const termos = up(f.q).split(/\s+/).filter(Boolean);
    const de = f.de ? new Date(f.de + 'T00:00:00') : null, ate = f.ate ? new Date(f.ate + 'T23:59:59') : null;
    return confs.filter((c) => (!f.cd || c.cd_id === f.cd) && (!f.status || c.status === f.status) && (!f.resp || c.criado_por === f.resp)
      && (!de || new Date(c.criado_em) >= de) && (!ate || new Date(c.criado_em) <= ate)
      && termos.every((t) => up(`${c.nome} ${c.setor} ${cdCod(c.cd_id)} ${cdNome(c.cd_id)}`).includes(t)));
  };
  const somar = (l) => l.reduce((a, c) => ({ esp: a.esp + c.r.esperadas, enc: a.enc + c.r.encontradas, fal: a.fal + c.r.faltando, des: a.des + c.r.desconhecidas, fora: a.fora + c.r.fora }), { esp: 0, enc: 0, fal: 0, des: 0, fora: 0 });
  const barraAc = (p) => `<div class="ac"><span class="meter"><i class="${p < 90 ? (p < 70 ? 'bad' : 'warn') : 'ok'}" style="width:${p}%"></i></span><b>${p}%</b></div>`;
  const desenhar = () => {
    const l = filtrados();
    const t = somar(l);
    const acur = t.esp ? Math.round((100 * t.enc) / t.esp) : 0;
    $('#ri-kpis').innerHTML = `
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Inventários</div><div class="kpi-value">${l.length}</div><div class="kpi-sub">${l.filter((c) => c.status === 'aberta').length} em aberto</div></div>
      <div class="card kpi kpi--ok" style="cursor:default"><div class="kpi-label">Acuracidade geral</div><div class="kpi-value">${acur}%</div><div class="kpi-sub">encontradas ÷ esperadas</div></div>
      <div class="card kpi" style="cursor:default"><div class="kpi-label">Máquinas conferidas</div><div class="kpi-value">${t.enc}</div><div class="kpi-sub">de ${t.esp} esperadas</div></div>
      <div class="card kpi ${t.fal ? 'kpi--bad' : ''}" style="cursor:default"><div class="kpi-label">Faltando</div><div class="kpi-value">${t.fal}</div><div class="kpi-sub">somando os inventários</div></div>
      <div class="card kpi ${t.des ? 'kpi--warn' : ''}" style="cursor:default"><div class="kpi-label">Não cadastradas</div><div class="kpi-value">${t.des}</div><div class="kpi-sub">códigos desconhecidos</div></div>
      ${(() => { const comPrazo = l.filter((c) => c.prazo_em); if (!comPrazo.length) return '';
        const fin = comPrazo.filter((c) => c.status === 'finalizada'); const noPrazo = fin.filter((c) => new Date(c.finalizado_em) <= new Date(c.prazo_em)).length;
        const venc = comPrazo.filter((c) => c.status === 'aberta' && new Date(c.prazo_em) < new Date()).length;
        return `<div class="card kpi ${venc ? 'kpi--bad' : 'kpi--ok'}" style="cursor:default"><div class="kpi-label">Pontualidade</div><div class="kpi-value">${fin.length ? Math.round((100 * noPrazo) / fin.length) + '%' : '—'}</div><div class="kpi-sub">${noPrazo}/${fin.length} no prazo${venc ? ` · ${venc} vencido(s) em aberto` : ''}</div></div>`; })()}`;
    if ($('#ri-ultimos')) {
      const ult = state.cds.map((cd) => ({ cd, c: confs.find((c) => c.cd_id === cd.id) }));
      $('#ri-ultimos').innerHTML = `<table class="mini-table"><thead><tr><th>CD</th><th>Último inventário</th><th>Data</th><th>Status</th><th>Acuracidade</th></tr></thead><tbody>
        ${ult.map(({ cd, c }) => `<tr><td><span class="pill pill--cd">${esc(cd.codigo)}</span> ${esc(cd.nome)}</td>${c ? `<td><a data-rel="${c.id}">${esc(c.nome)}</a></td><td>${data(c.criado_em)}</td><td>${pill(c.status === 'aberta' ? 'Aberto' : 'Finalizado', c.status === 'aberta' ? 'info' : 'ok')}</td><td>${barraAc(c.r.pct)}</td>` : '<td colspan="4" class="muted">Nenhum inventário ainda</td>'}</tr>`).join('')}
      </tbody></table>`;
    }
    $('#ri-tbody').innerHTML = l.length ? l.map((c) => `<tr data-conf="${c.id}">
      <td><a data-rel="${c.id}"><strong>${esc(c.nome)}</strong></a></td>${ehAdmin() ? `<td><span class="pill pill--cd" title="${esc(cdNome(c.cd_id))}">${esc(cdCod(c.cd_id))}</span></td>` : ''}
      <td>${esc(c.setor || 'Todos')}</td><td>${pill(c.status === 'aberta' ? 'Aberto' : 'Finalizado', c.status === 'aberta' ? 'info' : 'ok')}</td>
      <td>${esc((c.criado_por || '').split('@')[0])}</td><td>${data(c.criado_em)}</td><td>${c.finalizado_em ? data(c.finalizado_em) : '—'}</td>
      <td>${c.prazo_em ? etiquetaPrazo(c) : '<span class="muted">—</span>'}</td>
      <td class="num">${c.r.esperadas}</td><td class="num">${c.r.encontradas}</td><td class="num ${c.r.faltando ? 'cel-ruim' : ''}">${c.r.faltando}</td><td class="num">${c.r.desconhecidas}</td><td class="num">${c.r.fora}</td>
      <td>${barraAc(c.r.pct)}</td>
      <td class="acoes"><button class="btn btn--sm btn--ghost" data-ac="abrir">Abrir</button>${ehAdmin() ? '<button class="btn btn--sm btn--ghost" data-ac="editar">Editar</button><button class="btn btn--sm btn--ghost btn--txt-bad" data-ac="excluir">Excluir</button>' : ''}</td></tr>`).join('')
      + (l.length > 1 ? `<tr class="row-total"><td colspan="${ehAdmin() ? 8 : 7}">Total (${l.length})</td><td class="num">${t.esp}</td><td class="num">${t.enc}</td><td class="num">${t.fal}</td><td class="num">${t.des}</td><td class="num">${t.fora}</td><td>${barraAc(acur)}</td><td></td></tr>` : '')
      : `<tr><td colspan="15" class="empty">Nenhum inventário com esses filtros.</td></tr>`;
  };
  const bind = (id, k, ev = 'onchange') => { const e = $('#' + id); if (e) e[ev] = (x) => { f[k] = x.target.value; if (k === 'cd') f.cdTocado = true; desenhar(); }; };
  $('#ri-q').oninput = debounce((x) => { f.q = x.target.value; desenhar(); }, 150);
  bind('ri-cd', 'cd'); bind('ri-status', 'status'); bind('ri-resp', 'resp'); bind('ri-de', 'de'); bind('ri-ate', 'ate');
  $('#ri-limpar').onclick = () => { Object.assign(f, { q: '', cd: ehAdmin() ? '' : f.cd, status: '', de: '', ate: '', resp: '', cdTocado: true }); renderRelInventarios(); };
  corpo.onclick = async (e) => {
    const rel = e.target.closest('[data-rel]'); if (rel) return relatorioInventario(rel.dataset.rel);
    const b = e.target.closest('[data-ac]'); if (!b) return;
    const c = confs.find((x) => x.id === b.closest('tr').dataset.conf);
    if (b.dataset.ac === 'abrir') location.hash = '#conferencia/' + c.id;
    if (b.dataset.ac === 'editar') modalConf(c);
    if (b.dataset.ac === 'excluir' && await excluirConf(c)) renderRelInventarios();
  };
  $('#ri-csv').onclick = () => {
    const l = filtrados();
    const rows = [['Inventário', 'Código CD', 'CD', 'Setor', 'Status', 'Responsável', 'Início', 'Finalizado', 'Esperadas', 'Encontradas', 'Faltando', 'Não cadastradas', 'Fora do esperado', 'Acuracidade %'],
      ...l.map((c) => [c.nome, cdCod(c.cd_id), cdNome(c.cd_id), c.setor || 'Todos', c.status === 'aberta' ? 'Aberto' : 'Finalizado', c.criado_por, dataHora(c.criado_em), c.finalizado_em ? dataHora(c.finalizado_em) : '', c.r.esperadas, c.r.encontradas, c.r.faltando, c.r.desconhecidas, c.r.fora, c.r.pct])];
    baixarBlob(planilhaSimples('Inventários', rows), `inventarios-${hojeISO()}.xlsx`);
  };
  $('#ri-imprimir').onclick = () => {
    const l = filtrados(); const t = somar(l);
    const filtrosTxt = [f.cd && `CD ${cdCod(f.cd)}`, f.status && (f.status === 'aberta' ? 'abertos' : 'finalizados'), f.resp && `responsável ${f.resp}`, f.de && `de ${dataBR(f.de)}`, f.ate && `até ${dataBR(f.ate)}`, f.q && `busca "${f.q}"`].filter(Boolean).join(' · ') || 'sem filtros';
    abrirRelatorio('Relatório de inventários', `${l.length} inventário(s) · ${esc(filtrosTxt)}`, `
      ${kpisRel([['Inventários', l.length], ['Acuracidade geral', (t.esp ? Math.round((100 * t.enc) / t.esp) : 0) + '%', 'ok'], ['Encontradas', `${t.enc} / ${t.esp}`], ['Faltando', t.fal, t.fal ? 'bad' : ''], ['Não cadastradas', t.des]])}
      <table><thead><tr><th>Inventário</th><th>CD</th><th>Setor</th><th>Status</th><th>Responsável</th><th>Início</th><th>Fim</th><th class="n">Esp.</th><th class="n">Enc.</th><th class="n">Falt.</th><th class="n">Não cad.</th><th class="n">Acur.</th></tr></thead><tbody>
      ${l.map((c) => `<tr><td>${esc(c.nome)}</td><td>${esc(cdCod(c.cd_id))}</td><td>${esc(c.setor || 'Todos')}</td><td>${c.status === 'aberta' ? 'Aberto' : 'Finalizado'}</td><td>${esc((c.criado_por || '').split('@')[0])}</td><td>${data(c.criado_em)}</td><td>${c.finalizado_em ? data(c.finalizado_em) : '—'}</td><td class="n">${c.r.esperadas}</td><td class="n">${c.r.encontradas}</td><td class="n">${c.r.faltando}</td><td class="n">${c.r.desconhecidas}</td><td class="n">${c.r.pct}%</td></tr>`).join('')}
      <tr class="total"><td colspan="7">Total</td><td class="n">${t.esp}</td><td class="n">${t.enc}</td><td class="n">${t.fal}</td><td class="n">${t.des}</td><td class="n">${t.esp ? Math.round((100 * t.enc) / t.esp) : 0}%</td></tr></tbody></table>`);
  };
  desenhar();
}

// ---------------------------------------------------------------- janelas de relatório (imprimir / PDF)
export function kpisRel(itens) {
  return `<div class="kpis">${itens.map(([l, v, cls]) => `<div class="kpi ${cls || ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
}
export function distRel(titulo, pares) {
  const tot = pares.reduce((a, p) => a + p[1], 0) || 1;
  return `<div><h2>${titulo}</h2><table><tbody>${pares.map(([k, n]) => `<tr><td>${esc(k)}</td><td style="width:45%"><div class="bar"><i style="width:${(100 * n) / tot}%"></i></div></td><td class="n">${n}</td><td class="n">${Math.round((100 * n) / tot)}%</td></tr>`).join('')}</tbody></table></div>`;
}
export const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" xmlns:c2pa="http://c2pa.org/manifest"><metadata><c2pa:manifest>AAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYTo5Nzg2NTliNC01NGQxLTRlN2YtOWM1Zi1hZWQ4ZTE3MTM3ZTgAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaB78rESD5ZblQB3/0hn5UosAAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDpmNjM2NWRlZS1mOGM1LTQ3YTQtYjFmZi1iOWI1ZGQ5Zjc3OTdscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNoCesrCbNp4DJjzijMdXnmiAAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFggLJSXadGHdbHznwllDKwHoYNJM5mV0Fv72djZuoR3LVWkZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaC7PzB8TTrDn3hOQd6aVvicAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRNAAAAAAAAAAAAAAAAAGRoYXNoWCDRjn7YobVZOix//VLHStZRBGZmSuHPZdcUegbZukrqhWRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBh9Zmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjk3ODY1OWI0LTU0ZDEtNGU3Zi05YzVmLWFlZDhlMTcxMzdlOC9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOmQ2YjE3M2MzLWQ2YzktNGEyMS1iZjhiLTg2ZWY3NmNlYTAxZnJjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCAslJdp0Yd1sfOfCWUMrAehg0kzmZXQW/vZ2Nm6hHctVaJjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFggjjvl4ivi27bjwwzebsFqgijdiYjRK52skrOtiEwDNpeiY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFggwEHycfQfdEJHnJKHsIwdKUH6dd/0beX1mTyvWxwV/8d0Y2xhaW1fZ2VuZXJhdG9yX2luZm+jZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g/oGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd/3cyjxFA3Qo5S46fX0/ihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB/wQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj+OPEz5o+nMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn/aArXyTwFAZfKrPzxF2vPoJNf1+UCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9+1rdDwSPLMOPOjKuiXjoU/pUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQMe+2kGPMyWwbrxfGjBxuk9gPWb3iThBvZN51FJ3G4tiu9pgKql3cUwCEgq7o7CePAfEE6HPGxuA/pW8brpuhzc=</c2pa:manifest></metadata><defs><mask id="qmr" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><rect width="200" height="200" fill="#fff"/><line x1="124" y1="124" x2="157" y2="157" stroke="#000" stroke-width="45" stroke-linecap="round"/></mask></defs><circle cx="99.5" cy="99.5" r="65" fill="none" stroke="#1C9BA9" stroke-width="33" mask="url(#qmr)"/><line x1="125" y1="125" x2="156" y2="156" stroke="#FF8221" stroke-width="31" stroke-linecap="round"/></svg>';
export function abrirRelatorio(titulo, subtitulo, corpo, janela) {
  const w = janela || window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para abrir o relatório.', true);
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    @page { size: A4; margin: 13mm 11mm; }
    body { font: 12px/1.45 "Segoe UI", Arial, sans-serif; color: #0e1d20; margin: 0; background: #fff; }
    .barra { position: sticky; top: 0; background: #0c2226; color: #fff; padding: 10px 18px; display: flex; gap: 10px; justify-content: space-between; align-items: center; }
    .barra button { background: #1c9ba9; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 600; cursor: pointer; font: inherit; }
    main { max-width: 1040px; margin: 0 auto; padding: 22px 20px; }
    header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #1c9ba9; padding-bottom: 10px; margin-bottom: 14px; position: relative; }
    header::after { content: ""; position: absolute; left: 0; bottom: -3px; width: 70px; height: 3px; background: #ff8221; }
    header svg { width: 44px; height: 44px; flex: none; } .cli { margin-left: auto; text-align: right; } .cli span { display: block; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #7a8f93; } .cli img { display: block; height: 40px; width: auto; margin-left: auto; } header h1 { font-size: 19px; margin: 0; } header p { margin: 2px 0 0; color: #557276; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; margin: 12px 0 6px; }
    .kpi { border: 1px solid #dde6e8; border-radius: 8px; padding: 8px 10px; } .kpi b { display: block; font-size: 19px; } .kpi span { color: #627a7f; font-size: 11px; }
    .kpi.bad b { color: #cc2b20; } .kpi.ok b { color: #127f8b; } .kpi.warn b { color: #b25f00; }
    h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; color: #127f8b; margin: 18px 0 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; } th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e3eaec; vertical-align: top; }
    th { background: #f1f5f6; font-weight: 600; color: #33474b; } .n { text-align: right; white-space: nowrap; }
    tr.total td { font-weight: 700; border-top: 2px solid #0e1d20; background: #f6f9fa; }
    .ruim { color: #cc2b20; font-weight: 700; }
    .bar { height: 7px; background: #ecf1f2; border-radius: 9px; overflow: hidden; } .bar i { display: block; height: 100%; background: #1c9ba9; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; } .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 18px; }
    .tag { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #fdf1df; color: #b25f00; margin: 1px; white-space: nowrap; }
    .tag.bad { background: #fde8e6; color: #cc2b20; } .mono { font-family: Consolas, monospace; } .muted { color: #7a8f93; }
    footer { margin-top: 22px; color: #8a9b9e; font-size: 10px; border-top: 1px solid #e3eaec; padding-top: 6px; }
    @media print { .barra { display: none; } main { padding: 0; max-width: none; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
  </style></head><body><div class="barra"><span>${esc(titulo)}</span><button type="button" id="btn-imprimir">Imprimir / Salvar PDF</button></div>
  <main><header>${LOGO_SVG}<div><h1>${esc(titulo)}</h1><p>${subtitulo}</p></div><div class="cli"><img src="${LOGO_CLIENTE_URL}" alt="RaiaDrogasil S.A."></div></header>${corpo}
  <footer>Inventário Quallit · gerado em ${dataHora(new Date().toISOString())} por ${esc(state.perfil?.nome || state.user?.email || '')}</footer></main></body></html>`);
  w.document.close();
  // botão ligado pelo código do painel (a política de segurança CSP bloqueia onclick embutido)
  w.document.getElementById('btn-imprimir')?.addEventListener('click', () => w.print());
}

export function relatorioGeralParque(tipo = '') {
  const { linhas, total, base } = dadosParque(tipo);
  const pct = (n, t) => (t ? Math.round((100 * n) / t) : 0);
  const sub = `${state.cdAtual ? esc(cdCod(state.cdAtual) + ' · ' + cdNome(state.cdAtual)) : `${linhas.length} CD(s)`} · ${tipo ? { desktop: 'só desktops', notebook: 'só notebooks', coletor: 'só coletores' }[tipo] || TIPO[tipo] : 'todos os equipamentos'} · ${data(new Date().toISOString())}`;
  abrirRelatorio('Relatório geral do parque', sub, `
    ${kpisRel([['Máquinas', total.v.total], ['Coletados 30d', pct(total.v.online, total.v.total) + '%', 'ok'], ['Coleta +6 meses', total.v.semc, total.v.semc ? 'bad' : ''],
      ['Windows sem suporte', total.v.so, total.v.so ? 'bad' : ''], ['Peça removida', total.v.peca, total.v.peca ? 'bad' : ''], ['Emprestados', total.v.emp], ['Mais de 5 anos', total.v.ren, total.v.ren ? 'warn' : '']])}
    <h2>Indicadores por CD</h2>
    <table><thead><tr><th>CD</th>${METRICAS.map((m) => `<th class="n">${m.l}</th>`).join('')}</tr></thead><tbody>
      ${linhas.map((r) => `<tr><td><b>${esc(r.cd.codigo)}</b> ${esc(r.cd.nome)}</td>${METRICAS.map((m) => `<td class="n ${m.ruim && r.v[m.k] ? 'ruim' : ''}">${r.v[m.k]}${m.pct ? ` (${pct(r.v[m.k], r.v.total)}%)` : ''}</td>`).join('')}</tr>`).join('')}
      ${linhas.length > 1 ? `<tr class="total"><td>Total</td>${METRICAS.map((m) => `<td class="n">${total.v[m.k]}</td>`).join('')}</tr>` : ''}
    </tbody></table>
    <div class="grid3">
      ${distRel('Sistema operacional', contar(base, soGrupo))}
      ${distRel('Memória RAM', contar(base, ramFaixa).sort((a, b) => ['4 GB ou menos', '8 GB', '16 GB', '32 GB ou mais', 'Sem dado'].indexOf(a[0]) - ['4 GB ou menos', '8 GB', '16 GB', '32 GB ou mais', 'Sem dado'].indexOf(b[0])))}
      ${distRel('Armazenamento', contar(base, tipoDisco))}
      ${distRel('Idade do parque', contar(base, idadeFaixa).sort((a, b) => ORDEM_IDADE.indexOf(a[0]) - ORDEM_IDADE.indexOf(b[0])))}
      ${distRel('Garantia', contar(base, garantiaFaixa).sort((a, b) => ORDEM_GAR.indexOf(a[0]) - ORDEM_GAR.indexOf(b[0])))}
      ${distRel('Status', contar(base, (m) => STATUS[m.status]))}
    </div>`);
}

export async function relatorioCD(cdId) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para abrir o relatório.', true);
  w.document.write('<p style="font:16px sans-serif;padding:24px">Gerando relatório…</p>');
  const cd = cdDe(cdId) || { codigo: '—', nome: '' };
  const ms = state.maquinas.filter((m) => m.cd_id === cdId && m.status !== 'descartado');
  const v = Object.fromEntries(METRICAS.map((mt) => [mt.k, ms.filter((m) => temMetrica(mt, m)).length]));
  const graves = ms.filter((m) => (m.alertas || []).some((a) => ALERTAS[a]?.grave)).sort((a, b) => (b.alertas || []).length - (a.alertas || []).length);
  const emp = ms.filter((m) => m.emprestimo_atual);
  const { data: confs } = await sb.from('conferencias').select('*').eq('cd_id', cdId).order('criado_em', { ascending: false }).limit(8);
  const pct = (n) => (v.total ? Math.round((100 * n) / v.total) : 0);
  abrirRelatorio(`Relatório do CD ${cd.codigo}`, `${esc(cd.nome)}${cd.cidade ? ' · ' + esc(cd.cidade) + (cd.uf ? '/' + esc(cd.uf) : '') : ''} · ${data(new Date().toISOString())}`, `
    ${kpisRel([['Máquinas', v.total], ['Desktops / notebooks', `${v.desk} / ${v.note}`], ['Coletados 30d', pct(v.online) + '%', 'ok'], ['Coleta +6 meses', v.semc, v.semc ? 'bad' : ''],
      ['Windows sem suporte', v.so, v.so ? 'bad' : ''], ['Peça removida', v.peca, v.peca ? 'bad' : ''], [v.atr ? `Emprestados · ${v.atr} atrasado(s)` : 'Emprestados', v.emp, v.atr ? 'bad' : ''], ['Garantia ≤ 30d', v.gar, v.gar ? 'warn' : '']])}
    <div class="grid3">
      ${distRel('Sistema operacional', contar(ms, soGrupo))}
      ${distRel('Memória RAM', contar(ms, ramFaixa))}
      ${distRel('Armazenamento', contar(ms, tipoDisco))}
      ${distRel('Idade', contar(ms, idadeFaixa).sort((a, b) => ORDEM_IDADE.indexOf(a[0]) - ORDEM_IDADE.indexOf(b[0])))}
      ${distRel('Garantia', contar(ms, garantiaFaixa).sort((a, b) => ORDEM_GAR.indexOf(a[0]) - ORDEM_GAR.indexOf(b[0])))}
      ${distRel('Setores', contar(ms, (m) => m.setor || 'Sem setor'))}
    </div>
    <h2>Máquinas com alertas importantes (${graves.length})</h2>
    ${graves.length ? `<table><thead><tr><th>Hostname</th><th>Patrimônio</th><th>Tipo / modelo</th><th>Setor</th><th>Última coleta</th><th>Alertas</th></tr></thead><tbody>
      ${graves.map((m) => `<tr><td class="mono">${esc(m.hostname)}</td><td class="mono">${esc(m.ativo || '—')}</td><td>${esc(TIPO[m.tipo])} ${esc(m.modelo || '')}</td><td>${esc(m.setor || '—')}</td><td>${m.ultimo_online ? dataHora(m.ultimo_online) : 'nunca'}</td>
        <td>${(m.alertas || []).map((a) => `<span class="tag ${ALERTAS[a]?.grave ? 'bad' : ''}">${esc(ALERTAS[a]?.l || a)}</span>`).join('')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nenhum alerta importante. 🎉</p>'}
    <h2>Empréstimos em aberto (${emp.length})</h2>
    ${emp.length ? `<table><thead><tr><th>Equipamento</th><th>Colaborador</th><th>Retirada</th><th>Devolução prevista</th></tr></thead><tbody>
      ${emp.map((m) => { const e = m.emprestimo_atual; const at = e.previsto_devolucao && new Date(e.previsto_devolucao) < new Date();
        return `<tr><td class="mono">${esc(m.hostname)} ${esc(m.ativo || '')}</td><td>${esc(e.colaborador)} ${esc(e.matricula || '')}</td><td>${dataHora(e.retirado_em)}</td><td class="${at ? 'ruim' : ''}">${e.previsto_devolucao ? dataHora(e.previsto_devolucao) : '—'}${at ? ' (atrasado)' : ''}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">Nenhum equipamento emprestado.</p>'}
    <h2>Últimos inventários</h2>
    ${(confs || []).length ? `<table><thead><tr><th>Inventário</th><th>Setor</th><th>Status</th><th>Início</th><th class="n">Esperadas</th><th class="n">Encontradas</th><th class="n">Faltando</th><th class="n">Acuracidade</th></tr></thead><tbody>
      ${confs.map((c) => { const r = resumoConf(c, []); const ok = c.status === 'finalizada' && c.total_esperadas != null;
        return `<tr><td>${esc(c.nome)}</td><td>${esc(c.setor || 'Todos')}</td><td>${c.status === 'aberta' ? 'Aberto' : 'Finalizado'}</td><td>${data(c.criado_em)}</td><td class="n">${ok ? r.esperadas : '—'}</td><td class="n">${ok ? r.encontradas : '—'}</td><td class="n">${ok ? r.faltando : '—'}</td><td class="n">${ok ? r.pct + '%' : 'em andamento'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">Nenhum inventário registrado.</p>'}`, w);
}

export async function relatorioInventario(confId) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups deste site para abrir o relatório.', true);
  w.document.write('<p style="font:16px sans-serif;padding:24px">Gerando relatório…</p>');
  const [{ data: c, error }, { data: itens }] = await Promise.all([
    sb.from('conferencias').select('*').eq('id', confId).single(),
    sb.from('conferencia_itens').select('*').eq('conferencia_id', confId).order('lido_em'),
  ]);
  if (error) { w.close(); return toast(erroMsg(error), true); }
  const k = calcularConf(c, itens || []);
  const pct = k.esperadasN ? Math.round((100 * k.achadasEsperadas) / k.esperadasN) : 0;
  const tabelaMaq = (lista, extra) => `<table><thead><tr><th>Hostname</th><th>Patrimônio</th><th>Tipo / modelo</th><th>Setor / local</th>${extra.cab}</tr></thead><tbody>
    ${lista.map((x) => { const m = x.m || x; return `<tr><td class="mono">${esc(m.hostname)}</td><td class="mono">${esc(m.ativo || '—')}</td><td>${esc(TIPO[m.tipo] || '')} ${esc(m.modelo || '')}</td><td>${esc(m.setor || '—')}${m.localizacao ? ' · ' + esc(m.localizacao) : ''}</td>${extra.cel(x)}</tr>`; }).join('')}</tbody></table>`;
  abrirRelatorio(`Inventário: ${c.nome}`, `${esc(cdCod(c.cd_id))} · ${esc(cdNome(c.cd_id))} · ${esc(c.setor || 'todos os setores')} · ${c.status === 'aberta' ? 'em andamento' : 'finalizado em ' + dataHora(c.finalizado_em)}`, `
    ${kpisRel([['Acuracidade', pct + '%', pct >= 95 ? 'ok' : pct >= 80 ? 'warn' : 'bad'], ['Encontradas', `${k.achadasEsperadas} / ${k.esperadasN}`], ['Faltando', k.faltando.length, k.faltando.length ? 'bad' : ''],
      ['Fora do esperado', k.foraDoEsperado.length, k.foraDoEsperado.length ? 'warn' : ''], ['Não cadastradas', k.desconhecidos.length, k.desconhecidos.length ? 'warn' : ''], ['Leituras', (itens || []).length]])}
    <table style="margin-top:8px"><tbody>
      <tr><th style="width:22%">Iniciado</th><td>${dataHora(c.criado_em)} por ${esc(c.criado_por || '—')}</td><th style="width:22%">Finalizado</th><td>${c.finalizado_em ? `${dataHora(c.finalizado_em)} por ${esc(c.finalizado_por || '—')}` : '—'}</td></tr>
    </tbody></table>
    <h2>Faltando (${k.faltando.length})</h2>
    ${k.faltando.length ? tabelaMaq(k.faltando, { cab: '<th>Última coleta</th>', cel: (m) => `<td>${m.ultimo_online ? dataHora(m.ultimo_online) : 'nunca'}</td>` }) : '<p class="muted">Nenhuma máquina faltando.</p>'}
    ${k.foraDoEsperado.length ? `<h2>Encontradas fora do esperado (${k.foraDoEsperado.length})</h2>${tabelaMaq(k.foraDoEsperado, { cab: '<th>Motivo</th><th>Lida em</th>', cel: (x) => `<td>${x.m.cd_id !== c.cd_id ? 'Outro CD: ' + esc(cdCod(x.m.cd_id)) : ['extraviado', 'descartado'].includes(x.m.status) ? 'Estava ' + esc(STATUS[x.m.status]) : 'Outro setor'}</td><td>${dataHora(x.item.lido_em)}</td>` })}` : ''}
    ${k.desconhecidos.length ? `<h2>Códigos não cadastrados (${k.desconhecidos.length})</h2><table><thead><tr><th>Código lido</th><th>Local</th><th>Lido em</th><th>Por</th></tr></thead><tbody>
      ${k.desconhecidos.map((i) => `<tr><td class="mono">${esc(i.codigo_lido)}</td><td>${esc(i.localizacao || '—')}</td><td>${dataHora(i.lido_em)}</td><td>${esc(i.lido_por || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    <h2>Encontradas (${k.encontradas.length - k.foraDoEsperado.length})</h2>
    ${tabelaMaq(k.encontradas.filter((x) => !k.foraDoEsperado.includes(x)), { cab: '<th>Lida em</th><th>Local da leitura</th><th>Por</th>', cel: (x) => `<td>${dataHora(x.item.lido_em)}</td><td>${esc(x.item.localizacao || '—')}</td><td>${esc((x.item.lido_por || '').split('@')[0])}</td>` })}`, w);
}
