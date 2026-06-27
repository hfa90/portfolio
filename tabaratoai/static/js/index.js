
        AOS.init({
            duration: 800,
            once: true
        });

        // --- EFEITO NAVBAR SCROLL ---
        window.addEventListener('scroll', () => {
            const nav = document.getElementById('navbar');
            if (window.scrollY > 50) nav.classList.add('scrolled');
            else nav.classList.remove('scrolled');
        });

        // --- FUNÇÃO EXPERIMENTAÇÃO (PESQUISA) ---
        function pesquisarAgora() {
            const termo = document.getElementById('hero-search').value;
            // Redireciona para o comparador com o termo na URL (mesmo que peça login depois, a intenção foi capturada)
            window.location.href = `compareaqui.html?search=${encodeURIComponent(termo)}`;
        }

        document.getElementById('hero-search').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') pesquisarAgora();
        });

        // --- SIMULAÇÃO DE DADOS EM TEMPO REAL (GATILHO DE CURIOSIDADE) ---
        // Busca dados reais da API pública para mostrar no ticker
        async function fetchLiveOpportunity() {
            try {
                const res = await fetch('/api/dados-historico');
                const data = await res.json();

                if (data.success && data.oportunidades.length > 0) {
                    const op = data.oportunidades[0];
                    const percent = Math.abs(op.percentual).toFixed(0);

                    const html = `
                        <span style="color:var(--primary-dark)">${op.nome}</span> caiu <b class="price-drop">-${percent}%</b> no <span style="font-weight:700">${op.mercado}</span>!
                        <span style="display:block; font-size:0.8rem; color:#94a3b8; font-weight:400">De R$ ${op.preco_anterior.toFixed(2)} por <b>R$ ${op.preco.toFixed(2)}</b></span>
                    `;

                    document.getElementById('live-opportunity').innerHTML = html;
                    document.getElementById('search-suggestion').innerText = op.nome;
                }
            } catch (e) {
                // Fallback elegante se a API falhar
                document.getElementById('live-opportunity').innerHTML = `
                    <span style="color:var(--primary-dark)">Leite em Pó</span> caiu <b class="price-drop">-15%</b> no <span style="font-weight:700">Nova Era</span>!
                `;
            }
        }

        // Executa ao carregar
        fetchLiveOpportunity();

        // Efeito de digitação no placeholder
        const placeholders = ["Arroz Tipo 1...", "Picanha...", "Sabão em Pó...", "Leite Integral..."];
        let pIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        const input = document.getElementById('hero-search');

        function typeEffect() {
            const current = placeholders[pIndex];

            if (isDeleting) {
                input.setAttribute('placeholder', current.substring(0, charIndex--));
                if (charIndex < 0) {
                    isDeleting = false;
                    pIndex = (pIndex + 1) % placeholders.length;
                }
            } else {
                input.setAttribute('placeholder', current.substring(0, charIndex++));
                if (charIndex > current.length) {
                    isDeleting = true;
                    setTimeout(typeEffect, 2000); // Pausa antes de apagar
                    return;
                }
            }
            setTimeout(typeEffect, isDeleting ? 50 : 100);
        }

        setTimeout(typeEffect, 1000);

    
