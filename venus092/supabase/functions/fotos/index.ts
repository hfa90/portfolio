// ============================================================
//  Edge Function: POST /functions/v1/fotos
//  Upload de fotos do perfil com validação e moderação
//  Content-Type: multipart/form-data
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ORIGINS = [
  "https://venus.app",
  "https://haydenfernandes.com.br",
  "https://www.haydenfernandes.com.br",
  "http://localhost:3000",
  "http://localhost:5173",
];

const MAX_FILE_SIZE   = 15 * 1024 * 1024; // 15 MB por foto
const MAX_PHOTOS      = 20;               // máx fotos por perfil
const ALLOWED_MIMES   = ["image/jpeg", "image/png", "image/webp"];
const BUCKET_PENDING  = "venus-photos";   // bucket privado (moderação)

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // ── Autenticar usuário ─────────────────────────────────────
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return erro(cors, 401, "Não autenticado");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return erro(cors, 401, "Token inválido");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── DELETE: remover foto ──────────────────────────────────
  if (req.method === "DELETE") {
    let body: { photo_id: string };
    try {
      body = await req.json();
    } catch {
      return erro(cors, 400, "JSON inválido");
    }

    const { photo_id } = body;
    if (!photo_id) return erro(cors, 400, "photo_id obrigatório");

    // Busca a foto e verifica propriedade
    const { data: photo, error: fetchErr } = await admin
      .from("profile_photos")
      .select("storage_path, profile_id, status")
      .eq("id", photo_id)
      .single();

    if (fetchErr || !photo) return erro(cors, 404, "Foto não encontrada");
    if (photo.profile_id !== user.id) return erro(cors, 403, "Sem permissão");

    // Remove do storage
    const bucket = photo.status === "approved" ? "venus-covers" : BUCKET_PENDING;
    await admin.storage.from(bucket).remove([photo.storage_path]);

    // Remove do banco
    const { error: delErr } = await admin
      .from("profile_photos")
      .delete()
      .eq("id", photo_id)
      .eq("profile_id", user.id);

    if (delErr) return erro(cors, 500, "Erro ao remover foto");

    return ok(cors, { message: "Foto removida com sucesso" });
  }

  // ── POST: upload de foto(s) ───────────────────────────────
  if (req.method !== "POST") {
    return erro(cors, 405, "Método não permitido");
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return erro(cors, 400, "Use multipart/form-data");
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return erro(cors, 400, "FormData inválido");
  }

  // Verificar quantas fotos já existem
  const { count: photoCount } = await admin
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", user.id);

  if ((photoCount ?? 0) >= MAX_PHOTOS) {
    return erro(cors, 422, `Limite de ${MAX_PHOTOS} fotos atingido`);
  }

  const files = formData.getAll("fotos") as File[];
  if (!files || files.length === 0) {
    return erro(cors, 400, "Nenhuma foto enviada (campo: fotos)");
  }

  const vagas = MAX_PHOTOS - (photoCount ?? 0);
  const filesToProcess = files.slice(0, vagas);

  const resultados: {
    filename: string;
    photo_id?: string;
    storage_path?: string;
    error?: string;
  }[] = [];

  // Verificar se já tem capa
  const { data: existingCover } = await admin
    .from("profile_photos")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_cover", true)
    .maybeSingle();

  let primeiraFoto = !existingCover; // se não tem capa, a 1ª vira capa

  for (const file of filesToProcess) {
    // Validar tipo MIME
    if (!ALLOWED_MIMES.includes(file.type)) {
      resultados.push({
        filename: file.name,
        error: `Tipo não suportado: ${file.type}. Use JPEG, PNG ou WebP.`,
      });
      continue;
    }

    // Validar tamanho
    if (file.size > MAX_FILE_SIZE) {
      resultados.push({
        filename: file.name,
        error: `Arquivo muito grande (máx 15 MB). Tamanho: ${(file.size / 1024 / 1024).toFixed(1)} MB`,
      });
      continue;
    }

    // Validar magic bytes (header dos arquivos)
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer.slice(0, 12));
    if (!isValidImageMagic(bytes, file.type)) {
      resultados.push({
        filename: file.name,
        error: "Arquivo corrompido ou tipo incompatível",
      });
      continue;
    }

    // Gerar path único no storage
    const ext = file.type === "image/png" ? "png"
              : file.type === "image/webp" ? "webp"
              : "jpg";
    const photoId  = crypto.randomUUID();
    const storagePath = `${user.id}/${photoId}.${ext}`;

    // Upload para bucket privado (pendente de moderação)
    const { error: uploadErr } = await admin.storage
      .from(BUCKET_PENDING)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
        duplex: "half",
      });

    if (uploadErr) {
      resultados.push({
        filename: file.name,
        error: `Erro no upload: ${uploadErr.message}`,
      });
      continue;
    }

    // Registrar no banco
    const { data: photoRow, error: dbErr } = await admin
      .from("profile_photos")
      .insert({
        id:           photoId,
        profile_id:   user.id,
        storage_path: storagePath,
        is_cover:     primeiraFoto,
        status:       "pending",
        mime_type:    file.type,
        size_bytes:   file.size,
        ordem:        (photoCount ?? 0) + resultados.filter(r => !r.error).length,
      })
      .select("id")
      .single();

    if (dbErr) {
      // Remove do storage se falhou no banco
      await admin.storage.from(BUCKET_PENDING).remove([storagePath]);
      resultados.push({
        filename: file.name,
        error: `Erro ao registrar foto: ${dbErr.message}`,
      });
      continue;
    }

    resultados.push({
      filename:     file.name,
      photo_id:     photoRow.id,
      storage_path: storagePath,
    });

    primeiraFoto = false; // apenas a 1ª foto vira capa
  }

  const sucessos = resultados.filter(r => !r.error).length;
  const falhas   = resultados.filter(r => r.error).length;

  return new Response(
    JSON.stringify({
      ok: true,
      enviadas: filesToProcess.length,
      sucesso:  sucessos,
      falhas:   falhas,
      resultados,
      message:  `${sucessos} foto(s) enviada(s) para aprovação.`,
    }),
    {
      status: sucessos > 0 ? 201 : 422,
      headers: { ...cors, "Content-Type": "application/json" },
    }
  );
});

// ── Verifica magic bytes para segurança extra ─────────────────
function isValidImageMagic(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") {
    return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  }
  if (mime === "image/png") {
    return (
      bytes[0] === 0x89 && bytes[1] === 0x50 &&
      bytes[2] === 0x4E && bytes[3] === 0x47
    );
  }
  if (mime === "image/webp") {
    return (
      bytes[0] === 0x52 && bytes[1] === 0x49 &&
      bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 &&
      bytes[10] === 0x42 && bytes[11] === 0x50
    );
  }
  return false;
}

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
