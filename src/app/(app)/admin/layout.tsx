import type { Metadata } from "next";
import { Suspense } from "react";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { getPlatformSession } from "@/lib/auth/session";
import { AdminConsoleProvider } from "@/modules/platform-admin/client/AdminConsoleContext";

export const metadata: Metadata = {
  title: { default: "Admin Console", template: "%s · Admin Console" },
};

/**
 * Server-side gate. Platform Super Admin authority only — the API
 * (`requirePlatformAdmin`) remains the canonical authority for every read and
 * write; this layout simply refuses to render the console for anyone else.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession();
  const allowed = Boolean(session && session.profile.status === "active" && isPlatformSuperAdminFromSlugs(session.roleSlugs));

  if (!session || !allowed) {
    return (
      <div className="ac-page">
        <div className="ac-state" role="alert">
          <p className="ac-state-title">Admin Console access is restricted</p>
          <p>
            The SentraCore™ Admin Console is available to platform administrators only. If you believe you should have access, ask an existing administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="ac-page"><div className="ac-state" role="status">Loading Admin Console…</div></div>}>
      <AdminConsoleProvider actorProfileId={session.profile.id} actorOrganisationId={session.organisation?.id ?? session.profile.organisationId ?? null}>
        {children}
      </AdminConsoleProvider>
    </Suspense>
  );
}
