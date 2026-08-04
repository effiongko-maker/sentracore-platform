import { registerDashboardWidget } from "../registry";

export function registerListWidgets() {
  registerDashboardWidget({
    id: "list.critical_incidents",
    sectionId: "needs_attention",
    kind: "entity_list",
    title: "Critical incidents",
    module: "incidents",
    order: 10,
    resolve: (report) => ({
      id: "card.list.critical_incidents",
      widgetId: "list.critical_incidents",
      kind: "entity_list",
      tone: report.projections.criticalIncidents.length ? "danger" : "success",
      title: "Critical incidents",
      description: "Open critical severity events",
      module: "incidents",
      emptyMessage: "No critical incidents open.",
      items: report.projections.criticalIncidents,
    }),
  });

  registerDashboardWidget({
    id: "list.overdue_work_orders",
    sectionId: "needs_attention",
    kind: "attention_queue",
    title: "Overdue work orders",
    module: "work-orders",
    order: 20,
    resolve: (report) => ({
      id: "card.list.overdue_work_orders",
      widgetId: "list.overdue_work_orders",
      kind: "attention_queue",
      tone: report.projections.overdueWorkOrders.length ? "warning" : "success",
      title: "Overdue work orders",
      description: "Open work past due date",
      module: "work-orders",
      emptyMessage: "No overdue work orders.",
      items: report.projections.overdueWorkOrders,
    }),
  });

  registerDashboardWidget({
    id: "list.upcoming_maintenance",
    sectionId: "needs_attention",
    kind: "entity_list",
    title: "Maintenance backlog",
    module: "maintenance",
    order: 30,
    resolve: (report) => ({
      id: "card.list.upcoming_maintenance",
      widgetId: "list.upcoming_maintenance",
      kind: "entity_list",
      tone: report.kpis.overdueMaintenance > 0 ? "warning" : "info",
      title: "Maintenance backlog",
      description: "Open maintenance requests",
      module: "maintenance",
      emptyMessage: "Maintenance backlog is clear.",
      items: report.projections.upcomingMaintenance,
    }),
  });

  registerDashboardWidget({
    id: "list.in_progress_work_orders",
    sectionId: "work_in_motion",
    kind: "entity_list",
    title: "Work orders in progress",
    module: "work-orders",
    order: 10,
    resolve: (report) => ({
      id: "card.list.in_progress_work_orders",
      widgetId: "list.in_progress_work_orders",
      kind: "entity_list",
      tone: "info",
      title: "Work orders in progress",
      description: "Currently executing jobs",
      module: "work-orders",
      emptyMessage: "No work orders in progress.",
      items: report.projections.inProgressWorkOrders,
    }),
  });

  registerDashboardWidget({
    id: "list.in_progress_maintenance",
    sectionId: "work_in_motion",
    kind: "entity_list",
    title: "Maintenance in progress",
    module: "maintenance",
    order: 20,
    resolve: (report) => ({
      id: "card.list.in_progress_maintenance",
      widgetId: "list.in_progress_maintenance",
      kind: "entity_list",
      tone: "info",
      title: "Maintenance in progress",
      description: "Active maintenance requests",
      module: "maintenance",
      emptyMessage: "No maintenance in progress.",
      items: report.projections.inProgressMaintenance,
    }),
  });
}
