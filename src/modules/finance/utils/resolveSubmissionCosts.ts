import type { CostRecord } from "@/lib/operational/finance/types";
import { CostRecordService } from "@/services/finance/CostRecordService";

/**
 * Resolve CostRecords for a submission from a bounded pool, fetching individually
 * only for IDs missing from the pool (selected count is typically small).
 */
export async function resolveSubmissionCosts(
  costRecordIds: string[],
  pool: CostRecord[]
): Promise<CostRecord[]> {
  const uniqueIds = [...new Set(costRecordIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const byId = new Map(pool.map((record) => [record.costId, record]));
  const resolved: CostRecord[] = [];
  const missing: string[] = [];

  for (const id of uniqueIds) {
    const fromPool = byId.get(id);
    if (fromPool) resolved.push(fromPool);
    else missing.push(id);
  }

  if (missing.length === 0) return resolved;

  const fetched = await Promise.all(
    missing.map((id) => CostRecordService.getCostRecord(id))
  );
  for (const record of fetched) {
    if (record) resolved.push(record);
  }

  const order = new Map(uniqueIds.map((id, index) => [id, index]));
  return resolved.sort(
    (a, b) => (order.get(a.costId) ?? 0) - (order.get(b.costId) ?? 0)
  );
}
