import { emitActionEvent, type ActionContext } from "@/lib/actions";
import {
  incidentEventData,
  maintenanceEventData,
  workOrderEventData,
} from "@/lib/operational/events/payloads";
import {
  lifecycleEntityTypeLabel,
  mapStatusToLifecycleEvent,
  type LifecycleEntityType,
} from "@/lib/operational/lifecycle/mapStatusTransition";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type {
  Incident,
  UpdateIncidentInput,
} from "@/modules/incidents/types";
import type {
  Maintenance,
  UpdateMaintenanceInput,
} from "@/modules/maintenance/types";
import type {
  UpdateWorkOrderInput,
  WorkOrder,
} from "@/modules/work-orders/types";

export type TransitionSource =
  | "form_update"
  | "status_control"
  | "specialised_action"
  | "system";

export type TransitionOperationalEntityResult<T> = {
  entity: T;
  statusChanged: boolean;
  previousStatus: string | null;
  nextStatus: string | null;
  eventType: string | null;
  eventEmitted: boolean;
};

export type TransitionOptions = {
  /**
   * When a specialised workflow (triage / complete / resolve) already emitted
   * the authoritative lifecycle event for this status change.
   */
  suppressLifecycleEvent?: boolean;
  /** Override mapped event type (rare). Explicit null still suppresses mapping. */
  forceEventType?: string | null;
  transitionSource?: TransitionSource;
};

function transitionExtras(
  context: ActionContext,
  previousStatus: string,
  nextStatus: string,
  source: TransitionSource
): Record<string, unknown> {
  return {
    previousStatus,
    nextStatus,
    actor: context.userId,
    transitionSource: source,
  };
}

/**
 * Single authoritative path for generic entity updates that may change status.
 *
 * - Persists the update
 * - Emits a lifecycle event only when status actually changes
 * - Maps domain status → taxonomy event
 * - Skips emission when specialised actions already handled the event
 *
 * Specialised workflows (report / request / create / triage / complete / resolve)
 * remain authoritative and must pass suppressLifecycleEvent when they emit
 * their own event after persisting.
 */
export async function transitionIncident(options: {
  entityId: string;
  update: UpdateIncidentInput;
  context: ActionContext;
  options?: TransitionOptions;
}): Promise<TransitionOperationalEntityResult<Incident>> {
  const existing = await IncidentService.getIncident(options.entityId);
  if (!existing) {
    throw new Error("Incident not found");
  }

  const previousStatus = existing.status;
  const nextStatus = options.update.status ?? existing.status;
  const statusChanged = previousStatus !== nextStatus;
  const source = options.options?.transitionSource ?? "form_update";

  const mapped =
    options.options?.forceEventType !== undefined
      ? options.options.forceEventType
      : mapStatusToLifecycleEvent("incident", previousStatus, nextStatus);

  const shouldEmit =
    statusChanged &&
    mapped != null &&
    options.options?.suppressLifecycleEvent !== true;

  const entity = await IncidentService.updateIncident(
    options.entityId,
    options.update
  );

  let eventEmitted = false;
  if (shouldEmit && mapped) {
    eventEmitted = await emitLifecycleSafely({
      context: options.context,
      entityType: "incident",
      entityId: entity.id,
      eventType: mapped,
      data: incidentEventData(
        entity,
        transitionExtras(options.context, previousStatus, nextStatus, source)
      ),
    });
  }

  return {
    entity,
    statusChanged,
    previousStatus,
    nextStatus,
    eventType: shouldEmit ? mapped : null,
    eventEmitted,
  };
}

export async function transitionMaintenance(options: {
  entityId: string;
  update: UpdateMaintenanceInput;
  context: ActionContext;
  options?: TransitionOptions;
}): Promise<TransitionOperationalEntityResult<Maintenance>> {
  const existing = await MaintenanceService.getMaintenance(options.entityId);
  if (!existing) {
    throw new Error("Maintenance not found");
  }

  const previousStatus = existing.status;
  const nextStatus = options.update.status ?? existing.status;
  const statusChanged = previousStatus !== nextStatus;
  const source = options.options?.transitionSource ?? "form_update";

  const mapped =
    options.options?.forceEventType !== undefined
      ? options.options.forceEventType
      : mapStatusToLifecycleEvent("maintenance", previousStatus, nextStatus);

  const shouldEmit =
    statusChanged &&
    mapped != null &&
    options.options?.suppressLifecycleEvent !== true;

  const entity = await MaintenanceService.updateMaintenance(
    options.entityId,
    options.update
  );

  let eventEmitted = false;
  if (shouldEmit && mapped) {
    eventEmitted = await emitLifecycleSafely({
      context: options.context,
      entityType: "maintenance",
      entityId: entity.id,
      eventType: mapped,
      data: maintenanceEventData(
        entity,
        transitionExtras(options.context, previousStatus, nextStatus, source)
      ),
    });
  }

  return {
    entity,
    statusChanged,
    previousStatus,
    nextStatus,
    eventType: shouldEmit ? mapped : null,
    eventEmitted,
  };
}

export async function transitionWorkOrder(options: {
  entityId: string;
  update: UpdateWorkOrderInput;
  context: ActionContext;
  options?: TransitionOptions;
}): Promise<TransitionOperationalEntityResult<WorkOrder>> {
  const existing = await WorkOrderService.getWorkOrder(options.entityId);
  if (!existing) {
    throw new Error("Work order not found");
  }

  const previousStatus = existing.status;
  const nextStatus = options.update.status ?? existing.status;
  const statusChanged = previousStatus !== nextStatus;
  const source = options.options?.transitionSource ?? "form_update";

  const mapped =
    options.options?.forceEventType !== undefined
      ? options.options.forceEventType
      : mapStatusToLifecycleEvent("work_order", previousStatus, nextStatus);

  const shouldEmit =
    statusChanged &&
    mapped != null &&
    options.options?.suppressLifecycleEvent !== true;

  const entity = await WorkOrderService.updateWorkOrder(
    options.entityId,
    options.update
  );

  let eventEmitted = false;
  if (shouldEmit && mapped) {
    eventEmitted = await emitLifecycleSafely({
      context: options.context,
      entityType: "work_order",
      entityId: entity.id,
      eventType: mapped,
      data: workOrderEventData(
        entity,
        transitionExtras(options.context, previousStatus, nextStatus, source)
      ),
    });
  }

  return {
    entity,
    statusChanged,
    previousStatus,
    nextStatus,
    eventType: shouldEmit ? mapped : null,
    eventEmitted,
  };
}

async function emitLifecycleSafely(options: {
  context: ActionContext;
  entityType: LifecycleEntityType;
  entityId: string;
  eventType: string;
  data: Record<string, unknown>;
}): Promise<boolean> {
  try {
    await emitActionEvent(options.context, {
      eventType: options.eventType,
      entityType: lifecycleEntityTypeLabel(options.entityType),
      entityId: options.entityId,
      data: options.data,
    });
    return true;
  } catch (error) {
    console.error("[transitionOperationalEntity] lifecycle event failed", {
      entityType: options.entityType,
      entityId: options.entityId,
      eventType: options.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
