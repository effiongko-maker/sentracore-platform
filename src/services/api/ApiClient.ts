import { traceRequest } from "@/services/debug/requestTrace";
import {
  ApiError,
  fail,
  type ApiRequestOptions,
  type ApiResponse,
} from "./ApiResponse";

/**
 * Transport layer for all SentraCore HTTP calls.
 *
 * Domain services must call only this client.
 * Module CRUD (users, facilities, assets, …) uses live POST proxies to
 * Next.js → Apps Script. Platform identity uses /api/auth/me (Supabase Auth).
 *
 * The frontend never references Spreadsheets or other storage backends.
 *
 * Retry policy (bounded, transient-only):
 * - Retry network failures and HTTP 408/429/502/503/504.
 * - Never retry validation/schema failures (4xx with Apps Script validation).
 * - Max 2 retries with short backoff — avoids storms; sharedRequest coalesces peers.
 */

const LATENCY_MS = 280;
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_BASE_MS = 350;

function delay(ms = LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function isValidationFailure(
  status: number,
  message: string,
  meta?: { errorClass?: string; retryable?: boolean }
): boolean {
  if (meta?.errorClass === "validation") return true;
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return true;
  }
  return /missing headers|is required|validation|cannot write sheet fields/i.test(
    message
  );
}

function shouldRetryFailure(
  status: number,
  message: string,
  meta?: { errorClass?: string; retryable?: boolean }
): boolean {
  if (meta?.retryable === true) return true;
  if (meta?.retryable === false) return false;
  if (isValidationFailure(status, message, meta)) return false;
  return isTransientHttpStatus(status);
}

async function mockRequest(
  method: string,
  path: string,
  _body?: unknown,
  _options?: ApiRequestOptions
): Promise<ApiResponse<unknown>> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
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
                  : path === "/approvals"
                    ? { endpoint: "/api/approvals", resource: "approvals" }
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
        let attempt = 0;
        // attempt 0 = first try; retries up to MAX_TRANSIENT_RETRIES
        while (true) {
          try {
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

            const text = await response.text();
            const trimmed = text.trim();
            if (!trimmed || trimmed.startsWith("<")) {
              const err = new ApiError(
                `Expected JSON from ${liveProxy.endpoint} but received HTML (status ${response.status}). Is the Next.js route at src/app/api/${liveProxy.resource}/route.ts?`,
                response.status,
                trimmed.slice(0, 200)
              );
              if (
                attempt < MAX_TRANSIENT_RETRIES &&
                isTransientHttpStatus(response.status)
              ) {
                attempt += 1;
                await sleep(RETRY_BASE_MS * attempt);
                continue;
              }
              throw err;
            }

            let json: ApiResponse<T> & {
              meta?: { errorClass?: string; retryable?: boolean };
            };
            try {
              json = JSON.parse(trimmed) as typeof json;
            } catch {
              throw new ApiError(
                `Invalid JSON from ${liveProxy.endpoint} (status ${response.status})`,
                response.status,
                trimmed.slice(0, 200)
              );
            }

            if (!response.ok || json.success === false) {
              const message =
                json.message ??
                `Request failed with status ${response.status}`;
              const status = response.status || json.status || 500;
              const meta = json.meta;
              if (
                attempt < MAX_TRANSIENT_RETRIES &&
                shouldRetryFailure(status, message, meta)
              ) {
                attempt += 1;
                await sleep(RETRY_BASE_MS * attempt);
                continue;
              }
              throw new ApiError(message, status, json);
            }

            return {
              success: true,
              status: response.status,
              data: json.data,
              message: json.message,
            };
          } catch (error) {
            if (error instanceof ApiError) throw error;
            if (options?.signal?.aborted) throw error;
            // Network / fetch throw — treat as transient.
            if (attempt < MAX_TRANSIENT_RETRIES) {
              attempt += 1;
              await sleep(RETRY_BASE_MS * attempt);
              continue;
            }
            throw error;
          }
        }
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
