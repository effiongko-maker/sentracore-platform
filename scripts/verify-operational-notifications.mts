/**
 * Operational notifications / attention feed — Facility Management.
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
  OPERATIONAL_NOTIFICATIONS_HREF,
  deriveOperationalNotifications,
  notificationSourceLabel,
} from "../src/modules/workspace/utils/deriveOperationalNotifications";
import {
  clearNotificationReadStateForTests,
  countUnreadNotifications,
  loadReadNotificationIds,
  markAllNotificationsRead,
  markNotificationRead,
} from "../src/modules/workspace/utils/notificationReadState";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

const asOf = "2026-09-04T12:00:00.000Z";

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return localStorage;
}

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
  installLocalStorageMock();
  clearNotificationReadStateForTests();

  assert(OPERATIONAL_NOTIFICATION_LIMIT === 5, "hard max-5 limit");
  assert(
    OPERATIONAL_NOTIFICATIONS_HREF === "/notifications",
    "unified notifications href"
  );
  results.push("PASS OPERATIONAL_NOTIFICATION_LIMIT + unified href constant");

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
  assert(feed.items.length === feed.total, "items is full sorted feed");
  assert(
    feed.visible[0]?.kind === "new_issue",
    "open request ranks as new issue (highest live priority)"
  );
  assert(
    feed.visible[0]?.eventType === "New issue",
    "New issue label for open Request intake"
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
  results.push("PASS priority ordering + kind coverage + full items");

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
  assert(many.items.length === 8, "items retains full feed");
  assert(
    many.viewAllHref === OPERATIONAL_NOTIFICATIONS_HREF,
    "view all opens unified notifications view"
  );
  assert(
    String(many.viewAllHref) !== "/issues",
    "view all must not route to /issues"
  );
  assert(many.viewAllLabel === "View all →", "restrained view-all label");
  results.push("PASS max-5 + View all → /notifications (not /issues)");

  // 1. Read all marks unread notifications as read (notification-state only)
  clearNotificationReadStateForTests();
  const ids = many.items.map((item) => item.id);
  assert(
    countUnreadNotifications(ids) === ids.length,
    "all unread before Read all"
  );
  markNotificationRead(ids[0]!);
  assert(
    countUnreadNotifications(ids, loadReadNotificationIds()) ===
      ids.length - 1,
    "single mark-read reduces unread"
  );
  markAllNotificationsRead(ids);
  assert(
    countUnreadNotifications(ids, loadReadNotificationIds()) === 0,
    "Read all marks every unread id as read"
  );
  assert(
    ids.every((id) => loadReadNotificationIds().has(id)),
    "read set contains all notification ids"
  );
  results.push("PASS Read all marks unread notifications as read");

  // 4. Notification actions route to the correct underlying module
  const routed = deriveOperationalNotifications({
    asOf,
    requests: [baseRequest({ id: "REQ-ROUTE" })],
    maintenance: [
      // Older critical work → elevated (not competed by “new issue” recency)
      baseMnt({
        id: "MNT-ROUTE",
        priority: "critical",
        title: "Critical route",
        createdAt: "2026-08-01T00:00:00.000Z",
      }),
      // Recent standalone → Work
      baseMnt({
        id: "MNT-NEW-ROUTE",
        title: "Recent standalone",
        createdAt: "2026-09-03T08:00:00.000Z",
      }),
    ],
    incidents: [baseInc({ id: "INC-ROUTE" })],
    workOrders: [baseWo({ id: "WO-ROUTE" })],
  });

  const req = routed.items.find((item) => item.id === "req-new-REQ-ROUTE");
  const mntNew = routed.items.find((item) => item.id === "mnt-new-MNT-NEW-ROUTE");
  const mntElevated = routed.items.find(
    (item) => item.id === "mnt-elevated-MNT-ROUTE"
  );
  const incElevated = routed.items.find(
    (item) => item.id === "inc-elevated-INC-ROUTE"
  );
  const woRaised = routed.items.find((item) => item.id === "wo-raised-WO-ROUTE");

  assert(req?.href === "/issues?id=REQ-ROUTE", "open request routes to Issues");
  assert(req?.kind === "new_issue", "open request is generic new_issue");
  assert(
    mntNew?.href === "/work?id=MNT-NEW-ROUTE",
    "new work routes to Work"
  );
  assert(
    mntElevated?.href === "/work?id=MNT-ROUTE",
    "elevated maintenance routes to Work"
  );
  assert(
    incElevated?.href === "/incidents?id=INC-ROUTE",
    "elevated incident routes to Incidents"
  );
  assert(
    woRaised?.href === "/work-orders?id=WO-ROUTE",
    "WO raised routes to Work orders"
  );
  assert(
    notificationSourceLabel("/finance/submissions/SUB-1") === "Finance",
    "Finance source label ready for future feed items"
  );
  assert(
    notificationSourceLabel("/approvals?id=APR-1") === "Approvals",
    "Approvals source label ready for future feed items"
  );
  assert(
    notificationSourceLabel("/work-orders?id=WO-1") === "Work orders",
    "Work orders source label"
  );
  assert(
    notificationSourceLabel("/work?id=MNT-1") === "Work",
    "Work source label"
  );
  assert(
    notificationSourceLabel("/issues?id=REQ-1") === "Issues",
    "Issues source label"
  );
  results.push("PASS notification actions route to correct modules");

  const quiet = deriveOperationalNotifications({
    asOf,
    requests: [baseRequest({ status: "resolved", id: "REQ-DONE" })],
    maintenance: [
      baseMnt({
        status: "completed",
        priority: "critical",
        dueAt: "2026-09-01",
      }),
    ],
    incidents: [baseInc({ status: "closed" })],
    workOrders: [baseWo({ status: "completed", dueAt: "2026-09-01" })],
  });
  assert(quiet.total === 0, "resolved/closed records produce no noise");
  results.push("PASS no noise from settled records");

  const deriveSrc = readSrc(
    "src/modules/workspace/utils/deriveOperationalNotifications.ts"
  );
  assert(
    deriveSrc.includes("fromOpenIntakeRequests") &&
      deriveSrc.includes('kind: "new_issue"'),
    "open Request intake classified as generic new_issue"
  );
  assert(
    !deriveSrc.includes("fromNccRaisedRequests") &&
      !deriveSrc.includes('kind: "ncc_raised_issue"'),
    "does not assign ncc_raised_issue from Request presence alone"
  );
  assert(
    deriveSrc.includes("ncc_raised_issue") &&
      deriveSrc.includes("reserved"),
    "ncc_raised_issue kind reserved until explicit NCC signal exists"
  );
  assert(deriveSrc.includes("Formal escalations"), "documents escalation gap");
  assert(
    deriveSrc.includes("Submit Request") && deriveSrc.includes("RequestService"),
    "documents Submit Request → RequestService path"
  );
  assert(
    !deriveSrc.includes('viewAllHref: total > OPERATIONAL_NOTIFICATION_LIMIT ? "/issues"'),
    "derivation no longer points View all at /issues"
  );
  assert(
    deriveSrc.includes("OPERATIONAL_NOTIFICATIONS_HREF"),
    "derivation uses unified notifications href"
  );
  results.push("PASS open intake is new_issue + documented unsupported escalations");

  // 5. Home Requires attention remains unchanged
  const command = readSrc(
    "src/modules/workspace/components/CommandSurface.tsx"
  );
  assert(
    !command.includes("OperationalNotificationsSection"),
    "Home must not mount duplicate Needs attention feed"
  );
  assert(
    !command.includes("GlobalNotificationBell"),
    "Home CommandSurface does not own the bell"
  );
  assert(
    command.includes("RequiresAttention") ||
      command.includes("Requires attention"),
    "existing Requires attention surface preserved"
  );
  results.push("PASS Home Requires attention remains unchanged");

  const header = readSrc("src/components/platform/GlobalCommandBar.tsx");
  assert(
    header.includes("GlobalNotificationBell"),
    "global header mounts notification bell"
  );
  const bell = readSrc("src/components/platform/GlobalNotificationBell.tsx");
  assert(
    bell.includes("OperationalNotificationService"),
    "bell uses operational notification service"
  );
  assert(bell.includes("Notifications"), "bell panel title");
  assert(bell.includes("Read all"), "bell exposes Read all");
  assert(
    bell.includes("markAllNotificationsRead"),
    "bell Read all uses notification read-state helper"
  );
  assert(
    !bell.includes('href="/issues"'),
    "bell does not hardcode View all to /issues"
  );
  assert(
    bell.includes("HOME_WORKSPACE_SETTLED_EVENT") &&
      bell.includes("isOperationsHomePath"),
    "bell defers initial feed on /operations until Home settles"
  );
  results.push("PASS global notification bell wiring + Read all + Home deferral");

  // 2–3. Unified notifications view route + page
  const pageRoute = readSrc("src/app/(app)/notifications/page.tsx");
  assert(
    pageRoute.includes("NotificationsPage"),
    "View all destination route mounts NotificationsPage"
  );
  const page = readSrc(
    "src/modules/workspace/components/NotificationsPage.tsx"
  );
  assert(
    page.includes("OperationalNotificationService") &&
      page.includes("notificationSourceLabel") &&
      page.includes("markAllNotificationsRead"),
    "unified page reuses feed + read state + source labels"
  );
  assert(
    page.includes("Distinct from Home"),
    "unified page stays separate from Home Requires attention"
  );
  assert(
    page.includes("NOTIFICATION_READ_STATE_EVENT"),
    "inbox Read all syncs with bell via read-state event"
  );
  results.push(
    "PASS View all opens unified /notifications attention view"
  );

  const readState = readSrc(
    "src/modules/workspace/utils/notificationReadState.ts"
  );
  assert(
    readState.includes("localStorage") &&
      readState.includes("markAllNotificationsRead"),
    "read/unread is client notification-state only"
  );
  assert(
    readState.includes("NOTIFICATION_READ_STATE_EVENT"),
    "read-state changes notify bell + inbox"
  );
  results.push("PASS notification read-state is client-only + sync event");

  const service = readSrc(
    "src/services/workspace/OperationalNotificationService.ts"
  );
  assert(
    service.includes("deriveOperationalNotifications") &&
      service.includes("RequestService"),
    "notification service derives feed including requests"
  );
  assert(
    !service.includes('from "@/services/reporting/loadAllPages"') &&
      !service.includes("loadAllPages(("),
    "notification sources must not use loadAllPages"
  );
  assert(
    service.includes("sharedRequest") &&
      service.includes("NOTIFICATION_FEED_TTL_MS"),
    "feed-level in-flight + TTL cache for bell + inbox"
  );
  assert(
    service.includes('status: "active"') &&
      service.includes('dueDate: "overdue"'),
    "notification sources use bounded active/overdue filters"
  );
  results.push("PASS OperationalNotificationService bounded + cached feed");

  const workspace = readSrc("src/services/workspace/WorkspaceService.ts");
  assert(
    !workspace.includes("deriveOperationalNotifications"),
    "WorkspaceService no longer owns notification feed"
  );
  assert(
    !workspace.includes('from "@/services/reporting/loadAllPages"') &&
      !workspace.includes("loadAllPages(("),
    "Home must not full-paginate operational registers"
  );
  assert(
    !workspace.includes("fetchUsersCatalog"),
    "users catalog off Home critical path"
  );
  assert(
    workspace.includes("WORKSPACE_HOME_POOL_SIZE") &&
      workspace.includes('status: "active"'),
    "Home uses bounded active/newest pools"
  );
  assert(
    workspace.includes("settleDomain") &&
      workspace.includes("WORKSPACE_HOME_DOMAIN_TIMEOUT_MS"),
    "Home domain fetches are timeout-isolated (ok:false on hang)"
  );
  assert(
    workspace.includes("const domains =") &&
      workspace.includes("attentionIncomplete") &&
      workspace.includes("domains.maintenance ? maintenance : null"),
    "failed core domains do not contribute zero KPIs"
  );
  assert(
    workspace.includes("beginWorkspaceLoad") &&
      workspace.includes("startCoreDomainLists") &&
      workspace.includes("startNonCoreDomainLists"),
    "Home progressive load splits core vs non-core domains"
  );
  assert(
    workspace.includes("Core for first paint") &&
      workspace.includes("Non-core: approvals"),
    "documents core vs non-core Home domains"
  );
  results.push("PASS WorkspaceService bounded Home load (no full registers)");

  const homeReady = readSrc(
    "src/modules/workspace/utils/homeWorkspaceReady.ts"
  );
  assert(
    homeReady.includes("signalHomeWorkspaceSettled"),
    "Home ready signal exists for bell deferral"
  );
  const useWs = readSrc("src/modules/workspace/hooks/useWorkspace.ts");
  assert(
    useWs.includes("signalHomeWorkspaceSettled") &&
      useWs.includes("beginWorkspaceLoad"),
    "useWorkspace paints on core then signals Home settled"
  );
  assert(
    useWs.includes("complete") &&
      useWs.includes("Never flip loading back to true"),
    "non-core enrich does not re-enter LoadingGate"
  );
  results.push("PASS notification bell defers to Home on /operations");

  const requestTypes = readSrc("src/modules/requests/types.ts");
  assert(
    !/\borigin\b/.test(requestTypes) && !/\bncc\b/i.test(requestTypes),
    "RequestRecord has no dedicated NCC/origin field — derivation uses open intake"
  );
  results.push(
    "PASS open Request intake has no NCC origin field (generic new_issue)"
  );

  const nav = readSrc("src/lib/navigation.ts");
  assert(
    nav.includes('href: "/notifications"'),
    "nav resolves /notifications context"
  );
  results.push("PASS /notifications nav context");

  const workspaces = readSrc("src/lib/platform/workspaces.ts");
  assert(
    workspaces.includes('pathname.startsWith("/notifications")'),
    "/notifications must be an FM (isOperationsPath) workspace route"
  );
  const layers = readSrc("src/lib/platform/layers.ts");
  assert(
    layers.includes('href: "/notifications"'),
    "breadcrumb/layer resolves Notifications inside FM shell"
  );
  results.push("PASS /notifications uses Facility Management shell");

  for (const line of results) console.log(line);
  console.log("OK verify-operational-notifications");
}

main();
