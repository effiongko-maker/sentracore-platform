import type { CostRecord, CostReimbursability } from "@/lib/operational/finance/types";

export type SubmissionCostPool = {
  eligible: CostRecord[];
  needsClassification: CostRecord[];
  excluded: CostRecord[];
};

export function isCostEligibleForSubmission(
  record: Pick<CostRecord, "reimbursability">
): boolean {
  return record.reimbursability === "reimbursable";
}

export function partitionCostsForSubmission(
  records: CostRecord[]
): SubmissionCostPool {
  const eligible: CostRecord[] = [];
  const needsClassification: CostRecord[] = [];
  const excluded: CostRecord[] = [];

  for (const record of records) {
    if (record.reimbursability === "reimbursable") {
      eligible.push(record);
    } else if (record.reimbursability === "unknown") {
      needsClassification.push(record);
    } else {
      excluded.push(record);
    }
  }

  return { eligible, needsClassification, excluded };
}

export function filterCostsBySearch(
  records: CostRecord[],
  search: string
): CostRecord[] {
  const term = search.trim().toLowerCase();
  if (!term) return records;
  return records.filter((record) => {
    const haystack = [
      record.costId,
      record.description,
      record.location,
      record.category,
      record.workId,
      record.workOrderId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

export function reimbursabilityLabel(value: CostReimbursability): string {
  switch (value) {
    case "reimbursable":
      return "Reimbursable";
    case "non_reimbursable":
      return "Non-reimbursable";
    default:
      return "Unknown — needs classification";
  }
}
