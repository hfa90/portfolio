// RH+ Match — núcleo compartilhado (navegador + Edge Function).
// Porte de app/textutils.py, app/matcher.py, app/resume_parser.py e app/sources/links.py.

export const MODALIDADES = ["Presencial", "Híbrido", "Remoto"];
export const SENIORIDADES = ["Estágio", "Júnior", "Pleno", "Sênior", "Especialista", "Gestão"];
export const ORDEM_SENIORIDADE = SENIORIDADES;
export const STATUS_PIPELINE = ["Sugerida", "Enviada ao candidato", "Candidatura feita", "Entrevista", "Proposta", "Contratado", "Descartada"];
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export const REGIOES = {
  "Norte": ["AC", "AM", "AP", "PA", "RO", "RR", "TO"],
  "Nordeste": ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  "Centro-Oeste": ["DF", "GO", "MT", "MS"],
  "Sudeste": ["ES", "MG", "RJ", "SP"],
  "Sul": ["PR", "RS", "SC"],
};
export const regiaoDe = (uf) => Object.keys(REGIOES).find((r) => REGIOES[r].includes(String(uf || "").toUpperCase())) || "";
export const REGIMES = ["CLT", "PJ", "Estágio", "Temporário", "Jovem aprendiz", "Freelancer", "Trainee"];
export const AREAS = ["Administrativo", "Atendimento", "Comercial e Vendas", "Educação", "Engenharia", "Financeiro e Contábil", "Jurídico",
  "Logística", "Marketing e Comunicação", "Operações e Produção", "Recursos Humanos", "Saúde", "Tecnologia", "Outra"];

export const FONTES = [
  { id: "gupy", nome: "Gupy", descricao: "Maior plataforma de recrutamento do Brasil (milhares de empresas).", cobertura: "Brasil · todas as áreas" },
  { id: "vagas_com", nome: "Vagas.com", descricao: "Portal tradicional com vagas de todos os níveis, do operacional à diretoria.", cobertura: "Brasil · todas as áreas" },
  { id: "infojobs", nome: "InfoJobs", descricao: "Um dos maiores portais do país, forte em vagas presenciais e operacionais.", cobertura: "Brasil · todas as áreas" },
  { id: "programathor", nome: "Programathor", descricao: "Vagas de tecnologia no Brasil com stack detalhada.", cobertura: "Brasil · tecnologia" },
  { id: "github_br", nome: "Comunidades GitHub BR", descricao: "Vagas publicadas nas comunidades brasileiras (backend-br, frontendbr, react-brasil, QA, dados, UX…).", cobertura: "Brasil · tecnologia" },
  { id: "remotive", nome: "Remotive", descricao: "Vagas 100% remotas internacionais que aceitam profissionais do Brasil/LatAm.", cobertura: "Internacional · remoto" },
  { id: "himalayas", nome: "Himalayas", descricao: "Portal global de vagas remotas, filtrado para vagas abertas ao Brasil.", cobertura: "Internacional · remoto" },
  { id: "adzuna", nome: "Adzuna", descricao: "Agregador que reúne vagas de centenas de sites brasileiros (requer chave gratuita).", cobertura: "Brasil · agregador", chaves: ["adzuna_app_id", "adzuna_app_key"] },
  { id: "jooble", nome: "Jooble", descricao: "Agregador internacional com grande base brasileira (requer chave gratuita).", cobertura: "Brasil · agregador", chaves: ["jooble_key"] },
];

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o", "as", "os", "na", "no", "nas", "nos", "um", "uma",
  "por", "ou", "the", "and", "of", "to", "vaga", "vagas", "oportunidade", "i", "ii", "iii", "jr", "pl", "sr", "-", "/", "(a)", "a)", "profissional"]);

export const ESTADOS = {
  "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE", "distrito federal": "DF",
  "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG",
  "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN",
  "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO",
};
const UF_SET = new Set(Object.values(ESTADOS));
const ESTADOS_ORD = Object.keys(ESTADOS).sort((a, b) => b.length - a.length);

export const SKILLS = {
  "Python": ["python"], "JavaScript": ["javascript", "js"], "TypeScript": ["typescript"], "Java": ["java"],
  "C#": ["c#", "csharp", ".net", "dotnet"], "PHP": ["php"], "Go": ["golang"], "Ruby": ["ruby", "rails"], "Kotlin": ["kotlin"], "Swift": ["swift"],
  "React": ["react", "reactjs", "react.js"], "React Native": ["react native"], "Angular": ["angular"], "Vue": ["vue", "vuejs", "vue.js"],
  "Node.js": ["node", "nodejs", "node.js"], "Next.js": ["next.js", "nextjs"], "Django": ["django"], "Flask": ["flask"], "FastAPI": ["fastapi"],
  "Spring": ["spring", "spring boot"], "Laravel": ["laravel"], "Flutter": ["flutter"], "HTML": ["html", "html5"],
  "CSS": ["css", "css3", "sass", "scss", "tailwind"], "SQL": ["sql", "mysql", "postgresql", "postgres", "sql server", "oracle", "plsql"],
  "NoSQL": ["mongodb", "nosql", "redis", "dynamodb", "cassandra"], "AWS": ["aws", "amazon web services"], "Azure": ["azure"],
  "GCP": ["gcp", "google cloud"], "Docker": ["docker"], "Kubernetes": ["kubernetes", "k8s"], "Terraform": ["terraform"],
  "CI/CD": ["ci/cd", "jenkins", "github actions", "gitlab ci"], "Git": ["git", "github", "gitlab"], "Linux": ["linux"],
  "Power BI": ["power bi", "powerbi"], "Tableau": ["tableau"], "Excel": ["excel", "planilhas"],
  "Machine Learning": ["machine learning", "aprendizado de maquina", "ml"], "Data Science": ["data science", "ciencia de dados"],
  "IA Generativa": ["llm", "genai", "ia generativa", "langchain", "openai"], "Spark": ["spark", "pyspark", "databricks"],
  "ETL": ["etl", "airflow", "data pipeline"],
  "Testes de Software (QA)": ["qa", "testes automatizados", "selenium", "cypress", "jest", "pytest", "quality assurance"],
  "Scrum": ["scrum", "kanban", "agile", "metodologias ageis"], "SAP": ["sap"], "Salesforce": ["salesforce"],
  "UX/UI": ["ux", "ui", "figma", "design de interface"], "Segurança da Informação": ["seguranca da informacao", "cybersecurity", "pentest"],
  "Suporte Técnico": ["suporte tecnico", "help desk", "service desk", "helpdesk"],
  "Redes de Computadores": ["cisco", "ccna", "infraestrutura de redes", "redes de computadores"],
  "Recrutamento e Seleção": ["recrutamento", "selecao", "r&s", "hunting", "talent acquisition"],
  "Departamento Pessoal": ["departamento pessoal", "folha de pagamento", "esocial", "admissao", "rescisao"],
  "Treinamento e Desenvolvimento": ["treinamento", "t&d", "desenvolvimento humano"],
  "Gestão de Pessoas": ["gestao de pessoas", "lideranca de equipe", "gestao de equipe", "lideranca"],
  "Business Partner": ["business partner", "hrbp"], "Administrativo": ["rotinas administrativas", "administrativo", "atendimento telefonico"],
  "Financeiro": ["financeiro", "contas a pagar", "contas a receber", "conciliacao bancaria", "tesouraria"],
  "Contabilidade": ["contabilidade", "contabil", "balanco", "sped"], "Fiscal": ["fiscal", "tributario", "icms", "impostos"],
  "Controladoria": ["controladoria", "fp&a", "orcamento"], "Compras": ["compras", "suprimentos", "procurement"],
  "Logística": ["logistica", "estoque", "armazem", "wms", "expedicao"], "Jurídico": ["juridico", "advogado", "contratos", "oab"],
  "Gestão de Projetos": ["gestao de projetos", "pmo", "pmp", "project manager"],
  "Vendas": ["vendas", "vendedor", "comercial", "prospeccao", "negociacao"], "CRM": ["crm", "hubspot", "pipedrive"],
  "Atendimento ao Cliente": ["atendimento ao cliente", "sac", "customer success", "relacionamento com cliente"],
  "Telemarketing": ["telemarketing", "call center", "televendas"],
  "Marketing Digital": ["marketing digital", "seo", "google ads", "trafego pago", "meta ads"],
  "Redes Sociais": ["redes sociais", "social media", "instagram"], "Inglês": ["ingles", "english"], "Espanhol": ["espanhol", "spanish"],
  "Enfermagem": ["enfermagem", "coren", "tecnico de enfermagem"], "Farmácia": ["farmacia", "farmaceutico", "crf"],
  "Segurança do Trabalho": ["seguranca do trabalho", "nr10", "nr35", "sesmt"],
  "Manutenção Industrial": ["eletromecanica", "mecanica industrial", "manutencao preventiva", "manutencao corretiva"],
  "Produção Industrial": ["operador de maquina", "linha de producao", "chao de fabrica", "pcp"],
  "Gestão da Qualidade": ["iso 9001", "5s", "lean manufacturing", "six sigma", "controle de qualidade", "garantia da qualidade"],
  "CNH": ["cnh", "carteira de habilitacao"], "Pacote Office": ["pacote office", "word", "powerpoint", "office"],
};

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export function normalizar(texto) {
  if (!texto) return "";
  return String(texto).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", bull: "•",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", atilde: "ã", otilde: "õ", ccedil: "ç", acirc: "â", ecirc: "ê",
  ocirc: "ô", agrave: "à", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Atilde: "Ã", Otilde: "Õ", Ccedil: "Ç",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·" };
export function decodificarEntidades(t) {
  return String(t || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTIDADES[e] ?? m;
  });
}

export function limparHtml(texto) {
  if (!texto) return "";
  let t = String(texto).replace(/<(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
  t = decodificarEntidades(t).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
  return t.replace(/\n\s*\n+/g, "\n").trim();
}

export function tokens(texto) {
  return new Set((normalizar(texto).match(/[a-z0-9#+.]+/g) || []).filter((w) => !STOPWORDS.has(w) && w.length > 1));
}

const PADROES = Object.entries(SKILLS).map(([canon, vars]) => {
  const alts = [...new Set([normalizar(canon), ...vars])].sort((a, b) => b.length - a.length);
  return [canon, new RegExp("(?<![a-z0-9])(?:" + alts.map(reEsc).join("|") + ")(?![a-z0-9])")];
});

export function extrairSkills(texto) {
  const t = normalizar(texto);
  return PADROES.filter(([, p]) => p.test(t)).map(([c]) => c);
}

export function skillNoTexto(skill, textoNorm) {
  const n = normalizar(skill);
  const p = PADROES.find(([c]) => normalizar(c) === n);
  if (p) return p[1].test(textoNorm);
  return new RegExp("(?<![a-z0-9])" + reEsc(n) + "(?![a-z0-9])").test(textoNorm);
}

const SENIORIDADE_REGRAS = [
  ["Estágio", /\b(estagio|estagiario|estagiaria|intern|internship|trainee|aprendiz|jovem aprendiz)\b/],
  ["Gestão", /\b(gerente|coordenador|coordenadora|diretor|diretora|head|supervisor|supervisora|manager|lider)\b/],
  ["Especialista", /\b(especialista|staff|principal|arquiteto|arquiteta|expert)\b/],
  ["Sênior", /\b(senior|sr)\b/],
  ["Pleno", /\b(pleno|pl|mid|middle)\b/],
  ["Júnior", /\b(junior|jr|entry|assistente|auxiliar)\b/],
];
export function detectarSenioridade(titulo, extra = "") {
  const t = normalizar(titulo);
  for (const [n, p] of SENIORIDADE_REGRAS) if (p.test(t)) return n;
  const e = normalizar(extra).slice(0, 600);
  for (const [n, p] of SENIORIDADE_REGRAS.slice(0, 5)) if (p.test(e)) return n;
  return "";
}

export function detectarModalidade(texto) {
  const t = normalizar(texto);
  if (/\b(hibrido|hybrid|semipresencial|semi-presencial|semi presencial)\b/.test(t)) return "Híbrido";
  if (/\b(remoto|remote|home ?office|100% remoto|anywhere|teletrabalho)\b/.test(t)) return "Remoto";
  if (/\b(presencial|on-site|onsite|in office)\b/.test(t)) return "Presencial";
  return "";
}

export function detectarContrato(texto) {
  const t = normalizar(texto);
  return [["CLT", /\bclt\b|efetivo/], ["PJ", /\bpj\b|pessoa juridica/], ["Estágio", /\bestagio\b/], ["Temporário", /temporari/],
    ["Freelancer", /freela/], ["Cooperado", /cooperad/]].filter(([, p]) => p.test(t)).map(([n]) => n).join("/");
}

export function ufDe(texto) {
  if (!texto) return "";
  const m = String(texto).match(/(?:^|[\s,/(-])([A-Z]{2})(?:$|[\s,)/-])/);
  if (m && UF_SET.has(m[1])) return m[1];
  const t = normalizar(texto);
  for (const nome of ESTADOS_ORD) if (new RegExp("\\b" + nome + "\\b").test(t)) return ESTADOS[nome];
  return "";
}

export function separarCidadeUf(local) {
  if (!local) return ["", ""];
  const uf = ufDe(local);
  let cidade = String(local).trim().split(/\s*[-/,]\s*/)[0].trim();
  if (normalizar(cidade) in ESTADOS || cidade.toUpperCase() === uf) cidade = "";
  return [cidade, uf];
}

const pad = (n) => String(n).padStart(2, "0");
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function dataIso(valor) {
  if (!valor) return "";
  const v = String(valor).trim();
  let m = v.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) { const a = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${a}-${pad(m[2])}-${pad(m[1])}`; }
  if (/^\d{10,}$/.test(v)) { const d = new Date(+v.slice(0, 10) * 1000); return isNaN(d) ? "" : isoLocal(d); }
  if (/^[a-z]{3}, \d{1,2} [a-z]{3} \d{4}/i.test(v)) { const d = new Date(v); if (!isNaN(d)) return isoLocal(d); }
  const t = normalizar(v); const hoje = new Date();
  if (t.includes("hoje")) return isoLocal(hoje);
  if (t.includes("ontem")) return isoLocal(new Date(hoje - 864e5));
  m = t.match(/ha (\d+) dias?/);
  if (m) return isoLocal(new Date(hoje - +m[1] * 864e5));
  const meses = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  m = t.match(/^(\d{1,2}) (\w{3})/);
  if (m && meses[m[2]]) {
    let d = new Date(hoje.getFullYear(), meses[m[2]] - 1, +m[1]);
    if (d > hoje) d = new Date(hoje.getFullYear() - 1, meses[m[2]] - 1, +m[1]);
    return isoLocal(d);
  }
  return "";
}

export const slug = (texto) => normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function extrairValorSalario(texto) {
  if (!texto) return 0;
  let max = 0;
  for (const m of normalizar(texto).matchAll(/r?\$?\s?(\d{1,3}(?:\.\d{3})+|\d{3,6})(?:,\d{2})?/g)) {
    const v = parseFloat(m[1].replace(/\./g, ""));
    if (v >= 800 && v <= 100000 && v > max) max = v;
  }
  return max;
}

/** Equivalente ao Fonte.montar() do desktop: normaliza uma vaga crua. */
export function montarVaga(fonte, o) {
  const tags = (o.tags || []).filter(Boolean).map(String);
  const descricao = limparHtml(o.descricao || "");
  let { cidade = "", uf = "" } = o;
  const local = o.local || "";
  if (!(cidade || uf) && local) [cidade, uf] = separarCidadeUf(local);
  const contexto = [o.titulo, local, tags.join(" "), descricao.slice(0, 800)].join(" ");
  const titulo = String(o.titulo || "").split(/\s+/).join(" ").replace(/[\s|–—-]+$/, "");
  return {
    titulo, empresa: String(o.empresa || "").split(/\s+/).join(" ").trim(), url: o.url || "", fonte,
    cidade, uf,
    modalidade: o.modalidade || detectarModalidade([titulo, local, tags.join(" ")].join(" ")) || detectarModalidade(descricao.slice(0, 1500)),
    senioridade: o.senioridade || detectarSenioridade(titulo, tags.join(" ")),
    salario: o.salario || "", contrato: o.contrato || detectarContrato(contexto), descricao, tags,
    publicada_em: o.publicada || "",
  };
}

export function localVaga(v) {
  if (v.modalidade === "Remoto" && !v.cidade) return "Remoto";
  return [v.cidade, v.uf].filter(Boolean).join(" / ") || "Não informado";
}

/* ---------------------------------------------------------------- matcher */
const lista = (s) => String(s || "").split(",").map((p) => p.trim()).filter(Boolean);
export const cargosDe = (c) => [String(c.cargo_desejado || "").trim(), ...lista(c.cargos_alternativos)].filter(Boolean);

// difflib.SequenceMatcher(None, a, b).ratio()
function ratio(a, b) {
  if (!a.length && !b.length) return 1;
  const casar = (a0, a1, b0, b1) => {
    let best = 0, bi = 0, bj = 0;
    let prev = new Array(b1 - b0 + 1).fill(0);
    for (let i = a0; i < a1; i++) {
      const cur = new Array(b1 - b0 + 1).fill(0);
      for (let j = b0; j < b1; j++) {
        if (a[i] === b[j]) { const k = prev[j - b0] + 1; cur[j - b0 + 1] = k; if (k > best) { best = k; bi = i - k + 1; bj = j - k + 1; } }
      }
      prev = cur;
    }
    if (!best) return 0;
    return best + casar(a0, bi, b0, bj) + casar(bi + best, a1, bj + best, b1);
  };
  return (2 * casar(0, a.length, 0, b.length)) / (a.length + b.length);
}

const PESOS = { cargo: 35, skills: 30, modalidade: 12, local: 13, senioridade: 10 };

function scoreCargo(cargos, titulo) {
  if (!cargos.length) return [0.5, "Sem cargo desejado"];
  const tTok = tokens(titulo), tNorm = normalizar(titulo);
  let melhor = 0, melhorCargo = "";
  for (const cargo of cargos) {
    const cTok = tokens(cargo);
    if (!cTok.size) continue;
    const cobertura = [...cTok].filter((x) => tTok.has(x)).length / cTok.size;
    const similar = ratio(normalizar(cargo), tNorm);
    const contem = tNorm.includes(normalizar(cargo)) ? 1 : 0;
    const s = Math.max(cobertura * 0.85 + similar * 0.15, contem);
    if (s > melhor) { melhor = s; melhorCargo = cargo; }
  }
  return [melhor, melhor >= 0.5 ? `Título compatível com “${melhorCargo}”` : "Título pouco relacionado"];
}

/** Calcula score 0–100 e a explicação. Retorna uma cópia da vaga com score e detalhes_score. */
export function avaliar(c, vaga) {
  const v = { ...vaga };
  const bruto = [v.titulo, (v.tags || []).join(" "), v.descricao || ""].join(" ");
  const texto = normalizar(bruto);
  const det = {};
  const [sCargo, msgCargo] = scoreCargo(cargosDe(c), v.titulo);
  det.cargo = msgCargo;

  const skillsC = lista(c.skills);
  const batem = skillsC.filter((s) => skillNoTexto(s, texto));
  const pedidas = extrairSkills(bruto);
  const normC = new Set(skillsC.map(normalizar));
  const faltamTodas = pedidas.filter((s) => !normC.has(normalizar(s)));
  let sSkills = 0.5;
  if (skillsC.length) {
    const ladoC = Math.min(1, batem.length / Math.min(skillsC.length, 5));
    const ladoV = pedidas.length ? (pedidas.length - faltamTodas.length) / pedidas.length : ladoC;
    sSkills = Math.min(1, 0.65 * ladoC + 0.35 * ladoV);
  }
  det.skills_ok = batem; det.skills_faltam = faltamTodas.slice(0, 8);

  const prefs = lista(c.modalidades).length ? lista(c.modalidades) : MODALIDADES;
  let sMod;
  if (!v.modalidade) { sMod = 0.5; det.modalidade = "Modalidade não informada"; }
  else if (prefs.includes(v.modalidade)) { sMod = 1; det.modalidade = `${v.modalidade} (aceita)`; }
  else { sMod = 0; det.modalidade = `${v.modalidade} (fora da preferência)`; }

  let sLoc;
  if (v.modalidade === "Remoto") { sLoc = 1; det.local = "Remoto: sem restrição geográfica"; }
  else if (!v.uf && !v.cidade) { sLoc = 0.45; det.local = "Local não informado"; }
  else if (c.cidade && v.cidade && normalizar(c.cidade) === normalizar(v.cidade)) { sLoc = 1; det.local = "Mesma cidade"; }
  else if (c.uf && v.uf === c.uf) { sLoc = 0.75; det.local = "Mesmo estado"; }
  else if (c.aceita_mudanca) { sLoc = 0.55; det.local = "Outro estado (aceita mudança)"; }
  else { sLoc = 0; det.local = "Outro estado"; }

  let sSen;
  if (!c.senioridade || !v.senioridade) { sSen = 0.6; det.senioridade = "Nível não informado"; }
  else {
    const a = ORDEM_SENIORIDADE.indexOf(c.senioridade), b = ORDEM_SENIORIDADE.indexOf(v.senioridade);
    const dist = a < 0 || b < 0 ? 1 : Math.abs(a - b);
    sSen = dist === 0 ? 1 : dist === 1 ? 0.5 : 0;
    det.senioridade = dist === 0 ? "Nível igual" : `Vaga ${v.senioridade} × candidato ${c.senioridade}`;
  }

  let total = sCargo * PESOS.cargo + sSkills * PESOS.skills + sMod * PESOS.modalidade + sLoc * PESOS.local + sSen * PESOS.senioridade;
  if (sCargo < 0.25 && batem.length < 2) total *= 0.55;
  if (sMod === 0) total *= 0.8;
  if (sLoc === 0) total *= 0.75;
  const doTitulo = extrairSkills(v.titulo);
  const noTitulo = doTitulo.filter((s) => !normC.has(normalizar(s)));
  if (noTitulo.length && skillsC.length && !doTitulo.some((s) => normC.has(normalizar(s)))) {
    total *= 0.8; det.alerta = "Título exige " + noTitulo.slice(0, 3).join(", ");
  }
  const valor = extrairValorSalario(v.salario);
  const pret = Number(c.pretensao_salarial) || 0;
  if (valor && pret) {
    if (valor >= pret) { det.salario = "Salário atende à pretensão"; total = Math.min(100, total + 3); }
    else if (valor < pret * 0.8) { det.salario = "Salário abaixo da pretensão"; total -= 5; }
    else det.salario = "Salário próximo da pretensão";
  }
  det.parciais = { cargo: Math.round(sCargo * 100), skills: Math.round(sSkills * 100), modalidade: Math.round(sMod * 100),
    local: Math.round(sLoc * 100), senioridade: Math.round(sSen * 100) };
  v.score = Math.round(Math.max(0, Math.min(100, total)) * 10) / 10;
  v.detalhes_score = det;
  return v;
}

export const classificar = (s) => (s >= 75 ? "Excelente" : s >= 60 ? "Alta" : s >= 45 ? "Média" : "Baixa");

export function termosDoCandidato(c, maximo = 3) {
  const out = [];
  for (const t of cargosDe(c)) if (!out.some((x) => normalizar(x) === normalizar(t))) out.push(t);
  return out.slice(0, maximo);
}

/** Remove duplicadas (mesma URL ou mesmo título+empresa+UF), pontua e ordena. */
export function consolidar(candidato, vagas) {
  const urls = new Set(), chaves = new Set(), out = [];
  for (const v of vagas) {
    if (!v.titulo || !v.url) continue;
    const chave = [normalizar(v.titulo), normalizar(v.empresa), v.uf].join("|");
    if (urls.has(v.url) || (v.empresa && chaves.has(chave))) continue;
    urls.add(v.url); chaves.add(chave);
    out.push(avaliar(candidato, v));
  }
  return out.sort((a, b) => b.score - a.score || String(b.publicada_em).localeCompare(String(a.publicada_em)));
}

/* ---------------------------------------------------------------- links */
export function linksBusca(termo, cidade = "", uf = "", remoto = false) {
  const q = encodeURIComponent(termo).replace(/%20/g, "+");
  const local = encodeURIComponent([cidade, uf].filter(Boolean).join(", ") || "Brasil").replace(/%20/g, "+");
  const s = slug(termo);
  let lin = `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${local}`;
  if (remoto) lin += "&f_WT=2";
  return [
    ["Google Vagas (agrega dezenas de sites)", `https://www.google.com/search?q=${q}+vagas+${local}&ibp=htl;jobs`],
    ["LinkedIn Vagas", lin],
    ["Indeed Brasil", `https://br.indeed.com/jobs?q=${q}&l=${remoto ? "" : local}` + (remoto ? "&sc=0kf%3Aattr(DSQF7)%3B" : "")],
    ["Catho", `https://www.catho.com.br/vagas/${s}/`],
    ["Glassdoor", `https://www.glassdoor.com.br/Vaga/${s}-vagas-SRCH_KO0,${s.length}.htm`],
    ["BNE – Banco Nacional de Empregos", `https://www.bne.com.br/vagas-de-emprego-para-${s}`],
    ["Trabalha Brasil", `https://www.trabalhabrasil.com.br/vagas-empregos/${s}`],
    ["Empregos.com.br", `https://www.empregos.com.br/vagas/${s}`],
    ["Sólides Vagas", `https://vagas.solides.com.br/vagas/todos/${s}`],
    ["99Jobs", `https://99jobs.com/opportunities/filtered_search?search%5Bterm%5D=${q}`],
    ["CIEE (estágio/aprendiz)", "https://portal.ciee.org.br/quero-uma-vaga/"],
    ["Nube (estágio)", "https://www.nube.com.br/candidato/vagas"],
    ["Emprega Brasil / SINE (governo)", "https://empregabrasil.mte.gov.br/"],
  ];
}

/* ---------------------------------------------------------------- currículo */
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export function analisarCurriculo(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const d = {};
  let m = texto.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (m) d.email = m[0];
  m = texto.match(/(\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})/);
  if (m) d.telefone = m[1];
  for (const l of linhas.slice(0, 6)) {
    const n = l.split(/\s+/).length;
    if (n >= 2 && n <= 6 && /^[A-Za-zÀ-ÿ' .]+$/.test(l) && !l.includes("@")) { d.nome = titleCase(l); break; }
  }
  m = texto.match(/(?:objetivo|cargo pretendido|cargo desejado)\s*[:-]?\s*(.+)/i);
  if (m) d.cargo_desejado = m[1].trim().slice(0, 80);
  else if (linhas.length > 1 && linhas[1].length < 60 && !linhas[1].includes("@")) d.cargo_desejado = linhas[1];
  m = texto.match(/([A-Za-zÀ-ÿ ]{3,40})\s*[-/,]\s*([A-Z]{2})\b/);
  if (m) { const [cid, uf] = separarCidadeUf(`${m[1].trim()} - ${m[2]}`); if (uf) { d.cidade = cid; d.uf = uf; } }
  d.skills = extrairSkills(texto).join(", ");
  d.senioridade = detectarSenioridade(d.cargo_desejado || "", texto);
  d.resumo = texto.slice(0, 1500);
  return d;
}
