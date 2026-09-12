import type {
  EccPeopleSnapshot,
  EccStaffingStatus,
} from "@/modules/ecc-operations/types";

/**
 * Derive Overview staffing fields from People/attendance when available.
 * Falls back to null so callers keep Daily Ops staffing.
 */
export function deriveStaffingFromPeople(
  snapshot: EccPeopleSnapshot | null
): { staffingStatus: EccStaffingStatus; staffingReadiness: string } | null {
  if (!snapshot) return null;

  const hasPeople =
    snapshot.managers.length > 0 ||
    snapshot.relationshipOfficers.length > 0 ||
    snapshot.agents.length > 0 ||
    Boolean(snapshot.currentShift.shift);

  if (!hasPeople) return null;

  const { agentsAssigned, agentsSignedIn, coverageStatus, shift } =
    snapshot.currentShift;

  if (!shift) {
    return {
      staffingStatus: "unknown",
      staffingReadiness: "No current shift set",
    };
  }

  const readiness = `${agentsSignedIn}/${agentsAssigned} signed in · ${shift.label}`;

  if (coverageStatus === "adequate") {
    return { staffingStatus: "ready", staffingReadiness: readiness };
  }
  if (coverageStatus === "constrained") {
    return { staffingStatus: "constrained", staffingReadiness: readiness };
  }
  if (coverageStatus === "uncovered") {
    return { staffingStatus: "unavailable", staffingReadiness: readiness };
  }

  if (agentsAssigned === 0) {
    return {
      staffingStatus: "unknown",
      staffingReadiness: `${shift.label} · no agents assigned`,
    };
  }
  if (agentsSignedIn === 0) {
    return { staffingStatus: "unavailable", staffingReadiness: readiness };
  }
  if (agentsSignedIn < agentsAssigned) {
    return { staffingStatus: "constrained", staffingReadiness: readiness };
  }
  return { staffingStatus: "ready", staffingReadiness: readiness };
}
