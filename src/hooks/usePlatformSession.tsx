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

type PlatformSessionState = {
  enabledModules: AuthEnabledModule[] | null;
  loading: boolean;
};

const PlatformSessionContext = createContext<PlatformSessionState>({
  enabledModules: null,
  loading: true,
});

export function PlatformSessionProvider({ children }: { children: ReactNode }) {
  const [enabledModules, setEnabledModules] = useState<
    AuthEnabledModule[] | null
  >(null);
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
          data?: { enabledModules?: AuthEnabledModule[] };
        };
        return json.data?.enabledModules ?? null;
      })
      .then((modules) => {
        if (!cancelled) {
          setEnabledModules(modules);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabledModules(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ enabledModules, loading }),
    [enabledModules, loading]
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
