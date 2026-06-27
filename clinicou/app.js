const SUPABASE_URL = "https://yhftbfpkuchxfblhfvva.supabase.co";
const SUPABASE_KEY = "sb_publishable_paT5SW04fvUuJzui4t5COQ_nVI9gJxY";
const STORAGE_KEY = "clinicou_state_v2";

const statusLabel = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Na recepcao",
  in_service: "Em atendimento",
  finished: "Finalizado",
  no_show: "Faltou",
  open: "Aberto",
  paid: "Pago",
  overdue: "Vencido",
  low: "Baixo",
  medium: "Medio",
  high: "Alto",
  income: "Entrada",
  expense: "Saida"
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const todayIso = new Date().toISOString().slice(0, 10);

const seedState = {
  tenant: { id: "clinic", name: "Clinica Aurora", plan: "Premium", mrr: 1290 },
  insurancePlans: [
    { id: "ip1", name: "Particular", contact: "", active: true },
    { id: "ip2", name: "Unimed", contact: "(92) 3000-1000", active: true },
    { id: "ip3", name: "Bradesco Saude", contact: "(92) 3000-2000", active: true }
  ],
  patients: [
    { id: "p1", name: "Marina Lopes", phone: "(92) 98812-4401", email: "marina@email.com", risk: "low", insurance: "Particular", noShow: 4 },
    { id: "p2", name: "Rafael Nunes", phone: "(92) 98177-2210", email: "rafael@email.com", risk: "medium", insurance: "Unimed", noShow: 18 },
    { id: "p3", name: "Claudia Sales", phone: "(92) 99910-8122", email: "claudia@email.com", risk: "high", insurance: "Bradesco Saude", noShow: 35 },
    { id: "p4", name: "Joao Pedro", phone: "(92) 98422-7764", email: "joao@email.com", risk: "low", insurance: "Particular", noShow: 7 }
  ],
  professionals: [
    { id: "dr1", name: "Dra. Ana Beatriz", specialty: "Clinica geral", commission: 35, start: "08:00", end: "17:00" },
    { id: "dr2", name: "Dr. Marcos Lima", specialty: "Odontologia", commission: 40, start: "09:00", end: "18:00" },
    { id: "dr3", name: "Dra. Helena Costa", specialty: "Estetica", commission: 30, start: "10:00", end: "19:00" }
  ],
  services: [
    { id: "s1", name: "Consulta inicial", duration: 40, price: 220, specialty: "Clinica geral" },
    { id: "s2", name: "Limpeza odontologica", duration: 50, price: 280, specialty: "Odontologia" },
    { id: "s3", name: "Retorno pos-procedimento", duration: 25, price: 0, specialty: "Estetica" },
    { id: "s4", name: "Toxina botulinica", duration: 60, price: 890, specialty: "Estetica" }
  ],
  appointments: [
    { id: "a1", patientId: "p1", professionalId: "dr1", serviceId: "s1", date: todayIso, time: "08:30", status: "confirmed" },
    { id: "a2", patientId: "p2", professionalId: "dr2", serviceId: "s2", date: todayIso, time: "10:00", status: "waiting" },
    { id: "a3", patientId: "p3", professionalId: "dr3", serviceId: "s4", date: todayIso, time: "14:00", status: "scheduled" },
    { id: "a4", patientId: "p4", professionalId: "dr1", serviceId: "s1", date: addDays(1), time: "09:20", status: "scheduled" }
  ],
  finance: [
    { id: "f1", description: "Consulta Marina Lopes", amount: 220, type: "income", dueDate: todayIso, status: "paid", professionalId: "dr1", paymentMethod: "Pix" },
    { id: "f2", description: "Limpeza Rafael Nunes", amount: 280, type: "income", dueDate: todayIso, status: "open", professionalId: "dr2", paymentMethod: "Cartao" },
    { id: "f3", description: "Materiais odontologicos", amount: 380, type: "expense", dueDate: addDays(2), status: "open", professionalId: "", paymentMethod: "Boleto" },
    { id: "f4", description: "Toxina botulinica", amount: 890, type: "income", dueDate: addDays(3), status: "open", professionalId: "dr3", paymentMethod: "Pix" }
  ],
  records: [
    {
      id: "r1",
      patientId: "p1",
      complaint: "Paciente relata melhora da dor.",
      diagnosis: "Evolucao satisfatoria",
      conduct: "Conduta mantida e retorno orientado.",
      vitals: "PA 120x80",
      prescription: "Manter medicacao conforme orientacao.",
      followUp: "Retorno em 30 dias",
      notes: "",
      createdAt: new Date().toISOString()
    }
  ],
  campaigns: [
    { id: "c1", name: "Confirmacao D-1", channel: "WhatsApp", audience: "Consultas de amanha", status: "Ativa", sent: 42 },
    { id: "c2", name: "Retorno semestral", channel: "WhatsApp", audience: "Odontologia", status: "Pausada", sent: 18 },
    { id: "c3", name: "Pos-procedimento estetica", channel: "E-mail", audience: "Estetica", status: "Ativa", sent: 26 }
  ],
  audit: [
    { id: "lg1", action: "Visualizacao de prontuario", actor: "Dra. Ana Beatriz", target: "Marina Lopes", at: "Hoje 08:14" },
    { id: "lg2", action: "Alteracao financeira", actor: "Admin", target: "Limpeza Rafael Nunes", at: "Hoje 09:02" }
  ]
};

let state = loadState();
let supabaseClient = null;
let currentStatusFilter = "all";
let currentScheduleDate = todayIso;
let currentFinanceStatus = "all";
let currentFinanceSearch = "";
let editingPatientId = null;

document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  wireEvents();
  setDefaultDates();
  renderAll();
  lucide.createIcons();
  await enforceAuth();
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(saved || {});
  } catch {
    return structuredClone(seedState);
  }
}

function normalizeState(saved) {
  const merged = { ...structuredClone(seedState), ...saved };
  merged.tenant = { ...seedState.tenant, ...(saved.tenant || {}) };
  merged.insurancePlans = Array.isArray(saved.insurancePlans) ? saved.insurancePlans : seedState.insurancePlans;
  merged.patients = Array.isArray(saved.patients) ? saved.patients : seedState.patients;
  merged.professionals = Array.isArray(saved.professionals) ? saved.professionals : seedState.professionals;
  merged.services = Array.isArray(saved.services) ? saved.services : seedState.services;
  merged.appointments = Array.isArray(saved.appointments) ? saved.appointments : seedState.appointments;
  merged.finance = Array.isArray(saved.finance) ? saved.finance : seedState.finance;
  merged.records = Array.isArray(saved.records) ? saved.records : seedState.records;
  merged.campaigns = Array.isArray(saved.campaigns) ? saved.campaigns : seedState.campaigns;
  merged.audit = Array.isArray(saved.audit) ? saved.audit : seedState.audit;
  return merged;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function byId(id) {
  return document.getElementById(id);
}

function wireEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.view));
  });
  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.openView));
  });
  document.querySelectorAll("[data-filter-status]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter-status]").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      currentStatusFilter = button.dataset.filterStatus;
      renderSchedule();
    });
  });

  byId("menuToggle")?.addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
  byId("newAppointmentButton")?.addEventListener("click", () => openView("agenda"));
  byId("scheduleDateFilter")?.addEventListener("change", (event) => {
    currentScheduleDate = event.target.value || todayIso;
    byId("appointmentDate").value = currentScheduleDate;
    renderSchedule();
  });
  byId("suggestSlotButton")?.addEventListener("click", suggestSlot);
  byId("appointmentForm")?.addEventListener("submit", submitAppointment);

  byId("patientForm")?.addEventListener("submit", submitPatient);
  byId("resetPatientForm")?.addEventListener("click", resetPatientForm);
  byId("patientSearch")?.addEventListener("input", renderPatients);

  byId("recordForm")?.addEventListener("submit", submitRecord);
  byId("recordPatient")?.addEventListener("change", () => {
    renderRecordPatientSummary();
    renderRecords();
  });

  byId("financeForm")?.addEventListener("submit", submitFinance);
  byId("financeSearch")?.addEventListener("input", (event) => {
    currentFinanceSearch = event.target.value.toLowerCase();
    renderFinance();
  });
  byId("financeStatus")?.addEventListener("change", (event) => {
    currentFinanceStatus = event.target.value;
    renderFinance();
  });
  byId("financeAmount")?.addEventListener("input", updateCommissionPreview);
  byId("financeProfessional")?.addEventListener("change", updateCommissionPreview);
  byId("exportFinance")?.addEventListener("click", exportFinanceCsv);

  byId("insurancePlanForm")?.addEventListener("submit", submitInsurancePlan);

  byId("tenantForm")?.addEventListener("submit", submitTenantName);
  byId("exportBackup")?.addEventListener("click", exportBackup);
  byId("importBackupButton")?.addEventListener("click", () => byId("importBackupFile").click());
  byId("importBackupFile")?.addEventListener("change", importBackup);

  byId("messageTemplate")?.addEventListener("change", renderMessagePreview);
  byId("messagePatient")?.addEventListener("change", renderMessagePreview);
  byId("messageForm")?.addEventListener("submit", submitMessage);
  byId("loginButton")?.addEventListener("click", () => auth());
}

function setDefaultDates() {
  byId("appointmentDate").value = todayIso;
  byId("scheduleDateFilter").value = todayIso;
  document.querySelector("[name='dueDate']").value = todayIso;
}

async function enforceAuth() {
  if (!supabaseClient) {
    lockAuth("Nao foi possivel carregar a biblioteca Supabase. Verifique sua conexao.");
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data?.session) {
    unlockAuth();
    await loadRemoteSnapshot();
    return;
  }

  lockAuth("Entre com uma conta autorizada para acessar o sistema.");
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) unlockAuth();
  });
}

function lockAuth(message) {
  document.body.classList.add("auth-locked");
  byId("authModal").classList.add("open");
  byId("authFeedback").textContent = message;
  byId("syncState").textContent = "Acesso Supabase obrigatorio";
}

function unlockAuth() {
  document.body.classList.remove("auth-locked");
  byId("authModal").classList.remove("open");
  byId("syncState").textContent = "Online com Supabase";
}

function openView(view) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === view));
  document.querySelector(".sidebar").classList.remove("open");
  const titles = {
    dashboard: ["Operacao de hoje", "Visao geral"],
    agenda: ["Agenda inteligente", "Consultas e encaixes"],
    pacientes: ["CRM clinico", "Pacientes"],
    prontuario: ["Prontuario eletronico", "Historico e evolucao"],
    financeiro: ["Controle financeiro", "Receitas, despesas e repasses"],
    convenios: ["Cadastro", "Planos de saude"],
    crm: ["Comunicacao", "WhatsApp e automacoes"],
    admin: ["Administracao", "Backup e clinica"]
  };
  byId("viewEyebrow").textContent = titles[view][0];
  byId("viewTitle").textContent = titles[view][1];
  lucide.createIcons();
}

function renderAll() {
  byId("tenantName").textContent = state.tenant.name;
  populateSelects();
  renderMetrics();
  renderTimeline();
  renderInsights();
  renderCashflow();
  renderCrmQueue();
  renderSchedule();
  renderPatients();
  renderRecordPatientSummary();
  renderRecords();
  renderFinance();
  renderInsurancePlans();
  renderCampaigns();
  renderMessagePreview();
  updateCommissionPreview();
  lucide.createIcons();
}

function populateSelects() {
  fillSelect("appointmentPatient", state.patients, "name");
  fillSelect("recordPatient", state.patients, "name");
  fillSelect("messagePatient", state.patients, "name");
  fillSelect("appointmentProfessional", state.professionals, "name");
  fillSelect("financeProfessional", [{ id: "", name: "Sem repasse" }, ...state.professionals], "name");
  fillSelect("appointmentService", state.services, "name");
  fillInsuranceSelect("patientInsurance");
}

function fillSelect(id, items, field) {
  const select = byId(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = items.map((item) => `<option value="${item.id}">${escapeHtml(item[field])}</option>`).join("");
  if (items.some((item) => item.id === current)) select.value = current;
}

function fillInsuranceSelect(id) {
  const select = byId(id);
  if (!select) return;
  const current = select.value;
  const activePlans = state.insurancePlans.filter((plan) => plan.active);
  select.innerHTML = activePlans.map((plan) => `<option value="${escapeHtml(plan.name)}">${escapeHtml(plan.name)}</option>`).join("");
  if (activePlans.some((plan) => plan.name === current)) select.value = current;
}

function renderMetrics() {
  const today = state.appointments.filter((a) => a.date === todayIso);
  const confirmed = today.filter((a) => ["confirmed", "waiting", "in_service", "finished"].includes(a.status)).length;
  const revenue = state.finance.filter((f) => f.type === "income" && f.status !== "overdue").reduce((sum, f) => sum + Number(f.amount), 0);
  const risk = today.length ? Math.round(today.reduce((sum, a) => sum + patientById(a.patientId).noShow, 0) / today.length) : 0;
  byId("metricToday").textContent = today.length;
  byId("metricTodaySub").textContent = `${confirmed} confirmadas`;
  byId("metricRevenue").textContent = money.format(revenue);
  byId("metricNoShow").textContent = `${risk}%`;
  byId("metricMrr").textContent = state.insurancePlans.filter((plan) => plan.active).length;
}

function renderTimeline() {
  const items = state.appointments
    .filter((a) => a.date === todayIso)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((a) => timelineItem(a));
  byId("todayTimeline").innerHTML = items.join("") || emptyState("Nenhuma consulta para hoje.");
}

function timelineItem(appt) {
  const patient = patientById(appt.patientId);
  const pro = professionalById(appt.professionalId);
  const service = serviceById(appt.serviceId);
  return `<div class="timeline-item">
    <div class="timeline-time">${appt.time}</div>
    <div><p class="item-title">${escapeHtml(patient.name)}</p><p class="item-sub">${escapeHtml(service.name)} com ${escapeHtml(pro.name)}</p></div>
    <span class="badge ${appt.status}">${statusLabel[appt.status]}</span>
  </div>`;
}

function renderInsights() {
  const highRisk = state.appointments.filter((a) => a.date >= todayIso && patientById(a.patientId).noShow >= 25);
  const openFinance = state.finance.filter((f) => f.status === "open" && f.type === "income");
  const idlePros = state.professionals.filter((pro) => !state.appointments.some((a) => a.date === todayIso && a.professionalId === pro.id));
  const insights = [
    { title: `${highRisk.length} consulta(s) com risco de falta`, sub: "Enviar confirmacao ativa pelo WhatsApp.", color: "high" },
    { title: `${openFinance.length} cobranca(s) em aberto`, sub: "Priorize recebiveis antes do fechamento.", color: "medium" },
    { title: `${idlePros.length} profissional(is) com janela livre`, sub: "Use o motor de encaixe para ocupar horarios.", color: "low" }
  ];
  byId("insightsList").innerHTML = insights.map((item) => `<div class="insight-item">
    <i data-lucide="alert-circle"></i>
    <div><p class="item-title">${item.title}</p><p class="item-sub">${item.sub}</p></div>
    <span class="badge ${item.color}">${statusLabel[item.color]}</span>
  </div>`).join("");
}

function renderCashflow() {
  const max = Math.max(1, ...state.finance.map((f) => Number(f.amount)));
  const rows = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(i);
    const amount = state.finance.filter((f) => f.dueDate === date).reduce((sum, f) => sum + (f.type === "income" ? Number(f.amount) : -Number(f.amount)), 0);
    const width = Math.min(100, Math.abs(amount) / max * 100);
    return `<div class="bar-row"><span>${dateFmt.format(new Date(`${date}T12:00:00`))}</span><div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${amount < 0 ? "var(--rose)" : "var(--teal)"}"></div></div><strong>${money.format(amount)}</strong></div>`;
  });
  byId("cashflowBars").innerHTML = rows.join("");
}

function renderCrmQueue() {
  const queue = state.appointments
    .filter((a) => ["scheduled", "confirmed"].includes(a.status))
    .slice(0, 4)
    .map((a) => {
      const patient = patientById(a.patientId);
      return `<div class="queue-item"><i data-lucide="message-square-text"></i><div><p class="item-title">${escapeHtml(patient.name)}</p><p class="item-sub">${formatDate(a.date)} as ${a.time} - ${patient.phone}</p></div><span class="badge ${a.status}">${statusLabel[a.status]}</span></div>`;
    });
  byId("crmQueue").innerHTML = queue.join("") || emptyState("Nenhuma confirmacao pendente.");
}

function renderSchedule() {
  const dayAppointments = state.appointments.filter((a) => a.date === currentScheduleDate);
  const shownAppointments = dayAppointments.filter((a) => currentStatusFilter === "all" || a.status === currentStatusFilter);
  byId("scheduleCount").textContent = dayAppointments.length;
  byId("scheduleConfirmed").textContent = dayAppointments.filter((a) => ["confirmed", "waiting", "in_service", "finished"].includes(a.status)).length;
  byId("scheduleOpen").textContent = dayAppointments.filter((a) => ["scheduled", "waiting"].includes(a.status)).length;

  const byPro = state.professionals.map((pro) => {
    const appts = shownAppointments
      .filter((a) => a.professionalId === pro.id)
      .sort((a, b) => a.time.localeCompare(b.time));
    const cards = appts.map((a) => `<div class="appt-card">
      <strong>${a.time} - ${escapeHtml(patientById(a.patientId).name)}</strong>
      <span>${escapeHtml(serviceById(a.serviceId).name)}</span>
      <span>${escapeHtml(patientById(a.patientId).insurance || "Particular")}</span>
      <span class="badge ${a.status}">${statusLabel[a.status]}</span>
    </div>`).join("");
    return `<div class="pro-column"><div class="pro-heading">${escapeHtml(pro.name)}<p class="item-sub">${escapeHtml(pro.specialty)} - ${pro.start} as ${pro.end}</p></div>${cards || emptyState("Sem consultas neste dia.")}</div>`;
  });
  byId("scheduleBoard").innerHTML = byPro.join("");
  lucide.createIcons();
}

function renderPatients() {
  const query = byId("patientSearch")?.value?.toLowerCase() || "";
  const rows = state.patients
    .filter((p) => `${p.name} ${p.phone} ${p.email} ${p.insurance}`.toLowerCase().includes(query))
    .map((p) => `<div class="table-row patients-row">
      <div><strong>${escapeHtml(p.name)}</strong><div class="table-label">${escapeHtml(p.email || "Sem e-mail")}</div></div>
      <div>${escapeHtml(p.phone)}<div class="table-label">${escapeHtml(p.insurance || "Particular")}</div></div>
      <div><span class="badge ${p.risk}">${statusLabel[p.risk]}</span></div>
      <div class="row-actions">
        <button class="icon-button" onclick="editPatient('${p.id}')" aria-label="Editar paciente"><i data-lucide="pencil"></i></button>
        <button class="icon-button danger" onclick="deletePatient('${p.id}')" aria-label="Excluir paciente"><i data-lucide="trash-2"></i></button>
        <button class="icon-button" onclick="selectPatient('${p.id}')" aria-label="Abrir prontuario"><i data-lucide="clipboard-plus"></i></button>
      </div>
    </div>`);
  byId("patientsTable").innerHTML = rows.join("") || emptyState("Nenhum paciente encontrado.");
  lucide.createIcons();
}

function renderRecordPatientSummary() {
  const patient = patientById(byId("recordPatient")?.value || state.patients[0]?.id);
  const lastVisit = lastClinicVisit(patient.id);
  const recordCount = state.records.filter((record) => record.patientId === patient.id).length;
  byId("recordPatientSummary").innerHTML = `<div class="summary-card">
    <div>
      <span>Paciente selecionado</span>
      <strong>${escapeHtml(patient.name)}</strong>
      <small>${escapeHtml(patient.phone || "Sem telefone")} - ${escapeHtml(patient.insurance || "Particular")}</small>
    </div>
    <div>
      <span>Ultima passagem</span>
      <strong>${lastVisit ? formatDateTime(lastVisit) : "Sem historico"}</strong>
      <small>${recordCount} evolucao(oes) no prontuario</small>
    </div>
  </div>`;
}

function renderRecords() {
  const patientId = byId("recordPatient")?.value || state.patients[0]?.id;
  const records = state.records
    .filter((r) => r.patientId === patientId)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  byId("recordsList").innerHTML = records.map((r) => `<div class="record-item">
    <i data-lucide="file-heart"></i>
    <div>
      <p class="item-title">${formatDateTime(r.createdAt)} - ${escapeHtml(r.diagnosis || "Evolucao registrada")}</p>
      <p class="item-sub">${escapeHtml(r.complaint || "Sem queixa informada")}</p>
      <p class="item-sub">${escapeHtml(r.conduct || r.prescription || "")}</p>
    </div>
    <span class="badge confirmed">Salvo</span>
  </div>`).join("") || emptyState("Nenhuma evolucao registrada para este paciente.");
  lucide.createIcons();
}

function renderFinance() {
  renderFinanceSummary();
  const rows = state.finance
    .filter((f) => currentFinanceStatus === "all" || f.status === currentFinanceStatus)
    .filter((f) => `${f.description} ${f.type} ${f.status} ${f.paymentMethod || ""}`.toLowerCase().includes(currentFinanceSearch))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((f) => {
      const pro = professionalById(f.professionalId);
      const commission = pro.id && f.type === "income" ? Number(f.amount) * Number(pro.commission || 0) / 100 : 0;
      return `<div class="table-row finance-row">
        <div><strong>${escapeHtml(f.description)}</strong><div class="table-label">${formatDate(f.dueDate)} - ${statusLabel[f.type]} - ${escapeHtml(f.paymentMethod || "Metodo nao informado")}</div></div>
        <div>${money.format(Number(f.amount))}<div class="table-label">${commission ? `Repasse ${money.format(commission)}` : "Sem repasse"}</div></div>
        <div><span class="badge ${f.status}">${statusLabel[f.status]}</span></div>
        <button class="icon-button" onclick="markPaid('${f.id}')" aria-label="Marcar pago"><i data-lucide="check"></i></button>
      </div>`;
    });
  byId("financeTable").innerHTML = rows.join("") || emptyState("Nenhuma movimentacao para os filtros atuais.");
  lucide.createIcons();
}

function renderFinanceSummary() {
  const income = state.finance.filter((f) => f.type === "income").reduce((sum, f) => sum + Number(f.amount), 0);
  const expense = state.finance.filter((f) => f.type === "expense").reduce((sum, f) => sum + Number(f.amount), 0);
  const open = state.finance.filter((f) => f.status === "open").reduce((sum, f) => sum + Number(f.amount), 0);
  const paid = state.finance.filter((f) => f.status === "paid").reduce((sum, f) => sum + Number(f.amount), 0);
  byId("financeIncome").textContent = money.format(income);
  byId("financeExpense").textContent = money.format(expense);
  byId("financeBalance").textContent = money.format(income - expense);
  byId("financeOpen").textContent = money.format(open);
  byId("financePaid").textContent = money.format(paid);
}

function renderInsurancePlans() {
  const list = state.insurancePlans.map((plan) => {
    const patients = state.patients.filter((patient) => patient.insurance === plan.name).length;
    return `<div class="plan-item">
      <i data-lucide="badge-check"></i>
      <div><p class="item-title">${escapeHtml(plan.name)}</p><p class="item-sub">${escapeHtml(plan.contact || "Sem contato")} - ${patients} paciente(s)</p></div>
      <button class="icon-button danger" onclick="deleteInsurancePlan('${plan.id}')" aria-label="Excluir plano"><i data-lucide="trash-2"></i></button>
    </div>`;
  });
  byId("insurancePlansList").innerHTML = list.join("") || emptyState("Nenhum plano cadastrado.");
  lucide.createIcons();
}

function renderCampaigns() {
  byId("campaignList").innerHTML = state.campaigns.map((c) => `<div class="campaign-item">
    <i data-lucide="radio"></i>
    <div><p class="item-title">${escapeHtml(c.name)}</p><p class="item-sub">${escapeHtml(c.channel)} - ${escapeHtml(c.audience)} - ${c.sent} envios</p></div>
    <span class="badge ${c.status === "Ativa" ? "confirmed" : "scheduled"}">${c.status}</span>
  </div>`).join("");
}

function submitAppointment(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.appointments.push({ id: uid("a"), ...data });
  const service = serviceById(data.serviceId);
  state.finance.push({
    id: uid("f"),
    description: `${service.name} - ${patientById(data.patientId).name}`,
    amount: service.price,
    type: "income",
    dueDate: data.date,
    status: "open",
    professionalId: data.professionalId,
    paymentMethod: "A definir"
  });
  currentScheduleDate = data.date;
  byId("scheduleDateFilter").value = data.date;
  state.audit.unshift({ id: uid("lg"), action: "Consulta agendada", actor: "Usuario atual", target: patientById(data.patientId).name, at: "Agora" });
  saveState();
  renderAll();
  toast("Consulta agendada e lancamento financeiro criado.");
}

function submitPatient(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (editingPatientId) {
    const patient = state.patients.find((p) => p.id === editingPatientId);
    Object.assign(patient, data);
    toast("Paciente atualizado.");
  } else {
    state.patients.push({ id: uid("p"), noShow: 0, ...data });
    toast("Paciente cadastrado.");
  }
  saveState();
  resetPatientForm();
  renderAll();
}

function submitRecord(event) {
  event.preventDefault();
  const record = {
    id: uid("r"),
    patientId: byId("recordPatient").value,
    complaint: byId("recordComplaint").value,
    vitals: byId("recordVitals").value,
    diagnosis: byId("recordDiagnosis").value,
    conduct: byId("recordConduct").value,
    prescription: byId("recordPrescription").value,
    followUp: byId("recordFollowUp").value,
    notes: byId("recordNotes").value,
    createdAt: new Date().toISOString()
  };
  state.records.push(record);
  state.audit.unshift({ id: uid("lg"), action: "Evolucao clinica registrada", actor: "Usuario atual", target: patientById(record.patientId).name, at: "Agora" });
  saveState();
  event.target.reset();
  byId("recordPatient").value = record.patientId;
  renderAll();
  toast("Prontuario atualizado com historico do paciente.");
}

function submitFinance(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.finance.push({ id: uid("f"), amount: Number(data.amount), ...data });
  saveState();
  event.target.reset();
  setDefaultDates();
  renderAll();
  toast("Movimentacao financeira lancada.");
}

function submitInsurancePlan(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.insurancePlans.push({ id: uid("ip"), active: true, ...data });
  saveState();
  event.target.reset();
  populateSelects();
  renderInsurancePlans();
  toast("Plano de saude cadastrado.");
}

function submitTenantName(event) {
  event.preventDefault();
  const name = new FormData(event.target).get("clinicName")?.trim();
  if (!name) return;
  state.tenant.name = name;
  saveState();
  renderAll();
  toast("Nome da clinica atualizado.");
}

function submitMessage(event) {
  event.preventDefault();
  const patient = patientById(byId("messagePatient").value);
  state.audit.unshift({ id: uid("lg"), action: "Mensagem automatica registrada", actor: "CRM", target: patient.name, at: "Agora" });
  saveState();
  renderAll();
  toast("Envio registrado na auditoria.");
}

function suggestSlot() {
  const professional = professionalById(byId("appointmentProfessional").value);
  const service = serviceById(byId("appointmentService").value);
  const date = byId("appointmentDate").value || todayIso;
  const busy = state.appointments.filter((a) => a.professionalId === professional.id && a.date === date).map((a) => a.time);
  const startHour = Number(professional.start.slice(0, 2));
  const endHour = Number(professional.end.slice(0, 2));
  let suggestion = "";
  for (let hour = startHour; hour < endHour; hour += 1) {
    for (const minute of ["00", "30"]) {
      const slot = `${String(hour).padStart(2, "0")}:${minute}`;
      if (!busy.includes(slot)) {
        suggestion = slot;
        break;
      }
    }
    if (suggestion) break;
  }
  if (!suggestion) {
    byId("slotSuggestion").textContent = "Agenda cheia para este profissional na data escolhida.";
    return;
  }
  byId("appointmentTime").value = suggestion;
  byId("slotSuggestion").textContent = `${suggestion} e o melhor encaixe: ${professional.name} tem janela livre e o servico dura ${service.duration} minutos.`;
}

function renderMessagePreview() {
  const patient = patientById(byId("messagePatient")?.value || state.patients[0]?.id);
  const template = byId("messageTemplate")?.value || "confirmacao";
  const messages = {
    confirmacao: `Ola, ${patient.name}. Passando para confirmar sua consulta na ${state.tenant.name}. Responda SIM para confirmar ou REAGENDAR para escolher outro horario.`,
    pos: `Ola, ${patient.name}. Como voce esta se sentindo apos o procedimento? Qualquer desconforto fora do esperado, fale conosco por aqui.`,
    retorno: `Ola, ${patient.name}. Seu retorno preventivo esta chegando. Podemos reservar um horario esta semana?`
  };
  if (byId("messagePreview")) byId("messagePreview").value = messages[template];
}

function updateCommissionPreview() {
  const amount = Number(byId("financeAmount")?.value || 0);
  const pro = professionalById(byId("financeProfessional")?.value || "");
  const commission = pro.id ? amount * Number(pro.commission || 0) / 100 : 0;
  if (byId("commissionPreview")) {
    byId("commissionPreview").textContent = pro.id
      ? `Repasse previsto para ${pro.name}: ${money.format(commission)} (${pro.commission}%).`
      : "Selecione um profissional para calcular repasse automaticamente.";
  }
}

async function auth() {
  if (!supabaseClient) {
    byId("authFeedback").textContent = "Biblioteca Supabase nao carregou. Verifique a conexao.";
    return;
  }
  const form = byId("authForm");
  const data = Object.fromEntries(new FormData(form));
  const feedback = byId("authFeedback");
  feedback.textContent = "Conectando...";
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error) throw error;
    feedback.textContent = "Acesso confirmado.";
    await loadRemoteSnapshot();
    unlockAuth();
    toast("Autenticacao Supabase concluida.");
  } catch (error) {
    feedback.textContent = error.message || "Nao foi possivel autenticar.";
  }
}

async function loadRemoteSnapshot() {
  if (!supabaseClient) return;
  const { data: clinics } = await supabaseClient.from("clinics").select("id,name,plan").limit(1);
  if (clinics?.[0]) {
    state.tenant = { ...state.tenant, ...clinics[0] };
    saveState();
    renderAll();
  }
}

function markPaid(id) {
  const item = state.finance.find((f) => f.id === id);
  if (item) item.status = "paid";
  saveState();
  renderAll();
  toast("Titulo marcado como pago.");
}

function editPatient(id) {
  const patient = patientById(id);
  editingPatientId = id;
  byId("patientFormTitle").textContent = "Editar paciente";
  byId("patientSubmitLabel").textContent = "Salvar";
  byId("patientForm").elements.name.value = patient.name || "";
  byId("patientForm").elements.phone.value = patient.phone || "";
  byId("patientForm").elements.email.value = patient.email || "";
  byId("patientForm").elements.risk.value = patient.risk || "low";
  byId("patientForm").elements.insurance.value = patient.insurance || "Particular";
  openView("pacientes");
}

function deletePatient(id) {
  const patient = patientById(id);
  if (!confirm(`Excluir ${patient.name}? Esta acao remove agenda e prontuario vinculados no app local.`)) return;
  state.patients = state.patients.filter((p) => p.id !== id);
  state.appointments = state.appointments.filter((a) => a.patientId !== id);
  state.records = state.records.filter((r) => r.patientId !== id);
  if (editingPatientId === id) resetPatientForm();
  saveState();
  renderAll();
  toast("Paciente excluido.");
}

function resetPatientForm() {
  editingPatientId = null;
  byId("patientForm").reset();
  byId("patientFormTitle").textContent = "Paciente";
  byId("patientSubmitLabel").textContent = "Cadastrar";
  fillInsuranceSelect("patientInsurance");
}

function selectPatient(id) {
  byId("recordPatient").value = id;
  byId("messagePatient").value = id;
  openView("prontuario");
  renderRecordPatientSummary();
  renderRecords();
  renderMessagePreview();
}

function deleteInsurancePlan(id) {
  const plan = state.insurancePlans.find((item) => item.id === id);
  if (!plan) return;
  if (state.patients.some((patient) => patient.insurance === plan.name)) {
    toast("Este plano esta vinculado a pacientes. Altere os pacientes antes de excluir.");
    return;
  }
  state.insurancePlans = state.insurancePlans.filter((item) => item.id !== id);
  saveState();
  populateSelects();
  renderInsurancePlans();
  toast("Plano removido.");
}

function exportFinanceCsv() {
  const header = "descricao,tipo,valor,vencimento,status,metodo\n";
  const body = state.finance.map((f) => [f.description, f.type, f.amount, f.dueDate, f.status, f.paymentMethod || ""].join(",")).join("\n");
  downloadBlob(header + body, "clinicou-financeiro.csv", "text/csv;charset=utf-8");
}

function exportBackup() {
  downloadBlob(JSON.stringify(state, null, 2), `clinicou-backup-${todayIso}.json`, "application/json");
  toast("Backup exportado.");
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeState(JSON.parse(reader.result));
      saveState();
      renderAll();
      toast("Backup importado.");
    } catch {
      toast("Arquivo de backup invalido.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function lastClinicVisit(patientId) {
  const appointmentDates = state.appointments
    .filter((a) => a.patientId === patientId && a.date <= todayIso)
    .map((a) => `${a.date}T${a.time || "00:00"}:00`);
  const recordDates = state.records.filter((r) => r.patientId === patientId).map((r) => r.createdAt);
  return [...appointmentDates, ...recordDates].sort().pop();
}

function patientById(id) {
  return state.patients.find((p) => p.id === id) || { id: "", name: "Paciente", phone: "", noShow: 0, insurance: "Particular" };
}

function professionalById(id) {
  return state.professionals.find((p) => p.id === id) || { id: "", name: "Profissional", commission: 0, start: "08:00", end: "18:00" };
}

function serviceById(id) {
  return state.services.find((s) => s.id === id) || { id: "", name: "Servico", duration: 30, price: 0 };
}

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function emptyState(text) {
  return `<div class="suggestion-box">${escapeHtml(text)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function toast(message) {
  const node = byId("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3200);
}

window.markPaid = markPaid;
window.selectPatient = selectPatient;
window.editPatient = editPatient;
window.deletePatient = deletePatient;
window.deleteInsurancePlan = deleteInsurancePlan;
