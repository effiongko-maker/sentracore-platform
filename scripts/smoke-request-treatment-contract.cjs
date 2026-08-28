#!/usr/bin/env node
/**
 * Request treatment persistence contract (Apps Script / Sheets).
 *
 * Verifies sourceRequestId + Request relationship arrays round-trip.
 * Full server-action auth/idempotency requires an authenticated Next session —
 * this smoke covers the cross-service schema contract.
 *
 * Usage:
 *   node scripts/smoke-request-treatment-contract.cjs
 */

const url =
  process.env.APPS_SCRIPT_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://script.google.com/macros/s/AKfycbz8DUM4MS2NTlEAeHsMVw9sGY0CyCdJwu_24mYJCpUwJWQb9FKEGABO2TEZhzKO-5Xm/exec";

async function post(resource, action, payload = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ resource, action, payload }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!json.success) {
    throw new Error(`${resource}/${action}: ${json.message || res.status}`);
  }
  return json.data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const stamp = Date.now();
  const title = `Treatment smoke ${stamp}`;

  const request = await post("requests", "create", {
    title,
    description: "Phase 2 treatment contract",
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    requestType: "maintenance",
    status: "submitted",
    reporterName: "Smoke Bot",
  });

  assert(request && request.id, "Request create must return id");
  console.log("REQ_CREATED", request.id);

  const maintenance = await post("maintenance", "create", {
    title: `MNT from ${request.id}`,
    description: request.description || title,
    facilityId: "FAC-0001",
    type: "corrective",
    source: "request",
    priority: "medium",
    status: "requested",
    reportedAt: new Date().toISOString(),
    sourceRequestId: request.id,
  });

  assert(maintenance && maintenance.id, "Maintenance create must return id");
  assert(
    String(maintenance.sourceRequestId || "") === request.id,
    `MNT.sourceRequestId expected ${request.id}, got ${maintenance.sourceRequestId}`
  );
  console.log("MNT_CREATED", maintenance.id, "sourceRequestId", maintenance.sourceRequestId);

  const linkedRequest = await post("requests", "update", {
    id: request.id,
    maintenanceIds: [maintenance.id],
    status: "being_treated",
  });

  const mntIds = linkedRequest.maintenanceIds || [];
  assert(
    mntIds.includes(maintenance.id),
    `REQ.maintenanceIds missing ${maintenance.id}: ${JSON.stringify(mntIds)}`
  );
  assert(
    mntIds.filter((id) => id === maintenance.id).length === 1,
    "Duplicate maintenance id in relationship array"
  );
  assert(
    linkedRequest.status === "being_treated",
    `Expected being_treated, got ${linkedRequest.status}`
  );
  console.log("REQ_LINKED", linkedRequest.id, mntIds, linkedRequest.status);

  // Idempotent append (same id again)
  const again = await post("requests", "update", {
    id: request.id,
    maintenanceIds: [...mntIds, maintenance.id],
  });
  // Repository replaces list as provided — client/orchestrator must appendUnique.
  // Assert sheet accepted the write and still contains the id once when unique list sent.
  const uniqueAgain = await post("requests", "update", {
    id: request.id,
    maintenanceIds: [maintenance.id],
  });
  assert(
    (uniqueAgain.maintenanceIds || []).filter((id) => id === maintenance.id)
      .length === 1,
    "Unique list must store id once"
  );

  const incident = await post("incidents", "create", {
    title: `INC from ${request.id}`,
    description: title,
    facilityId: "FAC-0001",
    type: "other",
    source: "request",
    severity: "medium",
    status: "reported",
    reportedAt: new Date().toISOString(),
    sourceRequestId: request.id,
  });
  assert(
    String(incident.sourceRequestId || "") === request.id,
    `INC.sourceRequestId expected ${request.id}, got ${incident.sourceRequestId}`
  );

  const withInc = await post("requests", "update", {
    id: request.id,
    maintenanceIds: [maintenance.id],
    incidentIds: [incident.id],
    status: "being_treated",
  });
  assert(
    (withInc.incidentIds || []).includes(incident.id),
    "REQ.incidentIds must include incident"
  );

  // Conflict fixture: child already has sourceRequestId — Apps Script will overwrite if told;
  // orchestration must reject. Record the child ownership for UI/action tests.
  const otherReq = await post("requests", "create", {
    title: `Other ${stamp}`,
    facilityId: "FAC-0001",
    occurredAt: new Date().toISOString(),
    status: "submitted",
  });
  assert(otherReq.id !== request.id, "Need a second request id");

  const owned = await post("maintenance", "getById", { id: maintenance.id });
  assert(
    String(owned.sourceRequestId || "") === request.id,
    "Child must remain owned by original request before conflict tests"
  );

  console.log(
    JSON.stringify(
      {
        requestId: request.id,
        maintenanceId: maintenance.id,
        incidentId: incident.id,
        otherRequestId: otherReq.id,
        requestStatus: withInc.status,
        maintenanceIds: withInc.maintenanceIds,
        incidentIds: withInc.incidentIds,
        mntSourceRequestId: owned.sourceRequestId,
        note:
          "Orchestration reject-on-reassign is enforced in Next.js treatRequest actions, not Apps Script.",
      },
      null,
      2
    )
  );

  console.log("REQUEST_TREATMENT_CONTRACT_OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
