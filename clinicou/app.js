const SUPABASE_URL = "https://yhftbfpkuchxfblhfvva.supabase.co";
const SUPABASE_KEY = "sb_publishable_paT5SW04fvUuJzui4t5COQ_nVI9gJxY";
const STORAGE_KEY = "clinicou_demo_state_v1";

const statusLabel = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Na recepção",
  in_service: "Em atendimento",
  finished: "Finalizado",
  no_show: "Faltou",
  open: "Aberto",
  paid: "Pago",
  overdue: "Vencido",
  low: "Baixo",
  medium: "Médio",
  high: "Alto"
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const todayIso = new Date().toISOString().slice(0, 10);

const seedState = {
  tenant: { id: "demo-clinic", name: "Clínica Aurora", plan: "Premium", mrr: 1290 },
  patients: [
    { id: "p1", name: "Marina Lopes", phone: "(92) 98812-4401", email: "marina@email.com", risk: "low", insurance: "Particular", noShow: 4 },
    { id: "p2", name: "Rafael Nunes", phone: "(92) 98177-2210", email: "rafael@email.com", risk: "medium", insurance: "Unimed", noShow: 18 },
    { id: "p3", name: "Cláudia Sales", phone: "(92) 99910-8122", email: "claudia@email.com", risk: "high", insurance: "Bradesco", noShow: 35 },
    { id: "p4", name: "João Pedro", phone: "(92) 98422-7764", email: "joao@email.com", risk: "low", insurance: "Particular", noShow: 7 }
  ],
  professionals: [
    { id: "dr1", name: "Dra. Ana Beatriz", specialty: "Clínica geral", commission: 35, start: "08:00", end: "17:00" },
    { id: "dr2", name: "Dr. Marcos Lima", specialty: "Odontologia", commission: 40, start: "09:00", end: "18:00" },
    { id: "dr3", name: "Dra. Helena Costa", specialty: "Estética", commission: 30, start: "10:00", end: "19:00" }
  ],
  services: [
    { id: "s1", name: "Consulta inicial", duration: 40, price: 220, specialty: "Clínica geral" },
    { id: "s2", name: "Limpeza odontológica", duration: 50, price: 280, specialty: "Odontologia" },
    { id: "s3", name: "Retorno pós-procedimento", duration: 25, price: 0, specialty: "Estética" },
    { id: "s4", name: "Toxina botulínica", duration: 60, price: 890, specialty: "Estética" }
  ],
  appointments: [
    { id: "a1", patientId: "p1", professionalId: "dr1", serviceId: "s1", date: todayIso, time: "08:30", status: "confirmed" },
    { id: "a2", patientId: "p2", professionalId: "dr2", serviceId: "s2", date: todayIso, time: "10:00", status: "waiting" },
    { id: "a3", patientId: "p3", professionalId: "dr3", serviceId: "s4", date: todayIso, time: "14:00", status: "scheduled" },
    { id: "a4", patientId: "p4", professionalId: "dr1", serviceId: "s1", date: addDays(1), time: "09:20", status: "scheduled" }
  ],
  finance: [
    { id: "f1", description: "Consulta Marina Lopes", amount: 220, type: "income", dueDate: todayIso, status: "paid", professionalId: "dr1" },
    { id: "f2", description: "Limpeza Rafael Nunes", amount: 280, type: "income", dueDate: todayIso, status: "open", professionalId: "dr2" },
    { id: "f3", description: "Materiais odontológicos", amount: 380, type: "expense", dueDate: addDays(2), status: "open", professionalId: "" },
    { id: "f4", description: "Toxina botulínica", amount: 890, type: "income", dueDate: addDays(3), status: "open", professionalId: "dr3" }
  ],
  records: [
    { id: "r1", patientId: "p1", template: "geral", complaint: "Paciente relata melhora da dor. Conduta mantida.", createdAt: new Date().toISOString() }
  ],
  campaigns: [
    { id: "c1", name: "Confirmação D-1", channel: "WhatsApp", audience: "Consultas de amanhã", status: "Ativa", sent: 42 },
    { id: "c2", name: "Retorno semestral", channel: "WhatsApp", audience: "Odontologia", status: "Pausada", sent: 18 },
    { id: "c3", name: "Pós-procedimento estética", channel: "E-mail", audience: "Estética", status: "Ativa", sent: 26 }
  ],
  audit: [
    { id: "lg1", action: "Visualização de prontuário", actor: "Dra. Ana Beatriz", target: "Marina Lopes", at: "Hoje 08:14" },
    { id: "lg2", action: "Alteração financeira", actor: "Admin", target: "Limpeza Rafael Nunes", at: "Hoje 09:02" }
  ]
};

let state = loadState();
let supabaseClient = null;
let currentStatusFilter = "all";

document.addEventListener("DOMContentLoaded", () => {
  supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  wireEvents();
  setDefaultDates();
  renderAll();
  lucide.createIcons();
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...structuredClone(seedState), ...saved } : structuredClone(seedState);
  } catch {
    return structuredClone(seedState);
  }
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
  document.getElementById("menuToggle").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
  document.getElementById("syncButton").addEventListener("click", () => toggleAuth(true));
  document.getElementById("closeAuth").addEventListener("click", () => toggleAuth(false));
  document.getElementById("newAppointmentButton").addEventListener("click", () => openView("agenda"));
  document.getElementById("suggestSlotButton").addEventListener("click", suggestSlot);
  document.getElementById("appointmentForm").addEventListener("submit", submitAppointment);
  document.getElementById("patientForm").addEventListener("submit", submitPatient);
  document.getElementById("recordForm").addEventListener("submit", submitRecord);
  document.getElementById("financeForm").addEventListener("submit", submitFinance);
  document.getElementById("recordTemplate").addEventListener("change", renderDynamicFields);
  document.getElementById("patientSearch").addEventListener("input", renderPatients);
  document.getElementById("messageTemplate").addEventListener("change", renderMessagePreview);
  document.getElementById("messagePatient").addEventListener("change", renderMessagePreview);
  document.getElementById("messageForm").addEventListener("submit", submitMessage);
  document.getElementById("loginButton").addEventListener("click", () => auth("login"));
  document.getElementById("signupButton").addEventListener("click", () => auth("signup"));
  document.getElementById("copySqlPath").addEventListener("click", () => toast("Schema: clinicou/supabase/schema.sql"));
  document.getElementById("exportFinance").addEventListener("click", exportFinanceCsv);
}

function setDefaultDates() {
  document.getElementById("appointmentDate").value = todayIso;
  document.querySelector("[name='dueDate']").value = todayIso;
}

function openView(view) {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === view));
  document.querySelector(".sidebar").classList.remove("open");
  const titles = {
    dashboard: ["Operação de hoje", "Visão geral"],
    agenda: ["Agenda inteligente", "Consultas e encaixes"],
    pacientes: ["CRM clínico", "Pacientes"],
    prontuario: ["Prontuário eletrônico", "PEP adaptável"],
    financeiro: ["Controle financeiro", "Receitas e repasses"],
    crm: ["Comunicação", "WhatsApp e automações"],
    admin: ["SaaS Vendor", "Administração"]
  };
  document.getElementById("viewEyebrow").textContent = titles[view][0];
  document.getElementById("viewTitle").textContent = titles[view][1];
  lucide.createIcons();
}

function renderAll() {
  document.getElementById("tenantName").textContent = state.tenant.name;
  populateSelects();
  renderMetrics();
  renderTimeline();
  renderInsights();
  renderCashflow();
  renderCrmQueue();
  renderSchedule();
  renderPatients();
  renderDynamicFields();
  renderRecords();
  renderFinance();
  renderCampaigns();
  renderPlans();
  renderAudit();
  renderBackendChecks();
  renderMessagePreview();
  lucide.createIcons();
}

function populateSelects() {
  fillSelect("appointmentPatient", state.patients, "name");
  fillSelect("recordPatient", state.patients, "name");
  fillSelect("messagePatient", state.patients, "name");
  fillSelect("appointmentProfessional", state.professionals, "name");
  fillSelect("financeProfessional", [{ id: "", name: "Sem repasse" }, ...state.professionals], "name");
  fillSelect("appointmentService", state.services, "name");
}

function fillSelect(id, items, field) {
  const select = document.getElementById(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = items.map((item) => `<option value="${item.id}">${escapeHtml(item[field])}</option>`).join("");
  if (items.some((item) => item.id === current)) select.value = current;
}

function renderMetrics() {
  const today = state.appointments.filter((a) => a.date === todayIso);
  const confirmed = today.filter((a) => ["confirmed", "waiting", "in_service", "finished"].includes(a.status)).length;
  const revenue = state.finance.filter((f) => f.type === "income" && f.status !== "overdue").reduce((sum, f) => sum + Number(f.amount), 0);
  const risk = today.length ? Math.round(today.reduce((sum, a) => sum + patientById(a.patientId).noShow, 0) / today.length) : 0;
  document.getElementById("metricToday").textContent = today.length;
  document.getElementById("metricTodaySub").textContent = `${confirmed} confirmadas`;
  document.getElementById("metricRevenue").textContent = money.format(revenue);
  document.getElementById("metricNoShow").textContent = `${risk}%`;
  document.getElementById("metricMrr").textContent = money.format(state.tenant.mrr);
}

function renderTimeline() {
  const items = state.appointments
    .filter((a) => a.date === todayIso)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((a) => timelineItem(a));
  document.getElementById("todayTimeline").innerHTML = items.join("") || emptyState("Nenhuma consulta para hoje.");
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
    { title: `${highRisk.length} consulta(s) com risco de falta`, sub: "Enviar confirmação ativa pelo WhatsApp.", color: "high" },
    { title: `${openFinance.length} cobrança(s) em aberto`, sub: "Priorize recebíveis antes do fechamento.", color: "medium" },
    { title: `${idlePros.length} profissional(is) com janela livre`, sub: "Use o motor de encaixe para ocupar horários.", color: "low" }
  ];
  document.getElementById("insightsList").innerHTML = insights.map((item) => `<div class="insight-item">
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
  document.getElementById("cashflowBars").innerHTML = rows.join("");
}

function renderCrmQueue() {
  const queue = state.appointments
    .filter((a) => ["scheduled", "confirmed"].includes(a.status))
    .slice(0, 4)
    .map((a) => {
      const patient = patientById(a.patientId);
      return `<div class="queue-item"><i data-lucide="message-square-text"></i><div><p class="item-title">${escapeHtml(patient.name)}</p><p class="item-sub">${a.date} às ${a.time} · ${patient.phone}</p></div><span class="badge ${a.status}">${statusLabel[a.status]}</span></div>`;
    });
  document.getElementById("crmQueue").innerHTML = queue.join("") || emptyState("Nenhuma confirmação pendente.");
}

function renderSchedule() {
  const byPro = state.professionals.map((pro) => {
    const appts = state.appointments
      .filter((a) => a.professionalId === pro.id)
      .filter((a) => currentStatusFilter === "all" || a.status === currentStatusFilter)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    const cards = appts.map((a) => `<div class="appt-card">
      <strong>${a.time} · ${escapeHtml(patientById(a.patientId).name)}</strong>
      <span>${a.date} · ${escapeHtml(serviceById(a.serviceId).name)}</span>
      <span class="badge ${a.status}">${statusLabel[a.status]}</span>
    </div>`).join("");
    return `<div class="pro-column"><div class="pro-heading">${escapeHtml(pro.name)}<p class="item-sub">${escapeHtml(pro.specialty)}</p></div>${cards || emptyState("Sem consultas.")}</div>`;
  });
  document.getElementById("scheduleBoard").innerHTML = byPro.join("");
}

function renderPatients() {
  const query = document.getElementById("patientSearch")?.value?.toLowerCase() || "";
  const rows = state.patients
    .filter((p) => `${p.name} ${p.phone} ${p.email}`.toLowerCase().includes(query))
    .map((p) => `<div class="table-row">
      <div><strong>${escapeHtml(p.name)}</strong><div class="table-label">${escapeHtml(p.email || "Sem e-mail")}</div></div>
      <div>${escapeHtml(p.phone)}<div class="table-label">${escapeHtml(p.insurance || "Particular")}</div></div>
      <div><span class="badge ${p.risk}">${statusLabel[p.risk]}</span></div>
      <button class="icon-button" onclick="selectPatient('${p.id}')" aria-label="Selecionar paciente"><i data-lucide="arrow-right"></i></button>
    </div>`);
  document.getElementById("patientsTable").innerHTML = rows.join("") || emptyState("Nenhum paciente encontrado.");
  lucide.createIcons();
}

function renderDynamicFields() {
  const template = document.getElementById("recordTemplate").value;
  const fields = {
    geral: ["Pressão arterial", "Hipótese diagnóstica", "Prescrição"],
    odontologia: ["Dente/região", "Procedimento por dente", "Odontograma"],
    estetica: ["Área facial/corporal", "Produto utilizado", "Registro antes/depois"]
  }[template];
  document.getElementById("dynamicFields").innerHTML = fields.map((field) => `<label>${field}<input data-dynamic-field="${field}" placeholder="${field}"></label>`).join("");
}

function renderRecords() {
  document.getElementById("recordsList").innerHTML = state.records.slice().reverse().map((r) => `<div class="record-item">
    <i data-lucide="file-heart"></i>
    <div><p class="item-title">${escapeHtml(patientById(r.patientId).name)} · ${escapeHtml(r.template)}</p><p class="item-sub">${escapeHtml(r.complaint)}</p></div>
    <span class="badge confirmed">${new Date(r.createdAt).toLocaleDateString("pt-BR")}</span>
  </div>`).join("") || emptyState("Nenhuma evolução registrada.");
}

function renderFinance() {
  const rows = state.finance.map((f) => {
    const pro = professionalById(f.professionalId);
    const commission = pro.id ? Number(f.amount) * Number(pro.commission || 0) / 100 : 0;
    return `<div class="table-row">
      <div><strong>${escapeHtml(f.description)}</strong><div class="table-label">${f.dueDate} · ${f.type === "income" ? "Entrada" : "Saída"}</div></div>
      <div>${money.format(Number(f.amount))}<div class="table-label">Repasse ${money.format(commission)}</div></div>
      <div><span class="badge ${f.status}">${statusLabel[f.status]}</span></div>
      <button class="icon-button" onclick="markPaid('${f.id}')" aria-label="Marcar pago"><i data-lucide="check"></i></button>
    </div>`;
  });
  document.getElementById("financeTable").innerHTML = rows.join("");
  lucide.createIcons();
}

function renderCampaigns() {
  document.getElementById("campaignList").innerHTML = state.campaigns.map((c) => `<div class="campaign-item">
    <i data-lucide="radio"></i>
    <div><p class="item-title">${escapeHtml(c.name)}</p><p class="item-sub">${escapeHtml(c.channel)} · ${escapeHtml(c.audience)} · ${c.sent} envios</p></div>
    <span class="badge ${c.status === "Ativa" ? "confirmed" : "scheduled"}">${c.status}</span>
  </div>`).join("");
}

function renderPlans() {
  const plans = [
    ["Basic", "3 profissionais · agenda e pacientes", 299],
    ["Pro", "10 profissionais · financeiro e CRM", 690],
    ["Premium", "Ilimitado · PEP avançado e TISS", 1290]
  ];
  document.getElementById("plansList").innerHTML = plans.map((p) => `<div class="plan-item"><i data-lucide="badge-dollar-sign"></i><div><p class="item-title">${p[0]}</p><p class="item-sub">${p[1]}</p></div><strong>${money.format(p[2])}</strong></div>`).join("");
}

function renderAudit() {
  document.getElementById("auditList").innerHTML = state.audit.map((a) => `<div class="audit-item"><i data-lucide="shield-alert"></i><div><p class="item-title">${escapeHtml(a.action)}</p><p class="item-sub">${escapeHtml(a.actor)} · ${escapeHtml(a.target)}</p></div><span class="badge scheduled">${escapeHtml(a.at)}</span></div>`).join("");
}

function renderBackendChecks() {
  const checks = [
    ["URL Supabase", SUPABASE_URL],
    ["Chave pública", "Configurada no frontend"],
    ["Schema", "clinicou/supabase/schema.sql"],
    ["RLS", "Políticas por clinic_id e membership"]
  ];
  document.getElementById("backendChecks").innerHTML = checks.map((c) => `<div class="check-item"><i data-lucide="check-circle-2"></i><div><p class="item-title">${c[0]}</p><p class="item-sub">${c[1]}</p></div><span class="badge confirmed">OK</span></div>`).join("");
}

function submitAppointment(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.appointments.push({ id: uid("a"), ...data });
  const service = serviceById(data.serviceId);
  state.finance.push({
    id: uid("f"),
    description: `${service.name} · ${patientById(data.patientId).name}`,
    amount: service.price,
    type: "income",
    dueDate: data.date,
    status: "open",
    professionalId: data.professionalId
  });
  state.audit.unshift({ id: uid("lg"), action: "Consulta agendada", actor: "Usuário atual", target: patientById(data.patientId).name, at: "Agora" });
  saveState();
  renderAll();
  toast("Consulta agendada e lançamento financeiro criado.");
}

function submitPatient(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.patients.push({ id: uid("p"), noShow: 0, ...data });
  saveState();
  event.target.reset();
  renderAll();
  toast("Paciente cadastrado.");
}

function submitRecord(event) {
  event.preventDefault();
  const record = {
    id: uid("r"),
    patientId: document.getElementById("recordPatient").value,
    template: document.getElementById("recordTemplate").value,
    complaint: document.getElementById("recordComplaint").value,
    fields: [...document.querySelectorAll("[data-dynamic-field]")].map((input) => ({ label: input.dataset.dynamicField, value: input.value })),
    createdAt: new Date().toISOString()
  };
  state.records.push(record);
  state.audit.unshift({ id: uid("lg"), action: "Evolução clínica registrada", actor: "Usuário atual", target: patientById(record.patientId).name, at: "Agora" });
  saveState();
  document.getElementById("recordComplaint").value = "";
  renderAll();
  toast("Prontuário atualizado com trilha de auditoria.");
}

function submitFinance(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.finance.push({ id: uid("f"), amount: Number(data.amount), ...data });
  saveState();
  event.target.reset();
  setDefaultDates();
  renderAll();
  toast("Movimentação financeira lançada.");
}

function submitMessage(event) {
  event.preventDefault();
  const patient = patientById(document.getElementById("messagePatient").value);
  state.audit.unshift({ id: uid("lg"), action: "Mensagem automática registrada", actor: "CRM", target: patient.name, at: "Agora" });
  saveState();
  renderAll();
  toast("Envio registrado na auditoria. Integração oficial Meta pode ser acoplada via worker.");
}

function suggestSlot() {
  const professional = professionalById(document.getElementById("appointmentProfessional").value);
  const service = serviceById(document.getElementById("appointmentService").value);
  const date = document.getElementById("appointmentDate").value || todayIso;
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
    document.getElementById("slotSuggestion").textContent = "Agenda cheia para este profissional na data escolhida.";
    return;
  }
  document.getElementById("appointmentTime").value = suggestion;
  document.getElementById("slotSuggestion").textContent = `${suggestion} é o melhor encaixe: ${professional.name} tem janela livre e o serviço dura ${service.duration} minutos.`;
}

function renderMessagePreview() {
  const patient = patientById(document.getElementById("messagePatient")?.value || state.patients[0].id);
  const template = document.getElementById("messageTemplate")?.value || "confirmacao";
  const messages = {
    confirmacao: `Olá, ${patient.name}. Passando para confirmar sua consulta na Clínica Aurora. Responda SIM para confirmar ou REAGENDAR para escolher outro horário.`,
    pos: `Olá, ${patient.name}. Como você está se sentindo após o procedimento? Qualquer desconforto fora do esperado, fale conosco por aqui.`,
    retorno: `Olá, ${patient.name}. Seu retorno preventivo está chegando. Podemos reservar um horário esta semana?`
  };
  const preview = document.getElementById("messagePreview");
  if (preview) preview.value = messages[template];
}

async function auth(mode) {
  if (!supabaseClient) {
    toast("Biblioteca Supabase não carregou. Verifique a conexão.");
    return;
  }
  const form = document.getElementById("authForm");
  const data = Object.fromEntries(new FormData(form));
  const feedback = document.getElementById("authFeedback");
  feedback.textContent = "Conectando...";
  try {
    const call = mode === "login"
      ? supabaseClient.auth.signInWithPassword({ email: data.email, password: data.password })
      : supabaseClient.auth.signUp({ email: data.email, password: data.password });
    const { data: authData, error } = await call;
    if (error) throw error;
    const user = authData.user || authData.session?.user;
    if (user && mode === "signup" && data.clinicName) {
      await supabaseClient.rpc("create_clinic", { p_name: data.clinicName, p_slug: slugify(data.clinicName) });
    }
    document.getElementById("syncState").textContent = "Supabase conectado";
    feedback.textContent = "Conectado. Se o schema já foi aplicado, os dados serão persistidos no backend.";
    toast("Autenticação Supabase concluída.");
    await loadRemoteSnapshot();
    toggleAuth(false);
  } catch (error) {
    feedback.textContent = error.message || "Não foi possível autenticar.";
  }
}

async function loadRemoteSnapshot() {
  if (!supabaseClient) return;
  const { data: clinics } = await supabaseClient.from("clinics").select("id,name,plan").limit(1);
  if (clinics?.[0]) {
    state.tenant = { ...state.tenant, ...clinics[0] };
    document.getElementById("tenantName").textContent = state.tenant.name;
  }
}

function toggleAuth(open) {
  document.getElementById("authModal").classList.toggle("open", open);
}

function markPaid(id) {
  const item = state.finance.find((f) => f.id === id);
  if (item) item.status = "paid";
  saveState();
  renderAll();
  toast("Título marcado como pago.");
}

function selectPatient(id) {
  document.getElementById("recordPatient").value = id;
  document.getElementById("messagePatient").value = id;
  openView("prontuario");
  renderMessagePreview();
}

function exportFinanceCsv() {
  const header = "descricao,tipo,valor,vencimento,status\n";
  const body = state.finance.map((f) => [f.description, f.type, f.amount, f.dueDate, f.status].join(",")).join("\n");
  const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "clinicou-financeiro.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function patientById(id) {
  return state.patients.find((p) => p.id === id) || { id: "", name: "Paciente", phone: "", noShow: 0 };
}

function professionalById(id) {
  return state.professionals.find((p) => p.id === id) || { id: "", name: "Profissional", commission: 0, start: "08:00", end: "18:00" };
}

function serviceById(id) {
  return state.services.find((s) => s.id === id) || { id: "", name: "Serviço", duration: 30, price: 0 };
}

function slugify(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function emptyState(text) {
  return `<div class="suggestion-box">${escapeHtml(text)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3200);
}

window.markPaid = markPaid;
window.selectPatient = selectPatient;