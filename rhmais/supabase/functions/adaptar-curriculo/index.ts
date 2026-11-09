// Edge Function "adaptar-curriculo": adapta o currículo de um candidato para uma vaga usando Claude.
// Requer: usuário autenticado (verify_jwt) e o secret ANTHROPIC_API_KEY
//   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
// Limite de uso por conta controlado no banco (função registrar_uso_ia, ver schema.sql).
import Anthropic from "npm:@anthropic-ai/sdk@1.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { adaptarCurriculo, validarEntrada } from "./adaptar.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ erro: "IA não configurada: defina o secret ANTHROPIC_API_KEY no Supabase." }, 503);

  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", {
    global: { headers: { Authorization: auth } },
  });
  const { data: u, error: eu } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (eu || !u?.user) return json({ erro: "Faça login novamente." }, 401);

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }
  const invalido = validarEntrada(corpo);
  if (invalido) return json({ erro: invalido }, 400);

  // conta o uso (e bloqueia acima do limite diário) antes de chamar a IA
  const { error: eLim } = await sb.rpc("registrar_uso_ia", { p_recurso: "adaptar_curriculo" });
  if (eLim) return json({ erro: eLim.message.includes("Limite") ? eLim.message : "Não foi possível registrar o uso." }, 429);

  try {
    const resultado = await adaptarCurriculo(anthropic, corpo);
    return json({ curriculo: resultado });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ erro: "A IA está ocupada no momento. Tente de novo em instantes." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ erro: "Chave da Anthropic inválida no Supabase." }, 503);
    if (e instanceof Anthropic.APIConnectionError) return json({ erro: "Sem conexão com a IA. Tente novamente." }, 502);
    if (e instanceof Anthropic.APIError) return json({ erro: `Erro da IA (${e.status ?? "?"}). Tente novamente.` }, 502);
    return json({ erro: (e as Error).message }, 500);
  }
});
