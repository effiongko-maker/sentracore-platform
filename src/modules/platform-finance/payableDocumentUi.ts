/**
 * Client-safe Payable document presentation helpers.
 * Roles match the domain; labels reuse the shared FR presentation vocabulary.
 */
export {
  FINANCE_REQUEST_DOCUMENT_ACCEPT as FINANCE_PAYABLE_DOCUMENT_ACCEPT,
  FINANCE_REQUEST_DOCUMENT_MAX_BYTES_UI as FINANCE_PAYABLE_DOCUMENT_MAX_BYTES_UI,
  FINANCE_REQUEST_DOCUMENT_ROLE_LABELS as FINANCE_PAYABLE_DOCUMENT_ROLE_LABELS,
  extensionOfFilename,
  formatFileSize,
  formatUploadedAt,
  mimeTypeLabel,
  prevalidateFinanceRequestDocumentFile as prevalidateFinancePayableDocumentFile,
} from "@/modules/platform-finance/requestDocumentUi";
