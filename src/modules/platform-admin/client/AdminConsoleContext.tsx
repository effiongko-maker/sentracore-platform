"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OrganisationAdminRecord } from "../types";
import { adminCall } from "./adminApi";

type AdminConsoleState = {
  actorProfileId: string;
  organisations: OrganisationAdminRecord[] | null;
  organisation: OrganisationAdminRecord | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  selectOrganisation: (id: string) => void;
};

const Ctx = createContext<AdminConsoleState | null>(null);

export function AdminConsoleProvider({
  actorProfileId,
  actorOrganisationId,
  children,
}: {
  actorProfileId: string;
  actorOrganisationId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [organisations, setOrganisations] = useState<OrganisationAdminRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    adminCall<OrganisationAdminRecord[]>("listOrganisations", {}, controller.signal)
      .then((rows) => {
        setOrganisations(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setOrganisations(null);
        setError(err instanceof Error ? err.message : "Unable to load organisations.");
      });
    return () => controller.abort();
  }, [nonce]);

  const requested = params.get("org");
  const organisation = useMemo(() => {
    if (!organisations || organisations.length === 0) return null;
    return (
      organisations.find((o) => o.id === requested) ??
      organisations.find((o) => o.id === actorOrganisationId) ??
      organisations[0]
    );
  }, [organisations, requested, actorOrganisationId]);

  const selectOrganisation = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("org", id);
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router]
  );

  const value: AdminConsoleState = {
    actorProfileId,
    organisations,
    organisation,
    loading: organisations === null && error === null,
    error,
    reload: () => {
      setError(null);
      setOrganisations(null);
      setNonce((n) => n + 1);
    },
    selectOrganisation,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminConsole(): AdminConsoleState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAdminConsole must be used within AdminConsoleProvider");
  return value;
}
