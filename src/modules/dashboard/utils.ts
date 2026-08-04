import {
  DASHBOARD_ACTION_ROUTES,
  DASHBOARD_MODULE_ROUTES,
} from "./constants";
import type { DashboardModuleRef } from "./types";

export function resolveModulePath(
  module: DashboardModuleRef,
  entityId?: string
) {
  const base = DASHBOARD_MODULE_ROUTES[module] ?? "/";
  return entityId ? base : base;
}

export function resolveActionPath(actionId: string) {
  return DASHBOARD_ACTION_ROUTES[actionId] ?? "/";
}

export function healthTone(
  band: "healthy" | "watch" | "critical"
): "success" | "warning" | "danger" {
  if (band === "healthy") return "success";
  if (band === "watch") return "warning";
  return "danger";
}
