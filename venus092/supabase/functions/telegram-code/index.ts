import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "https://hfa90.github.io",
  "https://haydenfernandes.com.br",
  "https://www.haydenfernandes.com.br",
  "http://127.0.0.1:8020",
  "http://127.0.0.1:8021",
  "http://localhost:3000",
  "http://localhost:5173",
];

type Role = "cliente" | "profissional";
type Purpose = "login" | "signup" | "reset";

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(cors: Record<string, string>, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) return null;
  return digits;
}

function roleOf(value: unknown): Role {
  return value === "profissional" ? "profissional" : "cliente";
}

function purposeOf(value: unknown): Purpose {
  if (value === "signup" || value === "reset") return value;
  return "login";
}

function makeCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
}

async function settings(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin
    .from("telegram_settings")
    .select("key,value")
    .in("key", ["bot_token", "bot_username", "site_base_url"]);
  if (error) throw new Error("Configuracao do Telegram indisponivel");
  const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  return {
    bot_token: String(map.bot_token || ""),
    bot_username: String(map.bot_username || "venus092_bot"),
    site_base_url: String(map.site_base_url || "https://haydenfernandes.com.br"),
  };
}

async function telegram(method: string, token: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function sendCode(
  admin: ReturnType<typeof createClient>,
  botToken: string,
  phone: string,
  code: string,
  role: Role,
  purpose: Purpose,
) {
  const { data: contact } = await admin
    .from("telegram_contacts")
    .select("chat_id,first_name")
    .eq("phone", phone)
    .maybeSingle();

  if (!contact?.chat_id) return false;

  const actionText = purpose === "signup"
    ? "criar sua conta"
    : purpose === "reset"
      ? "recuperar ou entrar na sua conta"
      : "entrar na sua conta";

  await telegram("sendMessage", botToken, {
    chat_id: contact.chat_id,
    text: `Codigo Venus: ${code}\n\nUse este codigo para ${actionText} como ${role}. Ele expira em 10 minutos.`,
  });
  return true;
}

async function requestCode(admin: ReturnType<typeof createClient>, cors: Record<string, string>, body: Record<string, unknown>) {
  const phone = normalizePhone(body.phone);
  if (!phone) return json(cors, 422, { ok: false, error: "Informe um telefone valido com DDD." });

  const role = roleOf(body.role);
  const purpose = purposeOf(body.purpose);
  const cfg = await settings(admin);
  if (!cfg.bot_token) return json(cors, 500, { ok: false, error: "Bot do Telegram nao configurado." });

  const code = makeCode();
  const startToken = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await admin.from("telegram_login_codes").insert({
    phone,
    role,
    purpose,
    code,
    start_token: startToken,
    expires_at: expiresAt,
  });
  if (error) return json(cors, 500, { ok: false, error: error.message });

  const sent = await sendCode(admin, cfg.bot_token, phone, code, role, purpose);
  return json(cors, 200, {
    ok: true,
    sent,
    needs_bot: !sent,
    bot_link: `https://t.me/${cfg.bot_username}?start=code_${startToken}`,
    message: sent
      ? "Codigo enviado no Telegram."
      : "Abra o bot, compartilhe seu telefone e o codigo sera enviado no Telegram.",
  });
}

async function findUser(admin: ReturnType<typeof createClient>, phone: string, role: Role) {
  if (role === "cliente") {
    const { data } = await admin.from("customers").select("id,email").eq("telefone", phone).maybeSingle();
    return data;
  }
  const { data } = await admin.from("profiles").select("id,email").eq("whatsapp", phone).maybeSingle();
  return data;
}

async function createCustomer(admin: ReturnType<typeof createClient>, phone: string) {
  const existing = await findUser(admin, phone, "cliente");
  if (existing?.id) return existing;

  const email = `cliente_${phone}@venus092.local`;
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { provider: "telegram_phone", role: "cliente", phone },
  });
  if (userErr || !userData.user) throw new Error(userErr?.message || "Erro ao criar usuario");

  const { error } = await admin.from("customers").insert({
    id: userData.user.id,
    email,
    telefone: phone,
    nome: `Cliente ${phone.slice(-4)}`,
    termos_aceitos: true,
    conteudo_adulto_aceito: true,
    termos_aceitos_em: new Date().toISOString(),
  });
  if (error) {
    await admin.auth.admin.deleteUser(userData.user.id);
    throw new Error(error.message);
  }

  return { id: userData.user.id, email };
}

async function createProfessional(admin: ReturnType<typeof createClient>, phone: string) {
  const existing = await findUser(admin, phone, "profissional");
  if (existing?.id) return existing;

  const email = `profissional_${phone}@venus092.local`;
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { provider: "telegram_phone", role: "profissional", phone },
  });
  if (userErr || !userData.user) throw new Error(userErr?.message || "Erro ao criar usuario");

  const { error } = await admin.from("profiles").insert({
    id: userData.user.id,
    email,
    whatsapp: phone,
    nome_artistico: `Profissional ${phone.slice(-4)}`,
    categoria: "GP Feminina",
    bio: null,
    cidade: "A definir",
    uf: "SP",
    status: "pending",
    termos_aceitos: true,
    conteudo_adulto_aceito: true,
    termos_aceitos_em: new Date().toISOString(),
  });
  if (error) {
    await admin.auth.admin.deleteUser(userData.user.id);
    throw new Error(error.message);
  }

  return { id: userData.user.id, email };
}

async function linkTelegramPhone(admin: ReturnType<typeof createClient>, userId: string, phone: string, role: Role) {
  const { data: contact } = await admin
    .from("telegram_contacts")
    .select("telegram_id,chat_id,first_name,username")
    .eq("phone", phone)
    .maybeSingle();
  if (!contact?.telegram_id) return;

  await admin.from("telegram_accounts").upsert({
    user_id: userId,
    telegram_id: contact.telegram_id,
    role,
    phone,
    chat_id: contact.chat_id,
    first_name: contact.first_name || null,
    username: contact.username || null,
    last_login_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

async function magicLink(admin: ReturnType<typeof createClient>, email: string, siteBaseUrl: string) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteBaseUrl}/login.html?telegram_done=1` },
  });
  if (error || !data.properties?.action_link) throw new Error(error?.message || "Erro ao gerar acesso");
  return data.properties.action_link;
}

async function verifyCode(admin: ReturnType<typeof createClient>, cors: Record<string, string>, body: Record<string, unknown>) {
  const phone = normalizePhone(body.phone);
  if (!phone) return json(cors, 422, { ok: false, error: "Telefone invalido." });

  const code = String(body.code || "").replace(/\D/g, "");
  if (code.length !== 6) return json(cors, 422, { ok: false, error: "Informe o codigo de 6 digitos." });

  const role = roleOf(body.role);
  const purpose = purposeOf(body.purpose);
  const cfg = await settings(admin);

  const { data: row, error } = await admin
    .from("telegram_login_codes")
    .select("*")
    .eq("phone", phone)
    .eq("role", role)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json(cors, 500, { ok: false, error: error.message });
  if (!row) return json(cors, 404, { ok: false, error: "Codigo expirado. Solicite outro." });

  if (row.attempts >= 5) return json(cors, 429, { ok: false, error: "Muitas tentativas. Solicite outro codigo." });
  if (row.code !== code) {
    await admin.from("telegram_login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return json(cors, 401, { ok: false, error: "Codigo incorreto." });
  }

  let account = await findUser(admin, phone, role);
  let isNew = false;
  if (!account?.id && purpose === "signup") {
    account = role === "cliente"
      ? await createCustomer(admin, phone)
      : await createProfessional(admin, phone);
    isNew = true;
  }

  if (!account?.id || !account.email) {
    return json(cors, 404, {
      ok: false,
      error: "Conta nao encontrada para este telefone. Use a opcao de cadastro primeiro.",
    });
  }

  await admin.from("telegram_login_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  await linkTelegramPhone(admin, account.id, phone, role);

  const newPassword = String(body.new_password || "");
  if (purpose === "reset" && newPassword) {
    if (newPassword.length < 8) return json(cors, 422, { ok: false, error: "A nova senha precisa ter no minimo 8 caracteres." });
    const { error: updateErr } = await admin.auth.admin.updateUserById(account.id, { password: newPassword });
    if (updateErr) return json(cors, 500, { ok: false, error: updateErr.message });
  }

  const actionLink = await magicLink(admin, account.email, cfg.site_base_url);
  return json(cors, 200, {
    ok: true,
    role,
    is_new: isNew,
    password_updated: Boolean(newPassword),
    action_link: actionLink,
  });
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    return body.action === "verify"
      ? await verifyCode(admin, cors, body)
      : await requestCode(admin, cors, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return json(cors, 500, { ok: false, error: message });
  }
});
