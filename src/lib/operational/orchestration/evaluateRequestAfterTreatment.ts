import { emitActionEvent, type ActionContext } from "@/lib/actions";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { isRequestTerminal } from "@/modules/requests/treatment/status";
import type { RequestRecord } from "@/modules/requests/types";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { RequestService } from "@/services/requests/RequestService";

export type EvaluateRequestAfterTreatmentOutcome =
  | "resolved"
  | "already_terminal"
  | "pending_active_or_unsuccessful"
  | "no_treatments"
  | "request_not_found"
  | "skipped_no_source";

export type EvaluateRequestAfterTreatmentResult = {
  outcome: EvaluateRequestAfterTreatmentOutcome;
  request: RequestRecord | null;
};

/** Process-local serialisation for concurrent completion of the same Request. */
const evalGates = new Map<string, Promise<void>>();

async function withRequestEvalGate<T>(
  requestId: string,
  run: () => Promise<T>
): Promise<T> {
  const previous = evalGates.get(requestId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  evalGates.set(
    requestId,
    previous.then(() => gate)
  );
  await previous;
  try {
    return await run();
  } finally {
    release();
    if (evalGates.get(requestId) === gate) {
      evalGates.delete(requestId);
    }
  }
}

/** Status-authoritative successful terminal for Maintenance treatments. */
export function isMaintenanceSuccessfullyTerminal(status: string): boolean {
  return status === "completed";
}

/** Status-authoritative successful terminal for Incident treatments. */
export function isIncidentSuccessfullyTerminal(status: string): boolean {
  return status === "resolved";
}

/**
 * Pure evaluation — ALL linked treatments must be successfully terminal.
 * Cancelled / missing / active children block auto-resolution.
 * Empty link arrays → not eligible (no automatic resolution).
 */
export function allLinkedTreatmentsSuccessfullyTerminal(input: {
  maintenanceIds: string[];
  incidentIds: string[];
  maintenances: Array<{ id: string; status: string } | null>;
  incidents: Array<{ id: string; status: string } | null>;
}): boolean {
  const { maintenanceIds, incidentIds, maintenances, incidents } = input;
  if (maintenanceIds.length === 0 && incidentIds.length === 0) {
    return false;
  }

  for (let i = 0; i < maintenanceIds.length; i++) {
    const row = maintenances[i];
    if (!row || !isMaintenanceSuccessfullyTerminal(row.status)) {
      return false;
    }
  }

  for (let i = 0; i < incidentIds.length; i++) {
    const row = incidents[i];
    if (!row || !isIncidentSuccessfullyTerminal(row.status)) {
      return false;
    }
  }

  return true;
}

/**
 * After a linked Maintenance→completed or Incident→resolved transition,
 * evaluate whether the originating Request should become resolved.
 *
 * Idempotent: terminal Requests are left unchanged.
 * Does not invent Work Order relationships.
 */
export async function evaluateRequestAfterTreatmentCompletion(options: {
  sourceRequestId: string | null | undefined;
  context: ActionContext;
}): Promise<EvaluateRequestAfterTreatmentResult> {
  const sourceRequestId = options.sourceRequestId?.trim();
  if (!sourceRequestId) {
    return { outcome: "skipped_no_source", request: null };
  }

  return withRequestEvalGate(sourceRequestId, async () => {
    const request = await RequestService.getRequest(sourceRequestId);
    if (!request) {
      return { outcome: "request_not_found", request: null };
    }

    if (isRequestTerminal(request.status)) {
      return { outcome: "already_terminal", request };
    }

    const maintenanceIds = [...(request.maintenanceIds ?? [])].filter(Boolean);
    const incidentIds = [...(request.incidentIds ?? [])].filter(Boolean);

    if (maintenanceIds.length === 0 && incidentIds.length === 0) {
      return { outcome: "no_treatments", request };
    }

    const maintenances = await Promise.all(
      maintenanceIds.map((id) => MaintenanceService.getMaintenance(id))
    );
    const incidents = await Promise.all(
      incidentIds.map((id) => IncidentService.getIncident(id))
    );

    const eligible = allLinkedTreatmentsSuccessfullyTerminal({
      maintenanceIds,
      incidentIds,
      maintenances: maintenances.map((row) =>
        row ? { id: row.id, status: row.status } : null
      ),
      incidents: incidents.map((row) =>
        row ? { id: row.id, status: row.status } : null
      ),
    });

    if (!eligible) {
      return { outcome: "pending_active_or_unsuccessful", request };
    }

    // Re-read under the gate before mutate (concurrent completers / retries).
    const fresh = await RequestService.getRequest(sourceRequestId);
    if (!fresh) {
      return { outcome: "request_not_found", request: null };
    }
    if (isRequestTerminal(fresh.status)) {
      return { outcome: "already_terminal", request: fresh };
    }

    const previousStatus = fresh.status;
    const updated = await RequestService.updateRequest({
      id: fresh.id,
      status: "resolved",
      updatedByUserId: options.context.userId,
    });

    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_REQUEST_RESOLVED,
        entityType: "request",
        entityId: updated.id,
        data: {
          requestId: updated.id,
          previousStatus,
          nextStatus: "resolved",
          actor: options.context.userId,
          transitionSource: "treatment_completion",
        },
      });
    } catch {
      // non-blocking — Request status is authoritative in Sheets
    }

    return { outcome: "resolved", request: updated };
  });
}
