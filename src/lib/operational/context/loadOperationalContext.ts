"use server";

import { ActionError } from "@/lib/actions/errors";
import { getPlatformSession } from "@/lib/auth/session";
import {
  buildIncidentOperationalContext,
  eventTypeToHistoryLabel,
  type RelatedOperationalContext,
} from "@/lib/operational/context/types";
import { queryOperationalTimeline } from "@/lib/operational/timeline";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function getIncidentOperationalContext(
  incidentId: string
): Promise<RelatedOperationalContext | null> {
  const session = await getPlatformSession();
  if (!session?.organisation) {
    throw new ActionError("ORGANISATION_NOT_FOUND");
  }

  const incident = await IncidentService.getIncident(incidentId);
  if (!incident) return null;

  const maintenanceIds = incident.maintenanceIds ?? [];
  const workOrderIds = incident.workOrderIds ?? [];

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [maintenance, workOrders, timeline] = await Promise.all([
    Promise.all(
      maintenanceIds.map((id) => MaintenanceService.getMaintenance(id))
    ),
    Promise.all(workOrderIds.map((id) => WorkOrderService.getWorkOrder(id))),
    queryOperationalTimeline(supabase, {
      organisationId: session.organisation.id,
      incidentId,
      fromIso: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      limit: 200,
    }),
  ]);

  return buildIncidentOperationalContext({
    incident,
    maintenance: maintenance.filter(
      (item): item is NonNullable<typeof item> => item != null
    ),
    workOrders: workOrders.filter(
      (item): item is NonNullable<typeof item> => item != null
    ),
    history: timeline.map((event) => ({
      occurredAt: event.occurredAt,
      label: eventTypeToHistoryLabel(event.eventType),
      eventType: event.eventType,
      entityType: String(event.entityType),
      entityId: event.entityId,
    })),
  });
}
