// ============================================================
//  js/supabase.js  — Configuração central do Supabase
//  ⚠️  SUBSTITUA as duas linhas abaixo pelas suas chaves reais
//  Dashboard → Settings → API
// ============================================================

const SUPABASE_URL = 'https://wykmukfohehtpoezojwg.supabase.co';   // ← altere aqui
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5a211a2ZvaGVodHBvZXpvandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTc0NjcsImV4cCI6MjA5NTczMzQ2N30.mlfxsXSirX-0MXOreyShuS2kn5JDh_nMEp1onsBL9-0';            // ← altere aqui
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

// ── Cliente Supabase (via CDN) ────────────────────────────────
// Carregado pelo script tag antes deste arquivo:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helpers de Auth ───────────────────────────────────────────

/** Retorna o usuário logado ou null */
async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Retorna o JWT do usuário logado */
async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** Redireciona para login se não estiver autenticado */
async function requireAuth(redirectTo = 'login.html') {
  const user = await getUser();
  if (!user) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

/** Faz logout e redireciona */
async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('venus_age_confirmed');
  window.location.href = 'login.html';
}

// ── Helper de fetch autenticado para Edge Functions ───────────
async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };
  const res = await fetch(`${EDGE_BASE}${path}`, { ...options, headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
  return json;
}

// ── Helper de toast simples ───────────────────────────────────
function toast(msg, tipo = 'info') {
  const el = document.createElement('div');
  el.className = `venus-toast venus-toast-${tipo}`;
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${tipo === 'erro' ? '#c0392b' : tipo === 'ok' ? '#27ae60' : '#2c2c3a'};
    color:#fff;padding:12px 20px;border-radius:8px;
    font-size:.9rem;box-shadow:0 4px 20px rgba(0,0,0,.4);
    animation:fadeInUp .3s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
