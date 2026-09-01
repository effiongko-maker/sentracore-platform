/**
 * Finance operational view — mapping and UI contracts.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-operational-view.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Approval } from "../src/modules/approvals/types";
import { deriveFinanceOverview } from "../src/modules/finance/utils/deriveFinanceOverview";
import { formatFinancialAmount } from "../src/modules/finance/utils/formatFinancialAmount";
import { FINANCIAL_DOMAIN_IMPLEMENTED } from "../src/lib/operational/finance";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function fixtureApprovals(): Approval[] {
  const now = "2026-09-01T10:00:00.000Z";
  return [
    {
      id: "APR-1",
      title: "Generator remedial works",
      type: "variation",
      workOrderId: "WO-2026-000073",
      facilityId: "FAC-0001",
      status: "awaiting_decision",
      approvalAmount: 250000,
      currency: "NGN",
      submittedAt: "2026-08-28T09:00:00.000Z",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "APR-2",
      title: "Diesel top-up",
      type: "standard_maintenance",
      workOrderId: "WO-2026-000072",
      facilityId: "FAC-0001",
      status: "approved",
      approvalAmount: 180000,
      approvedAmount: 175000,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "APR-3",
      title: "Draft fumigation",
      type: "standard_maintenance",
      workOrderId: "WO-2026-000071",
      facilityId: "FAC-0002",
      status: "draft",
      approvalAmount: 90000,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "APR-4",
      title: "Returned HVAC scope",
      type: "equipment_replacement",
      workOrderId: "WO-2026-000070",
      facilityId: "FAC-0002",
      status: "returned",
      approvalAmount: 420000,
      currency: "NGN",
      lastActivityAt: "2026-08-30T12:00:00.000Z",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function staticChecks() {
  const page = readFileSync(
    resolve("src/modules/finance/components/FinancePage.tsx"),
    "utf8"
  );
  assert(page.includes("FinancePositionSection"), "position section");
  assert(page.includes("FinanceSubmissionsSection"), "submissions section");
  assert(page.includes("FinanceFlowRail"), "financial flow rail");
  assert(page.includes("FinanceHeader"), "finance header");
  assert(page.includes("FinanceIntelligencePreview"), "intelligence preview");
  assert(page.includes("fin-page"), "finance visual language");
  assert(!page.includes("Available Cash"), "no treasury concepts");
  assert(!page.includes("bank balance"), "no bank balance");

  const nav = readFileSync(resolve("src/lib/navigation.ts"), "utf8");
  assert(nav.includes('href: "/finance"'), "finance nav item");

  const layers = readFileSync(resolve("src/lib/platform/layers.ts"), "utf8");
  assert(layers.includes('href: "/finance"'), "finance in live OPERATING_LAYERS");
  assert(layers.includes('label: "Understand"'), "understand navigation group");

  const financeUiFiles = [
    "src/modules/finance/components/FinancePage.tsx",
    "src/modules/finance/components/FinancePositionSection.tsx",
    "src/modules/finance/components/FinanceOperationalCostSection.tsx",
    "src/modules/finance/components/FinanceSubmissionsSection.tsx",
    "src/modules/finance/components/FinanceCoverageSection.tsx",
    "src/modules/finance/utils/deriveFinanceOverview.ts",
  ];
  for (const file of financeUiFiles) {
    const src = readFileSync(resolve(file), "utf8");
    assert(!src.includes("CostRecord persistence"), `${file} has no dev wording`);
    assert(!src.includes("CostSubmission persistence"), `${file} has no dev wording`);
    assert(
      !src.includes("ContractPaymentRecord persistence"),
      `${file} has no dev wording`
    );
  }

  const workspaces = readFileSync(
    resolve("src/lib/platform/workspaces.ts"),
    "utf8"
  );
  assert(
    workspaces.includes('pathname.startsWith("/finance")'),
    "finance in isOperationsPath"
  );

  const route = readFileSync(
    resolve("src/app/(app)/finance/page.tsx"),
    "utf8"
  );
  assert(route.includes("FinancePage"), "finance route");

  console.log("PASS static finance view contracts");
}

function mappingChecks() {
  const overview = deriveFinanceOverview(fixtureApprovals(), {
    totalApprovals: 4,
    truncated: false,
  });

  assert(FINANCIAL_DOMAIN_IMPLEMENTED.ui === true, "finance ui flag");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.persistence === false, "no persistence");
  assert(overview.availability.clientAuthorisation === true, "approvals live");
  assert(overview.availability.costSubmissions === false, "no submissions yet");

  const awaiting = overview.pendingActions.filter(
    (item) => item.kind === "client_authorisation_awaiting"
  );
  assert(awaiting.length === 1, "one awaiting decision action");
  assert(awaiting[0]?.workOrderId === "WO-2026-000073", "WO reference preserved");

  const draft = overview.clientAuthorisationStages.find((s) => s.id === "draft");
  assert(draft?.count === 1, "one draft stage");
  assert(
    formatFinancialAmount(250000) === "NGN 250,000",
    "currency formatting"
  );

  const reimbursable = overview.reimbursementStages.every((s) => !s.available);
  assert(reimbursable, "reimbursement stages unavailable until persistence");

  assert(overview.position.length === 3, "three live authorisation position states");
  assert(
    overview.position.every((metric) => metric.available),
    "position metrics are live authorisation only"
  );

  console.log("PASS finance overview derivation");
}

function main() {
  staticChecks();
  mappingChecks();
  console.log("VERIFY_FINANCE_OPERATIONAL_VIEW: PASS");
}

main();
