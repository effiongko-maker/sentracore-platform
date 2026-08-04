import type { DashboardWidgetDefinition } from "@/modules/dashboard/types";

const widgets = new Map<string, DashboardWidgetDefinition>();

export function registerDashboardWidget(
  definition: DashboardWidgetDefinition
): void {
  widgets.set(definition.id, definition);
}

export function getDashboardWidgets(): DashboardWidgetDefinition[] {
  return Array.from(widgets.values()).sort((a, b) => {
    if (a.sectionId === b.sectionId) return a.order - b.order;
    return a.order - b.order;
  });
}

export function clearDashboardWidgets(): void {
  widgets.clear();
}
