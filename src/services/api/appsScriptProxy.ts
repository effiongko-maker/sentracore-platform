/**
 * Shared Apps Script proxy helper used by Next.js API routes.
 * All module routes (users, facilities, assets, work-orders, incidents, maintenance)
 * call this helper — same EXEC URL, same fetch behavior.
 */

import {
  hintRowCount,
  recordAppsScriptPerf,
} from "@/services/api/perfMetrics";

/** Prefer env; default matches the verified public Web App EXEC URL. */
const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "https://script.google.com/macros/s/AKfycbz8DUM4MS2NTlEAeHsMVw9sGY0CyCdJwu_24mYJCpUwJWQb9FKEGABO2TEZhzKO-5Xm/exec";

/** TEMP DIAG — identify which /exec deployment is actually called. */
export function getAppsScriptUrlForDiagnostics(): string {
  return APPS_SCRIPT_URL;
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

export type AppsScriptProxyBody = {
  resource?: string;
  action?: string;
  payload?: unknown;
};

function parseJsonOrThrow(text: string, context: string) {
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

export async function postToAppsScript(
  body: AppsScriptProxyBody,
  defaults: { resource: string; action: string },
  logPrefix: string
) {
  const payload = JSON.stringify({
    resource: body.resource ?? defaults.resource,
    action: body.action ?? defaults.action,
    payload: body.payload ?? {},
  });

  // TEMP DIAG — facility persistence investigation
  console.info(`[${logPrefix}] apps-script-request`, {
    url: summarizeAppsScriptUrl(APPS_SCRIPT_URL),
    resource: body.resource ?? defaults.resource,
    action: body.action ?? defaults.action,
    payloadPreview:
      body.payload && typeof body.payload === "object"
        ? {
            id: (body.payload as Record<string, unknown>).id,
            facility: (body.payload as Record<string, unknown>).facility,
            name: (body.payload as Record<string, unknown>).name,
          }
        : body.payload,
  });

  // TEMP DIAG — user create / deployment tracing
  if ((body.action ?? defaults.action) === "create" && (body.resource ?? defaults.resource) === "users") {
    console.info(`[${logPrefix}] users-create-request`, {
      url: summarizeAppsScriptUrl(APPS_SCRIPT_URL),
      clientRequestId:
        body.payload && typeof body.payload === "object"
          ? (body.payload as Record<string, unknown>)._clientRequestId
          : undefined,
      email:
        body.payload && typeof body.payload === "object"
          ? (body.payload as Record<string, unknown>).email
          : undefined,
    });
  }

  const started = Date.now();
  const resource = body.resource ?? defaults.resource;
  const action = body.action ?? defaults.action;

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload,
      redirect: "follow",
    });

    const text = await response.text();
    const durationMs = Date.now() - started;

    if (!response.ok) {
      recordAppsScriptPerf({
        ts: new Date().toISOString(),
        kind: "apps_script_fetch",
        resource,
        action,
        logPrefix,
        ok: false,
        status: response.status,
        durationMs,
        requestBytes: payload.length,
        responseBytes: text.length,
        error: `${response.status} ${response.statusText}`,
      });
      console.warn(
        `[${logPrefix}] Apps Script ${response.status} ${response.statusText}`
      );
      throw new Error(
        `Apps Script request failed: ${response.status} ${response.statusText}`
      );
    }

    const parsed = parseJsonOrThrow(text, `[${logPrefix}] Apps Script response`);
    recordAppsScriptPerf({
      ts: new Date().toISOString(),
      kind: "apps_script_fetch",
      resource,
      action,
      logPrefix,
      ok: true,
      status: response.status,
      durationMs,
      requestBytes: payload.length,
      responseBytes: text.length,
      rowHint: hintRowCount(parsed),
    });
    console.info(`[${logPrefix}] apps-script-timing`, {
      resource,
      action,
      durationMs,
      responseBytes: text.length,
      rowHint: hintRowCount(parsed),
    });
    return parsed;
  } catch (error) {
    const durationMs = Date.now() - started;
    if (
      !(
        error instanceof Error &&
        error.message.startsWith("Apps Script request failed:")
      )
    ) {
      recordAppsScriptPerf({
        ts: new Date().toISOString(),
        kind: "apps_script_fetch",
        resource,
        action,
        logPrefix,
        ok: false,
        durationMs,
        requestBytes: payload.length,
        responseBytes: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
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
