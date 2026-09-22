/**
 * Platform Finance Historical Commercial Facts — behavioural verification in a REAL Postgres (PGlite, in-process).
 * Applies 20260922150000 against a scratch database stubbed to match the relevant slice of the real schema;
 * never touches Supabase.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-historical-facts-migration.mts
 *
 * Linked-DB shape is separately proven read-only against the real schema by
 * scripts/verify-platform-finance-historical-facts-live-read.mts.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync(
  "supabase/migrations/20260922150000_platform_finance_historical_commercial_facts.sql",
  "utf8"
);

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function rejects(db: PGlite, sql: string): Promise<string | null> {
  try {
    await db.exec(`savepoint s; ${sql}`);
    await db.exec("release savepoint s");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint s");
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);
  const db = new PGlite();

  await db.exec(`
    create role authenticated; create role service_role;
    create table public.organisations (id uuid primary key default gen_random_uuid());
    create table public.profiles (id uuid primary key default gen_random_uuid());
    create table public.fm_work (id uuid primary key default gen_random_uuid(), organisation_id uuid not null, constraint fm_work_org_id_unique unique (organisation_id, id));
    create table public.fm_work_instructions (id uuid primary key default gen_random_uuid(), organisation_id uuid not null, constraint fm_work_instructions_org_id_unique unique (organisation_id, id));
    create table public.finance_capability_grants (organisation_id uuid, profile_id uuid, capability text);
    create table public.fm_migration_provenance (id serial, target_table text not null, classification text not null default 'BOOTSTRAP');
    alter table public.fm_migration_provenance add constraint fm_migration_provenance_target_check
      check (target_table in ('fm_requests','fm_incidents','fm_assets','fm_work','fm_work_instructions','fm_generator_logs','fm_diesel_usage','fm_consumables_items','fm_consumables_register_entries','fm_buildings','fm_floors','fm_rooms','fm_departments','fm_cost_records'));

    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
    create function public.fm_prevent_record_origin_change() returns trigger language plpgsql as $$ begin if old.record_origin is distinct from new.record_origin then raise exception 'record_origin is immutable (%.%)', tg_table_name, old.id using errcode='42501'; end if; return new; end; $$;
    -- Permissive RLS-helper stubs (PGlite has no auth.uid()/session role context): DDL/inserts must succeed here
    -- so we can prove the TABLE's own constraint/trigger behaviour. RLS predicate wiring itself is asserted
    -- below via information_schema, not by simulating a denied session.
    create function public.is_org_member(p_organisation_id uuid) returns boolean language sql as $$ select true; $$;
    create function public.has_finance_capability(p_organisation_id uuid, p_capability text) returns boolean language sql as $$ select true; $$;
  `);
  await db.exec(MIGRATION);
  await db.exec("begin");

  const O = "11111111-1111-4111-8111-111111111111";
  const WORK = "22222222-2222-4222-8222-222222222222";
  const WI = "33333333-3333-4333-8333-333333333333";
  const OTHER_O = "44444444-4444-4444-8444-444444444444";
  await db.exec(`
    insert into organisations (id) values ('${O}'), ('${OTHER_O}');
    insert into fm_work (id, organisation_id) values ('${WORK}', '${O}');
    insert into fm_work_instructions (id, organisation_id) values ('${WI}', '${O}');
  `);
  const T = "public.platform_finance_historical_commercial_facts";
  const ins = (cols: string, vals: string) => `insert into ${T} (organisation_id, ${cols}) values ('${O}', ${vals});`;

  // 1. minimal + full valid insert
  {
    assert(
      (await rejects(db, ins("code, description", "'HIST-2026-000001', 'Test historical fact'"))) === null,
      "minimal insert (org, code, description only) succeeds"
    );
    assert(
      (await rejects(
        db,
        ins(
          "code, description, submitted_amount, authorised_amount, amount_received, source_payment_status, payment_datetime, payment_datetime_source_text, commercial_reference, source_counterparty_text, fm_work_id, fm_work_instruction_id",
          `'HIST-2026-000002', 'Full fact', 68017443, 68017443, 68017443, 'Paid', '2025-05-23T14:57:00Z', '14:57 May 23, 2025', 'TRV177', 'Trivnet', '${WORK}', '${WI}'`
        )
      )) === null,
      "full insert with every optional fact field + FM Work/WI linkage succeeds"
    );
    pass("valid inserts: minimal fact and fully-evidenced fact with FM linkage both succeed");
  }

  // 2. record_origin: fixed, closed, immutable
  {
    assert(await rejects(db, ins("code, description, record_origin", "'HIST-BAD-1', 'x', 'operational'")), "record_origin cannot be anything but migrated_historical on insert");
    assert(await rejects(db, `update ${T} set record_origin = 'operational' where code = 'HIST-2026-000001';`), "record_origin is immutable on update");
    pass("record_origin is fixed to migrated_historical at insert and immutable thereafter");
  }

  // 3. amounts: positive-or-null only, never zero, 2dp
  {
    for (const col of ["submitted_amount", "authorised_amount", "amount_received"]) {
      assert(await rejects(db, ins(`code, description, ${col}`, `'HIST-NEG-${col}', 'x', -5`)), `${col} rejects a negative value`);
      assert(await rejects(db, ins(`code, description, ${col}`, `'HIST-ZERO-${col}', 'x', 0`)), `${col} rejects zero (zero is not a substitute for unknown — omit the field instead)`);
    }
    assert((await rejects(db, ins("code, description", "'HIST-NULL-1', 'x'"))) === null, "omitting every optional amount is valid (stays genuinely unknown)");
    pass("independently-evidenced amounts: positive-only when present, zero is rejected everywhere, absent stays absent");
  }

  // 4. code uniqueness (case-insensitive) per organisation
  {
    assert(await rejects(db, ins("code, description", "'hist-2026-000001', 'dup'")), "duplicate code is rejected case-insensitively within the same organisation");
    assert(
      (await rejects(db, `insert into ${T} (organisation_id, code, description) values ('${OTHER_O}', 'HIST-2026-000001', 'same code, different org');`)) === null,
      "the same code is allowed in a different organisation (uniqueness is per-organisation)"
    );
    pass("code uniqueness is case-insensitive and organisation-scoped");
  }

  // 5. FM Work / Work Instruction linkage: tenant-scoped composite FK, never a bare id
  {
    assert(await rejects(db, `insert into ${T} (organisation_id, code, description, fm_work_id) values ('${OTHER_O}', 'HIST-XORG', 'x', '${WORK}');`), "linking to a Work belonging to a DIFFERENT organisation is rejected (composite FK, not a bare id)");
    assert(await rejects(db, `insert into ${T} (organisation_id, code, description, fm_work_id) values ('${O}', 'HIST-NOWORK', 'x', '55555555-5555-4555-8555-555555555555');`), "linking to a non-existent Work is rejected");
    assert(await rejects(db, `insert into ${T} (organisation_id, code, description, fm_work_instruction_id) values ('${O}', 'HIST-NOWI', 'x', '55555555-5555-4555-8555-555555555555');`), "linking to a non-existent Work Instruction is rejected");
    pass("FM Work/WI linkage is a real tenant-scoped composite foreign key — cross-tenant and dangling links are both rejected");
  }

  // 6. no update path exists for facts other than record_origin's own guard: the foundation has no correction
  //    mechanism, so RLS grants only SELECT/INSERT to authenticated (asserted structurally, since PGlite ignores
  //    role-scoped RLS without a real session context).
  {
    const grants = (
      await db.query<{ p: string }>(
        `select privilege_type p from information_schema.role_table_grants where table_name='platform_finance_historical_commercial_facts' and grantee='authenticated' order by 1`
      )
    ).rows
      .map((r) => r.p)
      .join(",");
    assert(grants === "INSERT,SELECT", `authenticated has exactly INSERT,SELECT on the table (got: ${grants || "<none>"}) — no UPDATE/DELETE grant, matching the no-correction-mechanism design`);
    const policies = (
      await db.query<{ n: string }>(
        `select polname n from pg_policy where polrelid = '${T}'::regclass order by 1`
      )
    ).rows.map((r) => r.n);
    assert(policies.length === 2 && policies.includes("pfhcf_select") && policies.includes("pfhcf_insert"), `exactly the select+insert policies exist, no update/delete policy (got: ${policies.join(",")})`);
    pass("no update/delete policy or grant exists: this foundation ships with no in-app correction mechanism, by design");
  }

  // 7. provenance: additive target widening, existing targets untouched, unknown targets still rejected
  {
    assert((await rejects(db, `insert into fm_migration_provenance (target_table) values ('platform_finance_historical_commercial_facts');`)) === null, "provenance accepts the new target_table value");
    assert((await rejects(db, `insert into fm_migration_provenance (target_table) values ('fm_work');`)) === null, "an existing target_table value (fm_work) still works — the widening is additive only");
    assert(await rejects(db, `insert into fm_migration_provenance (target_table) values ('fm_vendors');`), "a target_table value that was never allowed is still rejected");
    pass("fm_migration_provenance target_check is additively widened; no existing target is affected; unknown targets remain rejected");
  }

  // 8. non-negotiables: no delete grant anywhere, description/code non-empty
  {
    const del = (
      await db.query<{ n: string }>(
        `select count(*)::text n from information_schema.role_table_grants where table_name='platform_finance_historical_commercial_facts' and privilege_type='DELETE' and grantee='authenticated'`
      )
    ).rows[0]!.n;
    assert(del === "0", "authenticated holds no DELETE on the table — historical evidence is never deleted by the application (service_role's blanket grant is unmediated DB access, not an app path)");
    assert(await rejects(db, ins("code, description", "'   ', 'x'")), "a blank/whitespace-only code is rejected");
    assert(await rejects(db, ins("code, description", "'HIST-EMPTYDESC', '   '")), "a blank/whitespace-only description is rejected");
    pass("no DELETE grant exists; code/description non-empty constraints hold");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
