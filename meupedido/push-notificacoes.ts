/**
 * Edge Function: push-notificacoes
 *
 * Dispara Web Push para colaboradores em 3 cenários:
 *   tipo "lembrete_limite"  → legado; nao usa mais horario-limite
 *   tipo "fiado_fechado"    → chamado pelo admin ao marcar pedidos como pagos
 *   tipo "cardapio_novo"    → chamado ao publicar cardápio do dia
 *
 * Deploy:
 *   supabase functions deploy push-notificacoes --no-verify-jwt
 *
 * Variáveis de ambiente (Supabase → Settings → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY   = BAuF3u4tWK84I2dHFN0fkKnZDBol3xK7WbGQrE7GntWxKNznJ10ZJ6VqCprvdutUqMYmNFrn6lgIW69sjg9aQTY
 *   VAPID_PRIVATE_KEY  = cxAs7RZ4frPRL0glpHi8YFrv3d5cgMU6h-w94teY17Y
 *   VAPID_SUBJECT      = mailto:haydenfernandes.dev@gmail.com
 *   SUPABASE_URL       = (auto-injetado pelo Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY = (auto-injetado pelo Supabase)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  colaborador_id: string;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

type TipoNotificacao = "lembrete_limite" | "fiado_fechado" | "cardapio_novo" | "teste";

function hojeSaoPauloISO(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

interface RequestBody {
  tipo: TipoNotificacao;
  colaborador_id?: string; // se omitido, envia para todos
  minutos_antes?: number;  // legado
}

// ─── VAPID helpers ───────────────────────────────────────────────────────────

function base64UrlToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidKeys(publicKeyB64: string, privateKeyB64: string) {
  const pubRaw = base64UrlToUint8Array(publicKeyB64);
  const privRaw = base64UrlToUint8Array(privateKeyB64);

  // Converte a chave pública uncompressed (65 bytes) para formato JWK
  const x = uint8ArrayToBase64Url(pubRaw.slice(1, 33));
  const y = uint8ArrayToBase64Url(pubRaw.slice(33, 65));
  const d = uint8ArrayToBase64Url(privRaw);

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  return { privateKey, x, y };
}

async function gerarJwtVapid(
  audience: string,
  subject: string,
  publicKeyB64: string,
  privateKeyB64: string
): Promise<string> {
  const { privateKey, x, y } = await importVapidKeys(publicKeyB64, privateKeyB64);

  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 43200, sub: subject };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsigned = `${encode(header)}.${encode(payload)}`;
  const data = new TextEncoder().encode(unsigned);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, data);
  const sigB64 = uint8ArrayToBase64Url(new Uint8Array(sig));

  return `${unsigned}.${sigB64}`;
}

// ─── Enviar um push para uma subscrição ──────────────────────────────────────

async function enviarPush(
  sub: PushSubscription,
  payload: PushPayload,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string
): Promise<{ ok: boolean; status?: number; endpoint: string }> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await gerarJwtVapid(audience, vapidSubject, vapidPublic, vapidPrivate);
  const authHeader = `vapid t=${jwt},k=${vapidPublic}`;

  // Cifra o payload com ECDH + AES-GCM (Web Push Encryption RFC 8291)
  const body = await cifrarPayload(sub, JSON.stringify(payload));

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
    },
    body,
  });

  return { ok: res.ok, status: res.status, endpoint: sub.endpoint };
}

// ─── Web Push Encryption (RFC 8291 / aes128gcm) ──────────────────────────────

async function cifrarPayload(sub: PushSubscription, plaintext: string): Promise<Uint8Array> {
  // Gera par de chaves efêmero
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Chave pública do cliente (p256dh)
  const clientPubRaw = base64UrlToUint8Array(sub.p256dh);
  const clientPubKey = await crypto.subtle.importKey(
    "raw", clientPubRaw, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPubKey },
    serverKeyPair.privateKey,
    256
  );

  // auth secret do cliente
  const authSecret = base64UrlToUint8Array(sub.auth);

  // Chave pública do servidor efêmero (exportada em raw)
  const serverPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  // HKDF key material
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const ikm = await hkdf(
    new Uint8Array(sharedBits),
    authSecret,
    concat(str2buf("Content-Encoding: auth\0"), new Uint8Array([0x01])),
    32
  );

  const keyInfo = buildInfo("aesgcm128", clientPubRaw, serverPubRaw);
  const nonceInfo = buildInfo("nonce", clientPubRaw, serverPubRaw);

  const contentKey = await hkdf(ikm, salt, keyInfo, 16);
  const nonce = await hkdf(ikm, salt, nonceInfo, 12);

  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);

  const data = new TextEncoder().encode(plaintext);
  const padded = new Uint8Array(data.length + 2);
  padded[0] = 0; padded[1] = 0; // 2-byte padding length = 0
  padded.set(data, 2);

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded)
  );

  // Monta o envelope aes128gcm (RFC 8291)
  const serverKeyLen = serverPubRaw.length; // 65
  const header = new Uint8Array(21 + serverKeyLen);
  header.set(salt, 0);                                // salt (16 bytes)
  header[16] = 0; header[17] = 0; header[18] = 0x10; header[19] = 0x00; // record size = 4096
  header[20] = serverKeyLen;                          // key length
  header.set(serverPubRaw, 21);

  return concat(header, encrypted);
}

function buildInfo(type: string, clientKey: Uint8Array, serverKey: Uint8Array): Uint8Array {
  const t = str2buf(`Content-Encoding: ${type}\0P-256\0`);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint16(2, clientKey.length);
  const len2 = new Uint8Array(4);
  new DataView(len2.buffer).setUint16(2, serverKey.length);
  return concat(t, len.slice(2), clientKey, len2.slice(2), serverKey);
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", salt, "HKDF", false, ["deriveBits"]);
  // HKDF-Extract: prk
  const prkBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new Uint8Array() },
    await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]),
    256
  );
  // HKDF-Expand
  const prk = await crypto.subtle.importKey("raw", prkBits, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info },
    prk,
    len * 8
  );
  return new Uint8Array(bits);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function str2buf(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ─── Busca subscrições do Supabase ───────────────────────────────────────────

async function buscarSubscricoes(
  supabase: ReturnType<typeof createClient>,
  colaboradorId?: string
): Promise<PushSubscription[]> {
  let query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth, colaborador_id");
  if (colaboradorId) query = query.eq("colaborador_id", colaboradorId);
  const { data, error } = await query;
  if (error) throw new Error("Erro ao buscar subscrições: " + error.message);
  return (data || []) as PushSubscription[];
}

// ─── Busca cardápio e monta payloads por tipo ─────────────────────────────────

async function montarPayload(
  supabase: ReturnType<typeof createClient>,
  tipo: TipoNotificacao,
  minutos_antes = 30
): Promise<PushPayload> {
  if (tipo === "lembrete_limite") {
    return {
      title: "Cardapio disponivel",
      body: "Os pedidos ficam disponiveis enquanto o administrador mantiver Pedidos abertos.",
      icon: "/icon-192.png",
      url: "/marmita.html"
    };
  }

  if (tipo === "fiado_fechado") {
    return {
      title: "💸 Fiado atualizado",
      body: "Seu saldo de fiado foi fechado pelo administrador.",
      icon: "/icon-192.png",
      url: "/marmita.html#meusPedidos"
    };
  }

  if (tipo === "cardapio_novo") {
    return {
      title: "🍱 Cardápio disponível!",
      body: "O cardápio de hoje já está no ar. Faça seu pedido!",
      icon: "/icon-192.png",
      url: "/marmita.html"
    };
  }

  // teste
  return {
    title: "🔔 Teste de push",
    body: "As notificações estão funcionando!",
    icon: "/icon-192.png"
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      }
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json() as RequestBody;
    const { tipo, colaborador_id, minutos_antes = 30 } = body;

    if (!tipo) return new Response(JSON.stringify({ error: "tipo é obrigatório" }), { status: 400 });

    const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@marmita.app";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [subscricoes, payload] = await Promise.all([
      buscarSubscricoes(supabase, colaborador_id),
      montarPayload(supabase, tipo, minutos_antes)
    ]);

    if (subscricoes.length === 0) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, msg: "Nenhuma subscrição encontrada" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Envia em paralelo (máx 20 simultâneos)
    const resultados: { ok: boolean; status?: number; endpoint: string }[] = [];
    const chunk = 20;
    for (let i = 0; i < subscricoes.length; i += chunk) {
      const batch = subscricoes.slice(i, i + chunk);
      const res = await Promise.allSettled(
        batch.map(sub => enviarPush(sub, payload, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT))
      );
      res.forEach(r => {
        if (r.status === "fulfilled") resultados.push(r.value);
        else resultados.push({ ok: false, endpoint: "unknown" });
      });
    }

    // Remove subscrições expiradas (status 404 ou 410)
    const expiradas = resultados.filter(r => r.status === 404 || r.status === 410).map(r => r.endpoint);
    if (expiradas.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expiradas);
    }

    const ok = resultados.filter(r => r.ok).length;
    const falhos = resultados.length - ok;

    return new Response(JSON.stringify({
      ok: true,
      tipo,
      enviados: ok,
      falhos,
      expiradas_removidas: expiradas.length
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
