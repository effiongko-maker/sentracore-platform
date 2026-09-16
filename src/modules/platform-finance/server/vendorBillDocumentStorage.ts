/**
 * Vendor Bill document file validation + storage path helpers.
 * Reuses Financial Request validation rules; Vendor Bill-owned bucket and paths.
 */

import { randomUUID } from "node:crypto";
import {
  FINANCE_VENDOR_BILL_DOCUMENT_ROLES,
  type FinanceVendorBillDocumentRole,
} from "@/modules/platform-finance/domain/vendorBills";
import {
  FINANCE_REQUEST_DOCUMENT_MAX_BYTES,
  FINANCE_REQUEST_DOCUMENT_SIGNED_URL_SECONDS,
  sanitizeFinanceRequestDocumentFilename,
  validateFinanceRequestDocumentFile,
  type ValidatedFinanceRequestDocumentFile,
} from "@/modules/platform-finance/server/requestDocumentStorage";

export const FINANCE_VENDOR_BILL_DOCUMENTS_BUCKET =
  "finance-vendor-bill-documents";

/** Same 10 MiB limit as the other Finance document buckets. */
export const FINANCE_VENDOR_BILL_DOCUMENT_MAX_BYTES =
  FINANCE_REQUEST_DOCUMENT_MAX_BYTES;

/** Short-lived signed URL TTL (same pattern as request/payable documents). */
export const FINANCE_VENDOR_BILL_DOCUMENT_SIGNED_URL_SECONDS =
  FINANCE_REQUEST_DOCUMENT_SIGNED_URL_SECONDS;

export type ValidatedFinanceVendorBillDocumentFile =
  ValidatedFinanceRequestDocumentFile;

export function sanitizeFinanceVendorBillDocumentFilename(raw: string): string {
  return sanitizeFinanceRequestDocumentFilename(raw);
}

export function isFinanceVendorBillDocumentRole(
  value: unknown
): value is FinanceVendorBillDocumentRole {
  return (
    typeof value === "string" &&
    (FINANCE_VENDOR_BILL_DOCUMENT_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Server-side file validation — reuses Request document rules (extension,
 * MIME, size, magic bytes). Does not trust client MIME alone.
 */
export function validateFinanceVendorBillDocumentFile(input: {
  filename: string;
  declaredMimeType?: string | null;
  bytes: Buffer;
}): ValidatedFinanceVendorBillDocumentFile {
  return validateFinanceRequestDocumentFile(input);
}

/**
 * Deterministic scoped path — client must never supply this.
 * <organisation>/<company>/<vendor-bill>/<document-id>/<filename>
 */
export function buildFinanceVendorBillDocumentStoragePath(input: {
  organisationId: string;
  companyId: string;
  vendorBillId: string;
  documentId: string;
  filename: string;
}): string {
  const filename = sanitizeFinanceVendorBillDocumentFilename(input.filename);
  return [
    input.organisationId,
    input.companyId,
    input.vendorBillId,
    input.documentId,
    filename,
  ].join("/");
}

export function newFinanceVendorBillDocumentId(): string {
  return randomUUID();
}
