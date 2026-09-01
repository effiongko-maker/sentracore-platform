/**
 * Phase 16 — Work / WIP browser smoke.
 *   node scripts/verify-work-wip-browser.cjs
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
  const title = `P16 WIP valve ${stamp}`;
  let rootId = null;

  try {
    await page.goto(
      `${BASE}/auth/callback?token_hash=${encodeURIComponent(
        linkData.properties.hashed_token
      )}&type=magiclink&next=/work`,
      { waitUntil: "networkidle", timeout: 90000 }
    );
    await page.goto(`${BASE}/work`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/work", `expected /work got ${page.url()}`);
    await page.getByRole("heading", { name: /^Work$/ }).first().waitFor({
      timeout: 30000,
    });
    await page.getByRole("heading", { name: /^WIP$/ }).first().waitFor({
      timeout: 10000,
    });
    results.push("PASS /work + WIP headings");

    const nav = page.locator("nav").first();
    assert(
      (await nav.getByRole("link", { name: /^Work$/ }).count()) > 0,
      "Work nav missing"
    );
    assert(
      (await nav.getByRole("link", { name: /^Request Queue$/ }).count()) === 0,
      "Request Queue returned"
    );
    results.push("PASS Work nav; Request Queue absent");

    const search = page.getByPlaceholder(/Search work/i);
    await search.waitFor({ timeout: 15000 });
    await search.fill("MNT");
    await page.waitForTimeout(1200);
    results.push("PASS search");

    await page.getByRole("button", { name: /Filters/i }).first().click();
    await page.locator("#work-filter-status").waitFor({ timeout: 10000 });
    await page.locator("#work-filter-status").selectOption("in_progress");
    await page.waitForTimeout(1200);
    results.push("PASS filters");

    await page.goto(`${BASE}/issues`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
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
          listFetchAfter.push(u.pathname);
        }
      } catch {
        /* ignore */
      }
    };

    await page.getByRole("button", { name: /Log Issue/i }).click();
    await page.locator("#log-issue-title").fill(title);
    const fac = page.locator("#log-issue-facility");
    const vals = await fac
      .locator("option")
      .evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
    await fac.selectOption(vals[0]);
    page.on("response", onResp);
    await page.locator('button[type="submit"][form="log-issue-form"]').click();
    await page.getByText(/Issue logged/i).waitFor({ timeout: 120000 });
    const toastBody = await page.locator("body").innerText();
    const m = toastBody.match(/MNT-\d{4}-\d+/);
    assert(m, "no MNT in toast");
    rootId = m[0];
    await page.waitForSelector(`text=${title}`, { timeout: 60000 });
    await page.waitForTimeout(1500);
    page.off("response", onResp);
    assert(
      listFetchAfter.length === 0,
      `Phase 9 triple-fetch: ${JSON.stringify(listFetchAfter)}`
    );
    results.push(`PASS Log Issue → ${rootId}; no post-success list refetch`);

    await page.getByText(title).first().click();
    await page.getByRole("link", { name: /^Treat$/ }).first().waitFor({
      timeout: 20000,
    });
    const treatHref = await page
      .getByRole("link", { name: /^Treat$/ })
      .first()
      .getAttribute("href");
    assert(treatHref && treatHref.includes("/work"), `Treat href ${treatHref}`);
    await page.getByRole("link", { name: /^Treat$/ }).first().click();
    await page.waitForURL(/\/work/, { timeout: 30000 });
    await page.getByRole("button", { name: /^Treat$/ }).first().click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor({
      timeout: 20000,
    });
    results.push("PASS Treat → /work → Treat work form");

    const completedAt = page.locator("#mnt-completed-at");
    if ((await completedAt.count()) > 0) {
      const val = await completedAt.inputValue();
      if (!val) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        await completedAt.fill(
          `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
        );
      }
    }
    await page.locator("#mnt-completion-notes").fill(`P16 complete ${stamp}`);
    await page.getByRole("button", { name: /Mark as completed/i }).click();
    await page.waitForTimeout(3500);
    results.push("PASS completion");

    await page.goto(`${BASE}/work?id=${encodeURIComponent(rootId)}`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await page.waitForTimeout(2000);
    const detail = await page.locator("body").innerText();
    assert(/Open Issue|Issue/i.test(detail), "Issue context missing");
    results.push("PASS Work detail + Issue context");

    await page.goto(`${BASE}/incidents`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(
      !(await page.locator("body").innerText()).includes(title),
      "Incident created from flow"
    );
    results.push("PASS no Incident from Log Issue flow");

    await page.goto(`${BASE}/maintenance`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/maintenance", "maintenance compat");
    results.push("PASS /maintenance compatibility route");

    await page.goto(`${BASE}/work-orders`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/work-orders", "work orders");
    results.push("PASS Work Orders route");

    await page.goto(`${BASE}/occupant-requests/track`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    results.push(`PASS Track Request (${pathOf(page)})`);

    console.log("\n=== work wip browser verify ===");
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
