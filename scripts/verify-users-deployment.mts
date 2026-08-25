/**
 * Probes the live Apps Script /exec deployment for Users module build info.
 *
 * Usage:
 *   npx tsx scripts/verify-users-deployment.mts
 *
 * Reads APPS_SCRIPT_URL or NEXT_PUBLIC_API_URL from .env.local when present.
 */

import fs from "node:fs";
import path from "node:path";

const EXPECTED_USER_BUILD = "2026-08-25-users-header-v3";

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnvLocal();
const execUrl =
  process.env.APPS_SCRIPT_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  env.APPS_SCRIPT_URL ??
  env.NEXT_PUBLIC_API_URL;

if (!execUrl) {
  console.error("Missing APPS_SCRIPT_URL / NEXT_PUBLIC_API_URL");
  process.exit(1);
}

function summarizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const deploymentId = parts[parts.length - 2] ?? parts[parts.length - 1] ?? "";
    return `${parsed.origin}/macros/s/...${deploymentId.slice(-12)}/exec`;
  } catch {
    return url;
  }
}

async function postEnvelope(body: Record<string, unknown>) {
  const response = await fetch(execUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const text = await response.text();
  return { status: response.status, text: text.trim() };
}

async function main() {
  console.log("Exec URL:", summarizeUrl(execUrl));
  console.log("Expected users build:", EXPECTED_USER_BUILD);
  console.log("");

  const getResult = await postEnvelope({});
  // doGet is GET-only; use fetch GET
  const getResponse = await fetch(execUrl, { redirect: "follow" });
  const getText = (await getResponse.text()).trim();

  let getJson: unknown;
  try {
    getJson = JSON.parse(getText);
  } catch {
    console.error("GET /exec did not return JSON");
    console.error(getText.slice(0, 300));
    process.exit(1);
  }

  console.log("GET health:", JSON.stringify(getJson, null, 2));

  const buildInfo = await postEnvelope({
    resource: "users",
    action: "buildInfo",
    payload: {},
  });

  console.log("");
  console.log("POST users.buildInfo status:", buildInfo.status);

  if (buildInfo.text.startsWith("<")) {
    console.error("POST returned HTML — deployment may block anonymous POST or URL is wrong.");
    console.error(buildInfo.text.slice(0, 200));
    process.exit(2);
  }

  let buildJson: {
    success?: boolean;
    data?: {
      buildMarker?: string;
      createPath?: string;
      createInvocationCount?: number;
    };
  };
  try {
    buildJson = JSON.parse(buildInfo.text);
  } catch {
    console.error("buildInfo response is not JSON:", buildInfo.text.slice(0, 200));
    process.exit(2);
  }

  console.log("POST users.buildInfo:", JSON.stringify(buildJson, null, 2));

  const liveBuild = buildJson.data?.buildMarker ?? null;
  const getBuild =
    getJson &&
    typeof getJson === "object" &&
    "data" in getJson &&
    getJson.data &&
    typeof getJson.data === "object" &&
    "builds" in getJson.data
      ? (getJson.data as { builds?: { users?: string } }).builds?.users
      : null;

  console.log("");
  console.log("Summary:");
  console.log("  doGet builds.users:", getBuild ?? "(missing — redeploy ROUTER.gs)");
  console.log("  users.buildInfo marker:", liveBuild ?? "(missing — stale deployment)");
  console.log("  create path:", buildJson.data?.createPath ?? "(unknown)");

  if (liveBuild === EXPECTED_USER_BUILD) {
    console.log("");
    console.log("OK — live /exec is serving the fixed UserRepository build.");
    process.exit(0);
  }

  console.log("");
  console.log(
    "NOT DEPLOYED — live build is",
    liveBuild ?? "missing",
    "but repo expects",
    EXPECTED_USER_BUILD + "."
  );
  console.log("Redeploy from apps-script/deployment/ before creating users.");
  process.exit(3);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
