// =========================================================
// MARMITA CONTROL v2 — Produtos
// =========================================================

let filtroProdutos = 'ativos';

function setupProdutos() {
  $('buscaProdutos').addEventListener('input', renderProdutosList);
  $('filtroProdutosChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fpr]'); if (!b) return;
    filtroProdutos = b.dataset.fpr;
    $('filtroProdutosChips').querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    renderProdutosList();
  });
  $('btnNovoProduto').addEventListener('click', () => abrirFormProduto(null));
  $('formProduto').addEventListener('submit', salvarProduto);
  ['prCusto', 'prPreco'].forEach(id => $(id).addEventListener('input', atualizarMargemForm));
  $('prNome').addEventListener('input', () => {
    const n = normalize($('prNome').value).trim();
    const dup = n && state.produtosTodos.find(p => p.id !== state.editProdutoId && normalize(p.nome).trim() === n);
    $('prDuplicado').classList.toggle('hidden', !dup);
    if (dup) $('prDuplicado').innerHTML = `Já existe “${esc(dup.nome)}”${dup.ativo ? '' : ' (desativado — dá para reativar em vez de criar outro)'}.`;
  });
  $('prImagem').addEventListener('input', () => {
    const url = $('prImagem').value.trim();
    $('prImagemPreview').classList.toggle('hidden', !url);
    if (url) $('prImagemPreview').src = url;
  });
  $('prSugestoes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preco]'); if (!b) return;
    $('prPreco').value = b.dataset.preco; atualizarMargemForm();
  });
}

function atualizarMargemForm() {
  const custo = num($('prCusto').value), preco = num($('prPreco').value);
  const box = $('prMargemBox');
  if (!custo && !preco) { box.innerHTML = ''; $('prSugestoes').innerHTML = ''; return; }
  const lucro = preco - custo;
  const margem = preco > 0 ? lucro / preco * 100 : 0;
  const nivel = margem >= 50 ? 'ok' : margem >= 30 ? 'mid' : 'due';
  box.innerHTML = preco > 0
    ? `<span>Lucro por unidade <strong class="num">${BRL(lucro)}</strong></span><span class="margem-pill ${nivel}">margem ${margem.toFixed(0)}%</span>`
    : '<span class="hint">Digite o preço de venda</span>';
  // sugestões de preço por margem desejada (arredondadas para 50 centavos)
  $('prSugestoes').innerHTML = custo > 0 ? '<span class="hint">Preço para margem de:</span>' + [40, 50, 60, 70].map(m => {
    const p = Math.ceil(custo / (1 - m / 100) * 2) / 2;
    return `<button type="button" class="chip" data-preco="${p.toFixed(2)}">${m}% → ${BRL(p)}</button>`;
  }).join('') : '';
}

function abrirFormProduto(id, duplicar = false) {
  const p = id ? state.produtosTodos.find(x => x.id === id) : null;
  state.editProdutoId = duplicar ? null : id;
  $('produtoSheetTitulo').textContent = duplicar ? 'Duplicar produto' : p ? 'Editar produto' : 'Novo produto';
  $('prNome').value = p ? p.nome + (duplicar ? ' (cópia)' : '') : '';
  $('prCategoria').value = p?.categoria || '';
  $('prCusto').value = p ? p.custo : '';
  $('prPreco').value = p ? p.preco_venda : '';
  $('prDescricao').value = p?.descricao || '';
  $('prImagem').value = p?.imagem_url || '';
  $('prImagemPreview').classList.toggle('hidden', !p?.imagem_url);
  if (p?.imagem_url) $('prImagemPreview').src = p.imagem_url;
  $('prVisivelLoja').checked = !!p?.visivel_loja;
  $('prAtivo').checked = p ? !!p.ativo || duplicar : true;
  $('prDuplicado').classList.add('hidden');
  $('listaCategorias').innerHTML = [...new Set(['Marmitas', 'Bebidas', 'Sobremesas', 'Lanches', ...state.produtosTodos.map(x => x.categoria).filter(Boolean)])]
    .sort().map(c => `<option value="${esc(c)}">`).join('');
  atualizarMargemForm();
  openSheet('produtoOverlay');
}

async function salvarProduto(e) {
  e.preventDefault();
  const nome = $('prNome').value.trim();
  const custo = num($('prCusto').value), preco = num($('prPreco').value);
  if (!nome) return toast('O nome é obrigatório', true);
  if (preco > 0 && preco < custo && !confirm('O preço de venda está menor que o custo. Salvar mesmo assim?')) return;
  const payload = {
    nome, custo, preco_venda: preco,
    imagem_url: $('prImagem').value.trim() || null,
    visivel_loja: $('prVisivelLoja').checked,
    ativo: $('prAtivo').checked,
  };
  if (state.rec.produtosExtra) {
    payload.categoria = $('prCategoria').value.trim() || null;
    payload.descricao = $('prDescricao').value.trim() || null;
  }
  const btn = $('prSalvar'); btn.disabled = true;
  try {
    if (state.editProdutoId) {
      const antigo = state.produtosTodos.find(x => x.id === state.editProdutoId);
      const { error } = await supabaseClient.from('produtos').update(payload).eq('id', state.editProdutoId);
      if (error) throw error;
      toast(antigo && num(antigo.preco_venda) !== preco ? 'Produto atualizado ✓ Pedidos antigos mantêm o preço da época.' : 'Produto atualizado ✓');
    } else {
      const { error } = await supabaseClient.from('produtos').insert(payload);
      if (error) throw error;
      toast('Produto cadastrado ✓');
    }
    closeSheet('produtoOverlay');
    await loadProdutos();
    renderProdutosList(); renderProdutosGridPedido();
  } catch (err) {
    toast('Erro ao salvar: ' + (err?.message || 'tente de novo'), true);
  } finally { btn.disabled = false; }
}

async function alterarProduto(id, campos, msg) {
  const { error } = await supabaseClient.from('produtos').update(campos).eq('id', id);
  if (error) return toast('Erro: ' + error.message, true);
  toast(msg);
  await loadProdutos();
  renderProdutosList(); renderProdutosGridPedido();
}

function renderProdutosList() {
  const vendidos = {}, receita = {}, ultimaVenda = {};
  state.pedidos.forEach(p => (p.itens_pedido || []).forEach(it => {
    vendidos[it.produto_id] = (vendidos[it.produto_id] || 0) + num(it.quantidade);
    receita[it.produto_id] = (receita[it.produto_id] || 0) + num(it.subtotal);
    if (!ultimaVenda[it.produto_id] || p.data_pedido > ultimaVenda[it.produto_id]) ultimaVenda[it.produto_id] = p.data_pedido;
  }));

  let lista = state.produtosTodos.filter(p =>
    filtroProdutos === 'inativos' ? !p.ativo : filtroProdutos === 'loja' ? p.ativo && p.visivel_loja : p.ativo);
  const q = normalize($('buscaProdutos').value.trim());
  if (q) lista = lista.filter(p => normalize(`${p.nome} ${p.categoria || ''}`).includes(q));

  // agrupa por categoria
  const grupos = {};
  lista.forEach(p => { const k = p.categoria || 'Sem categoria'; (grupos[k] = grupos[k] || []).push(p); });
  const chaves = Object.keys(grupos).sort((a, b) => a === 'Sem categoria' ? 1 : b === 'Sem categoria' ? -1 : a.localeCompare(b));

  $('listaProdutos').innerHTML = chaves.map(cat => `
    ${chaves.length > 1 || cat !== 'Sem categoria' ? `<div class="section-head"><h2>${esc(cat)}</h2><span class="hint">${grupos[cat].length}</span></div>` : ''}
    <div class="card simple-list">${grupos[cat].sort((a, b) => (vendidos[b.id] || 0) - (vendidos[a.id] || 0)).map(p => {
      const margem = num(p.preco_venda) > 0 ? (num(p.preco_venda) - num(p.custo)) / num(p.preco_venda) * 100 : 0;
      const nivel = margem >= 50 ? 'ok' : margem >= 30 ? 'mid' : 'due';
      return `
      <div class="produto-row${p.ativo ? '' : ' is-archived'}">
        ${p.imagem_url ? `<img class="thumb" src="${esc(p.imagem_url)}" alt="" loading="lazy" onerror="this.remove()">` : '<span class="thumb thumb-empty" aria-hidden="true">🍱</span>'}
        <div class="row-main">
          <span class="row-title">${esc(p.nome)}${p.visivel_loja ? ' <span class="tag tag-ok">na loja</span>' : ''}</span>
          <span class="row-sub">custo ${BRL(p.custo)} · venda <strong>${BRL(p.preco_venda)}</strong> · <span class="margem-pill ${nivel}">${margem.toFixed(0)}%</span></span>
          <span class="row-sub">${vendidos[p.id] ? `${vendidos[p.id]} vendidos · ${BRL(receita[p.id])} · última venda ${fmtData(ultimaVenda[p.id])}` : 'nunca vendido'}</span>
        </div>
        <details class="menu">
          <summary class="btn btn-ghost btn-sm">Ações</summary>
          <div class="menu-pop">
            <button data-pr-edit="${p.id}">Editar</button>
            <button data-pr-dup="${p.id}">Duplicar</button>
            ${p.ativo ? `<button data-pr-loja="${p.id}">${p.visivel_loja ? 'Tirar da loja online' : 'Mostrar na loja online'}</button>` : ''}
            ${p.ativo ? `<button class="danger" data-pr-off="${p.id}">Desativar</button>` : `<button data-pr-on="${p.id}">Reativar</button>`}
          </div>
        </details>
      </div>`;
    }).join('')}</div>`).join('') || emptyMsg(filtroProdutos === 'inativos' ? 'Nenhum produto desativado' : 'Nenhum produto encontrado');

  const L = $('listaProdutos');
  L.querySelectorAll('[data-pr-edit]').forEach(b => b.onclick = () => abrirFormProduto(b.dataset.prEdit));
  L.querySelectorAll('[data-pr-dup]').forEach(b => b.onclick = () => abrirFormProduto(b.dataset.prDup, true));
  L.querySelectorAll('[data-pr-loja]').forEach(b => b.onclick = () => {
    const p = state.produtosTodos.find(x => x.id === b.dataset.prLoja);
    alterarProduto(p.id, { visivel_loja: !p.visivel_loja }, p.visivel_loja ? 'Tirado da loja online' : 'Agora aparece na loja online ✓');
  });
  L.querySelectorAll('[data-pr-off]').forEach(b => b.onclick = () => {
    if (confirm('Desativar este produto? Ele some do novo pedido e da loja, mas continua nos pedidos antigos.'))
      alterarProduto(b.dataset.prOff, { ativo: false }, 'Produto desativado');
  });
  L.querySelectorAll('[data-pr-on]').forEach(b => b.onclick = () => alterarProduto(b.dataset.prOn, { ativo: true }, 'Produto reativado ✓'));
}
