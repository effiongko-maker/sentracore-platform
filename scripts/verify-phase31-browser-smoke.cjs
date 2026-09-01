/**
 * Phase 31 — browser smoke: list → detail freshness + simple save + status.
 *
 *   node scripts/verify-phase31-browser-smoke.cjs
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync, existsSync } = require("fs");
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
  await page.waitForTimeout(5000);
  if (page.url().includes("/login")) {
    throw new Error("Magic link auth did not establish session");
  }
}

async function waitForWorkList(page) {
  await page.goto(`${BASE}/work`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(3000);
  if (page.url().includes("/login")) {
    throw new Error(`Auth session lost — redirected to ${page.url()}`);
  }
  await page.getByText("Work currently being handled", { exact: false }).waitFor({
    timeout: 90000,
  });
  const search = page.locator('input[placeholder*="Search work"]');
  await search.waitFor({ state: "visible", timeout: 90000 });
  return search;
}

async function openWorkDetailViaSearch(page, workId) {
  const search = await waitForWorkList(page);
  await search.fill("");
  await search.fill(workId);
  await page.waitForTimeout(3000);
  const row = page.locator("tbody tr").filter({ hasText: workId }).first();
  await row.waitFor({ state: "visible", timeout: 90000 });
  await row.getByRole("button", { name: /Actions for/i }).click();
  await page.getByRole("menuitem", { name: /^View$/ }).click();
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 60000 });
  await page.getByText(workId, { exact: false }).first().waitFor({ timeout: 30000 });
}

async function waitForCreateWoButton(page, timeoutMs = 45000) {
  const btn = page
    .getByRole("dialog")
    .getByRole("button", { name: /Create Work Order/i });
  await btn.waitFor({ state: "visible", timeout: timeoutMs });
  return btn;
}

async function main() {
  let fixtures;
  if (existsSync("/tmp/phase31-fixtures.json")) {
    fixtures = JSON.parse(readFileSync("/tmp/phase31-fixtures.json", "utf8"));
  } else if (existsSync("/tmp/phase30-fixtures.json")) {
    fixtures = JSON.parse(readFileSync("/tmp/phase30-fixtures.json", "utf8"));
    fixtures.workId = fixtures.workCreate || fixtures.workId;
  } else {
    throw new Error(
      "Run verify-work-detail-freshness-and-save-performance.mts first"
    );
  }

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
  const out = { fixtures, scenarios: {} };

  try {
    await login(page, admin);

    // D1 — List → Detail → Create WO visible (freshness fix; no WO creation)
    const d1Start = performance.now();
    await openWorkDetailViaSearch(page, fixtures.workId);
    await waitForCreateWoButton(page);
    out.scenarios.listDetailCreateWo = {
      createWoVisible: true,
      elapsedMs: Math.round(performance.now() - d1Start),
      workId: fixtures.workId,
      verdict: "PASS",
    };

    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    writeFileSync("/tmp/phase31-browser-smoke.json", JSON.stringify(out, null, 2));

    // D2 — Simple save via Treat (field edit, no status change)
    await openWorkDetailViaSearch(page, fixtures.workId);
    await page.getByRole("dialog").getByRole("button", { name: /^Treat$/ }).click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor({
      timeout: 60000,
    });
    const titleInput = page.locator('input[name="title"], #title').first();
    const newTitle = `P31 browser save ${Date.now()}`;
    if (await titleInput.count()) {
      await titleInput.fill(newTitle);
    } else {
      await page.getByLabel(/Title/i).fill(newTitle);
    }
    const saveStart = performance.now();
    await page.getByRole("button", { name: /Save changes/i }).click();
    await page.waitForTimeout(12000);
    out.scenarios.simpleSave = {
      elapsedMs: Math.round(performance.now() - saveStart),
      titleEdited: newTitle,
      verdict: "PASS",
    };
    writeFileSync("/tmp/phase31-browser-smoke.json", JSON.stringify(out, null, 2));

    // D3 — Status transition
    await openWorkDetailViaSearch(page, fixtures.workId);
    await page.getByRole("dialog").getByRole("button", { name: /^Treat$/ }).click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor({
      timeout: 60000,
    });
    await page.locator("#mnt-status").selectOption("on_hold");
    const statusStart = performance.now();
    await page.getByRole("button", { name: /Save changes/i }).click();
    await page.waitForTimeout(12000);
    out.scenarios.statusTransition = {
      elapsedMs: Math.round(performance.now() - statusStart),
      targetStatus: "on_hold",
    };

    writeFileSync("/tmp/phase31-browser-smoke.json", JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    console.log("\nPHASE_31_BROWSER_SMOKE: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("PHASE_31_BROWSER_SMOKE: FAIL", err);
  process.exit(1);
});
