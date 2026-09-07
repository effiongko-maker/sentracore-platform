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

/** Client ceiling so a hung /api/access/me cannot leave the gate on “Checking access…” forever. */
export const OPERATING_ACCESS_FETCH_TIMEOUT_MS = 20_000;

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

async function fetchOperatingAccess(
  signal: AbortSignal
): Promise<OperatingAccess> {
  const response = await fetch("/api/access/me", {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
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

function accessFetchErrorMessage(err: unknown, timedOut: boolean): string {
  if (timedOut) {
    return "Access check timed out. Please try again.";
  }
  if (err instanceof Error && err.name === "AbortError") {
    return "Access check was cancelled. Please try again.";
  }
  return err instanceof Error ? err.message : "Access load failed";
}

export function OperatingAccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<OperatingAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, OPERATING_ACCESS_FETCH_TIMEOUT_MS);

    setLoading(true);
    setError(null);

    fetchOperatingAccess(controller.signal)
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
          setError(accessFetchErrorMessage(err, timedOut));
          setLoading(false);
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
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
