/**
 * Phase 28D browser — direct ?id= deep link + detail modal Treat path.
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

async function main() {
  const workId = process.argv[2] || "MNT-2026-000493";
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
  const hits = trackApi(page);

  try {
    await login(page, admin);
    await page.goto(`${BASE}/work?id=${encodeURIComponent(workId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(5000);
    const treatBtn = page.getByRole("button", { name: /^Treat$/ });
    if ((await treatBtn.count()) === 0) {
      console.log(JSON.stringify({ workId, result: "FAIL", reason: "Treat button not in detail modal" }));
      process.exit(1);
    }
    await treatBtn.click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor({ timeout: 60000 });
    await page.locator("#mnt-requires-wo").selectOption("true");
    const t0 = performance.now();
    const before = hits.length;
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    const elapsed = Math.round(performance.now() - t0);
    const apiHits = hits.slice(before);
    console.log(
      JSON.stringify(
        { workId, result: "PASS", elapsed_ms: elapsed, apiHits },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
