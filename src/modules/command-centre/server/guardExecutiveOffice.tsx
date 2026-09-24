import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isActionError } from "@/lib/actions/errors";
import {
  requireCommandCentreAccess,
  type CommandCentreAccessContext,
} from "./requireCommandCentreAccess";

/**
 * Server-side gate shared by every Executive Office route (Overview and each lens). Same authority as before:
 * the platform access boundary + an explicit platform.command_centre.view grant — never a name, role or title, and
 * never UI hiding alone. Unauthenticated → /login; not authorised → a plain unavailable notice.
 */
export async function guardExecutiveOffice(): Promise<
  { ok: true; access: CommandCentreAccessContext } | { ok: false; node: ReactNode }
> {
  try {
    return { ok: true, access: await requireCommandCentreAccess() };
  } catch (error) {
    if (isActionError(error)) {
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (
        error.code === "FORBIDDEN" ||
        error.code === "ORGANISATION_NOT_FOUND" ||
        error.code === "ORGANISATION_INACTIVE" ||
        error.code === "PROFILE_NOT_FOUND"
      ) {
        return {
          ok: false,
          node: (
            <div className="scc scc--app">
              <div className="scc-access-denied" role="alert">
                <h1>Executive Office unavailable</h1>
                <p>{error.message || "You do not have Executive Office access for this organisation."}</p>
                <Link href="/">Return to Platform Home</Link>
              </div>
            </div>
          ),
        };
      }
    }
    throw error;
  }
}
