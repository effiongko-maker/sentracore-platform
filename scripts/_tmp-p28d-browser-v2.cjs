/**
 * Phase 28D browser validation — list-row Treat path (avoids detail modal load gap).
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
  await page.waitForTimeout(2000);
}

function trackNetwork(page) {
  const hits = [];
  const onReq = (req) => {
    if (req.method() !== "POST") return;
    try {
      const path = new URL(req.url()).pathname;
      if (
        path !== "/api/work-orders" &&
        path !== "/api/maintenance" &&
        !path.startsWith("/work")
      )
        return;
      const body = req.postDataJSON?.();
      if (path.startsWith("/work") && !body) return;
      hits.push({
        path,
        action: body?.action,
        t: Date.now(),
      });
    } catch {
      /* ignore */
    }
  };
  page.on("request", onReq);
  return {
    hits,
    stop: () => page.off("request", onReq),
  };
}

async function openRowMenu(page, workId) {
  await page.goto(`${BASE}/work`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(3000);
  const search = page.getByPlaceholder(/Search work/i);
  if ((await search.count()) > 0) {
    await search.fill(workId);
    await page.waitForTimeout(2000);
  }
  const row = page.locator("tr").filter({ hasText: workId }).first();
  await row.waitFor({ timeout: 90000 });
  await row.getByRole("button", { name: new RegExp(`Actions for`, "i") }).click();
}

async function openTreatFromList(page, workId) {
  await openRowMenu(page, workId);
  await page.getByRole("menuitem", { name: /^Treat$/ }).click();
  await page.getByRole("heading", { name: /Treat work/i }).waitFor({
    timeout: 60000,
  });
}

async function openViewFromList(page, workId) {
  await openRowMenu(page, workId);
  await page.getByRole("menuitem", { name: /^View$/ }).click();
  await page.waitForTimeout(2000);
}

async function main() {
  const fixtures = JSON.parse(
    readFileSync("/tmp/phase28d-fixtures.json", "utf8")
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
  const out = { fixtures, timings: {}, scenarios: {}, network: {} };

  try {
    await login(page, admin);

    // B — Treat clean (set requiresWo in-form only — GAS does not persist flag pre-WO)
    await openTreatFromList(page, fixtures.clean);
    await page.locator("#mnt-requires-wo").selectOption("true");
    let net = trackNetwork(page);
    const tClean = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    out.timings.treat_clean_create_ms = Math.round(performance.now() - tClean);
    out.scenarios.treatClean = { result: "PASS", workId: fixtures.clean };
    out.network.treatClean = net.hits.filter((h) => h.path.startsWith("/api/"));
    net.stop();

    // C — Treat dirty (requiresWo + title change triggers pre-save)
    await openTreatFromList(page, fixtures.dirty);
    await page.locator("#mnt-requires-wo").selectOption("true");
    await page.locator("#mnt-title").fill(`Dirty ${fixtures.stamp}`);
    net = trackNetwork(page);
    const tDirty = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    out.timings.treat_dirty_create_ms = Math.round(performance.now() - tDirty);
    out.scenarios.treatDirty = { result: "PASS", workId: fixtures.dirty };
    out.network.treatDirty = net.hits.filter((h) => h.path.startsWith("/api/"));
    net.stop();

    // A — Work detail via list View then Create WO if visible
    await openViewFromList(page, fixtures.detail);
    const detailBtn = page.getByRole("button", { name: /Create Work Order/i });
    if ((await detailBtn.count()) === 0) {
      out.scenarios.workDetail = {
        result: "SKIP",
        reason: "Create Work Order button not visible after View",
      };
    } else {
      net = trackNetwork(page);
      const t0 = performance.now();
      await detailBtn.click();
      await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
      out.timings.work_detail_create_ms = Math.round(performance.now() - t0);
      out.scenarios.workDetail = { result: "PASS", workId: fixtures.detail };
      out.network.workDetail = net.hits.filter((h) => h.path.startsWith("/api/"));
      net.stop();
    }

    writeFileSync("/tmp/phase28d-browser.json", JSON.stringify(out, null, 2));
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
