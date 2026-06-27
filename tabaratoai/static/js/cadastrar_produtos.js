
        // Elementos DOM
        const fileInput = document.getElementById('fileInput');
        const dropArea = document.getElementById('drop-area');
        const phaseUpload = document.getElementById('phase-upload');
        const phaseLoading = document.getElementById('phase-loading');
        const phaseEditor = document.getElementById('phase-editor');
        const floatingFooter = document.getElementById('floating-footer');
        const loadingText = document.getElementById('loading-text');

        // Inputs de Dados
        const inputMercado = document.getElementById('input-mercado');
        const inputData = document.getElementById('input-data');
        const productsListEl = document.getElementById('products-list');
        const totalDisplayEl = document.getElementById('total-display');
        const dataWarning = document.getElementById('data-warning');
        const btnSave = document.getElementById('btn-save');

        let produtosData = [];

        // --- DRAG AND DROP EFFECTS ---
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
        });

        dropArea.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if(files.length > 0) processFile(files[0]);
        }

        // --- UPLOAD HANDLER ---
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) processFile(fileInput.files[0]);
        });

        async function processFile(file) {
            // UI Transition
            phaseUpload.style.display = 'none';
            phaseLoading.style.display = 'flex';
            
            // Simula loading text steps
            const texts = ["Lendo caracteres...", "Identificando produtos...", "Calculando preços..."];
            let textIdx = 0;
            const textInterval = setInterval(() => {
                loadingText.innerText = texts[textIdx % texts.length];
                textIdx++;
            }, 800);

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/api/analisar-nf', {
                    method: 'POST',
                    body: formData
                });
                const json = await res.json();

                clearInterval(textInterval);

                if (json.success) {
                    popularEditor(json.data);
                    phaseLoading.style.display = 'none';
                    phaseEditor.style.display = 'block';
                    floatingFooter.style.display = 'flex';
                } else {
                    throw new Error(json.message);
                }

            } catch (err) {
                clearInterval(textInterval);
                Swal.fire({
                    title: 'Ops!',
                    text: 'Não conseguimos ler sua nota. Tente uma foto mais nítida.',
                    icon: 'error',
                    confirmButtonText: 'Tentar Novamente'
                }).then(() => {
                    location.reload();
                });
            }
        }

        // --- EDITOR LOGIC ---
        function popularEditor(data) {
            inputMercado.value = data.estabelecimento || '';
            // Tenta pegar a data da NF ou usa hoje
            inputData.value = data.data_emissao || new Date().toISOString().split('T')[0];
            
            produtosData = data.produtos || [];
            
            if(produtosData.length === 0) {
                Swal.fire('Aviso', 'Nenhum produto foi identificado automaticamente. Você pode adicionar manualmente se quiser (funcionalidade futura).', 'warning');
            }

            renderizarLista();
            validarData();
        }

        function renderizarLista() {
            productsListEl.innerHTML = '';
            let total = 0;

            produtosData.forEach((p, index) => {
                const row = document.createElement('div');
                row.className = 'receipt-item';
                
                // Inputs HTML
                row.innerHTML = `
                    <input type="text" class="item-input name" value="${p.descricao}" onchange="atualizarItem(${index}, 'descricao', this.value)" placeholder="Nome do Produto">
                    <input type="number" class="item-input" value="${p.quantidade || 1}" step="0.01" onchange="atualizarItem(${index}, 'quantidade', this.value)" placeholder="Qtd">
                    <input type="number" class="item-input" value="${p.preco_unitario}" step="0.01" onchange="atualizarItem(${index}, 'preco_unitario', this.value)" placeholder="Preço">
                    <button class="btn-delete" onclick="removerItem(${index})" title="Remover"><i class="fas fa-trash-alt"></i></button>
                `;
                
                productsListEl.appendChild(row);

                // Calculo Total
                total += (parseFloat(p.preco_unitario) || 0) * (parseFloat(p.quantidade) || 1);
            });

            totalDisplayEl.innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }

        window.atualizarItem = (index, field, value) => {
            if(field !== 'descricao') value = parseFloat(value) || 0;
            produtosData[index][field] = value;
            renderizarLista(); // Recalcula total visualmente
        };

        window.removerItem = (index) => {
            Swal.fire({
                title: 'Remover item?',
                text: "Você tem certeza?",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280',
                confirmButtonText: 'Sim, remover'
            }).then((result) => {
                if (result.isConfirmed) {
                    produtosData.splice(index, 1);
                    renderizarLista();
                }
            })
        };

        window.validarData = () => {
            const dataInput = new Date(inputData.value + 'T00:00:00'); // Força timezone local simples
            const hoje = new Date();
            hoje.setHours(0,0,0,0);
            
            const ontem = new Date(hoje);
            ontem.setDate(hoje.getDate() - 1);
            
            // Lógica simples: data do input deve ser >= ontem
            if (dataInput >= ontem) {
                dataWarning.style.display = 'none';
                inputData.style.borderColor = 'transparent';
                btnSave.style.opacity = '1';
                btnSave.disabled = false;
            } else {
                dataWarning.style.display = 'flex';
                inputData.style.borderColor = 'var(--danger)';
                btnSave.style.opacity = '0.5';
                btnSave.disabled = true;
            }
        };

        window.enviarTudo = async () => {
            if (produtosData.length === 0) return Swal.fire('Lista Vazia', 'Adicione pelo menos um produto.', 'warning');
            if (!inputMercado.value) return Swal.fire('Falta o Mercado', 'Informe o nome do estabelecimento.', 'warning');

            const payload = {
                estabelecimento: inputMercado.value,
                data_emissao: inputData.value,
                produtos: produtosData.map(p => ({
                    descricao: p.descricao,
                    preco: parseFloat(p.preco_unitario),
                    quantidade: p.quantidade
                }))
            };

            const originalHtml = btnSave.innerHTML;
            btnSave.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...';
            btnSave.disabled = true;

            try {
                const res = await fetch('/api/salvar-lote-nf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();

                if (json.success) {
                    Swal.fire({
                        title: 'Tudo Certo! 🎉',
                        text: json.message,
                        icon: 'success',
                        confirmButtonText: 'Ver Preços Atualizados',
                        confirmButtonColor: 'var(--primary)'
                    }).then(() => {
                        window.location.href = 'compareaqui.html';
                    });
                } else {
                    Swal.fire('Erro', json.message, 'error');
                }

            } catch (err) {
                Swal.fire('Erro', 'Falha ao conectar com o servidor.', 'error');
            } finally {
                btnSave.innerHTML = originalHtml;
                btnSave.disabled = false;
            }
        };
    
