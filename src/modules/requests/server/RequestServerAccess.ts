import "server-only";
import type { RequestRecord } from "@/modules/requests/types";
import { onRequestMutation } from "@/services/cache/domainCache";
import { FmRequestNotFoundError } from "./fmRequestDomain";
import { getFmRequestServerService } from "./getFmRequestServerService";

/**
 * Server-only Request persistence for Action Engine / orchestration.
 * Supabase (fm_requests) is the single source of truth — never Apps Script.
 *
 * Browser code must use `@/services/requests/RequestService`
 * (apiClient → /api/requests) instead.
 */
export const RequestServerAccess = {
  async getRequest(idOrCode: string): Promise<RequestRecord | null> {
    const service = await getFmRequestServerService();
    return service.findById(idOrCode);
  },

  /** Lifecycle transition. Returns the previous status for event payloads. */
  async transitionStatus(
    idOrCode: string,
    status: RequestRecord["status"]
  ): Promise<{ request: RequestRecord; previousStatus: string }> {
    const service = await getFmRequestServerService();
    const result = await service.transitionStatus(idOrCode, status);
    onRequestMutation();
    return result;
  },

  async cancelRequest(idOrCode: string): Promise<RequestRecord> {
    const service = await getFmRequestServerService();
    const cancelled = await service.deactivate({ id: idOrCode });
    onRequestMutation();
    return cancelled;
  },

  async facilityCode(request: RequestRecord): Promise<string | null> {
    const service = await getFmRequestServerService();
    return service.facilityCode(request);
  },

  isNotFound(error: unknown): boolean {
    return error instanceof FmRequestNotFoundError;
  },
};
