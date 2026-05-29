// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// Substitua os valores abaixo pelas suas credenciais do projeto
// Painel Supabase → Settings → API
// ============================================================
const SUPABASE_URL = 'https://khlctidzamppvfraasmf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtobGN0aWR6YW1wcHZmcmFhc21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDgwMTcsImV4cCI6MjA5NTU4NDAxN30.3Km-k1XbpmLaCOvynGtKR7sSiNLkH9hdICjd6QhsRrA';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// AUTH HELPERS
// ============================================================
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}

export function requireAuth(expectedType = null) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) { window.location.href = '/index.html'; return; }
    if (expectedType) {
      supabase.from('users').select('user_type').eq('id', user.id).single()
        .then(({ data }) => {
          if (!data || data.user_type !== expectedType) {
            window.location.href = '/index.html';
          }
        });
    }
  });
}

// ============================================================
// ViaCEP HELPER
// ============================================================
export async function fetchCEP(cep) {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch { return null; }
}
