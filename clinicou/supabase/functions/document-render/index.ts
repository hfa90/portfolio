import { corsHeaders, jsonResponse, readJson, requireEnv } from "../_shared/http.ts";

type DocumentPayload = {
  clinic_id?: string;
  patient_id?: string;
  kind?: "guide" | "certificate" | "prescription" | "receipt";
  html?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    requireEnv("DOCUMENT_SIGNING_SECRET");
    const payload = await readJson<DocumentPayload>(request);
    if (!payload.clinic_id || !payload.patient_id || !payload.kind || !payload.html) {
      return jsonResponse({ error: "clinic_id, patient_id, kind and html are required" }, 400);
    }

    // Next step: render PDF, store it in clinicou-documents and return a signed download URL.
    return jsonResponse({ rendered: false, accepted: true, kind: payload.kind });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Document render failed" }, 500);
  }
});
