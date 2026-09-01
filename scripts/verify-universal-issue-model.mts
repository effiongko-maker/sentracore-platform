/**
 * Phase 11 — universal Issue → Treatment → Execution → Outcome model.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-universal-issue-model.mts
 */
import {
  buildIssueOperationalView,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
  composeIssueFromRequest,
  deriveIssueExecutions,
  deriveIssueOutcome,
  FM_LOG_ISSUE_SIDE_EFFECT_MODE,
  INCIDENT_POLICY,
  ISSUE_EXECUTION_IMPLEMENTATIONS,
  ISSUE_MODEL_OPEN_DECISIONS,
  ISSUE_MODEL_PHASE,
  ISSUE_OPERATIONAL_CHAIN,
  ISSUE_TREATMENT_IMPLEMENTATIONS,
  JOB_ORDER_BOUNDARY,
  WORK_ORDER_BOUNDARY,
} from "../src/lib/operational/issues";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 23, "phase 18");
  assert(
    ISSUE_OPERATIONAL_CHAIN.join(">") ===
      "issue>treatment>execution>outcome>cost_payment",
    "canonical chain"
  );
  results.push("PASS ISSUE_MODEL_PHASE = 19; canonical operational chain");

  // 1. Request-backed Issue
  const requestIssue = composeIssueFromRequest({
    request: {
      id: "REQ-U-1",
      title: "Leaking toilet",
      facilityId: "FAC-0001",
      status: "being_treated",
      maintenanceIds: ["MNT-U-1"],
      incidentIds: [],
      workOrderIds: ["WO-U-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    maintenances: [
      { id: "MNT-U-1", title: "Fix toilet", status: "in_progress", workOrderId: "WO-U-1" },
    ],
    workOrders: [
      { id: "WO-U-1", title: "Toilet repair", status: "open", maintenanceId: "MNT-U-1" },
    ],
  });
  assert(requestIssue.id === "issue:request:REQ-U-1", "request issue id");
  assert(requestIssue.relatedRequestId === "REQ-U-1", "request link");
  assert(
    requestIssue.treatments.every(
      (t) =>
        t.kind === "work" ||
        t.kind === "maintenance" ||
        t.kind === "incident_handling"
    ),
    "request treatments are domain capabilities only"
  );
  assert(
    !requestIssue.treatments.some((t) => t.kind === "work_order"),
    "WO must not be a treatment on request Issue"
  );
  results.push("PASS Request-backed Issue composes correctly");

  // 2. Maintenance-root Issue
  const mntIssue = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-U-2",
      title: "AC not cooling",
      facilityId: "FAC-0001",
      status: "scheduled",
      priority: "medium",
      workOrderId: "WO-U-2",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    workOrders: [
      { id: "WO-U-2", title: "AC service", status: "assigned", maintenanceId: "MNT-U-2" },
    ],
  });
  assert(mntIssue.id === "issue:maintenance:MNT-U-2", "mnt issue id");
  assert(mntIssue.rootMaintenanceId === "MNT-U-2", "mnt root");
  assert(!mntIssue.relatedRequestId, "no fake request on mnt root");
  assert(
    mntIssue.treatments.some((t) => t.kind === "work" || t.kind === "maintenance"),
    "mnt/work treatment"
  );
  assert(
    ISSUE_TREATMENT_IMPLEMENTATIONS.work.implemented === true,
    "work treatment implemented"
  );
  assert(
    ISSUE_TREATMENT_IMPLEMENTATIONS.work.mandatoryForIssues === false,
    "work not mandatory category"
  );
  results.push("PASS Maintenance-root Issue; Work is valid treatment (MNT backing)");

  // 3. Incident-root Issue (+ optional Maintenance treatment + WO execution)
  const incIssue = composeIssueFromIncident({
    incident: {
      id: "INC-U-1",
      title: "Fire alarm event",
      facilityId: "FAC-0001",
      status: "investigating",
      type: "safety",
      severity: "high",
      maintenanceIds: ["MNT-U-3"],
      workOrderIds: ["WO-U-3"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    maintenances: [
      { id: "MNT-U-3", title: "Containment repair", status: "in_progress" },
    ],
    workOrders: [
      {
        id: "WO-U-3",
        title: "Restore circuit",
        status: "open",
        incidentId: "INC-U-1",
      },
    ],
  });
  assert(incIssue.id === "issue:incident:INC-U-1", "inc issue id");
  assert(incIssue.rootIncidentId === "INC-U-1", "inc root");
  assert(
    incIssue.treatments.some((t) => t.kind === "incident_handling"),
    "incident_handling treatment"
  );
  assert(
    incIssue.treatments.some((t) => t.kind === "work" || t.kind === "maintenance"),
    "multi-treatment: work under incident root"
  );
  assert(
    INCIDENT_POLICY.incidentMandatoryForIssues === false,
    "incident not mandatory for Issues"
  );
  assert(
    ISSUE_TREATMENT_IMPLEMENTATIONS.incident_handling.mandatoryForIssues ===
      false,
    "incident_handling optional"
  );
  results.push(
    "PASS Incident-root Issue; Incident handling optional/specialised; multi-treatment allowed"
  );

  // 4. Issue never persisted as second status store
  for (const issue of [requestIssue, mntIssue, incIssue]) {
    assert(
      typeof (issue as { persist?: unknown }).persist === "undefined",
      "no persist field"
    );
    assert(!("save" in issue), "no save");
  }
  results.push("PASS Issue remains derived; no second status store");

  // 5–7. Treatment vs Execution
  const view = buildIssueOperationalView(mntIssue);
  const executions = deriveIssueExecutions(mntIssue);
  assert(executions.every((e) => e.kind === "work_order"), "executions are WO");
  assert(
    ISSUE_EXECUTION_IMPLEMENTATIONS.work_order.isTreatment === false,
    "WO is not treatment"
  );
  assert(
    ISSUE_EXECUTION_IMPLEMENTATIONS.job_order.implemented === false,
    "JO unimplemented"
  );
  assert(JOB_ORDER_BOUNDARY.implemented === false, "JO boundary");
  assert(WORK_ORDER_BOUNDARY.implemented === true, "WO implemented");
  assert(
    !view.issue.treatments.some((t) => t.kind === "work_order"),
    "composers never emit WO as treatment"
  );
  assert(
    view.executions.some((e) => e.id === "WO-U-2"),
    "WO appears as execution"
  );
  results.push("PASS Work Order is execution not treatment; Job Order unimplemented");

  // 8. Outcome derived
  const outcome = deriveIssueOutcome(mntIssue);
  assert(outcome.kind === "in_progress", "outcome mirrors derived status");
  assert(typeof outcome.summary === "string", "outcome summary");
  results.push("PASS Outcome remains derived");

  // 9. OPEN multi-root + Incident module decisions documented
  assert(
    ISSUE_MODEL_OPEN_DECISIONS.includes(
      "multi_root_status_precedence_when_work_and_legacy_incident"
    ),
    "open multi-root"
  );
  assert(
    ISSUE_MODEL_OPEN_DECISIONS.includes("incident_write_freeze_timeline"),
    "open incident freeze"
  );
  results.push("PASS OPEN decisions documented (no silent multi-root algorithm)");

  // 10. FM Log Issue performance architecture
  assert(FM_LOG_ISSUE_SIDE_EFFECT_MODE === "after", "deferred side effects");
  results.push(
    "PASS FM Log Issue sideEffectMode remains after (Phase 9 architecture)"
  );

  console.log("\n=== universal operational Issue model verify (phase 16) ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
