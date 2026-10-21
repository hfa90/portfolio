/* =========================================================
   CHAMADO FÁCIL · CD-AM — configuração
   (a anon key é pública por natureza; a proteção dos dados é
    feita pelas políticas RLS do banco — veja sql/01_schema.sql)
   ========================================================= */
window.CF_CONFIG = {
  SUPABASE_URL: 'https://uvculminojmtltdulpsa.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2Y3VsbWlub2ptdGx0ZHVscHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTA4NjIsImV4cCI6MjEwODEyNjg2Mn0.4aAqARAGLlby7iRNMNylnOAKbiKXDs2k19MqCpDuXH0',

  // login = matrícula -> e-mail interno usado pelo Supabase Auth
  EMAIL_DOMINIO: 'cdam.chamadofacil.app',

  // Links do ServiceNow (Centro RD)
  LINKS: {
    TEAMS: 'https://centrord.service-now.com/esc?id=sc_cat_item&sys_id=4d2110084788be10c346ab32036d4319',
    WMS:   'https://centrord.service-now.com/esc?id=sc_cat_item&sys_id=0c1028c71b9f4510929b87bfe54bcb7c',
  },

  // Turnos (horário de Manaus). Mantenha igual à função turno_atual() do SQL.
  TURNOS: [
    { id: 'T1', inicio: '06:00', fim: '14:20' },
    { id: 'T2', inicio: '14:20', fim: '22:40' },
    { id: 'T3', inicio: '22:40', fim: '06:00' },
  ],
  FUSO: 'America/Manaus',
  OFFSET: '-04:00',          // Manaus não tem horário de verão

  // Tolerância depois do fim do turno para considerar "não devolvido"
  TOLERANCIA_MIN: 30,

  // Reserva: sem turno conhecido, em uso há mais de X horas = "não devolvido"
  HORAS_ALERTA: 9,
};
