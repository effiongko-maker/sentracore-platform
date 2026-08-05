import type { OccupantActor } from "../types";

/**
 * Occupant session accessor — currently anonymous / demo.
 * Swap this implementation when authentication or external clients land.
 */
export function getOccupantActor(): OccupantActor {
  return {
    kind: "anonymous",
    displayName: "Building Occupant",
  };
}

export function resolveReportedByUserId(actor: OccupantActor): string | undefined {
  return actor.id;
}
