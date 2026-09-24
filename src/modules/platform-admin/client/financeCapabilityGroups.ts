/**
 * Presentation-only grouping of Platform Finance capabilities for the Admin Console editor. Groups are derived from
 * the existing capability key's area (platform_finance.<area>[.<action>]); keys, labels and meaning are unchanged.
 * A key that matches no group is shown under "Other" so nothing is ever hidden.
 */
export type FinanceCapabilityGroup = { id: string; label: string; keys: string[] };

const GROUPS: Array<{ id: string; label: string; areas: string[] }> = [
  { id: "core", label: "Core Finance", areas: ["view", "manage_setup", "manage_periods", "manage_coa", "create_transaction", "post", "financial_account"] },
  { id: "requests", label: "Requests & Approvals", areas: ["request"] },
  { id: "payables", label: "Payables & Vendor Bills", areas: ["payable", "vendor_bill"] },
  { id: "payments", label: "Payments", areas: ["payment"] },
  { id: "counterparties", label: "Counterparties", areas: ["counterparty"] },
  { id: "receivables", label: "Invoicing & Receivables", areas: ["invoice", "receivable", "receipt"] },
  { id: "historical", label: "Historical Data", areas: ["historical"] },
];

function area(key: string): string {
  return key.replace(/^platform_finance\./, "").split(".")[0] ?? key;
}

export function groupFinanceCapabilities(keys: readonly string[]): FinanceCapabilityGroup[] {
  const groups = GROUPS.map((g) => ({ id: g.id, label: g.label, keys: keys.filter((k) => g.areas.includes(area(k))) }));
  const placed = new Set(groups.flatMap((g) => g.keys));
  const other = keys.filter((k) => !placed.has(k));
  if (other.length > 0) groups.push({ id: "other", label: "Other", keys: other });
  return groups.filter((g) => g.keys.length > 0);
}
