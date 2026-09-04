/**
 * Operational notifications / attention feed — Facility Management Home.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-operational-notifications.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Incident } from "../src/modules/incidents/types";
import type { Maintenance } from "../src/modules/maintenance/types";
import type { RequestRecord } from "../src/modules/requests/types";
import type { WorkOrder } from "../src/modules/work-orders/types";
import {
  OPERATIONAL_NOTIFICATION_LIMIT,
  deriveOperationalNotifications,
} from "../src/modules/workspace/utils/deriveOperationalNotifications";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

const asOf = "2026-09-04T12:00:00.000Z";

function baseRequest(over: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: "REQ-1",
    title: "Water supply issue — Block B",
    facilityId: "FAC-1",
    occurredAt: "2026-09-04T10:00:00.000Z",
    status: "submitted",
    incidentIds: [],
    maintenanceIds: [],
    workOrderIds: [],
    createdAt: "2026-09-04T10:00:00.000Z",
    updatedAt: "2026-09-04T10:00:00.000Z",
    ...over,
  };
}

function baseWo(over: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "WO-1042",
    title: "Generator maintenance",
    type: "corrective",
    source: "manual",
    status: "open",
    priority: "medium",
    facilityId: "FAC-1",
    createdAt: "2026-09-04T09:00:00.000Z",
    updatedAt: "2026-09-04T09:00:00.000Z",
    ...over,
  };
}

function baseMnt(over: Partial<Maintenance> = {}): Maintenance {
  return {
    id: "MNT-1",
    title: "HVAC fault",
    type: "corrective",
    source: "manual",
    status: "requested",
    priority: "medium",
    facilityId: "FAC-1",
    reportedAt: "2026-09-04T08:00:00.000Z",
    createdAt: "2026-09-04T08:00:00.000Z",
    updatedAt: "2026-09-04T08:00:00.000Z",
    ...over,
  };
}

function baseInc(over: Partial<Incident> = {}): Incident {
  return {
    id: "INC-1",
    title: "Fire alarm trip",
    type: "safety",
    source: "manual",
    status: "reported",
    severity: "critical",
    isEmergency: false,
    facilityId: "FAC-1",
    reportedAt: "2026-09-04T07:00:00.000Z",
    createdAt: "2026-09-04T07:00:00.000Z",
    updatedAt: "2026-09-04T07:00:00.000Z",
    ...over,
  };
}

function main() {
  const results: string[] = [];

  assert(OPERATIONAL_NOTIFICATION_LIMIT === 5, "hard max-5 limit");
  results.push("PASS OPERATIONAL_NOTIFICATION_LIMIT = 5");

  const feed = deriveOperationalNotifications({
    asOf,
    requests: [baseRequest()],
    maintenance: [
      baseMnt({ id: "MNT-CRIT", priority: "critical", title: "Critical HVAC" }),
      baseMnt({
        id: "MNT-DUE",
        title: "Pump service",
        dueAt: "2026-09-02",
        createdAt: "2026-08-01T00:00:00.000Z",
      }),
    ],
    incidents: [baseInc()],
    workOrders: [
      baseWo(),
      baseWo({
        id: "WO-1037",
        title: "Old overdue",
        dueAt: "2026-09-03",
        createdAt: "2026-08-20T00:00:00.000Z",
      }),
    ],
  });

  assert(feed.visible.length <= 5, "never more than 5 visible");
  assert(feed.total >= feed.visible.length, "total >= visible");
  assert(
    feed.visible[0]?.kind === "ncc_raised_issue",
    "open request ranks as NCC raised (highest priority)"
  );
  assert(
    feed.visible[0]?.eventType === "NCC raised issue",
    "NCC raised issue label"
  );
  assert(
    feed.visible.some((n) => n.kind === "work_order_raised"),
    "recent WO appears"
  );
  assert(
    feed.visible.some((n) => n.kind === "deadline_passed"),
    "overdue WO/MNT appears"
  );
  assert(
    feed.visible.some((n) => n.kind === "elevated_issue"),
    "critical/emergency elevated proxy appears"
  );
  results.push("PASS priority ordering + kind coverage");

  const many = deriveOperationalNotifications({
    asOf,
    requests: Array.from({ length: 8 }, (_, i) =>
      baseRequest({
        id: `REQ-${i}`,
        title: `Issue ${i}`,
        createdAt: `2026-09-0${(i % 4) + 1}T10:00:00.000Z`,
      })
    ),
    maintenance: [],
    incidents: [],
    workOrders: [],
  });
  assert(many.total === 8, "total counts all candidates");
  assert(many.visible.length === 5, "caps visible at 5");
  assert(many.viewAllHref === "/issues", "view all when overflow");
  assert(many.viewAllLabel === "View all →", "restrained view-all label");
  results.push("PASS max-5 + View all →");

  const quiet = deriveOperationalNotifications({
    asOf,
    requests: [
      baseRequest({ status: "resolved", id: "REQ-DONE" }),
    ],
    maintenance: [
      baseMnt({
        status: "completed",
        priority: "critical",
        dueAt: "2026-09-01",
      }),
    ],
    incidents: [baseInc({ status: "closed" })],
    workOrders: [
      baseWo({ status: "completed", dueAt: "2026-09-01" }),
    ],
  });
  assert(quiet.total === 0, "resolved/closed records produce no noise");
  results.push("PASS no noise from settled records");

  const deriveSrc = readSrc(
    "src/modules/workspace/utils/deriveOperationalNotifications.ts"
  );
  assert(
    deriveSrc.includes("fromNccRaisedRequests") &&
      deriveSrc.includes("ncc_raised_issue"),
    "NCC raised derivation from Request intake"
  );
  assert(deriveSrc.includes("Formal escalations"), "documents escalation gap");
  assert(
    deriveSrc.includes("Submit Request") && deriveSrc.includes("RequestService"),
    "documents Submit Request → RequestService path"
  );
  results.push("PASS NCC origin + documented unsupported escalations");

  const command = readSrc(
    "src/modules/workspace/components/CommandSurface.tsx"
  );
  assert(
    command.includes("OperationalNotificationsSection"),
    "CommandSurface mounts notification section"
  );
  const heroBlock =
    command.match(
      /export function CommandSurface[\s\S]*?<\/ModeFrame>/
    )?.[0] ?? "";
  assert(
    heroBlock.includes("<OperationalNotificationsSection"),
    "notification section rendered in CommandSurface"
  );
  assert(
    heroBlock.indexOf("<OperationalNotificationsSection") <
      heroBlock.indexOf("<FinancialPositionSection"),
    "notifications sit below hero, above finance strip"
  );
  results.push("PASS CommandSurface placement");

  const workspace = readSrc("src/services/workspace/WorkspaceService.ts");
  assert(
    workspace.includes("deriveOperationalNotifications") &&
      workspace.includes("RequestService"),
    "WorkspaceService derives feed from live lists including requests"
  );
  results.push("PASS WorkspaceService wiring");

  for (const line of results) console.log(line);
  console.log("OK verify-operational-notifications");
}

main();
