"""Normalização de texto, detecção de skills, senioridade, modalidade e localidade."""
from __future__ import annotations

import html
import re
import unicodedata
from datetime import datetime, timedelta

STOPWORDS = {
    "de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o", "as", "os",
    "na", "no", "nas", "nos", "um", "uma", "por", "ou", "the", "and", "of", "to",
    "vaga", "vagas", "oportunidade", "i", "ii", "iii", "jr", "pl", "sr", "-", "/",
    "(a)", "a)", "profissional",
}

ESTADOS = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA",
    "ceara": "CE", "distrito federal": "DF", "espirito santo": "ES", "goias": "GO",
    "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
    "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR",
    "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO",
    "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE",
    "tocantins": "TO",
}
UF_NOME = {v: k for k, v in ESTADOS.items()}

# Dicionário de competências por área (expansível). Chave = forma canônica,
# valores = variações reconhecidas no texto (já normalizadas).
SKILLS: dict[str, list[str]] = {
    # Tecnologia
    "Python": ["python"], "JavaScript": ["javascript", "js"], "TypeScript": ["typescript"],
    "Java": ["java"], "C#": ["c#", "csharp", ".net", "dotnet"], "PHP": ["php"],
    "Go": ["golang"], "Ruby": ["ruby", "rails"], "Kotlin": ["kotlin"], "Swift": ["swift"],
    "React": ["react", "reactjs", "react.js"], "React Native": ["react native"],
    "Angular": ["angular"], "Vue": ["vue", "vuejs", "vue.js"], "Node.js": ["node", "nodejs", "node.js"],
    "Next.js": ["next.js", "nextjs"], "Django": ["django"], "Flask": ["flask"], "FastAPI": ["fastapi"],
    "Spring": ["spring", "spring boot"], "Laravel": ["laravel"], "Flutter": ["flutter"],
    "HTML": ["html", "html5"], "CSS": ["css", "css3", "sass", "scss", "tailwind"],
    "SQL": ["sql", "mysql", "postgresql", "postgres", "sql server", "oracle", "plsql"],
    "NoSQL": ["mongodb", "nosql", "redis", "dynamodb", "cassandra"],
    "AWS": ["aws", "amazon web services"], "Azure": ["azure"], "GCP": ["gcp", "google cloud"],
    "Docker": ["docker"], "Kubernetes": ["kubernetes", "k8s"], "Terraform": ["terraform"],
    "CI/CD": ["ci/cd", "jenkins", "github actions", "gitlab ci"], "Git": ["git", "github", "gitlab"],
    "Linux": ["linux"], "Power BI": ["power bi", "powerbi"], "Tableau": ["tableau"],
    "Excel": ["excel", "planilhas"], "Machine Learning": ["machine learning", "aprendizado de maquina", "ml"],
    "Data Science": ["data science", "ciencia de dados"], "IA Generativa": ["llm", "genai", "ia generativa", "langchain", "openai"],
    "Spark": ["spark", "pyspark", "databricks"], "ETL": ["etl", "airflow", "data pipeline"],
    "Testes de Software (QA)": ["qa", "testes automatizados", "selenium", "cypress", "jest", "pytest", "quality assurance"],
    "Scrum": ["scrum", "kanban", "agile", "metodologias ageis"], "SAP": ["sap"], "Salesforce": ["salesforce"],
    "UX/UI": ["ux", "ui", "figma", "design de interface"], "Segurança da Informação": ["seguranca da informacao", "cybersecurity", "pentest"],
    "Suporte Técnico": ["suporte tecnico", "help desk", "service desk", "helpdesk"], "Redes de Computadores": ["cisco", "ccna", "infraestrutura de redes", "redes de computadores"],
    # Gestão / Administrativo / RH
    "Recrutamento e Seleção": ["recrutamento", "selecao", "r&s", "hunting", "talent acquisition"],
    "Departamento Pessoal": ["departamento pessoal", "folha de pagamento", "esocial", "admissao", "rescisao"],
    "Treinamento e Desenvolvimento": ["treinamento", "t&d", "desenvolvimento humano"],
    "Gestão de Pessoas": ["gestao de pessoas", "lideranca de equipe", "gestao de equipe", "lideranca"],
    "Business Partner": ["business partner", "hrbp"],
    "Administrativo": ["rotinas administrativas", "administrativo", "atendimento telefonico"],
    "Financeiro": ["financeiro", "contas a pagar", "contas a receber", "conciliacao bancaria", "tesouraria"],
    "Contabilidade": ["contabilidade", "contabil", "balanco", "sped"], "Fiscal": ["fiscal", "tributario", "icms", "impostos"],
    "Controladoria": ["controladoria", "fp&a", "orcamento"], "Compras": ["compras", "suprimentos", "procurement"],
    "Logística": ["logistica", "estoque", "armazem", "wms", "expedicao"], "Jurídico": ["juridico", "advogado", "contratos", "oab"],
    "Gestão de Projetos": ["gestao de projetos", "pmo", "pmp", "project manager"],
    # Comercial / Marketing / Atendimento
    "Vendas": ["vendas", "vendedor", "comercial", "prospeccao", "negociacao"], "CRM": ["crm", "hubspot", "pipedrive"],
    "Atendimento ao Cliente": ["atendimento ao cliente", "sac", "customer success", "relacionamento com cliente", ],
    "Telemarketing": ["telemarketing", "call center", "televendas"], "Marketing Digital": ["marketing digital", "seo", "google ads", "trafego pago", "meta ads"],
    "Redes Sociais": ["redes sociais", "social media", "instagram"], "Inglês": ["ingles", "english"], "Espanhol": ["espanhol", "spanish"],
    # Operações / Saúde / Indústria
    "Enfermagem": ["enfermagem", "coren", "tecnico de enfermagem"], "Farmácia": ["farmacia", "farmaceutico", "crf"],
    "Segurança do Trabalho": ["seguranca do trabalho", "nr10", "nr35", "sesmt"], "Manutenção Industrial": ["eletromecanica", "mecanica industrial", "manutencao preventiva", "manutencao corretiva"],
    "Produção Industrial": ["operador de maquina", "linha de producao", "chao de fabrica", "pcp"], "Gestão da Qualidade": ["iso 9001", "5s", "lean manufacturing", "six sigma", "controle de qualidade", "garantia da qualidade"],
    "CNH": ["cnh", "carteira de habilitacao"], "Pacote Office": ["pacote office", "word", "powerpoint", "office"],
}

_SKILL_PATTERNS: list[tuple[str, re.Pattern]] = []


def normalizar(texto: str) -> str:
    """minúsculas, sem acentos e espaços colapsados."""
    if not texto:
        return ""
    t = unicodedata.normalize("NFKD", str(texto))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.lower()).strip()


def limpar_html(texto: str) -> str:
    if not texto:
        return ""
    t = re.sub(r"<(br|/p|/li|/div|/h\d)[^>]*>", "\n", texto, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t).replace("\xa0", " ")
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()


def tokens(texto: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9#+.]+", normalizar(texto)) if w not in STOPWORDS and len(w) > 1}


def _compilar():
    if _SKILL_PATTERNS:
        return
    for canon, variantes in SKILLS.items():
        alts = sorted({normalizar(canon), *variantes}, key=len, reverse=True)
        pat = r"(?<![a-z0-9])(?:" + "|".join(re.escape(a) for a in alts) + r")(?![a-z0-9])"
        _SKILL_PATTERNS.append((canon, re.compile(pat)))


def extrair_skills(texto: str) -> list[str]:
    _compilar()
    t = normalizar(texto)
    return [canon for canon, pat in _SKILL_PATTERNS if pat.search(t)]


def skill_no_texto(skill: str, texto_norm: str) -> bool:
    """Verifica uma skill livre (pode não estar no dicionário) num texto já normalizado."""
    _compilar()
    for canon, pat in _SKILL_PATTERNS:
        if normalizar(canon) == normalizar(skill):
            return bool(pat.search(texto_norm))
    s = re.escape(normalizar(skill))
    return bool(re.search(r"(?<![a-z0-9])" + s + r"(?![a-z0-9])", texto_norm))


SENIORIDADE_REGRAS = [
    ("Estágio", r"\b(estagio|estagiario|estagiaria|intern|internship|trainee|aprendiz|jovem aprendiz)\b"),
    ("Gestão", r"\b(gerente|coordenador|coordenadora|diretor|diretora|head|supervisor|supervisora|manager|lider)\b"),
    ("Especialista", r"\b(especialista|staff|principal|arquiteto|arquiteta|expert)\b"),
    ("Sênior", r"\b(senior|sr)\b"),
    ("Pleno", r"\b(pleno|pl|mid|middle)\b"),
    ("Júnior", r"\b(junior|jr|entry|assistente|auxiliar)\b"),
]
ORDEM_SENIORIDADE = ["Estágio", "Júnior", "Pleno", "Sênior", "Especialista", "Gestão"]


def detectar_senioridade(titulo: str, extra: str = "") -> str:
    t = normalizar(titulo)
    for nivel, pat in SENIORIDADE_REGRAS:
        if re.search(pat, t):
            return nivel
    e = normalizar(extra)[:600]
    for nivel, pat in SENIORIDADE_REGRAS[:5]:
        if re.search(pat, e):
            return nivel
    return ""


def detectar_modalidade(texto: str) -> str:
    t = normalizar(texto)
    if re.search(r"\b(hibrido|hybrid|semipresencial|semi-presencial|semi presencial)\b", t):
        return "Híbrido"
    if re.search(r"\b(remoto|remote|home ?office|100% remoto|anywhere|teletrabalho)\b", t):
        return "Remoto"
    if re.search(r"\b(presencial|on-site|onsite|in office)\b", t):
        return "Presencial"
    return ""


def detectar_contrato(texto: str) -> str:
    t = normalizar(texto)
    achados = [nome for nome, pat in (
        ("CLT", r"\bclt\b|efetivo"), ("PJ", r"\bpj\b|pessoa juridica"),
        ("Estágio", r"\bestagio\b"), ("Temporário", r"temporari"), ("Freelancer", r"freela"),
        ("Cooperado", r"cooperad"),
    ) if re.search(pat, t)]
    return "/".join(achados)


def uf_de(texto: str) -> str:
    """Retorna a sigla da UF encontrada em 'Cidade - SP', 'São Paulo', etc."""
    if not texto:
        return ""
    m = re.search(r"(?:^|[\s,/(-])([A-Z]{2})(?:$|[\s,)/-])", texto)
    if m and m.group(1) in UF_NOME:
        return m.group(1)
    t = normalizar(texto)
    for nome in sorted(ESTADOS, key=len, reverse=True):
        if re.search(r"\b" + nome + r"\b", t):
            return ESTADOS[nome]
    return ""


def separar_cidade_uf(local: str) -> tuple[str, str]:
    if not local:
        return "", ""
    uf = uf_de(local)
    cidade = re.split(r"\s*[-/,]\s*", local.strip())[0].strip()
    if normalizar(cidade) in ESTADOS or cidade.upper() == uf:
        cidade = ""
    return cidade, uf


def data_iso(valor: str) -> str:
    """Converte formatos variados para yyyy-mm-dd (string vazia se não reconhecer)."""
    if not valor:
        return ""
    v = str(valor).strip()
    m = re.match(r"(\d{4})[-/](\d{2})[-/](\d{2})", v)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%a, %d %b %Y %H:%M:%S %z"):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    if v.isdigit() and len(v) >= 10:            # epoch
        try:
            return datetime.fromtimestamp(int(v[:10])).strftime("%Y-%m-%d")
        except (ValueError, OSError):
            return ""
    t = normalizar(v)
    if "hoje" in t:
        return datetime.now().strftime("%Y-%m-%d")
    if "ontem" in t:
        return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    m = re.search(r"ha (\d+) dias?", t)
    if m:
        return (datetime.now() - timedelta(days=int(m.group(1)))).strftime("%Y-%m-%d")
    meses = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6, "jul": 7,
             "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}
    m = re.match(r"(\d{1,2}) (\w{3})", t)
    if m and m.group(2) in meses:
        hoje = datetime.now()
        d = datetime(hoje.year, meses[m.group(2)], int(m.group(1)))
        if d > hoje:
            d = d.replace(year=hoje.year - 1)
        return d.strftime("%Y-%m-%d")
    return ""


def slug(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalizar(texto)).strip("-")


def extrair_valor_salario(texto: str) -> float:
    """Pega o maior valor monetário plausível (R$) do texto."""
    if not texto:
        return 0.0
    valores = []
    for m in re.finditer(r"r?\$?\s?(\d{1,3}(?:\.\d{3})+|\d{3,6})(?:,\d{2})?", normalizar(texto)):
        try:
            v = float(m.group(1).replace(".", ""))
        except ValueError:
            continue
        if 800 <= v <= 100000:
            valores.append(v)
    return max(valores) if valores else 0.0
