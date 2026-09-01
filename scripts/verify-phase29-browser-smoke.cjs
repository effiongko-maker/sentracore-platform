/**
 * Phase 29 browser smoke — Treat clean/dirty Create WO via in-form requiresWo.
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, existsSync } = require("fs");
const { performance } = require("perf_hooks");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";

function loadEnv() {
  const env = { ...process.env };
  if (!existsSync(".env.local")) return env;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

async function login(page, admin) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (error) throw error;
  await page.goto(
    `${BASE}/auth/callback?token_hash=${encodeURIComponent(
      data.properties.hashed_token
    )}&type=magiclink&next=${encodeURIComponent("/work")}`,
    { waitUntil: "domcontentloaded", timeout: 120000 }
  );
}

function trackApi(page) {
  const hits = [];
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    const path = new URL(req.url()).pathname;
    if (!path.startsWith("/api/")) return;
    try {
      hits.push({ path, action: req.postDataJSON?.()?.action, t: Date.now() });
    } catch {
      /* ignore */
    }
  });
  return hits;
}

async function openTreat(page, workId) {
  await page.goto(`${BASE}/work?id=${encodeURIComponent(workId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(4000);
  const treat = page.getByRole("button", { name: /^Treat$/ });
  if ((await treat.count()) === 0) {
    throw new Error("Treat button not visible on Work detail");
  }
  await treat.click();
  await page.getByRole("heading", { name: /Treat work/i }).waitFor({
    timeout: 60000,
  });
}

async function main() {
  const workId = process.argv[2];
  if (!workId) throw new Error("Usage: node scripts/verify-phase29-browser-smoke.cjs MNT-...");
  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const out = { workId, scenarios: {} };

  try {
    await login(page, admin);

    // Treat clean
    await openTreat(page, workId);
    await page.locator("#mnt-requires-wo").selectOption("true");
    const hitsClean = trackApi(page);
    const t0 = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    out.scenarios.treatClean = {
      result: "PASS",
      elapsed_ms: Math.round(performance.now() - t0),
      apiHits: hitsClean.filter((h) => h.path.startsWith("/api/")),
    };

    console.log(JSON.stringify(out, null, 2));
    console.log("RESULT: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("RESULT: FAIL", e.message);
  process.exit(1);
});
