import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const RULES_VERSION = "fm-migration-rules/1";

/** Fixed namespace for deterministic (UUIDv5) imported identities. */
export const MIGRATION_NAMESPACE = "6f0f1b2e-3c4d-5e6f-8a9b-0c1d2e3f4a5b";

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** RFC 4122 UUIDv5 (SHA-1, name-based). */
export function uuidV5(name: string, namespace: string = MIGRATION_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Imported identity = f(immutable source workbook bytes, sheet, row, target). Independent of the
 * rules version, so refining rules never re-identifies a row; a changed workbook (new hash) does.
 */
export function importedId(workbookSha256: string, sheet: string, row: number, target: string): string {
  return uuidV5(`${workbookSha256}|${sheet}|${row}|${target}`);
}
