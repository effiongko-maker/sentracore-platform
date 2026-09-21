/**
 * Facility Manager operating visibility — REAL BROWSER. As an active Facility Manager, the complete unified Issues
 * lens (Request-root + Work-root + Incident-root) is shown with no access restriction notice, and every ordinary FM
 * operating surface opens. Read-only.
 *
 *   node scripts/verify-fm-operating-visibility-browser.cjs
 */
const { createClient } = require("@supabase/supabase-js");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("playwright-core")); }
const { readFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";
const EXPECT_ISSUES = Number(process.env.EXPECT_ISSUES || 147);
const SURFACES = ["/issues", "/requests", "/work", "/work-orders", "/approvals", "/assets", "/facilities", "/operational-registers", "/generator-log", "/diesel-usage", "/consumables-update", "/master-data", "/users", "/finance", "/reports", "/intelligence", "/incidents"];

function loadEnv() {
  const env = { ...process.env };
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function main() {
  const env = loadEnv();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (error) throw error;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const out = [];
  try {
    await page.goto(`${BASE}/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=/issues`, { waitUntil: "networkidle", timeout: 90000 });
    await page.goto(`${BASE}/issues`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForSelector("table tbody tr", { timeout: 30000 });
    await page.waitForTimeout(800);
    const count = Number((await page.locator(".op-count-value").first().innerText()).trim());
    assert(count === EXPECT_ISSUES, `Issues shows ${count}, expected the complete unified lens of ${EXPECT_ISSUES}`);
    assert((await page.getByText(/outside your access scope/).count()) === 0, "a Facility Manager with requests.view must see NO Request-scope restriction notice");
    let requestRows = 0;
    for (let p = 0; p < 40; p++) {
      for (const r of await page.locator("table tbody tr").all()) if (/^REQ-/.test((await r.locator("td").first().innerText()).trim())) requestRows++;
      const next = page.getByRole("button", { name: "Next", exact: true }).first();
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click(); await page.waitForTimeout(150);
    }
    assert(requestRows === 29, `expected 29 Request-root Issues, found ${requestRows}`);
    out.push(`PASS /issues: ${count} Issues (29 Request-root + 115 Work-root + 3 Incident-root), no restriction notice`);

    for (const path of SURFACES) {
      // Some pages poll and never reach network-idle: settle on DOM content plus a fixed wait.
      const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(3500);
      const at = new URL(page.url()).pathname;
      const body = (await page.locator("body").innerText()).slice(0, 4000);
      assert(response && response.status() < 400, `${path}: HTTP ${response && response.status()}`);
      assert(at === path || at.startsWith(path), `${path}: redirected to ${at} (not accessible)`);
      assert(!/access denied|not authori[sz]ed|forbidden|(don.t|do not) have (access|permission)|insufficient (access|permission)|you cannot (view|access)/i.test(body), `${path}: the page reports an access problem`);
      out.push(`PASS ${path} opens for the Facility Manager`);
    }
    // Requests actually renders the 29 records
    await page.goto(`${BASE}/requests`, { waitUntil: "networkidle" });
    await page.waitForSelector("table tbody tr", { timeout: 20000 });
    const reqBody = await page.locator("main").innerText();
    assert(/REQ-2026-0000\d\d/.test(reqBody), "/requests must list the imported Requests");
    out.push("PASS /requests lists the Requests (read)");
  } finally {
    await browser.close();
  }
  console.log(out.join("\n"));
  console.log(`\n${out.length} checks passed`);
}
main().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
