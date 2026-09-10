import { OperationalRegistersReadService } from "@/services/reporting/registers/OperationalRegistersReadService";
import { buildOperationalPicture } from "./buildOperationalPicture";
import type { OperationalPicture, OperationalPictureQuery } from "./types";

/**
 * Operational Picture facade — first consumer of the register read layer.
 * Data/composition only; no UI and no Apps Script.
 */
export const OperationalPictureService = {
  async getOperationalPicture(
    query: OperationalPictureQuery = {}
  ): Promise<OperationalPicture> {
    const bundle = await OperationalRegistersReadService.getBundle(query);
    return buildOperationalPicture(bundle);
  },
};

export type IOperationalPictureService = typeof OperationalPictureService;
