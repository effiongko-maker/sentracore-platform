/**
 * Client-safe Vendor Bill document presentation helpers.
 * Server validation remains authoritative (vendorBillDocumentStorage.ts).
 */

import type { FinanceVendorBillDocumentRole } from "@/modules/platform-finance/domain/vendorBills";
import {
  FINANCE_REQUEST_DOCUMENT_ACCEPT,
  FINANCE_REQUEST_DOCUMENT_MAX_BYTES_UI,
  FINANCE_REQUEST_DOCUMENT_ROLE_LABELS,
  formatFileSize,
  formatUploadedAt,
  mimeTypeLabel,
  prevalidateFinanceRequestDocumentFile,
} from "@/modules/platform-finance/requestDocumentUi";

export const FINANCE_VENDOR_BILL_DOCUMENT_MAX_BYTES_UI =
  FINANCE_REQUEST_DOCUMENT_MAX_BYTES_UI;

export const FINANCE_VENDOR_BILL_DOCUMENT_ACCEPT =
  FINANCE_REQUEST_DOCUMENT_ACCEPT;

export const FINANCE_VENDOR_BILL_DOCUMENT_ROLE_LABELS: Record<
  FinanceVendorBillDocumentRole,
  string
> = {
  supporting: FINANCE_REQUEST_DOCUMENT_ROLE_LABELS.supporting,
  clarification: FINANCE_REQUEST_DOCUMENT_ROLE_LABELS.clarification,
  other: FINANCE_REQUEST_DOCUMENT_ROLE_LABELS.other,
};

export {
  formatFileSize,
  formatUploadedAt,
  mimeTypeLabel,
};

export function prevalidateFinanceVendorBillDocumentFile(
  file: File
): string | null {
  return prevalidateFinanceRequestDocumentFile(file);
}
