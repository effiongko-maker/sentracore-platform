import type {
  DashboardCard,
  DashboardCardTone,
  DashboardModuleRef,
  DashboardPulse,
  DashboardSnapshot,
} from "../types";
import { resolveModulePath } from "../utils";

export type OverviewSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface OverviewAttentionRow {
  id: string;
  title: string;
  context: string;
  count: number;
  severity: OverviewSeverity;
  severityLabel: string;
  href: string;
  module?: DashboardModuleRef;
}

export interface OverviewMetric {
  id: string;
  title: string;
  value: string | number;
  context: string;
  tone: DashboardCardTone;
  href?: string;
  module?: DashboardModuleRef;
}

export interface OverviewChangeRow {
  id: string;
  title: string;
  context: string;
  deltaLabel: string;
  tone: DashboardCardTone;
  href?: string;
}

export interface OverviewMotionRow {
  id: string;
  title: string;
  count: number;
  href: string;
}

export interface OverviewHealthDriver {
  id: string;
  label: string;
  value: number;
  tone: DashboardCardTone;
}

export interface DashboardOverviewViewModel {
  title: string;
  subtitle: string;
  asOf: string;
  health: {
    score: number;
    band: "healthy" | "watch" | "critical";
    bandLabel: string;
    summary: string;
    detailHref: string;
  };
  drivers: OverviewHealthDriver[];
  attention: OverviewAttentionRow[];
  attentionHref: string;
  metrics: OverviewMetric[];
  changes: OverviewChangeRow[];
  motion: OverviewMotionRow[];
  showQuickActions: boolean;
  quickActionCards: DashboardCard[];
}

function sectionCards(snapshot: DashboardSnapshot, id: string) {
  return snapshot.sections.find((section) => section.id === id)?.cards ?? [];
}

function uniqueFacilities(card: DashboardCard | undefined) {
  if (!card?.items?.length) return 0;
  const ids = new Set(
    card.items
      .map((item) => item.facilityId?.trim())
      .filter((value): value is string => Boolean(value))
  );
  return ids.size;
}

function facilityContext(count: number, fallback: string) {
  if (count <= 0) return fallback;
  if (count === 1) return "Affecting 1 facility";
  return `Across ${count} facilities`;
}

function bandLabel(band: "healthy" | "watch" | "critical") {
  if (band === "healthy") return "Healthy";
  if (band === "watch") return "Needs attention";
  return "Critical";
}

function healthSummary(
  band: "healthy" | "watch" | "critical",
  summary?: string
) {
  const base =
    summary?.trim() ||
    (band === "healthy"
      ? "Operations are tracking steadily across the estate."
      : band === "watch"
        ? "Some items need attention before end of day."
        : "Critical pressure detected — review open incidents and overdue work.");

  if (band === "healthy") {
    return base.includes("facilities")
      ? base
      : `${base} Keep monitoring the priorities below.`;
  }
  if (band === "watch") {
    return base.includes("Focus on")
      ? base
      : `${base} Focus on the highest-priority issues to keep operations on track.`;
  }
  return base.includes("Address")
    ? base
    : `${base} Address critical incidents and overdue work first.`;
}

function buildAttention(
  pulse: DashboardPulse | undefined,
  listCards: DashboardCard[]
): OverviewAttentionRow[] {
  const byWidget = new Map(listCards.map((card) => [card.widgetId, card]));
  const criticalList = byWidget.get("list.critical_incidents");
  const overdueWo = byWidget.get("list.overdue_work_orders");
  const maintenance = byWidget.get("list.maintenance_attention");
  const blocked = byWidget.get("list.blocked_items");
  const rows: OverviewAttentionRow[] = [];

  const criticalCount = pulse?.criticalIncidents ?? criticalList?.items?.length ?? 0;
  if (criticalCount > 0) {
    const unassigned = pulse?.criticalIncidentsUnassigned ?? 0;
    rows.push({
      id: "attention.critical_incidents",
      title:
        unassigned > 0
          ? `${criticalCount} critical incident${criticalCount === 1 ? "" : "s"} awaiting assignment`
          : `${criticalCount} critical incident${criticalCount === 1 ? "" : "s"} open`,
      context: facilityContext(
        uniqueFacilities(criticalList),
        unassigned > 0
          ? `${unassigned} awaiting assignment`
          : "Open critical severity events"
      ),
      count: criticalCount,
      severity: "critical",
      severityLabel: `${criticalCount} Critical`,
      href: resolveModulePath("incidents"),
      module: "incidents",
    });
  }

  const overdueMaintenance = pulse?.overdueMaintenance ?? 0;
  const maintenanceAttention =
    pulse?.maintenanceBacklog && overdueMaintenance > 0
      ? overdueMaintenance
      : maintenance?.items?.length ?? overdueMaintenance;
  if (maintenanceAttention > 0 || (maintenance?.items?.length ?? 0) > 0) {
    const count =
      overdueMaintenance > 0
        ? overdueMaintenance
        : (maintenance?.items?.length ?? pulse?.maintenanceBacklog ?? 0);
    if (count > 0) {
      rows.push({
        id: "attention.maintenance",
        title: `${count} maintenance task${count === 1 ? "" : "s"} ${
          overdueMaintenance > 0 ? "overdue" : "requiring attention"
        }`,
        context: facilityContext(
          uniqueFacilities(maintenance),
          overdueMaintenance > 0
            ? "Past due across the estate"
            : "High priority, overdue, or on hold"
        ),
        count,
        severity: overdueMaintenance > 0 ? "high" : "medium",
        severityLabel: `${count} ${overdueMaintenance > 0 ? "High" : "Medium"}`,
        href: resolveModulePath("maintenance"),
        module: "maintenance",
      });
    }
  }

  const openWo = pulse?.openWorkOrders ?? 0;
  const overdueWoCount = pulse?.overdueWorkOrders ?? overdueWo?.items?.length ?? 0;
  if (openWo > 0 || overdueWoCount > 0) {
    const createdToday = pulse?.workOrdersCreatedToday ?? 0;
    rows.push({
      id: "attention.open_work_orders",
      title:
        overdueWoCount > 0
          ? `${overdueWoCount} work order${overdueWoCount === 1 ? "" : "s"} overdue`
          : `${openWo} open work order${openWo === 1 ? "" : "s"}`,
      context:
        createdToday > 0
          ? `${createdToday} created today`
          : facilityContext(
              uniqueFacilities(overdueWo),
              overdueWoCount > 0 ? "Past due date" : "Currently open"
            ),
      count: overdueWoCount > 0 ? overdueWoCount : openWo,
      severity: overdueWoCount > 0 ? "high" : "medium",
      severityLabel: `${overdueWoCount > 0 ? overdueWoCount : openWo} ${
        overdueWoCount > 0 ? "High" : "Medium"
      }`,
      href: resolveModulePath("work-orders"),
      module: "work-orders",
    });
  }

  const inactive = pulse?.inactiveFacilities ?? 0;
  if (inactive > 0) {
    rows.push({
      id: "attention.inactive_facilities",
      title: `${inactive} facilit${inactive === 1 ? "y" : "ies"} inactive`,
      context: "No activity recorded as active in the current estate",
      count: inactive,
      severity: "low",
      severityLabel: `${inactive} Low`,
      href: resolveModulePath("facilities"),
      module: "facilities",
    });
  }

  const blockedCount =
    (pulse?.maintenanceOnHold ?? 0) + (pulse?.workOrdersOnHold ?? 0) ||
    (blocked?.items?.length ?? 0);
  if (blockedCount > 0 && !rows.some((row) => row.id === "attention.blocked")) {
    rows.push({
      id: "attention.blocked",
      title: `${blockedCount} item${blockedCount === 1 ? "" : "s"} blocked or on hold`,
      context: facilityContext(
        uniqueFacilities(blocked),
        "Work orders and maintenance waiting to proceed"
      ),
      count: blockedCount,
      severity: "medium",
      severityLabel: `${blockedCount} Medium`,
      href: resolveModulePath("work-orders"),
    });
  }

  return rows.slice(0, 6);
}

function buildDrivers(pulse: DashboardPulse | undefined): OverviewHealthDriver[] {
  if (!pulse) return [];
  const drivers: OverviewHealthDriver[] = [
    {
      id: "driver.critical",
      label: "Critical incidents",
      value: pulse.criticalIncidents,
      tone: pulse.criticalIncidents > 0 ? "danger" : "success",
    },
    {
      id: "driver.overdue_wo",
      label: "Overdue work orders",
      value: pulse.overdueWorkOrders,
      tone: pulse.overdueWorkOrders > 0 ? "warning" : "success",
    },
    {
      id: "driver.overdue_mnt",
      label: "Overdue maintenance",
      value: pulse.overdueMaintenance,
      tone: pulse.overdueMaintenance > 0 ? "warning" : "success",
    },
    {
      id: "driver.poor_assets",
      label: "Assets in poor condition",
      value: pulse.assetsInPoorCondition,
      tone: pulse.assetsInPoorCondition > 0 ? "warning" : "neutral",
    },
  ];
  return drivers;
}

/**
 * Only surfaces signals with a real same-day window.
 * Period-over-period comparison is not available — do not invent deltas.
 */
function buildChanges(pulse: DashboardPulse | undefined): OverviewChangeRow[] {
  if (!pulse) return [];
  const rows: OverviewChangeRow[] = [];

  if (pulse.workOrdersCreatedToday > 0) {
    rows.push({
      id: "change.wo_created",
      title: "Work orders created",
      context: "Opened today",
      deltaLabel: `+${pulse.workOrdersCreatedToday}`,
      tone: "info",
      href: resolveModulePath("work-orders"),
    });
  }

  if (pulse.workOrdersDueToday > 0) {
    rows.push({
      id: "change.wo_due",
      title: "Work orders due today",
      context: "Due in the current day window",
      deltaLabel: String(pulse.workOrdersDueToday),
      tone: "warning",
      href: resolveModulePath("work-orders"),
    });
  }

  return rows;
}

function buildMotion(pulse: DashboardPulse | undefined): OverviewMotionRow[] {
  if (!pulse) return [];
  const rows: OverviewMotionRow[] = [];

  if (pulse.maintenanceBacklog > 0) {
    rows.push({
      id: "motion.maintenance",
      title: "Maintenance in progress",
      count: pulse.maintenanceBacklog,
      href: resolveModulePath("maintenance"),
    });
  }

  if (pulse.openWorkOrders > 0) {
    rows.push({
      id: "motion.work_orders",
      title: "Work orders in progress",
      count: pulse.openWorkOrders,
      href: resolveModulePath("work-orders"),
    });
  }

  const onHold = pulse.maintenanceOnHold + pulse.workOrdersOnHold;
  if (onHold > 0) {
    rows.push({
      id: "motion.on_hold",
      title: "Awaiting progress (on hold)",
      count: onHold,
      href: resolveModulePath("work-orders"),
    });
  }

  if (pulse.criticalIncidentsUnassigned > 0) {
    rows.push({
      id: "motion.unassigned",
      title: "Awaiting assignment",
      count: pulse.criticalIncidentsUnassigned,
      href: resolveModulePath("incidents"),
    });
  }

  return rows;
}

/**
 * Pure presentation mapping from DashboardSnapshot → overview IA.
 * Does not fetch or recalculate KPIs.
 */
export function buildDashboardOverview(
  snapshot: DashboardSnapshot
): DashboardOverviewViewModel {
  const band = snapshot.health?.band ?? "watch";
  const score = snapshot.health?.score ?? 0;
  const pulse = snapshot.pulse;
  const healthStrip = sectionCards(snapshot, "health_strip");
  const needsAttention = sectionCards(snapshot, "needs_attention");
  const quickActions = sectionCards(snapshot, "quick_actions");

  const metrics: OverviewMetric[] = healthStrip
    .filter((card) => card.kind === "kpi_stat")
    .map((card) => ({
      id: card.id,
      title: card.title,
      value: card.primaryValue ?? "—",
      context: card.secondaryLabel ?? "No additional context",
      tone: card.tone,
      href: card.module ? resolveModulePath(card.module) : undefined,
      module: card.module,
    }));

  return {
    title: snapshot.context.title ?? "Dashboard",
    subtitle: "Your operational overview at a glance.",
    asOf: snapshot.asOf,
    health: {
      score,
      band,
      bandLabel: bandLabel(band),
      summary: healthSummary(band, snapshot.health?.summary),
      detailHref: resolveModulePath("incidents"),
    },
    drivers: buildDrivers(pulse),
    attention: buildAttention(pulse, needsAttention),
    attentionHref: resolveModulePath("incidents"),
    metrics,
    changes: buildChanges(pulse),
    motion: buildMotion(pulse),
    showQuickActions: false,
    quickActionCards: quickActions,
  };
}
