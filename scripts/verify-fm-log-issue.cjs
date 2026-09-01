/**
 * Phase 8 — FM Log Issue + unified Issues browser smoke.
 *   node scripts/verify-fm-log-issue.cjs
 *
 * Requires app on SMOKE_BASE_URL (default http://localhost:3000).
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
  const stamp = Date.now();

  try {
    await page.goto(
      `${BASE}/auth/callback?token_hash=${encodeURIComponent(
        linkData.properties.hashed_token
      )}&type=magiclink&next=/issues`,
      { waitUntil: "networkidle", timeout: 60000 }
    );
    await page.goto(`${BASE}/issues`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/issues", `expected /issues got ${page.url()}`);
    results.push("PASS /issues loads");

    await page.getByRole("heading", { name: /^Issues$/ }).waitFor({
      timeout: 30000,
    });
    results.push("PASS Issues heading");

    // Sidebar restored for Facility Management
    await page.getByText("Facility Management").first().waitFor({
      timeout: 15000,
    });
    await page.getByRole("link", { name: /^Issues$/ }).first().waitFor({
      timeout: 10000,
    });
    await page.getByRole("link", { name: /^Maintenance$/ }).first().waitFor({
      timeout: 10000,
    });
    results.push("PASS full Facility Management sidebar on /issues");

    // Pagination controls when enough rows (range label always when rows exist)
    const range = page.getByText(/Showing \d+[–-]\d+ of \d+ issues/i);
    if ((await range.count()) > 0) {
      results.push("PASS Issues range/count label present");
    } else {
      results.push("PASS Issues list empty or loading range skipped");
    }

    // Ordinary Log Issue
    const listFetchAfter = [];
    const onResp = (res) => {
      try {
        const u = new URL(res.url());
        if (
          res.request().method() === "POST" &&
          ["/api/requests", "/api/maintenance", "/api/incidents"].includes(
            u.pathname
          )
        ) {
          listFetchAfter.push({ path: u.pathname, status: res.status() });
        }
      } catch {
        /* ignore */
      }
    };

    await page.getByRole("button", { name: /Log Issue/i }).click();
    await page.getByRole("heading", { name: /Log Issue/i }).waitFor();
    await page
      .locator("label")
      .filter({ hasText: /^Ordinary facility problem/ })
      .click();
    await page
      .locator("#log-issue-title")
      .fill(`P8 ordinary leak ${stamp}`);
    const facility = page.locator("#log-issue-facility");
    await facility.waitFor();
    const options = await facility.locator("option").allTextContents();
    assert(options.length > 1, "no facilities for Log Issue");
    await facility.selectOption({ index: 1 });
    listFetchAfter.length = 0;
    page.on("response", onResp);
    await page.locator('button[type="submit"][form="log-issue-form"]').click();
    const outcome = await Promise.race([
      page
        .getByText(/Issue logged/i)
        .waitFor({ timeout: 90000 })
        .then(() => "success"),
      page
        .getByText(/Could not log Issue/i)
        .waitFor({ timeout: 90000 })
        .then(() => "error"),
    ]);
    if (outcome === "error") {
      page.off("response", onResp);
      const body = await page.locator("body").innerText();
      throw new Error(
        `Log Issue failed (toast). Body snippet: ${body.slice(0, 800)}`
      );
    }
    results.push("PASS Log Issue ordinary success toast");
    await page.waitForSelector(`text=P8 ordinary leak ${stamp}`, {
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    page.off("response", onResp);
    const postSuccessListFetches = listFetchAfter.filter((e) =>
      ["/api/requests", "/api/maintenance", "/api/incidents"].includes(e.path)
    );
    assert(
      postSuccessListFetches.length === 0,
      `Phase 9: unexpected list refetch after FM Log Issue: ${JSON.stringify(
        postSuccessListFetches
      )}`
    );
    results.push("PASS no Requests/Maintenance/Incidents list refetch after FM log");
    results.push("PASS Log Issue ordinary → appears in list");

    await page.getByText(`P8 ordinary leak ${stamp}`).first().click();
    await page.getByRole("link", { name: /^Treat$/ }).first().waitFor({
      timeout: 20000,
    });
    const investigateOnOrdinary = await page
      .getByRole("link", { name: /^Investigate$/ })
      .count();
    assert(investigateOnOrdinary === 0, "ordinary must not show Investigate");
    const resolveOnOrdinary = await page
      .getByRole("link", { name: /^Resolve$/ })
      .count();
    assert(resolveOnOrdinary === 0, "no Resolve action on active Issue");
    results.push("PASS ordinary Issue actions: Treat, no Investigate/Resolve");

    // Significant Log Issue
    await page.getByRole("button", { name: /Log Issue/i }).first().click();
    await page
      .locator("label")
      .filter({ hasText: /^Significant event/ })
      .click();
    await page
      .locator("#log-issue-title")
      .fill(`P8 significant flood ${stamp}`);
    await facility.selectOption({ index: 1 });
    await page.locator('button[type="submit"][form="log-issue-form"]').click();
    await page.waitForSelector(`text=P8 significant flood ${stamp}`, {
      timeout: 90000,
    });
    results.push("PASS Log Issue significant → appears in list");

    await page.getByText(`P8 significant flood ${stamp}`).first().click();
    await page.getByRole("link", { name: /^Investigate$/ }).first().waitFor({
      timeout: 20000,
    });
    const treatOnSignificant = await page
      .getByRole("link", { name: /^Treat$/ })
      .count();
    assert(treatOnSignificant === 0, "significant must not show Treat");
    results.push("PASS significant Issue actions: Investigate, no Treat");

    // Request Queue route still works (demoted from nav; deep-link preserved)
    await page.goto(`${BASE}/requests`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/requests", "requests route");
    results.push("PASS Request Queue route still reachable");

    await page.goto(`${BASE}/occupant-requests/track`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    results.push(`PASS Track Request reachable (${pathOf(page)})`);

    // Request Queue should not be a primary Work nav item
    await page.goto(`${BASE}/issues`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    const rqNav = await page
      .locator("nav")
      .getByRole("link", { name: /^Request Queue$/ })
      .count();
    assert(rqNav === 0, "Request Queue should be demoted from primary nav");
    results.push("PASS Request Queue demoted from primary nav");

    console.log("\n=== fm log issue browser verify ===");
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
