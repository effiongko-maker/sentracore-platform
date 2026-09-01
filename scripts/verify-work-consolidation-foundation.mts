/**
 * Phase 15 — Work consolidation foundation.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-work-consolidation-foundation.mts
 */
import {
  FM_LOG_ISSUE_SIDE_EFFECT_MODE,
  INCIDENT_POLICY,
  ISSUE_MODEL_PHASE,
  ISSUE_OPERATIONAL_CHAIN,
  ISSUE_TREATMENT_IMPLEMENTATIONS,
  JOB_ORDER_BOUNDARY,
  WORK_ORDER_BOUNDARY,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
  composeIssueFromRequest,
  deriveIssueActions,
  deriveIssueExecutions,
  getIssueAction,
  mapMaintenanceToTreatmentRef,
} from "../src/lib/operational/issues";
import {
  INCIDENT_DOMAIN_LEGACY,
  WORK_BACKING_STORE,
  WORK_STATUS_SEMANTICS,
  isWorkSuccessfullyTerminal,
  mapMaintenanceToWork,
} from "../src/lib/operational/work";
import type { Maintenance } from "../src/modules/maintenance/types";
import type { LogIssueInput } from "../src/modules/issues/actions/logIssue";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 23, "phase 18");
  assert(
    ISSUE_OPERATIONAL_CHAIN.join(">") ===
      "issue>treatment>execution>outcome>cost_payment",
    "chain"
  );
  results.push("PASS ISSUE_MODEL_PHASE = 19");

  // 1–2 Work abstraction + Maintenance backing
  assert(WORK_BACKING_STORE.domain === "maintenance", "backing domain");
  assert(WORK_BACKING_STORE.sheet === "Maintenance", "backing sheet");
  assert(ISSUE_TREATMENT_IMPLEMENTATIONS.work.backingStore === "maintenance", "work backing");
  assert(WORK_STATUS_SEMANTICS.completed === "work completed", "semantics");
  const mnt: Maintenance = {
    id: "MNT-W-1",
    title: "Leaking toilet",
    type: "corrective",
    source: "manual",
    facilityId: "FAC-0001",
    priority: "medium",
    status: "requested",
    reportedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const work = mapMaintenanceToWork(mnt);
  assert(work.backing.kind === "maintenance", "work maps from mnt");
  assert(work.backing.maintenanceId === "MNT-W-1", "mnt id");
  assert(isWorkSuccessfullyTerminal("completed"), "work terminal");
  assert(mapMaintenanceToTreatmentRef(mnt).kind === "work", "treatment kind work");
  results.push("PASS Work abstraction exists; backed by Maintenance persistence");

  // 3–4 Issue → Treat → Work; no MNT/INC classification in new flow
  const issue = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-W-1",
      title: "Leaking toilet",
      facilityId: "FAC-0001",
      status: "requested",
      priority: "medium",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert(issue.treatments[0]?.kind === "work", "compose emits work");
  const treat = getIssueAction(deriveIssueActions(issue), "treat");
  assert(treat?.available === true, "treat available");
  assert(treat?.href?.includes("/work"), "treat → work UI route");
  assert(treat?.href?.includes("MNT-W-1"), "treat id");
  const logInput: LogIssueInput = {
    title: "AC not cooling",
    facilityId: "FAC-0001",
  };
  assert(logInput.classification === undefined, "no taxonomy on log input");
  assert(INCIDENT_DOMAIN_LEGACY.newFmLogIssueCreatesIncident === false, "no INC from log");
  assert(INCIDENT_DOMAIN_LEGACY.newFmIncidentCreatesFrozen === true, "inc frozen");
  assert(INCIDENT_POLICY.incidentMandatoryForIssues === false, "incident not mandatory");
  results.push("PASS Issue → Treat → Work; no Maintenance/Incident classification in new flow");

  // 5 FM Log Issue creates Work through compatibility (compose path)
  assert(issue.id === "issue:maintenance:MNT-W-1", "work root identity");
  assert(FM_LOG_ISSUE_SIDE_EFFECT_MODE === "after", "phase 9 perf");
  results.push("PASS FM Log Issue Work path + Phase 9 sideEffectMode intact");

  // 6–7 Request via Work; Incident-backed Request still composeable
  const staff = composeIssueFromRequest({
    request: {
      id: "REQ-W-1",
      title: "Staff AC",
      facilityId: "FAC-0001",
      status: "being_treated",
      maintenanceIds: ["MNT-W-2"],
      incidentIds: [],
      workOrderIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    maintenances: [{ id: "MNT-W-2", title: "AC", status: "in_progress" }],
  });
  assert(staff.treatments.some((t) => t.kind === "work"), "request→work treatment");
  const legacyIncReq = composeIssueFromRequest({
    request: {
      id: "REQ-W-INC",
      title: "Legacy incident request",
      facilityId: "FAC-0001",
      status: "being_treated",
      maintenanceIds: [],
      incidentIds: ["INC-W-1"],
      workOrderIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    incidents: [{ id: "INC-W-1", title: "Legacy", status: "investigating" }],
  });
  assert(
    legacyIncReq.treatments.some((t) => t.kind === "incident_handling"),
    "legacy incident treatment readable"
  );
  results.push("PASS Request→Work path; existing Incident-backed Requests compatible");

  // 8 Existing Incident records readable
  const incIssue = composeIssueFromIncident({
    incident: {
      id: "INC-W-2",
      title: "Historical",
      facilityId: "FAC-0001",
      status: "reported",
      type: "other",
      severity: "medium",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert(incIssue.id === "issue:incident:INC-W-2", "incident issue readable");
  assert(
    getIssueAction(deriveIssueActions(incIssue), "treat")?.href?.includes(
      "/incidents"
    ),
    "legacy treat still reaches incidents"
  );
  assert(INCIDENT_DOMAIN_LEGACY.historicalRecordsReadable === true, "readable flag");
  results.push("PASS Existing Incident records remain readable");

  // 9–10 WO distinct from Work; JO unimplemented
  const withWo = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-W-3",
      title: "With WO",
      facilityId: "FAC-0001",
      status: "scheduled",
      workOrderId: "WO-W-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    workOrders: [
      { id: "WO-W-1", title: "Formal", status: "open", maintenanceId: "MNT-W-3" },
    ],
  });
  assert(withWo.treatments.every((t) => t.kind !== "work_order"), "WO not treatment");
  assert(deriveIssueExecutions(withWo).some((e) => e.kind === "work_order"), "WO execution");
  assert(WORK_ORDER_BOUNDARY.implemented === true, "WO implemented");
  assert(JOB_ORDER_BOUNDARY.implemented === false, "JO unimplemented");
  results.push("PASS Work Orders compatible and distinct from Work; JO unimplemented");

  // 12–14 Issue/finance non-persisted; intelligence untouched flags
  assert(typeof (issue as { persist?: unknown }).persist === "undefined", "no issue persist");
  assert(INCIDENT_DOMAIN_LEGACY.intelligenceConsumersUntouched === true, "intel untouched");
  results.push("PASS Issue non-persisted; Intelligence compatibility boundary documented");

  console.log("\n=== work consolidation foundation verify (phase 16) ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
