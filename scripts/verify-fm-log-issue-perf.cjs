/**
 * Phase 9 — measure FM Log Issue E2E after performance optimization.
 * Does not modify application behaviour beyond measurement.
 *
 *   node scripts/verify-fm-log-issue-perf.cjs
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");
const { performance } = require("perf_hooks");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";
const RUNS = Number(process.env.PERF_RUNS || 3);

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

function avg(nums) {
  return nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
}

async function measure(page, classification, stamp, run) {
  const title = `P9 PERF ${classification} ${stamp}-${run}`;
  await page.getByRole("button", { name: /Log Issue/i }).first().click();
  await page.getByRole("heading", { name: /Log Issue/i }).waitFor();
  if (classification === "ordinary") {
    await page
      .locator("label")
      .filter({ hasText: /^Ordinary facility problem/ })
      .click();
  } else {
    await page
      .locator("label")
      .filter({ hasText: /^Significant event/ })
      .click();
  }
  await page.locator("#log-issue-title").fill(title);
  await page.locator("#log-issue-facility").selectOption({ index: 1 });

  /** @type {{path:string,start:number,end?:number,status?:number}[]} */
  const net = [];
  const onReq = (req) => {
    if (req.method() !== "POST") return;
    try {
      const path = new URL(req.url()).pathname;
      if (path === "/issues" || path.startsWith("/api/")) {
        net.push({ path, start: performance.now() });
      }
    } catch {
      /* ignore */
    }
  };
  const onRes = (res) => {
    const url = res.url();
    const hit = [...net].reverse().find((e) => !e.end && url.includes(e.path));
    if (hit) {
      hit.end = performance.now();
      hit.status = res.status();
    }
  };
  page.on("request", onReq);
  page.on("response", onRes);

  const t0 = performance.now();
  await page.locator('button[type="submit"][form="log-issue-form"]').click();
  await page.getByText(/Issue logged/i).waitFor({ timeout: 120000 });
  const tToast = performance.now();
  await page
    .getByRole("heading", { name: /Log Issue/i })
    .waitFor({ state: "hidden", timeout: 30000 })
    .catch(() => {});
  const tModal = performance.now();
  await page.waitForSelector(`text=${title}`, { timeout: 60000 });
  const tRender = performance.now();
  await page.waitForTimeout(1200);
  page.off("request", onReq);
  page.off("response", onRes);

  const completed = net
    .filter((e) => e.end != null)
    .map((e) => ({
      path: e.path,
      ms: Math.round(e.end - e.start),
      status: e.status,
      afterToast: e.start >= tToast - 50,
    }));
  const action = completed.find((e) => e.path === "/issues");
  const listAfter = completed.filter(
    (e) =>
      e.afterToast &&
      ["/api/requests", "/api/maintenance", "/api/incidents"].includes(e.path)
  );

  return {
    classification,
    run,
    title,
    serverActionMs: action?.ms ?? Math.round(tToast - t0),
    toastMs: Math.round(tToast - t0),
    modalCloseMs: Math.round(tModal - tToast),
    visibleMs: Math.round(tRender - t0),
    listFetchCountAfterSuccess: listAfter.length,
    listFetches: listAfter,
    totalMs: Math.round(tRender - t0),
  };
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
  const stamp = Date.now();
  const ordinary = [];
  const significant = [];

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
    await page.getByRole("heading", { name: /^Issues$/ }).waitFor({
      timeout: 30000,
    });

    for (let i = 1; i <= RUNS; i++) {
      const row = await measure(page, "ordinary", stamp, i);
      ordinary.push(row);
      console.error(
        `ordinary ${i}: total=${row.totalMs} action=${row.serverActionMs} listFetches=${row.listFetchCountAfterSuccess}`
      );
    }
    for (let i = 1; i <= RUNS; i++) {
      const row = await measure(page, "significant", stamp, i);
      significant.push(row);
      console.error(
        `significant ${i}: total=${row.totalMs} action=${row.serverActionMs} listFetches=${row.listFetchCountAfterSuccess}`
      );
    }

    const report = {
      measuredAt: new Date().toISOString(),
      baseline: {
        ordinary: { e2e: 35000, server: 23600, listRefresh: 13450 },
        significant: { e2e: 40000, server: 23400, listRefresh: 10200 },
      },
      ordinary: {
        runs: ordinary,
        avgTotal: Math.round(avg(ordinary.map((r) => r.totalMs))),
        avgAction: Math.round(avg(ordinary.map((r) => r.serverActionMs))),
        avgListFetches: avg(ordinary.map((r) => r.listFetchCountAfterSuccess)),
      },
      significant: {
        runs: significant,
        avgTotal: Math.round(avg(significant.map((r) => r.totalMs))),
        avgAction: Math.round(avg(significant.map((r) => r.serverActionMs))),
        avgListFetches: avg(
          significant.map((r) => r.listFetchCountAfterSuccess)
        ),
      },
    };
    writeFileSync(
      "/tmp/phase9-log-issue-perf.json",
      JSON.stringify(report, null, 2)
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("PERF FAIL", err);
  process.exit(1);
});
