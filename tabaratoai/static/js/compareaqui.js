// Extraído de compareaqui.html


// === CONTROLE DO TEMA (DARK MODE) ===
function toggleTheme() {
    const body = document.body;
    const btnIcon = document.querySelector('.theme-toggle-btn i');

    // Alterna a classe no corpo do site
    body.classList.toggle('dark-mode');

    // Verifica se ficou escuro ou claro
    const isDark = body.classList.contains('dark-mode');

    // Troca o ícone (Lua <-> Sol)
    if (isDark) {
        btnIcon.classList.remove('fa-moon');
        btnIcon.classList.add('fa-sun');
        localStorage.setItem('theme', 'dark'); // Salva na memória
    } else {
        btnIcon.classList.remove('fa-sun');
        btnIcon.classList.add('fa-moon');
        localStorage.setItem('theme', 'light'); // Salva na memória
    }
}

// Função que roda ao abrir a página para lembrar a escolha
function carregarTemaSalvo() {
    const temaSalvo = localStorage.getItem('theme');
    const btnIcon = document.querySelector('.theme-toggle-btn i');

    if (temaSalvo === 'dark') {
        document.body.classList.add('dark-mode');
        if (btnIcon) {
            btnIcon.classList.remove('fa-moon');
            btnIcon.classList.add('fa-sun');
        }
    }
}

// Chama o carregamento assim que possível
document.addEventListener('DOMContentLoaded', carregarTemaSalvo);

// Estado para controlar carregamento
const loadingState = {
    isLoading: false,
    setLoading: function (state) {
        this.isLoading = state;
        this.updateUI();
    },
    updateUI: function () {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.display = this.isLoading ? 'block' : 'none';
        }
    }
};

// Criar elemento de loading global se não existir
if (!document.getElementById('global-loader')) {
    const loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.style.cssText = `
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
                backdrop-filter: blur(3px);
            `;
    loader.innerHTML = `
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-align: center;">
                    <div class="loading-spinner" style="border: 4px solid rgba(255,255,255,0.3); border-left: 4px solid white; width: 40px; height: 40px; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
                    <div>Carregando...</div>
                </div>
            `;
    document.body.appendChild(loader);
}

// ==========================================================
// ===== FUNÇÕES EXISTENTES (Início) =====
// ==========================================================

// Cache simples para produtos
const produtoCache = new Map();

async function carregarProdutos() {
    loadingState.setLoading(true);

    // Mostra spinner inicial se estiver vazio
    if (produtosContainer.children.length === 0) {
        produtosContainer.innerHTML = '<div class="loading-spinner"></div>';
    }

    try {
        // Garante que os elementos existem antes de acessar o valor
        const buscaEl = document.getElementById('busca-produto-destaque');
        const ordemEl = document.getElementById('ordenacao');

        const busca = buscaEl ? buscaEl.value : '';
        const ordem = ordemEl ? ordemEl.value : 'menor-preco';
        const cacheKey = `${busca}-${ordem}`;

        // Verifica cache simples para evitar requisições repetidas imediatas
        if (produtoCache.has(cacheKey) && !busca) {
            estado.produtosFiltrados = produtoCache.get(cacheKey);
            renderizarProdutos(estado.produtosFiltrados);
            loadingState.setLoading(false);
            return;
        }

        // Monta URL da API
        let url = `/api/produtos?ordenacao=${ordem}`;
        if (busca) url += `&busca=${encodeURIComponent(busca)}`;

        console.log("Buscando produtos em:", url); // Log para debug

        const res = await fetch(url);
        const data = await res.json();

        if (data.success) {
            produtoCache.set(cacheKey, data.produtos);

            // Se não houver produtos, renderiza vazio
            if (data.produtos.length === 0) {
                renderizarProdutos([]);
            } else {
                // Carrega os detalhes (preços comparativos)
                await carregarDetalhesProdutos(data.produtos);
            }
        } else {
            produtosContainer.innerHTML = '<p style="text-align:center; padding: 2rem;">Não foi possível carregar os produtos.</p>';
        }
    } catch (e) {
        console.error("Erro no fetch:", e);
        produtosContainer.innerHTML = '<p style="text-align:center; padding: 2rem;">Erro de conexão ao carregar produtos.</p>';
    } finally {
        loadingState.setLoading(false);
    }
}

const estado = {
    produtosFiltrados: [],
    listaCompras: JSON.parse(localStorage.getItem('listaComprasTemp')) || [],
    favoritos: JSON.parse(localStorage.getItem('favoritos')) || [],
    usuarioLogado: false,
    usuarioInfo: null,
    userLocation: null,
    usuarioInfo: null,
    listaCompras: [],
    produtos: []
};

const produtosContainer = document.getElementById('produtos-container');
const buscaProduto = document.getElementById('busca-produto-destaque');
const sugestoesLista = document.getElementById('sugestoes-lista');
const contadorLista = document.getElementById('contador-lista');
const modalLista = document.getElementById('modal-lista');
const listaComprasContainer = document.getElementById('lista-compras');
const totalListaEl = document.getElementById('total-lista');
const ordenacaoSelect = document.getElementById('ordenacao');
const locationStatus = document.getElementById('location-status');
let ofertastack = [];



// NOVO: Elementos do menu mobile
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
const mobileMenuSidebar = document.getElementById('mobile-menu-sidebar');
const mobileMenuClose = document.getElementById('mobile-menu-close');

// --- 1. VARIÁVEIS GLOBAIS OBRIGATÓRIAS (Adicione logo no início das variáveis) ---
let supermercadosSelecionados = [];
let idsSupermercadosAtivos = []; // <--- ESSENCIAL: Sem isso o filtro quebra!


// --- 2. BLOCO DE INICIALIZAÇÃO CORRIGIDO ---
document.addEventListener('DOMContentLoaded', () => {
    // === CHAME AQUI PARA ABRIR O MATCH DE OFERTAS AO ENTRAR ===
    carregarTinder();
    // Inicialização de Usuário e GPS
    verificarUsuarioLogado().then(() => {
        iniciarGeolocalizacao();
    });
    // ... restante do código original ...

    // Inicialização da Lista de Compras
    estado.listaCompras = JSON.parse(localStorage.getItem('listaComprasTemp')) || [];
    atualizarContador();

    // Listeners do Menu Mobile
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    if (mobileMenuOverlay) mobileMenuOverlay.addEventListener('click', toggleMobileMenu);
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', toggleMobileMenu);

    // Listeners de Busca e Ordenação
    if (buscaProduto) buscaProduto.addEventListener('input', handleBusca);
    if (ordenacaoSelect) ordenacaoSelect.addEventListener('change', carregarProdutos);

    // Botão Flutuante "Minha Lista"
    const btnMinhaLista = document.getElementById('btn-minha-lista');
    if (btnMinhaLista) {
        btnMinhaLista.addEventListener('click', () => {
            renderizarListaModal();
            modalLista.classList.add('ativo');
            setTimeout(verificarNotificacoes, 2000);
        });
    }

    // Botão Fechar Lista (X)
    const btnFecharLista = document.getElementById('btn-fechar-lista');
    if (btnFecharLista) {
        btnFecharLista.addEventListener('click', () => modalLista.classList.remove('ativo'));
    }

    // Fechar Lista ao clicar no fundo escuro
    if (modalLista) {
        modalLista.addEventListener('click', (e) => {
            if (e.target === modalLista) modalLista.classList.remove('ativo');
        });
    }

    // Botão Salvar Lista
    const btnGuardarLista = document.getElementById('btn-guardar-lista');
    if (btnGuardarLista) {
        btnGuardarLista.addEventListener('click', guardarLista);
    }

    // Listener Global (Fechar dropdowns/sugestões ao clicar fora)
    document.addEventListener('click', (e) => {
        if (sugestoesLista && !sugestoesLista.contains(e.target) && e.target !== buscaProduto) {
            sugestoesLista.classList.remove('ativo');
        }
        const userDropdown = document.getElementById('user-dropdown');
        const userBtn = document.getElementById('user-btn-trigger');
        if (userDropdown && userBtn && !userDropdown.contains(e.target) && !userBtn.contains(e.target)) {
            userDropdown.classList.remove('ativo');
        }
    });

    // Listener Modal Ranking (Fechar ao clicar fora)
    const modalRanking = document.getElementById('modal-ranking');
    if (modalRanking) {
        modalRanking.addEventListener('click', (e) => {
            if (e.target.id === 'modal-ranking') fecharRanking();
        });
    }

    // --- A CORREÇÃO ESTÁ AQUI EMBAIXO ---
    // A função é chamada DENTRO do bloco, garantindo que o HTML já existe
    carregarFiltrosSupermercados();



}); // <--- Fim do DOMContentLoaded
// NOVO: Função para abrir/fechar o menu mobile
function toggleMobileMenu() {
    mobileMenuOverlay.classList.toggle('ativo');
    mobileMenuSidebar.classList.toggle('ativo');
}

// NOVO: Função para abrir a calculadora (agora via menu mobile)
async function abrirCalculadora() {
    await verificarUsuarioLogado();
    if (!estado.usuarioLogado) {
        mostrarToast("Faça login para usar a calculadora!", "error");
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }
    toggleMobileMenu(); // Fecha o menu mobile
    window.location.href = 'calculadora.html';
}

// --- GEOLOCALIZAÇÃO HÍBRIDA (GPS + ENDEREÇO) ---
async function iniciarGeolocalizacao() {
    locationStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Localizando...';

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                estado.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                locationStatus.innerHTML = '<i class="fas fa-map-marker-alt" style="color:var(--success)"></i> GPS Ativo';
                console.log("GPS Ativo:", estado.userLocation);
                carregarProdutos();
            },
            (error) => {
                console.warn("GPS falhou ou negado. Tentando endereço do cadastro...", error);
                usarEnderecoCadastro();
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
        );
    } else {
        console.warn("Navegador sem suporte a GPS. Tentando endereço...");
        usarEnderecoCadastro();
    }
}

async function usarEnderecoCadastro() {
    // Verifica se tem dados de endereço. 
    // Nota: Adicionei logs para você ver no console se algo estiver faltando
    if (!estado.usuarioLogado || !estado.usuarioInfo || !estado.usuarioInfo.endereco_completo) {
        console.warn("Endereço não encontrado ou usuário deslogado. Carregando produtos padrão.");
        locationStatus.innerHTML = '<i class="fas fa-eye-slash"></i> Sem Loc.';

        // CORREÇÃO CRÍTICA: Chama os produtos mesmo se falhar o endereço
        carregarProdutos();
        return;
    }

    const endereco = estado.usuarioInfo.endereco_completo;
    locationStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Geocodificando...';

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}, Manaus, Brazil`;
        const res = await fetch(url);
        const data = await res.json();

        if (data && data.length > 0) {
            estado.userLocation = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
            locationStatus.innerHTML = '<i class="fas fa-home" style="color:var(--primary)"></i> Via Endereço';
        } else {
            locationStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> End. não achado';
        }
    } catch (e) {
        console.error("Erro geocoding", e);
        locationStatus.innerHTML = '<i class="fas fa-times"></i> Erro Loc.';
    } finally {
        // Garante que os produtos carreguem independente do resultado do geocoding
        carregarProdutos();
    }
}

// Fórmula de Haversine para calcular distância em km
function calcularDistancia(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;

    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
}

function persistirLista() { localStorage.setItem('listaComprasTemp', JSON.stringify(estado.listaCompras)); }

async function verificarUsuarioLogado() {
    try {
        const res = await fetch('/api/usuario-info');
        const data = await res.json();

        // Elementos do Desktop
        const userActions = document.getElementById('user-actions');

        // Elementos do Mobile
        const mobileProfileArea = document.getElementById('mobile-profile-area');
        const mobileAuthArea = document.getElementById('mobile-auth-area');

        // --- CENÁRIO 1: USUÁRIO ESTÁ LOGADO ---
        if (data.success) {
            estado.usuarioLogado = true;
            estado.usuarioInfo = data.usuario;

            // 1. DESKTOP: Cria o Dropdown
            if (userActions) {
                userActions.innerHTML = `
                <div class="user-dropdown-container">
                    <button class="user-btn" id="user-btn-trigger" onclick="toggleUserMenu()">
                        <i class="fas fa-user-circle"></i> ${data.usuario.nome.split(' ')[0]}
                        <i class="fas fa-chevron-down" style="font-size:0.8rem; margin-left:4px"></i>
                    </button>
                    <div class="dropdown-menu" id="user-dropdown">
                        
                        <div class="dropdown-item" style="cursor: default; color: var(--text-sec); font-size: 0.85rem; background: #f9fafb;">
                            <span id="location-status">
                                <i class="fas fa-spinner fa-spin"></i> Buscando GPS...
                            </span>
                        </div>
                        <div class="dropdown-divider"></div>
                        <a href="meuperfil.html" class="dropdown-item"><i class="fas fa-user-circle"></i> Meu Perfil</a>
                        
                        <div class="dropdown-divider"></div>
                        
                        <a href="/" class="dropdown-item"><i class="fas fa-home"></i> Início</a>
                        
                        <a href="/ferramentas" class="dropdown-item">
                            <i class="fas fa-tools"></i> Utilitários
                        </a>
                        
                        <a href="/historico-precos" class="dropdown-item">
                            <i class="fas fa-chart-line"></i> Histórico
                        </a>
                        
                        <a href="cadastrar_produtos.html" class="dropdown-item">
                            <i class="fas fa-plus-circle"></i> Cadastrar Produtos
                        </a>

                        <div class="dropdown-divider"></div>
                        <a href="#" onclick="fetch('/api/logout'); return false;" class="dropdown-item" style="color:var(--danger)"><i class="fas fa-sign-out-alt"></i> Sair</a>
                    </div>
                </div>`;
            }

            // 2. MOBILE: Cartão de Perfil
            if (mobileProfileArea) {
                const primeiraLetra = data.usuario.nome.charAt(0).toUpperCase();
                const primeiroNome = data.usuario.nome.split(' ')[0];

                mobileProfileArea.innerHTML = `
                <div class="user-profile-card" onclick="window.location.href='meuperfil.html'">
                    <div class="user-avatar-circle">${primeiraLetra}</div>
                    <div class="user-info-text">
                        <span class="user-name">Olá, ${primeiroNome}</span>
                        <span class="user-action-link">Editar meu perfil <i class="fas fa-chevron-right" style="font-size:0.7rem"></i></span>
                    </div>
                </div>`;
            }

            // 3. MOBILE: Botão Sair
            if (mobileAuthArea) {
                mobileAuthArea.innerHTML = `
                <a href="#" onclick="fetch('/api/logout'); return false;" class="mobile-menu-item" style="color: var(--danger);">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Sair da conta</span>
                </a>`;
            }

            document.getElementById('btn-guardar-lista').disabled = false;

        }
        // --- CENÁRIO 2: USUÁRIO NÃO ESTÁ LOGADO (Else) ---
        else {
            estado.usuarioLogado = false;
            estado.usuarioInfo = null;

            // Desktop fallback: Coloca o GPS pequeno ao lado do botão entrar (caso queira ver sem logar)
            // Se preferir totalmente invisível quando deslogado, remova a tag <span> abaixo.
            if (userActions) {
                userActions.innerHTML = `
                <span id="location-status" style="font-size: 0.8rem; color: #999; margin-right: 10px;"></span>
                <a href="login.html" class="nav-link" id="btn-login-nav"><i class="fas fa-user"></i> Entrar</a>`;
            }

            // Mobile fallback
            if (mobileProfileArea) mobileProfileArea.innerHTML = '';
            if (mobileAuthArea) {
                mobileAuthArea.innerHTML = `
                <a href="login.html" class="mobile-menu-item">
                    <i class="fas fa-user"></i>
                    <span>Entrar</span>
                </a>`;
            }

            document.getElementById('btn-guardar-lista').disabled = true;
        }
    } catch (e) {
        console.error("Erro auth:", e);
        estado.usuarioLogado = false;
    }
}


function toggleUserMenu() { document.getElementById('user-dropdown')?.classList.toggle('ativo'); }


async function carregarDetalhesProdutos(produtos) {
    try {
        // Carrega TODOS os produtos de uma vez
        const ids = produtos.map(p => p.id).join(',');
        const res = await fetch(`/api/produtos-em-lote?ids=${ids}`);
        const data = await res.json();

        if (data.success) {
            estado.produtosFiltrados = data.produtos;
        } else {
            estado.produtosFiltrados = produtos.map(p => ({ ...p, comparacao: [] }));
        }
        renderizarProdutos(estado.produtosFiltrados);
    } catch (e) {
        console.error("Erro ao carregar detalhes:", e);
        estado.produtosFiltrados = produtos.map(p => ({ ...p, comparacao: [] }));
        renderizarProdutos(estado.produtosFiltrados);
    }
}

function calcularTempoRestante(dataValidade) {
    if (!dataValidade) return null;

    const agora = new Date();
    // Ajuste simples para garantir que a string do DB (YYYY-MM-DD HH:MM:SS) seja lida corretamente
    const fim = new Date(dataValidade.replace(' ', 'T'));
    const diff = fim - agora;

    if (diff <= 0) return null; // Expirou

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let texto = '';
    let classe = '';

    if (dias > 1) {
        texto = `${dias} dias restantes`;
    } else if (dias === 1) {
        texto = `1 dia restante`;
        classe = 'urgent';
    } else if (horas > 0) {
        texto = `${horas}h ${minutos}m restantes`;
        classe = 'urgent';
        if (horas < 2) classe = 'critical';
    } else {
        texto = `${minutos} min restantes`;
        classe = 'critical';
    }

    return { texto, classe };
}



let searchTimeout;

// --- CORREÇÃO 3: BUSCA RESETADA ---
function handleBusca(e) {
    clearTimeout(searchTimeout);
    const sugestoesLista = document.getElementById('sugestoes-lista');
    const termo = e.target.value.trim(); // Trim remove espaços vazios acidentais

    if (termo.length === 0) {
        sugestoesLista.classList.remove('ativo');
        // RECARREGA A LISTA COMPLETA IMEDIATAMENTE
        carregarProdutos();
        return;
    }

    if (termo.length < 2) {
        sugestoesLista.classList.remove('ativo');
        return;
    }

    // ... restante da lógica de busca inteligente ...
    searchTimeout = setTimeout(async () => {
        // (Mantenha sua lógica de fetch /api/buscar-produtos aqui)
        try {
            const res = await fetch(`/api/buscar-produtos?termo=${encodeURIComponent(termo)}`);
            const data = await res.json();
            if (data.success && data.sugestoes.length > 0) {
                // ... renderiza sugestões ...
                sugestoesLista.innerHTML = data.sugestoes.map(s => `
                    <div class="sugestao-item" onclick="selecionarSugestao('${s.id}')">
                        <div class="sugestao-info">
                            <div class="sugestao-nome">${s.nome}</div>
                            <div class="sugestao-detalhes">R$ ${s.preco.toFixed(2)} em ${s.mercado_nome}</div>
                        </div>
                    </div>`).join('');
                sugestoesLista.classList.add('ativo');
            } else {
                sugestoesLista.classList.remove('ativo');
            }
        } catch (e) { console.error(e); }
    }, 300);
}

// Ao clicar na sugestão, carrega APENAS aquele produto com detalhes completos
async function selecionarSugestao(id) {
    document.getElementById('sugestoes-lista').classList.remove('ativo');
    loadingState.setLoading(true);

    try {
        // Usa a API de lote para pegar detalhes completos deste ID específico
        const res = await fetch(`/api/produtos-em-lote?ids=${id}`);
        const data = await res.json();

        if (data.success) {
            renderizarProdutos(data.produtos);
        }
    } catch (e) {
        console.error(e);
    } finally {
        loadingState.setLoading(false);
    }
}

/* =============================================================
NOVA LÓGICA DE FILTROS (SUPERMERCADOS + CATEGORIAS + BUSCA)
Cole isto no lugar das funções antigas renderizarProdutos e aplicarFiltros
============================================================= */

// Variável para guardar os dados brutos das redes (para usarmos no modal)
let dadosRedesGlobal = [];

// Atualize a função de carregar para salvar os dados na variável global
async function carregarFiltrosSupermercados() {
    const container = document.getElementById('supermarket-filters');
    if (!container) return;

    try {
        const res = await fetch('/api/public/supermercados');
        const json = await res.json();

        if (json.success) {
            dadosRedesGlobal = json.data; // <--- SALVANDO DADOS AQUI

            container.innerHTML = json.data.map(rede => {
                const isRede = rede.ids_filiais.length > 1;
                // Note que não passamos mais os IDs no onclick inline, vamos buscar na global
                return `
                <div class="market-filter-item ${isRede ? 'is-network' : ''}" 
                     id="market-group-${rede.id}" 
                     onclick='handleCliqueRede(${rede.id})'>
                    
                    <div class="market-filter-ring">
                        ${isRede ? `<span class="network-count">${rede.ids_filiais.length}</span>` : ''}
                        <img src="${rede.logo || 'static/img/placeholder_market.png'}" 
                             class="market-filter-img" 
                             onerror="this.src='https://placehold.co/60?text=${rede.nome.charAt(0)}'">
                    </div>
                    <span class="market-filter-name">
                        ${rede.nome.replace('Supermercado', '').replace('Matriz', '').trim()}
                    </span>
                </div>
            `}).join('');
        }
    } catch (e) {
        console.error("Erro ao carregar mercados", e);
    }
}


// NOVA FUNÇÃO DE CLIQUE
function handleCliqueRede(redeId) {
    const rede = dadosRedesGlobal.find(r => r.id == redeId);
    if (!rede) return;

    // Se só tem 1 loja (não é rede), seleciona direto
    if (rede.ids_filiais.length <= 1) {
        toggleFiltroMercadoUnico(rede.ids_filiais[0], redeId);
        return;
    }

    // Se é rede, abre o modal para escolher
    abrirModalSelecaoFilial(rede);
}


function abrirModalSelecaoFilial(rede) {
    const modal = document.getElementById('modal-select-filial');
    const lista = document.getElementById('lista-filiais-selecao');
    document.getElementById('titulo-rede-selecao').innerText = rede.nome;

    let html = `
        <button class="btn-ios secondary" onclick="selecionarTodasFiliais(${rede.id})">
            <i class="fas fa-layer-group"></i> Ver Todas as Lojas
        </button>
        <div style="height: 1px; background: #eee; margin: 5px 0;"></div>
    `;

    // Como a API pública atual agrupa os IDs mas não traz os nomes das filiais individuais 
    // (para economizar banda), vamos fazer um fetch rápido para pegar os nomes das filiais se necessário
    // OU, se você quiser resolver rápido, listamos genericamente "Loja 1", "Loja 2".
    // O ideal é atualizar a API /api/public/supermercados para retornar {id, nome} nas filiais.

    // **SOLUÇÃO ROBUSTA:** Vamos fazer um fetch rápido das filiais dessa matriz
    fetch(`/api/admin/supermercados/${rede.id}/filiais`)
        .then(r => r.json())
        .then(d => {
            // Adiciona a matriz também na lista de escolha (se ela não estiver na lista de filiais)
            // Assumindo que a API de filiais retorna só as filiais.

            // Botão da Matriz Principal
            html += `
             <button class="btn-ios" style="background: white; color: var(--text-main); border: 1px solid #eee; justify-content: space-between;" 
                onclick="toggleFiltroMercadoUnico(${rede.id}, ${rede.id}); document.getElementById('modal-select-filial').classList.remove('ativo')">
                <span><i class="fas fa-store"></i> ${rede.nome} (Matriz)</span>
                <i class="fas fa-chevron-right" style="font-size: 0.8rem; color: #ccc;"></i>
             </button>
            `;

            if (d.success && d.data) {
                d.data.forEach(filial => {
                    html += `
                    <button class="btn-ios" style="background: white; color: var(--text-main); border: 1px solid #eee; justify-content: space-between;" 
                        onclick="toggleFiltroMercadoUnico(${filial.id}, ${rede.id}); document.getElementById('modal-select-filial').classList.remove('ativo')">
                        <span><i class="fas fa-map-marker-alt"></i> ${filial.nome.replace(rede.nome, '').trim() || filial.bairro || 'Filial'}</span>
                        <i class="fas fa-chevron-right" style="font-size: 0.8rem; color: #ccc;"></i>
                    </button>
                    `;
                });
            }
            lista.innerHTML = html;
        });

    modal.classList.add('ativo');
}

function selecionarTodasFiliais(redeId) {
    const rede = dadosRedesGlobal.find(r => r.id == redeId);
    if (rede) {
        // Seleciona todos os IDs da rede
        idsSupermercadosAtivos = rede.ids_filiais.map(id => String(id));
        atualizarVisualAtivo(redeId);
        aplicarFiltros();
    }
    document.getElementById('modal-select-filial').classList.remove('ativo');
}

function toggleFiltroMercadoUnico(mercadoId, grupoVisualId) {
    // Reseta seleção anterior
    idsSupermercadosAtivos = [String(mercadoId)];

    atualizarVisualAtivo(grupoVisualId);
    aplicarFiltros();
}

function atualizarVisualAtivo(grupoId) {
    // Remove active de todos
    document.querySelectorAll('.market-filter-item').forEach(el => el.classList.remove('active'));
    // Adiciona active no grupo selecionado
    const el = document.getElementById(`market-group-${grupoId}`);
    if (el) el.classList.add('active');
}


/// 2. Ação de Clicar (Seleciona TODOS os IDs daquela rede)
function toggleRedeSupermercados(grupoId, idsDaRede) {
    const element = document.getElementById(`market-group-${grupoId}`);
    const isActive = element.classList.contains('active');

    console.log("Filtrando pelos IDs:", idsSupermercadosAtivos);

    // Reset visual: remove active de todos
    document.querySelectorAll('.market-filter-item').forEach(el => el.classList.remove('active'));

    // Reset lógico
    idsSupermercadosAtivos = [];

    if (!isActive) {
        // Se não estava ativo, ativa agora
        element.classList.add('active');
        // Adiciona TODOS os IDs dessa rede (matriz + filiais) ao filtro
        idsSupermercadosAtivos = idsDaRede.map(id => String(id));
    }

    aplicarFiltros();
}

// 3. Renderização (Visual do Card)
// --- CORREÇÃO 2: RENDERIZAÇÃO ROBUSTA (Resolve o bug da busca vazia) ---
// --- FUNÇÃO RENDERIZAR PRODUTOS (COM TIMER REATIVADO) ---
function renderizarProdutos(produtos) {
    const container = document.getElementById('produtos-container');
    container.innerHTML = '';

    if (!produtos || produtos.length === 0) {
        container.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-sec);">
                <i class="fas fa-search" style="font-size:2rem; opacity:0.3; margin-bottom:1rem"></i>
                <p>Nenhum produto encontrado.</p>
            </div>`;
        return;
    }

    produtos.forEach(prod => {
        let ofertaExibida = null;
        let precoParaMostrar = 0;
        let nomeMercado = '';
        let logoMercado = 'static/img/placeholder_market.png';
        let dataValidade = null; // Variável para a data

        // 1. Tenta achar oferta baseada no filtro de mercado
        if (supermercadosSelecionados.length > 0 && prod.comparacao && prod.comparacao.length > 0) {
            ofertaExibida = prod.comparacao.find(pr => supermercadosSelecionados.includes(String(pr.supermercado_id)));
        }

        // 2. Se não achou (ou sem filtro), pega a melhor oferta global
        if (!ofertaExibida) {
            if (prod.comparacao && prod.comparacao.length > 0) {
                // Ordena por preço para garantir o menor
                prod.comparacao.sort((a, b) => a.preco - b.preco);
                ofertaExibida = prod.comparacao[0];
            }
        }

        // 3. DEFINIÇÃO FINAL DOS DADOS
        if (ofertaExibida) {
            precoParaMostrar = ofertaExibida.preco;
            nomeMercado = ofertaExibida.mercado_nome;
            logoMercado = ofertaExibida.mercado_logo || logoMercado;
            dataValidade = ofertaExibida.data_validade; // Pega a validade da oferta específica
        } else {
            // FALLBACK
            precoParaMostrar = prod.preco_minimo || 0;
            nomeMercado = precoParaMostrar > 0 ? 'Melhor Preço' : 'Indisponível';
            // Tenta pegar validade genérica se existir no produto raiz (opcional)
            dataValidade = prod.data_validade || null;
        }

        // --- LÓGICA DO TIMER (RECUPERADA) ---
        let timerHtml = '';
        if (dataValidade) {
            const tempo = calcularTempoRestante(dataValidade);
            if (tempo) {
                timerHtml = `
                    <div class="countdown-timer ${tempo.classe}">
                        <i class="fas fa-clock"></i> ${tempo.texto}
                    </div>`;
            }
        }
        // ------------------------------------

        const precoFormatado = precoParaMostrar > 0
            ? `R$ ${precoParaMostrar.toFixed(2).replace('.', ',')}`
            : '<span style="font-size:0.9rem; color:#999">Indisponível</span>';

        const estiloPreco = supermercadosSelecionados.length > 0 ? 'color:#1f2937' : '';

        // Localize este trecho dentro de renderizarProdutos e substitua:
        const imagemRaw = prod.imagem || prod.produto_imagem || '';
        let imgHtml = `<i class="fas fa-box card-img"></i>`;

        if (imagemRaw && imagemRaw.trim() !== '') {
            let urlFinal = imagemRaw;

            // Se for caminho do servidor (não começa com http) e não tiver a barra inicial
            if (!imagemRaw.startsWith('http')) {
                // Remove barras duplas acidentais e garante uma única barra no início
                urlFinal = '/' + imagemRaw.replace(/^\/+/, '');
            }

            imgHtml = `<img src="${urlFinal}" alt="${prod.nome}" class="product-real-img" 
        onerror="this.parentElement.innerHTML='<i class=\'fas fa-box card-img\'></i>'">`;
        }

        const card = document.createElement('div');
        card.className = 'produto-card';
        card.setAttribute('data-id', prod.id);
        card.onclick = () => abrirDetalhesProduto(prod.id);

        card.innerHTML = `
            ${prod.promocao ? '<span class="badge-promo">Oferta</span>' : ''}
            
            <div class="card-header">
                ${imgHtml}
            </div>
            
            <div class="card-body">
                <div class="prod-nome">${prod.nome}</div>
                
                ${timerHtml}
                
                <div class="main-price-block">
                    <div class="best-price" style="${estiloPreco}">
                        ${precoFormatado}
                    </div>
                    
                    ${precoParaMostrar > 0 ? `
                    <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                        <img src="${logoMercado}" style="width:20px; height:20px; border-radius:50%; object-fit:contain;" onerror="this.style.display='none'">
                        <span style="font-size:0.75rem; color:var(--text-sec); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${nomeMercado}
                        </span>
                    </div>` : ''}
                </div>
            </div>
            
            <div class="card-footer">
                <button class="btn-add-full" onclick="event.stopPropagation(); adicionarProdutoLista('${prod.id}', '${prod.nome}', ${precoParaMostrar}, '${nomeMercado}')">
                    ADICIONAR <i class="fas fa-cart-plus"></i>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}
// 2. Filtro Mestre
// 3. Filtro Mestre (CORRIGIDO PARA NÃO SUMIR TUDO)
function aplicarFiltros() {
    // A. Categorias
    const checkboxes = document.querySelectorAll('.filters-scroll input[type="checkbox"]:checked');
    const categorias = Array.from(checkboxes).map(cb => cb.value);

    // B. Busca
    const termo = document.getElementById('busca-produto-destaque')?.value.toLowerCase() || '';

    // C. Ordenação
    const ordem = document.getElementById('ordenacao')?.value || 'menor-preco';

    // D. Base de Dados
    let listaBase = (estado.produtosFiltrados && estado.produtosFiltrados.length > 0)
        ? estado.produtosFiltrados
        : estado.produtos;

    // E. Filtragem
    let listaFinal = listaBase.filter(prod => {
        // 1. Nome
        const matchNome = prod.nome.toLowerCase().includes(termo);

        // 2. Categoria
        const matchCat = categorias.length === 0 || categorias.includes(prod.categoria);

        // 3. Supermercado (A CORREÇÃO ESTÁ AQUI)
        let matchMercado = true;

        if (idsSupermercadosAtivos.length > 0) {
            // Se o produto ainda não carregou os detalhes de preço (comparacao), 
            // assumimos que ele NÃO passa no filtro (ou você pode mudar para true se quiser mostrar loading)
            if (!prod.comparacao || prod.comparacao.length === 0) {
                matchMercado = false;
            } else {
                // Verifica se existe ALGUM preço nos mercados selecionados
                // O String() garante que comparamos texto com texto
                matchMercado = prod.comparacao.some(preco => {
                    // Converte ambos para String para garantir que "5" seja igual a 5
                    return idsSupermercadosAtivos.map(String).includes(String(preco.supermercado_id));
                });
            }
        }

        return matchNome && matchCat && matchMercado;
    });

    // F. Ordenação Dinâmica (Ajustada para o filtro)
    listaFinal.sort((a, b) => {
        // Helper para pegar o preço relevante
        const getPrecoParaOrdenar = (p) => {
            if (idsSupermercadosAtivos.length > 0 && p.comparacao) {
                // Tenta achar o preço no(s) mercado(s) filtrado(s)
                // Pega o menor preço dentre as filiais selecionadas
                const ofertasValidas = p.comparacao
                    .filter(pr => idsSupermercadosAtivos.includes(String(pr.supermercado_id)))
                    .sort((x, y) => x.preco - y.preco);

                return ofertasValidas.length > 0 ? ofertasValidas[0].preco : 999999;
            }
            // Sem filtro, usa o menor global
            return p.preco_minimo || 999999;
        };

        const pa = getPrecoParaOrdenar(a);
        const pb = getPrecoParaOrdenar(b);

        if (ordem === 'menor-preco') return pa - pb;
        if (ordem === 'maior-economia') return pb - pa;
        if (ordem === 'nome') return a.nome.localeCompare(b.nome);
        return 0;
    });

    // Atualiza a variável global que renderizarProdutos usa (se necessário na sua lógica)
    // Mas aqui chamamos direto:
    renderizarProdutosFiltrados(listaFinal);
}


// 4. Função auxiliar de Renderização (para usar a variável correta de mercados)
function renderizarProdutosFiltrados(lista) {
    // Precisamos atualizar a variável global 'supermercadosSelecionados' 
    // porque sua função 'renderizarProdutos' original a utiliza para exibir o preço correto no card.
    supermercadosSelecionados = idsSupermercadosAtivos;

    renderizarProdutos(lista);
}

// ATENÇÃO: Certifique-se que esta função esteja atualizada no seu código
// Ela garante que ao clicar em "Todos" nas categorias, limpa os checkboxes
function limparFiltrosCategoria(el) {
    const checkboxes = document.querySelectorAll('.filters-scroll input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb !== el.querySelector('input')) cb.checked = false;
    });
    // Garante que o checkbox clicado fique marcado se for o "Todos"
    if (el) {
        const input = el.querySelector('input');
        if (input) input.checked = true;
    }
    aplicarFiltros();
}

function adicionarOfertaEspecifica(id, mercadoCod, mercadoNome, preco) {
    const produto = estado.produtosFiltrados.find(p => p.id === id);
    if (!produto) return;
    const itemExistente = estado.listaCompras.find(i => i.id === id && i.mercado === mercadoCod);
    if (itemExistente) itemExistente.quantidade++;
    else estado.listaCompras.push({ id: produto.id, nome: produto.nome, mercado: mercadoCod, mercado_nome: mercadoNome, preco: preco, quantidade: 1, imagem: produto.imagem });
    persistirLista();
    atualizarContador();
    mostrarToast(`${produto.nome} (${mercadoNome}) adicionado!`);
    if (modalLista.classList.contains('ativo')) renderizarListaModal();
}

function removerDaLista(index) {
    estado.listaCompras.splice(index, 1);
    persistirLista();
    atualizarContador();
    renderizarListaModal();
}

function alterarQuantidade(index, delta) {
    const item = estado.listaCompras[index];
    if (!item) return;
    const novaQtd = item.quantidade + delta;
    if (novaQtd <= 0) removerDaLista(index);
    else { item.quantidade = novaQtd; persistirLista(); atualizarContador(); renderizarListaModal(); }
}

function atualizarContador() {
    const totalItens = estado.listaCompras.reduce((acc, item) => acc + item.quantidade, 0);
    const valorTotal = estado.listaCompras.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
    const valorFormatado = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Atualiza o contador (Badge)
    const badge = document.getElementById('contador-lista');
    if (badge) {
        badge.innerText = totalItens;
        // O CSS cuida de esconder/mostrar baseado se é 0 ou não
        badge.style.opacity = totalItens > 0 ? '1' : '0';
        badge.style.transform = totalItens > 0 ? 'scale(1)' : 'scale(0)';
    }

    // Atualiza o Total no Botão Flutuante (Novo)
    const fabTotal = document.getElementById('fab-total-display');
    if (fabTotal) {
        fabTotal.innerText = valorFormatado;
    }

    // Atualiza o Total dentro do Modal (Existente)
    const totalModal = document.getElementById('total-lista');
    if (totalModal) {
        totalModal.innerText = valorFormatado;
    }

    // Esconde o botão inteiro se a lista estiver vazia (Opcional - eu prefiro deixar visível)
    const fab = document.getElementById('btn-minha-lista');
    if (fab) {
        // Se quiser que o botão suma quando vazio, descomente abaixo:
        // fab.style.display = totalItens > 0 ? 'flex' : 'none';

        // Se quiser apenas mudar a cor quando vazio (Recomendado):
        if (totalItens === 0) {
            fab.style.filter = "grayscale(100%) opacity(0.7)";
        } else {
            fab.style.filter = "none";
        }
    }
}

function renderizarListaModal() {
    if (estado.listaCompras.length === 0) {
        listaComprasContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-sec)"><i class="fas fa-shopping-basket" style="font-size:3rem; opacity:0.3; margin-bottom:1rem"></i><p>Sua lista está vazia.</p></div>`;
        return;
    }
    listaComprasContainer.innerHTML = estado.listaCompras.map((item, idx) => `
                <div class="lista-item">
                    <div class="lista-item-img"><i class="${item.imagem || 'fas fa-box'}"></i></div>
                    <div class="lista-item-info">
                        <div style="font-weight:600; line-height:1.2">${item.nome}</div>
                        <div style="font-size:0.85rem; color:var(--text-sec); margin-bottom:4px">${item.mercado_nome}</div>
                        <div class="lista-item-details">
                             <div class="lista-qty-control"><button class="btn-qty" onclick="alterarQuantidade(${idx}, -1)">-</button><input type="text" class="input-qty" value="${item.quantidade}" readonly><button class="btn-qty" onclick="alterarQuantidade(${idx}, 1)">+</button></div>
                            <div style="font-size:0.9rem; color:var(--text-sec)">x R$ ${item.preco.toFixed(2)}</div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem"><button class="btn-remove-item" onclick="removerDaLista(${idx})" title="Remover item"><i class="fas fa-trash"></i></button><div class="lista-item-total">R$ ${(item.quantidade * item.preco).toFixed(2)}</div></div>
                </div>`).join('');
}

async function guardarLista() {
    await verificarUsuarioLogado();
    if (!estado.usuarioLogado) {
        mostrarToast("Faça login para salvar sua lista!", "error");
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }
    if (estado.listaCompras.length === 0) {
        mostrarToast("Adicione itens à lista antes de salvar!", "error");
        return;
    }

    const btn = document.getElementById('btn-guardar-lista');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        const total = estado.listaCompras.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
        const res = await fetch('/api/salvar-lista', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itens: estado.listaCompras,
                total: total,
                data: new Date().toISOString()
            })
        });
        const data = await res.json();

        if (data.success) {
            mostrarToast("Lista salva com sucesso!", "success");

            // === ADICIONE ESTAS LINHAS ===
            estado.listaCompras = []; // Limpa o estado
            localStorage.removeItem('listaComprasTemp'); // Remove do localStorage
            atualizarContador(); // Atualiza o contador para zero
            // =============================

            setTimeout(() => modalLista.classList.remove('ativo'), 1000);
        } else {
            mostrarToast("Erro ao salvar: " + data.message, "error");
        }
    } catch (e) {
        mostrarToast("Erro de conexão ao salvar.", "error");
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

function toggleFavorito(id, btn) {
    const idx = estado.favoritos.indexOf(id);
    if (idx === -1) { estado.favoritos.push(id); btn.classList.add('ativo'); btn.querySelector('i').className = 'fas fa-heart'; mostrarToast("Adicionado aos favoritos"); }
    else { estado.favoritos.splice(idx, 1); btn.classList.remove('ativo'); btn.querySelector('i').className = 'far fa-heart'; }
    localStorage.setItem('favoritos', JSON.stringify(estado.favoritos));
}

function mostrarToast(msg, type = "success") {
    const t = document.getElementById('toast');
    document.getElementById('toast-message').textContent = msg;
    const icon = t.querySelector('i');
    icon.className = type === "error" ? "fas fa-exclamation-circle" : "fas fa-check-circle";
    icon.style.color = type === "error" ? "var(--danger)" : "var(--success)";
    t.classList.add('ativo');
    setTimeout(() => t.classList.remove('ativo'), 3000);
}

// --- SIMULADOR DE RANCHO ---
async function simularRancho() {
    if (estado.listaCompras.length === 0) {
        mostrarToast("Sua lista está vazia!", "error");
        return;
    }

    document.getElementById('modal-lista').classList.remove('ativo');
    const modalRank = document.getElementById('modal-ranking');
    const containerRank = document.getElementById('lista-ranking');

    modalRank.classList.add('ativo');
    containerRank.innerHTML = `
                <div style="text-align:center; padding:3rem">
                    <i class="fas fa-calculator fa-spin" style="font-size:3rem; color:var(--accent); margin-bottom:1rem"></i>
                    <h3>Calculando...</h3>
                    <p style="color:var(--text-sec)">Comparando preços em todos os mercados.</p>
                </div>
            `;

    try {
        const res = await fetch('/api/simular-rancho', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens: estado.listaCompras })
        });

        const data = await res.json();

        if (data.success) {
            renderizarRanking(data.ranking);
        } else {
            containerRank.innerHTML = `<p style="color:red; text-align:center">${data.message}</p>`;
        }

    } catch (e) {
        containerRank.innerHTML = `<p style="color:red; text-align:center">Erro de conexão.</p>`;
    }
}

// Função auxiliar para calcular Haversine (caso não exista)
function calcularDistanciaGPS(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distância em KM
}

function renderizarRanking(ranking) {
    const container = document.getElementById('lista-ranking');
    container.innerHTML = '';

    // Ordenar ranking pelo menor preço primeiro
    ranking.sort((a, b) => a.total - b.total);
    const menorPreco = ranking[0].total;

    ranking.forEach((r, index) => {
        // --- 1. Lógica de Geolocalização e Rota ---
        let routeHtml = '';
        let adviceHtml = '';
        let distanceKm = null;
        let timeMin = null;
        let mapsLink = '#';

        // Verifica se temos a localização do usuário e do mercado
        if (estado.userLocation && r.latitude && r.longitude) {
            distanceKm = calcularDistanciaGPS(
                estado.userLocation.lat, estado.userLocation.lng,
                r.latitude, r.longitude
            );

            // Estimativa simples: 25km/h velocidade média urbana
            timeMin = Math.round((distanceKm / 25) * 60);

            // Link Universal para abrir Maps/Waze no mobile
            // "dir_action=navigate" força o modo de navegação
            mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}&travelmode=driving`;

            // --- 2. Lógica "Vale a pena?" (Smart UX) ---
            const diferencaPreco = r.total - menorPreco;

            // Badges baseados na distância
            let distBadge = '';
            if (distanceKm < 2) distBadge = `<span class="smart-badge badge-perto"><i class="fas fa-walking"></i> Perto</span>`;
            else if (distanceKm > 10) distBadge = `<span class="smart-badge badge-longe"><i class="fas fa-car-side"></i> Longe</span>`;

            // Conselho Inteligente
            if (index === 0) {
                // É o mais barato
                if (distanceKm < 5) {
                    adviceHtml = `<div class="ai-advice"><i class="fas fa-check-circle" style="color:var(--success)"></i> <b>Melhor escolha!</b> Mais barato e perto de você.</div>`;
                } else {
                    adviceHtml = `<div class="ai-advice"><i class="fas fa-info-circle" style="color:#f59e0b"></i> É o mais barato, mas considere se ${distanceKm.toFixed(1)}km vale a viagem.</div>`;
                }
            } else {
                // Não é o mais barato
                if (diferencaPreco < 5 && distanceKm < 3 && ranking[0].distancia > 5) {
                    // Exemplo: É R$ 3 mais caro, mas é muito mais perto que o vencedor
                    adviceHtml = `<div class="ai-advice"><i class="fas fa-thumbs-up" style="color:var(--primary)"></i> <b>Pode compensar!</b> Só R$ ${diferencaPreco.toFixed(2)} mais caro, mas economiza tempo/combustível.</div>`;
                }
            }

            // HTML da Área de Rota
            routeHtml = `
                <div class="rank-route-area">
                    <div class="route-info">
                        <div class="route-time">
                            <i class="fas fa-clock"></i> ~${timeMin} min
                            ${distBadge}
                        </div>
                        <div class="route-dist">${distanceKm.toFixed(1)} km da sua posição</div>
                    </div>
                    <a href="${mapsLink}" target="_blank" class="btn-route-go">
                        <i class="fas fa-location-arrow"></i> Ir Agora
                    </a>
                </div>
                ${adviceHtml}
            `;

        } else {
            // Fallback se não tiver GPS
            routeHtml = `
                <div class="rank-route-area">
                    <div class="route-info">
                        <span style="font-size:0.8rem; color:var(--text-sec)">Distância indisponível</span>
                    </div>
                    <button class="btn-route-go" style="opacity:0.5; cursor:not-allowed">
                        <i class="fas fa-map-marker-slash"></i> Sem GPS
                    </button>
                </div>
            `;
        }

        // --- 3. Renderização do Card ---
        const isWinner = index === 0;
        const economyBadge = (isWinner && r.economia > 0)
            ? `<div class="rank-economy-tag">Economia de R$ ${r.economia.toFixed(2).replace('.', ',')}</div>`
            : '';

        const missingAlert = r.itens_faltantes > 0
            ? `<span style="font-size:0.75rem; color:#f59e0b"><i class="fas fa-exclamation-triangle"></i> ${r.itens_faltantes} itens est.</span>`
            : `<span style="font-size:0.75rem; color:var(--success)"><i class="fas fa-check"></i> Lista completa</span>`;

        const html = `
            <div class="rank-item" style="${isWinner ? 'border: 2px solid var(--success); background:#f0fdf4;' : ''}">
                <div class="rank-main-info">
                    <img src="${r.mercado_logo || 'https://placehold.co/50'}" class="rank-logo" onerror="this.src='https://placehold.co/50?text=M'">
                    <div class="rank-details">
                        <h4>${r.mercado_nome}</h4>
                        <div class="rank-meta">
                            ${missingAlert}
                        </div>
                    </div>
                    <div class="rank-pricing">
                        <div class="rank-total">R$ ${r.total.toFixed(2).replace('.', ',')}</div>
                        ${economyBadge}
                    </div>
                </div>

                ${routeHtml}
            </div>
        `;
        container.innerHTML += html;
    });
}
function fecharRanking() {
    document.getElementById('modal-ranking').classList.remove('ativo');
    document.getElementById('modal-lista').classList.add('ativo');
}

async function verificarNotificacoes() {
    if (!estado.usuarioLogado) return;

    try {
        const res = await fetch('/api/notificacao-inteligente');
        const data = await res.json();

        if (data.success) {
            exibirNotificacaoInteligente(data.notificacao);
        }
    } catch (e) {
        console.error("Erro ao verificar notificações", e);
    }
}

function exibirNotificacaoInteligente(notificacao) {
    const container = document.getElementById('smart-notify');
    const card = document.getElementById('smart-card-content');
    const msg = document.getElementById('smart-msg');
    const btn = document.getElementById('smart-btn-action');
    const avatar = card.querySelector('.smart-avatar i');

    msg.innerHTML = `"${notificacao.mensagem}"`;

    if (notificacao.tipo === 'alerta') {
        card.classList.add('alerta');
        avatar.className = 'fas fa-exclamation-triangle';
        btn.innerHTML = `Ver Detalhes <i class="fas fa-search-dollar"></i>`;
    } else {
        card.classList.remove('alerta');
        avatar.className = 'fas fa-piggy-bank';
        btn.innerHTML = `Aproveitar Oferta <i class="fas fa-cart-plus"></i>`;
    }

    btn.onclick = () => {
        if (notificacao.produto_id) {
            buscarProdutoPorId(notificacao.produto_id);
        }
        fecharNotificacao();
    };

    container.classList.add('ativo');
    setTimeout(() => {
        if (container.classList.contains('ativo')) fecharNotificacao();
    }, 10000);
}

function fecharNotificacao() {
    document.getElementById('smart-notify').classList.remove('ativo');
}

async function buscarProdutoPorId(id) {
    try {
        document.getElementById('busca-produto-destaque').value = '';
        const res = await fetch(`/api/produto/${id}`);
        const data = await res.json();

        if (data.success) {
            estado.produtosFiltrados = [data.produto];
            renderizarProdutos([data.produto]);
            document.getElementById('produtos-container').scrollIntoView({ behavior: 'smooth' });
        }
    } catch (e) { console.error(e); }
}

function toggleChat() {
    const chat = document.getElementById('chef-window');
    chat.classList.toggle('ativo');
    if (mobileMenuSidebar.classList.contains('ativo')) {
        toggleMobileMenu();
    }
}

async function pedirReceita() {
    const listaAtual = JSON.parse(localStorage.getItem('listaComprasTemp') || '[]');
    const chatContent = document.getElementById('chat-content');
    const btn = document.querySelector('.btn-ask-chef');

    if (listaAtual.length === 0) {
        chatContent.innerHTML += `<div class="msg-bot" style="border-left: 3px solid red">Sua lista está vazia! Adicione itens primeiro.</div>`;
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> O Chef está pensando...';
    btn.disabled = true;

    chatContent.innerHTML += `<div class="msg-bot" id="temp-loading"><i>Analisando ${listaAtual.length} ingredientes...</i></div>`;
    chatContent.scrollTop = chatContent.scrollHeight;

    try {
        const res = await fetch('/api/chef-ia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens: listaAtual })
        });

        const data = await res.json();
        document.getElementById('temp-loading').remove();

        if (data.success) {
            chatContent.innerHTML += `<div class="msg-bot">${data.resposta}</div>`;
        } else {
            chatContent.innerHTML += `<div class="msg-bot" style="color:red">Erro ao falar com o Chef.</div>`;
        }

    } catch (e) {
        document.getElementById('temp-loading')?.remove();
        chatContent.innerHTML += `<div class="msg-bot" style="color:red">Erro de conexão.</div>`;
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        chatContent.scrollTop = chatContent.scrollHeight;
    }
}

// ===== NOVO: FUNÇÕES DO MODAL DE VISUALIZAÇÃO COMPLETA =====

function fecharDetalhesProduto(event) {
    const modal = document.getElementById('modal-detalhes-produto');
    if (event === undefined || event.target.id === 'modal-detalhes-produto') {
        modal.classList.remove('ativo');
    }
}

// Função para garantir que o modal abra mesmo se os dados vierem incompletos da busca simples
async function abrirDetalhesProduto(produtoId) {
    let produto = estado.produtos.find(p => p.id == produtoId);

    // Se o produto não tiver comparação carregada (veio da busca simples), carrega agora
    if (!produto || !produto.comparacao || produto.comparacao.length === 0) {
        loadingState.setLoading(true);
        try {
            const res = await fetch(`/api/produtos-em-lote?ids=${produtoId}`);
            const data = await res.json();
            if (data.success && data.produtos.length > 0) {
                produto = data.produtos[0];
                // Atualiza no estado global para cache
                const idx = estado.produtos.findIndex(p => p.id == produtoId);
                if (idx !== -1) estado.produtos[idx] = produto;
            }
        } catch (e) {
            console.error(e);
            return;
        } finally {
            loadingState.setLoading(false);
        }
    }

    if (!produto) return;

    const modal = document.getElementById('modal-detalhes-produto');
    document.getElementById('modal-produto-nome').textContent = produto.nome;

    // Imagem
    const imgContainer = document.querySelector('.product-info-img');
    if (produto.imagem && (produto.imagem.startsWith('http') || produto.imagem.startsWith('/'))) {
        imgContainer.innerHTML = `<img src="${produto.imagem}" style="width:100%; height:100%; object-fit:contain; border-radius:8px;">`;
    } else {
        imgContainer.innerHTML = '<i class="fas fa-shopping-basket"></i>';
    }

    document.getElementById('modal-prod-unidade').textContent = `${produto.unidade_medida || 'un'}`;
    document.getElementById('modal-prod-categoria').textContent = produto.categoria || 'Geral';
    document.getElementById('modal-prod-codbarra').textContent = produto.cod_barra ? `EAN: ${produto.cod_barra}` : '';

    // Lista de Mercados
    const marketListContainer = document.getElementById('market-list-container');
    marketListContainer.innerHTML = '';

    if (produto.comparacao && produto.comparacao.length > 0) {
        // Ordena do menor para o maior
        produto.comparacao.sort((a, b) => a.preco - b.preco);
        const menorPrecoVal = produto.comparacao[0].preco;

        produto.comparacao.forEach((comp, index) => {
            const isBest = comp.preco === menorPrecoVal;


            const nomeProdutoSafe = produto.nome.replace(/'/g, "\\'");
            const nomeMercadoSafe = comp.mercado_nome.replace(/'/g, "\\'");

            // Aqui adicionamos o evento "ondblclick" na div principal
            marketListContainer.innerHTML += `
                <div class="market-item ${isBest ? 'best-price' : ''}" 
                     ondblclick="abrirModalValidacao(${comp.id}, '${nomeMercadoSafe}', ${comp.preco}, '${nomeProdutoSafe}')"
                     title="Dê um duplo clique para validar ou corrigir"
                     style="cursor: pointer; position: relative;">
                    
                    <div class="market-item-main" style="display:flex; align-items:center; width:100%">
                        <div class="market-item-logo">
                            <img src="${comp.mercado_logo || 'https://placehold.co/40'}" style="width:100%; height:100%; object-fit:contain; border-radius:50%;" onerror="this.style.display='none'">
                        </div>
                        <div class="market-item-details">
                            <strong>${comp.mercado_nome}</strong>
                            <small>${comp.endereco_simples || 'Manaus'}</small>
                        </div>
                        <div class="market-item-price-info">
                            ${isBest ? '<span class="smart-badge badge-economico">Melhor Preço</span>' : ''}
                            <div class="current-price">R$ ${comp.preco.toFixed(2)}</div>
                        </div>
                    </div>
                    
                    <small style="display:block; width:100%; text-align:center; color:#ccc; font-size:0.65rem; margin-top:4px;">
                        (Toque 2x para validar este preço)
                    </small>

                </div>
            `;
        });

        // Botões de Ação
        document.querySelector('.tools-btn-group').innerHTML = `
            <button class="tool-btn" onclick="adicionarNaLista('${produto.id}', '${produto.nome}', ${menorPrecoVal}, '${produto.comparacao[0].mercado_nome}')" style="background:var(--primary); color:white; border:none; width:100%; justify-content:center; padding:12px;">
                <i class="fas fa-cart-plus"></i> Adicionar Melhor Oferta (R$ ${menorPrecoVal.toFixed(2)})
            </button>
        `;

    } else {
        marketListContainer.innerHTML = '<p style="text-align:center; color:#666">Nenhum preço encontrado para este produto no momento.</p>';
    }

    modal.classList.add('ativo');
}

// ===== FUNÇÕES DE AÇÃO (ANTI-PEGADINHA) =====

function adicionarNaLista(id, nome, preco, mercado) {
    fecharDetalhesProduto();
    adicionarProdutoLista(id, nome, preco, mercado);

    const btnLista = document.getElementById('btn-minha-lista');
    btnLista.classList.add('fab-celebration');
    setTimeout(() => {
        btnLista.classList.remove('fab-celebration');
    }, 600);
}

function openHistorico(produtoId) {
    window.location.href = `historico-precos.html?produtoId=${produtoId}`;
}


function criarEfeitoFogosArtificio() {
    const fab = document.getElementById('btn-minha-lista');
    const fabRect = fab.getBoundingClientRect();
    const centerX = fabRect.left + fabRect.width / 2;
    const centerY = fabRect.top + fabRect.height / 2;

    // Cores vibrantes para fogos de artifício
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#FF1493'];

    // Criar múltiplos fogos de artifício
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            criarFogoArtificio(centerX, centerY, colors[i % colors.length]);
        }, i * 150);
    }

    // Efeito sonoro (opcional - apenas feedback visual)
    const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
    audio.volume = 0.1;
    audio.play().catch(() => { }); // Ignora erros de autoplay
}

function criarFogoArtificio(x, y, color) {
    const particleCount = 30;
    const particles = [];

    // Criar partículas
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const speed = 2 + Math.random() * 3;
        const size = 3 + Math.random() * 4;
        const lifetime = 800 + Math.random() * 400;

        const particle = document.createElement('div');
        particle.style.cssText = `
            position: fixed;
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            border-radius: 50%;
            top: ${y}px;
            left: ${x}px;
            pointer-events: none;
            z-index: 10000;
            opacity: 1;
            transform: translate(0, 0);
        `;

        document.body.appendChild(particle);
        particles.push({
            element: particle,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: lifetime,
            startTime: Date.now()
        });
    }

    // Animar partículas
    function animate() {
        const currentTime = Date.now();
        let allDead = true;

        particles.forEach(particle => {
            const elapsed = currentTime - particle.startTime;
            const progress = elapsed / particle.life;

            if (progress < 1) {
                allDead = false;
                // Movimento com física (gravidade)
                const gravity = 0.1;
                particle.vy += gravity;

                // Movimento parabólico
                const moveX = particle.vx * elapsed * 0.1;
                const moveY = particle.vy * elapsed * 0.1 - 0.5 * gravity * Math.pow(elapsed * 0.01, 2);

                // Opacity fade out
                const opacity = 1 - progress;

                particle.element.style.transform = `translate(${moveX}px, ${moveY}px)`;
                particle.element.style.opacity = opacity;
                particle.element.style.background = `radial-gradient(circle, ${color} 0%, ${color}00 70%)`;
            } else {
                particle.element.remove();
            }
        });

        if (!allDead) {
            requestAnimationFrame(animate);
        }
    }

    animate();
}

// E também atualize a função adicionarProdutoLista para usar o novo efeito:
function adicionarProdutoLista(id, nome, preco, mercadoNome) {
    const produtoInfo = estado.produtos ? estado.produtos.find(p => p.id == id) : null;
    const imagem = produtoInfo ? produtoInfo.imagem : '';

    const itemExistente = estado.listaCompras.find(i => i.id == id);

    if (itemExistente) {
        itemExistente.quantidade++;
        mostrarToast(`+1 ${nome} adicionado!`);
    } else {
        estado.listaCompras.push({
            id: id,
            nome: nome,
            mercado: 'melhor_oferta',
            mercado_nome: mercadoNome || 'Melhor Preço',
            preco: parseFloat(preco),
            quantidade: 1,
            imagem: imagem
        });
        mostrarToast(`${nome} adicionado à lista!`);
    }

    persistirLista();
    atualizarContador();

    const btnFab = document.getElementById('btn-minha-lista');

    // Efeito de pulso no botão
    btnFab.style.transform = 'scale(1.1)';
    btnFab.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.8)';

    setTimeout(() => {
        btnFab.style.transform = 'scale(1)';
        btnFab.style.boxShadow = '';
    }, 300);

    // Fogos de artifício!
    criarEfeitoFogosArtificio();
}



async function processarFotoPesquisa(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const btnCamera = document.querySelector('.btn-camera-search');
        const inputBusca = document.getElementById('busca-produto-destaque');

        btnCamera.classList.add('loading');
        inputBusca.placeholder = "Consultando banco de dados...";
        inputBusca.value = "";

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch('/api/pesquisa-visual', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                // 1. Preenche e Filtra
                inputBusca.value = data.termo;
                const eventoInput = new Event('input', { bubbles: true });
                inputBusca.dispatchEvent(eventoInput);

                mostrarToast(`Encontrado: ${data.termo}`, "success");

                // 2. LOGICA DE DESTAQUE PRECISO
                setTimeout(() => {
                    // Remove destaque anterior de qualquer card
                    document.querySelectorAll('.destaque-ia-ativo').forEach(el => el.classList.remove('destaque-ia-ativo'));

                    let cardAlvo = null;

                    // SE O BACKEND RETORNOU UM ID (Validação pelo Banco de Dados)
                    if (data.produto_id) {
                        // Busca o card exato pelo ID
                        cardAlvo = document.querySelector(`.produto-card[data-id="${data.produto_id}"]`);
                    }

                    // Se não achou pelo ID (ou ID é nulo), tenta pegar o primeiro da lista filtrada como fallback
                    if (!cardAlvo) {
                        const visiveis = document.querySelectorAll('#produtos-container .produto-card');
                        if (visiveis.length > 0) cardAlvo = visiveis[0];
                    }

                    // Aplica a animação SOMENTE no card alvo
                    if (cardAlvo) {
                        cardAlvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        cardAlvo.classList.add('destaque-ia-ativo');

                        // Remove após 5 segundos
                        setTimeout(() => {
                            cardAlvo.classList.remove('destaque-ia-ativo');
                        }, 5000);
                    }

                }, 800); // Tempo um pouco maior para garantir que o filtro renderizou o ID correto

            } else {
                mostrarToast("Produto não encontrado no catálogo.", "error");
                inputBusca.placeholder = "Digite o nome do produto...";
            }

        } catch (e) {
            console.error(e);
            mostrarToast("Erro ao conectar.", "error");
        } finally {
            btnCamera.classList.remove('loading');
            input.value = '';
        }
    }
}


function garantirModalValidacao() {
    if (!document.getElementById('modalValidacaoDinamica')) {
        const modalHTML = `
        <div id="modalValidacaoDinamica" class="modal-val-overlay" style="display:none">
            <div class="modal-val-card">
                <button class="modal-val-close" onclick="fecharModalValidacao()">&times;</button>
                
                <div class="modal-val-header">
                    <h3>Validar Preço</h3>
                    
                    <div style="background:#f8fafc; padding:10px; border-radius:8px; margin:10px 0; text-align:left;">
                        <p style="font-weight:bold; color:#1e293b; margin-bottom:5px;" id="lbl-produto-nome">Produto...</p>
                        <p style="font-size:0.9rem; color:#64748b;">
                            <i class="fas fa-store"></i> <span id="lbl-mercado-nome">Mercado...</span>
                        </p>
                        <p style="font-size:1.2rem; font-weight:bold; color:#166534; margin-top:5px;">
                            Preço no App: <span id="lbl-preco-atual">R$ 0,00</span>
                        </p>
                    </div>

                    <p class="aviso-importante">
                        <i class="fas fa-exclamation-circle"></i> 
                        Confirme se o valor na etiqueta da gôndola é igual ao do App.
                    </p>
                </div>
                
                <div id="step1-botoes" class="modal-val-actions">
                    <button onclick="enviarValidacao('up')" class="btn-val btn-confirmar">
                        <i class="fas fa-check-circle"></i> Sim, está igual
                    </button>
                    <button onclick="mostrarFormularioErro()" class="btn-val btn-reportar">
                        <i class="fas fa-times-circle"></i> Não, preço mudou
                    </button>
                </div>

                <div id="step2-form" class="modal-val-form" style="display:none">
                    <div class="form-group">
                        <label>Qual o preço real na gôndola?</label>
                        <input type="number" step="0.01" id="val_novo_preco" placeholder="R$ 0,00" class="input-val">
                    </div>
                    <div class="form-group">
                        <label>Foto da Etiqueta (Obrigatória)</label>
                        <label for="val_foto_upload" class="upload-btn-custom"><i class="fas fa-camera"></i> Anexar Foto</label>
                        <input type="file" id="val_foto_upload" accept="image/*" style="display:none" onchange="previewFoto(this)">
                        <div id="preview-container" style="display:none; margin-top:10px">
                            <img id="img-preview" src="" style="max-width:100%; height:100px; border-radius:8px;">
                        </div>
                    </div>
                    <button onclick="enviarValidacao('down')" class="btn-val btn-enviar-report">Enviar Correção</button>
                    <button onclick="voltarStep1()" class="btn-link-voltar">Cancelar</button>
                </div>

            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
}

// Variável global para saber qual ID estamos editando
let precoIdEmValidacao = null;
let nomeProdutoEmValidacao = "";


function abrirModalValidacao(precoId, nomeMercado, valorAtual, nomeProduto) {
    garantirModalValidacao();

    precoIdEmValidacao = precoId;
    nomeProdutoEmValidacao = nomeProduto; // Guarda para enviar ao backend

    // ATUALIZA OS TEXTOS DO MODAL (Aqui corrigimos o "Undefined")
    document.getElementById('lbl-produto-nome').textContent = nomeProduto;
    document.getElementById('lbl-mercado-nome').textContent = nomeMercado;
    document.getElementById('lbl-preco-atual').textContent = "R$ " + parseFloat(valorAtual).toFixed(2);

    // Reseta visual
    document.getElementById('step1-botoes').style.display = 'flex';
    document.getElementById('step2-form').style.display = 'none';
    document.getElementById('val_novo_preco').value = ''; // Limpa campo

    const modal = document.getElementById('modalValidacaoDinamica');
    modal.style.display = 'flex';
    setTimeout(() => { modal.querySelector('.modal-val-card').classList.add('active'); }, 10);
}

function fecharModalValidacao() {
    const modal = document.getElementById('modalValidacaoDinamica');
    modal.querySelector('.modal-val-card').classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

function mostrarFormularioErro() {
    // Animação de transição interna
    document.getElementById('step1-botoes').style.display = 'none';
    const form = document.getElementById('step2-form');
    form.style.display = 'block';
    form.classList.add('fade-in');
}

function voltarStep1() {
    document.getElementById('step2-form').style.display = 'none';
    document.getElementById('step1-botoes').style.display = 'flex';
}

function previewFoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('img-preview').src = e.target.result;
            document.getElementById('preview-container').style.display = 'block';
            document.querySelector('.upload-btn-custom').innerHTML = '<i class="fas fa-check"></i> Foto Selecionada';
            document.querySelector('.upload-btn-custom').style.background = '#dcfce7';
            document.querySelector('.upload-btn-custom').style.color = '#166534';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

async function enviarValidacao(tipo) {
    const formData = new FormData();
    formData.append('preco_id', precoIdEmValidacao);
    formData.append('tipo', tipo);
    formData.append('produto_nome', nomeProdutoEmValidacao); // <--- ENVIANDO O NOME

    if (tipo === 'down') {
        const novoPreco = document.getElementById('val_novo_preco').value;
        const foto = document.getElementById('val_foto_upload').files[0];

        if (!novoPreco || !foto) {
            Swal.fire('Atenção', 'Para reportar erro, precisamos do preço correto e da foto.', 'warning');
            return;
        }
        formData.append('preco_sugerido', novoPreco);
        formData.append('foto', foto);
    }

    Swal.fire({ title: 'Enviando...', didOpen: () => Swal.showLoading() });

    try {
        const res = await fetch('/api/validar-preco', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            fecharModalValidacao();
            Swal.fire('Sucesso!', data.message, 'success');
        } else {
            Swal.fire('Erro', data.message, 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Erro', 'Falha na comunicação.', 'error');
    }
}


async function validarPreco(precoId, tipo, btnElement) {
    // Efeito visual imediato (Feedback Hápitco Visual)
    const parent = btnElement.parentElement;
    const allBtns = parent.querySelectorAll('.btn-vote');
    allBtns.forEach(b => b.style.opacity = '0.3'); // Desativa visualmente os outros
    btnElement.style.opacity = '1';
    btnElement.style.transform = 'scale(1.2)';

    // Troca ícone para loading
    const iconOriginal = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    try {
        const res = await fetch('/api/validar-preco', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preco_id: precoId, tipo: tipo })
        });
        const data = await res.json();

        if (data.success) {
            mostrarToast(tipo === 'up' ? "Obrigado por confirmar! 👍" : "Obrigado pelo alerta! 👎");
            // Muda cor do botão permanentemente nesta sessão
            btnElement.style.color = tipo === 'up' ? 'var(--success)' : 'var(--danger)';
        } else {
            if (data.message.includes('login')) {
                mostrarToast("Faça login para votar.", "error");
                setTimeout(() => window.location.href = 'login.html', 1500);
            } else {
                mostrarToast("Erro ao votar.", "error");
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        btnElement.innerHTML = iconOriginal; // Restaura ícone
    }
}

// ==========================================================
// === LÓGICA DO MATCH DE OFERTAS (TINDER) - VERSÃO FINAL FIX ===
// ==========================================================
let dragStartX = 0;
let currentDragX = 0;
let isDragging = false;
let cardTop = null;
let totalInicialOfertas = 0;
let matchesEfetuados = 0;

// Som de Match configurado para mobile
const somMatch = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
somMatch.preload = 'auto'; // Garante que o celular baixe o áudio antes
somMatch.volume = 0.4;

// FUNÇÃO PARA "DESTRAVAR" O ÁUDIO NO CELULAR (Crucial)
function destravarAudioMobile() {
    somMatch.play().then(() => {
        somMatch.pause();
        somMatch.currentTime = 0;
    }).catch(() => {/* Silencioso */ });

    // Remove os eventos após a primeira interação para não rodar de novo
    document.removeEventListener('touchstart', destravarAudioMobile);
    document.removeEventListener('click', destravarAudioMobile);
}

// Adiciona os ouvintes para o primeiro toque
document.addEventListener('touchstart', destravarAudioMobile);
document.addEventListener('click', destravarAudioMobile);

async function carregarTinder() {
    const overlay = document.getElementById('tinder-overlay');
    if (!overlay) return;

    try {
        const res = await fetch('/api/ofertas-tinder');
        const data = await res.json();

        if (data.success && data.ofertas.length > 0) {
            ofertastack = data.ofertas;
            totalInicialOfertas = ofertastack.length;
            matchesEfetuados = 0;
            renderizarStack();
            overlay.style.display = 'flex'; // Exibe o popup
        }
    } catch (e) { console.error("Erro ao carregar Match:", e); }
}

function renderizarStack() {
    const stack = document.getElementById('tinder-card-stack');
    const barra = document.getElementById('tinder-bar');
    if (!stack) return;

    stack.innerHTML = '';

    // 1. Lógica da Barra de Progresso (Organizada por dispositivo)
    if (barra) {
        const porcentagem = ((totalInicialOfertas - ofertastack.length) / totalInicialOfertas) * 100;

        // Desktop (Vertical) vs Mobile (Horizontal)
        if (window.innerWidth > 768) {
            barra.style.height = porcentagem + '%';
            barra.style.width = '100%';
        } else {
            barra.style.width = porcentagem + '%';
            barra.style.height = '100%';
        }
    }

    // 2. Geração Dinâmica dos Cards
    ofertastack.forEach((prod, index) => {
        const card = document.createElement('div');
        card.className = 'tinder-card';
        card.style.zIndex = ofertastack.length - index;
        card.style.transform = `scale(${1 - index * 0.05}) translateY(-${index * 15}px)`;

        // Lógica de popularidade
        const qtePessoas = Math.floor(Math.random() * 40) + 8;
        const ehPopular = qtePessoas > 35; // Define se é "Best Seller"

        card.innerHTML = `
            <div class="tinder-social-proof ${ehPopular ? 'popular' : ''}">
                <i class="${ehPopular ? 'fas fa-star' : 'fas fa-users'}"></i> 
                ${ehPopular ? '<b>O MAIS LEVADO:</b> ' : ''} +${qtePessoas} pessoas em Manaus levaram
            </div>

            <div class="tinder-status like">ADICIONAR</div>
            <div class="tinder-status dislike">PULAR</div>
            <img src="${prod.imagem || 'https://placehold.co/400?text=Sem+Foto'}" draggable="false">
            <div class="tinder-card-body">
                <div class="market"><i class="fas fa-store"></i> ${prod.mercado_nome}</div>
                <h2>${prod.nome}</h2>
                <div class="price">R$ ${prod.preco.toFixed(2).replace('.', ',')}</div>
            </div>`;

        if (index === 0) { cardTop = card; vincularEventosArraste(card); }
        stack.appendChild(card);
    });
}

function vincularEventosArraste(card) {
    const IniciarArraste = (e) => {
        isDragging = true;
        dragStartX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        card.style.transition = 'none';
        card.style.cursor = 'grabbing';
    };

    const Movendo = (e) => {
        if (!isDragging) return;
        currentDragX = (e.type === 'touchmove' ? e.touches[0].clientX : e.clientX) - dragStartX;
        const rotacao = currentDragX * 0.1;
        card.style.transform = `translateX(${currentDragX}px) rotate(${rotacao}deg)`;

        const labelLike = card.querySelector('.tinder-status.like');
        const labelDislike = card.querySelector('.tinder-status.dislike');
        if (currentDragX > 50) {
            labelLike.style.opacity = Math.min(currentDragX / 150, 1);
            labelDislike.style.opacity = 0;
        } else if (currentDragX < -50) {
            labelDislike.style.opacity = Math.min(Math.abs(currentDragX) / 150, 1);
            labelLike.style.opacity = 0;
        } else {
            labelLike.style.opacity = 0; labelDislike.style.opacity = 0;
        }
    };

    const PararArraste = () => {
        if (!isDragging) return;
        isDragging = false;
        card.style.transition = 'transform 0.4s ease';
        if (currentDragX > 120) swipeRight();
        else if (currentDragX < -120) swipeLeft();
        else card.style.transform = '';
        currentDragX = 0;
    };

    card.addEventListener('mousedown', IniciarArraste);
    card.addEventListener('touchstart', IniciarArraste, { passive: true });
    window.addEventListener('mousemove', Movendo);
    window.addEventListener('touchmove', Movendo, { passive: false });
    window.addEventListener('mouseup', PararArraste);
    window.addEventListener('touchend', PararArraste);
}

function swipeRight() {
    if (!cardTop || ofertastack.length === 0) return;

    // --- NOVO: Feedback Háptico (Vibração) ---
    if (navigator.vibrate) {
        navigator.vibrate(50); // Dá um "pulso" de 50 milissegundos
    }

    const btn = document.getElementById('btn-tinder-like');
    btn.classList.add('btn-pulsing');
    setTimeout(() => btn.classList.remove('btn-pulsing'), 600);

    cardTop.classList.add('swiped-right');
    const prod = ofertastack.shift();
    matchesEfetuados++;

    // Tenta tocar o áudio
    somMatch.currentTime = 0;
    somMatch.play().catch(e => console.log("Áudio pendente"));

    adicionarProdutoLista(prod.id, prod.nome, prod.preco, prod.mercado_nome);
    proximaOferta();
}

function swipeLeft() {
    if (!cardTop || ofertastack.length === 0) return;
    cardTop.classList.add('swiped-left');
    ofertastack.shift();
    proximaOferta();
}

function proximaOferta() {
    setTimeout(() => {
        if (cardTop) cardTop.remove();
        if (ofertastack.length > 0) {
            renderizarStack();
        } else {
            document.getElementById('tinder-card-stack').style.display = 'none';
            document.getElementById('tinder-controls-area').style.display = 'none';
            document.getElementById('tinder-tip-text').style.display = 'none';
            document.getElementById('resumo-matches').innerText = matchesEfetuados;
            document.getElementById('tinder-finish-screen').style.display = 'block';
        }
    }, 300);
}

function fecharTinder() {
    document.getElementById('tinder-overlay').style.display = 'none';
    document.getElementById('tinder-card-stack').style.display = 'block';
    document.getElementById('tinder-controls-area').style.display = 'flex';
    document.getElementById('tinder-tip-text').style.display = 'block';
    document.getElementById('tinder-finish-screen').style.display = 'none';
    if (document.getElementById('tinder-bar')) document.getElementById('tinder-bar').style.width = '0%';
    totalInicialOfertas = 0;
}

function fecharTinderVerLista() {
    fecharTinder();
    const btnLista = document.getElementById('btn-minha-lista');
    if (btnLista) btnLista.click();
}

let avisosAtuais = [];

async function carregarAvisosUsuario() {
    try {
        const res = await fetch('/api/public/avisos');
        const data = await res.json();

        if (data.success && data.avisos.length > 0) {
            avisosAtuais = data.avisos;
            const ultimoAvisoId = data.avisos[0].id;
            const vistoId = localStorage.getItem('ultimo_aviso_visto');

            // Se o ID for diferente, mostra a bolinha vermelha
            if (vistoId != ultimoAvisoId) {
                document.getElementById('notif-badge').classList.remove('hidden');
            }
        }
    } catch (e) { console.error("Erro ao carregar avisos"); }
}

function abrirModalAvisos() {
    const container = document.getElementById('lista-avisos-usuario');
    container.innerHTML = avisosAtuais.map(a => `
        <div class="aviso-item ${a.tipo}">
            <h6 class="fw-bold mb-1">${a.titulo}</h6>
            <p class="small mb-0 text-secondary">${a.mensagem}</p>
            <small class="text-muted" style="font-size: 0.7rem;">${new Date(a.data_criacao).toLocaleDateString()}</small>
        </div>
    `).join('');

    document.getElementById('modal-avisos').classList.add('ativo');

    // Ao abrir, removemos a bolinha e salvamos que o usuário viu
    document.getElementById('notif-badge').classList.add('hidden');
    if (avisosAtuais.length > 0) {
        localStorage.setItem('ultimo_aviso_visto', avisosAtuais[0].id);
    }
}

function fecharModalAvisos() {
    document.getElementById('modal-avisos').classList.remove('ativo');
}

// Inicia a verificação ao carregar o site
document.addEventListener('DOMContentLoaded', carregarAvisosUsuario);
