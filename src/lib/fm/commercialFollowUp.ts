/**
 * Commercial follow-up (chasing) — the pattern Approvals already use (date/time, method, contact, outcome, next
 * follow-up), shared by WO/JO submissions and client payments (incl. contract instalments). A follow-up is an EVENT:
 * it never changes a submission status and never implies that anything has been paid. Pure; importable by verifiers.
 */

export const COMMERCIAL_FOLLOW_UP_METHOD_VALUES = ["phone", "email", "physical_visit", "client_portal", "other"] as const;
export type CommercialFollowUpMethod = (typeof COMMERCIAL_FOLLOW_UP_METHOD_VALUES)[number];

export type ParsedCommercialFollowUp = {
  id: string;
  followedUpAt: string;
  method: CommercialFollowUpMethod;
  contactPerson: string | null;
  outcomeNotes: string;
  nextFollowUpAt: string | null;
};

function text(value: unknown): string | undefined {
  if (value == null) return undefined;
  const t = String(value).trim();
  return t || undefined;
}
function instant(value: unknown): string | null | "invalid" {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "invalid";
}

export function parseCommercialFollowUp(
  payload: unknown
): { ok: true; value: ParsedCommercialFollowUp } | { ok: false; message: string } {
  const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const id = text(raw.id);
  if (!id) return { ok: false, message: "Record id is required." };
  const followedUpAt = instant(raw.followedUpAt);
  if (!followedUpAt || followedUpAt === "invalid") return { ok: false, message: "Follow-up date/time is required." };
  const method = text(raw.method)?.toLowerCase().replace(/\s+/g, "_");
  if (!method || !(COMMERCIAL_FOLLOW_UP_METHOD_VALUES as readonly string[]).includes(method)) {
    return { ok: false, message: "Select a follow-up method." };
  }
  const outcomeNotes = text(raw.outcomeNotes);
  if (!outcomeNotes) return { ok: false, message: "Outcome notes are required." };
  const next = instant(raw.nextFollowUpAt);
  if (next === "invalid") return { ok: false, message: "Next follow-up is invalid." };
  return {
    ok: true,
    value: {
      id,
      followedUpAt,
      method: method as CommercialFollowUpMethod,
      contactPerson: text(raw.contactPerson) ?? null,
      outcomeNotes,
      nextFollowUpAt: next,
    },
  };
}

/** The most recent of an existing last-follow-up and a newly recorded one (a back-dated entry never moves it back). */
export function latestFollowUp(existing: string | null | undefined, recorded: string): string {
  return existing && existing > recorded ? existing : recorded;
}
