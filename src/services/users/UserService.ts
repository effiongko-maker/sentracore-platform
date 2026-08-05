import type { PaginatedResult } from "@/types";
import type {
  CreateUserInput,
  CurrentUser,
  UpdateUserInput,
  User,
  UserListParams,
  UserRole,
  UserStatus,
} from "@/modules/users/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";

/** Raw row shape from the Apps Script users API (may differ from domain User). */
type RemoteUser = Record<string, unknown>;

function mapRemoteUser(raw: RemoteUser): User {
  const role = String(raw.role ?? "viewer").toLowerCase() as UserRole;
  const status = String(raw.status ?? "pending").toLowerCase() as UserStatus;
  const workload = Number(raw.activeWorkOrders ?? raw.workload ?? 0);

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    phone: raw.phone ? String(raw.phone) : undefined,
    role,
    specialization: String(raw.specialization ?? ""),
    facility: String(raw.facility ?? ""),
    activeWorkOrders: Number.isFinite(workload) ? workload : 0,
    status,
    avatarUrl: raw.avatarUrl ? String(raw.avatarUrl) : undefined,
    lastActive: String(raw.lastActive ?? new Date().toISOString()),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
}

/**
 * Normalize Apps Script /api/users envelopes.
 *
 * Correct (Facilities-style):
 *   { data: User[], page, pageSize, total, totalPages }
 *
 * Broken double-wrap still seen on some Web App versions:
 *   { data: { data: User[], page, pageSize, total, totalPages }, page, totalPages }
 */
function unwrapUsersPayload(payload: unknown): {
  rows: unknown[];
  page?: unknown;
  pageSize?: unknown;
  total?: unknown;
  totalPages?: unknown;
} {
  if (Array.isArray(payload)) {
    return { rows: payload };
  }

  if (!payload || typeof payload !== "object") {
    return { rows: [] };
  }

  const outer = payload as Record<string, unknown>;

  // Shape B: { data: User[], ... }
  if (Array.isArray(outer.data)) {
    return {
      rows: outer.data,
      page: outer.page,
      pageSize: outer.pageSize,
      total: outer.total,
      totalPages: outer.totalPages,
    };
  }

  // Shape C: { data: { data: User[], ... }, page, totalPages }
  if (outer.data && typeof outer.data === "object") {
    const inner = outer.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) {
      return {
        rows: inner.data,
        page: inner.page ?? outer.page,
        pageSize: inner.pageSize ?? outer.pageSize,
        total: inner.total ?? outer.total,
        totalPages: inner.totalPages ?? outer.totalPages,
      };
    }
  }

  return { rows: [] };
}

function toPaginatedUsers(
  payload: unknown,
  params: UserListParams
): PaginatedResult<User> {
  const unwrapped = unwrapUsersPayload(payload);
  const data = unwrapped.rows.map((row) => mapRemoteUser(row as RemoteUser));

  return {
    data,
    page: Number(unwrapped.page ?? params.page ?? 1),
    pageSize: Number(unwrapped.pageSize ?? params.pageSize ?? data.length),
    total: Number(unwrapped.total ?? data.length),
    totalPages: Number(unwrapped.totalPages ?? 1),
  };
}

/**
 * Users domain service.
 *
 * Talks only to ApiClient — never to storage backends or UI details.
 * CRUD uses the live Apps Script envelope: { resource, action, payload }.
 */
export const UserService = {
  async getCurrentUser(): Promise<CurrentUser> {
    const response = await apiClient.get<CurrentUser>("/users/me");
    return response.data;
  },

  async listUsers(params: UserListParams = {}): Promise<PaginatedResult<User>> {
    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "getAll",
      payload: params,
    });

    return toPaginatedUsers(response.data, params);
  },
  async getUser(id: string): Promise<User | null> {
    try {
      const response = await apiClient.post<unknown>("/users", {
        resource: "users",
        action: "getById",
        payload: { id },
      });
      return mapRemoteUser(response.data as RemoteUser);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createUser(input: CreateUserInput): Promise<User> {
    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "create",
      payload: input,
    });
    return mapRemoteUser(response.data as RemoteUser);
  },

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "update",
      payload: { id, ...input },
    });
    return mapRemoteUser(response.data as RemoteUser);
  },

  /** Soft-deactivate only — users are never deleted. */
  async deactivateUser(id: string): Promise<User> {
    const response = await apiClient.post<unknown>("/users", {
      resource: "users",
      action: "deactivate",
      payload: { id },
    });
    return mapRemoteUser(response.data as RemoteUser);
  },
};

export type IUserService = typeof UserService;
