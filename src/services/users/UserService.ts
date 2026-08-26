import type { PaginatedResult } from "@/types";
import type {
  CreateUserInput,
  CurrentUser,
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
} from "@/services/cache/sharedRequest";
import { FacilityService } from "@/services/facilities/FacilityService";
import { OperationalWorkloadService } from "@/services/operational/OperationalWorkloadService";
import { queryUsersPage } from "./queryUsers";

export const USER_REPOSITORY_BUILD = "2026-08-25-users-header-v3";

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
    // Sheet "Current Workload" is not authoritative — derived in list/get via
    // OperationalWorkloadService (active WOs by assignedToUserId).
    activeWorkOrders: 0,
    status: normalizeUserStatus(pickField(raw, "status", "Status")),
    avatarUrl: raw.avatarUrl ? String(raw.avatarUrl) : undefined,
    lastActive: dateAdded,
    createdAt: dateAdded,
  };
}

function extractUserRows(payload: unknown): User[] {
  if (Array.isArray(payload)) {
    return payload.map((row) => mapRemoteUser(row as RemoteUser));
  }
  if (payload && typeof payload === "object") {
    const page = payload as Record<string, unknown>;
    if (Array.isArray(page.data)) {
      return page.data.map((row) => mapRemoteUser(row as RemoteUser));
    }
    if (page.data && typeof page.data === "object") {
      const inner = page.data as Record<string, unknown>;
      if (Array.isArray(inner.data)) {
        return inner.data.map((row) => mapRemoteUser(row as RemoteUser));
      }
    }
  }
  return [];
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
    const rows = extractUserRows(payload);
    all.push(...rows);

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const meta = payload as Record<string, unknown>;
      if (meta.data && typeof meta.data === "object") {
        const inner = meta.data as Record<string, unknown>;
        totalPages = Math.max(1, Number(inner.totalPages ?? 1));
        const total = Number(inner.total ?? all.length);
        if (all.length >= total || rows.length === 0) break;
      } else {
        totalPages = Math.max(1, Number(meta.totalPages ?? 1));
        if (rows.length === 0) break;
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
  const checks: Array<[keyof CreateUserInput, string | undefined]> = [
    ["name", intended.name],
    ["email", intended.email],
    ["phone", intended.phone],
    ["role", intended.role],
    ["specialization", intended.specialization],
    ["facility", intended.facility],
    ["status", intended.status],
  ];

  for (const [field, expected] of checks) {
    if (expected == null) continue;
    const actualValue = String(actual[field as keyof User] ?? "");
    if (normalizeText(expected) !== normalizeText(actualValue)) {
      throw fieldMismatch(field, String(expected), actualValue);
    }
  }
}

/**
 * Users domain service.
 *
 * List pipeline (authoritative in TS): all → search/filters → sort → paginate
 */
export const UserService = {
  async getCurrentUser(): Promise<CurrentUser> {
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
  },

  async listUsers(params: UserListParams = {}): Promise<PaginatedResult<User>> {
    const { page } = await this.listUsersWithCatalog(params);
    return page;
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
    const [users, facilityNameById, maps] = await Promise.all([
      loadAllUsers(),
      loadFacilityNameById(),
      OperationalWorkloadService.getMaps(),
    ]);
    const enriched = OperationalWorkloadService.applyToUsers(users, maps);
    return {
      catalog: enriched,
      page: queryUsersPage(enriched, params, facilityNameById),
    };
  },

  /** Unfiltered user catalog for filter option discovery (enriched — People only). */
  async fetchAllUsers(): Promise<User[]> {
    return OperationalWorkloadService.enrichUsers(await loadAllUsers());
  },

  async getUser(id: string): Promise<User | null> {
    try {
      const response = await apiClient.post<unknown>("/users", {
        resource: "users",
        action: "getById",
        payload: { id },
      });
      if (response.data == null) return null;
      return OperationalWorkloadService.enrichUser(
        mapRemoteUser(response.data as RemoteUser)
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createUser(input: CreateUserInput): Promise<User> {
    const clientRequestId = `usr-create-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    console.info("[UserService.createUser] dispatch", {
      clientRequestId,
      email: input.email,
      name: input.name,
    });

    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "create",
      payload: { ...input, _clientRequestId: clientRequestId },
    });
    if (response.data == null) {
      throw new ApiError("User create returned no record.", 502);
    }

    const raw = response.data as RemoteUser;
    const writeMeta = raw._write as
      | {
          buildMarker?: string;
          clientRequestId?: string;
          createInvocationCount?: number;
          generatedId?: string;
        }
      | undefined;
    if (!writeMeta || writeMeta.buildMarker !== USER_REPOSITORY_BUILD) {
      throw new ApiError(
        `User create used stale Apps Script (build ${writeMeta?.buildMarker ?? "missing"}; need ${USER_REPOSITORY_BUILD}). Redeploy UserRepository.gs before creating users.`,
        502
      );
    }

    console.info("[UserService.createUser] confirmed", {
      clientRequestId,
      responseClientRequestId: writeMeta.clientRequestId,
      generatedId: writeMeta.generatedId,
      createInvocationCount: writeMeta.createInvocationCount,
    });

    const created = mapRemoteUser(raw);
    if (!created.id) {
      throw new ApiError("User create returned a record without an id.", 502);
    }

    const verified = await UserService.getUser(created.id);
    if (!verified) {
      throw new ApiError(
        "User was created but could not be re-read from storage.",
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
      payload: { id, ...input },
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

  /** Soft-deactivate only — users are never deleted. */
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
