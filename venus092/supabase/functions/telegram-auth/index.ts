import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ORIGINS = [
  "https://hfa90.github.io",
  "https://haydenfernandes.com.br",
  "https://www.haydenfernandes.com.br",
  "http://127.0.0.1:8020",
  "http://localhost:3000",
  "http://localhost:5173",
];

type TelegramPayload = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function json(cors: Record<string, string>, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

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

async function getSettings(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin
    .from("telegram_settings")
    .select("key,value")
    .in("key", ["bot_token", "site_base_url"]);

  if (error) throw new Error("Configuracao do Telegram indisponivel");
  const settings = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  if (!settings.bot_token || !settings.site_base_url) {
    throw new Error("Configuracao do Telegram incompleta");
  }
  return settings as { bot_token: string; site_base_url: string };
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

async function createCustomerFromTelegram(
  admin: ReturnType<typeof createClient>,
  telegram: TelegramPayload,
) {
  const telegramId = String(telegram.id);
  const email = `telegram_${telegramId}@venus092.local`;
  const fullName = [
    cleanText(telegram.first_name, 80),
    cleanText(telegram.last_name, 80),
  ].filter(Boolean).join(" ") || cleanText(telegram.username, 80) || `Telegram ${telegramId}`;

  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingCustomer?.id) return existingCustomer.id as string;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      provider: "telegram",
      telegram_id: telegramId,
      role: "cliente",
      name: fullName,
    },
  });

  if (createErr || !created.user) {
    throw new Error(createErr?.message || "Erro ao criar usuario Telegram");
  }

  const { error: customerErr } = await admin.from("customers").insert({
    id: created.user.id,
    email,
    nome: fullName.slice(0, 80),
    avatar_url: cleanText(telegram.photo_url, 500) || null,
    termos_aceitos: true,
    conteudo_adulto_aceito: true,
    termos_aceitos_em: new Date().toISOString(),
  });

  if (customerErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(customerErr.message);
  }

  return created.user.id;
}

async function resolveUserRole(admin: ReturnType<typeof createClient>, userId: string, fallback: string) {
  const [{ data: customer }, { data: profile }] = await Promise.all([
    admin.from("customers").select("id").eq("id", userId).maybeSingle(),
    admin.from("profiles").select("id").eq("id", userId).maybeSingle(),
  ]);
  if (profile) return "profissional";
  if (customer) return "cliente";
  return fallback === "profissional" ? "profissional" : "cliente";
}

async function upsertTelegramAccount(
  admin: ReturnType<typeof createClient>,
  userId: string,
  role: string,
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
    role,
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

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(cors, 405, { ok: false, error: "Metodo nao permitido" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(cors, 400, { ok: false, error: "JSON invalido" });
  }

  const telegram = body.telegram as TelegramPayload;
  const mode = body.mode === "link" ? "link" : "login";
  const requestedRole = body.role === "profissional" ? "profissional" : "cliente";

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const settings = await getSettings(admin);
    const valid = await verifyTelegramAuth(telegram, settings.bot_token);
    if (!valid) return json(cors, 401, { ok: false, error: "Assinatura do Telegram invalida" });

    if (mode === "link") {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!token) return json(cors, 401, { ok: false, error: "Nao autenticado" });

      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) return json(cors, 401, { ok: false, error: "Sessao invalida" });

      const role = await resolveUserRole(admin, user.id, requestedRole);
      if (requestedRole === "profissional" && role !== "profissional") {
        return json(cors, 409, { ok: false, error: "Conta profissional nao encontrada para vincular." });
      }

      await upsertTelegramAccount(admin, user.id, role, telegram);
      return json(cors, 200, { ok: true, linked: true, role });
    }

    const { data: linked } = await admin
      .from("telegram_accounts")
      .select("user_id,role")
      .eq("telegram_id", Number(telegram.id))
      .maybeSingle();

    let userId = linked?.user_id as string | undefined;
    let role = linked?.role as string | undefined;

    if (!userId) {
      if (requestedRole === "profissional") {
        return json(cors, 200, {
          ok: true,
          needs_professional_signup: true,
          redirect_to: `${settings.site_base_url}/cadastro.html?telegram=1`,
          message: "Para profissional, crie o perfil completo primeiro e vincule o Telegram no painel.",
        });
      }
      userId = await createCustomerFromTelegram(admin, telegram);
      role = "cliente";
      await upsertTelegramAccount(admin, userId, role, telegram);
    } else {
      await upsertTelegramAccount(admin, userId, role ?? requestedRole, telegram);
    }

    const { data: userData, error: getUserErr } = await admin.auth.admin.getUserById(userId);
    if (getUserErr || !userData.user?.email) {
      return json(cors, 500, { ok: false, error: "Usuario Telegram sem e-mail interno" });
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
      options: {
        redirectTo: `${settings.site_base_url}/login.html?telegram_done=1`,
      },
    });

    if (linkErr || !linkData.properties?.action_link) {
      return json(cors, 500, { ok: false, error: linkErr?.message || "Erro ao gerar sessao" });
    }

    return json(cors, 200, {
      ok: true,
      role,
      action_link: linkData.properties.action_link,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return json(cors, 500, { ok: false, error: message });
  }
});
