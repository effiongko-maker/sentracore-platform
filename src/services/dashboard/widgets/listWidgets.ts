import type { DashboardCardItem } from "@/modules/dashboard/types";
import type { ReportingListItem } from "@/services/reporting";
import { registerDashboardWidget } from "../registry";

function toCardItems(items: ReportingListItem[]): DashboardCardItem[] {
  return items.map((item) => ({
    module: item.module,
    entityId: item.entityId,
    title: item.title,
    status: item.status,
    priority: item.priority,
    facilityId: item.facilityId,
    meta: item.meta,
    reportedAt: item.reportedAt,
    tone: item.tone,
  }));
}

export function registerListWidgets() {
  registerDashboardWidget({
    id: "list.critical_incidents",
    sectionId: "needs_attention",
    kind: "entity_list",
    title: "Critical Incidents",
    module: "incidents",
    order: 10,
    resolve: (report) => ({
      id: "card.list.critical_incidents",
      widgetId: "list.critical_incidents",
      kind: "entity_list",
      tone: report.projections.criticalIncidents.length ? "danger" : "success",
      title: "Critical Incidents",
      description: "Open critical severity events",
      module: "incidents",
      emptyMessage: "No critical incidents open.",
      items: toCardItems(report.projections.criticalIncidents),
    }),
  });

  registerDashboardWidget({
    id: "list.overdue_work_orders",
    sectionId: "needs_attention",
    kind: "attention_queue",
    title: "Overdue Work Orders",
    module: "work-orders",
    order: 20,
    resolve: (report) => ({
      id: "card.list.overdue_work_orders",
      widgetId: "list.overdue_work_orders",
      kind: "attention_queue",
      tone: report.projections.overdueWorkOrders.length ? "warning" : "success",
      title: "Overdue Work Orders",
      description: "Open work past due date",
      module: "work-orders",
      emptyMessage: "No overdue work orders.",
      items: toCardItems(report.projections.overdueWorkOrders),
    }),
  });

  registerDashboardWidget({
    id: "list.maintenance_attention",
    sectionId: "needs_attention",
    kind: "entity_list",
    title: "Maintenance Requiring Attention",
    module: "maintenance",
    order: 30,
    resolve: (report) => ({
      id: "card.list.maintenance_attention",
      widgetId: "list.maintenance_attention",
      kind: "entity_list",
      tone: report.projections.maintenanceAttention.length ? "warning" : "success",
      title: "Maintenance Requiring Attention",
      description: "Overdue, on hold, or high priority requests",
      module: "maintenance",
      emptyMessage: "No maintenance requires attention.",
      items: toCardItems(report.projections.maintenanceAttention),
    }),
  });

  registerDashboardWidget({
    id: "list.blocked_items",
    sectionId: "needs_attention",
    kind: "attention_queue",
    title: "Blocked Items",
    order: 40,
    resolve: (report) => ({
      id: "card.list.blocked_items",
      widgetId: "list.blocked_items",
      kind: "attention_queue",
      tone: report.projections.blockedItems.length ? "warning" : "success",
      title: "Blocked Items",
      description: "Work orders and maintenance on hold",
      emptyMessage: "Nothing is currently blocked.",
      items: toCardItems(report.projections.blockedItems),
    }),
  });

  registerDashboardWidget({
    id: "list.latest_open_work_orders",
    sectionId: "work_in_motion",
    kind: "entity_list",
    title: "Latest Open Work Orders",
    module: "work-orders",
    order: 10,
    resolve: (report) => ({
      id: "card.list.latest_open_work_orders",
      widgetId: "list.latest_open_work_orders",
      kind: "entity_list",
      tone: "info",
      title: "Latest Open Work Orders",
      description: "Most recently reported open jobs",
      module: "work-orders",
      emptyMessage: "No open work orders.",
      items: toCardItems(report.projections.latestOpenWorkOrders),
    }),
  });

  registerDashboardWidget({
    id: "list.latest_active_maintenance",
    sectionId: "work_in_motion",
    kind: "entity_list",
    title: "Latest Active Maintenance",
    module: "maintenance",
    order: 20,
    resolve: (report) => ({
      id: "card.list.latest_active_maintenance",
      widgetId: "list.latest_active_maintenance",
      kind: "entity_list",
      tone: "info",
      title: "Latest Active Maintenance",
      description: "Most recently reported maintenance requests",
      module: "maintenance",
      emptyMessage: "No active maintenance requests.",
      items: toCardItems(report.projections.latestActiveMaintenance),
    }),
  });
}
