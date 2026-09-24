/** Historical register chronology through the real repository/PostgREST query and row mapping.
 * No network or database writes: PGlite executes SELECT over inline mixed-year fixtures only.
 * Run: node --import tsx scripts/verify-platform-finance-historical-facts-ordering.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PlatformFinanceHistoricalFactsRepository } from "../src/modules/platform-finance/server/PlatformFinanceHistoricalFactsRepository";

const db = new PGlite();
const originalFetch = globalThis.fetch;
const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://historical-order.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-credential";
const dates = [
  "2025-12-31T23:59:00Z", "2026-01-01T00:00:00Z", null,
  "2026-09-24T08:00:00Z", "2025-01-01T00:00:00Z", "2026-09-24T09:00:00Z",
  "2026-09-24T08:00:00Z", "2026-03-15T12:00:00Z", "2025-06-01T12:00:00Z",
  "2026-05-01T12:00:00Z", "2025-09-01T12:00:00Z", "2026-07-01T12:00:00Z",
  null, "2026-02-01T12:00:00Z",
];
const fixtures = dates.map((payment_datetime, index) => ({
  id: `fact-${index + 1}`, organisation_id: "org-a", code: `HIST-2026-${String(index + 1).padStart(6, "0")}`,
  record_origin: "migrated_historical", description: `Preserved evidence ${index + 1}`,
  submitted_amount: null, authorised_amount: null, amount_received: "10.25", currency: "NGN",
  source_payment_status: "Settled", payment_datetime, payment_datetime_source_text: payment_datetime,
  commercial_reference: `source-${index + 1}`, source_counterparty_text: "Source counterparty",
  fm_work_id: null, fm_work_instruction_id: null, created_by_profile_id: null, updated_by_profile_id: null,
  // Deliberately unrelated to business dates, including null-date rows imported most recently.
  created_at: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`, updated_at: "2026-09-24T12:00:00Z",
}));
const foreign = { ...fixtures[0], id: "foreign", organisation_id: "org-b", payment_datetime: "2027-01-01T00:00:00Z" };
const fixtureJson = JSON.stringify([...fixtures, foreign]);
let requests = 0;

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.origin, "https://historical-order.invalid");
  assert.equal(init?.method ?? "GET", "GET", "read-only request");
  assert.equal(url.pathname, "/rest/v1/platform_finance_historical_commercial_facts");
  assert.equal(url.searchParams.get("organisation_id"), "eq.org-a", "tenant scope preserved");
  const order = url.searchParams.get("order");
  assert.equal(order, "payment_datetime.desc.nullslast,code.asc", "business date first, deterministic reference tie-break");
  requests++;
  // Execute the emitted ordering in Postgres against inline fixtures, including NULL and timestamp semantics.
  const clauses = order!.split(",").map((part) => {
    const [column, direction, nulls] = part.split(".");
    assert.ok(["payment_datetime", "code"].includes(column));
    assert.ok(["asc", "desc"].includes(direction));
    return `${column} ${direction} ${nulls === "nullslast" ? "NULLS LAST" : ""}`;
  });
  const { rows } = await db.query<{ fact: typeof fixtures[number] }>(`
    SELECT fact FROM (
      SELECT fact, fact->>'organisation_id' AS organisation_id,
        (fact->>'payment_datetime')::timestamptz AS payment_datetime, fact->>'code' AS code
      FROM jsonb_array_elements($1::jsonb) AS fact
    ) evidence WHERE organisation_id = $2 ORDER BY ${clauses.join(", ")}
  `, [fixtureJson, "org-a"]);
  return new Response(JSON.stringify(rows.map((row) => row.fact)), { headers: { "Content-Type": "application/json" } });
};

try {
  const repo = new PlatformFinanceHistoricalFactsRepository("org-a");
  const rows = await repo.list();
  const expected = [6, 4, 7, 12, 10, 8, 14, 2, 1, 11, 9, 5, 3, 13].map((n) => `fact-${n}`);
  assert.deepEqual(rows.map((row) => row.id), expected, "mixed years, same-day times, equal timestamps, undated records");
  const withSpread = await repo.listWithDerivedSpread();
  assert.deepEqual(withSpread.map(({ fact }) => fact.id), expected, "API's derived-spread path preserves chronological order");
  assert.equal(requests, 2);
  for (const row of rows) {
    const source = fixtures.find((f) => f.id === row.id)!;
    assert.equal(row.paymentDatetime, source.payment_datetime);
    assert.equal(row.paymentDatetimeSourceText, source.payment_datetime_source_text);
    assert.equal(row.createdAt, source.created_at);
    assert.equal(row.recordOrigin, source.record_origin);
    assert.equal(row.commercialReference, source.commercial_reference);
  }
  assert.deepEqual(rows.slice(0, 10).map((row) => row.id), expected.slice(0, 10));
  assert.deepEqual(rows.slice(10, 20).map((row) => row.id), expected.slice(10));
  const matches = rows.filter((row) => row.description.toLowerCase().includes("evidence 1"));
  assert.deepEqual(matches.map((row) => row.id), ["fact-12", "fact-10", "fact-14", "fact-1", "fact-11", "fact-13"]);
  // The current UI consumes the complete ordered result before filtering and slicing; no per-page re-sort.
  const page = readFileSync("src/modules/platform-finance/components/PlatformFinanceHistoricalFactsPage.tsx", "utf8");
  assert.ok(page.includes("setRows(data)") && page.includes("return rows.filter((row)") && page.includes("filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)"));
  assert.ok(!/\.sort\(|\.reverse\(/.test(page));
  console.log("PASS Historical Data: payment chronology descending, deterministic ties, nulls last, mixed-year search/pagination, tenant scope and evidence unchanged; no network/database writes");
} finally {
  globalThis.fetch = originalFetch;
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  await db.close();
}
