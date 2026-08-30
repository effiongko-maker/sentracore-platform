/**
 * Phase 2.2 — Link-write latency + integrity regression.
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";
const TAG = "[browser-verify][phase22]";

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
  await page.getByPlaceholder(/Search requests/i).first().fill(requestId);
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

function installProbes(page) {
  const posts = [];
  const logs = [];
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    const h = req.headers();
    if (!h["next-action"]) return;
    posts.push({ tStart: Date.now(), tEnd: null, bytes: null, id: h["next-action"] });
  });
  page.on("response", async (res) => {
    const req = res.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return;
    const entry = [...posts].reverse().find((p) => !p.tEnd);
    if (!entry) return;
    entry.tEnd = Date.now();
    try {
      entry.bytes = (await res.body()).length;
    } catch {
      /* */
    }
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[link-treatment.write.timing]")) {
      logs.push(text);
    }
  });
  return { posts, logs };
}

async function linkFlow(page, probes, opts) {
  const { kind, button, title, childId, requestId } = opts;
  await openRequestView(page, requestId);
  await page.waitForSelector(`button:has-text("${button}")`, { timeout: 60000 });
  await page.getByRole("button", { name: button }).click();
  const dlg = page.getByRole("dialog").filter({ hasText: title });
  await dlg.waitFor({ timeout: 15000 });
  await page.waitForFunction(
    () =>
      !document.body.innerText.includes("Loading maintenance") &&
      !document.body.innerText.includes("Loading incidents") &&
      document.body.innerText.includes("linkable"),
    { timeout: 120000 }
  );
  await page.fill("#link-treatment-search", childId);
  await page.waitForFunction(
    (id) => document.body.innerText.includes(id),
    childId,
    { timeout: 10000 }
  );

  const mark = Date.now();
  const t0 = Date.now();
  await dlg
    .locator("li", { hasText: childId })
    .getByRole("button", { name: /^Link$/ })
    .click();
  await page.waitForSelector(
    kind === "maintenance" ? "text=Maintenance linked" : "text=Incident linked",
    { timeout: 180000 }
  );
  const wallMs = Date.now() - t0;
  await page.waitForTimeout(500);
  const sa = probes.posts.filter((p) => p.tStart >= mark && p.tEnd);
  const timingLog = probes.logs.filter((l) => l.includes(kind)).slice(-1)[0] || null;
  for (let i = 0; i < 4; i++) await page.keyboard.press("Escape");
  return {
    wallMs,
    serverActionMs: sa.length ? sa[sa.length - 1].tEnd - sa[sa.length - 1].tStart : null,
    timingLog,
    childId,
    requestId,
  };
}

(async () => {
  const env = loadEnv();
  const stamp = Date.now();
  const report = {
    startedAt: new Date().toISOString(),
    before: { mnt: "~42s", inc: "~40s", calls: "~6–7 (audit) / ~11 sequenced reads historically" },
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
    reporterName: "Phase22",
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
  const reqB = await asCall(env, "requests", "create", {
    title: `${TAG} other ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Phase22",
  });
  const mntConflict = mnt; // after link, try steal

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
  const probes = installProbes(page);

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
    assert(pathOf(page) === "/requests", "auth failed");

    report.maintenance = await linkFlow(page, probes, {
      kind: "maintenance",
      button: "Link Maintenance",
      title: "Link existing Maintenance",
      childId: mnt.id,
      requestId: req.id,
    });

    const mntFresh = await asCall(env, "maintenance", "getById", { id: mnt.id });
    const reqFresh = await asCall(env, "requests", "getById", { id: req.id });
    report.regressions.mntBidirectional =
      mntFresh.sourceRequestId === req.id &&
      (reqFresh.maintenanceIds || []).includes(mnt.id);
    report.regressions.noDuplicateMnt =
      (reqFresh.maintenanceIds || []).filter((id) => id === mnt.id).length === 1;

    // Idempotent re-link
    await openRequestView(page, req.id);
    await page.getByRole("button", { name: "Link Maintenance" }).click();
    await page.waitForFunction(
      () => !document.body.innerText.includes("Loading maintenance"),
      { timeout: 120000 }
    );
    await page.fill("#link-treatment-search", mnt.id);
    await page.waitForTimeout(100);
    // May show as already linked to this request — Link still ok / or filtered
    const idempotentBtn = page
      .locator("li", { hasText: mnt.id })
      .getByRole("button", { name: /^Link$/ });
    if (await idempotentBtn.count()) {
      await idempotentBtn.click();
      await page.waitForSelector("text=Maintenance linked", { timeout: 120000 });
    }
    const reqIdem = await asCall(env, "requests", "getById", { id: req.id });
    report.regressions.idempotentNoDup =
      (reqIdem.maintenanceIds || []).filter((id) => id === mnt.id).length === 1;

    for (let i = 0; i < 4; i++) await page.keyboard.press("Escape");

    report.incident = await linkFlow(page, probes, {
      kind: "incident",
      button: "Link Incident",
      title: "Link existing Incident",
      childId: inc.id,
      requestId: req.id,
    });

    const incFresh = await asCall(env, "incidents", "getById", { id: inc.id });
    const reqAfter = await asCall(env, "requests", "getById", { id: req.id });
    report.regressions.incBidirectional =
      incFresh.sourceRequestId === req.id &&
      (reqAfter.incidentIds || []).includes(inc.id);
    report.regressions.noReqWo =
      !(reqAfter.workOrderIds || []).length &&
      !incFresh.workOrderId;

    // Conflict steal
    await openRequestView(page, reqB.id);
    await page.getByRole("button", { name: "Link Maintenance" }).click();
    await page.waitForFunction(
      () => !document.body.innerText.includes("Loading maintenance"),
      { timeout: 120000 }
    );
    await page.fill("#link-treatment-search", mntConflict.id);
    await page.waitForTimeout(150);
    const stealBtn = page
      .locator("li", { hasText: mntConflict.id })
      .getByRole("button", { name: /^Link$/ });
    if (await stealBtn.count()) {
      await stealBtn.click();
      await page.waitForSelector(
        "text=/Unable to link|already linked|cannot be reassigned/i",
        { timeout: 60000 }
      );
      report.regressions.conflictError = true;
    } else {
      report.regressions.conflictFiltered = true;
    }
    const mntOwn = await asCall(env, "maintenance", "getById", { id: mnt.id });
    const reqBFresh = await asCall(env, "requests", "getById", { id: reqB.id });
    report.regressions.conflictOwnerPreserved =
      mntOwn.sourceRequestId === req.id &&
      !(reqBFresh.maintenanceIds || []).includes(mnt.id);

    // Parse appsScriptCalls from console if available
    const parseCalls = (log) => {
      if (!log) return null;
      const m = log.match(/appsScriptCalls[:\s]+(\d+)/);
      return m ? Number(m[1]) : null;
    };
    report.maintenance.appsScriptCalls = parseCalls(report.maintenance.timingLog);
    report.incident.appsScriptCalls = parseCalls(report.incident.timingLog);

    report.pass =
      report.regressions.mntBidirectional &&
      report.regressions.incBidirectional &&
      report.regressions.conflictOwnerPreserved &&
      report.regressions.idempotentNoDup &&
      report.regressions.noDuplicateMnt &&
      report.regressions.noReqWo;

    console.log("\n=== REQUEST_TREATMENT_LINK_WRITE_OPTIMIZATION ===");
    console.log("MNT wall", report.maintenance.wallMs, "sa", report.maintenance.serverActionMs, "calls", report.maintenance.appsScriptCalls);
    console.log("INC wall", report.incident.wallMs, "sa", report.incident.serverActionMs, "calls", report.incident.appsScriptCalls);
    console.log("regressions", report.regressions);
    console.log("PASS", report.pass);
  } finally {
    await browser.close();
    writeFileSync(
      "/tmp/phase22-link-write-opt.json",
      JSON.stringify(report, null, 2)
    );
  }

  if (!report.pass) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
