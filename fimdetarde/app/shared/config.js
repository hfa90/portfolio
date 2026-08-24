// =========================================================
// CONFIGURAÇÃO DO SUPABASE
// =========================================================
// 1. No painel do Supabase, vá em: Project Settings > API
// 2. Copie o "Project URL" e cole em SUPABASE_URL abaixo
// 3. Copie a chave "anon public" e cole em SUPABASE_ANON_KEY
// (NUNCA use a chave "service_role" aqui — ela é secreta)
// =========================================================

const SUPABASE_URL = "https://ckfiknmdcoiihlifourc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrZmlrbm1kY29paWhsaWZvdXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMDQ3OTQsImV4cCI6MjEwMjU4MDc5NH0.C8hkyX6CZLzs-QluIHQivS6KkjaVIGrYIpfMXF7r47Y";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
