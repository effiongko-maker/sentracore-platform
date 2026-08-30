/**
 * Phase 2 adjacent-flow browser pack.
 * Auth via magiclink (no password mutation). Pathname assertions only.
 * Fixtures titled with [browser-verify].
 */
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { readFileSync, writeFileSync } = require("fs");

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";
const TAG = "[browser-verify]";

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
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ resource, action, payload }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`${resource}/${action}: ${json.message || res.status}`);
  }
  return json.data;
}

async function openRowView(page, modulePath, recordId) {
  await page.goto(`${BASE}${modulePath}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  assert(pathOf(page) === modulePath, `expected ${modulePath} got ${pathOf(page)}`);
  // Prefer module toolbar search — never the global "Search or jump to…" palette.
  const search = page
    .getByPlaceholder(
      /Search (incidents|requests)|Search by title, id, description/i
    )
    .first();
  assert(await search.count(), `toolbar search missing on ${modulePath}`);
  await search.fill(recordId);
  await page.waitForFunction(
    (id) => document.body.innerText.includes(id),
    recordId,
    { timeout: 60000 }
  );
  const row = page.locator("tr", { hasText: recordId }).first();
  assert(await row.count(), `${recordId} not visible on ${modulePath}`);
  await row.getByRole("button", { name: /Actions for/i }).click();
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("dialog").waitFor({ timeout: 20000 });
}

async function openRowEdit(page, modulePath, recordId) {
  await page.goto(`${BASE}${modulePath}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  assert(pathOf(page) === modulePath, `expected ${modulePath} got ${pathOf(page)}`);
  const search = page
    .getByPlaceholder(
      /Search (incidents|requests)|Search by title, id, description/i
    )
    .first();
  assert(await search.count(), `toolbar search missing on ${modulePath}`);
  await search.fill(recordId);
  await page.waitForFunction(
    (id) => document.body.innerText.includes(id),
    recordId,
    { timeout: 60000 }
  );
  const row = page.locator("tr", { hasText: recordId }).first();
  assert(await row.count(), `${recordId} not visible on ${modulePath}`);
  await row.getByRole("button", { name: /Actions for/i }).click();
  await page.getByRole("menuitem", { name: /Edit/i }).click();
  await page.getByRole("dialog").waitFor({ timeout: 20000 });
}

async function closeDialog(page) {
  const close = page.getByRole("dialog").getByRole("button", { name: /^Close$/ });
  if (await close.count()) await close.click().catch(() => {});
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
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
  assert(pathOf(page) === "/requests", `auth fail pathname=${pathOf(page)}`);
  assert((await page.locator("#email").count()) === 0, "login form visible");
  const me = await page.request.get(`${BASE}/api/auth/me`);
  assert(me.ok(), `/api/auth/me ${me.status()}`);
}

(async () => {
  const env = loadEnv();
  const stamp = Date.now();
  const report = {
    startedAt: new Date().toISOString(),
    results: {},
    recordsCreated: [],
    regressions: [],
    runtimeDefects: [],
  };

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ---- Fixtures (Apps Script) ----
  const incForMnt = await asCall(env, "incidents", "create", {
    title: `${TAG} INC→MNT ${stamp}`,
    description: `${TAG} triage create maintenance`,
    facilityId: "FAC-0001",
    type: "safety",
    source: "manual",
    severity: "medium",
    status: "reported",
    reportedAt: new Date().toISOString(),
  });
  report.recordsCreated.push(incForMnt.id);

  const mntForWo = await asCall(env, "maintenance", "create", {
    title: `${TAG} MNT→WO ${stamp}`,
    description: `${TAG} create work order`,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
    requiresWorkOrder: true,
  });
  report.recordsCreated.push(mntForWo.id);

  const incForWo = await asCall(env, "incidents", "create", {
    title: `${TAG} INC→WO ${stamp}`,
    description: `${TAG} triage create work order`,
    facilityId: "FAC-0001",
    type: "safety",
    source: "manual",
    severity: "medium",
    status: "reported",
    reportedAt: new Date().toISOString(),
  });
  report.recordsCreated.push(incForWo.id);

  const reqResolve = await asCall(env, "requests", "create", {
    title: `${TAG} Resolve ${stamp}`,
    description: `${TAG} resolve flow`,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Browser Verify",
  });
  report.recordsCreated.push(reqResolve.id);

  const reqCancel = await asCall(env, "requests", "create", {
    title: `${TAG} Cancel ${stamp}`,
    description: `${TAG} cancel flow`,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Browser Verify",
  });
  report.recordsCreated.push(reqCancel.id);

  // Attach a disposable MNT to cancel request so we can verify relationships kept
  const mntOnCancel = await asCall(env, "maintenance", "create", {
    title: `${TAG} child of cancel REQ ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "request",
    priority: "low",
    status: "requested",
    reportedAt: new Date().toISOString(),
    sourceRequestId: reqCancel.id,
  });
  report.recordsCreated.push(mntOnCancel.id);
  await asCall(env, "requests", "update", {
    id: reqCancel.id,
    maintenanceIds: [mntOnCancel.id],
    status: "being_treated",
  });

  const reqA = await asCall(env, "requests", "create", {
    title: `${TAG} Conflict A ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Browser Verify",
  });
  const reqB = await asCall(env, "requests", "create", {
    title: `${TAG} Conflict B ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "under_review",
    reporterName: "Browser Verify",
  });
  const mntConflict = await asCall(env, "maintenance", "create", {
    title: `${TAG} Conflict child ${stamp}`,
    description: TAG,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "low",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  report.recordsCreated.push(reqA.id, reqB.id, mntConflict.id);

  console.log("FIXTURES", report.recordsCreated);

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const page = await browser.newPage();

  try {
    await ensureAuth(page, admin);
    console.log("AUTH_OK");

    // ========== TEST 1: Incident → Maintenance ==========
    try {
      const ev = { status: "FAIL", lastOk: null };
      await openRowView(page, "/incidents", incForMnt.id);
      ev.lastOk = "incident_detail_open";
      const dialog = page.getByRole("dialog");
      assert(
        await dialog.getByText("What should happen next?").count(),
        "triage UI missing"
      );
      ev.lastOk = "triage_available";
      await dialog
        .getByText("Create a maintenance request", { exact: true })
        .click();
      await dialog.getByRole("button", { name: "Apply next step" }).click();
      await page.waitForSelector("text=Next step applied", { timeout: 90000 });
      ev.lastOk = "triage_applied_toast";

      // Wait for maintenance id to appear in dialog
      await page.waitForTimeout(2000);
      let text = await dialog.innerText();
      let mntMatch = text.match(/MNT-20\d{2}-\d+/);
      if (!mntMatch) {
        await closeDialog(page);
        await openRowView(page, "/incidents", incForMnt.id);
        await page.waitForTimeout(2500);
        text = await page.getByRole("dialog").innerText();
        mntMatch = text.match(/MNT-20\d{2}-\d+/);
      }
      assert(mntMatch, `no MNT id in incident UI after triage: ${text.slice(0, 300)}`);
      const mntId = mntMatch[0];
      ev.maintenanceId = mntId;
      report.recordsCreated.push(mntId);

      const incFresh = await asCall(env, "incidents", "getById", {
        id: incForMnt.id,
      });
      const mntFresh = await asCall(env, "maintenance", "getById", { id: mntId });
      assert(
        (incFresh.maintenanceIds || []).includes(mntId),
        `INC.maintenanceIds missing ${mntId}: ${JSON.stringify(incFresh.maintenanceIds)}`
      );
      assert(
        mntFresh.incidentId === incForMnt.id,
        `MNT.incidentId expected ${incForMnt.id} got ${mntFresh.incidentId}`
      );
      assert(
        !mntFresh.sourceRequestId,
        `unexpected sourceRequestId on MNT: ${mntFresh.sourceRequestId}`
      );
      ev.lastOk = "relationships_verified";
      ev.status = "PASS";
      report.results.incidentToMaintenance = ev;
      console.log("TEST1 PASS", mntId);
      await closeDialog(page);
    } catch (e) {
      report.results.incidentToMaintenance = {
        status: "FAIL",
        error: e.message,
        failingAction: "Incident→Maintenance triage",
      };
      report.runtimeDefects.push({
        test: "Incident→Maintenance",
        error: e.message,
      });
      console.log("TEST1 FAIL", e.message);
      await page.screenshot({ path: "/tmp/adj-t1-fail.png", fullPage: true }).catch(() => {});
      await closeDialog(page);
    }

    // ========== TEST 2: Maintenance → Work Order ==========
    // Existing UI path: Edit maintenance → Requires work order=Yes → Create new work order.
    // View-modal Create button only appears when requiresWorkOrder is already true;
    // sheet persistence does not retain that flag without a WO id (verified below).
    try {
      const ev = { status: "FAIL", lastOk: null, path: "edit_form" };
      // Probe View modal first for Create button availability
      await openRowView(page, "/maintenance", mntForWo.id);
      const viewDialog = page.getByRole("dialog");
      const viewCreate = viewDialog.getByRole("button", {
        name: "Create new work order",
      });
      ev.viewCreateVisible = (await viewCreate.count()) > 0;
      await closeDialog(page);

      await openRowEdit(page, "/maintenance", mntForWo.id);
      ev.lastOk = "maintenance_edit_open";
      const dialog = page.getByRole("dialog");
      await dialog.locator("#mnt-requires-wo").selectOption("true");
      ev.lastOk = "requires_wo_set";
      const createWo = dialog.getByRole("button", {
        name: "Create new work order",
      });
      assert(await createWo.count(), "Create new work order button missing on edit form");
      await createWo.click();
      await page.waitForSelector("text=Work order created", { timeout: 90000 });
      ev.lastOk = "wo_created_toast";
      await page.waitForTimeout(2000);

      let text = await dialog.innerText();
      let woMatch = text.match(/WO-20\d{2}-\d+/);
      if (!woMatch) {
        await closeDialog(page);
        await openRowView(page, "/maintenance", mntForWo.id);
        await page.waitForTimeout(2500);
        text = await page.getByRole("dialog").innerText();
        woMatch = text.match(/WO-20\d{2}-\d+/);
      }
      assert(woMatch, `no WO id in maintenance UI`);
      const woId = woMatch[0];
      ev.workOrderId = woId;
      report.recordsCreated.push(woId);

      const mntFresh = await asCall(env, "maintenance", "getById", {
        id: mntForWo.id,
      });
      let wo = null;
      try {
        wo = await asCall(env, "work-orders", "getById", { id: woId });
      } catch {
        wo = null;
      }
      const mntWos = [
        ...(mntFresh.workOrderIds || []),
        mntFresh.workOrderId,
      ].filter(Boolean);
      assert(mntWos.includes(woId), `MNT workOrderIds missing ${woId}`);
      if (wo) {
        assert(
          wo.maintenanceId === mntForWo.id,
          `WO.maintenanceId expected ${mntForWo.id} got ${wo.maintenanceId}`
        );
        assert(
          !wo.sourceRequestId,
          `unexpected REQ on WO: ${wo.sourceRequestId}`
        );
      }
      // No unexpected Request created for this MNT
      assert(
        !mntFresh.sourceRequestId,
        `unexpected sourceRequestId on MNT: ${mntFresh.sourceRequestId}`
      );
      ev.lastOk = "relationships_verified";
      ev.status = "PASS";
      report.results.maintenanceToWorkOrder = ev;
      console.log("TEST2 PASS", woId, "viewCreateVisible=", ev.viewCreateVisible);
      await closeDialog(page);
    } catch (e) {
      report.results.maintenanceToWorkOrder = {
        status: "FAIL",
        error: e.message,
        failingAction: "Maintenance→WO",
      };
      report.runtimeDefects.push({ test: "Maintenance→WO", error: e.message });
      console.log("TEST2 FAIL", e.message);
      await page.screenshot({ path: "/tmp/adj-t2-fail.png", fullPage: true }).catch(() => {});
      await closeDialog(page);
    }

    // ========== TEST 3: Incident → Work Order ==========
    try {
      const ev = { status: "FAIL", lastOk: null };
      await openRowView(page, "/incidents", incForWo.id);
      ev.lastOk = "incident_detail_open";
      const dialog = page.getByRole("dialog");
      assert(
        await dialog.getByText("What should happen next?").count(),
        "triage UI missing"
      );
      await dialog.getByText("Create a work order", { exact: true }).click();
      await dialog.getByRole("button", { name: "Apply next step" }).click();
      await page.waitForSelector("text=Next step applied", { timeout: 90000 });
      ev.lastOk = "triage_applied";
      await page.waitForTimeout(2500);

      let text = await dialog.innerText();
      let woMatch = text.match(/WO-20\d{2}-\d+/);
      if (!woMatch) {
        await closeDialog(page);
        await openRowView(page, "/incidents", incForWo.id);
        await page.waitForTimeout(3000);
        text = await page.getByRole("dialog").innerText();
        woMatch = text.match(/WO-20\d{2}-\d+/);
      }
      assert(woMatch, `no WO in incident UI after triage`);
      const woId = woMatch[0];
      ev.workOrderId = woId;
      report.recordsCreated.push(woId);

      const incFresh = await asCall(env, "incidents", "getById", {
        id: incForWo.id,
      });
      const wos = [
        ...(incFresh.workOrderIds || []),
        incFresh.workOrderId,
      ].filter(Boolean);
      assert(wos.includes(woId), `INC workOrderIds missing ${woId}`);
      // should not have created maintenance for create_work_order path
      assert(
        !(incFresh.maintenanceIds || []).length,
        `unexpected MNT on INC: ${JSON.stringify(incFresh.maintenanceIds)}`
      );
      ev.lastOk = "relationships_verified";
      ev.status = "PASS";
      report.results.incidentToWorkOrder = ev;
      console.log("TEST3 PASS", woId);
      await closeDialog(page);
    } catch (e) {
      report.results.incidentToWorkOrder = {
        status: "FAIL",
        error: e.message,
        failingAction: "Incident→WO",
      };
      report.runtimeDefects.push({ test: "Incident→WO", error: e.message });
      console.log("TEST3 FAIL", e.message);
      await page.screenshot({ path: "/tmp/adj-t3-fail.png", fullPage: true }).catch(() => {});
      await closeDialog(page);
    }

    // ========== TEST 4: Request Resolve ==========
    try {
      const ev = { status: "FAIL", lastOk: null, requestId: reqResolve.id };
      await openRowView(page, "/requests", reqResolve.id);
      ev.lastOk = "request_open";
      await page.getByRole("button", { name: "Resolve Request" }).click();
      await page.waitForSelector("text=Resolve this request?", { timeout: 15000 });
      ev.lastOk = "confirm_ui";
      await page.getByRole("button", { name: "Resolve", exact: true }).click();
      await page.waitForSelector("text=Request resolved", { timeout: 90000 });
      ev.lastOk = "resolve_toast";

      // Poll API until status settles
      let reqFresh = null;
      for (let i = 0; i < 20; i++) {
        reqFresh = await asCall(env, "requests", "getById", {
          id: reqResolve.id,
        });
        if (reqFresh.status === "resolved") break;
        await page.waitForTimeout(1000);
      }
      assert(
        reqFresh.status === "resolved",
        `expected resolved got ${reqFresh.status}`
      );
      await closeDialog(page);
      await openRowView(page, "/requests", reqResolve.id);
      await page.waitForTimeout(1500);
      const text = await page.getByRole("dialog").innerText();
      ev.statusAfter = reqFresh.status;
      ev.uiHasResolved = /resolved/i.test(text);
      ev.lastOk = "status_persisted";
      ev.status = "PASS";
      report.results.requestResolve = ev;
      console.log("TEST4 PASS", reqResolve.id);
      await closeDialog(page);
    } catch (e) {
      report.results.requestResolve = {
        status: "FAIL",
        error: e.message,
        requestId: reqResolve.id,
      };
      report.runtimeDefects.push({ test: "Request Resolve", error: e.message });
      console.log("TEST4 FAIL", e.message);
      await page.screenshot({ path: "/tmp/adj-t4-fail.png", fullPage: true }).catch(() => {});
      await closeDialog(page);
    }

    // ========== TEST 5: Request Cancel ==========
    try {
      const ev = { status: "FAIL", lastOk: null, requestId: reqCancel.id };
      await openRowView(page, "/requests", reqCancel.id);
      ev.lastOk = "request_open";
      await page.getByRole("button", { name: "Cancel Request" }).click();
      await page.waitForSelector("text=Cancel this request?", { timeout: 15000 });
      ev.lastOk = "confirm_ui";
      await page.getByRole("button", { name: "Cancel request", exact: true }).click();
      await page.waitForSelector("text=Request cancelled", { timeout: 90000 });
      ev.lastOk = "cancel_toast";

      let reqFresh = null;
      for (let i = 0; i < 20; i++) {
        reqFresh = await asCall(env, "requests", "getById", {
          id: reqCancel.id,
        });
        if (reqFresh.status === "cancelled") break;
        await page.waitForTimeout(1000);
      }
      assert(
        reqFresh.status === "cancelled",
        `expected cancelled got ${reqFresh.status}`
      );
      assert(
        (reqFresh.maintenanceIds || []).includes(mntOnCancel.id),
        "cancel removed maintenance relationship"
      );
      const mntFresh = await asCall(env, "maintenance", "getById", {
        id: mntOnCancel.id,
      });
      assert(
        mntFresh.sourceRequestId === reqCancel.id,
        "child sourceRequestId cleared on cancel"
      );
      ev.statusAfter = reqFresh.status;
      ev.relationshipPreserved = true;
      ev.status = "PASS";
      report.results.requestCancel = ev;
      console.log("TEST5 PASS", reqCancel.id);
      await closeDialog(page);
    } catch (e) {
      report.results.requestCancel = {
        status: "FAIL",
        error: e.message,
        requestId: reqCancel.id,
      };
      report.runtimeDefects.push({ test: "Request Cancel", error: e.message });
      console.log("TEST5 FAIL", e.message);
      await page.screenshot({ path: "/tmp/adj-t5-fail.png", fullPage: true }).catch(() => {});
      await closeDialog(page);
    }

    // ========== TEST 6: Link Conflict ==========
    try {
      const ev = { status: "FAIL", lastOk: null };
      // Link MNT to REQ-A via UI
      await openRowView(page, "/requests", reqA.id);
      await page.getByRole("button", { name: "Link Maintenance" }).click();
      await page.waitForSelector("text=Link existing Maintenance", {
        timeout: 15000,
      });
      await page.fill("#link-treatment-search", mntConflict.id);
      await page.waitForFunction(
        (id) =>
          document.body.innerText.includes(id) &&
          !document.body.innerText.includes("Loading maintenance"),
        mntConflict.id,
        { timeout: 90000 }
      );
      const linkA = page
        .locator("li", { hasText: mntConflict.id })
        .getByRole("button", { name: /^Link$/ });
      assert(await linkA.count(), "conflict child not in search for REQ-A");
      await linkA.click();
      await page.waitForSelector("text=Maintenance linked", { timeout: 90000 });
      ev.lastOk = "linked_to_A";

      let reqAFresh = null;
      let mntFresh = null;
      for (let i = 0; i < 20; i++) {
        reqAFresh = await asCall(env, "requests", "getById", { id: reqA.id });
        mntFresh = await asCall(env, "maintenance", "getById", {
          id: mntConflict.id,
        });
        if (
          (reqAFresh.maintenanceIds || []).includes(mntConflict.id) &&
          mntFresh.sourceRequestId === reqA.id
        )
          break;
        await page.waitForTimeout(1000);
      }
      assert(
        (reqAFresh.maintenanceIds || []).includes(mntConflict.id),
        "REQ-A missing MNT after link"
      );
      assert(
        mntFresh.sourceRequestId === reqA.id,
        `child sourceRequestId expected ${reqA.id} got ${mntFresh.sourceRequestId}`
      );

      await closeDialog(page);

      // Attempt link to REQ-B
      await openRowView(page, "/requests", reqB.id);
      await page.getByRole("button", { name: "Link Maintenance" }).click();
      await page.waitForSelector("text=Link existing Maintenance", {
        timeout: 15000,
      });
      await page.fill("#link-treatment-search", mntConflict.id);
      await page.waitForFunction(
        (id) =>
          document.body.innerText.includes(id) &&
          !document.body.innerText.includes("Loading maintenance"),
        mntConflict.id,
        { timeout: 90000 }
      );

      const linkDialog = page
        .getByRole("dialog")
        .filter({ hasText: "Link existing Maintenance" });
      const body = await linkDialog.innerText();
      const linkB = linkDialog
        .locator("li", { hasText: mntConflict.id })
        .getByRole("button", { name: /^Link$/ });
      let conflictHandled = false;
      if (await linkB.count()) {
        await linkB.click();
        await page.waitForSelector(
          "text=/Unable to link|already linked|cannot be reassigned/i",
          { timeout: 30000 }
        );
        conflictHandled = true;
        ev.uiErrorShown = true;
      } else {
        assert(
          body.includes("No linkable records") ||
            !body.includes(mntConflict.id) ||
            /0 linkable|already linked/i.test(body),
          "owned child still offered without conflict handling"
        );
        conflictHandled = true;
        ev.filteredFromSearch = true;
      }
      ev.lastOk = "conflict_blocked";

      reqAFresh = await asCall(env, "requests", "getById", { id: reqA.id });
      const reqBFresh = await asCall(env, "requests", "getById", { id: reqB.id });
      mntFresh = await asCall(env, "maintenance", "getById", {
        id: mntConflict.id,
      });
      assert(
        (reqAFresh.maintenanceIds || []).includes(mntConflict.id),
        "REQ-A lost link"
      );
      assert(
        !(reqBFresh.maintenanceIds || []).includes(mntConflict.id),
        "REQ-B incorrectly gained MNT"
      );
      assert(
        mntFresh.sourceRequestId === reqA.id,
        `owner overwritten to ${mntFresh.sourceRequestId}`
      );
      assert(conflictHandled, "conflict not handled");
      ev.status = "PASS";
      report.results.linkConflict = ev;
      console.log("TEST6 PASS", { reqA: reqA.id, reqB: reqB.id, mnt: mntConflict.id });
      await closeDialog(page);
    } catch (e) {
      report.results.linkConflict = { status: "FAIL", error: e.message };
      report.runtimeDefects.push({
        test: "Link Conflict",
        error: e.message,
      });
      console.log("TEST6 FAIL", e.message);
      await page.screenshot({ path: "/tmp/adj-t6-fail.png", fullPage: true }).catch(() => {});
    }
  } finally {
    await browser.close();
    writeFileSync(
      "/tmp/phase2-adjacent-browser-pack.json",
      JSON.stringify(report, null, 2)
    );
  }

  const r = report.results;
  console.log("\n=== PHASE_2_ADJACENT_FLOW_BROWSER_PACK ===");
  console.log(
    "Incident → Maintenance:",
    r.incidentToMaintenance?.status || "UNVERIFIED"
  );
  console.log(
    "Maintenance → Work Order:",
    r.maintenanceToWorkOrder?.status || "UNVERIFIED"
  );
  console.log(
    "Incident → Work Order:",
    r.incidentToWorkOrder?.status || "UNVERIFIED"
  );
  console.log("Request Resolve:", r.requestResolve?.status || "UNVERIFIED");
  console.log("Request Cancel:", r.requestCancel?.status || "UNVERIFIED");
  console.log(
    "Link Conflict Protection:",
    r.linkConflict?.status || "UNVERIFIED"
  );
  console.log("records:", report.recordsCreated.join(", "));
  console.log("evidence: /tmp/phase2-adjacent-browser-pack.json");
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
