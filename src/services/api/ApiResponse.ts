/**
 * Standard envelope returned by ApiClient.
 * Domain services unwrap `data` — UI never depends on this shape directly.
 */
export interface ApiResponse<T> {
  success: boolean;
  status: number;
  data: T;
  message?: string;
}

export interface ApiRequestOptions {
  params?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, status = 200, message?: string): ApiResponse<T> {
  return { success: true, status, data, message };
}

export function fail(message: string, status = 400, payload?: unknown): never {
  throw new ApiError(message, status, payload);
}
