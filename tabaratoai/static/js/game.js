
        // --- Dados do Jogo (Manaus Edition) ---
        const items = [
            { name: "Tambaqui", icon: "🐟", type: "geladeira" },
            { name: "Tucumã", icon: "🟠", type: "geladeira" },
            { name: "Queijo Coalho", icon: "🧀", type: "geladeira" },
            { name: "Manteiga", icon: "🧈", type: "geladeira" },
            { name: "Iogurte", icon: "🥛", type: "geladeira" },
            { name: "Refrigerante", icon: "🥤", type: "geladeira" },
            { name: "Farinha Uarini", icon: "🥣", type: "armario" },
            { name: "Arroz", icon: "🍚", type: "armario" },
            { name: "Feijão", icon: "🥘", type: "armario" },
            { name: "Macarrão", icon: "🍝", type: "armario" },
            { name: "Sabão em Pó", icon: "🧼", type: "armario" },
            { name: "Bolacha", icon: "🍪", type: "armario" },
            { name: "Óleo", icon: "🌻", type: "armario" }
        ];

        // --- Simulação do Banco de Dados de Ofertas ---
        // No seu site real, isso viria do seu Backend
        const mockOffers = [
            { product: "Café 500g", price: "R$ 11,99", store: "no Baratão da Carne" },
            { product: "Leite Ninho", price: "R$ 14,50", store: "no DB Supermercados" },
            { product: "Picanha (kg)", price: "R$ 39,90", store: "no Veneza" },
            { product: "Arroz Tio João", price: "R$ 5,89", store: "no Assaí" },
            { product: "Detergente Ypê", price: "R$ 1,99", store: "no Nova Era" }
        ];

        let score = 0;
        let currentItem = null;
        let timeLeft = 100;
        let gameLoop;
        let difficultySpeed = 0.3;

        const cardEl = document.getElementById('card');
        const iconEl = document.getElementById('cardIcon');
        const nameEl = document.getElementById('cardName');
        const scoreEl = document.getElementById('score');
        const timerFill = document.getElementById('timerFill');

        function startGame() {
            score = 0;
            timeLeft = 100;
            difficultySpeed = 0.3;
            scoreEl.innerText = score;

            document.getElementById('startScreen').classList.add('hidden');
            document.getElementById('gameOverScreen').classList.add('hidden');
            cardEl.classList.remove('hidden');

            nextItem();

            if (gameLoop) clearInterval(gameLoop);
            gameLoop = setInterval(() => {
                timeLeft -= difficultySpeed;
                timerFill.style.width = timeLeft + "%";
                if (timeLeft <= 0) gameOver();
            }, 30);
        }

        function nextItem() {
            currentItem = items[Math.floor(Math.random() * items.length)];
            iconEl.innerText = currentItem.icon;
            nameEl.innerText = currentItem.name;

            // Reinicia animação
            cardEl.classList.remove('popIn');
            void cardEl.offsetWidth;
            cardEl.style.animation = 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        }

        function handleInput(type) {
            if (!currentItem) return;
            if (navigator.vibrate) navigator.vibrate(30);

            if (type === currentItem.type) {
                score++;
                scoreEl.innerText = score;
                timeLeft = Math.min(100, timeLeft + 10);
                if (score % 5 === 0) difficultySpeed += 0.05;
                nextItem();
            } else {
                timeLeft -= 20; // Punição maior
                cardEl.classList.add('shake');
                setTimeout(() => cardEl.classList.remove('shake'), 300);
                if (navigator.vibrate) navigator.vibrate(200);
            }
        }

        function gameOver() {
            clearInterval(gameLoop);
            cardEl.classList.add('hidden');
            document.getElementById('gameOverScreen').classList.remove('hidden');
            document.getElementById('finalScore').innerText = score;

            // --- SISTEMA DE OFERTA ALEATÓRIA ---
            // Aqui pegamos uma oferta aleatória do "banco de dados"
            const randomOffer = mockOffers[Math.floor(Math.random() * mockOffers.length)];

            document.getElementById('offerPrice').innerText = randomOffer.price;
            document.getElementById('offerDesc').innerText = `${randomOffer.product} ${randomOffer.store}`;
        }

        function exitGame() {
            clearInterval(gameLoop); // Para o jogo imediatamente

            // FEEDBACK VISUAL PARA O USUÁRIO
            const btn = document.querySelector('.emergency-btn');
            if (btn) btn.innerText = "Carregando Lista...";

            // INTEGRAR AQUI COM SEU SITE:
            // window.location.href = "sua_pagina_de_lista.html";

            // Simulação apenas para teste:
            setTimeout(() => {
                alert("Redirecionando para sua lista de compras...");
                // Reset visual caso o usuário cancele o alert (apenas para teste)
                location.reload();
            }, 500);
        }
    
