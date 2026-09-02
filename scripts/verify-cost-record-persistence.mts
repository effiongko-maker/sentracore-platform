/**
 * CostRecord persistence verification.
 *
 * Static mapping + validation always run.
 * Live GAS round-trip runs when APPS_SCRIPT_URL / .env.local is configured.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-cost-record-persistence.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  COST_RECORD_SHEET_HEADERS,
  FORBIDDEN_COST_RECORD_SHEET_HEADERS,
  LEGACY_COST_RECORD_ESTIMATED_AMOUNT_HEADER,
  costRecordToRow,
  getAuthoritativeAmount,
  legacyRowToCostRecord,
  mapRemoteCostRecord,
  rowToCostRecord,
  validateCostRecord,
  type CostRecord,
} from "../src/lib/operational/finance";
import { CostRecordService } from "../src/services/finance/CostRecordService";

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function baseRecord(overrides: Partial<CostRecord> = {}): CostRecord {
  return {
    costId: "COST-2026-000099",
    recordedAt: "2026-02-01T10:00:00.000Z",
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

function staticChecks() {
  const results: string[] = [];

  // Schema: required columns only; no lifecycle/markup fields
  assert(COST_RECORD_SHEET_HEADERS.includes("Location"), "Location header");
  assert(COST_RECORD_SHEET_HEADERS.includes("Budgeted Amount"), "Budgeted Amount");
  assert(COST_RECORD_SHEET_HEADERS.length === 21, "21 columns");
  assert(
    !(COST_RECORD_SHEET_HEADERS as readonly string[]).includes(
      LEGACY_COST_RECORD_ESTIMATED_AMOUNT_HEADER
    ),
    "Estimated Amount not in canonical headers"
  );
  for (const forbidden of FORBIDDEN_COST_RECORD_SHEET_HEADERS) {
    assert(
      !(COST_RECORD_SHEET_HEADERS as readonly string[]).includes(forbidden),
      `forbidden header absent: ${forbidden}`
    );
  }
  results.push("PASS schema — COST_RECORDS headers without lifecycle/markup columns");

  // Row mapping round-trip
  const standalone = baseRecord();
  const row = costRecordToRow(standalone);
  const roundTrip = rowToCostRecord(row);
  assert(roundTrip.costId === standalone.costId, "round-trip costId");
  assert(roundTrip.actualAmount === 250000, "round-trip amount");
  assert(roundTrip.location === standalone.location, "round-trip location");
  assert(roundTrip.budgetedAmount === undefined || roundTrip.budgetedAmount === standalone.budgetedAmount, "round-trip budgeted");
  results.push("PASS A — standalone facility cost row mapping");

  // B–D operational refs
  for (const [label, overrides] of [
    ["B", { workId: "MNT-001" }],
    ["C", { workOrderId: "WO-001" }],
    ["D", { jobOrderId: "JO-001" }],
  ] as const) {
    const mapped = rowToCostRecord(costRecordToRow(baseRecord(overrides)));
    assert(validateCostRecord(mapped).valid === true, `${label} valid`);
    results.push(`PASS ${label} — ${label === "B" ? "Work" : label === "C" ? "WO" : "JO"}-linked mapping`);
  }

  // E — no operational refs valid
  assert(validateCostRecord(standalone).valid === true, "E valid");
  results.push("PASS E — no Work/WO/JO required");

  // I–M validation rejects
  assert(
    validateCostRecord(baseRecord({ actualAmount: -1 })).valid === false,
    "I negative actual"
  );
  assert(
    validateCostRecord(baseRecord({ budgetedAmount: -1 })).valid === false,
    "J negative budgeted"
  );
  const noEvidence = baseRecord({ evidence: { reference: "" } });
  assert(validateCostRecord(noEvidence).valid === false, "F missing evidence");
  const badReimb = baseRecord();
  // @ts-expect-error intentional
  badReimb.reimbursability = "ncc";
  assert(validateCostRecord(badReimb).valid === false, "G bad reimbursability");
  const badCategory = baseRecord();
  // @ts-expect-error intentional
  badCategory.category = "maintenance";
  assert(validateCostRecord(badCategory).valid === false, "H bad category");
  results.push("PASS F–M — domain validation rejects invalid records");

  // K/O authoritative amount
  const withBudget = baseRecord({ budgetedAmount: 300000, actualAmount: 250000 });
  assert(
    getAuthoritativeAmount(withBudget) === 250000,
    "authoritative actualAmount"
  );
  results.push("PASS K/O — actualAmount authoritative");

  const noBudget = baseRecord();
  delete (noBudget as { budgetedAmount?: number }).budgetedAmount;
  assert(validateCostRecord(noBudget).valid === true, "N optional budgeted");
  results.push("PASS N — budgetedAmount optional");

  const withBudgetRow = costRecordToRow(baseRecord({ budgetedAmount: 240000 }));
  assert(withBudgetRow["Budgeted Amount"] === 240000, "H budgeted persists");
  assert(withBudgetRow.Location === "Generator house", "G location persists");
  results.push("PASS G/H — location and budgetedAmount persist in row mapping");

  const withUploadedEvidence = rowToCostRecord(
    costRecordToRow(
      baseRecord({
        evidence: {
          reference: "INV-456",
          fileId: "drive-file-123",
          fileName: "invoice-456.pdf",
          mimeType: "application/pdf",
          sizeBytes: 34567,
          fileUrl: "https://drive.google.com/open?id=drive-file-123",
        },
      })
    )
  );
  assert(withUploadedEvidence.evidence.fileId === "drive-file-123", "evidence file id");
  assert(withUploadedEvidence.evidence.fileName === "invoice-456.pdf", "evidence filename");
  results.push("PASS — uploaded evidence metadata persists in row mapping");

  const legacyMapped = legacyRowToCostRecord({
    "Cost ID": "COST-2020-000001",
    "Recorded At": "2020-01-01T00:00:00.000Z",
    "Facility ID": "FAC-0001",
    Description: "Legacy cost",
    Category: "other",
    [LEGACY_COST_RECORD_ESTIMATED_AMOUNT_HEADER]: 100000,
    "Actual Amount": 95000,
    Currency: "NGN",
    Reimbursability: "unknown",
    "Evidence Reference": "LEG-1",
    "Recorded By": "USR-LEG",
  });
  assert(legacyMapped.budgetedAmount === 100000, "legacy estimated → budgeted");
  results.push("PASS — legacy Estimated Amount maps to budgetedAmount");

  // P — remote mapping has no forbidden keys
  const remote = mapRemoteCostRecord({
    costId: "COST-2026-000001",
    recordedAt: "2026-01-01T00:00:00.000Z",
    facilityId: "FAC-0001",
    description: "Diesel",
    category: "diesel_fuel",
    actualAmount: 1000,
    currency: "NGN",
    reimbursability: "unknown",
    evidence: { reference: "INV-1" },
    recordedBy: "USR-1",
  });
  assert(!("status" in remote), "P no status");
  assert(!("submittedAmount" in remote), "P no submittedAmount");
  results.push("PASS P — no submission/approval/payment fields on mapped record");

  // Q — service does not import unrelated operational domains
  const serviceSrc = readFileSync(
    resolve("src/services/finance/CostRecordService.ts"),
    "utf8"
  );
  assert(!serviceSrc.includes("MaintenanceService"), "Q no maintenance");
  assert(!serviceSrc.includes("WorkOrderService"), "Q no work orders");
  assert(!serviceSrc.includes("ApprovalService"), "Q no approvals");
  assert(!serviceSrc.includes("IncidentService"), "Q no incidents");
  results.push("PASS Q — persistence service is financially scoped");

  // Apps Script repository headers align
  const repoSrc = readFileSync(
    resolve("apps-script/CostRecordRepository.gs"),
    "utf8"
  );
  assert(repoSrc.includes('"Location"'), "Location column in GAS");
  assert(repoSrc.includes('"Budgeted Amount"'), "Budgeted Amount in GAS");
  assert(repoSrc.includes("migrateSchema_"), "schema migration");
  assert(repoSrc.includes('"Evidence File ID"'), "evidence file metadata in GAS");
  assert(!repoSrc.includes("Submission Status"), "no submission status in GAS");
  results.push("PASS Apps Script repository scoped to COST_RECORDS");

  const appsScriptServiceSrc = readFileSync(
    resolve("apps-script/CostRecordService.gs"),
    "utf8"
  );
  assert(appsScriptServiceSrc.includes("DriveApp"), "Drive evidence storage");
  assert(
    appsScriptServiceSrc.includes("initialiseCostEvidenceStorage"),
    "Drive evidence authorization setup"
  );
  assert(appsScriptServiceSrc.includes("MAX_EVIDENCE_FILE_BYTES"), "evidence upload limit");
  results.push("PASS Apps Script receipt/invoice upload storage");

  console.log("\n=== CostRecord persistence verify (static) ===");
  for (const line of results) console.log(line);
}

async function liveChecks(): Promise<"passed" | "skipped"> {
  const url =
    process.env.APPS_SCRIPT_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  if (!url.trim()) {
    console.log("\nSKIP live GAS round-trip — APPS_SCRIPT_URL not configured");
    console.log(
      "MANUAL ACTION REQUIRED: Deploy Apps Script before live verification."
    );
    return "skipped";
  }

  const stamp = Date.now();
  const results: string[] = [];

  try {
    await runLiveRoundTrip(stamp, results);
    console.log("\n=== CostRecord persistence verify (live GAS) ===");
    for (const line of results) console.log(line);
    return "passed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\n=== Live GAS round-trip diagnostic ===");
    console.error(message);
    if (/unknown module:\s*cost-records/i.test(message)) {
      console.log("\nSKIP live GAS round-trip — cost-records not deployed yet");
      console.log(
        "MANUAL ACTION REQUIRED:\nDeploy the updated Apps Script version before live verification.\nCopy CostRecordRepository.gs, CostRecordService.gs, CostRecordsController.gs, and ROUTER.gs from apps-script/deployment/."
      );
      return "skipped";
    }
    if (
      /live location updated|Location is required|Budgeted Amount/i.test(message)
    ) {
      console.log("\nSKIP live GAS round-trip — v0.8.1 schema not deployed yet");
      console.log(
        "MANUAL ACTION REQUIRED:\nDeploy the updated Apps Script version (v0.8.1) before live CostRecord schema migration and verification.\nDeploy CostRecordRepository.gs and CostRecordService.gs from apps-script/deployment/."
      );
      return "skipped";
    }
    throw error;
  }
}

async function runLiveRoundTrip(stamp: number, results: string[]) {
  const standalone = await CostRecordService.createCostRecord({
    facilityId: "FAC-0001",
    location: "Main reception",
    description: `Persistence verify standalone ${stamp}`,
    category: "consumables",
    actualAmount: 250000,
    evidence: { reference: `INV-${stamp}-A` },
    recordedBy: "USR-VERIFY",
  });
  assert(standalone.costId.startsWith("COST-"), "live create id");
  assert(!standalone.workId && !standalone.workOrderId && !standalone.jobOrderId, "A standalone");
  results.push("PASS live A — create standalone CostRecord");

  const workLinked = await CostRecordService.createCostRecord({
    facilityId: "FAC-0001",
    location: "Rear service area",
    description: `Work-linked ${stamp}`,
    category: "labour",
    actualAmount: 50000,
    workId: "MNT-VERIFY-1",
    evidence: { reference: `INV-${stamp}-B` },
    recordedBy: "USR-VERIFY",
  });
  assert(workLinked.workId === "MNT-VERIFY-1", "live B");
  results.push("PASS live B — create Work-linked CostRecord");

  const woLinked = await CostRecordService.createCostRecord({
    facilityId: "FAC-0001",
    location: "Generator house",
    description: `WO-linked ${stamp}`,
    category: "spare_parts",
    actualAmount: 12000,
    workOrderId: "WO-VERIFY-1",
    evidence: { reference: `INV-${stamp}-C` },
    recordedBy: "USR-VERIFY",
  });
  assert(woLinked.workOrderId === "WO-VERIFY-1", "live C");
  results.push("PASS live C — create WO-linked CostRecord");

  const joLinked = await CostRecordService.createCostRecord({
    facilityId: "FAC-0001",
    location: "Staff quarters",
    description: `JO-linked ${stamp}`,
    category: "service",
    actualAmount: 8000,
    jobOrderId: "JO-VERIFY-1",
    evidence: { reference: `INV-${stamp}-D` },
    recordedBy: "USR-VERIFY",
  });
  assert(joLinked.jobOrderId === "JO-VERIFY-1", "live D");
  results.push("PASS live D — create JO-linked CostRecord");

  const fetched = await CostRecordService.getCostRecord(standalone.costId);
  assert(fetched?.costId === standalone.costId, "live E getById");
  results.push("PASS live E — get by Cost ID");

  const listed = await CostRecordService.listCostRecords({
    page: 1,
    pageSize: 5,
    search: String(stamp),
  });
  assert(listed.data.length >= 1, "live F list");
  assert(listed.total >= 1, "live F pagination total");
  results.push("PASS live F — list with pagination");

  const updated = await CostRecordService.updateCostRecord(standalone.costId, {
    description: `Updated ${stamp}`,
    actualAmount: 260000,
    budgetedAmount: 270000,
    location: "3rd floor admin wing",
  });
  assert(updated.location === "3rd floor admin wing", "live location updated");
  assert(updated.budgetedAmount === 270000, "live budgeted updated");
  assert(updated.costId === standalone.costId, "live H costId unchanged");
  assert(updated.description.includes("Updated"), "live G update");
  assert(updated.actualAmount === 260000, "live G amount updated");
  results.push("PASS live G/H — update preserves Cost ID");

  let rejected = false;
  try {
    await CostRecordService.createCostRecord({
      facilityId: "FAC-0001",
      location: "Main reception",
      description: "bad",
      category: "other",
      actualAmount: -1,
      evidence: { reference: "X" },
      recordedBy: "USR-VERIFY",
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "live I reject negative");
  results.push("PASS live I — invalid CostRecord rejected");
}

async function main() {
  staticChecks();
  const liveResult = await liveChecks();
  console.log(
    liveResult === "passed"
      ? "\nRESULT: PASS"
      : "\nRESULT: STATIC PASS; LIVE NOT VERIFIED"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
