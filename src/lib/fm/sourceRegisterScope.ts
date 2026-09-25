/**
 * FM source-register scope — what an imported record IS and which operating period it belongs to, established ONLY
 * by governed migration provenance (fm_migration_provenance: workbook + source_sheet). Nothing here reads a date or
 * an amount to guess; nothing here deletes or rewrites data. It only lets active FM surfaces choose what they present.
 *
 *   Order-register costs  The Cost column records expenditure executing the works/jobs/projects.
 *                         These rows remain costs; provenance identifies a subset, not another monetary total.
 *   2025 history          Records imported from the 2025 registers are historical. They are preserved and remain
 *                         reachable, but are excluded from the current operating picture by default.
 *
 * Pure constants + one read helper (the admin client is passed in), so verifiers can import it.
 */

export const FM_SOURCE_REGISTER_WORKBOOK = "MBORA";

export const FM_ORDER_REGISTER_SHEETS = ["2025 JOB ORDERS", "2025 WORK ORDERS", "2026 JOB ORDERS", "2026 WORK ORDER"] as const;

/** Source registers whose records are 2025 history (excluded from the current operating picture by default). */
export const FM_HISTORICAL_2025_SHEETS = ["2025 JOB ORDERS", "2025 WORK ORDERS"] as const;

export type FmProvenanceTarget = "fm_cost_records" | "fm_work" | "fm_work_instructions";

export const FM_ORDER_REGISTER_VALUE_LABEL = "WO/JO execution cost (imported register)";
export const FM_ORDER_REGISTER_VALUE_NOTE =
  "Recorded execution expenditure from the WO/JO registers. Included in Costs; this view does not add another cost or imply reimbursement.";
export const FM_2025_HISTORY_NOTE =
  "2025 records are preserved as history and excluded from the current operating picture. Include 2025 history to see them.";

export function isOrderRegisterSheet(sheet: string | null | undefined): boolean {
  return !!sheet && (FM_ORDER_REGISTER_SHEETS as readonly string[]).includes(sheet);
}

export function is2025HistorySheet(sheet: string | null | undefined): boolean {
  return !!sheet && (FM_HISTORICAL_2025_SHEETS as readonly string[]).includes(sheet);
}

type ProvenanceQuery = {
  select(columns: string): ProvenanceQuery;
  eq(column: string, value: string): ProvenanceQuery;
  in(column: string, values: readonly string[]): ProvenanceQuery;
  order(column: string, options: { ascending: boolean }): ProvenanceQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
};
export type ProvenanceClient = { from(table: "fm_migration_provenance"): ProvenanceQuery };

/** Every target id of `target` imported from one of `sheets` (complete, deterministically paged). */
export async function loadProvenanceTargetIds(
  client: ProvenanceClient,
  input: { organisationId: string; target: FmProvenanceTarget; sheets: readonly string[] }
): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("fm_migration_provenance")
      .select("target_id")
      .eq("organisation_id", input.organisationId)
      .eq("workbook", FM_SOURCE_REGISTER_WORKBOOK)
      .eq("target_table", input.target)
      .in("source_sheet", input.sheets)
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message?.trim() || "Unable to load source-register provenance.");
    const batch = (data ?? []) as Array<{ target_id: string }>;
    ids.push(...batch.map((row) => String(row.target_id)));
    if (batch.length < 1000) return ids;
  }
}

/** PostgREST `not in` list for a set of UUIDs (callers pass only UUIDs from provenance). */
export function notInList(ids: readonly string[]): string {
  return `(${ids.join(",")})`;
}
