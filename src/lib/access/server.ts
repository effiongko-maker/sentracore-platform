import {
  getPlatformSession,
  toSessionIdentity,
} from "@/lib/auth/session";
import type { PlatformSession } from "@/lib/auth/types";
import { postToAppsScriptData } from "@/services/api/appsScriptProxy";
import type { User, UserStatus } from "@/modules/users/types";
import {
  findSheetUserByEmail,
  resolveOperatingAccessFromSheetUser,
  applyPlatformSuperAdmin,
  accessCan,
  type OperatingAccess,
} from "./resolveAccess";
import type { AccessCapability } from "./capabilities";
import { isPlatformSuperAdminFromSlugs } from "./platformRoles";

type RemoteUser = Record<string, unknown>;

function pickField(raw: RemoteUser, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function normalizeUserStatus(raw: unknown): UserStatus | "" {
  const token = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!token) return "";
  if (token === "active") return "active";
  if (token === "inactive" || token === "deactivated") return "inactive";
  if (token === "suspended") return "suspended";
  if (token === "pending") return "pending";
  return token as UserStatus;
}

function mapSheetUserLite(raw: RemoteUser): Pick<
  User,
  "id" | "role" | "status" | "facility" | "name" | "email"
> {
  return {
    id: String(pickField(raw, "id", "User ID") ?? ""),
    name: String(pickField(raw, "name", "Full Name") ?? ""),
    email: String(pickField(raw, "email", "Email") ?? ""),
    role: String(pickField(raw, "role", "Role") ?? ""),
    facility: String(pickField(raw, "facility", "Facility Assigned") ?? ""),
    status: normalizeUserStatus(pickField(raw, "status", "Status")),
  };
}

function extractUserRows(payload: unknown): RemoteUser[] {
  if (Array.isArray(payload)) return payload as RemoteUser[];
  if (payload && typeof payload === "object") {
    const page = payload as Record<string, unknown>;
    if (Array.isArray(page.data)) return page.data as RemoteUser[];
    if (page.data && typeof page.data === "object") {
      const inner = page.data as Record<string, unknown>;
      if (Array.isArray(inner.data)) return inner.data as RemoteUser[];
    }
  }
  return [];
}

/**
 * Load the People-register row for access resolution by email.
 * Uses Apps Script search so pagination cannot silently miss the actor
 * and elevate them to legacy unassigned powers.
 */
export async function loadSheetUserForAccessByEmail(
  email: string
): Promise<Pick<
  User,
  "id" | "role" | "status" | "facility" | "name" | "email"
> | null> {
  const target = email.trim();
  if (!target) return null;

  const payload = await postToAppsScriptData(
    {
      resource: "users",
      action: "getAll",
      payload: {
        page: 1,
        pageSize: 50,
        search: target,
        status: "all",
      },
    },
    { resource: "users", action: "getAll" },
    "access/sheet-user-by-email"
  );

  return findSheetUserByEmail(
    extractUserRows(payload).map(mapSheetUserLite),
    target
  );
}

/** @deprecated Prefer loadSheetUserForAccessByEmail — kept for diagnostics. */
export async function loadSheetUsersForAccess(): Promise<
  Array<Pick<User, "id" | "role" | "status" | "facility" | "name" | "email">>
> {
  const payload = await postToAppsScriptData(
    {
      resource: "users",
      action: "getAll",
      payload: { page: 1, pageSize: 500, search: "", status: "all" },
    },
    { resource: "users", action: "getAll" },
    "access/sheet-users"
  );
  return extractUserRows(payload).map(mapSheetUserLite);
}

export async function resolveOperatingAccess(
  session: PlatformSession
): Promise<OperatingAccess> {
  const identity = toSessionIdentity(session);
  let sheetUser: ReturnType<typeof findSheetUserByEmail> = null;
  let lookupFailed = false;
  try {
    sheetUser = await loadSheetUserForAccessByEmail(identity.email);
  } catch (error) {
    lookupFailed = true;
    console.warn(
      "[access] sheet user lookup failed; denying operating capabilities until register is reachable",
      error
    );
  }

  // Fail closed on lookup failure — do not elevate to legacy full powers.
  // Super Admin override is still applied below when session slugs qualify.
  const base = lookupFailed
    ? {
        ...resolveOperatingAccessFromSheetUser(
          identity.email,
          identity.name,
          null
        ),
        unassigned: false,
        inactive: false,
        capabilities: [] as ReturnType<
          typeof resolveOperatingAccessFromSheetUser
        >["capabilities"],
        roleLabel: "Unavailable",
        status: "unknown" as const,
      }
    : resolveOperatingAccessFromSheetUser(
        identity.email,
        identity.name,
        sheetUser
      );

  const isSuperAdmin = isPlatformSuperAdminFromSlugs(session.roleSlugs);
  return applyPlatformSuperAdmin(base, isSuperAdmin);
}

export async function getOperatingAccess(): Promise<OperatingAccess | null> {
  const session = await getPlatformSession();
  if (!session) return null;
  return resolveOperatingAccess(session);
}

export class AccessDeniedError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export async function requireCapability(
  capability: AccessCapability
): Promise<{ session: PlatformSession; access: OperatingAccess }> {
  const session = await getPlatformSession();
  if (!session) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  const access = await resolveOperatingAccess(session);
  if (!accessCan(access, capability)) {
    throw new AccessDeniedError(
      access.inactive
        ? "Your user account is inactive."
        : `Missing capability: ${capability}`
    );
  }
  return { session, access };
}

/** Mutation actions that must not run without an explicit capability. */
export function isWriteAction(action: string): boolean {
  return (
    action === "create" ||
    action === "update" ||
    action === "deactivate" ||
    action === "delete"
  );
}
