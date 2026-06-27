
        let userLists = [];

        document.addEventListener('DOMContentLoaded', () => {
            fetchData();
        });

        async function fetchData() {
            try {
                // 1. Carregar Estatísticas
                const resStats = await fetch('/api/estatisticas-listas');
                const dataStats = await resStats.json();

                if (dataStats.success) {
                    updateDashboard(dataStats.estatisticas);
                }

                // 2. Carregar Listas
                const resLists = await fetch('/api/minhas-listas');
                const dataLists = await resLists.json();

                if (dataLists.success) {
                    userLists = dataLists.listas;
                    renderLists(userLists);
                }

            } catch (error) {
                console.error("Erro ao carregar dados:", error);
            }
        }

        function updateDashboard(stats) {
            // Atualizar KPIs
            document.getElementById('kpi-gasto').innerText = formatMoeda(stats.total_gasto);
            document.getElementById('kpi-economia').innerText = formatMoeda(stats.total_economia);
            document.getElementById('kpi-count').innerText = stats.total_listas;

            // Renderizar Gráfico Timeline (Barras + Linha)
            const optionsTimeline = {
                series: [{
                    name: 'Gasto Real',
                    type: 'column',
                    data: stats.historico.map(h => h.gasto)
                }, {
                    name: 'Economia',
                    type: 'line',
                    data: stats.historico.map(h => h.economia)
                }],
                chart: {
                    height: 300,
                    type: 'line',
                    toolbar: { show: false },
                    fontFamily: 'Plus Jakarta Sans, sans-serif'
                },
                stroke: { width: [0, 4], curve: 'smooth' },
                plotOptions: { bar: { borderRadius: 4, columnWidth: '40%' } },
                dataLabels: { enabled: false },
                labels: stats.historico.map(h => formatDateShort(h.mes)), // Formata 2023-11 para Nov/23
                colors: ['#0f172a', '#10b981'],
                yaxis: { labels: { formatter: (val) => `R$ ${val}` } },
                grid: { borderColor: '#f1f5f9' }
            };
            new ApexCharts(document.querySelector("#chart-timeline"), optionsTimeline).render();

            // Renderizar Gráfico Rosca (Categorias)
            // Se não houver dados, mostra mensagem
            if (stats.categorias.length > 0) {
                const optionsDonut = {
                    series: stats.categorias.map(c => c.total_categoria),
                    labels: stats.categorias.map(c => c.categoria || 'Geral'),
                    chart: { type: 'donut', height: 320, fontFamily: 'Plus Jakarta Sans, sans-serif' },
                    colors: ['#2e8b57', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'],
                    plotOptions: { pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Top Categoria', formatter: () => stats.categorias[0].categoria || 'Geral' } } } } },
                    dataLabels: { enabled: false },
                    legend: { position: 'bottom' }
                };
                new ApexCharts(document.querySelector("#chart-donut"), optionsDonut).render();
            } else {
                document.querySelector("#chart-donut").innerHTML = "<p style='text-align:center; padding:2rem; color:#aaa'>Sem dados suficientes.</p>";
            }
        }

        function renderLists(listas) {
            const container = document.getElementById('lists-container');
            container.innerHTML = '';

            if (listas.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 4rem; background:white; border-radius:20px;">
                        <i class="fas fa-shopping-basket" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                        <h3>Nenhuma lista encontrada</h3>
                        <p style="color: var(--text-sec); margin-bottom: 1.5rem;">Comece a economizar criando sua primeira lista hoje.</p>
                        <a href="compareaqui.html" class="btn btn-primary" style="display:inline-flex;">Criar Lista Agora</a>
                    </div>`;
                return;
            }

            listas.forEach(lista => {
                const data = new Date(lista.data);
                const dataFormatada = data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
                const horaFormatada = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                // Previews (ícones)
                const itensPreview = lista.itens.slice(0, 3).map(i =>
                    `<div class="preview-img-box"><i class="${i.imagem || 'fas fa-box'}"></i></div>`
                ).join('');

                const maisItens = lista.itens.length > 3 ?
                    `<div class="preview-img-box" style="background:#e0f2fe; color:var(--info); font-weight:700; font-size:0.8rem">+${lista.itens.length - 3}</div>` : '';

                const html = `
                <div class="list-card">
                    <div class="list-header" onclick="openModal(${lista.id})" style="cursor: pointer;">
                        <div class="list-date">
                            <i class="far fa-calendar"></i> ${dataFormatada} às ${horaFormatada}
                        </div>
                        <div class="list-price-row">
                            <div class="list-total">${formatMoeda(lista.total)}</div>
                            ${lista.economia > 0 ? `<div class="list-economy-badge"><i class="fas fa-arrow-down"></i> ${formatMoeda(lista.economia)}</div>` : ''}
                        </div>
                    </div>
                    <div class="list-body">
                        <div class="preview-imgs" onclick="openModal(${lista.id})" style="cursor: pointer;">
                            ${itensPreview}
                            ${maisItens}
                        </div>
                        <div class="list-actions">
                            <button class="btn btn-outline" onclick="refazerLista(${lista.id})"><i class="fas fa-redo"></i> Refazer</button>
                            <button class="btn btn-primary" onclick="alert('Funcionalidade de Rota: Em breve!')"><i class="fas fa-route"></i> Rota</button>
                            <button class="btn btn-danger-light" onclick="excluirLista(${lista.id})"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>`;
                container.insertAdjacentHTML('beforeend', html);
            });
        }

        // --- FUNÇÕES AUXILIARES ---

        function formatMoeda(valor) {
            return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }

        function formatDateShort(anoMes) {
            // Entrada: 2023-11. Saída: Nov/23
            if (!anoMes) return '';
            const [ano, mes] = anoMes.split('-');
            const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return `${meses[parseInt(mes) - 1]}/${ano.slice(2)}`;
        }

        // --- AÇÕES DA LISTA ---

        async function openModal(id) {
            const modal = document.getElementById('modal-detail');
            const body = document.getElementById('modal-items');
            modal.classList.add('active');
            body.innerHTML = '<div style="padding:2rem; text-align:center"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

            try {
                const res = await fetch(`/api/lista/${id}`);
                const data = await res.json();

                if (data.success) {
                    body.innerHTML = data.lista.itens.map(item => `
                        <div class="modal-item">
                            <div style="width:40px; height:40px; background:#f1f5f9; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#64748b">
                                <i class="${item.imagem || 'fas fa-box'}"></i>
                            </div>
                            <div style="flex:1">
                                <div style="font-weight:600">${item.produto_nome}</div>
                                <div style="font-size:0.85rem; color:#94a3b8">${item.mercado || 'Mercado'}</div>
                            </div>
                            <div style="text-align:right">
                                <div style="font-weight:700">${formatMoeda(item.preco * item.quantidade)}</div>
                                <div style="font-size:0.8rem; color:#94a3b8">${item.quantidade} un.</div>
                            </div>
                        </div>
                    `).join('');
                }
            } catch (e) { body.innerHTML = "Erro ao carregar."; }
        }

        function closeModal() {
            document.getElementById('modal-detail').classList.remove('active');
        }

        async function excluirLista(id) {
            if (!confirm("Tem certeza que deseja apagar esta lista do histórico?")) return;
            try {
                const res = await fetch(`/api/excluir-lista/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    location.reload();
                }
            } catch (e) { alert("Erro ao excluir"); }
        }

        async function refazerLista(id) {
            // Lógica para enviar itens de volta ao comparador (localStorage)
            try {
                const res = await fetch(`/api/lista/${id}`);
                const data = await res.json();
                if (data.success) {
                    // Mapeia para o formato que o comparador entende
                    const itensParaCarrinho = data.lista.itens.map(i => ({
                        id: i.produto_id,
                        nome: i.produto_nome,
                        quantidade: i.quantidade,
                        preco: i.preco,
                        mercado: 'melhor_oferta' // Reseta o mercado para recalcular o melhor hoje
                    }));

                    localStorage.setItem('listaComprasTemp', JSON.stringify(itensParaCarrinho));
                    window.location.href = 'compareaqui.html';
                }
            } catch (e) { alert("Erro ao clonar lista"); }
        }

        function compartilharLista() {
            // Gera texto para WhatsApp
            alert("Link copiado para a área de transferência! (Simulação)");
        }

        // Fechar modal ao clicar fora
        document.getElementById('modal-detail').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal-detail')) closeModal();
        });

    
