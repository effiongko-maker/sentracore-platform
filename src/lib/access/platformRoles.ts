/**
 * Platform-level roles (Supabase Auth) — distinct from V1 facility operating roles.
 * Super Admin is never represented as Facility Manager.
 */

/** Existing Supabase / RLS slug. */
export const PLATFORM_SUPER_ADMIN_SLUG = "platform_super_admin";

export const PLATFORM_ROLES = ["system_administrator"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  system_administrator: "System Administrator",
};

/** Alternate product label — same role. */
export const PLATFORM_SUPER_ADMIN_DISPLAY_ALIASES = [
  "System Administrator",
  "Super Admin",
] as const;

const PLATFORM_SUPER_ADMIN_SLUGS = new Set([
  PLATFORM_SUPER_ADMIN_SLUG,
  "system_administrator",
  "super_admin",
]);

/**
 * Detect Super Admin from platform session role slugs / assignments.
 * Sheet People-register roles are never used for this.
 */
export function isPlatformSuperAdminFromSlugs(
  roleSlugs: readonly string[] | null | undefined
): boolean {
  if (!roleSlugs?.length) return false;
  return roleSlugs.some((slug) =>
    PLATFORM_SUPER_ADMIN_SLUGS.has(
      String(slug).trim().toLowerCase().replace(/\s+/g, "_")
    )
  );
}

export function platformRoleLabel(role: PlatformRole): string {
  return PLATFORM_ROLE_LABELS[role];
}
