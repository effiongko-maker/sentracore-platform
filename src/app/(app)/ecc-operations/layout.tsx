import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isActionError } from "@/lib/actions/errors";
import { requireEccAccess } from "@/modules/ecc-operations/server/requireEccAccess";
import { EccWorkspaceShell } from "@/modules/ecc-operations";
import "@/styles/ecc-operations.css";

export default async function EccOperationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    await requireEccAccess();
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
          <div className="ecc-shell">
            <div className="ecc-access-denied" role="alert">
              <h1>ECC Operations unavailable</h1>
              <p>
                {error.message ||
                  "You do not have ECC Operations access for this organisation."}
              </p>
              <Link href="/">Return to Platform Home</Link>
            </div>
          </div>
        );
      }
    }
    throw error;
  }

  return (
    <EccWorkspaceShell>
      <Suspense fallback={<p className="ecc-empty">Loading…</p>}>
        {children}
      </Suspense>
    </EccWorkspaceShell>
  );
}
