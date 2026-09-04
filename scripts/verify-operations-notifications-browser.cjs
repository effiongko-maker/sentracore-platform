/**
 * Browser check: /operations Needs attention feed visibility.
 *   node scripts/verify-operations-notifications-browser.cjs
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

  try {
    await page.goto(
      `${BASE}/auth/callback?token_hash=${encodeURIComponent(
        linkData.properties.hashed_token
      )}&type=magiclink&next=/operations`,
      { waitUntil: "networkidle", timeout: 90000 }
    );

    await page.goto(`${BASE}/operations`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });

    assert(
      new URL(page.url()).pathname === "/operations",
      `expected /operations, got ${page.url()}`
    );
    results.push("PASS landed on /operations");

    // Wait for CommandSurface to finish loading
    await page.locator(".sc-fm-hero").first().waitFor({ timeout: 60000 });
    results.push("PASS hero present");

    const heading = page.locator("#sc-fm-notify-heading");
    await heading.waitFor({ timeout: 30000 });
    assert((await heading.count()) === 1, "Needs attention heading missing");
    const headingText = (await heading.innerText()).trim();
    assert(
      /Needs attention/i.test(headingText),
      `unexpected heading: ${headingText}`
    );
    results.push("PASS Needs attention section in DOM");

    const box = await page.locator(".sc-fm-notify").boundingBox();
    assert(box && box.height > 20, `section height too small: ${JSON.stringify(box)}`);
    results.push(
      `PASS section visible geometry h=${Math.round(box.height)} y=${Math.round(box.y)}`
    );

    const hero = await page.locator(".sc-fm-hero").boundingBox();
    assert(hero, "hero missing geometry");
    assert(
      box.y >= hero.y + hero.height - 4,
      `notify not below hero (hero.bottom=${hero.y + hero.height}, notify.y=${box.y})`
    );
    results.push("PASS Needs attention sits below hero");

    const itemCount = await page.locator(".sc-fm-notify-item").count();
    const emptyVisible = await page.locator(".sc-fm-notify-empty").count();
    results.push(
      itemCount > 0
        ? `PASS feed has ${itemCount} item(s)`
        : emptyVisible > 0
          ? "PASS feed empty-state rendered (no derived notifications)"
          : "FAIL neither items nor empty state"
    );
    assert(
      itemCount > 0 || emptyVisible > 0,
      "section rendered but no items and no empty state"
    );

    if (itemCount > 0) {
      const firstEvent = (
        await page.locator(".sc-fm-notify-event").first().innerText()
      ).trim();
      results.push(`INFO top event type: ${firstEvent}`);
    }

    // Ensure section is scrolled into view for human/screenshot checks
    await page.locator(".sc-fm-notify").scrollIntoViewIfNeeded();
    const inView = await page.locator(".sc-fm-notify").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 && r.height > 0;
    });
    assert(inView, "Needs attention not in viewport after scroll");
    results.push("PASS Needs attention in viewport after scroll");

    console.log(results.join("\n"));
    console.log("OK verify-operations-notifications-browser");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
