// =========================================================================
// CONFIGURAÇÃO — cole aqui os dados do seu projeto Supabase
// Encontre em: app.supabase.com > seu projeto > Project Settings > API
// =========================================================================
export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';

// URL base onde o app do cliente (cliente.html) está publicado.
// Usada para montar o link/QR code de cada mesa e de cada comanda.
export const APP_BASE_URL = window.location.origin + window.location.pathname.replace(/[^/]+$/, '');
