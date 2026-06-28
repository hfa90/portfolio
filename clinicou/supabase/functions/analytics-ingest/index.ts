import { corsHeaders, jsonResponse, readJson, requireEnv } from "../_shared/http.ts";

type AnalyticsPayload = {
  clinic_id?: string;
  event_name?: string;
  entity?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    requireEnv("ANALYTICS_SIGNING_SECRET");
    const payload = await readJson<AnalyticsPayload>(request);
    if (!payload.clinic_id || !payload.event_name) {
      return jsonResponse({ error: "clinic_id and event_name are required" }, 400);
    }

    // Next step: verify caller, insert analytics_events and aggregate product metrics.
    return jsonResponse({ accepted: true, event_name: payload.event_name });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Analytics ingest failed" }, 500);
  }
});
