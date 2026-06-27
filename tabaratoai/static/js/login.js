(function () {
  const phoneInput = document.getElementById("telefone");
  const recoveryEmailInput = document.getElementById("email-recuperacao");
  const loginForm = document.getElementById("login-form");
  const googleButton = document.getElementById("google-login-btn");

  function maskPhone(event) {
    let value = event.target.value.replace(/\D/g, "");
    if (value.length > 11) value = value.slice(0, 11);
    if (value.length > 2) value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    if (value.length > 9) value = `${value.slice(0, 10)}-${value.slice(10)}`;
    event.target.value = value;
  }

  function getOrCreateDeviceId() {
    let deviceId = localStorage.getItem("tbl_device_id");
    if (!deviceId) {
      deviceId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const random = Math.random() * 16 | 0;
        const value = char === "x" ? random : (random & 0x3 | 0x8);
        return value.toString(16);
      });
      localStorage.setItem("tbl_device_id", deviceId);
    }
    return deviceId;
  }

  function getSupabaseClient() {
    if (!window.TBA_SUPABASE) {
      showToast("Supabase não configurado. Verifique a chave pública do projeto.", "error");
      return null;
    }
    return window.TBA_SUPABASE;
  }

  function setButtonLoading(button, html) {
    const original = button.innerHTML;
    button.innerHTML = html;
    button.disabled = true;
    return () => {
      button.innerHTML = original;
      button.disabled = false;
    };
  }

  function oauthRedirectTo() {
    return new URL("compareaqui.html", window.location.href).href;
  }

  async function entrarComGoogle() {
    const client = getSupabaseClient();
    if (!client) return;

    const restore = setButtonLoading(googleButton, '<i class="fas fa-spinner fa-spin"></i> Conectando...');
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: oauthRedirectTo(),
        queryParams: { prompt: "select_account" }
      }
    });

    if (error) {
      restore();
      showToast(error.message || "Não foi possível entrar com Google.", "error");
    }
  }

  async function handlePasswordLogin(event) {
    event.preventDefault();
    const button = document.getElementById("btn-login");
    const restore = setButtonLoading(button, '<i class="fas fa-circle-notch fa-spin"></i> Entrando...');
    const telefone = phoneInput.value.replace(/\D/g, "");
    const senha = document.getElementById("senha").value;

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone, senha, device_id: getOrCreateDeviceId() })
      });
      const data = await response.json();

      if (data.success) {
        showToast("Login realizado com sucesso!", "success");
        setTimeout(() => {
          window.location.href = data.redirect_url || "compareaqui.html";
        }, 800);
      } else {
        restore();
        showToast(data.message || "Telefone ou senha inválidos.", "error");
      }
    } catch (error) {
      restore();
      showToast("Erro de conexão com o servidor.", "error");
    }
  }

  window.abrirModalRecuperacao = function abrirModalRecuperacao() {
    document.getElementById("modal-recuperacao").classList.add("active");
    setTimeout(() => recoveryEmailInput.focus(), 50);
  };

  window.fecharModalRecuperacao = function fecharModalRecuperacao() {
    document.getElementById("modal-recuperacao").classList.remove("active");
    recoveryEmailInput.value = "";
  };

  window.enviarRecuperacaoSenha = async function enviarRecuperacaoSenha(button) {
    const client = getSupabaseClient();
    if (!client) return;

    const email = recoveryEmailInput.value.trim();
    if (!email) {
      showToast("Informe seu e-mail cadastrado.", "error");
      return;
    }

    const restore = setButtonLoading(button, '<i class="fas fa-spinner fa-spin"></i> Enviando...');
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("login.html", window.location.href).href
    });

    restore();
    if (error) {
      showToast(error.message || "Não foi possível enviar o link.", "error");
      return;
    }

    fecharModalRecuperacao();
    showToast("Link de recuperação enviado para seu e-mail.", "success");
  };

  window.showToast = function showToast(message, type) {
    const toast = document.getElementById("toast");
    const icon = document.getElementById("toast-icon");
    const text = document.getElementById("toast-msg");

    text.textContent = message;
    toast.className = `toast active ${type === "error" ? "error" : ""}`;
    icon.className = type === "error" ? "fas fa-exclamation-circle" : "fas fa-check-circle";

    setTimeout(() => toast.classList.remove("active"), 3500);
  };

  window.abrirModalAdmin = function abrirModalAdmin() {
    document.getElementById("admin-modal").classList.add("active");
    document.getElementById("senha-admin").focus();
  };

  window.fecharModalAdmin = function fecharModalAdmin() {
    document.getElementById("admin-modal").classList.remove("active");
    document.getElementById("senha-admin").value = "";
  };

  window.verificarSenhaAdmin = function verificarSenhaAdmin(button) {
    const senhaInput = document.getElementById("senha-admin");
    const senha = senhaInput.value;
    const restore = setButtonLoading(button, '<i class="fas fa-spinner fa-spin"></i> Verificando...');

    if (!senha) {
      restore();
      showToast("Por favor, digite a senha.", "error");
      return;
    }

    if (senha === "201990") {
      setTimeout(() => {
        window.location.href = `administrativo.html?admin_token=${encodeURIComponent(senha)}`;
      }, 600);
      return;
    }

    setTimeout(() => {
      restore();
      senhaInput.value = "";
      senhaInput.focus();
      showToast("Senha incorreta.", "error");
    }, 400);
  };

  phoneInput.addEventListener("input", maskPhone);
  loginForm.addEventListener("submit", handlePasswordLogin);
  googleButton.addEventListener("click", entrarComGoogle);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      fecharModalAdmin();
      fecharModalRecuperacao();
    }
  });

  document.getElementById("admin-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) fecharModalAdmin();
  });

  document.getElementById("modal-recuperacao").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) fecharModalRecuperacao();
  });
})();
