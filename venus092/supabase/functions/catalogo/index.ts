// ============================================================
//  Edge Function: GET /functions/v1/catalogo
//  Listagem pública do catálogo com filtros e paginação
//  POST /functions/v1/catalogo  → registrar evento (view / whatsapp_click)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "https://deno.land/std@0.177.0/node/crypto.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "https://venus.app",
  "https://haydenfernandes.com.br",
  "https://www.haydenfernandes.com.br",
  "http://localhost:3000",
  "http://localhost:5173",
];

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

const PAGE_SIZE = 20;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ══════════════════════════════════════════════════════════
  // GET: listar catálogo com filtros
  // ══════════════════════════════════════════════════════════
  if (req.method === "GET") {
    const url     = new URL(req.url);
    const params  = url.searchParams;

    const cidade    = params.get("cidade")    ?? "";
    const uf        = params.get("uf")        ?? "";
    const bairro    = params.get("bairro")    ?? "";
    const categoria = params.get("categoria") ?? "";
    const busca     = params.get("q")         ?? "";
    const online    = params.get("online")    === "true";
    const verificado = params.get("verificado") === "true";
    const page      = Math.max(1, parseInt(params.get("page") ?? "1"));
    const offset    = (page - 1) * PAGE_SIZE;

    // Usar a view catalog_view para garantir apenas perfis ativos e sem dados sensíveis
    let query = admin
      .from("catalog_view")
      .select("*", { count: "exact" });

    if (cidade)    query = query.ilike("cidade", `%${cidade}%`);
    if (uf)        query = query.eq("uf", uf.toUpperCase().slice(0, 2));
    if (bairro)    query = query.ilike("bairro", `%${bairro}%`);
    if (categoria) query = query.eq("categoria", categoria);
    if (online)    query = query.eq("online_now", true);
    if (verificado) query = query.eq("verificado", true);

    if (busca && busca.length >= 2) {
      // Busca por nome artístico com similaridade trigram
      query = query.or(
        `nome_artistico.ilike.%${busca}%,bairro.ilike.%${busca}%,cidade.ilike.%${busca}%`
      );
    }

    // Ordenação: premium primeiro, depois verificados, depois mais recentes
    query = query
      .order("plano",       { ascending: false })  // premium > free
      .order("verificado",  { ascending: false })
      .order("online_now",  { ascending: false })
      .order("created_at",  { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error("Erro catálogo:", error.message);
      return erro(cors, 500, "Erro ao buscar catálogo");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total:    count ?? 0,
        pagina:   page,
        paginas:  Math.ceil((count ?? 0) / PAGE_SIZE),
        por_pagina: PAGE_SIZE,
        perfis:   data ?? [],
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // ══════════════════════════════════════════════════════════
  // POST: registrar evento de analytics
  // ══════════════════════════════════════════════════════════
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return erro(cors, 400, "JSON inválido");
    }

    const { profile_id, evento } = body;
    const EVENTOS_VALIDOS = [
      "view",
      "whatsapp_click",
      "whatsapp_click_blocked",
      "chat_click",
      "chat_click_blocked",
      "favorite",
      "unfavorite",
    ];

    if (!profile_id || typeof profile_id !== "string") {
      return erro(cors, 400, "profile_id obrigatório");
    }
    if (!evento || !EVENTOS_VALIDOS.includes(String(evento))) {
      return erro(cors, 400, "evento inválido");
    }

    // Verificar que o perfil existe e está ativo
    const { data: perfil } = await admin
      .from("profiles")
      .select("id")
      .eq("id", profile_id)
      .eq("status", "active")
      .maybeSingle();

    if (!perfil) return erro(cors, 404, "Perfil não encontrado");

    // Hash anônimo do visitante (IP + UA) — sem armazenar dado pessoal
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "";
    const visitorHash = createHash("sha256")
      .update(`${clientIp}:${ua}:${new Date().toDateString()}`)
      .digest("hex")
      .slice(0, 16);

    const { error: insErr } = await admin
      .from("profile_analytics")
      .insert({
        profile_id:    String(profile_id),
        evento:        String(evento),
        visitor_hash:  visitorHash,
      });

    if (insErr) return erro(cors, 500, "Erro ao registrar evento");

    return ok(cors, { message: "Evento registrado" });
  }

  return erro(cors, 405, "Método não permitido");
});

function erro(cors: Record<string, string>, status: number, msg: string) {
  return new Response(
    JSON.stringify({ ok: false, error: msg }),
    { status, headers: { ...cors, "Content-Type": "application/json" } }
  );
}

function ok(cors: Record<string, string>, data: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: true, ...data }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
}
