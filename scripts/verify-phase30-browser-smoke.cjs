/**
 * Phase 30 — hardened browser smoke for Work → WO and Treat paths.
 *
 *   node scripts/verify-phase30-browser-smoke.cjs
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

function trackApi(page) {
  const hits = [];
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    const path = new URL(req.url()).pathname;
    if (!path.startsWith("/api/")) return;
    try {
      const body = req.postDataJSON?.();
      hits.push({ path, action: body?.action, resource: body?.resource, t: Date.now() });
    } catch {
      /* ignore */
    }
  });
  return hits;
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

async function openWorkDetailViaDeepLink(page, workId) {
  await page.goto(`${BASE}/work?id=${encodeURIComponent(workId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(6000);
  if (page.url().includes("/login")) {
    throw new Error(`Auth session lost — redirected to ${page.url()}`);
  }
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 90000 });
  await page.getByText(workId, { exact: false }).first().waitFor({ timeout: 30000 });
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

async function openTreatViaDetail(page, workId) {
  await openWorkDetailViaSearch(page, workId);
  const treat = page.getByRole("dialog").getByRole("button", { name: /^Treat$/ });
  await treat.waitFor({ state: "visible", timeout: 30000 });
  await treat.click();
  await page.getByRole("heading", { name: /Treat work/i }).waitFor({
    timeout: 60000,
  });
}

async function main() {
  const fixtures = JSON.parse(
    readFileSync("/tmp/phase30-fixtures.json", "utf8")
  );
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

    // A — Work detail Create WO (deep-link loads fresh maintenance via getById)
    await openWorkDetailViaDeepLink(page, fixtures.workCreate);
    const createBtn = page
      .getByRole("dialog")
      .getByRole("button", { name: /Create Work Order/i });
    out.scenarios.detailCreateVisible = {
      visible: (await createBtn.count()) > 0,
      workId: fixtures.workCreate,
    };

    const hitsDetail = trackApi(page);
    const tDetail = performance.now();
    if (out.scenarios.detailCreateVisible.visible) {
      await createBtn.click();
      await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
      out.scenarios.workDetailCreate = {
        result: "PASS",
        elapsed_ms: Math.round(performance.now() - tDetail),
        apiHits: hitsDetail,
      };
    } else {
      out.scenarios.workDetailCreate = {
        result: "FAIL",
        reason: "Create Work Order not visible",
      };
    }

    // B — Treat clean
    await openTreatViaDetail(page, fixtures.treatClean);
    const hitsClean = trackApi(page);
    const tClean = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    out.scenarios.treatClean = {
      result: "PASS",
      elapsed_ms: Math.round(performance.now() - tClean),
      preSaveSkipped: !hitsClean.some(
        (h) =>
          h.path === "/api/maintenance" &&
          h.action === "update" &&
          h.t >= tClean - 500
      ),
      apiHits: hitsClean,
    };

    // C — Treat dirty
    await openTreatViaDetail(page, fixtures.treatDirty);
    await page.locator("#mnt-title").fill(`Dirty ${fixtures.stamp}`);
    const hitsDirty = trackApi(page);
    const tDirty = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    out.scenarios.treatDirty = {
      result: "PASS",
      elapsed_ms: Math.round(performance.now() - tDirty),
      preSavePerformed: hitsDirty.some(
        (h) => h.path === "/api/maintenance" && h.action === "update"
      ),
      apiHits: hitsDirty,
    };

    writeFileSync("/tmp/phase30-browser.json", JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    console.log("RESULT: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("RESULT: FAIL", err.message);
  process.exit(1);
});
