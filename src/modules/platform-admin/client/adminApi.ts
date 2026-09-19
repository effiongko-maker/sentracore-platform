/**
 * Browser client for the Super-Admin-gated platform-admin control plane.
 * Every write is server-authorised; the browser never holds privileged credentials.
 */

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function adminCall<T>(action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/platform-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action, ...payload }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AdminApiError("Unable to reach SentraCore™. Check your connection and try again.", 0);
  }
  let json: { success?: boolean; data?: T; message?: string; code?: string } = {};
  try {
    json = await response.json();
  } catch {
    throw new AdminApiError(`Unexpected response (status ${response.status}).`, response.status);
  }
  if (!response.ok || json.success === false) {
    throw new AdminApiError(json.message ?? `Request failed (status ${response.status}).`, response.status, json.code);
  }
  if (json.data === undefined) throw new AdminApiError("The control plane returned no data.", response.status);
  return json.data;
}
