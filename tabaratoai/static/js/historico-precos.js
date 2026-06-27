
        document.addEventListener('DOMContentLoaded', carregarHistorico);

        async function carregarHistorico() {
            try {
                const res = await fetch('/api/dados-historico');
                const data = await res.json();

                if (data.success) {
                    renderAlertas(data.oportunidades);
                    renderLista(data.historico);
                }
            } catch (e) {
                document.getElementById('history-list').innerHTML = '<p style="text-align:center">Erro ao carregar dados.</p>';
            }
        }

        function renderAlertas(oportunidades) {
            const wrapper = document.getElementById('alerts-wrapper');
            const grid = document.getElementById('alerts-grid');

            if (oportunidades.length === 0) return;

            wrapper.style.display = 'block';
            grid.innerHTML = oportunidades.map(op => `
                <div class="alert-card">
                    <div class="alert-badge">Baixou ${Math.abs(op.percentual).toFixed(0)}%</div>
                    <div class="alert-img"><i class="${op.imagem || 'fas fa-box'}"></i></div>
                    <div>
                        <div style="font-weight:700; font-size:0.95rem">${op.nome}</div>
                        <div style="font-size:0.8rem; color:var(--text-sec)">${op.mercado}</div>
                        <div style="font-weight:800; color:var(--success); font-size:1.1rem">
                            R$ ${op.preco.toFixed(2)}
                            <span style="text-decoration:line-through; color:var(--text-sec); font-size:0.8rem; font-weight:400">
                                R$ ${op.preco_anterior.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        function renderLista(itens) {
            const container = document.getElementById('history-list');
            container.innerHTML = '';

            itens.forEach((item, index) => {
                // 1. LÓGICA DE TENDÊNCIA (IGUAL AO ANTERIOR)
                let trendClass = 'trend-equal';
                let trendIcon = 'fa-minus';
                let trendText = 'Estável';

                if (item.status === 'desceu') {
                    trendClass = 'trend-down';
                    trendIcon = 'fa-arrow-down';
                    trendText = `Caiu R$ ${Math.abs(item.diff).toFixed(2)}`;
                } else if (item.status === 'subiu') {
                    trendClass = 'trend-up';
                    trendIcon = 'fa-arrow-up';
                    trendText = `Subiu R$ ${item.diff.toFixed(2)}`;
                }

                // 2. FORMATAÇÃO DA DATA (NOVO!)
                // Tenta criar uma data. Se vier do SQL, ajusta para formato legível
                let dataFormatada = "Data desc.";
                if (item.data) {
                    const dataObj = new Date(item.data);
                    // Formato: 22/11 às 14:30
                    const dia = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    const hora = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    dataFormatada = `${dia} às ${hora}`;
                }

                // 3. HTML DO CARD
                const div = document.createElement('div');
                div.className = 'history-card';
                div.innerHTML = `
                    <div class="prod-img"><i class="${item.imagem || 'fas fa-box'}"></i></div>
                    
                    <div>
                        <div style="font-weight:600; color:var(--text-main)">${item.nome}</div>
                        <div style="font-size:0.85rem; color:var(--text-sec)">${item.mercado}</div>
                        
                        <div style="font-size:0.75rem; color:#94a3b8; margin-top:4px; display:flex; align-items:center; gap:4px">
                            <i class="far fa-clock"></i> ${dataFormatada}
                        </div>
                    </div>

                    <div class="chart-area" id="chart-${index}"></div>

                    <div class="price-block">
                        <div class="current-price">R$ ${item.preco.toFixed(2)}</div>
                        <div class="trend-indicator ${trendClass}">
                            <i class="fas ${trendIcon}"></i> ${trendText}
                        </div>
                    </div>
                `;
                container.appendChild(div);

                // Renderizar Gráfico Miniatura
                renderMiniChart(index, item.preco, item.preco_anterior, item.status);
            });
        }

        function renderMiniChart(id, atual, anterior, status) {
            // LÓGICA DE SIMULAÇÃO PARA O GRÁFICO FICAR BONITO
            // (Já que não temos histórico real de 7 dias no DB ainda, criamos pontos intermediários)
            let dataPoints = [];
            let start = anterior || atual;

            // Gera 5 pontos flutuando entre o preço anterior e o atual
            for (let i = 0; i < 5; i++) {
                if (i === 0) dataPoints.push(start);
                else if (i === 4) dataPoints.push(atual);
                else {
                    // Variação aleatória suave
                    let variance = (Math.random() - 0.5) * (start * 0.05);
                    // Interpolação linear + variação
                    let linearPos = start + ((atual - start) * (i / 4));
                    dataPoints.push(Number((linearPos + variance).toFixed(2)));
                }
            }

            const color = status === 'subiu' ? '#ef4444' : (status === 'desceu' ? '#10b981' : '#64748b');

            var options = {
                series: [{ data: dataPoints }],
                chart: {
                    type: 'area', height: 50, width: '100%',
                    sparkline: { enabled: true } // Remove eixos e grids
                },
                stroke: { curve: 'smooth', width: 2 },
                fill: { opacity: 0.2 },
                colors: [color],
                tooltip: {
                    fixed: { enabled: false },
                    x: { show: false },
                    y: { title: { formatter: () => 'Preço' } },
                    marker: { show: false }
                }
            };

            new ApexCharts(document.querySelector(`#chart-${id}`), options).render();
        }
    
