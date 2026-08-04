import { clearDashboardWidgets } from "../registry";
import { registerHealthAndActionWidgets } from "./healthAndActions";
import { registerKpiWidgets } from "./kpiWidgets";
import { registerListWidgets } from "./listWidgets";

/** Register built-in dashboard widgets (idempotent bootstrap). */
export function registerDefaultDashboardWidgets(): void {
  clearDashboardWidgets();
  registerKpiWidgets();
  registerListWidgets();
  registerHealthAndActionWidgets();
}
