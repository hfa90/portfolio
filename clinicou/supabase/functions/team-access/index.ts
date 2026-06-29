import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, readJson, requireEnv } from "../_shared/http.ts";

type TeamAccessPayload = {
  clinicId?: string;
  staffId?: string;
  email?: string;
  password?: string;
  accessRole?: "admin" | "medical" | "receptionist";
  permissions?: string[];
};

const ROLE_BY_ACCESS = {
  admin: "admin",
  medical: "professional",
  receptionist: "receptionist"
} as const;

const ALLOWED_SCREENS = new Set([
  "dashboard",
  "agenda",
  "pacientes",
  "prontuario",
  "guia",
  "medico",
  "financeiro",
  "convenios",
  "funcionarios",
  "crm",
  "admin"
]);

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

function sanitizePermissions(permissions: unknown) {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((screen): screen is string => typeof screen === "string" && ALLOWED_SCREENS.has(screen));
}

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  let page = 1;
  const perPage = 1000;
  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Sessao invalida." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Sessao invalida." }, 401);

    const payload = await readJson<TeamAccessPayload>(request);
    const clinicId = payload.clinicId || "";
    const staffId = payload.staffId || "";
    const email = normalizeEmail(payload.email);
    const password = payload.password || "";
    const accessRole = payload.accessRole || "receptionist";
    const membershipRole = ROLE_BY_ACCESS[accessRole];
    const permissions = sanitizePermissions(payload.permissions);

    if (!clinicId || !staffId) return jsonResponse({ error: "Clinica e funcionario sao obrigatorios." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: "E-mail invalido." }, 400);
    if (!/^\d{6}$/.test(password)) return jsonResponse({ error: "A senha deve ter exatamente 6 numeros." }, 400);
    if (!membershipRole) return jsonResponse({ error: "Nivel de acesso invalido." }, 400);

    const { data: requesterMembership, error: requesterError } = await adminClient
      .from("clinic_memberships")
      .select("role,status")
      .eq("clinic_id", clinicId)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (requesterError) throw requesterError;
    if (!requesterMembership || !["owner", "admin"].includes(requesterMembership.role)) {
      return jsonResponse({ error: "Apenas administradores podem criar acesso da equipe." }, 403);
    }

    const { data: staff, error: staffError } = await adminClient
      .from("staff_members")
      .select("id,clinic_id,user_id,professional_id,full_name,role,status")
      .eq("id", staffId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (staffError) throw staffError;
    if (!staff) return jsonResponse({ error: "Funcionario nao encontrado nesta clinica." }, 404);
    if (staff.status !== "active") return jsonResponse({ error: "Funcionario suspenso nao pode receber acesso." }, 400);

    let userId = staff.user_id as string | null;
    if (!userId) {
      const existingUser = await findUserByEmail(adminClient, email);
      if (existingUser) {
        userId = existingUser.id;
        const { error } = await adminClient.auth.admin.updateUserById(userId, {
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: staff.full_name, clinic_id: clinicId, staff_id: staffId }
        });
        if (error) throw error;
      } else {
        const { data: created, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: staff.full_name, clinic_id: clinicId, staff_id: staffId }
        });
        if (error) throw error;
        userId = created.user?.id || null;
      }
    } else {
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: staff.full_name, clinic_id: clinicId, staff_id: staffId }
      });
      if (error) throw error;
    }

    if (!userId) return jsonResponse({ error: "Nao foi possivel criar usuario de acesso." }, 500);

    const membershipPayload = {
      clinic_id: clinicId,
      user_id: userId,
      role: membershipRole,
      status: "active",
      permissions: { screens: permissions }
    };
    const { error: membershipError } = await adminClient
      .from("clinic_memberships")
      .upsert(membershipPayload, { onConflict: "clinic_id,user_id" });
    if (membershipError) throw membershipError;

    const { error: staffUpdateError } = await adminClient
      .from("staff_members")
      .update({ user_id: userId, email, access_role: accessRole, permissions })
      .eq("id", staffId)
      .eq("clinic_id", clinicId);
    if (staffUpdateError) throw staffUpdateError;

    if (staff.role === "doctor" && staff.professional_id) {
      const { error: professionalError } = await adminClient
        .from("professionals")
        .update({ user_id: userId })
        .eq("id", staff.professional_id)
        .eq("clinic_id", clinicId);
      if (professionalError) throw professionalError;
    }

    return jsonResponse({ ok: true, userId });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Nao foi possivel configurar o acesso." }, 500);
  }
});
