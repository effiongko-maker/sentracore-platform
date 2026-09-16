/**
 * Client-safe Finance Request document presentation helpers.
 * Server validation remains authoritative (requestDocumentStorage.ts).
 */

import type { FinancialRequestDocumentRole } from "@/modules/platform-finance/domain/requests";

export const FINANCE_REQUEST_DOCUMENT_MAX_BYTES_UI = 10 * 1024 * 1024;

export const FINANCE_REQUEST_DOCUMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const FINANCE_REQUEST_DOCUMENT_ROLE_LABELS: Record<
  FinancialRequestDocumentRole,
  string
> = {
  supporting: "Supporting",
  clarification: "Clarification",
  other: "Other",
};

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);

export function extensionOfFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function mimeTypeLabel(mimeType: string, filename: string): string {
  const ext = extensionOfFilename(filename).replace(".", "").toUpperCase();
  if (ext) return ext;
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "image/jpeg") return "JPG";
  if (mimeType === "image/png") return "PNG";
  return mimeType.split("/").pop()?.toUpperCase() ?? "FILE";
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Client-side pre-check only; server remains authoritative. */
export function prevalidateFinanceRequestDocumentFile(file: File): string | null {
  if (!file || file.size === 0) return "File is empty.";
  if (file.size > FINANCE_REQUEST_DOCUMENT_MAX_BYTES_UI) {
    return "File exceeds the maximum size of 10 MB.";
  }
  const ext = extensionOfFilename(file.name);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return "Unsupported file type. Use PDF, JPG, PNG, DOC, DOCX, XLS, or XLSX.";
  }
  return null;
}
