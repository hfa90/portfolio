// Conectores de vagas (porte de app/sources/*.py). Sem dependências: recebe `parseHTML` (linkedom) por injeção.
import { dataIso, extrairSkills, montarVaga, normalizar, slug, ufDe } from "../_shared/nucleo.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TIMEOUT = 20000;

export class FonteErro extends Error {}

async function req(nome, url, opts = {}) {
  let ultimo;
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, {
        ...opts, signal: AbortSignal.timeout(TIMEOUT),
        headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9", ...(opts.headers || {}) },
      });
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 2000 + t * 3000)); ultimo = "limite de requisições atingido"; continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) { ultimo = e.message || String(e); await new Promise((ok) => setTimeout(ok, 800)); }
  }
  throw new FonteErro(`${nome}: ${ultimo}`);
}
const txt = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
const abs = (base, href) => { try { return new URL(href || "", base).href; } catch { return ""; } };

const TECH_SLUGS = { "Python": "python", "JavaScript": "javascript", "TypeScript": "typescript", "Java": "java", "C#": "c-sharp", "PHP": "php",
  "Go": "golang", "Ruby": "ruby", "Kotlin": "kotlin", "Swift": "swift", "React": "react", "React Native": "react-native", "Angular": "angular",
  "Vue": "vue-js", "Node.js": "node-js", "Django": "django", "Flutter": "flutter", "Laravel": "laravel", "SQL": "sql", "AWS": "aws",
  "Docker": "docker", "Data Science": "data-science", "Machine Learning": "machine-learning", "Testes de Software (QA)": "qa", "UX/UI": "ux",
  "Salesforce": "salesforce" };
const ACEITA_BRASIL = ["brazil", "brasil", "latam", "latin america", "south america", "americas", "worldwide", "anywhere", "global"];
const REPOS_BR = ["backend-br/vagas", "frontendbr/vagas", "react-brasil/vagas", "qa-brasil/vagas", "androiddevbr/vagas",
  "soujava/vagas-java", "phpdevbr/vagas", "datascience-br/vagas", "uxbrasil/vagas"];

const MAPA_GUPY = { "remote": "Remoto", "hybrid": "Híbrido", "on-site": "Presencial" };
const CONTRATO_GUPY = { vacancy_type_effective: "CLT", vacancy_type_internship: "Estágio", vacancy_type_temporary: "Temporário",
  vacancy_type_talent_pool: "Banco de talentos", vacancy_type_apprentice: "Jovem aprendiz", vacancy_legal_entity: "PJ" };

export const CONECTORES = {
  async gupy(f) {
    const vagas = [];
    for (let p = 1; p <= f.paginas; p++) {
      let url = `https://portal.gupy.io/job-search/term=${encodeURIComponent(f.termo)}`;
      if (p > 1) url += `&page=${p}`;
      const html = await (await req("Gupy", url)).text();
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) throw new FonteErro("Gupy: formato da página mudou");
      const dados = JSON.parse(m[1]).props.pageProps.initialJobList || {};
      const itens = dados.data || [];
      for (const j of itens) {
        vagas.push(montarVaga("Gupy", {
          titulo: j.name, url: (j.jobUrl || "").split("?")[0], empresa: j.careerPageName, descricao: j.description,
          modalidade: MAPA_GUPY[j.workplaceType] || "", cidade: j.city || "", uf: ufDe(j.state || ""),
          publicada: dataIso(j.publishedDate), contrato: CONTRATO_GUPY[j.type] || "", tags: j.disabilities ? ["PcD"] : [],
        }));
      }
      const pag = dados.pagination || {};
      if (!itens.length || (pag.offset || 0) + (pag.limit || 12) >= (pag.total || 0)) break;
    }
    return vagas;
  },

  async vagas_com(f, { parseHTML }) {
    const base = "https://www.vagas.com.br";
    const urls = [`${base}/vagas-de-${slug(f.termo)}`];
    if (f.cidade) urls.push(`${base}/vagas-de-${slug(f.termo)}-em-${slug(f.cidade)}`);
    const vagas = [], vistos = new Set();
    for (const url of urls) {
      const { document } = parseHTML(await (await req("Vagas.com", url)).text());
      for (const li of document.querySelectorAll("li.vaga")) {
        const a = li.querySelector("a.link-detalhes-vaga");
        if (!a) continue;
        const link = abs(base, a.getAttribute("href"));
        if (vistos.has(link)) continue;
        vistos.add(link);
        const local = txt(li.querySelector(".vaga-local")).split("A empresa")[0].trim();
        vagas.push(montarVaga("Vagas.com", {
          titulo: a.getAttribute("title") || txt(a), url: link, empresa: txt(li.querySelector(".emprVaga")), local,
          descricao: txt(li.querySelector(".detalhes")), tags: [txt(li.querySelector(".nivelVaga"))],
          publicada: dataIso(txt(li.querySelector(".data-publicacao"))),
        }));
      }
    }
    return vagas;
  },

  async infojobs(f, { parseHTML }) {
    const base = "https://www.infojobs.com.br";
    const vagas = [];
    for (let p = 1; p <= f.paginas; p++) {
      let url = `${base}/empregos.aspx?palabra=${encodeURIComponent(f.termo).replace(/%20/g, "+")}`;
      if (p > 1) url += `&page=${p}`;
      const { document } = parseHTML(await (await req("InfoJobs", url)).text());
      const cards = [...document.querySelectorAll("div.js_vacancyLoad")];
      for (const card of cards) {
        const titulo = txt(card.querySelector(".js_vacancyTitle"));
        if (!titulo) continue;
        const local = txt(card.querySelector("div.mb-8")).replace(/,?\s*\d+\s*Km de você\.?/g, "").trim();
        const infos = [...card.querySelectorAll("div.d-inline-flex > div")].map(txt);
        const modalidade = infos.find((i) => ["Presencial", "Remoto", "Híbrido"].includes(i)) || "";
        const salario = infos.find((i) => i.includes("R$") || i.toLowerCase().includes("combinar")) || "";
        const dataEl = card.querySelector(".js_date");
        const descs = [...card.querySelectorAll("div.text-medium")];
        vagas.push(montarVaga("InfoJobs", {
          titulo, url: abs(base, card.getAttribute("data-href")), empresa: txt(card.querySelector("a[href*='empresa'], a.text-body[href]")),
          local, descricao: descs.length ? txt(descs[descs.length - 1]) : "", modalidade, salario,
          tags: infos.filter((i) => i !== modalidade && i !== salario), publicada: dataEl ? dataIso(dataEl.getAttribute("data-value")) : "",
        }));
      }
      if (!cards.length) break;
    }
    return vagas;
  },

  async programathor(f, { parseHTML }) {
    const base = "https://programathor.com.br";
    let techs = extrairSkills(f.termo).filter((s) => TECH_SLUGS[s]);
    if (!techs.length) techs = (f.skills || []).filter((s) => TECH_SLUGS[s]).slice(0, 2);
    const vagas = [];
    for (const tech of techs.slice(0, 2)) {
      const { document } = parseHTML(await (await req("Programathor", `${base}/jobs-${TECH_SLUGS[tech]}`)).text());
      for (const cell of document.querySelectorAll("div.cell-list")) {
        const a = cell.querySelector("a[href]"), h3 = cell.querySelector("h3");
        if (!a || !h3 || !(a.getAttribute("href") || "").startsWith("/jobs/")) continue;
        const info = {};
        for (const sp of cell.querySelectorAll(".cell-list-content-icon span")) {
          const i = sp.querySelector("i");
          if (i) info[i.getAttribute("class") || ""] = txt(sp);
        }
        const pega = (k) => Object.entries(info).find(([c]) => c.includes(k))?.[1] || "";
        const local = pega("map-marker");
        vagas.push(montarVaga("Programathor", {
          titulo: txt(h3).replace("NOVA", "").replace("Vencida", "").trim(), url: abs(base, a.getAttribute("href")),
          empresa: pega("briefcase"), local, modalidade: local.toLowerCase().includes("remoto") ? "Remoto" : "",
          salario: pega("money"), contrato: pega("file-alt"),
          tags: [...[...cell.querySelectorAll(".tag-list")].map(txt), pega("chart-bar")],
        }));
      }
    }
    return vagas;
  },

  async github_br(f, { chaves }) {
    const headers = { Accept: "application/vnd.github+json" };
    if (chaves.github_token) headers.Authorization = `Bearer ${chaves.github_token}`;
    const desde = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const q = `${f.termo} in:title,body is:issue state:open created:>${desde} ${REPOS_BR.map((r) => "repo:" + r).join(" ")}`;
    const url = `https://api.github.com/search/issues?${new URLSearchParams({ q, per_page: "50", sort: "created" })}`;
    const dados = await (await req("GitHub", url, { headers })).json();
    const vagas = [];
    for (const it of dados.items || []) {
      const titulo = it.title || "";
      const labels = (it.labels || []).map((l) => l.name || "");
      if (labels.some((l) => ["stale", "link-quebrado", "fechada"].includes(l.toLowerCase()))) continue;
      const prefixo = [...titulo.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).join(" ");
      let limpo = titulo.replace(/\[[^\]]+\]\s*/g, "").trim();
      let principal = limpo.split(/\s+\|\s+/)[0];
      let empresa = "";
      const m = principal.match(/\s(?:-|—|@|na|no|at)\s+([^\-—@]+)$/);
      if (m && m[1].length <= 40) { empresa = m[1].trim(); principal = principal.slice(0, m.index).trim(); }
      limpo = principal || limpo;
      const local = [prefixo, ...labels].join(" ");
      const ln = normalizar(local).replace("hibrido", "híbrido");
      vagas.push(montarVaga("Comunidades GitHub BR", {
        titulo: limpo, url: it.html_url, empresa, descricao: (it.body || "").slice(0, 6000), tags: labels, uf: ufDe(local),
        publicada: dataIso(it.created_at), modalidade: ["Remoto", "Híbrido", "Presencial"].find((x) => ln.includes(x.toLowerCase())) || "",
      }));
    }
    return vagas;
  },

  async remotive(f) {
    const url = `https://remotive.com/api/remote-jobs?${new URLSearchParams({ search: f.termo, limit: "60" })}`;
    const dados = await (await req("Remotive", url)).json();
    const vagas = [];
    for (const j of dados.jobs || []) {
      const loc = (j.candidate_required_location || "").toLowerCase();
      if (loc && !ACEITA_BRASIL.some((a) => loc.includes(a))) continue;
      vagas.push(montarVaga("Remotive", {
        titulo: j.title, url: j.url, empresa: j.company_name, descricao: j.description, modalidade: "Remoto", salario: j.salary || "",
        tags: [...(j.tags || []).slice(0, 10), `Região: ${j.candidate_required_location || "Global"}`],
        contrato: (j.job_type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), publicada: dataIso(j.publication_date),
      }));
    }
    return vagas;
  },

  async himalayas(f) {
    const vagas = [];
    const fmt = (n) => Number(n).toLocaleString("de-DE");
    for (let p = 1; p <= f.paginas; p++) {
      const url = `https://himalayas.app/jobs/api/search?${new URLSearchParams({ q: f.termo, page: String(p) })}`;
      const jobs = (await (await req("Himalayas", url)).json()).jobs || [];
      for (const j of jobs) {
        const restr = (j.locationRestrictions || []).map((r) => String(typeof r === "object" ? r.name || "" : r).toLowerCase());
        if (restr.length && !restr.some((r) => ACEITA_BRASIL.some((a) => r.includes(a)))) continue;
        let sal = "";
        if (j.minSalary) { sal = `${j.currency || "USD"} ${fmt(j.minSalary)}`; if (j.maxSalary) sal += ` – ${fmt(j.maxSalary)}`; }
        vagas.push(montarVaga("Himalayas", {
          titulo: j.title, url: j.applicationLink || j.guid || "", empresa: j.companyName, descricao: j.description || j.excerpt || "",
          modalidade: "Remoto", salario: sal, contrato: j.employmentType || "",
          tags: [...(j.categories || []).slice(0, 8), ...(j.seniority || [])], publicada: j.pubDate ? dataIso(String(j.pubDate)) : "",
        }));
      }
      if (!jobs.length) break;
    }
    return vagas;
  },

  async adzuna(f, { chaves }) {
    if (!chaves.adzuna_app_id || !chaves.adzuna_app_key) throw new FonteErro("Adzuna: configure as chaves");
    const vagas = [];
    for (let p = 1; p <= f.paginas; p++) {
      const qs = new URLSearchParams({ app_id: chaves.adzuna_app_id, app_key: chaves.adzuna_app_key, what: f.termo, results_per_page: "50", "content-type": "application/json" });
      const res = (await (await req("Adzuna", `https://api.adzuna.com/v1/api/jobs/br/search/${p}?${qs}`)).json()).results || [];
      for (const j of res) {
        vagas.push(montarVaga("Adzuna", {
          titulo: j.title, url: j.redirect_url, empresa: j.company?.display_name, local: j.location?.display_name || "",
          descricao: j.description, salario: j.salary_min ? `R$ ${Math.trunc(j.salary_min).toLocaleString("de-DE")}` : "",
          contrato: (j.contract_type || "").replace(/_/g, " "), publicada: dataIso(j.created),
        }));
      }
      if (!res.length) break;
    }
    return vagas;
  },

  async jooble(f, { chaves }) {
    if (!chaves.jooble_key) throw new FonteErro("Jooble: configure a chave");
    const vagas = [];
    for (let p = 1; p <= f.paginas; p++) {
      const r = await req("Jooble", `https://br.jooble.org/api/${encodeURIComponent(chaves.jooble_key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: f.termo, location: f.cidade || "", page: String(p) }),
      });
      const jobs = (await r.json()).jobs || [];
      for (const j of jobs) {
        vagas.push(montarVaga("Jooble", {
          titulo: j.title, url: j.link, empresa: j.company, local: j.location || "", descricao: j.snippet, salario: j.salary || "",
          contrato: j.type || "", tags: j.source ? [`via ${j.source}`] : [], publicada: dataIso(j.updated),
        }));
      }
      if (!jobs.length) break;
    }
    return vagas;
  },
};
