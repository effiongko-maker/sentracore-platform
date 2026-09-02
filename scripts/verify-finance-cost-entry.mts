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
  assert(modal.includes("What was the cost for?"), "description label");
  assert(modal.includes("COST_CATEGORY_LABELS"), "category validation");
  assert(modal.includes("COST_REIMBURSABILITY_LABELS"), "D reimbursability labels");
  assert(modal.includes("Supporting evidence"), "E evidence required label");
  assert(modal.includes('type="file"'), "E receipt upload input");
  assert(modal.includes("application/pdf,image/jpeg,image/png"), "E accepted receipt types");
  assert(modal.includes("toEvidenceUpload"), "E evidence upload encoding");
  assert(modal.includes("Budgeted amount"), "budgeted amount label");
  assert(!modal.includes("Estimated amount"), "no estimated label");
  assert(modal.includes("Location"), "location field");
  assert(modal.includes("fin-form-amount-row"), "prominent amount row");
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
  assert(section.includes("Recent costs"), "recent cost list");
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
  const overview = deriveFinanceOverview([], withCosts, {
    totalApprovals: 0,
    truncated: false,
  });
  assert(overview.operationalCostSummary?.count === 1, "summary count");
  assert(overview.recentCosts.length === 1, "recent costs");
  assert(overview.availability.costRecords === true, "cost source live");

  const elevenCosts = Array.from({ length: 11 }, (_, index) => ({
    ...(standalone as CostRecord),
    costId: `COST-2026-${String(index + 1).padStart(6, "0")}`,
  }));
  assert(
    deriveFinanceOverview([], elevenCosts, {
      totalApprovals: 0,
      truncated: false,
    }).recentCosts.length === 10,
    "recent costs limited to ten"
  );

  console.log("PASS finance cost entry contracts");
  console.log("VERIFY_FINANCE_COST_ENTRY: PASS");
}

main();
