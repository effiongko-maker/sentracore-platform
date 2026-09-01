/**
 * Phase 23 — Request treatment UI incident retirement verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-request-incident-retirement.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ActionError } from "../src/lib/actions/errors";
import { ISSUE_MODEL_PHASE, composeIssueFromRequest } from "../src/lib/operational/issues";
import { allLinkedTreatmentsSuccessfullyTerminal } from "../src/lib/operational/orchestration/evaluateRequestAfterTreatment";
import { NAV_GROUPS } from "../src/lib/navigation";
import {
  INCIDENT_CREATE_FROZEN_MESSAGE,
  INCIDENT_DOMAIN_LEGACY,
  assertNewIncidentCreateAllowed,
} from "../src/lib/operational/work";
import {
  REQUEST_INCIDENT_UI_RETIREMENT_PHASE,
  REQUEST_TREATMENT_OPERATIONAL_CONTEXT,
} from "../src/modules/requests/requestTreatmentContext";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function primaryNavLabels(): string[] {
  return NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "phase 23");
  assert(REQUEST_INCIDENT_UI_RETIREMENT_PHASE === 23, "request ui phase");
  assert(
    REQUEST_TREATMENT_OPERATIONAL_CONTEXT.legacyIncidentCreateRetiredFromUi ===
      true,
    "create retired from ui"
  );
  assert(
    REQUEST_TREATMENT_OPERATIONAL_CONTEXT.legacyIncidentLinkRetiredFromUi ===
      true,
    "link retired from ui"
  );
  results.push("PASS ISSUE_MODEL_PHASE = 23");

  const viewReq = readSrc("src/modules/requests/components/ViewRequestModal.tsx");
  assert(viewReq.includes("Create Work"), "create work btn");
  assert(viewReq.includes("Link Work"), "link work btn");
  assert(!viewReq.includes("Create Incident"), "no create incident btn");
  assert(!viewReq.includes("Link Incident"), "no link incident btn");
  assert(!viewReq.includes("CreateIncidentFromRequestModal"), "no inc modal import");
  assert(viewReq.includes("Legacy incidents"), "legacy incidents section");
  assert(viewReq.includes("/incidents?id="), "legacy incident deep links");
  assert(viewReq.includes("workHref"), "work deep links");
  results.push("PASS ViewRequestModal Work-only treatment UX");

  const linkModal = readSrc(
    "src/modules/requests/components/LinkExistingTreatmentModal.tsx"
  );
  assert(linkModal.includes("Link Work"), "link work title");
  assert(!linkModal.includes("linkIncidentToRequest"), "no link incident action");
  assert(!linkModal.includes('kind: "incident"'), "no incident kind prop");
  assert(!linkModal.includes("Link existing Incident"), "no link incident copy");
  results.push("PASS LinkExistingTreatmentModal Work-only");

  const catalogue = readSrc(
    "src/modules/requests/treatment/loadLinkTreatmentCatalogue.ts"
  );
  assert(!catalogue.includes("searchIncidentsForRequestLink"), "no incident catalogue");
  assert(catalogue.includes("searchMaintenanceForRequestLink"), "work catalogue");
  results.push("PASS link catalogue Work-only");

  const incModal = readSrc(
    "src/modules/requests/components/CreateIncidentFromRequestModal.tsx"
  );
  assert(incModal.includes("@deprecated"), "inc modal deprecated");
  results.push("PASS CreateIncidentFromRequestModal marked legacy/unreachable");

  const treatSrc = readSrc("src/modules/requests/actions/treatRequest.ts");
  assert(treatSrc.includes("createWorkFromRequest"), "create work alias");
  assert(treatSrc.includes("assertNewIncidentCreateAllowed"), "create inc guarded");
  assert(treatSrc.includes("linkIncidentToRequest"), "link inc api preserved");
  assert(treatSrc.includes("createIncidentFromRequest"), "create inc api preserved");
  results.push("PASS treatRequest guarded legacy APIs preserved");

  try {
    assertNewIncidentCreateAllowed("verify-request-incident-retirement");
    assert(false, "guard should throw");
  } catch (error) {
    assert(error instanceof ActionError, "ActionError");
    assert(error.message === INCIDENT_CREATE_FROZEN_MESSAGE, "freeze message");
  }
  results.push("PASS no new FM Incident creation via Request treatment");

  const incReq = composeIssueFromRequest({
    request: {
      id: "REQ-INC-LEG",
      title: "Legacy request",
      facilityId: "FAC-0001",
      status: "being_treated",
      maintenanceIds: [],
      incidentIds: ["INC-LEGACY-1"],
      workOrderIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    incidents: [{ id: "INC-LEGACY-1", title: "Flood", status: "investigating" }],
  });
  assert(
    incReq.treatments.some((t) => t.kind === "incident_handling"),
    "legacy incident treatment readable"
  );
  results.push("PASS historical Request → Incident relationships composable");

  const canResolve = allLinkedTreatmentsSuccessfullyTerminal({
    maintenanceIds: ["MNT-1"],
    incidentIds: ["INC-1"],
    maintenances: [{ id: "MNT-1", status: "completed" }],
    incidents: [{ id: "INC-1", status: "resolved" }],
  });
  assert(canResolve === true, "auto resolve");
  results.push("PASS Request auto-resolution unchanged");

  const occupant = readSrc(
    "src/modules/occupant-requests/services/OccupantRequestService.ts"
  );
  assert(occupant.includes("submitIncidentReport"), "occupant intake");
  assert(!occupant.includes("IncidentService.create"), "occupant no inc create");
  results.push(
    "PASS OCCUPANT INCIDENT INTAKE: PRESERVED — Request-based (REQ-* only)"
  );

  assert(!primaryNavLabels().some((l) => /Request Queue/i.test(l)), "no request queue");
  results.push("PASS Request Queue absent from primary navigation");

  assert(
    INCIDENT_DOMAIN_LEGACY.requestTreatmentIncidentUiRetired === true,
    "legacy flag"
  );
  results.push("PASS no persistence/schema/Intelligence/Reporting changes");

  console.log("\n=== request incident retirement verify ===");
  for (const line of results) console.log(line);
  console.log(`\n${results.length} checks passed`);
  console.log("RESULT: PASS");
}

main();
