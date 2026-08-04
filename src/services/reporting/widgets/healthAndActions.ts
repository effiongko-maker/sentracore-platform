import { registerDashboardWidget } from "../registry";

export function registerHealthAndActionWidgets() {
  registerDashboardWidget({
    id: "health.summary",
    sectionId: "context",
    kind: "health_summary",
    title: "Operational health",
    order: 10,
    resolve: (report) => ({
      id: "card.health.summary",
      widgetId: "health.summary",
      kind: "health_summary",
      tone:
        report.health.band === "healthy"
          ? "success"
          : report.health.band === "watch"
            ? "warning"
            : "danger",
      title: "Operational health",
      description: report.health.summary,
      primaryValue: report.health.score,
      secondaryLabel: report.health.band,
    }),
  });

  registerDashboardWidget({
    id: "kpi.estate_facilities",
    sectionId: "estate_baseline",
    kind: "kpi_stat",
    title: "Facilities",
    module: "facilities",
    order: 10,
    resolve: (report) => ({
      id: "card.estate.facilities",
      widgetId: "kpi.estate_facilities",
      kind: "kpi_stat",
      tone: "info",
      title: "Facilities",
      primaryValue: report.kpis.activeFacilities,
      secondaryLabel: "Active sites in scope",
      module: "facilities",
    }),
  });

  registerDashboardWidget({
    id: "kpi.estate_assets",
    sectionId: "estate_baseline",
    kind: "kpi_stat",
    title: "Assets",
    module: "assets",
    order: 20,
    resolve: (report) => ({
      id: "card.estate.assets",
      widgetId: "kpi.estate_assets",
      kind: "kpi_stat",
      tone: "success",
      title: "Assets",
      primaryValue: report.kpis.activeAssets,
      secondaryLabel: "Active assets in scope",
      module: "assets",
    }),
  });

  registerDashboardWidget({
    id: "kpi.estate_workforce",
    sectionId: "estate_baseline",
    kind: "kpi_stat",
    title: "Workforce",
    module: "users",
    order: 30,
    resolve: (report) => ({
      id: "card.estate.workforce",
      widgetId: "kpi.estate_workforce",
      kind: "kpi_stat",
      tone: "neutral",
      title: "Workforce",
      primaryValue: report.kpis.activeWorkforce,
      secondaryLabel: "Active users",
      module: "users",
    }),
  });

  const actions: Array<{ id: string; title: string; description: string; order: number }> =
    [
      {
        id: "create-work-order",
        title: "Work orders",
        description: "Review and manage jobs",
        order: 10,
      },
      {
        id: "report-incident",
        title: "Incidents",
        description: "Capture operational events",
        order: 20,
      },
      {
        id: "schedule-maintenance",
        title: "Maintenance",
        description: "Open maintenance requests",
        order: 30,
      },
      {
        id: "view-facilities",
        title: "Facilities",
        description: "Browse sites",
        order: 40,
      },
    ];

  for (const action of actions) {
    registerDashboardWidget({
      id: `action.${action.id}`,
      sectionId: "quick_actions",
      kind: "quick_action",
      title: action.title,
      order: action.order,
      resolve: () => ({
        id: `card.action.${action.id}`,
        widgetId: `action.${action.id}`,
        kind: "quick_action",
        tone: "neutral",
        title: action.title,
        description: action.description,
        actionId: action.id,
      }),
    });
  }
}
