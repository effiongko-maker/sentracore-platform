import { ActionError } from "@/lib/actions/errors";
import type { PlatformSession } from "@/lib/auth/types";

/** Business-data and workspace gates require an active platform profile. */
export function assertActiveProfileForBusinessAccess(
  session: PlatformSession
): void {
  if (session.profile.status !== "active") {
    throw new ActionError("FORBIDDEN", "Your profile is not active.");
  }
}
