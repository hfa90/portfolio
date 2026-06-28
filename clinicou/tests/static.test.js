import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");

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
