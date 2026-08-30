/**
 * Deterministic reasoning synthesis for Intelligence Insights.
 * Separates FACT → INFERENCE → IMPLICATION → RECOMMENDATION.
 * Does not invent counts or causes; omits layers when evidence is insufficient.
 */

import type { InsightConfidence, InsightReasoningType } from "./types";

export type ReasoningEvidenceSignal = {
  label: string;
  value: string;
};

export type ReasoningSynthesisInput = {
  title: string;
  observation: string;
  /** Raw fact text from whatItSaw / counts. */
  factSeed: string;
  evidence: ReasoningEvidenceSignal[];
  reasoningType: InsightReasoningType;
  /** Investigation prompts — never used as Recommendation text. */
  investigationPrompts?: string[];
  /** Legacy shallow why text — may inform pattern hints only if not duplicated. */
  legacyWhy?: string;
  storyStatus?: string;
  sequenceKind?: string;
  facilityLabel?: string;
  assetCount?: number;
  findingCount?: number;
  eventCount?: number;
  /** Prior confidence hint from source (may be recalibrated). */
  confidenceHint?: InsightConfidence;
  isPositive?: boolean;
  isResolved?: boolean;
};

export type ReasoningSynthesis = {
  fact: string;
  inference: string;
  impact?: string;
  recommendation?: string;
  confidence: InsightConfidence;
  confidenceBasis: string;
  /** Investigation prompts preserved for panel/actions — not recommendation. */
  investigation: string[];
  outcomeSummary?: string;
};

type ParsedSignals = {
  recentIncidents: number | null;
  previousIncidents: number | null;
  delayedWorkOrders: number | null;
  linkedOpenIncidents: number | null;
  openMaintenance: number | null;
  openWorkOrders: number | null;
  maintenanceActivities: number | null;
  workOrderActivities: number | null;
  facilities: number | null;
  assets: number | null;
  relatedActivities: number | null;
  findingCount: number | null;
  responseRatio: number | null;
  recentResponses: number | null;
};

const INTERPRETIVE =
  /\b(may|might|suggests?|appears?|could|likely|possible|indicates?|consistent with|raises the possibility|warrants)\b/i;

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const m = cleaned.match(/^-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function numFromEvidence(
  evidence: ReasoningEvidenceSignal[],
  ...labelParts: string[]
): number | null {
  for (const item of evidence) {
    const label = item.label.toLowerCase();
    if (labelParts.every((p) => label.includes(p))) {
      const n = parseNumber(item.value);
      if (n != null) return n;
    }
  }
  return null;
}

function parseSignals(
  evidence: ReasoningEvidenceSignal[],
  input: ReasoningSynthesisInput
): ParsedSignals {
  const fromText = parseCountsFromText(
    `${input.factSeed} ${input.observation} ${input.title}`
  );
  return {
    recentIncidents:
      numFromEvidence(evidence, "recent", "incident") ??
      numFromEvidence(evidence, "incident activit") ??
      fromText.recentIncidents ??
      null,
    previousIncidents:
      numFromEvidence(evidence, "previous", "incident") ??
      fromText.previousIncidents ??
      null,
    delayedWorkOrders:
      numFromEvidence(evidence, "delayed", "work") ??
      fromText.delayedWorkOrders ??
      null,
    linkedOpenIncidents:
      numFromEvidence(evidence, "linked", "open", "incident") ??
      numFromEvidence(evidence, "linked open incident") ??
      fromText.linkedOpenIncidents ??
      null,
    openMaintenance:
      numFromEvidence(evidence, "open", "maintenance") ??
      fromText.openMaintenance ??
      null,
    openWorkOrders:
      numFromEvidence(evidence, "open", "work") ??
      fromText.openWorkOrders ??
      null,
    maintenanceActivities:
      numFromEvidence(evidence, "maintenance activit") ??
      fromText.maintenanceActivities ??
      null,
    workOrderActivities:
      numFromEvidence(evidence, "work order activit") ??
      fromText.workOrderActivities ??
      null,
    facilities:
      numFromEvidence(evidence, "facilities") ??
      fromText.facilities ??
      (input.facilityLabel ? 1 : null),
    assets:
      numFromEvidence(evidence, "assets") ??
      fromText.assets ??
      (input.assetCount && input.assetCount > 0 ? input.assetCount : null),
    relatedActivities:
      numFromEvidence(evidence, "related activit") ??
      fromText.relatedActivities ??
      (input.eventCount && input.eventCount > 0 ? input.eventCount : null),
    findingCount:
      numFromEvidence(evidence, "related finding") ??
      fromText.findingCount ??
      (input.findingCount && input.findingCount > 0 ? input.findingCount : null),
    responseRatio: numFromEvidence(evidence, "response rate"),
    recentResponses:
      numFromEvidence(evidence, "recent", "response") ??
      fromText.recentResponses ??
      null,
  };
}

/** Extract grounded counts embedded in whatItSaw / summary copy. */
function parseCountsFromText(text: string): Partial<ParsedSignals> {
  const t = text.toLowerCase();
  const out: Partial<ParsedSignals> = {};

  const incVs = t.match(
    /(\d+)\s+incidents?\s+(?:were\s+)?(?:reported|recorded)[^.]*?(?:versus|vs\.?|compared with)\s+(\d+)/i
  );
  if (incVs) {
    out.recentIncidents = Number(incVs[1]);
    out.previousIncidents = Number(incVs[2]);
  } else {
    const inc = t.match(
      /(\d+)\s+incidents?\s+(?:were\s+)?(?:reported|recorded)/i
    );
    if (inc) out.recentIncidents = Number(inc[1]);
  }

  const maintWo = t.match(
    /(\d+)\s+maintenance requests?\s+or\s+work orders?/i
  );
  if (maintWo) {
    out.maintenanceActivities = Number(maintWo[1]);
    // Do not treat "created recently" as unfinished backlog.
  }

  const openMaint = t.match(/(\d+)\s+open maintenance/i);
  if (openMaint) out.openMaintenance = Number(openMaint[1]);

  const unfinished = t.match(
    /(\d+)\s+maintenance requests?\s+or\s+work orders?\s+have no completion/i
  );
  if (unfinished) {
    out.openMaintenance = Number(unfinished[1]);
  }

  const delayed = t.match(
    /(\d+)\s+work orders?\s+(?:stayed|remained)\s+unstarted|(\d+)\s+work orders?\s+(?:that\s+)?(?:remained\s+)?unstarted|moved slowly/i
  );
  if (delayed) {
    const n = Number(delayed[1] || delayed[2]);
    if (Number.isFinite(n)) out.delayedWorkOrders = n;
  } else {
    const delayedAlt = t.match(/(\d+)\s+work orders?\s+stayed unstarted/i);
    if (delayedAlt) out.delayedWorkOrders = Number(delayedAlt[1]);
  }

  const linked = t.match(
    /(\d+)\s+linked incidents?\s+(?:still\s+)?(?:had|have)\s+no\s+resolve/i
  );
  if (linked) out.linkedOpenIncidents = Number(linked[1]);

  const fac = t.match(/(\d+)\s+facilit(?:y|ies)/i);
  if (fac) out.facilities = Number(fac[1]);

  const assets = t.match(/(\d+)\s+assets?\b/i);
  if (assets) out.assets = Number(assets[1]);

  return out;
}

function stripInterpretive(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (!INTERPRETIVE.test(t)) return t;
  // Prefer non-interpretive sentences when mixed
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const factual = sentences.filter((s) => !INTERPRETIVE.test(s));
  if (factual.length > 0) return factual.join(" ");
  return t;
}

function normalizeFact(factSeed: string, signals: ParsedSignals): string {
  const seed = stripInterpretive(factSeed);
  if (seed.trim()) return seed.trim();

  const parts: string[] = [];
  if (signals.recentIncidents != null) {
    const prev =
      signals.previousIncidents != null
        ? ` versus ${signals.previousIncidents} in the comparison period`
        : "";
    parts.push(
      `${signals.recentIncidents} incident${
        signals.recentIncidents === 1 ? " was" : "s were"
      } recorded in the recent window${prev}.`
    );
  }
  const unfinished =
    (signals.openMaintenance ?? 0) +
    (signals.openWorkOrders ?? 0) +
    (signals.delayedWorkOrders ?? 0);
  if (unfinished > 0) {
    const delayed =
      signals.delayedWorkOrders != null && signals.delayedWorkOrders > 0
        ? `, including ${signals.delayedWorkOrders} that remained unstarted or progressed slowly`
        : "";
    parts.push(
      `${unfinished} maintenance request${unfinished === 1 ? "" : "s"} or work order${
        unfinished === 1 ? "" : "s"
      } have no completion recorded${delayed}.`
    );
  }
  if (signals.linkedOpenIncidents != null && signals.linkedOpenIncidents > 0) {
    parts.push(
      `${signals.linkedOpenIncidents} linked incident${
        signals.linkedOpenIncidents === 1 ? " has" : "s have"
      } no resolution recorded.`
    );
  }
  if (signals.facilities != null && signals.facilities > 0) {
    parts.push(
      `Activity spans ${signals.facilities} facilit${
        signals.facilities === 1 ? "y" : "ies"
      }.`
    );
  }
  if (signals.assets != null && signals.assets > 1) {
    parts.push(
      `Multiple activities relate to the same assets (${signals.assets} assets referenced).`
    );
  }
  return parts.join(" ").trim();
}

function distinctFrom(text: string, ...others: string[]): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(text);
  if (!a) return false;
  return others.every((o) => {
    const b = norm(o);
    if (!b) return true;
    if (a === b) return false;
    // Near-duplicate if one contains the other and lengths are close
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    if (longer.includes(shorter) && shorter.length / longer.length > 0.72) {
      return false;
    }
    return true;
  });
}

function relationshipFlags(signals: ParsedSignals, input: ReasoningSynthesisInput) {
  const incidentRise =
    signals.recentIncidents != null &&
    signals.previousIncidents != null &&
    signals.recentIncidents > signals.previousIncidents;
  const unfinished =
    (signals.openMaintenance ?? 0) +
    (signals.openWorkOrders ?? 0) +
    (signals.delayedWorkOrders ?? 0);
  const hasBacklog =
    unfinished > 0 ||
    (signals.linkedOpenIncidents ?? 0) > 0 ||
    (signals.maintenanceActivities != null &&
      signals.maintenanceActivities > 0 &&
      incidentRise);
  const hasConcentration =
    (signals.facilities != null && signals.facilities > 0 && signals.facilities <= 3) ||
    (signals.assets != null && signals.assets > 0);
  const failedIntervention =
    input.sequenceKind === "failed_intervention" ||
    input.reasoningType === "treatment_effectiveness" ||
    /after maintenance|recurrence|failed intervention/i.test(
      `${input.title} ${input.observation} ${input.legacyWhy ?? ""}`
    );
  const responsePressure =
    input.sequenceKind === "response_failure" ||
    input.reasoningType === "capacity" ||
    (signals.responseRatio != null && signals.responseRatio < 1) ||
    incidentRise;
  const positive =
    Boolean(input.isPositive) ||
    input.reasoningType === "positive" ||
    /stabilis|improving|acceptance/i.test(input.storyStatus ?? "");

  return {
    incidentRise,
    unfinished,
    hasBacklog,
    hasConcentration,
    failedIntervention,
    responsePressure,
    positive,
    multiSignal:
      [incidentRise, hasBacklog, hasConcentration, failedIntervention].filter(Boolean)
        .length >= 2,
  };
}

function buildInference(
  signals: ParsedSignals,
  flags: ReturnType<typeof relationshipFlags>,
  input: ReasoningSynthesisInput
): string | null {
  if (flags.positive && !flags.failedIntervention) {
    const bits: string[] = [];
    if (signals.recentIncidents != null && signals.previousIncidents != null) {
      if (signals.recentIncidents < signals.previousIncidents) {
        bits.push(
          "Incident volume has declined relative to the comparison period"
        );
      }
    }
    if (input.storyStatus?.toLowerCase().includes("resolv")) {
      bits.push("related activity has moved to a resolved state");
    }
    if (bits.length === 0) {
      bits.push(
        "Observed operational signals are moving in a favourable direction"
      );
    }
    return `${bits.join(", ")}. This is consistent with an improvement in treatment effectiveness or reduced operational pressure, although the observation window remains limited.`;
  }

  if (flags.failedIntervention) {
    return "Related incidents continuing after completed maintenance is consistent with an intervention that may not have fully resolved the underlying issue, rather than an unrelated new failure alone.";
  }

  if (flags.incidentRise && flags.hasBacklog) {
    const unfinishedLabel =
      flags.unfinished > 0
        ? `${flags.unfinished} unfinished maintenance or work-order item${
            flags.unfinished === 1 ? "" : "s"
          }`
        : signals.delayedWorkOrders != null && signals.delayedWorkOrders > 0
          ? `${signals.delayedWorkOrders} stalled or slow-moving work order${
              signals.delayedWorkOrders === 1 ? "" : "s"
            }`
          : "unfinished treatment work";
    const openInc =
      signals.linkedOpenIncidents != null && signals.linkedOpenIncidents > 0
        ? ` and ${signals.linkedOpenIncidents} still-open linked incident${
            signals.linkedOpenIncidents === 1 ? "" : "s"
          }`
        : "";
    const createdAlongside =
      signals.maintenanceActivities != null &&
      signals.maintenanceActivities > 0 &&
      flags.unfinished === 0
        ? ` a large volume of recent treatment activity (${signals.maintenanceActivities} maintenance requests or work orders)`
        : unfinishedLabel;
    return `The increase in incident activity is occurring alongside ${
      flags.unfinished > 0 || (signals.delayedWorkOrders ?? 0) > 0
        ? unfinishedLabel
        : createdAlongside
    }${openInc}. This is consistent with a possible treatment-capacity or unresolved-root-cause problem rather than incident volume alone.`;
  }

  if (flags.hasBacklog && (signals.linkedOpenIncidents ?? 0) > 0) {
    return `Unresolved incidents are appearing alongside stalled or incomplete treatment work. This raises the possibility that response capacity or treatment sequencing is limiting closure, rather than a one-off reporting spike.`;
  }

  if (flags.incidentRise && !flags.hasBacklog) {
    return `Incident volume has risen versus the comparison period. This may indicate a developing operational pressure, though supporting treatment backlog evidence is limited in this window.`;
  }

  if (
    flags.hasConcentration &&
    (signals.assets ?? 0) > 1 &&
    (signals.relatedActivities ?? 0) >= 3
  ) {
    return `Repeated activity clustering around the same assets or facilities suggests a concentrated operational issue rather than evenly distributed noise across the organisation.`;
  }

  if (input.reasoningType === "recommendation") {
    return `Operator responses to recommendations show a material pattern in this window. This may indicate either recommendation fit issues or limited capacity to act on advice.`;
  }

  if (input.reasoningType === "recurrence" || input.reasoningType === "pattern") {
    return `The repeated pattern in related operational activity suggests an underlying condition that is not being cleared by isolated corrective actions.`;
  }

  if (input.reasoningType === "anomaly" || input.reasoningType === "risk") {
    return `The observed signals diverge from the surrounding operational baseline and may indicate elevated exposure that warrants focused review.`;
  }

  // Insufficient relationship evidence — do not force a shallow restatement
  if ((signals.relatedActivities ?? 0) < 2 && (signals.findingCount ?? 0) < 2) {
    return null;
  }

  return `Connected operational signals in this window appear associated with unfinished or recurring work. This warrants investigation of shared location, asset, or treatment factors before treating each event in isolation.`;
}

function buildImpact(
  inference: string,
  flags: ReturnType<typeof relationshipFlags>,
  signals: ParsedSignals,
  input: ReasoningSynthesisInput
): string | undefined {
  if (flags.positive && !flags.failedIntervention) {
    const impact =
      "Faster or more durable treatment outcomes may reduce operational disruption and free response capacity for remaining pressure points.";
    return distinctFrom(impact, inference) ? impact : undefined;
  }

  if (flags.failedIntervention) {
    const impact =
      "If interventions are not removing the conditions generating failures, recurrence can continue to consume response capacity and delay lasting resolution.";
    return distinctFrom(impact, inference) ? impact : undefined;
  }

  if (flags.incidentRise && flags.hasBacklog) {
    const impact =
      "If unresolved work accumulates while incidents continue, individual failures may keep generating repeat operational pressure and consume response capacity.";
    return distinctFrom(impact, inference) ? impact : undefined;
  }

  if (flags.hasBacklog) {
    const impact =
      "Leaving linked treatment work unfinished can extend exposure, enlarge backlog, and delay resolution of the originating issues.";
    return distinctFrom(impact, inference) ? impact : undefined;
  }

  if (flags.hasConcentration) {
    const impact =
      "Concentration at a small set of facilities or assets can create local bottlenecks and raise the chance of repeated disruption in the same places.";
    return distinctFrom(impact, inference) ? impact : undefined;
  }

  if (input.reasoningType === "recommendation") {
    const impact =
      "When recommendation responses diverge from operational need, useful advice may be missed while attention is spent on poorer-fit prompts.";
    return distinctFrom(impact, inference) ? impact : undefined;
  }

  // Only emit impact when we have a real relational inference
  if (!flags.multiSignal && !flags.responsePressure) return undefined;
  const fallback =
    "Without addressing the connected pattern, the operation may keep treating symptoms while the conditions generating them persist.";
  return distinctFrom(fallback, inference) ? fallback : undefined;
}

function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text.trim()) || /^(why|what|how|was|were|did|is|are)\b/i.test(text.trim());
}

function buildRecommendation(
  flags: ReturnType<typeof relationshipFlags>,
  signals: ParsedSignals,
  input: ReasoningSynthesisInput,
  inference: string
): string | undefined {
  // Never promote investigation questions
  const prompts = (input.investigationPrompts ?? []).filter(
    (p) => p.trim() && !isQuestion(p)
  );

  if (flags.positive && !flags.failedIntervention) {
    return "Preserve the current treatment approach in the affected area and compare outcomes against other facilities before standardising it.";
  }

  if (flags.failedIntervention) {
    return "Review the completed maintenance against the subsequent incidents for shared assets or failure modes, then adjust the corrective plan before repeating the same intervention.";
  }

  if (flags.incidentRise && flags.hasBacklog) {
    const openInc = signals.linkedOpenIncidents;
    const delayed = signals.delayedWorkOrders;
    const parts: string[] = [];
    if (openInc != null && openInc > 0) {
      parts.push(`the ${openInc} unresolved linked incident${openInc === 1 ? "" : "s"}`);
    }
    if (delayed != null && delayed > 0) {
      parts.push(
        `the ${delayed} stalled work order${delayed === 1 ? "" : "s"}`
      );
    }
    if (parts.length === 0 && flags.unfinished > 0) {
      parts.push(
        `the ${flags.unfinished} unfinished maintenance or work-order item${
          flags.unfinished === 1 ? "" : "s"
        }`
      );
    }
    if (parts.length === 0) return undefined;
    const focus = parts.join(" and ");
    return `Prioritise ${focus}, then check whether they cluster around the same facilities or assets before creating additional isolated corrective work.`;
  }

  if (flags.hasBacklog && (signals.linkedOpenIncidents ?? 0) > 0) {
    return `Prioritise closing the linked open incidents by advancing their associated work orders, and compare those items for a shared blocker before opening new parallel corrective work.`;
  }

  if (flags.hasConcentration && (signals.assets ?? 0) > 0) {
    return `Compare the concentrated activities for a shared asset, location, or failure pattern, then sequence corrective work against that common factor rather than handling each event in isolation.`;
  }

  if (input.reasoningType === "recommendation") {
    return "Review recently dismissed or deferred recommendations against current operational pressure and retire or rewrite those that no longer match live conditions.";
  }

  if (prompts.length > 0) {
    // Convert non-question prompts into an action only if actionable
    const joined = prompts[0];
    if (!isQuestion(joined) && distinctFrom(joined, inference, input.observation)) {
      return joined.endsWith(".") ? joined : `${joined}.`;
    }
  }

  if (!flags.multiSignal && (signals.relatedActivities ?? 0) < 3) {
    return undefined;
  }

  return "Identify the shared facility, asset, or treatment factor across the related activities, then prioritise corrective work against that common factor.";
}

function calibrateConfidence(
  flags: ReturnType<typeof relationshipFlags>,
  signals: ParsedSignals,
  hint: InsightConfidence | undefined,
  hasInference: boolean
): { confidence: InsightConfidence; basis: string } {
  if (!hasInference) {
    return {
      confidence: "Emerging",
      basis: "Evidence is present, but relationships are not strong enough for a firmer interpretation.",
    };
  }

  const converging =
    flags.multiSignal ||
    (flags.incidentRise && flags.hasBacklog) ||
    flags.failedIntervention;

  const corroboration =
    (signals.findingCount ?? 0) +
    (signals.relatedActivities != null && signals.relatedActivities >= 5 ? 1 : 0) +
    (flags.hasConcentration ? 1 : 0);

  if (converging && corroboration >= 2) {
    return {
      confidence: "High",
      basis: "Multiple converging operational signals support this interpretation.",
    };
  }

  if (converging || corroboration >= 1) {
    return {
      confidence: "Moderate",
      basis: "Evidence supports this reading, but alternative explanations remain plausible.",
    };
  }

  if (hint === "High" && !converging) {
    // Do not keep High merely because source severity was high / many points
    return {
      confidence: "Moderate",
      basis: "Activity volume is notable, but inference strength remains moderate without converging relationships.",
    };
  }

  if (hint === "Moderate") {
    return {
      confidence: "Moderate",
      basis: "Evidence supports a cautious interpretation.",
    };
  }

  return {
    confidence: "Emerging",
    basis: "Early signal — insufficient converging evidence for a stronger conclusion.",
  };
}

function buildResolvedOutcome(
  input: ReasoningSynthesisInput,
  signals: ParsedSignals
): string | undefined {
  if (!input.isResolved) return undefined;
  const bits: string[] = ["The related operational story is marked resolved."];
  if (signals.relatedActivities != null && signals.relatedActivities > 0) {
    bits.push(
      "No stronger conflicting recurrence signal is required to report this outcome."
    );
  }
  bits.push(
    "This is consistent with reduced recurrence in the observation window, although causation is not established."
  );
  return bits.join(" ");
}

/**
 * Synthesise distinct reasoning layers from grounded evidence.
 * Returns null inference layers omitted rather than fabricating meaning.
 */
export function synthesizeInsightReasoning(
  input: ReasoningSynthesisInput
): ReasoningSynthesis {
  const signals = parseSignals(input.evidence, input);
  const flags = relationshipFlags(signals, input);
  const fact =
    normalizeFact(input.factSeed, signals) ||
    stripInterpretive(input.observation) ||
    input.title;

  const inferenceRaw = buildInference(signals, flags, input);
  const inference =
    inferenceRaw &&
    distinctFrom(inferenceRaw, fact, input.observation, input.title)
      ? inferenceRaw
      : inferenceRaw && distinctFrom(inferenceRaw, fact)
        ? inferenceRaw
        : inferenceRaw
          ? inferenceRaw
          : // Honest weak inference only when we have some activity
            (signals.relatedActivities ?? 0) >= 2 ||
              (signals.findingCount ?? 0) >= 2
            ? "Related operational signals are present, but the evidence is not yet strong enough to support a firmer interpretation beyond continued monitoring of the connected activities."
            : "Evidence is limited; SentraCore is not drawing a stronger interpretation yet.";

  // If inference still collapses to fact, force a relationship-aware rewrite or soft fallback
  let finalInference = inference;
  if (!distinctFrom(finalInference, fact, input.observation)) {
    const retry = buildInference(signals, { ...flags, multiSignal: true }, input);
    if (retry && distinctFrom(retry, fact, input.observation)) {
      finalInference = retry;
    } else {
      finalInference =
        "The available facts are clear, but converging relationships are limited. SentraCore treats this as an early signal rather than a firm operational conclusion.";
    }
  }

  const impact = buildImpact(finalInference, flags, signals, input);
  let recommendation = buildRecommendation(
    flags,
    signals,
    input,
    finalInference
  );
  if (recommendation && isQuestion(recommendation)) {
    recommendation = undefined;
  }
  if (
    recommendation &&
    !distinctFrom(recommendation, finalInference, fact, input.observation)
  ) {
    recommendation = undefined;
  }

  const { confidence, basis } = calibrateConfidence(
    flags,
    signals,
    input.confidenceHint,
    Boolean(inferenceRaw) && distinctFrom(finalInference, fact)
  );

  const investigation = (input.investigationPrompts ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    fact,
    inference: finalInference,
    impact,
    recommendation,
    confidence,
    confidenceBasis: basis,
    investigation,
    outcomeSummary: buildResolvedOutcome(input, signals),
  };
}

/** Test helpers exported for deterministic verification. */
export function reasoningLayersAreDistinct(layers: {
  observation: string;
  fact: string;
  inference: string;
  impact?: string;
  recommendation?: string;
}): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!distinctFrom(layers.inference, layers.observation, layers.fact)) {
    failures.push("inference_not_distinct");
  }
  if (
    layers.impact &&
    !distinctFrom(layers.impact, layers.inference, layers.fact)
  ) {
    failures.push("impact_not_distinct");
  }
  if (layers.recommendation && isQuestion(layers.recommendation)) {
    failures.push("recommendation_is_question");
  }
  if (
    layers.recommendation &&
    !distinctFrom(
      layers.recommendation,
      layers.inference,
      layers.fact,
      layers.observation
    )
  ) {
    failures.push("recommendation_not_distinct");
  }
  if (layers.recommendation && INTERPRETIVE.test(layers.fact) === false) {
    // fact should not be heavily interpretive — soft check via inference presence
  }
  if (INTERPRETIVE.test(layers.fact)) {
    failures.push("fact_contains_inference_language");
  }
  if (!INTERPRETIVE.test(layers.inference) && layers.inference.length > 40) {
    // Strong inferences should usually be calibrated; allow resolved/positive edge cases
    if (!/consistent with|improvement|limited/i.test(layers.inference)) {
      failures.push("inference_missing_calibrated_language");
    }
  }
  return { ok: failures.length === 0, failures };
}
