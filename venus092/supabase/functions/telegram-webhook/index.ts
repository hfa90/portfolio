import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    from?: { first_name?: string; username?: string };
  };
};

async function settings(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin
    .from("telegram_settings")
    .select("key,value")
    .in("key", ["bot_token", "webhook_secret", "site_base_url"]);
  if (error) throw new Error(error.message);
  const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  return map as { bot_token: string; webhook_secret: string; site_base_url: string };
}

async function telegram(method: string, token: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("Telegram API error", method, await res.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const cfg = await settings(admin);

  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!cfg.webhook_secret || secret !== cfg.webhook_secret) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  if (!chatId) return Response.json({ ok: true });

  const firstName = update.message?.from?.first_name || "bem-vindo(a)";
  const text = update.message?.text || "";
  const startParam = text.startsWith("/start") ? text.split(" ")[1] || "" : "";
  const loginCliente = `${cfg.site_base_url}/login.html?tipo=cliente&telegram=1`;
  const loginProfissional = `${cfg.site_base_url}/login.html?tipo=profissional&telegram=1`;

  const intro = startParam === "profissional"
    ? "Acesse seu painel profissional rapidamente pelo Telegram."
    : startParam === "cliente"
      ? "Entre como cliente pelo Telegram para salvar favoritos e conversar."
      : "Escolha como quer acessar a Venus.";

  await telegram("sendMessage", cfg.bot_token, {
    chat_id: chatId,
    text: `Ola, ${firstName}!\\n\\n${intro}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Entrar como cliente", url: loginCliente }],
        [{ text: "Entrar como profissional", url: loginProfissional }],
        [{ text: "Abrir catalogo", url: `${cfg.site_base_url}/catalogo.html` }],
      ],
    },
  });

  return Response.json({ ok: true });
});
