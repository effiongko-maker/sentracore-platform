import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordOrigin = "operational" | "migrated_historical";

const IN_CHUNK = 100;

/**
 * Which of these FM rows were imported by the historical migration?
 *
 * Tables that carry no `record_origin` column (assets, diesel usage, consumables items, requests …) are identified
 * through the append-only migration provenance ledger, the sole authority for "this row came from a spreadsheet".
 * Read-only. If the ledger cannot be read the result is EMPTY (rows read as operational) — a presentation hint is
 * never allowed to fail a read, and it never changes any stored fact.
 */
export async function migratedHistoricalIds(
  admin: SupabaseClient,
  organisationId: string,
  targetTable: string,
  ids: string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const { data, error } = await admin
      .from("fm_migration_provenance")
      .select("target_id")
      .eq("organisation_id", organisationId)
      .eq("target_table", targetTable)
      .in("target_id", unique.slice(i, i + IN_CHUNK));
    if (error) return new Set();
    for (const row of data ?? []) found.add(String((row as { target_id: string }).target_id));
  }
  return found;
}

export const originOf = (migrated: Set<string>, id: string): RecordOrigin =>
  migrated.has(id) ? "migrated_historical" : "operational";
