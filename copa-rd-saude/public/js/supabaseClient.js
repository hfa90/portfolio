// ============================================================================
// supabaseClient.js — instância única do client, usada por todas as páginas
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function supabaseConfigurado() {
  return (
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("COLE_AQUI") &&
    !SUPABASE_ANON_KEY.includes("COLE_AQUI")
  );
}
