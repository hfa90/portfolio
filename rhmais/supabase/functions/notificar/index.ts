// Edge Function "notificar": e-mails de aviso das candidaturas (via Resend).
//   POST { tipo: "nova_candidatura" | "status" | "mensagem", candidatura_id }
// Só quem participa da candidatura (candidato ou dono da vaga) consegue disparar — conferido com o JWT do usuário (RLS).
// Secrets: RESEND_API_KEY (obrigatório para enviar), RESEND_FROM (opcional, ex.: "RH+ Match <avisos@seudominio.com.br>"),
//          SITE_URL (opcional, padrão https://haydenfernandes.com.br/rhmais/sistema/). Sem RESEND_API_KEY, responde sem enviar.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const ETAPAS: Record<string, string> = {
  enviada: "Candidatura enviada", em_analise: "Em análise", entrevista: "Entrevista", aprovada: "Aprovada",
  reprovada: "Não seguiu no processo", contratada: "Contratada", desistiu: "Desistência",
};

function modelo(titulo: string, corpo: string, botao: string, link: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F4F6FB;font-family:Segoe UI,Arial,sans-serif;color:#141A2E">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E3E7F0">
    <tr><td style="background:#111633;padding:20px 26px;color:#fff;font-size:18px;font-weight:700">RH+ Match</td></tr>
    <tr><td style="padding:26px">
      <h1 style="margin:0 0 12px;font-size:20px">${titulo}</h1>
      <div style="font-size:15px;line-height:1.6;color:#3A4257">${corpo}</div>
      <p style="margin:24px 0 6px"><a href="${link}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${botao}</a></p>
    </td></tr>
    <tr><td style="padding:16px 26px;border-top:1px solid #E3E7F0;font-size:12px;color:#8A93A8">Você recebeu este aviso porque participa desta candidatura no RH+ Match.</td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", { global: { headers: { Authorization: auth } } });
  const { data: u, error: eu } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (eu || !u?.user) return json({ erro: "Faça login novamente." }, 401);

  let corpo: { tipo?: string; candidatura_id?: number };
  try { corpo = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }
  const tipo = String(corpo.tipo ?? "");
  if (!["nova_candidatura", "status", "mensagem"].includes(tipo)) return json({ erro: "Tipo inválido" }, 400);

  // RLS: só lê se o usuário participa da candidatura
  const { data: cand } = await sb.from("candidaturas").select("id, vaga_id, candidato, perfil, status, motivo").eq("id", Number(corpo.candidatura_id)).maybeSingle();
  if (!cand) return json({ erro: "Candidatura não encontrada" }, 404);

  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave) return json({ enviado: false, motivo: "E-mail ainda não configurado (RESEND_API_KEY)." });
  const { error: eLim } = await sb.rpc("registrar_uso_email");
  if (eLim) return json({ enviado: false, motivo: eLim.message }, 429);

  const adm = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: vaga } = await adm.from("vagas_publicadas").select("id, titulo, organizacao, owner, email_contato").eq("id", cand.vaga_id).single();
  const emailDe = async (id: string) => (await adm.auth.admin.getUserById(id)).data.user?.email ?? "";
  const site = (Deno.env.get("SITE_URL") ?? "https://haydenfernandes.com.br/rhmais/sistema/").replace(/\/?$/, "/");
  const nomeCand = esc((cand.perfil as Record<string, string>)?.nome || "Um candidato");
  const vagaTxt = `<b>${esc(vaga.titulo)}</b>${vaga.organizacao ? " — " + esc(vaga.organizacao) : ""}`;
  const souCandidato = u.user.id === cand.candidato;

  let para = "", assunto = "", html = "";
  if (tipo === "nova_candidatura") {
    if (!souCandidato) return json({ erro: "Só o candidato dispara este aviso" }, 403);
    para = vaga.email_contato || await emailDe(vaga.owner);
    assunto = `Nova candidatura: ${vaga.titulo}`;
    html = modelo("Você recebeu uma nova candidatura", `${nomeCand} se candidatou à vaga ${vagaTxt}. O currículo e a compatibilidade estão no sistema.`, "Ver candidatura", site + "#/vagas");
  } else if (tipo === "status") {
    if (souCandidato) return json({ erro: "Só quem publicou a vaga dispara este aviso" }, 403);
    para = await emailDe(cand.candidato);
    const etapa = ETAPAS[cand.status] ?? cand.status;
    assunto = `Sua candidatura: ${etapa} — ${vaga.titulo}`;
    html = modelo(`Atualização da sua candidatura: ${esc(etapa)}`, `Sua candidatura à vaga ${vagaTxt} foi atualizada para <b>${esc(etapa)}</b>.${cand.motivo ? `<br><br>Mensagem da empresa:<br><i>${esc(cand.motivo)}</i>` : ""}`, "Ver minha candidatura", site + "#/candidaturas");
  } else {
    para = souCandidato ? (vaga.email_contato || await emailDe(vaga.owner)) : await emailDe(cand.candidato);
    assunto = `Nova mensagem sobre a vaga ${vaga.titulo}`;
    html = modelo("Você tem uma nova mensagem", `${souCandidato ? nomeCand : "A empresa"} enviou uma mensagem sobre a vaga ${vagaTxt}. Responda pelo sistema.`, "Abrir conversa", site + (souCandidato ? "#/vagas" : "#/candidaturas"));
  }
  if (!para) return json({ enviado: false, motivo: "Destinatário sem e-mail." });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") ?? "RH+ Match <onboarding@resend.dev>", to: [para], subject: assunto, html }),
  });
  if (!r.ok) return json({ enviado: false, motivo: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
  return json({ enviado: true });
});
