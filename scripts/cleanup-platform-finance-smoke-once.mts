/**
 * ONE-SHOT development maintenance: remove exact Platform Finance smoke artifacts.
 *
 * Default: DRY RUN (preflight only, always ROLLBACK).
 * Destructive: PLATFORM_FINANCE_ALLOW_DEV_CLEANUP=1
 *
 * Requires: PLATFORM_FINANCE_VERIFY_DATABASE_URL
 *
 * Does NOT: read .env, use Keychain, Supabase CLI, session_replication_role,
 * disable RLS, disable all triggers, touch grants/access, clean 2098-12 / PFR2,
 * create migrations, or leave a permanent cleanup capability.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/cleanup-platform-finance-smoke-once.mts
 *   PLATFORM_FINANCE_ALLOW_DEV_CLEANUP=1 npx tsx --tsconfig tsconfig.json scripts/cleanup-platform-finance-smoke-once.mts
 */

import { Client } from "pg";

// ---------------------------------------------------------------------------
// Exact allowlist — do not broaden
// ---------------------------------------------------------------------------

const PERIOD_ID = "fd283a03-de74-4588-baf6-1f5cbce62aec";
const COMPANY_ID = "6c6130ff-7e7a-42a7-91f1-8021831f8c8a";
const EFFIONG_PROFILE_ID = "ee7eb825-090d-4db9-a852-feb278a69763";
const VIEW_CAPABILITY = "platform_finance.view";
const EXPECTED_LINE_AMOUNT = 100;

const PAIRS: ReadonlyArray<{
  transactionId: string;
  reference: string;
  journalId: string;
}> = [
  {
    transactionId: "1ae9dbbb-1b94-4f97-8dea-84517740da75",
    reference: "PF1SMOKE-1789400194404-BALANCED",
    journalId: "d7e62e3a-8f79-4751-89ee-7b69161b8ca2",
  },
  {
    transactionId: "c68e0614-2d7c-4705-bcf7-0052aa1f875e",
    reference: "PF1SMOKE-1789401223589-BALANCED",
    journalId: "a0e63220-033d-41dc-aa6a-906fe41878b0",
  },
  {
    transactionId: "02e27bad-e4ce-4396-b43d-8c06c6f33994",
    reference: "PF1SMOKE-1789426053658-BALANCED",
    journalId: "427c22b9-b11c-471f-bd76-c4f68d2cf237",
  },
];

const TX_IDS = PAIRS.map((p) => p.transactionId);
const JOURNAL_IDS = PAIRS.map((p) => p.journalId);
const TX_ID_SET = new Set(TX_IDS);

/**
 * Exact immutability triggers from
 * supabase/migrations/20260914140000_finance_foundation.sql
 * (verified against repo — do not invent names).
 */
const TRIGGERS_TO_DISABLE: ReadonlyArray<{
  table: string;
  trigger: string;
  expectedFunction: string;
  expectedBodySnippet: string;
}> = [
  {
    table: "finance_journal_lines",
    trigger: "finance_journal_lines_no_posted_mutate",
    expectedFunction: "finance_journal_lines_reject_posted_mutation",
    expectedBodySnippet: "posted journal lines cannot be updated or deleted",
  },
  {
    table: "finance_journal_entries",
    trigger: "finance_journal_entries_no_posted_delete",
    expectedFunction: "finance_journal_entries_reject_posted_mutation",
    expectedBodySnippet: "posted journal entries cannot be deleted",
  },
  {
    table: "finance_audit_events",
    trigger: "finance_audit_events_no_delete",
    expectedFunction: "finance_audit_events_reject_mutate",
    expectedBodySnippet: "finance_audit_events is append-only",
  },
];

type TriggerFingerprint = {
  table: string;
  trigger: string;
  enabled: string;
  functionName: string;
  functionDef: string;
};

type AccessFingerprint = {
  grantIds: string[];
  accessIds: string[];
  accessCompanyIds: string[];
};

type CatalogFingerprint = {
  companyIds: string[];
  accountIds: string[];
  categoryIds: string[];
};

class AssertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertError";
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new AssertError(message);
}

function sorted(ids: string[]): string[] {
  return [...ids].sort();
}

function sameIdSet(a: string[], b: string[]): boolean {
  const as = sorted(a);
  const bs = sorted(b);
  return as.length === bs.length && as.every((v, i) => v === bs[i]);
}

function logSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main(): Promise<void> {
  const url = process.env.PLATFORM_FINANCE_VERIFY_DATABASE_URL?.trim() || "";
  if (!url) {
    console.error(
      "REFUSED: PLATFORM_FINANCE_VERIFY_DATABASE_URL is not set. No Keychain/.env fallback."
    );
    process.exit(1);
  }

  const allowDestructive =
    process.env.PLATFORM_FINANCE_ALLOW_DEV_CLEANUP === "1";
  const destructive = allowDestructive;

  logSection("MODE");
  console.log(
    destructive
      ? "DESTRUCTIVE (PLATFORM_FINANCE_ALLOW_DEV_CLEANUP=1)"
      : "DRY RUN (default) — preflight only; will ROLLBACK"
  );

  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  let began = false;
  let committed = false;

  try {
    await client.connect();

    const identity = await client.query<{
      current_database: string;
      current_user: string;
      server_version: string;
      current_schema: string;
    }>(
      `select
         current_database() as current_database,
         current_user,
         current_setting('server_version') as server_version,
         current_schema() as current_schema`
    );
    const id = identity.rows[0];
    assert(id?.current_database, "database identity: current_database missing");
    assert(id?.current_user, "database identity: current_user missing");
    assert(id?.server_version, "database identity: server_version missing");
    assert(id?.current_schema, "database identity: current_schema missing");

    logSection("DATABASE IDENTITY");
    console.log(`current_database(): ${id.current_database}`);
    console.log(`current_user:       ${id.current_user}`);
    console.log(`server_version:     ${id.server_version}`);
    console.log(`current_schema():   ${id.current_schema}`);

    await client.query("BEGIN");
    began = true;

    const pre = await runPreflight(client);

    logSection("WOULD DELETE (allowlist only)");
    console.log(`period:           1  (${PERIOD_ID})`);
    console.log(`transactions:     3  (${TX_IDS.join(", ")})`);
    console.log(`journal entries:  3  (${JOURNAL_IDS.join(", ")})`);
    console.log(`journal lines:    6`);
    console.log(
      `audit events:     ${pre.auditIds.length}  (${pre.auditIds.join(", ") || "none"})`
    );
    console.log(`journal_entry_id states: ${JSON.stringify(pre.journalLinkStates)}`);

    if (!destructive) {
      await client.query("ROLLBACK");
      began = false;
      logSection("DRY RUN RESULT");
      console.log("ROLLBACK complete. ZERO mutations committed.");
      console.log(
        "To mutate: PLATFORM_FINANCE_ALLOW_DEV_CLEANUP=1 with the same DATABASE_URL."
      );
      return;
    }

    await runMutation(client, pre);
    await runPostflight(client, pre);

    // Drop any accidental maintenance function residue (none expected).
    await client.query(
      `drop function if exists public.finance_dev_smoke_cleanup_once()`
    );
    const leftoverFn = await client.query(
      `select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'finance_dev_smoke_cleanup_once'`
    );
    assert(leftoverFn.rowCount === 0, "maintenance function still exists");

    await client.query("COMMIT");
    committed = true;
    began = false;

    logSection("COMMIT");
    console.log("COMMIT succeeded.");

    await runFinalReadOnlyVerification(client, pre);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`\nFAILED: ${msg}`);
    if (began && !committed) {
      try {
        await client.query("ROLLBACK");
        console.error("ROLLBACK complete. ZERO mutations committed.");
      } catch (rb) {
        console.error(
          `ROLLBACK also failed: ${rb instanceof Error ? rb.message : String(rb)}`
        );
      }
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

type PreflightResult = {
  auditIds: string[];
  journalLinkStates: Record<string, string | null>;
  access: AccessFingerprint;
  catalog: CatalogFingerprint;
  triggerFingerprints: TriggerFingerprint[];
};

async function runPreflight(client: Client): Promise<PreflightResult> {
  logSection("PREFLIGHT");

  // --- Period ---
  const period = await client.query<{
    id: string;
    year: number;
    month: number;
    status: string;
    company_id: string;
  }>(
    `select id, year, month, status, company_id
     from public.finance_periods
     where id = $1`,
    [PERIOD_ID]
  );
  assert(period.rowCount === 1, `period ${PERIOD_ID} not found`);
  const p = period.rows[0];
  assert(Number(p.year) === 2099, `period year expected 2099 got ${p.year}`);
  assert(Number(p.month) === 1, `period month expected 1 got ${p.month}`);
  assert(p.status === "open", `period status expected open got ${p.status}`);
  assert(
    p.company_id === COMPANY_ID,
    `period company_id expected ${COMPANY_ID} got ${p.company_id}`
  );
  console.log("PASS period exact match (2099-01 open, expected company)");

  // --- Transactions ---
  const txs = await client.query<{
    id: string;
    reference: string;
    company_id: string;
    journal_entry_id: string | null;
    status: string;
  }>(
    `select id, reference, company_id, journal_entry_id, status
     from public.finance_transactions
     where id = any($1::uuid[])`,
    [TX_IDS]
  );
  assert(txs.rowCount === 3, `expected exactly 3 target transactions, got ${txs.rowCount}`);
  const txById = new Map(txs.rows.map((r) => [r.id, r]));
  const journalLinkStates: Record<string, string | null> = {};
  for (const pair of PAIRS) {
    const tx = txById.get(pair.transactionId);
    assert(tx, `missing transaction ${pair.transactionId}`);
    assert(
      tx.reference === pair.reference,
      `tx ${pair.transactionId} reference expected ${pair.reference} got ${tx.reference}`
    );
    assert(
      tx.company_id === COMPANY_ID,
      `tx ${pair.transactionId} company mismatch`
    );
    assert(
      tx.journal_entry_id === null || tx.journal_entry_id === pair.journalId,
      `tx ${pair.transactionId} journal_entry_id unexpected: ${tx.journal_entry_id}`
    );
    journalLinkStates[pair.transactionId] = tx.journal_entry_id;
  }
  console.log("PASS transactions id/reference/company + journal_entry_id state");
  console.log(`  journal_entry_id states: ${JSON.stringify(journalLinkStates)}`);

  // --- Journals ---
  const journals = await client.query<{
    id: string;
    status: string;
    period_id: string;
    transaction_id: string;
    reference: string;
    company_id: string;
  }>(
    `select id, status, period_id, transaction_id, reference, company_id
     from public.finance_journal_entries
     where id = any($1::uuid[])`,
    [JOURNAL_IDS]
  );
  assert(
    journals.rowCount === 3,
    `expected exactly 3 target journals, got ${journals.rowCount}`
  );
  const jeById = new Map(journals.rows.map((r) => [r.id, r]));
  for (const pair of PAIRS) {
    const je = jeById.get(pair.journalId);
    assert(je, `missing journal ${pair.journalId}`);
    assert(je.status === "posted", `journal ${pair.journalId} status=${je.status}`);
    assert(
      je.period_id === PERIOD_ID,
      `journal ${pair.journalId} period mismatch`
    );
    assert(
      je.transaction_id === pair.transactionId,
      `journal ${pair.journalId} transaction_id mismatch`
    );
    assert(
      je.reference === pair.reference,
      `journal ${pair.journalId} reference mismatch`
    );
    assert(je.company_id === COMPANY_ID, `journal ${pair.journalId} company mismatch`);
  }
  console.log("PASS journals pairing/status/period/reference");

  // --- Lines ---
  const lines = await client.query<{
    id: string;
    journal_entry_id: string;
    debit: string;
    credit: string;
  }>(
    `select id, journal_entry_id, debit::text, credit::text
     from public.finance_journal_lines
     where journal_entry_id = any($1::uuid[])`,
    [JOURNAL_IDS]
  );
  assert(lines.rowCount === 6, `expected exactly 6 journal lines, got ${lines.rowCount}`);
  for (const jid of JOURNAL_IDS) {
    const jl = lines.rows.filter((r) => r.journal_entry_id === jid);
    assert(jl.length === 2, `journal ${jid} expected 2 lines, got ${jl.length}`);
    const debit = jl.reduce((s, r) => s + Number(r.debit), 0);
    const credit = jl.reduce((s, r) => s + Number(r.credit), 0);
    assert(debit === credit, `journal ${jid} unbalanced debit=${debit} credit=${credit}`);
    assert(
      debit === EXPECTED_LINE_AMOUNT,
      `journal ${jid} amount expected ${EXPECTED_LINE_AMOUNT} got debit=${debit} — STOP (forensic mismatch)`
    );
  }
  console.log("PASS journal lines: 6 total, 2/journal, balanced ₦100");

  // --- No unexpected dependents on period / journals ---
  const otherJeOnPeriod = await client.query(
    `select id from public.finance_journal_entries
     where period_id = $1 and not (id = any($2::uuid[]))`,
    [PERIOD_ID, JOURNAL_IDS]
  );
  assert(
    otherJeOnPeriod.rowCount === 0,
    `unexpected journals on period: ${otherJeOnPeriod.rows.map((r) => r.id).join(", ")}`
  );

  const otherTxOnJournals = await client.query(
    `select id, journal_entry_id from public.finance_transactions
     where journal_entry_id = any($1::uuid[])
       and not (id = any($2::uuid[]))`,
    [JOURNAL_IDS, TX_IDS]
  );
  assert(
    otherTxOnJournals.rowCount === 0,
    `unexpected transactions referencing target journals`
  );

  const otherTxOnPeriodViaJe = await client.query(
    `select t.id
     from public.finance_transactions t
     join public.finance_journal_entries e on e.transaction_id = t.id
     where e.period_id = $1
       and not (t.id = any($2::uuid[]))`,
    [PERIOD_ID, TX_IDS]
  );
  assert(
    otherTxOnPeriodViaJe.rowCount === 0,
    `unexpected transactions linked via journals on target period`
  );

  // Period must not contain other journals/txs beyond allowlist (already checked journals).
  // Also ensure no draft txs dated into period for this company that aren't allowlisted —
  // user said period contains no other Finance transactions or journals.
  // Strict: any FT whose journal posts to period, or any JE on period — covered.
  // Extra: FTs for company that somehow only exist as smoke drafts in period dates — out of
  // allowlist scope unless they reference period; skip year-based scan.

  console.log("PASS no unexpected journal/transaction dependents on period/journals");

  // --- Audits (exact object_id allowlist only) ---
  const audits = await client.query<{
    id: string;
    object_id: string;
    details: Record<string, unknown> | null;
  }>(
    `select id, object_id, details
     from public.finance_audit_events
     where action = 'finance.transaction.posted'
       and object_type = 'finance_transaction'
       and object_id = any($1::text[])`,
    [TX_IDS]
  );
  const auditIds: string[] = [];
  for (const row of audits.rows) {
    assert(TX_ID_SET.has(row.object_id), `audit object_id not allowlisted: ${row.object_id}`);
    const pair = PAIRS.find((p) => p.transactionId === row.object_id);
    assert(pair, `no pair for audit object_id ${row.object_id}`);
    const details = row.details ?? {};
    if (
      details.journal_entry_id !== undefined &&
      details.journal_entry_id !== null
    ) {
      assert(
        String(details.journal_entry_id) === pair.journalId,
        `audit ${row.id} details.journal_entry_id mismatch`
      );
    }
    auditIds.push(row.id);
  }
  assert(
    auditIds.length === audits.rowCount,
    "audit id collection mismatch"
  );
  console.log(`PASS audit events identified: ${auditIds.length} (exact object_id allowlist)`);

  // --- Effiong access fingerprint ---
  const grants = await client.query<{ id: string; capability: string }>(
    `select id, capability
     from public.finance_capability_grants
     where profile_id = $1
       and capability = $2`,
    [EFFIONG_PROFILE_ID, VIEW_CAPABILITY]
  );
  assert(
    (grants.rowCount ?? 0) >= 1,
    `Effiong ${VIEW_CAPABILITY} grant missing for profile ${EFFIONG_PROFILE_ID}`
  );

  const access = await client.query<{ id: string; company_id: string }>(
    `select id, company_id
     from public.finance_company_access
     where profile_id = $1
     order by id`,
    [EFFIONG_PROFILE_ID]
  );
  assert(
    access.rowCount === 12,
    `Effiong finance_company_access expected 12 got ${access.rowCount}`
  );
  const accessFp: AccessFingerprint = {
    grantIds: sorted(grants.rows.map((r) => r.id)),
    accessIds: sorted(access.rows.map((r) => r.id)),
    accessCompanyIds: sorted(access.rows.map((r) => r.company_id)),
  };
  console.log(
    `PASS Effiong access fingerprint: grants=${accessFp.grantIds.length} access=${accessFp.accessIds.length}`
  );

  // --- Catalog fingerprints ---
  const companies = await client.query<{ id: string }>(
    `select id from public.finance_companies order by id`
  );
  assert(
    companies.rowCount === 12,
    `finance_companies expected 12 got ${companies.rowCount}`
  );
  const accounts = await client.query<{ id: string }>(
    `select id from public.finance_accounts order by id`
  );
  assert(accounts.rowCount! > 0, "finance_accounts empty");
  const categories = await client.query<{ id: string }>(
    `select id from public.finance_request_categories order by id`
  );
  assert(categories.rowCount! > 0, "finance_request_categories empty");
  const catalog: CatalogFingerprint = {
    companyIds: companies.rows.map((r) => r.id),
    accountIds: accounts.rows.map((r) => r.id),
    categoryIds: categories.rows.map((r) => r.id),
  };
  console.log(
    `PASS catalog snapshot companies=${catalog.companyIds.length} accounts=${catalog.accountIds.length} categories=${catalog.categoryIds.length}`
  );

  // --- Trigger fingerprints (must match migration names) ---
  const triggerFingerprints: TriggerFingerprint[] = [];
  for (const t of TRIGGERS_TO_DISABLE) {
    const fp = await loadTriggerFingerprint(client, t.table, t.trigger);
    assert(fp, `required trigger missing: ${t.table}.${t.trigger}`);
    assert(
      fp.functionName === t.expectedFunction,
      `trigger ${t.trigger} function expected ${t.expectedFunction} got ${fp.functionName}`
    );
    assert(
      fp.functionDef.includes(t.expectedBodySnippet),
      `trigger function ${t.expectedFunction} body missing expected protection text`
    );
    assert(
      fp.enabled === "O",
      `trigger ${t.trigger} expected enabled (O) got ${fp.enabled}`
    );
    triggerFingerprints.push(fp);
  }
  console.log("PASS immutability triggers present, enabled, expected functions");

  // --- No application-facing cleanup capability ---
  const cleanupFns = await client.query(
    `select n.nspname, p.proname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where p.proname ilike '%finance%smoke%cleanup%'
        or p.proname ilike '%dev_smoke_cleanup%'`
  );
  assert(
    cleanupFns.rowCount === 0,
    `unexpected cleanup functions already present: ${JSON.stringify(cleanupFns.rows)}`
  );
  console.log("PASS no existing maintenance cleanup function");

  // Overview-relevant counts
  const overview = await overviewCounts(client);
  logSection("OVERVIEW-RELEVANT COUNTS (pre)");
  console.log(JSON.stringify(overview, null, 2));

  return {
    auditIds,
    journalLinkStates,
    access: accessFp,
    catalog,
    triggerFingerprints,
  };
}

async function loadTriggerFingerprint(
  client: Client,
  table: string,
  trigger: string
): Promise<TriggerFingerprint | null> {
  const res = await client.query<{
    tgname: string;
    tgenabled: string;
    proname: string;
    def: string;
  }>(
    `select t.tgname,
            t.tgenabled::text as tgenabled,
            p.proname,
            pg_get_functiondef(p.oid) as def
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     join pg_proc p on p.oid = t.tgfoid
     where n.nspname = 'public'
       and c.relname = $1
       and t.tgname = $2
       and not t.tgisinternal`,
    [table, trigger]
  );
  if (res.rowCount !== 1) return null;
  const row = res.rows[0];
  return {
    table,
    trigger,
    enabled: row.tgenabled,
    functionName: row.proname,
    functionDef: row.def,
  };
}

async function setTriggerEnabled(
  client: Client,
  table: string,
  trigger: string,
  enable: boolean
): Promise<void> {
  const allowed = new Set(TRIGGERS_TO_DISABLE.map((t) => `${t.table}.${t.trigger}`));
  assert(
    allowed.has(`${table}.${trigger}`),
    `refusing to alter non-allowlisted trigger ${table}.${trigger}`
  );
  const action = enable ? "ENABLE" : "DISABLE";
  // Named trigger only — never DISABLE TRIGGER ALL / USER / ALL.
  // Identifiers are allowlisted constants from TRIGGERS_TO_DISABLE (migration names).
  await client.query(
    `alter table public."${table}" ${action} trigger "${trigger}"`
  );
}

async function runMutation(client: Client, pre: PreflightResult): Promise<void> {
  logSection("MUTATION");

  // Break circular FK: FT.journal_entry_id → JE
  const unlink = await client.query<{
    id: string;
    journal_entry_id: string | null;
  }>(
    `update public.finance_transactions
     set journal_entry_id = null
     where id = any($1::uuid[])
     returning id, journal_entry_id`,
    [TX_IDS]
  );
  assert(unlink.rowCount === 3, `unlink expected 3 rows, got ${unlink.rowCount}`);
  for (const row of unlink.rows) {
    assert(
      row.journal_entry_id === null,
      `journal_entry_id still set for ${row.id}`
    );
  }
  console.log("PASS unlinked finance_transactions.journal_entry_id (3 NULL)");

  // Disable only named immutability triggers
  for (const t of TRIGGERS_TO_DISABLE) {
    await setTriggerEnabled(client, t.table, t.trigger, false);
    const fp = await loadTriggerFingerprint(client, t.table, t.trigger);
    assert(fp, `trigger vanished while disabling: ${t.trigger}`);
    assert(fp.enabled === "D", `trigger ${t.trigger} not disabled (enabled=${fp.enabled})`);
  }
  console.log("PASS disabled exactly 3 named immutability triggers");

  const delLines = await client.query(
    `delete from public.finance_journal_lines
     where journal_entry_id = any($1::uuid[])
     returning id`,
    [JOURNAL_IDS]
  );
  assert(delLines.rowCount === 6, `deleted lines expected 6 got ${delLines.rowCount}`);
  console.log("DELETED journal_lines: 6");

  const delJe = await client.query(
    `delete from public.finance_journal_entries
     where id = any($1::uuid[])
     returning id`,
    [JOURNAL_IDS]
  );
  assert(delJe.rowCount === 3, `deleted journals expected 3 got ${delJe.rowCount}`);
  console.log("DELETED journal_entries: 3");

  const delTx = await client.query(
    `delete from public.finance_transactions
     where id = any($1::uuid[])
     returning id`,
    [TX_IDS]
  );
  assert(delTx.rowCount === 3, `deleted transactions expected 3 got ${delTx.rowCount}`);
  console.log("DELETED transactions: 3");

  const remainJe = await client.query(
    `select id from public.finance_journal_entries where id = any($1::uuid[])`,
    [JOURNAL_IDS]
  );
  assert(remainJe.rowCount === 0, "target journals still present");
  const remainTx = await client.query(
    `select id from public.finance_transactions where id = any($1::uuid[])`,
    [TX_IDS]
  );
  assert(remainTx.rowCount === 0, "target transactions still present");
  const remainLines = await client.query(
    `select id from public.finance_journal_lines where journal_entry_id = any($1::uuid[])`,
    [JOURNAL_IDS]
  );
  assert(remainLines.rowCount === 0, "target journal lines still present");

  const remainOnPeriod = await client.query(
    `select id from public.finance_journal_entries where period_id = $1`,
    [PERIOD_ID]
  );
  assert(remainOnPeriod.rowCount === 0, "journals still reference target period");

  const delPeriod = await client.query(
    `delete from public.finance_periods
     where id = $1
     returning id`,
    [PERIOD_ID]
  );
  assert(delPeriod.rowCount === 1, `deleted period expected 1 got ${delPeriod.rowCount}`);
  console.log("DELETED period: 1");

  if (pre.auditIds.length > 0) {
    const delAudit = await client.query(
      `delete from public.finance_audit_events
       where id = any($1::uuid[])
       returning id`,
      [pre.auditIds]
    );
    assert(
      delAudit.rowCount === pre.auditIds.length,
      `deleted audits expected ${pre.auditIds.length} got ${delAudit.rowCount}`
    );
    console.log(`DELETED audit_events: ${delAudit.rowCount}`);
  } else {
    console.log("DELETED audit_events: 0 (none identified in preflight)");
  }

  // Restore triggers BEFORE postflight immutability checks
  for (const t of TRIGGERS_TO_DISABLE) {
    await setTriggerEnabled(client, t.table, t.trigger, true);
    const fp = await loadTriggerFingerprint(client, t.table, t.trigger);
    assert(fp, `trigger missing after re-enable: ${t.trigger}`);
    assert(fp.enabled === "O", `trigger ${t.trigger} not re-enabled`);
    const before = pre.triggerFingerprints.find((x) => x.trigger === t.trigger);
    assert(before, "missing pre fingerprint");
    assert(
      fp.functionName === before.functionName,
      `trigger function name changed for ${t.trigger}`
    );
    assert(
      fp.functionDef === before.functionDef,
      `trigger function definition changed for ${t.trigger}`
    );
  }
  console.log("PASS re-enabled triggers; definitions unchanged");
}

async function runPostflight(client: Client, pre: PreflightResult): Promise<void> {
  logSection("POSTFLIGHT (pre-COMMIT)");

  const txs = await client.query(
    `select id from public.finance_transactions where id = any($1::uuid[])`,
    [TX_IDS]
  );
  assert(txs.rowCount === 0, "target transaction IDs still exist");

  const refs = await client.query(
    `select id, reference from public.finance_transactions
     where reference = any($1::text[])`,
    [PAIRS.map((p) => p.reference)]
  );
  assert(refs.rowCount === 0, "PF1SMOKE references still exist");

  const jes = await client.query(
    `select id from public.finance_journal_entries where id = any($1::uuid[])`,
    [JOURNAL_IDS]
  );
  assert(jes.rowCount === 0, "target journal IDs still exist");

  const lines = await client.query(
    `select id from public.finance_journal_lines where journal_entry_id = any($1::uuid[])`,
    [JOURNAL_IDS]
  );
  assert(lines.rowCount === 0, "journal lines remain for target journals");

  const period = await client.query(
    `select id from public.finance_periods where id = $1`,
    [PERIOD_ID]
  );
  assert(period.rowCount === 0, "target period still exists");

  const period2099 = await client.query(
    `select id from public.finance_periods
     where company_id = $1 and year = 2099 and month = 1`,
    [COMPANY_ID]
  );
  assert(
    period2099.rowCount === 0,
    `another 2099-01 period exists for company (${period2099.rows.map((r) => r.id).join(", ")}) — FAIL (do not delete)`
  );

  const audits = await client.query(
    `select id from public.finance_audit_events
     where action = 'finance.transaction.posted'
       and object_type = 'finance_transaction'
       and object_id = any($1::text[])`,
    [TX_IDS]
  );
  assert(audits.rowCount === 0, "smoke posted audits still present");
  if (pre.auditIds.length > 0) {
    const byId = await client.query(
      `select id from public.finance_audit_events where id = any($1::uuid[])`,
      [pre.auditIds]
    );
    assert(byId.rowCount === 0, "preflight audit IDs still present");
  }

  const companies = await client.query<{ id: string }>(
    `select id from public.finance_companies order by id`
  );
  assert(
    sameIdSet(
      companies.rows.map((r) => r.id),
      pre.catalog.companyIds
    ),
    "finance_companies changed"
  );

  const accounts = await client.query<{ id: string }>(
    `select id from public.finance_accounts order by id`
  );
  assert(
    sameIdSet(
      accounts.rows.map((r) => r.id),
      pre.catalog.accountIds
    ),
    "finance_accounts (COA) changed"
  );

  const categories = await client.query<{ id: string }>(
    `select id from public.finance_request_categories order by id`
  );
  assert(
    sameIdSet(
      categories.rows.map((r) => r.id),
      pre.catalog.categoryIds
    ),
    "finance_request_categories changed"
  );

  const grants = await client.query<{ id: string }>(
    `select id from public.finance_capability_grants
     where profile_id = $1 and capability = $2`,
    [EFFIONG_PROFILE_ID, VIEW_CAPABILITY]
  );
  assert(
    sameIdSet(
      grants.rows.map((r) => r.id),
      pre.access.grantIds
    ),
    "Effiong view grant fingerprint changed"
  );

  const access = await client.query<{ id: string; company_id: string }>(
    `select id, company_id from public.finance_company_access where profile_id = $1`,
    [EFFIONG_PROFILE_ID]
  );
  assert(access.rowCount === 12, "Effiong access count changed");
  assert(
    sameIdSet(
      access.rows.map((r) => r.id),
      pre.access.accessIds
    ),
    "Effiong access id fingerprint changed"
  );
  assert(
    sameIdSet(
      access.rows.map((r) => r.company_id),
      pre.access.accessCompanyIds
    ),
    "Effiong access company fingerprint changed"
  );

  for (const t of TRIGGERS_TO_DISABLE) {
    const fp = await loadTriggerFingerprint(client, t.table, t.trigger);
    assert(fp, `trigger missing postflight: ${t.trigger}`);
    assert(fp.enabled === "O", `trigger not enabled: ${t.trigger}`);
    const before = pre.triggerFingerprints.find((x) => x.trigger === t.trigger)!;
    assert(fp.functionDef === before.functionDef, `function def drift: ${t.trigger}`);
  }

  // Prove protections still fire (savepoint; no lasting rows).
  await client.query("SAVEPOINT immutability_probe");
  try {
    // Throwaway insert+delete under savepoint — rolled back; never committed.
    const probe = await client.query<{ id: string }>(
      `with ins as (
         insert into public.finance_audit_events (
           organisation_id, company_id, actor_profile_id, action, object_type, object_id, reason
         )
         select organisation_id, $2::uuid, $1::uuid,
                'finance.dev.cleanup_probe', 'finance_cleanup_probe', 'probe', 'probe'
         from public.finance_companies
         where id = $2::uuid
         returning id
       )
       select id from ins`,
      [EFFIONG_PROFILE_ID, COMPANY_ID]
    );
    assert(probe.rowCount === 1, "audit probe insert failed");
    let deleted = false;
    try {
      await client.query(
        `delete from public.finance_audit_events where id = $1`,
        [probe.rows[0].id]
      );
      deleted = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      assert(
        /append-only/i.test(msg),
        `expected append-only rejection, got: ${msg}`
      );
    }
    assert(!deleted, "audit append-only protection did not block delete");
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT immutability_probe");
    await client.query("RELEASE SAVEPOINT immutability_probe");
  }
  console.log("PASS audit append-only still enforced");

  // Posted journal delete protection: only verifiable if another posted journal exists.
  const anyPosted = await client.query<{ id: string }>(
    `select id from public.finance_journal_entries where status = 'posted' limit 1`
  );
  if (anyPosted.rowCount === 1) {
    await client.query("SAVEPOINT posted_je_probe");
    try {
      let deleted = false;
      try {
        await client.query(
          `delete from public.finance_journal_entries where id = $1`,
          [anyPosted.rows[0].id]
        );
        deleted = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        assert(
          /posted journal entries cannot be deleted/i.test(msg),
          `expected posted delete rejection, got: ${msg}`
        );
      }
      assert(!deleted, "posted journal delete protection failed");
      console.log("PASS posted journal immutability still enforced (live probe)");
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT posted_je_probe");
      await client.query("RELEASE SAVEPOINT posted_je_probe");
    }
  } else {
    // Fall back to function body check (already done via fingerprint).
    console.log(
      "PASS posted journal immutability (no other posted journals; trigger+function verified)"
    );
  }

  console.log("PASS all postflight assertions");
}

async function overviewCounts(client: Client): Promise<Record<string, number>> {
  const q = async (sql: string, params: unknown[] = []) => {
    const r = await client.query(sql, params);
    return Number(r.rows[0]?.c ?? 0);
  };
  return {
    pf1smoke_transactions: await q(
      `select count(*)::int as c from public.finance_transactions
       where reference like 'PF1SMOKE-%'`
    ),
    target_transactions: await q(
      `select count(*)::int as c from public.finance_transactions where id = any($1::uuid[])`,
      [TX_IDS]
    ),
    target_journals: await q(
      `select count(*)::int as c from public.finance_journal_entries where id = any($1::uuid[])`,
      [JOURNAL_IDS]
    ),
    target_period: await q(
      `select count(*)::int as c from public.finance_periods where id = $1`,
      [PERIOD_ID]
    ),
    company_2099_01_periods: await q(
      `select count(*)::int as c from public.finance_periods
       where company_id = $1 and year = 2099 and month = 1`,
      [COMPANY_ID]
    ),
    finance_companies: await q(
      `select count(*)::int as c from public.finance_companies`
    ),
    open_periods: await q(
      `select count(*)::int as c from public.finance_periods where status = 'open'`
    ),
  };
}

async function runFinalReadOnlyVerification(
  client: Client,
  pre: PreflightResult
): Promise<void> {
  logSection("FINAL READ-ONLY VERIFICATION");
  await client.query("BEGIN");
  try {
    const overview = await overviewCounts(client);
    console.log(JSON.stringify(overview, null, 2));

    assert(overview.target_transactions === 0, "final: target txs remain");
    assert(overview.target_journals === 0, "final: target journals remain");
    assert(overview.target_period === 0, "final: target period remains");
    assert(
      overview.company_2099_01_periods === 0,
      "final: 2099-01 period remains for company"
    );

    const lines = await client.query(
      `select count(*)::int as c from public.finance_journal_lines
       where journal_entry_id = any($1::uuid[])`,
      [JOURNAL_IDS]
    );
    assert(Number(lines.rows[0].c) === 0, "final: journal lines remain");

    const audits = await client.query(
      `select count(*)::int as c from public.finance_audit_events
       where action = 'finance.transaction.posted'
         and object_type = 'finance_transaction'
         and object_id = any($1::text[])`,
      [TX_IDS]
    );
    assert(Number(audits.rows[0].c) === 0, "final: audits remain");

    const companies = await client.query<{ id: string }>(
      `select id from public.finance_companies order by id`
    );
    assert(
      sameIdSet(
        companies.rows.map((r) => r.id),
        pre.catalog.companyIds
      ),
      "final: companies changed"
    );

    const accounts = await client.query<{ id: string }>(
      `select id from public.finance_accounts order by id`
    );
    assert(
      sameIdSet(
        accounts.rows.map((r) => r.id),
        pre.catalog.accountIds
      ),
      "final: COA changed"
    );

    const categories = await client.query<{ id: string }>(
      `select id from public.finance_request_categories order by id`
    );
    assert(
      sameIdSet(
        categories.rows.map((r) => r.id),
        pre.catalog.categoryIds
      ),
      "final: categories changed"
    );

    const grants = await client.query<{ id: string }>(
      `select id from public.finance_capability_grants
       where profile_id = $1 and capability = $2`,
      [EFFIONG_PROFILE_ID, VIEW_CAPABILITY]
    );
    assert(
      sameIdSet(
        grants.rows.map((r) => r.id),
        pre.access.grantIds
      ),
      "final: grants changed"
    );

    const access = await client.query<{ id: string }>(
      `select id from public.finance_company_access where profile_id = $1`,
      [EFFIONG_PROFILE_ID]
    );
    assert(
      sameIdSet(
        access.rows.map((r) => r.id),
        pre.access.accessIds
      ),
      "final: access changed"
    );
    assert(access.rowCount === 12, "final: access count != 12");

    for (const t of TRIGGERS_TO_DISABLE) {
      const fp = await loadTriggerFingerprint(client, t.table, t.trigger);
      assert(fp?.enabled === "O", `final: trigger not enabled ${t.trigger}`);
    }

    const leftoverFn = await client.query(
      `select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and (p.proname = 'finance_dev_smoke_cleanup_once'
              or p.proname ilike '%finance%smoke%cleanup%')`
    );
    assert(leftoverFn.rowCount === 0, "final: maintenance function exists");

    console.log("PASS final read-only verification");
  } finally {
    await client.query("ROLLBACK");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
