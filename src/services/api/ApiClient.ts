import type { CurrentUser } from "@/types";
import { traceRequest } from "@/services/debug/requestTrace";
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
 * Domain services must call only this client.
 * Module CRUD (users, facilities, assets, …) uses live POST proxies to
 * Next.js → Apps Script. Remaining mocks are session-only (e.g. /users/me).
 *
 * The frontend never references Spreadsheets or other storage backends.
 */

const LATENCY_MS = 280;

function delay(ms = LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Session stub only — Users CRUD is live via POST /api/users. */
const currentUser: CurrentUser = {
  id: "usr_001",
  name: "Mr. Bode",
  email: "bode@sentracore.com",
  role: "admin",
  avatarInitials: "MB",
};

async function mockRequest(
  method: string,
  path: string,
  _body?: unknown,
  _options?: ApiRequestOptions
): Promise<ApiResponse<unknown>> {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (method === "GET" && normalized === "/users/me") {
    await delay();
    return ok({ ...currentUser });
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
            : path === "/work-orders"
              ? { endpoint: "/api/work-orders", resource: "work-orders" }
              : path === "/incidents"
                ? { endpoint: "/api/incidents", resource: "incidents" }
                : path === "/maintenance"
                  ? { endpoint: "/api/maintenance", resource: "maintenance" }
                  : path === "/master-data"
                    ? {
                        endpoint: "/api/master-data",
                        resource: "master-data",
                      }
                    : path === "/reporting-snapshot"
                      ? {
                          endpoint: "/api/reporting-snapshot",
                          resource: "reporting-snapshot",
                        }
                      : null;

    if (liveProxy) {
      return traceRequest(`ApiClient.post ${path}`, async () => {
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
      });
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
