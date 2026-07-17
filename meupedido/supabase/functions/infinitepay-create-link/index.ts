import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { centsFromDecimal, createAdminClient } from "../_shared/supabase.ts";

const INFINITEPAY_API = "https://api.checkout.infinitepay.io";
const PAYMENT_METHOD = "cartao_infinitepay";

type CreateLinkBody = {
  colaborador_id?: string;
  prato_id?: string;
  observacoes?: string | null;
  acompanhamentos?: string[];
  redirect_url?: string;
};

function appendReturnParams(redirectUrl: string, pedidoId: string) {
  const url = new URL(redirectUrl);
  url.searchParams.set("infinitepay", "retorno");
  url.searchParams.set("pedido_id", pedidoId);
  return url.toString();
}

function webhookUrl() {
  const explicitUrl = Deno.env.get("INFINITEPAY_WEBHOOK_URL");
  if (explicitUrl) return explicitUrl;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL nao configurado.");
  return `${supabaseUrl}/functions/v1/infinitepay-webhook`;
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function phoneForInfinitePay(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return undefined;
}

async function infinitePayHandle(sb: ReturnType<typeof createAdminClient>) {
  const fromEnv = Deno.env.get("INFINITEPAY_HANDLE")?.trim().replace(/^\$/, "");
  if (fromEnv) return fromEnv;

  const { data, error } = await sb
    .from("configuracoes")
    .select("valor")
    .eq("chave", "infinitepay_handle")
    .maybeSingle();

  if (error) throw error;

  const fromDb = String(data?.valor || "").trim().replace(/^\$/, "");
  if (!fromDb) throw new Error("Configure a InfiniteTag da InfinitePay no painel admin.");
  return fromDb;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Metodo nao permitido." }, 405);

  let pedidoId: string | null = null;

  try {
    const body = await req.json() as CreateLinkBody;
    if (!body.colaborador_id || !body.prato_id) {
      return jsonResponse({ success: false, message: "Colaborador e prato sao obrigatorios." }, 400);
    }

    const sb = createAdminClient();
    const handle = await infinitePayHandle(sb);

    const { data: createdId, error: createError } = await sb.rpc("criar_pedido", {
      p_colaborador_id: body.colaborador_id,
      p_prato_id: body.prato_id,
      p_forma_pagamento: PAYMENT_METHOD,
      p_observacoes: body.observacoes || null,
      p_acompanhamentos: body.acompanhamentos || [],
    });

    if (createError || !createdId) {
      throw new Error(createError?.message || "Nao foi possivel criar o pedido.");
    }
    pedidoId = String(createdId);

    const { data: pedido, error: pedidoError } = await sb
      .from("pedidos")
      .select(`
        id,
        preco_total,
        colaborador:colaboradores ( nome, whatsapp ),
        prato:pratos ( nome ),
        fornecedor:fornecedores ( nome )
      `)
      .eq("id", pedidoId)
      .single();

    if (pedidoError || !pedido) {
      throw new Error(pedidoError?.message || "Pedido nao encontrado apos criacao.");
    }

    const fallbackRedirect = Deno.env.get("APP_PUBLIC_URL") || (req.headers.get("origin")
      ? `${req.headers.get("origin")}/marmita.html`
      : "https://seusite.com/marmita.html");
    const redirectUrl = appendReturnParams(body.redirect_url || fallbackRedirect, pedidoId);
    const colaborador = firstRelated(pedido.colaborador);
    const prato = firstRelated(pedido.prato);
    const description = `Pedido ${prato?.nome || "marmita"}`.slice(0, 255);

    const payload = {
      handle,
      redirect_url: redirectUrl,
      webhook_url: webhookUrl(),
      order_nsu: pedidoId,
      customer: {
        name: colaborador?.nome || "Cliente",
        phone_number: phoneForInfinitePay(colaborador?.whatsapp),
      },
      items: [
        {
          quantity: 1,
          price: centsFromDecimal(pedido.preco_total),
          description,
        },
      ],
    };

    const infiniteRes = await fetch(`${INFINITEPAY_API}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const infiniteBody = await infiniteRes.json().catch(() => ({}));
    if (!infiniteRes.ok || !infiniteBody?.url) {
      await sb.from("pedidos").update({
        status: "cancelado",
        status_pagamento: "cancelado",
        cancelado_em: new Date().toISOString(),
        infinitepay_payload: infiniteBody,
      }).eq("id", pedidoId);

      return jsonResponse({
        success: false,
        message: infiniteBody?.message || "InfinitePay nao retornou o link de pagamento.",
        details: infiniteBody,
      }, 502);
    }

    await sb.from("pedidos").update({
      infinitepay_checkout_url: infiniteBody.url,
      infinitepay_payload: infiniteBody,
    }).eq("id", pedidoId);

    return jsonResponse({
      success: true,
      pedido_id: pedidoId,
      checkout_url: infiniteBody.url,
    });
  } catch (error) {
    if (pedidoId) {
      try {
        await createAdminClient().from("pedidos").update({
          status: "cancelado",
          status_pagamento: "cancelado",
          cancelado_em: new Date().toISOString(),
          infinitepay_payload: { error: error instanceof Error ? error.message : String(error) },
        }).eq("id", pedidoId);
      } catch {
        // Mantem a resposta original se a compensacao falhar.
      }
    }

    return jsonResponse({
      success: false,
      message: error instanceof Error ? error.message : "Erro inesperado ao criar checkout.",
    }, 500);
  }
});
