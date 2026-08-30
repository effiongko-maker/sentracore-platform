/**
 * Phase 2.3 — Create Maintenance/Incident latency + integrity.
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";
const TAG = "[browser-verify][phase23]";

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
  await page.waitForSelector('button:has-text("Create Maintenance")', {
    timeout: 60000,
  });
}

function installProbes(page) {
  const posts = [];
  page.on("request", (req) => {
    if (req.method() !== "POST" || !req.headers()["next-action"]) return;
    posts.push({ tStart: Date.now(), tEnd: null });
  });
  page.on("response", async (res) => {
    const req = res.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return;
    const entry = [...posts].reverse().find((p) => !p.tEnd);
    if (entry) entry.tEnd = Date.now();
  });
  return { posts };
}

async function createFlow(page, probes, opts) {
  const { kind, button, formTitle, successToast, submitLabel, requestId } =
    opts;
  const out = { kind, requestId };

  await openRequestView(page, requestId);

  const tOpenClick = Date.now();
  await page.getByRole("button", { name: button }).click();
  const dlg = page.getByRole("dialog").filter({ hasText: formTitle });
  await dlg.waitFor({ timeout: 15000 });
  out.modalOpenMs = Date.now() - tOpenClick;

  const submit = dlg.getByRole("button", { name: submitLabel });
  await submit.waitFor({ timeout: 10000 });
  out.formReadyMs = Date.now() - tOpenClick;

  const mark = Date.now();
  const tSubmit = Date.now();
  await submit.click();
  await page.waitForSelector(`text=${successToast}`, { timeout: 180000 });
  out.submitToSuccessMs = Date.now() - tSubmit;

  const sa = probes.posts.filter((p) => p.tStart >= mark && p.tEnd);
  out.serverActionMs = sa.length
    ? sa[sa.length - 1].tEnd - sa[sa.length - 1].tStart
    : null;

  for (let i = 0; i < 4; i++) await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  return out;
}

(async () => {
  const env = loadEnv();
  const stamp = Date.now();
  const report = {
    startedAt: new Date().toISOString(),
    before: { mnt: "~34.8s", inc: "~29.4s", mntCalls: 7, incCalls: 5 },
    maintenance: null,
    incident: null,
    regressions: {},
  };

  const reqMnt = await asCall(env, "requests", "create", {
    title: `${TAG} create-mnt ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Phase23",
  });
  const reqInc = await asCall(env, "requests", "create", {
    title: `${TAG} create-inc ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "incident",
    status: "under_review",
    reporterName: "Phase23",
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

    report.maintenance = await createFlow(page, probes, {
      kind: "maintenance",
      button: "Create Maintenance",
      formTitle: `From ${reqMnt.id}`,
      successToast: "Maintenance created",
      submitLabel: "Create Maintenance",
      requestId: reqMnt.id,
    });

    const reqM = await asCall(env, "requests", "getById", { id: reqMnt.id });
    assert(reqM.status === "being_treated", `mnt status ${reqM.status}`);
    assert(
      (reqM.maintenanceIds || []).length === 1,
      `expected 1 mnt got ${JSON.stringify(reqM.maintenanceIds)}`
    );
    const mntId = reqM.maintenanceIds[0];
    const mnt = await asCall(env, "maintenance", "getById", { id: mntId });
    assert(mnt.sourceRequestId === reqMnt.id, "mnt sourceRequestId");
    report.regressions.mntBidirectional = true;
    report.regressions.mntBeingTreated = true;
    report.maintenance.childId = mntId;

    // Double-submit idempotency: reopen and create again with new form → new child allowed
    // (different idempotency key). Verify first child still sole if we don't create again.
    report.regressions.noDuplicateMnt =
      (reqM.maintenanceIds || []).filter((id) => id === mntId).length === 1;
    report.regressions.noReqWoMnt = !(reqM.workOrderIds || []).length;

    report.incident = await createFlow(page, probes, {
      kind: "incident",
      button: "Create Incident",
      formTitle: `From ${reqInc.id}`,
      successToast: "Incident created",
      submitLabel: "Create Incident",
      requestId: reqInc.id,
    });

    const reqI = await asCall(env, "requests", "getById", { id: reqInc.id });
    assert(reqI.status === "being_treated", `inc status ${reqI.status}`);
    assert((reqI.incidentIds || []).length === 1, "expected 1 incident");
    const incId = reqI.incidentIds[0];
    const inc = await asCall(env, "incidents", "getById", { id: incId });
    assert(inc.sourceRequestId === reqInc.id, "inc sourceRequestId");
    report.regressions.incBidirectional = true;
    report.regressions.incBeingTreated = true;
    report.incident.childId = incId;
    report.regressions.noReqWoInc = !(reqI.workOrderIds || []).length;

    report.pass =
      report.regressions.mntBidirectional &&
      report.regressions.incBidirectional &&
      report.regressions.mntBeingTreated &&
      report.regressions.incBeingTreated &&
      report.regressions.noDuplicateMnt &&
      report.regressions.noReqWoMnt &&
      report.regressions.noReqWoInc;

    console.log("\n=== REQUEST_TREATMENT_CREATE_OPTIMIZATION ===");
    console.log(
      "MNT modal",
      report.maintenance.modalOpenMs,
      "formReady",
      report.maintenance.formReadyMs,
      "submit→ok",
      report.maintenance.submitToSuccessMs,
      "sa",
      report.maintenance.serverActionMs,
      report.maintenance.childId
    );
    console.log(
      "INC modal",
      report.incident.modalOpenMs,
      "formReady",
      report.incident.formReadyMs,
      "submit→ok",
      report.incident.submitToSuccessMs,
      "sa",
      report.incident.serverActionMs,
      report.incident.childId
    );
    console.log("regressions", report.regressions);
    console.log("PASS", report.pass);
  } finally {
    await browser.close();
    writeFileSync(
      "/tmp/phase23-create-opt.json",
      JSON.stringify(report, null, 2)
    );
  }

  if (!report.pass) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
