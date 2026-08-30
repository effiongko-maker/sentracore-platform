#!/usr/bin/env node
/**
 * PHASE 2.7 — requests/linkTreatment spike runner.
 *
 * Apps Script spike only. Does not touch Next.js Link / Create paths.
 *
 * Usage:
 *   node scripts/spike-link-treatment.cjs
 *
 * Requires deploy of:
 *   - RequestTreatmentLinkSpike.gs (new)
 *   - RequestsController.gs (linkTreatment case)
 */

const fs = require("fs");

const url =
  process.env.APPS_SCRIPT_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://script.google.com/macros/s/AKfycbz8DUM4MS2NTlEAeHsMVw9sGY0CyCdJwu_24mYJCpUwJWQb9FKEGABO2TEZhzKO-5Xm/exec";

const OUT =
  process.env.SPIKE_OUT || "/tmp/phase27-link-treatment-spike.json";

const stamp = Date.now();
const ids = { stamp, requests: [], maintenance: [], incidents: [] };

function assert(c, m) {
  if (!c) throw new Error(m);
}

function loadEnv() {
  try {
    for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      if (!process.env[t.slice(0, i).trim()]) {
        process.env[t.slice(0, i).trim()] = v;
      }
    }
  } catch (_) {
    /* optional */
  }
}

async function postRaw(resource, action, payload = {}) {
  const endpoint =
    process.env.APPS_SCRIPT_URL || process.env.NEXT_PUBLIC_API_URL || url;
  const t0 = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ resource, action, payload }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  return { json, wallMs: Date.now() - t0 };
}

async function post(resource, action, payload = {}) {
  const { json, wallMs } = await postRaw(resource, action, payload);
  if (!json.success) {
    const err = new Error(`${resource}/${action}: ${json.message || "failed"}`);
    err.appsScriptMessage = json.message;
    err.wallMs = wallMs;
    throw err;
  }
  return { data: json.data, wallMs, message: json.message };
}

async function postExpectFail(resource, action, payload = {}) {
  const { json, wallMs } = await postRaw(resource, action, payload);
  return {
    success: !!json.success,
    message: json.message || "",
    data: json.data,
    wallMs,
  };
}

async function createRequest(opts = {}) {
  const { data } = await post("requests", "create", {
    title: opts.title || `[SPIKE-2.7] disposable ${stamp}`,
    description: "Phase 2.7 link treatment spike — disposable",
    facilityId: opts.facilityId || "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: opts.requestType || "maintenance",
    status: opts.status || "submitted",
    reporterName: "Spike Bot 2.7",
  });
  ids.requests.push(data.id);
  return data;
}

async function createUnownedMaintenance(title) {
  const { data } = await post("maintenance", "create", {
    title: title || `[SPIKE-2.7] unowned MNT ${stamp}`,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  ids.maintenance.push(data.id);
  return data;
}

async function createUnownedIncident(title) {
  const { data } = await post("incidents", "create", {
    title: title || `[SPIKE-2.7] unowned INC ${stamp}`,
    facilityId: "FAC-0001",
    type: "other",
    source: "manual",
    severity: "medium",
    status: "reported",
    reportedAt: new Date().toISOString(),
  });
  ids.incidents.push(data.id);
  return data;
}

/** Production happy-path Link: 6 Apps Script invocations (matches orchestration). */
async function baselineLinkMaintenance(request, maintenance) {
  const calls = [];
  const t0 = Date.now();

  let r = await post("requests", "getById", { id: request.id });
  calls.push({ step: "getRequest", wallMs: r.wallMs });
  r = await post("maintenance", "getById", { id: maintenance.id });
  calls.push({ step: "getChild", wallMs: r.wallMs });
  r = await post("maintenance", "getById", { id: maintenance.id });
  calls.push({ step: "regetChild", wallMs: r.wallMs });
  r = await post("maintenance", "update", {
    id: maintenance.id,
    sourceRequestId: request.id,
  });
  calls.push({ step: "writeChild", wallMs: r.wallMs });
  r = await post("requests", "getById", { id: request.id });
  calls.push({ step: "freshRequest", wallMs: r.wallMs });
  const mids = [...(r.data.maintenanceIds || [])];
  if (!mids.includes(maintenance.id)) mids.push(maintenance.id);
  r = await post("requests", "update", {
    id: request.id,
    maintenanceIds: mids,
    status: "being_treated",
  });
  calls.push({ step: "writeRequest", wallMs: r.wallMs });

  return { calls: 6, wallMs: Date.now() - t0, perCall: calls, request: r.data };
}

async function baselineLinkIncident(request, incident) {
  const calls = [];
  const t0 = Date.now();

  let r = await post("requests", "getById", { id: request.id });
  calls.push({ step: "getRequest", wallMs: r.wallMs });
  r = await post("incidents", "getById", { id: incident.id });
  calls.push({ step: "getChild", wallMs: r.wallMs });
  r = await post("incidents", "getById", { id: incident.id });
  calls.push({ step: "regetChild", wallMs: r.wallMs });
  r = await post("incidents", "update", {
    id: incident.id,
    sourceRequestId: request.id,
  });
  calls.push({ step: "writeChild", wallMs: r.wallMs });
  r = await post("requests", "getById", { id: request.id });
  calls.push({ step: "freshRequest", wallMs: r.wallMs });
  const iids = [...(r.data.incidentIds || [])];
  if (!iids.includes(incident.id)) iids.push(incident.id);
  r = await post("requests", "update", {
    id: request.id,
    incidentIds: iids,
    status: "being_treated",
  });
  calls.push({ step: "writeRequest", wallMs: r.wallMs });

  return { calls: 6, wallMs: Date.now() - t0, perCall: calls, request: r.data };
}

function assertMnt(req, mnt) {
  assert(String(mnt.sourceRequestId) === String(req.id), "MNT.sourceRequestId");
  assert(
    (req.maintenanceIds || []).includes(mnt.id),
    "REQ.maintenanceIds"
  );
  assert(req.status === "being_treated", `status ${req.status}`);
  assert(
    (req.maintenanceIds || []).filter((id) => id === mnt.id).length === 1,
    "no duplicate mnt id"
  );
}

function assertInc(req, inc) {
  assert(String(inc.sourceRequestId) === String(req.id), "INC.sourceRequestId");
  assert((req.incidentIds || []).includes(inc.id), "REQ.incidentIds");
  assert(req.status === "being_treated", `status ${req.status}`);
  assert(
    (req.incidentIds || []).filter((id) => id === inc.id).length === 1,
    "no duplicate inc id"
  );
}

async function main() {
  loadEnv();
  const report = {
    title: "PHASE_2.7_LINK_TREATMENT_SPIKE",
    stamp,
    ids,
    deployed: false,
    currentArchitecture: null,
    currentCallGraph: null,
    currentPerformance: {},
    consolidatedContract: null,
    invariants: null,
    locking: null,
    idempotency: {},
    failureMatrix: {},
    compensation: {},
    events: null,
    authorization: null,
    spike: {},
    callReduction: null,
    performance: {},
    recommendation: "DO NOT PROCEED",
    codeChanges: "SPIKE ONLY",
  };

  report.currentArchitecture = {
    path: "Next.js executeAction → lease → multi-step Apps Script reads/writes → event",
    note: "Create Treatment consolidated; Link still multi-RTT",
  };

  report.currentCallGraph = {
    happyPathAppsScriptInvocations: 6,
    steps: [
      "GET Request (parallel with child)",
      "GET Child",
      "lease claim (Supabase, not AS)",
      "GET Child (authoritative re-read inside create)",
      "UPDATE Child.sourceRequestId",
      "GET Request (fresh before append)",
      "UPDATE Request maintenanceIds|incidentIds + status",
      "emit FACILITY_REQUEST_*_LINKED (Supabase)",
    ],
    note: "Promise.all makes first two one RTT but still two AS invocations counted",
  };

  report.consolidatedContract = {
    resource: "requests",
    action: "linkTreatment",
    payload: {
      kind: "maintenance|incident",
      requestId: "REQ-...",
      childId: "MNT-|INC-...",
      idempotencyKey: "optional — lease symmetry; AS uses state-based replay",
      actorUserId: "optional",
    },
    rationale:
      "Mirrors createTreatment under requests aggregate. childId replaces childInput. State-based idempotency is authoritative for Link.",
  };

  report.invariants = {
    existingChild: true,
    ownershipConflictReject: true,
    emptySourceLinkable: true,
    sameOwnerIdempotent: true,
    appendUnique: true,
    being_treated: true,
    facilityMatch: true,
    noReqToWo: true,
  };

  report.events =
    "Remain Next.js after authoritative AS result (FACILITY_REQUEST_*_LINKED). No AS↔Supabase.";
  report.authorization =
    "Next.js executeAction + facility_management; AS persistence only.";

  // Probe deploy
  const probe = await postExpectFail("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: "REQ-NOPE",
    childId: "MNT-NOPE",
  });
  if (/Unknown requests action:\s*linkTreatment/i.test(probe.message)) {
    report.recommendation = "DO NOT PROCEED";
    report.deployBlocker =
      "Paste RequestTreatmentLinkSpike.gs + updated RequestsController.gs, New Web App version, re-run.";
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.error("SPIKE_NOT_DEPLOYED", probe.message);
    console.error(report.deployBlocker);
    process.exit(2);
  }
  report.deployed = true;
  console.log("SPIKE_DEPLOYED", probe.message);

  // ---------- Baselines ----------
  console.log("BASELINE_MNT");
  const baseReqM = await createRequest({
    title: `[SPIKE-2.7] baseline-mnt-req ${stamp}`,
  });
  const baseMnt = await createUnownedMaintenance(
    `[SPIKE-2.7] baseline-mnt ${stamp}`
  );
  report.currentPerformance.maintenance = await baselineLinkMaintenance(
    baseReqM,
    baseMnt
  );

  console.log("BASELINE_INC");
  const baseReqI = await createRequest({
    title: `[SPIKE-2.7] baseline-inc-req ${stamp}`,
    requestType: "incident",
  });
  const baseInc = await createUnownedIncident(
    `[SPIKE-2.7] baseline-inc ${stamp}`
  );
  report.currentPerformance.incident = await baselineLinkIncident(
    baseReqI,
    baseInc
  );

  // ---------- Happy path Maintenance ----------
  console.log("SPIKE_MNT");
  const reqM = await createRequest({
    title: `[SPIKE-2.7] spike-mnt-req ${stamp}`,
  });
  const mnt = await createUnownedMaintenance(`[SPIKE-2.7] spike-mnt ${stamp}`);
  const linkM1 = await post("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: reqM.id,
    childId: mnt.id,
    idempotencyKey: `link-mnt-${stamp}`,
  });
  assert(linkM1.data.spike === true, "spike marker");
  assert(linkM1.data.buildMarker, "buildMarker");
  assertMnt(linkM1.data.request, linkM1.data.maintenance);
  report.spike.maintenance = {
    calls: 1,
    wallMs: linkM1.wallMs,
    timings: linkM1.data.timings,
    result: "PASS",
    requestId: reqM.id,
    childId: mnt.id,
  };

  // Same request retry (state idempotent) — response-loss simulation
  console.log("SPIKE_MNT_RETRY");
  const linkM2 = await post("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: reqM.id,
    childId: mnt.id,
    idempotencyKey: `link-mnt-${stamp}`,
  });
  assert(linkM2.data.idempotent === true, "retry idempotent");
  assert(
    linkM2.data.maintenance.id === mnt.id,
    "same child"
  );
  assertMnt(linkM2.data.request, linkM2.data.maintenance);

  // Same request + child, different key → still state idempotent
  console.log("SPIKE_MNT_DIFF_KEY");
  const linkM3 = await post("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: reqM.id,
    childId: mnt.id,
    idempotencyKey: `link-mnt-other-${stamp}`,
  });
  assert(linkM3.data.idempotent === true, "diff key still state-idempotent");
  assert(
    (linkM3.data.request.maintenanceIds || []).filter((id) => id === mnt.id)
      .length === 1,
    "no duplicate with different key"
  );

  report.idempotency = {
    mode: "state-based (sourceRequestId + appendUnique)",
    durableScriptProperties: "NOT REQUIRED for Link (proven)",
    sameKeyRetry: "PASS",
    differentKeySameChild: "PASS — still idempotent via ownership state",
    responseLossRetry: "PASS",
    recommendation:
      "Prefer state-based idempotency for Link; keep Next.js lease keyed by requestId+childId",
  };

  // Conflict: different request same child
  console.log("SPIKE_MNT_CONFLICT");
  const otherReq = await createRequest({
    title: `[SPIKE-2.7] conflict-req ${stamp}`,
  });
  const conflict = await postExpectFail("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: otherReq.id,
    childId: mnt.id,
    idempotencyKey: `conflict-${stamp}`,
  });
  assert(!conflict.success, "conflict must fail");
  assert(/already linked/i.test(conflict.message), conflict.message);
  report.failureMatrix.childOwnedByOther = {
    result: "PASS",
    message: conflict.message,
  };

  // ---------- Incident happy path ----------
  console.log("SPIKE_INC");
  const reqI = await createRequest({
    title: `[SPIKE-2.7] spike-inc-req ${stamp}`,
    requestType: "incident",
  });
  const inc = await createUnownedIncident(`[SPIKE-2.7] spike-inc ${stamp}`);
  const linkI1 = await post("requests", "linkTreatment", {
    kind: "incident",
    requestId: reqI.id,
    childId: inc.id,
    idempotencyKey: `link-inc-${stamp}`,
  });
  assertInc(linkI1.data.request, linkI1.data.incident);
  report.spike.incident = {
    calls: 1,
    wallMs: linkI1.wallMs,
    timings: linkI1.data.timings,
    result: "PASS",
    requestId: reqI.id,
    childId: inc.id,
  };
  const linkI2 = await post("requests", "linkTreatment", {
    kind: "incident",
    requestId: reqI.id,
    childId: inc.id,
  });
  assert(linkI2.data.idempotent === true, "inc retry");

  // Concurrent-ish: two children on same request (serialized by lock)
  console.log("SPIKE_TWO_CHILDREN");
  const reqMulti = await createRequest({
    title: `[SPIKE-2.7] multi-child ${stamp}`,
  });
  const mntA = await createUnownedMaintenance(`[SPIKE-2.7] multi-A ${stamp}`);
  const mntB = await createUnownedMaintenance(`[SPIKE-2.7] multi-B ${stamp}`);
  const la = await post("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: reqMulti.id,
    childId: mntA.id,
  });
  const lb = await post("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: reqMulti.id,
    childId: mntB.id,
  });
  assert(
    (lb.data.request.maintenanceIds || []).includes(mntA.id) &&
      (lb.data.request.maintenanceIds || []).includes(mntB.id),
    "both children must survive"
  );
  report.locking = {
    ...(la.data.lock || {}),
    caseA_twoRequestsSameChild: "PASS (conflict reject)",
    caseB_sameRequestTwice: "PASS (idempotent)",
    caseC_twoChildrenSameRequest: "PASS (both survive)",
  };

  // Failure matrix
  console.log("FAILURES");
  const failMissingReq = await postExpectFail("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: "REQ-9999-MISSING",
    childId: mnt.id,
  });
  assert(!failMissingReq.success && /not found/i.test(failMissingReq.message));
  report.failureMatrix.requestMissing = { result: "PASS" };

  const failMissingChild = await postExpectFail("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: reqM.id,
    childId: "MNT-9999-MISSING",
  });
  assert(
    !failMissingChild.success && /not found/i.test(failMissingChild.message)
  );
  report.failureMatrix.childMissing = { result: "PASS" };

  const termReq = await createRequest({
    title: `[SPIKE-2.7] terminal ${stamp}`,
  });
  await post("requests", "update", { id: termReq.id, status: "cancelled" });
  const freeM = await createUnownedMaintenance(`[SPIKE-2.7] term-child ${stamp}`);
  const failTerm = await postExpectFail("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: termReq.id,
    childId: freeM.id,
  });
  assert(
    !failTerm.success && /cannot receive treatment/i.test(failTerm.message)
  );
  report.failureMatrix.requestTerminal = { result: "PASS" };

  const facReq = await createRequest({
    title: `[SPIKE-2.7] fac ${stamp}`,
  });
  const wrongFac = await post("maintenance", "create", {
    title: `[SPIKE-2.7] wrong-fac ${stamp}`,
    facilityId: "FAC-9999",
    type: "corrective",
    source: "manual",
    priority: "low",
    status: "requested",
    reportedAt: new Date().toISOString(),
  });
  ids.maintenance.push(wrongFac.data.id);
  const failFac = await postExpectFail("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: facReq.id,
    childId: wrongFac.data.id,
  });
  assert(!failFac.success && /Facility mismatch/i.test(failFac.message));
  report.failureMatrix.facilityMismatch = { result: "PASS" };

  // Compensation
  console.log("COMPENSATION");
  const compReq = await createRequest({
    title: `[SPIKE-2.7] compensate ${stamp}`,
  });
  const compM = await createUnownedMaintenance(
    `[SPIKE-2.7] compensate-mnt ${stamp}`
  );
  const failComp = await postExpectFail("requests", "linkTreatment", {
    kind: "maintenance",
    requestId: compReq.id,
    childId: compM.id,
    _spikeForceFailReverseLink: true,
  });
  assert(!failComp.success);
  assert(/compensation=/i.test(failComp.message), failComp.message);
  const afterComp = await post("maintenance", "getById", { id: compM.id });
  assert(
    !String(afterComp.data.sourceRequestId || "").trim(),
    "sourceRequestId cleared"
  );
  const afterReq = await post("requests", "getById", { id: compReq.id });
  assert(
    !(afterReq.data.maintenanceIds || []).includes(compM.id),
    "request not linked"
  );
  report.compensation = {
    result: "PASS",
    demonstrated: true,
    action: "cleared sourceRequestId after forced reverse-link failure",
  };
  report.failureMatrix.reverseLinkFail = { result: "PASS" };

  report.performance = {
    maintenance: {
      baselineCalls: 6,
      baselineWallMs: report.currentPerformance.maintenance.wallMs,
      spikeCalls: 1,
      spikeWallMs: linkM1.wallMs,
      spikeServerMs: linkM1.data.timings && linkM1.data.timings.serverTotalMs,
      improvementRatio: Number(
        (
          report.currentPerformance.maintenance.wallMs / linkM1.wallMs
        ).toFixed(2)
      ),
    },
    incident: {
      baselineCalls: 6,
      baselineWallMs: report.currentPerformance.incident.wallMs,
      spikeCalls: 1,
      spikeWallMs: linkI1.wallMs,
      spikeServerMs: linkI1.data.timings && linkI1.data.timings.serverTotalMs,
      improvementRatio: Number(
        (report.currentPerformance.incident.wallMs / linkI1.wallMs).toFixed(2)
      ),
    },
  };

  report.callReduction = {
    from: 6,
    to: 1,
    note: "Invocation boundary collapse; sheet work similar, fewer RTT floors",
  };

  const materiallyFaster =
    linkM1.wallMs < report.currentPerformance.maintenance.wallMs * 0.75 &&
    linkI1.wallMs < report.currentPerformance.incident.wallMs * 0.75;

  const allPass =
    report.spike.maintenance.result === "PASS" &&
    report.spike.incident.result === "PASS" &&
    report.idempotency.sameKeyRetry === "PASS" &&
    report.compensation.result === "PASS" &&
    report.failureMatrix.childOwnedByOther.result === "PASS" &&
    materiallyFaster;

  report.recommendation = allPass
    ? "PROCEED TO PRODUCTION"
    : "DO NOT PROCEED";

  report.gate = {
    oneInvocation: true,
    maintenanceOk: true,
    incidentOk: true,
    stateIdempotency: true,
    conflict: true,
    compensation: true,
    materiallyLowerWallTime: materiallyFaster,
    allPass,
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("SPIKE_COMPLETE", report.recommendation);
  console.log(
    JSON.stringify(
      {
        performance: report.performance,
        recommendation: report.recommendation,
        ids,
      },
      null,
      2
    )
  );
  console.log("Wrote", OUT);
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("SPIKE_FAILED", err.message);
  try {
    fs.writeFileSync(
      OUT,
      JSON.stringify(
        {
          title: "PHASE_2.7_LINK_TREATMENT_SPIKE",
          error: err.message,
          ids,
          recommendation: "DO NOT PROCEED",
          codeChanges: "SPIKE ONLY",
        },
        null,
        2
      )
    );
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
