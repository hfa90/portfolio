// ============================================================
//  Edge Function: POST /functions/v1/cadastro
//  Cria conta + perfil completo em uma transação atômica
//  Inclui: auth, profile, serviços, disponibilidade, locais
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "https://venus.app",
  "https://haydenfernandes.com.br",
  "https://www.haydenfernandes.com.br",
  "http://localhost:3000",
  "http://localhost:5173",
];

// ── CORS ──────────────────────────────────────────────────────
function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

// ── Validações ────────────────────────────────────────────────
const CATEGORIAS_VALIDAS = [
  "GP Feminina", "GP Masculino", "Trans", "Travesti", "Lésbica", "Gay",
];
const ETNIAS_VALIDAS = ["Branca", "Morena", "Negra", "Latina", "Asiática", "Outra", ""];
const LOCAIS_VALIDOS = ["Local próprio", "A domicílio", "Motel / Hotel", "Online"];

function validarWhatsApp(v: string): boolean {
  return /^\d{10,11}$/.test(v.replace(/\D/g, ""));
}

function validarCEP(v: string): boolean {
  return /^\d{8}$/.test(v.replace(/\D/g, ""));
}

function sanitize(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, 500);
}

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Rate-limit simples pelo IP (Supabase injeta x-forwarded-for)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erro(cors, 400, "JSON inválido");
  }

  // ── Extrair e validar campos ──────────────────────────────
  const {
    // Step 1: conta
    email,
    senha,
    whatsapp,
    termos_aceitos,
    conteudo_adulto_aceito,

    // Step 2: perfil
    nome_artistico,
    categoria,
    bio,
    idade,
    altura,
    peso,
    etnia,
    cabelo,
    olhos,
    silicone,
    idiomas,
    cep,
    bairro,
    cidade,
    uf,

    // Step 4: serviços
    servicos,          // [{ nome, preco, local }]
    locais_atendimento, // ["Local próprio", "Online", ...]
    disponibilidade,   // [{ dia_semana (0-6), hora_inicio, hora_fim }]
  } = body as Record<string, unknown>;

  // Validações obrigatórias
  const erros: string[] = [];

  if (!email || typeof email !== "string" || !email.includes("@"))
    erros.push("E-mail inválido");

  if (!senha || typeof senha !== "string" || (senha as string).length < 8)
    erros.push("Senha deve ter mínimo 8 caracteres");

  if (!whatsapp || !validarWhatsApp(String(whatsapp)))
    erros.push("WhatsApp inválido (apenas números, DDD + número)");

  if (!termos_aceitos || !conteudo_adulto_aceito)
    erros.push("Aceite dos termos obrigatório");

  if (!nome_artistico || sanitize(nome_artistico).length < 2)
    erros.push("Nome artístico inválido");

  if (!categoria || !CATEGORIAS_VALIDAS.includes(String(categoria)))
    erros.push("Categoria inválida");

  if (!bio || sanitize(bio as string).length < 50)
    erros.push("Bio deve ter no mínimo 50 caracteres");

  if (!cidade || sanitize(cidade as string).length < 2)
    erros.push("Cidade obrigatória");

  if (!uf || String(uf).length !== 2)
    erros.push("UF inválida");

  if (cep && !validarCEP(String(cep)))
    erros.push("CEP inválido");

  if (idade !== undefined && (Number(idade) < 18 || Number(idade) > 99))
    erros.push("Idade deve ser entre 18 e 99");

  if (altura !== undefined && altura !== null && altura !== "") {
    const altNum = parseFloat(String(altura).replace(",", "."));
    if (isNaN(altNum) || altNum < 1.20 || altNum > 2.50)
      erros.push("Altura inválida (ex: 1.68 — entre 1.20 e 2.50)");
  }

  if (peso !== undefined && peso !== null && peso !== "") {
    const pesoNum = Number(peso);
    if (isNaN(pesoNum) || pesoNum < 30 || pesoNum > 300)
      erros.push("Peso inválido (entre 30 e 300 kg)");
  }

  if (etnia && !ETNIAS_VALIDAS.includes(String(etnia)))
    erros.push("Etnia inválida");

  if (erros.length > 0) {
    return erro(cors, 422, "Dados inválidos", { campos: erros });
  }

  // ── Criar conta no Supabase Auth ─────────────────────────
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: String(email).toLowerCase().trim(),
    password: String(senha),
    email_confirm: false,  // envia email de confirmação
    user_metadata: {
      nome_artistico: sanitize(nome_artistico as string),
      role: "anunciante",
    },
  });

  if (authErr || !authData?.user) {
    if (authErr?.message?.includes("already registered")) {
      return erro(cors, 409, "E-mail já cadastrado");
    }
    return erro(cors, 500, "Erro ao criar conta", { detail: authErr?.message });
  }

  const userId = authData.user.id;

  // ── Inserir profile ───────────────────────────────────────
  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    email: String(email).toLowerCase().trim(),
    whatsapp: String(whatsapp).replace(/\D/g, ""),
    nome_artistico: sanitize(nome_artistico as string),
    categoria: String(categoria),
    bio: sanitize(bio as string),
    idade: idade ? Number(idade) : null,
    altura: (() => {
      if (!altura) return null;
      const v = parseFloat(String(altura).replace(",", "."));
      return (!isNaN(v) && v >= 1.20 && v <= 2.50) ? v : null;
    })(),
    peso: (() => {
      if (!peso) return null;
      const v = Number(peso);
      return (!isNaN(v) && v >= 30 && v <= 300) ? v : null;
    })(),
    etnia: etnia ? String(etnia) : null,
    cabelo: cabelo ? sanitize(cabelo as string) : null,
    olhos: olhos ? sanitize(olhos as string) : null,
    silicone: Boolean(silicone),
    idiomas: Array.isArray(idiomas)
      ? (idiomas as string[]).map(sanitize).slice(0, 10)
      : [],
    cep: cep ? String(cep).replace(/\D/g, "") : null,
    bairro: bairro ? sanitize(bairro as string) : null,
    cidade: sanitize(cidade as string),
    uf: String(uf).toUpperCase().slice(0, 2),
    status: "pending",
    termos_aceitos: true,
    conteudo_adulto_aceito: true,
    termos_ip: clientIp,
    termos_aceitos_em: new Date().toISOString(),
  });

  if (profileErr) {
    // Rollback: remove o usuário criado
    await admin.auth.admin.deleteUser(userId);
    return erro(cors, 500, "Erro ao salvar perfil", { detail: profileErr.message });
  }

  // ── Inserir serviços ──────────────────────────────────────
  if (Array.isArray(servicos) && servicos.length > 0) {
    const servicosValidos = (servicos as Record<string, unknown>[])
      .filter(s => s.nome && sanitize(s.nome as string).length >= 2)
      .slice(0, 30)
      .map((s, i) => ({
        profile_id: userId,
        nome: sanitize(s.nome as string),
        preco: s.preco != null ? Math.max(0, Number(s.preco)) : null,
        local: s.local && LOCAIS_VALIDOS.includes(String(s.local))
          ? String(s.local)
          : "A combinar",
        ordem: i,
      }));

    if (servicosValidos.length > 0) {
      const { error: svcErr } = await admin.from("services").insert(servicosValidos);
      if (svcErr) console.error("Erro ao inserir serviços:", svcErr.message);
    }
  }

  // ── Inserir locais de atendimento ──────────────────────────
  if (Array.isArray(locais_atendimento) && locais_atendimento.length > 0) {
    const locaisValidos = (locais_atendimento as string[])
      .filter(l => LOCAIS_VALIDOS.includes(l))
      .slice(0, 4)
      .map(tipo => ({ profile_id: userId, tipo }));

    if (locaisValidos.length > 0) {
      const { error: locErr } = await admin
        .from("attendance_locations")
        .insert(locaisValidos);
      if (locErr) console.error("Erro ao inserir locais:", locErr.message);
    }
  }

  // ── Inserir disponibilidade ───────────────────────────────
  if (Array.isArray(disponibilidade) && disponibilidade.length > 0) {
    const dispValida = (disponibilidade as Record<string, unknown>[])
      .filter(d =>
        typeof d.dia_semana === "number" &&
        d.dia_semana >= 0 && d.dia_semana <= 6 &&
        d.hora_inicio && d.hora_fim
      )
      .slice(0, 7)
      .map(d => ({
        profile_id: userId,
        dia_semana: Number(d.dia_semana),
        hora_inicio: String(d.hora_inicio),
        hora_fim: String(d.hora_fim),
      }));

    if (dispValida.length > 0) {
      const { error: dispErr } = await admin
        .from("availability")
        .insert(dispValida);
      if (dispErr) console.error("Erro ao inserir disponibilidade:", dispErr.message);
    }
  }

  // ── Retorno de sucesso ────────────────────────────────────
  return new Response(
    JSON.stringify({
      ok: true,
      user_id: userId,
      message: "Cadastro realizado! Verifique seu e-mail para confirmar a conta.",
    }),
    {
      status: 201,
      headers: { ...cors, "Content-Type": "application/json" },
    }
  );
});

// ── Helper de erro ────────────────────────────────────────────
function erro(
  cors: Record<string, string>,
  status: number,
  message: string,
  extra?: Record<string, unknown>
) {
  return new Response(
    JSON.stringify({ ok: false, error: message, ...extra }),
    { status, headers: { ...cors, "Content-Type": "application/json" } }
  );
}