/**
 * Phase 3 Intelligence — Insight surface browser verify.
 *   node scripts/verify-intelligence-insights.cjs
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";

function loadEnv() {
  const env = { ...process.env };
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

function assert(c, m) {
  if (!c) throw new Error(m);
}
function pathOf(page) {
  return new URL(page.url()).pathname;
}

async function main() {
  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (error) throw error;

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const results = [];

  try {
    await page.goto(
      `${BASE}/auth/callback?token_hash=${encodeURIComponent(
        linkData.properties.hashed_token
      )}&type=magiclink&next=/intelligence`,
      { waitUntil: "networkidle", timeout: 60000 }
    );

    await page.goto(`${BASE}/intelligence`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/intelligence", `intel failed: ${page.url()}`);
    results.push("PASS /intelligence loads");

    await page
      .getByText(/What have we learned about your operation/i)
      .first()
      .waitFor({ timeout: 60000 });
    results.push("PASS Insight framing");

    const body = await page.locator("body").innerText();
    assert(!/Operational health score/i.test(body), "dashboard health score");
    assert(!/\.px-rm-queue/i.test(await page.content()), "request queue bleed");
    results.push("PASS not a dashboard");

    const empty = /Nothing significant has surfaced yet/i.test(body);
    const cards = await page.locator(".ix-insight-card").count();
    if (empty) {
      results.push("PASS honest empty state (no fabricated insights)");
    } else {
      assert(cards > 0, "expected insight cards or empty state");
      results.push(`PASS ${cards} grounded insight card(s)`);
      await page.locator(".ix-insight-card").first().click();
      await page.getByRole("heading", { name: "Fact" }).waitFor({ timeout: 10000 });
      await page.getByRole("heading", { name: "Inference" }).waitFor();
      await page.getByRole("heading", { name: "Confidence" }).waitFor();
      results.push("PASS Fact / Inference / Confidence distinguishable");
    }

    await page.goto(`${BASE}/intelligence/changes`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/intelligence/changes", "changes route broken");
    results.push("PASS /intelligence/changes still functional");

    await page.goto(`${BASE}/intelligence/patterns`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/intelligence/patterns", "patterns route broken");
    results.push("PASS /intelligence/patterns still functional");

    await page.goto(`${BASE}/operations`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/operations", "home broken");
    results.push("PASS Home /operations");

    await page.goto(`${BASE}/reports`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/reports", "reports broken");
    results.push("PASS Reports");

    await page.screenshot({
      path: "/tmp/intelligence-insights.png",
      fullPage: true,
    });
    results.push("PASS screenshot");

    console.log("\n=== intelligence insights verify ===");
    for (const line of results) console.log(line);
    console.log("RESULT: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("RESULT: FAIL", err);
  process.exit(1);
});
