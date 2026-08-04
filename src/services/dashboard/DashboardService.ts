import { DASHBOARD_SECTION_META } from "@/modules/dashboard/constants";
import type {
  DashboardCard,
  DashboardQuery,
  DashboardSection,
  DashboardSectionId,
  DashboardSnapshot,
} from "@/modules/dashboard/types";
import { traceRequest } from "@/services/debug/requestTrace";
import { ReportingService } from "@/services/reporting";
import { getDashboardWidgets } from "./registry";
import { registerDefaultDashboardWidgets } from "./widgets";

/** Dedupe overlapping mounts (React Strict Mode) so one load = one reporting batch. */
let inflightOperationalHealth: Promise<DashboardSnapshot> | null = null;

function buildSections(cards: DashboardCard[]): DashboardSection[] {
  const widgets = getDashboardWidgets();
  const sectionByWidgetId = new Map(
    widgets.map((widget) => [widget.id, widget.sectionId] as const)
  );
  const orderByWidgetId = new Map(
    widgets.map((widget) => [widget.id, widget.order] as const)
  );

  const bySection = new Map<DashboardSectionId, DashboardCard[]>();

  for (const card of cards) {
    const sectionId = sectionByWidgetId.get(card.widgetId);
    if (!sectionId) continue;
    const list = bySection.get(sectionId) ?? [];
    list.push(card);
    bySection.set(sectionId, list);
  }

  const sections: DashboardSection[] = [];

  for (const id of Object.keys(DASHBOARD_SECTION_META) as DashboardSectionId[]) {
    const meta = DASHBOARD_SECTION_META[id];
    const sectionCards = (bySection.get(id) ?? []).sort(
      (a, b) =>
        (orderByWidgetId.get(a.widgetId) ?? 0) -
        (orderByWidgetId.get(b.widgetId) ?? 0)
    );
    if (!sectionCards.length) continue;
    sections.push({
      id,
      title: meta.title,
      description: meta.description,
      order: meta.order,
      cards: sectionCards,
    });
  }

  return sections.sort((a, b) => a.order - b.order);
}

/**
 * Dashboard composition service.
 * ReportingSnapshot → Widget Registry → DashboardSnapshot.
 * Calls only ReportingService. Never calls domain services.
 */
export const DashboardService = {
  async getOperationalHealth(
    params: DashboardQuery = {}
  ): Promise<DashboardSnapshot> {
    if (inflightOperationalHealth) {
      console.log(
        "[hang] DashboardService.getOperationalHealth JOIN in-flight (dedupe)"
      );
      return inflightOperationalHealth;
    }

    inflightOperationalHealth = traceRequest(
      "DashboardService.getOperationalHealth",
      async () => {
        registerDefaultDashboardWidgets();

        const report = await ReportingService.getReportingSnapshot(params);

        const cards = getDashboardWidgets()
          .map((definition) => definition.resolve(report))
          .filter((card): card is DashboardCard => card != null);

        return {
          asOf: report.asOf,
          facilityId: report.facilityId,
          context: {
            currentUserId: report.currentUserId,
            title: "Operations Command Center",
            subtitle: report.health.summary,
          },
          health: {
            band: report.health.band,
            score: report.health.score,
            summary: report.health.summary,
          },
          sections: buildSections(cards),
        };
      }
    ).finally(() => {
      inflightOperationalHealth = null;
    });

    return inflightOperationalHealth;
  },
};

export type IDashboardService = typeof DashboardService;
