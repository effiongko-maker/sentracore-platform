import type { BriefingViewModel } from "./buildBriefingViewModel";

export type ExploreModule =
  | "Incidents"
  | "Maintenance"
  | "Work Orders"
  | "Facilities";

export type ExploreResponse = {
  answer: string;
  found: string;
  evidence: string[];
  modules: ExploreModule[];
};

const SUGGESTED_QUESTIONS = [
  "Why are critical incidents increasing?",
  "What changed this month?",
  "Where is the highest risk concentrated?",
  "What should we look at next?",
] as const;

export function suggestedExploreQuestions(): readonly string[] {
  return SUGGESTED_QUESTIONS;
}

function matchQuestion(query: string): string {
  return query.trim().toLowerCase();
}

export function buildExploreResponse(
  query: string,
  vm: BriefingViewModel
): ExploreResponse {
  const q = matchQuestion(query);

  if (q.includes("incident") || q.includes("increasing")) {
    const change = vm.changeFindings.find((f) =>
      f.title.toLowerCase().includes("incident")
    );
    const priority = vm.attentionFindings.find((f) =>
      f.title.toLowerCase().includes("incident")
    );
    return {
      answer:
        change?.summary ??
        priority?.summary ??
        "Incident activity is concentrated in specific places rather than rising evenly across the organisation.",
      found:
        change?.title ??
        priority?.title ??
        "Incident activity is uneven across facilities",
      evidence: [
        ...(change ? [change.summary] : []),
        ...(priority ? [priority.summary] : []),
        vm.statementSupport,
      ].filter(Boolean),
      modules: ["Incidents", "Facilities", "Maintenance"],
    };
  }

  if (q.includes("attention") || q.includes("need")) {
    const top = vm.attentionFindings.slice(0, 3);
    return {
      answer:
        top.length > 0
          ? `${top.length} priorit${top.length === 1 ? "y" : "ies"} currently need attention. Start with: ${top[0]?.title}.`
          : "Nothing urgent is active right now. The organisation looks steady across recent activity.",
      found:
        top[0]?.title ?? "Attention looks steady",
      evidence: top.map((f) => f.summary),
      modules: ["Incidents", "Work Orders", "Maintenance"],
    };
  }

  if (q.includes("investigate") || q.includes("next")) {
    const top = vm.attentionFindings.slice(0, 3);
    return {
      answer:
        top.length > 0
          ? `Start with: ${top.map((f) => f.title).join("; ")}.`
          : "Things look steady. Check What changed for recent shifts.",
      found: top[0]?.title ?? "Organisation-wide review",
      evidence: top.map((f) => f.summary),
      modules: ["Incidents", "Maintenance", "Work Orders", "Facilities"],
    };
  }

  if (q.includes("highest-risk") || q.includes("highest risk")) {
    const risk = vm.attentionFindings.find(
      (f) =>
        f.severity === "critical" ||
        f.severity === "high" ||
        f.title.toLowerCase().includes("risk")
    );
    const pattern = vm.patternFindings.find((f) =>
      f.title.toLowerCase().includes("concentrat")
    );
    return {
      answer:
        risk?.summary ??
        pattern?.summary ??
        "Risk is not even. A smaller set of facilities is carrying more of the serious activity.",
      found: risk?.title ?? pattern?.title ?? "Risk is concentrated in a few places",
      evidence: [risk?.summary, pattern?.summary, vm.statementSupport].filter(
        Boolean
      ) as string[],
      modules: ["Facilities", "Incidents", "Work Orders"],
    };
  }

  if (q.includes("change") || q.includes("month")) {
    const changes = vm.changeFindings.slice(0, 4);
    return {
      answer:
        changes.length > 0
          ? `SentraCore found ${changes.length} meaningful shift${changes.length === 1 ? "" : "s"}. The main one: ${changes[0]?.title}.`
          : "No meaningful organisation-wide shifts showed up in this review period.",
      found: changes[0]?.title ?? "A steady period",
      evidence: changes.map((f) => f.summary),
      modules: ["Incidents", "Maintenance", "Work Orders", "Facilities"],
    };
  }

  const fallback = vm.attentionFindings[0] ?? vm.changeFindings[0];
  return {
    answer:
      fallback?.summary ??
      "SentraCore is reviewing activity across incidents, maintenance, work orders, and facilities to surface what matters.",
    found: fallback?.title ?? "Organisation-wide view",
    evidence: vm.statementSupport ? [vm.statementSupport] : [],
    modules: ["Incidents", "Maintenance", "Work Orders", "Facilities"],
  };
}
