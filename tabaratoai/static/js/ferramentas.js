
        // --- GERENCIAMENTO DE MODALS ---
        function openModal(id) {
            document.getElementById(id).classList.add('active');
            // Se for rancho, verifica lista atual
            if (id === 'modal-rancho') checkListaLocal();
        }

        function closeModal(id) {
            document.getElementById(id).classList.remove('active');
        }

        // --- 1. COMPARADOR DE RANCHO ---
        function checkListaLocal() {
            const lista = JSON.parse(localStorage.getItem('listaComprasTemp') || '[]');
            const status = document.getElementById('rancho-status');
            const btn = document.getElementById('btn-simular-rancho');

            if (lista.length === 0) {
                status.innerHTML = '<i class="fas fa-times-circle" style="color:red"></i> Você não tem itens na lista atual.';
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.innerText = "Crie uma lista primeiro";
            } else {
                status.innerHTML = `<i class="fas fa-check-circle" style="color:green"></i> Lista ativa com <strong>${lista.length} itens</strong>.`;
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerText = "Ver Onde é Mais Barato";
            }
        }

        // Variável para armazenar os dados retornados do backend
        let currentRankingData = [];

        async function simularRancho() {
            const lista = JSON.parse(localStorage.getItem('listaComprasTemp') || '[]');
            const box = document.getElementById('rancho-result');

            box.style.display = 'block';
            box.innerHTML = '<p style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Consultando preços no banco de dados...</p>';

            try {
                // Simulação - substitua por sua API real
                const data = {
                    success: true,
                    ranking: [
                        {
                            mercado_nome: "Supermercado A",
                            total: 156.78,
                            economia: 23.45,
                            itens_encontrados: 8,
                            itens_faltantes: 2,
                            detalhes: []
                        }
                    ]
                };

                if (data.success && data.ranking.length > 0) {
                    currentRankingData = data.ranking;
                    const winner = data.ranking[0];
                    const economia = winner.economia > 0 ? `Economia de R$ ${winner.economia.toFixed(2)}` : 'Melhor preço encontrado!';

                    box.innerHTML = `
                <div style="text-align:center">
                    <p style="font-size:0.9rem; color:#666">Melhor opção para sua compra:</p>
                    <div class="res-val" style="color:#166534">R$ ${winner.total.toFixed(2)}</div>
                    <div style="font-weight:700; font-size:1.2rem; margin-bottom:5px">${winner.mercado_nome}</div>
                    
                    <span style="background:#dcfce7; color:#166534; padding:4px 10px; border-radius:20px; font-size:0.85rem; font-weight:700">
                        ${economia}
                    </span>
                    
                    <p style="margin-top:10px; font-size:0.8rem; color:#999">
                        ${winner.itens_encontrados} itens encontrados, ${winner.itens_faltantes} estimados pela média.
                    </p>

                    <button class="btn-small-details" onclick="verDetalhes(0)">
                        <i class="fas fa-list-ul"></i> Ver itens neste mercado
                    </button>
                </div>
            `;
                } else {
                    box.innerHTML = '<p style="color:red; text-align:center">Não foi possível comparar no momento.</p>';
                }
            } catch (e) {
                console.error(e);
                box.innerHTML = '<p style="color:red; text-align:center">Erro de conexão.</p>';
            }
        }

        // NOVA FUNÇÃO: Abre o modal com os detalhes
        function verDetalhes(index) {
            if (!currentRankingData || !currentRankingData[index]) return;

            const mercado = currentRankingData[index];
            const listaContainer = document.getElementById('lista-itens-conteudo');
            const titulo = document.getElementById('detalhe-mercado-titulo');

            titulo.innerText = `Itens no ${mercado.mercado_nome}`;
            listaContainer.innerHTML = '';

            // Dados simulados
            const itensSimulados = [
                { nome: "Arroz", qtd: 1, preco_unit: 5.99, total_item: 5.99, status: "encontrado" },
                { nome: "Feijão", qtd: 1, preco_unit: 8.50, total_item: 8.50, status: "encontrado" },
                { nome: "Carne", qtd: 2, preco_unit: 25.90, total_item: 51.80, status: "estimado" }
            ];

            itensSimulados.forEach(item => {
                const isFound = item.status === 'encontrado';
                const tagClass = isFound ? 'tag-ok' : 'tag-est';
                const tagText = isFound ? 'OK' : 'MÉDIA';

                const html = `
            <div class="item-detalhe" style="background: ${isFound ? '#fff' : '#fff7ed'}">
                <div style="display:flex; flex-direction:column; align-items:flex-start;">
                    <span style="font-weight:600; color:#374151">${item.nome}</span>
                    <span style="font-size:0.75rem; color:#6b7280">${item.qtd}x R$ ${item.preco_unit.toFixed(2)}</span>
                </div>
                <div style="text-align:right">
                    <div style="font-weight:700; color:#374151">R$ ${item.total_item.toFixed(2)}</div>
                    <span class="tag-status ${tagClass}">${tagText}</span>
                </div>
            </div>
        `;
                listaContainer.innerHTML += html;
            });

            openModal('modal-detalhes-lista');
        }

        // --- 2. CALCULADORA ANTI-PEGADINHA ---
        function calcularEmbalagem() {
            const pA = parseFloat(document.getElementById('preco-a').value);
            const wA = parseFloat(document.getElementById('peso-a').value);
            const pB = parseFloat(document.getElementById('preco-b').value);
            const wB = parseFloat(document.getElementById('peso-b').value);

            if (!pA || !wA || !pB || !wB) {
                Swal.fire('Opa', 'Preencha todos os campos para comparar.', 'warning');
                return;
            }

            // Calcula preço por unidade (grama/ml)
            const ratioA = pA / wA;
            const ratioB = pB / wB;

            // Exibe preço por Kg/L (x1000)
            document.getElementById('res-a').innerText = `R$ ${(ratioA * 1000).toFixed(2)} / kg(L)`;
            document.getElementById('res-b').innerText = `R$ ${(ratioB * 1000).toFixed(2)} / kg(L)`;

            // Reseta classes
            document.getElementById('pack-a').classList.remove('winner');
            document.getElementById('pack-b').classList.remove('winner');

            if (ratioA < ratioB) {
                document.getElementById('pack-a').classList.add('winner');
            } else if (ratioB < ratioA) {
                document.getElementById('pack-b').classList.add('winner');
            }
        }

        // --- 3. CHURRASCO INTELIGENTE ---
        async function calcularChurrasco() {
            const h = document.getElementById('ch-homens').value;
            const m = document.getElementById('ch-mulheres').value;
            const c = document.getElementById('ch-criancas').value;
            const cerv = document.getElementById('ch-cerveja').value;
            const box = document.getElementById('churrasco-result');

            if (h == 0 && m == 0 && c == 0) {
                Swal.fire('Ei!', 'Convide alguém para o churrasco!', 'info');
                return;
            }

            box.style.display = 'block';
            box.innerHTML = '<p style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Consultando preços atuais...</p>';

            try {
                // Simulação - substitua por sua API real
                const data = {
                    success: true,
                    resumo: {
                        carne_kg: 2.5,
                        total_estimado: 187.50
                    },
                    ranking: [
                        { nome: "Mercado A", total: 187.50 },
                        { nome: "Mercado B", total: 195.80 },
                        { nome: "Mercado C", total: 201.30 }
                    ]
                };

                if (data.success) {
                    const r = data.resumo;
                    const rankingHTML = data.ranking.map((mercado, index) => `
                        <div class="bbq-item ${index === 0 ? 'winner' : ''}">
                            <div style="display:flex; align-items:center">
                                <div class="bbq-rank-num">${index + 1}</div>
                                <div>
                                    <div style="font-weight:600; font-size:0.95rem">${mercado.nome}</div>
                                    ${index === 0 ? '<span style="font-size:0.7rem; color:#059669; font-weight:700">MELHOR PREÇO</span>' : ''}
                                </div>
                            </div>
                            <div style="font-weight:700; color:${index === 0 ? '#059669' : '#374151'}">
                                R$ ${mercado.total.toFixed(2)}
                            </div>
                        </div>
                    `).join('');

                    box.innerHTML = `
                        <div style="border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:10px">
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px">
                                <span>🥩 Carne (${r.carne_kg}kg):</span>
                                <span>Estimado no total</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px">
                                <span>🍺 Bebidas:</span>
                                <span>Estimado no total</span>
                            </div>
                        </div>
                        
                        <div style="text-align:center; margin-bottom: 1.5rem;">
                            <span style="font-size:0.9rem; color:#666">Melhor Custo Encontrado</span>
                            <div class="res-val" style="color:#e11d48">R$ ${r.total_estimado.toFixed(2)}</div>
                        </div>

                        <h4 style="font-size:0.9rem; color:#6b7280; margin-bottom:0.5rem">🏆 Onde comprar (Top 3):</h4>
                        <div class="bbq-ranking">
                            ${rankingHTML}
                        </div>
                    `;
                }
            } catch (e) {
                box.innerHTML = '<p style="color:red">Erro ao calcular.</p>';
            }
        }

        // === CARDÁPIO INTELIGENTE - FUNÇÕES PRINCIPAIS ===

        // Variáveis globais para o cardápio
        let cardapioGerado = null;
        let listaComprasOtimizada = null;

        // Função para alternar refeicoes baseado no período
        function toggleRefeicoes() {
            const periodo = document.getElementById('cardapio-periodo').value;
            const cafeCheck = document.getElementById('cafe-check');

            // Se for mês, desmarca café da manhã por padrão para simplificar
            if (periodo === 'mes') {
                cafeCheck.checked = false;
            } else {
                cafeCheck.checked = true;
            }
        }

        // Base de dados de receitas e ingredientes
        const receitas = {
            cafe: [
                "Pão integral com queijo e café com leite",
                "Aveia com frutas e iogurte",
                "Omelete com pão francês",
                "Vitamina de banana com aveia",
                "Tapioca com queijo coalho"
            ],
            almoco: [
                "Filé de frango grelhado com arroz integral e salada",
                "Peixe assado com purê de batata e legumes",
                "Lasanha de carne moída com salada verde",
                "Feijoada light com couve e laranja",
                "Strogonoff de frango com arroz e batata palha"
            ],
            jantar: [
                "Sopa de legumes com frango desfiado",
                "Sanduíche natural com salada de folhas",
                "Omelete de espinafre com salada",
                "Creme de abóbora com torradas",
                "Salada de grão de bico com atum"
            ]
        };

        // Base de dados de ingredientes e preços
        const ingredientesDB = [
            { nome: "Arroz", unidade: "kg", preco: 5.99, mercado: "Supermercado A" },
            { nome: "Feijão", unidade: "kg", preco: 8.50, mercado: "Supermercado B" },
            { nome: "Frango", unidade: "kg", preco: 15.90, mercado: "Supermercado A" },
            { nome: "Carne", unidade: "kg", preco: 32.90, mercado: "Supermercado C" },
            { nome: "Peixe", unidade: "kg", preco: 28.50, mercado: "Supermercado B" },
            { nome: "Ovos", unidade: "dúzia", preco: 12.90, mercado: "Supermercado A" },
            { nome: "Pão integral", unidade: "un", preco: 8.90, mercado: "Supermercado B" },
            { nome: "Queijo", unidade: "kg", preco: 34.90, mercado: "Supermercado C" },
            { nome: "Leite", unidade: "L", preco: 5.49, mercado: "Supermercado A" },
            { nome: "Legumes variados", unidade: "kg", preco: 12.90, mercado: "Supermercado B" },
            { nome: "Frutas", unidade: "kg", preco: 8.90, mercado: "Supermercado A" },
            { nome: "Aveia", unidade: "kg", preco: 6.90, mercado: "Supermercado C" }
        ];

        // Função principal para gerar o cardápio
        function gerarCardapio() {
            const periodo = document.getElementById('cardapio-periodo').value;
            const cafe = document.getElementById('cafe-check').checked;
            const almoco = document.getElementById('almoco-check').checked;
            const jantar = document.getElementById('jantar-check').checked;
            const preferencias = document.getElementById('cardapio-preferencias').value;
            const orcamento = parseFloat(document.getElementById('cardapio-orcamento').value) || 0;

            // Preferências alimentares
            const prefVegetariano = document.getElementById('pref-vegetariano').checked;
            const prefLowCarb = document.getElementById('pref-lowcarb').checked;
            const prefSemGluten = document.getElementById('pref-semgluten').checked;

            const box = document.getElementById('cardapio-result');

            // Validação básica
            if (!cafe && !almoco && !jantar) {
                Swal.fire('Atenção', 'Selecione pelo menos uma refeição para incluir no cardápio.', 'warning');
                return;
            }

            box.style.display = 'block';
            box.innerHTML = '<p style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Criando seu cardápio personalizado...</p>';

            // Simula um pequeno delay para parecer mais real
            setTimeout(() => {
                try {
                    // Gera cardápio baseado nas preferências
                    const cardapio = gerarCardapioPersonalizado(periodo, cafe, almoco, jantar, preferencias, prefVegetariano, prefLowCarb, prefSemGluten);
                    const listaCompras = gerarListaCompras(cardapio);

                    cardapioGerado = cardapio;
                    listaComprasOtimizada = listaCompras;

                    // Exibir o cardápio gerado
                    exibirCardapio(cardapio, listaCompras);
                } catch (e) {
                    console.error(e);
                    box.innerHTML = '<p style="color:red; text-align:center">Erro ao gerar cardápio.</p>';
                }
            }, 1500);
        }

        // Função para gerar cardápio personalizado
        function gerarCardapioPersonalizado(periodo, cafe, almoco, jantar, preferencias, vegetariano, lowcarb, semgluten) {
            const dias = periodo === 'semana' ? 7 : 30;
            const refeicoesIncluidas = [];

            if (cafe) refeicoesIncluidas.push("Café da manhã");
            if (almoco) refeicoesIncluidas.push("Almoço");
            if (jantar) refeicoesIncluidas.push("Jantar");

            const cardapioDias = [];

            for (let i = 1; i <= dias; i++) {
                const dia = {
                    dia: periodo === 'semana' ? `Dia ${i}` : `Dia ${i}`,
                    cafe: cafe ? receitas.cafe[Math.floor(Math.random() * receitas.cafe.length)] : null,
                    almoco: almoco ? receitas.almoco[Math.floor(Math.random() * receitas.almoco.length)] : null,
                    jantar: jantar ? receitas.jantar[Math.floor(Math.random() * receitas.jantar.length)] : null
                };
                cardapioDias.push(dia);
            }

            return {
                periodo: periodo,
                refeicoes_incluidas: refeicoesIncluidas,
                dias: cardapioDias
            };
        }

        // Função para gerar lista de compras
        function gerarListaCompras(cardapio) {
            const listaCompras = [];

            // Simula uma lista de compras baseada no cardápio
            cardapio.dias.forEach(dia => {
                if (dia.cafe && dia.cafe.includes("Pão")) listaCompras.push({ nome: "Pão integral", quantidade: 0.5, unidade: "un", preco: 8.90, mercado: "Supermercado B" });
                if (dia.cafe && dia.cafe.includes("Queijo")) listaCompras.push({ nome: "Queijo", quantidade: 0.2, unidade: "kg", preco: 34.90, mercado: "Supermercado C" });
                if (dia.almoco && dia.almoco.includes("Frango")) listaCompras.push({ nome: "Frango", quantidade: 0.3, unidade: "kg", preco: 15.90, mercado: "Supermercado A" });
                if (dia.almoco && dia.almoco.includes("Arroz")) listaCompras.push({ nome: "Arroz", quantidade: 0.2, unidade: "kg", preco: 5.99, mercado: "Supermercado A" });
                if (dia.almoco && dia.almoco.includes("Legumes")) listaCompras.push({ nome: "Legumes variados", quantidade: 0.4, unidade: "kg", preco: 12.90, mercado: "Supermercado B" });
            });

            // Agrupa itens iguais
            const listaAgrupada = [];
            listaCompras.forEach(item => {
                const existente = listaAgrupada.find(i => i.nome === item.nome && i.mercado === item.mercado);
                if (existente) {
                    existente.quantidade += item.quantidade;
                } else {
                    listaAgrupada.push({ ...item });
                }
            });

            return listaAgrupada;
        }

        // Função para exibir o cardápio gerado
        function exibirCardapio(cardapio, listaCompras) {
            const box = document.getElementById('cardapio-result');

            // Calcular total da lista de compras
            const totalLista = listaCompras.reduce((total, item) => total + (item.preco * item.quantidade), 0);

            let html = `
                <div style="text-align:center; margin-bottom: 1.5rem;">
                    <div style="display:inline-block; background:#f0f9ff; color:#0369a1; padding:8px 16px; border-radius:20px; font-weight:700; margin-bottom:1rem;">
                        <i class="fas fa-check-circle"></i> Cardápio Gerado com Sucesso!
                    </div>
                    <p style="font-size:0.9rem; color:#6b7280;">
                        ${cardapio.periodo === 'semana' ? '7 dias' : '30 dias'} | 
                        ${cardapio.refeicoes_incluidas.join(', ')}
                    </p>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="font-size:1.1rem; font-weight:700;">Resumo do Cardápio</h3>
                    <span style="font-weight:700; color:#8b5cf6;">R$ ${totalLista.toFixed(2)}</span>
                </div>
                
                <div style="max-height:300px; overflow-y:auto; margin-bottom:1.5rem;">
            `;

            // Exibir apenas os primeiros 3 dias para não ficar muito longo
            const diasParaExibir = cardapio.dias.slice(0, 3);

            diasParaExibir.forEach(dia => {
                html += `
                    <div style="background:#f8fafc; border-radius:12px; padding:1rem; margin-bottom:0.8rem;">
                        <div style="font-weight:700; color:#374151; margin-bottom:0.5rem;">${dia.dia}</div>
                        <div style="display:flex; flex-direction:column; gap:0.3rem;">
                `;

                if (dia.cafe) {
                    html += `<div><span style="font-weight:600; color:#6b7280;">☕ Café:</span> ${dia.cafe}</div>`;
                }

                if (dia.almoco) {
                    html += `<div><span style="font-weight:600; color:#6b7280;">🍽️ Almoço:</span> ${dia.almoco}</div>`;
                }

                if (dia.jantar) {
                    html += `<div><span style="font-weight:600; color:#6b7280;">🍲 Jantar:</span> ${dia.jantar}</div>`;
                }

                html += `</div></div>`;
            });

            if (cardapio.dias.length > 3) {
                html += `<p style="text-align:center; color:#6b7280; font-size:0.9rem; margin-top:1rem;">+ ${cardapio.dias.length - 3} dias adicionais no cardápio</p>`;
            }

            html += `</div>`;

            // Botão para ver lista de compras
            html += `
                <button class="btn-calculate" onclick="verListaCompras()" style="background: #8b5cf6; width:100%;">
                    <i class="fas fa-shopping-basket"></i> Ver Lista de Compras Otimizada
                </button>
            `;

            box.innerHTML = html;
        }

        // Função para exibir a lista de compras otimizada
        function verListaCompras() {
            if (!listaComprasOtimizada) return;

            const totalLista = listaComprasOtimizada.reduce((total, item) => total + (item.preco * item.quantidade), 0);
            const listaContainer = document.getElementById('lista-compras-conteudo');
            const totalInfo = document.getElementById('lista-total-info');

            totalInfo.innerText = `Total estimado: R$ ${totalLista.toFixed(2)}`;
            listaContainer.innerHTML = '';

            // Agrupar itens por mercado para otimização
            const itensPorMercado = {};

            listaComprasOtimizada.forEach(item => {
                if (!itensPorMercado[item.mercado]) {
                    itensPorMercado[item.mercado] = [];
                }
                itensPorMercado[item.mercado].push(item);
            });

            // Exibir itens agrupados por mercado
            Object.keys(itensPorMercado).forEach(mercado => {
                const itensMercado = itensPorMercado[mercado];
                const totalMercado = itensMercado.reduce((total, item) => total + (item.preco * item.quantidade), 0);

                // Cabeçalho do mercado
                listaContainer.innerHTML += `
                    <div style="background:#f3f4f6; padding:10px 15px; border-radius:8px; margin:10px 0 5px 0; font-weight:700; display:flex; justify-content:space-between;">
                        <span>${mercado}</span>
                        <span>R$ ${totalMercado.toFixed(2)}</span>
                    </div>
                `;

                // Itens do mercado
                itensMercado.forEach(item => {
                    const totalItem = item.preco * item.quantidade;

                    listaContainer.innerHTML += `
                        <div class="item-detalhe">
                            <div style="display:flex; flex-direction:column; align-items:flex-start;">
                                <span style="font-weight:600; color:#374151">${item.nome}</span>
                                <span style="font-size:0.75rem; color:#6b7280">${item.quantidade.toFixed(2)} ${item.unidade}</span>
                            </div>
                            <div style="text-align:right">
                                <div style="font-weight:700; color:#374151">R$ ${totalItem.toFixed(2)}</div>
                                <span style="font-size:0.7rem; color:#6b7280">R$ ${item.preco.toFixed(2)}/${item.unidade}</span>
                            </div>
                        </div>
                    `;
                });
            });

            openModal('modal-lista-compras');
        }

        // Função para salvar a lista de compras
        function salvarListaCompras() {
            if (!listaComprasOtimizada) return;

            // Converter para o formato da lista de compras principal
            const listaFormatada = listaComprasOtimizada.map(item => ({
                nome: item.nome,
                quantidade: item.quantidade,
                unidade: item.unidade,
                mercado: item.mercado,
                preco: item.preco
            }));

            // Salvar no localStorage
            localStorage.setItem('listaComprasTemp', JSON.stringify(listaFormatada));

            Swal.fire({
                title: 'Lista Salva!',
                text: 'Sua lista de compras foi salva com sucesso.',
                icon: 'success',
                confirmButtonText: 'OK',
                confirmButtonColor: '#10b981'
            }).then(() => {
                closeModal('modal-lista-compras');
                closeModal('modal-cardapio');
            });
        }
    
