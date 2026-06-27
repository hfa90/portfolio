
        class VibeConectaApp {
            constructor() {
                this.supermercados = [];
                this.posts = [];
                this.imagemSelecionada = null;
                this.init();
            }

            async init() {
                this.lastPostId = 0; // Inicializa contador
                this.monitoramentoInterval = null; // Guarda o timer

                this.carregarUserInfo();
                await this.carregarSupermercados();
                await this.carregarPosts(); // Note o await aqui
                this.initUpload();

                // Inicia o monitoramento inteligente
                this.iniciarMonitoramento();

                document.getElementById('filtro-supermercado').addEventListener('change', () => this.carregarPosts());
            }

            carregarUserInfo() {
                // Tenta pegar o nome da sessão via API simples ou assume padrão
                fetch('/api/usuario-info')
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) {
                            document.getElementById('user-name-display').innerText = data.usuario.nome.split(' ')[0];
                        }
                    });
            }

            async carregarSupermercados() {
                try {
                    const res = await fetch('/api/vibeconecta/supermercados');
                    const data = await res.json();
                    if (data.success) {
                        this.supermercados = data.supermercados;
                        this.popularSelects();
                    }
                } catch (e) { console.error(e); }
            }

            popularSelects() {
                const filtro = document.getElementById('filtro-supermercado');
                const modalInput = document.getElementById('post-supermercado');

                // Limpar exceto primeiro
                while (filtro.options.length > 1) filtro.remove(1);
                while (modalInput.options.length > 1) modalInput.remove(1);

                this.supermercados.forEach(m => {
                    filtro.add(new Option(m, m));
                    modalInput.add(new Option(m, m));
                });
            }

            async carregarPosts() {
                const container = document.getElementById('posts-container');
                const filtro = document.getElementById('filtro-supermercado').value;

                // Só mostra loading se for a primeira carga ou troca de filtro
                if (this.posts.length === 0) {
                    container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
                }

                try {
                    const url = filtro ? `/api/vibeconecta/posts?supermercado=${encodeURIComponent(filtro)}` : '/api/vibeconecta/posts';
                    const res = await fetch(url);
                    const data = await res.json();

                    if (data.success) {
                        this.posts = data.posts;

                        // --- ATUALIZAÇÃO: Salva o maior ID para comparação futura ---
                        if (this.posts.length > 0) {
                            const maxId = Math.max(...this.posts.map(p => p.id));
                            if (maxId > this.lastPostId) this.lastPostId = maxId;
                        }
                        // -------------------------------------------------------------

                        this.renderizarPosts();
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            iniciarMonitoramento() {
                // Verifica a cada 10 segundos
                this.monitoramentoInterval = setInterval(() => this.checarNovidades(), 10000);
            }

            async checarNovidades() {
                try {
                    // Passa o último ID que o usuário já viu
                    const res = await fetch(`/api/vibeconecta/verificar-novidades?last_id=${this.lastPostId}`);
                    const data = await res.json();

                    if (data.success && data.tem_novidade) {
                        this.exibirNotificacao(data.mensagem);

                        // Toca um som sutil (opcional)
                        this.tocarSomNotificacao();
                    }
                } catch (e) {
                    console.error("Erro no monitoramento:", e);
                }
            }

            exibirNotificacao(mensagem) {
                const toast = document.getElementById('new-post-toast');
                const msgDiv = document.getElementById('toast-message');

                msgDiv.innerHTML = mensagem;
                toast.classList.add('ativo');

                // Some automaticamente após 8 segundos se não clicar
                setTimeout(() => {
                    toast.classList.remove('ativo');
                }, 8000);
            }

            async atualizarFeed() {
                // Esconde notificação
                document.getElementById('new-post-toast').classList.remove('ativo');

                // Recarrega posts
                await this.carregarPosts();

                // Scroll suave para o topo
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            tocarSomNotificacao() {
                // Um som "pop" curto e agradável em base64 para não depender de arquivos externos
                const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU");
                // Nota: O base64 acima é vazio para exemplo. 
                // Se quiser som real, descomente a linha abaixo com um link ou base64 válido:
                // const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                // audio.volume = 0.2;
                // audio.play().catch(e => console.log("Audio bloqueado pelo navegador"));
            }

            async renderizarPosts() {
                const container = document.getElementById('posts-container');
                if (this.posts.length === 0) {
                    container.innerHTML = `
                        <div class="loading-state">
                            <i class="fas fa-wind" style="font-size: 2rem; color: #ccc; margin-bottom: 10px;"></i><br>
                            Nenhuma publicação ainda.<br>Seja o primeiro a compartilhar uma oferta!
                        </div>`;
                    return;
                }

                container.innerHTML = this.posts.map(post => {
                    // Formata o nome para pegar apenas o Primeiro e Último nome (opcional, fica mais bonito)
                    let nomeMostrado = post.nome_exibicao;
                    if (!post.anonimato && nomeMostrado.split(' ').length > 1) {
                        const partes = nomeMostrado.split(' ');
                        nomeMostrado = `${partes[0]} ${partes[partes.length - 1]}`;
                    }

                    return `
                <div class="post-card" id="post-${post.id}">
                    <div class="post-header">
                        <div class="user-avatar" onclick="app.verPerfil(${post.usuario_id})" style="cursor:pointer; background-color: ${post.anonimato ? '#333' : 'var(--primary)'}; color: white;">
                            ${post.anonimato ? '<i class="fas fa-user-secret"></i>' : (nomeMostrado[0] || 'U')}
                        </div>
                        <div class="post-info">
                            <h4 onclick="app.verPerfil(${post.usuario_id})" style="cursor:pointer; color: var(--text-main); font-weight: 700;">
                                ${post.anonimato ? 'Anônimo' : nomeMostrado}
                            </h4>
                            <span>
                                <span class="supermercado-tag" style="color:var(--primary); font-weight:600;">
                                    <i class="fas fa-map-marker-alt"></i> ${post.supermercado}
                                </span>
                                <span style="margin: 0 4px;">&bull;</span> 
                                ${this.formatarTempo(post.data_hora_criacao)}
                            </span>
                        </div>
                    </div>
                    
                    <div class="post-content">
                        ${this.escapeHtml(post.conteudo)}
                    </div>
                    
                    ${post.imagem_url ? `
                        <div style="background: #f0f2f5; text-align: center; margin-top: 10px;">
                            <img src="${post.imagem_url}" class="post-image" 
                                 onclick="app.ampliarImagem('${post.imagem_url}')"
                                 alt="Imagem do post" style="max-height: 400px; width: auto; max-width: 100%; margin: 0;">
                        </div>
                    ` : ''}
                    
                    <div class="post-stats">
                        <div class="stat-item">
                            <i class="fas fa-thumbs-up" style="color: var(--accent-blue)"></i>
                            <span id="likes-count-${post.id}">${post.total_likes || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span style="color: var(--text-sec)">${post.total_comentarios || 0} comentários</span>
                        </div>
                    </div>
                    
                    <div class="post-actions">
                        <button class="action-btn ${post.user_liked ? 'liked' : ''}" 
                                onclick="app.toggleLike(${post.id})" 
                                id="like-btn-${post.id}">
                            <i class="${post.user_liked ? 'fas' : 'far'} fa-thumbs-up"></i> 
                            <span id="like-text-${post.id}">${post.user_liked ? 'Curtiu' : 'Curtir'}</span>
                        </button>
                        <button class="action-btn" onclick="app.toggleComentarios(${post.id})">
                            <i class="far fa-comment-alt"></i> Comentar
                        </button>
                    </div>
                    
                    <div class="comments-section" id="comments-${post.id}">
                        <div class="comment-input-area">
                            <div class="user-avatar" style="width:32px; height:32px; font-size:0.8rem; background: var(--primary); color: white;">Eu</div>
                            <input type="text" class="comment-input" id="input-comment-${post.id}" 
                                   placeholder="Escreva uma resposta pública..." 
                                   onkeypress="app.handleEnter(event, ${post.id})">
                            <button class="btn-send-comment" onclick="app.enviarComentario(${post.id})">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                        <div class="comment-list" id="list-comments-${post.id}">
                            <div style="text-align:center; color:#999; font-size:0.8rem; padding: 10px;">Carregando comentários...</div>
                        </div>
                    </div>
                </div>
            `}).join('');
            }

            // --- Lógica de Comentários ---

            async toggleComentarios(postId) {
                const section = document.getElementById(`comments-${postId}`);
                const isHidden = section.style.display === 'none' || section.style.display === '';

                if (isHidden) {
                    section.style.display = 'block';
                    await this.carregarComentarios(postId);
                    // Foca no input
                    setTimeout(() => document.getElementById(`input-comment-${postId}`).focus(), 100);
                } else {
                    section.style.display = 'none';
                }
            }

            async carregarComentarios(postId) {
                const listDiv = document.getElementById(`list-comments-${postId}`);
                try {
                    const res = await fetch(`/api/vibeconecta/comentarios/${postId}`);
                    const data = await res.json();

                    if (data.success && data.comentarios.length > 0) {
                        listDiv.innerHTML = data.comentarios.map(c => `
                            <div class="comment-item">
                                <div class="user-avatar" style="width:32px; height:32px; font-size:0.8rem; background:#ddd;">
                                    ${c.usuario_nome[0]}
                                </div>
                                <div>
                                    <div class="comment-bubble">
                                        <div class="comment-author">${c.usuario_nome}</div>
                                        ${this.escapeHtml(c.conteudo)}
                                    </div>
                                    <div class="comment-time">${this.formatarTempo(c.data_hora)}</div>
                                </div>
                            </div>
                        `).join('');
                    } else {
                        listDiv.innerHTML = '<div style="padding:10px; color:#999; font-size:0.8rem;">Sem comentários ainda.</div>';
                    }
                } catch (e) {
                    listDiv.innerHTML = 'Erro ao carregar.';
                }
            }

            handleEnter(e, postId) {
                if (e.key === 'Enter') this.enviarComentario(postId);
            }

            async enviarComentario(postId) {
                const input = document.getElementById(`input-comment-${postId}`);
                const texto = input.value.trim();
                if (!texto) return;

                input.disabled = true;

                try {
                    const res = await fetch('/api/vibeconecta/comentar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ post_id: postId, conteudo: texto })
                    });
                    const data = await res.json();

                    if (data.success) {
                        input.value = '';
                        this.carregarComentarios(postId); // Recarrega lista
                    }
                } catch (e) {
                    alert('Erro ao enviar');
                } finally {
                    input.disabled = false;
                    input.focus();
                }
            }

            // --- Lógica de Likes ---

            async toggleLike(postId) {
                const btn = document.getElementById(`like-btn-${postId}`);
                const likeText = document.getElementById(`like-text-${postId}`);
                const likesCount = document.getElementById(`likes-count-${postId}`);
                const icon = btn.querySelector('i');

                const post = this.posts.find(p => p.id === postId);
                if (!post) return;

                const method = post.user_liked ? 'DELETE' : 'POST';

                try {
                    const res = await fetch(`/api/vibeconecta/likes/${postId}`, { method });
                    const data = await res.json();

                    if (data.success) {
                        // Atualiza estado local
                        post.user_liked = !post.user_liked;
                        post.total_likes = data.total_likes;

                        // Atualiza UI
                        if (post.user_liked) {
                            btn.classList.add('liked');
                            icon.className = 'fas fa-thumbs-up';
                            likeText.textContent = 'Curtiu';
                        } else {
                            btn.classList.remove('liked');
                            icon.className = 'far fa-thumbs-up';
                            likeText.textContent = 'Curtir';
                        }

                        likesCount.textContent = data.total_likes;
                    }
                } catch (e) {
                    console.error('Erro ao curtir:', e);
                }
            }

            // --- Lógica de Criação de Post ---

            abrirModal() {
                document.getElementById('modal-criar').style.display = 'flex';
            }
            fecharModal() {
                document.getElementById('modal-criar').style.display = 'none';
            }

            addEmoji(emoji) {
                const txt = document.getElementById('post-conteudo');
                txt.value += emoji;
            }// === MÉTODOS PARA UPLOAD DE IMAGEM ===

            initUpload() {
                const fileInput = document.getElementById('post-imagem');
                const uploadArea = document.getElementById('image-upload-area');

                // Drag and drop
                uploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploadArea.classList.add('dragover');
                });

                uploadArea.addEventListener('dragleave', () => {
                    uploadArea.classList.remove('dragover');
                });

                uploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploadArea.classList.remove('dragover');
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        this.processarImagem(files[0]);
                    }
                });

                // File input change
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        this.processarImagem(e.target.files[0]);
                    }
                });
            }

            processarImagem(file) {
                // Validar tipo de arquivo
                const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                if (!tiposPermitidos.includes(file.type)) {
                    alert('Por favor, selecione uma imagem (JPG, PNG, GIF ou WebP)');
                    return;
                }

                // Validar tamanho (5MB)
                if (file.size > 5 * 1024 * 1024) {
                    alert('A imagem deve ter no máximo 5MB');
                    return;
                }

                this.imagemSelecionada = file;

                // Mostrar preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    const preview = document.getElementById('image-preview');
                    const previewImage = document.getElementById('preview-image');

                    previewImage.src = e.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }

            removerImagem() {
                this.imagemSelecionada = null;
                document.getElementById('post-imagem').value = '';
                document.getElementById('image-preview').style.display = 'none';
            }

            // Método publicar atualizado para suportar upload de imagem
            async publicar() {
                const btn = document.getElementById('btn-publicar');
                const form = document.getElementById('post-form');
                const formData = new FormData(form);

                // Adicionar anonimato como string
                formData.set('anonimato', document.getElementById('post-anonimo').checked.toString());

                console.log('Dados do formulário:', Object.fromEntries(formData));

                // Validações
                const mercado = formData.get('supermercado');
                const conteudo = formData.get('conteudo');

                if (!mercado || mercado === "Onde você está?") {
                    alert('Selecione um supermercado!');
                    return;
                }

                if (!conteudo.trim()) {
                    alert('Escreva algo para publicar!');
                    return;
                }

                btn.innerText = 'Publicando...';
                btn.disabled = true;

                try {
                    const res = await fetch('/api/vibeconecta/posts', {
                        method: 'POST',
                        body: formData
                        // Note: Não definir Content-Type - o browser faz automaticamente para FormData
                    });

                    console.log('Resposta recebida:', res);

                    const data = await res.json();
                    console.log('Dados da resposta:', data);

                    if (data.success) {
                        this.fecharModal();
                        this.limparFormulario();
                        this.carregarPosts();
                        alert('Post publicado com sucesso!');
                    } else {
                        alert('Erro: ' + (data.message || 'Erro desconhecido'));
                    }
                } catch (e) {
                    console.error('Erro completo:', e);
                    alert('Erro de conexão: ' + e.message);
                } finally {
                    btn.innerText = 'Publicar';
                    btn.disabled = false;
                }
            }

            limparFormulario() {
                document.getElementById('post-form').reset();
                this.removerImagem();
            }

            // Método para exibir imagem ampliada
            ampliarImagem(url) {
                document.getElementById('modal-image').src = url;
                document.getElementById('image-modal').style.display = 'flex';
            }

            fecharModalImagem() {
                document.getElementById('image-modal').style.display = 'none';
            }




            // --- Navegação ---

            verPerfil(usuarioId) {
                if (usuarioId && !this.posts.find(p => p.id === usuarioId)?.anonimato) {
                    window.location.href = `perfil.html?id=${encodeURIComponent(usuarioId)}`;
                }
            }

            verMeusPosts() {
                window.location.href = 'meuperfil.html';
            }

            // --- Utilitários ---

            formatarTempo(dataString) {
                if (!dataString) return '';
                const data = new Date(dataString.replace(' ', 'T'));
                const agora = new Date();
                const diffMs = agora - data;
                const diffMin = Math.floor(diffMs / 60000);

                if (diffMin < 1) return 'Agora mesmo';
                if (diffMin < 60) return `${diffMin} min`;
                const diffHoras = Math.floor(diffMin / 60);
                if (diffHoras < 24) return `${diffHoras} h`;
                return `${Math.floor(diffHoras / 24)} d`;
            }

            escapeHtml(text) {
                const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
                return text.replace(/[&<>"']/g, function (m) { return map[m]; });
            }


        }

        // === CORREÇÃO: Instanciar a classe APÓS a definição ===
        const app = new VibeConectaApp();

        // Fechar modais ao clicar fora
        window.onclick = function (event) {
            const modal = document.getElementById('modal-criar');
            const imageModal = document.getElementById('image-modal');

            if (event.target == modal) {
                app.fecharModal();
            }
            if (event.target == imageModal) {
                app.fecharModalImagem();
            }
        }
    
