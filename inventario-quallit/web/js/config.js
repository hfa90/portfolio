// Configuração do Supabase (a chave "anon" é pública por design — a proteção é feita pelo RLS + login)
export const SUPABASE_URL = 'https://wrmlmtxkukjxkivtsuex.supabase.co';
// Endereço público onde a pasta "web" está publicada (ex.: GitHub Pages). Usado nos links enviados aos colaboradores.
// Deixe vazio para usar o endereço atual do painel.
export const URL_PUBLICA = 'https://haydenfernandes.com.br/inventario-quallit/web/';
// Link curto do coletor: <URL_CURTA>#<código>. A página iq.html (gravada na raiz do site pelo publicar-site.ps1)
// leva para web/coletor.html#c=<código>. Curto para caber num código de barras na tela.
export const URL_CURTA = 'https://haydenfernandes.com.br/iq';

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybWxtdHhrdWtqeGtpdnRzdWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MDA2NTMsImV4cCI6MjEwOTQ3NjY1M30.Eg_FluPEIzlXE8-8FZ8D5KbhMO8HtwNrLjuqZt4iibo';
