import type { CommandCentreSnapshot } from "./presentationTypes";
import type { ExecutiveLensId } from "./nav";

/**
 * Executive Office — one-line signals derived ONLY from the existing Overview snapshot (attention, Finance decision
 * queue, commitments register, organisational pulse). Nothing is invented: a surface that is restricted, unavailable
 * or only partly evaluated says so and never becomes a zero.
 */
export type ExecutiveSignalTone = "attention" | "neutral" | "muted";

export type ExecutiveSignal = {
  /** Short headline, e.g. "3 matters need attention". */
  text: string;
  tone: ExecutiveSignalTone;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function attentionSignal(attention: CommandCentreSnapshot["attention"]): ExecutiveSignal {
  if (attention.state === "restricted") return { text: "Restricted for your access", tone: "muted" };
  if (attention.state === "unavailable" || attention.state === "error") return { text: "Not available right now", tone: "muted" };
  const total = attention.items.length + attention.hiddenCount;
  if (total === 0) {
    return attention.complete
      ? { text: "Nothing needs attention", tone: "neutral" }
      : { text: "None found in the areas that could be checked", tone: "muted" };
  }
  const text = plural(total, "matter needs attention", "matters need attention");
  return { text: attention.complete ? text : `${text} (partial coverage)`, tone: "attention" };
}

export function decisionsSignal(decisions: CommandCentreSnapshot["decisions"]): ExecutiveSignal {
  const count = decisions.items.length;
  switch (decisions.state) {
    case "healthy":
      return { text: plural(count, "decision awaiting you", "decisions awaiting you"), tone: count > 0 ? "attention" : "neutral" };
    case "empty":
      // The executive decision queue is Finance's (Facility Management approvals are client decisions).
      return { text: "No Finance decisions waiting", tone: "neutral" };
    case "partial":
      return count > 0
        ? { text: `${plural(count, "decision", "decisions")} visible (limited company access)`, tone: "attention" }
        : { text: "None visible (limited company access)", tone: "muted" };
    case "restricted":
      return { text: "Not offered for your access", tone: "muted" };
    default:
      return { text: "Not available right now", tone: "muted" };
  }
}

export function commitmentsSignal(commitments: CommandCentreSnapshot["commitments"]): ExecutiveSignal {
  if (commitments.state === "restricted") return { text: "Not offered for your access", tone: "muted" };
  if (commitments.state !== "healthy" && commitments.state !== "empty") {
    return { text: "Not available right now", tone: "muted" };
  }
  const overdue = commitments.overdue.length;
  const open = commitments.open.length;
  if (overdue > 0) return { text: `${plural(overdue, "commitment", "commitments")} overdue`, tone: "attention" };
  if (open > 0) return { text: `${plural(open, "open commitment", "open commitments")}`, tone: "neutral" };
  return { text: "No open commitments", tone: "neutral" };
}

/**
 * Financial position across the environments that state one: Platform Finance and Facility Management (Pending
 * Payments outstanding), each as its own pulse card states it (`financialLine`). An environment the actor may not see,
 * or that failed, is named as not included — the signal never implies an organisation-wide position it does not have.
 */
export function financialPositionSignal(pulse: CommandCentreSnapshot["pulse"]): ExecutiveSignal {
  const sources: Array<{ domain: "finance" | "facility_management"; label: string }> = [
    { domain: "finance", label: "Finance" },
    { domain: "facility_management", label: "Facility Management" },
  ];
  const parts: string[] = [];
  const missing: string[] = [];
  for (const source of sources) {
    const card = pulse.find((c) => c.domain === source.domain);
    const reporting = card && (card.state === "healthy" || card.state === "partial");
    const line = reporting ? (card.financialLine ?? null) : null;
    if (line) parts.push(`${source.label}: ${line}`);
    else if (card) missing.push(source.label);
  }
  if (parts.length === 0) return { text: "Not available right now", tone: "muted" };
  const scope = missing.length ? ` (${missing.join(" and ")} not included)` : "";
  return { text: `${parts.join(" · ")}${scope}`, tone: "neutral" };
}

/** How many live operating environments reported a current position in the pulse. */
export function performanceSignal(pulse: CommandCentreSnapshot["pulse"]): ExecutiveSignal {
  const reporting = pulse.filter((card) => card.state === "healthy" || card.state === "partial");
  if (reporting.length === 0) return { text: "No environment reporting right now", tone: "muted" };
  return { text: `${plural(reporting.length, "environment", "environments")} reporting`, tone: "neutral" };
}

export function lensSignal(id: ExecutiveLensId, snapshot: CommandCentreSnapshot): ExecutiveSignal {
  switch (id) {
    case "decisions":
      return decisionsSignal(snapshot.decisions);
    case "performance":
      return performanceSignal(snapshot.pulse);
    case "financial-position":
      return financialPositionSignal(snapshot.pulse);
    case "commitments":
      return commitmentsSignal(snapshot.commitments);
    case "risk-attention":
      return attentionSignal(snapshot.attention);
  }
}
