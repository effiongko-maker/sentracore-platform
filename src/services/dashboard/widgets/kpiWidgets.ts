import type { DashboardWidgetDefinition } from "@/modules/dashboard/types";
import { kpiInsightLabels } from "@/services/reporting";
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
      title: "Active Facilities",
      module: "facilities",
      order: 10,
      resolve: (report) => {
        const insights = kpiInsightLabels(report.kpis);
        return {
          id: "card.kpi.active_facilities",
          widgetId: "kpi.active_facilities",
          kind: "kpi_stat",
          tone: report.kpis.inactiveFacilities > 0 ? "warning" : "info",
          title: "Active Facilities",
          primaryValue: report.kpis.activeFacilities,
          secondaryLabel: insights.activeFacilities,
          module: "facilities",
          trend: "neutral",
        };
      },
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.active_assets",
      title: "Active Assets",
      module: "assets",
      order: 20,
      resolve: (report) => {
        const insights = kpiInsightLabels(report.kpis);
        return {
          id: "card.kpi.active_assets",
          widgetId: "kpi.active_assets",
          kind: "kpi_stat",
          tone:
            report.kpis.assetsInPoorCondition > 0 ||
            (report.kpis.assetsOperationalPercent != null &&
              report.kpis.assetsOperationalPercent < 95)
              ? "warning"
              : "success",
          title: "Active Assets",
          primaryValue: report.kpis.activeAssets,
          secondaryLabel: insights.activeAssets,
          module: "assets",
          trend: "neutral",
        };
      },
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.active_workforce",
      title: "Active Workforce",
      module: "users",
      order: 30,
      resolve: (report) => {
        const insights = kpiInsightLabels(report.kpis);
        return {
          id: "card.kpi.active_workforce",
          widgetId: "kpi.active_workforce",
          kind: "kpi_stat",
          tone: "neutral",
          title: "Active Workforce",
          primaryValue: report.kpis.activeWorkforce,
          secondaryLabel: insights.activeWorkforce,
          module: "users",
          trend: "neutral",
        };
      },
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.open_work_orders",
      title: "Open Work Orders",
      module: "work-orders",
      order: 40,
      resolve: (report) => {
        const insights = kpiInsightLabels(report.kpis);
        return {
          id: "card.kpi.open_work_orders",
          widgetId: "kpi.open_work_orders",
          kind: "kpi_stat",
          tone: report.kpis.overdueWorkOrders > 0 ? "warning" : "info",
          title: "Open Work Orders",
          primaryValue: report.kpis.openWorkOrders,
          secondaryLabel: insights.openWorkOrders,
          module: "work-orders",
          trend: "neutral",
        };
      },
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.critical_incidents",
      title: "Critical Work",
      module: "work",
      order: 50,
      resolve: (report) => {
        const insights = kpiInsightLabels(report.kpis);
        return {
          id: "card.kpi.critical_incidents",
          widgetId: "kpi.critical_incidents",
          kind: "kpi_stat",
          tone: report.kpis.criticalWork > 0 ? "danger" : "success",
          title: "Critical Work",
          primaryValue: report.kpis.criticalWork,
          secondaryLabel: insights.criticalWork,
          module: "work",
          trend: "neutral",
          trendIsPositive: false,
        };
      },
    })
  );

  registerDashboardWidget(
    kpi({
      id: "kpi.maintenance_backlog",
      title: "Maintenance Backlog",
      module: "maintenance",
      order: 60,
      resolve: (report) => {
        const insights = kpiInsightLabels(report.kpis);
        return {
          id: "card.kpi.maintenance_backlog",
          widgetId: "kpi.maintenance_backlog",
          kind: "kpi_stat",
          tone: report.kpis.overdueMaintenance > 0 ? "warning" : "info",
          title: "Maintenance Backlog",
          primaryValue: report.kpis.maintenanceBacklog,
          secondaryLabel: insights.maintenanceBacklog,
          module: "maintenance",
          trend: "neutral",
        };
      },
    })
  );
}
