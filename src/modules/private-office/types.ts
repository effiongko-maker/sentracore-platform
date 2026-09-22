/**
 * Private Office — private executive domain (navigationally nested under Executive Office,
 * architecturally SEPARATE from it).
 *
 * V1 authority is ONE explicit entry capability. Nothing else grants it: not Executive Office
 * view/decide, not Executive Commitments, not Platform Finance/FM/ECC authority, not
 * platform.admin_override, not Super Admin, not job title, not organisation membership.
 * Administering the grant never confers entry.
 */
export const PRIVATE_OFFICE_CAPABILITIES = {
  access: "platform.executive.private_office.access",
} as const;

export type PrivateOfficeCapability = (typeof PRIVATE_OFFICE_CAPABILITIES)[keyof typeof PRIVATE_OFFICE_CAPABILITIES];
