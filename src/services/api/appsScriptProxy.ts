/**
 * Shared Apps Script proxy used by Next.js server code.
 * Browser callers must go through `/api/*` — they never receive the shared secret.
 */

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

const APPS_SCRIPT_SHARED_SECRET_ENV = "APPS_SCRIPT_SHARED_SECRET";

export type AppsScriptOutcomeKind =
  | "success_data"
  | "success_empty"
  | "backend_error"
  | "timeout"
  | "malformed_response"
  | "http_error"
  | "auth_error";

export type AppsScriptProxyBody = {
  resource?: string;
  action?: string;
  payload?: unknown;
  requestId?: string;
};

export class AppsScriptTransportError extends Error {
  readonly kind: AppsScriptOutcomeKind;
  readonly requestId: string;
  readonly resource: string;
  readonly action: string;
  readonly httpStatus?: number;
  readonly durationMs: number;

  constructor(
    message: string,
    options: {
      kind: AppsScriptOutcomeKind;
      requestId: string;
      resource: string;
      action: string;
      httpStatus?: number;
      durationMs: number;
    }
  ) {
    super(message);
    this.name = "AppsScriptTransportError";
    this.kind = options.kind;
    this.requestId = options.requestId;
    this.resource = options.resource;
    this.action = options.action;
    this.httpStatus = options.httpStatus;
    this.durationMs = options.durationMs;
  }
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function resolveAppsScriptUrl(): string {
  const configured =
    process.env.APPS_SCRIPT_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";
  if (configured) return configured;
  if (isProductionRuntime()) {
    throw new Error(
      "APPS_SCRIPT_URL is required in production. Refusing hardcoded /exec fallback."
    );
  }
  throw new Error(
    "APPS_SCRIPT_URL (or NEXT_PUBLIC_API_URL for local development) is not configured."
  );
}

function resolveSharedSecret(): string | null {
  const secret = process.env[APPS_SCRIPT_SHARED_SECRET_ENV]?.trim() || "";
  if (secret) return secret;
  if (isProductionRuntime()) {
    throw new Error(
      `${APPS_SCRIPT_SHARED_SECRET_ENV} is required in production. Direct Apps Script calls must not be anonymous.`
    );
  }
  console.warn(
    `[fm.apps_script] ${APPS_SCRIPT_SHARED_SECRET_ENV} is unset; development calls are unauthenticated until Apps Script enforces the secret.`
  );
  return null;
}

export function getAppsScriptUrlForDiagnostics(): string {
  try {
    return resolveAppsScriptUrl();
  } catch {
    return "";
  }
}

export function summarizeAppsScriptUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const deploymentId = parts[parts.length - 2] ?? parts[parts.length - 1] ?? "";
    const tail = deploymentId.slice(-12);
    return `${parsed.origin}/macros/s/...${tail}/exec`;
  } catch {
    return "(invalid APPS_SCRIPT_URL)";
  }
}

function classifyEnvelopeFailure(message: string): AppsScriptOutcomeKind {
  const lower = message.toLowerCase();
  if (/unauthorized|shared secret|auth/.test(lower)) return "auth_error";
  if (/timed out|timeout|exceeded maximum execution/.test(lower)) return "timeout";
  return "backend_error";
}

function classifyOutcome(data: unknown): AppsScriptOutcomeKind {
  if (data == null) return "success_empty";
  if (Array.isArray(data)) {
    return data.length === 0 ? "success_empty" : "success_data";
  }
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data.length === 0 ? "success_empty" : "success_data";
    }
    if (typeof record.total === "number") {
      return record.total === 0 ? "success_empty" : "success_data";
    }
  }
  return "success_data";
}

function parseJsonOrThrow(text: string, context: string): unknown {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<")) {
    throw new Error(
      `${context}: expected JSON but received HTML/non-JSON (starts with ${JSON.stringify(trimmed.slice(0, 40))})`
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(
      `${context}: JSON.parse failed. Body starts with ${JSON.stringify(trimmed.slice(0, 80))}`
    );
  }
}

function logTransport(event: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      channel: "fm.apps_script",
      ...event,
    })
  );
}

export async function postToAppsScript(
  body: AppsScriptProxyBody,
  defaults: { resource: string; action: string },
  logPrefix: string
): Promise<unknown> {
  const requestId = body.requestId?.trim() || newRequestId();
  const resource = body.resource ?? defaults.resource;
  const action = body.action ?? defaults.action;
  const started = Date.now();
  const url = resolveAppsScriptUrl();
  const secret = resolveSharedSecret();

  const envelope: Record<string, unknown> = {
    resource,
    action,
    payload: body.payload ?? {},
    requestId,
  };
  if (secret) {
    envelope.sharedSecret = secret;
  }

  logTransport({
    event: "request",
    requestId,
    logPrefix,
    resource,
    action,
    url: summarizeAppsScriptUrl(url),
    auth: secret ? "shared_secret" : "unauthenticated_dev",
  });

  try {
    let response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(envelope),
      redirect: "manual",
    });

    if (response.status === 301 || response.status === 302 || response.status === 303) {
      const location = response.headers.get("location");
      if (!location) {
        throw new AppsScriptTransportError(
          `Apps Script redirect missing Location header (${response.status})`,
          {
            kind: "http_error",
            requestId,
            resource,
            action,
            httpStatus: response.status,
            durationMs: Date.now() - started,
          }
        );
      }
      response = await fetch(location, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    }

    const durationMs = Date.now() - started;
    const text = await response.text();

    if (!response.ok) {
      const kind: AppsScriptOutcomeKind =
        response.status === 408 || response.status === 504 ? "timeout" : "http_error";
      logTransport({
        event: "response",
        requestId,
        logPrefix,
        resource,
        action,
        durationMs,
        ok: false,
        kind,
        httpStatus: response.status,
      });
      throw new AppsScriptTransportError(
        `Apps Script request failed: ${response.status} ${response.statusText}`,
        {
          kind,
          requestId,
          resource,
          action,
          httpStatus: response.status,
          durationMs,
        }
      );
    }

    let parsed: unknown;
    try {
      parsed = parseJsonOrThrow(text, `[${logPrefix}] Apps Script response`);
    } catch (error) {
      logTransport({
        event: "response",
        requestId,
        logPrefix,
        resource,
        action,
        durationMs,
        ok: false,
        kind: "malformed_response",
        httpStatus: response.status,
      });
      throw new AppsScriptTransportError(
        error instanceof Error ? error.message : "Malformed Apps Script response",
        {
          kind: "malformed_response",
          requestId,
          resource,
          action,
          httpStatus: response.status,
          durationMs,
        }
      );
    }

    const envelopeResult = parsed as {
      success?: boolean;
      message?: string;
      data?: unknown;
      meta?: { requestId?: string; errorClass?: string };
    };
    if (
      envelopeResult &&
      typeof envelopeResult === "object" &&
      envelopeResult.success === false
    ) {
      const message = envelopeResult.message ?? "Apps Script request failed";
      const kind = classifyEnvelopeFailure(message);
      logTransport({
        event: "response",
        requestId,
        logPrefix,
        resource,
        action,
        durationMs,
        ok: false,
        kind,
        httpStatus: response.status,
        envelopeSuccess: false,
        errorClass: envelopeResult.meta?.errorClass,
      });
      throw new AppsScriptTransportError(message, {
        kind,
        requestId,
        resource,
        action,
        httpStatus: kind === "auth_error" ? 401 : 400,
        durationMs,
      });
    }

    const kind = classifyOutcome(
      envelopeResult && typeof envelopeResult === "object" && "data" in envelopeResult
        ? envelopeResult.data
        : parsed
    );
    logTransport({
      event: "response",
      requestId,
      logPrefix,
      resource,
      action,
      durationMs,
      ok: true,
      kind,
      httpStatus: response.status,
      envelopeSuccess: true,
    });
    return parsed;
  } catch (error) {
    if (error instanceof AppsScriptTransportError) throw error;
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : "Apps Script request failed";
    const kind: AppsScriptOutcomeKind = /timeout|timed out|abort/i.test(message)
      ? "timeout"
      : "http_error";
    logTransport({
      event: "response",
      requestId,
      logPrefix,
      resource,
      action,
      durationMs,
      ok: false,
      kind,
    });
    throw new AppsScriptTransportError(message, {
      kind,
      requestId,
      resource,
      action,
      durationMs,
    });
  }
}

/**
 * Server-side Apps Script call that unwraps the envelope.
 * Used by domain services when running outside the browser (Server Actions /
 * scripts), where relative `/api/*` fetches are not valid.
 */
export async function postToAppsScriptData(
  body: AppsScriptProxyBody,
  defaults: { resource: string; action: string },
  logPrefix: string
): Promise<unknown> {
  const raw = await postToAppsScript(body, defaults, logPrefix);
  const envelope = raw as {
    data?: unknown;
    success?: boolean;
    message?: string;
  };

  if (envelope && typeof envelope === "object" && envelope.success === false) {
    const message = envelope.message ?? "Apps Script request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = /not found/i.test(message) ? 404 : 400;
    throw err;
  }

  if (envelope && typeof envelope === "object" && "data" in envelope) {
    return envelope.data;
  }

  return raw;
}
