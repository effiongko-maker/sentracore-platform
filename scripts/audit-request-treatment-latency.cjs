/**
 * REQUEST_TREATMENT_LATENCY_AUDIT — measure only, no product code changes.
 * Auth: magiclink. Pathname assertions. [browser-verify] fixtures.
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";
const TAG = "[browser-verify][latency]";

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
function now() {
  return Date.now();
}
function ms(a, b) {
  return a == null || b == null ? null : Math.round(b - a);
}

async function asTimed(env, resource, action, payload = {}) {
  const url = env.NEXT_PUBLIC_API_URL || env.APPS_SCRIPT_URL;
  const body = JSON.stringify({ resource, action, payload });
  const t0 = now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  });
  const text = await res.text();
  const t1 = now();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${resource}/${action}: non-JSON (${res.status})`);
  }
  if (!json.success) {
    throw new Error(`${resource}/${action}: ${json.message || res.status}`);
  }
  const data = json.data;
  const diag =
    data && typeof data === "object" ? data._listDiagnostics || null : null;
  return {
    wallMs: t1 - t0,
    bytes: Buffer.byteLength(text, "utf8"),
    data,
    diag,
    status: res.status,
  };
}

async function asCall(env, resource, action, payload = {}) {
  const r = await asTimed(env, resource, action, payload);
  return r.data;
}

function installActionProbe(page) {
  const actions = [];
  page.on("request", (req) => {
    const h = req.headers();
    if (req.method() === "POST" && (h["next-action"] || h["Next-Action"])) {
      actions.push({
        id: h["next-action"] || h["Next-Action"],
        url: req.url(),
        tStart: now(),
        tEnd: null,
        status: null,
        bytes: null,
      });
    }
  });
  page.on("response", async (res) => {
    const req = res.request();
    const h = req.headers();
    if (req.method() !== "POST" || !(h["next-action"] || h["Next-Action"]))
      return;
    const id = h["next-action"] || h["Next-Action"];
    const entry = [...actions].reverse().find((a) => a.id === id && !a.tEnd);
    if (!entry) return;
    entry.tEnd = now();
    entry.status = res.status();
    try {
      const buf = await res.body();
      entry.bytes = buf.length;
    } catch {
      entry.bytes = null;
    }
  });
  return {
    since(t0) {
      return actions
        .filter((a) => a.tStart >= t0)
        .map((a) => ({
          id: String(a.id).slice(0, 12),
          wallMs: ms(a.tStart, a.tEnd),
          status: a.status,
          bytes: a.bytes,
          tStart: a.tStart,
          tEnd: a.tEnd,
        }));
    },
    lastCompletedSince(t0) {
      const list = actions.filter((a) => a.tStart >= t0 && a.tEnd);
      return list.length ? list[list.length - 1] : null;
    },
  };
}

async function ensureAuth(page, admin) {
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (error) throw error;
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
  const row = page.locator("tr", { hasText: requestId }).first();
  await row.getByRole("button", { name: /Actions for/i }).click();
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("dialog").waitFor({ timeout: 20000 });
}

async function closeAll(page) {
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
}

(async () => {
  const env = loadEnv();
  const stamp = Date.now();
  const report = {
    startedAt: new Date().toISOString(),
    architecture: {},
    dataset: {},
    appsScriptFloors: {},
    createMaintenance: {},
    createIncident: {},
    linkMaintenance: {},
    linkIncident: {},
    recordsCreated: [],
  };

  // ---- Static architecture notes (from code inspection) ----
  report.architecture = {
    createSequence: [
      "loadRequest (AS getById)",
      "lease claim (Supabase)",
      "create child (AS create) [sourceRequestId set here]",
      "emit event (Supabase) + optional child update (AS update event id)",
      "loadRequest (AS getById)",
      "append reverse-link (AS update request)",
      "emit link/create event (Supabase)",
      "return → toast → onCreated → getRequestTreatmentDetail (extra SA)",
    ],
    linkSearch: [
      "modal open → useEffect fires search with query=''",
      "each Search submit → new server action",
      "SA: loadRequest getById + list* pageSize=50 facility-scoped",
      "Next filters linkable (unowned or owned by this request)",
      "NOT client catalogue; NOT sheet filter for sourceRequestId",
    ],
    linkWrite: [
      "loadRequest getById",
      "lease",
      "get child",
      "update child sourceRequestId FIRST",
      "loadRequest + append reverse-link SECOND",
      "get child again + loadRequest",
      "emit event",
    ],
  };

  // ---- Dataset + AS floors ----
  const mntList = await asTimed(env, "maintenance", "getAll", {
    page: 1,
    pageSize: 1,
    _auditTiming: true,
  });
  const incList = await asTimed(env, "incidents", "getAll", {
    page: 1,
    pageSize: 1,
    _auditTiming: true,
  });
  const mntSearchLike = await asTimed(env, "maintenance", "getAll", {
    page: 1,
    pageSize: 50,
    facilityId: "FAC-0001",
    _auditTiming: true,
  });
  const incSearchLike = await asTimed(env, "incidents", "getAll", {
    page: 1,
    pageSize: 50,
    facilityId: "FAC-0001",
    _auditTiming: true,
  });

  report.dataset = {
    maintenanceTotal: mntList.data?.total ?? null,
    incidentTotal: incList.data?.total ?? null,
    maintenanceListWallMs: mntList.wallMs,
    incidentListWallMs: incList.wallMs,
    maintenanceListDiag: mntList.diag,
    incidentListDiag: incList.diag,
    searchLikeMaintenance: {
      wallMs: mntSearchLike.wallMs,
      bytes: mntSearchLike.bytes,
      total: mntSearchLike.data?.total,
      returned: mntSearchLike.data?.data?.length,
      diag: mntSearchLike.diag,
    },
    searchLikeIncident: {
      wallMs: incSearchLike.wallMs,
      bytes: incSearchLike.bytes,
      total: incSearchLike.data?.total,
      returned: incSearchLike.data?.data?.length,
      diag: incSearchLike.diag,
    },
  };

  // Approximate linkable = unowned sourceRequestId within FAC-0001 pageSize 50 sample
  // Full scan: get larger pages for audit count (still measurement-only)
  const mntFac = await asTimed(env, "maintenance", "getAll", {
    page: 1,
    pageSize: 200,
    facilityId: "FAC-0001",
  });
  const incFac = await asTimed(env, "incidents", "getAll", {
    page: 1,
    pageSize: 200,
    facilityId: "FAC-0001",
  });
  const mntRows = mntFac.data?.data || [];
  const incRows = incFac.data?.data || [];
  report.dataset.linkableMaintenanceApprox = mntRows.filter(
    (r) => !String(r.sourceRequestId || "").trim()
  ).length;
  report.dataset.linkableIncidentApprox = incRows.filter(
    (r) => !String(r.sourceRequestId || "").trim()
  ).length;
  report.dataset.facilityMaintenanceSample = {
    wallMs: mntFac.wallMs,
    bytes: mntFac.bytes,
    returned: mntRows.length,
    total: mntFac.data?.total,
  };
  report.dataset.facilityIncidentSample = {
    wallMs: incFac.wallMs,
    bytes: incFac.bytes,
    returned: incRows.length,
    total: incFac.data?.total,
  };

  // Microbench sequential AS ops (simulate create boundaries)
  const pingReq = await asTimed(env, "requests", "getById", {
    id: "REQ-2026-000001",
  }).catch(async () => {
    // fallback: create a throwaway then getById
    const tmp = await asCall(env, "requests", "create", {
      title: `${TAG} ping ${stamp}`,
      description: TAG,
      facilityId: "FAC-0001",
      occurredAt: new Date().toISOString(),
      requestType: "maintenance",
      status: "under_review",
      reporterName: "Latency Audit",
    });
    report.recordsCreated.push(tmp.id);
    return asTimed(env, "requests", "getById", { id: tmp.id });
  });

  const createMntFloor = await asTimed(env, "maintenance", "create", {
    title: `${TAG} floor-mnt ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "low",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  report.recordsCreated.push(createMntFloor.data.id);

  const createIncFloor = await asTimed(env, "incidents", "create", {
    title: `${TAG} floor-inc ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    type: "safety",
    source: "manual",
    severity: "low",
    status: "reported",
    reportedAt: new Date().toISOString(),
  });
  report.recordsCreated.push(createIncFloor.data.id);

  const updateReqFloor = await asTimed(env, "requests", "update", {
    id: report.recordsCreated[0] || createMntFloor.data.id,
    // harmless no-op-ish — only if we have a request id from ping fallback
  }).catch(() => null);

  report.appsScriptFloors = {
    requestsGetByIdWallMs: pingReq.wallMs,
    requestsGetByIdBytes: pingReq.bytes,
    maintenanceCreateWallMs: createMntFloor.wallMs,
    incidentCreateWallMs: createIncFloor.wallMs,
    estimatedCreateSequentialAsCalls: 5,
    estimatedCreateSequentialFloorMs:
      pingReq.wallMs * 2 +
      createMntFloor.wallMs +
      pingReq.wallMs /* update child approx use get */ +
      (updateReqFloor?.wallMs || pingReq.wallMs),
    note:
      "Each AS call pays full round-trip; sheet work inside create is typically much smaller than wall.",
  };

  // Fixtures for browser flows
  const reqMnt = await asCall(env, "requests", "create", {
    title: `${TAG} Create MNT ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Latency Audit",
  });
  const reqInc = await asCall(env, "requests", "create", {
    title: `${TAG} Create INC ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "incident",
    status: "under_review",
    reporterName: "Latency Audit",
  });
  const reqLink = await asCall(env, "requests", "create", {
    title: `${TAG} Link host ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Latency Audit",
  });
  const linkableMnt = await asCall(env, "maintenance", "create", {
    title: `${TAG} linkable MNT ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "low",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  const linkableInc = await asCall(env, "incidents", "create", {
    title: `${TAG} linkable INC ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    type: "safety",
    source: "manual",
    severity: "low",
    status: "reported",
    reportedAt: new Date().toISOString(),
  });
  report.recordsCreated.push(
    reqMnt.id,
    reqInc.id,
    reqLink.id,
    linkableMnt.id,
    linkableInc.id
  );

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const page = await browser.newPage();
  const probe = installActionProbe(page);

  try {
    await ensureAuth(page, admin);
    console.log("AUTH_OK");

    // ========== CREATE MAINTENANCE ==========
    {
      const ev = {};
      await openRequestView(page, reqMnt.id);
      // Wait detail ready
      await page.waitForSelector('button:has-text("Create Maintenance")', {
        timeout: 60000,
      });
      ev.tButtonClick = now();
      await page.getByRole("button", { name: "Create Maintenance" }).click();
      await page.waitForSelector("text=Create Maintenance", { timeout: 15000 });
      // Form modal title
      const createDlg = page
        .getByRole("dialog")
        .filter({ hasText: `From ${reqMnt.id}` });
      await createDlg.waitFor({ timeout: 15000 });
      ev.tModalOpen = now();
      await createDlg.locator("#create-mnt-from-req").waitFor({ timeout: 10000 });
      await createDlg.getByRole("button", { name: "Create Maintenance" }).waitFor();
      ev.tFormReady = now();

      const tSubmitWindow = now();
      ev.tSubmitClick = now();
      await createDlg.getByRole("button", { name: "Create Maintenance" }).click();
      await page.waitForSelector("text=Maintenance created", { timeout: 120000 });
      ev.tSuccessUi = now();

      const action = probe.lastCompletedSince(tSubmitWindow);
      const actions = probe.since(tSubmitWindow);
      ev.submitToSuccessMs = ms(ev.tSubmitClick, ev.tSuccessUi);
      ev.buttonToModalMs = ms(ev.tButtonClick, ev.tModalOpen);
      ev.modalToFormReadyMs = ms(ev.tModalOpen, ev.tFormReady);
      ev.serverActionWallMs = action?.wallMs ?? null;
      ev.serverActionBytes = action?.bytes ?? null;
      ev.actionsInWindow = actions;
      ev.requestId = reqMnt.id;
      report.createMaintenance = ev;
      console.log(
        "CREATE_MNT",
        ev.submitToSuccessMs,
        "sa=",
        ev.serverActionWallMs
      );
      await closeAll(page);
    }

    // ========== CREATE INCIDENT ==========
    {
      const ev = {};
      await openRequestView(page, reqInc.id);
      await page.waitForSelector('button:has-text("Create Incident")', {
        timeout: 60000,
      });
      ev.tButtonClick = now();
      await page.getByRole("button", { name: "Create Incident" }).click();
      const createDlg = page
        .getByRole("dialog")
        .filter({ hasText: `From ${reqInc.id}` });
      await createDlg.waitFor({ timeout: 15000 });
      ev.tModalOpen = now();
      await createDlg.locator("#create-inc-from-req").waitFor({ timeout: 10000 }).catch(() => {});
      await createDlg.getByRole("button", { name: "Create Incident" }).waitFor();
      ev.tFormReady = now();

      const tSubmitWindow = now();
      ev.tSubmitClick = now();
      await createDlg.getByRole("button", { name: "Create Incident" }).click();
      await page.waitForSelector("text=Incident created", { timeout: 120000 });
      ev.tSuccessUi = now();

      const action = probe.lastCompletedSince(tSubmitWindow);
      ev.submitToSuccessMs = ms(ev.tSubmitClick, ev.tSuccessUi);
      ev.buttonToModalMs = ms(ev.tButtonClick, ev.tModalOpen);
      ev.modalToFormReadyMs = ms(ev.tModalOpen, ev.tFormReady);
      ev.serverActionWallMs = action?.wallMs ?? null;
      ev.serverActionBytes = action?.bytes ?? null;
      ev.actionsInWindow = probe.since(tSubmitWindow);
      ev.requestId = reqInc.id;
      report.createIncident = ev;
      console.log(
        "CREATE_INC",
        ev.submitToSuccessMs,
        "sa=",
        ev.serverActionWallMs
      );
      await closeAll(page);
    }

    // ========== LINK MAINTENANCE ==========
    {
      const ev = {};
      await openRequestView(page, reqLink.id);
      await page.waitForSelector('button:has-text("Link Maintenance")', {
        timeout: 60000,
      });
      ev.tOpenClick = now();
      const tSearchWindow = now();
      await page.getByRole("button", { name: "Link Maintenance" }).click();
      const linkDlg = page
        .getByRole("dialog")
        .filter({ hasText: "Link existing Maintenance" });
      await linkDlg.waitFor({ timeout: 15000 });
      ev.tModalOpen = now();
      // Initial empty search runs on open — wait until Searching… clears and count shows
      await page.waitForFunction(
        () => {
          const t = document.body.innerText;
          return (
            t.includes("linkable record") && !t.includes("Searching…")
          );
        },
        { timeout: 120000 }
      );
      ev.tInitialResults = now();
      const openSearchAction = probe.lastCompletedSince(tSearchWindow);

      // Explicit search for target id
      const tTypedSearch = now();
      await page.fill("#link-treatment-search", linkableMnt.id);
      await page.waitForFunction(
        (id) =>
          document.body.innerText.includes(id) &&
          !document.body.innerText.includes("Loading maintenance"),
        linkableMnt.id,
        { timeout: 120000 }
      );
      ev.tSearchResults = now();
      const typedSearchAction = probe.lastCompletedSince(tTypedSearch);

      ev.openToInitialResultsMs = ms(ev.tOpenClick, ev.tInitialResults);
      ev.typedSearchToResultsMs = ms(tTypedSearch, ev.tSearchResults);
      ev.initialSearchServerActionMs = openSearchAction?.wallMs ?? null;
      ev.typedSearchServerActionMs = typedSearchAction?.wallMs ?? null;
      ev.initialSearchBytes = openSearchAction?.bytes ?? null;
      ev.typedSearchBytes = typedSearchAction?.bytes ?? null;

      // Link click → linked toast
      const tLinkWindow = now();
      ev.tLinkClick = now();
      await linkDlg
        .locator("li", { hasText: linkableMnt.id })
        .getByRole("button", { name: /^Link$/ })
        .click();
      await page.waitForSelector("text=Maintenance linked", { timeout: 120000 });
      ev.tLinkedUi = now();
      const linkAction = probe.lastCompletedSince(tLinkWindow);
      ev.linkClickToLinkedMs = ms(ev.tLinkClick, ev.tLinkedUi);
      ev.linkServerActionMs = linkAction?.wallMs ?? null;
      ev.linkServerActionBytes = linkAction?.bytes ?? null;
      ev.childId = linkableMnt.id;
      ev.requestId = reqLink.id;
      report.linkMaintenance = ev;
      console.log(
        "LINK_MNT open→results",
        ev.openToInitialResultsMs,
        "link→ok",
        ev.linkClickToLinkedMs
      );
      await closeAll(page);
    }

    // ========== LINK INCIDENT (same host request — still treatable) ==========
    {
      const ev = {};
      await openRequestView(page, reqLink.id);
      await page.waitForSelector('button:has-text("Link Incident")', {
        timeout: 60000,
      });
      ev.tOpenClick = now();
      const tSearchWindow = now();
      await page.getByRole("button", { name: "Link Incident" }).click();
      const linkDlg = page
        .getByRole("dialog")
        .filter({ hasText: "Link existing Incident" });
      await linkDlg.waitFor({ timeout: 15000 });
      ev.tModalOpen = now();
      await page.waitForFunction(
        () => {
          const t = document.body.innerText;
          return (
            t.includes("linkable record") && !t.includes("Searching…")
          );
        },
        { timeout: 120000 }
      );
      ev.tInitialResults = now();
      const openSearchAction = probe.lastCompletedSince(tSearchWindow);

      const tTypedSearch = now();
      await page.fill("#link-treatment-search", linkableInc.id);
      await page.waitForFunction(
        (id) =>
          document.body.innerText.includes(id) &&
          !document.body.innerText.includes("Loading incidents"),
        linkableInc.id,
        { timeout: 120000 }
      );
      ev.tSearchResults = now();
      const typedSearchAction = probe.lastCompletedSince(tTypedSearch);

      ev.openToInitialResultsMs = ms(ev.tOpenClick, ev.tInitialResults);
      ev.typedSearchToResultsMs = ms(tTypedSearch, ev.tSearchResults);
      ev.initialSearchServerActionMs = openSearchAction?.wallMs ?? null;
      ev.typedSearchServerActionMs = typedSearchAction?.wallMs ?? null;
      ev.initialSearchBytes = openSearchAction?.bytes ?? null;
      ev.typedSearchBytes = typedSearchAction?.bytes ?? null;

      const tLinkWindow = now();
      ev.tLinkClick = now();
      await linkDlg
        .locator("li", { hasText: linkableInc.id })
        .getByRole("button", { name: /^Link$/ })
        .click();
      await page.waitForSelector("text=Incident linked", { timeout: 120000 });
      ev.tLinkedUi = now();
      const linkAction = probe.lastCompletedSince(tLinkWindow);
      ev.linkClickToLinkedMs = ms(ev.tLinkClick, ev.tLinkedUi);
      ev.linkServerActionMs = linkAction?.wallMs ?? null;
      ev.linkServerActionBytes = linkAction?.bytes ?? null;
      ev.childId = linkableInc.id;
      ev.requestId = reqLink.id;
      report.linkIncident = ev;
      console.log(
        "LINK_INC open→results",
        ev.openToInitialResultsMs,
        "link→ok",
        ev.linkClickToLinkedMs
      );
      await closeAll(page);
    }
  } finally {
    await browser.close();
    writeFileSync(
      "/tmp/request-treatment-latency-audit.json",
      JSON.stringify(report, null, 2)
    );
  }

  // Summary lines for console
  const cm = report.createMaintenance;
  const ci = report.createIncident;
  const lm = report.linkMaintenance;
  const li = report.linkIncident;
  console.log("\n=== REQUEST_TREATMENT_LATENCY_AUDIT (raw ms) ===");
  console.log("CREATE_MNT submit→success", cm.submitToSuccessMs, "SA", cm.serverActionWallMs);
  console.log("CREATE_INC submit→success", ci.submitToSuccessMs, "SA", ci.serverActionWallMs);
  console.log(
    "LINK_MNT open→results",
    lm.openToInitialResultsMs,
    "typed",
    lm.typedSearchToResultsMs,
    "link",
    lm.linkClickToLinkedMs
  );
  console.log(
    "LINK_INC open→results",
    li.openToInitialResultsMs,
    "typed",
    li.typedSearchToResultsMs,
    "link",
    li.linkClickToLinkedMs
  );
  console.log(
    "DATASET mnt",
    report.dataset.maintenanceTotal,
    "inc",
    report.dataset.incidentTotal,
    "linkable~",
    report.dataset.linkableMaintenanceApprox,
    report.dataset.linkableIncidentApprox
  );
  console.log("evidence /tmp/request-treatment-latency-audit.json");
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
