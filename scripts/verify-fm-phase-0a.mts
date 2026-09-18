/**
 * Phase 0A — FM reliability contract, observability, Apps Script security.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-phase-0a.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeNotificationFeed } from "../src/services/workspace/OperationalNotificationService";
import { buildMyWork } from "../src/services/workspace/WorkspaceService";
import { deriveFinanceOverview } from "../src/modules/finance/utils/deriveFinanceOverview";
import { composeWorkspaceSnapshot } from "../src/services/workspace/WorkspaceService";
import type { Maintenance } from "../src/modules/maintenance/types";
import type { WorkOrder } from "../src/modules/work-orders/types";
import type { CostRecord, CostSubmission } from "../src/lib/operational/finance";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function read(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

const asOf = "2026-09-18T12:00:00.000Z";

function mnt(
  id: string,
  status: Maintenance["status"],
  extra: Partial<Maintenance> = {}
): Maintenance {
  return {
    id,
    title: id,
    type: "corrective",
    source: "manual",
    status,
    priority: "medium",
    facilityId: "FAC-0001",
    reportedAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

function wo(
  id: string,
  status: WorkOrder["status"],
  extra: Partial<WorkOrder> = {}
): WorkOrder {
  return {
    id,
    title: id,
    type: "corrective",
    source: "manual",
    status,
    priority: "medium",
    facilityId: "FAC-0001",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

function main() {
  const results: string[] = [];

  const proxy = read("src/services/api/appsScriptProxy.ts");
  assert(
    !proxy.includes("AKfycbz8DUM4MS2NTlEAeHsMVw9sGY0CyCdJwu_24mYJCpUwJWQb9FKEGABO2TEZhzKO-5Xm"),
    "hardcoded /exec fallback removed from appsScriptProxy"
  );
  assert(
    proxy.includes("APPS_SCRIPT_SHARED_SECRET") &&
      proxy.includes("requestId") &&
      proxy.includes("fm.apps_script") &&
      proxy.includes("success_empty") &&
      proxy.includes("malformed_response"),
    "transport has correlation, secret, and outcome kinds"
  );
  assert(
    !proxy.includes("NEXT_PUBLIC_APPS_SCRIPT_SHARED_SECRET"),
    "shared secret is not a public env var"
  );
  assert(
    proxy.includes("Refusing hardcoded /exec fallback"),
    "production requires APPS_SCRIPT_URL"
  );
  results.push("PASS Apps Script transport: no hardcoded exec, secret server-only, correlation");

  const router = read("apps-script/ROUTER.gs");
  assert(
    router.includes("authorizeAppsScriptRequest_") &&
      router.includes("APPS_SCRIPT_SHARED_SECRET") &&
      router.includes("APPS_SCRIPT_AUTH_FAILED") &&
      router.includes("secretsEqual_") &&
      router.includes("Unauthorized."),
    "Apps Script rejects missing/invalid secret"
  );
  assert(
    !router.includes("Logger.log") || !/Logger\.log\([\s\S]*sharedSecret/.test(router),
    "Apps Script must not log the shared secret"
  );
  results.push("PASS Apps Script secret validation is fail-closed");

  const caps = read("src/lib/access/capabilities.ts");
  assert(
    !caps.includes("LEGACY_UNASSIGNED_CAPABILITIES"),
    "LEGACY_UNASSIGNED_CAPABILITIES stays gone"
  );
  results.push("PASS FM access fail-closed constant remains removed");

  const emptyFeed = composeNotificationFeed(asOf, {
    requests: [],
    maintenance: [],
    incidents: [],
    workOrders: [],
    failedSources: [],
  });
  assert(emptyFeed.incomplete !== true, "successful empty is not incomplete");
  assert(emptyFeed.total === 0, "successful empty total is 0");
  results.push("PASS successful empty notifications remain empty");

  const failedFeed = composeNotificationFeed(asOf, {
    requests: [],
    maintenance: [],
    incidents: [],
    workOrders: [],
    failedSources: ["workOrders"],
  });
  assert(failedFeed.incomplete === true, "failed source marks incomplete");
  const bell = read("src/components/platform/GlobalNotificationBell.tsx");
  assert(
    bell.includes("feed.incomplete") &&
      bell.includes("Notification information is temporarily incomplete") &&
      bell.includes("Nothing needs your attention right now."),
    "bell distinguishes incomplete from true empty"
  );
  results.push("PASS failed notification source is not “nothing needs attention”");

  const emptyAssigned = buildMyWork("USR-1", [], [], []);
  assert(
    emptyAssigned.some(
      (row) => row.count === 0 && row.emptyLabel.includes("all caught up")
    ),
    "successful empty assigned work is true zero"
  );
  const failedAssigned = buildMyWork("USR-1", null, [], []);
  assert(
    failedAssigned.some(
      (row) =>
        row.id === "assigned-work-orders" &&
        row.count == null &&
        row.emptyLabel.includes("Temporarily unavailable")
    ),
    "failed assigned work source is unavailable, not zero"
  );
  const myWorkUi = read("src/modules/workspace/components/MyWork.tsx");
  assert(
    myWorkUi.includes("unavailable") || myWorkUi.includes("item.count == null"),
    "MyWork card renders unavailable instead of 0"
  );
  results.push("PASS Assigned Work failure is not “all caught up”");

  const cost: CostRecord = {
    costId: "COST-1",
    recordedAt: asOf,
    facilityId: "FAC-0001",
    location: "Plant",
    description: "Generator diesel",
    category: "consumables",
    actualAmount: 50000,
    currency: "NGN",
    reimbursability: "reimbursable",
    evidence: { reference: "INV-1" },
    recordedBy: "USR-1",
  };
  const submission: CostSubmission = {
    submissionId: "SUB-1",
    status: "submitted",
    claimAmount: 50000,
    currency: "NGN",
    createdAt: asOf,
    createdBy: "USR-1",
    costRecordIds: ["COST-1"],
  };
  const partial = deriveFinanceOverview({
    approvals: [],
    totalApprovals: 0,
    approvalsAvailable: true,
    costRecords: [cost],
    totalCostRecords: 1,
    costRecordsAvailable: true,
    submissions: [submission],
    totalSubmissions: 1,
    submissionsAvailable: false,
    payments: [],
    totalPayments: 0,
    paymentsAvailable: true,
    authorizations: [],
    authorizationsAvailable: true,
  });
  assert(partial.availability.costRecords === true, "unaffected costs remain");
  assert(partial.meta.costRecordsTotal === 1, "cost total preserved");
  assert(partial.availability.costSubmissions === false, "failed submissions unavailable");
  assert(partial.submissions.available === false, "submission snapshot unavailable");
  const costMetric = partial.position.find((row) => row.id === "cost_recorded");
  assert(costMetric?.available === true, "cost metric stays available");
  const subMetric = partial.position.find((row) => row.id.startsWith("submissions"));
  assert(subMetric?.available === false, "dependent submission metric unavailable");
  assert(subMetric?.value == null, "no fake 0 for failed source");
  assert(partial.payments.available === false, "payment metric depends on submissions");
  results.push("PASS FM finance partial failure does not invent 0");

  const poolMnt = [mnt("M-in-progress", "in_progress")];
  const pictureSnap = composeWorkspaceSnapshot(asOf, { operationalUserId: "USR-1" }, {
    workOrders: { ok: true, data: [wo("WO-hold", "on_hold")] },
    incidents: { ok: true, data: [] },
    maintenance: { ok: true, data: poolMnt },
    criticalWork: { ok: true, total: 4 },
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
    pictureMaintenance: {
      present: true,
      healthy: true,
      value: {
        state: "healthy",
        critical: 4,
        inProgress: 9,
        awaitingAction: 3,
        overdue: 2,
      },
    },
    pictureWorkOrders: {
      present: true,
      healthy: true,
      value: { state: "healthy", awaitingAction: 5, overdue: 1 },
    },
    pictureApprovals: {
      present: true,
      healthy: true,
      value: { state: "healthy", awaitingAction: 7 },
    },
  });
  assert(pictureSnap.pulse.picture.critical === 4, "critical uses register total");
  assert(
    pictureSnap.pulse.picture.inProgress === 9,
    "in progress uses complete-population fragment, not pool length"
  );
  assert(
    pictureSnap.pulse.picture.awaitingAction === 15,
    "awaiting action sums complete-population fragments"
  );
  assert(pictureSnap.pulse.picture.overdue === 3, "overdue sums complete-population fragments");

  const failedPicture = composeWorkspaceSnapshot(asOf, null, {
    workOrders: { ok: false, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: { ok: true, data: poolMnt },
    criticalWork: { ok: true, total: 4 },
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
    pictureMaintenance: {
      present: true,
      healthy: true,
      value: {
        state: "healthy",
        critical: 4,
        inProgress: 9,
        awaitingAction: 3,
        overdue: 2,
      },
    },
    pictureWorkOrders: { present: true, healthy: false },
    pictureApprovals: {
      present: true,
      healthy: true,
      value: { state: "healthy", awaitingAction: 0 },
    },
  });
  assert(
    failedPicture.pulse.picture.awaitingAction == null,
    "failed WO picture domain makes awaiting unavailable, not 0"
  );
  assert(
    failedPicture.pulse.picture.inProgress === 9,
    "healthy maintenance in-progress remains"
  );
  results.push("PASS Operational Picture uses complete-population fragments and null on failure");

  const cc = read("apps-script/CommandCentreFmSummaryService.gs");
  const mntGs = read("apps-script/MaintenanceService.gs");
  assert(
    mntGs.includes("includeOperationalPictureTotals") &&
      mntGs.includes("attachListTotals") &&
      cc.includes("attachListTotals"),
    "Home piggybacks CC predicate totals onto existing getAll"
  );
  results.push("PASS Home/CC share CommandCentreFmSummaryService predicates");

  console.log(results.join("\n"));
  console.log("verify-fm-phase-0a: PASS");
}

main();
