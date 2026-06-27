
        // Máscara
        const maskPhone = (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 11) val = val.slice(0, 11);
            if (val.length > 2) val = `(${val.slice(0, 2)}) ${val.slice(2)}`;
            if (val.length > 9) val = `${val.slice(0, 10)}-${val.slice(10)}`;
            e.target.value = val;
        };

        // === INÍCIO NOVO CÓDIGO DEVICE ID ===
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
        // === FIM NOVO CÓDIGO DEVICE ID ===

        // Lógica de Cadastro
        document.getElementById('telefone').addEventListener('input', maskPhone);

        // Lógica de Cadastro
        // Cadastro com Device ID
        // === SUBSTITUA ESTE EVENTO EXISTENTE ===
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-submit');

            // Validações simples
            const senha = document.getElementById('senha').value;
            const conf = document.getElementById('conf-senha').value;
            const telefone = document.getElementById('telefone').value.replace(/\D/g, '');

            if (senha !== conf) return showToast('As senhas não coincidem.', 'error');
            if (senha.length < 6) return showToast('A senha deve ter no mínimo 6 caracteres.', 'error');
            if (telefone.length < 11) return showToast('Telefone inválido.', 'error');

            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando conta...';
            btn.disabled = true;

            // === NOVO: Pega device_id ===
            const deviceId = getOrCreateDeviceId();

            const dados = {
                nome: document.getElementById('nome').value,
                telefone: telefone,
                email: document.getElementById('email').value,
                endereco: document.getElementById('endereco').value,
                senha: senha,
                device_id: deviceId  // NOVO
            };

            try {
                // 1. Cadastrar Usuário
                const res = await fetch('/api/cadastrar-usuario', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });
                const data = await res.json();

                if (data.success) {
                    showToast('Conta criada com sucesso!', 'success');
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 2000);
                } else {
                    showToast(data.message, 'error');
                    btn.innerHTML = 'Criar Conta e Receber Código';
                    btn.disabled = false;
                }
            } catch (err) {
                showToast('Erro de conexão.', 'error');
                btn.innerHTML = 'Criar Conta e Receber Código';
                btn.disabled = false;
            }
        });

        function showToast(msg, type) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = `toast active ${type === 'error' ? 'error' : ''}`;
            setTimeout(() => t.classList.remove('active'), 4000);
        }
    
