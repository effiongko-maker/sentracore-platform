"use client";

import { useEffect, useState } from "react";
import { useUserName } from "@/hooks/useEntityLabel";
import { EntityKinds, EntityResolver } from "@/services/entityResolver";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import { collectLinkedWorkOrderIds } from "../utils/linkedWorkOrderIds";

type AssigneeDisplay =
  | { state: "unassigned" }
  | { state: "loading" }
  | { state: "unknown" }
  | { state: "resolved"; name: string };

/**
 * Resolve WO execution assignee for display without flashing raw user IDs.
 * Reuses useUserName / EntityResolver — no second lookup beyond the shared directory load.
 */
function useAssigneeDisplay(userId?: string): AssigneeDisplay {
  const normalized = userId?.trim() ?? "";
  const label = useUserName(normalized || undefined);
  const [settled, setSettled] = useState(
    () => !normalized || Boolean(EntityResolver.getCached(EntityKinds.user, normalized))
  );

  useEffect(() => {
    if (!normalized) {
      setSettled(true);
      return;
    }
    if (EntityResolver.getCached(EntityKinds.user, normalized)) {
      setSettled(true);
      return;
    }
    let cancelled = false;
    void EntityResolver.resolve(EntityKinds.user, normalized).finally(() => {
      if (!cancelled) setSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  if (!normalized) return { state: "unassigned" };
  if (!settled) return { state: "loading" };

  const cached = EntityResolver.getCached(EntityKinds.user, normalized);
  const name = cached ?? (label !== normalized ? label : null);
  if (!name) return { state: "unknown" };
  return { state: "resolved", name };
}

function AssigneeName({ userId }: { userId?: string }) {
  const display = useAssigneeDisplay(userId);

  if (display.state === "unassigned") {
    return <span className="text-muted">Unassigned</span>;
  }
  if (display.state === "loading") {
    return <span className="text-muted">Loading…</span>;
  }
  if (display.state === "unknown") {
    return <span className="text-muted">Unknown assignee</span>;
  }
  return <>{display.name}</>;
}

function uniqueAssigneeIds(
  workOrderIds: string[],
  workOrdersById: Record<string, WorkOrder | null>
): string[] {
  const ids = new Set<string>();
  for (const woId of workOrderIds) {
    const assignee = workOrdersById[woId]?.assignedToUserId?.trim();
    if (assignee) ids.add(assignee);
  }
  return [...ids];
}

/** Compact list-column presentation — execution assignee from linked Work Order(s). */
export function WorkExecutionAssigneeCell({
  work,
  workOrdersById,
  loading,
}: {
  work: Maintenance;
  workOrdersById: Record<string, WorkOrder | null>;
  loading?: boolean;
}) {
  const linkedIds = collectLinkedWorkOrderIds(work);

  if (!linkedIds.length) {
    return <AssigneeName userId={work.assignedToUserId} />;
  }

  if (loading && linkedIds.some((id) => !(id in workOrdersById))) {
    return <span className="text-muted">—</span>;
  }

  const assignees = uniqueAssigneeIds(linkedIds, workOrdersById);
  if (!assignees.length) {
    return <span className="text-muted">Unassigned</span>;
  }

  if (assignees.length === 1) {
    return <AssigneeName userId={assignees[0]} />;
  }

  return (
    <span className="text-muted">
      {assignees.map((id, index) => (
        <span key={id}>
          {index > 0 ? ", " : null}
          <AssigneeName userId={id} />
        </span>
      ))}
    </span>
  );
}

/** Detail view — one row per linked Work Order with canonical execution assignee. */
export function WorkOrderExecutionAssigneeList({
  work,
  workOrdersById,
  loading,
  onOpenWorkOrder,
}: {
  work: Maintenance;
  workOrdersById: Record<string, WorkOrder | null>;
  loading?: boolean;
  onOpenWorkOrder?: (workOrderId: string) => void;
}) {
  const linkedIds = collectLinkedWorkOrderIds(work);
  if (!linkedIds.length) return null;

  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        Execution assignment
      </p>
      <div className="overflow-hidden rounded-md border border-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">Work order</th>
              <th className="px-3 py-2 font-medium">Assigned to</th>
            </tr>
          </thead>
          <tbody>
            {linkedIds.map((woId) => {
              const wo = workOrdersById[woId];
              const pending = loading && !(woId in workOrdersById);
              return (
                <tr key={woId} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 align-top">
                    {onOpenWorkOrder ? (
                      <button
                        type="button"
                        className="font-medium text-accent underline-offset-2 hover:underline"
                        onClick={() => onOpenWorkOrder(woId)}
                      >
                        {woId}
                      </button>
                    ) : (
                      woId
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-foreground">
                    {pending ? (
                      <span className="text-muted">—</span>
                    ) : wo ? (
                      <AssigneeName userId={wo.assignedToUserId} />
                    ) : (
                      <span className="text-muted">Work order not found</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
