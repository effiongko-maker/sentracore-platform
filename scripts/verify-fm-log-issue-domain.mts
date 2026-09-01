/**
 * FM Log Issue domain path (no browser) — Phase 15 compatibility.
 * Work path: Maintenance create + compose (canonical FM Log Issue backing).
 * Legacy: Incident create still readable/composable (not Log Issue taxonomy).
 * Asserts no Request invented on either root.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-log-issue-domain.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildIssueOperationalView,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
} from "../src/lib/operational/issues";
import { buildUnifiedIssueList } from "../src/modules/issues/lib/buildUnifiedIssueList";
import { IncidentService } from "../src/services/incidents/IncidentService";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";
import { RequestService } from "../src/services/requests/RequestService";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const results: string[] = [];
  const stamp = Date.now();

  const ordinary = await MaintenanceService.createMaintenance({
    title: `P8 domain ordinary ${stamp}`,
    description: `Location: Test bay\n\nP8 ordinary`,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
    requiresWorkOrder: false,
  });
  assert(!ordinary.sourceRequestId, "ordinary must not have sourceRequestId");
  const ordinaryIssue = composeIssueFromMaintenance({
    maintenance: {
      id: ordinary.id,
      title: ordinary.title,
      description: ordinary.description,
      facilityId: ordinary.facilityId,
      status: ordinary.status,
      priority: ordinary.priority,
      createdAt: ordinary.createdAt,
      updatedAt: ordinary.updatedAt,
      sourceRequestId: ordinary.sourceRequestId,
      createdByUserId: ordinary.createdByUserId,
    },
  });
  assert(ordinaryIssue.id === `issue:maintenance:${ordinary.id}`, "mnt issue id");
  assert(ordinaryIssue.source === "facility_manager", "fm source");
  assert(!ordinaryIssue.relatedRequestId, "no request on ordinary issue");
  results.push("PASS FM Log Issue Work path → Maintenance root, no Request");

  // Legacy Incident sheet still writable via IncidentService for admin/compat;
  // not the FM Log Issue taxonomy (Phase 15).
  const legacyInc = await IncidentService.createIncident({
    title: `P15 domain legacy INC ${stamp}`,
    description: "Flood test",
    facilityId: "FAC-0001",
    locationDetail: "Basement",
    type: "environmental",
    source: "manual",
    severity: "high",
    status: "reported",
    reportedVia: "walk_in",
    reportedAt: new Date().toISOString(),
    requiresWorkOrder: false,
  });
  assert(!legacyInc.sourceRequestId, "legacy INC must not have sourceRequestId");
  const legacyIncIssue = composeIssueFromIncident({
    incident: {
      id: legacyInc.id,
      title: legacyInc.title,
      description: legacyInc.description,
      facilityId: legacyInc.facilityId,
      locationDetail: legacyInc.locationDetail,
      status: legacyInc.status,
      type: legacyInc.type,
      severity: legacyInc.severity,
      createdAt: legacyInc.createdAt,
      updatedAt: legacyInc.updatedAt,
      sourceRequestId: legacyInc.sourceRequestId,
      reportedByUserId: legacyInc.reportedByUserId,
    },
  });
  assert(legacyIncIssue.id === `issue:incident:${legacyInc.id}`, "inc issue id");
  assert(!legacyIncIssue.relatedRequestId, "no request on legacy INC");
  results.push("PASS Legacy Incident root still readable/composable, no Request");

  const [requests, maintenances, incidents] = await Promise.all([
    RequestService.listRequests({ page: 1, pageSize: 50, status: "all" }),
    MaintenanceService.listMaintenance({ page: 1, pageSize: 50, status: "all" }),
    IncidentService.listIncidents({ page: 1, pageSize: 50, status: "all" }),
  ]);
  const unified = buildUnifiedIssueList({
    requests: requests.data,
    maintenances: maintenances.data,
    incidents: incidents.data,
  });
  assert(
    unified.some((u) => u.issue.id === ordinaryIssue.id),
    "unified contains Work/Maintenance FM issue"
  );
  assert(
    unified.some((u) => u.issue.id === legacyIncIssue.id),
    "unified contains legacy Incident issue"
  );
  assert(
    unified.some((u) => u.issue.id.startsWith("issue:request:")),
    "unified still contains request-backed issues"
  );
  results.push("PASS unified list includes Request + both FM roots");

  const view = buildIssueOperationalView(ordinaryIssue);
  assert(view.issue.status === ordinaryIssue.status, "status derived");
  results.push("PASS Issue.status derived from root; operational view builds");

  console.log("\n=== fm log issue domain verify ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main().catch((err) => {
  console.error("RESULT: FAIL", err);
  process.exit(1);
});
