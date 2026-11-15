// Edge Function "candidatar": registra a candidatura a uma vaga publicada no RH+ Match.
//   POST { vaga_id, curriculo_id?, mensagem? }  →  { id }
// A nota de compatibilidade é calculada AQUI, no servidor, a partir do perfil salvo do candidato (tabela candidatos)
// e da vaga — o navegador não envia nota nem perfil, então ninguém consegue inflar a própria compatibilidade.
// A gravação usa a service role; o banco (gatilho tg_candidatura_protege) descarta nota enviada por qualquer outro caminho.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { avaliar } from "../_shared/nucleo.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const COLS_CAND = "id, nome, email, telefone, cargo_desejado, cargos_alternativos, skills, senioridade, cidade, uf, modalidades, pretensao_salarial, aceita_mudanca, resumo";
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
// mesmo formato de sistema/js/vagas.js (salarioTexto + vagaPublicadaParaBusca), para a nota ser idêntica à exibida na busca
function salarioTexto(v: Record<string, any>) {
  if (!v.mostrar_salario || (!v.salario_min && !v.salario_max)) return "";
  if (v.salario_min && v.salario_max && v.salario_min !== v.salario_max) return `${brl(v.salario_min)} a ${brl(v.salario_max)}`;
  return brl(v.salario_max || v.salario_min);
}
const paraBusca = (vp: Record<string, any>) => ({
  titulo: vp.titulo, empresa: vp.organizacao || "", fonte: "RH+ Match", plataforma_id: vp.id,
  cidade: vp.cidade || "", uf: vp.uf || "", modalidade: vp.modalidade || "", senioridade: vp.senioridade || "",
  salario: salarioTexto(vp), contrato: vp.regime || "", tags: [vp.area].filter(Boolean),
  descricao: [vp.descricao, vp.requisitos && "Requisitos:\n" + vp.requisitos, vp.beneficios && "Benefícios:\n" + vp.beneficios].filter(Boolean).join("\n\n"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", { global: { headers: { Authorization: auth } } });
  const { data: u, error: erroAuth } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (erroAuth || !u?.user) return json({ erro: "Faça login novamente." }, 401);
  const uid = u.user.id;

  let corpo: { vaga_id?: number; curriculo_id?: number | null; mensagem?: string };
  try { corpo = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }
  const vagaId = Number(corpo.vaga_id);
  if (!Number.isInteger(vagaId) || vagaId <= 0) return json({ erro: "Vaga inválida" }, 400);

  // dados do próprio usuário, lidos com o JWT dele (RLS garante que são dele)
  const { data: eu } = await sb.from("candidatos").select(COLS_CAND).eq("proprio", true).maybeSingle();
  if (!eu) return json({ erro: "Complete seu perfil (Meu perfil) antes de se candidatar." }, 400);
  let cv: { conteudo: unknown; modelo: string } | null = null;
  if (corpo.curriculo_id) {
    const { data } = await sb.from("curriculos").select("conteudo, modelo").eq("id", Number(corpo.curriculo_id)).maybeSingle();
    if (!data) return json({ erro: "Currículo não encontrado." }, 400);
    cv = data;
  }

  const adm = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: vaga } = await adm.from("vagas_publicadas").select("*").eq("id", vagaId).maybeSingle();
  const hoje = new Date().toISOString().slice(0, 10);
  if (!vaga || vaga.status !== "aberta" || (vaga.expira_em && vaga.expira_em < hoje)) return json({ erro: "Esta vaga não está mais aberta." }, 409);
  if (vaga.owner === uid) return json({ erro: "Você não pode se candidatar à própria vaga." }, 400);

  const pont = avaliar(eu, paraBusca(vaga));
  const perfil = { nome: eu.nome, email: eu.email || u.user.email, telefone: eu.telefone, cidade: eu.cidade, uf: eu.uf, cargo_desejado: eu.cargo_desejado,
    skills: eu.skills, senioridade: eu.senioridade, pretensao_salarial: eu.pretensao_salarial, modalidades: eu.modalidades,
    aceita_mudanca: eu.aceita_mudanca, resumo: eu.resumo };
  const { data: nova, error } = await adm.from("candidaturas").insert({
    vaga_id: vagaId, candidato: uid, perfil, curriculo: cv?.conteudo ?? null, curriculo_modelo: cv?.modelo || "classico",
    mensagem: String(corpo.mensagem ?? "").slice(0, 3000), score: pont.score, detalhes: pont.detalhes_score, status: "enviada",
  }).select("id").single();
  if (error?.code === "23505") return json({ erro: "Você já se candidatou a esta vaga." }, 409);
  if (error) return json({ erro: "Não foi possível registrar a candidatura." }, 500);
  return json({ id: nova.id, score: pont.score });
});
