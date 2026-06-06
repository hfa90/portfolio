(function () {
  const SUPABASE_URL = 'https://wykmukfohehtpoezojwg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5a211a2ZvaGVodHBvZXpvandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTc0NjcsImV4cCI6MjA5NTczMzQ2N30.mlfxsXSirX-0MXOreyShuS2kn5JDh_nMEp1onsBL9-0';
  const EDGE_URL = `${SUPABASE_URL}/functions/v1/telegram-auth`;
  const BOT_USERNAME = 'venus092_bot';

  let sb = null;

  function getClient() {
    if (sb) return sb;
    if (!window.supabase?.createClient) return null;
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: 'venus-user-session' }
    });
    return sb;
  }

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

  async function currentToken() {
    const client = getClient();
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    return session?.access_token || null;
  }

  async function handleAuth(user, role = 'cliente', mode = 'login') {
    const client = getClient();
    if (!client) {
      toast('Nao foi possivel carregar o Supabase. Recarregue a pagina.', 'error');
      return;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (mode === 'link') {
      const token = await currentToken();
      if (!token) {
        toast('Entre na sua conta antes de vincular o Telegram.', 'error');
        return;
      }
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      toast(mode === 'link' ? 'Vinculando Telegram...' : 'Entrando com Telegram...');
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ telegram: user, role, mode })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Falha no Telegram');

      if (json.linked) {
        toast('Telegram vinculado com sucesso.', 'ok');
        document.dispatchEvent(new CustomEvent('venus:telegram-linked', { detail: json }));
        return;
      }

      if (json.needs_professional_signup) {
        toast(json.message || 'Crie seu perfil profissional antes de entrar pelo Telegram.', 'info');
        setTimeout(() => { window.location.href = json.redirect_to || 'cadastro.html?telegram=1'; }, 1800);
        return;
      }

      if (json.action_link) {
        window.location.href = json.action_link;
        return;
      }

      throw new Error('Resposta incompleta do Telegram');
    } catch (error) {
      toast(error.message || 'Erro ao acessar pelo Telegram.', 'error');
    }
  }

  function renderWidgets() {
    document.querySelectorAll('[data-telegram-widget]').forEach((box, index) => {
      if (box.dataset.rendered === '1') return;
      box.dataset.rendered = '1';

      const role = box.dataset.telegramRole || 'cliente';
      const mode = box.dataset.telegramMode || 'login';
      const size = box.dataset.telegramSize || 'large';
      const radius = box.dataset.telegramRadius || '12';
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', BOT_USERNAME);
      script.setAttribute('data-size', size);
      script.setAttribute('data-radius', radius);
      script.setAttribute('data-request-access', 'write');
      script.setAttribute('data-userpic', 'false');
      script.setAttribute('data-onauth', `VenusTelegram.handleAuth(user, '${role}', '${mode}')`);
      box.appendChild(script);

      const fallback = document.createElement('a');
      fallback.className = 'telegram-fallback-link';
      fallback.href = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(role)}`;
      fallback.target = '_blank';
      fallback.rel = 'noopener';
      fallback.innerHTML = '<i class="ti ti-brand-telegram"></i> Abrir pelo Telegram';
      fallback.style.marginTop = index >= 0 ? '0.65rem' : '';
      box.appendChild(fallback);
    });
  }

  window.VenusTelegram = { handleAuth, renderWidgets };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderWidgets);
  } else {
    renderWidgets();
  }
})();
