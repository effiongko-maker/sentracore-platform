/**
 * Browser check: global notification bell (not Home Needs attention).
 *   node scripts/verify-operations-notifications-browser.cjs
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
      )}&type=magiclink&next=/finance`,
      { waitUntil: "domcontentloaded", timeout: 90000 }
    );
    await page.waitForURL((url) => !url.pathname.includes("/auth/"), {
      timeout: 90000,
    });

    // Bell is global header chrome — verify before waiting on Home workspace load.
    await page.goto(`${BASE}/finance`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    const bell = page.locator(".os-notify-bell");
    await bell.waitFor({ timeout: 60000 });
    assert((await bell.count()) === 1, "global notification bell missing");
    results.push("PASS global notification bell present on /finance");

    await bell.click();
    await page.locator(".os-notify-panel").waitFor({ timeout: 30000 });
    results.push("PASS notification panel opens");
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.locator("body").click({ position: { x: 8, y: 8 } });

    await page.goto(`${BASE}/operations`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForURL("**/operations", { timeout: 90000 });
    results.push("PASS landed on /operations");

    // Header bell remains on Operations
    assert(
      (await page.locator(".os-notify-bell").count()) === 1,
      "bell missing on /operations"
    );
    results.push("PASS bell remains on /operations");

    // Wait for Home content (workspace can be slow)
    await page
      .locator(".sc-fm-hero, #sc-fm-attention-heading")
      .first()
      .waitFor({ timeout: 120000 });

    assert(
      (await page.locator("#sc-fm-notify-heading").count()) === 0,
      "Home must not show Needs attention notification feed"
    );
    assert(
      (await page.locator("#sc-fm-attention-heading").count()) === 1,
      "Requires attention heading must remain"
    );
    results.push("PASS Home Requires attention kept; Needs attention removed");

    console.log(results.join("\n"));
    console.log("OK verify-operations-notifications-browser");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
