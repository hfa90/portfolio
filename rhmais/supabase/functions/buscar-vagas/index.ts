// Edge Function "buscar-vagas": consulta UM canal de vagas e devolve as vagas normalizadas.
// O navegador chama uma vez por canal (em paralelo) — assim mostra o progresso canal a canal.
// Requer usuário autenticado (verify_jwt). As chaves de API (Adzuna, Jooble, GitHub) são da plataforma:
// ficam em `config_plataforma`, gravadas só pelo master e lidas aqui com a service role.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { parseHTML } from "npm:linkedom@0.18.5";
import { CONECTORES, FonteErro } from "./fontes.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", {
    global: { headers: { Authorization: auth } },
  });
  const { data: u, error: eu } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (eu || !u?.user) return json({ erro: "Faça login novamente." }, 401);

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }
  const fonte = String(corpo.fonte ?? "");
  const conector = (CONECTORES as Record<string, Function>)[fonte];
  if (!conector) return json({ erro: "Canal desconhecido" }, 400);
  const termos = (Array.isArray(corpo.termos) ? corpo.termos : [corpo.termo]).map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 5);
  if (!termos.length) return json({ erro: "Informe um termo" }, 400);

  // preferências da conta (RLS) + chaves de API da plataforma (só a service role lê)
  const { data: cfg } = await sb.from("configuracoes").select("paginas_por_fonte").maybeSingle();
  let chaves: Record<string, string> = {};
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (service && (fonte === "adzuna" || fonte === "jooble" || fonte === "github_br")) {
    const adm = createClient(Deno.env.get("SUPABASE_URL")!, service, { auth: { persistSession: false } });
    const { data } = await adm.from("config_plataforma").select("adzuna_app_id, adzuna_app_key, jooble_key, github_token").eq("id", 1).maybeSingle();
    chaves = data ?? {};
  }
  const paginas = Math.max(1, Math.min(5, Number(corpo.paginas ?? cfg?.paginas_por_fonte ?? 2)));
  const base = {
    cidade: String(corpo.cidade ?? ""), uf: String(corpo.uf ?? ""), paginas,
    skills: Array.isArray(corpo.skills) ? corpo.skills.map(String).slice(0, 40) : [],
  };

  const vagas: unknown[] = [];
  const erros: string[] = [];
  await Promise.all(termos.map(async (termo) => {
    try { vagas.push(...await conector({ ...base, termo }, { parseHTML, chaves })); }
    catch (e) { erros.push(e instanceof FonteErro ? e.message : `${fonte}: ${(e as Error).message}`); }
  }));
  if (!vagas.length && erros.length) return json({ vagas: [], erro: erros[0].slice(0, 200) });
  return json({ vagas, erro: erros.length ? erros[0].slice(0, 200) : "" });
});
