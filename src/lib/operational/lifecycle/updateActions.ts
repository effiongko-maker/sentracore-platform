"use server";

import { ActionError, executeAction, type ActionResult } from "@/lib/actions";
import {
  transitionIncident,
  transitionMaintenance,
  transitionWorkOrder,
} from "@/lib/operational/lifecycle/transitionOperationalEntity";
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

/**
 * Form/detail update path for incidents.
 * Status changes emit lifecycle events via the shared transition layer.
 * Specialised actions (triage / resolve) remain separate and authoritative.
 */
export async function updateIncidentOperational(
  id: string,
  input: UpdateIncidentInput
): Promise<ActionResult<Incident>> {
  return executeAction({
    name: "incident.update",
    module: "facility_management",
    input: { id, ...input },
    handler: async (context, raw) => {
      const entityId = String(raw.id ?? id).trim();
      if (!entityId) {
        throw new ActionError("VALIDATION_ERROR", "Incident ID is required.");
      }
      const { id: _omit, ...update } = raw as UpdateIncidentInput & {
        id?: string;
      };
      const result = await transitionIncident({
        entityId,
        update: {
          ...update,
          updatedByUserId: context.userId,
        },
        context,
        options: { transitionSource: "form_update" },
      });
      return result.entity;
    },
  });
}

export async function updateMaintenanceOperational(
  id: string,
  input: UpdateMaintenanceInput
): Promise<ActionResult<Maintenance>> {
  return executeAction({
    name: "maintenance.update",
    module: "facility_management",
    input: { id, ...input },
    handler: async (context, raw) => {
      const entityId = String(raw.id ?? id).trim();
      if (!entityId) {
        throw new ActionError("VALIDATION_ERROR", "Maintenance ID is required.");
      }
      const { id: _omit, ...update } = raw as UpdateMaintenanceInput & {
        id?: string;
      };
      const result = await transitionMaintenance({
        entityId,
        update: {
          ...update,
          updatedByUserId: context.userId,
        },
        context,
        options: { transitionSource: "form_update" },
      });
      return result.entity;
    },
  });
}

export async function updateWorkOrderOperational(
  id: string,
  input: UpdateWorkOrderInput
): Promise<ActionResult<WorkOrder>> {
  return executeAction({
    name: "work_order.update",
    module: "facility_management",
    input: { id, ...input },
    handler: async (context, raw) => {
      const entityId = String(raw.id ?? id).trim();
      if (!entityId) {
        throw new ActionError("VALIDATION_ERROR", "Work order ID is required.");
      }
      const { id: _omit, ...update } = raw as UpdateWorkOrderInput & {
        id?: string;
      };
      const result = await transitionWorkOrder({
        entityId,
        update: {
          ...update,
          updatedByUserId: context.userId,
        },
        context,
        options: { transitionSource: "form_update" },
      });
      return result.entity;
    },
  });
}
