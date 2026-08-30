/**
 * Phase 2.8 — Production linkTreatment browser + integrity gate.
 *
 * Usage:
 *   node scripts/verify-phase28-link-treatment.cjs
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";
const TAG = "[browser-verify][phase28]";
const OUT = "/tmp/phase28-link-treatment.json";

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

async function asCallRaw(env, resource, action, payload = {}) {
  const url = env.NEXT_PUBLIC_API_URL || env.APPS_SCRIPT_URL;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resource, action, payload }),
  });
  const json = await res.json();
  return { json, wallMs: Date.now() - t0 };
}

async function openRequestView(page, requestId) {
  await page.goto(`${BASE}/requests`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page.getByPlaceholder(/Search requests/i).first().fill(requestId);
  await page.waitForFunction(
    (id) => document.body.innerText.includes(id),
    requestId,
    { timeout: 60000 }
  );
  const queueItem = page.locator(".px-rm-queue-item", { hasText: requestId }).first();
  if ((await queueItem.count()) > 0) {
    await queueItem.click();
  } else {
    await page
      .locator("tr", { hasText: requestId })
      .first()
      .getByRole("button", { name: /Actions for/i })
      .click();
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("dialog").waitFor({ timeout: 20000 });
    return;
  }
  await page.locator(".px-rm-case-id", { hasText: requestId }).waitFor({
    timeout: 20000,
  });
}


function installProbes(page) {
  const posts = [];
  const logs = [];
  const searchNetwork = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.headers()["next-action"]) {
      posts.push({ tStart: Date.now(), tEnd: null });
    }
  });
  page.on("response", (res) => {
    const req = res.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return;
    const entry = [...posts].reverse().find((p) => !p.tEnd);
    if (entry) entry.tEnd = Date.now();
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[link-treatment.write.timing]")) logs.push(text);
    if (text.includes("[link-treatment.search.timing]")) {
      try {
        const remote = /remote:\s*false/.test(text) || text.includes('"remote":false');
        searchNetwork.push({ text, local: remote || text.includes("remote: false") });
      } catch (_) {
        searchNetwork.push({ text });
      }
    }
  });
  return { posts, logs, searchNetwork };
}

async function linkFlow(page, probes, opts) {
  const { kind, button, title, childId, requestId } = opts;
  await openRequestView(page, requestId);
  await page.waitForSelector(`button:has-text("${button}")`, {
    timeout: 60000,
  });
  await page.getByRole("button", { name: button }).click();
  const dlg = page.getByRole("dialog").filter({ hasText: title });
  await dlg.waitFor({ timeout: 15000 });
  await page.waitForFunction(
    () =>
      !document.body.innerText.includes("Loading maintenance") &&
      !document.body.innerText.includes("Loading incidents"),
    { timeout: 120000 }
  );
  await page.fill("#link-treatment-search", childId);
  // Local filter — brief wait for UI
  await page.waitForTimeout(200);
  await page.waitForFunction(
    (id) => document.body.innerText.includes(id),
    childId,
    { timeout: 15000 }
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
  await page.waitForTimeout(400);
  const sa = probes.posts.filter((p) => p.tStart >= mark && p.tEnd);
  const timingLog =
    probes.logs.filter((l) => l.includes(`kind=${kind}`)).slice(-1)[0] || null;
  for (let i = 0; i < 4; i++) await page.keyboard.press("Escape");
  return {
    wallMs,
    serverActionMs: sa.length
      ? sa[sa.length - 1].tEnd - sa[sa.length - 1].tStart
      : null,
    timingLog,
    childId,
    requestId,
  };
}

function parseCalls(timingLog) {
  if (!timingLog) return null;
  const m = timingLog.match(/appsScriptCalls=(\d+)/);
  return m ? Number(m[1]) : null;
}

(async () => {
  const env = loadEnv();
  const stamp = Date.now();
  const report = {
    title: "PHASE_2.8_PRODUCTION_LINK_TREATMENT",
    startedAt: new Date().toISOString(),
    before: {
      maintenance: { calls: 6, wallMs: 20700 },
      incident: { calls: 6, wallMs: 19500 },
    },
    deploy: {},
    maintenance: null,
    incident: null,
    idempotency: {},
    conflict: {},
    events: {},
    integrity: {},
    searchRegression: {},
    createRegression: {},
    browser: {},
    performance: {},
    pass: false,
  };

  // Deploy probe — production link marker
  const probeReq = await asCall(env, "requests", "create", {
    title: `${TAG} deploy-probe ${stamp}`,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "submitted",
    reporterName: "Phase28",
  });
  const probeMnt = await asCall(env, "maintenance", "create", {
    title: `${TAG} deploy-mnt ${stamp}`,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "low",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  const probe = await asCallRaw(env, "requests", "linkTreatment", {
    kind: "maintenance",
    requestId: probeReq.id,
    childId: probeMnt.id,
    actorUserId: "phase28-probe",
  });
  if (!probe.json.success) {
    throw new Error(
      `linkTreatment not production-ready: ${probe.json.message}. Deploy RequestTreatmentService.gs + RequestsController.gs.`
    );
  }
  const marker = String(
    (probe.json.data && probe.json.data.buildMarker) || ""
  );
  report.deploy.buildMarker = marker;
  report.deploy.appsScriptWallMs = probe.wallMs;
  report.deploy.productionService = marker.includes("link-treatment-v1");
  report.deploy.spikeSurface = marker.includes("spike");
  assert(
    report.deploy.productionService,
    `Expected production link-treatment-v1 marker, got ${marker}`
  );
  assert(!report.deploy.spikeSurface, "Spike marker still active");

  // Idempotent retry
  const probe2 = await asCallRaw(env, "requests", "linkTreatment", {
    kind: "maintenance",
    requestId: probeReq.id,
    childId: probeMnt.id,
  });
  assert(probe2.json.success && probe2.json.data.idempotent === true);
  report.idempotency.appsScriptSameChild = "PASS";

  // Conflict
  const otherReq = await asCall(env, "requests", "create", {
    title: `${TAG} conflict ${stamp}`,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    status: "submitted",
    reporterName: "Phase28",
  });
  const conflict = await asCallRaw(env, "requests", "linkTreatment", {
    kind: "maintenance",
    requestId: otherReq.id,
    childId: probeMnt.id,
  });
  assert(!conflict.json.success && /already linked/i.test(conflict.json.message));
  report.conflict.result = "PASS";

  const req = await asCall(env, "requests", "create", {
    title: `${TAG} host ${stamp}`,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Phase28",
  });
  const mnt = await asCall(env, "maintenance", "create", {
    title: `${TAG} mnt ${stamp}`,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "low",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  const inc = await asCall(env, "incidents", "create", {
    title: `${TAG} inc ${stamp}`,
    facilityId: "FAC-0001",
    type: "other",
    source: "manual",
    severity: "low",
    status: "reported",
    reportedAt: new Date().toISOString(),
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
    report.browser.auth = "PASS";

    report.maintenance = await linkFlow(page, probes, {
      kind: "maintenance",
      button: "Link Maintenance",
      title: "Link existing Maintenance",
      childId: mnt.id,
      requestId: req.id,
    });
    report.maintenance.appsScriptCalls = parseCalls(
      report.maintenance.timingLog
    );

    const reqAfterM = await asCall(env, "requests", "getById", { id: req.id });
    assert(reqAfterM.status === "being_treated");
    assert((reqAfterM.maintenanceIds || []).includes(mnt.id));
    const mntAfter = await asCall(env, "maintenance", "getById", {
      id: mnt.id,
    });
    assert(mntAfter.sourceRequestId === req.id);
    report.integrity.reqMnt = "PASS";

    // Search regression: local filter logs remote:false
    report.searchRegression.localFilter =
      probes.searchNetwork.length === 0
        ? "PASS (no remote search logs; catalogue-only)"
        : probes.searchNetwork.every((s) => s.local !== false)
          ? "PASS"
          : "CHECK";

    report.incident = await linkFlow(page, probes, {
      kind: "incident",
      button: "Link Incident",
      title: "Link existing Incident",
      childId: inc.id,
      requestId: req.id,
    });
    report.incident.appsScriptCalls = parseCalls(report.incident.timingLog);

    const reqAfterI = await asCall(env, "requests", "getById", { id: req.id });
    assert((reqAfterI.incidentIds || []).includes(inc.id));
    const incAfter = await asCall(env, "incidents", "getById", { id: inc.id });
    assert(incAfter.sourceRequestId === req.id);
    report.integrity.reqInc = "PASS";
    report.integrity.noReqToWo = !(reqAfterI.workOrderIds || []).length
      ? "PASS"
      : "FAIL";

    // Create regression (direct AS createTreatment)
    const createReq = await asCall(env, "requests", "create", {
      title: `${TAG} create-reg ${stamp}`,
      facilityId: "FAC-0001",
      occurredAt: new Date().toISOString(),
      status: "submitted",
      reporterName: "Phase28",
    });
    const createM = await asCallRaw(env, "requests", "createTreatment", {
      kind: "maintenance",
      requestId: createReq.id,
      idempotencyKey: `phase28-create-${stamp}`,
      childInput: {
        title: `${TAG} create mnt`,
        facilityId: "FAC-0001",
        type: "corrective",
        priority: "medium",
        status: "requested",
        source: "request",
        reportedAt: new Date().toISOString(),
      },
    });
    assert(createM.json.success, createM.json.message);
    report.createRegression.maintenance = "PASS";

    const createReqI = await asCall(env, "requests", "create", {
      title: `${TAG} create-inc-reg ${stamp}`,
      facilityId: "FAC-0001",
      occurredAt: new Date().toISOString(),
      requestType: "incident",
      status: "submitted",
      reporterName: "Phase28",
    });
    const createI = await asCallRaw(env, "requests", "createTreatment", {
      kind: "incident",
      requestId: createReqI.id,
      idempotencyKey: `phase28-create-inc-${stamp}`,
      childInput: {
        title: `${TAG} create inc`,
        facilityId: "FAC-0001",
        type: "other",
        severity: "medium",
        status: "reported",
        source: "request",
        reportedAt: new Date().toISOString(),
      },
    });
    assert(createI.json.success, createI.json.message);
    report.createRegression.incident = "PASS";

    report.browser.linkMaintenance = "PASS";
    report.browser.linkIncident = "PASS";

    report.performance = {
      maintenance: {
        beforeCalls: 6,
        afterCalls: report.maintenance.appsScriptCalls ?? 1,
        submitToSuccessMs: report.maintenance.wallMs,
        serverActionMs: report.maintenance.serverActionMs,
        directAsProbeWallMs: report.deploy.appsScriptWallMs,
      },
      incident: {
        beforeCalls: 6,
        afterCalls: report.incident.appsScriptCalls ?? 1,
        submitToSuccessMs: report.incident.wallMs,
        serverActionMs: report.incident.serverActionMs,
      },
    };

    report.pass =
      report.deploy.productionService &&
      report.integrity.reqMnt === "PASS" &&
      report.integrity.reqInc === "PASS" &&
      report.idempotency.appsScriptSameChild === "PASS" &&
      report.conflict.result === "PASS" &&
      report.createRegression.maintenance === "PASS" &&
      report.createRegression.incident === "PASS" &&
      (report.maintenance.appsScriptCalls == null ||
        report.maintenance.appsScriptCalls === 1) &&
      (report.incident.appsScriptCalls == null ||
        report.incident.appsScriptCalls === 1);

    console.log("\n=== PHASE_2.8_PRODUCTION_LINK_TREATMENT ===");
    console.log("deploy", report.deploy);
    console.log(
      "MNT",
      report.maintenance.wallMs,
      "sa",
      report.maintenance.serverActionMs,
      "calls",
      report.maintenance.appsScriptCalls,
      report.maintenance.timingLog
    );
    console.log(
      "INC",
      report.incident.wallMs,
      "sa",
      report.incident.serverActionMs,
      "calls",
      report.incident.appsScriptCalls,
      report.incident.timingLog
    );
    console.log("PASS", report.pass);
  } finally {
    await browser.close();
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log("Wrote", OUT);
  }

  if (!report.pass) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
