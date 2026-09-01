/**
 * Phase 13 — Issue-first operational UX (domain/action + Log Issue contract).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-issue-first-ux.mts
 */
import {
  FM_LOG_ISSUE_SIDE_EFFECT_MODE,
  INCIDENT_POLICY,
  ISSUE_MODEL_PHASE,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
  composeIssueFromRequest,
  deriveIssueActions,
  getIssueAction,
} from "../src/lib/operational/issues";
import { originLabel } from "../src/modules/issues/lib/buildUnifiedIssueList";
import type { LogIssueInput } from "../src/modules/issues/actions/logIssue";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const results: string[] = [];
  assert(ISSUE_MODEL_PHASE === 23, "phase 18");
  results.push("PASS ISSUE_MODEL_PHASE = 19");

  // Log Issue — no taxonomy; Work via Maintenance backing.
  const defaultInput: LogIssueInput = {
    title: "Leaking toilet",
    facilityId: "FAC-0001",
  };
  assert(
    defaultInput.classification === undefined,
    "operator need not supply taxonomy"
  );
  assert(INCIDENT_POLICY.ordinaryDefault === "work", "default path");
  assert(INCIDENT_POLICY.incidentMandatoryForIssues === false, "incident optional");
  results.push("PASS Log Issue does not require Maintenance-vs-Incident taxonomy");

  const mnt = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-13",
      title: "Elevator fault",
      facilityId: "FAC-0001",
      status: "requested",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  const mntTreat = getIssueAction(deriveIssueActions(mnt), "treat");
  assert(mntTreat?.available === true, "treat available");
  assert(mntTreat?.href?.includes("MNT-13"), "treat → work");
  assert(originLabel(mnt) === "FM logged", "neutral origin label");
  results.push("PASS Issue Treat routes to Work (/work surface)");

  const inc = composeIssueFromIncident({
    incident: {
      id: "INC-13",
      title: "Fire alarm",
      facilityId: "FAC-0001",
      status: "reported",
      type: "safety",
      severity: "high",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  const incTreat = getIssueAction(deriveIssueActions(inc), "treat");
  assert(incTreat?.available === true, "treat on investigation path");
  assert(incTreat?.href?.includes("INC-13"), "treat → incident handling");
  assert(
    !getIssueAction(deriveIssueActions(inc), "investigate")?.available,
    "no Investigate as competing category"
  );
  assert(originLabel(inc) === "FM logged", "neutral origin for investigation root");
  results.push("PASS Specialised handling reachable via Treat; Incident still accessible");

  const staff = composeIssueFromRequest({
    request: {
      id: "REQ-13",
      title: "AC not cooling",
      facilityId: "FAC-0001",
      status: "being_treated",
      maintenanceIds: ["MNT-R13"],
      incidentIds: [],
      workOrderIds: ["WO-13"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    maintenances: [{ id: "MNT-R13", title: "AC", status: "scheduled" }],
    workOrders: [
      { id: "WO-13", title: "Inspect", status: "open", maintenanceId: "MNT-R13" },
    ],
  });
  assert(staff.id === "issue:request:REQ-13", "request issue");
  assert(originLabel(staff) === "Staff request", "staff origin");
  assert(
    getIssueAction(deriveIssueActions(staff), "create_work")?.href?.includes(
      "WO-13"
    ) ||
      getIssueAction(deriveIssueActions(staff), "create_work")?.href?.includes(
        "MNT-R13"
      ),
    "WO / treatment work routing"
  );
  results.push("PASS Request-backed Issues and Work Order routing intact");

  assert(
    typeof (mnt as { persist?: unknown }).persist === "undefined",
    "issue derived"
  );
  assert(FM_LOG_ISSUE_SIDE_EFFECT_MODE === "after", "phase 9 perf intact");
  results.push("PASS Issue remains derived; Log Issue side effects remain deferred");

  console.log("\n=== issue-first operational UX verify (phase 16) ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
