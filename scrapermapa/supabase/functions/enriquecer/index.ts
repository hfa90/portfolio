// =====================================================================
//  Prospecta · Edge Function "enriquecer"
//  Completa um lead com dados públicos, sem IA:
//   • site: e-mail, Instagram, Facebook, LinkedIn, link de WhatsApp, CNPJ no rodapé
//   • diagnóstico do site: online/offline, HTTPS, plataforma, rastreamento
//   • Receita Federal (BrasilAPI): razão social, porte, abertura, CNAE, situação, sócios
//   • ViaCEP: corrige rua/bairro/cidade a partir do CEP
//
//  Chamada (POST, com o JWT do usuário):  { "lead_id": 123, "cnpj": "opcional" }
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const IGNORAR_EMAIL = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", "example.com", "exemplo.com", "sentry",
  "wixpress", "domain.com", "seudominio", "email.com", "@2x", "godaddy", "yourdomain", "usuario@", "nome@", "seuemail"];

const PLATAFORMAS: [RegExp, string][] = [
  [/wp-content|wp-includes/i, "WordPress"], [/wixstatic|wix\.com/i, "Wix"], [/cdn\.shopify|shopify/i, "Shopify"],
  [/nuvemshop|lojanuvem/i, "Nuvemshop"], [/vtex/i, "VTEX"], [/tray\.com\.br|traycdn/i, "Tray"],
  [/squarespace/i, "Squarespace"], [/webflow/i, "Webflow"], [/lojaintegrada/i, "Loja Integrada"],
  [/joomla/i, "Joomla"], [/__next|_next\/static/i, "Next.js"], [/elementor/i, "WordPress (Elementor)"],
  [/site123|webnode|weebly/i, "Construtor de sites"],
];
const RASTREIO: [RegExp, string][] = [
  [/googletagmanager\.com\/gtm|GTM-[A-Z0-9]+/i, "Google Tag Manager"],
  [/gtag\(|google-analytics\.com|G-[A-Z0-9]{6,}/i, "Google Analytics"],
  [/fbq\(|connect\.facebook\.net/i, "Meta Pixel"],
  [/hotjar/i, "Hotjar"], [/clarity\.ms/i, "Microsoft Clarity"], [/tiktok\.com\/i18n|ttq\./i, "TikTok Pixel"],
];

function cnpjValido(c: string) {
  const d = c.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = pesos.reduce((a, p, i) => a + Number(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = calc(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

async function baixar(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(9000) });
  const tipo = r.headers.get("content-type") || "";
  const texto = tipo.includes("text/html") || !tipo ? (await r.text()).slice(0, 700_000) : "";
  return { ok: r.ok, status: r.status, url: r.url, texto };
}

function extrair(html: string, base: string) {
  const out = { emails: new Set<string>(), instagram: "", facebook: "", linkedin: "", whatsapp_link: "", cnpjs: new Set<string>() };
  const t = html.replace(/&#64;|&commat;/g, "@").replace(/&amp;/g, "&");
  for (const m of t.matchAll(/mailto:([^"'?>\s]+)/gi)) out.emails.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of t.matchAll(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g)) out.emails.add(m[0].toLowerCase());
  for (const m of t.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)) if (cnpjValido(m[0])) out.cnpjs.add(m[0].replace(/\D/g, ""));
  for (const m of t.matchAll(/href=["']([^"']+)["']/gi)) {
    let h: string;
    try { h = new URL(m[1], base).href; } catch { continue; }
    const host = new URL(h).hostname.toLowerCase();
    if (!out.instagram && host.includes("instagram.com") && !/\/(p|reel|explore)\//.test(h)) out.instagram = h.split("?")[0].replace(/\/$/, "");
    else if (!out.facebook && (host.includes("facebook.com") || host === "fb.com") && !h.includes("sharer")) out.facebook = h.split("?")[0].replace(/\/$/, "");
    else if (!out.linkedin && host.includes("linkedin.com") && !h.includes("share")) out.linkedin = h.split("?")[0].replace(/\/$/, "");
    else if (!out.whatsapp_link && (host.includes("wa.me") || host.includes("api.whatsapp.com"))) out.whatsapp_link = h;
  }
  const emails = [...out.emails].filter((e) => e.length > 5 && e.length < 80 && !IGNORAR_EMAIL.some((x) => e.includes(x)));
  return { ...out, emails, cnpjs: [...out.cnpjs] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    auth: { persistSession: false },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ erro: "Não autenticado" }, 401);

  const { lead_id, cnpj: cnpjInformado } = await req.json().catch(() => ({}));
  const { data: lead, error } = await sb.from("prospecta_leads").select("*").eq("id", lead_id).single();
  if (error || !lead) return json({ erro: "Lead não encontrado" }, 404);

  const upd: Record<string, unknown> = {};
  const achados: string[] = [];
  const set = (campo: string, valor: unknown, rotulo?: string) => {
    if (valor === undefined || valor === null || valor === "") return;
    if (lead[campo] === valor) return;
    upd[campo] = valor;
    if (rotulo) achados.push(rotulo);
  };

  // ---------- 1) site
  let cnpjs: string[] = [];
  if (lead.site) {
    let site = /^https?:/i.test(lead.site) ? lead.site : "http://" + lead.site;
    const host = new URL(site).hostname;
    if (host.includes("instagram.com")) { set("instagram", site.split("?")[0], "Instagram"); site = ""; }
    else if (host.includes("facebook.com")) { set("facebook", site.split("?")[0], "Facebook"); site = ""; }

    if (site) {
      try {
        const home = await baixar(site);
        set("site_status", home.ok ? "online" : `erro ${home.status}`);
        set("site_https", home.url.startsWith("https://"));
        set("site_plataforma", PLATAFORMAS.find(([re]) => re.test(home.texto))?.[1] || "Não identificada");
        set("site_rastreamento", RASTREIO.filter(([re]) => re.test(home.texto)).map(([, n]) => n).join(", ") || "Nenhum");
        let dados = extrair(home.texto, home.url);
        if (!dados.emails.length || !dados.cnpjs.length) {
          for (const p of ["/contato", "/contact", "/fale-conosco", "/sobre"]) {
            try {
              const pg = await baixar(new URL(p, home.url).href);
              if (!pg.ok) continue;
              const d2 = extrair(pg.texto, pg.url);
              dados = {
                ...dados,
                emails: [...new Set([...dados.emails, ...d2.emails])],
                cnpjs: [...new Set([...dados.cnpjs, ...d2.cnpjs])],
                instagram: dados.instagram || d2.instagram, facebook: dados.facebook || d2.facebook,
                linkedin: dados.linkedin || d2.linkedin, whatsapp_link: dados.whatsapp_link || d2.whatsapp_link,
              };
              if (dados.emails.length && dados.cnpjs.length) break;
            } catch { /* página não existe */ }
          }
        }
        const raiz = host.replace(/^www\./, "").split(".")[0];
        dados.emails.sort((a, b) => Number(!a.includes(raiz)) - Number(!b.includes(raiz)) || a.length - b.length);
        if (!lead.email) set("email", dados.emails[0], "e-mail");
        if (!lead.instagram) set("instagram", dados.instagram, "Instagram");
        if (!lead.facebook) set("facebook", dados.facebook, "Facebook");
        if (!lead.linkedin) set("linkedin", dados.linkedin, "LinkedIn");
        if (!lead.whatsapp_link) set("whatsapp_link", dados.whatsapp_link, "WhatsApp do site");
        cnpjs = dados.cnpjs;
      } catch (e) {
        set("site_status", "offline");
        achados.push("site fora do ar");
        console.log("site", (e as Error).message);
      }
    }
  }

  // ---------- 2) CNPJ → BrasilAPI
  const cnpj = (cnpjInformado || lead.cnpj || cnpjs[0] || "").replace(/\D/g, "");
  if (cnpj && cnpjValido(cnpj)) {
    set("cnpj", cnpj, lead.cnpj ? undefined : "CNPJ");
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const c = await r.json();
        set("razao_social", c.razao_social, "razão social");
        set("nome_fantasia", c.nome_fantasia);
        set("porte", c.porte || c.descricao_porte);
        set("abertura", c.data_inicio_atividade);
        set("cnae", [c.cnae_fiscal, c.cnae_fiscal_descricao].filter(Boolean).join(" - "));
        set("situacao_cadastral", c.descricao_situacao_cadastral);
        set("capital_social", c.capital_social);
        // deno-lint-ignore no-explicit-any
        if (Array.isArray(c.qsa)) set("socios", c.qsa.map((s: any) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })), c.qsa.length ? "sócios" : undefined);
        if (!lead.email && !upd.email && c.email) set("email", String(c.email).toLowerCase(), "e-mail (Receita)");
        if (!lead.cep && c.cep) set("cep", String(c.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2"));
      } else if (cnpjInformado) {
        return json({ erro: `CNPJ não encontrado na Receita (status ${r.status})` }, 404);
      }
    } catch (e) { console.log("brasilapi", (e as Error).message); }
  } else if (cnpjInformado) {
    return json({ erro: "CNPJ inválido" }, 400);
  }

  // ---------- 3) CEP → ViaCEP
  const cep = String(upd.cep || lead.cep || "").replace(/\D/g, "");
  if (cep.length === 8 && (!lead.bairro || !lead.rua || !lead.cidade)) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
      const v = await r.json();
      if (!v.erro) {
        if (!lead.rua) set("rua", v.logradouro, "rua (CEP)");
        if (!lead.bairro) set("bairro", v.bairro, "bairro (CEP)");
        if (!lead.cidade) set("cidade", v.localidade);
        if (!lead.uf) set("uf", v.uf);
      }
    } catch { /* ViaCEP indisponível */ }
  }

  upd.enriquecido_em = new Date().toISOString();
  const { data: novo, error: e2 } = await sb.from("prospecta_leads").update(upd).eq("id", lead_id).select().single();
  if (e2) return json({ erro: e2.message }, 500);
  await sb.from("prospecta_atividades").insert({
    lead_id, tipo: "sistema",
    descricao: achados.length ? `Enriquecido: ${achados.join(", ")}` : "Enriquecimento executado (nenhum dado novo)",
  });
  return json({ encontrados: achados, lead: novo });
});
