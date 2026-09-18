import type { PaginatedResult } from "@/types";
import type {
  CreateUserInput,
  CurrentUser,
  EligibleProfile,
  UpdateUserInput,
  User,
  UserListParams,
  UserStatus,
} from "@/modules/users/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onUserMutation,
} from "@/services/cache/domainCache";
import {
  CATALOG_TTL_MS,
  sharedRequest,
  stableRequestKey,
  WORKLOAD_TTL_MS,
} from "@/services/cache/sharedRequest";
import { FacilityService } from "@/services/facilities/FacilityService";
import {
  applyUserWorkloadSummary,
  loadBoundedWorkloadSummary,
} from "@/lib/operational/workload/loadBoundedWorkloadSummary";
import { queryUsersPage } from "./queryUsers";

export const USER_REPOSITORY_BUILD = "2026-09-18-fm-people-supabase";

/** Raw row shape from the Apps Script users API. */
type RemoteUser = Record<string, unknown>;

function pickField(raw: RemoteUser, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeUserStatus(raw: unknown): UserStatus | "" {
  const token = normalizeText(raw).replace(/\s+/g, "_");
  if (!token) return "";
  if (token === "active") return "active";
  if (token === "inactive" || token === "deactivated") return "inactive";
  if (token === "suspended") return "suspended";
  if (token === "pending") return "pending";
  return token as UserStatus;
}

function mapRemoteUser(raw: RemoteUser): User {
  const id = String(pickField(raw, "id", "User ID") ?? "");
  const dateAdded = String(
    pickField(raw, "createdAt", "lastActive", "Date Added") ?? ""
  );
  const workloadAvailable =
    raw.workloadAvailable === false
      ? false
      : raw.workloadAvailable === true
        ? true
        : false;

  return {
    id,
    name: String(pickField(raw, "name", "Full Name") ?? ""),
    email: String(pickField(raw, "email", "Email") ?? ""),
    phone: (() => {
      const value = pickField(raw, "phone", "Phone");
      return value != null ? String(value) : undefined;
    })(),
    role: String(pickField(raw, "role", "Role") ?? ""),
    specialization: String(
      pickField(raw, "specialization", "Specialization") ?? ""
    ),
    facility: String(
      pickField(raw, "facility", "Facility Assigned") ?? ""
    ),
    facilityId: raw.facilityId != null ? String(raw.facilityId) : undefined,
    assignmentId:
      raw.assignmentId != null ? String(raw.assignmentId) : undefined,
    activeWorkOrders: 0,
    workloadAvailable,
    status: normalizeUserStatus(pickField(raw, "status", "Status")),
    profileStatus:
      raw.profileStatus != null ? String(raw.profileStatus) : undefined,
    avatarUrl: raw.avatarUrl ? String(raw.avatarUrl) : undefined,
    lastActive: dateAdded,
    createdAt: dateAdded,
  };
}

function toPaginatedUsers(
  payload: unknown,
  params: UserListParams
): PaginatedResult<User> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) => mapRemoteUser(row as RemoteUser));
    return {
      data,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? data.length,
      total: data.length,
      totalPages: 1,
    };
  }

  if (payload && typeof payload === "object") {
    const page = payload as Record<string, unknown>;
    if (Array.isArray(page.data)) {
      const rows = page.data;
      return {
        data: rows.map((row) => mapRemoteUser(row as RemoteUser)),
        page: Number(page.page ?? params.page ?? 1),
        pageSize: Number(page.pageSize ?? params.pageSize ?? rows.length),
        total: Number(page.total ?? rows.length),
        totalPages: Number(page.totalPages ?? 1),
      };
    }
    if (page.data && typeof page.data === "object") {
      const inner = page.data as Record<string, unknown>;
      if (Array.isArray(inner.data)) {
        const rows = inner.data;
        return {
          data: rows.map((row) => mapRemoteUser(row as RemoteUser)),
          page: Number(inner.page ?? params.page ?? 1),
          pageSize: Number(inner.pageSize ?? params.pageSize ?? rows.length),
          total: Number(inner.total ?? rows.length),
          totalPages: Number(inner.totalPages ?? 1),
        };
      }
    }
  }

  return {
    data: [],
    page: 1,
    pageSize: params.pageSize ?? 8,
    total: 0,
    totalPages: 1,
  };
}

async function fetchUsersPage(
  params: UserListParams
): Promise<PaginatedResult<User>> {
  const response = await apiClient.post<unknown>("/users", {
    resource: "users",
    action: "getAll",
    payload: {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      status: params.status ?? "all",
      role: params.role ?? "all",
      facility: params.facility ?? "all",
    },
  });
  return toPaginatedUsers(response.data, params);
}

async function fetchAllUsersUncached(): Promise<User[]> {
  const pageSize = 500;
  let page = 1;
  let totalPages = 1;
  const all: User[] = [];

  while (page <= totalPages) {
    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "getAll",
      payload: {
        page,
        pageSize,
        search: "",
        status: "all",
        role: "all",
        facility: "all",
      },
    });

    const payload = response.data;
    const pageResult = toPaginatedUsers(payload, {
      page,
      pageSize,
      search: "",
      status: "all",
      role: "all",
      facility: "all",
    });
    all.push(...pageResult.data);

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const meta = payload as Record<string, unknown>;
      if (meta.data && typeof meta.data === "object") {
        const inner = meta.data as Record<string, unknown>;
        totalPages = Math.max(1, Number(inner.totalPages ?? 1));
        const total = Number(inner.total ?? all.length);
        if (all.length >= total || pageResult.data.length === 0) break;
      } else {
        totalPages = Math.max(1, Number(meta.totalPages ?? 1));
        if (pageResult.data.length === 0) break;
      }
    } else {
      break;
    }

    page += 1;
    if (page > 100) break;
  }

  const byId = new Map<string, User>();
  for (const user of all) {
    if (user.id) byId.set(user.id, user);
  }
  return Array.from(byId.values());
}

/** Coalesced + short-TTL user catalog rows (no workload enrichment). */
async function loadAllUsers(): Promise<User[]> {
  return sharedRequest(
    `${CacheNamespaces.usersCatalog}:all`,
    fetchAllUsersUncached,
    { ttlMs: CATALOG_TTL_MS }
  );
}

async function loadFacilityNameById(): Promise<Map<string, string>> {
  try {
    const result = await FacilityService.listFacilities({
      page: 1,
      pageSize: 500,
    });
    return new Map(result.data.map((facility) => [facility.id, facility.name]));
  } catch {
    return new Map();
  }
}

function fieldMismatch(
  field: string,
  expected: string,
  actual: string
): ApiError {
  return new ApiError(
    `User ${field} did not persist (expected "${expected}", got "${actual || "(empty)"}"). Redeploy Apps Script if this continues.`,
    502
  );
}

async function assertUserPersisted(
  intended: CreateUserInput | UpdateUserInput,
  actual: User
): Promise<void> {
  const checks: Array<[string, string | undefined, string]> = [
    ["role", intended.role, String(actual.role ?? "")],
    ["status", intended.status, String(actual.status ?? "")],
  ];
  if (intended.facilityId && actual.facilityId) {
    checks.push(["facilityId", intended.facilityId, actual.facilityId]);
  } else if (intended.facility) {
    const expected = intended.facility.toLowerCase();
    const actualFacility = String(actual.facility ?? "").toLowerCase();
    if (expected && !actualFacility.includes(expected) && actual.facilityId !== intended.facility) {
      throw fieldMismatch("facility", intended.facility, actual.facility);
    }
  }

  for (const [field, expected, actualValue] of checks) {
    if (expected == null) continue;
    if (normalizeText(expected) !== normalizeText(actualValue)) {
      throw fieldMismatch(field, String(expected), actualValue);
    }
  }
}

/**
 * Users domain service.
 *
 * List uses server-side pagination via Apps Script (Phase 33).
 * Workload overlay is applied separately via enrichUsersWorkload().
 */
async function getCurrentUserUncached(): Promise<CurrentUser> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });

  const text = await response.text();
  let json: {
    success?: boolean;
    message?: string;
    data?: { identity?: CurrentUser };
  };

  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new ApiError(
      `Invalid JSON from /api/auth/me (status ${response.status})`,
      response.status,
      text.slice(0, 200)
    );
  }

  if (!response.ok || json.success === false || !json.data?.identity) {
    throw new ApiError(
      json.message ?? "Failed to load current user",
      response.status || 401,
      json
    );
  }

  return json.data.identity;
}

export const UserService = {
  async getCurrentUser(): Promise<CurrentUser> {
    return sharedRequest("auth:currentUser", getCurrentUserUncached, {
      ttlMs: WORKLOAD_TTL_MS,
    });
  },

  async listUsers(params: UserListParams = {}): Promise<PaginatedResult<User>> {
    const key = stableRequestKey(CacheNamespaces.usersList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      status: params.status ?? "all",
      role: params.role ?? "all",
      facility: params.facility ?? "all",
    });
    return sharedRequest(key, () => fetchUsersPage(params));
  },

  /** Workload overlay — skipped when the directory cannot prove Sheet WO identity. */
  async enrichUsersWorkload(users: User[]): Promise<User[]> {
    if (users.length === 0) return users;
    if (users.every((row) => row.workloadAvailable === false)) {
      return users.map((row) => ({
        ...row,
        activeWorkOrders: 0,
        workloadAvailable: false,
        workloadWorkOrderIds: undefined,
      }));
    }
    const userIds = users.map((row) => row.id).filter(Boolean);
    const summary = await loadBoundedWorkloadSummary({ userIds });
    return applyUserWorkloadSummary(users, summary);
  },

  /**
   * Lightweight reference catalog — id/name selects and EntityResolver only.
   * Does NOT run OperationalWorkloadService (no WO/MNT/INC fan-out).
   */
  async listUsersCatalog(
    params: UserListParams = {}
  ): Promise<PaginatedResult<User>> {
    const [users, facilityNameById] = await Promise.all([
      loadAllUsers(),
      loadFacilityNameById(),
    ]);
    return queryUsersPage(users, params, facilityNameById);
  },

  /** Full unfiltered user list without workload enrichment. */
  async fetchUsersCatalog(): Promise<User[]> {
    return loadAllUsers();
  },

  async listUsersWithCatalog(
    params: UserListParams = {}
  ): Promise<{ catalog: User[]; page: PaginatedResult<User> }> {
    const [page, catalog] = await Promise.all([
      UserService.listUsers(params),
      loadAllUsers(),
    ]);
    return { catalog, page };
  },

  /** Unfiltered user catalog for filter option discovery (no workload enrichment). */
  async fetchAllUsers(): Promise<User[]> {
    return loadAllUsers();
  },

  async listEligibleProfiles(): Promise<EligibleProfile[]> {
    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "listEligible",
      payload: {},
    });
    const payload = response.data;
    if (Array.isArray(payload)) {
      return payload as EligibleProfile[];
    }
    return [];
  },

  async getUser(id: string): Promise<User | null> {
    try {
      const response = await apiClient.post<unknown>("/users", {
        resource: "users",
        action: "getById",
        payload: { id },
      });
      if (response.data == null) return null;
      const user = mapRemoteUser(response.data as RemoteUser);
      const [enriched] = await UserService.enrichUsersWorkload([user]);
      return enriched ?? user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createUser(input: CreateUserInput): Promise<User> {
    const profileId = input.profileId?.trim();
    if (!profileId) {
      throw new ApiError("Select an existing platform person to assign.", 400);
    }
    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "create",
      payload: {
        profileId,
        facility: input.facilityId || input.facility,
        facilityId: input.facilityId || input.facility,
        role: input.role,
        status: input.status,
      },
    });
    if (response.data == null) {
      throw new ApiError("Assignment create returned no record.", 502);
    }

    const created = mapRemoteUser(response.data as RemoteUser);
    if (!created.id) {
      throw new ApiError("Assignment create returned a record without an id.", 502);
    }

    const verified = await UserService.getUser(created.id);
    if (!verified) {
      throw new ApiError(
        "Assignment was created but could not be re-read from storage.",
        502
      );
    }
    await assertUserPersisted(input, verified);
    onUserMutation();
    return verified;
  },

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "update",
      payload: {
        id,
        assignmentId: input.assignmentId,
        facility: input.facilityId || input.facility,
        facilityId: input.facilityId || input.facility,
        role: input.role,
        status: input.status,
      },
    });
    if (response.data == null) {
      throw new ApiError("User update returned no record.", 502);
    }

    const verified = await UserService.getUser(id);
    if (!verified) {
      throw new ApiError(
        `User ${id} update could not be confirmed — record missing after save.`,
        502
      );
    }
    await assertUserPersisted(input, verified);
    onUserMutation();
    return verified;
  },

  /** Deactivate FM facility assignment(s). Does not offboard the platform profile. */
  async deactivateUser(id: string): Promise<User> {
    await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "deactivate",
      payload: { id },
    });

    const verified = await UserService.getUser(id);
    if (!verified) {
      throw new ApiError(
        `User ${id} deactivate could not be confirmed.`,
        502
      );
    }
    if (normalizeText(verified.status) !== "inactive") {
      throw fieldMismatch("status", "inactive", verified.status);
    }
    onUserMutation();
    return verified;
  },
};

export type IUserService = typeof UserService;
