(function () {
  const form = document.getElementById("register-form");
  const phoneInput = document.getElementById("telefone");
  const googleButton = document.getElementById("google-signup-btn");

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

  function setButtonLoading(button, html) {
    const original = button.innerHTML;
    button.innerHTML = html;
    button.disabled = true;
    return () => {
      button.innerHTML = original;
      button.disabled = false;
    };
  }

  function getSupabaseClient() {
    if (!window.TBA_SUPABASE) {
      showToast("Supabase não configurado. Verifique a chave pública do projeto.", "error");
      return null;
    }
    return window.TBA_SUPABASE;
  }

  async function entrarComGoogle() {
    const client = getSupabaseClient();
    if (!client) return;

    const restore = setButtonLoading(googleButton, '<i class="fas fa-spinner fa-spin"></i> Conectando...');
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("compareaqui.html", window.location.href).href,
        queryParams: { prompt: "select_account" }
      }
    });

    if (error) {
      restore();
      showToast(error.message || "Não foi possível continuar com Google.", "error");
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const button = document.getElementById("btn-submit");
    const senha = document.getElementById("senha").value;
    const confirmacao = document.getElementById("conf-senha").value;
    const telefone = phoneInput.value.replace(/\D/g, "");
    const email = document.getElementById("email").value.trim();

    if (senha !== confirmacao) return showToast("As senhas não coincidem.", "error");
    if (senha.length < 6) return showToast("A senha deve ter no mínimo 6 caracteres.", "error");
    if (telefone.length < 11) return showToast("Telefone inválido.", "error");
    if (!email) return showToast("Informe um e-mail válido.", "error");

    const restore = setButtonLoading(button, '<i class="fas fa-spinner fa-spin"></i> Criando conta...');
    const dados = {
      nome: document.getElementById("nome").value.trim(),
      telefone,
      email,
      endereco: document.getElementById("endereco").value.trim(),
      senha,
      device_id: getOrCreateDeviceId()
    };

    try {
      const response = await fetch("/api/cadastrar-usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados)
      });
      const data = await response.json();

      if (data.success) {
        showToast("Conta criada com sucesso!", "success");
        setTimeout(() => {
          window.location.href = "login.html";
        }, 1200);
      } else {
        restore();
        showToast(data.message || "Não foi possível criar sua conta.", "error");
      }
    } catch (error) {
      restore();
      showToast("Erro de conexão.", "error");
    }
  }

  window.showToast = function showToast(message, type) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast active ${type === "error" ? "error" : ""}`;
    setTimeout(() => toast.classList.remove("active"), 4000);
  };

  phoneInput.addEventListener("input", maskPhone);
  form.addEventListener("submit", handleRegister);
  googleButton.addEventListener("click", entrarComGoogle);
})();
