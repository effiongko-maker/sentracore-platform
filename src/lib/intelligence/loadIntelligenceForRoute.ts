import { isActionError } from "@/lib/actions/errors";
import { getOrganisationIntelligence } from "./getOrganisationIntelligence";
import type { OrganisationIntelligence } from "./types";

export type IntelligenceRouteResult =
  | { status: "ok"; data: OrganisationIntelligence }
  | { status: "forbidden" }
  | { status: "error" };

/**
 * Shared server boundary for every Intelligence route. Authority is enforced
 * inside getOrganisationIntelligence BEFORE any data is read, so an unauthorised
 * caller never receives Intelligence data in the RSC payload.
 */
export async function loadIntelligenceForRoute(): Promise<IntelligenceRouteResult> {
  try {
    return { status: "ok", data: await getOrganisationIntelligence() };
  } catch (error) {
    if (isActionError(error) && error.code === "FORBIDDEN") {
      return { status: "forbidden" };
    }
    return { status: "error" };
  }
}
