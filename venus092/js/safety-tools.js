(function () {
  const reasons = [
    ['golpe', 'Golpe ou fraude'],
    ['violencia', 'Violencia ou ameaca'],
    ['sem_consentimento', 'Sem consentimento'],
    ['ofensa', 'Ofensa ou baixo calao'],
    ['assedio', 'Assedio'],
    ['spam', 'Spam'],
    ['outro', 'Outro']
  ];

  function ensureStyles() {
    if (document.getElementById('venusSafetyStyles')) return;
    const style = document.createElement('style');
    style.id = 'venusSafetyStyles';
    style.textContent = `
      .venus-modal-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(4,4,7,.72);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:18px}
      .venus-modal{width:min(520px,100%);max-height:calc(100vh - 36px);overflow:auto;background:linear-gradient(180deg,#1d1b25,#121216);border:1px solid rgba(201,168,76,.28);border-radius:14px;box-shadow:0 28px 80px rgba(0,0,0,.62);color:#f4efe7}
      .venus-modal-head{display:flex;align-items:flex-start;gap:12px;padding:20px 22px 12px}
      .venus-modal-icon{width:42px;height:42px;border-radius:12px;background:rgba(201,168,76,.14);color:#c9a84c;display:flex;align-items:center;justify-content:center;font-size:1.35rem;flex:0 0 auto}
      .venus-modal-title{font-size:1.08rem;font-weight:800;margin:0 0 4px}
      .venus-modal-sub{margin:0;color:#a9a2ad;font-size:.88rem;line-height:1.45}
      .venus-modal-body{padding:8px 22px 4px}
      .venus-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}
      .venus-field label{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:#c9a84c;font-weight:800}
      .venus-field select,.venus-field textarea{width:100%;border:1px solid rgba(255,255,255,.12);background:#121217;color:#f4efe7;border-radius:10px;padding:11px 12px;font:inherit;outline:none}
      .venus-field textarea{resize:vertical;min-height:116px;line-height:1.45}
      .venus-field select:focus,.venus-field textarea:focus{border-color:#c9a84c;box-shadow:0 0 0 3px rgba(201,168,76,.12)}
      .venus-check{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid rgba(248,113,113,.28);background:rgba(248,113,113,.08);border-radius:10px;color:#f0d0d0;font-size:.88rem;line-height:1.4}
      .venus-check input{margin-top:2px;accent-color:#f87171}
      .venus-error{display:none;margin:0 0 12px;color:#ff9c9c;font-size:.84rem}
      .venus-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px 22px}
      .venus-btn{border:1px solid rgba(255,255,255,.14);background:#24242b;color:#f4efe7;border-radius:10px;padding:10px 16px;font-weight:800;cursor:pointer}
      .venus-btn:hover{border-color:rgba(255,255,255,.26)}
      .venus-btn-primary{background:#c9a84c;color:#111;border-color:#c9a84c}
      .venus-btn-danger{background:#f87171;color:#190b0b;border-color:#f87171}
      .venus-note{padding:0 22px 8px;color:#bbb4bd;font-size:.9rem;line-height:1.55}
      @media(max-width:560px){.venus-modal-actions{flex-direction:column-reverse}.venus-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function closeModal(backdrop, value, resolve) {
    backdrop.remove();
    resolve(value);
  }

  function notice(message, title = 'Tudo certo', type = 'ok') {
    ensureStyles();
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'venus-modal-backdrop';
      backdrop.innerHTML = `
        <div class="venus-modal" role="dialog" aria-modal="true">
          <div class="venus-modal-head">
            <div class="venus-modal-icon"><i class="ti ${type === 'error' ? 'ti-alert-triangle' : 'ti-check'}"></i></div>
            <div>
              <h2 class="venus-modal-title">${escapeHtml(title)}</h2>
              <p class="venus-modal-sub">${escapeHtml(message)}</p>
            </div>
          </div>
          <div class="venus-modal-actions">
            <button class="venus-btn venus-btn-primary" data-ok>OK</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-ok]').focus();
      backdrop.querySelector('[data-ok]').onclick = () => closeModal(backdrop, true, resolve);
      backdrop.onclick = e => { if (e.target === backdrop) closeModal(backdrop, true, resolve); };
    });
  }

  function confirmAction(message, title = 'Confirmar', confirmText = 'Confirmar') {
    ensureStyles();
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'venus-modal-backdrop';
      backdrop.innerHTML = `
        <div class="venus-modal" role="dialog" aria-modal="true">
          <div class="venus-modal-head">
            <div class="venus-modal-icon"><i class="ti ti-alert-circle"></i></div>
            <div>
              <h2 class="venus-modal-title">${escapeHtml(title)}</h2>
              <p class="venus-modal-sub">${escapeHtml(message)}</p>
            </div>
          </div>
          <div class="venus-modal-actions">
            <button class="venus-btn" data-cancel>Cancelar</button>
            <button class="venus-btn venus-btn-danger" data-ok>${escapeHtml(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-cancel]').onclick = () => closeModal(backdrop, false, resolve);
      backdrop.querySelector('[data-ok]').onclick = () => closeModal(backdrop, true, resolve);
      backdrop.onclick = e => { if (e.target === backdrop) closeModal(backdrop, false, resolve); };
    });
  }

  function openReport(options = {}) {
    ensureStyles();
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'venus-modal-backdrop';
      const reasonOptions = reasons.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
      backdrop.innerHTML = `
        <div class="venus-modal" role="dialog" aria-modal="true">
          <div class="venus-modal-head">
            <div class="venus-modal-icon"><i class="ti ti-shield-exclamation"></i></div>
            <div>
              <h2 class="venus-modal-title">${escapeHtml(options.title || 'Denunciar ou bloquear')}</h2>
              <p class="venus-modal-sub">${escapeHtml(options.subtitle || 'Conte o que aconteceu. Sua denuncia ajuda a manter a comunidade mais segura.')}</p>
            </div>
          </div>
          <div class="venus-modal-body">
            <p class="venus-error" data-error></p>
            <div class="venus-field">
              <label>Motivo</label>
              <select data-reason>${reasonOptions}</select>
            </div>
            <div class="venus-field">
              <label>Detalhes</label>
              <textarea data-details maxlength="2000" placeholder="Descreva o ocorrido com objetividade. Se houver risco imediato, procure ajuda local antes de continuar."></textarea>
            </div>
            <label class="venus-check">
              <input type="checkbox" data-block checked>
              <span>Bloquear esta pessoa. O chat sera bloqueado e o perfil deixara de aparecer no catalogo para voce.</span>
            </label>
          </div>
          <div class="venus-modal-actions">
            <button class="venus-btn" data-cancel>Cancelar</button>
            <button class="venus-btn venus-btn-danger" data-ok>Enviar denuncia</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      const error = backdrop.querySelector('[data-error]');
      const details = backdrop.querySelector('[data-details]');
      details.focus();
      backdrop.querySelector('[data-cancel]').onclick = () => closeModal(backdrop, null, resolve);
      backdrop.querySelector('[data-ok]').onclick = () => {
        const text = details.value.trim();
        if (text.length < 10) {
          error.textContent = 'Escreva pelo menos 10 caracteres para a equipe entender o ocorrido.';
          error.style.display = 'block';
          details.focus();
          return;
        }
        closeModal(backdrop, {
          reason: backdrop.querySelector('[data-reason]').value,
          details: text,
          blockUser: backdrop.querySelector('[data-block]').checked
        }, resolve);
      };
      backdrop.onclick = e => { if (e.target === backdrop) closeModal(backdrop, null, resolve); };
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.VenusSafety = { notice, confirmAction, openReport, escapeHtml };
})();
