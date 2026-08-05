import { FacilityService } from "@/services/facilities/FacilityService";
import { ReportingService } from "@/services/reporting/ReportingService";
import { REPORT_TYPES } from "@/modules/reports/constants";
import type {
  ClientReportDocument,
  ReportsHomeSnapshot,
  ReportWizardState,
} from "@/modules/reports/types";
import { buildClientReport } from "./buildClientReport";

async function loadFacilityOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    const result = await FacilityService.listFacilities({
      page: 1,
      pageSize: 200,
      status: "all",
    });
    return result.data
      .filter((f) => f.id && f.name)
      .map((f) => ({ id: f.id, name: f.name }));
  } catch {
    return [];
  }
}

/**
 * Reports application service — client-facing document generation.
 * Report content is assembled from ReportingSnapshot only.
 */
export const ReportsService = {
  async getHome(): Promise<ReportsHomeSnapshot> {
    const facilityOptions = await loadFacilityOptions();
    return {
      asOf: new Date().toISOString(),
      reportTypes: REPORT_TYPES,
      facilityOptions,
    };
  },

  async getFacilityOptions(): Promise<Array<{ id: string; name: string }>> {
    return loadFacilityOptions();
  },

  /**
   * Load the existing ReportingSnapshot and build a client report preview model.
   * Uses a single snapshot fetch (portfolio when multi/all facilities).
   */
  async generatePreview(
    wizard: ReportWizardState
  ): Promise<ClientReportDocument> {
    if (!wizard.reportType) {
      throw new Error("Select a report type before generating.");
    }
    if (!wizard.allFacilities && wizard.facilityIds.length === 0) {
      throw new Error("Select at least one facility.");
    }
    if (wizard.sections.length === 0) {
      throw new Error("Select at least one report section.");
    }

    const facilityId =
      !wizard.allFacilities && wizard.facilityIds.length === 1
        ? wizard.facilityIds[0]
        : undefined;

    const snapshot = await ReportingService.getReportingSnapshot({
      facilityId,
    });

    return buildClientReport({ snapshot, wizard });
  },
};

export type IReportsService = typeof ReportsService;
