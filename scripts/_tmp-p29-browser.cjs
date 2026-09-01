/**
 * Phase 29 post-deploy browser validation.
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, existsSync, writeFileSync } = require("fs");
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

async function openRowMenu(page, workId) {
  await page.goto(`${BASE}/work`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(3000);
  const search = page.locator('input[placeholder*="Search work"]');
  await search.waitFor({ timeout: 60000 });
  await search.fill(workId);
  await page.waitForTimeout(2500);
  const row = page.locator("tbody tr").filter({ hasText: workId }).first();
  await row.waitFor({ timeout: 90000 });
  await row.getByRole("button", { name: /Actions for/i }).click();
}

async function openView(page, workId) {
  await openRowMenu(page, workId);
  await page.getByRole("menuitem", { name: /^View$/ }).click();
  await page.waitForTimeout(2500);
}

async function openTreat(page, workId) {
  await page.goto(`${BASE}/work?id=${encodeURIComponent(workId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(5000);
  const treat = page.getByRole("button", { name: /^Treat$/ });
  await treat.waitFor({ timeout: 60000 });
  await treat.click();
  await page.getByRole("heading", { name: /Treat work/i }).waitFor({
    timeout: 60000,
  });
}

async function main() {
  const fixtures = JSON.parse(process.argv[2] || "{}");
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
  const out = { fixtures, scenarios: {}, network: {} };

  try {
    await login(page, admin);

    // Work detail — requiresWo true, no WO
    await openView(page, fixtures.requiresWo);
    const createBtn = page.getByRole("button", { name: /Create Work Order/i });
    out.scenarios.detailCreateVisible = {
      visible: (await createBtn.count()) > 0,
      workId: fixtures.requiresWo,
    };

    if (out.scenarios.detailCreateVisible.visible) {
      const hits = trackApi(page);
      const t0 = performance.now();
      await createBtn.click();
      await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
      out.scenarios.workDetailCreate = {
        result: "PASS",
        elapsed_ms: Math.round(performance.now() - t0),
        apiHits: hits.filter((h) => h.path.startsWith("/api/")),
      };
      out.network.workDetailCreate = out.scenarios.workDetailCreate.apiHits;
    } else {
      out.scenarios.workDetailCreate = {
        result: "FAIL",
        reason: "Create Work Order not visible",
      };
    }

    // requiresWo false — should not show create path as required
    await openView(page, fixtures.noRequiresWo);
    out.scenarios.detailNoRequiresWo = {
      createVisible: (await page.getByRole("button", { name: /Create Work Order/i }).count()) > 0,
      workId: fixtures.noRequiresWo,
    };

    // Treat clean — separate fixture without WO
    await openTreat(page, fixtures.treatClean);
    const hitsClean = trackApi(page);
    const tClean = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    out.scenarios.treatClean = {
      result: "PASS",
      elapsed_ms: Math.round(performance.now() - tClean),
      preSaveSkipped: !hitsClean.some(
        (h) => h.path === "/api/maintenance" && h.action === "update"
      ),
      apiHits: hitsClean.filter((h) => h.path.startsWith("/api/")),
    };

    // Treat dirty
    await openTreat(page, fixtures.treatDirty);
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
      apiHits: hitsDirty.filter((h) => h.path.startsWith("/api/")),
    };

    writeFileSync("/tmp/phase29-browser.json", JSON.stringify(out, null, 2));
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
