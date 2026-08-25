"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";
import type { RelatedOperationalContext } from "@/lib/operational/context/types";
import { getIncidentOperationalContext } from "@/lib/operational/context/loadOperationalContext";
import { labelize } from "@/modules/incidents/utils";

type RelatedOperationalContextPanelProps = {
  incidentId: string;
  active?: boolean;
  /** Bump to force a reload after an operational next-step action. */
  refreshKey?: number;
};

function entityLabel(type: string, id: string): string {
  const prefix =
    type === "maintenance"
      ? "Maintenance"
      : type === "work_order"
        ? "Work Order"
        : "Incident";
  return `${prefix} #${id}`;
}

export function RelatedOperationalContextPanel({
  incidentId,
  active = true,
  refreshKey = 0,
}: RelatedOperationalContextPanelProps) {
  const [context, setContext] = useState<RelatedOperationalContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || !incidentId) return;
    let cancelled = false;
    setLoading(true);
    getIncidentOperationalContext(incidentId)
      .then((next) => {
        if (!cancelled) setContext(next);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, incidentId, refreshKey]);

  if (loading) {
    return (
      <section className="mt-6 border-t border-border/70 pt-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Related activity
        </p>
        <p className="mt-2 text-sm text-muted">Loading operational context…</p>
      </section>
    );
  }

  if (!context) return null;

  return (
    <section className="mt-6 space-y-5 border-t border-border/70 pt-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Related activity
        </p>
        {context.related.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No linked maintenance or work orders yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {context.related.map((item) => (
              <li
                key={`${item.entityType}:${item.id}`}
                className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {entityLabel(item.entityType, item.id)}
                  </p>
                  <p className="text-sm text-muted">{item.title}</p>
                </div>
                <span className="text-xs text-muted">{labelize(item.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {context.history.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Operational history
          </p>
          <ol className="mt-3 space-y-2">
            {context.history.map((entry, index) => (
              <li key={`${entry.occurredAt}-${index}`} className="text-sm">
                <span className="text-muted">{formatDate(entry.occurredAt)}</span>
                <span className="mx-2 text-muted">—</span>
                <span className="text-foreground">{entry.label}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
