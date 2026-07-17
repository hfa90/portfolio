import { createClient } from "npm:@supabase/supabase-js@2";

function readJsonSecret(name: string, fallbackName: string) {
  const raw = Deno.env.get(name);
  if (raw) {
    const parsed = JSON.parse(raw);
    return parsed.default || Object.values(parsed)[0];
  }
  return Deno.env.get(fallbackName);
}

export function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = readJsonSecret("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase URL/service key nao configurados.");
  }

  return createClient(supabaseUrl, String(serviceKey), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function centsFromDecimal(value: unknown) {
  return Math.round(Number(value || 0) * 100);
}
