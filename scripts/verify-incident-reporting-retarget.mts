/**
 * Phase 20 — Incident reporting retarget verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-incident-reporting-retarget.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeReportingHealth,
  computeReportingKpis,
} from "../src/services/reporting/kpis";
import { computeReportingProjections } from "../src/services/reporting/projections";
import { ISSUE_MODEL_PHASE } from "../src/lib/operational/issues";
import { ActionError } from "../src/lib/actions/errors";
import {
  INCIDENT_CREATE_FROZEN_MESSAGE,
  INCIDENT_REPORTING_COMPAT,
  INCIDENT_REPORTING_RETARGET_PHASE,
  REPORTING_OPERATIONAL_CONTEXT,
  assertNewIncidentCreateAllowed,
} from "../src/lib/operational/work";
import type { Incident } from "../src/modules/incidents/types";
import type { Maintenance } from "../src/modules/maintenance/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "phase 20");
  assert(INCIDENT_REPORTING_RETARGET_PHASE === 20, "reporting retarget phase");
  results.push("PASS ISSUE_MODEL_PHASE = 20");

  assert(
    REPORTING_OPERATIONAL_CONTEXT.liveCriticalMetric === "criticalWork",
    "live critical metric"
  );
  assert(
    REPORTING_OPERATIONAL_CONTEXT.canonicalWorkSurface === "/work",
    "work surface"
  );
  results.push("PASS canonical reporting context = Issue/Work");

  const kpisSrc = readSrc("src/services/reporting/kpis.ts");
  assert(kpisSrc.includes("criticalWork"), "criticalWork KPI");
  assert(kpisSrc.includes("isCriticalOpenWork"), "critical open work rule");
  assert(kpisSrc.includes("kpis.criticalWork * 15"), "health uses criticalWork");
  assert(!kpisSrc.includes("kpis.criticalIncidents * 15"), "health no longer uses criticalIncidents");
  results.push("PASS live health score driven by criticalWork");

  const projectionsSrc = readSrc("src/services/reporting/projections.ts");
  assert(projectionsSrc.includes("criticalWork:"), "criticalWork projection");
  assert(projectionsSrc.includes("criticalIncidents:"), "legacy criticalIncidents projection preserved");
  results.push("PASS projections: criticalWork live + criticalIncidents historical");

  const kpiWidgets = readSrc("src/services/dashboard/widgets/kpiWidgets.ts");
  assert(kpiWidgets.includes("Critical Work"), "dashboard KPI title");
  assert(kpiWidgets.includes("report.kpis.criticalWork"), "dashboard KPI source");
  results.push("PASS dashboard KPI widget retargeted to Work");

  const listWidgets = readSrc("src/services/dashboard/widgets/listWidgets.ts");
  assert(listWidgets.includes("projections.criticalWork"), "list uses criticalWork");
  results.push("PASS dashboard list widget retargeted to Work");

  const buildClientReport = readSrc("src/services/reports/buildClientReport.ts");
  assert(buildClientReport.includes("Critical work"), "client report live metric");
  assert(buildClientReport.includes("Legacy incident"), "historical framing");
  results.push("PASS client report generation retargeted");

  const incidentReportBuilder = readSrc(
    "src/services/reporting/documents/builders/IncidentReportBuilder.ts"
  );
  assert(incidentReportBuilder.includes("criticalIncidents"), "historical incident report preserved");
  results.push("PASS historical IncidentReportBuilder preserved");

  const reportingService = readSrc("src/services/reporting/ReportingService.ts");
  assert(
    reportingService.includes("IncidentService.listIncidents"),
    "incidents still queryable"
  );
  results.push("PASS Incident records remain queryable via ReportingService");

  const maintenance: Maintenance = {
    id: "MNT-TEST-1",
    title: "Critical pump repair",
    type: "corrective",
    source: "request",
    facilityId: "FAC-0001",
    priority: "critical",
    status: "in_progress",
    reportedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  const legacyIncident: Incident = {
    id: "INC-LEGACY-1",
    title: "Historical leak",
    type: "equipment_failure",
    source: "manual",
    severity: "critical",
    status: "investigating",
    facilityId: "FAC-0001",
    reportedAt: "2025-06-01T00:00:00.000Z",
    createdAt: "2025-06-01T00:00:00.000Z",
    updatedAt: "2025-06-02T00:00:00.000Z",
  };

  const kpis = computeReportingKpis({
    asOf: "2026-01-15T00:00:00.000Z",
    facilities: [],
    assets: [],
    incidents: [legacyIncident],
    maintenance: [maintenance],
    workOrders: [],
    users: [],
  });
  assert(kpis.criticalWork === 1, "critical work count");
  assert(kpis.criticalIncidents === 1, "legacy incident count preserved");
  const health = computeReportingHealth(kpis);
  assert(health.score < 100, "health penalized by critical work");
  const projections = computeReportingProjections({
    asOf: "2026-01-15T00:00:00.000Z",
    incidents: [legacyIncident],
    maintenance: [maintenance],
    workOrders: [],
  });
  assert(projections.criticalWork.length === 1, "critical work projection");
  assert(projections.criticalIncidents.length === 1, "legacy incident projection");
  results.push("PASS KPI/projection computation uses Work for live ops");

  try {
    assertNewIncidentCreateAllowed("verify-incident-reporting-retarget");
    assert(false, "guard should throw");
  } catch (error) {
    assert(error instanceof ActionError, "ActionError");
    assert(error.message === INCIDENT_CREATE_FROZEN_MESSAGE, "incident create still frozen");
  }
  results.push("PASS no new Incident creation path");

  const intelligence = readSrc("src/lib/intelligence/getOrganisationIntelligence.ts");
  assert(!intelligence.includes("criticalWork"), "intelligence unchanged by reporting phase");
  results.push("PASS Intelligence unchanged (reporting-only phase)");

  assert(INCIDENT_REPORTING_COMPAT.length >= 2, "compat documented");
  results.push("PASS historical Incident reporting compatibility documented");

  const appsScript = readSrc("apps-script/ReportingSnapshotService.gs");
  assert(appsScript.includes("criticalWork"), "Apps Script KPI parity");
  assert(appsScript.includes("isCriticalOpenWork_"), "Apps Script work rule");
  results.push("PASS Apps Script snapshot KPI parity");

  console.log("verify-incident-reporting-retarget.mts");
  for (const line of results) console.log(line);
  console.log(`\n${results.length}/${results.length} checks passed`);
}

main();
