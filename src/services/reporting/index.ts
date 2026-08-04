export { ReportingService, type IReportingService } from "./ReportingService";
export type {
  ReportingHealth,
  ReportingHealthBand,
  ReportingKpis,
  ReportingListItem,
  ReportingProjections,
  ReportingQuery,
  ReportingSnapshot,
} from "./types";
export {
  registerDashboardWidget,
  getDashboardWidgets,
  clearDashboardWidgets,
} from "./registry";
export { registerDefaultDashboardWidgets } from "./widgets";
