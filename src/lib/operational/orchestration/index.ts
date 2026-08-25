import { emitActionEvent, type ActionContext } from "@/lib/actions";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import {
  incidentEventData,
  maintenanceEventData,
  withIntakeMetadata,
  workOrderEventData,
} from "@/lib/operational/events/payloads";
import {
  incidentMaintenanceLeaseKey,
  incidentWorkOrderLeaseKey,
  runExclusiveOperationalAction,
} from "@/lib/operational/idempotency/actionLease";
import {
  transitionIncident,
  transitionMaintenance,
  transitionWorkOrder,
} from "@/lib/operational/lifecycle";
import {
  linkMaintenanceToIncident,
  linkWorkOrderToIncident,
  linkWorkOrderToMaintenance,
  normalizeIncidentRelationships,
  normalizeMaintenanceRelationships,
} from "@/lib/operational/relationships";
import type { OperationalIntakeSource } from "@/lib/operational/intake";
import {
  mapIntakeToIncidentSource,
  mapIntakeToMaintenanceSource,
} from "@/lib/operational/intake";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type {
  CreateIncidentInput,
  Incident,
  UpdateIncidentInput,
} from "@/modules/incidents/types";
import type {
  CreateMaintenanceInput,
  Maintenance,
  UpdateMaintenanceInput,
} from "@/modules/maintenance/types";
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
} from "@/modules/work-orders/types";

async function persistOperationalEventId(
  entity: "incident" | "maintenance" | "work_order",
  id: string,
  eventId: string
): Promise<void> {
  try {
    if (entity === "incident") {
      await IncidentService.updateIncident(id, { operationalEventId: eventId });
    } else if (entity === "maintenance") {
      await MaintenanceService.updateMaintenance(id, {
        operationalEventId: eventId,
      });
    } else {
      await WorkOrderService.updateWorkOrder(id, {
        operationalEventId: eventId,
      });
    }
  } catch (error) {
    console.error("[operational] failed to persist operationalEventId", {
      entity,
      id,
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function orchestrateReportIncident(options: {
  input: CreateIncidentInput;
  intake: OperationalIntakeSource;
  context: ActionContext;
  sourceReference?: string;
}): Promise<Incident> {
  const writeInput: CreateIncidentInput = {
    ...options.input,
    source:
      options.input.source ?? mapIntakeToIncidentSource(options.intake),
  };

  const incident = await IncidentService.createIncident(writeInput);

  try {
    const event = await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
      entityType: "incident",
      entityId: incident.id,
      data: withIntakeMetadata(
        incidentEventData(incident, {
          actor: options.context.userId,
          transitionSource: "specialised_action",
        }),
        options.intake,
        options.sourceReference
      ),
    });
    await persistOperationalEventId("incident", incident.id, event.id);
  } catch (eventError) {
    console.error("[orchestrateReportIncident] event emission failed", {
      incidentId: incident.id,
      error:
        eventError instanceof Error ? eventError.message : String(eventError),
    });
  }

  return incident;
}

export async function orchestrateRequestMaintenance(options: {
  input: CreateMaintenanceInput;
  intake: OperationalIntakeSource;
  context: ActionContext;
  sourceReference?: string;
}): Promise<Maintenance> {
  const writeInput: CreateMaintenanceInput = {
    ...options.input,
    source:
      options.input.source ?? mapIntakeToMaintenanceSource(options.intake),
  };

  const maintenance = await MaintenanceService.createMaintenance(writeInput);

  try {
    const event = await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
      entityType: "maintenance_request",
      entityId: String(maintenance.id),
      data: withIntakeMetadata(
        maintenanceEventData(
          {
            ...maintenance,
            // Preserve link even when Sheets does not yet echo Incident ID.
            incidentId: maintenance.incidentId ?? writeInput.incidentId,
          },
          {
            actor: options.context.userId,
            transitionSource: "specialised_action",
          }
        ),
        options.intake,
        options.sourceReference
      ),
    });
    await persistOperationalEventId("maintenance", maintenance.id, event.id);
  } catch (eventError) {
    console.error("[orchestrateRequestMaintenance] event emission failed", {
      maintenanceId: maintenance.id,
      error:
        eventError instanceof Error ? eventError.message : String(eventError),
    });
  }

  return {
    ...maintenance,
    incidentId: maintenance.incidentId ?? writeInput.incidentId,
  };
}

export async function orchestrateCreateWorkOrder(options: {
  input: CreateWorkOrderInput;
  context: ActionContext;
  intake?: OperationalIntakeSource;
}): Promise<WorkOrder> {
  const workOrder = await WorkOrderService.createWorkOrder(options.input);

  if (options.input.incidentId) {
    const incident = await IncidentService.getIncident(options.input.incidentId);
    if (incident) {
      const rel = linkWorkOrderToIncident(
        normalizeIncidentRelationships(incident),
        workOrder.id
      );
      await IncidentService.updateIncident(incident.id, {
        workOrderIds: rel.workOrderIds,
        workOrderId: rel.workOrderId,
        requiresWorkOrder: true,
      });
    }
  }

  if (options.input.maintenanceId) {
    const maintenance = await MaintenanceService.getMaintenance(
      options.input.maintenanceId
    );
    if (maintenance) {
      const rel = linkWorkOrderToMaintenance(
        normalizeMaintenanceRelationships(maintenance),
        workOrder.id
      );
      await MaintenanceService.updateMaintenance(maintenance.id, {
        workOrderIds: rel.workOrderIds,
        workOrderId: rel.workOrderId,
        requiresWorkOrder: true,
      });
    }
  }

  try {
    const event = await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_WORK_ORDER_CREATED,
      entityType: "work_order",
      entityId: workOrder.id,
      data: withIntakeMetadata(
        workOrderEventData(workOrder, {
          actor: options.context.userId,
          transitionSource: "specialised_action",
        }),
        options.intake ?? "staff"
      ),
    });
    await persistOperationalEventId("work_order", workOrder.id, event.id);
  } catch (eventError) {
    console.error("[orchestrateCreateWorkOrder] event emission failed", {
      workOrderId: workOrder.id,
      error:
        eventError instanceof Error ? eventError.message : String(eventError),
    });
  }

  return workOrder;
}

export type TriageResponse =
  | "resolve_without_work"
  | "create_maintenance"
  | "create_work_order"
  | "create_both";

export type TriageIncidentInput = {
  incidentId: string;
  response: TriageResponse;
  maintenanceTitle?: string;
  workOrderTitle?: string;
  assignedToUserId?: string;
  resolveIncident?: boolean;
};

export type TriageIncidentResult = {
  incident: Incident;
  maintenance?: Maintenance;
  workOrder?: WorkOrder;
};

export async function orchestrateTriageIncident(options: {
  input: TriageIncidentInput;
  context: ActionContext;
}): Promise<TriageIncidentResult> {
  const incident = await IncidentService.getIncident(options.input.incidentId);
  if (!incident) {
    throw new Error("Incident not found");
  }

  // Idempotent resolve: do not re-triage a terminal incident (would recreate resolve events).
  if (
    (options.input.response === "resolve_without_work" ||
      options.input.resolveIncident === true) &&
    (incident.status === "resolved" || incident.status === "closed")
  ) {
    return { incident };
  }

  let current = incident;
  let maintenance: Maintenance | undefined;
  let workOrder: WorkOrder | undefined;

  const previousStatus = incident.status;
  const triaged = await transitionIncident({
    entityId: incident.id,
    update: {
      status: "triaged",
      assignedToUserId:
        options.input.assignedToUserId ?? incident.assignedToUserId,
    },
    context: options.context,
    options: {
      suppressLifecycleEvent: true,
      transitionSource: "specialised_action",
    },
  });
  current = triaged.entity;

  // Authoritative specialised emit — skip if status was already triaged.
  if (previousStatus !== "triaged") {
    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_INCIDENT_TRIAGED,
        entityType: "incident",
        entityId: incident.id,
        data: incidentEventData(current, {
          triageResponse: options.input.response,
          previousStatus,
          nextStatus: current.status,
          actor: options.context.userId,
          transitionSource: "specialised_action",
        }),
      });
    } catch (eventError) {
      console.error("[orchestrateTriageIncident] triage event failed", {
        incidentId: incident.id,
        error:
          eventError instanceof Error ? eventError.message : String(eventError),
      });
    }
  }

  const needsMaintenance =
    options.input.response === "create_maintenance" ||
    options.input.response === "create_both";
  const needsWorkOrder =
    options.input.response === "create_work_order" ||
    options.input.response === "create_both";

  if (needsMaintenance) {
    maintenance = await runExclusiveOperationalAction({
      organisationId: options.context.organisation.id,
      scopeKey: incidentMaintenanceLeaseKey(current.id),
      actorProfileId: options.context.profile.id,
      entityType: "maintenance",
      recoverExisting: async () => {
        const fresh = await IncidentService.getIncident(current.id);
        if (!fresh) return null;
        current = fresh;
        const existingId = fresh.maintenanceIds?.[0];
        if (!existingId) return null;
        const existing = await MaintenanceService.getMaintenance(existingId);
        if (!existing) return null;
        return { entityId: existing.id, value: existing };
      },
      loadByEntityId: async (entityId) => {
        const existing = await MaintenanceService.getMaintenance(entityId);
        if (!existing) return null;
        return { entityId: existing.id, value: existing };
      },
      create: async () => {
        const created = await orchestrateCreateMaintenanceFromIncident({
          incident: current,
          title:
            options.input.maintenanceTitle ??
            `Maintenance: ${current.title}`.slice(0, 200),
          context: options.context,
        });
        const fresh = await IncidentService.getIncident(current.id);
        if (fresh) current = fresh;
        const rel = linkMaintenanceToIncident(
          normalizeIncidentRelationships(current),
          created.id
        );
        current = await IncidentService.updateIncident(current.id, {
          maintenanceIds: rel.maintenanceIds,
        });
        return { entityId: created.id, value: created };
      },
    });
  }

  if (needsWorkOrder) {
    workOrder = await runExclusiveOperationalAction({
      organisationId: options.context.organisation.id,
      scopeKey: incidentWorkOrderLeaseKey(current.id),
      actorProfileId: options.context.profile.id,
      entityType: "work_order",
      recoverExisting: async () => {
        const fresh = await IncidentService.getIncident(current.id);
        if (!fresh) return null;
        current = fresh;
        const existingId = fresh.workOrderIds?.[0] ?? fresh.workOrderId;
        if (!existingId) return null;
        const existing = await WorkOrderService.getWorkOrder(existingId);
        if (!existing) return null;
        return { entityId: existing.id, value: existing };
      },
      loadByEntityId: async (entityId) => {
        const existing = await WorkOrderService.getWorkOrder(entityId);
        if (!existing) return null;
        return { entityId: existing.id, value: existing };
      },
      create: async () => {
        const created = await orchestrateCreateWorkOrder({
          input: {
            title:
              options.input.workOrderTitle ??
              `Work order: ${current.title}`.slice(0, 200),
            description: current.description,
            type: "corrective",
            source: "incident",
            facilityId: current.facilityId,
            assetId: current.assetId,
            incidentId: current.id,
            maintenanceId: maintenance?.id,
            status: "open",
            priority:
              current.severity === "critical" || current.severity === "high"
                ? "high"
                : "medium",
            requestedAt: options.context.now,
            createdByUserId: options.context.userId,
            updatedByUserId: options.context.userId,
          },
          context: options.context,
        });
        const fresh = await IncidentService.getIncident(current.id);
        if (fresh) current = fresh;
        const rel = linkWorkOrderToIncident(
          normalizeIncidentRelationships(current),
          created.id
        );
        current = await IncidentService.updateIncident(current.id, {
          workOrderIds: rel.workOrderIds,
          workOrderId: rel.workOrderId,
          requiresWorkOrder: true,
        });
        return { entityId: created.id, value: created };
      },
    });
  }

  if (
    options.input.response === "resolve_without_work" ||
    options.input.resolveIncident === true
  ) {
    current = await orchestrateResolveIncident({
      incidentId: current.id,
      context: options.context,
    });
  }

  return { incident: current, maintenance, workOrder };
}

export async function orchestrateCreateMaintenanceFromIncident(options: {
  incident: Incident;
  title: string;
  context: ActionContext;
}): Promise<Maintenance> {
  const maintenance = await orchestrateRequestMaintenance({
    input: {
      title: options.title,
      description: options.incident.description,
      type: "corrective",
      source: "incident",
      facilityId: options.incident.facilityId,
      assetId: options.incident.assetId,
      incidentId: options.incident.id,
      priority:
        options.incident.severity === "critical" ||
        options.incident.severity === "high"
          ? "high"
          : "medium",
      status: "requested",
      reportedAt: options.context.now,
      reportedByUserId: options.context.userId,
      createdByUserId: options.context.userId,
      updatedByUserId: options.context.userId,
    },
    intake: "staff",
    context: options.context,
    sourceReference: options.incident.id,
  });

  return maintenance;
}

export async function orchestrateCompleteWorkOrder(options: {
  workOrderId: string;
  context: ActionContext;
  completionNotes?: string;
  resolveLinkedMaintenance?: boolean;
}): Promise<WorkOrder> {
  const existing = await WorkOrderService.getWorkOrder(options.workOrderId);
  if (!existing) {
    throw new Error("Work order not found");
  }

  const previousStatus = existing.status;
  const completedResult = await transitionWorkOrder({
    entityId: existing.id,
    update: {
      status: "completed",
      completedAt: options.context.now,
      completionNotes: options.completionNotes,
      updatedByUserId: options.context.userId,
    },
    context: options.context,
    options: {
      suppressLifecycleEvent: true,
      transitionSource: "specialised_action",
    },
  });
  const completed = completedResult.entity;

  if (previousStatus !== "completed") {
    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED,
        entityType: "work_order",
        entityId: completed.id,
        data: workOrderEventData(completed, {
          previousStatus,
          nextStatus: completed.status,
          actor: options.context.userId,
          transitionSource: "specialised_action",
        }),
      });
    } catch (eventError) {
      console.error("[orchestrateCompleteWorkOrder] event emission failed", {
        workOrderId: completed.id,
        error:
          eventError instanceof Error ? eventError.message : String(eventError),
      });
    }
  }

  if (options.resolveLinkedMaintenance && completed.maintenanceId) {
    const maintenance = await MaintenanceService.getMaintenance(
      completed.maintenanceId
    );
    if (maintenance && maintenance.status !== "completed") {
      const maintenancePrevious = maintenance.status;
      const completedMaintenance = await transitionMaintenance({
        entityId: maintenance.id,
        update: {
          status: "completed",
          completedAt: options.context.now,
          updatedByUserId: options.context.userId,
        },
        context: options.context,
        options: {
          suppressLifecycleEvent: true,
          transitionSource: "specialised_action",
        },
      });
      try {
        await emitActionEvent(options.context, {
          eventType: OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED,
          entityType: "maintenance_request",
          entityId: maintenance.id,
          data: maintenanceEventData(completedMaintenance.entity, {
            previousStatus: maintenancePrevious,
            nextStatus: "completed",
            actor: options.context.userId,
            transitionSource: "specialised_action",
          }),
        });
      } catch {
        /* non-blocking */
      }
    }
  }

  return completed;
}

export async function orchestrateResolveIncident(options: {
  incidentId: string;
  context: ActionContext;
  resolutionNotes?: string;
}): Promise<Incident> {
  const incident = await IncidentService.getIncident(options.incidentId);
  if (!incident) {
    throw new Error("Incident not found");
  }

  const previousStatus = incident.status;
  if (previousStatus === "resolved" || previousStatus === "closed") {
    return incident;
  }

  const resolvedResult = await transitionIncident({
    entityId: incident.id,
    update: {
      status: "resolved",
      resolvedAt: options.context.now,
      resolutionNotes: options.resolutionNotes,
      updatedByUserId: options.context.userId,
    },
    context: options.context,
    options: {
      suppressLifecycleEvent: true,
      transitionSource: "specialised_action",
    },
  });
  const resolved = resolvedResult.entity;

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_INCIDENT_RESOLVED,
      entityType: "incident",
      entityId: resolved.id,
      data: incidentEventData(resolved, {
        previousStatus,
        nextStatus: resolved.status,
        actor: options.context.userId,
        transitionSource: "specialised_action",
      }),
    });
  } catch (eventError) {
    console.error("[orchestrateResolveIncident] event emission failed", {
      incidentId: resolved.id,
      error:
        eventError instanceof Error ? eventError.message : String(eventError),
    });
  }

  return resolved;
}

export async function orchestrateUpdateWorkOrderStatus(options: {
  workOrderId: string;
  update: UpdateWorkOrderInput;
  context: ActionContext;
  eventType?: string;
}): Promise<WorkOrder> {
  const result = await transitionWorkOrder({
    entityId: options.workOrderId,
    update: options.update,
    context: options.context,
    options: {
      ...(options.eventType ? { forceEventType: options.eventType } : {}),
      transitionSource: "form_update",
    },
  });
  return result.entity;
}

export async function orchestrateUpdateIncident(
  id: string,
  update: UpdateIncidentInput,
  context: ActionContext,
  eventType?: string
): Promise<Incident> {
  const result = await transitionIncident({
    entityId: id,
    update,
    context,
    options: {
      ...(eventType ? { forceEventType: eventType } : {}),
      transitionSource: "form_update",
    },
  });
  return result.entity;
}

export async function orchestrateUpdateMaintenance(
  id: string,
  update: UpdateMaintenanceInput,
  context: ActionContext,
  eventType?: string
): Promise<Maintenance> {
  const result = await transitionMaintenance({
    entityId: id,
    update,
    context,
    options: {
      ...(eventType ? { forceEventType: eventType } : {}),
      transitionSource: "form_update",
    },
  });
  return result.entity;
}
