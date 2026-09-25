/**
 * Platform Finance — posted-movement pagination regression (shared accounting retrieval layer).
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-posted-movements-pagination.mts
 *
 * The REAL scan (fetchPostedMovementRows, used by PlatformFinanceRepository.listPostedAccountMovements and therefore by
 * the Accounting Trial Balance / P&L / Balance Sheet AND by Reports) runs against the real finance_trial_balance_v in
 * PGlite (full migration chain), through an adapter with PostgREST semantics that makes Postgres's actual freedom
 * explicit: rows that tie on the requested ORDER BY — or every row, when no order is requested — come back in a fresh
 * random order on each page query. Many movements share a period_id, and a small page size forces many boundaries.
 * Never touches Supabase.
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { financeDatabase, PAYCHEX_ORG } from "./lib/pf-pglite";
import {
  fetchPostedMovementRows,
  type PostedMovementClient,
  type PostedMovementRow,
} from "../src/modules/platform-finance/server/PlatformFinanceRepository";
import type { PostedAccountMovement } from "../src/modules/platform-finance/domain/accountingReadModels";
import { buildTrialBalance } from "../src/modules/platform-finance/domain/trialBalance";
import { buildProfitAndLoss } from "../src/modules/platform-finance/domain/profitAndLoss";
import { buildBalanceSheet } from "../src/modules/platform-finance/domain/balanceSheet";
import {
  buildBalanceSheetReport,
  buildProfitAndLossReport,
  buildTrialBalanceMovementReport,
  resolveComparativePeriod,
} from "../src/modules/platform-finance/reports/statements";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message}`);
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const db: PGlite = await financeDatabase();
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
const all = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

// ── Fixtures: three periods, ~40 accounts each, so dozens of movements share every period_id ────────────────
const OFFICER = "c0000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users (id, email) values ($1, $2)", [OFFICER, "pager@example.test"]);
await db.exec(`begin; select set_config('sentracore.bypass_profile_acl', 'on', true);
  update public.profiles set organisation_id = '${PAYCHEX_ORG}', status = 'active' where id = '${OFFICER}'; commit;`);
const COMPANY = (await one<{ id: string }>("select id from public.finance_companies where organisation_id = $1 and code = 'PAYCHEX'", [PAYCHEX_ORG])).id;
for (const cap of [PLATFORM_FINANCE_CAPABILITIES.create_transaction, PLATFORM_FINANCE_CAPABILITIES.post]) {
  await db.query("insert into public.finance_capability_grants (organisation_id, profile_id, capability) values ($1, $2, $3)", [PAYCHEX_ORG, OFFICER, cap]);
}
await db.query("insert into public.finance_company_access (organisation_id, profile_id, company_id) values ($1, $2, $3)", [PAYCHEX_ORG, OFFICER, COMPANY]);
const CASH = (await one<{ id: string }>("select id from public.finance_accounts where organisation_id = $1 and code = '1060'", [PAYCHEX_ORG])).id;
const EQUITY = (await one<{ id: string }>("select id from public.finance_accounts where organisation_id = $1 and code = '3000'", [PAYCHEX_ORG])).id;
const spend = await all<{ id: string }>(
  "select id from public.finance_accounts where organisation_id = $1 and status = 'active' and account_type in ('expense', 'revenue') order by code",
  [PAYCHEX_ORG]
);
assert(spend.length >= 30, `enough accounts to cross page boundaries (got ${spend.length})`);

const periods: Array<{ id: string; year: number; month: number; startDate: string; endDate: string; status: string }> = [];
let seq = 0;
for (const month of [7, 8, 9]) {
  const mm = String(month).padStart(2, "0");
  const end = `2026-${mm}-${new Date(Date.UTC(2026, month, 0)).getUTCDate()}`;
  const p = await one<{ id: string }>(
    "insert into public.finance_periods (organisation_id, company_id, year, month, start_date, end_date, status) values ($1, $2, 2026, $3, $4, $5, 'open') returning id",
    [PAYCHEX_ORG, COMPANY, month, `2026-${mm}-01`, end]
  );
  periods.push({ id: p.id, year: 2026, month, startDate: `2026-${mm}-01`, endDate: end, status: "open" });
  const lines = spend.map((a, i) => ({ account_id: a.id, debit: 100 + i + month, credit: 0 }));
  const total = lines.reduce((s, l) => s + l.debit, 0);
  for (const [extraDebit, extraCredit] of [[CASH, EQUITY]]) {
    seq += 1;
    const ft = await one<{ id: string }>(
      `insert into public.finance_transactions (organisation_id, company_id, reference, transaction_date, transaction_type, description, amount, currency, status, created_by_profile_id)
       values ($1, $2, $3, $4, 'other', 'Pagination fixture', $5, 'NGN', 'draft', $6) returning id`,
      [PAYCHEX_ORG, COMPANY, `PAGE-${seq}`, `2026-${mm}-15`, total * 2, OFFICER]
    );
    await db.query("select public.finance_post_transaction($1, $2, $3::jsonb, $4)", [
      ft.id,
      OFFICER,
      JSON.stringify([...lines, { account_id: extraDebit, debit: total, credit: 0 }, { account_id: extraCredit, debit: 0, credit: total * 2 }]),
      p.id,
    ]);
  }
}

// ── PostgREST-semantics adapter over PGlite ─────────────────────────────────────────────────────────────────
const IDENT = /^[a-z_]+$/;
function adapter(): PostedMovementClient & { queries: number } {
  const state = { queries: 0 };
  const client = {
    get queries() {
      return state.queries;
    },
    from(relation: "finance_trial_balance_v") {
      return {
        select(columns: string) {
          const filters: Array<[string, string]> = [];
          const orders: string[] = [];
          const query = {
            eq(column: string, value: string) {
              assert(IDENT.test(column), "column");
              filters.push([column, value]);
              return query;
            },
            order(column: string, options: { ascending: boolean }) {
              assert(IDENT.test(column), "column");
              orders.push(`${column} ${options.ascending ? "asc" : "desc"}`);
              return query;
            },
            async range(from: number, to: number) {
              state.queries += 1;
              const where = filters.map(([c], i) => `${c} = $${i + 1}`).join(" and ");
              // Ties (or everything, with no ORDER BY) are unordered in Postgres: model that as a fresh shuffle.
              const orderBy = [...orders, "random()"].join(", ");
              const sql = `select ${columns} from public.${relation} where ${where} order by ${orderBy} limit ${to - from + 1} offset ${from}`;
              const { rows } = await db.query(sql, filters.map(([, v]) => v));
              return { data: rows as unknown[], error: null };
            },
          };
          return query;
        },
      };
    },
  };
  return client;
}

const key = (r: Pick<PostedMovementRow, "period_id" | "account_id">) => `${r.period_id}|${r.account_id}`;
const truth = await all<PostedMovementRow>(
  "select period_id, account_id, account_code, account_name, account_type, total_debit, total_credit from public.finance_trial_balance_v where organisation_id = $1 and company_id = $2",
  [PAYCHEX_ORG, COMPANY]
);
const truthKeys = new Set(truth.map(key));
const PAGE = 7;

function exactlyOnce(rows: readonly PostedMovementRow[]): string | null {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(key(r))) return `duplicate ${key(r)}`;
    seen.add(key(r));
  }
  if (seen.size !== truthKeys.size) return `returned ${seen.size} of ${truthKeys.size}`;
  for (const k of truthKeys) if (!seen.has(k)) return `missing ${k}`;
  return null;
}

/** The pre-fix scan: identical except it requested no ORDER BY. */
async function unorderedScan(client: PostedMovementClient): Promise<PostedMovementRow[]> {
  const out: PostedMovementRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await client
      .from("finance_trial_balance_v")
      .select("period_id, account_id, account_code, account_name, account_type, total_debit, total_credit")
      .eq("organisation_id", PAYCHEX_ORG)
      .eq("company_id", COMPANY)
      .range(offset, offset + PAGE - 1);
    const batch = (data ?? []) as PostedMovementRow[];
    out.push(...batch);
    if (batch.length < PAGE) return out;
  }
}

await check("1 fixtures: many movements share each period_id and span many small pages", () => {
  const perPeriod = new Map<string, number>();
  for (const r of truth) perPeriod.set(r.period_id, (perPeriod.get(r.period_id) ?? 0) + 1);
  assert(truth.length >= 90 && [...perPeriod.values()].every((n) => n >= 30), `≥30 movements per period (got ${[...perPeriod.values()].join("/")})`);
  assert(Math.ceil(truth.length / PAGE) >= 13, "crosses at least a dozen page boundaries");
});

await check("2 the shared scan returns every posted movement exactly once, on every one of 25 runs with shuffled ties", async () => {
  for (let run = 0; run < 25; run += 1) {
    const client = adapter();
    const rows = await fetchPostedMovementRows(client, { organisationId: PAYCHEX_ORG, companyId: COMPANY, pageSize: PAGE });
    const problem = exactlyOnce(rows);
    assert(!problem, `run ${run}: ${problem}`);
    assert(client.queries === Math.floor(truth.length / PAGE) + 1, "one query per page, then stop");
  }
});

await check("3 control: the previous unordered scan skips or repeats movements under the same conditions", async () => {
  let broken = 0;
  for (let run = 0; run < 10; run += 1) if (exactlyOnce(await unorderedScan(adapter()))) broken += 1;
  assert(broken > 0, "the unordered scan never failed — the regression would not detect the defect");
});

await check("4 a unique tie-breaker is required: ordering by period_id alone is also unstable at page boundaries", async () => {
  const src = readFileSync("src/modules/platform-finance/server/PlatformFinanceRepository.ts", "utf8");
  const scan = src.slice(src.indexOf("export async function fetchPostedMovementRows"), src.indexOf("type CompanyRow"));
  assert(/\.order\("period_id", \{ ascending: true \}\)\s*\.order\("account_id", \{ ascending: true \}\)\s*\.range\(/.test(scan), "scan orders by period_id then account_id immediately before range()");
  const view = readFileSync("supabase/migrations/20260914140000_finance_foundation.sql", "utf8");
  const tb = view.slice(view.indexOf("create or replace view public.finance_trial_balance_v"), view.indexOf("comment on view public.finance_general_ledger_v"));
  assert(/group by\s+organisation_id,\s+company_id,\s+period_id,\s+account_id,/.test(tb), "(company, period, account) is the view's grouping key, so (period_id, account_id) is unique per company");
  let broken = 0;
  for (let run = 0; run < 10; run += 1) {
    const client = adapter();
    const out: PostedMovementRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data } = await client.from("finance_trial_balance_v").select("period_id, account_id, account_code, account_name, account_type, total_debit, total_credit")
        .eq("organisation_id", PAYCHEX_ORG).eq("company_id", COMPANY).order("period_id", { ascending: true }).range(offset, offset + PAGE - 1);
      const batch = (data ?? []) as PostedMovementRow[];
      out.push(...batch);
      if (batch.length < PAGE) break;
    }
    if (exactlyOnce(out)) broken += 1;
  }
  assert(broken > 0, "period_id-only ordering never failed — ties are not being exercised");
  const repoSrc = src.slice(src.indexOf("private async sumGeneralLedgerDebitCredit"), src.indexOf("async listPostedAccountMovements"));
  assert(/\.order\("journal_line_id", \{ ascending: true \}\)\s*\.range\(/.test(repoSrc), "the GL totals scan is ordered by its unique journal_line_id too");
});

await check("5 Accounting and Reports results are identical from the paged scan and from the complete unpaged view", async () => {
  const classification = new Map((await all<{ id: string; classification: string | null }>("select id, classification from public.finance_accounts where organisation_id = $1", [PAYCHEX_ORG])).map((a) => [a.id, a.classification]));
  const byId = new Map(periods.map((p) => [p.id, p]));
  // Same mapping as PlatformFinanceRepository.listPostedAccountMovements.
  const toMovements = (rows: readonly PostedMovementRow[]): PostedAccountMovement[] =>
    rows.map((r) => ({
      periodId: r.period_id, year: byId.get(r.period_id)!.year, month: byId.get(r.period_id)!.month, accountId: r.account_id, accountCode: r.account_code,
      accountName: r.account_name, accountType: r.account_type as PostedAccountMovement["accountType"], classification: classification.get(r.account_id) ?? null,
      totalDebit: Number(r.total_debit ?? 0), totalCredit: Number(r.total_credit ?? 0),
    }));
  const paged = toMovements(await fetchPostedMovementRows(adapter(), { organisationId: PAYCHEX_ORG, companyId: COMPANY, pageSize: PAGE }));
  const complete = toMovements(truth);
  const sep = periods.find((p) => p.month === 9)!;
  const asOf = { year: 2026, month: 9 };
  const same = (a: unknown, b: unknown, what: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${what} differs`);
  const tbArgs = { companyId: COMPANY, periodId: sep.id, asAtDate: sep.endDate, asAtLabel: "", asOf };
  same(buildTrialBalance({ ...tbArgs, movements: paged }), buildTrialBalance({ ...tbArgs, movements: complete }), "Accounting Trial Balance");
  for (const scope of ["period", "ytd"] as const) {
    const args = { companyId: COMPANY, periodId: sep.id, scope, period: asOf, heading: "", subheading: "" };
    same(buildProfitAndLoss({ ...args, movements: paged }), buildProfitAndLoss({ ...args, movements: complete }), `Accounting P&L (${scope})`);
  }
  same(buildBalanceSheet({ ...tbArgs, movements: paged }), buildBalanceSheet({ ...tbArgs, movements: complete }), "Accounting Balance Sheet");
  const cmp = resolveComparativePeriod(periods, sep, "prior_period");
  same(buildProfitAndLossReport({ companyId: COMPANY, period: sep, scope: "period", comparison: cmp, movements: paged }), buildProfitAndLossReport({ companyId: COMPANY, period: sep, scope: "period", comparison: cmp, movements: complete }), "Reports P&L");
  same(buildBalanceSheetReport({ companyId: COMPANY, period: sep, comparison: cmp, movements: paged }), buildBalanceSheetReport({ companyId: COMPANY, period: sep, comparison: cmp, movements: complete }), "Reports Balance Sheet");
  same(buildTrialBalanceMovementReport({ companyId: COMPANY, period: sep, movements: paged }), buildTrialBalanceMovementReport({ companyId: COMPANY, period: sep, movements: complete }), "Reports Trial Balance");
  const tb = buildTrialBalance({ ...tbArgs, movements: paged });
  assert(tb.balanced && tb.rows.length === spend.length + 2, "balanced, every account present");
});

console.log(failures ? `\n${failures} check(s) failed` : "\nAll posted-movement pagination checks passed");
process.exit(failures ? 1 : 0);
