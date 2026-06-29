import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const indexPage = await readFile(new URL("../index.html", import.meta.url), "utf8");
const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const salesPage = await readFile(new URL("../planos.html", import.meta.url), "utf8");
const salesJs = await readFile(new URL("../sales.js", import.meta.url), "utf8");

test("browser app only keeps non-sensitive session metadata in localStorage", () => {
  assert.match(app, /clinicou_session_v1/);
  assert.doesNotMatch(app, /localStorage\.setItem\(["']clinicou_state_v[23]/);
  assert.match(app, /LEGACY_STORAGE_KEYS\.forEach\(\(key\) => localStorage\.removeItem\(key\)\)/);
});

test("schema includes the first SaaS platform tables", () => {
  for (const table of [
    "billing_plans",
    "clinic_subscriptions",
    "onboarding_tasks",
    "integration_connections",
    "automation_rules",
    "document_templates",
    "analytics_events"
  ]) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("schema avoids deprecated auth.role policies", () => {
  assert.doesNotMatch(schema, /auth\.role\(\)/);
});

test("server-only secrets are documented outside browser code", () => {
  for (const secret of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "WHATSAPP_ACCESS_TOKEN"
  ]) {
    assert.match(envExample, new RegExp(secret));
    assert.doesNotMatch(app, new RegExp(secret));
  }
});

test("edge functions require server-side secrets before integration work", async () => {
  const functions = [
    "../supabase/functions/billing-webhook/index.ts",
    "../supabase/functions/whatsapp-dispatch/index.ts",
    "../supabase/functions/document-render/index.ts",
    "../supabase/functions/analytics-ingest/index.ts"
  ];

  for (const path of functions) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requireEnv\(/);
    assert.match(source, /Deno\.serve/);
  }
});

test("sales page offers trial signup with Supabase email confirmation metadata", () => {
  assert.match(salesPage, /30 dias/);
  assert.match(salesPage, /R\$ 99/);
  assert.match(salesPage, /R\$ 199/);
  assert.match(salesPage, /R\$ 399/);
  assert.match(salesJs, /auth\.signUp/);
  assert.match(salesJs, /emailRedirectTo/);
  assert.match(salesJs, /authRedirectUrl/);
  assert.match(salesJs, /selected_plan/);
  assert.match(salesJs, /trial_days: 30/);
  assert.match(salesJs, /SMTP proprio/);
});

test("app login stays focused on existing accounts", () => {
  assert.match(indexPage, /id="authForm"/);
  assert.doesNotMatch(indexPage, /data-auth-mode/);
  assert.doesNotMatch(indexPage, /id="signupFields"/);
  assert.doesNotMatch(indexPage, /id="signupButton"/);
  assert.match(indexPage, /id="subscriptionStatusLabel"/);
});

test("trial ending popup is scheduled every 20 minutes on the last day", () => {
  assert.match(app, /TRIAL_WARNING_INTERVAL_MS = 20 \* 60 \* 1000/);
  assert.match(app, /trialEndsAt/);
  assert.match(app, /Trial terminando/);
  assert.match(schema, /now\(\) \+ interval '30 days'/);
  assert.match(schema, /raw_user_meta_data->>'selected_plan'/);
  assert.match(app, /currentSignupMetadata\.clinic_name/);
});

test("logout clears Supabase browser auth storage before relogin", () => {
  assert.match(app, /signOut\(\{ scope: "local" \}\)/);
  assert.match(app, /resetLocalAuthSession/);
  assert.match(app, /clearSupabaseAuthStorage\(localStorage\)/);
  assert.match(app, /sb-\$\{SUPABASE_PROJECT_REF\}-auth-token/);
});
