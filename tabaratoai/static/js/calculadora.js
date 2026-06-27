
        // --- CONFIGURAÇÃO ---
        let carrinho = JSON.parse(localStorage.getItem('listaComprasTemp') || '[]');
        let mercadoAtual = JSON.parse(localStorage.getItem('mercado_pref') || '{"id": 1, "nome": "DB Supermercados", "codigo": "db"}');
        let html5QrcodeScanner = null;
        let isScanning = false;

        // Som de beep curto simulado (para testes, recomendo um mp3 real no assets)
        const beep = () => {
            // Tenta usar a Vibration API
            if (navigator.vibrate) navigator.vibrate(200);
            // Tenta tocar audio
            // document.getElementById('beep-sound').play().catch(e => console.log('Audio error', e));
        };

        // --- INICIALIZAÇÃO ---
        document.addEventListener('DOMContentLoaded', () => {
            atualizarUI();
        });

        function atualizarUI() {
            document.getElementById('lbl-mercado').innerText = mercadoAtual.nome.split(' ')[0]; // Nome curto
            renderizarCarrinho();
        }

        // --- RENDERIZAÇÃO ---
        function renderizarCarrinho() {
            const container = document.getElementById('lista-container');
            const elTotal = document.getElementById('total-display');
            const elCount = document.getElementById('count-display');

            container.innerHTML = '';

            if (carrinho.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-basket-shopping"></i>
                        <h3>Sua cesta está vazia</h3>
                        <p>Toque no botão verde para escanear produtos.</p>
                    </div>`;
                elTotal.innerText = 'R$ 0,00';
                elCount.innerText = '0 itens';
                return;
            }

            let total = 0;
            let qtd = 0;

            carrinho.forEach((item, index) => {
                const subtotal = item.preco * item.quantidade;
                total += subtotal;
                qtd += item.quantidade;

                const div = document.createElement('div');
                div.className = 'product-card';
                div.innerHTML = `
                    <img src="${item.imagem || 'https://placehold.co/70x70/202024/FFF?text=IMG'}" class="card-img" onerror="this.src='https://placehold.co/70x70/202024/FFF?text=IMG'">
                    
                    <div class="card-info">
                        <div class="card-title">${item.nome}</div>
                        <div class="card-meta">
                            <span>${item.mercado_nome || 'Geral'}</span>
                        </div>
                        
                        <div class="card-actions">
                            <div class="price-tag">R$ ${subtotal.toFixed(2)}</div>
                            
                            <div class="qty-selector">
                                <button class="qty-btn" onclick="alterarQtd(${index}, -1)">-</button>
                                <div class="qty-val">${item.quantidade}</div>
                                <button class="qty-btn" onclick="alterarQtd(${index}, 1)">+</button>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(div);
            });

            elTotal.innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            elCount.innerText = `${qtd} itens`;

            // Salva sessão
            localStorage.setItem('listaComprasTemp', JSON.stringify(carrinho));
        }

        // --- LÓGICA DO CARRINHO ---
        function adicionarAoCarrinho(produto, preco) {
            const index = carrinho.findIndex(i => i.id === produto.id && i.mercado === mercadoAtual.codigo);

            if (index > -1) {
                carrinho[index].quantidade++;
            } else {
                carrinho.unshift({
                    id: produto.id,
                    nome: produto.nome,
                    imagem: produto.imagem,
                    preco: parseFloat(preco),
                    quantidade: 1,
                    mercado: mercadoAtual.codigo,
                    mercado_nome: mercadoAtual.nome
                });
            }
            renderizarCarrinho();

            // Notificação Toast
            const Toast = Swal.mixin({
                toast: true, position: 'top', showConfirmButton: false, timer: 1500,
                background: '#00B37E', color: '#fff'
            });
            Toast.fire({ icon: 'success', title: `${produto.nome} adicionado!` });
        }

        function alterarQtd(index, delta) {
            carrinho[index].quantidade += delta;
            if (carrinho[index].quantidade <= 0) {
                Swal.fire({
                    title: 'Remover?',
                    text: "Deseja retirar este item da lista?",
                    icon: 'warning',
                    background: '#202024', color: '#fff',
                    showCancelButton: true,
                    confirmButtonColor: '#F75A68', cancelButtonColor: '#323238',
                    confirmButtonText: 'Sim, remover'
                }).then((res) => {
                    if (res.isConfirmed) {
                        carrinho.splice(index, 1);
                        renderizarCarrinho();
                    } else {
                        carrinho[index].quantidade = 1; // Reverte
                        renderizarCarrinho();
                    }
                });
            } else {
                renderizarCarrinho();
            }
        }

        // --- SCANNER (CORE) ---
        function iniciarScanner() {
            document.getElementById('scanner-overlay').style.display = 'block';

            // Configurações otimizadas para mobile
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };

            html5QrcodeScanner = new Html5Qrcode("reader");

            html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                onScanSuccess,
                (errorMessage) => { /* Ignorar erros de frame vazio */ }
            ).catch(err => {
                console.error(err);
                fecharScanner();
                Swal.fire('Erro', 'Não foi possível acessar a câmera.', 'error');
            });
        }

        function fecharScanner() {
            if (html5QrcodeScanner) {
                html5QrcodeScanner.stop().then(() => {
                    html5QrcodeScanner.clear();
                    document.getElementById('scanner-overlay').style.display = 'none';
                }).catch(err => console.log(err));
            } else {
                document.getElementById('scanner-overlay').style.display = 'none';
            }
        }

        async function onScanSuccess(decodedText, decodedResult) {
            // Pausa o scanner para não ler múltiplas vezes o mesmo frame
            if (isScanning) return;
            isScanning = true;

            beep(); // Feedback sonoro/tátil

            html5QrcodeScanner.pause(); // Pausa leitura visualmente

            try {
                // Chama a API que verifica pelo código de barras
                const res = await fetch(`/api/check-product?barcode=${decodedText}`);
                const data = await res.json();

                if (data.success && data.exists) {
                    // Produto encontrado
                    const p = data.product;
                    const preco = p.preco_atual || 0;

                    await Swal.fire({
                        title: 'Produto Encontrado!',
                        html: `
                            <img src="${p.imagem}" style="width:100px; border-radius:10px; margin-bottom:10px">
                            <h3 style="color:#fff">${p.nome}</h3>
                            <div style="background:#29292E; padding:10px; border-radius:8px; margin-top:10px">
                                <div style="color:#00B37E; font-size:1.5rem; font-weight:bold">R$ ${preco.toFixed(2)}</div>
                                <small style="color:#ccc">Preço atual no sistema</small>
                            </div>
                        `,
                        background: '#202024', color: '#fff',
                        showCancelButton: true,
                        confirmButtonText: 'Adicionar', confirmButtonColor: '#00B37E',
                        cancelButtonText: 'Cancelar'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            adicionarAoCarrinho(p, preco);
                        }
                    });
                } else {
                    // Produto não encontrado -> Fluxo de cadastro rápido
                    await Swal.fire({
                        icon: 'question',
                        title: 'Novo Produto!',
                        text: `Código ${decodedText} não cadastrado. Deseja adicionar manualmente?`,
                        background: '#202024', color: '#fff',
                        showCancelButton: true,
                        confirmButtonText: 'Sim, cadastrar', confirmButtonColor: '#00B37E'
                    }).then((r) => {
                        if (r.isConfirmed) {
                            // Aqui você poderia redirecionar para um modal de cadastro
                            // Por enquanto, vamos abrir a busca manual
                            abrirBusca(decodedText);
                        }
                    });
                }

            } catch (error) {
                console.error(error);
                Swal.fire('Erro', 'Falha ao consultar servidor', 'error');
            } finally {
                // Retoma ou fecha o scanner
                isScanning = false;
                html5QrcodeScanner.resume();
                // Opcional: fecharScanner() se quiser fechar após 1 leitura bem sucedida
                fecharScanner();
            }
        }

        // --- BUSCA MANUAL ---
        function abrirBusca(termoInicial = '') {
            Swal.fire({
                title: 'Buscar Produto',
                input: 'text',
                inputValue: termoInicial,
                inputPlaceholder: 'Digite o nome do produto...',
                background: '#202024', color: '#fff',
                confirmButtonColor: '#00B37E',
                showCancelButton: true,
                inputAttributes: {
                    autocapitalize: 'off'
                },
                preConfirm: (termo) => {
                    return fetch(`/api/buscar-produtos?termo=${termo}`)
                        .then(response => {
                            if (!response.ok) throw new Error(response.statusText)
                            return response.json()
                        })
                        .catch(error => {
                            Swal.showValidationMessage(`Request failed: ${error}`)
                        })
                }
            }).then((result) => {
                if (result.isConfirmed && result.value.sugestoes) {
                    // Mostra lista de resultados (Simplificado para este exemplo)
                    const prods = result.value.sugestoes;
                    if (prods.length > 0) {
                        // Pega o primeiro só para exemplo, ideal seria outro modal de seleção
                        adicionarAoCarrinho(prods[0], prods[0].preco);
                    } else {
                        Swal.fire('Nada encontrado', '', 'info');
                    }
                }
            });
        }

        // --- SELEÇÃO DE MERCADO ---
        function mudarMercado() {
            const opcoes = { 'db': 'DB Supermercados', 'atack': 'Atack', 'novaera': 'Nova Era' };

            Swal.fire({
                title: 'Onde você está?',
                input: 'select',
                inputOptions: opcoes,
                inputValue: mercadoAtual.codigo,
                background: '#202024', color: '#fff',
                confirmButtonColor: '#00B37E',
                showCancelButton: true
            }).then((res) => {
                if (res.isConfirmed) {
                    mercadoAtual = { id: 1, nome: opcoes[res.value], codigo: res.value }; // ID fake fixo por enqto
                    localStorage.setItem('mercado_pref', JSON.stringify(mercadoAtual));
                    atualizarUI();
                }
            });
        }

        // --- FINALIZAR ---
        async function finalizarCompra() {
            if (carrinho.length === 0) return Swal.fire('Vazio', 'Adicione itens primeiro', 'warning');

            const result = await Swal.fire({
                title: 'Salvar Lista?',
                text: "Deseja salvar essa compra no histórico?",
                icon: 'question',
                background: '#202024', color: '#fff',
                showCancelButton: true,
                confirmButtonColor: '#00B37E',
                confirmButtonText: 'Salvar'
            });

            if (result.isConfirmed) {
                try {
                    const total = carrinho.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);

                    const res = await fetch('/api/salvar-lista', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            itens: carrinho,
                            total: total,
                            data: new Date().toISOString()
                        })
                    });

                    const d = await res.json();
                    if (d.success) {
                        carrinho = [];
                        renderizarCarrinho();
                        Swal.fire({
                            icon: 'success', title: 'Salvo!',
                            background: '#202024', color: '#fff', confirmButtonColor: '#00B37E'
                        }).then(() => window.location.href = 'minhas-listas.html');
                    } else {
                        Swal.fire('Erro', 'Faça login para salvar', 'error');
                    }
                } catch (e) {
                    Swal.fire('Erro', 'Sem conexão', 'error');
                }
            }
        }
    
