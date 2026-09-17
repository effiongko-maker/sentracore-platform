import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isActionError } from "@/lib/actions/errors";
import { requirePlatformFinanceWorkspaceAccess } from "@/modules/platform-finance/server/requirePlatformFinanceAccess";
import "@/styles/platform-finance.css";

export default async function PlatformFinanceLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    await requirePlatformFinanceWorkspaceAccess();
  } catch (error) {
    if (isActionError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }
      if (
        error.code === "FORBIDDEN" ||
        error.code === "MODULE_NOT_ENABLED" ||
        error.code === "ORGANISATION_NOT_FOUND" ||
        error.code === "ORGANISATION_INACTIVE" ||
        error.code === "PROFILE_NOT_FOUND"
      ) {
        return (
          <div className="pf-overview">
            <div className="pf-access-denied" role="alert">
              <h1>Platform Finance unavailable</h1>
              <p>
                {error.message ||
                  "You do not have Platform Finance access for this organisation."}
              </p>
              <p className="pf-access-denied-note">
                This is the organisation Finance workspace — distinct from
                Facility Management Finance.
              </p>
              <Link href="/">Return to Platform Home</Link>
            </div>
          </div>
        );
      }
    }
    throw error;
  }

  return children;
}
