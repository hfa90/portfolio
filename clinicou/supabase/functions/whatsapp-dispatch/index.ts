import { corsHeaders, jsonResponse, readJson, requireEnv } from "../_shared/http.ts";

type DispatchPayload = {
  clinic_id?: string;
  patient_id?: string;
  phone?: string;
  message?: string;
  template_key?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    requireEnv("WHATSAPP_ACCESS_TOKEN");
    requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    const payload = await readJson<DispatchPayload>(request);
    if (!payload.clinic_id || !payload.message || (!payload.phone && !payload.patient_id)) {
      return jsonResponse({ error: "clinic_id, message and phone or patient_id are required" }, 400);
    }

    // Next step: resolve patient phone under RLS/service role, call Meta WhatsApp API and log integration_events.
    return jsonResponse({ queued: true, provider: "meta", template_key: payload.template_key || null });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Dispatch failed" }, 500);
  }
});
