/**
 * Verification-only: the REAL Supabase migration chain applied in order to an in-process Postgres (PGlite).
 * Never touches Supabase. Supabase platform objects (roles, auth, storage) are stubbed minimally.
 *
 * Deviations, both deliberate and labelled:
 *   - `create extension` statements are skipped (gen_random_uuid is built into Postgres 13+);
 *   - 20260917120000_paychex_authoritative_coa is guarded against one historical live inventory, so its END STATE
 *     (the same 60 authoritative accounts, taken from its own VALUES block) is reproduced instead of executing it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

export const PAYCHEX_ORG = "835a2e6d-a91b-413f-946a-8ed73a6027cc";

export async function financeDatabase(options: { upTo?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role supabase_admin; create role authenticator;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create table auth.sessions (id uuid primary key, user_id uuid, not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function auth.role() returns text language sql stable as $$ select 'service_role' $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now(), owner uuid);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  `);
  const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (options.upTo && f > options.upTo) break;
    const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
    try {
      if (f.startsWith("20260917120000_paychex_authoritative_coa")) {
        const block = sql.slice(sql.indexOf("create temporary table"), sql.indexOf(";", sql.indexOf("insert into paychex_authoritative_coa")) + 1);
        await db.exec(`begin; ${block}
          delete from public.finance_accounts where organisation_id = '${PAYCHEX_ORG}';
          insert into public.finance_accounts (organisation_id, code, name, account_type, classification, status)
            select '${PAYCHEX_ORG}', code, name, account_type, classification, 'active' from paychex_authoritative_coa;
          commit;`);
      } else {
        await db.exec(sql.replace(/create extension[^;]*;/gi, ""));
      }
      if (f.startsWith("20260824110731")) {
        await db.exec(`insert into public.organisations (id, name, slug) values ('${PAYCHEX_ORG}', 'PayChex (synthetic)', 'paychex')`);
      }
    } catch (error) {
      throw new Error(`migration ${f} failed: ${(error as Error).message}`);
    }
  }
  return db;
}
