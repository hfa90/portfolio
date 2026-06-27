const SUPABASE_URL = "https://yhftbfpkuchxfblhfvva.supabase.co";
const SUPABASE_KEY = "sb_publishable_paT5SW04fvUuJzui4t5COQ_nVI9gJxY";
const STORAGE_KEY = "clinicou_iclinic_flow_v1";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const longDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

const statusLabel = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Na recepção",
  in_service: "Em atendimento",
  finished: "Atendido",
  no_show: "Faltou",
  open: "Aberto",
  paid: "Pago",
  overdue: "Vencido",
  income: "Receita",
  expense: "Despesa"
};

const serviceDuration = {
  s1: 30,
  s2: 45,
  s3: 30,
  s4: 60
};

const seedState = {
  tenant: { id: "demo-clinic", name: "Clínica Aurora", plan: "Premium", mrr: 1290 },
  patients: [
    {
      id: "p1",
      code: "006624",
      name: "Paciente Teste",
      phone: "(16) 9999-9999",
      email: "paciente@teste.com",
      birthDate: "26/03/1990",
      gender: "Masculino",
      document: "123.456.789-00",
      rg: "",
      insurance: "Particular",
      lastVisit: "20/06/2026",
      notes: "Paciente de demonstração para agenda e prontuário.",
      noShow: 6
    },
    {
      id: "p2",
      code: "006625",
      name: "Marina Lopes",
      phone: "(92) 98812-4401",
      email: "marina@email.com",
      birthDate: "14/08/1988",
      gender: "Feminino",
      document: "222.333.444-55",
      rg: "114455",
      insurance: "Unimed",
      lastVisit: "18/06/2026",
      notes: "Retorno preventivo.",
      noShow: 4
    },
    {
      id: "p3",
      code: "006626",
      name: "Rafael Nunes",
      phone: "(92) 98177-2210",
      email: "rafael@email.com",
      birthDate: "02/11/1979",
      gender: "Masculino",
      document: "555.666.777-88",
      rg: "778899",
      insurance: "Bradesco",
      lastVisit: "12/06/2026",
      notes: "Acompanhar confirmação por WhatsApp.",
      noShow: 18
    }
  ],
  professionals: [
    { id: "dr1", name: "Hayden Fernandes de Andrade", specialty: "Clínica geral", commission: 35, start: "08:00", end: "18:00" },
    { id: "dr2", name: "Dra. Ana Beatriz", specialty: "Dermatologia", commission: 30, start: "08:00", end: "17:00" },
    { id: "dr3", name: "Dr. Marcos Lima", specialty: "Odontologia", commission: 40, start: "09:00", end: "18:00" }
  ],
  services: [
    { id: "s1", name: "Retorno", price: 180, duration: 30 },
    { id: "s2", name: "Consulta inicial", price: 260, duration: 45 },
    { id: "s3", name: "Avaliação", price: 120, duration: 30 },
    { id: "s4", name: "Procedimento", price: 520, duration: 60 }
  ],
  appointments: [
    { id: "a1", patientId: "p1", professionalId: "dr1", serviceId: "s1", date: localIso(), time: "08:30", status: "confirmed" },
    { id: "a2", patientId: "p2", professionalId: "dr2", serviceId: "s2", date: localIso(), time: "10:00", status: "waiting" },
    { id: "a3", patientId: "p3", professionalId: "dr3", serviceId: "s4", date: addDays(1), time: "14:00", status: "scheduled" }
  ],
  finance: [
    { id: "f1", description: "Retorno Paciente Teste", amount: 180, type: "income", dueDate: localIso(), status: "paid", professionalId: "dr1" },
    { id: "f2", description: "Consulta Marina Lopes", amount: 260, type: "income", dueDate: localIso(), status: "open", professionalId: "dr2" },
    { id: "f3", description: "Materiais clínicos", amount: 150, type: "expense", dueDate: addDays(2), status: "open", professionalId: "" }
  ],
  records: [
    { id: "r1", patientId: "p1", template: "geral", complaint: "Paciente sem queixas no retorno. Conduta mantida.", createdAt: new Date().toISOString() }
  ],
  campaigns: [
    { id: "c1", name: "Confirmação D-1", channel: "WhatsApp", audience: "Consultas de amanhã", status: "Ativa", sent: 42 },
    { id: "c2", name: "Retorno semestral", channel: "WhatsApp", audience: "Pacientes sem consulta", status: "Pausada", sent: 18 },
    { id: "c3", name: "Pós-atendimento", channel: "E-mail", audience: "Atendidos hoje", status: "Ativa", sent: 26 }
  ],
  audit: []
};

let state = loadState();
let supabaseClient = null;
let activeView = "painel";
let activeWeekStart = startOfWeek(new Date());
let editingPatientId = null;

document.addEventListener("DOMContentLoaded", () => {
  supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  wireEvents();
  setDefaultFormDates();
  renderAll();
  openView("painel");
  refreshIcons();
});

function wireEvents() {
  document.querySelectorAll("[data-view]").forEach((item) => {
    item.addEventListener("click", () => openView(item.dataset.view));
  });

  document.getElementById("mobileNavButton").addEventListener("click", () => {
    document.querySelector(".main-nav").classList.toggle("open");
  });

  document.getElementById("managementToggle").addEventListener("click", () => toggleDropdown("managementMenu"));
  document.getElementById("otherToggle").addEventListener("click", () => toggleDropdown("otherMenu"));
  document.addEventListener("click", closeDropdownsFromOutside);

  document.getElementById("quickAppointment").addEventListener("click", () => openModal("appointmentModal"));
  document.getElementById("newAppointmentButton").addEventListener("click", () => openModal("appointmentModal"));
  document.getElementById("newPatientButton").addEventListener("click", () => openPatientForm());
  document.getElementById("syncButton").addEventListener("click", () => openModal("authModal"));
  document.getElementById("printAgenda").addEventListener("click", () => window.print());

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal.id);
    });
  });

  document.getElementById("prevWeek").addEventListener("click", () => {
    activeWeekStart = dateFromIso(addDaysFrom(activeWeekStart, -7));
    renderCalendar();
  });
  document.getElementById("nextWeek").addEventListener("click", () => {
    activeWeekStart = dateFromIso(addDaysFrom(activeWeekStart, 7));
    renderCalendar();
  });
  document.getElementById("todayButton").addEventListener("click", () => {
    activeWeekStart = startOfWeek(new Date());
    renderCalendar();
  });

  document.getElementById("patientSearch").addEventListener("input", renderPatientsTable);
  document.getElementById("agendaSearch").addEventListener("input", renderAgendaTodayPatients);
  document.getElementById("professionalFilter").addEventListener("change", renderPatientsTable);
  document.getElementById("dashboardProfessional").addEventListener("change", renderDashboard);
  document.getElementById("appointmentForm").addEventListener("submit", submitAppointment);
  document.getElementById("suggestSlotButton").addEventListener("click", suggestSlot);
  document.getElementById("patientForm").addEventListener("submit", submitPatient);
  document.getElementById("financeForm").addEventListener("submit", submitFinance);
  document.getElementById("messageForm").addEventListener("submit", submitMessage);
  document.getElementById("messageTemplate").addEventListener("change", renderMessagePreview);
  document.getElementById("messagePatient").addEventListener("change", renderMessagePreview);
  document.getElementById("loginButton").addEventListener("click", () => auth("login"));
  document.getElementById("signupButton").addEventListener("click", () => auth("signup"));

  document.querySelectorAll("[data-finance-type]").forEach((button) => {
    button.addEventListener("click", () => openFinanceForm(button.dataset.financeType));
  });

  document.getElementById("patientsTable").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-patient]");
    const openButton = event.target.closest("[data-open-record]");
    if (editButton) openPatientForm(editButton.dataset.editPatient);
    if (openButton) openPatientRecord(openButton.dataset.openRecord);
  });

  document.getElementById("todayPatients").addEventListener("click", handleTodayPatientClick);
  document.getElementById("agendaTodayPatients").addEventListener("click", handleTodayPatientClick);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? mergeState(structuredClone(seedState), saved) : structuredClone(seedState);
  } catch {
    return structuredClone(seedState);
  }
}

function mergeState(seed, saved) {
  return {
    ...seed,
    ...saved,
    tenant: { ...seed.tenant, ...(saved.tenant || {}) },
    patients: saved.patients || seed.patients,
    professionals: saved.professionals || seed.professionals,
    services: saved.services || seed.services,
    appointments: saved.appointments || seed.appointments,
    finance: saved.finance || seed.finance,
    records: saved.records || seed.records,
    campaigns: saved.campaigns || seed.campaigns,
    audit: saved.audit || seed.audit
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderAll() {
  populateSelects();
  renderTodayPatients();
  renderAgendaTodayPatients();
  renderDashboard();
  renderCalendar();
  renderPatientsTable();
  renderFinance();
  renderCampaigns();
  renderPlans();
  renderBackendChecks();
  renderMessagePreview();
  refreshIcons();
}

function populateSelects() {
  fillSelect("dashboardProfessional", [{ id: "all", name: "Todos os profissionais" }, ...state.professionals], "name");
  fillSelect("professionalFilter", [{ id: "all", name: "Todos os profissionais" }, ...state.professionals], "name");
  fillSelect("appointmentPatient", state.patients, "name");
  fillSelect("appointmentProfessional", state.professionals, "name");
  fillSelect("appointmentService", state.services, "name");
  fillSelect("financeProfessional", [{ id: "", name: "Sem repasse" }, ...state.professionals], "name");
  fillSelect("messagePatient", state.patients, "name");
}

function fillSelect(id, items, field) {
  const select = document.getElementById(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item[field])}</option>`).join("");
  if (items.some((item) => item.id === current)) select.value = current;
}

function openView(view) {
  if (!document.getElementById(view)) return;
  activeView = view;
  ensurePlaceholder(view);
  document.querySelectorAll(".app-view").forEach((panel) => panel.classList.toggle("active", panel.id === view));
  const managementViews = ["financeiro", "relatorios", "estoque", "tiss", "satisfacao"];
  const otherViews = ["configuracoes", "integracoes", "admin"];
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const isDirect = tab.dataset.view === view;
    const isManagement = tab.id === "managementToggle" && managementViews.includes(view);
    const isOther = tab.id === "otherToggle" && otherViews.includes(view);
    tab.classList.toggle("active", isDirect || isManagement || isOther);
  });
  document.querySelector(".main-nav").classList.remove("open");
  closeAllDropdowns();
  if (view === "agenda") renderCalendar();
  if (view === "financeiro") renderFinance();
  window.scrollTo({ top: 0, behavior: "smooth" });
  refreshIcons();
}

function ensurePlaceholder(view) {
  const section = document.getElementById(view);
  if (!section || section.innerHTML.trim()) return;
  const title = section.dataset.title || "Módulo";
  section.innerHTML = `
    <div class="simple-view two-column">
      <article class="white-panel">
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">Este módulo já está encaixado na navegação principal e pronto para receber as regras específicas da clínica.</p>
        <div class="compact-list">
          <div class="compact-item"><strong>Fluxo</strong><span>Mesmo padrão visual do iClinic</span></div>
          <div class="compact-item"><strong>Dados</strong><span>Preparado para Supabase</span></div>
        </div>
      </article>
      <article class="white-panel">
        <h2>Próximo passo</h2>
        <p class="muted">Definir campos, permissões e relatórios deste módulo.</p>
      </article>
    </div>`;
}

function toggleDropdown(id) {
  const menu = document.getElementById(id);
  const open = menu.classList.contains("open");
  closeAllDropdowns();
  menu.classList.toggle("open", !open);
}

function closeDropdownsFromOutside(event) {
  if (!event.target.closest(".nav-menu-wrap")) closeAllDropdowns();
}

function closeAllDropdowns() {
  document.querySelectorAll(".nav-dropdown").forEach((menu) => menu.classList.remove("open"));
}

function renderTodayPatients() {
  const today = appointmentsForDay(localIso()).sort(byTime);
  const html = today.map((appointment) => {
    const patient = patientById(appointment.patientId);
    return `
      <button class="today-patient" data-patient-id="${escapeHtml(patient.id)}">
        <span><strong>${escapeHtml(appointment.time)}</strong>${escapeHtml(patient.name)}</span>
        <i data-lucide="calendar-days"></i>
      </button>`;
  }).join("") || `<div class="today-patient"><span><strong>Hoje</strong>Nenhum paciente agendado</span></div>`;
  document.getElementById("todayPatients").innerHTML = html;
}

function renderAgendaTodayPatients() {
  const query = (document.getElementById("agendaSearch").value || "").toLowerCase();
  const today = appointmentsForDay(localIso())
    .filter((appointment) => patientById(appointment.patientId).name.toLowerCase().includes(query))
    .sort(byTime);
  const html = today.map((appointment) => {
    const patient = patientById(appointment.patientId);
    return `
      <button class="today-patient" data-patient-id="${escapeHtml(patient.id)}">
        <span><strong>${escapeHtml(appointment.time)}</strong>${escapeHtml(patient.name)}</span>
        <i data-lucide="calendar-days"></i>
      </button>`;
  }).join("") || `<div class="today-patient"><span><strong>Busca</strong>Nenhum paciente encontrado</span></div>`;
  document.getElementById("agendaTodayPatients").innerHTML = html;
  refreshIcons();
}

function handleTodayPatientClick(event) {
  const button = event.target.closest("[data-patient-id]");
  if (button) openPatientRecord(button.dataset.patientId);
}

function openPatientRecord(patientId) {
  const patient = patientById(patientId);
  openView("prontuarios");
  document.getElementById("patientSearch").value = patient.name;
  renderPatientsTable();
  toast(`Prontuário de ${patient.name} selecionado.`);
}

function renderDashboard() {
  const selectedProfessional = document.getElementById("dashboardProfessional")?.value || "all";
  const appointments = state.appointments.filter((appointment) => {
    return selectedProfessional === "all" || appointment.professionalId === selectedProfessional;
  });
  const scheduled = appointments.length;
  const confirmed = appointments.filter((appointment) => ["confirmed", "waiting", "in_service", "finished"].includes(appointment.status)).length;
  const finished = appointments.filter((appointment) => appointment.status === "finished" || appointment.date < localIso()).length;
  const missed = appointments.filter((appointment) => appointment.status === "no_show").length;
  document.getElementById("metricScheduled").textContent = scheduled;
  document.getElementById("metricConfirmed").textContent = confirmed;
  document.getElementById("metricFinished").textContent = Math.max(1, finished);
  document.getElementById("metricMissed").textContent = missed;
  document.getElementById("metricProcedures").textContent = appointments.length + state.records.length;

  const men = state.patients.filter((patient) => patient.gender === "Masculino").length;
  const women = state.patients.filter((patient) => patient.gender === "Feminino").length;
  document.getElementById("metricMen").textContent = `Total: ${men}`;
  document.getElementById("metricWomen").textContent = `Total: ${women}`;
  renderInsuranceList();
  renderBirthdayList();
}

function renderInsuranceList() {
  const counts = state.patients.reduce((acc, patient) => {
    const key = patient.insurance || "Particular";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const max = Math.max(1, ...Object.values(counts));
  document.getElementById("insuranceList").innerHTML = Object.entries(counts).map(([name, count]) => `
    <div class="mini-bar">
      <span>${escapeHtml(name)}</span>
      <span><i style="width:${Math.round(count / max * 100)}%"></i></span>
      <strong>${count}</strong>
    </div>`).join("");
}

function renderBirthdayList() {
  const today = shortDate.format(new Date());
  const birthdays = state.patients.filter((patient) => patient.birthDate?.slice(0, 5) === today);
  document.getElementById("birthdayList").innerHTML = birthdays.length
    ? birthdays.map((patient) => `<div class="compact-item"><strong>${escapeHtml(patient.name)}</strong><span>${escapeHtml(patient.phone)}</span></div>`).join("")
    : `<div class="compact-item"><strong>Nenhum aniversariante hoje.</strong><span>Ver lista completa</span></div>`;
}

function renderCalendar() {
  const start = new Date(activeWeekStart);
  const days = Array.from({ length: 7 }, (_, index) => dateFromIso(addDaysFrom(start, index)));
  document.getElementById("weekRange").textContent = `${shortDate.format(days[0])} a ${shortDate.format(days[6])}`;
  document.getElementById("activeProfessionalName").textContent = state.professionals[0]?.name || "Agenda da clínica";

  const startMinutes = 8 * 60;
  const endMinutes = 18 * 60;
  const slotHeight = 44;
  const totalHeight = ((endMinutes - startMinutes) / 15) * slotHeight;
  const timeLabels = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 15) {
    const top = ((minutes - startMinutes) / 15) * slotHeight;
    timeLabels.push(`<span class="time-mark" style="top:${top}px">${minutesToTime(minutes)}</span>`);
  }

  const head = `<div class="week-time-head"></div>${days.map((day) => `
    <div class="day-head ${localIso(day) === localIso() ? "today" : ""}">
      <div><strong>${capitalize(longDate.format(day).split(",")[0])}</strong><br><span>${formatDayLabel(day)}</span></div>
    </div>`).join("")}`;

  const body = `<div class="time-column" style="height:${totalHeight}px">${timeLabels.join("")}</div>${days.map((day) => {
    const date = localIso(day);
    const events = state.appointments
      .filter((appointment) => appointment.date === date)
      .map((appointment) => calendarEvent(appointment, startMinutes, slotHeight))
      .join("");
    const weekend = [0, 6].includes(day.getDay()) ? "weekend" : "";
    return `<div class="day-column ${weekend}" style="height:${totalHeight}px">${events}</div>`;
  }).join("")}`;

  document.getElementById("weekCalendar").innerHTML = head + body;
  refreshIcons();
}

function calendarEvent(appointment, startMinutes, slotHeight) {
  const service = serviceById(appointment.serviceId);
  const patient = patientById(appointment.patientId);
  const minutes = timeToMinutes(appointment.time);
  const top = Math.max(0, ((minutes - startMinutes) / 15) * slotHeight);
  const height = Math.max(44, ((service.duration || serviceDuration[service.id] || 30) / 15) * slotHeight);
  return `
    <div class="calendar-event ${escapeHtml(appointment.status)}" style="top:${top}px;height:${height}px">
      ${escapeHtml(appointment.time)} - ${escapeHtml(minutesToTime(minutes + (service.duration || 30)))}<br>
      ${escapeHtml(patient.name)}
    </div>`;
}

function renderPatientsTable() {
  const query = (document.getElementById("patientSearch")?.value || "").toLowerCase();
  const rows = state.patients.filter((patient) => {
    const haystack = `${patient.name} ${patient.code} ${patient.phone} ${patient.document} ${patient.email}`.toLowerCase();
    return haystack.includes(query);
  });
  document.getElementById("patientsTable").innerHTML = `
    <div class="patient-row header">
      <span><input type="checkbox" aria-label="Selecionar todos"></span>
      <span>Nome</span>
      <span>Telefone</span>
      <span>Código</span>
      <span>Última consulta</span>
      <span>Data de nascimento</span>
      <span>Convênios</span>
      <span></span>
    </div>
    ${rows.map((patient) => `
      <div class="patient-row">
        <span><input type="checkbox" aria-label="Selecionar ${escapeHtml(patient.name)}"></span>
        <span><a href="#" data-open-record="${escapeHtml(patient.id)}">${escapeHtml(patient.name)}</a></span>
        <span>${escapeHtml(patient.phone || "-")}</span>
        <span>${escapeHtml(patient.code || "-")}</span>
        <span>${escapeHtml(patient.lastVisit || "-")}</span>
        <span>${escapeHtml(patient.birthDate || "-")}</span>
        <span>${escapeHtml(patient.insurance || "Particular")}</span>
        <button class="edit-row" data-edit-patient="${escapeHtml(patient.id)}" aria-label="Editar paciente"><i data-lucide="pencil"></i></button>
      </div>`).join("")}`;
  document.getElementById("patientResultCount").textContent = `${rows.length} ${rows.length === 1 ? "resultado" : "resultados"}`;
  refreshIcons();
}

function openPatientForm(patientId = null) {
  editingPatientId = patientId;
  const form = document.getElementById("patientForm");
  form.reset();
  form.elements.id.value = "";
  if (patientId) {
    const patient = patientById(patientId);
    Object.entries({
      id: patient.id,
      name: patient.name,
      code: patient.code,
      birthDate: patient.birthDate,
      email: patient.email,
      document: patient.document,
      rg: patient.rg,
      phone: patient.phone,
      insurance: patient.insurance,
      notes: patient.notes
    }).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value || "";
    });
    if (patient.gender) {
      const radio = form.querySelector(`[name="gender"][value="${patient.gender}"]`);
      if (radio) radio.checked = true;
    }
    document.getElementById("patientFormTitle").textContent = "Editar Paciente";
  } else {
    form.elements.code.value = nextPatientCode();
    document.getElementById("patientFormTitle").textContent = "Adicionar Paciente";
  }
  openView("cadastro");
}

function submitPatient(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const payload = {
    id: data.id || uid("p"),
    code: data.code || nextPatientCode(),
    name: data.name,
    birthDate: data.birthDate,
    gender: data.gender || "",
    email: data.email,
    document: data.document,
    rg: data.rg,
    phone: data.phone,
    insurance: data.insurance || "Particular",
    notes: data.notes,
    lastVisit: data.lastVisit || "-",
    noShow: 0
  };
  const existingIndex = state.patients.findIndex((patient) => patient.id === payload.id);
  if (existingIndex >= 0) {
    state.patients[existingIndex] = { ...state.patients[existingIndex], ...payload };
    toast("Paciente atualizado.");
  } else {
    state.patients.push(payload);
    toast("Paciente cadastrado.");
  }
  editingPatientId = null;
  saveState();
  renderAll();
  openView("prontuarios");
}

function renderFinance() {
  const total = state.finance.reduce((sum, item) => {
    return sum + (item.type === "income" ? Number(item.amount) : -Number(item.amount));
  }, 0);
  document.getElementById("financeBalance").textContent = money.format(total);
  document.getElementById("financeTable").innerHTML = state.finance.slice().reverse().map((item) => `
    <div class="finance-row">
      <div><strong>${escapeHtml(item.description)}</strong><br><span>${escapeHtml(statusLabel[item.type])} • ${escapeHtml(item.dueDate)}</span></div>
      <div><strong>${money.format(Number(item.amount))}</strong><br><span>${escapeHtml(statusLabel[item.status])}</span></div>
    </div>`).join("");

  const max = Math.max(1, ...state.finance.map((item) => Number(item.amount)));
  document.getElementById("cashflowBars").innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(index);
    const amount = state.finance
      .filter((item) => item.dueDate === date)
      .reduce((sum, item) => sum + (item.type === "income" ? Number(item.amount) : -Number(item.amount)), 0);
    const width = Math.min(100, Math.abs(amount) / max * 100);
    return `
      <div class="cashflow-row">
        <div><strong>${shortDate.format(dateFromIso(date))}</strong><br><span style="display:block;width:${width}%;height:8px;background:${amount < 0 ? "var(--red)" : "var(--blue)"};border-radius:999px;margin-top:6px"></span></div>
        <strong>${money.format(amount)}</strong>
      </div>`;
  }).join("");
}

function openFinanceForm(type) {
  if (type === "transfer") {
    toast("Transferência preparada para contas bancárias.");
    return;
  }
  const form = document.getElementById("financeForm");
  form.reset();
  form.elements.type.value = type;
  form.elements.dueDate.value = localIso();
  document.getElementById("financeFormTitle").textContent = type === "income" ? "Nova Receita" : "Nova Despesa";
  openModal("financeModal");
}

function submitFinance(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.finance.push({
    id: uid("f"),
    description: data.description,
    amount: Number(data.amount),
    type: data.type,
    dueDate: data.dueDate || localIso(),
    status: data.status,
    professionalId: data.professionalId
  });
  saveState();
  closeModal("financeModal");
  renderFinance();
  toast("Movimentação financeira lançada.");
}

function submitAppointment(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const appointment = { id: uid("a"), ...data };
  state.appointments.push(appointment);
  const service = serviceById(data.serviceId);
  state.finance.push({
    id: uid("f"),
    description: `${service.name} ${patientById(data.patientId).name}`,
    amount: Number(service.price || 0),
    type: "income",
    dueDate: data.date,
    status: "open",
    professionalId: data.professionalId
  });
  saveState();
  closeModal("appointmentModal");
  renderAll();
  toast("Consulta agendada e receita criada.");
}

function suggestSlot() {
  const professional = professionalById(document.getElementById("appointmentProfessional").value);
  const service = serviceById(document.getElementById("appointmentService").value);
  const date = document.getElementById("appointmentDate").value || localIso();
  const busy = state.appointments.filter((appointment) => appointment.professionalId === professional.id && appointment.date === date).map((appointment) => appointment.time);
  const start = timeToMinutes(professional.start || "08:00");
  const end = timeToMinutes(professional.end || "18:00");
  for (let minutes = start; minutes < end; minutes += 30) {
    const slot = minutesToTime(minutes);
    if (!busy.includes(slot)) {
      document.getElementById("appointmentTime").value = slot;
      document.getElementById("slotSuggestion").textContent = `${slot} é o melhor encaixe: ${professional.name} tem janela livre e o serviço dura ${service.duration} minutos.`;
      return;
    }
  }
  document.getElementById("slotSuggestion").textContent = "Agenda cheia para este profissional na data escolhida.";
}

function renderCampaigns() {
  document.getElementById("campaignList").innerHTML = state.campaigns.map((campaign) => `
    <div class="compact-item">
      <strong>${escapeHtml(campaign.name)}</strong>
      <span>${escapeHtml(campaign.channel)} • ${escapeHtml(campaign.audience)} • ${campaign.sent} envios</span>
    </div>`).join("");
}

function renderPlans() {
  const plans = [
    ["Starter", "Agenda, pacientes e prontuários", 99],
    ["Plus", "Financeiro, mensagens e relatórios", 129],
    ["Pro", "Times maiores e repasses", 169],
    ["Premium", "Automação avançada e integrações", 299]
  ];
  document.getElementById("plansList").innerHTML = plans.map(([name, description, price]) => `
    <div class="compact-item">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(description)} • ${money.format(price)}/mês</span>
    </div>`).join("");
}

function renderBackendChecks() {
  const checks = [
    ["Projeto", SUPABASE_URL],
    ["Schema", "supabase/schema.sql"],
    ["Segurança", "RLS por clínica e usuário autenticado"],
    ["Modo atual", "Demo local com conexão opcional"]
  ];
  document.getElementById("backendChecks").innerHTML = checks.map(([label, value]) => `
    <div class="compact-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("");
}

function renderMessagePreview() {
  const patient = patientById(document.getElementById("messagePatient")?.value || state.patients[0]?.id);
  const template = document.getElementById("messageTemplate")?.value || "confirmacao";
  const messages = {
    confirmacao: `Olá, ${patient.name}. Passando para confirmar sua consulta na Clínica Aurora. Responda SIM para confirmar ou REAGENDAR para escolher outro horário.`,
    pos: `Olá, ${patient.name}. Como você está se sentindo após o atendimento? Qualquer desconforto fora do esperado, fale conosco por aqui.`,
    retorno: `Olá, ${patient.name}. Seu retorno preventivo está chegando. Podemos reservar um horário esta semana?`
  };
  const preview = document.getElementById("messagePreview");
  if (preview) preview.value = messages[template];
}

function submitMessage(event) {
  event.preventDefault();
  const patient = patientById(document.getElementById("messagePatient").value);
  state.audit.unshift({ id: uid("lg"), action: "Mensagem registrada", target: patient.name, at: new Date().toISOString() });
  saveState();
  toast("Mensagem registrada na auditoria local.");
}

async function auth(mode) {
  if (!supabaseClient) {
    toast("Biblioteca Supabase não carregou.");
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
    await loadRemoteClinic();
    feedback.textContent = "Conectado ao Supabase.";
    closeModal("authModal");
    toast("Supabase conectado.");
  } catch (error) {
    feedback.textContent = error.message || "Não foi possível autenticar.";
  }
}

async function loadRemoteClinic() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.from("clinics").select("id,name,plan").limit(1);
  if (data?.[0]) {
    state.tenant = { ...state.tenant, ...data[0] };
    saveState();
  }
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.getElementById(id).setAttribute("aria-hidden", "false");
  refreshIcons();
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  document.getElementById(id).setAttribute("aria-hidden", "true");
}

function setDefaultFormDates() {
  document.getElementById("appointmentDate").value = localIso();
  document.getElementById("appointmentTime").value = "08:30";
  document.querySelector("#financeForm [name='dueDate']").value = localIso();
}

function appointmentsForDay(date) {
  return state.appointments.filter((appointment) => appointment.date === date);
}

function byTime(a, b) {
  return a.time.localeCompare(b.time);
}

function patientById(id) {
  return state.patients.find((patient) => patient.id === id) || { id: "", name: "Paciente", phone: "", code: "", noShow: 0 };
}

function professionalById(id) {
  return state.professionals.find((professional) => professional.id === id) || state.professionals[0] || { id: "", name: "Profissional", start: "08:00", end: "18:00" };
}

function serviceById(id) {
  return state.services.find((service) => service.id === id) || { id: "", name: "Serviço", price: 0, duration: 30 };
}

function nextPatientCode() {
  const max = state.patients.reduce((highest, patient) => Math.max(highest, Number(patient.code || 0)), 6623);
  return String(max + 1).padStart(6, "0");
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function localIso(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function addDays(days) {
  return addDaysFrom(new Date(), days);
}

function addDaysFrom(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return localIso(d);
}

function dateFromIso(value) {
  return new Date(`${value}T12:00:00`);
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDayLabel(date) {
  const [day, month] = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(date).split(" de ");
  return `${day}/${capitalize(month)}`;
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function slugify(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3000);
}
