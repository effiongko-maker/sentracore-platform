import { registerHealthAndActionWidgets } from "./healthAndActions";
import { registerKpiWidgets } from "./kpiWidgets";
import { registerListWidgets } from "./listWidgets";

let registered = false;

/** Idempotent bootstrap of built-in dashboard widgets. */
export function registerDefaultDashboardWidgets(): void {
  if (registered) return;
  registered = true;
  registerKpiWidgets();
  registerListWidgets();
  registerHealthAndActionWidgets();
}
