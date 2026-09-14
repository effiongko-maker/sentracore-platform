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

type PlatformSessionState = {
  enabledModules: AuthEnabledModule[] | null;
  roleSlugs: string[];
  isSuperAdmin: boolean;
  loading: boolean;
};

const PlatformSessionContext = createContext<PlatformSessionState>({
  enabledModules: null,
  roleSlugs: [],
  isSuperAdmin: false,
  loading: true,
});

export function PlatformSessionProvider({ children }: { children: ReactNode }) {
  const [enabledModules, setEnabledModules] = useState<
    AuthEnabledModule[] | null
  >(null);
  const [roleSlugs, setRoleSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          };
        };
        return {
          enabledModules: json.data?.enabledModules ?? null,
          roleSlugs: Array.isArray(json.data?.roleSlugs)
            ? json.data.roleSlugs.map(String)
            : [],
        };
      })
      .then((payload) => {
        if (!cancelled) {
          setEnabledModules(payload?.enabledModules ?? null);
          setRoleSlugs(payload?.roleSlugs ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Keep null (unresolved) rather than [] so nav does not collapse to
          // "no modules" on a transient session fetch failure.
          setEnabledModules(null);
          setRoleSlugs([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isSuperAdmin = useMemo(
    () => isPlatformSuperAdminFromSlugs(roleSlugs),
    [roleSlugs]
  );

  const value = useMemo(
    () => ({ enabledModules, roleSlugs, isSuperAdmin, loading }),
    [enabledModules, roleSlugs, isSuperAdmin, loading]
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
