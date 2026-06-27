// ================================================================
// CONFIGURAÇÃO E NAVEGAÇÃO (SPA)
// ================================================================

function showSection(sectionId, event) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const section = document.getElementById(`section-${sectionId}`);
    if (section) section.classList.remove('hidden');
    if (event) event.currentTarget.classList.add('active');

    // Carregamento de dados por seção
    if (sectionId === 'dashboard') carregarDashboard();
    if (sectionId === 'mercados') carregarMercados();
    if (sectionId === 'catalogo') carregarCatalogoGlobal();
    if (sectionId === 'usuarios') carregarUsuariosAdmin();
    if (sectionId === 'avisos') carregarAvisosAdmin();
}

// ================================================================
// MÓDULO 1: DASHBOARD INTELIGENTE
// ================================================================

async function carregarDashboard() {
    try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (data.success) {
            document.getElementById('dash-total-produtos').innerText = data.stats.produtos;
            document.getElementById('dash-total-mercados').innerText = data.stats.mercados;
            document.getElementById('dash-total-economia').innerText = `R$ ${data.stats.economia_media}`;
            inicializarGrafico();
        }
    } catch (e) { console.error(e); }
}

// ================================================================
// 3. FUNÇÕES DE APOIO (Para evitar erros de 'not defined')
// ================================================================
function inicializarGrafico() {
    const ctx = document.getElementById('chartPrecos');
    if (!ctx) return;
    if (window.meuGrafico) window.meuGrafico.destroy();
    window.meuGrafico = new Chart(ctx, {
        type: 'line',
        data: { labels: ['S1', 'S2', 'S3', 'S4'], datasets: [{ label: 'Preços', data: [10, 15, 8, 12], borderColor: '#2e8b57' }] }
    });
}

// ================================================================
// MÓDULO 2: GERENCIAMENTO DE SUPERMERCADOS
// ================================================================

async function carregarMercados() {
    try {
        const response = await fetch('/api/admin/mercados/listar');
        const data = await response.json();
        const container = document.getElementById('lista-mercados');

        if (data.success) {
            container.innerHTML = data.mercados.map(m => `
                <div class="col-md-4">
                    <div class="card p-3 shadow-sm border-0 h-100">
                        <div class="d-flex justify-content-between">
                            <h5 class="m-0">${m.nome}</h5>
                            <button class="btn btn-sm btn-outline-primary"><i class="fas fa-edit"></i></button>
                        </div>
                        <small class="text-muted mt-2"><i class="fas fa-map-marker-alt"></i> ${m.endereco || 'Sem endereço'}</small>
                        <button class="btn btn-sm btn-success mt-3" onclick="abrirGestaoPrecos(${m.id}, '${m.nome}')">
                            <i class="fas fa-tags me-1"></i> Ver Preços
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) { console.error("Erro ao carregar mercados:", err); }
}

async function salvarNovoMercado() {
    const payload = {
        nome: document.getElementById('m-nome').value,
        endereco: document.getElementById('m-endereco').value
    };
    if (!payload.nome || !payload.endereco) return alert("Preencha todos os campos!");

    const res = await fetch('/api/admin/mercado/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if ((await res.json()).success) {
        bootstrap.Modal.getInstance(document.getElementById('modal-supermercado')).hide();
        carregarMercados();
        document.getElementById('form-supermercado').reset();
    }
}

// ================================================================
// MÓDULO 3: CATÁLOGO GLOBAL E IA
// ================================================================

// CARREGAR TABELA DO CATÁLOGO
async function carregarCatalogoGlobal() {
    const tbody = document.getElementById('tabela-catalogo-global');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

    try {
        const res = await fetch('/api/admin/catalogo');
        const data = await res.json();
        if (data.success) {
            tbody.innerHTML = data.produtos.map(p => `
                <tr>
                    <td><img src="${p.imagem || 'https://via.placeholder.com/80x80?text=Produto'}" class="rounded" style="width:40px;height:40px;object-fit:cover;"></td>
                    <td><strong>${p.nome}</strong></td>
                    <td><span class="badge bg-light text-dark">${p.categoria}</span></td>
                    <td><code>${p.cod_barra || '---'}</code></td>
                </tr>
            `).join('');
        }
    } catch (e) { console.error("Erro ao carregar catálogo:", e); }
}

// BUSCA DE FOTO VIA IA (Gemini 2.5 Flash)
async function iaBuscarFoto() {
    const nome = document.getElementById('cat-nome').value;
    const btn = window.event.target; // Captura o botão clicado

    if (!nome) return alert("Digite o nome do produto para a IA buscar a foto.");

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

    try {
        const res = await fetch('/api/admin/ia/sugerir-imagem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nome })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('img-preview-ia').src = data.url;
            document.getElementById('cat-img-url').value = data.url;
        } else {
            alert("A IA não encontrou uma foto exata. Tente ser mais específico no nome.");
        }
    } catch (e) {
        alert("Erro ao consultar serviço de IA.");
    } finally {
        btn.innerHTML = '<i class="fas fa-magic"></i> IA: Buscar Foto Oficial';
        btn.disabled = false;
    }
}

// SALVAR NO BANCO DE DADOS (mercado.db)
async function salvarProdutoGlobal() {
    const payload = {
        nome: document.getElementById('cat-nome').value,
        categoria: document.getElementById('cat-categoria').value,
        cod_barra: document.getElementById('cat-ean').value,
        imagem: document.getElementById('cat-img-url').value
    };

    if (!payload.nome) return alert("O nome do produto é obrigatório.");

    try {
        const res = await fetch('/api/admin/catalogo/salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            // Fecha o modal
            const modalInstance = bootstrap.Modal.getInstance(document.getElementById('modalProdutoGlobal'));
            modalInstance.hide();

            // Recarrega a tabela para mostrar o novo produto
            carregarCatalogoGlobal();
            alert("Produto salvo com sucesso no Catálogo Global!");
        } else {
            alert("Erro ao salvar: " + data.error);
        }
    } catch (e) {
        alert("Erro de comunicação com o servidor.");
    }
}

// ================================================================
// MÓDULO 4: GESTÃO DE PREÇOS (VÍNCULO ISOLADO)
// ================================================================

let mercadoAtivoId = null;

async function abrirGestaoPrecos(id, nome) {
    mercadoAtivoId = id;
    const titulo = document.getElementById('nome-mercado-titulo');
    if (titulo) titulo.innerText = nome;

    new bootstrap.Modal(document.getElementById('modalGestaoPrecos')).show();

    carregarPrecosUnidade();
    carregarCatalogoVincular();
}

async function carregarPrecosUnidade() {
    const res = await fetch(`/api/admin/mercado/${mercadoAtivoId}/precos`);
    const data = await res.json();
    const container = document.getElementById('tabela-precos-unidade');

    container.innerHTML = data.precos.map(p => `
        <tr>
            <td><img src="${p.imagem || 'https://via.placeholder.com/80x80?text=Produto'}" width="30" class="me-2 rounded">${p.nome}</td>
            <td>
                <input type="number" class="form-control form-control-sm" style="width:100px" 
                       value="${p.preco.toFixed(2)}" onchange="atualizarPrecoRapido(${p.produto_id}, this.value)">
            </td>
            <td><button class="btn btn-sm text-danger"><i class="fas fa-trash"></i></button></td>
        </tr>
    `).join('');
}

async function carregarCatalogoVincular() {
    const res = await fetch('/api/admin/catalogo');
    const data = await res.json();
    const container = document.getElementById('lista-vincular-produtos');

    container.innerHTML = data.produtos.map(p => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
            <span>${p.nome}</span>
            <button class="btn btn-sm btn-primary" onclick="vincularAoMercado(${p.id})"><i class="fas fa-plus"></i></button>
        </div>
    `).join('');
}

async function vincularAoMercado(produtoId) {
    const preco = prompt("Preço para este mercado:", "0.00");
    if (preco === null) return;

    await fetch('/api/admin/mercado/vincular-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            produto_id: produtoId,
            supermercado_id: mercadoAtivoId,
            preco: parseFloat(preco.replace(',', '.'))
        })
    });
    carregarPrecosUnidade();
}

async function atualizarPrecoRapido(produtoId, novoPreco) {
    await fetch('/api/admin/mercado/vincular-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            produto_id: produtoId,
            supermercado_id: mercadoAtivoId,
            preco: parseFloat(novoPreco)
        })
    });
}

// Inicialização padrão
document.addEventListener('DOMContentLoaded', () => {
    carregarDashboard();
});
// ================================================================
// UTILITÁRIOS E INICIALIZAÇÃO
// ================================================================

function logout() { fetch('/api/logout'); }
function abrirModalMercado() { new bootstrap.Modal(document.getElementById('modal-supermercado')).show(); }
// ================================================================
// 2. MÓDULO CATÁLOGO (PRODUTOS GLOBAIS)
// ================================================================

// FUNÇÃO PARA ABRIR O MODAL (O que estava faltando)
// Abre o modal de novo produto
function abrirModalProdutoGlobal() {
    console.log("Tentando abrir modal..."); // Verifique se isso aparece no console (F12)

    const modalElement = document.getElementById('modalProdutoGlobal');
    if (!modalElement) {
        console.error("Erro: O elemento modalProdutoGlobal não existe no HTML!");
        return;
    }

    const form = document.getElementById('form-novo-produto');
    if (form) form.reset();

    // Reseta preview
    const preview = document.getElementById('img-preview-ia');
    if (preview) preview.src = 'https://via.placeholder.com/80x80?text=Produto';

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

// Lógica para Novo Mercado com Geolocalização Automática
async function salvarNovoMercado() {
    const payload = {
        nome: document.getElementById('m-nome').value,
        endereco: document.getElementById('m-endereco').value
    };

    if (!payload.nome || !payload.endereco) return alert("Preencha todos os campos.");

    const btn = window.event.target;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Geocodificando...';

    try {
        const res = await fetch('/api/admin/mercado/salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            alert(`Mercado salvo! Localizado em: Lat ${data.lat}, Lon ${data.lon}`);
            bootstrap.Modal.getInstance(document.getElementById('modal-supermercado')).hide();
            carregarMercados();
        }
    } catch (e) {
        alert("Erro ao salvar mercado.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-2"></i>Salvar e Geolocalizar';
    }
}

// Envia os dados para o banco via API
async function salvarProdutoGlobal() {
    const nome = document.getElementById('cat-nome').value;
    const categoria = document.getElementById('cat-categoria').value;
    const cod_barra = document.getElementById('cat-ean').value;
    const imagem = document.getElementById('cat-img-url').value;

    if (!nome) {
        alert("Por favor, preencha o nome do produto.");
        return;
    }

    const payload = {
        nome: nome,
        categoria: categoria,
        cod_barra: cod_barra,
        imagem: imagem
    };

    try {
        const res = await fetch('/api/admin/catalogo/salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            alert("Produto cadastrado com sucesso!");

            // Fecha o modal
            const modalElement = document.getElementById('modalProdutoGlobal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            modalInstance.hide();

            // Atualiza a tabela do catálogo para mostrar o novo item
            carregarCatalogoGlobal();
        } else {
            alert("Erro ao salvar: " + data.message);
        }
    } catch (e) {
        console.error("Erro na requisição:", e);
        alert("Erro de comunicação com o servidor.");
    }
}

// 2. Novas funções para Gerenciamento de Usuários
async function carregarUsuariosAdmin() {
    try {
        const response = await fetch('/api/admin/usuarios/listar');
        const data = await response.json();
        const tbody = document.getElementById('tabela-usuarios-admin');

        if (data.success) {
            tbody.innerHTML = data.usuarios.map(u => `
                <tr>
                    <td>
                        <div class="fw-bold">${u.nome}</div>
                        <small class="text-muted">${u.email || 'Sem email'}</small>
                    </td>
                    <td>${u.telefone}</td>
                    <td>
                        <span class="badge bg-success" style="font-size: 0.9rem;">
                            ${u.pontos} pts
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="editarPontosUsuario(${u.id}, ${u.pontos})">
                            <i class="fas fa-edit"></i> Ajustar Pontos
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error("Erro ao carregar usuários:", err); }
}

async function editarPontosUsuario(id, pontosAtuais) {
    const novosPontos = prompt("Digite a nova pontuação para este usuário:", pontosAtuais);

    if (novosPontos !== null) {
        try {
            const res = await fetch('/api/admin/usuarios/atualizar-pontos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, pontos: parseInt(novosPontos) })
            });
            const data = await res.json();
            if (data.success) {
                carregarUsuariosAdmin(); // Recarrega a lista
            }
        } catch (err) { alert("Erro ao atualizar pontos."); }
    }
}

// --- FUNÇÃO DE BUSCA EM TEMPO REAL ---
function filtrarUsuarios() {
    // Pega o termo digitado e transforma em minúsculo para comparar
    const termo = document.getElementById('input-busca-usuarios').value.toLowerCase();
    // Pega todas as linhas da tabela de usuários
    const linhas = document.querySelectorAll('#tabela-usuarios-admin tr');

    linhas.forEach(linha => {
        // Pega o texto da linha inteira (Nome, Tel, Email)
        const textoLinha = linha.innerText.toLowerCase();

        // Se o termo estiver no texto, mostra a linha, senão esconde
        if (textoLinha.includes(termo)) {
            linha.style.display = "";
            // Pequeno efeito visual para destacar a busca
            linha.style.animation = "fadeIn 0.3s";
        } else {
            linha.style.display = "none";
        }
    });
}

async function carregarAvisosAdmin() {
    const res = await fetch('/api/admin/avisos/listar');
    const data = await res.json();
    const container = document.getElementById('lista-avisos-admin');

    if (data.success) {
        container.innerHTML = data.avisos.map(a => `
            <div class="list-group-item px-0">
                <div class="d-flex justify-content-between">
                    <h6 class="mb-1 fw-bold">${a.titulo}</h6>
                    <small class="text-muted">${new Date(a.data_criacao).toLocaleDateString()}</small>
                </div>
                <p class="mb-1 small">${a.mensagem}</p>
                <span class="badge bg-${a.tipo} text-uppercase" style="font-size: 0.6rem;">${a.tipo}</span>
            </div>
        `).join('');
    }
}

async function enviarAviso() {
    const payload = {
        titulo: document.getElementById('aviso-titulo').value,
        mensagem: document.getElementById('aviso-mensagem').value,
        tipo: document.getElementById('aviso-tipo').value
    };

    if (!payload.titulo || !payload.mensagem) return alert("Preencha título e mensagem!");

    const res = await fetch('/api/admin/avisos/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if ((await res.json()).success) {
        alert("Aviso enviado com sucesso!");
        document.getElementById('form-aviso').reset();
        carregarAvisosAdmin();
    }
}

async function identificarEAN() {
    const ean = document.getElementById('cat-ean').value;
    if (ean.length < 8) return; // Ignora códigos curtos

    try {
        const res = await fetch(`/api/check-product?barcode=${ean}`);
        const data = await res.json();

        if (data.success && data.product) {
            // Preenche os campos automaticamente
            document.getElementById('cat-nome').value = data.product.nome || data.product.name;
            document.getElementById('cat-categoria').value = data.product.categoria || data.product.category;

            if (data.product.imagem) {
                document.getElementById('img-preview-ia').src = data.product.imagem;
                document.getElementById('cat-img-url').value = data.product.imagem;
            }

            if (data.exists) {
                console.log("Produto já existente no banco carregado.");
            } else {
                console.log("Dados sugeridos pela IA para novo cadastro.");
            }
        }
    } catch (e) {
        console.error("Erro ao identificar EAN:", e);
    }
}

// Adicione esta chamada dentro do carregarDashboard() ou no final do arquivo
async function verificarStatusBanco() {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return; // Sai da função se o elemento não existir

    try {
        const res = await fetch('/api/admin/db-status');
        const data = await res.json();
        // ... restante da sua lógica
    } catch (e) {
        badge.className = 'badge bg-danger';
        badge.innerHTML = 'Erro de Conexão';
    }
}
