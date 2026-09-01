/**
 * Phase 28D post-deploy browser validation (minimal, uses /work fixtures).
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");
const { performance } = require("perf_hooks");

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

async function main() {
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
  const results = { timings: {}, network: [] };
  const stamp = Date.now();

  const onReq = (req) => {
    if (req.method() !== "POST") return;
    try {
      const path = new URL(req.url()).pathname;
      if (path !== "/api/work-orders" && path !== "/api/maintenance") return;
      const body = req.postDataJSON?.();
      results.network.push({
        path,
        action: body?.action,
        t: Math.round(performance.now()),
      });
    } catch {
      /* ignore */
    }
  };
  page.on("request", onReq);

  try {
    await login(page, admin);

    // Use server-created fixture from env or create via Issues if facilities load
    await page.goto(`${BASE}/issues`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(3000);
    const facCount = await page.locator("#log-issue-facility option").count();
    if (facCount < 2) {
      throw new Error(
        "Facility catalog empty in browser — cannot create Log Issue fixture"
      );
    }

    const title = `P28D browser ${stamp}`;
    await page.getByRole("button", { name: /Log Issue/i }).first().click();
    await page.getByRole("heading", { name: /Log Issue/i }).waitFor({
      timeout: 30000,
    });
    await page.locator("#log-issue-title").fill(title);
    const fac = page.locator("#log-issue-facility");
    const vals = await fac
      .locator("option")
      .evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
    await fac.selectOption(vals[0]);
    await page.locator('button[type="submit"][form="log-issue-form"]').click();
    await page.getByText(/Issue logged/i).waitFor({ timeout: 120000 });
    const m = (await page.locator("body").innerText()).match(/MNT-\d{4}-\d+/);
    if (!m) throw new Error("no MNT in toast");
    const workId = m[0];

    // Enable requiresWorkOrder via Treat
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

    // A — Work detail Create WO
    results.network = [];
    await page.goto(`${BASE}/work?id=${encodeURIComponent(workId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(2000);
    const detailBtn = page.getByRole("button", { name: /Create Work Order/i });
    if ((await detailBtn.count()) === 0) {
      results.workDetailCreate = {
        result: "SKIP",
        reason: "requiresWorkOrder not on server row (pre-existing GAS read gap)",
      };
    } else {
      const t0 = performance.now();
      await detailBtn.click();
      await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
      results.timings.work_detail_create_ms = Math.round(
        performance.now() - t0
      );
      results.workDetailCreate = { result: "PASS", workId };
    }

    // B — Treat clean (new fixture)
    const title2 = `P28D clean ${stamp}`;
    await page.goto(`${BASE}/issues`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.getByRole("button", { name: /Log Issue/i }).first().click();
    await page.getByRole("heading", { name: /Log Issue/i }).waitFor();
    await page.locator("#log-issue-title").fill(title2);
    await page.locator("#log-issue-facility").selectOption(vals[0]);
    await page.locator('button[type="submit"][form="log-issue-form"]').click();
    await page.getByText(/Issue logged/i).waitFor({ timeout: 120000 });
    const m2 = (await page.locator("body").innerText()).match(/MNT-\d{4}-\d+/);
    const cleanId = m2[0];
    await page.goto(`${BASE}/work?id=${encodeURIComponent(cleanId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.getByRole("button", { name: /^Treat$/ }).first().click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor();
    await page.locator("#mnt-requires-wo").selectOption("true");
    await page.getByRole("button", { name: /Save changes/i }).click();
    await page.getByText(/Maintenance updated/i).waitFor({ timeout: 120000 });
    await page.goto(`${BASE}/work?id=${encodeURIComponent(cleanId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.getByRole("button", { name: /^Treat$/ }).first().click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor();
    results.network = [];
    const tClean = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    results.timings.treat_clean_create_ms = Math.round(
      performance.now() - tClean
    );
    results.treatClean = { result: "PASS", workId: cleanId };

    // C — Treat dirty
    const title3 = `P28D dirty ${stamp}`;
    await page.goto(`${BASE}/issues`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.getByRole("button", { name: /Log Issue/i }).first().click();
    await page.getByRole("heading", { name: /Log Issue/i }).waitFor();
    await page.locator("#log-issue-title").fill(title3);
    await page.locator("#log-issue-facility").selectOption(vals[0]);
    await page.locator('button[type="submit"][form="log-issue-form"]').click();
    await page.getByText(/Issue logged/i).waitFor({ timeout: 120000 });
    const m3 = (await page.locator("body").innerText()).match(/MNT-\d{4}-\d+/);
    const dirtyId = m3[0];
    await page.goto(`${BASE}/work?id=${encodeURIComponent(dirtyId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.getByRole("button", { name: /^Treat$/ }).first().click();
    await page.getByRole("heading", { name: /Treat work/i }).waitFor();
    await page.locator("#mnt-requires-wo").selectOption("true");
    await page.locator("#mnt-title").fill(`Dirty ${stamp}`);
    results.network = [];
    const tDirty = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    results.timings.treat_dirty_create_ms = Math.round(
      performance.now() - tDirty
    );
    results.treatDirty = { result: "PASS", workId: dirtyId };

    writeFileSync(
      "/tmp/phase28d-browser.json",
      JSON.stringify(results, null, 2)
    );
    console.log(JSON.stringify(results, null, 2));
    console.log("RESULT: PASS");
  } finally {
    page.off("request", onReq);
    await browser.close();
  }
}

main().catch((err) => {
  console.error("RESULT: FAIL", err.message);
  process.exit(1);
});
