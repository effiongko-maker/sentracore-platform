/**
 * Phase 26 — Command Surface Critical Work alignment verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-command-surface-critical-work.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ISSUE_MODEL_PHASE } from "../src/lib/operational/issues";
import {
  ACTIVE_MAINTENANCE_STATUSES,
  WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES,
} from "../src/lib/operational/workload";
import { buildAttentionModel } from "../src/modules/workspace/attention";
import {
  WORKSPACE_CRITICAL_WORK_ALIGNMENT_PHASE,
  WORKSPACE_OPEN_WORK_ORDER_SCOPE,
  WORKSPACE_OPERATIONAL_CONTEXT,
} from "../src/modules/workspace/workspaceContext";
import { isCriticalOpenWork } from "../src/services/reporting/kpis";
import { isOpenWorkOrderStatus } from "../src/services/reporting/normalize";
import type { Maintenance } from "../src/modules/maintenance/types";

/** Documented follow-up: Home vs Dashboard open WO scope. */
export const WORK_ORDER_OPEN_COUNT_NOTE =
  "Workspace pulse.openWorkOrders uses WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES (excludes draft). Reporting openWorkOrders uses isOpenWorkOrderStatus (includes draft). Intentional until product labels diverge.";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "issue model phase");
  assert(WORKSPACE_CRITICAL_WORK_ALIGNMENT_PHASE === 26, "alignment phase");
  results.push("PASS ISSUE_MODEL_PHASE = 26");

  assert(
    WORKSPACE_OPERATIONAL_CONTEXT.liveCriticalMetric === "criticalWork",
    "live critical metric"
  );
  assert(
    WORKSPACE_OPERATIONAL_CONTEXT.attentionCriticalSeverityField ===
      "attention.criticalCount",
    "attention severity field documented"
  );
  results.push("PASS workspace context distinguishes Critical Work vs Attention");

  const command = readSrc("src/modules/workspace/components/CommandSurface.tsx");
  assert(command.includes("pulse.criticalWork"), "hero uses pulse.criticalWork");
  assert(command.includes("Critical work"), "hero label Critical work");
  assert(
    command.includes('href="/work"') && command.includes("sc-fm-hero-critical-link"),
    "hero Critical work links to /work"
  );
  assert(
    !command.includes("attention.criticalCount"),
    "hero must not use attention.criticalCount"
  );
  assert(!command.includes("other attention item"), "no misleading other-attention copy");
  assert(
    command.includes("matters require attention"),
    "attention queue meta copy"
  );
  const heroMetrics =
    command.match(
      /sc-fm-hero-metrics[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/
    )?.[0] ?? "";
  assert(heroMetrics.includes("padCount(criticalWork)"), "hero tile uses criticalWork from pulse");
  assert(
    (heroMetrics.match(/Critical work/g) ?? []).length === 1,
    "single Critical work label in hero metrics"
  );
  const heroMetricLabels = [
    ...heroMetrics.matchAll(/sc-fm-hero-metric-label">([^<]+)</g),
  ].map((match) => match[1]);
  assert(
    heroMetricLabels.join(",") === "Open work,Work orders",
    `hero secondary metrics are Open work + Work orders (got: ${heroMetricLabels.join(",")})`
  );
  results.push("PASS CommandSurface hero aligned to pulse.criticalWork");

  const ws = readSrc("src/services/workspace/WorkspaceService.ts");
  assert(ws.includes("countCriticalWork"), "pulse criticalWork source");
  assert(!ws.includes("Math.max(pulse.criticalWork"), "no max critical blend");
  assert(ws.includes("critical work item"), "operational state critical work copy");
  assert(ws.includes("critical attention matter"), "operational state attention copy");
  assert(!ws.includes("ReportingService.get"), "no reporting fetch");
  assert(!ws.includes('from "@/services/reporting"'), "no reporting import");
  results.push("PASS WorkspaceService operational state distinguishes concepts");

  const attentionSrc = readSrc("src/modules/workspace/attention.ts");
  const producers = [
    "fromOverdueWorkOrders",
    "fromOverdueMaintenance",
    "fromPriorityMaintenance",
    "fromOverdueApprovalFollowUps",
    "fromApprovals",
    "fromApprovalRequiredWorkOrders",
    "fromAssignedToMe",
    "fromOverloadedPeople",
  ];
  for (const producer of producers) {
    assert(attentionSrc.includes(producer), `attention producer ${producer}`);
  }
  assert(!attentionSrc.includes("...fromIncidents("), "incidents not in live merge");
  results.push("PASS attention queue producers intact");

  const operationalPicture =
    command.match(/function OperationalPicture[\s\S]*?^}/m)?.[0] ?? "";
  assert(operationalPicture.includes("pulse.criticalWork"), "operational picture criticalWork");
  assert(operationalPicture.includes("Critical work"), "operational picture label");
  results.push("PASS Operational Picture uses pulse.criticalWork");

  const kpis = readSrc("src/services/reporting/kpis.ts");
  const dashboard = readSrc("src/services/dashboard/widgets/kpiWidgets.ts");
  const listWidgets = readSrc("src/services/dashboard/widgets/listWidgets.ts");
  const overview = readSrc("src/modules/dashboard/view-model/buildDashboardOverview.ts");
  assert(kpis.includes("isCriticalOpenWork"), "canonical KPI helper");
  assert(dashboard.includes("report.kpis.criticalWork"), "dashboard KPI");
  assert(listWidgets.includes("projections.criticalWork"), "dashboard list");
  assert(overview.includes("pulse.criticalWork"), "dashboard drivers");
  assert(!listWidgets.includes("Critical Incidents"), "no incident list title");
  results.push("PASS Dashboard Critical Work remains isCriticalOpenWork-based");

  assert(
    WORKSPACE_OPEN_WORK_ORDER_SCOPE === "assigned_in_flow_excludes_draft",
    "WO scope documented"
  );
  const draftInReporting = isOpenWorkOrderStatus("draft");
  const draftInWorkspace = WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES.has("draft");
  assert(draftInReporting && !draftInWorkspace, "WO scope mismatch documented");
  results.push(`PASS work order scope audit: ${WORK_ORDER_OPEN_COUNT_NOTE}`);

  const maintenance: Maintenance = {
    id: "MNT-PH26-1",
    title: "High priority line",
    type: "corrective",
    source: "request",
    facilityId: "FAC-0001",
    priority: "high",
    status: "in_progress",
    reportedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  assert(isCriticalOpenWork(maintenance), "high priority backlog is critical work");
  assert(ACTIVE_MAINTENANCE_STATUSES.has(maintenance.status), "open work status");

  const attention = buildAttentionModel({
    asOf: "2026-01-15T00:00:00.000Z",
    incidents: [],
    workOrders: [],
    maintenance: [maintenance],
    approvals: [],
    facilityNameById: new Map([["FAC-0001", "Test"]]),
  });
  assert(attention.total >= 1, "attention queue surfaces high-priority work");
  assert(
    attention.criticalCount === 0,
    "high-priority work alone is not attention critical severity"
  );
  results.push("PASS Critical Work KPI and attention severity remain distinct");

  const intelligence = readSrc("src/lib/intelligence/getOrganisationIntelligence.ts");
  assert(!intelligence.includes("openIncidents"), "intelligence unchanged");
  results.push("PASS Intelligence unchanged");

  console.log("verify-command-surface-critical-work.mts");
  for (const line of results) console.log(line);
  console.log(`\n${results.length}/${results.length} checks passed`);
}

main();
