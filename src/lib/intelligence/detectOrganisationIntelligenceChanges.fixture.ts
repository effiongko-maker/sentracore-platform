/**
 * Change-detection fixture verification (run: npx tsx src/lib/intelligence/detectOrganisationIntelligenceChanges.fixture.ts)
 */
import { detectOrganisationIntelligenceChanges } from "./detectOrganisationIntelligenceChanges";

const WINDOW_TO = "2026-08-24T12:00:00.000Z";
const MS_DAY = 24 * 60 * 60 * 1000;
const windowToMs = Date.parse(WINDOW_TO);

function daysBeforeWindowEnd(days: number): string {
  return new Date(windowToMs - days * MS_DAY).toISOString();
}

function incident(id: string, daysBeforeEnd: number) {
  return {
    id,
    occurred_at: daysBeforeWindowEnd(daysBeforeEnd),
    data: { facilityId: "FAC-1" },
  };
}

function buildRuns(
  events: ReturnType<typeof incident>[],
  riskLevel: "critical" | "high" | "low",
  typeValue?: string
) {
  const signalRunsByEventId = new Map<
    string,
    {
      operational_event_id: string;
      action_key: string;
      status: string;
      result: unknown;
    }
  >();
  const riskRunsByEventId = new Map<
    string,
    {
      operational_event_id: string;
      action_key: string;
      status: string;
      result: unknown;
    }
  >();

  for (const e of events) {
    riskRunsByEventId.set(e.id, {
      operational_event_id: e.id,
      action_key: "facility.assess_incident_risk",
      status: "succeeded",
      result: {
        status: "succeeded",
        summary: riskLevel,
        data: { riskLevel },
        signals: [],
      },
    });

    const signals = typeValue
      ? [
          {
            key: "incident.repeated_type",
            severity: "warning",
            summary: "s",
            evidence: {
              facilityId: "FAC-1",
              value: typeValue,
              matchCount: 2,
            },
          },
        ]
      : [];

    signalRunsByEventId.set(e.id, {
      operational_event_id: e.id,
      action_key: "facility.analyze_incident_signals",
      status: "succeeded",
      result: { status: "succeeded", summary: "s", data: {}, signals },
    });
  }

  return { signalRunsByEventId, riskRunsByEventId };
}

function detect(
  events: ReturnType<typeof incident>[],
  opts: {
    riskLevel?: "critical" | "high" | "low";
    typeValue?: string;
    decisions?: Array<{
      id: string;
      decision: "accepted" | "dismissed" | "deferred";
      daysBeforeEnd: number;
    }>;
    signalRunsByEventId?: ReturnType<typeof buildRuns>["signalRunsByEventId"];
    riskRunsByEventId?: ReturnType<typeof buildRuns>["riskRunsByEventId"];
  } = {}
) {
  const runs = buildRuns(events, opts.riskLevel ?? "low", opts.typeValue);
  return detectOrganisationIntelligenceChanges({
    windowTo: WINDOW_TO,
    incidentEvents: events,
    signalRunsByEventId: opts.signalRunsByEventId ?? runs.signalRunsByEventId,
    riskRunsByEventId: opts.riskRunsByEventId ?? runs.riskRunsByEventId,
    decisions: (opts.decisions ?? []).map((d) => ({
      id: d.id,
      decision: d.decision,
      created_at: daysBeforeWindowEnd(d.daysBeforeEnd),
    })),
  });
}

function hasChange(
  result: ReturnType<typeof detectOrganisationIntelligenceChanges>,
  keyPart: string
) {
  return result.changes.some((c) => c.key.includes(keyPart));
}

const results: Array<{ case: string; pass: boolean; detail: string }> = [];

{
  const baseline = Array.from({ length: 3 }, (_, i) =>
    incident(`b${i}`, 10 + i * 0.5)
  );
  const recent = Array.from({ length: 8 }, (_, i) =>
    incident(`r${i}`, 1 + i * 0.5)
  );
  const r = detect([...baseline, ...recent]);
  results.push({
    case: "Case 1 — meaningful incident increase",
    pass: hasChange(r, "incident_volume:total") && !hasChange(r, "decrease"),
    detail: r.changes.map((c) => c.key).join(", ") || "none",
  });
}

{
  const baseline = Array.from({ length: 5 }, (_, i) =>
    incident(`b${i}`, 10 + i * 0.3)
  );
  const recent = Array.from({ length: 6 }, (_, i) =>
    incident(`r${i}`, 1 + i * 0.3)
  );
  const r = detect([...baseline, ...recent]);
  results.push({
    case: "Case 2 — small change suppressed",
    pass: !hasChange(r, "incident_volume:total"),
    detail: r.changes.map((c) => c.key).join(", ") || "none",
  });
}

{
  const recent = [incident("c1", 2), incident("c2", 4)];
  const r = detect(recent, { riskLevel: "critical" });
  const change = r.changes.find((c) => c.key.includes("incident_risk:critical"));
  results.push({
    case: "Case 3 — emerging critical",
    pass:
      !!change &&
      change.direction === "emerging" &&
      change.recentCount === 2 &&
      change.previousCount === 0,
    detail: change
      ? `${change.direction} recent=${change.recentCount}`
      : "no critical change",
  });
}

{
  const baseline = [incident("b1", 11)];
  const recent = Array.from({ length: 4 }, (_, i) =>
    incident(`r${i}`, 2 + i * 0.5)
  );
  const r = detect([...baseline, ...recent], { typeValue: "equipment_failure" });
  const pattern = r.changes.find(
    (c) =>
      c.category === "incident_pattern" &&
      c.briefingIdentity.includes("equipment_failure")
  );
  results.push({
    case: "Case 4 — equipment failure pattern worsening",
    pass:
      !!pattern &&
      pattern.direction === "increasing" &&
      pattern.recentCount === 4 &&
      pattern.previousCount === 1,
    detail: pattern
      ? `${pattern.direction} ${pattern.previousCount}→${pattern.recentCount}`
      : "no pattern change",
  });
}

{
  const baseline = [incident("b1", 11)];
  const recent = Array.from({ length: 4 }, (_, i) =>
    incident(`r${i}`, 2 + i * 0.5)
  );
  const bRuns = buildRuns(baseline, "low", "plumbing");
  const rRuns = buildRuns(recent, "low", "electrical");
  const r = detectOrganisationIntelligenceChanges({
    windowTo: WINDOW_TO,
    incidentEvents: [...baseline, ...recent],
    signalRunsByEventId: new Map([
      ...bRuns.signalRunsByEventId,
      ...rRuns.signalRunsByEventId,
    ]),
    riskRunsByEventId: new Map([
      ...bRuns.riskRunsByEventId,
      ...rRuns.riskRunsByEventId,
    ]),
    decisions: [],
  });
  const plumbing = r.changes.find((c) =>
    c.briefingIdentity.includes("plumbing")
  );
  const electrical = r.changes.find((c) =>
    c.briefingIdentity.includes("electrical")
  );
  results.push({
    case: "Case 5 — unrelated patterns not merged",
    pass:
      !plumbing &&
      !!electrical &&
      electrical.previousCount === 0 &&
      electrical.recentCount === 4,
    detail: `plumbing=${plumbing?.key ?? "none"} electrical=${electrical?.key ?? "none"}`,
  });
}

{
  const r = detect([], {
    decisions: [
      { id: "d1", decision: "dismissed", daysBeforeEnd: 11 },
      { id: "d2", decision: "dismissed", daysBeforeEnd: 2 },
      { id: "d3", decision: "dismissed", daysBeforeEnd: 3 },
      { id: "d4", decision: "dismissed", daysBeforeEnd: 5 },
      { id: "d5", decision: "dismissed", daysBeforeEnd: 6 },
    ],
  });
  const dismissal = r.changes.find((c) => c.key.includes("dismissed"));
  results.push({
    case: "Case 6 — dismissal trend",
    pass:
      !!dismissal &&
      dismissal.previousCount === 1 &&
      dismissal.recentCount === 4,
    detail: dismissal
      ? `${dismissal.previousCount}→${dismissal.recentCount}`
      : "none",
  });
}

{
  const baseline = Array.from({ length: 5 }, (_, i) =>
    incident(`b${i}`, 10 + i)
  );
  const recent = [incident("r1", 2), incident("r2", 4)];
  const partialRuns = buildRuns(recent, "critical");
  const r = detectOrganisationIntelligenceChanges({
    windowTo: WINDOW_TO,
    incidentEvents: [...baseline, ...recent],
    signalRunsByEventId: partialRuns.signalRunsByEventId,
    riskRunsByEventId: partialRuns.riskRunsByEventId,
    decisions: [],
  });
  results.push({
    case: "Case 7 — incomplete baseline suppresses false trends",
    pass: r.changes.length === 0,
    detail: `baselineComplete=${r.comparisonWindow.baselineAnalysisComplete} changes=${r.changes.length}`,
  });
}

{
  const baseline = Array.from({ length: 8 }, (_, i) =>
    incident(`b${i}`, 10 + i * 0.2)
  );
  const recent = [incident("r1", 2), incident("r2", 4)];
  const r = detect([...baseline, ...recent], { riskLevel: "critical" });
  const decrease = r.changes.find((c) =>
    c.key.includes("incident_risk:critical:decrease")
  );
  results.push({
    case: "Case 8 — critical decrease",
    pass:
      !!decrease &&
      decrease.direction === "decreasing" &&
      decrease.previousCount === 8 &&
      decrease.recentCount === 2,
    detail: decrease
      ? `${decrease.direction} ${decrease.previousCount}→${decrease.recentCount}`
      : "none",
  });
}

let failed = 0;
for (const row of results) {
  const mark = row.pass ? "PASS" : "FAIL";
  if (!row.pass) failed += 1;
  console.log(`${mark}  ${row.case}`);
  console.log(`      ${row.detail}`);
}

if (failed > 0) {
  console.error(`\n${failed} fixture case(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} fixture cases passed.`);
