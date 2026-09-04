/**
 * Finance Cost Entry workflow verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-cost-entry.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CostRecord } from "../src/lib/operational/finance/types";
import { deriveFinanceOverview } from "../src/modules/finance/utils/deriveFinanceOverview";
import { validateCostRecord } from "../src/lib/operational/finance";
import {
  caretFromKeepableCount,
  countKeepableChars,
  formatMonetaryDisplay,
  formatMonetaryFromNumber,
  parseMonetaryInput,
  sanitizeMonetaryInput,
} from "../src/modules/finance/utils/monetaryInput";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function buildDraftInput(overrides: Partial<CostRecord> = {}): Partial<CostRecord> {
  return {
    costId: "COST-PENDING",
    recordedAt: new Date().toISOString(),
    facilityId: "FAC-0001",
    location: "Generator house",
    description: "Cleaning materials purchased",
    category: "consumables",
    actualAmount: 250000,
    currency: "NGN",
    reimbursability: "unknown",
    evidence: { reference: "INV-12345" },
    recordedBy: "USR-001",
    ...overrides,
  };
}

function main() {
  const modal = readSrc("src/modules/finance/components/CostRecordFormModal.tsx");
  const page = readSrc("src/modules/finance/components/FinancePage.tsx");
  const section = readSrc(
    "src/modules/finance/components/FinanceOperationalCostSection.tsx"
  );
  const costRecordsPage = readSrc(
    "src/modules/finance/components/CostRecordsPage.tsx"
  );
  const hook = readSrc("src/modules/finance/hooks/useFinanceOverview.ts");

  assert(modal.includes("Record cost"), "A open cost entry CTA label");
  assert(modal.includes("What was this for?"), "description label");
  assert(modal.includes("How much?"), "amount label");
  assert(!modal.includes('label="Where?"'), "facility selector removed from UX");
  assert(!modal.includes("cost-facility"), "no facility dropdown field");
  assert(modal.includes('facility.id === "FAC-0001"'), "uses existing NCC Annex facility id");
  assert(modal.includes("scopedFacilityId"), "auto facility for NCC Annex deployment");
  assert(modal.includes("payload: CreateCostRecordInput"), "create payload preserved");
  assert(modal.includes("facilityId,"), "facilityId still submitted on create");
  assert(modal.includes("COST_CATEGORY_LABELS"), "category validation");
  assert(modal.includes("COST_REIMBURSABILITY_LABELS"), "D reimbursability labels");
  assert(modal.includes("Can we claim this back?"), "reimbursement eligibility label");
  assert(modal.includes("More details"), "secondary details section");
  assert(modal.includes("Receipt or invoice"), "E evidence required label");
  assert(
    modal.indexOf("Receipt or invoice") < modal.indexOf("More details"),
    "receipt/invoice is primary, not under More details"
  );
  assert(modal.includes('type="file"'), "E receipt upload input");
  assert(modal.includes("application/pdf,image/jpeg,image/png"), "E accepted receipt types");
  assert(modal.includes("toEvidenceUpload"), "E evidence upload encoding");
  assert(modal.includes("Budgeted amount"), "budgeted amount label");
  assert(!modal.includes("Estimated amount"), "no estimated label");
  assert(modal.includes("Location"), "location field");
  assert(modal.includes("MonetaryInput"), "comma-formatted actual/budgeted amounts");
  assert(!modal.includes('type="number"'), "amount fields are not native number inputs");
  assert(modal.includes('option value="none"'), "F standalone default");
  assert(modal.includes('value="work"'), "G work link option");
  assert(modal.includes('value="work_order"'), "H WO link option");
  assert(!modal.includes("Job Order linking is reserved"), "I no JO roadmap copy");
  assert(modal.includes("CostRecordService.createCostRecord"), "J uses persistence service");
  assert(modal.includes("createdRecord.costId"), "K returned cost id shown");
  assert(modal.includes("onSaved"), "L finance refresh hook");
  assert(modal.includes("disabled={saving}"), "M duplicate submit guard");
  assert(modal.includes("userFacingError"), "N sanitized errors");
  assert(!modal.includes("CostSubmission"), "O no submission create");
  assert(!modal.includes("MaintenanceService.listMaintenanceCatalog"), "P no full catalog");
  assert(modal.includes("pageSize: 50"), "P bounded work/WO fetch");
  assert(modal.includes("UserService.getCurrentUser"), "recordedBy from session");
  assert(!modal.includes("jobOrderId"), "no fake JO field in form");

  assert(page.includes("CostRecordFormModal"), "finance page wires modal");
  assert(page.includes("onRecordCost"), "record cost entry point");
  assert(section.includes("Latest recorded spend"), "recent cost list");
  assert(section.includes('href="/finance/costs"'), "recent costs links to full register");
  assert(costRecordsPage.includes("COST_RECORDS_PAGE_SIZE = 25"), "full cost register paginates");
  assert(hook.includes("CostRecordService.listCostRecords"), "overview loads costs");
  assert(hook.includes("Promise.all"), "parallel fetch not fan-out chain");

  const invalid = buildDraftInput({ evidence: { reference: "" } });
  assert(validateCostRecord(invalid).valid === false, "evidence validation");

  const standalone = buildDraftInput();
  assert(validateCostRecord(standalone).valid === true, "standalone valid");

  const withCosts: CostRecord[] = [
    {
      ...(standalone as CostRecord),
      costId: "COST-2026-000001",
      location: "Generator house",
    },
  ];
  const overview = deriveFinanceOverview({
    approvals: [],
    totalApprovals: 0,
    costRecords: withCosts,
    totalCostRecords: withCosts.length,
    submissions: [],
    totalSubmissions: 0,
  });
  assert(overview.operationalCostSummary?.totalCount === 1, "summary count");
  assert(overview.recentCosts.length === 1, "recent costs");
  assert(overview.availability.costRecords === true, "cost source live");

  const elevenCosts = Array.from({ length: 11 }, (_, index) => ({
    ...(standalone as CostRecord),
    costId: `COST-2026-${String(index + 1).padStart(6, "0")}`,
  }));
  assert(
    deriveFinanceOverview({
      approvals: [],
      totalApprovals: 0,
      costRecords: elevenCosts,
      totalCostRecords: elevenCosts.length,
      submissions: [],
      totalSubmissions: 0,
    }).recentCosts.length === 5,
    "recent costs limited to five"
  );

  assert(
    formatMonetaryFromNumber(5_625_000) === "5,625,000",
    "formats millions with commas"
  );
  assert(
    formatMonetaryFromNumber(4_500_000) === "4,500,000",
    "formats 4.5m with commas"
  );
  assert(parseMonetaryInput("5,625,000") === 5_625_000, "parses grouped integer");
  assert(parseMonetaryInput("4,500,000.50") === 4_500_000.5, "parses grouped decimal");
  assert(
    formatMonetaryDisplay(sanitizeMonetaryInput("NGN 5,625,000")) ===
      "5,625,000",
    "paste strips currency text"
  );
  assert(
    formatMonetaryDisplay(sanitizeMonetaryInput("5625.")) === "5,625.",
    "keeps trailing decimal while typing"
  );
  assert(parseMonetaryInput("") === undefined, "empty is not a number");
  const grouped = "5,625,000";
  assert(countKeepableChars(grouped, 3) === 2, "commas are not keepable");
  assert(
    caretFromKeepableCount(grouped, 2) === 3,
    "caret restored after grouped digit"
  );

  const costDetail = readSrc("src/modules/finance/components/CostDetailPage.tsx");
  assert(costDetail.includes("MonetaryInput"), "cost edit uses monetary input");
  assert(
    costDetail.includes("selectedWorkOrderId"),
    "classification save uses selected Work Order ID"
  );
  assert(
    costDetail.includes("selectedWorkId"),
    "classification save uses selected Work ID"
  );
  assert(
    costDetail.includes("payload.workOrderId = selectedWorkOrderId"),
    "Work Order selection persists the Work Order ID"
  );
  assert(
    costDetail.includes("payload.workId = selectedWorkId"),
    "Work selection persists the Work ID"
  );
  assert(
    costDetail.includes('form.relatedLink === "work_order" ? form.workOrderId.trim()'),
    "Work Order selection maps to workOrderId from select value, not a display label"
  );
  assert(
    costDetail.includes("else if (record.workId)"),
    "empty workId is only sent when clearing a previous work link"
  );

  const costService = readSrc("src/services/finance/CostRecordService.ts");
  assert(
    costService.includes("optionalIdForValidation"),
    "empty optional link IDs clear on update without failing validation"
  );

  console.log("PASS finance cost entry contracts");
  console.log("VERIFY_FINANCE_COST_ENTRY: PASS");
}

main();
