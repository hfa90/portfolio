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
  pending: "Pendente",
  settled: "Pago",
  document: "Documento",
  certificate: "Atestado",
  prescription: "Receita",
  guide: "Guia",
  doctor: "Medico",
  nurse: "Enfermeiro",
  assistant: "Assistente",
  cleaning: "Servicos gerais",
  secretary: "Secretario",
  admin: "Administrador",
  medical: "Medico",
  receptionist: "Secretaria"
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const todayIso = new Date().toISOString().slice(0, 10);

const smartCatalog = {
  complaint: [
    "Cefaleia persistente", "Dor lombar", "Dor toracica", "Dor abdominal", "Febre ha 3 dias", "Tosse seca", "Tosse produtiva", "Dispneia aos esforcos",
    "Nauseas e vomitos", "Diarreia", "Tontura", "Palpitacoes", "Ansiedade", "Insônia", "Dor de garganta", "Congestao nasal", "Dor articular",
    "Ferida em pele", "Retorno com exames", "Acompanhamento de hipertensao", "Acompanhamento de diabetes", "Queixa odontologica", "Dor em dente",
    "Sangramento gengival", "Avaliacao estetica", "Pos-procedimento"
  ],
  vitals: [
    "PA 120x80 mmHg, FC 72 bpm, FR 16 irpm, Temp 36,5 C, SatO2 98%",
    "PA 130x85 mmHg, FC 82 bpm, FR 18 irpm, Temp 36,8 C, SatO2 97%",
    "PA 140x90 mmHg, FC 88 bpm, FR 18 irpm, Temp 37,2 C, SatO2 96%",
    "PA 110x70 mmHg, FC 68 bpm, FR 16 irpm, Temp 36,4 C, SatO2 99%",
    "Glicemia capilar 98 mg/dL", "Peso 70 kg, altura 1,70 m, IMC 24,2", "Dor 0/10", "Dor 5/10", "Dor 8/10"
  ],
  conduct: [
    "Paciente avaliado, orientado quanto aos sinais de alerta e retorno se houver piora.",
    "Solicitados exames complementares para melhor elucidacao diagnostica.",
    "Mantida conduta atual, reforcadas orientacoes e agendado retorno.",
    "Realizado procedimento sem intercorrencias, paciente orientado sobre cuidados domiciliares.",
    "Encaminhado para avaliacao especializada conforme quadro clinico."
  ],
  prescription: [
    "Dipirona 500 mg: tomar 1 comprimido de 6/6h se dor ou febre, por ate 3 dias.",
    "Paracetamol 750 mg: tomar 1 comprimido de 8/8h se dor ou febre.",
    "Ibuprofeno 400 mg: tomar 1 comprimido de 8/8h apos alimentacao, se nao houver contraindicacao.",
    "Soro fisiologico nasal: aplicar conforme necessidade.",
    "Hidratacao oral, repouso relativo e retorno se sinais de alarme."
  ],
  guideProcedure: [
    "Consulta medica", "Retorno medico", "Procedimento ambulatorial", "Avaliacao clinica", "Atendimento odontologico", "Atendimento estetico"
  ],
  guideDescription: [
    "Declaro que recebi atendimento, fui informado(a) sobre conduta, orientacoes, riscos habituais e necessidade de retorno em caso de piora.",
    "Paciente orientado(a) sobre procedimento proposto, cuidados pos-atendimento, sinais de alerta e canais de contato da clinica.",
    "Guia emitida para registro do atendimento profissional realizado nesta data, com ciencia e assinatura do paciente."
  ]
};

const seedState = {
  tenant: {
    id: "clinic",
    name: "Clinica Aurora",
    plan: "Premium",
    mrr: 1290,
    settings: {
      commissionEnabled: true,
      commissionRule: "paid_on_settlement",
      defaultCommission: 30,
      rolePermissions: {
        admin: ["dashboard", "agenda", "pacientes", "prontuario", "guia", "medico", "financeiro", "convenios", "funcionarios", "crm", "admin"],
        medical: ["medico", "prontuario", "guia"],
        receptionist: ["dashboard", "agenda", "pacientes", "prontuario", "guia", "convenios", "crm"]
      }
    }
  },
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
    { id: "e1", professionalId: "dr1", name: "Dra. Ana Beatriz", role: "doctor", accessRole: "medical", crm: "CRM-AM 12345", specialty: "Clinica geral", phone: "(92) 98800-1100", email: "ana@clinica.com", commission: 35, start: "08:00", end: "17:00", status: "active", availability: [{ days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" }] },
    { id: "e2", professionalId: "dr2", name: "Dr. Marcos Lima", role: "doctor", accessRole: "medical", crm: "CRM-AM 22334", specialty: "Odontologia", phone: "(92) 98800-2200", email: "marcos@clinica.com", commission: 40, start: "09:00", end: "18:00", status: "active", availability: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }] },
    { id: "e3", professionalId: "dr3", name: "Dra. Helena Costa", role: "doctor", accessRole: "medical", crm: "CRM-AM 33445", specialty: "Estetica", phone: "(92) 98800-3300", email: "helena@clinica.com", commission: 30, start: "10:00", end: "19:00", status: "active", availability: [{ days: [2, 3, 4, 5], start: "10:00", end: "19:00" }] },
    { id: "e4", name: "Beatriz Souza", role: "secretary", accessRole: "receptionist", crm: "", specialty: "Recepcao", phone: "(92) 98800-4400", email: "recepcao@clinica.com", commission: 0, start: "08:00", end: "17:00", status: "active" }
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
  ],
  commissions: [],
  guides: []
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
let remoteReady = false;
let activeClinicId = "";
let siteDialogResolve = null;
let signaturePad = null;
let currentUser = { email: "", accessRole: "admin", employeeId: "", professionalId: "", permissions: [] };

document.addEventListener("DOMContentLoaded", async () => {
  supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  wireEvents();
  setDefaultDates();
  syncProfessionalsFromEmployees();
  renderAll();
  initSignaturePad();
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
  merged.tenant = {
    ...seedState.tenant,
    ...(saved.tenant || {}),
    settings: {
      ...seedState.tenant.settings,
      ...((saved.tenant || {}).settings || {}),
      rolePermissions: {
        ...seedState.tenant.settings.rolePermissions,
        ...(((saved.tenant || {}).settings || {}).rolePermissions || {})
      }
    }
  };
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
  merged.commissions = Array.isArray(saved.commissions) ? saved.commissions : seedState.commissions;
  merged.guides = Array.isArray(saved.guides) ? saved.guides : seedState.guides;
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
      accessRole: employee.role === "doctor" ? "medical" : "receptionist",
      availability: [{ days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }],
      ...employee,
      phone: formatPhone(employee.phone || "")
    }));
  }

  return (professionals || seedState.professionals).map((pro, index) => ({
    id: `e_from_${pro.id || index}`,
    professionalId: pro.id,
    name: pro.name,
    role: "doctor",
    accessRole: "medical",
    crm: pro.license || "",
    specialty: pro.specialty || "Clinica geral",
    phone: "",
    email: "",
    commission: Number(pro.commission || pro.commission_percent || 0),
    start: pro.start || "08:00",
    end: pro.end || "18:00",
    status: "active",
    availability: [{ days: [1, 2, 3, 4, 5], start: pro.start || "08:00", end: pro.end || "18:00" }]
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
  byId("appointmentProfessional")?.addEventListener("change", () => {
    renderSchedule();
    updateSlotAvailabilityPreview();
  });
  byId("appointmentService")?.addEventListener("change", updateSlotAvailabilityPreview);
  byId("appointmentDate")?.addEventListener("change", updateSlotAvailabilityPreview);
  byId("appointmentTime")?.addEventListener("change", updateSlotAvailabilityPreview);
  byId("closeSlotModal")?.addEventListener("click", closeSlotModal);
  byId("slotModal")?.addEventListener("click", (event) => {
    if (event.target.id === "slotModal") closeSlotModal();
  });

  byId("patientForm")?.addEventListener("submit", submitPatient);
  byId("resetPatientForm")?.addEventListener("click", resetPatientForm);
  byId("patientSearch")?.addEventListener("input", renderPatients);
  byId("patientCpf")?.addEventListener("input", (event) => event.target.value = formatCpf(event.target.value));
  byId("patientWhatsapp")?.addEventListener("input", (event) => event.target.value = formatPhone(event.target.value));

  byId("recordForm")?.addEventListener("submit", submitRecord);
  byId("recordComplaint")?.addEventListener("input", () => renderSmartSuggestions("complaint"));
  byId("recordComplaint")?.addEventListener("focus", () => renderSmartSuggestions("complaint"));
  byId("recordVitals")?.addEventListener("input", () => renderSmartSuggestions("vitals"));
  byId("recordVitals")?.addEventListener("focus", () => renderSmartSuggestions("vitals"));
  byId("recordConduct")?.addEventListener("input", () => renderSmartSuggestions("conduct"));
  byId("recordConduct")?.addEventListener("focus", () => renderSmartSuggestions("conduct"));
  byId("recordPrescription")?.addEventListener("input", () => renderSmartSuggestions("prescription"));
  byId("recordPrescription")?.addEventListener("focus", () => renderSmartSuggestions("prescription"));
  byId("suggestConduct")?.addEventListener("click", suggestConductText);
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
  byId("saveCertificateRecord")?.addEventListener("click", () => saveGeneratedDocument("certificate"));
  byId("savePrescriptionRecord")?.addEventListener("click", () => saveGeneratedDocument("prescription"));
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
  byId("exportCommissions")?.addEventListener("click", exportCommissionsCsv);

  byId("insurancePlanForm")?.addEventListener("submit", submitInsurancePlan);

  byId("employeeForm")?.addEventListener("submit", submitEmployee);
  byId("employeeRole")?.addEventListener("change", updateEmployeeCrmRequirement);
  byId("employeeWhatsapp")?.addEventListener("input", (event) => event.target.value = formatPhone(event.target.value));
  byId("employeeSearch")?.addEventListener("input", renderEmployees);
  byId("resetEmployeeForm")?.addEventListener("click", resetEmployeeForm);
  byId("availabilityForm")?.addEventListener("submit", submitAvailability);
  byId("availabilityDoctor")?.addEventListener("change", loadAvailabilityForm);

  byId("tenantForm")?.addEventListener("submit", submitTenantName);
  byId("financeSettingsForm")?.addEventListener("submit", submitFinanceSettings);
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

  byId("guideForm")?.addEventListener("submit", submitGuide);
  byId("guideProcedure")?.addEventListener("input", () => renderSmartSuggestions("guideProcedure"));
  byId("guideProcedure")?.addEventListener("focus", () => renderSmartSuggestions("guideProcedure"));
  byId("guideDescription")?.addEventListener("input", () => renderSmartSuggestions("guideDescription"));
  byId("guideDescription")?.addEventListener("focus", () => renderSmartSuggestions("guideDescription"));
  byId("clearSignature")?.addEventListener("click", clearSignature);
  byId("downloadGuide")?.addEventListener("click", downloadCurrentGuide);
  byId("doctorPeriod")?.addEventListener("change", renderDoctorPortal);
  byId("siteDialogCancel")?.addEventListener("click", () => closeSiteDialog(false));
  byId("siteDialogConfirm")?.addEventListener("click", () => closeSiteDialog(true));
}

function setDefaultDates() {
  if (byId("appointmentDate")) byId("appointmentDate").value = todayIso;
  if (byId("scheduleDateFilter")) byId("scheduleDateFilter").value = todayIso;
  if (byId("guideDate")) byId("guideDate").value = todayIso;
  if (document.querySelector("[name='dueDate']")) document.querySelector("[name='dueDate']").value = todayIso;
}

async function enforceAuth() {
  if (!supabaseClient) {
    lockAuth("Nao foi possivel carregar a biblioteca Supabase. Verifique sua conexao.");
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data?.session) {
    currentUser.email = data.session.user?.email || "";
    unlockAuth();
    await loadRemoteSnapshot();
    return;
  }

  lockAuth("Entre com uma conta autorizada para acessar o sistema.");
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) {
      currentUser.email = session.user?.email || "";
      unlockAuth();
      resolveCurrentUser();
      applyAccessControl();
    }
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
  if (!canAccess(view)) {
    siteAlert("Seu perfil nao tem acesso a esta tela.", "Acesso restrito");
    return;
  }
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === view));
  document.querySelector(".sidebar").classList.remove("open");
  const titles = {
    dashboard: ["Operacao de hoje", "Visao geral"],
    agenda: ["Agenda inteligente", "Consultas e encaixes"],
    pacientes: ["CRM clinico", "Pacientes"],
    prontuario: ["Prontuario eletronico", "Historico e evolucao"],
    guia: ["Atendimento profissional", "Guia com assinatura"],
    medico: ["Portal medico", "Atendimentos e comissoes"],
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

function applyAccessControl() {
  resolveCurrentUser();
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.hidden = !canAccess(button.dataset.view);
  });
  const active = document.querySelector(".view-panel.active");
  if (active && !canAccess(active.id)) {
    openView(firstAllowedView());
  }
  const appointmentForm = byId("appointmentForm");
  if (appointmentForm) {
    appointmentForm.querySelectorAll("input,select,button").forEach((node) => {
      node.disabled = currentUser.accessRole === "medical";
    });
  }
}

function resolveCurrentUser() {
  const email = currentUser.email || "";
  const employee = state.employees.find((item) => item.email && item.email.toLowerCase() === email.toLowerCase());
  if (employee) {
    const accessRole = employee.accessRole || (employee.role === "doctor" ? "medical" : "receptionist");
    const rolePerms = state.tenant.settings?.rolePermissions?.[accessRole] || [];
    currentUser = {
      email,
      accessRole,
      employeeId: employee.id,
      professionalId: employee.professionalId || "",
      permissions: Array.isArray(employee.permissions) ? employee.permissions : rolePerms
    };
  } else if (!email) {
    currentUser = { email: "", accessRole: "admin", employeeId: "", professionalId: "", permissions: [] };
  }
}

function canAccess(view) {
  if (!view) return false;
  if (currentUser.accessRole === "admin") return true;
  return (currentUser.permissions || []).includes(view);
}

function firstAllowedView() {
  const order = ["medico", "dashboard", "agenda", "pacientes", "prontuario", "guia", "financeiro", "convenios", "funcionarios", "crm", "admin"];
  return order.find((view) => canAccess(view)) || "dashboard";
}

function renderAll() {
  byId("tenantName").textContent = state.tenant.name;
  syncProfessionalsFromEmployees();
  resolveCurrentUser();
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
  renderCommissions();
  renderInsurancePlans();
  renderEmployees();
  renderAvailability();
  renderGuides();
  renderCampaigns();
  renderMessagePatientOptions();
  renderMessagePreview();
  renderFinanceSettings();
  renderAccessControl();
  renderDoctorPortal();
  renderSmartSuggestions("complaint");
  renderSmartSuggestions("vitals");
  renderSmartSuggestions("conduct");
  renderSmartSuggestions("prescription");
  renderSmartSuggestions("guideProcedure");
  renderSmartSuggestions("guideDescription");
  updateCommissionPreview();
  updateEmployeeCrmRequirement();
  applyAccessControl();
  lucide.createIcons();
}

function populateSelects() {
  const visiblePatients = visiblePatientsForCurrentUser();
  fillSelect("appointmentPatient", currentUser.accessRole === "medical" ? visiblePatients : state.patients, "name");
  fillSelect("recordPatient", visiblePatients, "name");
  fillSelect("messagePatient", state.patients, "name");
  fillSelect("guidePatient", visiblePatients, "name");
  fillSelect("appointmentProfessional", state.professionals, "name");
  fillSelect("financeProfessional", [{ id: "", name: "Sem repasse" }, ...state.professionals], "name");
  fillSelect("guideProfessional", state.professionals, "name");
  fillSelect("availabilityDoctor", state.professionals, "name");
  fillSelect("appointmentService", state.services, "name");
  fillInsuranceSelect("patientInsurance");
}

function visiblePatientsForCurrentUser() {
  if (currentUser.accessRole !== "medical") return state.patients;
  const professionalId = currentDoctorProfessionalId();
  const patientIds = new Set(state.appointments
    .filter((appointment) => appointment.professionalId === professionalId)
    .map((appointment) => appointment.patientId));
  return state.patients.filter((patient) => patientIds.has(patient.id));
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
      end: employee.end || "18:00",
      availability: employee.availability || [{ days: [1, 2, 3, 4, 5], start: employee.start || "08:00", end: employee.end || "18:00" }]
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
      <p class="item-title">${formatDateTime(r.createdAt)} - ${escapeHtml(statusLabel[r.type] || r.diagnosis || "Evolucao registrada")}</p>
      <p class="item-sub">${escapeHtml(r.complaint || "Sem queixa informada")}</p>
      <p class="item-sub">${escapeHtml(r.documentText || r.conduct || r.prescription || "")}</p>
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

function renderCommissions() {
  const summary = byId("commissionSummary");
  const table = byId("commissionTable");
  if (!summary || !table) return;

  if (!state.tenant.settings?.commissionEnabled) {
    summary.innerHTML = `<div><span>Status</span><strong>Desativado</strong></div>`;
    table.innerHTML = emptyState("A clinica nao esta configurada para comissoes medicas. Ative em Admin > Financeiro.");
    return;
  }

  const rows = commissionRows();
  const pending = rows.filter((row) => row.status !== "settled").reduce((sum, row) => sum + row.amount, 0);
  const settled = rows.filter((row) => row.status === "settled").reduce((sum, row) => sum + row.amount, 0);
  summary.innerHTML = `
    <div><span>Comissoes</span><strong>${rows.length}</strong></div>
    <div><span>Pendente</span><strong>${money.format(pending)}</strong></div>
    <div><span>Pago</span><strong>${money.format(settled)}</strong></div>
  `;
  table.innerHTML = rows.map((row) => `<div class="table-row commission-row">
    <div><strong>${escapeHtml(row.professionalName)}</strong><div class="table-label">${escapeHtml(row.description)}</div></div>
    <div>${money.format(row.amount)}<div class="table-label">${row.percent}% sobre ${money.format(row.baseAmount)}</div></div>
    <div><span class="badge ${row.status}">${statusLabel[row.status]}</span></div>
    <button class="icon-button" onclick="settleCommission('${row.transactionId}')" aria-label="Pagar comissao"><i data-lucide="check"></i></button>
  </div>`).join("") || emptyState("Nenhuma comissao calculada para os filtros atuais.");
  lucide.createIcons();
}

function commissionRows() {
  if (!state.tenant.settings?.commissionEnabled) return [];
  const rule = state.tenant.settings.commissionRule || "paid_on_settlement";
  return state.finance
    .filter((item) => item.type === "income" && item.professionalId)
    .filter((item) => rule !== "paid_on_settlement" || item.status === "paid")
    .map((item) => {
      const pro = professionalById(item.professionalId);
      const existing = state.commissions.find((commission) => commission.transactionId === item.id);
      const percent = Number(existing?.percent ?? pro.commission ?? state.tenant.settings.defaultCommission ?? 0);
      const amount = Number(item.amount || 0) * percent / 100;
      return {
        id: existing?.id || "",
        transactionId: item.id,
        professionalId: item.professionalId,
        professionalName: pro.name,
        description: item.description,
        dueDate: item.dueDate || todayIso,
        baseAmount: Number(item.amount || 0),
        percent,
        amount,
        status: existing?.status || "pending"
      };
    })
    .filter((row) => row.amount > 0);
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

function renderAvailability() {
  const list = byId("availabilityList");
  if (!list) return;
  loadAvailabilityForm();
  const doctors = state.professionals;
  list.innerHTML = doctors.map((doctor) => {
    const availability = doctor.availability || [];
    const text = availability.map((item) => `${formatWeekdays(item.days)} - ${item.start} as ${item.end}`).join("; ") || "Sem disponibilidade configurada";
    return `<div class="record-item">
      <i data-lucide="calendar-clock"></i>
      <div><p class="item-title">${escapeHtml(doctor.name)}</p><p class="item-sub">${escapeHtml(text)}</p></div>
      <span class="badge active">Agenda</span>
    </div>`;
  }).join("") || emptyState("Cadastre medicos ativos para configurar disponibilidade.");
  lucide.createIcons();
}

function renderGuides() {
  const list = byId("guidesList");
  if (!list) return;
  const guides = state.guides.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  list.innerHTML = guides.map((guide) => `<div class="record-item">
    <i data-lucide="file-signature"></i>
    <div>
      <p class="item-title">${formatDate(guide.date)} - ${escapeHtml(patientById(guide.patientId).name)}</p>
      <p class="item-sub">${escapeHtml(guide.procedure || "Guia de atendimento")} com ${escapeHtml(professionalById(guide.professionalId).name)}</p>
    </div>
    <button class="icon-button" onclick="downloadGuideById('${guide.id}')" aria-label="Baixar guia"><i data-lucide="download"></i></button>
  </div>`).join("") || emptyState("Nenhuma guia assinada salva.");
  lucide.createIcons();
}

function renderFinanceSettings() {
  if (!byId("financeSettingsForm")) return;
  byId("commissionEnabled").checked = !!state.tenant.settings?.commissionEnabled;
  byId("commissionRule").value = state.tenant.settings?.commissionRule || "paid_on_settlement";
  byId("defaultCommission").value = Number(state.tenant.settings?.defaultCommission || 0);
}

function renderAccessControl() {
  const node = byId("accessControlList");
  if (!node) return;
  const screens = [
    ["dashboard", "Visao geral"], ["agenda", "Agenda"], ["pacientes", "Pacientes"], ["prontuario", "Prontuario"],
    ["guia", "Guia"], ["medico", "Portal medico"], ["financeiro", "Financeiro"], ["convenios", "Planos"],
    ["funcionarios", "Funcionarios"], ["crm", "CRM"], ["admin", "Admin"]
  ];
  node.innerHTML = state.employees.map((employee) => {
    const accessRole = employee.accessRole || (employee.role === "doctor" ? "medical" : "receptionist");
    const permissions = employee.permissions || state.tenant.settings?.rolePermissions?.[accessRole] || [];
    return `<div class="access-item">
      <div>
        <strong>${escapeHtml(employee.name)}</strong>
        <span>${escapeHtml(employee.email || "Sem e-mail")} - ${statusLabel[accessRole]}</span>
      </div>
      <label>Nivel<select onchange="updateEmployeeAccessRole('${employee.id}', this.value)">
        <option value="admin" ${accessRole === "admin" ? "selected" : ""}>Administrador</option>
        <option value="medical" ${accessRole === "medical" ? "selected" : ""}>Medico</option>
        <option value="receptionist" ${accessRole === "receptionist" ? "selected" : ""}>Secretaria</option>
      </select></label>
      <div class="permission-grid">${screens.map(([view, label]) => `<label><input type="checkbox" ${permissions.includes(view) ? "checked" : ""} onchange="toggleEmployeePermission('${employee.id}', '${view}', this.checked)"> ${label}</label>`).join("")}</div>
    </div>`;
  }).join("") || emptyState("Cadastre funcionarios para controlar acessos.");
}

async function updateEmployeeAccessRole(id, accessRole) {
  const employee = state.employees.find((item) => item.id === id);
  if (!employee) return;
  employee.accessRole = accessRole;
  employee.permissions = [...(state.tenant.settings?.rolePermissions?.[accessRole] || [])];
  await saveEmployeeRemote(employee);
  saveState();
  resolveCurrentUser();
  renderAll();
  toast("Nivel de acesso atualizado.");
}

async function toggleEmployeePermission(id, view, checked) {
  const employee = state.employees.find((item) => item.id === id);
  if (!employee) return;
  const accessRole = employee.accessRole || (employee.role === "doctor" ? "medical" : "receptionist");
  const permissions = new Set(employee.permissions || state.tenant.settings?.rolePermissions?.[accessRole] || []);
  if (checked) permissions.add(view);
  else permissions.delete(view);
  employee.permissions = [...permissions];
  await saveEmployeeRemote(employee);
  saveState();
  resolveCurrentUser();
  applyAccessControl();
  toast("Permissao de tela atualizada.");
}

function renderDoctorPortal() {
  const list = byId("doctorAppointmentsList");
  if (!list) return;
  const period = byId("doctorPeriod")?.value || "today";
  const professionalId = currentDoctorProfessionalId();
  const appointments = state.appointments
    .filter((appt) => !professionalId || appt.professionalId === professionalId)
    .filter((appt) => inDoctorPeriod(appt.date, period))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const finished = appointments.filter((appt) => appt.status === "finished");
  const doctorCommissions = commissionRows()
    .filter((row) => !professionalId || row.professionalId === professionalId)
    .filter((row) => inDoctorPeriod(row.dueDate || todayIso, period));
  const commissionTotal = doctorCommissions.reduce((sum, row) => sum + row.amount, 0);
  byId("doctorMetricPatients").textContent = appointments.length;
  byId("doctorMetricFinished").textContent = finished.length;
  byId("doctorMetricCommission").textContent = money.format(commissionTotal);
  list.innerHTML = appointments.map((appt) => `<div class="record-item">
    <i data-lucide="user-round-check"></i>
    <div>
      <p class="item-title">${formatDate(appt.date)} ${appt.time} - ${escapeHtml(patientById(appt.patientId).name)}</p>
      <p class="item-sub">${escapeHtml(serviceById(appt.serviceId).name)} - ${escapeHtml(patientById(appt.patientId).phone || "")}</p>
    </div>
    <button class="icon-button" onclick="selectPatient('${appt.patientId}')" aria-label="Atender paciente"><i data-lucide="clipboard-plus"></i></button>
  </div>`).join("") || emptyState("Nenhum paciente agendado para este periodo.");
  byId("doctorFinanceList").innerHTML = doctorCommissions
    .map((row) => `<div class="record-item">
      <i data-lucide="badge-dollar-sign"></i>
      <div><p class="item-title">${escapeHtml(row.description)}</p><p class="item-sub">${money.format(row.amount)} - ${row.percent}%</p></div>
      <span class="badge ${row.status}">${statusLabel[row.status]}</span>
    </div>`).join("") || emptyState("Nenhuma comissao calculada para este periodo.");
  lucide.createIcons();
}

function currentDoctorProfessionalId() {
  if (currentUser.accessRole === "medical") return currentUser.professionalId;
  return "";
}

function inDoctorPeriod(date, period) {
  const target = new Date(`${date}T12:00:00`);
  const today = new Date(`${todayIso}T12:00:00`);
  if (period === "today") return date === todayIso;
  if (period === "week") {
    const diff = (target - today) / 86400000;
    return diff >= 0 && diff <= 6;
  }
  if (period === "month") return target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth();
  return true;
}

function renderSmartSuggestions(kind) {
  const map = {
    complaint: ["recordComplaint", "complaintSuggestions"],
    vitals: ["recordVitals", "vitalsSuggestions"],
    conduct: ["recordConduct", "conductSuggestions"],
    prescription: ["recordPrescription", "prescriptionSuggestions"],
    guideProcedure: ["guideProcedure", "guideProcedureSuggestions"],
    guideDescription: ["guideDescription", "guideDescriptionSuggestions"]
  };
  const [fieldId, containerId] = map[kind] || [];
  const field = byId(fieldId);
  const container = byId(containerId);
  if (!field || !container) return;
  const query = normalizeSearch(field.value).split(" ").filter(Boolean).pop() || "";
  const suggestions = (smartCatalog[kind] || [])
    .filter((item) => !query || normalizeSearch(item).includes(query))
    .slice(0, 8);
  container.innerHTML = suggestions.map((item) => `<button type="button" onclick="applySmartSuggestion('${kind}', '${escapeAttr(item)}')">${escapeHtml(item)}</button>`).join("");
}

function applySmartSuggestion(kind, value) {
  const fieldId = {
    complaint: "recordComplaint",
    vitals: "recordVitals",
    conduct: "recordConduct",
    prescription: "recordPrescription",
    guideProcedure: "guideProcedure",
    guideDescription: "guideDescription"
  }[kind];
  const field = byId(fieldId);
  if (!field) return;
  const separator = field.value.trim() ? "\n" : "";
  field.value = `${field.value.trim()}${separator}${value}`;
  renderSmartSuggestions(kind);
}

function suggestConductText() {
  const complaint = byId("recordComplaint").value.trim();
  const vitals = byId("recordVitals").value.trim();
  const diagnosis = byId("recordDiagnosis").value.trim();
  const text = [
    "Paciente avaliado em consulta.",
    complaint ? `Queixa principal: ${complaint}.` : "",
    vitals ? `Sinais vitais registrados: ${vitals}.` : "",
    diagnosis ? `Hipotese diagnostica/avaliacao: ${diagnosis}.` : "",
    "Conduta: orientacoes fornecidas, sinais de alerta explicados, tratamento conforme prescricao e retorno programado conforme evolucao."
  ].filter(Boolean).join("\n");
  byId("recordConduct").value = text;
  renderSmartSuggestions("conduct");
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

async function submitAppointment(event) {
  event.preventDefault();
  if (currentUser.accessRole === "medical") {
    await siteAlert("Medicos nao podem agendar atendimentos. Use o Portal medico para realizar o atendimento.", "Acesso restrito");
    return;
  }
  const data = Object.fromEntries(new FormData(event.target));
  if (!data.patientId || !data.professionalId || !data.serviceId) {
    toast("Selecione paciente, medico e servico.");
    return;
  }
  const validation = validateAppointmentSlot(data.professionalId, data.date, data.time, data.serviceId);
  if (!validation.ok) {
    await siteAlert(validation.message, "Horario indisponivel");
    openSlotModal(data.professionalId, data.date, data.serviceId);
    return;
  }
  let appointment = { id: uid("a"), ...data };
  appointment = await saveAppointmentRemote(appointment);
  state.appointments.push(appointment);
  const service = serviceById(data.serviceId);
  let financeItem = {
    id: uid("f"),
    description: `${service.name} - ${patientById(data.patientId).name}`,
    amount: service.price,
    type: "income",
    dueDate: data.date,
    status: "open",
    professionalId: data.professionalId,
    patientId: data.patientId,
    appointmentId: appointment.id,
    paymentMethod: "A definir"
  };
  financeItem = await saveFinanceRemote(financeItem);
  state.finance.push(financeItem);
  currentScheduleDate = data.date;
  byId("scheduleDateFilter").value = data.date;
  state.audit.unshift({ id: uid("lg"), action: "Consulta agendada", actor: "Usuario atual", target: patientById(data.patientId).name, at: "Agora" });
  saveState();
  renderAll();
  toast("Consulta agendada e lancamento financeiro criado.");
}

async function submitPatient(event) {
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
    const saved = await savePatientRemote(patient);
    Object.assign(patient, saved);
    toast("Paciente atualizado.");
  } else {
    const saved = await savePatientRemote({ id: uid("p"), noShow: 0, ...data });
    state.patients.push(saved);
    toast("Paciente cadastrado.");
  }
  saveState();
  resetPatientForm();
  renderAll();
}

async function submitRecord(event) {
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
  const saved = await saveRecordRemote(record);
  state.records.push(saved);
  state.audit.unshift({ id: uid("lg"), action: "Evolucao clinica registrada", actor: "Usuario atual", target: patientById(record.patientId).name, at: "Agora" });
  saveState();
  event.target.reset();
  byId("recordPatient").value = record.patientId;
  renderAll();
  toast("Prontuario atualizado com historico do paciente.");
}

async function submitFinance(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const saved = await saveFinanceRemote({ id: uid("f"), amount: Number(data.amount), ...data });
  state.finance.push(saved);
  saveState();
  event.target.reset();
  setDefaultDates();
  renderAll();
  toast("Movimentacao financeira lancada.");
}

async function submitInsurancePlan(event) {
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
    const saved = await savePlanRemote(plan);
    Object.assign(plan, saved);
    state.patients.forEach((patient) => {
      if (patient.insurance === oldName) patient.insurance = name;
    });
    toast("Plano de saude atualizado.");
  } else {
    const saved = await savePlanRemote({ id: uid("ip"), active: true, name, contact: data.contact });
    state.insurancePlans.push(saved);
    toast("Plano de saude cadastrado.");
  }
  editingInsurancePlanId = null;
  event.target.reset();
  saveState();
  populateSelects();
  renderInsurancePlans();
  renderPatients();
}

async function submitEmployee(event) {
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
    const accessRole = employee.accessRole || (data.role === "doctor" ? "medical" : "receptionist");
    Object.assign(employee, data, { accessRole, professionalId: data.role === "doctor" ? professionalId : employee.professionalId });
    const saved = await saveEmployeeRemote(employee);
    Object.assign(employee, saved);
    toast("Funcionario atualizado.");
  } else {
    const accessRole = data.role === "doctor" ? "medical" : "receptionist";
    const saved = await saveEmployeeRemote({
      id: uid("e"),
      professionalId: data.role === "doctor" ? uid("dr") : "",
      accessRole,
      ...data
    });
    state.employees.push(saved);
    toast("Funcionario cadastrado.");
  }

  syncProfessionalsFromEmployees();
  saveState();
  resetEmployeeForm();
  renderAll();
}

async function submitTenantName(event) {
  event.preventDefault();
  const name = new FormData(event.target).get("clinicName")?.trim();
  if (!name) return;
  state.tenant.name = name;
  saveState();
  await saveTenantRemote();
  renderAll();
  toast("Nome da clinica atualizado.");
}

async function submitFinanceSettings(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.tenant.settings = {
    ...state.tenant.settings,
    commissionEnabled: byId("commissionEnabled").checked,
    commissionRule: data.commissionRule || "paid_on_settlement",
    defaultCommission: Number(data.defaultCommission || 0)
  };
  saveState();
  await saveTenantRemote();
  renderAll();
  toast("Configuracao financeira salva.");
}

async function saveGeneratedDocument(type) {
  const patientId = byId("recordPatient").value;
  const outputId = type === "certificate" ? "certificateOutput" : "prescriptionOutput";
  const text = byId(outputId).value.trim();
  if (!patientId || !text) {
    await siteAlert("Gere o documento antes de gravar no prontuario.", "Documento vazio");
    return;
  }
  const record = {
    id: uid("r"),
    patientId,
    type,
    complaint: statusLabel[type],
    vitals: "",
    diagnosis: statusLabel[type],
    conduct: text,
    prescription: type === "prescription" ? text : "",
    followUp: "",
    notes: "Documento gerado pelo Clinicou",
    documentText: text,
    createdAt: new Date().toISOString()
  };
  const saved = await saveRecordRemote(record);
  state.records.push(saved);
  saveState();
  renderAll();
  toast(`${statusLabel[type]} gravado no historico do prontuario.`);
}

async function submitAvailability(event) {
  event.preventDefault();
  const doctorId = byId("availabilityDoctor").value;
  const employee = state.employees.find((item) => item.professionalId === doctorId || item.id === doctorId);
  if (!employee) {
    await siteAlert("Selecione um medico para configurar a disponibilidade.", "Agenda medica");
    return;
  }
  const days = [...event.target.querySelectorAll("[name='days']:checked")].map((input) => Number(input.value));
  if (!days.length) {
    await siteAlert("Escolha pelo menos um dia da semana.", "Agenda medica");
    return;
  }
  employee.availability = [{ days, start: byId("availabilityStart").value || "08:00", end: byId("availabilityEnd").value || "18:00" }];
  employee.start = employee.availability[0].start;
  employee.end = employee.availability[0].end;
  syncProfessionalsFromEmployees();
  saveState();
  await saveEmployeeRemote(employee);
  renderAll();
  toast("Disponibilidade do medico salva.");
}

async function submitGuide(event) {
  event.preventDefault();
  const signatureData = getSignatureData();
  if (!signatureData) {
    await siteAlert("O paciente precisa assinar escrevendo no campo de assinatura.", "Assinatura obrigatoria");
    return;
  }
  const data = Object.fromEntries(new FormData(event.target));
  const guide = {
    id: uid("g"),
    patientId: data.patientId,
    professionalId: data.professionalId,
    date: data.date || todayIso,
    procedure: data.procedure || "Atendimento profissional",
    description: byId("guideDescription").value,
    signatureData,
    createdAt: new Date().toISOString()
  };
  const saved = await saveGuideRemote(guide);
  state.guides.unshift(saved);
  const guideRecord = await saveRecordRemote({
    id: uid("r"),
    patientId: saved.patientId,
    type: "guide",
    complaint: "Guia de atendimento assinada",
    diagnosis: saved.procedure,
    conduct: saved.description,
    prescription: "",
    followUp: "",
    notes: "Guia assinada digitalmente pelo paciente",
    documentText: saved.description,
    createdAt: new Date().toISOString()
  });
  state.records.push(guideRecord);
  saveState();
  clearSignature();
  event.target.reset();
  setDefaultDates();
  renderAll();
  toast("Guia assinada salva e vinculada ao prontuario.");
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
  const slots = availableSlots(professional.id, date, service.id, 14);
  if (!slots.length) {
    byId("slotSuggestion").textContent = "Nao encontrei horarios livres para este medico nos proximos 14 dias.";
    return;
  }
  byId("slotSuggestion").textContent = `${slots.length} horario(s) disponiveis encontrados para ${professional.name}.`;
  openSlotModal(professional.id, date, service.id);
}

function updateSlotAvailabilityPreview() {
  const proId = byId("appointmentProfessional")?.value;
  const date = byId("appointmentDate")?.value;
  const time = byId("appointmentTime")?.value;
  const serviceId = byId("appointmentService")?.value;
  if (!proId || !date || !time) return;
  const validation = validateAppointmentSlot(proId, date, time, serviceId);
  byId("slotSuggestion").textContent = validation.ok
    ? "Horario disponivel para este medico."
    : validation.message;
}

function validateAppointmentSlot(professionalId, date, time, serviceId) {
  const professional = professionalById(professionalId);
  const service = serviceById(serviceId);
  const availability = availabilityForDate(professional, date);
  if (!availability) return { ok: false, message: `${professional.name} nao atende em ${formatDate(date)}.` };
  if (!time) return { ok: false, message: "Informe um horario para validar a disponibilidade." };
  const start = toMinutes(time);
  const end = start + Number(service.duration || 30);
  const availStart = toMinutes(availability.start);
  const availEnd = toMinutes(availability.end);
  if (start < availStart || end > availEnd) {
    return { ok: false, message: `${professional.name} atende neste dia de ${availability.start} as ${availability.end}.` };
  }
  const conflict = state.appointments.some((appt) => {
    if (appt.professionalId !== professionalId || appt.date !== date) return false;
    const apptStart = toMinutes(appt.time);
    const apptEnd = apptStart + Number(serviceById(appt.serviceId).duration || 30);
    return start < apptEnd && end > apptStart;
  });
  if (conflict) return { ok: false, message: "Este horario conflita com outra consulta do mesmo medico." };
  return { ok: true, message: "Horario disponivel." };
}

function availableSlots(professionalId, fromDate, serviceId, daysAhead = 14) {
  const service = serviceById(serviceId);
  const professional = professionalById(professionalId);
  const slots = [];
  const base = new Date(`${fromDate || todayIso}T12:00:00`);
  for (let d = 0; d < daysAhead; d += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + d);
    const iso = date.toISOString().slice(0, 10);
    const availability = availabilityForDate(professional, iso);
    if (!availability) continue;
    for (let minutes = toMinutes(availability.start); minutes + Number(service.duration || 30) <= toMinutes(availability.end); minutes += 30) {
      const time = fromMinutes(minutes);
      if (validateAppointmentSlot(professionalId, iso, time, serviceId).ok) {
        slots.push({ date: iso, time, professionalId, serviceId });
      }
    }
  }
  return slots.slice(0, 24);
}

function openSlotModal(professionalId, date, serviceId) {
  const professional = professionalById(professionalId);
  const slots = availableSlots(professionalId, date || todayIso, serviceId, 21);
  byId("slotModalTitle").textContent = `${professional.name} - horarios disponiveis`;
  byId("slotOptions").innerHTML = slots.map((slot) => `<button type="button" onclick="chooseSlot('${slot.date}','${slot.time}')">
    <strong>${formatDate(slot.date)}</strong>
    <span>${slot.time}</span>
  </button>`).join("") || emptyState("Nenhum horario disponivel encontrado para este medico.");
  byId("slotModal").classList.add("open");
  lucide.createIcons();
}

function closeSlotModal() {
  byId("slotModal").classList.remove("open");
}

function chooseSlot(date, time) {
  byId("appointmentDate").value = date;
  byId("appointmentTime").value = time;
  byId("scheduleDateFilter").value = date;
  currentScheduleDate = date;
  closeSlotModal();
  updateSlotAvailabilityPreview();
  renderSchedule();
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
  if (!state.tenant.settings?.commissionEnabled) {
    if (byId("commissionPreview")) byId("commissionPreview").textContent = "Comissoes medicas estao desativadas nas configuracoes financeiras da clinica.";
    return;
  }
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
    const { data: sessionData } = await supabaseClient.auth.getSession();
    currentUser.email = sessionData?.session?.user?.email || data.email;
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
  const { data: clinics, error } = await supabaseClient.from("clinics").select("id,name,plan,settings").limit(1);
  if (error) {
    toast(`Nao foi possivel carregar a clinica: ${error.message}`);
    return;
  }
  if (clinics?.[0]) {
    activeClinicId = clinics[0].id;
    state.tenant = {
      ...state.tenant,
      ...clinics[0],
      settings: { ...state.tenant.settings, ...(clinics[0].settings || {}) }
    };
    remoteReady = true;
    await loadClinicTables();
    saveState();
    renderAll();
  }
}

async function loadClinicTables() {
  const clinicId = currentClinicId();
  if (!clinicId) return;
  const [
    plans,
    patients,
    staff,
    services,
    appointments,
    finance,
    records,
    commissions,
    guides
  ] = await Promise.all([
    remoteSelect("insurance_plans", "id,name,contact,active", clinicId),
    remoteSelect("patients", "id,full_name,phone,whatsapp,email,cpf,document,insurance,risk,no_show_score,insurance_plan_id", clinicId),
    remoteSelect("staff_members", "id,professional_id,full_name,role,crm,specialty,phone,whatsapp,email,commission_percent,working_hours,access_role,permissions,status", clinicId),
    remoteSelect("services", "id,name,specialty,duration_minutes,price,active", clinicId),
    remoteSelect("appointments", "id,patient_id,professional_id,service_id,starts_at,ends_at,status", clinicId),
    remoteSelect("financial_transactions", "id,description,type,amount,due_date,status,payment_method,professional_id,patient_id,appointment_id", clinicId),
    remoteSelect("medical_records", "id,patient_id,professional_id,template,complaint,payload,signed_at,created_at", clinicId),
    remoteSelect("commissions", "id,professional_id,transaction_id,percent,amount,status,settled_at,created_at", clinicId),
    remoteSelect("attendance_guides", "id,patient_id,professional_id,service_date,procedure,description,signature_data,created_at", clinicId)
  ]);

  if (plans) state.insurancePlans = plans.map(fromRemotePlan);
  if (patients) state.patients = patients.map(fromRemotePatient);
  if (staff) state.employees = staff.map(fromRemoteStaff);
  resolveCurrentUser();
  if (services?.length) state.services = services.map(fromRemoteService);
  syncProfessionalsFromEmployees();
  if (appointments) state.appointments = appointments.map(fromRemoteAppointment);
  if (finance) state.finance = finance.map(fromRemoteFinance);
  if (records) state.records = records.map(fromRemoteRecord);
  if (commissions) state.commissions = commissions.map(fromRemoteCommission);
  if (guides) state.guides = guides.map(fromRemoteGuide);
}

async function remoteSelect(table, columns, clinicId) {
  if (!supabaseClient || !clinicId) return null;
  const { data, error } = await supabaseClient.from(table).select(columns).eq("clinic_id", clinicId);
  if (error) {
    toast(`Tabela ${table} nao carregou: ${error.message}`);
    return null;
  }
  return data || [];
}

function currentClinicId() {
  return activeClinicId || (isUuid(state.tenant.id) ? state.tenant.id : "");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function upsertRemote(table, payload, id) {
  const clinicId = currentClinicId();
  if (!remoteReady || !supabaseClient || !clinicId) return null;
  const body = { ...payload, clinic_id: clinicId };
  if (isUuid(id)) body.id = id;
  const query = isUuid(id)
    ? supabaseClient.from(table).upsert(body).select().single()
    : supabaseClient.from(table).insert(body).select().single();
  const { data, error } = await query;
  if (error) {
    toast(`Nao foi possivel gravar em ${table}: ${error.message}`);
    return null;
  }
  return data;
}

async function deleteRemote(table, id) {
  if (!remoteReady || !supabaseClient || !isUuid(id)) return;
  const { error } = await supabaseClient.from(table).delete().eq("id", id);
  if (error) toast(`Nao foi possivel excluir em ${table}: ${error.message}`);
}

async function saveTenantRemote() {
  if (!remoteReady || !supabaseClient || !currentClinicId()) return;
  const { data, error } = await supabaseClient
    .from("clinics")
    .update({ name: state.tenant.name, settings: state.tenant.settings || {} })
    .eq("id", currentClinicId())
    .select("id,name,plan,settings")
    .single();
  if (error) {
    toast(`Nome salvo localmente, mas nao gravou no Supabase: ${error.message}`);
    return;
  }
  state.tenant = { ...state.tenant, ...data, settings: { ...state.tenant.settings, ...(data.settings || {}) } };
}

function fromRemotePlan(row) {
  return { id: row.id, name: row.name, contact: row.contact || "", active: row.active };
}

function toRemotePlan(plan) {
  return { name: plan.name, contact: plan.contact || "", active: plan.active !== false };
}

function fromRemotePatient(row) {
  return {
    id: row.id,
    name: row.full_name,
    cpf: formatCpf(row.cpf || row.document || ""),
    phone: formatPhone(row.whatsapp || row.phone || ""),
    email: row.email || "",
    risk: row.risk || "low",
    insurance: row.insurance || "Particular",
    noShow: Number(row.no_show_score || 0)
  };
}

function toRemotePatient(patient) {
  return {
    full_name: patient.name,
    phone: patient.phone,
    whatsapp: patient.phone,
    email: patient.email || "",
    cpf: patient.cpf || "",
    document: digitsOnly(patient.cpf),
    insurance: patient.insurance || "Particular",
    risk: patient.risk || "low",
    no_show_score: Number(patient.noShow || 0)
  };
}

function fromRemoteStaff(row) {
  const hours = row.working_hours || {};
  const accessRole = row.access_role || (row.role === "doctor" ? "medical" : "receptionist");
  return {
    id: row.id,
    professionalId: row.professional_id || row.id,
    name: row.full_name,
    role: row.role,
    crm: row.crm || "",
    specialty: row.specialty || "",
    phone: formatPhone(row.whatsapp || row.phone || ""),
    email: row.email || "",
    commission: Number(row.commission_percent || 0),
    start: hours.start || "08:00",
    end: hours.end || "18:00",
    availability: hours.availability || [{ days: [1, 2, 3, 4, 5], start: hours.start || "08:00", end: hours.end || "18:00" }],
    accessRole,
    permissions: Array.isArray(row.permissions) ? row.permissions : undefined,
    status: row.status || "active"
  };
}

function toRemoteStaff(employee) {
  return {
    professional_id: isUuid(employee.professionalId) ? employee.professionalId : null,
    full_name: employee.name,
    role: employee.role,
    crm: employee.crm || "",
    specialty: employee.specialty || "",
    phone: employee.phone || "",
    whatsapp: employee.phone || "",
    email: employee.email || "",
    commission_percent: Number(employee.commission || 0),
    working_hours: { start: employee.start || "08:00", end: employee.end || "18:00", availability: employee.availability || [] },
    access_role: employee.accessRole || (employee.role === "doctor" ? "medical" : "receptionist"),
    permissions: Array.isArray(employee.permissions) ? employee.permissions : null,
    status: employee.status || "active"
  };
}

function toRemoteProfessional(employee) {
  return {
    full_name: employee.name,
    specialty: employee.specialty || "Medicina",
    license: employee.crm || "",
    commission_percent: Number(employee.commission || 0),
    working_hours: { start: employee.start || "08:00", end: employee.end || "18:00", availability: employee.availability || [] },
    active: employee.status === "active"
  };
}

function fromRemoteService(row) {
  return { id: row.id, name: row.name, specialty: row.specialty || "", duration: Number(row.duration_minutes || 30), price: Number(row.price || 0), active: row.active };
}

function fromRemoteAppointment(row) {
  const start = new Date(row.starts_at);
  return {
    id: row.id,
    patientId: row.patient_id,
    professionalId: row.professional_id,
    serviceId: row.service_id,
    date: start.toISOString().slice(0, 10),
    time: start.toTimeString().slice(0, 5),
    status: row.status
  };
}

function toRemoteAppointment(appointment) {
  const service = serviceById(appointment.serviceId);
  const startsAt = new Date(`${appointment.date}T${appointment.time || "08:00"}:00`);
  const endsAt = new Date(startsAt.getTime() + Number(service.duration || 30) * 60000);
  return {
    patient_id: appointment.patientId,
    professional_id: appointment.professionalId,
    service_id: isUuid(appointment.serviceId) ? appointment.serviceId : null,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: appointment.status || "scheduled",
    source: "manual"
  };
}

function fromRemoteFinance(row) {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount || 0),
    type: row.type,
    dueDate: row.due_date,
    status: row.status,
    professionalId: row.professional_id || "",
    patientId: row.patient_id || "",
    appointmentId: row.appointment_id || "",
    paymentMethod: row.payment_method || ""
  };
}

function toRemoteFinance(item) {
  return {
    description: item.description,
    amount: Number(item.amount || 0),
    type: item.type,
    due_date: item.dueDate || todayIso,
    status: item.status || "open",
    payment_method: item.paymentMethod || "",
    professional_id: isUuid(item.professionalId) ? item.professionalId : null,
    patient_id: isUuid(item.patientId) ? item.patientId : null,
    appointment_id: isUuid(item.appointmentId) ? item.appointmentId : null
  };
}

function fromRemoteRecord(row) {
  const payload = row.payload || {};
  return {
    id: row.id,
    patientId: row.patient_id,
    professionalId: row.professional_id || "",
    type: row.template || "geral",
    complaint: row.complaint || "",
    vitals: payload.vitals || "",
    diagnosis: payload.diagnosis || "",
    conduct: payload.conduct || payload.documentText || "",
    prescription: payload.prescription || "",
    followUp: payload.followUp || "",
    notes: payload.notes || "",
    documentText: payload.documentText || "",
    createdAt: row.created_at
  };
}

function toRemoteRecord(record) {
  return {
    patient_id: record.patientId,
    professional_id: isUuid(record.professionalId) ? record.professionalId : null,
    template: record.type || "geral",
    complaint: record.complaint || "",
    payload: {
      vitals: record.vitals || "",
      diagnosis: record.diagnosis || "",
      conduct: record.conduct || "",
      prescription: record.prescription || "",
      followUp: record.followUp || "",
      notes: record.notes || "",
      documentText: record.documentText || ""
    },
    signed_at: null
  };
}

function fromRemoteCommission(row) {
  return {
    id: row.id,
    professionalId: row.professional_id,
    transactionId: row.transaction_id,
    percent: Number(row.percent || 0),
    amount: Number(row.amount || 0),
    status: row.status || "pending",
    settledAt: row.settled_at || "",
    createdAt: row.created_at
  };
}

function toRemoteCommission(commission) {
  return {
    professional_id: commission.professionalId,
    transaction_id: commission.transactionId,
    percent: Number(commission.percent || 0),
    amount: Number(commission.amount || 0),
    status: commission.status || "pending",
    settled_at: commission.settledAt || null
  };
}

function fromRemoteGuide(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    professionalId: row.professional_id,
    date: row.service_date,
    procedure: row.procedure || "",
    description: row.description || "",
    signatureData: row.signature_data || "",
    createdAt: row.created_at
  };
}

function toRemoteGuide(guide) {
  return {
    patient_id: guide.patientId,
    professional_id: guide.professionalId,
    service_date: guide.date || todayIso,
    procedure: guide.procedure || "",
    description: guide.description || "",
    signature_data: guide.signatureData || ""
  };
}

async function savePatientRemote(patient) {
  const row = await upsertRemote("patients", toRemotePatient(patient), patient.id);
  return row ? fromRemotePatient(row) : patient;
}

async function savePlanRemote(plan) {
  const row = await upsertRemote("insurance_plans", toRemotePlan(plan), plan.id);
  return row ? fromRemotePlan(row) : plan;
}

async function saveEmployeeRemote(employee) {
  if (employee.role === "doctor") {
    const proRow = await upsertRemote("professionals", toRemoteProfessional(employee), employee.professionalId);
    if (proRow) employee.professionalId = proRow.id;
  }
  const row = await upsertRemote("staff_members", toRemoteStaff(employee), employee.id);
  return row ? fromRemoteStaff(row) : employee;
}

async function saveAppointmentRemote(appointment) {
  if (!isUuid(appointment.patientId) || !isUuid(appointment.professionalId)) return appointment;
  const row = await upsertRemote("appointments", toRemoteAppointment(appointment), appointment.id);
  return row ? fromRemoteAppointment(row) : appointment;
}

async function saveFinanceRemote(item) {
  const row = await upsertRemote("financial_transactions", toRemoteFinance(item), item.id);
  return row ? fromRemoteFinance(row) : item;
}

async function saveRecordRemote(record) {
  if (!isUuid(record.patientId)) return record;
  const row = await upsertRemote("medical_records", toRemoteRecord(record), record.id);
  return row ? fromRemoteRecord(row) : record;
}

async function saveCommissionRemote(commission) {
  if (!isUuid(commission.professionalId) || !isUuid(commission.transactionId)) return commission;
  const row = await upsertRemote("commissions", toRemoteCommission(commission), commission.id);
  return row ? fromRemoteCommission(row) : commission;
}

async function saveGuideRemote(guide) {
  if (!isUuid(guide.patientId) || !isUuid(guide.professionalId)) return guide;
  const row = await upsertRemote("attendance_guides", toRemoteGuide(guide), guide.id);
  return row ? fromRemoteGuide(row) : guide;
}

async function markPaid(id) {
  const item = state.finance.find((f) => f.id === id);
  if (item) item.status = "paid";
  if (item) Object.assign(item, await saveFinanceRemote(item));
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

async function deletePatient(id) {
  const patient = patientById(id);
  if (!await siteConfirm(`Excluir ${patient.name}? Esta acao remove agenda e prontuario vinculados.`, "Excluir paciente")) return;
  await deleteRemote("patients", id);
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

async function toggleInsurancePlan(id) {
  const plan = state.insurancePlans.find((item) => item.id === id);
  if (!plan) return;
  plan.active = !plan.active;
  Object.assign(plan, await savePlanRemote(plan));
  saveState();
  populateSelects();
  renderInsurancePlans();
  toast(plan.active ? "Plano reativado." : "Plano suspenso.");
}

async function deleteInsurancePlan(id) {
  const plan = state.insurancePlans.find((item) => item.id === id);
  if (!plan) return;
  if (state.patients.some((patient) => patient.insurance === plan.name)) {
    toast("Este plano esta vinculado a pacientes. Altere os pacientes antes de excluir.");
    return;
  }
  if (!await siteConfirm(`Excluir plano ${plan.name}?`, "Excluir plano")) return;
  await deleteRemote("insurance_plans", id);
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

async function toggleEmployeeStatus(id) {
  const employee = employeeById(id);
  if (!employee.id) return;
  employee.status = employee.status === "active" ? "suspended" : "active";
  Object.assign(employee, await saveEmployeeRemote(employee));
  syncProfessionalsFromEmployees();
  saveState();
  renderAll();
  toast(employee.status === "active" ? "Funcionario reativado." : "Funcionario suspenso.");
}

async function deleteEmployee(id) {
  const employee = employeeById(id);
  if (!employee.id) return;
  const hasAppointments = employee.professionalId && state.appointments.some((appointment) => appointment.professionalId === employee.professionalId);
  if (hasAppointments) {
    toast("Funcionario possui consultas vinculadas. Suspenda em vez de excluir.");
    return;
  }
  if (!await siteConfirm(`Excluir funcionario ${employee.name}?`, "Excluir funcionario")) return;
  await deleteRemote("staff_members", id);
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
      <p class="item-title">${formatDateTime(record.createdAt)} - ${escapeHtml(statusLabel[record.type] || record.diagnosis || "Evolucao")}</p>
      <p class="item-sub">Queixa: ${escapeHtml(record.complaint || "Nao informada")}</p>
      <p class="item-sub">Conduta: ${escapeHtml(record.documentText || record.conduct || "Nao informada")}</p>
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

function initSignaturePad() {
  const canvas = byId("signatureCanvas");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.strokeStyle = "#0b1a30";
  signaturePad = { drawing: false, dirty: false, context };

  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0];
    return {
      x: (touch?.clientX ?? event.clientX) - rect.left,
      y: (touch?.clientY ?? event.clientY) - rect.top
    };
  };
  const start = (event) => {
    event.preventDefault();
    const p = point(event);
    signaturePad.drawing = true;
    context.beginPath();
    context.moveTo(p.x, p.y);
  };
  const move = (event) => {
    if (!signaturePad.drawing) return;
    event.preventDefault();
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
    signaturePad.dirty = true;
  };
  const end = () => {
    signaturePad.drawing = false;
  };
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
}

function clearSignature() {
  const canvas = byId("signatureCanvas");
  if (!canvas || !signaturePad) return;
  signaturePad.context.clearRect(0, 0, canvas.width, canvas.height);
  signaturePad.dirty = false;
}

function getSignatureData() {
  const canvas = byId("signatureCanvas");
  if (!canvas || !signaturePad?.dirty) return "";
  return canvas.toDataURL("image/png");
}

function downloadCurrentGuide() {
  const guide = {
    id: "",
    patientId: byId("guidePatient").value,
    professionalId: byId("guideProfessional").value,
    date: byId("guideDate").value || todayIso,
    procedure: byId("guideProcedure").value || "Atendimento profissional",
    description: byId("guideDescription").value,
    signatureData: getSignatureData(),
    createdAt: new Date().toISOString()
  };
  downloadGuideFile(guide);
}

function downloadGuideById(id) {
  const guide = state.guides.find((item) => item.id === id);
  if (guide) downloadGuideFile(guide);
}

function downloadGuideFile(guide) {
  const patient = patientById(guide.patientId);
  const pro = professionalById(guide.professionalId);
  const issuedAt = new Date(guide.createdAt || new Date().toISOString()).toLocaleString("pt-BR");
  const description = escapeHtml(guide.description || "Sem descricao registrada.").replace(/\n/g, "<br>");
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Guia de atendimento - ${escapeHtml(patient.name)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#eef3f8;color:#14213d;font-family:Arial,Helvetica,sans-serif;line-height:1.55}.page{width:min(920px,100%);min-height:100vh;margin:0 auto;background:#fff;padding:44px 52px}.header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #0f766e;padding-bottom:18px;margin-bottom:28px}.brand h1{margin:0;color:#0b1a30;font-size:26px;letter-spacing:.02em}.brand p,.meta p{margin:4px 0;color:#52617a;font-size:13px}.meta{text-align:right}.meta strong{display:block;color:#0f766e;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.title{margin:0 0 18px;font-size:20px;text-transform:uppercase;color:#0b1a30}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:18px}.field,.statement,.signature-box{border:1px solid #d7e1ec;border-radius:8px;padding:14px;background:#fbfdff}.field span{display:block;color:#52617a;font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:.08em}.field strong{display:block;margin-top:4px;color:#0b1a30;font-size:15px}.statement{margin:18px 0;color:#24324a;min-height:140px}.statement h2,.signature-box h2{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#0f766e}.signature{display:block;max-width:430px;max-height:160px;margin-top:12px;border-bottom:1px solid #0b1a30;padding:4px 0}.signature-line{height:72px;border-bottom:1px solid #0b1a30;margin:18px 0 8px}.footer{margin-top:32px;padding-top:14px;border-top:1px solid #d7e1ec;color:#52617a;font-size:12px;display:flex;justify-content:space-between;gap:16px}@media print{body{background:#fff}.page{width:100%;padding:28px;min-height:auto}.footer{position:fixed;bottom:18px;left:28px;right:28px}}@media(max-width:720px){.page{padding:28px 20px}.header,.footer{display:block}.meta{text-align:left;margin-top:12px}.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="brand">
        <h1>${escapeHtml(state.tenant.name)}</h1>
        <p>Guia de atendimento profissional com assinatura digital do paciente.</p>
      </div>
      <div class="meta">
        <strong>Documento</strong>
        <p>Emitido em ${issuedAt}</p>
        <p>Codigo: ${escapeHtml(String(guide.id || "").slice(-8).toUpperCase() || "LOCAL")}</p>
      </div>
    </header>

    <h2 class="title">Guia de atendimento</h2>
    <section class="grid">
      <div class="field"><span>Paciente</span><strong>${escapeHtml(patient.name)}</strong></div>
      <div class="field"><span>CPF</span><strong>${escapeHtml(patient.cpf || "Nao informado")}</strong></div>
      <div class="field"><span>Profissional</span><strong>${escapeHtml(pro.name)}</strong></div>
      <div class="field"><span>Registro</span><strong>${escapeHtml(pro.license || pro.specialty || "Nao informado")}</strong></div>
      <div class="field"><span>Data do atendimento</span><strong>${formatDate(guide.date)}</strong></div>
      <div class="field"><span>Procedimento</span><strong>${escapeHtml(guide.procedure || "Atendimento profissional")}</strong></div>
    </section>

    <section class="statement">
      <h2>Descricao e ciencia do paciente</h2>
      <p>${description}</p>
    </section>

    <section class="signature-box">
      <h2>Assinatura digital do paciente</h2>
      ${guide.signatureData ? `<img class="signature" src="${escapeAttr(guide.signatureData)}" alt="Assinatura do paciente">` : `<div class="signature-line"></div>`}
      <p>${escapeHtml(patient.name)}${patient.cpf ? ` - CPF ${escapeHtml(patient.cpf)}` : ""}</p>
    </section>

    <footer class="footer">
      <span>Documento gerado pelo Clinicou.</span>
      <span>Valide os dados antes de anexar a processos externos.</span>
    </footer>
  </main>
</body>
</html>`;
  downloadBlob(html, `guia-atendimento-${normalizeName(patient.name).replace(/\s/g, "-") || "paciente"}.html`, "text/html;charset=utf-8");
}

function siteAlert(message, title = "Aviso") {
  return showSiteDialog({ title, message, confirmText: "Entendi", hideCancel: true });
}

function siteConfirm(message, title = "Confirmar acao") {
  return showSiteDialog({ title, message, confirmText: "Confirmar", cancelText: "Cancelar", hideCancel: false });
}

function showSiteDialog({ title, message, confirmText, cancelText = "Cancelar", hideCancel = false }) {
  byId("siteDialogTitle").textContent = title;
  byId("siteDialogMessage").textContent = message;
  byId("siteDialogConfirm").querySelector("span").textContent = confirmText;
  byId("siteDialogCancel").querySelector("span").textContent = cancelText;
  byId("siteDialogCancel").style.display = hideCancel ? "none" : "inline-flex";
  byId("siteDialog").classList.add("open");
  lucide.createIcons();
  return new Promise((resolve) => {
    siteDialogResolve = resolve;
  });
}

function closeSiteDialog(result) {
  byId("siteDialog").classList.remove("open");
  if (siteDialogResolve) siteDialogResolve(result);
  siteDialogResolve = null;
}

function exportFinanceCsv() {
  const header = "descricao,tipo,valor,vencimento,status,metodo\n";
  const body = state.finance.map((f) => [f.description, f.type, f.amount, f.dueDate, f.status, f.paymentMethod || ""].join(",")).join("\n");
  downloadBlob(header + body, "clinicou-financeiro.csv", "text/csv;charset=utf-8");
}

function exportCommissionsCsv() {
  const header = "profissional,lancamento,base,percentual,comissao,status\n";
  const body = commissionRows().map((row) => [row.professionalName, row.description, row.baseAmount, row.percent, row.amount, row.status].join(",")).join("\n");
  downloadBlob(header + body, "clinicou-comissoes.csv", "text/csv;charset=utf-8");
}

async function settleCommission(transactionId) {
  const row = commissionRows().find((item) => item.transactionId === transactionId);
  if (!row) return;
  const existing = state.commissions.find((commission) => commission.transactionId === transactionId);
  const commission = {
    id: existing?.id || uid("cm"),
    transactionId,
    professionalId: row.professionalId,
    percent: row.percent,
    amount: row.amount,
    status: "settled",
    settledAt: new Date().toISOString()
  };
  const target = existing || commission;
  if (existing) Object.assign(existing, commission);
  else state.commissions.push(commission);
  const saved = await saveCommissionRemote(commission);
  Object.assign(target, saved);
  saveState();
  renderCommissions();
  toast("Comissao marcada como paga.");
}

function loadAvailabilityForm() {
  const doctor = professionalById(byId("availabilityDoctor")?.value || state.professionals[0]?.id);
  const availability = doctor.availability?.[0] || { days: [1, 2, 3, 4, 5], start: doctor.start || "08:00", end: doctor.end || "18:00" };
  document.querySelectorAll("#availabilityForm [name='days']").forEach((input) => {
    input.checked = availability.days.includes(Number(input.value));
  });
  if (byId("availabilityStart")) byId("availabilityStart").value = availability.start || "08:00";
  if (byId("availabilityEnd")) byId("availabilityEnd").value = availability.end || "18:00";
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
  return employee
    ? { id, name: employee.name, specialty: employee.specialty, commission: employee.commission, start: employee.start, end: employee.end, availability: employee.availability || [] }
    : { id: "", name: "Profissional", commission: 0, start: "08:00", end: "18:00", availability: [] };
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

function availabilityForDate(professional, date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return (professional.availability || []).find((item) => (item.days || []).includes(day));
}

function toMinutes(time = "00:00") {
  const [hour, minute] = String(time).split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function fromMinutes(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatWeekdays(days = []) {
  const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  return days.slice().sort((a, b) => a - b).map((day) => names[day]).join(", ");
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
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
window.chooseSlot = chooseSlot;
window.applySmartSuggestion = applySmartSuggestion;
window.updateEmployeeAccessRole = updateEmployeeAccessRole;
window.toggleEmployeePermission = toggleEmployeePermission;
window.settleCommission = settleCommission;
window.downloadGuideById = downloadGuideById;
