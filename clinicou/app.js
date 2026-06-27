const SUPABASE_URL = "https://yhftbfpkuchxfblhfvva.supabase.co";
const SUPABASE_KEY = "sb_publishable_paT5SW04fvUuJzui4t5COQ_nVI9gJxY";
const STORAGE_KEY = "clinicou_state_v3";

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
  expense: "Saida",
  active: "Ativo",
  suspended: "Suspenso",
  doctor: "Medico",
  nurse: "Enfermeiro",
  assistant: "Assistente",
  cleaning: "Servicos gerais",
  secretary: "Secretario"
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
    { id: "p1", name: "Marina Lopes", cpf: "284.719.630-02", phone: "(92) 98812-4401", email: "marina@email.com", risk: "low", insurance: "Particular", noShow: 4 },
    { id: "p2", name: "Rafael Nunes", cpf: "735.418.920-11", phone: "(92) 98177-2210", email: "rafael@email.com", risk: "medium", insurance: "Unimed", noShow: 18 },
    { id: "p3", name: "Claudia Sales", cpf: "617.204.830-57", phone: "(92) 99910-8122", email: "claudia@email.com", risk: "high", insurance: "Bradesco Saude", noShow: 35 },
    { id: "p4", name: "Joao Pedro", cpf: "092.538.160-80", phone: "(92) 98422-7764", email: "joao@email.com", risk: "low", insurance: "Particular", noShow: 7 }
  ],
  employees: [
    { id: "e1", professionalId: "dr1", name: "Dra. Ana Beatriz", role: "doctor", crm: "CRM-AM 12345", specialty: "Clinica geral", phone: "(92) 98800-1100", email: "ana@clinica.com", commission: 35, start: "08:00", end: "17:00", status: "active" },
    { id: "e2", professionalId: "dr2", name: "Dr. Marcos Lima", role: "doctor", crm: "CRM-AM 22334", specialty: "Odontologia", phone: "(92) 98800-2200", email: "marcos@clinica.com", commission: 40, start: "09:00", end: "18:00", status: "active" },
    { id: "e3", professionalId: "dr3", name: "Dra. Helena Costa", role: "doctor", crm: "CRM-AM 33445", specialty: "Estetica", phone: "(92) 98800-3300", email: "helena@clinica.com", commission: 30, start: "10:00", end: "19:00", status: "active" },
    { id: "e4", name: "Beatriz Souza", role: "secretary", crm: "", specialty: "Recepcao", phone: "(92) 98800-4400", email: "recepcao@clinica.com", commission: 0, start: "08:00", end: "17:00", status: "active" }
  ],
  professionals: [
    { id: "dr1", employeeId: "e1", name: "Dra. Ana Beatriz", specialty: "Clinica geral", commission: 35, start: "08:00", end: "17:00" },
    { id: "dr2", employeeId: "e2", name: "Dr. Marcos Lima", specialty: "Odontologia", commission: 40, start: "09:00", end: "18:00" },
    { id: "dr3", employeeId: "e3", name: "Dra. Helena Costa", specialty: "Estetica", commission: 30, start: "10:00", end: "19:00" }
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
    { id: "c3", name: "Pos-procedimento estetica", channel: "WhatsApp", audience: "Estetica", status: "Ativa", sent: 26 }
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
let editingEmployeeId = null;
let editingInsurancePlanId = null;

document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  wireEvents();
  setDefaultDates();
  syncProfessionalsFromEmployees();
  renderAll();
  lucide.createIcons();
  await enforceAuth();
});

function loadState() {
  try {
    const savedV3 = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (savedV3) return normalizeState(savedV3);
    const savedV2 = JSON.parse(localStorage.getItem("clinicou_state_v2"));
    return normalizeState(savedV2 || {});
  } catch {
    return structuredClone(seedState);
  }
}

function normalizeState(saved) {
  const merged = { ...structuredClone(seedState), ...saved };
  merged.tenant = { ...seedState.tenant, ...(saved.tenant || {}) };
  merged.insurancePlans = normalizeInsurancePlans(saved.insurancePlans);
  merged.patients = normalizePatients(saved.patients);
  merged.professionals = Array.isArray(saved.professionals) ? saved.professionals : seedState.professionals;
  merged.employees = normalizeEmployees(saved.employees, merged.professionals);
  merged.services = Array.isArray(saved.services) ? saved.services : seedState.services;
  merged.appointments = Array.isArray(saved.appointments) ? saved.appointments : seedState.appointments;
  merged.finance = Array.isArray(saved.finance) ? saved.finance : seedState.finance;
  merged.records = Array.isArray(saved.records) ? saved.records : seedState.records;
  merged.campaigns = Array.isArray(saved.campaigns) ? saved.campaigns : seedState.campaigns;
  merged.audit = Array.isArray(saved.audit) ? saved.audit : seedState.audit;
  return merged;
}

function normalizeInsurancePlans(plans) {
  return (Array.isArray(plans) ? plans : seedState.insurancePlans).map((plan) => ({
    active: true,
    ...plan
  }));
}

function normalizePatients(patients) {
  return (Array.isArray(patients) ? patients : seedState.patients).map((patient, index) => ({
    ...patient,
    cpf: formatCpf(patient.cpf || patient.document || seedState.patients[index]?.cpf || ""),
    phone: formatPhone(patient.phone || patient.whatsapp || "")
  }));
}

function normalizeEmployees(employees, professionals) {
  if (Array.isArray(employees)) {
    return employees.map((employee) => ({
      crm: "",
      phone: "",
      email: "",
      commission: 0,
      start: "08:00",
      end: "18:00",
      status: "active",
      ...employee,
      phone: formatPhone(employee.phone || "")
    }));
  }

  return (professionals || seedState.professionals).map((pro, index) => ({
    id: `e_from_${pro.id || index}`,
    professionalId: pro.id,
    name: pro.name,
    role: "doctor",
    crm: pro.license || "",
    specialty: pro.specialty || "Clinica geral",
    phone: "",
    email: "",
    commission: Number(pro.commission || pro.commission_percent || 0),
    start: pro.start || "08:00",
    end: pro.end || "18:00",
    status: "active"
  }));
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
  byId("patientCpf")?.addEventListener("input", (event) => event.target.value = formatCpf(event.target.value));
  byId("patientWhatsapp")?.addEventListener("input", (event) => event.target.value = formatPhone(event.target.value));

  byId("recordForm")?.addEventListener("submit", submitRecord);
  byId("recordPatient")?.addEventListener("change", () => {
    renderRecordPatientSummary();
    renderRecords();
    renderRecordSearchResults();
  });
  byId("recordSmartSearch")?.addEventListener("input", renderRecordSearchResults);
  byId("openRecordHistory")?.addEventListener("click", () => openRecordHistory());
  byId("closeRecordHistory")?.addEventListener("click", closeRecordHistory);
  byId("recordHistoryModal")?.addEventListener("click", (event) => {
    if (event.target.id === "recordHistoryModal") closeRecordHistory();
  });
  byId("generateCertificate")?.addEventListener("click", generateCertificate);
  byId("generatePrescription")?.addEventListener("click", generatePrescription);
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", () => copyTextFrom(button.dataset.copyTarget));
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

  byId("employeeForm")?.addEventListener("submit", submitEmployee);
  byId("employeeRole")?.addEventListener("change", updateEmployeeCrmRequirement);
  byId("employeeWhatsapp")?.addEventListener("input", (event) => event.target.value = formatPhone(event.target.value));
  byId("employeeSearch")?.addEventListener("input", renderEmployees);
  byId("resetEmployeeForm")?.addEventListener("click", resetEmployeeForm);

  byId("tenantForm")?.addEventListener("submit", submitTenantName);
  byId("exportBackup")?.addEventListener("click", exportBackup);
  byId("importBackupButton")?.addEventListener("click", () => byId("importBackupFile").click());
  byId("importBackupFile")?.addEventListener("change", importBackup);

  byId("messageTemplate")?.addEventListener("change", renderMessagePreview);
  byId("messagePatient")?.addEventListener("change", renderMessagePreview);
  byId("messagePatientSearch")?.addEventListener("input", renderMessagePatientOptions);
  byId("copyMessageTemplate")?.addEventListener("click", () => copyTextFrom("messagePreview"));
  byId("openWhatsappMessage")?.addEventListener("click", openWhatsappMessage);
  byId("messageForm")?.addEventListener("submit", submitMessage);
  byId("loginButton")?.addEventListener("click", () => auth());
}

function setDefaultDates() {
  if (byId("appointmentDate")) byId("appointmentDate").value = todayIso;
  if (byId("scheduleDateFilter")) byId("scheduleDateFilter").value = todayIso;
  if (document.querySelector("[name='dueDate']")) document.querySelector("[name='dueDate']").value = todayIso;
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
    funcionarios: ["Gestao de equipe", "Funcionarios"],
    crm: ["Comunicacao", "WhatsApp e automacoes"],
    admin: ["Administracao", "Backup e clinica"]
  };
  if (!titles[view]) return;
  byId("viewEyebrow").textContent = titles[view][0];
  byId("viewTitle").textContent = titles[view][1];
  lucide.createIcons();
}

function renderAll() {
  byId("tenantName").textContent = state.tenant.name;
  syncProfessionalsFromEmployees();
  populateSelects();
  renderMetrics();
  renderTimeline();
  renderInsights();
  renderCashflow();
  renderCrmQueue();
  renderSchedule();
  renderPatients();
  renderRecordPatientSummary();
  renderRecordSearchResults();
  renderRecords();
  renderFinance();
  renderInsurancePlans();
  renderEmployees();
  renderCampaigns();
  renderMessagePatientOptions();
  renderMessagePreview();
  updateCommissionPreview();
  updateEmployeeCrmRequirement();
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

function syncProfessionalsFromEmployees() {
  state.professionals = state.employees
    .filter((employee) => employee.role === "doctor" && employee.status === "active")
    .map((employee) => ({
      id: employee.professionalId || employee.id,
      employeeId: employee.id,
      name: employee.name,
      specialty: employee.specialty || "Medicina",
      license: employee.crm || "",
      commission: Number(employee.commission || 0),
      start: employee.start || "08:00",
      end: employee.end || "18:00"
    }));
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
    { title: `${idlePros.length} medico(s) com janela livre`, sub: "Use o motor de encaixe para ocupar horarios.", color: "low" }
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
      return `<div class="queue-item"><i data-lucide="message-square-text"></i><div><p class="item-title">${escapeHtml(patient.name)}</p><p class="item-sub">${formatDate(a.date)} as ${a.time} - ${escapeHtml(patient.phone)}</p></div><span class="badge ${a.status}">${statusLabel[a.status]}</span></div>`;
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
  byId("scheduleBoard").innerHTML = byPro.join("") || emptyState("Cadastre medicos ativos na tela Funcionarios para montar a agenda.");
  lucide.createIcons();
}

function renderPatients() {
  const query = normalizeSearch(byId("patientSearch")?.value || "");
  const rows = state.patients
    .filter((p) => normalizeSearch(`${p.name} ${p.phone} ${p.cpf} ${p.email} ${p.insurance}`).includes(query))
    .map((p) => `<div class="table-row patients-row">
      <div><strong>${escapeHtml(p.name)}</strong><div class="table-label">${escapeHtml(p.email || "Sem e-mail")}</div></div>
      <div>${escapeHtml(p.phone)}<div class="table-label">CPF ${escapeHtml(p.cpf || "Nao informado")}</div></div>
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
  if (!patient.id) {
    byId("recordPatientSummary").innerHTML = emptyState("Cadastre um paciente para iniciar o prontuario.");
    return;
  }
  const lastVisit = lastClinicVisit(patient.id);
  const recordCount = state.records.filter((record) => record.patientId === patient.id).length;
  byId("recordPatientSummary").innerHTML = `<div class="summary-card">
    <div>
      <span>Paciente selecionado</span>
      <strong>${escapeHtml(patient.name)}</strong>
      <small>${escapeHtml(patient.phone || "Sem WhatsApp")} - CPF ${escapeHtml(patient.cpf || "Nao informado")}</small>
    </div>
    <div>
      <span>Ultima passagem</span>
      <strong>${lastVisit ? formatDateTime(lastVisit) : "Sem historico"}</strong>
      <small>${recordCount} evolucao(oes) no prontuario</small>
    </div>
  </div>`;
}

function renderRecordSearchResults() {
  const node = byId("recordSearchResults");
  if (!node) return;
  const query = normalizeSearch(byId("recordSmartSearch")?.value || "");
  const selected = byId("recordPatient")?.value;
  const matches = state.patients
    .filter((patient) => !query || normalizeSearch(`${patient.name} ${patient.phone} ${patient.cpf}`).includes(query))
    .slice(0, 6);

  node.innerHTML = matches.map((patient) => `<button type="button" class="${patient.id === selected ? "active" : ""}" onclick="selectRecordPatient('${patient.id}')">
    <strong>${escapeHtml(patient.name)}</strong>
    <span>${escapeHtml(patient.phone || "Sem WhatsApp")} - CPF ${escapeHtml(patient.cpf || "Nao informado")}</span>
  </button>`).join("") || emptyState("Nenhum paciente encontrado por nome, WhatsApp ou CPF.");
  lucide.createIcons();
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
    <button class="icon-button" onclick="openRecordHistory('${r.id}')" aria-label="Visualizar historico"><i data-lucide="eye"></i></button>
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
    const status = plan.active ? "active" : "suspended";
    return `<div class="plan-item">
      <i data-lucide="${plan.active ? "badge-check" : "circle-pause"}"></i>
      <div><p class="item-title">${escapeHtml(plan.name)}</p><p class="item-sub">${escapeHtml(plan.contact || "Sem contato")} - ${patients} paciente(s)</p></div>
      <span class="badge ${status}">${statusLabel[status]}</span>
      <div class="row-actions">
        <button class="icon-button" onclick="editInsurancePlan('${plan.id}')" aria-label="Editar plano"><i data-lucide="pencil"></i></button>
        <button class="icon-button" onclick="toggleInsurancePlan('${plan.id}')" aria-label="Suspender plano"><i data-lucide="${plan.active ? "pause" : "play"}"></i></button>
        <button class="icon-button danger" onclick="deleteInsurancePlan('${plan.id}')" aria-label="Excluir plano"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`;
  });
  byId("insurancePlansList").innerHTML = list.join("") || emptyState("Nenhum plano cadastrado.");
  lucide.createIcons();
}

function renderEmployees() {
  const node = byId("employeesTable");
  if (!node) return;
  const query = normalizeSearch(byId("employeeSearch")?.value || "");
  const rows = state.employees
    .filter((employee) => normalizeSearch(`${employee.name} ${employee.role} ${employee.crm} ${employee.specialty} ${employee.phone} ${employee.email}`).includes(query))
    .map((employee) => `<div class="table-row employee-row">
      <div><strong>${escapeHtml(employee.name)}</strong><div class="table-label">${statusLabel[employee.role]}${employee.crm ? ` - ${escapeHtml(employee.crm)}` : ""}</div></div>
      <div>${escapeHtml(employee.phone || "Sem WhatsApp")}<div class="table-label">${escapeHtml(employee.email || "Sem e-mail")}</div></div>
      <div><span class="badge ${employee.status}">${statusLabel[employee.status]}</span></div>
      <div class="row-actions">
        <button class="icon-button" onclick="editEmployee('${employee.id}')" aria-label="Editar funcionario"><i data-lucide="pencil"></i></button>
        <button class="icon-button" onclick="toggleEmployeeStatus('${employee.id}')" aria-label="Suspender funcionario"><i data-lucide="${employee.status === "active" ? "pause" : "play"}"></i></button>
        <button class="icon-button danger" onclick="deleteEmployee('${employee.id}')" aria-label="Excluir funcionario"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`);
  node.innerHTML = rows.join("") || emptyState("Nenhum funcionario encontrado.");
  lucide.createIcons();
}

function renderCampaigns() {
  byId("campaignList").innerHTML = state.campaigns.map((c) => `<div class="campaign-item">
    <i data-lucide="radio"></i>
    <div><p class="item-title">${escapeHtml(c.name)}</p><p class="item-sub">${escapeHtml(c.channel)} - ${escapeHtml(c.audience)} - ${c.sent} envios</p></div>
    <span class="badge ${c.status === "Ativa" ? "confirmed" : "scheduled"}">${c.status}</span>
  </div>`).join("");
}

function renderMessagePatientOptions() {
  const select = byId("messagePatient");
  if (!select) return;
  const current = select.value;
  const query = normalizeSearch(byId("messagePatientSearch")?.value || "");
  const patients = state.patients.filter((patient) => !query || normalizeSearch(`${patient.name} ${patient.cpf} ${patient.phone}`).includes(query));
  select.innerHTML = patients.map((patient) => `<option value="${patient.id}">${escapeHtml(patient.name)} - ${escapeHtml(patient.phone || patient.cpf || "")}</option>`).join("");
  if (patients.some((patient) => patient.id === current)) select.value = current;
  renderMessagePreview();
}

function submitAppointment(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (!data.patientId || !data.professionalId || !data.serviceId) {
    toast("Selecione paciente, medico e servico.");
    return;
  }
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
  data.name = data.name.trim();
  data.cpf = formatCpf(data.cpf);
  data.phone = formatPhone(data.phone);
  if (!digitsOnly(data.cpf)) {
    toast("Informe o CPF do paciente.");
    return;
  }
  const duplicated = state.patients.some((patient) => {
    if (patient.id === editingPatientId) return false;
    return normalizeName(patient.name) === normalizeName(data.name) && digitsOnly(patient.cpf) === digitsOnly(data.cpf);
  });
  if (duplicated) {
    toast("Ja existe paciente cadastrado com o mesmo nome e CPF.");
    return;
  }

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
  if (!record.patientId) {
    toast("Selecione um paciente para salvar o prontuario.");
    return;
  }
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
  const name = data.name.trim();
  if (!name) return;
  const duplicate = state.insurancePlans.some((plan) => normalizeName(plan.name) === normalizeName(name) && plan.id !== editingInsurancePlanId);
  if (duplicate) {
    toast("Ja existe plano de saude com este nome.");
    return;
  }

  if (editingInsurancePlanId) {
    const plan = state.insurancePlans.find((item) => item.id === editingInsurancePlanId);
    const oldName = plan.name;
    Object.assign(plan, { name, contact: data.contact, active: plan.active });
    state.patients.forEach((patient) => {
      if (patient.insurance === oldName) patient.insurance = name;
    });
    toast("Plano de saude atualizado.");
  } else {
    state.insurancePlans.push({ id: uid("ip"), active: true, name, contact: data.contact });
    toast("Plano de saude cadastrado.");
  }
  editingInsurancePlanId = null;
  event.target.reset();
  saveState();
  populateSelects();
  renderInsurancePlans();
  renderPatients();
}

function submitEmployee(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  data.name = data.name.trim();
  data.phone = formatPhone(data.phone);
  data.commission = Number(data.commission || 0);
  if (data.role === "doctor" && !data.crm.trim()) {
    toast("Informe o CRM para cadastrar medico.");
    return;
  }

  if (editingEmployeeId) {
    const employee = state.employees.find((item) => item.id === editingEmployeeId);
    const professionalId = employee.professionalId || uid("dr");
    Object.assign(employee, data, { professionalId: data.role === "doctor" ? professionalId : employee.professionalId });
    toast("Funcionario atualizado.");
  } else {
    state.employees.push({
      id: uid("e"),
      professionalId: data.role === "doctor" ? uid("dr") : "",
      ...data
    });
    toast("Funcionario cadastrado.");
  }

  syncProfessionalsFromEmployees();
  saveState();
  resetEmployeeForm();
  renderAll();
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
  state.audit.unshift({ id: uid("lg"), action: "Mensagem registrada", actor: "CRM", target: patient.name, at: "Agora" });
  saveState();
  renderAll();
  toast("Envio registrado na auditoria.");
}

function suggestSlot() {
  const professional = professionalById(byId("appointmentProfessional").value);
  const service = serviceById(byId("appointmentService").value);
  const date = byId("appointmentDate").value || todayIso;
  const busy = state.appointments.filter((a) => a.professionalId === professional.id && a.date === date).map((a) => a.time);
  const startHour = Number((professional.start || "08:00").slice(0, 2));
  const endHour = Number((professional.end || "18:00").slice(0, 2));
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
    byId("slotSuggestion").textContent = "Agenda cheia para este medico na data escolhida.";
    return;
  }
  byId("appointmentTime").value = suggestion;
  byId("slotSuggestion").textContent = `${suggestion} e o melhor encaixe: ${professional.name} tem janela livre e o servico dura ${service.duration} minutos.`;
}

function renderMessagePreview() {
  const patient = patientById(byId("messagePatient")?.value || state.patients[0]?.id);
  const template = byId("messageTemplate")?.value || "confirmacao";
  const next = nextAppointmentForPatient(patient.id);
  const dateText = next ? `${formatDate(next.date)} as ${next.time}` : "data combinada";
  const proText = next ? professionalById(next.professionalId).name : "nossa equipe";
  const serviceText = next ? serviceById(next.serviceId).name : "seu atendimento";
  const messages = {
    confirmacao: `Ola, ${patient.name}. Passando para confirmar sua consulta de ${serviceText} na ${state.tenant.name}, marcada para ${dateText} com ${proText}. Responda SIM para confirmar ou REAGENDAR para escolher outro horario.`,
    confirmacao_dia: `Bom dia, ${patient.name}. Sua consulta na ${state.tenant.name} e hoje, ${dateText}. Chegue com alguns minutos de antecedencia. Qualquer imprevisto, fale conosco por aqui.`,
    cancelada: `Ola, ${patient.name}. Precisamos cancelar sua consulta de ${serviceText} marcada para ${dateText}. Sentimos pelo transtorno e podemos reagendar para o melhor horario para voce.`,
    reagendamento: `Ola, ${patient.name}. Temos novas opcoes de horario para seu atendimento na ${state.tenant.name}. Pode nos enviar os melhores periodos para reagendarmos?`,
    preparo: `Ola, ${patient.name}. Para sua consulta de ${serviceText}, traga documentos, exames recentes e lista de medicamentos em uso. Se tiver alguma restricao ou duvida, responda esta mensagem.`,
    pos: `Ola, ${patient.name}. Como voce esta se sentindo apos o procedimento? Qualquer desconforto fora do esperado, fale conosco por aqui.`,
    retorno: `Ola, ${patient.name}. Seu retorno preventivo esta chegando. Podemos reservar um horario esta semana?`,
    cobranca: `Ola, ${patient.name}. Identificamos um valor em aberto na ${state.tenant.name}. Podemos te enviar as opcoes de pagamento por aqui?`,
    aniversario: `Ola, ${patient.name}. A equipe da ${state.tenant.name} deseja um feliz aniversario, com muita saude e bons momentos.`
  };
  if (byId("messagePreview")) byId("messagePreview").value = messages[template] || messages.confirmacao;
}

function generateCertificate() {
  const patient = patientById(byId("recordPatient").value);
  const context = byId("certificateContext").value.trim();
  const lastRecord = latestRecordForPatient(patient.id);
  const body = [
    "ATESTADO MEDICO",
    "",
    `Atesto, para os devidos fins, que ${patient.name}, CPF ${patient.cpf || "nao informado"}, esteve em atendimento na ${state.tenant.name} em ${new Date().toLocaleDateString("pt-BR")}.`,
    context || `Conforme avaliacao clinica, recomenda-se repouso e acompanhamento conforme orientacao profissional.`,
    lastRecord?.diagnosis ? `Referencia clinica: ${lastRecord.diagnosis}.` : "",
    "",
    "Este documento deve ser revisado, assinado e carimbado pelo profissional responsavel antes do uso.",
    "",
    `${state.tenant.name}`
  ].filter(Boolean).join("\n");
  byId("certificateOutput").value = body;
  toast("Atestado gerado para revisao profissional.");
}

function generatePrescription() {
  const patient = patientById(byId("recordPatient").value);
  const context = byId("prescriptionContext").value.trim();
  const recordPrescription = byId("recordPrescription").value.trim() || latestRecordForPatient(patient.id)?.prescription || "";
  const body = [
    "RECEITA / ORIENTACOES",
    "",
    `Paciente: ${patient.name}`,
    `CPF: ${patient.cpf || "nao informado"}`,
    `Data: ${new Date().toLocaleDateString("pt-BR")}`,
    "",
    context || recordPrescription || "Descrever medicamento, dose, via, frequencia, duracao e orientacoes de seguranca.",
    "",
    "Orientacoes: usar apenas conforme prescricao, observar reacoes adversas e retornar em caso de piora ou duvidas.",
    "",
    "Documento gerado automaticamente para revisao, assinatura e carimbo do profissional responsavel."
  ].join("\n");
  byId("prescriptionOutput").value = body;
  toast("Receita gerada para revisao profissional.");
}

function updateCommissionPreview() {
  const amount = Number(byId("financeAmount")?.value || 0);
  const pro = professionalById(byId("financeProfessional")?.value || "");
  const commission = pro.id ? amount * Number(pro.commission || 0) / 100 : 0;
  if (byId("commissionPreview")) {
    byId("commissionPreview").textContent = pro.id
      ? `Repasse previsto para ${pro.name}: ${money.format(commission)} (${pro.commission}%).`
      : "Selecione um medico para calcular repasse automaticamente.";
  }
}

function updateEmployeeCrmRequirement() {
  const crm = byId("employeeCrm");
  const role = byId("employeeRole")?.value;
  if (!crm) return;
  crm.required = role === "doctor";
  crm.disabled = role !== "doctor";
  if (role !== "doctor") crm.value = "";
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
  byId("patientForm").elements.cpf.value = patient.cpf || "";
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
  selectRecordPatient(id);
  if (byId("messagePatient")) byId("messagePatient").value = id;
  openView("prontuario");
  renderMessagePreview();
}

function selectRecordPatient(id) {
  if (byId("recordPatient")) byId("recordPatient").value = id;
  renderRecordPatientSummary();
  renderRecords();
  renderRecordSearchResults();
}

function editInsurancePlan(id) {
  const plan = state.insurancePlans.find((item) => item.id === id);
  if (!plan) return;
  editingInsurancePlanId = id;
  const form = byId("insurancePlanForm");
  form.elements.name.value = plan.name || "";
  form.elements.contact.value = plan.contact || "";
  openView("convenios");
  toast("Edite os dados do plano e salve.");
}

function toggleInsurancePlan(id) {
  const plan = state.insurancePlans.find((item) => item.id === id);
  if (!plan) return;
  plan.active = !plan.active;
  saveState();
  populateSelects();
  renderInsurancePlans();
  toast(plan.active ? "Plano reativado." : "Plano suspenso.");
}

function deleteInsurancePlan(id) {
  const plan = state.insurancePlans.find((item) => item.id === id);
  if (!plan) return;
  if (state.patients.some((patient) => patient.insurance === plan.name)) {
    toast("Este plano esta vinculado a pacientes. Altere os pacientes antes de excluir.");
    return;
  }
  if (!confirm(`Excluir plano ${plan.name}?`)) return;
  state.insurancePlans = state.insurancePlans.filter((item) => item.id !== id);
  if (editingInsurancePlanId === id) editingInsurancePlanId = null;
  saveState();
  populateSelects();
  renderInsurancePlans();
  toast("Plano removido.");
}

function editEmployee(id) {
  const employee = employeeById(id);
  editingEmployeeId = id;
  const form = byId("employeeForm");
  byId("employeeFormTitle").textContent = "Editar funcionario";
  byId("employeeSubmitLabel").textContent = "Salvar";
  form.elements.name.value = employee.name || "";
  form.elements.role.value = employee.role || "assistant";
  form.elements.status.value = employee.status || "active";
  updateEmployeeCrmRequirement();
  form.elements.crm.value = employee.crm || "";
  form.elements.specialty.value = employee.specialty || "";
  form.elements.phone.value = employee.phone || "";
  form.elements.email.value = employee.email || "";
  form.elements.start.value = employee.start || "08:00";
  form.elements.end.value = employee.end || "18:00";
  form.elements.commission.value = employee.commission || 0;
  openView("funcionarios");
}

function toggleEmployeeStatus(id) {
  const employee = employeeById(id);
  if (!employee.id) return;
  employee.status = employee.status === "active" ? "suspended" : "active";
  syncProfessionalsFromEmployees();
  saveState();
  renderAll();
  toast(employee.status === "active" ? "Funcionario reativado." : "Funcionario suspenso.");
}

function deleteEmployee(id) {
  const employee = employeeById(id);
  if (!employee.id) return;
  const hasAppointments = employee.professionalId && state.appointments.some((appointment) => appointment.professionalId === employee.professionalId);
  if (hasAppointments) {
    toast("Funcionario possui consultas vinculadas. Suspenda em vez de excluir.");
    return;
  }
  if (!confirm(`Excluir funcionario ${employee.name}?`)) return;
  state.employees = state.employees.filter((item) => item.id !== id);
  syncProfessionalsFromEmployees();
  saveState();
  resetEmployeeForm();
  renderAll();
  toast("Funcionario excluido.");
}

function resetEmployeeForm() {
  editingEmployeeId = null;
  byId("employeeForm").reset();
  byId("employeeFormTitle").textContent = "Funcionario";
  byId("employeeSubmitLabel").textContent = "Cadastrar";
  updateEmployeeCrmRequirement();
}

function openRecordHistory(recordId = "") {
  const patient = patientById(byId("recordPatient")?.value || state.patients[0]?.id);
  const records = state.records
    .filter((record) => record.patientId === patient.id)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const appointments = state.appointments
    .filter((appointment) => appointment.patientId === patient.id)
    .slice()
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  byId("recordHistoryTitle").textContent = `${patient.name} - CPF ${patient.cpf || "nao informado"}`;
  byId("recordHistoryContent").innerHTML = `
    <div class="summary-card">
      <div><span>WhatsApp</span><strong>${escapeHtml(patient.phone || "Sem WhatsApp")}</strong><small>${escapeHtml(patient.insurance || "Particular")}</small></div>
      <div><span>Risco</span><strong>${statusLabel[patient.risk] || "Baixo"}</strong><small>${records.length} registro(s) clinico(s)</small></div>
    </div>
    <h3>Prontuario</h3>
    <div class="record-list">${records.map((record) => historyRecordItem(record, record.id === recordId)).join("") || emptyState("Sem evolucoes cadastradas.")}</div>
    <h3>Consultas</h3>
    <div class="record-list">${appointments.map((appointment) => historyAppointmentItem(appointment)).join("") || emptyState("Sem consultas vinculadas.")}</div>
  `;
  byId("recordHistoryModal").classList.add("open");
  lucide.createIcons();
}

function closeRecordHistory() {
  byId("recordHistoryModal").classList.remove("open");
}

function historyRecordItem(record, highlighted) {
  return `<div class="record-item ${highlighted ? "highlight" : ""}">
    <i data-lucide="file-heart"></i>
    <div>
      <p class="item-title">${formatDateTime(record.createdAt)} - ${escapeHtml(record.diagnosis || "Evolucao")}</p>
      <p class="item-sub">Queixa: ${escapeHtml(record.complaint || "Nao informada")}</p>
      <p class="item-sub">Conduta: ${escapeHtml(record.conduct || "Nao informada")}</p>
      <p class="item-sub">Prescricao: ${escapeHtml(record.prescription || "Nao informada")}</p>
      ${record.followUp ? `<p class="item-sub">Retorno: ${escapeHtml(record.followUp)}</p>` : ""}
    </div>
    <span class="badge confirmed">Salvo</span>
  </div>`;
}

function historyAppointmentItem(appointment) {
  return `<div class="record-item">
    <i data-lucide="calendar-check"></i>
    <div>
      <p class="item-title">${formatDate(appointment.date)} as ${appointment.time} - ${escapeHtml(serviceById(appointment.serviceId).name)}</p>
      <p class="item-sub">${escapeHtml(professionalById(appointment.professionalId).name)}</p>
    </div>
    <span class="badge ${appointment.status}">${statusLabel[appointment.status]}</span>
  </div>`;
}

function openWhatsappMessage() {
  const patient = patientById(byId("messagePatient").value);
  const phone = toBrazilPhone(patient.phone);
  if (!phone) {
    toast("Paciente sem WhatsApp cadastrado.");
    return;
  }
  const message = encodeURIComponent(byId("messagePreview").value);
  window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener");
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
      syncProfessionalsFromEmployees();
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

function latestRecordForPatient(patientId) {
  return state.records
    .filter((record) => record.patientId === patientId)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function nextAppointmentForPatient(patientId) {
  return state.appointments
    .filter((appointment) => appointment.patientId === patientId && appointment.date >= todayIso)
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
}

function patientById(id) {
  return state.patients.find((p) => p.id === id) || { id: "", name: "Paciente", cpf: "", phone: "", noShow: 0, insurance: "Particular", risk: "low" };
}

function professionalById(id) {
  const pro = state.professionals.find((p) => p.id === id);
  if (pro) return pro;
  const employee = state.employees.find((item) => item.professionalId === id);
  return employee ? { id, name: employee.name, specialty: employee.specialty, commission: employee.commission, start: employee.start, end: employee.end } : { id: "", name: "Profissional", commission: 0, start: "08:00", end: "18:00" };
}

function employeeById(id) {
  return state.employees.find((employee) => employee.id === id) || { id: "", name: "" };
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

function formatCpf(value) {
  const digits = digitsOnly(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value) {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function normalizeSearch(value) {
  return normalizeName(value).replace(/[^\w\s]/g, "");
}

function toBrazilPhone(value) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function copyTextFrom(id) {
  const node = byId(id);
  const text = node?.value || node?.textContent || "";
  if (!text.trim()) {
    toast("Nada para copiar.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Texto copiado.");
  } catch {
    node.select?.();
    document.execCommand("copy");
    toast("Texto copiado.");
  }
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
window.selectRecordPatient = selectRecordPatient;
window.editPatient = editPatient;
window.deletePatient = deletePatient;
window.editInsurancePlan = editInsurancePlan;
window.toggleInsurancePlan = toggleInsurancePlan;
window.deleteInsurancePlan = deleteInsurancePlan;
window.editEmployee = editEmployee;
window.toggleEmployeeStatus = toggleEmployeeStatus;
window.deleteEmployee = deleteEmployee;
window.openRecordHistory = openRecordHistory;
