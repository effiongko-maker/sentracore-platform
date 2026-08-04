import type { DashboardWidgetDefinition } from "@/modules/dashboard/types";
import { registerDashboardWidget } from "../registry";

function kpi(
  def: Omit<DashboardWidgetDefinition, "kind" | "sectionId" | "resolve"> & {
    resolve: DashboardWidgetDefinition["resolve"];
  }
): DashboardWidgetDefinition {
  return {
    ...def,
    kind: "kpi_stat",
    sectionId: "health_strip",
  };
}

export function registerKpiWidgets() {
  registerDashboardWidget(
    kpi({
      id: "kpi.active_facilities",
      title: "Active facilities",
      module: "facilities",
      order: 10,
      resolve: (report) => ({
        id: "card.kpi.active_facilities",
        widgetId: "kpi.active_facilities",
        kind: "kpi_stat",
        tone: "info",
        title: "Active facilities",
        primaryValue: report.kpis.activeFacilities,
        secondaryLabel: `${report.facilities.length} total in scope`,
        module: "facilities",
        trend: "neutral",
      }),
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.open_work_orders",
      title: "Open work orders",
      module: "work-orders",
      order: 20,
      resolve: (report) => ({
        id: "card.kpi.open_work_orders",
        widgetId: "kpi.open_work_orders",
        kind: "kpi_stat",
        tone: report.kpis.overdueWorkOrders > 0 ? "warning" : "info",
        title: "Open work orders",
        primaryValue: report.kpis.openWorkOrders,
        secondaryLabel:
          report.kpis.workOrdersDueToday > 0
            ? `${report.kpis.workOrdersDueToday} due today`
            : `${report.kpis.overdueWorkOrders} overdue`,
        module: "work-orders",
        trend: "neutral",
      }),
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.critical_incidents",
      title: "Critical incidents",
      module: "incidents",
      order: 30,
      resolve: (report) => ({
        id: "card.kpi.critical_incidents",
        widgetId: "kpi.critical_incidents",
        kind: "kpi_stat",
        tone: report.kpis.criticalIncidents > 0 ? "danger" : "success",
        title: "Critical incidents",
        primaryValue: report.kpis.criticalIncidents,
        secondaryLabel:
          report.kpis.incidentsNeedingWorkOrder > 0
            ? `${report.kpis.incidentsNeedingWorkOrder} need a work order`
            : "No critical open incidents",
        module: "incidents",
        trend: "neutral",
        trendIsPositive: false,
      }),
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.active_assets",
      title: "Active assets",
      module: "assets",
      order: 40,
      resolve: (report) => ({
        id: "card.kpi.active_assets",
        widgetId: "kpi.active_assets",
        kind: "kpi_stat",
        tone: report.kpis.assetsInPoorCondition > 0 ? "warning" : "success",
        title: "Active assets",
        primaryValue: report.kpis.activeAssets,
        secondaryLabel:
          report.kpis.assetsInPoorCondition > 0
            ? `${report.kpis.assetsInPoorCondition} in poor condition`
            : "Estate assets online",
        module: "assets",
        trend: "neutral",
      }),
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.maintenance_backlog",
      title: "Maintenance backlog",
      module: "maintenance",
      order: 50,
      resolve: (report) => ({
        id: "card.kpi.maintenance_backlog",
        widgetId: "kpi.maintenance_backlog",
        kind: "kpi_stat",
        tone: report.kpis.overdueMaintenance > 0 ? "warning" : "info",
        title: "Maintenance backlog",
        primaryValue: report.kpis.maintenanceBacklog,
        secondaryLabel:
          report.kpis.overdueMaintenance > 0
            ? `${report.kpis.overdueMaintenance} overdue`
            : "Open maintenance requests",
        module: "maintenance",
        trend: "neutral",
      }),
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.active_workforce",
      title: "Active workforce",
      module: "users",
      order: 60,
      resolve: (report) => ({
        id: "card.kpi.active_workforce",
        widgetId: "kpi.active_workforce",
        kind: "kpi_stat",
        tone: "neutral",
        title: "Active workforce",
        primaryValue: report.kpis.activeWorkforce,
        secondaryLabel: `${report.users.length} users in directory`,
        module: "users",
        trend: "neutral",
      }),
    })
  );
}
