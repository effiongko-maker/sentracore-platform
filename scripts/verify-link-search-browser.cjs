/**
 * Genuine browser verification: Link Maintenance + Link Incident search/link.
 * Auth via magiclink (no password mutation). Pathname assertions only.
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");

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

async function appsScriptCall(env, resource, action, payload) {
  const url = env.NEXT_PUBLIC_API_URL || env.APPS_SCRIPT_URL;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ resource, action, payload }),
  });
  return res.json();
}

async function openRequestView(page, requestId) {
  const row = page.locator("tr", { hasText: requestId }).first();
  assert(await row.count(), `row for ${requestId} not found`);
  await row.getByRole("button", { name: new RegExp(`Actions for`, "i") }).click();
  await page.getByRole("menuitem", { name: "View" }).click();
  await Promise.race([
    page.waitForSelector('button:has-text("Link Maintenance")', { timeout: 30000 }),
    page.waitForSelector("text=Treatment actions are closed", { timeout: 30000 }),
  ]);
}

async function closeView(page) {
  const closeBtn = page.getByRole("button", { name: /^Close$/ }).last();
  if (await closeBtn.count()) {
    await closeBtn.click().catch(() => {});
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

(async () => {
  const env = loadEnv();
  const evidence = {
    startedAt: new Date().toISOString(),
    auth: {},
    linkMaintenance: { status: "NOT_RUN" },
    linkIncident: { status: "NOT_RUN" },
  };
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (linkErr) throw linkErr;

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const page = await browser.newPage();

  try {
    await page.goto(
      `${BASE}/auth/callback?token_hash=${encodeURIComponent(
        linkData.properties.hashed_token
      )}&type=magiclink&next=/requests`,
      { waitUntil: "networkidle", timeout: 60000 }
    );
    await page.goto(`${BASE}/requests`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    assert(pathOf(page) === "/requests", `auth pathname=${pathOf(page)}`);
    assert((await page.locator("#email").count()) === 0, "login form visible");
    const me = await page.request.get(`${BASE}/api/auth/me`);
    assert(me.ok(), `/api/auth/me ${me.status()}`);
    evidence.auth = {
      pathname: pathOf(page),
      meStatus: me.status(),
      pass: true,
    };
    console.log("AUTH_OK", evidence.auth);

    // Find a treatable request by opening Views until Link Maintenance appears
    const bodyText = await page.locator("body").innerText();
    const reqIds = [
      ...new Set([...bodyText.matchAll(/REQ-20\d{2}-\d+/g)].map((m) => m[0])),
    ];
    evidence.auth.visibleRequestIds = reqIds.slice(0, 12);

    let requestId = null;
    for (const id of reqIds) {
      await openRequestView(page, id);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 15000 });
      const body = await dialog.innerText();
      if (body.includes("Link Maintenance") && body.includes("Link Incident")) {
        requestId = id;
        evidence.requestId = id;
        console.log("treatable_request", id);
        break;
      }
      console.log(
        "skip_request",
        id,
        body.includes("Treatment actions are closed") ? "closed" : "no-link-buttons"
      );
      await closeView(page);
      await page.waitForTimeout(400);
    }
    assert(requestId, "no treatable request with Link Maintenance/Incident found");

    // ========== LINK MAINTENANCE ==========
    {
      const ev = evidence.linkMaintenance;
      try {
        // already open from selection loop
        if (!(await page.getByRole("button", { name: "Link Maintenance" }).count())) {
          await openRequestView(page, requestId);
        }

        const posts = [];
        const onResp = async (res) => {
          if (res.request().method() === "POST") {
            posts.push({
              path: new URL(res.url()).pathname,
              status: res.status(),
            });
          }
        };
        page.on("response", onResp);

        await page.getByRole("button", { name: "Link Maintenance" }).click();
        await page.waitForSelector("text=Link existing Maintenance", {
          timeout: 15000,
        });
        await page.waitForSelector("#link-treatment-search", { timeout: 10000 });
        ev.modalOpen = true;
        ev.pathnameDuringModal = pathOf(page);
        assert(ev.pathnameDuringModal === "/requests", "left /requests");

        // Search for MNT — local filter after catalogue load (no Search button / no remote)
        await page.waitForFunction(
          () =>
            !document.body.innerText.includes("Loading maintenance") &&
            (document.body.innerText.includes("linkable record") ||
              document.body.innerText.includes("No linkable")),
          { timeout: 90000 }
        );
        ev.initialSearchSettled = true;
        let summary = await page.locator("text=/\\d+ linkable record|\\d+ matching/").first().innerText().catch(() => "");
        ev.initialSummary = summary;

        await page.fill("#link-treatment-search", "MNT");
        await page.waitForTimeout(80);
        ev.searchLoadingEnded = true;
        summary = await page.locator("text=/\\d+ matching|\\d+ linkable record/").first().innerText().catch(() => "");
        ev.searchSummary = summary;
        ev.searchPosts = posts.slice(-5);

        const resultItems = page.locator("ul li").filter({
          has: page.getByRole("button", { name: /^Link$/ }),
        });
        const resultCount = await resultItems.count();
        ev.resultsRendered = resultCount;
        assert(resultCount > 0, `no MNT linkable results (summary=${summary})`);

        const first = resultItems.first();
        const firstText = await first.innerText();
        const mntMatch = firstText.match(/MNT-20\d{2}-\d+/);
        assert(mntMatch, `no MNT id in result: ${firstText.slice(0, 120)}`);
        const mntId = mntMatch[0];
        ev.selectedId = mntId;
        await first.getByRole("button", { name: /^Link$/ }).click();

        // Wait for modal to close / toast
        await page.waitForSelector("text=Link existing Maintenance", {
          state: "hidden",
          timeout: 60000,
        }).catch(() => {});
        await page.waitForTimeout(1500);

        // Ensure view shows linked work — reopen if needed
        if (!(await page.getByText(mntId).count())) {
          await closeView(page);
          await openRequestView(page, requestId);
        }
        await page.waitForTimeout(1500);
        const detail = await page.locator("body").innerText();
        ev.requestShowsLinked = detail.includes(mntId);
        assert(ev.requestShowsLinked, `Request detail missing linked ${mntId}`);

        // Reverse: Apps Script getById sourceRequestId
        const mntGet = await appsScriptCall(env, "maintenance", "getById", {
          id: mntId,
        });
        const mntRow = mntGet?.data || mntGet?.item || mntGet;
        const sourceRequestId =
          mntRow?.sourceRequestId ||
          mntRow?.source_request_id ||
          mntRow?.SourceRequestId;
        ev.reverseSourceRequestId = sourceRequestId || null;
        ev.reverseMatch = sourceRequestId === requestId;
        assert(
          ev.reverseMatch,
          `Maintenance ${mntId} sourceRequestId=${sourceRequestId} expected ${requestId}`
        );

        ev.status = "PASS";
        page.off("response", onResp);
        console.log("LINK_MAINTENANCE PASS", {
          mntId,
          summary: ev.searchSummary,
          reverse: sourceRequestId,
        });
        await closeView(page);
      } catch (e) {
        ev.status = "FAIL";
        ev.error = e.message;
        console.log("LINK_MAINTENANCE FAIL", e.message);
        await page.screenshot({
          path: "/tmp/link-mnt-fail.png",
          fullPage: true,
        }).catch(() => {});
        // Stop before incident if maintenance failed? User said if either fails, stop and diagnose.
        // Continue to attempt incident only if we want both reports — user said stop if either fails before changing code.
        // Still report both statuses; skip incident if we can't reopen.
      }
    }

    // ========== LINK INCIDENT ==========
    if (evidence.linkMaintenance.status === "PASS") {
      const ev = evidence.linkIncident;
      try {
        assert(pathOf(page) === "/requests", `before INC pathname=${pathOf(page)}`);
        await openRequestView(page, requestId);

        const posts = [];
        const onResp = async (res) => {
          if (res.request().method() === "POST") {
            posts.push({
              path: new URL(res.url()).pathname,
              status: res.status(),
            });
          }
        };
        page.on("response", onResp);

        await page.getByRole("button", { name: "Link Incident" }).click();
        await page.waitForSelector("text=Link existing Incident", {
          timeout: 15000,
        });
        await page.waitForSelector("#link-treatment-search", { timeout: 10000 });
        ev.modalOpen = true;
        ev.pathnameDuringModal = pathOf(page);

        await page.waitForFunction(
          () =>
            !document.body.innerText.includes("Loading incidents") &&
            (document.body.innerText.includes("linkable record") ||
              document.body.innerText.includes("No linkable")),
          { timeout: 90000 }
        );
        ev.initialSearchSettled = true;

        await page.fill("#link-treatment-search", "INC");
        await page.waitForTimeout(80);
        ev.searchLoadingEnded = true;
        ev.searchSummary = await page
          .locator("text=/\\d+ matching|\\d+ linkable record/")
          .first()
          .innerText()
          .catch(() => "");
        ev.searchPosts = posts.slice(-5);

        const resultItems = page.locator("ul li").filter({
          has: page.getByRole("button", { name: /^Link$/ }),
        });
        const resultCount = await resultItems.count();
        ev.resultsRendered = resultCount;
        assert(resultCount > 0, `no INC linkable results (${ev.searchSummary})`);

        const first = resultItems.first();
        const firstText = await first.innerText();
        const incMatch = firstText.match(/INC-20\d{2}-\d+/);
        assert(incMatch, `no INC id in result`);
        const incId = incMatch[0];
        ev.selectedId = incId;
        await first.getByRole("button", { name: /^Link$/ }).click();
        await page.waitForSelector("text=Link existing Incident", {
          state: "hidden",
          timeout: 60000,
        }).catch(() => {});
        await page.waitForTimeout(1500);

        if (!(await page.getByText(incId).count())) {
          await closeView(page);
          await openRequestView(page, requestId);
        }
        await page.waitForTimeout(1500);
        const detail = await page.locator("body").innerText();
        ev.requestShowsLinked = detail.includes(incId);
        assert(ev.requestShowsLinked, `Request detail missing linked ${incId}`);

        const incGet = await appsScriptCall(env, "incidents", "getById", {
          id: incId,
        });
        const incRow = incGet?.data || incGet?.item || incGet;
        const sourceRequestId =
          incRow?.sourceRequestId ||
          incRow?.source_request_id ||
          incRow?.SourceRequestId;
        ev.reverseSourceRequestId = sourceRequestId || null;
        ev.reverseMatch = sourceRequestId === requestId;
        assert(
          ev.reverseMatch,
          `Incident ${incId} sourceRequestId=${sourceRequestId} expected ${requestId}`
        );

        ev.status = "PASS";
        page.off("response", onResp);
        console.log("LINK_INCIDENT PASS", {
          incId,
          summary: ev.searchSummary,
          reverse: sourceRequestId,
        });
      } catch (e) {
        ev.status = "FAIL";
        ev.error = e.message;
        console.log("LINK_INCIDENT FAIL", e.message);
        await page.screenshot({
          path: "/tmp/link-inc-fail.png",
          fullPage: true,
        }).catch(() => {});
      }
    } else {
      evidence.linkIncident.status = "NOT_RUN";
      evidence.linkIncident.error =
        "Skipped because LINK_MAINTENANCE failed (stop-on-failure).";
    }
  } finally {
    writeFileSync(
      "/tmp/sentracore-link-search-verify.json",
      JSON.stringify(evidence, null, 2)
    );
    await browser.close();
  }

  console.log("\n=== FINAL ===");
  console.log("LINK_MAINTENANCE —", evidence.linkMaintenance.status);
  console.log("LINK_INCIDENT —", evidence.linkIncident.status);
  console.log("evidence: /tmp/sentracore-link-search-verify.json");
  if (
    evidence.linkMaintenance.status !== "PASS" ||
    evidence.linkIncident.status !== "PASS"
  ) {
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
