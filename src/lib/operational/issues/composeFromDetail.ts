import { composeIssueFromRequest } from "./composeIssueFromRequest";
import { buildIssueOperationalView } from "./buildOperationalView";
import type {
  ComposeIssueFromRequestInput,
  Issue,
  IssueOperationalView,
} from "./types";

/**
 * Map a loaded Request treatment detail (existing loader) into Issue compose input.
 * Keeps Request / MNT / INC / WO as authoritative sources.
 */
export function toComposeInputFromTreatmentDetail(detail: {
  request: ComposeIssueFromRequestInput["request"] & {
    maintenanceIds?: string[];
    incidentIds?: string[];
    workOrderIds?: string[];
  };
  maintenance: NonNullable<ComposeIssueFromRequestInput["maintenances"]>;
  incidents: NonNullable<ComposeIssueFromRequestInput["incidents"]>;
  derivedWorkOrders: Array<{
    workOrder: {
      id: string;
      title: string;
      status: string;
      maintenanceId?: string;
      incidentId?: string;
    };
    via: "maintenance" | "incident";
    viaId: string;
  }>;
}): ComposeIssueFromRequestInput {
  return {
    request: {
      id: detail.request.id,
      title: detail.request.title,
      description: detail.request.description,
      facilityId: detail.request.facilityId,
      locationDetail: detail.request.locationDetail,
      reporterName: detail.request.reporterName,
      reporterContact: detail.request.reporterContact,
      reportedByUserId: detail.request.reportedByUserId,
      status: detail.request.status,
      requestType: detail.request.requestType,
      maintenanceIds: detail.request.maintenanceIds ?? [],
      incidentIds: detail.request.incidentIds ?? [],
      workOrderIds: detail.request.workOrderIds ?? [],
      createdAt: detail.request.createdAt,
      updatedAt: detail.request.updatedAt,
    },
    maintenances: detail.maintenance,
    incidents: detail.incidents,
    workOrders: detail.derivedWorkOrders.map((d) => ({
      id: d.workOrder.id,
      title: d.workOrder.title,
      status: d.workOrder.status,
      maintenanceId:
        d.via === "maintenance" ? d.viaId : d.workOrder.maintenanceId,
      incidentId: d.via === "incident" ? d.viaId : d.workOrder.incidentId,
    })),
  };
}

export function composeIssueFromTreatmentDetail(
  detail: Parameters<typeof toComposeInputFromTreatmentDetail>[0]
): Issue {
  return composeIssueFromRequest(toComposeInputFromTreatmentDetail(detail));
}

export function composeOperationalViewFromTreatmentDetail(
  detail: Parameters<typeof toComposeInputFromTreatmentDetail>[0]
): IssueOperationalView {
  return buildIssueOperationalView(composeIssueFromTreatmentDetail(detail));
}
