/**
 * Executive Office — integration plumbing across Finance, Facility Management and ECC.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-executive-office-integration.mts
 *
 * Fixture-driven (no database): proves that records flowing through the source environments surface in the right
 * Executive Office concept, within the source's permissions and scope, with unknown ≠ zero ≠ no access.
 */
import { readFileSync, readdirSync } from "node:fs";
import { composeFinanceDecisionQueue } from "../src/modules/command-centre/server/composeFinanceDecisionQueue";
import { composeLastVisitChanges } from "../src/modules/command-centre/server/composeLastVisitChanges";
import { CommandCentreServerService } from "../src/modules/command-centre/server/CommandCentreServerService";
import type { FinanceOverviewSnapshot } from "../src/modules/platform-finance/overviewTypes";

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
const src = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = CommandCentreServerService.prototype as any;

const overview = (over: Partial<FinanceOverviewSnapshot> = {}): FinanceOverviewSnapshot => ({
  asOf: "2026-09-26T10:00:00Z",
  companies: [], selectedCompanyId: null, periods: [], selectedPeriodId: null, selectedCompanyLabel: "All companies",
  requests: {
    awaitingReview: { count: 2, totalAmount: 500 },
    pendingCeoApproval: { count: 1, totalAmount: 100 },
    queried: { count: 0, totalAmount: 0 },
    approvedThisMonth: { count: 3, totalAmount: 900 },
  },
  pendingCeoDecisions: { count: 1, totalAmount: 100 },
  receivables: null,
  needsAttention: [],
  accounting: { revenue: null, expenses: null, netProfit: null, journalEntries: 0, unpostedItems: 0, periodStatus: "open", periodLabel: "Sep 2026" },
  recentActivity: [],
  ...over,
});
const payable = (id: string, over: Record<string, unknown> = {}) => ({
  id, organisationId: "o", companyId: "co-1", createdByProfileId: "p", status: "approved", currency: "NGN",
  payableAmount: 1000, paidAmount: 0, outstandingAmount: 1000, payeeName: `Payee ${id}`, payeeType: "vendor",
  paymentDestination: null, description: null, dueDate: "2026-09-20", sourceType: "vendor_bill", sourceId: "s",
  projectContractRef: null, periodId: null, createdAt: "", updatedAt: "", ...over,
});
const ws = { platformFinance: true, facilityManagement: true, eccOperations: true };

await check("1 Decisions: only Finance items genuinely awaiting CEO approval, with provenance (environment, state, why, submitted)", () => {
  const q = composeFinanceDecisionQueue({
    requests: [
      { id: "r1", status: "pending_ceo_approval", currency: "NGN", requestedAmount: 100, categoryId: "c", purpose: "Generator repair", externalReference: null, submittedAt: "2026-09-20T09:00:00Z", updatedAt: "2026-09-21T00:00:00Z" },
      { id: "r2", status: "under_review", currency: "NGN", requestedAmount: 5, categoryId: "c", purpose: "Not yet", externalReference: null, submittedAt: null, updatedAt: "2026-09-21T00:00:00Z" },
    ] as never,
    vendorBills: [{ id: "b1", status: "pending_ceo_approval", currency: "NGN", billedAmount: 50, purpose: "Diesel", invoiceReference: "INV-9", payeeName: "Supplier", submittedAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z" }] as never,
    categories: [],
  });
  assert(q.items.length === 2 && q.items.every((i) => i.environment === "Finance" && i.stateLabel === "Awaiting CEO approval" && i.reason && i.href), "only pending CEO approvals, each with provenance");
  assert(q.items.find((i) => i.id === "finance_request:r1")?.submittedAt === "2026-09-20T09:00:00Z", "submitted date carried for age");
  const types = code("src/modules/command-centre/presentationTypes.ts");
  assert(/source: "finance_request" \| "vendor_bill";/.test(types) && !/fm_approval/.test(types), "FM client Payment Approvals can never become executive decisions");
});

await check("2 ECC keeps its own authority: without the ECC view grant, pulse and attention are restricted and ECC is never read", async () => {
  const access = { organisationId: "o", profileId: "p", session: { roleSlugs: [], enabledModules: [{ slug: "ecc_operations", status: "enabled" }] } };
  const pulse = await proto.composeEccPulse.call({}, access, ws, "unknown", { asOf: "2026-09-26T10:00:00Z", timeZone: null }, false);
  assert(pulse.state === "restricted" && /need ECC access/.test(pulse.lines[0]) && pulse.href === null, "ECC pulse restricted");
  const att = await proto.evaluateEccAttention.call({}, access, false);
  assert(att.result.status === "restricted" && att.result.items.length === 0, "ECC attention restricted, no items");
  const unreadable = await proto.evaluateEccAttention.call({}, access, null);
  assert(unreadable.result.status === "unavailable", "an unreadable grant is unavailable, not a denial");
  const service = code("src/modules/command-centre/server/CommandCentreServerService.ts");
  assert(/hasPlatformCapability\(access\.organisationId, access\.profileId, ECC_CAPABILITIES\.view\)/.test(service), "ECC view grant is read");
});

await check("3 Since your last visit: Finance activity only for the actor's Finance companies; nothing without Finance access", async () => {
  const rows: Record<string, unknown[]> = {
    finance_request_events: [
      { id: "e1", request_id: "r1", event_type: "submitted", created_at: "2026-09-26T09:30:00Z" },
      { id: "e2", request_id: "r2", event_type: "approved", created_at: "2026-09-26T09:31:00Z" },
    ],
    finance_requests: [
      { id: "r1", company_id: "co-1", purpose: "Visible", requested_amount: 10, currency: "NGN" },
      { id: "r2", company_id: "co-2", purpose: "Other company", requested_amount: 10, currency: "NGN" },
    ],
    finance_audit_events: [
      { id: "a1", action: "finance.transaction.posted", object_type: "finance_transaction", object_id: "t2", details: {}, created_at: "2026-09-26T09:40:00Z" },
      { id: "a2", action: "finance.period.closed", object_type: "finance_period", object_id: "per1", details: {}, created_at: "2026-09-26T09:41:00Z" },
    ],
    finance_transactions: [{ id: "t2", company_id: "co-2", reference: "X", description: "Other", amount: 5, currency: "NGN" }],
    finance_periods: [{ id: "per1", company_id: "co-1" }],
  };
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "gt", "lte", "in", "order", "limit"]) chain[m] = () => chain;
      chain.then = (resolveFn: (v: unknown) => void) => resolveFn({ data: rows[table] ?? [], error: null });
      return chain;
    },
  };
  const res = await composeLastVisitChanges({
    db: db as never, organisationId: "o", previous: "2026-09-26T09:00:00Z", asOf: "2026-09-26T10:00:00Z",
    visibility: { finance: { companyIds: ["co-1"] }, ecc: false }, workspaceEntry: { platformFinance: true, eccOperations: false }, timeZone: null,
  });
  const titles = res.items.map((i) => i.title).sort();
  assert(titles.join("|") === "Finance period closed|Financial request submitted", `only co-1 activity: ${titles.join("|")}`);
  assert(!res.items.some((i) => /Other/.test(i.detail)), "another company's records never appear");
  const none = await composeLastVisitChanges({
    db: db as never, organisationId: "o", previous: "2026-09-26T09:00:00Z", asOf: "2026-09-26T10:00:00Z",
    visibility: { finance: false, ecc: false }, workspaceEntry: { platformFinance: true, eccOperations: false }, timeZone: null,
  });
  assert(none.items.length === 0, "no Finance access ⇒ no Finance activity");
  const service = code("src/modules/command-centre/server/CommandCentreServerService.ts");
  assert(/Finance activity needs Finance access with company access/.test(service) && /ECC activity needs ECC access/.test(service), "partial visibility is stated in the feed scope");
});

await check("4 Financial Position: separate positions; no blended total; unknown ≠ zero ≠ no access; historical facts excluded", () => {
  const loaded = { status: "loaded", overview: overview(), payables: [payable("p1"), payable("p2", { currency: "USD", outstandingAmount: 20, dueDate: null })] };
  const fp = proto.composeFinancialPosition.call({}, loaded, { status: "loaded", amount: 67644404.05, count: 8 }, ws);
  assert(fp.finance.receivablesOpen.state === "no_access", "no receivables grant ⇒ no access (not zero)");
  assert(fp.finance.postedRevenue.state === "unavailable", "no posted accounting ⇒ unavailable (not zero)");
  assert(fp.finance.unpostedItems.state === "known" && fp.finance.unpostedItems.count === 0, "a known zero stays zero");
  assert(/NGN|₦/.test(fp.finance.payablesOpen.label) && /US\$|USD/.test(fp.finance.payablesOpen.label) && / \+ /.test(fp.finance.payablesOpen.label), "payables stated per currency, never blended");
  assert(fp.finance.payablesOverdue.count === 1, "overdue only with a stated past due date");
  assert(fp.facilityManagement.pendingPaymentsOutstanding.count === 8, "FM client pending payments kept separate");
  assert(!("total" in fp) && fp.exclusions.some((e: string) => /never added together/.test(e)) && fp.exclusions.some((e: string) => /Historical commercial facts/.test(e)), "no combined headline; exclusions stated");
  const restricted = proto.composeFinancialPosition.call({}, { status: "restricted" }, { status: "restricted" }, ws);
  assert(restricted.finance.payablesOpen.state === "no_access" && restricted.facilityManagement.pendingPaymentsOutstanding.state === "no_access", "restricted ⇒ no access");
  const failed = proto.composeFinancialPosition.call({}, { status: "unavailable" }, { status: "unavailable" }, ws);
  assert(failed.finance.payablesOpen.state === "unavailable" && failed.facilityManagement.pendingPaymentsOutstanding.state === "unavailable", "failure ⇒ unavailable");
});

await check("5 Commitments: only approved Finance payables with a due date; record detail needs payable access and company scope", () => {
  const loaded = {
    status: "loaded", overview: overview(),
    payables: [
      payable("due-past"),
      payable("due-future", { dueDate: "2026-10-30", status: "scheduled" }),
      payable("no-date", { dueDate: null }),
      payable("draft", { status: "draft" }),
      payable("paid", { status: "paid", outstandingAmount: 0 }),
      payable("other-co", { companyId: "co-2" }),
    ],
  };
  const full = proto.composeObligations.call({}, loaded, { companyIds: ["co-1"], payableView: true }, "2026-09-26T10:00:00Z");
  assert(/3 approved payables with a due date · 2 overdue/.test(full.summary), `summary ${full.summary}`);
  assert(full.items.map((i: { id: string }) => i.id).join() === "payable:due-past,payable:due-future", "only in-scope committed payables, by due date");
  assert(full.items[0].overdue === true && full.items[1].overdue === false, "overdue derived from the stated due date");
  const summaryOnly = proto.composeObligations.call({}, loaded, { companyIds: ["co-1"], payableView: false }, "2026-09-26T10:00:00Z");
  assert(summaryOnly.items.length === 0 && summaryOnly.state === "partial" && /payable access/.test(summaryOnly.reason), "no payable grant ⇒ summary only");
  const empty = proto.composeObligations.call({}, { status: "loaded", overview: overview(), payables: [] }, null, "2026-09-26T10:00:00Z");
  assert(empty.state === "empty", "no obligations ⇒ empty (known)");
  const failed = proto.composeObligations.call({}, { status: "loaded", overview: overview(), payables: null }, null, "2026-09-26T10:00:00Z");
  assert(failed.state === "error", "payables unreadable ⇒ error, never empty");
});

await check("6 Performance: derived from environment positions; throughput only where the source records it", () => {
  const pulse = [
    { domain: "finance", label: "Finance", state: "healthy", statusLabel: "Checked", lines: ["1 pending CEO decision"], href: "/platform-finance", disabledNavigationLabel: null },
    { domain: "facility_management", label: "Facility Management", state: "healthy", statusLabel: "Checked", lines: ["Work: 0 critical"], href: "/operations", disabledNavigationLabel: null },
    { domain: "ecc", label: "ECC", state: "restricted", statusLabel: "Restricted", lines: ["ECC figures need ECC access."], href: null, disabledNavigationLabel: null },
  ];
  const perf = proto.composePerformance.call({}, pulse, { status: "loaded", overview: overview(), payables: [] });
  assert(perf.length === 3 && perf.every((e: { position: string[] }, i: number) => e.position === pulse[i].lines), "position is the environment's own pulse");
  assert(/approved this month: 3/.test(perf[0].throughput[0]) && /no posted accounting yet/.test(perf[0].throughput[1]), "Finance throughput from its own overview");
  assert(perf[1].throughput.every((t: string) => /not established/.test(t)) && perf[2].throughput.every((t: string) => /not established/.test(t)), "no invented FM/ECC throughput");
  assert(!perf.some((e: { domain: string; label: string }) => e.domain === ("operations" as string) || e.label === "Operations"), "Facility Management is never 'Operations'");
});

await check("7 One Finance read per request; lens pages never move the last-visit marker; no Executive duplicate records", () => {
  const service = code("src/modules/command-centre/server/CommandCentreServerService.ts");
  assert((service.match(/getCommandCentreOverview\(/g) ?? []).length === 1 && (service.match(/listCommandCentrePayables\(/g) ?? []).length === 1, "Finance projection read in one place");
  assert(/const financeProjection = loadFinanceProjection\(access\);/.test(service) && /composeFinancePulse\(access, workspaceEntry, asOf, organisationTimeZone, financeProjection\)/.test(service), "the pulse reuses the shared projection");
  const writes = [...service.matchAll(/\.from\("([a-z_]+)"\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(/g)].map((m) => m[1]);
  assert(writes.every((t) => t === "command_centre_visits"), `only the visit marker is written: ${writes.join()}`);
  const lensDir = "src/app/(app)/command-centre";
  for (const lens of ["decisions", "performance", "financial-position", "commitments", "risk-attention"]) {
    const page = code(`${lensDir}/${lens}/page.tsx`);
    assert(/guardExecutiveOffice\(\)/.test(page) && /load\(gate\.access, \{ trackVisit: false \}\)/.test(page), `${lens}: gated, live projection, marker untouched`);
  }
  assert(/load\(gate\.access\)/.test(code(`${lensDir}/page.tsx`)), "the Overview alone tracks the visit");
  assert(readdirSync(lensDir).includes("performance"), "routes intact");
});

console.log(failures ? `\n${failures} check(s) failed` : "\nAll Executive Office integration checks passed");
process.exit(failures ? 1 : 0);
