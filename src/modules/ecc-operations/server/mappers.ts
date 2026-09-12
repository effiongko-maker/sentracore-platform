import type {
  EccCallOperationsSection,
  EccCentre,
  EccCentreOperationsSection,
  EccCentreOverallStatus,
  EccDailyOpsPeriod,
  EccDailyOpsRecord,
  EccDailyOpsSectionKey,
  EccFacilitySection,
  EccIssue,
  EccIssueHistoryEntry,
  EccIssueHistoryKind,
  EccIssueStatus,
  EccRequest,
  EccRequestHistoryEntry,
  EccRequestHistoryKind,
  EccRequestStatus,
  EccTechnicalSection,
} from "@/modules/ecc-operations/types";
import { DEFAULT_ECC_CENTRE } from "@/modules/ecc-operations/types";

export type EccCentreRow = {
  organisation_id: string;
  id: string;
  name: string;
  facility_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EccDailyOpsRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  period: string;
  reporting_date: string;
  recorded_at: string;
  recorded_by_name: string;
  overall_status: string;
  centre_operations: EccCentreOperationsSection;
  call_operations: EccCallOperationsSection;
  facility: EccFacilitySection;
  technical: EccTechnicalSection;
  created_at: string;
};

export type EccIssueRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  occurred_at: string;
  classification: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  reporter_name: string;
  current_owner_name: string | null;
  resolution_notes: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  related_ecc_request_id: string | null;
  source_daily_ops_id: string | null;
  source_daily_ops_section: string | null;
  facility_id: string | null;
  asset_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EccIssueHistoryRow = {
  organisation_id: string;
  id: string;
  issue_id: string;
  at: string;
  by_name: string;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

export type EccRequestRow = {
  organisation_id: string;
  id: string;
  centre_id: string;
  title: string;
  reason: string;
  description: string;
  origin: string;
  responsibility: string;
  priority: string;
  status: string;
  requesting_manager_name: string;
  current_owner_name: string | null;
  evidence_notes: string | null;
  resolution_notes: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  related_ecc_issue_id: string | null;
  source_daily_ops_id: string | null;
  source_daily_ops_section: string | null;
  facility_id: string | null;
  asset_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EccRequestHistoryRow = {
  organisation_id: string;
  id: string;
  request_id: string;
  at: string;
  by_name: string;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

export function centreToDto(row: EccCentreRow): EccCentre {
  return {
    id: row.id,
    name: row.name,
    facilityId: row.facility_id ?? undefined,
  };
}

export function centreToRow(
  organisationId: string,
  centre: EccCentre
): Omit<EccCentreRow, "created_at" | "updated_at"> & {
  created_at?: string;
  updated_at?: string;
} {
  return {
    organisation_id: organisationId,
    id: centre.id,
    name: centre.name,
    facility_id: centre.facilityId ?? null,
  };
}

export function dailyOpsToDto(
  row: EccDailyOpsRow,
  linkedIssueIds: string[],
  linkedRequestIds: string[]
): EccDailyOpsRecord {
  const reportingDate =
    typeof row.reporting_date === "string"
      ? row.reporting_date.slice(0, 10)
      : String(row.reporting_date).slice(0, 10);
  return {
    id: row.id,
    centreId: row.centre_id,
    period: row.period as EccDailyOpsPeriod,
    reportingDate,
    recordedAt: row.recorded_at,
    recordedByName: row.recorded_by_name,
    overallStatus: row.overall_status as EccCentreOverallStatus,
    centreOperations: row.centre_operations,
    callOperations: row.call_operations,
    facility: row.facility,
    technical: row.technical,
    linkedIssueIds,
    linkedRequestIds,
    createdAt: row.created_at,
  };
}

export function dailyOpsToRow(
  organisationId: string,
  record: EccDailyOpsRecord
): EccDailyOpsRow {
  return {
    organisation_id: organisationId,
    id: record.id,
    centre_id: record.centreId,
    period: record.period,
    reporting_date: record.reportingDate,
    recorded_at: record.recordedAt,
    recorded_by_name: record.recordedByName,
    overall_status: record.overallStatus,
    centre_operations: record.centreOperations,
    call_operations: record.callOperations,
    facility: record.facility,
    technical: record.technical,
    created_at: record.createdAt,
  };
}

export function issueHistoryToDto(row: EccIssueHistoryRow): EccIssueHistoryEntry {
  return {
    id: row.id,
    at: row.at,
    byName: row.by_name,
    kind: row.kind as EccIssueHistoryKind,
    fromStatus: (row.from_status as EccIssueStatus | null) ?? null,
    toStatus: (row.to_status as EccIssueStatus | null) ?? null,
    note: row.note ?? undefined,
  };
}

export function issueHistoryToRow(
  organisationId: string,
  issueId: string,
  entry: EccIssueHistoryEntry
): Omit<EccIssueHistoryRow, "created_at"> {
  return {
    organisation_id: organisationId,
    id: entry.id,
    issue_id: issueId,
    at: entry.at,
    by_name: entry.byName,
    kind: entry.kind,
    from_status: entry.fromStatus,
    to_status: entry.toStatus,
    note: entry.note ?? null,
  };
}

export function issueToDto(
  row: EccIssueRow,
  history: EccIssueHistoryEntry[]
): EccIssue {
  return {
    id: row.id,
    centreId: row.centre_id,
    occurredAt: row.occurred_at,
    classification: row.classification as EccIssue["classification"],
    severity: row.severity as EccIssue["severity"],
    title: row.title,
    description: row.description,
    status: row.status as EccIssueStatus,
    reporterName: row.reporter_name,
    currentOwnerName: row.current_owner_name ?? undefined,
    history,
    resolutionNotes: row.resolution_notes ?? undefined,
    closedAt: row.closed_at ?? undefined,
    closedByName: row.closed_by_name ?? undefined,
    relatedEccRequestId: row.related_ecc_request_id ?? undefined,
    sourceDailyOpsId: row.source_daily_ops_id ?? undefined,
    sourceDailyOpsSection: (row.source_daily_ops_section ?? undefined) as
      | EccDailyOpsSectionKey
      | undefined,
    facilityId: row.facility_id ?? undefined,
    assetId: row.asset_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function issueToRow(organisationId: string, issue: EccIssue): EccIssueRow {
  return {
    organisation_id: organisationId,
    id: issue.id,
    centre_id: issue.centreId,
    occurred_at: issue.occurredAt,
    classification: issue.classification,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    reporter_name: issue.reporterName,
    current_owner_name: issue.currentOwnerName ?? null,
    resolution_notes: issue.resolutionNotes ?? null,
    closed_at: issue.closedAt ?? null,
    closed_by_name: issue.closedByName ?? null,
    related_ecc_request_id: issue.relatedEccRequestId ?? null,
    source_daily_ops_id: issue.sourceDailyOpsId ?? null,
    source_daily_ops_section: issue.sourceDailyOpsSection ?? null,
    facility_id: issue.facilityId ?? null,
    asset_id: issue.assetId ?? null,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
  };
}

export function requestHistoryToDto(
  row: EccRequestHistoryRow
): EccRequestHistoryEntry {
  return {
    id: row.id,
    at: row.at,
    byName: row.by_name,
    kind: row.kind as EccRequestHistoryKind,
    fromStatus: (row.from_status as EccRequestStatus | null) ?? null,
    toStatus: (row.to_status as EccRequestStatus | null) ?? null,
    note: row.note ?? undefined,
  };
}

export function requestHistoryToRow(
  organisationId: string,
  requestId: string,
  entry: EccRequestHistoryEntry
): Omit<EccRequestHistoryRow, "created_at"> {
  return {
    organisation_id: organisationId,
    id: entry.id,
    request_id: requestId,
    at: entry.at,
    by_name: entry.byName,
    kind: entry.kind,
    from_status: entry.fromStatus,
    to_status: entry.toStatus,
    note: entry.note ?? null,
  };
}

export function requestToDto(
  row: EccRequestRow,
  history: EccRequestHistoryEntry[]
): EccRequest {
  return {
    id: row.id,
    centreId: row.centre_id,
    title: row.title,
    reason: row.reason,
    description: row.description,
    origin: row.origin as EccRequest["origin"],
    responsibility: row.responsibility as EccRequest["responsibility"],
    priority: row.priority as EccRequest["priority"],
    status: row.status as EccRequestStatus,
    requestingManagerName: row.requesting_manager_name,
    currentOwnerName: row.current_owner_name ?? undefined,
    history,
    evidenceNotes: row.evidence_notes ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    closedAt: row.closed_at ?? undefined,
    closedByName: row.closed_by_name ?? undefined,
    relatedEccIssueId: row.related_ecc_issue_id ?? undefined,
    sourceDailyOpsId: row.source_daily_ops_id ?? undefined,
    sourceDailyOpsSection: (row.source_daily_ops_section ?? undefined) as
      | EccDailyOpsSectionKey
      | undefined,
    facilityId: row.facility_id ?? undefined,
    assetId: row.asset_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function requestToRow(
  organisationId: string,
  request: EccRequest
): EccRequestRow {
  return {
    organisation_id: organisationId,
    id: request.id,
    centre_id: request.centreId,
    title: request.title,
    reason: request.reason,
    description: request.description,
    origin: request.origin,
    responsibility: request.responsibility,
    priority: request.priority,
    status: request.status,
    requesting_manager_name: request.requestingManagerName,
    current_owner_name: request.currentOwnerName ?? null,
    evidence_notes: request.evidenceNotes ?? null,
    resolution_notes: request.resolutionNotes ?? null,
    closed_at: request.closedAt ?? null,
    closed_by_name: request.closedByName ?? null,
    related_ecc_issue_id: request.relatedEccIssueId ?? null,
    source_daily_ops_id: request.sourceDailyOpsId ?? null,
    source_daily_ops_section: request.sourceDailyOpsSection ?? null,
    facility_id: request.facilityId ?? null,
    asset_id: request.assetId ?? null,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
  };
}

export function defaultCentreDto(): EccCentre {
  return { ...DEFAULT_ECC_CENTRE };
}
