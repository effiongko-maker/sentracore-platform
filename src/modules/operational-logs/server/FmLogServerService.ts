import "server-only";
import { ActionError } from "@/lib/actions/errors";
import type { PaginatedResult } from "@/types";
import { resolveFmWorkOrganisation } from "@/modules/maintenance/server/FmWorkServerService";
import type { PlatformSession } from "@/lib/auth/types";
import { FM_LOG_SPECS, paginateRows, parseLogIdPayload, parseLogListParams, type FmLogResource } from "./fmLogDomain";
import { FmLogRepository } from "./FmLogRepository";

export function resolveFmLogOrganisation(session: PlatformSession) {
  return resolveFmWorkOrganisation(session);
}

/**
 * One service class over seven DISTINCT domain specs. Capability gating
 * (ops.view / ops.create / ops.edit) is enforced by the route.
 */
export class FmLogServerService {
  constructor(private readonly ctx: { organisationId: string; profileId: string }) {}

  async dispatch(resource: FmLogResource, action: string, payload: unknown): Promise<unknown> {
    const spec = FM_LOG_SPECS[resource];
    const repo = new FmLogRepository(spec, this.ctx.organisationId);
    switch (action) {
      case "getAll": {
        const params = parseLogListParams(spec, payload);
        const { rows, total } = await repo.list(params);
        return paginateRows(rows, total, params.page, params.pageSize) satisfies PaginatedResult<Record<string, unknown>>;
      }
      case "getById":
        return repo.getById(parseLogIdPayload(payload, spec.label));
      case "create":
        return repo.create(spec.parseCreate(payload), this.ctx.profileId);
      case "update": {
        const parsed = spec.parseUpdate(payload);
        return repo.update(parsed.id, parsed, this.ctx.profileId);
      }
      default:
        throw new ActionError("VALIDATION_ERROR", `Unknown ${resource} action: ${action}`);
    }
  }
}
