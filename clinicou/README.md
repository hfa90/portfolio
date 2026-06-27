# Clinicou

SaaS web para clínicas com agenda inteligente, prontuário adaptável, controle financeiro, CRM e painel SaaS multi-tenant.

## Publicação

O app é estático e roda no GitHub Pages:

`https://hfa90.github.io/portfolio/clinicou/`

## Backend Supabase

Projeto configurado no frontend:

- URL: `https://yhftbfpkuchxfblhfvva.supabase.co`
- Public key: configurada em `app.js`

Para ativar o backend real, execute `supabase/schema.sql` no SQL Editor do Supabase. O schema inclui:

- tabelas multi-tenant por `clinic_id`;
- RLS em todas as tabelas expostas;
- RBAC por `clinic_memberships`;
- função `create_clinic` para onboarding;
- auditoria para prontuário, pacientes, agenda e financeiro;
- bucket privado `clinicou-documents` com isolamento por clínica.

Sem o schema aplicado, o app funciona como demo persistida em `localStorage`.
