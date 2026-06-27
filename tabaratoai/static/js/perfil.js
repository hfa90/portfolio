
        class PerfilUsuarioApp {
            constructor() {
                this.usuarioId = this.obterUsuarioIdDaURL();
                this.init();
            }

            obterUsuarioIdDaURL() {
                const path = window.location.pathname;
                const queryId = new URLSearchParams(window.location.search).get('id');
                if (queryId) return parseInt(queryId);
                const match = path.match(/\/perfil\/(\d+)/);
                return match ? parseInt(match[1]) : null;
            }

            async init() {
                if (!this.usuarioId) {
                    alert('Usuário não encontrado');
                    window.location.href = 'vibeconecta.html';
                    return;
                }
                await this.carregarPerfil();
            }

            async carregarPerfil() {
                try {
                    const res = await fetch(`/api/vibeconecta/perfil/${this.usuarioId}`);
                    const data = await res.json();

                    if (data.success) {
                        const perfil = data.perfil;
                        const estatisticas = data.estatisticas;

                        document.getElementById('user-name').textContent = perfil.nome;
                        document.getElementById('user-avatar').textContent = perfil.nome[0];
                        document.getElementById('user-contact').textContent =
                            perfil.email || perfil.telefone || 'Usuário do Tá Barato Lá';

                        document.getElementById('stat-posts').textContent = estatisticas.total_posts;
                        document.getElementById('stat-likes').textContent = estatisticas.total_likes_recebidos;
                        document.getElementById('stat-comments').textContent = estatisticas.total_comentarios;

                        this.renderizarPostsPopulares(data.posts_populares);
                    } else {
                        alert('Perfil não encontrado');
                        window.location.href = 'vibeconecta.html';
                    }
                } catch (e) {
                    console.error('Erro ao carregar perfil:', e);
                    document.getElementById('posts-container').innerHTML =
                        '<div class="loading">Erro ao carregar perfil.</div>';
                }
            }

            renderizarPostsPopulares(posts) {
                const container = document.getElementById('posts-container');

                if (posts && posts.length > 0) {
                    container.innerHTML = posts.map(post => `
                        <div class="post-item">
                            <div class="post-header">
                                <span class="post-supermercado">
                                    <i class="fas fa-map-marker-alt"></i> ${post.supermercado}
                                </span>
                                <span style="color: #666; font-size: 0.8rem;">
                                    ${this.formatarTempo(post.data_hora_criacao)}
                                </span>
                            </div>
                            <div class="post-content">${this.escapeHtml(post.conteudo)}</div>
                            <div class="post-stats">
                                <span><i class="fas fa-thumbs-up"></i> ${post.likes_count || 0}</span>
                                <span style="color: gold;"><i class="fas fa-star"></i> Popular</span>
                            </div>
                        </div>
                    `).join('');
                } else {
                    container.innerHTML = '<div class="loading">Este usuário ainda não tem publicações populares.</div>';
                }
            }

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

        // Inicializa o app quando a página carregar
        document.addEventListener('DOMContentLoaded', () => {
            new PerfilUsuarioApp();
        });
    
