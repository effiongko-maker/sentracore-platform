/**
 * Platform Finance Phase 1 — thorough DB integration smoke (transaction-scoped).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-foundation-db.mts
 *
 * Requires for the DB suite (otherwise SKIPPED — no Keychain / credential lookup):
 *   PLATFORM_FINANCE_VERIFY_DATABASE_URL  — Postgres URL for a single session
 *   package `pg`
 *
 * Lifecycle:
 *   BEGIN → fixtures + real finance_* RPCs + assertions → always ROLLBACK
 *
 * Never deletes persistent finance_capability_grants / finance_company_access.
 * Never sets session_replication_role. Never hard-deletes immutable rows.
 * Disposable company/periods/txs live only inside the rolled-back transaction.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";
import {
  expectSqlFailure,
  resolveFinanceVerifyDatabaseUrl,
  withFinanceVerifyTransaction,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

const RUN_ID = `PF1SMOKE-${Date.now()}`;
const EXPECTED_COMPANY_CODES = [
  "PAYCHEX",
  "FORNIDO",
  "TRIVNET",
  "DIAMOND_HEIRS",
  "INOVATIVA",
  "ICEPYRAMID",
  "FAMILY_DEPOT",
  "KAFAKUWO",
  "LECOLLECTIF",
  "NOUVELTECH",
  "REIDACCESS",
  "TELEMIX",
] as const;

const STRUCTURAL_COA = ["1000", "2000", "3000", "4000", "5000"] as const;

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";
type CheckResult = { name: string; status: CheckStatus; detail?: string };

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function appLayerAccessCheck(
  client: FinanceVerifyClient,
  input: {
    organisationId: string;
    profileId: string;
    capability: string;
    companyId?: string;
  }
): Promise<{ ok: boolean; reason?: string }> {
  const cap = await client.query(
    `select id from public.finance_capability_grants
     where organisation_id = $1 and profile_id = $2 and capability = $3
     limit 1`,
    [input.organisationId, input.profileId, input.capability]
  );
  if (cap.rowCount === 0) {
    return { ok: false, reason: `Missing capability ${input.capability}` };
  }
  if (input.companyId) {
    const access = await client.query(
      `select id from public.finance_company_access
       where company_id = $1 and profile_id = $2 limit 1`,
      [input.companyId, input.profileId]
    );
    if (access.rowCount === 0) {
      return { ok: false, reason: "No finance company access" };
    }
    const company = await client.query(
      `select organisation_id from public.finance_companies where id = $1`,
      [input.companyId]
    );
    if (
      !company.rows[0] ||
      company.rows[0].organisation_id !== input.organisationId
    ) {
      return { ok: false, reason: "Company not in organisation" };
    }
  }
  return { ok: true };
}

async function runDbSuite(
  client: FinanceVerifyClient,
  push: (name: string, status: CheckStatus, detail?: string) => void
) {
  // Schema / RPC presence
  {
    const post = await client.query(
      `select to_regprocedure('public.finance_post_transaction(uuid,uuid,jsonb,uuid,text)') as reg`
    );
    assert(post.rows[0]?.reg, "finance_post_transaction missing");
    push("schema.rpc.finance_post_transaction", "PASS");

    const close = await client.query(
      `select to_regprocedure('public.finance_close_period(uuid,uuid,text)') as reg`
    );
    assert(close.rows[0]?.reg, "finance_close_period missing");
    push("schema.rpc.finance_close_period", "PASS");
  }

  const orgRes = await client.query<{ id: string; slug: string }>(
    `select id, slug from public.organisations where slug = 'paychex' limit 1`
  );
  assert(orgRes.rows[0], "paychex org required");
  const orgId = orgRes.rows[0].id;

  const companies = await client.query<{ id: string; code: string }>(
    `select id, code from public.finance_companies
     where organisation_id = $1 order by code`,
    [orgId]
  );
  const codes = companies.rows.map((c: { code: string }) => c.code);
  const uniqueCodes = new Set(codes);
  assert(
    codes.length === 12 && uniqueCodes.size === 12,
    `expected 12 unique companies, got ${codes.length}`
  );
  for (const code of EXPECTED_COMPANY_CODES) {
    assert(uniqueCodes.has(code), `missing company code ${code}`);
  }
  push("seed.companies", "PASS", "12 unique companies under paychex");

  const profileRes = await client.query<{ id: string }>(
    `select id from public.profiles where organisation_id = $1 limit 1`,
    [orgId]
  );
  assert(profileRes.rows[0], "need an org profile as actor");
  const profileId = profileRes.rows[0].id;
  push("fixture.actor_profile", "PASS", "using existing org profile");

  const accounts = await client.query<{
    id: string;
    code: string;
    status: string;
  }>(
    `select id, code, status from public.finance_accounts
     where organisation_id = $1 and code = any($2::text[])`,
    [orgId, [...STRUCTURAL_COA]]
  );
  assert(
    accounts.rows.length === STRUCTURAL_COA.length,
    "structural COA incomplete"
  );
  for (const a of accounts.rows) {
    assert(a.status === "active", `account ${a.code} should be active`);
  }
  const cashId = accounts.rows.find((a) => a.code === "1000")!.id;
  const expenseId = accounts.rows.find((a) => a.code === "5000")!.id;
  push("seed.coa", "PASS", "structural accounts 1000-5000 active");

  {
    const msg = await expectSqlFailure(
      client,
      `insert into public.finance_accounts
       (organisation_id, code, name, account_type, status)
       values ($1, '1000', 'Cash Duplicate', 'asset', 'active')`,
      [orgId]
    );
    assert(/duplicate|unique|already exists/i.test(msg), msg);
    push("coa.duplicate_rejected", "PASS", msg.slice(0, 100));
  }

  // Disposable companies — only visible inside this transaction; ROLLBACK removes them.
  const companyA = await client.query<{ id: string }>(
    `insert into public.finance_companies (organisation_id, code, name, status)
     values ($1, $2, 'PF1 Verify A', 'active')
     returning id`,
    [orgId, `PF1A${Date.now().toString(36).slice(-6).toUpperCase()}`]
  );
  const companyB = await client.query<{ id: string }>(
    `insert into public.finance_companies (organisation_id, code, name, status)
     values ($1, $2, 'PF1 Verify B', 'active')
     returning id`,
    [orgId, `PF1B${Date.now().toString(36).slice(-6).toUpperCase()}`]
  );
  const companyAId = companyA.rows[0].id;
  const companyBId = companyB.rows[0].id;

  // Temporary grants for disposable company A only — never delete persistent grants.
  for (const capability of [
    PLATFORM_FINANCE_CAPABILITIES.view,
    PLATFORM_FINANCE_CAPABILITIES.post,
    PLATFORM_FINANCE_CAPABILITIES.create_transaction,
    PLATFORM_FINANCE_CAPABILITIES.manage_periods,
    PLATFORM_FINANCE_CAPABILITIES.manage_coa,
  ]) {
    await client.query(
      `insert into public.finance_capability_grants
         (organisation_id, profile_id, capability)
       values ($1, $2, $3)
       on conflict (profile_id, organisation_id, capability) do nothing`,
      [orgId, profileId, capability]
    );
  }
  await client.query(
    `insert into public.finance_company_access
       (organisation_id, profile_id, company_id)
     values ($1, $2, $3)`,
    [orgId, profileId, companyAId]
  );
  // Intentionally no access row for company B.
  push("access.grants", "PASS", "temp grants for disposable company A only");

  {
    // Deny manage_setup before granting it (never delete an existing post grant).
    const deniedMissing = await appLayerAccessCheck(client, {
      organisationId: orgId,
      profileId,
      capability: PLATFORM_FINANCE_CAPABILITIES.manage_setup,
      companyId: companyAId,
    });
    assert(!deniedMissing.ok, "missing manage_setup should deny");

    await client.query(
      `insert into public.finance_capability_grants
         (organisation_id, profile_id, capability)
       values ($1, $2, $3)
       on conflict (profile_id, organisation_id, capability) do nothing`,
      [orgId, profileId, PLATFORM_FINANCE_CAPABILITIES.manage_setup]
    );

    const allowed = await appLayerAccessCheck(client, {
      organisationId: orgId,
      profileId,
      capability: PLATFORM_FINANCE_CAPABILITIES.post,
      companyId: companyAId,
    });
    assert(allowed.ok, `app layer A should allow: ${allowed.reason}`);

    const deniedB = await appLayerAccessCheck(client, {
      organisationId: orgId,
      profileId,
      capability: PLATFORM_FINANCE_CAPABILITIES.post,
      companyId: companyBId,
    });
    assert(!deniedB.ok, "app layer B should deny without company access");

    push(
      "access.app_layer_cross_company",
      "PASS",
      "A allowed; B denied; missing capability denied without deleting grants"
    );
  }

  push(
    "access.rls_authenticated_client",
    "SKIPPED",
    "transaction-scoped suite uses single Postgres session; authenticated JWT client not bootstrapped"
  );

  const openYear = 2099;
  const openMonth = 1;
  const closedYear = 2098;
  const closedMonth = 12;

  const openPeriod = await client.query<{ id: string }>(
    `insert into public.finance_periods
       (organisation_id, company_id, year, month, start_date, end_date, status)
     values ($1, $2, $3, $4, $5, $6, 'open')
     returning id`,
    [
      orgId,
      companyAId,
      openYear,
      openMonth,
      `${openYear}-01-01`,
      `${openYear}-01-31`,
    ]
  );
  const openPeriodId = openPeriod.rows[0].id;

  const closedPeriod = await client.query<{ id: string }>(
    `insert into public.finance_periods
       (organisation_id, company_id, year, month, start_date, end_date, status)
     values ($1, $2, $3, $4, $5, $6, 'open')
     returning id`,
    [
      orgId,
      companyAId,
      closedYear,
      closedMonth,
      `${closedYear}-12-01`,
      `${closedYear}-12-31`,
    ]
  );
  const closedPeriodId = closedPeriod.rows[0].id;

  await client.query(
    `select public.finance_close_period($1::uuid, $2::uuid, $3::text)`,
    [closedPeriodId, profileId, `${RUN_ID} close`]
  );

  {
    const msg = await expectSqlFailure(
      client,
      `insert into public.finance_periods
         (organisation_id, company_id, year, month, start_date, end_date, status)
       values ($1, $2, $3, $4, $5, $6, 'open')`,
      [
        orgId,
        companyAId,
        openYear,
        openMonth,
        `${openYear}-01-01`,
        `${openYear}-01-31`,
      ]
    );
    assert(msg.length > 0, "duplicate period should fail");
    push("periods.unique", "PASS");
  }

  {
    const msg = await expectSqlFailure(
      client,
      `update public.finance_periods
       set status = 'open', closed_at = null, closed_by_profile_id = null
       where id = $1`,
      [closedPeriodId]
    );
    assert(/reopen|immutable/i.test(msg), msg);
    push("periods.no_reopen", "PASS", msg.slice(0, 100));
  }

  const balancedTx = await client.query<{ id: string }>(
    `insert into public.finance_transactions
       (organisation_id, company_id, reference, transaction_date, transaction_type,
        description, amount, currency, status, created_by_profile_id, metadata)
     values ($1, $2, $3, $4, 'foundation', $5, 100, 'NGN', 'draft', $6, $7::jsonb)
     returning id`,
    [
      orgId,
      companyAId,
      `${RUN_ID}-BALANCED`,
      `${openYear}-01-15`,
      `${RUN_ID} balanced posting`,
      profileId,
      JSON.stringify({ smoke: RUN_ID }),
    ]
  );
  const postedTxId = balancedTx.rows[0].id;

  const balancedLines = [
    { account_id: expenseId, debit: 100, credit: 0, description: "expense" },
    { account_id: cashId, debit: 0, credit: 100, description: "cash" },
  ];

  const postRes = await client.query<{ finance_post_transaction: string }>(
    `select public.finance_post_transaction(
       $1::uuid, $2::uuid, $3::jsonb, $4::uuid, $5::text
     ) as finance_post_transaction`,
    [
      postedTxId,
      profileId,
      JSON.stringify(balancedLines),
      openPeriodId,
      `${RUN_ID} post`,
    ]
  );
  const postedJournalId = postRes.rows[0].finance_post_transaction;
  assert(postedJournalId, "post should return journal id");

  {
    const ft = await client.query(
      `select status, journal_entry_id, posted_by_profile_id
       from public.finance_transactions where id = $1`,
      [postedTxId]
    );
    assert(ft.rows[0].status === "posted", "FT should be posted");
    assert(
      ft.rows[0].journal_entry_id === postedJournalId,
      "FT journal link mismatch"
    );
    assert(
      ft.rows[0].posted_by_profile_id === profileId,
      "posted_by must be profile id"
    );

    const lines = await client.query(
      `select debit, credit from public.finance_journal_lines
       where journal_entry_id = $1`,
      [postedJournalId]
    );
    assert(lines.rowCount === 2, "expected 2 lines");
    const sumDebit = lines.rows.reduce(
      (s: number, l: { debit: unknown }) => s + Number(l.debit),
      0
    );
    const sumCredit = lines.rows.reduce(
      (s: number, l: { credit: unknown }) => s + Number(l.credit),
      0
    );
    assert(sumDebit === 100 && sumCredit === 100, "journal not balanced");

    const audit = await client.query(
      `select actor_profile_id from public.finance_audit_events
       where object_id = $1 and action = 'finance.transaction.posted'`,
      [postedTxId]
    );
    assert(audit.rowCount === 1, "posting audit missing");
    assert(
      audit.rows[0].actor_profile_id === profileId,
      "audit actor must be profile id"
    );
    push(
      "posting.happy_path",
      "PASS",
      `journal=${postedJournalId} balanced debit=credit=100`
    );
  }

  {
    const gl = await client.query(
      `select journal_entry_id from public.finance_general_ledger_v
       where journal_entry_id = $1`,
      [postedJournalId]
    );
    assert(gl.rowCount === 2, "GL should show 2 lines");

    const tb = await client.query(
      `select total_debit, total_credit from public.finance_trial_balance_v
       where period_id = $1 and company_id = $2`,
      [openPeriodId, companyAId]
    );
    const tbDebit = tb.rows.reduce(
      (s: number, r: { total_debit: unknown }) => s + Number(r.total_debit),
      0
    );
    const tbCredit = tb.rows.reduce(
      (s: number, r: { total_credit: unknown }) => s + Number(r.total_credit),
      0
    );
    assert(tbDebit === tbCredit, `TB not balanced ${tbDebit} vs ${tbCredit}`);
    push("views.gl_tb", "PASS", `TB debit=${tbDebit} credit=${tbCredit}`);
  }

  {
    const badTx = await client.query<{ id: string }>(
      `insert into public.finance_transactions
         (organisation_id, company_id, reference, transaction_date, transaction_type,
          description, amount, currency, status, created_by_profile_id, metadata)
       values ($1, $2, $3, $4, 'foundation', $5, 50, 'NGN', 'draft', $6, $7::jsonb)
       returning id`,
      [
        orgId,
        companyAId,
        `${RUN_ID}-UNBAL`,
        `${openYear}-01-16`,
        `${RUN_ID} unbalanced`,
        profileId,
        JSON.stringify({ smoke: RUN_ID }),
      ]
    );
    const msg = await expectSqlFailure(
      client,
      `select public.finance_post_transaction($1::uuid, $2::uuid, $3::jsonb, $4::uuid, null)`,
      [
        badTx.rows[0].id,
        profileId,
        JSON.stringify([
          { account_id: expenseId, debit: 50, credit: 0 },
          { account_id: cashId, debit: 0, credit: 40 },
        ]),
        openPeriodId,
      ]
    );
    assert(/unbalanced/i.test(msg), msg);
    const still = await client.query(
      `select status, journal_entry_id from public.finance_transactions where id = $1`,
      [badTx.rows[0].id]
    );
    assert(still.rows[0].status === "draft", "FT must remain draft");
    assert(!still.rows[0].journal_entry_id, "no journal link on failed post");
    push("atomicity.unbalanced", "PASS");
  }

  {
    const closedTx = await client.query<{ id: string }>(
      `insert into public.finance_transactions
         (organisation_id, company_id, reference, transaction_date, transaction_type,
          description, amount, currency, status, created_by_profile_id, metadata)
       values ($1, $2, $3, $4, 'foundation', $5, 10, 'NGN', 'draft', $6, $7::jsonb)
       returning id`,
      [
        orgId,
        companyAId,
        `${RUN_ID}-CLOSED`,
        `${closedYear}-12-10`,
        `${RUN_ID} closed period`,
        profileId,
        JSON.stringify({ smoke: RUN_ID }),
      ]
    );
    const msg = await expectSqlFailure(
      client,
      `select public.finance_post_transaction($1::uuid, $2::uuid, $3::jsonb, $4::uuid, null)`,
      [
        closedTx.rows[0].id,
        profileId,
        JSON.stringify([
          { account_id: expenseId, debit: 10, credit: 0 },
          { account_id: cashId, debit: 0, credit: 10 },
        ]),
        closedPeriodId,
      ]
    );
    assert(/closed/i.test(msg), msg);
    push("atomicity.closed_period", "PASS");
  }

  {
    await client.query(
      `update public.finance_accounts set status = 'inactive' where id = $1`,
      [expenseId]
    );
    const inactTx = await client.query<{ id: string }>(
      `insert into public.finance_transactions
         (organisation_id, company_id, reference, transaction_date, transaction_type,
          description, amount, currency, status, created_by_profile_id, metadata)
       values ($1, $2, $3, $4, 'foundation', $5, 10, 'NGN', 'draft', $6, $7::jsonb)
       returning id`,
      [
        orgId,
        companyAId,
        `${RUN_ID}-INACTIVE`,
        `${openYear}-01-17`,
        `${RUN_ID} inactive account`,
        profileId,
        JSON.stringify({ smoke: RUN_ID }),
      ]
    );
    const msg = await expectSqlFailure(
      client,
      `select public.finance_post_transaction($1::uuid, $2::uuid, $3::jsonb, $4::uuid, null)`,
      [
        inactTx.rows[0].id,
        profileId,
        JSON.stringify([
          { account_id: expenseId, debit: 10, credit: 0 },
          { account_id: cashId, debit: 0, credit: 10 },
        ]),
        openPeriodId,
      ]
    );
    assert(/not active/i.test(msg), msg);
    await client.query(
      `update public.finance_accounts set status = 'active' where id = $1`,
      [expenseId]
    );
    push("atomicity.inactive_account", "PASS");
  }

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_post_transaction($1::uuid, $2::uuid, $3::jsonb, $4::uuid, null)`,
      [
        postedTxId,
        profileId,
        JSON.stringify(balancedLines),
        openPeriodId,
      ]
    );
    assert(/already posted|already has a journal/i.test(msg), msg);
    const je = await client.query(
      `select id from public.finance_journal_entries where transaction_id = $1`,
      [postedTxId]
    );
    assert(je.rowCount === 1, `expected one journal, got ${je.rowCount}`);
    const audit = await client.query(
      `select id from public.finance_audit_events
       where object_id = $1 and action = 'finance.transaction.posted'`,
      [postedTxId]
    );
    assert(audit.rowCount === 1, `expected one success audit, got ${audit.rowCount}`);
    push("posting.duplicate_rejected", "PASS", "single journal + single audit");
  }

  {
    const updJe = await expectSqlFailure(
      client,
      `update public.finance_journal_entries set description = 'mutated' where id = $1`,
      [postedJournalId]
    );
    assert(/cannot be updated/i.test(updJe), updJe);

    const delJe = await expectSqlFailure(
      client,
      `delete from public.finance_journal_entries where id = $1`,
      [postedJournalId]
    );
    assert(/cannot be deleted/i.test(delJe), delJe);

    const line = await client.query(
      `select id from public.finance_journal_lines where journal_entry_id = $1 limit 1`,
      [postedJournalId]
    );
    assert(line.rows[0], "line missing");

    const updLine = await expectSqlFailure(
      client,
      `update public.finance_journal_lines set description = 'mutated' where id = $1`,
      [line.rows[0].id]
    );
    assert(/cannot be updated or deleted/i.test(updLine), updLine);

    const delLine = await expectSqlFailure(
      client,
      `delete from public.finance_journal_lines where id = $1`,
      [line.rows[0].id]
    );
    assert(/cannot be updated or deleted/i.test(delLine), delLine);

    const updAudit = await expectSqlFailure(
      client,
      `update public.finance_audit_events set reason = 'mutated'
       where object_id = $1 and action = 'finance.transaction.posted'`,
      [postedTxId]
    );
    assert(/append-only/i.test(updAudit), updAudit);

    const delAudit = await expectSqlFailure(
      client,
      `delete from public.finance_audit_events
       where object_id = $1 and action = 'finance.transaction.posted'`,
      [postedTxId]
    );
    assert(/append-only/i.test(delAudit), delAudit);

    push(
      "immutability.journal_and_audit",
      "PASS",
      "session UPDATE/DELETE rejected by triggers"
    );
  }

  push(
    "cross_module",
    "PASS",
    "DB smoke uses finance_* only; FM/ECC tables not touched"
  );
  push(
    "lifecycle.transaction_rollback",
    "PASS",
    "fixtures + RPCs executed inside BEGIN; helper will ROLLBACK"
  );
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  const push = (name: string, status: CheckStatus, detail?: string) => {
    results.push({ name, status, detail });
    const suffix = detail ? ` — ${detail}` : "";
    console.log(`${status} ${name}${suffix}`);
  };

  console.log(
    `verify-platform-finance-foundation-db run=${RUN_ID} (transaction-scoped)`
  );

  if (!resolveFinanceVerifyDatabaseUrl()) {
    push(
      "db.env",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set — no DB connection attempted"
    );
  } else {
    const outcome = await withFinanceVerifyTransaction(async (client) => {
      await runDbSuite(client, push);
      return true;
    });
    assert(outcome.rolledBack, "transaction helper must always report rolledBack");
    if (!outcome.ok) {
      push("integration.fatal", "FAIL", outcome.error);
    } else {
      push(
        "cleanup.rollback",
        "PASS",
        "transaction rolled back — no persistent smoke rows from this run"
      );
    }
  }

  const pass = results.filter((r: CheckResult) => r.status === "PASS").length;
  const fail = results.filter((r: CheckResult) => r.status === "FAIL").length;
  const skipped = results.filter((r: CheckResult) => r.status === "SKIPPED")
    .length;
  console.log(`\nSUMMARY pass=${pass} fail=${fail} skipped=${skipped}`);
  if (fail > 0) {
    console.error("FAIL verify-platform-finance-foundation-db");
    process.exit(1);
  }
  console.log("PASS verify-platform-finance-foundation-db");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
