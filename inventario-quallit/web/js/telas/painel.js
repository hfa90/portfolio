// Inventário Quallit — tela: painel (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { $, $$, ALERTAS, CAMPOS_HIST, SIT, STATUS, TIPO, ativas, cdCod, cdNome, dataBR, esc, garantiaFaixa, gb, idadeFaixa, mostrarColCD, noCD, ramFaixa, rel, sb, situacao, soGrupo, state, store, tipoDisco } from '../nucleo.js';
import { anelPrazo, etiquetaPrazo, fmtDuracao } from '../prazo.js';
import { irMaquinas } from '../rotas.js';
import { resumoConf } from '../telas/inventarios.js';
import { abrirMaquina, campo } from '../telas/maquinas.js';

/* =====================================================================
   PAINEL
   ===================================================================== */
export function contar(lista, fn) {
  const m = new Map();
  for (const x of lista) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
export function barras(pares, filtroKey, corFn = () => '', limite = 8) {
  if (!pares.length) return '<p class="muted">Sem dados ainda.</p>';
  const max = Math.max(...pares.map((p) => p[1]));
  return `<div class="bars">${pares.slice(0, limite).map(([k, n]) => `
    <button class="bar" data-f="${filtroKey}" data-v="${esc(k)}" title="Ver ${n} máquina(s)">
      <span class="bar-label">${esc(k)}</span>
      <span class="bar-track"><span class="bar-fill ${corFn(k)}" style="width:${(n / max) * 100}%"></span></span>
      <span class="bar-n">${n}</span>
    </button>`).join('')}</div>`;
}

// ---- composição do parque: uma dimensão por vez, barra empilhada 100% + legenda clicável
export const PALETA = ['#1c9ba9', '#ff8221', '#3a5fd0', '#8e5bd6', '#16a36a', '#e0a10b', '#d6342a', '#64748b', '#0f6f7a', '#c2410c'];
export const DIST = {
  so:       { l: 'Sistema', fn: soGrupo, f: 'so', cor: (k) => (/Windows 11|Server/.test(k) ? '#16a36a' : /Windows (10|8|7)/.test(k) ? '#d6342a' : '#94a3b8') },
  ram:      { l: 'Memória', fn: ramFaixa, f: 'ram', ordem: ['4 GB ou menos', '8 GB', '16 GB', '32 GB ou mais', 'Sem dado'], cor: (k) => ({ '4 GB ou menos': '#d6342a', '8 GB': '#e0a10b', '16 GB': '#16a36a', '32 GB ou mais': '#0f8a5f' }[k] || '#94a3b8') },
  disco:    { l: 'Armazenamento', fn: tipoDisco, f: 'disco', cor: (k) => ({ SSD: '#16a36a', HDD: '#d6342a', 'SSD + HDD': '#e0a10b' }[k] || '#94a3b8') },
  contato:  { l: 'Última coleta', fn: (m) => SIT[situacao(m)], f: 'situacao', ordem: Object.values(SIT), cor: (k) => ({ [SIT.online]: '#16a36a', [SIT.recente]: '#3a5fd0', [SIT.ausente]: '#e0a10b', [SIT.offline]: '#d6342a' }[k] || '#94a3b8') },
  idade:    { l: 'Idade', fn: idadeFaixa, f: 'idade', ordem: ['0 a 2 anos', '3 a 4 anos', '5 anos ou mais', 'Sem data de compra'], cor: (k) => ({ '0 a 2 anos': '#16a36a', '3 a 4 anos': '#e0a10b', '5 anos ou mais': '#d6342a' }[k] || '#94a3b8') },
  garantia: { l: 'Garantia', fn: garantiaFaixa, f: 'garantia', ordem: ['Vigente', 'Vence em 90 dias', 'Vence em 30 dias', 'Vencida', 'Sem informação'], cor: (k) => ({ Vigente: '#16a36a', 'Vence em 90 dias': '#3a5fd0', 'Vence em 30 dias': '#e0a10b', Vencida: '#d6342a' }[k] || '#94a3b8') },
  setor:    { l: 'Setores', fn: (m) => m.setor || 'Sem setor', f: 'setor' },
  status:   { l: 'Status', fn: (m) => STATUS[m.status], f: 'status' },
};
export function composicao(lista, chave) {
  const d = DIST[chave];
  let pares = contar(lista, d.fn);
  if (d.ordem) pares.sort((a, b) => d.ordem.indexOf(a[0]) - d.ordem.indexOf(b[0]));
  const total = pares.reduce((s, p) => s + p[1], 0) || 1;
  const cor = (k, i) => (d.cor ? d.cor(k) : PALETA[i % PALETA.length]);
  return `<div class="pilha-barra">${pares.map(([k, n], i) => `<span style="width:${(100 * n) / total}%;background:${cor(k, i)}" title="${esc(k)}: ${n}"></span>`).join('')}</div>
    <div class="legenda">${pares.map(([k, n], i) => `<button class="leg" data-f="${d.f}" data-v="${esc(k)}"><i style="background:${cor(k, i)}"></i><span>${esc(k)}</span><b>${n}</b><small>${Math.round((100 * n) / total)}%</small></button>`).join('')}</div>`;
}
export function irFiltroDist(f, v) {
  if (f === 'situacao') v = Object.keys(SIT).find((k) => SIT[k] === v);
  if (f === 'status') v = Object.keys(STATUS).find((k) => STATUS[k] === v);
  if (f === 'setor' && v === 'Sem setor') v = '_vazio';
  irMaquinas({ [f]: v });
}

// ---- saúde: % das máquinas ativas sem nenhum alerta importante
export function saudeDe(lista) {
  if (!lista.length) return null;
  const ok = lista.filter((m) => !(m.alertas || []).some((a) => ALERTAS[a]?.grave)).length;
  return Math.round((100 * ok) / lista.length);
}
export function anelSaude(p, tam = 120) {
  const r = 44, c = 2 * Math.PI * r;
  const cor = p == null ? '#94a3b8' : p >= 90 ? '#16a36a' : p >= 70 ? '#e0a10b' : '#d6342a';
  return `<span class="anel-saude" style="--tam:${tam}px;--cor:${cor}"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" class="as-fundo"/><circle cx="50" cy="50" r="${r}" class="as-arco" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - (p || 0) / 100)).toFixed(1)}"/></svg><b>${p == null ? '—' : p + '%'}</b></span>`;
}

// ---- inventários abertos + agendamentos (para painel e prazos)
export async function carregarResumoInv() {
  try { await sb.rpc('gerar_inventarios_agendados'); } catch { /* sem o 05 ainda */ }
  const [c, a] = await Promise.all([
    sb.from('conferencias').select('*, conferencia_itens(maquina_id, lido_em)').eq('status', 'aberta').order('prazo_em', { ascending: true, nullsFirst: false }),
    sb.from('agendamentos').select('*').eq('ativo', true).order('proxima_execucao'),
  ]);
  state.resumoInv = { abertas: c.data || [], agendamentos: a.error ? null : a.data || [] };
  return state.resumoInv;
}
export function infoProgresso(c) {
  const itens = c.conferencia_itens || [];
  const r = resumoConf(c, itens);
  const prim = itens.map((i) => i.lido_em).filter(Boolean).sort()[0];
  return { encontradas: r.encontradas, esperadas: r.esperadas, primeiraLeitura: prim, pct: r.pct };
}

export function renderPainel() {
  const el = $('#view-painel');
  const L = ativas();
  const by = (fn) => L.filter(fn).length;
  const saude = saudeDe(L);
  const online = by((m) => situacao(m) === 'online');
  const graves = by((m) => (m.alertas || []).some((a) => ALERTAS[a]?.grave));
  const semContato = by((m) => situacao(m) === 'offline');
  const escopo = state.cdAtual ? `${cdCod(state.cdAtual)} · ${cdNome(state.cdAtual)}` : state.cds.length > 1 ? `Todos os CDs (${state.cds.length})` : '';
  state.distAba ||= store.get('dist-aba') || 'so';

  if (!state.maquinas.length || !L.length) {
    el.innerHTML = `<div class="view-head"><div><h1>Painel</h1><p>${esc(escopo)}</p></div></div>
      <div class="card card-pad empty"><h2>Nenhuma máquina ${L.length ? '' : 'neste CD '}ainda</h2>
      <p>Envie o link de registro para os colaboradores, use o Invent_local na pasta de rede ou cadastre manualmente.</p>
      <div class="actions" style="justify-content:center"><a class="btn btn--primary" href="#coleta">Como coletar</a></div></div>`;
    return;
  }

  // problemas ordenados por gravidade e quantidade
  const problemas = Object.entries(ALERTAS).map(([k, a]) => ({ k, ...a, n: by((m) => (m.alertas || []).includes(k)) }))
    .filter((p) => p.n > 0).sort((a, b) => (b.grave - a.grave) || (b.n - a.n));
  const ICONE = { hw_reduzido: '🧩', emprestimo_atrasado: '⏰', so_sem_suporte: '🪟', estoque_online: '📦', hostname_duplicado: '👯', disco_cheio: '💾', ram_baixa: '🧠', hdd: '🐌', sem_contato: '📡', sem_ativo: '🏷️', garantia_vencendo: '🛡️', renovacao: '♻️', sem_bitlocker: '🔓', antivirus_off: '🦠', windows_desatualizado: '🩹', bateria_ruim: '🔋' };

  el.innerHTML = `
    <div class="view-head">
      <div><h1>Painel</h1><p>${escopo ? esc(escopo) + ' · ' : ''}atualizado ao vivo</p></div>
    </div>

    <div class="hero">
      <div class="card hero-saude">
        ${anelSaude(saude)}
        <div class="hs-txt">
          <span class="hs-titulo">Saúde do parque</span>
          <strong>${L.length - graves} de ${L.length} máquinas sem problemas importantes</strong>
          <p class="muted">${saude >= 90 ? 'Tudo sob controle. 👌' : saude >= 70 ? 'Alguns pontos pedem atenção.' : 'Muitos problemas importantes — veja a lista ao lado.'}</p>
        </div>
      </div>
      <div class="hero-kpis">
        <button class="card kpi2" data-filtros='{}'><span class="k-rot">Máquinas</span><b>${L.length}</b>
          <span class="k-sub">${by((m) => m.tipo === 'desktop')} desktops · ${by((m) => m.tipo === 'notebook')} notebooks${by((m) => m.tipo === 'coletor') ? ` · ${by((m) => m.tipo === 'coletor')} coletores` : ''}${by((m) => m.propriedade === 'alugado') ? ` · <b>${by((m) => m.propriedade === 'alugado')} alugados</b>` : ''}</span></button>
        <button class="card kpi2" data-filtros='{"situacao":"online"}'><span class="k-rot"><span class="dot dot--online"></span> Coletados em 30 dias</span><b class="t-ok">${online}</b>
          <span class="mini-barra"><i style="width:${Math.round((100 * online) / L.length)}%;background:var(--ok)"></i></span><span class="k-sub">${Math.round((100 * online) / L.length)}% do parque</span></button>
        <button class="card kpi2" data-filtros='{"alerta":"_grave"}'><span class="k-rot">Precisam de atenção</span><b class="${graves ? 't-bad' : ''}">${graves}</b>
          <span class="k-sub">${semContato ? `${semContato} sem coleta há mais de 6 meses` : 'nenhuma com coleta desatualizada'}</span></button>
        <button class="card kpi2" data-go-inv><span class="k-rot">Inventários abertos</span><b id="kpi-inv">…</b><span class="k-sub" id="kpi-inv-sub">carregando…</span></button>
      </div>
    </div>

    <div class="grid-painel">
      <div class="card card-pad">
        <div class="card-head"><h2>O que resolver agora</h2>${problemas.length ? `<span class="muted" style="font-size:12.5px">${problemas.length} tipo(s) de problema</span>` : ''}</div>
        ${problemas.length ? `<div class="acoes-lista">${problemas.slice(0, 6).map((p) => `
          <button class="acao-item ${p.grave ? 'grave' : ''}" data-alerta="${p.k}">
            <span class="ai-ico">${ICONE[p.k] || '•'}</span>
            <span class="ai-txt"><strong>${esc(p.l)}</strong><small>${esc(p.d)}</small></span>
            <span class="ai-n">${p.n}</span><span class="ai-seta">›</span>
          </button>`).join('')}</div>
          ${problemas.length > 6 ? `<button class="btn btn--ghost btn--sm" id="mais-problemas" style="margin-top:6px">Ver mais ${problemas.length - 6}</button>` : ''}`
        : '<div class="tudo-ok">✅<strong>Nenhum problema encontrado</strong><span class="muted">Todas as máquinas estão saudáveis.</span></div>'}
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>Inventários e prazos</h2><a href="#conferencia" class="muted" style="font-size:12.5px">abrir →</a></div>
        <div id="painel-prazos"><div class="skeleton" style="padding:20px">Carregando…</div></div>
      </div>
    </div>

    <details class="mais-recolhido painel-mais" id="painel-mais" ${store.get('painel-mais') === '1' ? 'open' : ''}>
    <summary>Composição do parque e atividade recente</summary>
    <div class="grid-painel">
      <div class="card card-pad">
        <div class="card-head"><h2>Composição do parque</h2></div>
        <div class="seg" id="dist-abas">${Object.entries(DIST).map(([k, d]) => `<button class="${state.distAba === k ? 'on' : ''}" data-dist="${k}">${d.l}</button>`).join('')}</div>
        <div id="dist-corpo">${composicao(L, state.distAba)}</div>
      </div>
      <div class="card card-pad">
        <div class="card-head"><h2>Atividade recente</h2></div>
        <div class="feed">${(() => { const hs = state.hist.filter((h) => !state.cdAtual || h.maquinas?.cd_id === state.cdAtual).slice(0, 7); return hs.length ? hs.map(feedItem).join('') : '<p class="muted">Nenhuma alteração registrada.</p>'; })()}</div>
      </div>
    </div>
    </details>`;

  $('#painel-mais', el).ontoggle = (e) => store.set('painel-mais', e.target.open ? '1' : '0');
  $$('.kpi2[data-filtros]', el).forEach((b) => (b.onclick = () => irMaquinas(JSON.parse(b.dataset.filtros))));
  $('[data-go-inv]', el).onclick = () => (location.hash = '#conferencia');
  $$('.acao-item', el).forEach((b) => (b.onclick = () => irMaquinas({ alerta: b.dataset.alerta })));
  $('#mais-problemas')?.addEventListener('click', () => irMaquinas({ alerta: '_grave' }));
  $$('.feed a', el).forEach((a) => (a.onclick = () => abrirMaquina(a.dataset.id)));
  const ligarLegenda = () => $$('#dist-corpo .leg', el).forEach((b) => (b.onclick = () => irFiltroDist(b.dataset.f, b.dataset.v)));
  ligarLegenda();
  $$('[data-dist]', el).forEach((b) => (b.onclick = () => {
    state.distAba = b.dataset.dist; store.set('dist-aba', state.distAba);
    $$('[data-dist]', el).forEach((x) => x.classList.toggle('on', x === b));
    $('#dist-corpo').innerHTML = composicao(ativas(), state.distAba); ligarLegenda();
  }));
  desenharPrazosPainel();
}

export async function desenharPrazosPainel() {
  const alvo = $('#painel-prazos');
  if (!alvo) return;
  const r = state.resumoInv && Date.now() - (state.resumoInvEm || 0) < 30_000 ? state.resumoInv : await carregarResumoInv();
  state.resumoInvEm = Date.now();
  if (!$('#painel-prazos')) return;
  const abertas = r.abertas.filter(noCD).sort((a, b) => new Date(a.prazo_em || 8.64e15) - new Date(b.prazo_em || 8.64e15));
  const venc = abertas.filter((c) => c.prazo_em && new Date(c.prazo_em) < new Date()).length;
  $('#kpi-inv').textContent = abertas.length;
  $('#kpi-inv').className = venc ? 't-bad' : '';
  $('#kpi-inv-sub').innerHTML = venc ? `${venc} com prazo vencido` : abertas.some((c) => c.prazo_em) ? `próximo prazo ${etiquetaPrazo(abertas.find((c) => c.prazo_em))}` : 'nenhum com prazo';
  const prox = (r.agendamentos || []).filter((a) => a.proxima_execucao && (!state.cdAtual || !a.cd_id || a.cd_id === state.cdAtual))[0];
  $('#painel-prazos').innerHTML = (abertas.length ? `<div class="prazos-lista">${abertas.slice(0, 5).map((c) => { const p = infoProgresso(c); return `
      <a class="prazo-item" href="#conferencia/${c.id}">
        ${c.prazo_em ? anelPrazo(c, { tam: 52, progresso: p.esperadas ? p.encontradas / p.esperadas : 0 }) : `<span class="sem-prazo">${p.pct}%</span>`}
        <span class="pi-txt"><strong>${esc(c.nome)}</strong><small>${mostrarColCD() ? esc(cdCod(c.cd_id)) + ' · ' : ''}${p.encontradas}/${p.esperadas} conferidas</small></span>
        ${c.prazo_em ? etiquetaPrazo(c) : '<span class="muted" style="font-size:12px">sem prazo</span>'}
      </a>`; }).join('')}</div>`
    : '<div class="tudo-ok">📋<strong>Nenhum inventário aberto</strong><span class="muted">Crie um ou programe inventários recorrentes.</span></div>')
    + (prox ? `<div class="proximo-agend">📅 Próximo programado: <b>${esc(prox.nome)}</b> · ${new Date(prox.proxima_execucao).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} <span class="muted">(em ${fmtDuracao(new Date(prox.proxima_execucao) - Date.now())})</span></div>` : '');
}

export const ORDEM_IDADE = ['0 a 2 anos', '3 a 4 anos', '5 anos ou mais', 'Sem data de compra'];
export const ORDEM_GAR = ['Vigente', 'Vence em 90 dias', 'Vence em 30 dias', 'Vencida', 'Sem informação'];
export const reducao = (h) => ['memoria_gb', 'armazenamento_total_gb'].includes(h.campo) && h.valor_anterior != null && h.valor_novo != null
  && Number(h.valor_novo) < Number(h.valor_anterior) - (h.campo === 'memoria_gb' ? 0.5 : 10);

export function fmtValorHist(campo, v) {
  if (v == null || v === '') return '—';
  if (campo === 'memoria_gb' || campo === 'armazenamento_total_gb') return gb(v);
  if (campo === 'status') return STATUS[v] || v;
  if (campo === 'tipo') return TIPO[v] || v;
  if (campo === 'data_compra' || campo === 'garantia_fim') return dataBR(v);
  if (campo === 'cd_id') return cdNome(v);
  return v;
}
export function feedItem(h) {
  const host = h.maquinas?.hostname || '(removida)';
  const desc = h.campo === 'cadastro'
    ? 'Nova máquina cadastrada'
    : h.campo === 'hw_verificado' ? 'Alerta de peça marcado como verificado'
    : `${esc(CAMPOS_HIST[h.campo] || h.campo)}: <span class="chg-old">${esc(fmtValorHist(h.campo, h.valor_anterior))}</span> → <span class="chg-new">${esc(fmtValorHist(h.campo, h.valor_novo))}</span>`;
  return `<div class="feed-item ${reducao(h) ? 'feed-item--bad' : ''}"><a data-id="${h.maquina_id}" class="mono">${reducao(h) ? '⚠ ' : ''}${esc(host)}</a><span class="t">${rel(h.criado_em)}</span>
    <span class="d">${desc} <span class="muted">· ${esc(h.origem === 'agente' ? 'agente' : h.origem)}</span></span></div>`;
}
