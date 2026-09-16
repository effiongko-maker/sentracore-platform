/**
 * Finance Payable document file validation + storage path helpers (Slice 4).
 * Reuses Financial Request validation rules; Payable-owned bucket and paths.
 */

import { randomUUID } from "node:crypto";
import {
  FINANCE_PAYABLE_DOCUMENT_ROLES,
  type FinancePayableDocumentRole,
} from "@/modules/platform-finance/domain/payables";
import {
  FINANCE_REQUEST_DOCUMENT_MAX_BYTES,
  FINANCE_REQUEST_DOCUMENT_SIGNED_URL_SECONDS,
  sanitizeFinanceRequestDocumentFilename,
  validateFinanceRequestDocumentFile,
  type ValidatedFinanceRequestDocumentFile,
} from "@/modules/platform-finance/server/requestDocumentStorage";

export const FINANCE_PAYABLE_DOCUMENTS_BUCKET = "finance-payable-documents";

/** Same 10 MiB limit as Financial Request documents / bucket file_size_limit. */
export const FINANCE_PAYABLE_DOCUMENT_MAX_BYTES =
  FINANCE_REQUEST_DOCUMENT_MAX_BYTES;

/** Short-lived signed URL TTL (same pattern as request documents). */
export const FINANCE_PAYABLE_DOCUMENT_SIGNED_URL_SECONDS =
  FINANCE_REQUEST_DOCUMENT_SIGNED_URL_SECONDS;

export type ValidatedFinancePayableDocumentFile =
  ValidatedFinanceRequestDocumentFile;

export function sanitizeFinancePayableDocumentFilename(raw: string): string {
  return sanitizeFinanceRequestDocumentFilename(raw);
}

export function isFinancePayableDocumentRole(
  value: unknown
): value is FinancePayableDocumentRole {
  return (
    typeof value === "string" &&
    (FINANCE_PAYABLE_DOCUMENT_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Server-side file validation — reuses Request document rules (extension,
 * MIME, size, magic bytes). Does not trust client MIME alone.
 */
export function validateFinancePayableDocumentFile(input: {
  filename: string;
  declaredMimeType?: string | null;
  bytes: Buffer;
}): ValidatedFinancePayableDocumentFile {
  return validateFinanceRequestDocumentFile(input);
}

/**
 * Deterministic scoped path — client must never supply this.
 * <organisation>/<company>/<payable>/<document-id>/<filename>
 */
export function buildFinancePayableDocumentStoragePath(input: {
  organisationId: string;
  companyId: string;
  payableId: string;
  documentId: string;
  filename: string;
}): string {
  const filename = sanitizeFinancePayableDocumentFilename(input.filename);
  return [
    input.organisationId,
    input.companyId,
    input.payableId,
    input.documentId,
    filename,
  ].join("/");
}

export function newFinancePayableDocumentId(): string {
  return randomUUID();
}
