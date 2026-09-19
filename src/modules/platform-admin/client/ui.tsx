"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { OrganisationModuleAdminStatus } from "../types";
import type { ProfileStatus } from "@/lib/auth/types";
import { useAdminConsole } from "./AdminConsoleContext";

/** Organisation context strip — shown on every surface. */
export function ContextStrip() {
  const { organisation, organisations, selectOrganisation, loading } = useAdminConsole();
  return (
    <div className="ac-context" role="region" aria-label="Organisation context">
      <span className="ac-context-label">Administering</span>
      {loading ? (
        <span>Loading organisation…</span>
      ) : organisation ? (
        <>
          {organisations && organisations.length > 1 ? (
            <select aria-label="Organisation" value={organisation.id} onChange={(e) => selectOrganisation(e.target.value)}>
              {organisations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="ac-context-name">{organisation.name}</span>
          )}
          <span className="ac-secondary">{organisation.slug}</span>
          <span className={cn("ac-mark", organisation.status === "active" ? "ac-mark-ok" : "ac-mark-warn")}>
            {organisation.status === "active" ? "Active" : organisation.status}
          </span>
        </>
      ) : (
        <span>No organisation</span>
      )}
      <span className="ac-context-spacer" />
    </div>
  );
}

export function PageHead({
  title,
  lede,
  actions,
  back,
}: {
  title: string;
  lede?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <>
      {back ? (
        <Link href={back.href} className="ac-back">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <header className="ac-head">
        <div>
          <h1 className="ac-title">{title}</h1>
          {lede ? <p className="ac-lede">{lede}</p> : null}
        </div>
        {actions ? <div className="ac-actions">{actions}</div> : null}
      </header>
    </>
  );
}

export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ac-section", className)}>
      <div className="ac-section-head">
        <h2 className="ac-section-title">{title}</h2>
        {aside ? <div className="ac-section-aside">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Note({ children, tone }: { children: ReactNode; tone?: "strong" | "critical" }) {
  return <p className={cn("ac-note", tone === "strong" && "ac-note-strong", tone === "critical" && "ac-note-critical")}>{children}</p>;
}

/** Renders loading / failure / empty honestly. A failed load is never an empty list. */
export function DataBoundary<T>({
  state,
  onRetry,
  isEmpty,
  empty,
  children,
  what,
}: {
  state: { data: T | null; error: string | null; loading: boolean };
  onRetry: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
  what: string;
}) {
  if (state.error) {
    return (
      <div className="ac-state ac-state-error" role="alert">
        <p className="ac-state-title">Couldn’t load {what}</p>
        <p>{state.error} Nothing is being shown as empty — the source did not respond.</p>
        <button type="button" className="ac-btn ac-btn-secondary" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (state.loading || state.data === null) {
    return (
      <div className="ac-state" role="status" aria-live="polite">
        Loading {what}…
      </div>
    );
  }
  if (isEmpty?.(state.data)) return <div className="ac-state">{empty}</div>;
  return <>{children(state.data)}</>;
}

/** Fetch helper with abort, retry and authoritative refresh. Loading is derived, never stored stale. */
export function useAdminData<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const key = JSON.stringify(deps);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ run: string; data: T | null; error: string | null }>({ run: "", data: null, error: null });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const run = `${key}#${nonce}`;
  useEffect(() => {
    const controller = new AbortController();
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ run, data, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ run, data: null, error: err instanceof Error ? err.message : "Request failed." });
      });
    return () => controller.abort();
  }, [run]);
  const current = result.run === run;
  return {
    data: current ? result.data : null,
    error: current ? result.error : null,
    loading: !current,
    reload: () => setNonce((n) => n + 1),
  };
}

export function profileStatusMark(status: ProfileStatus): { label: string; tone: string } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "ac-mark-ok" };
    case "invited":
      return { label: "Invited", tone: "ac-mark-warn" };
    case "suspended":
      return { label: "Suspended", tone: "ac-mark-critical" };
    default:
      return { label: "Inactive", tone: "ac-mark-neutral" };
  }
}
export function StatusMark({ status }: { status: ProfileStatus }) {
  const { label, tone } = profileStatusMark(status);
  return <span className={cn("ac-mark", tone)}>{label}</span>;
}

export function moduleStatusMark(status: OrganisationModuleAdminStatus): { label: string; tone: string } {
  if (status === "enabled") return { label: "Enabled", tone: "ac-mark-ok" };
  if (status === "preparing") return { label: "Preparing", tone: "ac-mark-warn" };
  return { label: "Disabled", tone: "ac-mark-neutral" };
}

export function formatWhen(iso: string): { relative: string; absolute: string } {
  const d = new Date(iso);
  const absolute = d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  let relative = absolute;
  if (mins < 1) relative = "Just now";
  else if (mins < 60) relative = `${mins} min ago`;
  else if (mins < 60 * 24) relative = `${Math.round(mins / 60)} h ago`;
  else if (mins < 60 * 24 * 7) relative = `${Math.round(mins / (60 * 24))} d ago`;
  return { relative, absolute };
}

export function displayName(p: { fullName: string | null; email: string | null }): string {
  return p.fullName?.trim() || p.email || "Unnamed person";
}
