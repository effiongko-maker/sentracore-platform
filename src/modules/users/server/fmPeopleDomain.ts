import type { PaginatedResult } from "@/types";
import type {
  EligibleProfile,
  User,
  UserListParams,
  UserStatus,
} from "@/modules/users/types";
import {
  isV1OperatingRole,
  parseV1OperatingRole,
  v1OperatingRoleLabel,
  type V1OperatingRole,
} from "@/lib/access/roles";

export const FM_PEOPLE_MODULE_SLUG = "facility_management" as const;

export type { EligibleProfile };

export class FmPeopleValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FmPeopleValidationError";
  }
}

export class FmPeopleNotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Person assignment not found.") {
    super(message);
    this.name = "FmPeopleNotFoundError";
  }
}

export class FmPeopleUnavailableError extends Error {
  readonly status = 503;
  constructor(message = "People directory is unavailable.") {
    super(message);
    this.name = "FmPeopleUnavailableError";
  }
}

export type FmFacilityAssignmentRow = {
  id: string;
  organisation_id: string;
  profile_id: string;
  facility_id: string;
  operational_role: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FmPeopleDirectoryRow = FmFacilityAssignmentRow & {
  profile_full_name: string | null;
  profile_first_name: string | null;
  profile_last_name: string | null;
  profile_status: string;
  profile_avatar_url: string | null;
  facility_name: string;
  facility_code: string;
  email: string;
};

export function parseAssignmentStatus(value: unknown): "active" | "inactive" {
  const token = String(value ?? "active")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (token === "inactive" || token === "deactivated" || token === "suspended") {
    return "inactive";
  }
  if (token === "active" || token === "pending" || token === "") {
    return "active";
  }
  throw new FmPeopleValidationError("Assignment status is invalid.");
}

export function parseOperationalRole(value: unknown): V1OperatingRole {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new FmPeopleValidationError("Operational role is required.");
  }
  if (isV1OperatingRole(raw)) return raw;
  const parsed = parseV1OperatingRole(raw);
  if (!parsed) {
    throw new FmPeopleValidationError("Select a V1 operating role.");
  }
  return parsed;
}

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FmPeopleValidationError("People payload is required.");
  }
  return value as Record<string, unknown>;
}

export function parsePeopleListParams(payload: unknown): UserListParams {
  const raw =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const page = Number(raw.page ?? 1);
  const pageSize = Number(raw.pageSize ?? 8);
  return {
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 8,
    search: raw.search != null ? String(raw.search) : "",
    status:
      raw.status != null && String(raw.status).trim() !== ""
        ? (String(raw.status) as UserStatus | "all")
        : "all",
    role: raw.role != null ? String(raw.role) : "all",
    facility: raw.facility != null ? String(raw.facility) : "all",
  };
}

export function parseCreateAssignmentInput(payload: unknown): {
  profileId: string;
  facilityId: string;
  role: V1OperatingRole;
  status: "active" | "inactive";
} {
  const raw = asRecord(payload);
  const profileId =
    optionalTrimmed(raw.profileId) ?? optionalTrimmed(raw.id);
  const facilityId =
    optionalTrimmed(raw.facilityId) ?? optionalTrimmed(raw.facility);
  if (!profileId) {
    throw new FmPeopleValidationError("Profile is required.");
  }
  if (!facilityId) {
    throw new FmPeopleValidationError("Facility is required.");
  }
  return {
    profileId,
    facilityId,
    role: parseOperationalRole(raw.role),
    status: parseAssignmentStatus(raw.status),
  };
}

export function parseUpdateAssignmentInput(payload: unknown): {
  id: string;
  assignmentId?: string;
  facilityId?: string;
  role?: V1OperatingRole;
  status?: "active" | "inactive";
} {
  const raw = asRecord(payload);
  const id = optionalTrimmed(raw.id);
  if (!id) {
    throw new FmPeopleValidationError("Id is required.");
  }
  const patch: ReturnType<typeof parseUpdateAssignmentInput> = { id };
  const assignmentId = optionalTrimmed(raw.assignmentId);
  if (assignmentId) patch.assignmentId = assignmentId;
  const facilityId =
    optionalTrimmed(raw.facilityId) ?? optionalTrimmed(raw.facility);
  if (facilityId) patch.facilityId = facilityId;
  if ("role" in raw) patch.role = parseOperationalRole(raw.role);
  if ("status" in raw) patch.status = parseAssignmentStatus(raw.status);
  return patch;
}

export function parsePeopleIdPayload(payload: unknown): string {
  const raw = asRecord(payload);
  const id = optionalTrimmed(raw.id);
  if (!id) {
    throw new FmPeopleValidationError("Id is required.");
  }
  return id;
}

export function mapDirectoryRowToUser(row: FmPeopleDirectoryRow): User {
  const role = isV1OperatingRole(row.operational_role)
    ? v1OperatingRoleLabel(row.operational_role)
    : row.operational_role;
  const name =
    row.profile_full_name?.trim() ||
    [row.profile_first_name, row.profile_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    row.email ||
    "Unnamed person";
  const assignmentStatus = parseAssignmentStatus(row.status);
  return {
    id: row.profile_id,
    name,
    email: row.email,
    role,
    specialization: "",
    facility: row.facility_name,
    facilityId: row.facility_id,
    assignmentId: row.id,
    activeWorkOrders: 0,
    workloadAvailable: false,
    status: assignmentStatus,
    profileStatus: row.profile_status,
    avatarUrl: row.profile_avatar_url ?? undefined,
    lastActive: row.updated_at,
    createdAt: row.created_at,
  };
}

export function filterPeopleRows(
  rows: User[],
  params: UserListParams
): User[] {
  const search = String(params.search ?? "")
    .toLowerCase()
    .trim();
  const status =
    params.status && params.status !== "all"
      ? String(params.status).toLowerCase()
      : undefined;
  const role =
    params.role && params.role !== "all"
      ? String(params.role).toLowerCase()
      : undefined;
  const facility =
    params.facility && params.facility !== "all"
      ? String(params.facility).trim().toLowerCase()
      : undefined;

  return rows.filter((row) => {
    if (status && String(row.status).toLowerCase() !== status) return false;
    if (role && String(row.role).toLowerCase() !== role) return false;
    if (
      facility &&
      String(row.facility).toLowerCase() !== facility &&
      String(row.facilityId ?? "").toLowerCase() !== facility
    ) {
      return false;
    }
    if (search) {
      const haystack = [row.name, row.email, row.role, row.facility, row.id]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function paginatePeople<T>(
  rows: T[],
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const safePage = page < 1 ? 1 : page;
  const safeSize = pageSize < 1 ? 8 : pageSize;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const start = (safePage - 1) * safeSize;
  return {
    data: rows.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
  };
}

/** One directory row per profile; multiple facilities become a joined label. */
export function collapsePeopleByProfile(rows: User[]): User[] {
  const grouped = new Map<string, User[]>();
  for (const row of rows) {
    const list = grouped.get(row.id) ?? [];
    list.push(row);
    grouped.set(row.id, list);
  }
  return [...grouped.values()].map((group) => {
    const preferred =
      group.find((row) => row.status === "active") ?? group[0]!;
    const facilities = [
      ...new Set(
        group
          .map((row) => String(row.facility ?? "").trim())
          .filter((name) => name && name !== "-")
      ),
    ];
    return {
      ...preferred,
      facility: facilities.join(", "),
    };
  });
}
