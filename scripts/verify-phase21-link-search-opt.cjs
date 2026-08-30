/**
 * Phase 2.1 — Link search: one catalogue fetch + local filter.
 * Measures open→results and keystroke→filter; asserts 0 remote after catalogue.
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";
const TAG = "[browser-verify][phase21]";

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
  await page.goto(`${BASE}/requests`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  const search = page.getByPlaceholder(/Search requests/i).first();
  await search.fill(requestId);
  await page.waitForFunction((id) => document.body.innerText.includes(id), requestId, {
    timeout: 60000,
  });
  await page
    .locator("tr", { hasText: requestId })
    .first()
    .getByRole("button", { name: /Actions for/i })
    .click();
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("dialog").waitFor({ timeout: 20000 });
}

function installPostCounter(page) {
  const posts = [];
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    const h = req.headers();
    posts.push({
      t: Date.now(),
      nextAction: Boolean(h["next-action"]),
      url: req.url().slice(0, 100),
    });
  });
  return {
    countSince(t0, { nextActionOnly = true } = {}) {
      return posts.filter(
        (p) => p.t >= t0 && (!nextActionOnly || p.nextAction)
      ).length;
    },
    since(t0) {
      return posts.filter((p) => p.t >= t0);
    },
  };
}

async function measureLinkKind(page, counter, opts) {
  const { kind, buttonLabel, dialogTitle, childId, hostRequestId } = opts;
  const out = { kind, childId, hostRequestId };

  await openRequestView(page, hostRequestId);
  await page.waitForSelector(`button:has-text("${buttonLabel}")`, {
    timeout: 60000,
  });

  const tOpen = Date.now();
  const mark = Date.now();
  await page.getByRole("button", { name: buttonLabel }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: dialogTitle });
  await dialog.waitFor({ timeout: 15000 });

  await page.waitForFunction(
    () => {
      const t = document.body.innerText;
      return (
        !t.includes("Loading maintenance") &&
        !t.includes("Loading incidents") &&
        (t.includes("linkable record") ||
          t.includes("No linkable records") ||
          t.includes("matching"))
      );
    },
    { timeout: 120000 }
  );
  out.openToResultsMs = Date.now() - tOpen;
  out.cataloguePosts = counter.countSince(mark);

  const input = page.locator("#link-treatment-search");
  await input.waitFor({ timeout: 5000 });

  // Typed searches — must be zero next-action POSTs
  const searches = [
    { label: "prefix", value: kind === "maintenance" ? "MNT" : "INC" },
    { label: "exactId", value: childId },
    { label: "clear", value: "" },
    { label: "other", value: "zzzz-no-match-phase21" },
  ];
  out.localSearches = [];

  for (const step of searches) {
    const t0 = Date.now();
    const postsBefore = counter.countSince(0);
    await input.fill(step.value);
    // Wait a frame for React filter
    await page.waitForTimeout(50);
    if (step.value === "zzzz-no-match-phase21") {
      await page.waitForSelector(
        kind === "maintenance"
          ? "text=No matching maintenance records"
          : "text=No matching incidents",
        { timeout: 5000 }
      );
    } else if (step.value === childId) {
      await page.waitForFunction(
        (id) => document.body.innerText.includes(id),
        childId,
        { timeout: 5000 }
      );
    } else if (step.value === "") {
      await page.waitForTimeout(30);
    } else {
      await page.waitForTimeout(30);
    }
    const elapsedMs = Date.now() - t0;
    const postsAfter = counter.countSince(0);
    out.localSearches.push({
      label: step.label,
      value: step.value,
      elapsedMs,
      newPosts: postsAfter - postsBefore,
    });
  }

  // Restore exact id and Link
  await input.fill(childId);
  await page.waitForFunction(
    (id) => document.body.innerText.includes(id),
    childId,
    { timeout: 5000 }
  );
  const tLink = Date.now();
  const linkMark = Date.now();
  await dialog
    .locator("li", { hasText: childId })
    .getByRole("button", { name: /^Link$/ })
    .click();
  await page.waitForSelector(
    kind === "maintenance" ? "text=Maintenance linked" : "text=Incident linked",
    { timeout: 120000 }
  );
  out.linkToSuccessMs = Date.now() - tLink;
  out.linkPosts = counter.countSince(linkMark);
  out.networkCallsAfterCatalogue = out.localSearches.reduce(
    (n, s) => n + s.newPosts,
    0
  );

  for (let i = 0; i < 4; i++) await page.keyboard.press("Escape");
  return out;
}

(async () => {
  const env = loadEnv();
  const stamp = Date.now();
  const report = {
    startedAt: new Date().toISOString(),
    before: {
      openToResults: "13–16s",
      eachSearch: "6–8s",
    },
    maintenance: null,
    incident: null,
    regressions: {},
  };

  const req = await asCall(env, "requests", "create", {
    title: `${TAG} host ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Phase21",
  });
  const mnt = await asCall(env, "maintenance", "create", {
    title: `${TAG} mnt ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "low",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  const inc = await asCall(env, "incidents", "create", {
    title: `${TAG} inc ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    type: "safety",
    source: "manual",
    severity: "low",
    status: "reported",
    reportedAt: new Date().toISOString(),
  });

  // Second request for conflict check after first links
  const reqB = await asCall(env, "requests", "create", {
    title: `${TAG} conflict-B ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Phase21",
  });

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
  const page = await browser.newPage();
  const counter = installPostCounter(page);

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
    assert(pathOf(page) === "/requests", `auth ${pathOf(page)}`);
    assert((await page.locator("#email").count()) === 0, "login form");

    report.maintenance = await measureLinkKind(page, counter, {
      kind: "maintenance",
      buttonLabel: "Link Maintenance",
      dialogTitle: "Link existing Maintenance",
      childId: mnt.id,
      hostRequestId: req.id,
    });

    // Bidirectional check MNT
    const mntFresh = await asCall(env, "maintenance", "getById", { id: mnt.id });
    const reqFresh = await asCall(env, "requests", "getById", { id: req.id });
    report.regressions.mntBidirectional =
      mntFresh.sourceRequestId === req.id &&
      (reqFresh.maintenanceIds || []).includes(mnt.id);

    report.incident = await measureLinkKind(page, counter, {
      kind: "incident",
      buttonLabel: "Link Incident",
      dialogTitle: "Link existing Incident",
      childId: inc.id,
      hostRequestId: req.id,
    });

    const incFresh = await asCall(env, "incidents", "getById", { id: inc.id });
    const reqAfterInc = await asCall(env, "requests", "getById", { id: req.id });
    report.regressions.incBidirectional =
      incFresh.sourceRequestId === req.id &&
      (reqAfterInc.incidentIds || []).includes(inc.id);

    // Conflict: try link same MNT to reqB — should fail / not steal
    await openRequestView(page, reqB.id);
    await page.getByRole("button", { name: "Link Maintenance" }).click();
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes("Loading maintenance") &&
        document.body.innerText.includes("linkable"),
      { timeout: 120000 }
    );
    await page.fill("#link-treatment-search", mnt.id);
    await page.waitForTimeout(100);
    const body = await page
      .getByRole("dialog")
      .filter({ hasText: "Link existing Maintenance" })
      .innerText();
    // Owned by A should not appear as linkable OR link errors
    const linkBtn = page
      .locator("li", { hasText: mnt.id })
      .getByRole("button", { name: /^Link$/ });
    if (await linkBtn.count()) {
      await linkBtn.click();
      await page.waitForSelector("text=/Unable to link|already linked|cannot be reassigned/i", {
        timeout: 60000,
      });
      report.regressions.conflictBlockedViaError = true;
    } else {
      report.regressions.conflictFilteredFromCatalogue = true;
      assert(
        !body.includes(mnt.id) || body.includes("No matching"),
        "owned MNT still offered without protection"
      );
    }
    const mntStill = await asCall(env, "maintenance", "getById", { id: mnt.id });
    const reqBFresh = await asCall(env, "requests", "getById", { id: reqB.id });
    report.regressions.conflictOwnerPreserved =
      mntStill.sourceRequestId === req.id &&
      !(reqBFresh.maintenanceIds || []).includes(mnt.id);

    // Quick create smoke (regression) — confirm create entry points still mount
    await openRequestView(page, reqB.id);
    await page.getByRole("button", { name: "Create Maintenance" }).click();
    const createMntDlg = page
      .getByRole("dialog")
      .filter({ hasText: `From ${reqB.id}` });
    await createMntDlg.waitFor({ timeout: 15000 });
    report.regressions.createMaintenanceModalOpens = true;
    await createMntDlg.getByRole("button", { name: /^Close$|^Cancel$/ }).click();
    await createMntDlg.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await page.getByRole("button", { name: "Create Incident" }).click();
    const createIncDlg = page
      .getByRole("dialog")
      .filter({ hasText: `From ${reqB.id}` });
    await createIncDlg.waitFor({ timeout: 15000 });
    report.regressions.createIncidentModalOpens = true;
    await createIncDlg.getByRole("button", { name: /^Close$|^Cancel$/ }).click();

    report.pass =
      report.maintenance.cataloguePosts >= 1 &&
      report.maintenance.cataloguePosts <= 2 &&
      report.maintenance.networkCallsAfterCatalogue === 0 &&
      report.incident.cataloguePosts >= 1 &&
      report.incident.cataloguePosts <= 2 &&
      report.incident.networkCallsAfterCatalogue === 0 &&
      report.regressions.mntBidirectional &&
      report.regressions.incBidirectional &&
      report.regressions.conflictOwnerPreserved &&
      report.regressions.createMaintenanceModalOpens &&
      report.regressions.createIncidentModalOpens;

    console.log("\n=== PHASE_2_1_LINK_SEARCH_OPT ===");
    console.log(
      "MNT open→results",
      report.maintenance.openToResultsMs,
      "ms posts",
      report.maintenance.cataloguePosts,
      "localPosts",
      report.maintenance.networkCallsAfterCatalogue
    );
    console.log(
      "MNT local searches",
      JSON.stringify(report.maintenance.localSearches)
    );
    console.log(
      "INC open→results",
      report.incident.openToResultsMs,
      "ms posts",
      report.incident.cataloguePosts,
      "localPosts",
      report.incident.networkCallsAfterCatalogue
    );
    console.log(
      "INC local searches",
      JSON.stringify(report.incident.localSearches)
    );
    console.log("regressions", report.regressions);
    console.log("PASS", report.pass);
  } finally {
    await browser.close();
    writeFileSync(
      "/tmp/phase21-link-search-opt.json",
      JSON.stringify(report, null, 2)
    );
  }

  if (!report.pass) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
