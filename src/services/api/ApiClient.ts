import type {
  CreateUserInput,
  CurrentUser,
  PaginatedResult,
  UpdateUserInput,
  User,
  UserListParams,
} from "@/types";
import {
  ApiError,
  fail,
  ok,
  type ApiRequestOptions,
  type ApiResponse,
} from "./ApiResponse";

/**
 * Transport layer for all SentraCore HTTP calls.
 *
 * Domain services (UserService, etc.) must call only this client.
 * Today responses are mocked in-process. When the remote API is ready,
 * replace the mock handlers below — no service or UI changes required.
 *
 * The frontend never references Spreadsheets or other storage backends.
 */

const LATENCY_MS = 280;

function delay(ms = LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── In-memory mock store (temporary; removed when live API lands) ───────────

const usersStore: User[] = [
  {
    id: "usr_001",
    name: "Amara Okonkwo",
    email: "amara.okonkwo@sentracore.com",
    phone: "+234 801 234 5678",
    role: "admin",
    specialization: "Administration",
    facility: "Lagos HQ",
    activeWorkOrders: 0,
    status: "active",
    lastActive: "2026-08-03T10:12:00Z",
    createdAt: "2024-01-12T09:00:00Z",
  },
  {
    id: "usr_002",
    name: "James Whitfield",
    email: "james.whitfield@sentracore.com",
    phone: "+44 7700 900123",
    role: "manager",
    specialization: "Building Management",
    facility: "Docklands Campus",
    activeWorkOrders: 3,
    status: "active",
    lastActive: "2026-08-03T09:45:00Z",
    createdAt: "2024-03-18T11:30:00Z",
  },
  {
    id: "usr_003",
    name: "Priya Sharma",
    email: "priya.sharma@sentracore.com",
    phone: "+44 7700 900456",
    role: "supervisor",
    specialization: "HVAC",
    facility: "Lagos HQ",
    activeWorkOrders: 5,
    status: "active",
    lastActive: "2026-08-02T16:20:00Z",
    createdAt: "2024-05-02T08:15:00Z",
  },
  {
    id: "usr_004",
    name: "Daniel Mensah",
    email: "daniel.mensah@sentracore.com",
    phone: "+233 24 555 0192",
    role: "technician",
    specialization: "Electrical",
    facility: "Accra Hub",
    activeWorkOrders: 4,
    status: "active",
    lastActive: "2026-08-03T08:05:00Z",
    createdAt: "2024-07-21T14:00:00Z",
  },
  {
    id: "usr_005",
    name: "Elena Rossi",
    email: "elena.rossi@sentracore.com",
    role: "viewer",
    specialization: "Administration",
    facility: "Docklands Campus",
    activeWorkOrders: 0,
    status: "pending",
    lastActive: "2026-07-28T12:00:00Z",
    createdAt: "2026-07-28T12:00:00Z",
  },
  {
    id: "usr_006",
    name: "Kwame Asante",
    email: "kwame.asante@sentracore.com",
    phone: "+233 20 111 8844",
    role: "technician",
    specialization: "Mechanical",
    facility: "Plant West",
    activeWorkOrders: 0,
    status: "inactive",
    lastActive: "2026-06-14T09:30:00Z",
    createdAt: "2023-11-09T10:00:00Z",
  },
  {
    id: "usr_007",
    name: "Sophie Laurent",
    email: "sophie.laurent@sentracore.com",
    phone: "+33 6 12 34 56 78",
    role: "manager",
    specialization: "General Operations",
    facility: "Nairobi Centre",
    activeWorkOrders: 2,
    status: "active",
    lastActive: "2026-08-03T07:55:00Z",
    createdAt: "2025-01-15T09:45:00Z",
  },
  {
    id: "usr_008",
    name: "Marcus Chen",
    email: "marcus.chen@sentracore.com",
    role: "supervisor",
    specialization: "Fire & Safety",
    facility: "Docklands Campus",
    activeWorkOrders: 1,
    status: "suspended",
    lastActive: "2026-07-01T15:10:00Z",
    createdAt: "2024-09-03T13:20:00Z",
  },
  {
    id: "usr_009",
    name: "Fatima Al-Hassan",
    email: "fatima.alhassan@sentracore.com",
    phone: "+234 803 998 2211",
    role: "technician",
    specialization: "Plumbing",
    facility: "Lagos HQ",
    activeWorkOrders: 6,
    status: "active",
    lastActive: "2026-08-02T18:40:00Z",
    createdAt: "2025-04-11T08:00:00Z",
  },
  {
    id: "usr_010",
    name: "Oliver Brooks",
    email: "oliver.brooks@sentracore.com",
    role: "viewer",
    specialization: "Administration",
    facility: "All Facilities",
    activeWorkOrders: 0,
    status: "pending",
    lastActive: "2026-08-01T11:25:00Z",
    createdAt: "2026-08-01T11:25:00Z",
  },
  {
    id: "usr_011",
    name: "Ngozi Adeyemi",
    email: "ngozi.adeyemi@sentracore.com",
    phone: "+234 809 441 0033",
    role: "manager",
    specialization: "Building Management",
    facility: "Lagos HQ",
    activeWorkOrders: 1,
    status: "active",
    lastActive: "2026-08-03T06:50:00Z",
    createdAt: "2024-02-20T10:10:00Z",
  },
  {
    id: "usr_012",
    name: "Liam O'Connor",
    email: "liam.oconnor@sentracore.com",
    phone: "+353 87 555 0144",
    role: "technician",
    specialization: "HVAC",
    facility: "Docklands Campus",
    activeWorkOrders: 3,
    status: "active",
    lastActive: "2026-08-02T20:15:00Z",
    createdAt: "2025-06-30T16:45:00Z",
  },
];

const currentUser: CurrentUser = {
  id: "usr_001",
  name: "Amara Okonkwo",
  email: "amara.okonkwo@sentracore.com",
  role: "admin",
  avatarInitials: "AO",
};

function asString(value: unknown) {
  return value === undefined || value === null ? undefined : String(value);
}

function filterUsers(params: UserListParams): User[] {
  const search = params.search?.toLowerCase().trim() ?? "";
  const status = params.status;
  const role = params.role;
  const facility = params.facility;

  return usersStore.filter((user) => {
    const matchesSearch =
      !search ||
      user.name.toLowerCase().includes(search) ||
      user.email.toLowerCase().includes(search) ||
      user.specialization.toLowerCase().includes(search) ||
      user.facility.toLowerCase().includes(search) ||
      (user.phone?.toLowerCase().includes(search) ?? false);

    const matchesStatus =
      !status || status === "all" || user.status === status;

    const matchesRole = !role || role === "all" || user.role === role;

    const matchesFacility =
      !facility || facility === "all" || user.facility === facility;

    return matchesSearch && matchesStatus && matchesRole && matchesFacility;
  });
}

async function mockUsersRequest(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<ApiResponse<unknown>> {
  await delay();

  if (method === "GET" && path === "/users/me") {
    return ok({ ...currentUser });
  }

  if (method === "GET" && path === "/users") {
    const params = (options?.params ?? {}) as UserListParams;
    const page = Number(params.page ?? 1);
    const pageSize = Number(params.pageSize ?? 8);
    const filtered = filterUsers({
      search: asString(params.search),
      status: asString(params.status) as UserListParams["status"],
      role: asString(params.role) as UserListParams["role"],
      facility: asString(params.facility),
    });
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const data: PaginatedResult<User> = {
      data: filtered.slice(start, start + pageSize).map((user) => ({ ...user })),
      total,
      page,
      pageSize,
      totalPages,
    };
    return ok(data);
  }

  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch) {
    const id = userMatch[1];

    if (method === "GET") {
      const user = usersStore.find((entry) => entry.id === id);
      if (!user) fail(`User ${id} not found`, 404);
      return ok({ ...user });
    }

    if (method === "PUT") {
      const index = usersStore.findIndex((entry) => entry.id === id);
      if (index === -1) fail(`User ${id} not found`, 404);

      const input = (body ?? {}) as UpdateUserInput;
      const current = usersStore[index];
      const updated: User = {
        ...current,
        name: input.name?.trim() ?? current.name,
        email: input.email?.trim().toLowerCase() ?? current.email,
        phone:
          input.phone !== undefined
            ? input.phone.trim() || undefined
            : current.phone,
        role: input.role ?? current.role,
        specialization: input.specialization?.trim() ?? current.specialization,
        facility: input.facility?.trim() ?? current.facility,
        status: input.status ?? current.status,
        activeWorkOrders: current.activeWorkOrders,
      };
      usersStore[index] = updated;
      return ok({ ...updated });
    }

    if (method === "DELETE") {
      fail("Users cannot be deleted. Use deactivate instead.", 405);
    }
  }

  const deactivateMatch = path.match(/^\/users\/([^/]+)\/deactivate$/);
  if (deactivateMatch && method === "POST") {
    const id = deactivateMatch[1];
    const index = usersStore.findIndex((entry) => entry.id === id);
    if (index === -1) fail(`User ${id} not found`, 404);
    const updated: User = { ...usersStore[index], status: "inactive" };
    usersStore[index] = updated;
    return ok({ ...updated });
  }

  if (method === "POST" && path === "/users") {
    const input = body as CreateUserInput;
    const user: User = {
      id: `usr_${Date.now()}`,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || undefined,
      role: input.role,
      specialization: input.specialization.trim(),
      facility: input.facility.trim(),
      activeWorkOrders: 0,
      status: input.status,
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    usersStore.unshift(user);
    return ok({ ...user }, 201);
  }

  fail(`No mock handler for ${method} ${path}`, 404);
}

async function mockRequest(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<ApiResponse<unknown>> {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (normalized === "/users" || normalized.startsWith("/users/")) {
    return mockUsersRequest(method, normalized, body, options);
  }

  await delay();
  fail(`No mock handler for ${method} ${normalized}`, 404);
}

// ─── Public client ───────────────────────────────────────────────────────────

export class ApiClient {
  get<T>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return mockRequest("GET", path, undefined, options) as Promise<
      ApiResponse<T>
    >;
  }

  async post<T>(
    path: string,
    body?: unknown,
    options?: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    // Live proxy routes → Next.js API → Apps Script.
    // Frontend never calls Apps Script directly.
    const liveProxy =
      path === "/users"
        ? { endpoint: "/api/users", resource: "users" }
        : path === "/facilities"
          ? { endpoint: "/api/facilities", resource: "facilities" }
          : path === "/assets"
            ? { endpoint: "/api/assets", resource: "assets" }
            : null;

    if (liveProxy) {
      const response = await fetch(liveProxy.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options?.headers,
        },
        body: JSON.stringify(
          body ?? {
            resource: liveProxy.resource,
            action: "getAll",
            payload: {},
          }
        ),
        signal: options?.signal,
      });

      // Diagnose before assuming JSON (HTML 404/redirect pages break response.json()).
      const text = await response.text();
      console.log(`[ApiClient.post ${path}]`);
      console.log("  status:", response.status);
      console.log("  url:", response.url);
      console.log("  content-type:", response.headers.get("content-type"));
      console.log(
        "  headers:",
        Object.fromEntries(response.headers.entries())
      );
      console.log("  body (first 400 chars):", text.slice(0, 400));

      const trimmed = text.trim();
      if (!trimmed || trimmed.startsWith("<")) {
        throw new ApiError(
          `Expected JSON from ${liveProxy.endpoint} but received HTML (status ${response.status}). Is the Next.js route at src/app/api/${liveProxy.resource}/route.ts?`,
          response.status,
          trimmed.slice(0, 200)
        );
      }

      let json: ApiResponse<T>;
      try {
        json = JSON.parse(trimmed) as ApiResponse<T>;
      } catch {
        throw new ApiError(
          `Invalid JSON from ${liveProxy.endpoint} (status ${response.status})`,
          response.status,
          trimmed.slice(0, 200)
        );
      }

      console.log(`[ApiClient.post ${path}] parsed JSON:`, json);

      if (!response.ok || json.success === false) {
        throw new ApiError(
          json.message ?? `Request failed with status ${response.status}`,
          response.status || json.status || 500,
          json
        );
      }

      return {
        success: true,
        status: response.status,
        data: json.data,
        message: json.message,
      };
    }

    return mockRequest("POST", path, body, options) as Promise<ApiResponse<T>>;
  }

  put<T>(
    path: string,
    body?: unknown,
    options?: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    return mockRequest("PUT", path, body, options) as Promise<ApiResponse<T>>;
  }

  delete<T>(
    path: string,
    options?: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    return mockRequest("DELETE", path, undefined, options) as Promise<
      ApiResponse<T>
    >;
  }
}

/** Shared singleton used by all domain services. */
export const apiClient = new ApiClient();

/** Shared latency helper for non-user mock services during the transition. */
export { delay };
