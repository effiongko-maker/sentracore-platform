/**
 * Deterministic reasoning-quality checks for Phase 3.2.
 *   npx tsx scripts/verify-intelligence-reasoning.ts
 */
import {
  reasoningLayersAreDistinct,
  synthesizeInsightReasoning,
} from "../src/lib/intelligence/insights/synthesizeInsightReasoning";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const results: string[] = [];

  // 1–4, 6–7: backlog + incident rise scenario (example from spec)
  const rising = synthesizeInsightReasoning({
    title: "Issues are growing faster than they’re being addressed",
    observation:
      "Incidents are arriving faster than maintenance and work orders are clearing them.",
    factSeed:
      "38 incidents were reported in the last 7 days versus 0 in the period before that, while 32 maintenance requests or work orders were created recently. 14 work orders stayed unstarted or moved slowly; 5 linked incidents still had no resolve recorded.",
    evidence: [
      { label: "Recent incidents", value: "38" },
      { label: "Previous-period incidents", value: "0" },
      { label: "Delayed work orders", value: "14" },
      { label: "Linked open incidents", value: "5" },
      { label: "Open maintenance", value: "18" },
      { label: "Facilities", value: "2" },
      { label: "Assets", value: "4" },
      { label: "Related activities", value: "70" },
      { label: "Related findings", value: "3" },
    ],
    reasoningType: "capacity",
    investigationPrompts: [
      "Why has this work order not started yet?",
      "What is blocking this incident from being closed?",
    ],
    confidenceHint: "High",
    eventCount: 70,
    findingCount: 3,
    assetCount: 4,
    facilityLabel: "NCC Annex",
  });

  assert(rising.fact.length > 0, "fact present");
  assert(
    !/\b(may|suggests|appears|likely|could mean)\b/i.test(rising.fact),
    "fact must not use inference language"
  );
  results.push("PASS fact is observational");

  const distinct = reasoningLayersAreDistinct({
    observation:
      "Incidents are arriving faster than maintenance and work orders are clearing them.",
    fact: rising.fact,
    inference: rising.inference,
    impact: rising.impact,
    recommendation: rising.recommendation,
  });
  assert(distinct.ok, `layers not distinct: ${distinct.failures.join(",")}`);
  results.push("PASS inference/impact/recommendation distinct from facts");

  assert(rising.recommendation, "recommendation required for strong signal");
  assert(!/\?\s*$/.test(rising.recommendation!), "recommendation not a question");
  assert(
    !rising.investigation.some((q) => rising.recommendation === q),
    "recommendation must not equal investigation prompts"
  );
  assert(
    /prioritise|prioritize|compare|review|preserve|identify|sequence/i.test(
      rising.recommendation!
    ),
    "recommendation should be actionable"
  );
  results.push("PASS recommendation actionable and not investigation question");

  assert(
    /\b(consistent with|may indicate|raises the possibility|suggests|appears associated)\b/i.test(
      rising.inference
    ),
    "inference uses calibrated language"
  );
  results.push("PASS calibrated inference language");

  assert(
    rising.confidence === "High" || rising.confidence === "Moderate",
    `expected High/Moderate, got ${rising.confidence}`
  );
  results.push(`PASS confidence calibrated (${rising.confidence})`);

  // 5: insufficient evidence must not fabricate strong conclusion
  const weak = synthesizeInsightReasoning({
    title: "Sparse signal",
    observation: "Limited related activity.",
    factSeed: "1 related operational activity was recorded.",
    evidence: [{ label: "Related activities", value: "1" }],
    reasoningType: "pattern",
    confidenceHint: "High",
  });
  assert(weak.confidence === "Emerging" || weak.confidence === "Moderate", "weak not High");
  assert(
    !/caused|proves|definitely|will escalate/i.test(weak.inference),
    "no fabricated certainty"
  );
  results.push("PASS insufficient evidence does not fabricate certainty");

  // 8: positive discipline
  const positive = synthesizeInsightReasoning({
    title: "Treatment pressure easing",
    observation: "Incident volume declined while related work closed.",
    factSeed:
      "12 incidents were recorded versus 28 in the comparison period. Open work orders fell.",
    evidence: [
      { label: "Recent incidents", value: "12" },
      { label: "Previous-period incidents", value: "28" },
      { label: "Related activities", value: "20" },
      { label: "Related findings", value: "2" },
    ],
    reasoningType: "positive",
    isPositive: true,
    confidenceHint: "Moderate",
    eventCount: 20,
    findingCount: 2,
  });
  assert(
    /consistent with|improvement|favourable|favorable/i.test(positive.inference),
    "positive inference grounded"
  );
  assert(positive.recommendation && !/\?$/.test(positive.recommendation), "positive reco");
  results.push("PASS positive intelligence discipline");

  // 9: resolved outcome grounding
  const resolved = synthesizeInsightReasoning({
    title: "Story resolved",
    observation: "Connected picture closed.",
    factSeed: "Maintenance completed; no further incident recorded in window.",
    evidence: [
      { label: "Related findings", value: "2" },
      { label: "Related activities", value: "8" },
    ],
    reasoningType: "positive",
    isPositive: true,
    isResolved: true,
    storyStatus: "resolved",
    findingCount: 2,
    eventCount: 8,
  });
  assert(resolved.outcomeSummary, "resolved outcome summary present");
  assert(
    /consistent with/i.test(resolved.outcomeSummary!),
    "resolved outcome cautious"
  );
  assert(!/caused|proves/i.test(resolved.outcomeSummary!), "no false causality");
  results.push("PASS recently resolved outcome grounding");

  // Causality guard on failed intervention
  const afterMaint = synthesizeInsightReasoning({
    title: "Incidents after maintenance",
    observation: "Incidents followed completed maintenance.",
    factSeed:
      "3 maintenance completions were followed by related incidents in the recurrence window.",
    evidence: [
      { label: "Maintenance activities", value: "3" },
      { label: "Incident activities", value: "5" },
      { label: "Related activities", value: "12" },
      { label: "Related findings", value: "2" },
      { label: "Assets", value: "2" },
    ],
    reasoningType: "treatment_effectiveness",
    sequenceKind: "failed_intervention",
    investigationPrompts: ["Did the completed maintenance address the real problem?"],
    findingCount: 2,
    eventCount: 12,
    assetCount: 2,
  });
  assert(!/maintenance caused/i.test(afterMaint.inference), "no false causation");
  assert(
    /may not have fully resolved|consistent with/i.test(afterMaint.inference),
    "calibrated post-maintenance inference"
  );
  assert(
    afterMaint.recommendation && !/\?$/.test(afterMaint.recommendation),
    "post-maint recommendation not question"
  );
  results.push("PASS causality guard");

  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
