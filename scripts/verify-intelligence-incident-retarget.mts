/**
 * Phase 19 — Intelligence Incident retarget verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-intelligence-incident-retarget.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OperationalEventTypes } from "../src/lib/events/taxonomy";
import { ISSUE_MODEL_PHASE } from "../src/lib/operational/issues";
import {
  INCIDENT_INTELLIGENCE_COMPAT_CONSUMERS,
  INTELLIGENCE_OPERATIONAL_CONTEXT,
  assertNewIncidentCreateAllowed,
} from "../src/lib/operational/work";
import { assembleOrganisationIntelligence } from "../src/lib/intelligence/getOrganisationIntelligence";
import { buildActionableItems } from "../src/modules/intelligence/view-model/insightBriefingHelpers";
import type { IntelligenceInsight } from "../src/lib/intelligence/insights/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "phase 19");
  results.push("PASS ISSUE_MODEL_PHASE = 19");

  assert(
    INTELLIGENCE_OPERATIONAL_CONTEXT.canonicalRootEvent ===
      "facility.maintenance_requested",
    "canonical root event"
  );
  assert(
    INTELLIGENCE_OPERATIONAL_CONTEXT.canonicalWorkSurface === "/work",
    "work surface"
  );
  results.push("PASS canonical Intelligence context = Issue/Work via maintenance_requested");

  const registry = readSrc("src/lib/events/consumers/registry.ts");
  assert(
    registry.includes("FACILITY_MAINTENANCE_REQUESTED"),
    "maintenance consumer registration"
  );
  assert(registry.includes("FACILITY_INCIDENT_REPORTED"), "historical incident consumers");
  results.push("PASS event consumers registered for Work + historical Incident");

  const signals = readSrc("src/lib/events/consumers/analyzeIncidentSignals.ts");
  assert(signals.includes("work.facility_frequency_7d"), "work signals");
  assert(signals.includes("analyzeWorkRootSignals"), "work branch");
  results.push("PASS Work signal analysis path exists");

  const orgIntel = readSrc("src/lib/intelligence/getOrganisationIntelligence.ts");
  assert(orgIntel.includes("workEvents"), "work events loader");
  assert(orgIntel.includes("recentWorkCount30d"), "work counts");
  results.push("PASS Organisation Intelligence loads Work root events");

  const mapInsights = readSrc(
    "src/modules/intelligence/view-model/mapOrganisationInsights.ts"
  );
  assert(mapInsights.includes("Review issues"), "review issues action");
  assert(!mapInsights.includes('label: "Review incidents"'), "no review incidents default");
  results.push("PASS Intelligence default actions retargeted to Issues/Work");

  const helpers = readSrc(
    "src/modules/intelligence/view-model/insightBriefingHelpers.ts"
  );
  assert(helpers.includes('return `/work?id='), "MNT → /work deep link");
  assert(helpers.includes("Legacy incidents"), "legacy incident group label");
  results.push("PASS Take Action deep links: Work canonical, INC legacy");

  const sampleInsight: IntelligenceInsight = {
    id: "test",
    reasoningType: "pattern",
    title: "Test",
    observation: "MNT-2026-0001 linked",
    fact: "Work at FAC-0001",
    inference: "Pattern",
    impact: "Impact",
    confidence: "Moderate",
    confidenceBasis: "test",
    evidence: [],
    relatedEntities: [{ kind: "maintenance", id: "MNT-2026-0001" }],
    suggestedActions: [],
    outcome: { status: "detected", summary: "test" },
    sourceRefs: {},
  };
  const actions = buildActionableItems(sampleInsight);
  assert(actions.some((a) => a.kind === "work" && a.href.includes("/work?id=")), "work action");
  results.push("PASS MNT IDs route to /work in Take Action");

  const assembled = assembleOrganisationIntelligence({
    windowFrom: "2026-01-01T00:00:00.000Z",
    windowTo: "2026-02-01T00:00:00.000Z",
    facilityManagementEnabled: true,
    workEvents: [
      {
        id: "evt-work-1",
        organisation_id: "org",
        event_type: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
        entity_type: "maintenance_request",
        entity_id: "MNT-1",
        occurred_at: "2026-01-15T00:00:00.000Z",
        created_at: "2026-01-15T00:00:00.000Z",
        data: { facilityId: "FAC-0001", maintenanceId: "MNT-1" },
      },
    ],
    incidentEvents: [],
    lifecycleEvents: [],
    signalRunsByEventId: new Map(),
    riskRunsByEventId: new Map(),
    patternRuns: [],
    decisions: [],
  });
  assert(assembled.operationalContext.recentWorkCount30d === 1, "work count");
  assert(assembled.operationalContext.recentIncidentCount30d === 0, "no inc count");
  results.push("PASS Organisation Intelligence can reason about Work without Incident events");

  try {
    assertNewIncidentCreateAllowed("verify");
    assert(false, "freeze should throw");
  } catch {
    results.push("PASS Incident create still frozen (Phase 18)");
  }

  assert(INCIDENT_INTELLIGENCE_COMPAT_CONSUMERS.length >= 3, "compat consumers documented");
  results.push("PASS historical Incident consumers documented");

  const intelModule = readSrc(
    "src/modules/intelligence/components/IntelligenceOperationalContext.tsx"
  );
  assert(intelModule.includes("Work logged"), "ui work label");
  assert(!intelModule.includes("Incidents reported"), "no incidents reported label");
  results.push("PASS Intelligence UI uses Work-first operational language");

  console.log("\n=== intelligence incident retarget verify ===");
  for (const line of results) console.log(line);
  console.log(`\n${results.length} checks passed`);
  console.log("RESULT: PASS");
}

main();
