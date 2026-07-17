import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const INFINITEPAY_API = "https://api.checkout.infinitepay.io";

function centsToDecimal(value: unknown) {
  return Math.round(Number(value || 0)) / 100;
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

  try {
    const body = await req.json();
    const orderNsu = body?.order_nsu;
    const transactionNsu = body?.transaction_nsu;
    const slug = body?.slug || body?.invoice_slug;

    if (!orderNsu || !transactionNsu || !slug) {
      return jsonResponse({ success: false, message: "Webhook sem order_nsu, transaction_nsu ou slug." }, 400);
    }

    const sb = createAdminClient();
    const { data: pedido, error: pedidoError } = await sb
      .from("pedidos")
      .select("id, status, status_pagamento, forma_pagamento")
      .eq("id", orderNsu)
      .maybeSingle();

    if (pedidoError) throw pedidoError;
    if (!pedido) return jsonResponse({ success: false, message: "Pedido nao encontrado." }, 400);
    if (pedido.status === "cancelado") return jsonResponse({ success: false, message: "Pedido cancelado." }, 400);

    const handle = await infinitePayHandle(sb);
    const checkPayload = {
      handle,
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug,
    };

    const checkRes = await fetch(`${INFINITEPAY_API}/payment_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkPayload),
    });
    const checkBody = await checkRes.json().catch(() => ({}));

    if (!checkRes.ok || checkBody?.success === false) {
      await sb.from("pedidos").update({
        infinitepay_invoice_slug: slug,
        infinitepay_transaction_nsu: transactionNsu,
        infinitepay_checked_em: new Date().toISOString(),
        infinitepay_payload: { webhook: body, payment_check: checkBody },
      }).eq("id", orderNsu);

      return jsonResponse({
        success: false,
        message: checkBody?.message || "Nao foi possivel confirmar pagamento na InfinitePay.",
      }, 400);
    }

    const updatePayload: Record<string, unknown> = {
      infinitepay_invoice_slug: slug,
      infinitepay_transaction_nsu: transactionNsu,
      infinitepay_receipt_url: body?.receipt_url || null,
      infinitepay_capture_method: checkBody?.capture_method || body?.capture_method || null,
      infinitepay_paid_amount: checkBody?.paid_amount ? centsToDecimal(checkBody.paid_amount) : null,
      infinitepay_checked_em: new Date().toISOString(),
      infinitepay_payload: { webhook: body, payment_check: checkBody },
    };

    if (checkBody?.paid === true) {
      updatePayload.status = "aberto";
      updatePayload.status_pagamento = "pago";
      updatePayload.pago_em = new Date().toISOString();
      updatePayload.comprovante_status = "aprovado";
      updatePayload.comprovante_motivo = null;
      updatePayload.comprovante_revisado_em = new Date().toISOString();
    }

    const { error: updateError } = await sb.from("pedidos").update(updatePayload).eq("id", orderNsu);
    if (updateError) throw updateError;

    return jsonResponse({ success: true, message: null });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: error instanceof Error ? error.message : "Erro inesperado no webhook.",
    }, 400);
  }
});
