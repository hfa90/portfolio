// ============================================================
//  js/supabase.js  — Configuração central do Supabase
// ============================================================
const SUPABASE_URL      = 'https://wykmukfohehtpoezojwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5a211a2ZvaGVodHBvZXpvandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTc0NjcsImV4cCI6MjA5NTczMzQ2N30.mlfxsXSirX-0MXOreyShuS2kn5JDh_nMEp1onsBL9-0';
const EDGE_BASE         = `${SUPABASE_URL}/functions/v1`;

// ── Cliente — usa _supabase para não conflitar com window.supabase ──
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Alias para páginas que ainda usam "supabase" diretamente
// (login.html, painel.html) sem redeclarar a variável
if (typeof supabase === 'undefined') {
  var supabase = _supabase;
}

async function getUser() {
  const { data: { user } } = await _supabase.auth.getUser();
  return user;
}

async function getToken() {
  const { data: { session } } = await _supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function requireAuth(redirectTo = 'login.html') {
  const user = await getUser();
  if (!user) { window.location.href = redirectTo; return null; }
  return user;
}

async function logout() {
  await _supabase.auth.signOut();
  localStorage.removeItem('venus_age_confirmed');
  window.location.href = 'login.html';
}

async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };
  const res  = await fetch(`${EDGE_BASE}${path}`, { ...options, headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
  return json;
}

function toast(msg, tipo = 'info') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;max-width:320px;
    background:${tipo==='erro'?'#c0392b':tipo==='ok'?'#27ae60':'#2c2c3a'};
    color:#fff;padding:12px 20px;border-radius:8px;font-size:.9rem;
    box-shadow:0 4px 20px rgba(0,0,0,.4);`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
