/**
 * INTELLIGENCE_TAKE_ACTION_UX_CORRECTION browser verify.
 *   node scripts/verify-intelligence-take-action.cjs
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
      )}&type=magiclink&next=/intelligence`,
      { waitUntil: "networkidle", timeout: 60000 }
    );

    await page.goto(`${BASE}/intelligence`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/intelligence", page.url());
    results.push("PASS /intelligence");

    await page
      .getByRole("heading", { name: /What needs your attention/i })
      .waitFor({ timeout: 90000 });
    results.push("PASS briefing visible before Take action");

    // Review evidence → investigation only (not action flow)
    const reviewEvidence = page
      .getByRole("button", { name: /Review evidence/i })
      .first();
    assert((await reviewEvidence.count()) > 0, "Review evidence button missing");
    await reviewEvidence.click();
    await page.getByRole("heading", { name: /What we know/i }).first().waitFor({
      timeout: 15000,
    });
    const evidencePanel = page.locator(".ix-ref-detail-panel");
    await evidencePanel.getByText(/What we think/i).first().waitFor();
    assert(
      (await page.getByText(/Actions from this insight/i).count()) === 0,
      "Review evidence must not open action flow"
    );
    const opsText = await evidencePanel.locator(".ix-ref-ops-list").innerText();
    assert(!/Facilities/i.test(opsText), "Facilities still in Related operations");
    results.push("PASS Review evidence opens investigation (no Facilities dest)");
    await page.getByRole("button", { name: /← Intelligence/i }).click();
    await page
      .getByRole("heading", { name: /What needs your attention/i })
      .waitFor({ timeout: 15000 });

    const takeAction = page.getByRole("button", { name: /Take action/i }).first();
    assert((await takeAction.count()) > 0, "Take action button missing");

    await takeAction.click();

    await page
      .getByRole("heading", { name: /Actions from this insight/i })
      .waitFor({ timeout: 15000 })
      .catch(async () => {
        // kicker is a <p>, title is insight title — look for kicker text
        await page.getByText(/Actions from this insight/i).first().waitFor({
          timeout: 15000,
        });
      });
    results.push("PASS action state opened");

    const actionBody = await page.locator("body").innerText();
    assert(!/Other priorities/i.test(actionBody), "Other priorities still competing");
    results.push("PASS Other priorities hidden in action mode");

    assert(/Back to insight/i.test(actionBody), "Back to insight missing");
    results.push("PASS Back to insight present");

    {
      const headings = await page.locator(".ix-ref-action-group h3").allTextContents();
      assert(
        !headings.some((h) => /Facilit/i.test(h)),
        `Facilities in action groups: ${headings.join(", ")}`
      );
      results.push("PASS no Facilities action destination");
    }

    assert(
      /#action\//.test(page.url()),
      `expected action hash, got ${page.url()}`
    );
    results.push("PASS action hash set");

    const recordLink = page
      .locator("a.ix-ref-btn")
      .filter({ hasText: /View/i })
      .first();
    const hasRecords = (await recordLink.count()) > 0;

    if (hasRecords) {
      const href = await recordLink.getAttribute("href");
      assert(href && /\?id=/.test(href), `expected specific ?id= href, got ${href}`);
      assert(
        !/^\/(incidents|maintenance|work-orders|requests)$/.test(href || ""),
        "generic module href without id"
      );
      results.push(`PASS specific record href (${href})`);

      const groupHeadings = await page
        .locator(".ix-ref-action-group h3")
        .allTextContents();
      assert(groupHeadings.length > 0, "expected grouped categories");
      assert(
        !groupHeadings.some((h) => /Facilit/i.test(h)),
        `Facilities must not be an action destination: ${groupHeadings.join(", ")}`
      );
      results.push(`PASS grouping (${groupHeadings.join(", ")})`);

      const absolute = href.startsWith("http") ? href : `${BASE}${href}`;
      await page.goto(absolute, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
      const dest = pathOf(page);
      assert(
        ["/incidents", "/maintenance", "/work-orders", "/requests", "/assets"].includes(
          dest
        ),
        `unexpected dest ${dest} from ${href}`
      );
      assert(dest !== "/facilities", "Facilities must not be an action destination");
      results.push(`PASS opened existing workflow (${dest}?id=…)`);

      // Confirm view modal plumbing attempted (best-effort — may be empty if ID unknown)
      await page.waitForTimeout(800);
      results.push("PASS deep-link page load");

      await page.goto(`${BASE}/intelligence`, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
    } else {
      results.push("INFO no linked records on primary insight (honest empty)");
    }

    // Re-enter action then back
    const takeAgain = page.getByRole("button", { name: /Take action/i }).first();
    if ((await takeAgain.count()) > 0) {
      await takeAgain.click();
      await page.getByText(/Actions from this insight/i).first().waitFor();
      await page.getByRole("button", { name: /Back to insight/i }).click();
      await page
        .getByRole("heading", { name: /What needs your attention/i })
        .waitFor({ timeout: 15000 });
      const restored = await page.locator("body").innerText();
      assert(
        /Other priorities|What needs your attention/i.test(restored),
        "briefing not restored"
      );
      results.push("PASS Back to insight restores briefing");
    }

    await page.screenshot({
      path: "/tmp/intelligence-take-action.png",
      fullPage: true,
    });
    results.push("PASS screenshot");

    console.log("\n=== intelligence take-action verify ===");
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
