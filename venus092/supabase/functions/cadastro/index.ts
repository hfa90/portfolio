// ============================================================
//  Edge Function: POST /functions/v1/cadastro
//  Cria conta + perfil completo em uma transação atômica
//  Inclui: auth, profile, serviços, disponibilidade, locais
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ORIGINS = [
  "https://venus.app",
  "https://haydenfernandes.com.br",
  "https://www.haydenfernandes.com.br",
  "http://127.0.0.1:8020",
  "http://127.0.0.1:8021",
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
type TelegramPayload = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

function cleanText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: Uint8Array, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(signed));
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function getTelegramBotToken(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin
    .from("telegram_settings")
    .select("value")
    .eq("key", "bot_token")
    .maybeSingle();

  if (error || !data?.value) throw new Error("Configuracao do Telegram indisponivel");
  return String(data.value);
}

async function verifyTelegramAuth(payload: TelegramPayload, botToken: string) {
  if (!payload?.id || !payload?.auth_date || !payload?.hash) return false;

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds < 0 || ageSeconds > 86400) return false;

  const entries = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = await sha256(botToken);
  const expected = await hmacHex(secret, dataCheckString);
  return timingSafeEqual(expected, String(payload.hash));
}

async function linkTelegramAccount(
  admin: ReturnType<typeof createClient>,
  userId: string,
  telegram: TelegramPayload,
) {
  const telegramId = Number(telegram.id);
  const { data: existing, error: existingErr } = await admin
    .from("telegram_accounts")
    .select("user_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing?.user_id && existing.user_id !== userId) {
    throw new Error("Este Telegram ja esta vinculado a outra conta.");
  }

  const { error } = await admin.from("telegram_accounts").upsert({
    user_id: userId,
    telegram_id: telegramId,
    role: "profissional",
    username: cleanText(telegram.username, 80) || null,
    first_name: cleanText(telegram.first_name, 80) || null,
    last_name: cleanText(telegram.last_name, 80) || null,
    photo_url: cleanText(telegram.photo_url, 500) || null,
    auth_date: new Date(Number(telegram.auth_date) * 1000).toISOString(),
    last_login_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) throw new Error(error.message);
}

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
    telegram,
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

  const siteOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : "https://haydenfernandes.com.br";
  const emailRedirectTo = `${siteOrigin}/login.html?confirmed=1`;

  // ── Criar conta no Supabase Auth e disparar confirmação ───
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const telegramPayload = telegram && typeof telegram === "object"
    ? telegram as TelegramPayload
    : null;

  if (telegramPayload) {
    try {
      const botToken = await getTelegramBotToken(admin);
      const validTelegram = await verifyTelegramAuth(telegramPayload, botToken);
      if (!validTelegram) return erro(cors, 422, "Verificacao do Telegram invalida ou expirada");
    } catch (telegramErr) {
      const detail = telegramErr instanceof Error ? telegramErr.message : "Erro ao verificar Telegram";
      return erro(cors, 422, "Nao foi possivel validar o Telegram", { detail });
    }
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (existingProfile) return erro(cors, 409, "E-mail já cadastrado");

  const signupClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authErr } = await signupClient.auth.signUp({
    email: normalizedEmail,
    password: String(senha),
    options: {
      emailRedirectTo,
      data: {
        nome_artistico: sanitize(nome_artistico as string),
        role: "anunciante",
      },
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
    email: normalizedEmail,
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

  if (telegramPayload) {
    try {
      await linkTelegramAccount(admin, userId, telegramPayload);
    } catch (telegramErr) {
      await admin.auth.admin.deleteUser(userId);
      const detail = telegramErr instanceof Error ? telegramErr.message : "Erro ao vincular Telegram";
      return erro(cors, 500, "Erro ao vincular Telegram", { detail });
    }
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
