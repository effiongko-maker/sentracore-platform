import type { CommandCentrePulseCard, CommandCentreSnapshot } from "./presentationTypes";

/** Presentation only: a record is omitted here only when its detailed home is visible. */
export function overviewAttention(snapshot: Pick<CommandCentreSnapshot, "attention" | "decisions" | "commitments">) {
  const { attention, decisions, commitments } = snapshot;
  const hasDecisions = (decisions.state === "healthy" || decisions.state === "partial") && decisions.items.length > 0;
  const commitmentIds = new Set(
    commitments.state === "healthy" || commitments.state === "empty"
      ? commitments.overdue.filter((item) => item.status === "open" && item.overdue).map((item) => `commitments:${item.id}`)
      : []
  );
  const decisionsElsewhere = hasDecisions && attention.items.some((item) => item.id === "finance:pending_ceo");
  const commitmentsElsewhere = attention.items.some((item) => commitmentIds.has(item.id));
  const items = attention.items.filter((item) =>
    !(decisionsElsewhere && item.id === "finance:pending_ceo") && !commitmentIds.has(item.id)
  );
  return { items, decisionsElsewhere, commitmentsElsewhere };
}

/** Keep domain workload in Pulse. Only suppress a proven duplicate of the complete decision queue.
 * Finance Pulse counts requests across all Finance companies; the queue can be partial and also includes bills.
 * Unrecognised strings, mismatched counts and unavailable/partial queues are never treated as equivalent.
 */
export function overviewPulseLines(card: CommandCentrePulseCard, decisions: CommandCentreSnapshot["decisions"]): string[] {
  const lines = card.lines.slice(0, 4);
  if (card.domain !== "finance") return lines;
  const complete = decisions.state === "healthy" || decisions.state === "empty";
  const requests = decisions.items.filter((item) => item.source === "finance_request").length;
  const result = lines.filter((line) => {
    const pending = /^(\d+) pending CEO decisions?$/.exec(line);
    return !pending || !complete || Number(pending[1]) !== requests;
  });
  // A future single-line pulse still needs a position to display.
  return (result.length > 0 ? result : lines).map((line) =>
    // Scoped to what it counts: every Finance company (not every operating environment).
    /^\d+ pending CEO decisions?$/.test(line) ? `All Finance companies · ${line}` : line
  );
}
