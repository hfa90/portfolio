import { corsHeaders, jsonResponse, requireEnv } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    requireEnv("STRIPE_WEBHOOK_SECRET");
    const signature = request.headers.get("stripe-signature");
    if (!signature) return jsonResponse({ error: "Missing stripe-signature" }, 400);

    const rawBody = await request.text();
    if (!rawBody) return jsonResponse({ error: "Empty payload" }, 400);

    // Next step: verify signature and upsert clinic_subscriptions with service role.
    return jsonResponse({ received: true, processed: false });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Webhook failed" }, 500);
  }
});
