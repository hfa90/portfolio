const SALES_SUPABASE_URL = "https://yhftbfpkuchxfblhfvva.supabase.co";
const SALES_SUPABASE_KEY = "sb_publishable_paT5SW04fvUuJzui4t5COQ_nVI9gJxY";
const SALES_TRIAL_KEY = "clinicou_sales_trial_ends_at";
const TRIAL_DAYS = 30;

const salesClient = window.supabase?.createClient(SALES_SUPABASE_URL, SALES_SUPABASE_KEY);
let selectedCycle = "monthly";
let previewTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  wirePricing();
  wireSignup();
  wireHeroPreview();
  startSalesTrialCountdown();
  lucide.createIcons();
});

function wirePricing() {
  document.querySelectorAll("[data-cycle]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCycle = button.dataset.cycle;
      document.querySelectorAll("[data-cycle]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".price strong").forEach((node) => {
        const value = node.dataset[selectedCycle === "annual" ? "annual" : "monthly"];
        node.textContent = formatPlanPrice(value);
      });
      document.querySelectorAll("[data-price-note]").forEach((node) => {
        node.textContent = selectedCycle === "annual" ? "/ano" : "/mes";
      });
      const cycle = document.getElementById("signupCycle");
      if (cycle) cycle.value = selectedCycle === "annual" ? "annual" : "monthly";
    });
  });

  document.querySelectorAll("[data-open-signup]").forEach((button) => {
    button.addEventListener("click", () => {
      const plan = document.getElementById("signupPlan");
      const cycle = document.getElementById("signupCycle");
      if (plan) plan.value = button.dataset.openSignup;
      if (cycle) cycle.value = selectedCycle;
      document.getElementById("cadastro")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function wireSignup() {
  const form = document.getElementById("trialForm");
  form?.addEventListener("submit", submitTrialSignup);
  form?.phone?.addEventListener("input", (event) => event.target.value = formatPhone(event.target.value));
}

function wireHeroPreview() {
  document.querySelectorAll("[data-preview]").forEach((button) => {
    button.addEventListener("click", () => setHeroPreview(button.dataset.preview));
  });
  let index = 0;
  const views = ["agenda", "financeiro", "crm"];
  clearInterval(previewTimer);
  previewTimer = setInterval(() => {
    index = (index + 1) % views.length;
    setHeroPreview(views[index]);
  }, 5200);
}

function setHeroPreview(view) {
  const title = document.getElementById("commandTitle");
  const screen = document.getElementById("commandScreen");
  const content = {
    agenda: {
      title: "Agenda inteligente",
      rows: [
        ["08:30", "Marina Lopes", "Confirmada"],
        ["10:00", "Rafael Nunes", "Recepcao"],
        ["14:00", "Claudia Sales", "WhatsApp pendente"]
      ]
    },
    financeiro: {
      title: "Financeiro e repasses",
      rows: [
        ["Pix", "Consulta Marina", "R$ 220 pago"],
        ["Cartao", "Limpeza Rafael", "R$ 280 aberto"],
        ["Repasse", "Dra. Ana Beatriz", "35% previsto"]
      ]
    },
    crm: {
      title: "CRM por WhatsApp",
      rows: [
        ["D-1", "Confirmacao automatica", "42 envios"],
        ["Retorno", "Odontologia semestral", "18 contatos"],
        ["Pos", "Estetica pos-procedimento", "26 envios"]
      ]
    }
  }[view] || {};
  if (title) title.textContent = content.title || "Clinicou";
  if (screen) {
    screen.innerHTML = (content.rows || []).map((row, index) => `
      <div class="screen-row ${index === 0 ? "active" : ""}">
        <span>${escapeHtml(row[0])}</span>
        <strong>${escapeHtml(row[1])}</strong>
        <small>${escapeHtml(row[2])}</small>
      </div>
    `).join("");
  }
  document.querySelectorAll("[data-preview]").forEach((button) => {
    button.classList.toggle("active", button.dataset.preview === view);
  });
  lucide.createIcons();
}

async function submitTrialSignup(event) {
  event.preventDefault();
  const feedback = document.getElementById("signupFeedback");
  if (!salesClient) {
    setFeedback("Nao foi possivel carregar o Supabase. Verifique sua conexao.", "error");
    return;
  }

  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const planId = data.cycle === "annual" ? `${data.plan}_annual` : data.plan;
  const emailRedirectTo = new URL("./index.html", window.location.href).toString();

  feedback.textContent = "Criando acesso e enviando e-mail de confirmacao...";
  feedback.className = "form-feedback";

  const { error } = await salesClient.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      emailRedirectTo,
      data: {
        full_name: data.ownerName,
        clinic_name: data.clinicName,
        phone: data.phone,
        selected_plan: planId,
        billing_cycle: data.cycle,
        trial_days: 30,
        source: "clinicou_planos"
      }
    }
  });

  if (error) {
    setFeedback(error.message || "Nao foi possivel criar o cadastro.", "error");
    return;
  }

  form.reset();
  localStorage.setItem(SALES_TRIAL_KEY, new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString());
  startSalesTrialCountdown();
  document.getElementById("signupPlan").value = "growth";
  document.getElementById("signupCycle").value = selectedCycle;
  setFeedback("Enviamos um e-mail personalizado para confirmar o cadastro. Depois da confirmacao, acesse o Clinicou e finalize a criacao da clinica.", "success");
}

function setFeedback(message, type) {
  const feedback = document.getElementById("signupFeedback");
  feedback.textContent = message;
  feedback.className = `form-feedback ${type}`;
}

function formatPlanPrice(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function startSalesTrialCountdown() {
  updateSalesTrialCountdown();
  clearInterval(startSalesTrialCountdown.timer);
  startSalesTrialCountdown.timer = setInterval(updateSalesTrialCountdown, 1000);
}

function updateSalesTrialCountdown() {
  const node = document.getElementById("salesTrialCountdown");
  if (!node) return;
  const stored = localStorage.getItem(SALES_TRIAL_KEY);
  const endsAt = stored ? new Date(stored) : new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const remaining = endsAt.getTime() - Date.now();
  node.textContent = remaining > 0 ? formatRemaining(remaining) : "Trial encerrado";
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
