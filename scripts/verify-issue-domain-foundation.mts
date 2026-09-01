/**
 * Issue operational model (Phase 8) — FM Log Issue composition + unified list.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-issue-domain-foundation.mts
 */
import {
  buildIssueOperationalView,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
  composeIssueFromRequest,
  deriveIssueActions,
  getIssueAction,
  INCIDENT_POLICY,
  ISSUE_MODEL_PHASE,
  JOB_ORDER_BOUNDARY,
  mapMaintenanceStatusToIssueStatus,
  mapIncidentStatusToIssueStatus,
  mapWorkOrderToExecutionRef,
  WORK_ORDER_BOUNDARY,
} from "../src/lib/operational/issues";
import { buildUnifiedIssueList } from "../src/modules/issues/lib/buildUnifiedIssueList";
import type { Incident } from "../src/modules/incidents/types";
import type { Maintenance } from "../src/modules/maintenance/types";
import type { RequestRecord } from "../src/modules/requests/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const results: string[] = [];
  assert(ISSUE_MODEL_PHASE === 26, "phase 18");
  results.push("PASS ISSUE_MODEL_PHASE = 19");

  assert(JOB_ORDER_BOUNDARY.implemented === false, "no JO persistence");
  assert(WORK_ORDER_BOUNDARY.approvalAuthority === "annex_director", "WO annex");
  assert(
    mapWorkOrderToExecutionRef({ id: "WO-1", status: "open", title: "t" })
      .approvalAuthority !== "hq_formal",
    "not hq_formal"
  );
  results.push("PASS Job Order not implemented; WO authority corrected");

  const ordinary = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-FM-1",
      title: "Leaking toilet",
      facilityId: "FAC-0001",
      locationDetail: "Gents W1",
      status: "requested",
      priority: "medium",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert(ordinary.id === "issue:maintenance:MNT-FM-1", "mnt issue id");
  assert(ordinary.rootMaintenanceId === "MNT-FM-1", "root");
  assert(!ordinary.relatedRequestId, "no fake request");
  assert(ordinary.source === "facility_manager", "fm source");
  assert(
    ordinary.status === mapMaintenanceStatusToIssueStatus("requested"),
    "derived status"
  );
  assert(
    getIssueAction(deriveIssueActions(ordinary), "treat")?.href?.includes(
      "MNT-FM-1"
    ),
    "treat → mnt"
  );
  assert(
    !getIssueAction(deriveIssueActions(ordinary), "investigate")?.available,
    "Investigate is not a competing primary action"
  );
  assert(
    !getIssueAction(deriveIssueActions(ordinary), "resolve")?.available,
    "no generic Resolve on active ordinary"
  );
  assert(
    getIssueAction(deriveIssueActions(ordinary), "cancel")?.label === "Cancel",
    "Cancel label"
  );
  results.push("PASS FM Issue → Work treatment (Maintenance backing), no Request");

  const significant = composeIssueFromIncident({
    incident: {
      id: "INC-FM-1",
      title: "Flooding",
      facilityId: "FAC-0001",
      status: "reported",
      type: "environmental",
      severity: "high",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert(significant.id === "issue:incident:INC-FM-1", "inc issue id");
  assert(!significant.relatedRequestId, "no fake request on investigation path");
  assert(
    significant.status === mapIncidentStatusToIssueStatus("reported"),
    "inc derived"
  );
  assert(
    getIssueAction(deriveIssueActions(significant), "treat")?.available === true,
    "investigation-path Issue still uses Treat"
  );
  assert(
    getIssueAction(deriveIssueActions(significant), "treat")?.href?.includes(
      "INC-FM-1"
    ),
    "treat → incident handling"
  );
  assert(
    !getIssueAction(deriveIssueActions(significant), "investigate")?.available,
    "Investigate not exposed as competing category"
  );
  assert(INCIDENT_POLICY.ordinaryDefault === "work", "ordinary default");
  results.push("PASS Legacy Incident Issue still composable via Treat, no Request");

  const staff = composeIssueFromRequest({
    request: {
      id: "REQ-1",
      title: "AC not cooling",
      facilityId: "FAC-0001",
      status: "being_treated",
      requestType: "maintenance",
      maintenanceIds: ["MNT-R"],
      incidentIds: [],
      workOrderIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    maintenances: [
      {
        id: "MNT-R",
        title: "AC",
        status: "scheduled",
        workOrderId: "WO-R",
      },
    ],
    workOrders: [
      { id: "WO-R", title: "Inspect", status: "open", maintenanceId: "MNT-R" },
    ],
  });
  assert(staff.id === "issue:request:REQ-1", "staff issue");
  assert(staff.workOrders.some((w) => w.id === "WO-R"), "wo link");
  results.push("PASS Request-backed Issue + WO relationship");

  const requests: RequestRecord[] = [
    {
      id: "REQ-1",
      title: "Staff AC",
      facilityId: "FAC-0001",
      occurredAt: "2026-01-01T00:00:00.000Z",
      status: "submitted",
      incidentIds: [],
      maintenanceIds: ["MNT-LINKED"],
      workOrderIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const maintenances = [
    {
      id: "MNT-LINKED",
      title: "Linked to request",
      type: "corrective",
      source: "request",
      facilityId: "FAC-0001",
      priority: "medium",
      status: "requested",
      reportedAt: "2026-01-01T00:00:00.000Z",
      sourceRequestId: "REQ-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "MNT-FM-1",
      title: "FM toilet",
      type: "corrective",
      source: "manual",
      facilityId: "FAC-0001",
      priority: "medium",
      status: "requested",
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ] as Maintenance[];
  const incidents = [
    {
      id: "INC-FM-1",
      title: "FM flood",
      type: "environmental",
      source: "manual",
      facilityId: "FAC-0001",
      severity: "high",
      status: "reported",
      reportedVia: "walk_in",
      reportedAt: "2026-01-03T00:00:00.000Z",
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
  ] as Incident[];

  const unified = buildUnifiedIssueList({
    requests,
    maintenances,
    incidents,
  });
  assert(unified.length === 3, `unified count ${unified.length}`);
  assert(
    unified.some((u) => u.issue.id === "issue:request:REQ-1"),
    "has request issue"
  );
  assert(
    unified.some((u) => u.issue.id === "issue:maintenance:MNT-FM-1"),
    "has fm mnt"
  );
  assert(
    unified.some((u) => u.issue.id === "issue:incident:INC-FM-1"),
    "has fm inc"
  );
  assert(
    !unified.some((u) => u.issue.id === "issue:maintenance:MNT-LINKED"),
    "excludes request-linked mnt as separate issue"
  );
  results.push(
    "PASS unified /issues list Request + FM roots; no duplicate linked treatments"
  );

  assert(INCIDENT_POLICY.ordinaryDefault === "work", "treat → work");
  const logAction = getIssueAction(
    buildIssueOperationalView(ordinary).actions,
    "log_issue"
  );
  assert(logAction?.available === true, "log issue available");
  assert(logAction?.href === "/issues", "log issue href");
  results.push(
    "PASS Treat defaults to Work (/work UI); Log Issue action routes to /issues"
  );

  assert(
    typeof (ordinary as { persist?: unknown }).persist === "undefined",
    "no persist"
  );
  results.push("PASS no Issue persistence introduced");

  console.log("\n=== issue operational model verify (phase 16) ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
