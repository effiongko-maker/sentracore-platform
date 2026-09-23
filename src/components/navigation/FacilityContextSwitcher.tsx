"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ALL_FACILITIES } from "@/lib/access/facilityScope";

/**
 * The ONE facility-context control for Facility Management (app shell). Options are the user's authorised
 * facilities, plus "All facilities" when they hold several or have the all-facilities scope. A user with exactly
 * one authorised facility is simply scoped to it (shown, not selectable). The selection is persisted server-side and
 * re-validated on every request; switching reloads so every list is re-read under the new scope.
 */
export function FacilityContextSwitcher() {
  const { access } = useOperatingAccess();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const context = access?.workspaceFacility;
  if (!context || (context.options.length === 0 && !context.allowAll)) return null;

  if (!context.allowAll && context.options.length === 1) {
    return (
      <span className="hidden items-center gap-1.5 rounded-[var(--sc-radius-control)] border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground sm:inline-flex">
        <Building2 className="h-3.5 w-3.5 text-muted" aria-hidden />
        {context.options[0]!.name}
      </span>
    );
  }

  async function change(selection: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/access/facility-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ selection }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? "Unable to change facility.");
      }
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change facility.");
      setSaving(false);
    }
  }

  return (
    <label className="inline-flex items-center gap-1.5 rounded-[var(--sc-radius-control)] border border-border bg-card px-2 py-1 text-xs" title={error ?? "Facility context"}>
      <Building2 className="h-3.5 w-3.5 text-muted" aria-hidden />
      <span className="sr-only">Facility context</span>
      <select
        className="max-w-[11rem] bg-transparent text-xs font-medium text-foreground outline-none"
        value={context.selection}
        disabled={saving}
        onChange={(event) => void change(event.target.value)}
        aria-invalid={Boolean(error) || undefined}
      >
        {context.allowAll ? <option value={ALL_FACILITIES}>All facilities</option> : null}
        {context.options.map((facility) => (
          <option key={facility.id} value={facility.id}>
            {facility.name}
          </option>
        ))}
      </select>
    </label>
  );
}
