// ============================================================
//  Edge Function: /functions/v1/painel
//  GET  → métricas e dados completos do painel
//  PATCH → atualizar perfil / serviços / disponibilidade / status
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function sanitize(s: unknown, max = 500): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // ── Auth ───────────────────────────────────────────────────
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return erro(cors, 401, "Não autenticado");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return erro(cors, 401, "Token inválido");

  if (!user.email_confirmed_at) {
    return erro(cors, 403, "Confirme seu e-mail antes de acessar o painel profissional");
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ══════════════════════════════════════════════════════════
  // GET: buscar dados completos do painel
  // ══════════════════════════════════════════════════════════
  if (req.method === "GET") {
    const [profileRes, fotosRes, servicosRes, dispRes, locaisRes, metricsRes] =
      await Promise.all([
        admin.from("profiles").select("*").eq("id", user.id).single(),
        admin
          .from("profile_photos")
          .select("id,storage_path,url,is_cover,ordem,status,created_at,size_bytes")
          .eq("profile_id", user.id)
          .order("ordem"),
        admin
          .from("services")
          .select("id,nome,preco,local,ativo,ordem")
          .eq("profile_id", user.id)
          .order("ordem"),
        admin
          .from("availability")
          .select("id,dia_semana,hora_inicio,hora_fim")
          .eq("profile_id", user.id)
          .order("dia_semana"),
        admin
          .from("attendance_locations")
          .select("id,tipo")
          .eq("profile_id", user.id),
        // Métricas dos últimos 7 dias via função
        admin.rpc("get_profile_metrics", { p_profile_id: user.id }),
      ]);

    if (profileRes.error) return erro(cors, 404, "Perfil não encontrado");

    // Remove campos sensíveis do perfil antes de retornar
    const { cep: _cep, termos_ip: _ip, ...profilePublico } = profileRes.data;

    return new Response(
      JSON.stringify({
        ok: true,
        perfil:      profilePublico,
        fotos:       fotosRes.data ?? [],
        servicos:    servicosRes.data ?? [],
        disponibilidade: dispRes.data ?? [],
        locais:      locaisRes.data ?? [],
        metricas:    metricsRes.data?.[0] ?? null,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // ══════════════════════════════════════════════════════════
  // PATCH: atualizar seção do painel
  // ══════════════════════════════════════════════════════════
  if (req.method === "PATCH") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return erro(cors, 400, "JSON inválido");
    }

    const { secao } = body;

    // ── Toggle status online ──────────────────────────────
    if (secao === "status_online") {
      const { online_now } = body;
      const { error: updErr } = await admin
        .from("profiles")
        .update({ online_now: Boolean(online_now) })
        .eq("id", user.id);

      if (updErr) return erro(cors, 500, "Erro ao atualizar status");
      return ok(cors, { message: "Status atualizado" });
    }

    // ── Atualizar dados do perfil ────────────────────────
    if (secao === "perfil") {
      const CATEGORIAS = ["GP Feminina","GP Masculino","Trans","Travesti","Lésbica","Gay"];
      const ETNIAS     = ["Branca","Morena","Negra","Latina","Asiática","Outra",""];

      const erros: string[] = [];
      const updates: Record<string, unknown> = {};

      if (body.nome_artistico !== undefined) {
        const v = sanitize(body.nome_artistico, 80);
        if (v.length < 2) erros.push("Nome artístico inválido");
        else updates.nome_artistico = v;
      }
      if (body.categoria !== undefined) {
        if (!CATEGORIAS.includes(String(body.categoria))) erros.push("Categoria inválida");
        else updates.categoria = body.categoria;
      }
      if (body.bio !== undefined) {
        const v = sanitize(body.bio, 2000);
        if (v.length < 50) erros.push("Bio deve ter no mínimo 50 caracteres");
        else updates.bio = v;
      }
      if (body.idade !== undefined) {
        const v = Number(body.idade);
        if (v < 18 || v > 99) erros.push("Idade inválida");
        else updates.idade = v;
      }
      if (body.altura !== undefined) {
        const v = parseFloat(String(body.altura).replace(",", "."));
        if (v < 1.2 || v > 2.5) erros.push("Altura inválida");
        else updates.altura = v;
      }
      if (body.peso !== undefined) {
        const v = Number(body.peso);
        if (v < 30 || v > 300) erros.push("Peso inválido");
        else updates.peso = v;
      }
      if (body.etnia !== undefined) {
        if (!ETNIAS.includes(String(body.etnia))) erros.push("Etnia inválida");
        else updates.etnia = body.etnia || null;
      }
      if (body.cabelo !== undefined)   updates.cabelo  = sanitize(body.cabelo, 60) || null;
      if (body.olhos !== undefined)    updates.olhos   = sanitize(body.olhos, 60) || null;
      if (body.silicone !== undefined) updates.silicone = Boolean(body.silicone);
      if (body.idiomas !== undefined && Array.isArray(body.idiomas)) {
        updates.idiomas = (body.idiomas as string[]).map(s => sanitize(s, 30)).slice(0, 10);
      }
      if (body.bairro !== undefined)   updates.bairro  = sanitize(body.bairro, 120) || null;
      if (body.cidade !== undefined)   updates.cidade  = sanitize(body.cidade, 120);
      if (body.uf !== undefined)       updates.uf      = String(body.uf).toUpperCase().slice(0, 2);
      if (body.whatsapp !== undefined) {
        const wpp = String(body.whatsapp).replace(/\D/g, "");
        if (wpp.length < 10 || wpp.length > 11) erros.push("WhatsApp inválido");
        else updates.whatsapp = wpp;
      }

      if (erros.length > 0) return erro(cors, 422, "Dados inválidos", { campos: erros });
      if (Object.keys(updates).length === 0) return erro(cors, 400, "Nenhum campo para atualizar");

      const { error: updErr } = await admin
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (updErr) return erro(cors, 500, "Erro ao atualizar perfil");
      return ok(cors, { message: "Perfil atualizado com sucesso" });
    }

    // ── Atualizar serviços (replace completo) ─────────────
    if (secao === "servicos") {
      const LOCAIS = ["Local próprio","A domicílio","Motel / Hotel","Online","A combinar"];
      const { servicos } = body;

      if (!Array.isArray(servicos)) return erro(cors, 400, "servicos deve ser array");

      // Deleta os existentes
      await admin.from("services").delete().eq("profile_id", user.id);

      if (servicos.length > 0) {
        const rows = (servicos as Record<string, unknown>[])
          .filter(s => s.nome && sanitize(s.nome as string).length >= 2)
          .slice(0, 30)
          .map((s, i) => ({
            profile_id: user.id,
            nome:  sanitize(s.nome as string),
            preco: s.preco != null ? Math.max(0, Number(s.preco)) : null,
            local: s.local && LOCAIS.includes(String(s.local)) ? String(s.local) : "A combinar",
            ativo: s.ativo !== false,
            ordem: i,
          }));

        const { error: insErr } = await admin.from("services").insert(rows);
        if (insErr) return erro(cors, 500, "Erro ao salvar serviços");
      }

      return ok(cors, { message: "Serviços atualizados" });
    }

    // ── Atualizar locais de atendimento ───────────────────
    if (secao === "locais") {
      const LOCAIS = ["Local próprio","A domicílio","Motel / Hotel","Online"];
      const { locais } = body;

      if (!Array.isArray(locais)) return erro(cors, 400, "locais deve ser array");

      await admin.from("attendance_locations").delete().eq("profile_id", user.id);

      const rows = (locais as string[])
        .filter(l => LOCAIS.includes(l))
        .slice(0, 4)
        .map(tipo => ({ profile_id: user.id, tipo }));

      if (rows.length > 0) {
        const { error: insErr } = await admin
          .from("attendance_locations")
          .insert(rows);
        if (insErr) return erro(cors, 500, "Erro ao salvar locais");
      }

      return ok(cors, { message: "Locais de atendimento atualizados" });
    }

    // ── Atualizar disponibilidade ─────────────────────────
    if (secao === "disponibilidade") {
      const { disponibilidade } = body;

      if (!Array.isArray(disponibilidade)) return erro(cors, 400, "disponibilidade deve ser array");

      await admin.from("availability").delete().eq("profile_id", user.id);

      const rows = (disponibilidade as Record<string, unknown>[])
        .filter(d =>
          typeof d.dia_semana === "number" &&
          d.dia_semana >= 0 && d.dia_semana <= 6 &&
          d.hora_inicio && d.hora_fim
        )
        .slice(0, 7)
        .map(d => ({
          profile_id:  user.id,
          dia_semana:  Number(d.dia_semana),
          hora_inicio: String(d.hora_inicio),
          hora_fim:    String(d.hora_fim),
        }));

      if (rows.length > 0) {
        const { error: insErr } = await admin.from("availability").insert(rows);
        if (insErr) return erro(cors, 500, "Erro ao salvar disponibilidade");
      }

      return ok(cors, { message: "Disponibilidade atualizada" });
    }

    return erro(cors, 400, "Seção inválida. Use: perfil | servicos | locais | disponibilidade | status_online");
  }

  return erro(cors, 405, "Método não permitido");
});

function erro(cors: Record<string, string>, status: number, msg: string, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: false, error: msg, ...extra }),
    { status, headers: { ...cors, "Content-Type": "application/json" } }
  );
}

function ok(cors: Record<string, string>, data: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: true, ...data }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
}
