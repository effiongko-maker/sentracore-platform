import type { BriefingFinding } from "./buildBriefingViewModel";

export type ThreadStepKind = "event" | "link" | "pattern";

export type IntelligenceThreadStep = {
  id: string;
  label: string;
  kind: ThreadStepKind;
};

export function buildIntelligenceThread(
  primary: BriefingFinding | null
): IntelligenceThreadStep[] {
  if (!primary) return [];

  const title = primary.title.toLowerCase();

  if (
    title.includes("leak") ||
    title.includes("water") ||
    title.includes("incident")
  ) {
    return [
      { id: "t1", label: "Initial incident reported", kind: "event" },
      { id: "t2", label: "Second incident in the same area", kind: "event" },
      { id: "t3", label: "Maintenance request delayed", kind: "link" },
      { id: "t4", label: "Third critical incident", kind: "event" },
      { id: "t5", label: "Recurring issue noticed", kind: "pattern" },
    ];
  }

  if (
    title.includes("guidance") ||
    title.includes("recommendation") ||
    title.includes("dismiss") ||
    title.includes("ignored")
  ) {
    return [
      { id: "t1", label: "Recommendation issued", kind: "event" },
      { id: "t2", label: "Repeated dismissals recorded", kind: "event" },
      { id: "t3", label: "Risk posture unchanged", kind: "link" },
      { id: "t4", label: "Higher exposure continues", kind: "event" },
      { id: "t5", label: "Attention signal formed", kind: "pattern" },
    ];
  }

  if (title.includes("maintenance") || title.includes("backlog") || title.includes("building up")) {
    return [
      { id: "t1", label: "Maintenance volume rising", kind: "event" },
      { id: "t2", label: "Work orders concentrated", kind: "link" },
      { id: "t3", label: "Location activity diverges", kind: "event" },
      { id: "t4", label: "Team under growing pressure", kind: "event" },
      { id: "t5", label: "Priority surfaced", kind: "pattern" },
    ];
  }

  return [
    { id: "t1", label: "Activity observed", kind: "event" },
    { id: "t2", label: "Related items connected", kind: "link" },
    { id: "t3", label: "Conditions persist", kind: "event" },
    { id: "t4", label: "Confidence increased", kind: "link" },
    { id: "t5", label: "Finding formed", kind: "pattern" },
  ];
}
