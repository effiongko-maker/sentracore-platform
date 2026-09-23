import { emitActionEvent, type ActionContext } from "@/lib/actions";
import { ActionError } from "@/lib/actions/errors";
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
  maintenanceWorkOrderLeaseKey,
  runExclusiveOperationalAction,
} from "@/lib/operational/idempotency/actionLease";
import {
  transitionIncident,
  transitionMaintenance,
  transitionWorkOrder,
} from "@/lib/operational/lifecycle";
import {
} from "@/lib/operational/relationships";
import type { OperationalIntakeSource } from "@/lib/operational/intake";
import {
  mapIntakeToIncidentSource,
  mapIntakeToMaintenanceSource,
} from "@/lib/operational/intake";
import { assertNewIncidentCreateAllowed } from "@/lib/operational/work/incidentWriteFreeze";
import { IncidentServerAccess } from "@/modules/incidents/server/IncidentServerAccess";
import { validateOrderTypeSelection } from "@/modules/work-orders/instructionKind";
import { MaintenanceServerAccess as MaintenanceService } from "@/modules/maintenance/server/MaintenanceServerAccess";
import { WorkInstructionServerAccess as WorkOrderService } from "@/modules/work-orders/server/WorkInstructionServerAccess";
import type {
  CreateIncidentInput,
  Incident,
  UpdateIncidentInput,
} from "@/modules/incidents/types";
import type {
  CreateMaintenanceInput,
  Maintenance,
  UpdateMaintenanceInput,
  WorkCommercialRoute,
} from "@/modules/maintenance/types";
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderOrderType,
} from "@/modules/work-orders/types";

/**
 * When "after", emit + consumers + operationalEventId stamp run via Next.js
 * `after()` so they do not block the user-facing create response.
 * Default "await" preserves existing Treat / create semantics elsewhere.
 */
export type OperationalSideEffectMode = "await" | "after";

async function persistOperationalEventId(
  entity: "incident" | "maintenance" | "work_order",
  id: string,
  eventId: string
): Promise<void> {
  try {
    if (entity === "incident") {
      await IncidentServerAccess.updateIncident(id, { operationalEventId: eventId });
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

/**
 * Schedule operational side effects without dropping integrity.
 * Uses Next.js `after()` when mode is "after" and a request scope exists;
 * otherwise awaits (scripts / missing after scope).
 * Failures are always logged — never silently swallowed.
 */
async function runOperationalSideEffects(options: {
  mode: OperationalSideEffectMode;
  label: string;
  task: () => Promise<void>;
}): Promise<void> {
  const execute = async () => {
    try {
      await options.task();
    } catch (error) {
      console.error(`[${options.label}] side effects failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (options.mode !== "after") {
    await execute();
    return;
  }

  try {
    const { after } = await import("next/server");
    after(() => execute());
  } catch (error) {
    console.error(
      `[${options.label}] after() unavailable — awaiting side effects`,
      {
        error: error instanceof Error ? error.message : String(error),
      }
    );
    await execute();
  }
}

export async function orchestrateReportIncident(options: {
  input: CreateIncidentInput;
  intake: OperationalIntakeSource;
  context: ActionContext;
  sourceReference?: string;
  sideEffectMode?: OperationalSideEffectMode;
}): Promise<Incident> {
  assertNewIncidentCreateAllowed("orchestrateReportIncident");

  const writeInput: CreateIncidentInput = {
    ...options.input,
    source:
      options.input.source ?? mapIntakeToIncidentSource(options.intake),
  };

  const incident = await IncidentServerAccess.createIncident(writeInput);
  const mode = options.sideEffectMode ?? "await";

  await runOperationalSideEffects({
    mode,
    label: "orchestrateReportIncident",
    task: async () => {
      const event = await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
        entityType: "incident",
        entityId: incident.incidentUuid ?? incident.id,
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
    },
  });

  return incident;
}

export async function orchestrateRequestMaintenance(options: {
  input: CreateMaintenanceInput;
  intake: OperationalIntakeSource;
  context: ActionContext;
  sourceReference?: string;
  sideEffectMode?: OperationalSideEffectMode;
}): Promise<Maintenance> {
  const writeInput: CreateMaintenanceInput = {
    ...options.input,
    source:
      options.input.source ?? mapIntakeToMaintenanceSource(options.intake),
  };

  const maintenance = await MaintenanceService.createMaintenance(writeInput);
  const mode = options.sideEffectMode ?? "await";

  await runOperationalSideEffects({
    mode,
    label: "orchestrateRequestMaintenance",
    task: async () => {
      const event = await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
        entityType: "maintenance_request",
        entityId: maintenance.workUuid ?? String(maintenance.id),
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
    },
  });

  return {
    ...maintenance,
    incidentId: maintenance.incidentId ?? writeInput.incidentId,
  };
}

export type OrchestrateCreateWorkOrderResult = {
  workOrder: WorkOrder;
  /** Present when maintenanceId was linked during create. */
  linkedMaintenance?: Maintenance;
};

export async function orchestrateCreateWorkOrder(options: {
  input: CreateWorkOrderInput;
  context: ActionContext;
  intake?: OperationalIntakeSource;
  sideEffectMode?: OperationalSideEffectMode;
  /** Skip back-link read when the Maintenance row is already loaded. */
  maintenanceSnapshot?: Maintenance;
}): Promise<OrchestrateCreateWorkOrderResult> {
  const workOrder = await WorkOrderService.createWorkOrder(options.input);
  let linkedMaintenance: Maintenance | undefined;

  // Phase 2E: Incident → Work → Work Instruction is fully relational. The
  // Incident carries no Work Order reference; it is derived through the Work.
  if (options.input.maintenanceId) {
    const maintenance =
      options.maintenanceSnapshot ??
      (await MaintenanceService.getMaintenance(options.input.maintenanceId));
    if (maintenance) {
      // Phase 2B: do not persist WO child ID arrays on fm_work.
      linkedMaintenance = await MaintenanceService.updateMaintenance(
        maintenance.id,
        { requiresWorkOrder: true }
      );
      linkedMaintenance = {
        ...linkedMaintenance,
        requiresWorkOrder: true,
        workOrderId: workOrder.id,
        workOrderIds: [workOrder.id],
      };
    }
  }

  const sideEffectMode = options.sideEffectMode ?? "after";
  await runOperationalSideEffects({
    mode: sideEffectMode,
    label: "orchestrateCreateWorkOrder",
    task: async () => {
      try {
        const event = await emitActionEvent(options.context, {
          eventType: OperationalEventTypes.FACILITY_WORK_ORDER_CREATED,
          entityType: "work_order",
          entityId: workOrder.workOrderUuid ?? workOrder.id,
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
            eventError instanceof Error
              ? eventError.message
              : String(eventError),
        });
      }
    },
  });

  return { workOrder, linkedMaintenance };
}

/**
 * Create a Work Order from an existing Work record.
 * Phase 2B: Work is Supabase — do NOT call Apps Script createFromMaintenance
 * (that path reads/writes the frozen Maintenance sheet).
 * WO remains Apps Script; Work back-link stores requires_work_instruction only.
 */
export async function orchestrateCreateWorkOrderFromMaintenance(options: {
  maintenanceId: string;
  /** Explicit selection for legacy-unclassified Work; classified Work derives it from its execution basis. */
  orderType?: WorkOrderOrderType;
  /** The client's own reference for an issued Job Order, as supplied. */
  clientReference?: string;
  context: ActionContext;
  title?: string;
}): Promise<{ maintenance: Maintenance; workOrder: WorkOrder }> {
  let linkedMaintenance: Maintenance | undefined;

  const workOrder = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: maintenanceWorkOrderLeaseKey(options.maintenanceId),
    actorProfileId: options.context.profile.id,
    entityType: "work_order",
    recoverExisting: async () => {
      const fresh = await MaintenanceService.getMaintenance(
        options.maintenanceId
      );
      if (!fresh) return null;
      const listed = await WorkOrderService.listWorkOrders({
        page: 1,
        pageSize: 5,
        maintenanceId: options.maintenanceId,
      });
      const existing = listed.data.find(
        (row) => row.maintenanceId === options.maintenanceId
      );
      if (!existing) return null;
      linkedMaintenance = {
        ...fresh,
        requiresWorkOrder: true,
        workOrderId: existing.id,
        workOrderIds: [existing.id],
      };
      return { entityId: existing.id, value: existing };
    },
    loadByEntityId: async (entityId) => {
      const existing = await WorkOrderService.getWorkOrder(entityId);
      if (!existing) return null;
      return { entityId: existing.id, value: existing };
    },
    create: async () => {
      const maintenance = await MaintenanceService.getMaintenance(
        options.maintenanceId
      );
      if (!maintenance) {
        throw new Error(`Work ${options.maintenanceId} not found.`);
      }
      if (!maintenance.facilityId) {
        throw new Error(
          "Work facilityId is required to create a Work Order."
        );
      }

      const title =
        (options.title?.trim() || maintenance.title || "Work Order").slice(
          0,
          200
        );
      const maintType = String(maintenance.type || "").toLowerCase();
      const maintenanceType =
        maintType === "preventive" ||
        maintType === "routine" ||
        maintType === "predictive"
          ? "planned"
          : "unplanned";

      const created = await WorkOrderService.createWorkOrder({
        title,
        description: [
          maintenance.description?.trim(),
          `Source work: ${maintenance.id}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        type: "corrective",
        maintenanceType,
        source:
          maintenance.source === "incident"
            ? "incident"
            : maintenance.source === "request"
              ? "request"
              : "manual",
        facilityId: maintenance.facilityId,
        assetId: maintenance.assetId,
        maintenanceId: maintenance.id,
        incidentId: maintenance.incidentId,
        reportedByUserId: maintenance.reportedByUserId,
        assignedToUserId: maintenance.assignedToUserId,
        priority: maintenance.priority || "medium",
        orderType: options.orderType,
        clientReference: options.clientReference,
        // The Work Order's OWN lifecycle starts "open" (issued / submitted, not closed) on every route — it never copies
        // the Work's completion. Its record date is requestedAt (now): when it is actually submitted / recorded. On the
        // Work Order route the repository refuses it until the Work is completed.
        status: "open",
        requestedAt: options.context.now,
        createdByUserId: options.context.userId,
        updatedByUserId: options.context.userId,
      });

      // Legacy requires-work-order flag: kept in step for unclassified Work only (classified Work never writes it).
      const updated = maintenance.commercialRoute
        ? maintenance
        : await MaintenanceService.updateMaintenance(maintenance.id, { requiresWorkOrder: true });
      linkedMaintenance = {
        ...updated,
        requiresWorkOrder: true,
        workOrderId: created.id,
        workOrderIds: [created.id],
      };
      return { entityId: created.id, value: created };
    },
  });

  const resolvedMaintenance =
    linkedMaintenance ??
    (await MaintenanceService.getMaintenance(options.maintenanceId));
  if (!resolvedMaintenance) {
    throw new Error("Work not found after Work Order create");
  }

  await runOperationalSideEffects({
    mode: "after",
    label: "orchestrateCreateWorkOrderFromMaintenance",
    task: async () => {
      try {
        const event = await emitActionEvent(options.context, {
          eventType: OperationalEventTypes.FACILITY_WORK_ORDER_CREATED,
          entityType: "work_order",
          entityId: workOrder.workOrderUuid ?? workOrder.id,
          data: withIntakeMetadata(
            workOrderEventData(workOrder, {
              actor: options.context.userId,
              transitionSource: "specialised_action",
            }),
            "staff"
          ),
        });
        await persistOperationalEventId("work_order", workOrder.id, event.id);
      } catch (eventError) {
        console.error(
          "[orchestrateCreateWorkOrderFromMaintenance] event emission failed",
          {
            workOrderId: workOrder.id,
            error:
              eventError instanceof Error
                ? eventError.message
                : String(eventError),
          }
        );
      }
    },
  });

  return { maintenance: resolvedMaintenance, workOrder };
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
  /** Explicit manual selection — required for create_work_order / create_both. */
  orderType?: WorkOrderOrderType;
  /** Execution basis of the Work — required for create_maintenance / create_both (never defaulted). */
  commercialRoute?: WorkCommercialRoute;
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
  const incident = await IncidentServerAccess.getIncident(options.input.incidentId);
  if (!incident) {
    throw new Error("Incident not found");
  }

  const wantsWorkOrder =
    options.input.response === "create_work_order" ||
    options.input.response === "create_both";
  // Execution basis is a manual selection — checked before anything is written.
  const wantsWork =
    options.input.response === "create_maintenance" ||
    options.input.response === "create_both";
  if (wantsWork && !options.input.commercialRoute) {
    throw new ActionError("VALIDATION_ERROR", "Execution basis is required.");
  }
  // Order Type: for Work created here it IS the execution basis (never asked twice); a Job Order cannot be created
  // alongside new Work because the client's approval must come first. For the Incident's existing Work the
  // repository derives it from that Work's basis (legacy-unclassified Work still needs the explicit selection).
  let triageOrderType: WorkOrderOrderType | undefined;
  if (wantsWorkOrder) {
    if (options.input.response === "create_both") {
      if (options.input.commercialRoute === "job_order") {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Create the Work first: a Job Order is issued only after the client approves."
        );
      }
      if (options.input.orderType && options.input.orderType !== options.input.commercialRoute) {
        throw new ActionError("VALIDATION_ERROR", "Order Type must match the Work's execution basis.");
      }
      triageOrderType = options.input.commercialRoute;
    } else if (options.input.orderType) {
      const selection = validateOrderTypeSelection(options.input.orderType);
      if (!selection.ok) {
        throw new ActionError("VALIDATION_ERROR", selection.message);
      }
      triageOrderType = selection.kind;
    }
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
        entityId: incident.incidentUuid ?? incident.id,
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
        const fresh = await IncidentServerAccess.getIncident(current.id);
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
          commercialRoute: options.input.commercialRoute!,
          context: options.context,
        });
        // Phase 2D: Work carries fm_work.incident_id (FK); Incident
        // maintenanceIds are derived — never written. Re-read to reflect them.
        const fresh = await IncidentServerAccess.getIncident(current.id);
        if (fresh) current = fresh;
        return { entityId: created.id, value: created };
      },
    });
  }

  if (needsWorkOrder && !maintenance) {
    // A Work Instruction belongs to Work: reuse this Incident's Work.
    const existingWorkId = current.maintenanceIds?.[0];
    const existingWork = existingWorkId
      ? await MaintenanceService.getMaintenance(existingWorkId)
      : null;
    if (!existingWork) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "A Work Instruction belongs to Work — create Work for this Incident first (create both)."
      );
    }
    maintenance = existingWork;
  }

  if (needsWorkOrder) {
    workOrder = await runExclusiveOperationalAction({
      organisationId: options.context.organisation.id,
      scopeKey: incidentWorkOrderLeaseKey(current.id),
      actorProfileId: options.context.profile.id,
      entityType: "work_order",
      recoverExisting: async () => {
        const fresh = await IncidentServerAccess.getIncident(current.id);
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
            orderType: triageOrderType,
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
          maintenanceSnapshot: maintenance ?? undefined,
          sideEffectMode: "after",
        });
        const fresh = await IncidentServerAccess.getIncident(current.id);
        if (fresh) current = fresh;
        // Work Order links are derived (Incident → Work → Work Instruction);
        // only the declared requirement is recorded on the Incident.
        current = await IncidentServerAccess.updateIncident(current.id, {
          requiresWorkOrder: true,
        });
        return { entityId: created.workOrder.id, value: created.workOrder };
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
  commercialRoute: WorkCommercialRoute;
  context: ActionContext;
}): Promise<Maintenance> {
  const reporterCandidate =
    options.incident.reportedByUserId ?? options.context.userId;
  const reportedByUserId =
    reporterCandidate && !/^USR-/i.test(reporterCandidate)
      ? reporterCandidate
      : options.context.userId;

  const maintenance = await orchestrateRequestMaintenance({
    input: {
      title: options.title,
      description: options.incident.description,
      type: "corrective",
      source: "incident",
      commercialRoute: options.commercialRoute,
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
      reportedByUserId,
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
        entityId: completed.workOrderUuid ?? completed.id,
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
          entityId: maintenance.workUuid ?? maintenance.id,
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
  const incident = await IncidentServerAccess.getIncident(options.incidentId);
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
      entityId: resolved.incidentUuid ?? resolved.id,
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
