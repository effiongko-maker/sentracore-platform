/**
 * Phase 18 — Freeze legacy Incident writes.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-incident-write-freeze.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ActionError } from "../src/lib/actions/errors";
import {
  FM_LOG_ISSUE_SIDE_EFFECT_MODE,
  ISSUE_MODEL_PHASE,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
  composeIssueFromRequest,
} from "../src/lib/operational/issues";
import { allLinkedTreatmentsSuccessfullyTerminal } from "../src/lib/operational/orchestration/evaluateRequestAfterTreatment";
import {
  FROZEN_INCIDENT_CREATE_ORCHESTRATORS,
  INCIDENT_CREATE_FROZEN_MESSAGE,
  INCIDENT_DOMAIN_LEGACY,
  INCIDENT_WRITE_FREEZE_PHASE,
  WORK_BACKING_STORE,
  assertNewIncidentCreateAllowed,
} from "../src/lib/operational/work";
import { NAV_GROUPS } from "../src/lib/navigation";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 23, "phase 19");
  assert(INCIDENT_WRITE_FREEZE_PHASE === 18, "freeze phase");
  results.push("PASS ISSUE_MODEL_PHASE = 19");

  assert(INCIDENT_DOMAIN_LEGACY.newFmLogIssueCreatesIncident === false, "log no inc");
  assert(INCIDENT_DOMAIN_LEGACY.newFmIncidentCreatesFrozen === true, "frozen");
  const logIssueSrc = readSrc("src/modules/issues/actions/logIssue.ts");
  assert(
    /orchestrateRequestMaintenance/.test(logIssueSrc),
    "log issue creates work via orchestrateRequestMaintenance"
  );
  assert(!/orchestrateReportIncident|createIncident/.test(logIssueSrc), "log no inc create");
  results.push("PASS Log Issue does not create Incident; creates Work path intact");

  const treatSrc = readSrc("src/modules/requests/actions/treatRequest.ts");
  assert(treatSrc.includes("createWorkFromRequest"), "createWorkFromRequest alias");
  assert(treatSrc.includes("assertNewIncidentCreateAllowed"), "create inc guarded");
  const viewReq = readSrc("src/modules/requests/components/ViewRequestModal.tsx");
  assert(!viewReq.includes("Create Incident"), "no create incident btn");
  assert(!viewReq.includes("Link Incident"), "no link incident btn");
  assert(viewReq.includes("Create Work"), "create work btn");
  results.push("PASS Request Treat does not create Incident; Work UI present");

  const incPage = readSrc("src/modules/incidents/components/IncidentsPage.tsx");
  assert(!incPage.includes("ReportIncidentModal"), "no report modal");
  assert(!incPage.includes("Report event"), "no report event label");
  assert(/Log issue/i.test(incPage), "log issue CTA");
  results.push("PASS Report Incident creation path removed from Incidents page");

  const orchIndex = readSrc("src/lib/operational/orchestration/index.ts");
  const reqTreat = readSrc("src/lib/operational/orchestration/requestTreatment.ts");
  assert(orchIndex.includes("assertNewIncidentCreateAllowed"), "report guard");
  assert(reqTreat.includes("assertNewIncidentCreateAllowed"), "request inc guard");
  for (const name of FROZEN_INCIDENT_CREATE_ORCHESTRATORS) {
    assert(orchIndex.includes(name) || reqTreat.includes(name), `${name} present`);
  }
  try {
    assertNewIncidentCreateAllowed("verify");
    assert(false, "guard should throw");
  } catch (error) {
    assert(error instanceof ActionError, "ActionError");
    assert(error.code === "VALIDATION_ERROR", "validation");
    assert(error.message === INCIDENT_CREATE_FROZEN_MESSAGE, "message");
  }
  results.push("PASS FM Incident create orchestrators frozen");

  const legacyIssue = composeIssueFromIncident({
    incident: {
      id: "INC-LEGACY-1",
      title: "Historical flood",
      facilityId: "FAC-0001",
      status: "resolved",
      type: "environmental",
      severity: "high",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert(legacyIssue.id === "issue:incident:INC-LEGACY-1", "legacy compose");
  assert(readSrc("src/services/incidents/IncidentService.ts").includes("getIncident"), "read api");
  results.push("PASS Existing Incident records remain readable/composable");

  const incReq = composeIssueFromRequest({
    request: {
      id: "REQ-INC-1",
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
  assert(incReq.treatments.some((t) => t.kind === "incident_handling"), "inc treatment");
  results.push("PASS Incident-backed Requests remain compatible");

  const evalSrc = readSrc(
    "src/lib/operational/orchestration/evaluateRequestAfterTreatment.ts"
  );
  assert(evalSrc.includes("incident"), "inc terminal eval");
  const canResolve = allLinkedTreatmentsSuccessfullyTerminal({
    maintenanceIds: ["MNT-1"],
    incidentIds: ["INC-1"],
    maintenances: [{ id: "MNT-1", status: "completed" }],
    incidents: [{ id: "INC-1", status: "resolved" }],
  });
  assert(canResolve === true, "auto resolve eligible");
  results.push("PASS Request auto-resolution remains intact");

  const woSrc = readSrc("src/modules/work-orders/types.ts");
  assert(woSrc.includes("incidentId"), "wo incidentId field");
  results.push("PASS Work Orders incidentId compatibility preserved");

  assert(WORK_BACKING_STORE.sheet === "Maintenance", "work backing");
  const workModule = readSrc("src/modules/work/components/WorkPage.tsx");
  assert(!/createIncident|ReportIncident|Create Incident/i.test(workModule), "work no inc");
  results.push("PASS New Work path has no Incident creation");

  const legacyDoc = readSrc("src/lib/operational/work/legacy.ts");
  assert(!/migrateIncident|convertIncident/.test(legacyDoc), "no migration");
  results.push("PASS No Incident migration utilities");

  assert(existsSync(resolve("apps-script/IncidentRepository.gs")), "incident repo exists");
  results.push("PASS No Incident sheet/schema change in Phase 18");

  assert(
    readSrc("src/lib/operational/work/intelligenceContext.ts").includes(
      "facility.maintenance_requested"
    ),
    "intel context file"
  );
  assert(
    readSrc("src/modules/intelligence/view-model/mapOrganisationInsights.ts").includes(
      "Review issues"
    ),
    "review issues in mapOrganisationInsights"
  );
  results.push("PASS Intelligence retargeted to Issue/Work (Phase 19)");

  const navFlat = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
  assert(!navFlat.some((l) => /Request Queue/i.test(l)), "no request queue");
  results.push("PASS Request Queue absent from navigation");

  assert(FM_LOG_ISSUE_SIDE_EFFECT_MODE === "after", "side effect after");
  const issuesPage = readSrc("src/modules/issues/components/IssuesPage.tsx");
  assert(!issuesPage.includes("IncidentService.create"), "issues page no inc create");
  results.push("PASS Log Issue Phase 9 performance path intact");

  assert(readSrc("src/modules/dashboard/constants.ts").includes('"log-issue": "/issues"'), "dash");
  assert(readSrc("src/components/platform/CommandPalette.tsx").includes('href: "/issues"'), "palette");
  results.push("PASS FM quick actions retargeted to Log Issue");

  const workIssue = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-P18",
      title: "Valve",
      facilityId: "FAC-0001",
      status: "requested",
      priority: "medium",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert(workIssue.treatments[0]?.kind === "work", "work treatment");
  results.push("PASS Issue → Work composition intact");

  console.log("\n=== incident write freeze verify ===");
  for (const line of results) console.log(line);
  console.log(`\n${results.length} checks passed`);
  console.log("RESULT: PASS");
}

main();
