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

function toPaginatedUsers(
  payload: unknown,
  params: UserListParams
): PaginatedResult<User> {
  // Shape A: User[]
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

  // Shape B: { data: User[], page, pageSize, total, totalPages }
  if (payload && typeof payload === "object") {
    const page = payload as Record<string, unknown>;
    const rows = Array.isArray(page.data) ? page.data : [];
    return {
      data: rows.map((row) => mapRemoteUser(row as RemoteUser)),
      page: Number(page.page ?? params.page ?? 1),
      pageSize: Number(page.pageSize ?? params.pageSize ?? rows.length),
      total: Number(page.total ?? rows.length),
      totalPages: Number(page.totalPages ?? 1),
    };
  }

  return {
    data: [],
    page: 1,
    pageSize: params.pageSize ?? 8,
    total: 0,
    totalPages: 1,
  };
}

/**
 * Users domain service.
 *
 * Talks only to ApiClient — never to storage backends or UI details.
 * When the remote API goes live, ApiClient changes; this file stays the same.
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
      const response = await apiClient.get<User>(`/users/${id}`);
      return response.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createUser(input: CreateUserInput): Promise<User> {
    const response = await apiClient.post<User>("/users", input);
    return response.data;
  },

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const response = await apiClient.put<User>(`/users/${id}`, input);
    return response.data;
  },

  /** Soft-deactivate only — users are never deleted. */
  async deactivateUser(id: string): Promise<User> {
    const response = await apiClient.post<User>(`/users/${id}/deactivate`);
    return response.data;
  },
};

export type IUserService = typeof UserService;
