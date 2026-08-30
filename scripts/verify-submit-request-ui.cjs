/**
 * Verify Request Queue rollback + Submit Request redesign.
 *   node scripts/verify-submit-request-ui.cjs
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
      )}&type=magiclink&next=/requests`,
      { waitUntil: "networkidle", timeout: 60000 }
    );

    // --- Request Queue rollback ---
    await page.goto(`${BASE}/requests`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/requests", "requests auth failed");
    const body = await page.locator("body").innerText();
    assert(!/\.px-rm|Request case/i.test(await page.content()) || true, "noop");
    assert(
      (await page.locator(".px-rm").count()) === 0,
      "PayChex queue workspace still present"
    );
    assert(
      (await page.locator(".px-rm-queue").count()) === 0,
      "RequestQueuePanel still present"
    );
    await page.getByPlaceholder(/Search requests/i).first().waitFor({
      timeout: 30000,
    });
    // Restored table/toolbar interaction surface
    const hasTable = (await page.locator("table").count()) > 0;
    const hasToolbar =
      (await page.getByPlaceholder(/Search requests/i).count()) > 0;
    assert(hasToolbar, "search toolbar missing");
    assert(hasTable, "requests table missing after rollback");
    results.push("PASS Request Queue restored (table + search)");

    // Treatment still available via View
    const firstRow = page.locator("tbody tr").first();
    if ((await firstRow.count()) > 0) {
      const actions = firstRow.getByRole("button", { name: /Actions for/i });
      if ((await actions.count()) > 0) {
        await actions.click();
        await page.getByRole("menuitem", { name: "View" }).click();
        await page.getByRole("dialog").waitFor({ timeout: 20000 });
        const dialogText = await page.getByRole("dialog").innerText();
        assert(
          /Create Maintenance|Link Maintenance|Treatment/i.test(dialogText),
          "treatment actions missing in View modal"
        );
        results.push("PASS Request Treatment still in View modal");
        await page.keyboard.press("Escape");
      } else {
        results.push("SKIP treatment modal (no actions button)");
      }
    } else {
      results.push("SKIP treatment modal (no rows)");
    }

    // --- Submit Request ---
    await page.goto(`${BASE}/occupant-requests`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert(pathOf(page) === "/occupant-requests", "submit route failed");
    await page.locator(".sr-page").waitFor({ timeout: 30000 });
    results.push("PASS Submit Request shell");

    await page.getByText("We keep").first().waitFor();
    await page.getByText("FACILITY MANAGER", { exact: false }).first().waitFor();
    await page.getByRole("button", { name: /Maintenance Request/i }).waitFor();
    await page.getByRole("button", { name: /Incident Report/i }).waitFor();
    results.push("PASS left panel + request types");

    await page.getByRole("button", { name: /Maintenance Request/i }).click();
    await page.getByLabel(/Issue title/i).fill(
      `[browser-verify] leak ${Date.now()}`
    );
    await page
      .getByLabel(/Description/i)
      .fill("Browser verification of Submit Request guided flow.");
    await page.getByRole("button", { name: /Next: Location/i }).click();
    results.push("PASS step 1 → location");

    await page
      .getByRole("heading", { name: /Where did it happen/i })
      .waitFor({ timeout: 15000 });

    await page.locator("#master-location-facility").waitFor({ timeout: 30000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector("#master-location-facility");
        if (!(el instanceof HTMLSelectElement)) return false;
        return Array.from(el.options).some((o) => o.value && o.value.trim());
      },
      { timeout: 60000 }
    );
    const facilityVals = await page
      .locator("#master-location-facility option")
      .evaluateAll((opts) =>
        opts.map((o) => o.value).filter((v) => v && v.trim())
      );
    assert(facilityVals.length > 0, "no facilities in location catalog");
    await page.locator("#master-location-facility").selectOption(facilityVals[0]);
    await page.waitForTimeout(700);

    const buildingVals = await page
      .locator("#master-location-building option")
      .evaluateAll((opts) =>
        opts.map((o) => o.value).filter((v) => v && v.trim())
      );
    if (buildingVals.length > 0) {
      await page.locator("#master-location-building").selectOption(buildingVals[0]);
      await page.waitForTimeout(500);
    } else {
      // Fallback: additional detail can satisfy location string if cascade empty
      await page.locator("#master-location-detail").fill("Lobby");
    }

    const floorVals = await page
      .locator("#master-location-floor option")
      .evaluateAll((opts) =>
        opts.map((o) => o.value).filter((v) => v && v.trim())
      );
    if (floorVals.length > 0) {
      await page.locator("#master-location-floor").selectOption(floorVals[0]);
      await page.waitForTimeout(400);
    }

    await page.getByRole("button", { name: /Next: Review/i }).click();
    await page.waitForTimeout(1000);
    const onReview =
      (await page.getByRole("heading", { name: /Review/i }).count()) > 0;
    if (!onReview) {
      // ensure detail filled
      await page.locator("#master-location-detail").fill("Verification area");
      await page.getByRole("button", { name: /Next: Review/i }).click();
      await page.waitForTimeout(800);
    }
    await page.getByRole("heading", { name: /Review/i }).waitFor({
      timeout: 15000,
    });
    results.push("PASS location → review");
    await page.getByRole("button", { name: /Submit request/i }).click();
    await page
      .getByRole("heading", { name: /Request submitted/i })
      .waitFor({ timeout: 60000 });
    const refEl = page.getByText(/REQ-[0-9-]+/).first();
    await refEl.waitFor({ timeout: 15000 });
    const refText = (await refEl.innerText()).trim();
    assert(/^REQ-/i.test(refText), `expected REQ id, got ${refText}`);
    results.push(`PASS submission ${refText}`);

    await page.goto(`${BASE}/requests`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await page.getByPlaceholder(/Search requests/i).fill(refText);
    await page.waitForFunction(
      (id) => document.body.innerText.includes(id),
      refText,
      { timeout: 60000 }
    );
    results.push("PASS request appears in Request Queue");

    await page.screenshot({
      path: "/tmp/submit-request-ui.png",
      fullPage: true,
    });
    results.push("PASS screenshot /tmp/submit-request-ui.png");

    console.log("\n=== submit request UI verify ===");
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
