import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    contact?: { phone_number?: string; user_id?: number | string; first_name?: string };
    from?: { id?: number | string; first_name?: string; username?: string };
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

function normalizePhone(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) return null;
  return digits;
}

async function sendPendingCodes(
  admin: ReturnType<typeof createClient>,
  botToken: string,
  phone: string,
  chatId: number | string,
) {
  const { data: codes } = await admin
    .from("telegram_login_codes")
    .select("id,code,role,purpose,expires_at")
    .eq("phone", phone)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(3);

  if (!codes?.length) return false;

  for (const item of codes) {
    const actionText = item.purpose === "signup"
      ? "criar sua conta"
      : item.purpose === "reset"
        ? "recuperar ou entrar na sua conta"
        : "entrar na sua conta";
    await telegram("sendMessage", botToken, {
      chat_id: chatId,
      text: `Codigo Venus: ${item.code}\n\nUse este codigo para ${actionText} como ${item.role}. Ele expira em 10 minutos.`,
      reply_markup: { remove_keyboard: true },
    });
  }
  return true;
}

async function saveTelegramContact(
  admin: ReturnType<typeof createClient>,
  phone: string,
  chatId: number | string,
  telegramId: number | string | undefined,
  firstName?: string,
  username?: string,
) {
  const row = {
    phone,
    telegram_id: Number(telegramId || chatId),
    chat_id: Number(chatId),
    first_name: firstName || null,
    username: username || null,
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("telegram_contacts")
    .upsert(row, { onConflict: "phone" });

  if (!error) return;

  const { error: updateErr } = await admin
    .from("telegram_contacts")
    .update(row)
    .eq("telegram_id", row.telegram_id);

  if (updateErr) throw updateErr;
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
  const fromId = update.message?.from?.id;

  if (update.message?.contact?.phone_number) {
    const phone = normalizePhone(update.message.contact.phone_number);
    if (!phone) {
      await telegram("sendMessage", cfg.bot_token, {
        chat_id: chatId,
        text: "Nao consegui validar esse telefone. Tente novamente com DDD.",
      });
      return Response.json({ ok: true });
    }

    await saveTelegramContact(
      admin,
      phone,
      chatId,
      update.message.contact.user_id || fromId,
      update.message.contact.first_name || update.message.from?.first_name,
      update.message.from?.username,
    );

    const sent = await sendPendingCodes(admin, cfg.bot_token, phone, chatId);
    await telegram("sendMessage", cfg.bot_token, {
      chat_id: chatId,
      text: sent
        ? "Telefone confirmado. Enviei o codigo acima para continuar no site."
        : "Telefone confirmado. Volte ao site e clique em enviar codigo.",
      reply_markup: { remove_keyboard: true },
    });
    return Response.json({ ok: true });
  }

  const typedPhone = normalizePhone(text);
  if (typedPhone) {
    await saveTelegramContact(
      admin,
      typedPhone,
      chatId,
      fromId,
      update.message.from?.first_name,
      update.message.from?.username,
    );

    const sent = await sendPendingCodes(admin, cfg.bot_token, typedPhone, chatId);
    await telegram("sendMessage", cfg.bot_token, {
      chat_id: chatId,
      text: sent
        ? "Telefone confirmado. Enviei o codigo acima para continuar no site."
        : "Telefone confirmado, mas nao encontrei codigo pendente. Volte ao site e clique em enviar codigo.",
      reply_markup: { remove_keyboard: true },
    });
    return Response.json({ ok: true });
  }

  if (startParam.startsWith("code_")) {
    const startToken = startParam.replace("code_", "");
    const { data: pending } = await admin
      .from("telegram_login_codes")
      .select("phone")
      .eq("start_token", startToken)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (pending?.phone) {
      const { data: contact } = await admin
        .from("telegram_contacts")
        .select("phone")
        .eq("telegram_id", Number(fromId || chatId))
        .maybeSingle();

      if (contact?.phone === pending.phone) {
        const sent = await sendPendingCodes(admin, cfg.bot_token, pending.phone, chatId);
        await telegram("sendMessage", cfg.bot_token, {
          chat_id: chatId,
          text: sent ? "Codigo enviado. Volte ao site para continuar." : "Volte ao site e solicite outro codigo.",
        });
        return Response.json({ ok: true });
      }
    }

    await telegram("sendMessage", cfg.bot_token, {
      chat_id: chatId,
      text: `Ola, ${firstName}! Para receber o codigo, compartilhe ou digite o mesmo telefone informado no site.`,
      reply_markup: {
        keyboard: [[{ text: "Compartilhar telefone", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    return Response.json({ ok: true });
  }

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
