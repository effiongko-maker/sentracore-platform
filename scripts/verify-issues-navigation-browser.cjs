/**
 * Issues navigation — REAL BROWSER regression. Drives the running app (default http://localhost:3000) and clicks
 * exactly what an operator clicks. It proves the rendered click targets of an imported incident-derived Issue never
 * send the normal Issue interaction into the frozen Legacy Incidents module, and that the imported-record semantics
 * survive the browser-side service mappers (the layer a server-side verifier cannot see).
 *
 *   node scripts/verify-issues-navigation-browser.cjs
 *
 * Signs in with a magic link minted for SENTRACORE_VERIFY_EMAIL (same mechanism as the other browser smokes).
 * Read-only: it only clicks and reads.
 */
const { createClient } = require("@supabase/supabase-js");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("playwright-core")); }
const { readFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";

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
const pathOf = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };

async function main() {
  const env = loadEnv();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (error) throw error;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const navigations = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(pathOf(page)); });
  const out = [];
  try {
    await page.goto(`${BASE}/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=/issues`, { waitUntil: "networkidle", timeout: 90000 });
    await page.goto(`${BASE}/issues`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForSelector("table tbody tr", { timeout: 30000 });
    const next = () => page.getByRole("button", { name: "Next", exact: true }).first();

    // locate the imported incident-derived rows (reference INC-…) across pages
    const locate = async () => {
      const found = [];
      for (let p = 1; p < 40; p++) {
        for (const r of await page.locator("table tbody tr").all()) {
          const ref = (await r.locator("td").first().innerText()).trim();
          if (/^INC-/.test(ref)) found.push({ page: p, ref });
        }
        if (!(await next().count()) || (await next().isDisabled())) break;
        await next().click(); await page.waitForTimeout(250);
      }
      return found;
    };
    const rows = await locate();
    assert(rows.length >= 1, "no incident-derived Issue rows found — nothing to verify (is the historical dataset present?)");

    for (const { ref } of rows) {
      await page.goto(`${BASE}/issues`, { waitUntil: "networkidle" });
      await page.waitForSelector("table tbody tr");
      let row = page.locator("table tbody tr", { hasText: ref }).first();
      for (let i = 0; i < 40 && !(await row.count()); i++) { await next().click(); await page.waitForTimeout(250); row = page.locator("table tbody tr", { hasText: ref }).first(); }
      // click every cell an operator could click on the row
      for (const cell of [0, 1, 2, 3]) {
        await row.locator("td").nth(cell).click();
        await page.waitForTimeout(500);
        assert(pathOf(page) === "/issues", `${ref}: clicking row cell #${cell} navigated to ${pathOf(page)}`);
      }
      const main = page.locator("main");
      const body = await main.innerText();
      assert(/Imported record/.test(body) && !/FM logged/.test(body), `${ref}: origin must read "Imported record", not "FM logged"`);
      assert(/Source record/.test(body) && /Root cause/.test(body), `${ref}: the source evidence must be shown inline`);
      assert(!/View treatment|Legacy investigation|View legacy record/.test(body), `${ref}: no treatment framing for an imported record`);
      const links = await main.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      assert(!links.some((h) => /^\/incidents/.test(h)), `${ref}: the Issues surface must contain NO link into /incidents (found ${JSON.stringify(links.filter((h) => /^\/incidents/.test(h)))})`);
      // every clickable control inside the Issue panel (links AND buttons)
      const panel = page.locator("div.space-y-4.rounded-lg").last();
      for (const el of await panel.locator("a,button").all()) {
        const label = (await el.innerText()).trim();
        await el.click().catch(() => {});
        await page.waitForTimeout(400);
        assert(!/^\/incidents/.test(pathOf(page)), `${ref}: control "${label}" navigated to ${pathOf(page)}`);
        if (pathOf(page) !== "/issues") await page.goBack();
      }
      out.push(`PASS ${ref}: row cells + panel controls stay on /issues; origin "Imported record"; source evidence inline; no /incidents link`);
    }
    assert(!navigations.some((p) => /^\/incidents/.test(p)), `the browser visited a Legacy Incidents URL during the interaction: ${JSON.stringify(navigations.filter((p) => /^\/incidents/.test(p)))}`);
    out.push("PASS no navigation to /incidents occurred at any point");

    // the same mapper layer feeds Diesel: imported rows are whole-site tank measurements, not 'High usage' generators
    await page.goto(`${BASE}/diesel-usage`, { waitUntil: "networkidle" });
    await page.waitForSelector("table tbody tr", { timeout: 20000 });
    await page.waitForTimeout(800);
    const diesel = await page.locator("main").innerText();
    assert(!/High usage/i.test(diesel) && /Whole-site tank/.test(diesel), "Diesel: imported rows must read 'Whole-site tank' and carry no 'High usage' flag");
    out.push("PASS Diesel: imported rows read 'Whole-site tank', no 'High usage' (recordOrigin survives the client mapper)");
  } finally {
    await browser.close();
  }
  console.log(out.join("\n"));
  console.log(`\n${out.length} checks passed`);
}

main().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
