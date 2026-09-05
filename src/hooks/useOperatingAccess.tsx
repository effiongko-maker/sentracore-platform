"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  accessCan,
  type AccessCapability,
  type OperatingAccess,
} from "@/lib/access";

type OperatingAccessState = {
  access: OperatingAccess | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  can: (capability: AccessCapability) => boolean;
};

const OperatingAccessContext = createContext<OperatingAccessState>({
  access: null,
  loading: true,
  error: null,
  reload: () => {},
  can: () => false,
});

async function fetchOperatingAccess(): Promise<OperatingAccess> {
  const response = await fetch("/api/access/me", {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const json = (await response.json()) as {
    success?: boolean;
    message?: string;
    data?: OperatingAccess;
  };
  if (!response.ok || !json.data) {
    throw new Error(json.message ?? "Failed to load access context");
  }
  return json.data;
}

export function OperatingAccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<OperatingAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOperatingAccess()
      .then((next) => {
        if (!cancelled) {
          setAccess(next);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAccess(null);
          setError(err instanceof Error ? err.message : "Access load failed");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  const can = useCallback(
    (capability: AccessCapability) =>
      access ? accessCan(access, capability) : false,
    [access]
  );

  const value = useMemo(
    () => ({ access, loading, error, reload, can }),
    [access, loading, error, reload, can]
  );

  return (
    <OperatingAccessContext.Provider value={value}>
      {children}
    </OperatingAccessContext.Provider>
  );
}

export function useOperatingAccess() {
  return useContext(OperatingAccessContext);
}
