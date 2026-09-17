"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthEnabledModule } from "@/lib/auth/types";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import type { WorkspaceAccessChrome } from "@/lib/access/workspaceAccessChrome";

export type PlatformSessionChrome = {
  enabledModules: AuthEnabledModule[] | null;
  roleSlugs: string[];
  workspaceAccess: WorkspaceAccessChrome | null;
};

type PlatformSessionState = {
  enabledModules: AuthEnabledModule[] | null;
  roleSlugs: string[];
  workspaceAccess: WorkspaceAccessChrome | null;
  isSuperAdmin: boolean;
  loading: boolean;
};

const PlatformSessionContext = createContext<PlatformSessionState>({
  enabledModules: null,
  roleSlugs: [],
  workspaceAccess: null,
  isSuperAdmin: false,
  loading: true,
});

function chromeFromInitial(
  initial: PlatformSessionChrome | null | undefined
): Pick<
  PlatformSessionState,
  "enabledModules" | "roleSlugs" | "workspaceAccess" | "loading"
> {
  // undefined → not hydrated (legacy mount); fetch on client.
  if (initial === undefined) {
    return {
      enabledModules: null,
      roleSlugs: [],
      workspaceAccess: null,
      loading: true,
    };
  }
  // null → bootstrap ran, no session (fail closed, not loading).
  if (initial === null) {
    return {
      enabledModules: null,
      roleSlugs: [],
      workspaceAccess: null,
      loading: false,
    };
  }
  return {
    enabledModules: initial.enabledModules,
    roleSlugs: initial.roleSlugs,
    workspaceAccess: initial.workspaceAccess,
    loading: false,
  };
}

export function PlatformSessionProvider({
  children,
  initialSessionChrome,
}: {
  children: ReactNode;
  /** When provided (including null), skip the initial /api/auth/me fetch. */
  initialSessionChrome?: PlatformSessionChrome | null;
}) {
  const hydrated = initialSessionChrome !== undefined;
  const seeded = chromeFromInitial(initialSessionChrome);
  const [enabledModules, setEnabledModules] = useState<
    AuthEnabledModule[] | null
  >(seeded.enabledModules);
  const [roleSlugs, setRoleSlugs] = useState<string[]>(seeded.roleSlugs);
  const [workspaceAccess, setWorkspaceAccess] =
    useState<WorkspaceAccessChrome | null>(seeded.workspaceAccess);
  const [loading, setLoading] = useState(seeded.loading);

  useEffect(() => {
    if (hydrated) return;

    let cancelled = false;

    fetch("/api/auth/me", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const json = (await response.json()) as {
          data?: {
            enabledModules?: AuthEnabledModule[];
            roleSlugs?: string[];
            workspaceAccess?: WorkspaceAccessChrome;
          };
        };
        return {
          enabledModules: json.data?.enabledModules ?? null,
          roleSlugs: Array.isArray(json.data?.roleSlugs)
            ? json.data.roleSlugs.map(String)
            : [],
          workspaceAccess: json.data?.workspaceAccess ?? null,
        };
      })
      .then((payload) => {
        if (!cancelled) {
          setEnabledModules(payload?.enabledModules ?? null);
          setRoleSlugs(payload?.roleSlugs ?? []);
          setWorkspaceAccess(payload?.workspaceAccess ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Keep null (unresolved) rather than [] so nav does not collapse to
          // "no modules" on a transient session fetch failure.
          setEnabledModules(null);
          setRoleSlugs([]);
          setWorkspaceAccess(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const isSuperAdmin = useMemo(
    () => isPlatformSuperAdminFromSlugs(roleSlugs),
    [roleSlugs]
  );

  const value = useMemo(
    () => ({
      enabledModules,
      roleSlugs,
      workspaceAccess,
      isSuperAdmin,
      loading,
    }),
    [enabledModules, roleSlugs, workspaceAccess, isSuperAdmin, loading]
  );

  return (
    <PlatformSessionContext.Provider value={value}>
      {children}
    </PlatformSessionContext.Provider>
  );
}

export function usePlatformSession() {
  return useContext(PlatformSessionContext);
}
