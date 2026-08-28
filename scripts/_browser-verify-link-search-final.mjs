#!/usr/bin/env node
/**
 * Final link-search browser verification only.
 * Evidence → /tmp/sentracore-link-search-final.json
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.SENTRACORE_BASE_URL || "http://localhost:3000";
const OUT = "/tmp/sentracore-link-search-final.json";
const EMAIL =
  process.env.SENTRACORE_VERIFY_EMAIL || "effiong.okpo@paychexng.com";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

function stamp() {
  return new Date().toISOString();
}

async function postApps(env, resource, action, payload = {}) {
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

function extractAction(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    const idx = body.indexOf('{"success"');
    if (idx < 0) return { raw: body.slice(0, 800) };
    const slice = body.slice(idx);
    for (let end = Math.min(slice.length, 20000); end > 20; end--) {
      try {
        return JSON.parse(slice.slice(0, end));
      } catch {
        /* continue */
      }
    }
    return { raw: body.slice(0, 800) };
  }
}

async function login(context, page, env) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const tempPassword = `Verify-${Date.now()}-Aa1!`;
  let userId = null;
  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    const listed = await admin.auth.admin.listUsers({
      page: pageNum,
      perPage: 200,
    });
    if (listed.error) throw listed.error;
    const match = listed.data.users.find(
      (u) => String(u.email || "").toLowerCase() === EMAIL.toLowerCase()
    );
    if (match) {
      userId = match.id;
      break;
    }
    if (listed.data.users.length < 200) break;
  }
  if (!userId) throw new Error(`Auth user not found for ${EMAIL}`);
  const updated = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });
  if (updated.error) throw updated.error;

  // Prove the temp password works against Auth before touching the browser form.
  const anon = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const probe = await anon.auth.signInWithPassword({
    email: EMAIL,
    password: tempPassword,
  });
  if (probe.error || !probe.data.session) {
    throw new Error(
      `Temp password probe failed: ${probe.error?.message || "no session"}`
    );
  }
  await anon.auth.signOut();

  await page.goto(`${BASE}/login?next=/requests`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.evaluate(
    ({ email, password }) => {
      const emailEl = document.querySelector("#email");
      const passwordEl = document.querySelector("#password");
      if (!(emailEl instanceof HTMLInputElement)) {
        throw new Error("email input missing");
      }
      if (!(passwordEl instanceof HTMLInputElement)) {
        throw new Error("password input missing");
      }
      const setNative = (el, value) => {
        const proto = window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      setNative(emailEl, email);
      setNative(passwordEl, password);
    },
    { email: EMAIL, password: tempPassword }
  );

  const emailValue = await page.locator("#email").inputValue();
  const passwordLen = (await page.locator("#password").inputValue()).length;
  if (emailValue.toLowerCase() !== EMAIL.toLowerCase()) {
    throw new Error(`Email field not set (got ${JSON.stringify(emailValue)})`);
  }
  if (passwordLen < 10) {
    throw new Error(`Password field too short (${passwordLen})`);
  }

  await Promise.all([
    page.waitForURL(
      (url) => {
        try {
          const parsed = typeof url === "string" ? new URL(url) : url;
          return parsed.pathname === "/requests";
        } catch {
          return false;
        }
      },
      { timeout: 300000, waitUntil: "commit" }
    ),
    page.locator("form").evaluate((form) => {
      if (!(form instanceof HTMLFormElement)) throw new Error("form missing");
      form.requestSubmit();
    }),
  ]);

  if (new URL(page.url()).pathname === "/login") {
    const alert = await page.getByRole("alert").innerText().catch(() => "");
    throw new Error(`Password login failed: ${alert || page.url()}`);
  }
  return { ok: true, method: "temp_password_native_set", url: page.url() };
}

async function openRequest(page, requestId) {
  await page.goto(`${BASE}/requests`, {
    waitUntil: "commit",
    timeout: 180000,
  });
  await page.waitForTimeout(2500);
  const search = page.getByPlaceholder(/search/i).first();
  if (await search.count()) {
    await search.fill(requestId);
    await page.waitForTimeout(1800);
  }
  const row = page.locator("tr", { hasText: requestId }).first();
  await row.waitFor({ timeout: 90000 });
  await row.locator("button").last().click();
  await page.getByText(/^View$/i).click();
  await page
    .getByText("Loading linked work…")
    .waitFor({ state: "hidden", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1000);
}

async function runLinkSearch(page, kind, query) {
  const openLabel =
    kind === "maintenance" ? "Link Maintenance" : "Link Incident";
  const heading =
    kind === "maintenance"
      ? /Link existing Maintenance/i
      : /Link existing Incident/i;

  const evidence = {
    searchOpened: null,
    query: query,
    requestExecuted: null,
    httpResult: null,
    resultsReturned: null,
    loadingEnded: null,
    error: null,
  };

  evidence.searchOpened = stamp();
  await page.getByRole("button", { name: openLabel }).click();
  await page.getByRole("heading", { name: heading }).waitFor({ timeout: 30000 });

  // Initial open triggers a search — wait for it to finish.
  await page
    .getByText("Searching…")
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => {});
  await page
    .getByText("Searching…")
    .waitFor({ state: "hidden", timeout: 180000 })
    .catch(() => {});

  await page.fill("#link-treatment-search", query);
  const respPromise = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      Boolean(r.request().headers()["next-action"]) &&
      r.status() === 200 &&
      !r.request().isNavigationRequest(),
    { timeout: 180000 }
  );
  await page.getByRole("button", { name: /^Search$/i }).click();
  const resp = await respPromise;
  evidence.requestExecuted = stamp();

  const body = await resp.text();
  const action = extractAction(body);
  evidence.httpResult = {
    status: resp.status(),
    success: action?.success ?? null,
    error: action?.error ?? null,
    total:
      action?.data?.total ??
      (Array.isArray(action?.data?.data) ? action.data.data.length : null),
    sampleIds: Array.isArray(action?.data?.data)
      ? action.data.data.slice(0, 8).map((row) => row.id)
      : null,
  };

  await page
    .getByText("Searching…")
    .waitFor({ state: "hidden", timeout: 180000 })
    .catch(() => {});
  evidence.loadingEnded = stamp();

  const stillSearching = await page
    .getByText("Searching…")
    .isVisible()
    .catch(() => false);
  const countLabel = await page
    .locator("p")
    .filter({ hasText: /linkable record/i })
    .first()
    .innerText()
    .catch(() => null);
  const hitVisible = await page.getByText(query).isVisible().catch(() => false);
  const emptyVisible = await page
    .getByText(/No linkable records found/i)
    .isVisible()
    .catch(() => false);
  const searchFailedToast = await page
    .getByText(/Search failed/i)
    .isVisible()
    .catch(() => false);

  evidence.resultsReturned = {
    countLabel,
    stillSearching,
    hitVisible,
    emptyVisible,
    searchFailedToast,
  };

  if (action?.success === false) {
    evidence.error = action.error;
  } else if (stillSearching) {
    evidence.error = { message: "Search UI remained in Searching… state" };
  } else if (searchFailedToast) {
    evidence.error = { message: "Search failed toast visible" };
  }

  await page.getByRole("button", { name: /^Close$/i }).last().click();
  await page
    .getByRole("heading", { name: heading })
    .waitFor({ state: "hidden", timeout: 20000 })
    .catch(() => {});

  return evidence;
}

const evidence = {
  startedAt: stamp(),
  baseUrl: BASE,
  linkMaintenanceSearch: null,
  linkIncidentSearch: null,
  errors: [],
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  const env = loadEnv();
  const title = `Link search verify ${Date.now()}`;
  const request = await postApps(env, "requests", "create", {
    title,
    description: "Final link-search browser verification",
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "submitted",
    reporterName: "Link Search Verify",
  });
  const linkableMnt = await postApps(env, "maintenance", "create", {
    title: `Linkable MNT ${Date.now()}`,
    description: "For link search",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  const linkableInc = await postApps(env, "incidents", "create", {
    title: `Linkable INC ${Date.now()}`,
    description: "For link search",
    facilityId: "FAC-0001",
    type: "other",
    source: "manual",
    severity: "medium",
    status: "reported",
    reportedVia: "portal",
    reportedAt: new Date().toISOString(),
  });

  evidence.seedRequestId = request.id;
  evidence.linkableMaintenanceId = linkableMnt.id;
  evidence.linkableIncidentId = linkableInc.id;

  evidence.login = await login(context, page, env);
  await openRequest(page, request.id);

  evidence.linkMaintenanceSearch = await runLinkSearch(
    page,
    "maintenance",
    linkableMnt.id
  );
  evidence.linkIncidentSearch = await runLinkSearch(
    page,
    "incident",
    linkableInc.id
  );
  evidence.finishedAt = stamp();
} catch (err) {
  evidence.errors.push({
    message: err instanceof Error ? err.message : String(err),
    at: stamp(),
  });
  await page
    .screenshot({
      path: "/tmp/sentracore-link-search-final-fail.png",
      fullPage: true,
    })
    .catch(() => {});
} finally {
  writeFileSync(OUT, JSON.stringify(evidence, null, 2));
  await browser.close();
  console.log(JSON.stringify(evidence, null, 2));
}

const mntOk =
  evidence.linkMaintenanceSearch &&
  !evidence.linkMaintenanceSearch.error &&
  evidence.linkMaintenanceSearch.httpResult?.success === true &&
  evidence.linkMaintenanceSearch.resultsReturned?.stillSearching === false;
const incOk =
  evidence.linkIncidentSearch &&
  !evidence.linkIncidentSearch.error &&
  evidence.linkIncidentSearch.httpResult?.success === true &&
  evidence.linkIncidentSearch.resultsReturned?.stillSearching === false;

process.exit(mntOk && incOk && evidence.errors.length === 0 ? 0 : 1);
