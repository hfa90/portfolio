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

  function displayPhoneDigits(value) {
    let digits = normalizeInput(value);
    if (/^55\d{10,11}$/.test(digits)) digits = digits.slice(2);
    return digits.slice(0, 11);
  }

  function formatPhone(value) {
    const digits = displayPhoneDigits(value);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  async function call(payload) {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      const error = new Error(json.error || 'Erro no Telegram');
      error.status = res.status;
      error.error_code = json.error_code || '';
      error.payload = json;
      throw error;
    }
    return json;
  }

  function signupUrl(role, phone) {
    const page = role === 'profissional' ? 'cadastro.html' : 'cadastro-cliente.html';
    const params = new URLSearchParams({ telefone: normalizeInput(phone) });
    return `${page}?${params.toString()}`;
  }

  function closeSignupModal() {
    document.querySelector('[data-telegram-signup-modal]')?.remove();
  }

  function showSignupModal(phone, currentRole) {
    closeSignupModal();
    const overlay = document.createElement('div');
    overlay.className = 'telegram-signup-modal';
    overlay.setAttribute('data-telegram-signup-modal', 'true');
    overlay.innerHTML = `
      <div class="telegram-signup-dialog" role="dialog" aria-modal="true" aria-labelledby="telegramSignupTitle">
        <button class="telegram-signup-close" type="button" aria-label="Fechar" data-modal-close>
          <i class="ti ti-x"></i>
        </button>
        <div class="telegram-signup-icon"><i class="ti ti-user-plus"></i></div>
        <h2 id="telegramSignupTitle">Telefone sem cadastro</h2>
        <p data-modal-text>Este telefone ainda nao tem uma conta na Venus. Quer criar seu cadastro agora?</p>
        <div class="telegram-signup-actions" data-modal-actions>
          <button class="btn btn-gold" type="button" data-modal-next>Sim, cadastrar</button>
          <button class="btn btn-outline" type="button" data-modal-close>Agora nao</button>
        </div>
      </div>
    `;

    const actions = overlay.querySelector('[data-modal-actions]');
    const text = overlay.querySelector('[data-modal-text]');
    const next = overlay.querySelector('[data-modal-next]');

    next.addEventListener('click', () => {
      text.textContent = 'Como voce quer criar essa conta? O telefone vai junto para agilizar o cadastro.';
      actions.innerHTML = `
        <a class="btn btn-gold" href="${signupUrl('cliente', phone)}"><i class="ti ti-user"></i> Cliente</a>
        <a class="btn btn-outline" href="${signupUrl('profissional', phone)}"><i class="ti ti-briefcase"></i> Profissional</a>
      `;
      const preferred = actions.querySelector(currentRole === 'profissional' ? 'a[href^="cadastro.html"]' : 'a[href^="cadastro-cliente.html"]');
      preferred?.focus();
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-modal-close]')) closeSignupModal();
    });

    document.body.appendChild(overlay);
    next.focus();
  }

  function showOtherRoleModal(phone, registeredRole) {
    closeSignupModal();
    const label = registeredRole === 'profissional' ? 'profissional' : 'cliente';
    const overlay = document.createElement('div');
    overlay.className = 'telegram-signup-modal';
    overlay.setAttribute('data-telegram-signup-modal', 'true');
    overlay.innerHTML = `
      <div class="telegram-signup-dialog" role="dialog" aria-modal="true" aria-labelledby="telegramOtherRoleTitle">
        <button class="telegram-signup-close" type="button" aria-label="Fechar" data-modal-close>
          <i class="ti ti-x"></i>
        </button>
        <div class="telegram-signup-icon"><i class="ti ti-user-check"></i></div>
        <h2 id="telegramOtherRoleTitle">Telefone ja cadastrado</h2>
        <p>Este telefone esta cadastrado como ${label}. Entre pelo tipo correto para receber o codigo.</p>
        <div class="telegram-signup-actions">
          <a class="btn btn-gold" href="login.html?tipo=${registeredRole}&telefone=${normalizeInput(phone)}">
            Entrar como ${label}
          </a>
          <button class="btn btn-outline" type="button" data-modal-close>Agora nao</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-modal-close]')) closeSignupModal();
    });
    document.body.appendChild(overlay);
    overlay.querySelector('a')?.focus();
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
    return 'Informe seu telefone e use o codigo enviado no Telegram para entrar em poucos segundos.';
  }

  function render(box) {
    const role = box.dataset.role === 'profissional' ? 'profissional' : 'cliente';
    const purpose = box.dataset.purpose || 'login';
    const allowPassword = box.dataset.allowPassword === 'true';
    const compact = box.dataset.compact === 'true';

    box.classList.add('telegram-code-flow');
    box.innerHTML = `
      ${compact ? '' : `<div>
        <div class="telegram-quick-title"><i class="ti ti-brand-telegram"></i> ${titleFor(role, purpose)}</div>
        <p>${descFor(purpose)}</p>
      </div>`}
      <div class="telegram-code-fields">
        <div class="telegram-code-row">
          <div class="telegram-phone-wrap">
            <i class="ti ti-device-mobile"></i>
            <input class="form-input" type="tel" inputmode="numeric" autocomplete="tel" data-code-phone maxlength="15" placeholder="(92) 99525-8724" aria-label="Telefone com DDD" />
          </div>
          <button type="button" class="btn btn-gold" data-code-send><i class="ti ti-send"></i> Enviar codigo</button>
        </div>
        <div class="telegram-code-bot" data-code-bot>
          <p>Primeira vez usando Telegram aqui? Abra o bot e compartilhe ou digite o mesmo telefone informado no site.</p>
          <a class="telegram-fallback-link" target="_blank" rel="noopener" data-code-bot-link>
            <i class="ti ti-brand-telegram"></i> Abrir bot da Venus
          </a>
        </div>
        <input class="form-input telegram-code-input" type="text" inputmode="numeric" autocomplete="one-time-code" data-code-value maxlength="6" placeholder="Codigo de 6 digitos" aria-label="Codigo de 6 digitos recebido no Telegram" style="display:none;" />
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
    let resendTimer = null;
    let isVerifying = false;

    const params = new URLSearchParams(window.location.search);
    const initialPhone = params.get('telefone') || params.get('phone') || params.get('tel');
    if (initialPhone) phoneEl.value = formatPhone(initialPhone);

    function setSendButtonIdle() {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="ti ti-send"></i> Enviar codigo';
    }

    function startResendCooldown(seconds = 30) {
      clearInterval(resendTimer);
      let remaining = seconds;
      sendBtn.disabled = true;
      const tick = () => {
        sendBtn.innerHTML = `<i class="ti ti-clock"></i> Reenviar em ${remaining}s`;
        remaining -= 1;
        if (remaining < 0) {
          clearInterval(resendTimer);
          resendTimer = null;
          setSendButtonIdle();
        }
      };
      tick();
      resendTimer = setInterval(tick, 1000);
    }

    phoneEl.addEventListener('input', () => {
      phoneEl.value = formatPhone(phoneEl.value);
    });

    phoneEl.addEventListener('paste', () => {
      requestAnimationFrame(() => {
        phoneEl.value = formatPhone(phoneEl.value);
      });
    });

    phoneEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendBtn.click();
      }
    });

    codeEl.addEventListener('input', () => {
      codeEl.value = normalizeInput(codeEl.value).slice(0, 6);
      if (codeEl.value.length === 6 && !isVerifying) verifyBtn.click();
    });

    codeEl.addEventListener('paste', () => {
      requestAnimationFrame(() => {
        codeEl.value = normalizeInput(codeEl.value).slice(0, 6);
        if (codeEl.value.length === 6 && !isVerifying) verifyBtn.click();
      });
    });

    codeEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        verifyBtn.click();
      }
    });

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
        codeEl.focus();
        startResendCooldown(30);
      } catch (error) {
        if ((purpose === 'login' || purpose === 'reset') && error.error_code === 'phone_not_registered') {
          setStatus(box, 'Este telefone ainda nao tem cadastro.', 'error');
          showSignupModal(phone, role);
          return;
        }
        if ((purpose === 'login' || purpose === 'reset') && error.error_code === 'phone_registered_other_role') {
          const registeredRole = error.payload?.registered_role || (role === 'cliente' ? 'profissional' : 'cliente');
          setStatus(box, `Este telefone esta cadastrado como ${registeredRole}.`, 'error');
          showOtherRoleModal(phone, registeredRole);
          return;
        }
        setStatus(box, error.message || 'Erro ao enviar codigo.', 'error');
        setSendButtonIdle();
      } finally {
        if (!resendTimer) setSendButtonIdle();
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
      isVerifying = true;

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
        isVerifying = false;
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
