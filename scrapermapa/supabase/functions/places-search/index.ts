// =====================================================================
//  Prospecta · Edge Function "places-search"
//  Busca empresas pela Google Places API (New) — Text Search — e grava os
//  leads no Supabase. Roda em segundo plano (EdgeRuntime.waitUntil) e o
//  painel acompanha o progresso pela tabela prospecta_buscas.
//
//  Segredo necessário:  GOOGLE_PLACES_API_KEY
//  Chamada (POST, com o JWT do usuário):  { "busca_id": "<uuid>" }
// =====================================================================
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CAMPOS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
  "places.location", "places.nationalPhoneNumber", "places.internationalPhoneNumber",
  "places.websiteUri", "places.rating", "places.userRatingCount",
  "places.regularOpeningHours.weekdayDescriptions", "places.businessStatus",
  "places.primaryTypeDisplayName", "places.googleMapsUri", "places.priceLevel", "places.plusCode",
  "nextPageToken",
].join(",");

const PRECO: Record<string, string> = {
  PRICE_LEVEL_FREE: "Gratuito", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};
const SITUACAO: Record<string, string> = {
  OPERATIONAL: "Ativo", CLOSED_TEMPORARILY: "Fechado temporariamente", CLOSED_PERMANENTLY: "Fechado permanentemente",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const normalizar = (s = "") =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function telefone(nacional?: string, internacional?: string) {
  const dig = (internacional || nacional || "").replace(/\D/g, "");
  let nac = "";
  if (dig.startsWith("55") && (dig.length === 12 || dig.length === 13)) nac = dig.slice(2);
  else if (dig.length === 10 || dig.length === 11) nac = dig;
  if (!nac) return { telefone: nacional || internacional || "", telefone_e164: dig ? "+" + dig : "", celular: false };
  const ddd = nac.slice(0, 2), num = nac.slice(2);
  const fmt = num.length === 9 ? `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}` : `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  return { telefone: fmt, telefone_e164: "+55" + nac, celular: num.length === 9 && num.startsWith("9") };
}

// deno-lint-ignore no-explicit-any
function paraLead(p: any) {
  // deno-lint-ignore no-explicit-any
  const comp = (tipo: string, curto = false) => {
    const c = (p.addressComponents || []).find((x: any) => (x.types || []).includes(tipo));
    return c ? (curto ? c.shortText : c.longText) : "";
  };
  return {
    place_key: p.id,
    nome: p.displayName?.text || "",
    categoria: p.primaryTypeDisplayName?.text || "",
    ...telefone(p.nationalPhoneNumber, p.internationalPhoneNumber),
    site: p.websiteUri || "",
    endereco: (p.formattedAddress || "").replace(/,\s*Brasil$/i, ""),
    rua: comp("route"),
    numero: comp("street_number"),
    bairro: comp("sublocality_level_1") || comp("sublocality") || comp("neighborhood"),
    cidade: comp("administrative_area_level_2") || comp("locality"),
    uf: comp("administrative_area_level_1", true),
    cep: comp("postal_code"),
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    avaliacao: p.rating ?? null,
    num_avaliacoes: p.userRatingCount ?? null,
    horario: (p.regularOpeningHours?.weekdayDescriptions || []).join(" | "),
    plus_code: p.plusCode?.compoundCode || p.plusCode?.globalCode || "",
    situacao: SITUACAO[p.businessStatus] || "",
    faixa_preco: PRECO[p.priceLevel] || "",
    maps_url: p.googleMapsUri || "",
  };
}

function localCorresponde(local: string, lead: Record<string, unknown>) {
  let alvo = normalizar(local.split(",")[0]).replace(/^(bairro|rua|r\.|avenida|av\.)\s+/, "");
  if (!alvo) return true;
  const campos = ["endereco", "bairro", "rua", "cidade"].map((k) => normalizar(String(lead[k] || ""))).join(" | ");
  return campos.includes(alvo);
}

// deno-lint-ignore no-explicit-any
function retangulos(b: any): any[] {
  const n = Math.max(1, Math.min(4, Number(b.grade) || 1));
  const bd = b.bounds;
  if (!bd) return [null];
  const out = [];
  const dLat = (bd.norte - bd.sul) / n, dLng = (bd.leste - bd.oeste) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    out.push({
      rectangle: {
        low: { latitude: bd.sul + i * dLat, longitude: bd.oeste + j * dLng },
        high: { latitude: bd.sul + (i + 1) * dLat, longitude: bd.oeste + (j + 1) * dLng },
      },
    });
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function executar(sb: SupabaseClient, busca: any, chave: string) {
  const id = busca.id;
  const logs: { t: string; msg: string; nivel: string }[] = [];
  const hora = () => new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const log = (msg: string, nivel = "info") => logs.push({ t: hora(), msg, nivel });
  const progresso = async (campos: Record<string, unknown> = {}) => {
    const { data } = await sb.rpc("prospecta_progresso", { p_busca: id, p_campos: campos, p_logs: logs.splice(0) });
    return data?.cancelar === true;
  };

  try {
    const max = busca.max_resultados || 60;
    const estrito = busca.opcoes?.filtro_estrito && busca.modo === "local" && busca.local;
    const textQuery = busca.modo === "local" && busca.local ? `${busca.termo} em ${busca.local}` : busca.termo;
    const areas = busca.modo === "area" ? retangulos(busca) : [null];
    log(`Google Places API: “${textQuery}”${areas.length > 1 ? ` em ${areas.length} sub-regiões` : ""}`);
    await progresso({ fase: "coletando" });

    const vistos = new Set<string>();
    let encontrados = 0, processados = 0, descartados = 0;

    for (let a = 0; a < areas.length; a++) {
      let token: string | undefined;
      for (let pagina = 0; pagina < 3; pagina++) {
        // deno-lint-ignore no-explicit-any
        const corpo: any = { textQuery, languageCode: "pt-BR", regionCode: "BR", pageSize: 20 };
        if (areas[a]) corpo.locationRestriction = areas[a];
        else if (busca.latitude != null && busca.modo === "area") {
          corpo.locationBias = { circle: { center: { latitude: busca.latitude, longitude: busca.longitude }, radius: 3000 } };
        }
        if (token) corpo.pageToken = token;

        const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS },
          body: JSON.stringify(corpo),
        });
        const dados = await r.json();
        if (!r.ok) throw new Error(dados?.error?.message || `Places API respondeu ${r.status}`);

        const lote = [];
        for (const p of dados.places || []) {
          if (vistos.has(p.id) || vistos.size >= max) continue;
          vistos.add(p.id);
          encontrados++;
          processados++;
          const lead = paraLead(p);
          if (estrito && !localCorresponde(busca.local, lead)) { descartados++; continue; }
          lote.push(lead);
        }
        if (lote.length) {
          const { error } = await sb.rpc("prospecta_salvar_leads", { p_busca: id, p_leads: lote });
          if (error) throw new Error(error.message);
        }
        log(`Página ${pagina + 1}${areas.length > 1 ? ` · região ${a + 1}/${areas.length}` : ""}: ${(dados.places || []).length} resultados`);
        const cancelar = await progresso({ fase: "extraindo", encontrados, processados, descartados });
        if (cancelar) { log("Busca interrompida pelo usuário.", "aviso"); await progresso({ status: "cancelada", fase: "cancelado" }); return; }

        token = dados.nextPageToken;
        if (!token || vistos.size >= max) break;
        await new Promise((ok) => setTimeout(ok, 1200)); // o token leva ~1s para ficar válido
      }
      if (vistos.size >= max) break;
    }
    log(`Concluído: ${encontrados} empresas (${descartados} fora do local).`, "sucesso");
    await progresso({ status: "concluida", fase: "concluido", encontrados, processados, descartados });
  } catch (e) {
    log(`Erro: ${(e as Error).message}`, "erro");
    await progresso({ status: "erro", fase: "erro", erro: (e as Error).message });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  const chave = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!chave) return json({ erro: "Configure o segredo GOOGLE_PLACES_API_KEY no Supabase." }, 500);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    auth: { persistSession: false },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ erro: "Não autenticado" }, 401);

  const { busca_id } = await req.json().catch(() => ({}));
  if (!busca_id) return json({ erro: "busca_id obrigatório" }, 400);

  const { data: busca, error } = await sb.from("prospecta_buscas").select("*").eq("id", busca_id).single();
  if (error || !busca) return json({ erro: "Busca não encontrada" }, 404);
  if (busca.fonte !== "places") return json({ erro: "Esta busca não é da fonte Places API" }, 400);
  if (busca.status !== "pendente") return json({ erro: "Busca já iniciada" }, 409);

  await sb.from("prospecta_buscas").update({ status: "executando", fase: "iniciando", iniciado_em: new Date().toISOString(), robo: "places-api" }).eq("id", busca_id);

  // continua em segundo plano após responder
  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  EdgeRuntime.waitUntil(executar(sb, busca, chave));
  return json({ ok: true, busca_id }, 202);
});
