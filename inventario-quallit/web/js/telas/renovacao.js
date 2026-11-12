// Inventário Quallit — planejamento de renovação (Relatórios → Renovação).
// O que trocar ou atualizar no ano escolhido e quanto custa: idade (pela data de compra), Windows sem
// suporte, bateria ruim dos coletores, pouca memória e disco HDD. Os valores ficam na tabela "parametros".
import { $, $$, MQ, TIPO, cdCod, cdNome, dataBR, ehAdmin, erroMsg, esc, noCD, sb, state, toast } from '../nucleo.js';
import { criarXlsx } from '../planilha.js';
import { abrirMaquina, baixarBlob, modal, opts } from './maquinas.js';
import { abrirRelatorio } from './relatorios.js';

const PADRAO = { idade_anos: 5, desktop: 3500, notebook: 5000, coletor: 7000, servidor: 15000, outro: 1500, bateria_coletor: 350, memoria: 250, ssd: 350 };
const ACOES = {
  trocar:  { l: 'Trocar o equipamento', cor: 'bad' },
  windows: { l: 'Atualizar para Windows 11', cor: 'warn' },
  bateria: { l: 'Trocar a bateria', cor: 'warn' },
  memoria: { l: 'Aumentar a memória para 8 GB+', cor: 'info' },
  ssd:     { l: 'Trocar HDD por SSD', cor: 'info' },
};
const reais = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

async function carregarValores() {
  const { data: d, error } = await sb.from('parametros').select('valor').eq('chave', 'renovacao').maybeSingle();
  return { ...PADRAO, ...(!error && d?.valor ? d.valor : {}) };
}

// uma linha por ação sugerida
function planejar(ano, v) {
  const fim = new Date(ano, 11, 31);
  const linhas = [];
  for (const m of MQ().filter((x) => !['descartado', 'extraviado'].includes(x.status) && x.propriedade !== 'alugado')) {   // alugado: a locadora troca
    const al = m.alertas || [];
    const anos = m.data_compra ? (fim - new Date(m.data_compra + 'T12:00:00')) / (365.25 * 864e5) : null;
    const base = { m, anos, semData: !m.data_compra };
    if (anos != null && anos >= v.idade_anos) {
      linhas.push({ ...base, acao: 'trocar', custo: Number(v[m.tipo] ?? v.outro) || 0, motivo: `${Math.floor(anos)} anos em 31/12/${ano}${al.includes('so_sem_suporte') ? ' · Windows sem suporte' : ''}` });
      continue;
    }
    if (al.includes('so_sem_suporte')) linhas.push({ ...base, acao: 'windows', custo: 0, motivo: 'Windows 10 ou anterior: conferir se o hardware aceita o 11 (se não aceitar, trocar)' });
    if (m.tipo === 'coletor' && al.includes('bateria_ruim')) linhas.push({ ...base, acao: 'bateria', custo: Number(v.bateria_coletor) || 0, motivo: m.bateria?.capacidade_pct != null ? `capacidade ${m.bateria.capacidade_pct}%` : `saúde ${m.bateria?.saude || 'ruim'}` });
    if (m.tipo !== 'coletor' && m.memoria_gb != null && Number(m.memoria_gb) < 8) linhas.push({ ...base, acao: 'memoria', custo: Number(v.memoria) || 0, motivo: `${m.memoria_gb} GB hoje` });
    if (al.includes('hdd')) linhas.push({ ...base, acao: 'ssd', custo: Number(v.ssd) || 0, motivo: 'disco mecânico' });
  }
  return linhas.sort((a, b) => b.custo - a.custo || cdCod(a.m.cd_id).localeCompare(cdCod(b.m.cd_id)) || String(a.m.hostname).localeCompare(String(b.m.hostname)));
}

export async function renderRelRenovacao() {
  const corpo = $('#rel-corpo');
  corpo.innerHTML = '<div class="skeleton">Montando o planejamento…</div>';
  const v = await carregarValores();
  const anoAtual = new Date().getFullYear();
  state.renov ||= { ano: anoAtual + 1, tipo: '' };
  const f = state.renov;
  $('#rel-acoes').innerHTML = `<button class="btn" id="rn-exp">Exportar</button><button class="btn btn--primary" id="rn-pdf">Imprimir (PDF)</button>${ehAdmin() ? '<button class="btn" id="rn-valores">Valores da estimativa</button>' : ''}`;
  const desenhar = () => {
    const todas = planejar(f.ano, v).filter((l) => !f.tipo || l.m.tipo === f.tipo);
    const total = todas.reduce((s, l) => s + l.custo, 0);
    const trocas = todas.filter((l) => l.acao === 'trocar');
    const semData = MQ().filter((m) => !['descartado', 'extraviado'].includes(m.status) && m.propriedade !== 'alugado' && !m.data_compra && (!f.tipo || m.tipo === f.tipo)).length;
    const porCD = new Map();
    for (const l of todas) {
      const k = l.m.cd_id; if (!porCD.has(k)) porCD.set(k, { trocas: 0, ctrocas: 0, upgrades: 0, cupgrades: 0 });
      const r = porCD.get(k);
      if (l.acao === 'trocar') { r.trocas++; r.ctrocas += l.custo; } else { r.upgrades++; r.cupgrades += l.custo; }
    }
    state.renovLinhas = todas;
    corpo.innerHTML = `
      <div class="rel-filtro">
        <label class="muted" style="display:flex;gap:8px;align-items:center">Ano<select id="rn-ano">${opts([anoAtual, anoAtual + 1, anoAtual + 2].map((a) => [String(a), String(a)]), String(f.ano))}</select></label>
        <div class="seg" id="rn-tipo">${[['', 'Todos'], ['desktop', 'Desktops'], ['notebook', 'Notebooks'], ['coletor', 'Coletores']].map(([k, l]) => `<button class="${f.tipo === k ? 'on' : ''}" data-tipo="${k}">${l}</button>`).join('')}</div>
        <span class="muted" style="font-size:13px">Troca quando completa ${v.idade_anos} anos até 31/12/${f.ano} (pela data de compra)</span></div>
      <div class="rel-resumo">
        <div class="card rr-kpi"><span class="k-rot">Orçamento estimado ${f.ano}</span><b>${reais(total)}</b><span class="k-sub">${todas.length} ação(ões)</span></div>
        <div class="card rr-kpi"><span class="k-rot">Equipamentos a trocar</span><b class="${trocas.length ? 't-bad' : ''}">${trocas.length}</b><span class="k-sub">${reais(trocas.reduce((s, l) => s + l.custo, 0))}</span></div>
        <div class="card rr-kpi"><span class="k-rot">Melhorias e baterias</span><b>${todas.length - trocas.length}</b><span class="k-sub">${reais(total - trocas.reduce((s, l) => s + l.custo, 0))}</span></div>
        <div class="card rr-kpi"><span class="k-rot">Sem data de compra</span><b class="${semData ? 't-warn' : ''}">${semData}</b><span class="k-sub">ficam fora da conta de idade</span></div>
      </div>
      ${porCD.size > 1 ? `<div class="card" style="margin-bottom:16px"><div class="table-wrap"><table><thead><tr><th>CD</th><th class="num">Trocas</th><th class="num">Custo trocas</th><th class="num">Melhorias</th><th class="num">Custo melhorias</th><th class="num">Total</th></tr></thead><tbody>
        ${[...porCD.entries()].sort((a, b) => (b[1].ctrocas + b[1].cupgrades) - (a[1].ctrocas + a[1].cupgrades)).map(([k, r]) => `<tr><td><span class="pill pill--cd">${esc(cdCod(k))}</span> ${esc(cdNome(k))}</td><td class="num">${r.trocas}</td><td class="num">${reais(r.ctrocas)}</td><td class="num">${r.upgrades}</td><td class="num">${reais(r.cupgrades)}</td><td class="num"><b>${reais(r.ctrocas + r.cupgrades)}</b></td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
      <div class="card"><div class="card-pad" style="padding-bottom:0"><h2>O que fazer (${todas.length})</h2>
        <p class="muted" style="margin:4px 0 0;font-size:13px">${semData ? `${semData} equipamento(s) sem data de compra: informe em Máquinas → Importar compras para entrarem na conta de idade. ` : ''}Clique numa linha para abrir a máquina.</p></div>
        <div class="table-wrap" style="max-height:620px"><table><thead><tr><th>Equipamento</th><th>CD</th><th>Ação</th><th>Por quê</th><th>Compra</th><th class="num">Custo</th></tr></thead><tbody>
        ${todas.length ? todas.map((l) => `<tr data-id="${l.m.id}" style="cursor:pointer"><td class="mono">${esc(l.m.ativo || l.m.hostname)}<span class="sub">${esc(TIPO[l.m.tipo])} ${esc(l.m.modelo || '')}</span></td>
          <td>${esc(cdCod(l.m.cd_id))}</td><td><span class="pill pill--${ACOES[l.acao].cor}">${esc(ACOES[l.acao].l)}</span></td><td>${esc(l.motivo)}</td>
          <td>${l.m.data_compra ? dataBR(l.m.data_compra) : '<span class="muted">—</span>'}</td><td class="num">${l.custo ? reais(l.custo) : '—'}</td></tr>`).join('')
          : `<tr><td colspan="6" class="empty">Nada a trocar ou melhorar em ${f.ano} com os critérios atuais. 👌</td></tr>`}
        </tbody></table></div></div>`;
    $('#rn-ano').onchange = (e) => { f.ano = +e.target.value; desenhar(); };
    $$('#rn-tipo [data-tipo]').forEach((b) => (b.onclick = () => { f.tipo = b.dataset.tipo; desenhar(); }));
    $$('tr[data-id]', corpo).forEach((tr) => (tr.onclick = () => abrirMaquina(tr.dataset.id)));
  };
  desenhar();
  $('#rn-exp').onclick = () => {
    const linhas = state.renovLinhas || [];
    const cab = ['CD', 'Patrimônio', 'Hostname', 'Tipo', 'Modelo', 'Ação', 'Por quê', 'Data de compra', 'Custo (R$)'];
    const aba = { nome: `Renovação ${f.ano}`, colunas: cab.map((t) => ({ t, w: t === 'Por quê' ? 40 : 16 })),
      linhas: linhas.map((l) => [cdCod(l.m.cd_id), l.m.ativo, l.m.hostname, TIPO[l.m.tipo], l.m.modelo, ACOES[l.acao].l, l.motivo, l.m.data_compra ? dataBR(l.m.data_compra) : '', l.custo]) };
    const valores = { nome: 'Valores usados', colunas: [{ t: 'Item', w: 26 }, { t: 'Valor', w: 14 }], linhas: Object.entries(v).map(([k, x]) => [k, x]) };
    baixarBlob(criarXlsx([aba, valores]), `renovacao-${f.ano}.xlsx`);
  };
  $('#rn-pdf').onclick = () => {
    const linhas = state.renovLinhas || [];
    const total = linhas.reduce((s, l) => s + l.custo, 0);
    abrirRelatorio(`Planejamento de renovação ${f.ano}`, `${state.cdAtual ? esc(cdCod(state.cdAtual) + ' · ' + cdNome(state.cdAtual)) : 'Todos os CDs'} · orçamento estimado ${reais(total)}`,
      `<table><thead><tr><th>CD</th><th>Equipamento</th><th>Ação</th><th>Por quê</th><th class="n">Custo</th></tr></thead><tbody>
        ${linhas.map((l) => `<tr><td>${esc(cdCod(l.m.cd_id))}</td><td><b>${esc(l.m.ativo || l.m.hostname)}</b> ${esc(TIPO[l.m.tipo])} ${esc(l.m.modelo || '')}</td><td>${esc(ACOES[l.acao].l)}</td><td>${esc(l.motivo)}</td><td class="n">${l.custo ? reais(l.custo) : '—'}</td></tr>`).join('')}
        <tr class="total"><td colspan="4">Total</td><td class="n">${reais(total)}</td></tr></tbody></table>
       <p class="muted">Valores de referência: ${Object.entries(v).map(([k, x]) => `${esc(k)} ${k === 'idade_anos' ? x + ' anos' : reais(x)}`).join(' · ')}.</p>`);
  };
  $('#rn-valores')?.addEventListener('click', () => modalValores(v));
}

function modalValores(v) {
  const campos = [['idade_anos', 'Trocar com quantos anos'], ['desktop', 'Desktop novo (R$)'], ['notebook', 'Notebook novo (R$)'], ['coletor', 'Coletor novo (R$)'],
    ['servidor', 'Servidor novo (R$)'], ['outro', 'Outro equipamento (R$)'], ['bateria_coletor', 'Bateria de coletor (R$)'], ['memoria', 'Memória extra (R$)'], ['ssd', 'SSD (R$)']];
  modal(`
    <div class="modal-head"><h2>Valores da estimativa</h2><p class="muted" style="margin:4px 0 0">Usados por todos no planejamento de renovação.</p></div>
    <form class="modal-body" id="vr-form"><div class="form-grid">
      ${campos.map(([k, l]) => `<label>${l}<input type="number" min="0" step="${k === 'idade_anos' ? 1 : 50}" name="${k}" value="${esc(v[k])}" required></label>`).join('')}
    </div></form>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="vr-ok">Salvar</button></div>`, (dlg) => {
    $('#vr-ok', dlg).onclick = async () => {
      const f = $('#vr-form', dlg); if (!f.reportValidity()) return;
      const valor = Object.fromEntries(campos.map(([k]) => [k, Number(f[k].value)]));
      const { error } = await sb.from('parametros').upsert({ chave: 'renovacao', valor, atualizado_em: new Date().toISOString() });
      if (error) return toast(/parametros|schema cache/.test(error.message) ? 'Aplique as migrações do banco antes (veja o README).' : erroMsg(error), true);
      dlg.close(); toast('Valores salvos'); renderRelRenovacao();
    };
  });
}
