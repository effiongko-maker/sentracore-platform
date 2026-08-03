/**
 * Shared Apps Script proxy helper used by Next.js API routes.
 * Behavior matches the Users /api/users implementation exactly.
 */

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "https://script.google.com/macros/s/AKfycbz8DUM4MS2NTlEAeHsMVw9sGY0CyCdJwu_24mYJCpUwJWQb9FKEGABO2TEZhzKO-5Xm/exec";

export type AppsScriptProxyBody = {
  resource?: string;
  action?: string;
  payload?: unknown;
};

async function readAndLog(label: string, response: Response, logPrefix: string) {
  const text = await response.text();
  const headers = Object.fromEntries(response.headers.entries());

  console.log(`[${logPrefix}] ${label}`);
  console.log("  status:", response.status);
  console.log("  url:", response.url);
  console.log("  content-type:", response.headers.get("content-type"));
  console.log("  headers:", headers);
  console.log("  body (first 400 chars):", text.slice(0, 400));

  return text;
}

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

  console.log(`[${logPrefix}] POST → Apps Script`, APPS_SCRIPT_URL);

  const initial = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: payload,
    redirect: "manual",
  });

  if (initial.status >= 300 && initial.status < 400) {
    const location = initial.headers.get("location");
    await readAndLog("initial 3xx response", initial, logPrefix);

    if (!location) {
      throw new Error(
        `Apps Script returned ${initial.status} without Location header`
      );
    }

    console.log(`[${logPrefix}] Following redirect with GET →`, location);

    const redirected = await fetch(location, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      redirect: "follow",
    });

    const text = await readAndLog("redirect GET response", redirected, logPrefix);

    if (!redirected.ok) {
      throw new Error(
        `Apps Script redirect target failed: ${redirected.status} ${redirected.statusText}`
      );
    }

    return parseJsonOrThrow(text, "Apps Script redirect GET");
  }

  const text = await readAndLog("direct response", initial, logPrefix);

  if (!initial.ok) {
    throw new Error(
      `Apps Script request failed: ${initial.status} ${initial.statusText}`
    );
  }

  return parseJsonOrThrow(text, "Apps Script direct response");
}
