
        async function carregarDispositivos() {
            try {
                const res = await fetch('/api/meus-dispositivos');
                const data = await res.json();

                if (data.success) {
                    const currentDevice = localStorage.getItem('tbl_device_id');
                    const container = document.getElementById('devices-list');

                    if (data.devices.length === 0) {
                        container.innerHTML = '<p>Nenhum dispositivo autorizado.</p>';
                        return;
                    }

                    container.innerHTML = data.devices.map(deviceId => `
                        <div class="device-card">
                            <div class="device-info">
                                <div class="device-name">Dispositivo ${deviceId.substring(0, 8)}...</div>
                                <div class="device-id">ID: ${deviceId}</div>
                            </div>
                            ${deviceId === currentDevice ? '<span class="current-badge">Atual</span>' : ''}
                            ${deviceId !== currentDevice ?
                            `<button class="remove-btn" onclick="removerDispositivo('${deviceId}')">
                                    <i class="fas fa-trash"></i> Remover
                                </button>` : ''
                        }
                        </div>
                    `).join('');
                }
            } catch (error) {
                console.error('Erro ao carregar dispositivos:', error);
            }
        }

        async function removerDispositivo(deviceId) {
            if (!confirm('Tem certeza que deseja remover este dispositivo?')) return;

            try {
                const res = await fetch('/api/remover-dispositivo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_id: deviceId })
                });

                const data = await res.json();
                if (data.success) {
                    carregarDispositivos();
                }
            } catch (error) {
                console.error('Erro ao remover dispositivo:', error);
            }
        }

        // Carrega dispositivos ao abrir a página
        carregarDispositivos();
    
