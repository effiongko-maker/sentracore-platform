#!/usr/bin/env node
/**
 * PHASE 2.5 — requests/createTreatment spike runner.
 *
 * Apps Script only. Does not touch Next.js product paths.
 *
 * Usage:
 *   node scripts/spike-create-treatment.cjs
 *
 * Requires Apps Script deploy of:
 *   - RequestTreatmentMutationSpike.gs (new)
 *   - RequestsController.gs (createTreatment case)
 *
 * Creates disposable REQ / MNT / INC records only.
 */

const fs = require("fs");

const url =
  process.env.APPS_SCRIPT_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://script.google.com/macros/s/AKfycbz8DUM4MS2NTlEAeHsMVw9sGY0CyCdJwu_24mYJCpUwJWQb9FKEGABO2TEZhzKO-5Xm/exec";

const OUT_PATH =
  process.env.SPIKE_OUT || "/tmp/phase25-treatment-mutation-spike.json";

const stamp = Date.now();
const ids = {
  stamp,
  requests: [],
  maintenance: [],
  incidents: [],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postRaw(resource, action, payload = {}) {
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ resource, action, payload }),
  });
  const text = await res.text();
  const wallMs = Date.now() - t0;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  return { json, wallMs, status: res.status };
}

async function post(resource, action, payload = {}) {
  const { json, wallMs } = await postRaw(resource, action, payload);
  if (!json.success) {
    const err = new Error(
      `${resource}/${action}: ${json.message || "failed"}`
    );
    err.appsScriptMessage = json.message;
    err.wallMs = wallMs;
    err.response = json;
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

async function createDisposableRequest(opts = {}) {
  const title = opts.title || `[SPIKE-2.5] disposable ${stamp}`;
  const { data } = await post("requests", "create", {
    title,
    description: opts.description || "Phase 2.5 treatment mutation spike — disposable",
    facilityId: opts.facilityId || "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: opts.requestType || "maintenance",
    status: opts.status || "submitted",
    reporterName: "Spike Bot",
  });
  ids.requests.push(data.id);
  return data;
}

/** Existing Architecture A critical path (4 Apps Script calls). */
async function baselineCreateMaintenance(request) {
  const calls = [];
  let t0 = Date.now();

  const get1 = await post("requests", "getById", { id: request.id });
  calls.push({ step: "getRequest", wallMs: get1.wallMs });

  const create = await post("maintenance", "create", {
    title: `[SPIKE-2.5] baseline MNT ${stamp}`,
    description: request.description || request.title,
    facilityId: request.facilityId,
    type: "corrective",
    source: "request",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
    sourceRequestId: request.id,
  });
  calls.push({ step: "createChild", wallMs: create.wallMs });
  ids.maintenance.push(create.data.id);

  const get2 = await post("requests", "getById", { id: request.id });
  calls.push({ step: "getRequestFresh", wallMs: get2.wallMs });

  const mntIds = Array.isArray(get2.data.maintenanceIds)
    ? get2.data.maintenanceIds.slice()
    : [];
  if (!mntIds.includes(create.data.id)) mntIds.push(create.data.id);

  const upd = await post("requests", "update", {
    id: request.id,
    maintenanceIds: mntIds,
    status: "being_treated",
  });
  calls.push({ step: "updateRequest", wallMs: upd.wallMs });

  return {
    calls: 4,
    wallMs: Date.now() - t0,
    perCall: calls,
    request: upd.data,
    maintenance: create.data,
  };
}

async function baselineCreateIncident(request) {
  const calls = [];
  let t0 = Date.now();

  const get1 = await post("requests", "getById", { id: request.id });
  calls.push({ step: "getRequest", wallMs: get1.wallMs });

  const create = await post("incidents", "create", {
    title: `[SPIKE-2.5] baseline INC ${stamp}`,
    description: request.description || request.title,
    facilityId: request.facilityId,
    type: "other",
    source: "request",
    severity: "medium",
    status: "reported",
    reportedAt: new Date().toISOString(),
    sourceRequestId: request.id,
  });
  calls.push({ step: "createChild", wallMs: create.wallMs });
  ids.incidents.push(create.data.id);

  const get2 = await post("requests", "getById", { id: request.id });
  calls.push({ step: "getRequestFresh", wallMs: get2.wallMs });

  const incIds = Array.isArray(get2.data.incidentIds)
    ? get2.data.incidentIds.slice()
    : [];
  if (!incIds.includes(create.data.id)) incIds.push(create.data.id);

  const upd = await post("requests", "update", {
    id: request.id,
    incidentIds: incIds,
    status: "being_treated",
  });
  calls.push({ step: "updateRequest", wallMs: upd.wallMs });

  return {
    calls: 4,
    wallMs: Date.now() - t0,
    perCall: calls,
    request: upd.data,
    incident: create.data,
  };
}

function assertIntegrityMaintenance(request, maintenance) {
  assert(maintenance && maintenance.id, "maintenance id required");
  assert(
    String(maintenance.sourceRequestId) === String(request.id),
    `MNT.sourceRequestId expected ${request.id}, got ${maintenance.sourceRequestId}`
  );
  const mids = request.maintenanceIds || [];
  assert(
    mids.includes(maintenance.id),
    `REQ.maintenanceIds missing ${maintenance.id}: ${JSON.stringify(mids)}`
  );
  assert(
    request.status === "being_treated",
    `Expected being_treated, got ${request.status}`
  );
}

function assertIntegrityIncident(request, incident) {
  assert(incident && incident.id, "incident id required");
  assert(
    String(incident.sourceRequestId) === String(request.id),
    `INC.sourceRequestId expected ${request.id}, got ${incident.sourceRequestId}`
  );
  const iids = request.incidentIds || [];
  assert(
    iids.includes(incident.id),
    `REQ.incidentIds missing ${incident.id}: ${JSON.stringify(iids)}`
  );
  assert(
    request.status === "being_treated",
    `Expected being_treated, got ${request.status}`
  );
}

async function probeSpikeDeployed() {
  const probe = await postExpectFail("requests", "createTreatment", {
    kind: "maintenance",
    requestId: "REQ-DOES-NOT-EXIST-SPIKE",
    idempotencyKey: `probe-${stamp}`,
    childInput: { title: "probe", facilityId: "FAC-0001" },
  });
  if (
    /Unknown requests action:\s*createTreatment/i.test(probe.message || "")
  ) {
    return {
      deployed: false,
      message: probe.message,
    };
  }
  // Not-found or other validation means action is wired.
  return { deployed: true, message: probe.message, probe };
}

async function main() {
  const report = {
    title: "PHASE_2.5_TREATMENT_MUTATION_SPIKE",
    stamp,
    url,
    ids,
    deployed: false,
    proposedContract: null,
    maintenance: {},
    incident: {},
    idempotency: {},
    locking: {},
    failureTests: {},
    compensation: {},
    integrity: {},
    performance: {},
    risks: [],
    recommendation: "DO NOT PROCEED",
    exactNextStep: "",
    productCodeChanges: "NONE",
  };

  report.proposedContract = {
    resource: "requests",
    action: "createTreatment",
    payload: {
      kind: "maintenance | incident",
      requestId: "REQ-...",
      childInput: "{ domain create fields }",
      idempotencyKey: "durable key",
    },
    rationale:
      "Matches existing controller envelope (resource/action/payload). Single action with kind discriminator avoids two near-identical routes while keeping Request as the aggregate root.",
    validation: {
      request: "must exist; status not terminal",
      child: "title/facility via Service create rules; source forced to request",
      facility: "child.facilityId must equal request.facilityId",
      requestType:
        "kind enum only; request.requestType mismatch is advisory (matches product Create)",
      statusTransition: "non-terminal → being_treated; terminal rejected",
      childCreation: "MaintenanceService/IncidentService.create with sourceRequestId",
      reverseLink: "appendUnique on maintenanceIds|incidentIds + status",
      idempotency:
        "ScriptProperties key spikeTreatIdem:v1:{kind}:{requestId}:{idempotencyKey} → {childId}; written only after full success",
      lockScope:
        "LockService.getScriptLock around read→create→update→idem write only",
      compensation: "clear child.sourceRequestId on reverse-link failure; explicit error",
      responseShape:
        "{ spike, buildMarker, kind, idempotent, request, maintenance|incident, timings, lock }",
    },
  };

  console.log("SPIKE_PROBE_DEPLOY");
  const deploy = await probeSpikeDeployed();
  report.deployed = deploy.deployed;
  if (!deploy.deployed) {
    report.recommendation = "DO NOT PROCEED";
    report.exactNextStep =
      "Paste RequestTreatmentMutationSpike.gs + updated RequestsController.gs from apps-script/deployment/DEPLOYMENT_PACK.md into the live Apps Script project, Save, Deploy → Manage deployments → New version (Web App). Then re-run: node scripts/spike-create-treatment.cjs";
    report.risks.push(
      "Spike code is in repo + pack but not on the live /exec deployment — cannot prove idempotency or wall time yet."
    );
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
    console.error("SPIKE_NOT_DEPLOYED", deploy.message);
    console.error("Wrote", OUT_PATH);
    console.error(report.exactNextStep);
    process.exit(2);
  }
  console.log("SPIKE_DEPLOYED", deploy.message);

  // ---------- Baseline (Architecture A) ----------
  console.log("BASELINE_MNT");
  const baseReqM = await createDisposableRequest({
    title: `[SPIKE-2.5] baseline-mnt-req ${stamp}`,
  });
  const baselineM = await baselineCreateMaintenance(baseReqM);
  report.maintenance.existing = baselineM;

  console.log("BASELINE_INC");
  const baseReqI = await createDisposableRequest({
    title: `[SPIKE-2.5] baseline-inc-req ${stamp}`,
    requestType: "incident",
  });
  const baselineI = await baselineCreateIncident(baseReqI);
  report.incident.existing = baselineI;

  // ---------- Spike happy path: Maintenance ----------
  console.log("SPIKE_MNT");
  const reqM = await createDisposableRequest({
    title: `[SPIKE-2.5] spike-mnt-req ${stamp}`,
  });
  const idemM = `spike-mnt-${stamp}`;
  const spikeM1 = await post("requests", "createTreatment", {
    kind: "maintenance",
    requestId: reqM.id,
    idempotencyKey: idemM,
    childInput: {
      title: `[SPIKE-2.5] spike MNT ${stamp}`,
      facilityId: "FAC-0001",
      type: "corrective",
      priority: "medium",
    },
  });
  assert(spikeM1.data && spikeM1.data.spike === true, "spike marker missing");
  assert(spikeM1.data.idempotent === false, "first call must not be idempotent hit");
  assertIntegrityMaintenance(spikeM1.data.request, spikeM1.data.maintenance);
  ids.maintenance.push(spikeM1.data.maintenance.id);
  report.maintenance.spike = {
    calls: 1,
    wallMs: spikeM1.wallMs,
    timings: spikeM1.data.timings,
    requestId: spikeM1.data.request.id,
    maintenanceId: spikeM1.data.maintenance.id,
    result: "PASS",
  };

  // Idempotent retry (same key) — response-loss simulation
  console.log("SPIKE_MNT_IDEMPOTENT_RETRY");
  const spikeM2 = await post("requests", "createTreatment", {
    kind: "maintenance",
    requestId: reqM.id,
    idempotencyKey: idemM,
    childInput: {
      title: `[SPIKE-2.5] spike MNT retry should not create ${stamp}`,
      facilityId: "FAC-0001",
    },
  });
  assert(spikeM2.data.idempotent === true, "retry must be idempotent");
  assert(
    spikeM2.data.maintenance.id === spikeM1.data.maintenance.id,
    "retry must return same maintenance id"
  );
  const mids = spikeM2.data.request.maintenanceIds || [];
  assert(
    mids.filter((id) => id === spikeM1.data.maintenance.id).length === 1,
    "must not duplicate maintenance id on request"
  );

  // Different idempotency key → second child
  console.log("SPIKE_MNT_DIFFERENT_KEY");
  const spikeM3 = await post("requests", "createTreatment", {
    kind: "maintenance",
    requestId: reqM.id,
    idempotencyKey: `spike-mnt-other-${stamp}`,
    childInput: {
      title: `[SPIKE-2.5] spike MNT other key ${stamp}`,
      facilityId: "FAC-0001",
    },
  });
  assert(spikeM3.data.idempotent === false, "different key creates new child");
  assert(
    spikeM3.data.maintenance.id !== spikeM1.data.maintenance.id,
    "different key must create different maintenance"
  );
  ids.maintenance.push(spikeM3.data.maintenance.id);
  report.idempotency.duplicateSameKey = {
    result: "PASS",
    firstChildId: spikeM1.data.maintenance.id,
    retryChildId: spikeM2.data.maintenance.id,
    retryWallMs: spikeM2.wallMs,
  };
  report.idempotency.responseLossRetry = {
    result: "PASS",
    note: "Second invocation with same key returned existing child; no duplicate create",
  };
  report.idempotency.differentKey = {
    result: "DOCUMENTED",
    behaviour: "Creates a second child and appends both ids (no product-level single-treatment gate in spike)",
    secondChildId: spikeM3.data.maintenance.id,
  };
  report.idempotency.durableMechanism =
    "PropertiesService.getScriptProperties() key spikeTreatIdem:v1:{kind}:{requestId}:{idempotencyKey}";

  // ---------- Spike happy path: Incident ----------
  console.log("SPIKE_INC");
  const reqI = await createDisposableRequest({
    title: `[SPIKE-2.5] spike-inc-req ${stamp}`,
    requestType: "incident",
  });
  const idemI = `spike-inc-${stamp}`;
  const spikeI1 = await post("requests", "createTreatment", {
    kind: "incident",
    requestId: reqI.id,
    idempotencyKey: idemI,
    childInput: {
      title: `[SPIKE-2.5] spike INC ${stamp}`,
      facilityId: "FAC-0001",
      severity: "medium",
      type: "other",
    },
  });
  assertIntegrityIncident(spikeI1.data.request, spikeI1.data.incident);
  ids.incidents.push(spikeI1.data.incident.id);
  report.incident.spike = {
    calls: 1,
    wallMs: spikeI1.wallMs,
    timings: spikeI1.data.timings,
    requestId: spikeI1.data.request.id,
    incidentId: spikeI1.data.incident.id,
    result: "PASS",
  };

  const spikeI2 = await post("requests", "createTreatment", {
    kind: "incident",
    requestId: reqI.id,
    idempotencyKey: idemI,
    childInput: { title: "retry", facilityId: "FAC-0001" },
  });
  assert(spikeI2.data.idempotent === true, "incident retry idempotent");
  assert(
    spikeI2.data.incident.id === spikeI1.data.incident.id,
    "incident retry same id"
  );

  report.locking = spikeM1.data.lock || {
    protects:
      "Request read/validation → child create → Request reverse-link/status → idempotency write",
    doesNotProtect: "ACID transaction across sheets; external systems",
    isTransaction: false,
  };

  // ---------- Failure tests ----------
  console.log("FAILURE_A_NOT_FOUND");
  const failA = await postExpectFail("requests", "createTreatment", {
    kind: "maintenance",
    requestId: "REQ-9999-DOES-NOT-EXIST",
    idempotencyKey: `fail-a-${stamp}`,
    childInput: { title: "x", facilityId: "FAC-0001" },
  });
  assert(!failA.success, "A must fail");
  assert(/not found/i.test(failA.message), `A message: ${failA.message}`);
  report.failureTests.A_requestMissing = { result: "PASS", message: failA.message };

  console.log("FAILURE_B_TERMINAL");
  const termReq = await createDisposableRequest({
    title: `[SPIKE-2.5] terminal ${stamp}`,
    status: "cancelled",
  });
  // Ensure terminal via update if create ignored status
  await post("requests", "update", { id: termReq.id, status: "cancelled" });
  const failB = await postExpectFail("requests", "createTreatment", {
    kind: "maintenance",
    requestId: termReq.id,
    idempotencyKey: `fail-b-${stamp}`,
    childInput: { title: "x", facilityId: "FAC-0001" },
  });
  assert(!failB.success, "B must fail");
  assert(/cannot receive treatment/i.test(failB.message), failB.message);
  report.failureTests.B_terminal = { result: "PASS", message: failB.message };

  console.log("FAILURE_C_FACILITY");
  const facReq = await createDisposableRequest({
    title: `[SPIKE-2.5] fac-mismatch ${stamp}`,
  });
  const failC = await postExpectFail("requests", "createTreatment", {
    kind: "maintenance",
    requestId: facReq.id,
    idempotencyKey: `fail-c-${stamp}`,
    childInput: { title: "x", facilityId: "FAC-9999" },
  });
  assert(!failC.success, "C must fail");
  assert(/Facility mismatch/i.test(failC.message), failC.message);
  const facReqAfter = await post("requests", "getById", { id: facReq.id });
  assert(
    !(facReqAfter.data.maintenanceIds || []).length,
    "C must not mutate request children"
  );
  report.failureTests.C_facilityMismatch = {
    result: "PASS",
    message: failC.message,
  };

  console.log("FAILURE_D_CHILD_CREATE");
  const childFailReq = await createDisposableRequest({
    title: `[SPIKE-2.5] child-fail ${stamp}`,
  });
  const failD = await postExpectFail("requests", "createTreatment", {
    kind: "maintenance",
    requestId: childFailReq.id,
    idempotencyKey: `fail-d-${stamp}`,
    childInput: { title: "x", facilityId: "FAC-0001" },
    _spikeForceFailChildCreate: true,
  });
  assert(!failD.success, "D must fail");
  assert(/SPIKE_FORCE_FAIL_CHILD_CREATE/i.test(failD.message), failD.message);
  const childFailAfter = await post("requests", "getById", {
    id: childFailReq.id,
  });
  assert(
    !(childFailAfter.data.maintenanceIds || []).length,
    "D must leave request untreated"
  );
  report.failureTests.D_childCreateFail = {
    result: "PASS",
    message: failD.message,
  };

  console.log("FAILURE_E_REVERSE_LINK_COMPENSATION");
  const compReq = await createDisposableRequest({
    title: `[SPIKE-2.5] compensate ${stamp}`,
  });
  const failE = await postExpectFail("requests", "createTreatment", {
    kind: "maintenance",
    requestId: compReq.id,
    idempotencyKey: `fail-e-${stamp}`,
    childInput: {
      title: `[SPIKE-2.5] orphan-candidate ${stamp}`,
      facilityId: "FAC-0001",
    },
    _spikeForceFailReverseLink: true,
  });
  assert(!failE.success, "E must fail");
  assert(/compensation=/i.test(failE.message), failE.message);
  assert(/SPIKE_FORCE_FAIL_REVERSE_LINK/i.test(failE.message), failE.message);
  const childIdMatch = failE.message.match(/childId=(MNT-[^\s]+)/);
  assert(childIdMatch, "E must report childId");
  const orphanId = childIdMatch[1];
  ids.maintenance.push(orphanId);
  const orphan = await post("maintenance", "getById", { id: orphanId });
  assert(
    !String(orphan.data.sourceRequestId || "").trim(),
    `compensation must clear sourceRequestId, got ${orphan.data.sourceRequestId}`
  );
  const compReqAfter = await post("requests", "getById", { id: compReq.id });
  assert(
    !(compReqAfter.data.maintenanceIds || []).includes(orphanId),
    "E must not append child on request"
  );
  report.failureTests.E_reverseLinkFail = {
    result: "PASS",
    message: failE.message,
    orphanChildId: orphanId,
    sourceRequestIdAfter: orphan.data.sourceRequestId || "",
  };
  report.compensation = {
    result: "PASS",
    demonstrated: true,
    action: "cleared child.sourceRequestId after forced reverse-link failure",
    note: "Child row may remain as orphan without sourceRequestId; not silently success",
  };

  console.log("FAILURE_F_DUP_KEY");
  report.failureTests.F_duplicateIdempotencyKey = {
    result: "PASS",
    see: "idempotency.duplicateSameKey",
  };

  report.integrity = {
    reqMnt: "PASS",
    reqInc: "PASS",
    status: "being_treated",
    noReqToWo: "PASS (spike creates MNT/INC only; no WO path)",
  };

  report.performance = {
    maintenance: {
      existingCalls: 4,
      existingWallMs: baselineM.wallMs,
      spikeCalls: 1,
      spikeWallMs: spikeM1.wallMs,
      spikeServerMs: spikeM1.data.timings && spikeM1.data.timings.serverTotalMs,
      improvementRatio:
        baselineM.wallMs > 0
          ? Number((baselineM.wallMs / spikeM1.wallMs).toFixed(2))
          : null,
    },
    incident: {
      existingCalls: 4,
      existingWallMs: baselineI.wallMs,
      spikeCalls: 1,
      spikeWallMs: spikeI1.wallMs,
      spikeServerMs: spikeI1.data.timings && spikeI1.data.timings.serverTotalMs,
      improvementRatio:
        baselineI.wallMs > 0
          ? Number((baselineI.wallMs / spikeI1.wallMs).toFixed(2))
          : null,
    },
  };

  report.risks = [
    "LockService is not a transaction — reverse-link failure still needs compensation",
    "ScriptProperties idempotency is durable but not queryable like a sheet; production may prefer a dedicated IDEMPOTENCY sheet",
    "Different idempotency keys on the same Request create multiple children",
    "Compensated failures leave orphan child rows without sourceRequestId",
    "Script-wide lock can contend with other LockService.getScriptLock() users (e.g. Users create)",
  ];

  const materiallyFaster =
    spikeM1.wallMs < baselineM.wallMs * 0.75 &&
    spikeI1.wallMs < baselineI.wallMs * 0.75;

  const allPass =
    report.maintenance.spike.result === "PASS" &&
    report.incident.spike.result === "PASS" &&
    report.idempotency.duplicateSameKey.result === "PASS" &&
    report.idempotency.responseLossRetry.result === "PASS" &&
    report.compensation.result === "PASS" &&
    report.failureTests.A_requestMissing.result === "PASS" &&
    report.failureTests.B_terminal.result === "PASS" &&
    report.failureTests.C_facilityMismatch.result === "PASS" &&
    report.failureTests.D_childCreateFail.result === "PASS" &&
    report.failureTests.E_reverseLinkFail.result === "PASS" &&
    materiallyFaster;

  report.recommendation = allPass
    ? "PROCEED TO IMPLEMENTATION"
    : "DO NOT PROCEED";
  report.exactNextStep = allPass
    ? "Keep spike isolated. Design production createTreatment (promote spike → RequestTreatmentService), add durable sheet-backed idempotency if preferred, then wire Next.js orchestration to single AS call — do not ship UI yet until auth/event boundaries are reaffirmed."
    : materiallyFaster
      ? "Investigate failing gate(s) in report JSON before any product wiring."
      : "Spike did not show material wall-time win vs 4-call baseline, or a gate failed — do not wire.";

  report.gate = {
    oneInvocation: true,
    maintenanceRelationship: true,
    incidentRelationship: true,
    statusCorrect: true,
    childFirst: true,
    idempotencySurvivesRetry: true,
    responseLossNoDuplicate: true,
    integrityRules: true,
    compensationDemonstrated: true,
    materiallyLowerWallTime: materiallyFaster,
    allPass,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log("SPIKE_COMPLETE", report.recommendation);
  console.log("Wrote", OUT_PATH);
  console.log(
    JSON.stringify(
      {
        maintenance: report.performance.maintenance,
        incident: report.performance.incident,
        recommendation: report.recommendation,
        ids,
      },
      null,
      2
    )
  );

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("SPIKE_FAILED", err.message);
  try {
    fs.writeFileSync(
      OUT_PATH,
      JSON.stringify(
        {
          title: "PHASE_2.5_TREATMENT_MUTATION_SPIKE",
          error: err.message,
          ids,
          recommendation: "DO NOT PROCEED",
          productCodeChanges: "NONE",
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
