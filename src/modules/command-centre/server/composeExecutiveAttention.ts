import type { OperationalPictureAggregate } from "@/modules/workspace/operationalPicture";
import { ECC_OPEN_ISSUE_STATUSES, ECC_OPEN_REQUEST_STATUSES } from "@/modules/ecc-operations/constants";
import type { EccIssue, EccPeopleSnapshot, EccRequest } from "@/modules/ecc-operations/types";
import type {
  CommandCentreAttentionCoverage,
  CommandCentreAttentionDomain,
  CommandCentreAttentionItem,
  CommandCentreDomainStatus,
  CommandCentreSnapshot,
} from "@/modules/command-centre/presentationTypes";

/**
 * Command Centre executive attention — an EXECUTIVE EXCEPTION LAYER, not "all open work".
 *
 * Pure composition over already-loaded authoritative domain state. No rules engine, no scoring,
 * nothing stored. The V1 contract admits only:
 *   Finance — items genuinely in pending_ceo_approval (existing Finance workflow semantics)
 *   ECC     — escalated Issues; open Issues at high/critical severity; open Requests at high/urgent
 *             priority (existing ECC semantics); a shift IN EFFECT with agents assigned and none signed in
 *   FM      — Critical Work; Overdue Work / Work Instructions (existing Operational Picture semantics)
 *   Commitments — OVERDUE open Executive Commitments only (an explicitly tracked obligation past its date);
 *             evaluated only for identities holding commitments.view, otherwise not applicable
 *
 * Deliberately NOT surfaced (no explicit executive ownership in the domain, or not provable):
 *   - FM Approvals awaiting decision (these are client-side approvals, not CEO decisions)
 *   - ECC "no shift in effect" (the model cannot tell "no shift expected" from "shift expected but absent")
 *   - ordinary open Issues / Requests / Work
 */

export const ATTENTION_DOMAIN_LABEL: Record<CommandCentreAttentionDomain, string> = {
  finance: "Finance",
  ecc: "ECC",
  facility_management: "Facility Management",
  commitments: "Commitments",
};

const DOMAIN_ORDER: CommandCentreAttentionDomain[] = ["finance", "ecc", "facility_management", "commitments"];
const TONE_RANK: Record<CommandCentreAttentionItem["tone"], number> = { critical: 0, high: 1, medium: 2, info: 3 };
export const ATTENTION_DISPLAY_LIMIT = 8;

export type DomainAttentionResult = {
  domain: CommandCentreAttentionDomain;
  status: CommandCentreDomainStatus;
  /** Items known even when the domain is partial/unavailable (e.g. one sub-source loaded). */
  items: CommandCentreAttentionItem[];
  note?: string | null;
};

function humanise(value: string): string {
  return value.replaceAll("_", " ");
}

// ── Finance ────────────────────────────────────────────────────────────────

export function financeAttentionItems(input: {
  pendingCount: number;
  amountDetail: string | null;
}): CommandCentreAttentionItem[] {
  if (input.pendingCount <= 0) return [];
  return [
    {
      id: "finance:pending_ceo",
      title:
        input.pendingCount === 1
          ? "1 decision awaiting CEO approval"
          : `${input.pendingCount} decisions awaiting CEO approval`,
      detail: input.amountDetail,
      tone: "high",
      href: "/platform-finance",
      sourceLabel: "Finance",
    },
  ];
}

// ── ECC ────────────────────────────────────────────────────────────────────

export function eccIssueRequestAttentionItems(input: {
  issues: EccIssue[];
  requests: EccRequest[];
}): CommandCentreAttentionItem[] {
  const items: CommandCentreAttentionItem[] = [];
  for (const issue of input.issues) {
    if (!ECC_OPEN_ISSUE_STATUSES.includes(issue.status)) continue;
    const escalated = issue.status === "escalated";
    const severe = issue.severity === "high" || issue.severity === "critical";
    if (!escalated && !severe) continue;
    items.push({
      id: `ecc:issue:${issue.id}`,
      title: issue.title,
      detail: `${escalated ? "Escalated · " : ""}${issue.severity} severity · ${humanise(issue.status)}`,
      tone: issue.severity === "critical" ? "critical" : "high",
      href: `/ecc-operations/issues?id=${encodeURIComponent(issue.id)}`,
      sourceLabel: "ECC",
    });
  }
  for (const request of input.requests) {
    if (!ECC_OPEN_REQUEST_STATUSES.includes(request.status)) continue;
    if (request.priority !== "high" && request.priority !== "urgent") continue;
    items.push({
      id: `ecc:request:${request.id}`,
      title: request.title,
      detail: `${request.priority} priority · ${humanise(request.status)}`,
      tone: request.priority === "urgent" ? "critical" : "high",
      href: `/ecc-operations/requests?id=${encodeURIComponent(request.id)}`,
      sourceLabel: "ECC",
    });
  }
  return items;
}

/**
 * Coverage gap — provable only when a shift is IN EFFECT (window contains now), agents are
 * assigned to it, and none of them is live signed in. Anything else (no shift, no assignments)
 * is not asserted.
 */
export function eccCoverageGap(people: EccPeopleSnapshot): { shiftLabel: string; assigned: number } | null {
  const { shift, agentsAssigned, agentsSignedIn } = people.currentShift;
  if (!shift || agentsAssigned <= 0 || agentsSignedIn > 0) return null;
  return { shiftLabel: shift.label, assigned: agentsAssigned };
}

export function eccCoverageAttentionItem(people: EccPeopleSnapshot): CommandCentreAttentionItem | null {
  const gap = eccCoverageGap(people);
  if (!gap) return null;
  return {
    id: "ecc:coverage",
    title: "No one is signed in to the shift in effect",
    detail: `${gap.shiftLabel} · ${gap.assigned} assigned`,
    tone: "high",
    href: "/ecc-operations/people",
    sourceLabel: "ECC",
  };
}

// ── Facility Management ────────────────────────────────────────────────────

export function fmAttentionFromPicture(picture: OperationalPictureAggregate): {
  status: CommandCentreDomainStatus;
  items: CommandCentreAttentionItem[];
  note: string | null;
} {
  const items: CommandCentreAttentionItem[] = [];
  const { maintenance, workOrders } = picture;
  if (maintenance.state === "healthy") {
    if (maintenance.critical > 0) {
      items.push({
        id: "fm:critical_work",
        title: maintenance.critical === 1 ? "1 critical Work item" : `${maintenance.critical} critical Work items`,
        detail: "High or critical priority, still open",
        tone: "critical",
        href: "/work",
        sourceLabel: "Facility Management",
      });
    }
    if (maintenance.overdue > 0) {
      items.push({
        id: "fm:overdue_work",
        title: maintenance.overdue === 1 ? "1 overdue Work item" : `${maintenance.overdue} overdue Work items`,
        detail: "Past due date, not completed",
        tone: "high",
        href: "/work",
        sourceLabel: "Facility Management",
      });
    }
  }
  if (workOrders.state === "healthy" && workOrders.overdue > 0) {
    items.push({
      id: "fm:overdue_work_instructions",
      title:
        workOrders.overdue === 1
          ? "1 overdue Work Instruction"
          : `${workOrders.overdue} overdue Work Instructions`,
      detail: "Past due date, not completed",
      tone: "high",
      href: "/work-orders",
      sourceLabel: "Facility Management",
    });
  }
  if (maintenance.state === "healthy" && workOrders.state === "healthy") {
    return { status: "loaded", items, note: null };
  }
  if (maintenance.state === "healthy" || workOrders.state === "healthy") {
    const missing = maintenance.state === "healthy" ? "Work Instructions" : "Work";
    return { status: "partial", items, note: `${missing} could not be evaluated.` };
  }
  return { status: "unavailable", items, note: "Facility Management could not be read." };
}

// ── Composition ────────────────────────────────────────────────────────────

function statusNote(result: DomainAttentionResult): string | null {
  const label = ATTENTION_DOMAIN_LABEL[result.domain];
  switch (result.status) {
    case "loaded":
      return null;
    case "partial":
      return result.note ?? `${label} was only partly evaluated.`;
    case "restricted":
      return result.note ?? `${label} attention is restricted for your access.`;
    case "unavailable":
      return result.note ?? `${label} could not be evaluated.`;
    case "not_enabled":
      return result.note ?? `${label} is not enabled for this organisation.`;
  }
}

/**
 * Combine per-domain results. "Nothing requires attention" is claimed ONLY when every enabled
 * domain was evaluated successfully and produced no qualifying item. Known items from
 * successful domains are always shown, even when another domain failed.
 */
export function composeExecutiveAttention(
  results: DomainAttentionResult[],
  limit: number = ATTENTION_DISPLAY_LIMIT
): CommandCentreSnapshot["attention"] {
  const ordered = [...results].sort(
    (a, b) => DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain)
  );
  const coverage: CommandCentreAttentionCoverage[] = ordered.map((r) => ({
    domain: r.domain,
    label: ATTENTION_DOMAIN_LABEL[r.domain],
    status: r.status,
    note: statusNote(r),
  }));

  const all = ordered
    .flatMap((r) => r.items)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => TONE_RANK[a.item.tone] - TONE_RANK[b.item.tone] || a.index - b.index)
    .map((entry) => entry.item);
  const items = all.slice(0, limit);
  const hiddenCount = all.length - items.length;

  const loaded = ordered.filter((r) => r.status === "loaded").length;
  const complete = loaded > 0 && ordered.every((r) => r.status === "loaded" || r.status === "not_enabled");
  const anyFailure = ordered.some((r) => r.status === "unavailable" || r.status === "partial");

  let state: CommandCentreSnapshot["attention"]["state"];
  let summary: string;
  if (all.length > 0) {
    state = "healthy";
    summary = `${all.length} ${all.length === 1 ? "item needs" : "items need"} attention${complete ? "" : " · partial view"}`;
  } else if (complete) {
    state = "empty";
    const names = ordered.filter((r) => r.status === "loaded").map((r) => ATTENTION_DOMAIN_LABEL[r.domain]);
    summary = `No qualifying executive exceptions found in ${names.join(", ")}.`;
  } else if (loaded === 0 && !anyFailure && ordered.every((r) => r.status === "not_enabled")) {
    state = "unavailable";
    summary = "No attention sources are enabled for this organisation.";
  } else {
    state = anyFailure ? "unavailable" : "restricted";
    summary = "Attention could not be fully evaluated.";
  }

  return { state, items, hiddenCount, complete, summary, coverage };
}
