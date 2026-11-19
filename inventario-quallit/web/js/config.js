// Configuração do Supabase (a chave "anon" é pública por design — a proteção é feita pelo RLS + login)
export const SUPABASE_URL = 'https://wrmlmtxkukjxkivtsuex.supabase.co';
// Endereço público onde a pasta "web" está publicada (VPS da Hostinger). Usado nos links enviados aos colaboradores.
// Deixe vazio para usar o endereço atual do painel.
export const URL_PUBLICA = 'https://haydenfernandes.tech/inventario/';
// Link curto do coletor: <URL_CURTA>#<código>. A página web/iq.html (o Nginx da VPS leva /iq até ela)
// leva para web/coletor.html#c=<código>. Curto para caber num código de barras na tela.
export const URL_CURTA = 'https://haydenfernandes.tech/iq';

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybWxtdHhrdWtqeGtpdnRzdWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MDA2NTMsImV4cCI6MjEwOTQ3NjY1M30.Eg_FluPEIzlXE8-8FZ8D5KbhMO8HtwNrLjuqZt4iibo';
