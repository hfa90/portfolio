# Environments

Clinicou should run with three Supabase projects:

- `dev`: local work, seed data, destructive tests allowed.
- `staging`: production-like validation before release.
- `prod`: real clinics and sensitive data.

## Required Variables

Use `.env.example` as the contract for every environment. Browser code can only receive:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Everything else must stay in CI secrets or Supabase Edge Function secrets.

## Release Flow

1. Create or update migrations locally.
2. Run `npm run verify`.
3. Run Supabase advisors against the target project.
4. Deploy to `staging`.
5. Smoke-test login, tenant selection, RLS-sensitive screens, billing webhook and integrations.
6. Promote the same commit to `prod`.

## CI Secrets

Configure these in GitHub Actions before enabling deploy jobs:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF_STAGING`
- `SUPABASE_PROJECT_REF_PROD`
- `SUPABASE_DB_PASSWORD_STAGING`
- `SUPABASE_DB_PASSWORD_PROD`
