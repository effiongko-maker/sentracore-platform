/**
 * FM visual / workflow cleanup (operator walkthrough): Costs & Claims navigation, Issue without execution basis,
 * FM "Both" facility selection.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-visual-workflow-cleanup.mts
 */
import { readFileSync } from "node:fs";
import {
  COSTS_CLAIMS_AREAS,
  activeCostsClaimsArea,
  isCostsClaimsPath,
} from "../src/modules/finance/costsClaimsSections";
import {
  BOTH_FACILITIES,
  facilityIdsForSelection,
  selectionForFacilityIds,
} from "../src/components/operational/AuthorisedFacilitySelect";
import {
  FmWorkValidationError,
  mapFmWorkRowToMaintenance,
  parseCreateWorkInput,
  parseUpdateWorkInput,
} from "../src/modules/maintenance/server/fmWorkDomain";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
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
function throws(fn: () => unknown, pattern: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof FmWorkValidationError && pattern.test(error.message);
  }
}

check("1 Costs & Claims: five areas, operator language, existing routes and gates", () => {
  assert(COSTS_CLAIMS_AREAS.map((a) => a.label).join("|") === "Costs|Payment Approvals|Pending Payments|Contract Payments|Reimbursements", "areas in order");
  assert(COSTS_CLAIMS_AREAS.find((a) => a.id === "payment-approvals")!.href === "/approvals" && COSTS_CLAIMS_AREAS.find((a) => a.id === "payment-approvals")!.capability === "ops.view", "Payment Approvals keeps its route + gate (not merged)");
  assert(COSTS_CLAIMS_AREAS.find((a) => a.id === "pending-payments")!.href === "/finance/submissions", "Pending Payments keeps its route");
  assert(!COSTS_CLAIMS_AREAS.some((a) => /client payment/i.test(a.label)), "no Client Payments label");
});

check("2 active area is right for list pages, record pages and deep links", () => {
  const cases: Array<[string, string | null, string | null, string | null]> = [
    ["/finance", null, null, null],
    ["/finance/costs", null, null, "costs"],
    ["/finance/costs/COST-2026-000001", null, null, "costs"],
    ["/approvals", null, null, "payment-approvals"],
    ["/finance/submissions", null, null, "pending-payments"],
    ["/finance/submissions", "payment_request", null, "pending-payments"],
    ["/finance/submissions", "contract_instalment", null, "contract-payments"],
    ["/finance/submissions", "reimbursement_claim", null, "reimbursements"],
    ["/finance/submissions/SUB-2026-000007", null, "contract_instalment", "contract-payments"],
    ["/finance/submissions/SUB-2026-000004", null, "payment_request", "pending-payments"],
    ["/finance/submissions/new", null, null, "reimbursements"],
    ["/finance/client-payments/new", null, null, "pending-payments"],
    ["/finance/monthly-payments", null, null, "contract-payments"],
  ];
  for (const [path, kind, recordKind, expected] of cases) {
    const got = activeCostsClaimsArea(path, kind, recordKind);
    assert(got === expected, `${path}${kind ? `?kind=${kind}` : ""}${recordKind ? ` [${recordKind}]` : ""} → ${got}, expected ${expected}`);
  }
  assert(isCostsClaimsPath("/approvals") && isCostsClaimsPath("/finance/submissions/X") && !isCostsClaimsPath("/work-orders") && !isCostsClaimsPath("/financeX"), "section membership");
});

check("3 navigation treatment: sidebar sub-nav + compact context line (no oversized tab bar on every page)", () => {
  const nav = code("src/modules/finance/components/CostsClaimsNav.tsx");
  assert(!/COSTS_CLAIMS_AREAS\.filter|\.map\(\(link\)/.test(nav) && /fm-cc-context/.test(nav) && /COSTS_CLAIMS_LABEL/.test(nav), "context line only (Costs & Claims › area)");
  const compass = code("src/components/platform/OrganisationalCompass.tsx");
  assert(/<CostsClaimsSubnav onNavigate=\{closeMobileNav\} \/>/.test(compass), "areas nested under the Costs & Claims sidebar parent");
  const subnav = code("src/components/platform/CostsClaimsSubnav.tsx");
  assert(/can\(area\.capability\)/.test(subnav) && /aria-current=\{active \? "page" : undefined\}/.test(subnav), "sub-nav filters by each area's own gate and marks the active one");
  for (const page of [
    "src/modules/approvals/components/ApprovalsPage.tsx",
    "src/modules/finance/components/SubmissionDetailPage.tsx",
    "src/modules/finance/components/CostDetailPage.tsx",
    "src/modules/finance/components/MonthlyContractPaymentDetailPage.tsx",
    "src/modules/finance/components/SubmissionsPage.tsx",
    "src/modules/finance/components/CostRecordsPage.tsx",
  ]) {
    assert(/<CostsClaimsNav/.test(code(page)), `${page} shows the Costs & Claims context`);
  }
  assert(/<CostsClaimsNav recordKind=\{submission\?\.submissionKind \?\? null\} \/>/.test(code("src/modules/finance/components/SubmissionDetailPage.tsx")), "record page names its own area on a deep link");
});

check("4 Pending Payments: raise request vs later receipt stay distinct; no Client Payment copy on touched surfaces", () => {
  assert(/Raise payment request/.test(src("src/modules/finance/components/FinanceHeader.tsx")) && /Raise payment request/.test(src("src/modules/finance/components/SubmissionsPage.tsx")), "+ Raise payment request discoverable");
  const form = code("src/modules/finance/components/ClientPaymentFormPage.tsx");
  assert(!/Record receipt|receivedAmount|ReimbursementPaymentService/.test(form), "raising a request records no receipt");
  assert(/Record receipt/.test(src("src/modules/finance/components/SubmissionDetailPage.tsx")), "receipt remains a later action on the Pending Payment");
  for (const f of [
    "src/modules/finance/components/SubmissionsPage.tsx",
    "src/modules/finance/components/SubmissionDetailPage.tsx",
    "src/modules/finance/components/MonthlyContractPaymentsPage.tsx",
    "src/modules/finance/components/ClientPaymentFormPage.tsx",
    "src/modules/work-orders/components/WorkOrderClientApprovalSection.tsx",
    "src/modules/workspace/attention.ts",
  ]) {
    const visible = code(f).replace(/import[^;]+;/g, "");
    assert(!/(["'`>]\s*|\s)Client [Pp]ayments?\b(?![A-Za-z])/.test(visible.replace(/[A-Za-z]+Client[Pp]ayment[A-Za-z]*/g, "")), `${f}: no "Client Payment" user copy`);
  }
  assert(!/"Client approval/.test(code("src/modules/workspace/attention.ts")), "Needs Attention says Payment Approval");
});

check("5 Issue creation no longer requires (or asks for) an execution basis; treatment keeps it", () => {
  const base = { title: "Leak", facilityId: "FAC-0001", priority: "medium" };
  assert(parseCreateWorkInput(base).commercialRoute === null, "absent basis = not decided (null)");
  assert(parseCreateWorkInput({ ...base, commercialRoute: "job_order" }).commercialRoute === "job_order", "an explicit basis still parses");
  assert(throws(() => parseCreateWorkInput({ ...base, commercialRoute: "both" }), /Invalid execution basis/), "invalid basis still refused");
  const modal = code("src/modules/issues/components/LogIssueModal.tsx");
  const action = code("src/modules/issues/actions/logIssue.ts");
  assert(!/ExecutionBasisField|commercialRoute/.test(modal + action), "Log Issue neither renders nor sends an execution basis");
  const work = code("src/modules/maintenance/components/MaintenanceFormModal.tsx");
  assert(/<ExecutionBasisField/.test(work) && /mode !== "edit" && !form\.commercialRoute/.test(work), "Work form (treatment) keeps and requires it on create");
  assert(/<ExecutionBasisField/.test(code("src/modules/incidents/components/ViewIncidentModal.tsx")), "Incident triage keeps it");
  assert(/Execution basis is required/.test(code("src/lib/operational/orchestration/index.ts")), "triage still validates it");
});

check("6 'Both' is a genuine multi-facility selection, never one arbitrary facility", () => {
  const authorised = [{ id: "csirt", name: "CSIRT" }, { id: "annex", name: "NCC Annex" }];
  assert(facilityIdsForSelection(BOTH_FACILITIES, authorised).join() === "csirt,annex", "Both → every authorised facility");
  assert(facilityIdsForSelection("annex", authorised).join() === "annex" && facilityIdsForSelection("", authorised).length === 0, "single / none");
  assert(selectionForFacilityIds(["annex", "csirt"], "annex") === BOTH_FACILITIES && selectionForFacilityIds(["annex"], "x") === "annex", "a multi-facility record re-opens as Both");
  const created = parseCreateWorkInput({ title: "Diesel supply", facilityIds: ["annex", "csirt"], priority: "medium" });
  assert(created.facilityId === "annex" && created.additionalFacilityRefs?.join() === "csirt", "Work create: primary + additional coverage");
  assert(parseCreateWorkInput({ title: "t", facilityId: "annex", priority: "medium" }).additionalFacilityRefs === undefined, "single facility unchanged");
  const upd = parseUpdateWorkInput({ id: "WRK-1", facilityIds: ["annex"] });
  assert(upd.facilityId === "annex" && upd.additionalFacilityRefs?.length === 0, "Work edit can collapse Both to one facility");
  assert(throws(() => parseCreateWorkInput({ title: "t", facilityIds: [], priority: "medium" }), /Facility is required/), "empty selection refused, never guessed");
  const repo = code("src/modules/maintenance/server/FmWorkRepository.ts");
  assert(/replaceCoveredFacilities\(created\.id, facilityId, additionalFacilityIds\)/.test(repo) && /\.from\("fm_work_facilities"\)\.insert\(/.test(repo), "coverage persisted in fm_work_facilities (existing pattern)");
  assert(/resolveAdditionalFacilities[\s\S]*?canOperateIn\(id\)/.test(repo), "every covered facility is facility-scope checked");
  const row = { facility_id: "annex", covered_facility_ids: ["annex", "csirt"], work_instruction_codes: [], job_order_codes: [] } as unknown as Parameters<typeof mapFmWorkRowToMaintenance>[0];
  assert(mapFmWorkRowToMaintenance(row).facilityIds?.join() === "annex,csirt", "Work read model exposes both facilities");
});

check("7 'Both' is offered only where the record can hold it — no fake Both on single-facility entities", () => {
  for (const f of ["src/modules/issues/components/LogIssueModal.tsx", "src/modules/maintenance/components/MaintenanceFormModal.tsx"]) {
    assert(/<AuthorisedFacilitySelect[\s\S]*?allowBoth/.test(code(f)), `${f} offers Both`);
  }
  for (const f of [
    "src/modules/finance/components/CostRecordFormModal.tsx",
    "src/modules/requests/components/RequestFormModal.tsx",
    "src/modules/incidents/components/IncidentFormModal.tsx",
  ]) {
    assert(!/allowBoth/.test(code(f)), `${f}: single-facility record — Both not faked`);
  }
  assert(!/Both/.test(code("src/modules/finance/components/ClientPaymentFormPage.tsx")), "Payment Request: Both needs a schema change (reported), not faked");
  const wo = code("src/modules/work-orders/components/WorkOrderSubmissionFormModal.tsx");
  assert(/>Both</.test(wo) && /facilities\.map\(\(f\) => f\.id\)/.test(wo), "WO/JO submission keeps NCC Annex / CSIRT / Both (all facility ids)");
});

check("8 Costs overview: plain hero, amount-only Pending Payments KPI, collapsible sidebar group, Payment Approvals card", () => {
  const header = code("src/modules/finance/components/FinanceHeader.tsx");
  assert(/Costs recorded · \{operatingYear\}/.test(header) && /cost record\$\{/.test(header), "hero: Costs recorded · year, amount, N cost records");
  assert(!/NGN 0 means|included once|Included: WO\/JO|operating year:|orderValueLabel/.test(header), "hero carries no reconciliation/accounting explanation");
  assert(/View details →/.test(header), "hero keeps View details");
  const page = code("src/modules/finance/components/FinancePage.tsx");
  assert(/formatFinancialAmount\(outstandingAmount, "NGN"\)/.test(page) && !/\$\{outstandingCount\} · /.test(page), "Pending Payments KPI is the outstanding amount only");
  assert(!/FinancePendingActionSection|Needs attention/.test(page), "no Needs attention block on the overview");
  const iSub = page.indexOf("<FinanceSubmissionsSection"), iApp = page.indexOf("<FinancePaymentApprovalsSection"), iOps = page.indexOf("<FinanceOperationalCostSection");
  assert(iSub > 0 && iSub < iApp && iApp < iOps, "row 1: Pending Payments | Payment Approvals; Operational Costs below");
  const card = code("src/modules/finance/components/FinancePaymentApprovalsSection.tsx");
  assert(/href="\/approvals"/.test(card) && /ageLabel/.test(card) && /amountLabel/.test(card) && !/Needs attention|fin-v13-attention/.test(card), "Payment Approvals card: status/age/amount, links to the area, no warning container");
  const compass = code("src/components/platform/OrganisationalCompass.tsx");
  assert(/aria-expanded=\{costsClaimsOpen\}/.test(compass) && /: inCostsClaims;/.test(compass) && /\{costsClaimsOpen \? \(\s*<Suspense/.test(compass), "Costs & Claims group toggles and opens on its routes");
});

check("9 Contract Payments: one lifecycle view (requested / received / outstanding) over existing records; no generic filters", () => {
  const subs = code("src/modules/finance/components/SubmissionsPage.tsx");
  assert(/if \(kind === "contract_instalment"\) return <ContractPaymentsPage \/>/.test(subs), "Contract Payments area renders the contract view, not the generic register");
  assert(!/View recorded monthly contract receipts|Record contract instalment/.test(subs), "no separate receipts link; no mislabelled action");
  const page = code("src/modules/finance/components/MonthlyContractPaymentsPage.tsx");
  assert(/Track contract instalments requested, received and outstanding\./.test(page) && /"Requested"/.test(page) && /"Received"/.test(page) && /"Outstanding"/.test(page), "position summary");
  assert(!/KIND_TABS|Payment requests|Reimbursement claims/.test(page), "no generic submission filters on the contract page");
  assert(/Raise contract instalment request/.test(page) && /client-payments\/new\?kind=contract_instalment/.test(page), "the action names what it does: raises a request");
  assert(/usedCodes/.test(page) && /\/finance\/submissions\/\$\{encodeURIComponent\(cp\.code\)\}/.test(page), "a live request is counted once and opens its own lifecycle (follow-ups, receipts)");
  const api = code("src/app/api/finance/monthly-payments/route.ts");
  assert(/fm_reimbursement_payments/.test(api) && !/\.(insert|update|upsert|delete)\(/.test(api), "receipts read, never written or merged");
  assert(/matches\.length !== 1\) return undefined/.test(api), "no guessed receipt relationship");
});

check("10 Diesel Usage: one chronological register across facilities; facility filter by authorised name", () => {
  assert(/DEFAULT_DIESEL_USAGE_SORT: DieselUsageSort = "date_desc"/.test(code("src/modules/diesel-usage/constants.ts")), "newest DATE first by default");
  const repo = code("src/modules/operational-logs/server/FmLogRepository.ts");
  assert(/sort === "date_desc"\) query = query\.order\("log_date", \{ ascending: false \}\)\.order\("created_at"/.test(repo), "date first, deterministic tie-break — never facility");
  const toolbar = code("src/modules/diesel-usage/components/DieselUsageToolbar.tsx");
  assert(/authorisedFacilities/.test(toolbar) && /All facilities/.test(toolbar) && /\{facility\.name\}/.test(toolbar) && !/Facility ID|FAC-0001/.test(toolbar), "facility filter lists authorised names, never raw ids");
  assert(/useFacilityName/.test(code("src/modules/diesel-usage/components/DieselUsageTable.tsx")), "register shows facility names");
});

console.log(failures ? `\n${failures} check(s) failed` : "\nAll FM visual/workflow cleanup checks passed");
process.exit(failures ? 1 : 0);
