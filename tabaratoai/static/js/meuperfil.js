
        class ProfileApp {
            constructor() {
                this.userId = this.getUserIdFromUrl();
                this.init();
            }

            getUserIdFromUrl() {
                const queryId = new URLSearchParams(window.location.search).get('id');
                if (queryId) return parseInt(queryId);
                const parts = window.location.pathname.split('/');
                const last = parts[parts.length - 1];
                return (!isNaN(last) && last !== '') ? last : null;
            }

            async init() {
                await this.loadProfileData();
                this.loadUserPosts();
            }

            async loadProfileData() {
                try {
                    // Monta URL: Se tiver ID, usa query param. Se não, backend pega da sessão.
                    let url = '/api/perfil/dados';
                    if (this.userId) url += `?id=${this.userId}`;

                    const res = await fetch(url);
                    const data = await res.json();

                    if (data.success) {
                        const u = data.usuario;
                        const s = data.stats;

                        // Popula Header
                        document.getElementById('user-name').innerText = u.nome;
                        document.getElementById('user-bio').innerText = u.bio;
                        document.getElementById('avatar-display').innerText = u.nome.charAt(0).toUpperCase();

                        if (u.endereco) {
                            document.getElementById('meta-location').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${u.endereco}`;
                        }

                        // Popula Stats
                        document.getElementById('stat-posts').innerText = s.posts;
                        document.getElementById('stat-likes').innerText = s.likes;

                        // Configurações de Edição (Se for eu)
                        if (u.is_me) {
                            document.getElementById('my-actions').style.display = 'flex';
                            document.getElementById('tab-config').style.display = 'block';

                            // Preenche form
                            document.getElementById('edit-nome').value = u.nome;
                            document.getElementById('edit-bio').value = u.bio;
                            document.getElementById('edit-email').value = u.email || '';
                            document.getElementById('edit-endereco').value = u.endereco || '';

                            // Salva ID real para uso nos posts
                            this.currentUserId = u.id;
                        }
                    } else {
                        alert('Usuário não encontrado');
                        window.location.href = 'vibeconecta.html';
                    }
                } catch (e) {
                    console.error("Erro perfil:", e);
                }
            }

            async loadUserPosts() {
                const container = document.getElementById('posts-list');
                try {
                    let url = '/api/vibeconecta/posts';
                    // Precisamos do ID. Se a URL não tem, a chamada anterior definiu this.currentUserId
                    const idToFetch = this.userId || this.currentUserId;

                    if (idToFetch) url += `?user_id=${idToFetch}`;

                    const res = await fetch(url);
                    const data = await res.json();

                    if (data.success && data.posts.length > 0) {
                        container.innerHTML = data.posts.map(p => `
                            <div class="post-card">
                                <div class="post-header">
                                    <span class="post-market"><i class="fas fa-shopping-cart"></i> ${p.supermercado}</span>
                                    <span class="post-date">${this.formatDate(p.data_hora_criacao)}</span>
                                </div>
                                <div class="post-body">${this.escapeHtml(p.conteudo)}</div>
                                <div class="post-footer">
                                    <span><i class="fas fa-thumbs-up"></i> ${p.total_likes}</span>
                                    <span><i class="fas fa-comment"></i> ${p.total_comentarios}</span>
                                </div>
                            </div>
                        `).join('');
                    } else {
                        container.innerHTML = '<div class="loading">Nenhuma publicação encontrada recentemente.</div>';
                    }
                } catch (e) {
                    container.innerHTML = '<div class="loading">Erro ao carregar posts.</div>';
                }
            }

            async salvarPerfil(e) {
                e.preventDefault();
                const btn = e.target.querySelector('button');
                const originalText = btn.innerText;
                btn.innerText = 'Salvando...';
                btn.disabled = true;

                const payload = {
                    nome: document.getElementById('edit-nome').value,
                    bio: document.getElementById('edit-bio').value,
                    endereco: document.getElementById('edit-endereco').value,
                    email: document.getElementById('edit-email').value,
                    nova_senha: document.getElementById('edit-senha').value
                };

                try {
                    const res = await fetch('/api/perfil/dados', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();

                    if (data.success) {
                        alert('Perfil atualizado com sucesso!');
                        // Atualiza interface sem recarregar
                        document.getElementById('user-name').innerText = payload.nome;
                        document.getElementById('user-bio').innerText = payload.bio;
                        this.switchTab('posts', document.querySelector('.tab')); // Volta pra aba posts
                    } else {
                        alert('Erro: ' + data.message);
                    }
                } catch (e) {
                    alert('Erro de conexão');
                } finally {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            }

            // UI Utilities
            switchTab(tabName, element) {
                // Remove active class
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.section-content').forEach(c => c.classList.remove('active'));

                // Add active
                element.classList.add('active');
                if (tabName === 'posts') document.getElementById('posts-content').classList.add('active');
                if (tabName === 'config') document.getElementById('config-content').classList.add('active');
            }

            toggleEditMode() {
                // Atalho para ir direto para a aba de config
                const configTab = document.getElementById('tab-config');
                this.switchTab('config', configTab);
            }

            formatDate(dateString) {
                if (!dateString) return '';
                const date = new Date(dateString.replace(' ', 'T'));
                return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            }

            escapeHtml(text) {
                return text.replace(/[&<>"']/g, function (m) {
                    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
                });
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            window.app = new ProfileApp();
        });
    
