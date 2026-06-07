(function () {
  const SUPABASE_URL = 'https://wykmukfohehtpoezojwg.supabase.co';
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/telegram-code`;

  function toast(message, type = 'info') {
    if (typeof window.toast === 'function') {
      window.toast(message, type === 'error' ? 'erro' : type);
      return;
    }
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;max-width:340px;
      background:${type === 'error' ? '#c0392b' : type === 'ok' ? '#27ae60' : '#2c2c3a'};
      color:#fff;padding:12px 20px;border-radius:8px;font-size:.9rem;
      box-shadow:0 4px 20px rgba(0,0,0,.4);`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function setStatus(box, message, type = 'info') {
    const el = box.querySelector('[data-code-status]');
    if (!el) return;
    el.textContent = message || '';
    el.className = `telegram-code-status ${type === 'ok' ? 'ok' : type === 'error' ? 'error' : ''}`;
  }

  function normalizeInput(value) {
    return String(value || '').replace(/\D/g, '');
  }

  async function call(payload) {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Erro no Telegram');
    return json;
  }

  function titleFor(role, purpose) {
    if (purpose === 'signup') return role === 'profissional'
      ? 'Criar conta profissional pelo telefone'
      : 'Criar conta de cliente pelo telefone';
    if (purpose === 'reset') return 'Recuperar acesso pelo Telegram';
    return role === 'profissional'
      ? 'Entrar como profissional pelo telefone'
      : 'Entrar como cliente pelo telefone';
  }

  function descFor(purpose) {
    if (purpose === 'signup') return 'Informe seu telefone. O codigo chega no Telegram e o cadastro abre o painel para completar o perfil depois.';
    if (purpose === 'reset') return 'Receba um codigo no Telegram. Voce pode entrar sem mudar a senha ou criar uma nova senha.';
    return 'Informe seu telefone e use o codigo enviado no Telegram para entrar sem senha.';
  }

  function render(box) {
    const role = box.dataset.role === 'profissional' ? 'profissional' : 'cliente';
    const purpose = box.dataset.purpose || 'login';
    const allowPassword = box.dataset.allowPassword === 'true';

    box.classList.add('telegram-code-flow');
    box.innerHTML = `
      <div>
        <div class="telegram-quick-title"><i class="ti ti-brand-telegram"></i> ${titleFor(role, purpose)}</div>
        <p>${descFor(purpose)}</p>
      </div>
      <div class="telegram-code-fields">
        <div class="telegram-code-row">
          <input class="form-input" type="tel" inputmode="tel" autocomplete="tel" data-code-phone placeholder="Telefone com DDD" />
          <button type="button" class="btn btn-gold" data-code-send><i class="ti ti-send"></i> Enviar codigo</button>
        </div>
        <div class="telegram-code-bot" data-code-bot>
          <p>Primeira vez usando Telegram aqui? Abra o bot, toque em compartilhar telefone e volte para digitar o codigo.</p>
          <a class="telegram-fallback-link" target="_blank" rel="noopener" data-code-bot-link>
            <i class="ti ti-brand-telegram"></i> Abrir bot da Venus
          </a>
        </div>
        <input class="form-input" type="text" inputmode="numeric" autocomplete="one-time-code" data-code-value maxlength="6" placeholder="Codigo de 6 digitos" style="display:none;" />
        ${allowPassword ? '<input class="form-input" type="password" data-code-password minlength="8" placeholder="Nova senha (opcional)" style="display:none;" />' : ''}
        <button type="button" class="btn btn-outline" data-code-verify style="display:none;"><i class="ti ti-key"></i> Confirmar codigo</button>
        <div class="telegram-code-status" data-code-status></div>
      </div>
    `;

    const phoneEl = box.querySelector('[data-code-phone]');
    const codeEl = box.querySelector('[data-code-value]');
    const passwordEl = box.querySelector('[data-code-password]');
    const sendBtn = box.querySelector('[data-code-send]');
    const verifyBtn = box.querySelector('[data-code-verify]');
    const botBox = box.querySelector('[data-code-bot]');
    const botLink = box.querySelector('[data-code-bot-link]');

    sendBtn.addEventListener('click', async () => {
      const phone = normalizeInput(phoneEl.value);
      if (phone.length < 10) {
        setStatus(box, 'Digite um telefone valido com DDD.', 'error');
        return;
      }

      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="ti ti-loader-2"></i> Enviando...';
      botBox.classList.remove('show');

      try {
        const json = await call({ action: 'request', phone, role, purpose });
        codeEl.style.display = '';
        verifyBtn.style.display = '';
        if (passwordEl) passwordEl.style.display = '';

        if (json.needs_bot && json.bot_link) {
          botLink.href = json.bot_link;
          botBox.classList.add('show');
        }

        setStatus(box, json.message || 'Codigo enviado no Telegram.', json.sent ? 'ok' : 'info');
      } catch (error) {
        setStatus(box, error.message || 'Erro ao enviar codigo.', 'error');
      } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="ti ti-send"></i> Enviar codigo';
      }
    });

    verifyBtn.addEventListener('click', async () => {
      const phone = normalizeInput(phoneEl.value);
      const code = normalizeInput(codeEl.value);
      const newPassword = passwordEl?.value || '';

      if (code.length !== 6) {
        setStatus(box, 'Digite o codigo de 6 digitos.', 'error');
        return;
      }

      verifyBtn.disabled = true;
      verifyBtn.innerHTML = '<i class="ti ti-loader-2"></i> Confirmando...';

      try {
        const json = await call({
          action: 'verify',
          phone,
          code,
          role,
          purpose,
          new_password: newPassword,
        });

        try {
          if (json.is_new) localStorage.setItem(`venus:onboarding:${role}`, '1');
        } catch {}

        toast(json.password_updated ? 'Senha criada. Entrando...' : 'Codigo confirmado. Entrando...', 'ok');
        if (json.action_link) {
          window.location.href = json.action_link;
          return;
        }
        window.location.href = role === 'cliente' ? 'painel-cliente.html' : 'painel.html';
      } catch (error) {
        setStatus(box, error.message || 'Codigo invalido.', 'error');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = '<i class="ti ti-key"></i> Confirmar codigo';
      }
    });
  }

  function init() {
    document.querySelectorAll('[data-telegram-code]').forEach((box) => {
      if (box.dataset.rendered === '1') return;
      box.dataset.rendered = '1';
      render(box);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
