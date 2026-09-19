import {
  buildIssueOperationalView,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
  composeIssueFromRequest,
  type Issue,
  type IssueOperationalView,
} from "@/lib/operational/issues";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { RequestRecord } from "@/modules/requests/types";

export type UnifiedIssueListItem = {
  issue: Issue;
  view: IssueOperationalView;
};

function isStandaloneRoot(sourceRequestId?: string | null): boolean {
  return !sourceRequestId?.trim();
}

/**
 * Build a unified Issue list from Request intake + FM-rooted MNT/INC.
 * Request-linked treatments are NOT listed as separate Issues (avoid duplication).
 */
export function buildUnifiedIssueList(input: {
  requests: RequestRecord[];
  maintenances: Maintenance[];
  incidents: Incident[];
  /**
   * True when `requests` is the complete Request register (not a truncated
   * page). Only then can an Incident's Request link be judged against the
   * Supabase Requests: a legacy Sheet Incident whose sourceRequestId names a
   * frozen-era REQ-* that does not exist here is a standalone root, not a
   * child of a Request.
   */
  requestsComplete?: boolean;
}): UnifiedIssueListItem[] {
  const items: UnifiedIssueListItem[] = [];

  const linkedIncidentIds = new Set(
    input.requests.flatMap((request) =>
      (request.incidentIds ?? []).map((id) => id.toLowerCase())
    )
  );
  const isRequestLinkedIncident = (incident: Incident): boolean =>
    input.requestsComplete
      ? linkedIncidentIds.has(incident.id.toLowerCase())
      : !isStandaloneRoot(incident.sourceRequestId);

  for (const request of input.requests) {
    const issue = composeIssueFromRequest({
      request: {
        id: request.id,
        title: request.title,
        description: request.description,
        facilityId: request.facilityId,
        locationDetail: request.locationDetail,
        reporterName: request.reporterName,
        reporterContact: request.reporterContact,
        reportedByUserId: request.reportedByUserId,
        status: request.status,
        requestType: request.requestType,
        maintenanceIds: request.maintenanceIds ?? [],
        incidentIds: request.incidentIds ?? [],
        workOrderIds: request.workOrderIds ?? [],
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      },
    });
    items.push({ issue, view: buildIssueOperationalView(issue) });
  }

  for (const maintenance of input.maintenances) {
    if (!isStandaloneRoot(maintenance.sourceRequestId)) continue;
    const issue = composeIssueFromMaintenance({
      maintenance: {
        id: maintenance.id,
        title: maintenance.title,
        description: maintenance.description,
        facilityId: maintenance.facilityId,
        status: maintenance.status,
        priority: maintenance.priority,
        assetId: maintenance.assetId,
        completedAt: maintenance.completedAt,
        completionNotes: maintenance.completionNotes,
        workOrderId: maintenance.workOrderId,
        workOrderIds: maintenance.workOrderIds,
        sourceRequestId: maintenance.sourceRequestId,
        incidentId: maintenance.incidentId,
        createdAt: maintenance.createdAt,
        updatedAt: maintenance.updatedAt,
        createdByUserId: maintenance.createdByUserId,
      },
    });
    items.push({ issue, view: buildIssueOperationalView(issue) });
  }

  for (const incident of input.incidents) {
    if (isRequestLinkedIncident(incident)) continue;
    const issue = composeIssueFromIncident({
      incident: {
        id: incident.id,
        title: incident.title,
        description: incident.description,
        facilityId: incident.facilityId,
        locationDetail: incident.locationDetail,
        status: incident.status,
        type: incident.type,
        severity: incident.severity,
        assetId: incident.assetId,
        resolvedAt: incident.resolvedAt,
        resolutionNotes: incident.resolutionNotes,
        workOrderId: incident.workOrderId,
        workOrderIds: incident.workOrderIds,
        maintenanceIds: incident.maintenanceIds,
        // A standalone root has no parent Request (drop any stale legacy ref).
        sourceRequestId: input.requestsComplete
          ? undefined
          : incident.sourceRequestId,
        createdAt: incident.createdAt,
        updatedAt: incident.updatedAt,
        reportedByUserId: incident.reportedByUserId,
      },
    });
    items.push({ issue, view: buildIssueOperationalView(issue) });
  }

  items.sort(
    (a, b) =>
      Date.parse(b.issue.updatedAt) - Date.parse(a.issue.updatedAt) ||
      a.issue.id.localeCompare(b.issue.id)
  );

  return items;
}

export function originLabel(issue: Issue): string {
  if (issue.source === "staff_request") return "Staff request";
  if (issue.source === "facility_manager" || issue.rootMaintenanceId || issue.rootIncidentId) {
    return "FM logged";
  }
  return issue.source;
}
