import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasModule } from "@/lib/actions/moduleAccess";
import {
  boundaryForSession,
  homeRouteForBoundary,
  MODULE_LABEL,
} from "@/lib/access/moduleBoundary";
import {
  isEntryNavigation,
  isLandingWorkspace,
  resolveLandingRoute,
} from "@/lib/access/landingWorkspace";
import { resolveOperatingAccess } from "@/lib/access/server";
import { resolveWorkspaceAccessChrome } from "@/lib/access/workspaceAccessChrome";
import { getPlatformSession } from "@/lib/auth/session";
import { PlatformHomePage } from "@/modules/platform";

export const metadata: Metadata = {
  title: "SentraCore™",
};

export default async function PlatformHomeRoute() {
  const session = await getPlatformSession();
  // No session: the proxy owns the auth boundary; render the ordinary home.
  if (!session) return <PlatformHomePage />;

  const boundary = boundaryForSession(session);

  if (!boundary.valid) {
    return (
      <BoundaryNotice
        title="Account access scope needs attention"
        body="Your account's access scope is misconfigured, so no workspace can be opened. Contact an administrator."
      />
    );
  }

  const home = homeRouteForBoundary(boundary);
  if (boundary.scope === "module" && boundary.homeModule && home) {
    const moduleOn = hasModule(session.enabledModules, boundary.homeModule);
    if (!moduleOn) {
      return (
        <BoundaryNotice
          title={`${MODULE_LABEL[boundary.homeModule]} is not available`}
          body={`Your account is restricted to ${MODULE_LABEL[boundary.homeModule]}, which is not enabled for your organisation. Contact an administrator.`}
        />
      );
    }
    // Module-bound identities land in their home module. Module routes never
    // redirect back to "/", so this cannot loop.
    redirect(home);
  }

  // Platform scope: honour a landing preference on ENTRY only, and only when the workspace is
  // currently enterable. Anything else (unset, stale, inaccessible, in-app navigation) shows the
  // neutral Platform Home — never a forbidden page and never a redirect loop.
  const landing = session.profile.landingWorkspace;
  const organisationId = session.organisation?.id ?? session.profile.organisationId ?? null;
  if (isLandingWorkspace(landing) && organisationId && session.profile.id) {
    const referer = (await headers()).get("referer");
    if (isEntryNavigation(referer)) {
      try {
        const chrome = await resolveWorkspaceAccessChrome({
          organisationId,
          profileId: session.profile.id,
          roleSlugs: session.roleSlugs,
          enabledModules: session.enabledModules,
          operatingAccess: await resolveOperatingAccess(session),
          boundary,
        });
        const route = resolveLandingRoute({ boundary, landingWorkspace: landing, chrome });
        if (route) redirect(route);
      } catch (error) {
        // redirect() signals via a thrown control-flow error — rethrow it; resolve failures fall back.
        if (error && typeof error === "object" && "digest" in error) throw error;
      }
    }
  }

  return <PlatformHomePage />;
}

function BoundaryNotice({ title, body }: { title: string; body: string }) {
  return (
    <main style={{ padding: "3rem 1.5rem", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        {title}
      </h1>
      <p style={{ color: "var(--os-text-muted, #666)", lineHeight: 1.5 }}>{body}</p>
    </main>
  );
}
