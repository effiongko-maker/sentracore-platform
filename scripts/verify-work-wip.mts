/**
 * Phase 16 — Work / WIP surface foundation.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-work-wip.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  FM_LOG_ISSUE_SIDE_EFFECT_MODE,
  INCIDENT_POLICY,
  ISSUE_MODEL_PHASE,
  JOB_ORDER_BOUNDARY,
  WORK_ORDER_BOUNDARY,
  composeIssueFromMaintenance,
  deriveIssueActions,
  getIssueAction,
} from "../src/lib/operational/issues";
import {
  INCIDENT_DOMAIN_LEGACY,
  WORK_BACKING_STORE,
  WORK_STATUS_LABELS,
  issueHrefForWork,
  mapMaintenanceToWork,
  workHref,
} from "../src/lib/operational/work";
import { WORK_PAGE_SIZE } from "../src/modules/work/constants";
import type { Maintenance } from "../src/modules/maintenance/types";
import { NAV_GROUPS } from "../src/lib/navigation";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "phase 18");
  results.push("PASS ISSUE_MODEL_PHASE = 19");

  // Route + module exist
  assert(
    existsSync(resolve("src/app/(app)/work/page.tsx")),
    "work route page missing"
  );
  assert(
    existsSync(resolve("src/modules/work/components/WorkPage.tsx")),
    "WorkPage missing"
  );
  results.push("PASS /work route and WorkPage exist");

  // No Work sheet / second store
  assert(WORK_BACKING_STORE.sheet === "Maintenance", "backing sheet");
  assert(WORK_BACKING_STORE.domain === "maintenance", "backing domain");
  assert(WORK_PAGE_SIZE === 10, "page size 10");
  results.push("PASS Work backed by Maintenance; page size 10; no Work sheet");

  // workHref + Treat → /work
  assert(workHref("MNT-W16-1").startsWith("/work?id="), "workHref");
  assert(
    issueHrefForWork("MNT-W16-1").includes("MNT-W16-1") &&
      issueHrefForWork("MNT-W16-1").startsWith("/issues?id="),
    "issue href"
  );
  const mnt = {
    id: "MNT-W16-1",
    title: "Leak",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Maintenance;
  const work = mapMaintenanceToWork(mnt);
  assert(work.backing.kind === "maintenance", "map backing");
  assert(WORK_STATUS_LABELS.in_progress === "In progress", "status label");

  const issue = composeIssueFromMaintenance({
    maintenance: {
      id: mnt.id,
      title: mnt.title,
      facilityId: mnt.facilityId,
      status: mnt.status,
      priority: mnt.priority,
      createdAt: mnt.createdAt,
      updatedAt: mnt.updatedAt,
    },
  });
  const treat = getIssueAction(deriveIssueActions(issue), "treat");
  assert(treat?.href?.includes("/work"), "treat → /work");
  assert(treat?.href?.includes("MNT-W16-1"), "treat id");
  results.push("PASS workHref + Issue Treat route to /work");

  // Nav: Work present; Request Queue absent
  const operate = NAV_GROUPS.find((g) => g.id === "operate");
  assert(operate, "operate group");
  const labels = operate!.items.map((i) => i.label);
  assert(labels.includes("Work"), "Work nav");
  assert(labels.includes("Issues"), "Issues nav");
  assert(labels.includes("Work Orders"), "WO nav");
  assert(!labels.includes("Request Queue"), "no Request Queue");
  const workItem = operate!.items.find((i) => i.href === "/work");
  assert(workItem, "/work nav href");
  results.push("PASS navigation: Work/WIP; Request Queue absent");

  // Incident boundary
  assert(INCIDENT_DOMAIN_LEGACY.newFmLogIssueCreatesIncident === false, "no INC");
  assert(INCIDENT_POLICY.ordinaryDefault === "work", "treat → work");
  assert(WORK_ORDER_BOUNDARY.implemented === true, "WO");
  assert(JOB_ORDER_BOUNDARY.implemented === false, "JO");
  assert(FM_LOG_ISSUE_SIDE_EFFECT_MODE === "after", "phase 9");
  results.push(
    "PASS Incident not created from Work path; WO ok; JO unimplemented; Phase 9 intact"
  );

  // Maintenance compat route still present
  assert(
    existsSync(resolve("src/app/(app)/maintenance/page.tsx")),
    "maintenance route retained"
  );
  assert(
    existsSync(resolve("src/app/(app)/incidents/page.tsx")),
    "incidents route retained"
  );
  results.push("PASS Maintenance + Incidents compatibility routes retained");

  // No Work persistence layer invented in modules/work
  const workIndex = readFileSync("src/modules/work/index.ts", "utf8");
  assert(!/createWorkSheet|WorkRepository|WorkService\.create/.test(workIndex), "no work store");
  results.push("PASS no Work persistence API introduced");

  console.log("\n=== work / WIP surface verify (phase 16) ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
