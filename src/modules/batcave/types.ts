/**
 * Batcave — private executive domain (navigationally nested under Command Centre,
 * architecturally SEPARATE from it).
 *
 * V1 authority is ONE explicit entry capability. Nothing else grants it: not Command Centre
 * view/decide, not Executive Commitments, not Platform Finance/FM/ECC authority, not
 * platform.admin_override, not Super Admin, not job title, not organisation membership.
 * Administering the grant never confers entry.
 */
export const BATCAVE_CAPABILITIES = {
  access: "platform.batcave.access",
} as const;

export type BatcaveCapability = (typeof BATCAVE_CAPABILITIES)[keyof typeof BATCAVE_CAPABILITIES];
