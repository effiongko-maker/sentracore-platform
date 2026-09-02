/**
 * CostRecord persistence row mapping.
 * Keeps spreadsheet representation separate from domain types.
 */

import type { CostCategory, CostEvidence, CostRecord } from "./types";

/** Human-readable sheet headers for COST_RECORDS (21 columns). */
export const COST_RECORD_SHEET_HEADERS = [
  "Cost ID",
  "Recorded At",
  "Facility ID",
  "Department ID",
  "Location",
  "Work ID",
  "Work Order ID",
  "Job Order ID",
  "Description",
  "Category",
  "Budgeted Amount",
  "Actual Amount",
  "Currency",
  "Reimbursability",
  "Evidence Reference",
  "Evidence File ID",
  "Evidence File Name",
  "Evidence MIME Type",
  "Evidence File Size",
  "Evidence File URL",
  "Recorded By",
] as const;

/** @deprecated Legacy sheet header — read-only fallback during migration. */
export const LEGACY_COST_RECORD_ESTIMATED_AMOUNT_HEADER = "Estimated Amount";

export type CostRecordSheetHeader = (typeof COST_RECORD_SHEET_HEADERS)[number];

/** Persistence row keyed by sheet headers (for tests / documentation). */
export type CostRecordRow = Record<CostRecordSheetHeader, string | number>;

/** Remote/canonical object from Apps Script (camelCase + optional sheet aliases). */
export type RemoteCostRecord = Record<string, unknown>;

function pickField(raw: RemoteCostRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalString(raw: RemoteCostRecord, ...keys: string[]): string | undefined {
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

function mapEvidence(raw: RemoteCostRecord): CostEvidence {
  const nested =
    raw.evidence && typeof raw.evidence === "object"
      ? (raw.evidence as Record<string, unknown>)
      : null;
  const reference = String(
    nested?.reference ??
      pickField(raw, "evidenceReference", "Evidence Reference") ??
      ""
  ).trim();
  return {
    reference,
    fileId:
      (nested?.fileId != null ? String(nested.fileId).trim() : undefined) ??
      optionalString(raw, "evidenceFileId", "Evidence File ID"),
    fileName:
      (nested?.fileName != null ? String(nested.fileName).trim() : undefined) ??
      optionalString(raw, "evidenceFileName", "Evidence File Name"),
    mimeType:
      (nested?.mimeType != null ? String(nested.mimeType).trim() : undefined) ??
      optionalString(raw, "evidenceMimeType", "Evidence MIME Type"),
    sizeBytes: parseAmount(
      nested?.sizeBytes ??
        pickField(raw, "evidenceSizeBytes", "Evidence File Size")
    ),
    fileUrl:
      (nested?.fileUrl != null ? String(nested.fileUrl).trim() : undefined) ??
      optionalString(raw, "evidenceFileUrl", "Evidence File URL"),
  };
}

/**
 * Read budgeted amount from remote payload.
 * Falls back to legacy estimatedAmount / Estimated Amount at persistence boundary only.
 */
export function readRemoteBudgetedAmount(raw: RemoteCostRecord): number | undefined {
  const budgeted = parseAmount(
    pickField(raw, "budgetedAmount", "Budgeted Amount")
  );
  if (budgeted != null) return budgeted;
  return parseAmount(
    pickField(raw, "estimatedAmount", LEGACY_COST_RECORD_ESTIMATED_AMOUNT_HEADER)
  );
}

/** Deserialize Apps Script / sheet payload into domain CostRecord. */
export function mapRemoteCostRecord(raw: RemoteCostRecord): CostRecord {
  const recordedAt = String(
    pickField(raw, "recordedAt", "Recorded At") ?? new Date().toISOString()
  );
  const actualAmount = parseAmount(pickField(raw, "actualAmount", "Actual Amount"));
  if (actualAmount == null || actualAmount < 0) {
    throw new Error("Invalid actualAmount in remote CostRecord");
  }

  return {
    costId: String(pickField(raw, "costId", "Cost ID", "id") ?? ""),
    recordedAt,
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    location: String(pickField(raw, "location", "Location") ?? ""),
    departmentId: optionalString(raw, "departmentId", "Department ID"),
    workId: optionalString(raw, "workId", "Work ID"),
    workOrderId: optionalString(raw, "workOrderId", "Work Order ID"),
    jobOrderId: optionalString(raw, "jobOrderId", "Job Order ID"),
    description: String(pickField(raw, "description", "Description") ?? ""),
    category: String(
      pickField(raw, "category", "Category") ?? "other"
    ) as CostCategory,
    budgetedAmount: readRemoteBudgetedAmount(raw),
    actualAmount,
    currency: String(pickField(raw, "currency", "Currency") ?? "NGN"),
    reimbursability: String(
      pickField(raw, "reimbursability", "Reimbursability") ?? "unknown"
    ) as CostRecord["reimbursability"],
    evidence: mapEvidence(raw),
    recordedBy: String(pickField(raw, "recordedBy", "Recorded By") ?? ""),
  };
}

/** Serialize domain CostRecord to Apps Script create/update payload. */
export function costRecordToRemotePayload(
  record: Partial<CostRecord>
): RemoteCostRecord {
  const payload: RemoteCostRecord = { ...record };
  if (record.evidence) {
    payload.evidence = { ...record.evidence };
  }
  return payload;
}

/** Map domain record to sheet-header keyed row (for tests / documentation). */
export function costRecordToRow(record: CostRecord): CostRecordRow {
  return {
    "Cost ID": record.costId,
    "Recorded At": record.recordedAt,
    "Facility ID": record.facilityId,
    "Department ID": record.departmentId ?? "",
    Location: record.location,
    "Work ID": record.workId ?? "",
    "Work Order ID": record.workOrderId ?? "",
    "Job Order ID": record.jobOrderId ?? "",
    Description: record.description,
    Category: record.category,
    "Budgeted Amount": record.budgetedAmount ?? "",
    "Actual Amount": record.actualAmount,
    Currency: record.currency,
    Reimbursability: record.reimbursability,
    "Evidence Reference": record.evidence.reference,
    "Evidence File ID": record.evidence.fileId ?? "",
    "Evidence File Name": record.evidence.fileName ?? "",
    "Evidence MIME Type": record.evidence.mimeType ?? "",
    "Evidence File Size": record.evidence.sizeBytes ?? "",
    "Evidence File URL": record.evidence.fileUrl ?? "",
    "Recorded By": record.recordedBy,
  };
}

/** Deserialize sheet-header keyed row into domain CostRecord. */
export function rowToCostRecord(row: Partial<CostRecordRow>): CostRecord {
  return mapRemoteCostRecord({
    costId: row["Cost ID"],
    recordedAt: row["Recorded At"],
    facilityId: row["Facility ID"],
    departmentId: row["Department ID"],
    location: row["Location"],
    workId: row["Work ID"],
    workOrderId: row["Work Order ID"],
    jobOrderId: row["Job Order ID"],
    description: row["Description"],
    category: row["Category"],
    budgetedAmount: row["Budgeted Amount"],
    actualAmount: row["Actual Amount"],
    currency: row["Currency"],
    reimbursability: row["Reimbursability"],
    evidenceReference: row["Evidence Reference"],
    evidenceFileId: row["Evidence File ID"],
    evidenceFileName: row["Evidence File Name"],
    evidenceMimeType: row["Evidence MIME Type"],
    evidenceSizeBytes: row["Evidence File Size"],
    evidenceFileUrl: row["Evidence File URL"],
    recordedBy: row["Recorded By"],
  });
}

/** Deserialize legacy row with Estimated Amount into domain CostRecord. */
export function legacyRowToCostRecord(
  row: Partial<CostRecordRow> & Record<string, string | number | undefined>
): CostRecord {
  return mapRemoteCostRecord({
    costId: row["Cost ID"],
    recordedAt: row["Recorded At"],
    facilityId: row["Facility ID"],
    departmentId: row["Department ID"],
    location: row["Location"],
    workId: row["Work ID"],
    workOrderId: row["Work Order ID"],
    jobOrderId: row["Job Order ID"],
    description: row["Description"],
    category: row["Category"],
    estimatedAmount: row[LEGACY_COST_RECORD_ESTIMATED_AMOUNT_HEADER],
    actualAmount: row["Actual Amount"],
    currency: row["Currency"],
    reimbursability: row["Reimbursability"],
    evidenceReference: row["Evidence Reference"],
    recordedBy: row["Recorded By"],
  });
}

/** Headers that must never appear on COST_RECORDS. */
export const FORBIDDEN_COST_RECORD_SHEET_HEADERS = [
  "Submission ID",
  "Approval ID",
  "Payment ID",
  "Markup",
  "Claim Amount",
  "Approved Amount",
  "Paid Amount",
  "Submission Status",
  "Approval Status",
  "Payment Status",
  "Cost Status",
  "Markup Amount",
  "Markup Percentage",
  "Reimbursable Amount",
] as const;
