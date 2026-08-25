/**
 * Shared Apps Script proxy helper used by Next.js API routes.
 * All module routes (users, facilities, assets, work-orders, incidents, maintenance)
 * call this helper — same EXEC URL, same fetch behavior.
 */

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

  if (!response.ok) {
    console.warn(
      `[${logPrefix}] Apps Script ${response.status} ${response.statusText}`
    );
    throw new Error(
      `Apps Script request failed: ${response.status} ${response.statusText}`
    );
  }

  return parseJsonOrThrow(text, `[${logPrefix}] Apps Script response`);
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
