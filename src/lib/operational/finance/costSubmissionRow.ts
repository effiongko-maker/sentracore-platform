/**
 * CostSubmission persistence row mapping.
 * Keeps spreadsheet representation separate from domain types.
 */

import { formatIdList, parseIdList } from "@/lib/operational/idLists";
import type {
  CostSubmission,
  CostSubmissionLifecycleStatus,
  CostSubmissionPackage,
  FinancialOperationalRefs,
  MarkupRepresentation,
} from "./types";
import { getSubmissionCostRecordIds } from "./costSubmission";

/** Human-readable sheet headers for COST_SUBMISSIONS (34 columns). */
export const COST_SUBMISSION_SHEET_HEADERS = [
  "Submission ID",
  "Status",
  "Currency",
  "Cost Record IDs",
  "Claim Amount",
  "Markup Amount",
  "Markup Rate Percent",
  "No Markup",
  "Facility ID",
  "Department ID",
  "Period Label",
  "Submission Kind",
  "Package Reference",
  "Package Type",
  "Package Date",
  "Package Notes",
  "Ref Issue ID",
  "Ref Request ID",
  "Ref Maintenance ID",
  "Ref Incident ID",
  "Ref Work Order ID",
  "Ref Job Order ID",
  "Ref Facility ID",
  "Ref Contract ID",
  "Execution Kind",
  "Execution ID",
  "Approval ID",
  "Created At",
  "Created By",
  "Submitted At",
  "Submitted By",
  "Queried At",
  "Query Notes",
  "Notes",
] as const;

export type CostSubmissionSheetHeader =
  (typeof COST_SUBMISSION_SHEET_HEADERS)[number];

/** Persistence row keyed by sheet headers. */
export type CostSubmissionRow = Record<
  CostSubmissionSheetHeader,
  string | number
>;

/** Remote/canonical object from Apps Script (camelCase + optional sheet aliases). */
export type RemoteCostSubmission = Record<string, unknown>;

/** Headers that must never appear on COST_SUBMISSIONS. */
export const FORBIDDEN_COST_SUBMISSION_SHEET_HEADERS = [
  "Approved Amount",
  "Received Amount",
  "Paid Amount",
  "Payment Status",
  "Approval Status",
  "Authority Roles",
  "Actual Amount",
  "Budgeted Amount",
  "Estimated Amount",
  "Evidence Reference",
  "Submitted Amount",
  "Payment ID",
  "Cost Description",
  "Cost Category",
  "Reimbursability",
  "Reimbursement Status",
] as const;

function pickField(raw: RemoteCostSubmission, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalString(
  raw: RemoteCostSubmission,
  ...keys: string[]
): string | undefined {
  const value = pickField(raw, ...keys);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function parseAmount(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
}

function parseBooleanFlag(value: unknown): boolean | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value).trim().toLowerCase();
  if (text === "true" || text === "yes" || text === "1") return true;
  if (text === "false" || text === "no" || text === "0") return false;
  return undefined;
}

function mapMarkup(raw: RemoteCostSubmission): MarkupRepresentation | undefined {
  const nested =
    raw.markup && typeof raw.markup === "object"
      ? (raw.markup as Record<string, unknown>)
      : null;
  const markupAmount = parseAmount(
    nested?.markupAmount ?? pickField(raw, "markupAmount", "Markup Amount")
  );
  const markupRatePercent = parseAmount(
    nested?.markupRatePercent ??
      pickField(raw, "markupRatePercent", "Markup Rate Percent")
  );
  const noMarkupRaw =
    nested?.noMarkup ?? pickField(raw, "noMarkup", "No Markup");
  const noMarkup = parseBooleanFlag(noMarkupRaw);
  if (
    markupAmount == null &&
    markupRatePercent == null &&
    noMarkup == null
  ) {
    return undefined;
  }
  return {
    markupAmount,
    markupRatePercent,
    noMarkup,
  };
}

function mapSubmissionPackage(
  raw: RemoteCostSubmission
): CostSubmissionPackage | undefined {
  const nested =
    raw.submissionPackage && typeof raw.submissionPackage === "object"
      ? (raw.submissionPackage as Record<string, unknown>)
      : null;
  const reference = optionalString(
    nested ?? raw,
    "reference",
    "Package Reference"
  );
  const packageType = optionalString(
    nested ?? raw,
    "packageType",
    "Package Type"
  );
  const packageDate = optionalString(
    nested ?? raw,
    "packageDate",
    "Package Date"
  );
  const notes = optionalString(nested ?? raw, "notes", "Package Notes");
  if (!reference && !packageType && !packageDate && !notes) {
    return undefined;
  }
  return { reference, packageType, packageDate, notes };
}

function mapRefs(raw: RemoteCostSubmission): FinancialOperationalRefs | undefined {
  const nested =
    raw.refs && typeof raw.refs === "object"
      ? (raw.refs as Record<string, unknown>)
      : null;
  const refs: FinancialOperationalRefs = {
    issueId: optionalString(nested ?? raw, "issueId", "Ref Issue ID"),
    requestId: optionalString(nested ?? raw, "requestId", "Ref Request ID"),
    maintenanceId: optionalString(
      nested ?? raw,
      "maintenanceId",
      "Ref Maintenance ID"
    ),
    incidentId: optionalString(nested ?? raw, "incidentId", "Ref Incident ID"),
    workOrderId: optionalString(
      nested ?? raw,
      "workOrderId",
      "Ref Work Order ID"
    ),
    jobOrderId: optionalString(nested ?? raw, "jobOrderId", "Ref Job Order ID"),
    facilityId: optionalString(nested ?? raw, "facilityId", "Ref Facility ID"),
    contractId: optionalString(nested ?? raw, "contractId", "Ref Contract ID"),
  };
  const hasAny = Object.values(refs).some(Boolean);
  return hasAny ? refs : undefined;
}

function readRemoteCostRecordIds(raw: RemoteCostSubmission): string[] {
  const direct = raw.costRecordIds;
  if (Array.isArray(direct)) {
    return direct.map((id) => String(id).trim()).filter(Boolean);
  }
  const fromColumn = parseIdList(
    pickField(raw, "costRecordIds", "Cost Record IDs", "costRecordId")
  );
  if (fromColumn.length > 0) return fromColumn;
  const legacy = optionalString(raw, "costRecordId");
  return legacy ? [legacy] : [];
}

/** Deserialize Apps Script / sheet payload into domain CostSubmission. */
export function mapRemoteCostSubmission(
  raw: RemoteCostSubmission
): CostSubmission {
  const submissionId = String(
    pickField(raw, "submissionId", "Submission ID", "id") ?? ""
  );
  const status = String(
    pickField(raw, "status", "Status") ?? "draft"
  ) as CostSubmissionLifecycleStatus;

  return {
    submissionId,
    costRecordIds: readRemoteCostRecordIds(raw),
    status,
    currency: String(pickField(raw, "currency", "Currency") ?? "NGN"),
    claimAmount: parseAmount(pickField(raw, "claimAmount", "Claim Amount")),
    markup: mapMarkup(raw),
    facilityId: optionalString(raw, "facilityId", "Facility ID"),
    departmentId: optionalString(raw, "departmentId", "Department ID"),
    periodLabel: optionalString(raw, "periodLabel", "Period Label"),
    submissionKind: optionalString(raw, "submissionKind", "Submission Kind"),
    submissionPackage: mapSubmissionPackage(raw),
    refs: mapRefs(raw),
    executionKind: optionalString(
      raw,
      "executionKind",
      "Execution Kind"
    ) as CostSubmission["executionKind"],
    executionId: optionalString(raw, "executionId", "Execution ID"),
    approvalId: optionalString(raw, "approvalId", "Approval ID"),
    createdAt: String(
      pickField(raw, "createdAt", "Created At") ?? new Date().toISOString()
    ),
    createdBy: String(pickField(raw, "createdBy", "Created By") ?? ""),
    submittedAt: optionalString(raw, "submittedAt", "Submitted At"),
    submittedBy: optionalString(raw, "submittedBy", "Submitted By"),
    queriedAt: optionalString(raw, "queriedAt", "Queried At"),
    queryNotes: optionalString(raw, "queryNotes", "Query Notes"),
    notes: optionalString(raw, "notes", "Notes"),
  };
}

/** Serialize domain CostSubmission to Apps Script create/update payload. */
export function costSubmissionToRemotePayload(
  submission: Partial<CostSubmission>
): RemoteCostSubmission {
  const payload: RemoteCostSubmission = { ...submission };
  if (submission.costRecordIds) {
    payload.costRecordIds = [...submission.costRecordIds];
  }
  if (submission.submissionPackage) {
    payload.submissionPackage = { ...submission.submissionPackage };
  }
  if (submission.markup) {
    payload.markup = { ...submission.markup };
  }
  if (submission.refs) {
    payload.refs = { ...submission.refs };
  }
  return payload;
}

/** Map domain submission to sheet-header keyed row. */
export function costSubmissionToRow(
  submission: CostSubmission
): CostSubmissionRow {
  const costRecordIds = getSubmissionCostRecordIds(submission);
  const pkg = submission.submissionPackage;
  const markup = submission.markup;
  const refs = submission.refs;

  return {
    "Submission ID": submission.submissionId,
    Status: submission.status,
    Currency: submission.currency,
    "Cost Record IDs": formatIdList(costRecordIds),
    "Claim Amount": submission.claimAmount ?? "",
    "Markup Amount": markup?.markupAmount ?? "",
    "Markup Rate Percent": markup?.markupRatePercent ?? "",
    "No Markup":
      markup?.noMarkup === true
        ? "true"
        : markup?.noMarkup === false
          ? "false"
          : "",
    "Facility ID": submission.facilityId ?? "",
    "Department ID": submission.departmentId ?? "",
    "Period Label": submission.periodLabel ?? "",
    "Submission Kind": submission.submissionKind ?? "",
    "Package Reference": pkg?.reference ?? "",
    "Package Type": pkg?.packageType ?? "",
    "Package Date": pkg?.packageDate ?? "",
    "Package Notes": pkg?.notes ?? "",
    "Ref Issue ID": refs?.issueId ?? "",
    "Ref Request ID": refs?.requestId ?? "",
    "Ref Maintenance ID": refs?.maintenanceId ?? "",
    "Ref Incident ID": refs?.incidentId ?? "",
    "Ref Work Order ID": refs?.workOrderId ?? "",
    "Ref Job Order ID": refs?.jobOrderId ?? "",
    "Ref Facility ID": refs?.facilityId ?? "",
    "Ref Contract ID": refs?.contractId ?? "",
    "Execution Kind": submission.executionKind ?? "",
    "Execution ID": submission.executionId ?? "",
    "Approval ID": submission.approvalId ?? "",
    "Created At": submission.createdAt,
    "Created By": submission.createdBy,
    "Submitted At": submission.submittedAt ?? "",
    "Submitted By": submission.submittedBy ?? "",
    "Queried At": submission.queriedAt ?? "",
    "Query Notes": submission.queryNotes ?? "",
    Notes: submission.notes ?? "",
  };
}

/** Deserialize sheet-header keyed row into domain CostSubmission. */
export function rowToCostSubmission(
  row: Partial<CostSubmissionRow>
): CostSubmission {
  return mapRemoteCostSubmission({
    submissionId: row["Submission ID"],
    status: row["Status"],
    currency: row["Currency"],
    costRecordIds: row["Cost Record IDs"],
    claimAmount: row["Claim Amount"],
    markupAmount: row["Markup Amount"],
    markupRatePercent: row["Markup Rate Percent"],
    noMarkup: row["No Markup"],
    facilityId: row["Facility ID"],
    departmentId: row["Department ID"],
    periodLabel: row["Period Label"],
    submissionKind: row["Submission Kind"],
    submissionPackage: {
      reference: row["Package Reference"],
      packageType: row["Package Type"],
      packageDate: row["Package Date"],
      notes: row["Package Notes"],
    },
    refs: {
      issueId: row["Ref Issue ID"],
      requestId: row["Ref Request ID"],
      maintenanceId: row["Ref Maintenance ID"],
      incidentId: row["Ref Incident ID"],
      workOrderId: row["Ref Work Order ID"],
      jobOrderId: row["Ref Job Order ID"],
      facilityId: row["Ref Facility ID"],
      contractId: row["Ref Contract ID"],
    },
    executionKind: row["Execution Kind"],
    executionId: row["Execution ID"],
    approvalId: row["Approval ID"],
    createdAt: row["Created At"],
    createdBy: row["Created By"],
    submittedAt: row["Submitted At"],
    submittedBy: row["Submitted By"],
    queriedAt: row["Queried At"],
    queryNotes: row["Query Notes"],
    notes: row["Notes"],
  });
}
