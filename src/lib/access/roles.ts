/**
 * V1 operating roles — single vocabulary for access control.
 * Sheet USERS.Role stores the display label; auth resolution maps to these slugs.
 */

export const V1_OPERATING_ROLES = [
  "facility_manager",
  "fm_staff",
  "liaison_officer",
  "finance",
  "ncc_client",
  /**
   * Executive Oversight (Boss) — visibility / drill-down only.
   * Not an operational authority role; no mutations via capability matrix.
   */
  "executive",
] as const;

export type V1OperatingRole = (typeof V1_OPERATING_ROLES)[number];

export const V1_OPERATING_ROLE_LABELS: Record<V1OperatingRole, string> = {
  facility_manager: "Facility Manager",
  fm_staff: "FM Staff",
  liaison_officer: "Liaison Officer",
  finance: "Finance",
  ncc_client: "NCC / Client",
  executive: "Executive Oversight",
};

/** Canonical labels for People register create/edit. */
export const V1_OPERATING_ROLE_OPTIONS: Array<{
  value: V1OperatingRole;
  label: string;
}> = V1_OPERATING_ROLES.map((value) => ({
  value,
  label: V1_OPERATING_ROLE_LABELS[value],
}));

const LABEL_TO_ROLE: Record<string, V1OperatingRole> = {
  facility_manager: "facility_manager",
  "facility manager": "facility_manager",
  fm: "facility_manager",
  fm_staff: "fm_staff",
  "fm staff": "fm_staff",
  staff: "fm_staff",
  liaison_officer: "liaison_officer",
  "liaison officer": "liaison_officer",
  liaison: "liaison_officer",
  finance: "finance",
  ncc_client: "ncc_client",
  "ncc / client": "ncc_client",
  "ncc/client": "ncc_client",
  ncc: "ncc_client",
  client: "ncc_client",
  executive: "executive",
  "executive oversight": "executive",
  boss: "executive",
  ceo: "executive",
  director: "executive",
};

/**
 * Map a free-form sheet / display role to a V1 slug.
 * Returns null when the label is not a recognised V1 role (legacy / unassigned).
 */
export function parseV1OperatingRole(
  raw: string | null | undefined
): V1OperatingRole | null {
  const token = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!token) return null;
  return LABEL_TO_ROLE[token] ?? LABEL_TO_ROLE[token.replace(/\s+/g, "_")] ?? null;
}

export function v1OperatingRoleLabel(
  role: V1OperatingRole | null | undefined
): string {
  if (!role) return "Unassigned";
  return V1_OPERATING_ROLE_LABELS[role];
}

export function isV1OperatingRole(value: string): value is V1OperatingRole {
  return (V1_OPERATING_ROLES as readonly string[]).includes(value);
}
