// ============================================================
// CONVIDA — Conexão com Supabase
// ============================================================

const SUPABASE_URL = "https://jsfnaxxhvmvkgefzctjy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZm5heHhodm12a2dlZnpjdGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMzg1ODAsImV4cCI6MjEwMzcxNDU4MH0.knn9NXcG3rJzdec8w8Z64XPpKLYLmqJk9BHkJgjxZ8w";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------
async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

// Redireciona para login.html se não houver usuário logado.
// Use no topo de páginas restritas ao anfitrião (dashboard, criar-convite, etc.)
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

// ------------------------------------------------------------
// Utilitários gerais
// ------------------------------------------------------------
function formatCurrencyBRL(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDatePtBR(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function slugify(text) {
  return text
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function randomSlugSuffix() {
  return Math.random().toString(36).slice(2, 7);
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function showToast(message, type = "success") {
  const el = document.createElement("div");
  el.className =
    "fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg shadow-lg text-sm font-medium z-[100] " +
    (type === "success" ? "bg-[#6F8F6B] text-white" : "bg-[#B14545] text-white");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
