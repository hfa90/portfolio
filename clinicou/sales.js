const SALES_SUPABASE_URL = "https://yhftbfpkuchxfblhfvva.supabase.co";
const SALES_SUPABASE_KEY = "sb_publishable_paT5SW04fvUuJzui4t5COQ_nVI9gJxY";

const salesClient = window.supabase?.createClient(SALES_SUPABASE_URL, SALES_SUPABASE_KEY);
let selectedCycle = "monthly";

document.addEventListener("DOMContentLoaded", () => {
  wirePricing();
  wireSignup();
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
