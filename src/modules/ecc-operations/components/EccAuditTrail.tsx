"use client";

import { useEffect, useState } from "react";
import { EccOperationsService } from "../services/EccOperationsService";
import type { EccAuditEntityType, EccAuditEvent } from "../types";
import { formatEccWhen } from "./eccUi";

function formatChangeDetail(event: EccAuditEvent): string | null {
  const meta = event.metadata ?? {};
  if (
    typeof meta.previousStatus === "string" &&
    typeof meta.status === "string"
  ) {
    return `${meta.previousStatus} → ${meta.status}`;
  }
  if (
    Array.isArray(meta.previousAssignedPersonIds) &&
    Array.isArray(meta.assignedPersonIds)
  ) {
    const from = (meta.previousAssignedPersonIds as string[]).length;
    const to = (meta.assignedPersonIds as string[]).length;
    return `Assigned agents ${from} → ${to}`;
  }
  if (
    typeof meta.previousAmount === "number" &&
    typeof meta.amount === "number"
  ) {
    return `${meta.previousAmount} → ${meta.amount}`;
  }
  if (
    typeof meta.previousOwner === "string" &&
    typeof meta.currentOwner === "string" &&
    meta.previousOwner !== meta.currentOwner
  ) {
    return `Owner ${meta.previousOwner || "—"} → ${meta.currentOwner || "—"}`;
  }
  return null;
}

/**
 * Compact accountability trail for a single ECC entity.
 * Loads server-side audit events (immutable history).
 */
export function EccEntityAuditTrail({
  entityType,
  entityId,
  title = "Accountability",
}: {
  entityType: EccAuditEntityType;
  entityId: string | null | undefined;
  title?: string;
}) {
  const [events, setEvents] = useState<EccAuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void EccOperationsService.getEntityAuditTrail(entityType, entityId)
      .then((rows) => {
        if (!cancelled) {
          setEvents(rows);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load audit trail."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (!entityId) return null;

  return (
    <div className="ecc-audit-trail">
      <h3 className="ecc-iss-panel-label">{title}</h3>
      {loading ? (
        <p className="ecc-empty ecc-empty--compact">Loading accountability…</p>
      ) : null}
      {error ? <p className="ecc-empty ecc-empty--compact">{error}</p> : null}
      {!loading && !error && events.length === 0 ? (
        <p className="ecc-empty ecc-empty--compact">
          No accountability events recorded yet.
        </p>
      ) : null}
      {events.length > 0 ? (
        <ol className="ecc-iss-timeline">
          {events.map((event) => {
            const detail = formatChangeDetail(event);
            return (
              <li key={event.id} className="ecc-iss-timeline-item">
                <p className="ecc-iss-timeline-when">
                  {formatEccWhen(event.createdAt)}
                </p>
                <p className="ecc-iss-timeline-who">{event.actorName}</p>
                <p className="ecc-iss-timeline-what">{event.description}</p>
                {detail ? (
                  <p className="ecc-iss-timeline-note">{detail}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * Recent centre-scoped activity feed for People / Finance workspace cards.
 */
export function EccRecentAuditFeed({
  entityTypes,
  title = "Recent activity",
  limit = 12,
}: {
  entityTypes?: EccAuditEntityType[];
  title?: string;
  limit?: number;
}) {
  const [events, setEvents] = useState<EccAuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const types = entityTypes;
    void EccOperationsService.listAuditEvents({ limit: limit * 3 })
      .then((rows) => {
        if (cancelled) return;
        const filtered = types?.length
          ? rows.filter((row) => types.includes(row.entityType))
          : rows;
        setEvents(filtered.slice(0, limit));
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load activity."
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // entityTypes compared by joined key to avoid referential churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityTypes?.join(","), limit]);

  return (
    <section className="ecc-ppl-card" aria-label={title}>
      <header className="ecc-ppl-card-head">
        <div>
          <h2 className="ecc-ppl-card-title">{title}</h2>
          <p className="ecc-ppl-card-lede">
            Accountability trail for recent operational actions.
          </p>
        </div>
      </header>
      {error ? <p className="ecc-empty">{error}</p> : null}
      {!error && events.length === 0 ? (
        <div className="ecc-ppl-empty ecc-ppl-empty--panel">
          <p className="ecc-ppl-empty-title">No activity recorded yet</p>
          <p className="ecc-ppl-empty-copy">
            Actions taken in this workspace will appear here.
          </p>
        </div>
      ) : null}
      {events.length > 0 ? (
        <ol className="ecc-iss-timeline ecc-audit-feed">
          {events.map((event) => (
            <li key={event.id} className="ecc-iss-timeline-item">
              <p className="ecc-iss-timeline-when">
                {formatEccWhen(event.createdAt)}
              </p>
              <p className="ecc-iss-timeline-who">{event.actorName}</p>
              <p className="ecc-iss-timeline-what">{event.description}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
