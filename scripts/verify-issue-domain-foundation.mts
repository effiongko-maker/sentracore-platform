/**
 * Issue operational model (Phase 6) — roots, outcome, actions, authority, cost contract.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-issue-domain-foundation.mts
 */
import {
  buildIssueOperationalView,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
  composeIssueFromRequest,
  composeOperationalViewFromTreatmentDetail,
  COST_SUBMISSION_FLOW,
  deriveIssueActions,
  deriveIssueOutcome,
  getIssueAction,
  INCIDENT_POLICY,
  isIncidentSuccessfullyTerminal,
  isMaintenanceSuccessfullyTerminal,
  isSignificantIncidentType,
  ISSUE_AUTHORITY_ROLES,
  JOB_ORDER_BOUNDARY,
  mapIncidentStatusToIssueStatus,
  mapIncidentToTreatmentRef,
  mapIncidentTypeToClassification,
  mapMaintenanceStatusToIssueStatus,
  mapMaintenanceToTreatmentRef,
  mapRequestStatusToIssueStatus,
  mapWorkOrderToExecutionRef,
  mapWorkOrderToIssueRef,
  WORK_ORDER_BOUNDARY,
  ISSUE_MODEL_PHASE,
} from "../src/lib/operational/issues";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const results: string[] = [];
  assert(ISSUE_MODEL_PHASE === 6, "phase 6");
  results.push("PASS ISSUE_MODEL_PHASE = 6");

  // Model corrections: WO / JO / authorities
  assert(WORK_ORDER_BOUNDARY.approvalAuthority === "annex_director", "WO annex");
  assert(JOB_ORDER_BOUNDARY.approvalAuthority === "hq_evc", "JO hq_evc");
  assert(JOB_ORDER_BOUNDARY.issuedBy === "procurement", "JO procurement");
  assert(JOB_ORDER_BOUNDARY.implemented === false, "JO not implemented");
  assert(
    mapWorkOrderToExecutionRef({
      id: "WO-1",
      status: "open",
      title: "t",
    }).approvalAuthority === "annex_director",
    "WO execution not hq_formal"
  );
  assert(
    ISSUE_AUTHORITY_ROLES.includes("client_ncc") &&
      ISSUE_AUTHORITY_ROLES.includes("annex_director") &&
      ISSUE_AUTHORITY_ROLES.includes("hq_evc") &&
      ISSUE_AUTHORITY_ROLES.includes("procurement"),
    "authority roles"
  );
  assert(COST_SUBMISSION_FLOW[0] === "actual_cost", "cost flow");
  results.push("PASS WO/JO/authority/cost model corrections");

  // Status maps
  assert(mapRequestStatusToIssueStatus("submitted") === "reported", "req");
  assert(mapMaintenanceStatusToIssueStatus("requested") === "reported", "mnt reported");
  assert(mapMaintenanceStatusToIssueStatus("in_progress") === "being_treated", "mnt treat");
  assert(mapMaintenanceStatusToIssueStatus("completed") === "resolved", "mnt resolved");
  assert(mapIncidentStatusToIssueStatus("reported") === "reported", "inc reported");
  assert(mapIncidentStatusToIssueStatus("investigating") === "being_treated", "inc treat");
  assert(mapIncidentStatusToIssueStatus("resolved") === "resolved", "inc resolved");
  results.push("PASS status derivation maps (Request/MNT/INC)");

  assert(isMaintenanceSuccessfullyTerminal("completed"), "mnt terminal");
  assert(isIncidentSuccessfullyTerminal("resolved"), "inc terminal");
  results.push("PASS treatment terminal semantics unchanged");

  // Request → Issue
  const fromReq = composeIssueFromRequest({
    request: {
      id: "REQ-2026-000100",
      title: "AC not cooling",
      facilityId: "FAC-0001",
      status: "being_treated",
      requestType: "maintenance",
      maintenanceIds: ["MNT-1"],
      incidentIds: [],
      workOrderIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    maintenances: [
      { id: "MNT-1", title: "AC repair", status: "scheduled", workOrderId: "WO-1" },
    ],
    workOrders: [
      { id: "WO-1", title: "Inspect AC", status: "open", maintenanceId: "MNT-1" },
    ],
  });
  assert(fromReq.id.startsWith("issue:request:"), "req issue id");
  assert(fromReq.source === "staff_request", "staff source");
  const reqView = buildIssueOperationalView(fromReq);
  assert(
    getIssueAction(reqView.actions, "treat")?.href?.includes("/maintenance"),
    "treat → mnt"
  );
  assert(
    mapWorkOrderToExecutionRef(fromReq.workOrders[0]!).approvalAuthority !==
      "hq_formal",
    "not hq_formal"
  );
  results.push("PASS Request → Issue + treat routing");

  // FM ordinary → Maintenance root
  const fromMnt = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-900",
      title: "Leaking tap",
      facilityId: "FAC-0001",
      status: "in_progress",
      priority: "medium",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  });
  assert(fromMnt.id === "issue:maintenance:MNT-900", "mnt issue id");
  assert(fromMnt.source === "facility_manager", "fm source");
  assert(fromMnt.rootMaintenanceId === "MNT-900", "root mnt");
  assert(fromMnt.status === "being_treated", "derived from mnt");
  assert(!fromMnt.relatedRequestId, "no fake request");
  const mntView = buildIssueOperationalView(fromMnt);
  assert(getIssueAction(mntView.actions, "treat")?.available === true, "fm treat");
  assert(mntView.outcome.kind === "in_progress", "fm outcome");
  results.push("PASS FM ordinary Issue from Maintenance root");

  // FM significant → Incident root
  const fromInc = composeIssueFromIncident({
    incident: {
      id: "INC-900",
      title: "Flooding",
      facilityId: "FAC-0001",
      status: "investigating",
      type: "environmental",
      severity: "critical",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  });
  assert(fromInc.id === "issue:incident:INC-900", "inc issue id");
  assert(fromInc.rootIncidentId === "INC-900", "root inc");
  assert(fromInc.classification === "environmental", "classif");
  assert(fromInc.status === "being_treated", "inc status");
  assert(isSignificantIncidentType("environmental"), "significant type");
  assert(!isSignificantIncidentType("complaint"), "complaint not significant list");
  assert(INCIDENT_POLICY.ordinaryDefault === "maintenance", "ordinary default");
  results.push("PASS FM significant Issue from Incident root + incident policy");

  // Treatment vs execution: no WO required
  const simple = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-901",
      title: "Replace bulb",
      facilityId: "FAC-0001",
      status: "completed",
      completedAt: "2026-01-03T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
  });
  assert(simple.status === "resolved", "mnt alone resolves");
  assert(simple.workOrders.length === 0, "no wo forced");
  assert(
    deriveIssueActions(simple).find((a) => a.id === "view_related_work")
      ?.available === false,
    "no related work"
  );
  results.push("PASS Maintenance alone can resolve without Work Order");

  // Multi-treatment staff path still works
  const multi = composeIssueFromRequest({
    request: {
      id: "REQ-200",
      title: "Water ingress",
      facilityId: "FAC-0001",
      status: "being_treated",
      requestType: "incident",
      maintenanceIds: ["MNT-A"],
      incidentIds: ["INC-1"],
      workOrderIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    maintenances: [{ id: "MNT-A", title: "Dry", status: "in_progress" }],
    incidents: [
      {
        id: "INC-1",
        title: "Water",
        status: "investigating",
        type: "environmental",
      },
    ],
  });
  assert(multi.treatments.length === 2, "multi");
  assert(
    getIssueAction(deriveIssueActions(multi), "treat")?.href?.includes(
      "MNT-A"
    ),
    "prefer mnt for treat when both active"
  );
  results.push("PASS multi-treatment; Treat prefers Maintenance when both active");

  assert(
    typeof (fromMnt as { persist?: unknown }).persist === "undefined",
    "no persist"
  );
  results.push("PASS no Issue persistence; lifecycle SoT preserved");

  assert(
    mapMaintenanceToTreatmentRef({ id: "M", title: "t", status: "scheduled" })
      .kind === "maintenance",
    "mnt mapper"
  );
  assert(
    mapIncidentToTreatmentRef({ id: "I", title: "t", status: "reported" })
      .kind === "incident_handling",
    "inc mapper"
  );
  assert(mapIncidentTypeToClassification("safety") === "safety", "classif map");
  assert(mapWorkOrderToIssueRef({ id: "W", title: "t", status: "open" }).id === "W", "wo");
  assert(
    composeOperationalViewFromTreatmentDetail({
      request: {
        id: "REQ-Z",
        title: "z",
        facilityId: "FAC-0001",
        status: "submitted",
        maintenanceIds: [],
        incidentIds: [],
        workOrderIds: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      maintenance: [],
      incidents: [],
      derivedWorkOrders: [],
    }).outcome.kind === "open",
    "detail compose"
  );
  assert(deriveIssueOutcome(simple).kind === "resolved", "outcome helper");

  console.log("\n=== issue operational model verify (phase 6) ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
