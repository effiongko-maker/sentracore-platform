/**
 * Phase 28C — Work operational performance browser validation.
 *
 *   node scripts/verify-work-operational-performance-browser.cjs
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

function assert(c, m) {
  if (!c) throw new Error(m);
}

async function login(page, admin) {
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (error) throw error;
  await page.goto(
    `${BASE}/auth/callback?token_hash=${encodeURIComponent(
      linkData.properties.hashed_token
    )}&type=magiclink&next=${encodeURIComponent("/work")}`,
    { waitUntil: "networkidle", timeout: 90000 }
  );
}

function trackMaintenanceList(page) {
  /** @type {{start:number,end?:number}[]} */
  const hits = [];
  const onReq = (req) => {
    if (req.method() !== "POST") return;
    try {
      if (new URL(req.url()).pathname !== "/api/maintenance") return;
      const body = req.postDataJSON?.();
      if (body?.action === "getAll") hits.push({ start: performance.now() });
    } catch {
      /* ignore */
    }
  };
  const onRes = (res) => {
    try {
      if (new URL(res.url()).pathname !== "/api/maintenance") return;
      const hit = [...hits].reverse().find((h) => !h.end);
      if (hit) hit.end = performance.now();
    } catch {
      /* ignore */
    }
  };
  page.on("request", onReq);
  page.on("response", onRes);
  return {
    stop() {
      page.off("request", onReq);
      page.off("response", onRes);
    },
    listReloadsAfter(sinceMs) {
      return hits.filter((h) => h.end != null && h.start >= sinceMs);
    },
  };
}

async function createWorkViaLogIssue(page, stamp) {
  const title = `P28C perf ${stamp}`;
  await page.goto(`${BASE}/issues`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByRole("button", { name: /Log Issue/i }).first().click();
  await page.getByRole("heading", { name: /Log Issue/i }).waitFor();
  await page.locator("#log-issue-title").fill(title);
  const fac = page.locator("#log-issue-facility");
  const vals = await fac
    .locator("option")
    .evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
  await fac.selectOption(vals[0]);
  await page.locator('button[type="submit"][form="log-issue-form"]').click();
  await page.getByText(/Issue logged/i).waitFor({ timeout: 120000 });
  const m = (await page.locator("body").innerText()).match(/MNT-\d{4}-\d+/);
  assert(m, "no MNT in toast");
  return { id: m[0], title };
}

async function openTreat(page, workId) {
  await page.goto(`${BASE}/work?id=${encodeURIComponent(workId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByRole("button", { name: /^Treat$/ }).first().click();
  await page.getByRole("heading", { name: /Treat work/i }).waitFor({
    timeout: 30000,
  });
}

async function saveRequiresWorkOrder(page) {
  await page.locator("#mnt-requires-wo").selectOption("true");
  await page.getByRole("button", { name: /Save changes/i }).click();
  await page.getByText(/Maintenance updated/i).waitFor({ timeout: 120000 });
  await page
    .getByRole("heading", { name: /Treat work/i })
    .waitFor({ state: "hidden", timeout: 30000 });
}

async function openWorkDetail(page, workId) {
  await page.goto(`${BASE}/work?id=${encodeURIComponent(workId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByRole("heading", { name: "Formal execution" }).waitFor({
    timeout: 60000,
  });
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
  const results = [];
  const timings = {};
  const stamp = Date.now();

  try {
    await login(page, admin);

    // A — Simple Treat save (separate fixture)
    const { id: saveWorkId } = await createWorkViaLogIssue(page, `${stamp}-save`);
    await openTreat(page, saveWorkId);
    await page.locator("#mnt-title").fill(`P28C save ${stamp}`);
    const listTracker = trackMaintenanceList(page);
    const saveStart = performance.now();
    await page.getByRole("button", { name: /Save changes/i }).click();
    await page.getByText(/Maintenance updated/i).waitFor({ timeout: 120000 });
    timings.simple_work_save_ms = Math.round(performance.now() - saveStart);
    await page.waitForTimeout(1200);
    const reloads = listTracker.listReloadsAfter(saveStart);
    listTracker.stop();
    assert(reloads.length === 0, `list reload after save: ${reloads.length}`);
    results.push(
      `PASS A simple Treat save ${timings.simple_work_save_ms}ms; no getAll reload`
    );

    // C1 — Treat clean → Create WO
    const { id: cleanId } = await createWorkViaLogIssue(page, `${stamp}-clean`);
    await openTreat(page, cleanId);
    await saveRequiresWorkOrder(page);
    await openTreat(page, cleanId);
    const treatCleanStart = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    timings.create_wo_from_treat_clean_ms = Math.round(
      performance.now() - treatCleanStart
    );
    results.push(
      `PASS C1 Treat clean → Create WO ${timings.create_wo_from_treat_clean_ms}ms`
    );

    // C2 — Treat dirty → Create WO
    const { id: dirtyId } = await createWorkViaLogIssue(page, `${stamp}-dirty`);
    await openTreat(page, dirtyId);
    await page.locator("#mnt-requires-wo").selectOption("true");
    await page.locator("#mnt-title").fill(`Dirty ${stamp}`);
    const treatDirtyStart = performance.now();
    await page.getByRole("button", { name: /Create new work order/i }).click();
    await page.getByText(/Work order created/i).waitFor({ timeout: 120000 });
    timings.create_wo_from_treat_dirty_ms = Math.round(
      performance.now() - treatDirtyStart
    );
    results.push(
      `PASS C2 Treat dirty → Create WO ${timings.create_wo_from_treat_dirty_ms}ms`
    );

    writeFileSync(
      "/tmp/phase28c-browser-perf.json",
      JSON.stringify({ measuredAt: new Date().toISOString(), timings, results }, null, 2)
    );

    console.log("\n=== phase 28c browser validation ===");
    for (const line of results) console.log(line);
    console.log("\nTIMINGS:", JSON.stringify(timings, null, 2));
    console.log("RESULT: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("RESULT: FAIL", err);
  process.exit(1);
});
