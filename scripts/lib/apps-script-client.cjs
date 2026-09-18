/**
 * Server-style Apps Script client for repo smoke/spike scripts.
 * Sends APPS_SCRIPT_SHARED_SECRET when configured. Never hardcodes /exec.
 */
function resolveUrl() {
  const url =
    process.env.APPS_SCRIPT_URL || process.env.NEXT_PUBLIC_API_URL || "";
  if (!url) {
    throw new Error(
      "APPS_SCRIPT_URL (or NEXT_PUBLIC_API_URL) is required. Hardcoded /exec fallbacks were removed."
    );
  }
  return url;
}

async function postToAppsScript(resource, action, payload = {}) {
  const url = resolveUrl();
  const secret = (process.env.APPS_SCRIPT_SHARED_SECRET || "").trim();
  const body = {
    resource,
    action,
    payload,
    requestId: `smoke_${Date.now().toString(16)}`,
  };
  if (secret) body.sharedSecret = secret;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!json.success) {
    throw new Error(
      `${resource}/${action} failed: ${json.message || res.status}`
    );
  }
  return json.data;
}

module.exports = { postToAppsScript, resolveUrl };
