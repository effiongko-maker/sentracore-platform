import { ActionError } from "@/lib/actions/errors";
import { parseOperationalRole } from "@/modules/users/server/fmPeopleDomain";

/**
 * Normalise Create Account facility assignments: one ordinary assignment per facility ("Both" = one per facility —
 * never a synthetic facility or a stored "both" value). Rejects empty or duplicated facilities and unknown roles.
 */
export function normaliseRequestedAssignments(input: {
  facilityAssignment?: { facilityId: string; operationalRole: unknown } | null;
  facilityAssignments?: Array<{ facilityId: string; operationalRole: unknown }> | null;
}): Array<{ facilityId: string; operationalRole: string }> {
  const requested = [...(input.facilityAssignments ?? []), ...(input.facilityAssignment ? [input.facilityAssignment] : [])];
  const assignments: Array<{ facilityId: string; operationalRole: string }> = [];
  for (const a of requested) {
    const facilityId = String(a.facilityId ?? "").trim();
    if (!facilityId) throw new ActionError("VALIDATION_ERROR", "A facility assignment needs a facility.");
    if (assignments.some((x) => x.facilityId === facilityId)) {
      throw new ActionError("VALIDATION_ERROR", "Each facility can be assigned only once.");
    }
    assignments.push({ facilityId, operationalRole: parseOperationalRole(a.operationalRole) });
  }
  return assignments;
}
