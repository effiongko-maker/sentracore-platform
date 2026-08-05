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
