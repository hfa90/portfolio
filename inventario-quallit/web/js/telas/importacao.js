// Inventário Quallit — tela: importacao (gerado a partir do app.js; imports e exports conferidos automaticamente)
import { carregarMaquinas } from '../dados.js';
import { $, $$, acharMaquina, cdsAtivos, dataBR, debounce, ehAdmin, erroMsg, esc, moeda, pill, sb, state, toast, up } from '../nucleo.js';
import { coletasDaPlanilha, lerArquivoPlanilha, lerCSV, lerValor, normCab } from '../planilha.js';
import { rerender } from '../rotas.js';
import { baixarBlob, modal, opts, planilhaSimples, renderTabela } from '../telas/maquinas.js';

/* =====================================================================
   IMPORTAR COMPRAS / GARANTIAS (CSV)
   ===================================================================== */
export const CAB_IMPORT = {
  codigo: ['patrimonio', 'ativo', 'hostname', 'serie', 'numero_serie', 'n_serie', 'n_de_serie', 'codigo'],
  data_compra: ['data_compra', 'data_da_compra', 'compra', 'data_aquisicao', 'aquisicao'],
  fornecedor: ['fornecedor', 'vendedor', 'loja'],
  nota_fiscal: ['nota_fiscal', 'nf', 'nota', 'nfe', 'nf_e'],
  valor_compra: ['valor', 'valor_compra', 'preco', 'valor_r', 'custo'],
  garantia_fim: ['garantia_fim', 'fim_garantia', 'fim_da_garantia', 'garantia', 'garantia_ate', 'vencimento_garantia'],
};
export function lerDataBR(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
export function modalImportarCompras() {
  let plano = [];
  modal(`
    <div class="modal-head"><h2>Importar compras e garantias</h2>
      <p class="muted" style="margin:4px 0 0">Planilha do Excel (.xlsx) ou CSV. Colunas reconhecidas: <code>patrimonio</code> (ou hostname / serie), <code>data_compra</code>, <code>fornecedor</code>, <code>nota_fiscal</code>, <code>valor</code>, <code>garantia_fim</code>. Datas em dd/mm/aaaa.</p></div>
    <div class="modal-body">
      <div class="actions"><input type="file" id="imp-arq" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"><button type="button" class="btn btn--sm btn--ghost" id="imp-modelo">Baixar planilha modelo</button></div>
      <label>…ou cole o conteúdo aqui<textarea id="imp-txt" rows="5" class="mono" style="font-size:12px" placeholder="patrimonio;data_compra;fornecedor;nota_fiscal;valor;garantia_fim"></textarea></label>
      <div id="imp-prev"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="imp-ok" disabled>Aplicar</button></div>`, (dlg) => {
    let linhasArquivo = null;   // planilha escolhida (.xlsx ou .csv); sem arquivo, vale o texto colado
    const analisar = () => {
      const linhas = linhasArquivo || lerCSV($('#imp-txt').value);
      plano = [];
      if (linhas.length < 2) { $('#imp-prev').innerHTML = ''; $('#imp-ok').disabled = true; return; }
      const cab = linhas[0].map(normCab);
      const idx = Object.fromEntries(Object.entries(CAB_IMPORT).map(([k, nomes]) => [k, cab.findIndex((c) => nomes.includes(c))]));
      if (idx.codigo < 0) { $('#imp-prev').innerHTML = '<p class="erro">Não encontrei a coluna de identificação (patrimonio, hostname ou serie).</p>'; $('#imp-ok').disabled = true; return; }
      const nao = []; let invalidas = 0;
      for (const l of linhas.slice(1)) {
        const cod = (l[idx.codigo] || '').trim();
        if (!cod) continue;
        const m = acharMaquina(cod);
        if (!m) { nao.push(cod); continue; }
        const dados = {};
        const pegar = (k) => (idx[k] >= 0 ? (l[idx[k]] || '').trim() : '');
        if (pegar('data_compra')) { const d = lerDataBR(pegar('data_compra')); if (d) dados.data_compra = d; else invalidas++; }
        if (pegar('garantia_fim')) { const d = lerDataBR(pegar('garantia_fim')); if (d) dados.garantia_fim = d; else invalidas++; }
        if (pegar('fornecedor')) dados.fornecedor = pegar('fornecedor');
        if (pegar('nota_fiscal')) dados.nota_fiscal = pegar('nota_fiscal');
        if (pegar('valor_compra')) { const v = lerValor(pegar('valor_compra')); if (v != null) dados.valor_compra = v; else invalidas++; }
        if (Object.keys(dados).length) plano.push({ m, dados });
      }
      $('#imp-prev').innerHTML = `
        <div class="banner ${plano.length ? 'banner--info' : 'banner--bad'}"><div><strong>${plano.length} máquina(s) serão atualizadas</strong>
          <span>${nao.length ? `${nao.length} código(s) não encontrados: ${esc(nao.slice(0, 12).join(', '))}${nao.length > 12 ? '…' : ''}.` : 'Todos os códigos foram encontrados.'}${invalidas ? ` ${invalidas} valor(es) de data/valor inválidos foram ignorados.` : ''}</span></div></div>
        ${plano.length ? `<table class="mini-table"><thead><tr><th>Máquina</th><th>Compra</th><th>Garantia</th><th>Fornecedor</th><th>NF</th><th>Valor</th></tr></thead><tbody>
          ${plano.slice(0, 8).map(({ m, dados: d }) => `<tr><td class="mono">${esc(m.hostname)}</td><td>${dataBR(d.data_compra)}</td><td>${dataBR(d.garantia_fim)}</td><td>${esc(d.fornecedor || '—')}</td><td>${esc(d.nota_fiscal || '—')}</td><td>${moeda(d.valor_compra)}</td></tr>`).join('')}
          ${plano.length > 8 ? `<tr><td colspan="6" class="muted">… e mais ${plano.length - 8}</td></tr>` : ''}</tbody></table>` : ''}`;
      $('#imp-ok').disabled = !plano.length;
    };
    $('#imp-txt').oninput = debounce(() => { linhasArquivo = null; analisar(); }, 200);
    $('#imp-arq').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { linhasArquivo = (await lerArquivoPlanilha(f)).map((l) => l.map((c) => String(c ?? ''))); $('#imp-txt').value = ''; analisar(); }
      catch (err) { linhasArquivo = null; $('#imp-prev').innerHTML = `<p class="erro">${esc(err.message || err)}</p>`; }
    };
    $('#imp-modelo').onclick = () => baixarBlob(planilhaSimples('Compras', [['patrimonio', 'data_compra', 'fornecedor', 'nota_fiscal', 'valor', 'garantia_fim'], ['PAT000123', '15/03/2023', 'Dell Computadores', '000123456', '4.899,00', '15/03/2026']]), 'modelo-compras.xlsx');
    $('#imp-ok').onclick = async () => {
      const btn = $('#imp-ok'); btn.disabled = true;
      let ok = 0, falhas = 0;
      for (const { m, dados } of plano) {
        btn.textContent = `Aplicando ${ok + falhas + 1}/${plano.length}…`;
        const { error } = await sb.from('maquinas').update(dados).eq('id', m.id);
        error ? falhas++ : ok++;
      }
      dlg.close();
      await carregarMaquinas(); rerender(); if (state.view === 'maquinas') renderTabela();
      toast(`${ok} máquina(s) atualizada(s)${falhas ? `, ${falhas} com erro` : ''}`, !!falhas);
    };
  });
}

/* =====================================================================
   IMPORTAR COLETA POR PLANILHA (kit COLETAR.bat, sem instalação)
   Aceita a planilha do Invent_local novo (inventario-quallit.xlsx) e a antiga
   do "Invent_local" (list_info.csv: HOSTNAME,FABRICANTE,MODELO,SERIAL,ATIVO,SETOR…).
   ===================================================================== */
export function maquinaDaColeta(r) {
  const s = up(r.numero_serie), a = up(r.ativo), h = up(r.hostname);
  return (s && state.maquinas.find((m) => up(m.numero_serie) === s))
    || (a && state.maquinas.find((m) => up(m.ativo) === a))
    || state.maquinas.find((m) => up(m.hostname) === h && (!m.numero_serie || !s)) || null;
}
export function modalImportarColeta() {
  let lista = [];
  const cds = cdsAtivos();
  modal(`
    <div class="modal-head"><h2>Importar coleta (planilha)</h2>
      <p class="muted" style="margin:4px 0 0">Escolha a planilha do Excel <code>inventario-quallit.xlsx</code> gerada pelo <b>Invent_local</b> (COLETAR.bat, em <i>Agente coletor → Instalação</i>). A planilha antiga <code>list_info.csv</code> e o CSV também são aceitos. As máquinas são reconhecidas pelo nº de série, patrimônio ou hostname: nada é duplicado.</p></div>
    <div class="modal-body">
      <div class="actions"><input type="file" id="ic-arq" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"></div>
      <div class="form-grid" style="margin-top:10px">
        ${ehAdmin() ? `<label>CD das máquinas novas<select id="ic-cd">${opts(cds.map((c) => [c.id, `${c.codigo} · ${c.nome}`]), state.cdAtual || cds[0]?.id)}</select></label>` : ''}
        <label class="full" style="display:flex;gap:8px;align-items:flex-start;font-weight:400"><input type="checkbox" id="ic-sobre" style="width:auto;margin-top:3px">
          <span>Substituir patrimônio, setor, localização e responsável pelos da planilha<br><span class="muted" style="font-size:12.5px">Desmarcado: a planilha só preenche o que estiver vazio no sistema.</span></span></label>
      </div>
      <div id="ic-prev"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn--primary" id="ic-ok" disabled>Importar</button></div>`, (dlg) => {
    const mostrar = (res) => {
      if (res.erro !== undefined) { lista = []; $('#ic-prev').innerHTML = res.erro ? `<p class="erro">${esc(res.erro)}</p>` : ''; $('#ic-ok').disabled = true; return; }
      lista = res.lista;
      const novas = lista.filter((r) => !maquinaDaColeta(r)).length;
      $('#ic-prev').innerHTML = `
        <div class="banner banner--info"><div><strong>${lista.length} computador(es) na planilha: ${novas} novo(s), ${lista.length - novas} já cadastrado(s)</strong>
          <span>${res.repetidas ? `${res.repetidas} linha(s) repetida(s) do mesmo computador: vale a última. ` : ''}${res.completa ? 'Planilha completa (memória, discos, volumes, rede).' : 'Planilha simples: entram só as colunas disponíveis.'}</span></div></div>
        <table class="mini-table"><thead><tr><th></th><th>Hostname</th><th>Patrimônio</th><th>Setor</th><th>Modelo</th><th>RAM</th><th>Sistema</th></tr></thead><tbody>
          ${lista.slice(0, 10).map((r) => `<tr><td>${maquinaDaColeta(r) ? pill('atualiza') : pill('nova', 'ok')}</td><td class="mono">${esc(r.hostname)}</td><td class="mono">${esc(r.ativo || '—')}</td><td>${esc(r.setor || '—')}</td><td>${esc(r.modelo || '—')}</td><td>${r.memoria_gb != null ? esc(r.memoria_gb) + ' GB' : '—'}</td><td>${esc(r.so_nome || '—')}</td></tr>`).join('')}
          ${lista.length > 10 ? `<tr><td colspan="7" class="muted">… e mais ${lista.length - 10}</td></tr>` : ''}</tbody></table>`;
      $('#ic-ok').disabled = !lista.length;
    };
    $('#ic-arq').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { mostrar(coletasDaPlanilha(await lerArquivoPlanilha(f))); } catch (err) { mostrar({ erro: err.message }); }
    };
    $('#ic-ok').onclick = async () => {
      const btn = $('#ic-ok'); btn.disabled = true;
      const tot = { criadas: 0, atualizadas: 0, ignoradas: 0, avisos: [] };
      for (let i = 0; i < lista.length; i += 500) {
        btn.textContent = `Importando ${Math.min(i + 500, lista.length)}/${lista.length}…`;
        const { data: r, error } = await sb.rpc('importar_coletas', { p_linhas: lista.slice(i, i + 500), p_cd: $('#ic-cd')?.value || null, p_sobrescrever: $('#ic-sobre').checked });
        if (error) { btn.textContent = 'Importar'; btn.disabled = false; return toast(/importar_coletas/.test(error.message) ? 'O banco está desatualizado: aplique as migrações (supabase db push --remote) antes de importar.' : erroMsg(error), true); }
        tot.criadas += r.criadas; tot.atualizadas += r.atualizadas; tot.ignoradas += r.ignoradas; tot.avisos.push(...(r.avisos || []));
      }
      await carregarMaquinas(); rerender(); if (state.view === 'maquinas') renderTabela();
      toast(`${tot.criadas} máquina(s) nova(s), ${tot.atualizadas} atualizada(s)${tot.ignoradas ? `, ${tot.ignoradas} ignorada(s)` : ''}`, !!tot.ignoradas);
      if (!tot.avisos.length) return dlg.close();
      $('.modal-body', dlg).innerHTML = `<div class="banner banner--info"><div><strong>Importação concluída com ${tot.avisos.length} aviso(s)</strong><span>${tot.criadas} nova(s), ${tot.atualizadas} atualizada(s), ${tot.ignoradas} ignorada(s).</span></div></div>
        <table class="mini-table"><thead><tr><th>Linha</th><th>Hostname</th><th>Aviso</th></tr></thead><tbody>
        ${tot.avisos.slice(0, 50).map((a) => `<tr><td>${esc(a.linha ?? '')}</td><td class="mono">${esc(a.host || '')}</td><td>${esc(a.msg)}</td></tr>`).join('')}</tbody></table>`;
      $('.modal-foot', dlg).innerHTML = '<button class="btn btn--primary" data-close>Fechar</button>';
      $$('[data-close]', dlg).forEach((b) => (b.onclick = () => dlg.close()));
    };
  });
}
