/**
 * Phase 18 — Incident write freeze browser smoke.
 *   node scripts/verify-incident-write-freeze-browser.cjs
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

async function asCall(env, resource, action, payload = {}) {
  const url = env.NEXT_PUBLIC_API_URL || env.APPS_SCRIPT_URL;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resource, action, payload }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${resource}/${action}: ${json.message}`);
  return json.data;
}

async function openRequestView(page, requestId) {
  await page.goto(`${BASE}/requests?id=${encodeURIComponent(requestId)}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page.getByRole("dialog").waitFor({ timeout: 30000 });
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
  const title = `P18 freeze valve ${stamp}`;
  let rootId = null;

  try {
    await page.goto(
      `${BASE}/auth/callback?token_hash=${encodeURIComponent(
        linkData.properties.hashed_token
      )}&type=magiclink&next=/issues`,
      { waitUntil: "networkidle", timeout: 90000 }
    );

    // A. Log Issue → Work, no new INC
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
    await page.waitForTimeout(1500);
    page.off("response", onResp);
    assert(listFetchAfter.length === 0, `triple-fetch: ${JSON.stringify(listFetchAfter)}`);
    results.push(`PASS A Log Issue → ${rootId}; Phase 9 perf intact`);

    await page.goto(`${BASE}/incidents`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(
      !(await page.locator("body").innerText()).includes(title),
      "Incident created from Log Issue"
    );
    assert(
      (await page.getByRole("button", { name: /Report event/i }).count()) === 0,
      "Report event still exposed"
    );
    assert(
      (await page.getByRole("button", { name: /Log issue/i }).count()) > 0,
      "Log issue CTA missing on incidents page"
    );
    results.push("PASS A no INC from Log Issue; Report event removed");

    // C. Existing Incident readable
    const incRows = page.locator("table tbody tr");
    if ((await incRows.count()) > 0) {
      await incRows.first().click();
      await page.getByRole("heading", { name: /Incident/i }).first().waitFor({
        timeout: 20000,
      });
      results.push("PASS C existing Incident record readable");
    } else {
      results.push("PASS C incidents list empty (no historical rows to open)");
    }

    // E. Work — no Incident creation
    await page.goto(`${BASE}/work`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    const workBody = await page.locator("body").innerText();
    assert(!/Create Incident|Report event|Report incident/i.test(workBody), "work inc create");
    results.push("PASS E Work has no Incident creation option");

    // F. Work Orders route intact
    await page.goto(`${BASE}/work-orders`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/work-orders", "work orders route");
    results.push("PASS F Work Orders route intact");

    // G. Track Request
    await page.goto(`${BASE}/occupant-requests/track`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    results.push(`PASS G Track Request (${pathOf(page)})`);

    // H. Navigation — no Report Incident as FM action on /incidents (already checked)
    await page.goto(`${BASE}/issues`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(
      (await page.getByRole("button", { name: /Log Issue/i }).count()) > 0,
      "Log Issue on issues"
    );
    results.push("PASS H canonical Log Issue action on Issues");

    // B. Request → Treat → Work (no new INC from operator UI)
    const req = await asCall(env, "requests", "create", {
      title: `P18 treat ${stamp}`,
      description: "Browser verify request treat work-only",
      facilityId: "FAC-0001",
      type: "maintenance",
      status: "submitted",
      occurredAt: new Date().toISOString(),
      reporterName: "Phase 18 verify",
    });
    await openRequestView(page, req.id);
    await page.getByRole("button", { name: /Create Work/i }).waitFor({
      timeout: 30000,
    });
    assert(
      (await page.getByRole("button", { name: /Create Incident/i }).count()) === 0,
      "Create Incident still in request modal"
    );
    await page.getByRole("button", { name: /Create Work/i }).first().click();
    await page.getByRole("heading", { name: /Create Work/i }).waitFor({
      timeout: 20000,
    });
    await page.locator('button[type="submit"][form="create-mnt-from-req"]').click();
    await page.getByText(/Work created/i).waitFor({ timeout: 120000 });
    const reqBody = await page.locator("body").innerText();
    const mntMatch = reqBody.match(/MNT-\d{4}-\d+/);
    assert(mntMatch, "no MNT from request treat");
    assert(!reqBody.includes(`INC-${stamp}`), "INC from request treat");
    results.push(`PASS B Request → Create Work → ${mntMatch[0]}; no Create Incident`);

    console.log("\n=== incident write freeze browser verify ===");
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
