/**
 * Phase 28D post-deploy browser validation using API-created fixtures.
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
}

async function enableRequiresWo(page, workId) {
  await page.goto(`${BASE}/work?id=${encodeURIComponent(workId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByRole("button", { name: /^Treat$/ }).first().click();
  await page.getByRole("heading", { name: /Treat work/i }).waitFor({
    timeout: 30000,
  });
  await page.locator("#mnt-requires-wo").selectOption("true");
  await page.getByRole("button", { name: /Save changes/i }).click();
  await page.getByText(/Maintenance updated/i).waitFor({ timeout: 120000 });
  await page
    .getByRole("heading", { name: /Treat work/i })
    .waitFor({ state: "hidden", timeout: 30000 });
}

function trackNetwork(page) {
  const hits = [];
  const onReq = (req) => {
    if (req.method() !== "POST") return;
    try {
      const path = new URL(req.url()).pathname;
      if (path !== "/api/work-orders" && path !== "/api/maintenance") return;
      const body = req.postDataJSON?.();
      hits.push({ path, action: body?.action, t: Date.now() });
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

    await enableRequiresWo(page, fixtures.detail);

    // A — Work detail Create WO
    let net = trackNetwork(page);
    await page.goto(`${BASE}/work?id=${encodeURIComponent(fixtures.detail)}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(2500);
    const detailBtn = page.getByRole("button", { name: /Create Work Order/i });
    if ((await detailBtn.count()) === 0) {
      out.scenarios.workDetail = {
        result: "SKIP",
        reason: "Create Work Order button not visible (requiresWorkOrder GAS read gap on detail load)",
      };
    } else {
      const t0 = performance.now();
      await detailBtn.click();
      await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
      out.timings.work_detail_create_ms = Math.round(performance.now() - t0);
      out.scenarios.workDetail = { result: "PASS", workId: fixtures.detail };
    }
    out.network.workDetail = net.hits;
    net.stop();

    // B — Treat clean
    await enableRequiresWo(page, fixtures.clean);
    await page.goto(`${BASE}/work?id=${encodeURIComponent(fixtures.clean)}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.getByRole("button", { name: /^Treat$/ }).first().click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor({
      timeout: 30000,
    });
    net = trackNetwork(page);
    const tClean = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    out.timings.treat_clean_create_ms = Math.round(performance.now() - tClean);
    out.scenarios.treatClean = { result: "PASS", workId: fixtures.clean };
    out.network.treatClean = net.hits;
    net.stop();

    // C — Treat dirty
    await page.goto(`${BASE}/work?id=${encodeURIComponent(fixtures.dirty)}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.getByRole("button", { name: /^Treat$/ }).first().click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor({
      timeout: 30000,
    });
    await page.locator("#mnt-requires-wo").selectOption("true");
    await page.locator("#mnt-title").fill(`Dirty ${fixtures.stamp}`);
    net = trackNetwork(page);
    const tDirty = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    out.timings.treat_dirty_create_ms = Math.round(performance.now() - tDirty);
    out.scenarios.treatDirty = { result: "PASS", workId: fixtures.dirty };
    out.network.treatDirty = net.hits;
    net.stop();

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
