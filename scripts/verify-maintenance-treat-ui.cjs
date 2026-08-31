/**
 * Browser check: Treat label + Complete maintenance section.
 *   node scripts/verify-maintenance-treat-ui.cjs
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const results = [];

  try {
    await page.goto(
      `${BASE}/auth/callback?token_hash=${encodeURIComponent(
        linkData.properties.hashed_token
      )}&type=magiclink&next=/maintenance`,
      { waitUntil: "networkidle", timeout: 60000 }
    );
    await page.goto(`${BASE}/maintenance`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });

    // Prefer an active (non-completed) row
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    assert(rowCount > 0, "no maintenance rows");
    let opened = false;
    for (let i = 0; i < Math.min(rowCount, 12); i++) {
      const rowText = await rows.nth(i).innerText();
      if (/Completed|Cancelled/i.test(rowText)) continue;
      await rows.nth(i).locator("td:last-child button").first().click();
      const treat = page.getByRole("menuitem", { name: /^Treat$/ });
      if ((await treat.count()) > 0) {
        results.push("PASS Treat row action present");
        await treat.first().click();
        opened = true;
        break;
      }
      await page.keyboard.press("Escape");
    }
    assert(opened, "could not open Treat from an active row");

    await page.getByText("Treat maintenance").first().waitFor({ timeout: 15000 });
    results.push("PASS Treat modal title");

    await page.getByRole("heading", { name: /Complete maintenance/i }).waitFor({
      timeout: 10000,
    });
    await page.getByRole("button", { name: /Mark as completed/i }).waitFor({
      timeout: 10000,
    });
    results.push("PASS Complete maintenance section");

    const options = await page.locator("#mnt-status option").allTextContents();
    assert(
      !options.some((o) => /^Completed$/i.test(o.trim())),
      `Completed still in workflow select: ${options.join(", ")}`
    );
    assert(
      !options.some((o) => /^Cancelled$/i.test(o.trim())),
      `Cancelled still in workflow select: ${options.join(", ")}`
    );
    results.push("PASS Completed/Cancelled not in workflow status select");

    console.log("\n=== maintenance treat UI verify ===");
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
