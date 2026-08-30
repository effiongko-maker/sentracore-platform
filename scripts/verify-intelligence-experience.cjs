/**
 * Phase 3.1 Intelligence experience browser verify.
 *   node scripts/verify-intelligence-experience.cjs
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
    assert(pathOf(page) === "/intelligence", page.url());
    results.push("PASS /intelligence");

    await page.getByRole("heading", { name: /What have we learned/i }).waitFor({
      timeout: 60000,
    });
    await page.getByText(/Organisation intelligence/i).first().waitFor();
    results.push("PASS header + context");

    const body = await page.locator("body").innerText();
    assert(!/Operational health score/i.test(body), "no dashboard score");
    assert(!/Ask AI/i.test(body), "no Ask AI");
    results.push("PASS not dashboard / not chatbot");

    const empty = /Nothing significant has surfaced yet/i.test(body);
    if (empty) {
      results.push("PASS honest empty");
    } else {
      assert(/meaningful finding/i.test(body), "summary line missing");
      const primary = page.locator(".ix-exp-primary");
      if ((await primary.count()) > 0) {
        await primary.getByText(/What we know/i).waitFor();
        await primary.getByText(/What we think/i).waitFor();
        results.push("PASS primary finding Fact/Inference");
        await primary.getByRole("button", { name: /Review evidence/i }).click();
        await page.getByRole("heading", { name: /What we know/i }).first().waitFor();
        await page.getByText(/Related operations/i).waitFor();
        results.push("PASS investigation panel");
        await page.getByRole("button", { name: /← Intelligence/i }).click();
      } else {
        results.push("INFO no primary (may be emerging-only)");
      }
    }

    for (const route of [
      "/intelligence/changes",
      "/intelligence/patterns",
      "/operations",
      "/reports",
    ]) {
      await page.goto(`${BASE}${route}`, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
      assert(pathOf(page) === route, `${route} failed`);
      results.push(`PASS ${route}`);
    }

    // /home does not exist — operations is Home
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
    results.push(`PASS / (${pathOf(page)})`);

    await page.screenshot({
      path: "/tmp/intelligence-experience.png",
      fullPage: true,
    });
    results.push("PASS screenshot");

    console.log("\n=== intelligence experience verify ===");
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
