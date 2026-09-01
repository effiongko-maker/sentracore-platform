import { registerDashboardWidget } from "../registry";

export function registerHealthAndActionWidgets() {
  registerDashboardWidget({
    id: "summary.operational_health",
    sectionId: "context",
    kind: "health_summary",
    title: "Operational Health",
    order: 10,
    resolve: (report) => ({
      id: "card.summary.operational_health",
      widgetId: "summary.operational_health",
      kind: "health_summary",
      tone:
        report.health.band === "healthy"
          ? "success"
          : report.health.band === "watch"
            ? "warning"
            : "danger",
      title: "Operational Health",
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
      primaryValue: report.kpis.totalFacilities,
      secondaryLabel:
        report.kpis.totalFacilities === 0
          ? "No facilities loaded"
          : `${report.kpis.activeFacilities} active`,
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
      primaryValue: report.kpis.totalAssets,
      secondaryLabel:
        report.kpis.totalAssets === 0
          ? "No assets loaded"
          : `${report.kpis.activeAssets} active`,
      module: "assets",
    }),
  });

  registerDashboardWidget({
    id: "kpi.estate_workforce",
    sectionId: "estate_baseline",
    kind: "kpi_stat",
    title: "Users",
    module: "users",
    order: 30,
    resolve: (report) => ({
      id: "card.estate.workforce",
      widgetId: "kpi.estate_workforce",
      kind: "kpi_stat",
      tone: "neutral",
      title: "Users",
      primaryValue: report.kpis.totalUsers,
      secondaryLabel:
        report.kpis.totalUsers === 0
          ? "No users loaded"
          : `${report.kpis.activeWorkforce} active`,
      module: "users",
    }),
  });

  const actions: Array<{
    id: string;
    title: string;
    description: string;
    order: number;
  }> = [
    {
      id: "log-issue",
      title: "Log Issue",
      description: "Record what needs attention",
      order: 10,
    },
    {
      id: "create-work-order",
      title: "Create Work Order",
      description: "Open a new work job",
      order: 20,
    },
    {
      id: "create-maintenance",
      title: "Create Maintenance Request",
      description: "Start a maintenance request",
      order: 30,
    },
    {
      id: "view-facilities",
      title: "View Facilities",
      description: "Browse the estate",
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
