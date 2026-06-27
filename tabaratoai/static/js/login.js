
                // MÁSCARA DE TELEFONE
                const maskPhone = (e) => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val.length > 11) val = val.slice(0, 11);
                    if (val.length > 2) val = `(${val.slice(0, 2)}) ${val.slice(2)}`;
                    if (val.length > 9) val = `${val.slice(0, 10)}-${val.slice(10)}`;
                    e.target.value = val;

                };

                // Gera ou recupera Device ID
                function getOrCreateDeviceId() {
                    let deviceId = localStorage.getItem('tbl_device_id');
                    if (!deviceId) {
                        deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                            const r = Math.random() * 16 | 0;
                            const v = c == 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });
                        localStorage.setItem('tbl_device_id', deviceId);
                    }
                    return deviceId;
                }

                document.getElementById('telefone').addEventListener('input', maskPhone);
                document.getElementById('telefone-recuperacao').addEventListener('input', maskPhone);


                // LOGIN
                // Login com Device ID
                // === SUBSTITUA ESTE EVENTO EXISTENTE ===
                document.getElementById('login-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const btn = document.getElementById('btn-login');
                    const originalText = btn.innerHTML;

                    // UI Loading
                    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Entrando...';
                    btn.disabled = true;

                    const telefone = document.getElementById('telefone').value.replace(/\D/g, '');
                    const senha = document.getElementById('senha').value;
                    // === NOVO: Pega device_id ===
                    const deviceId = getOrCreateDeviceId();

                    try {
                        const res = await fetch('/api/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ telefone, senha, device_id: deviceId }) // NOVO: device_id
                        });
                        const data = await res.json();

                        if (data.success) {
                            showToast('Login realizado com sucesso!', 'success');
                            setTimeout(() => window.location.href = data.redirect_url, 1000);
                        } else {
                            showToast(data.message, 'error');
                            btn.innerHTML = originalText;
                            btn.disabled = false;
                        }
                    } catch (err) {
                        showToast('Erro de conexão com o servidor.', 'error');
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                });

                // MODAL RECUPERAÇÃO
                function abrirModalRecuperacao() {
                    // Copia o telefone do form principal se tiver algo
                    const telPrincipal = document.getElementById('telefone').value;
                    if (telPrincipal) document.getElementById('telefone-recuperacao').value = telPrincipal;

                    document.getElementById('modal-recuperacao').classList.add('active');
                }

                function fecharModalRecuperacao() {
                    document.getElementById('modal-recuperacao').classList.remove('active');
                }

                // Login com Telegram

                // Login com Telegram
                // Login com Telegram - Botão personalizado
                document.getElementById('telegram-login-btn').addEventListener('click', function () {
                    iniciarLoginTelegram();
                });

                function iniciarLoginTelegram() {
                    const telegramWindow = window.open('', 'Telegram Login', 'width=600,height=700,scrollbars=yes');

                    const telegramHTML = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Login com Telegram | Tá Barato Lá?</title>
                    <style>
                        body { 
                            font-family: 'Inter', sans-serif; 
                            margin: 0; 
                            padding: 2rem; 
                            background: #f8fafc;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                        }
                        .container { 
                            background: white; 
                            padding: 2rem; 
                            border-radius: 20px; 
                            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                            text-align: center;
                            max-width: 400px;
                        }
                        .telegram-icon {
                            width: 80px;
                            height: 80px;
                            background: #229ED9;
                            color: white;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 2.5rem;
                            margin: 0 auto 1.5rem;
                        }
                        h2 { color: #1e293b; margin-bottom: 1rem; }
                        p { color: #64748b; margin-bottom: 2rem; line-height: 1.5; }
                        .qr-code {
                            background: #f1f5f9;
                            padding: 1.5rem;
                            border-radius: 12px;
                            margin: 1.5rem 0;
                            font-family: monospace;
                            font-size: 0.9rem;
                            color: #334155;
                        }
                        .btn {
                            background: #229ED9;
                            color: white;
                            border: none;
                            padding: 1rem 2rem;
                            border-radius: 12px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s;
                            margin: 0.5rem;
                        }
                        .btn:hover { background: #1e8cc4; transform: translateY(-2px); }
                        .btn-secondary {
                            background: transparent;
                            color: #64748b;
                            border: 1px solid #e2e8f0;
                        }
                        .btn-secondary:hover { background: #f8fafc; transform: none; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="telegram-icon">
                            <i class="fab fa-telegram-plane"></i>
                        </div>
                        <h2>Entrar com Telegram</h2>
                        <p>Para entrar com Telegram, você precisa iniciar uma conversa com nosso bot e enviar o comando <strong>/start</strong>.</p>
                        
                        <div class="qr-code">
                            📱 Abra o Telegram<br>
                            → Procure por <strong>@tabaratoai_bot</strong><br>
                            → Envie o comando <strong>/start</strong><br>
                            → Volte aqui e clique em "Já enviei /start"<br><br>
                        </div>

                        <button class="btn" onclick="abrirTelegram()">
                            <i class="fab fa-telegram-plane"></i> Abrir Telegram
                        </button>

                        <button class="btn" onclick="loginSucesso()" style="background: var(--primary);">
                            <i class="fas fa-check"></i> Já enviei /start
                        </button>
                        
                        <div style="margin-top: 1rem;">
                            <button class="btn btn-secondary" onclick="window.close()">Cancelar</button>
                        </div>
                    </div>

                    <script>
                        function abrirTelegram() {
                            window.open('https://t.me/tabaratoai_bot', '_blank');
                        }

                        function loginSucesso() {
                            // Simula um usuário do Telegram (em produção, você teria uma integração real)
                            const user = {
                                id: Math.random().toString(36).substr(2, 9),
                                first_name: 'Usuário',
                                username: 'usuario_telegram'
                            };
                            
                            window.opener.postMessage({
                                type: 'TELEGRAM_LOGIN_SUCCESS',
                                user: user
                            }, '*');
                            window.close();
                        }

                        window.addEventListener('message', function(event) {
                            if (event.data.type === 'TELEGRAM_LOGIN_COMPLETE') {
                                window.close();
                            }
                        });
                    <\/script>
                </body>
                </html>
            `;

                    telegramWindow.document.write(telegramHTML);
                    telegramWindow.document.close();
                }

                // Ouvir mensagem de sucesso do login com Telegram
                window.addEventListener('message', function (event) {
                    if (event.data.type === 'TELEGRAM_LOGIN_SUCCESS') {
                        const user = event.data.user;
                        processarLoginTelegram(user);
                    }
                });

                async function processarLoginTelegram(user) {
                    const btn = document.getElementById('telegram-login-btn');
                    const originalHTML = btn.innerHTML;

                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
                    btn.disabled = true;

                    try {
                        const deviceId = getOrCreateDeviceId();

                        const res = await fetch('/api/telegram-login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                telegram_user: user,
                                device_id: deviceId
                            })
                        });

                        const data = await res.json();

                        if (data.success) {
                            showToast('Login com Telegram realizado com sucesso!', 'success');
                            setTimeout(() => {
                                window.location.href = data.redirect_url;
                            }, 1000);
                        } else {
                            showToast(data.message || 'Erro no login com Telegram', 'error');
                            btn.innerHTML = originalHTML;
                            btn.disabled = false;
                        }
                    } catch (err) {
                        showToast('Erro de conexão com o servidor.', 'error');
                        btn.innerHTML = originalHTML;
                        btn.disabled = false;
                    }
                }

                // Recuperação de senha com verificação de dispositivo
                // === SUBSTITUA ESTA FUNÇÃO EXISTENTE ===
                async function enviarSenhaTelegram(btn) {
                    const telInput = document.getElementById('telefone-recuperacao');
                    const telefone = telInput.value.replace(/\D/g, '');
                    // === NOVO: Pega device_id ===
                    const deviceId = localStorage.getItem('tbl_device_id');

                    if (telefone.length < 11) {
                        showToast('Digite um telefone válido.', 'error');
                        return;
                    }

                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
                    btn.disabled = true;

                    try {
                        const res = await fetch('/api/gerar-senha', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ telefone, device_id: deviceId }) // NOVO: device_id
                        });
                        const data = await res.json();

                        if (data.success) {
                            if (data.requires_telegram) {
                                showToast('Dispositivo não reconhecido. Senha enviada para o Telegram!', 'warning');
                            } else {
                                showToast('Senha redefinida com sucesso!', 'success');
                            }
                            fecharModalRecuperacao();
                            document.getElementById('telefone').value = telInput.value;
                            document.getElementById('senha').focus();
                            document.getElementById('senha').placeholder = "Digite a nova senha";
                        } else {
                            showToast(data.message, 'error');
                        }
                    } catch (e) {
                        showToast('Erro ao tentar recuperar.', 'error');
                    } finally {
                        btn.innerHTML = 'Enviar Código';
                        btn.disabled = false;
                    }
                }


                function showToast(msg, type) {
                    const t = document.getElementById('toast');
                    const i = document.getElementById('toast-icon');
                    const m = document.getElementById('toast-msg');

                    m.textContent = msg;
                    t.className = `toast active ${type === 'error' ? 'error' : ''}`;
                    i.className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';

                    setTimeout(() => t.classList.remove('active'), 3500);
                }

                // ACESSO ADMINISTRATIVO
                function abrirModalAdmin() {
                    document.getElementById('admin-modal').classList.add('active');
                    document.getElementById('senha-admin').focus();
                }

                function fecharModalAdmin() {
                    document.getElementById('admin-modal').classList.remove('active');
                    document.getElementById('senha-admin').value = '';
                }

                // Fechar modal com ESC
                document.addEventListener('keydown', function (e) {
                    if (e.key === 'Escape') {
                        fecharModalAdmin();
                    }
                });

                // Fechar modal ao clicar fora
                document.getElementById('admin-modal').addEventListener('click', function (e) {
                    if (e.target === this) {
                        fecharModalAdmin();
                    }
                });

                // ===== AQUI ESTAVA O ERRO: A FUNÇÃO ESTAVA FORA DA TAG SCRIPT =====
                async function verificarSenhaAdmin(btn) {
                    const senhaInput = document.getElementById('senha-admin');
                    const senha = senhaInput.value;
                    const originalText = btn.innerHTML;

                    if (!senha) {
                        alert("Por favor, digite a senha.");
                        return;
                    }

                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
                    btn.disabled = true;

                    // Simulação de verificação (A senha real é validada no backend ao carregar a página)
                    // A senha solicitada é 201990
                    if (senha === "201990") {
                        setTimeout(() => {
                            // Redireciona passando o token na URL
                            window.location.href = `/administrativo?admin_token=${senha}`;
                        }, 800);
                    } else {
                        setTimeout(() => {
                            alert("Senha incorreta!");
                            btn.innerHTML = originalText;
                            btn.disabled = false;
                            senhaInput.value = '';
                            senhaInput.focus();
                        }, 500);
                    }
                }

                // ===== LOGIN COM TELEGRAM =====
                document.getElementById('telegram-login-btn').addEventListener('click', function () {
                    iniciarLoginTelegram();
                });

                function iniciarLoginTelegram() {
                    const btn = document.getElementById('telegram-login-btn');
                    const originalHTML = btn.innerHTML;

                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando...';
                    btn.disabled = true;

                    // Simulação de login com Telegram
                    // Em produção, você integraria com a API real do Telegram
                    setTimeout(() => {
                        processarLoginTelegram({
                            id: Math.random().toString(36).substr(2, 9),
                            first_name: 'Usuário',
                            username: 'usuario_telegram',
                            auth_date: Math.floor(Date.now() / 1000),
                            hash: 'simulacao_hash_' + Math.random().toString(36).substr(2, 16)
                        });
                    }, 1500);
                }

                async function processarLoginTelegram(user) {
                    const btn = document.getElementById('telegram-login-btn');
                    const originalHTML = btn.innerHTML;

                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
                    btn.disabled = true;

                    try {
                        const deviceId = getOrCreateDeviceId();

                        const res = await fetch('/api/telegram-login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                telegram_user: user,
                                device_id: deviceId
                            })
                        });

                        const data = await res.json();

                        if (data.success) {
                            showToast('Login com Telegram realizado com sucesso!', 'success');
                            setTimeout(() => {
                                window.location.href = data.redirect_url;
                            }, 1000);
                        } else {
                            showToast(data.message || 'Erro no login com Telegram', 'error');
                            btn.innerHTML = originalHTML;
                            btn.disabled = false;
                        }
                    } catch (err) {
                        showToast('Erro de conexão com o servidor.', 'error');
                        btn.innerHTML = originalHTML;
                        btn.disabled = false;
                    }
                }

            
