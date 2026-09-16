/**
 * Finance Request document file validation + storage path helpers (Slice 4).
 * Presentation/UI classification (quotation/invoice) is not a domain role.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  FINANCIAL_REQUEST_DOCUMENT_ROLES,
  type FinancialRequestDocumentRole,
} from "@/modules/platform-finance/domain/requests";

export const FINANCE_REQUEST_DOCUMENTS_BUCKET = "finance-request-documents";

/** Matches UI reference and bucket file_size_limit (10 MiB). */
export const FINANCE_REQUEST_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Short-lived signed URL TTL for authorized downloads. */
export const FINANCE_REQUEST_DOCUMENT_SIGNED_URL_SECONDS = 60;

const MIME_TO_EXTENSIONS: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
};

const EXTENSION_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXTENSIONS).flatMap(([mime, exts]) =>
    exts.map((ext) => [ext, mime])
  )
);

export const FINANCE_REQUEST_DOCUMENT_ALLOWED_MIME_TYPES = Object.freeze(
  Object.keys(MIME_TO_EXTENSIONS)
);

export const FINANCE_REQUEST_DOCUMENT_ALLOWED_EXTENSIONS = Object.freeze(
  Object.keys(EXTENSION_TO_MIME)
);

export type ValidatedFinanceRequestDocumentFile = {
  filename: string;
  mimeType: string;
  byteSize: number;
  bytes: Buffer;
  checksum: string;
  extension: string;
};

function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

/** Strip path segments and unsafe characters; keep a readable basename. */
export function sanitizeFinanceRequestDocumentFilename(raw: string): string {
  const base = (raw.split(/[/\\]/).pop() ?? "document").trim() || "document";
  const cleaned = base
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return cleaned || "document";
}

export function isFinanceRequestDocumentRole(
  value: unknown
): value is FinancialRequestDocumentRole {
  return (
    typeof value === "string" &&
    (FINANCIAL_REQUEST_DOCUMENT_ROLES as readonly string[]).includes(value)
  );
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // ZIP-based Office Open XML (docx/xlsx) — PK
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "application/zip";
  }
  // Legacy OLE compound (doc/xls)
  if (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return "application/x-cfb";
  }
  return null;
}

/**
 * Server-side file validation. Does not trust client MIME alone.
 */
export function validateFinanceRequestDocumentFile(input: {
  filename: string;
  declaredMimeType?: string | null;
  bytes: Buffer;
}): ValidatedFinanceRequestDocumentFile {
  const bytes = input.bytes;
  if (!bytes || bytes.length === 0) {
    throw new Error("File is empty.");
  }
  if (bytes.length > FINANCE_REQUEST_DOCUMENT_MAX_BYTES) {
    throw new Error(
      `File exceeds the maximum size of ${FINANCE_REQUEST_DOCUMENT_MAX_BYTES} bytes.`
    );
  }

  const filename = sanitizeFinanceRequestDocumentFilename(input.filename);
  const extension = extensionOf(filename);
  if (!extension || !(extension in EXTENSION_TO_MIME)) {
    throw new Error("Unsupported file extension.");
  }

  const mimeFromExt = EXTENSION_TO_MIME[extension]!;
  const declared = (input.declaredMimeType ?? "").trim().toLowerCase();
  if (declared && declared !== mimeFromExt) {
    // Allow common JPEG aliases
    const jpegOk =
      mimeFromExt === "image/jpeg" &&
      (declared === "image/jpg" || declared === "image/pjpeg");
    if (!jpegOk) {
      throw new Error("File MIME type does not match the file extension.");
    }
  }

  const sniffed = sniffMime(bytes);
  if (sniffed === "application/pdf" || sniffed === "image/jpeg" || sniffed === "image/png") {
    if (sniffed !== mimeFromExt) {
      throw new Error("File contents do not match the declared file type.");
    }
  } else if (sniffed === "application/zip") {
    if (
      mimeFromExt !==
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      mimeFromExt !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      throw new Error("File contents do not match the declared file type.");
    }
  } else if (sniffed === "application/x-cfb") {
    if (
      mimeFromExt !== "application/msword" &&
      mimeFromExt !== "application/vnd.ms-excel"
    ) {
      throw new Error("File contents do not match the declared file type.");
    }
  }

  return {
    filename,
    mimeType: mimeFromExt,
    byteSize: bytes.length,
    bytes,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    extension,
  };
}

/**
 * Deterministic scoped path — client must never supply this.
 * <organisation>/<company>/<request>/<document-id>/<filename>
 */
export function buildFinanceRequestDocumentStoragePath(input: {
  organisationId: string;
  companyId: string;
  requestId: string;
  documentId: string;
  filename: string;
}): string {
  const filename = sanitizeFinanceRequestDocumentFilename(input.filename);
  return [
    input.organisationId,
    input.companyId,
    input.requestId,
    input.documentId,
    filename,
  ].join("/");
}

export function newFinanceRequestDocumentId(): string {
  return randomUUID();
}
