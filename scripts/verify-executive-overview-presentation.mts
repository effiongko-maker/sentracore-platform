import assert from "node:assert/strict";
import { overviewAttention, overviewPulseLines } from "../src/modules/command-centre/overviewPresentation";
import type { CommandCentrePulseCard, CommandCentreSnapshot } from "../src/modules/command-centre/presentationTypes";

const snapshot: Pick<CommandCentreSnapshot, "attention" | "decisions" | "commitments"> = {
  attention: {
    state: "healthy", complete: false, hiddenCount: 3, summary: "Partial view", coverage: [],
    items: [
      { id: "finance:pending_ceo", title: "Finance decisions", detail: null, tone: "high", href: "/platform-finance", sourceLabel: "Finance" },
      { id: "commitments:c1", title: "Follow up", detail: null, tone: "high", href: "/command-centre#commitments", sourceLabel: "Commitments" },
      { id: "ecc:request:r1", title: "Follow up", detail: null, tone: "high", href: "/ecc-operations/requests?id=r1", sourceLabel: "ECC" },
    ],
  },
  decisions: {
    state: "healthy", reason: null, scopeNote: null, viewAllHref: null,
    items: [{ id: "finance_request:f1", source: "finance_request", title: "Approve", reference: null, categoryLabel: null, amountLabel: "NGN 10", currency: "NGN", decisionLabel: "Financial Request", href: "/platform-finance/requests/f1" }],
  },
  commitments: {
    state: "healthy", reason: null, canManage: true, currentProfileId: "p1", today: "2026-09-24",
    overdue: [{ id: "c1", status: "open", overdue: true } as CommandCentreSnapshot["commitments"]["overdue"][number]],
    open: [], completed: [],
  },
};
const before = JSON.stringify(snapshot);
const result = overviewAttention(snapshot);
assert.deepEqual(result.items.map((item) => item.id), ["ecc:request:r1"]);
assert.equal(result.decisionsElsewhere, true);
assert.equal(result.commitmentsElsewhere, true);
assert.equal(JSON.stringify(snapshot), before, "presentation never mutates authoritative counts, coverage or hiddenCount");
for (const state of ["error", "restricted", "unavailable"] as const) {
  const unavailable = overviewAttention({ ...snapshot, decisions: { ...snapshot.decisions, state }, commitments: { ...snapshot.commitments, state } });
  assert.equal(unavailable.items.length, 3, "never suppress a matter whose detailed home is unavailable");
}
assert.equal(overviewAttention({ ...snapshot, decisions: { ...snapshot.decisions, state: "partial" } }).decisionsElsewhere, true);
assert.equal(overviewAttention({ ...snapshot, decisions: { ...snapshot.decisions, state: "partial", items: [] } }).decisionsElsewhere, false);
assert.equal(overviewAttention({ ...snapshot, commitments: { ...snapshot.commitments, overdue: [] } }).commitmentsElsewhere, false);
assert.equal(overviewAttention({ ...snapshot, commitments: { ...snapshot.commitments, overdue: [{ ...snapshot.commitments.overdue[0], id: "different-id" }] } }).commitmentsElsewhere, false, "matching names are not identity");
console.log("PASS attention: exact duplicates move to available detailed homes; exceptions, failures and source snapshot remain intact");

const finance: CommandCentrePulseCard = {
  domain: "finance", label: "Finance", state: "healthy", statusLabel: "Needs attention",
  lines: ["1 pending CEO decision", "2 awaiting Finance review · 0 open payables"], href: "/platform-finance", disabledNavigationLabel: null,
};
assert.deepEqual(overviewPulseLines(finance, snapshot.decisions), [finance.lines[1]]);
assert.deepEqual(overviewPulseLines({ ...finance, lines: ["0 pending CEO decisions", finance.lines[1]] }, { ...snapshot.decisions, state: "empty", items: [] }), [finance.lines[1]]);
for (const state of ["partial", "error", "restricted", "unavailable"] as const) {
  assert.equal(overviewPulseLines(finance, { ...snapshot.decisions, state }).length, 2, "organisation-wide count survives narrower or unreadable queue");
}
assert.match(overviewPulseLines({ ...finance, lines: ["2 pending CEO decisions", finance.lines[1]] }, snapshot.decisions)[0], /^All Finance companies · /);
assert.equal(overviewPulseLines(finance, { ...snapshot.decisions, items: [{ ...snapshot.decisions.items[0], source: "vendor_bill" }] }).length, 2, "vendor bills are not request counts");
assert.deepEqual(overviewPulseLines({ ...finance, lines: ["Pending CEO decisions unavailable", finance.lines[1]] }, snapshot.decisions), ["Pending CEO decisions unavailable", finance.lines[1]]);
assert.equal(overviewPulseLines({ ...finance, lines: [finance.lines[0]] }, snapshot.decisions).length, 1, "no empty domain surface");
assert.deepEqual(overviewPulseLines({ ...finance, domain: "facility_management" }, snapshot.decisions), finance.lines, "FM workload is not the executive decision queue");
console.log("PASS pulse: only proven complete-scope duplication is removed; narrower scopes, failures, domain workload and unknown formats remain visible");
