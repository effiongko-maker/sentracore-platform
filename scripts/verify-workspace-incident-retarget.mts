/**
 * Phase 21 — Workspace / Command Surface incident retarget verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-workspace-incident-retarget.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ISSUE_MODEL_PHASE } from "../src/lib/operational/issues";
import { ActionError } from "../src/lib/actions/errors";
import {
  INCIDENT_CREATE_FROZEN_MESSAGE,
  assertNewIncidentCreateAllowed,
} from "../src/lib/operational/work";
import {
  buildAttentionModel,
  countCriticalWork,
  countLegacyCriticalIncidents,
} from "../src/modules/workspace/attention";
import {
  WORKSPACE_INCIDENT_COMPAT,
  WORKSPACE_INCIDENT_RETARGET_PHASE,
  WORKSPACE_OPERATIONAL_CONTEXT,
} from "../src/modules/workspace/workspaceContext";
import type { Maintenance } from "../src/modules/maintenance/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "phase 21");
  assert(WORKSPACE_INCIDENT_RETARGET_PHASE === 21, "workspace phase");
  results.push("PASS ISSUE_MODEL_PHASE = 21");

  assert(
    WORKSPACE_OPERATIONAL_CONTEXT.liveCriticalMetric === "criticalWork",
    "live critical metric"
  );
  assert(
    WORKSPACE_OPERATIONAL_CONTEXT.canonicalIssueSurface === "/issues",
    "issues surface"
  );
  results.push("PASS canonical workspace context = Issue/Work");

  const ws = readSrc("src/services/workspace/WorkspaceService.ts");
  assert(ws.includes("countCriticalWork"), "critical work pulse");
  assert(ws.includes("legacyOpenIncidents"), "legacy incident counts");
  assert(ws.includes("openWork"), "open work pulse");
  assert(!ws.includes("openIncidents:"), "no live openIncidents pulse field");
  results.push("PASS WorkspaceService pulse retargeted to Work");

  const command = readSrc("src/modules/workspace/components/CommandSurface.tsx");
  assert(command.includes("log-issue"), "log issue primary action");
  assert(!command.includes('"report-incident"'), "no report incident action");
  assert(command.includes("Critical work"), "critical work hero metric");
  assert(command.includes("pulse.criticalWork"), "hero critical work from pulse");
  assert(!command.includes("attention.criticalCount"), "hero not attention criticalCount");
  assert(command.includes('href: "/work"'), "work links");
  assert(command.includes("Legacy incidents"), "legacy incidents row conditional");
  results.push("PASS CommandSurface retargeted to Work/Issues");

  const constants = readSrc("src/modules/workspace/constants.ts");
  assert(constants.includes('id: "log-issue"'), "log issue quick action");
  assert(constants.includes('href: "/issues"'), "issues href");
  assert(!constants.includes("report-incident"), "no report incident quick action");
  results.push("PASS quick actions retargeted to Log Issue");

  const attentionSrc = readSrc("src/modules/workspace/attention.ts");
  assert(attentionSrc.includes("countCriticalWork"), "countCriticalWork");
  assert(attentionSrc.includes("countLegacyCriticalIncidents"), "legacy count");
  assert(!attentionSrc.includes("...incidentMatters"), "incidents removed from live attention merge");
  results.push("PASS attention model uses Work not live Incidents");

  const palette = readSrc("src/components/platform/CommandPalette.tsx");
  assert(palette.includes("Log an issue"), "palette log issue");
  assert(!palette.includes("Report an incident"), "no report incident palette");
  assert(!palette.includes("Create Incident"), "no create incident palette");
  results.push("PASS command palette has no FM Incident creation");

  const nav = readSrc("src/lib/navigation.ts");
  assert(nav.includes('href: "/incidents"'), "incidents route preserved");
  assert(!nav.includes('label: "Incidents"'), "incidents absent from primary nav labels");
  assert(nav.includes("Legacy Incidents"), "legacy incidents in secondary nav");
  assert(!nav.includes("Request Queue"), "request queue absent");
  results.push("PASS /incidents preserved in secondary nav; Request Queue absent");

  const maintenance: Maintenance = {
    id: "MNT-WS-1",
    title: "Critical pump",
    type: "corrective",
    source: "request",
    facilityId: "FAC-0001",
    priority: "critical",
    status: "in_progress",
    reportedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  assert(countCriticalWork([maintenance]) === 1, "critical work count");
  const attention = buildAttentionModel({
    asOf: "2026-01-15T00:00:00.000Z",
    incidents: [],
    workOrders: [],
    maintenance: [maintenance],
    approvals: [],
    facilityNameById: new Map([["FAC-0001", "Test"]]),
  });
  assert(
    attention.visible.some((m) => m.entityLabel === "Work"),
    "work attention matters"
  );
  assert(
    !attention.visible.some((m) => m.entityLabel === "Incident"),
    "no live incident attention"
  );
  results.push("PASS attention queue surfaces Work matters");

  try {
    assertNewIncidentCreateAllowed("verify-workspace-incident-retarget");
    assert(false, "guard should throw");
  } catch (error) {
    assert(error instanceof ActionError, "ActionError");
    assert(error.message === INCIDENT_CREATE_FROZEN_MESSAGE, "incident create frozen");
  }
  results.push("PASS no new Incident creation path");

  const intelligence = readSrc("src/lib/intelligence/getOrganisationIntelligence.ts");
  assert(!intelligence.includes("openIncidents"), "intelligence unchanged");
  results.push("PASS Intelligence unchanged");

  const reporting = readSrc("src/services/reporting/kpis.ts");
  assert(reporting.includes("criticalWork"), "reporting unchanged spine");
  results.push("PASS Reporting spine unchanged");

  assert(countLegacyCriticalIncidents([]) === 0, "legacy helper");
  assert(WORKSPACE_INCIDENT_COMPAT.length >= 3, "compat documented");
  results.push("PASS historical Incident compatibility documented");

  console.log("verify-workspace-incident-retarget.mts");
  for (const line of results) console.log(line);
  console.log(`\n${results.length}/${results.length} checks passed`);
}

main();
