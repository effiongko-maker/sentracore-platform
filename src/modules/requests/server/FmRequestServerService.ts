import "server-only";
import { ActionError } from "@/lib/actions/errors";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { PlatformSession } from "@/lib/auth/types";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { recordSystemOperationalEvent } from "@/lib/events/recordOperationalEvent";
import { createAdminClient } from "@/utils/supabase/admin";
import type { PaginatedResult } from "@/types";
import type { RequestListParams, RequestRecord } from "@/modules/requests/types";
import { resolveFmWorkOrganisation } from "@/modules/maintenance/server/FmWorkServerService";
import {
  FM_REQUEST_MODULE_SLUG,
  FmRequestNotFoundError,
  mapFmRequestRowToRecord,
  paginateRequestRows,
  parseCreateRequestInput,
  parseRequestIdPayload,
  parseRequestListParams,
  parseRequestStatus,
  parseUpdateRequestInput,
  type FmRequestRow,
} from "./fmRequestDomain";
import { FmRequestRepository } from "./FmRequestRepository";

export type FmRequestAccessContext = {
  organisationId: string;
  /**
   * Acting platform profile. Null ONLY for anonymous occupant-portal intake,
   * which may create and read by reference but never update or transition.
   */
  profileId: string | null;
  session?: PlatformSession;
  access?: OperatingAccess;
};

export function resolveFmRequestOrganisation(session: PlatformSession): {
  organisationId: string;
  profileId: string;
} {
  return resolveFmWorkOrganisation(session);
}

async function resolveFmModuleId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("modules")
    .select("id")
    .eq("slug", FM_REQUEST_MODULE_SLUG)
    .maybeSingle();
  if (error || !data) return null;
  return String((data as { id: string }).id);
}

export class FmRequestServerService {
  constructor(private readonly ctx: FmRequestAccessContext) {}

  private repo() {
    return new FmRequestRepository(this.ctx.organisationId);
  }

  private requireActor(): string {
    if (!this.ctx.profileId) throw new ActionError("UNAUTHENTICATED");
    return this.ctx.profileId;
  }

  private async hydrate(rows: FmRequestRow[]): Promise<RequestRecord[]> {
    const links = await this.repo().linksFor(rows.map((row) => row.id));
    return rows.map((row) => mapFmRequestRowToRecord(row, links.get(row.id)));
  }

  async list(params: RequestListParams = {}): Promise<PaginatedResult<RequestRecord>> {
    const parsed = parseRequestListParams(params);
    const { rows, total } = await this.repo().listPage(parsed);
    return paginateRequestRows(
      await this.hydrate(rows),
      total,
      parsed.page ?? 1,
      parsed.pageSize ?? 8
    );
  }

  async getById(idOrCode: string): Promise<RequestRecord> {
    const row = await this.repo().getByIdOrCode(idOrCode);
    if (!row) throw new FmRequestNotFoundError(`Request ${idOrCode} not found.`);
    return (await this.hydrate([row]))[0]!;
  }

  /** Null when absent — for callers where "not found" is a normal outcome. */
  async findById(idOrCode: string): Promise<RequestRecord | null> {
    const row = await this.repo().getByIdOrCode(idOrCode);
    return row ? (await this.hydrate([row]))[0]! : null;
  }

  async create(payload: unknown): Promise<RequestRecord> {
    const input = parseCreateRequestInput(payload);
    const row = await this.repo().create(input, this.ctx.profileId);
    await this.recordEvent(OperationalEventTypes.FACILITY_REQUEST_CREATED, row, {
      intake: this.ctx.profileId ? "staff" : "occupant_portal",
      requestType: row.request_type,
    });
    return mapFmRequestRowToRecord(row);
  }

  async update(payload: unknown): Promise<RequestRecord> {
    const input = parseUpdateRequestInput(payload);
    const row = await this.repo().update(input, this.requireActor());
    await this.recordEvent(OperationalEventTypes.FACILITY_REQUEST_UPDATED, row, {});
    return (await this.hydrate([row]))[0]!;
  }

  /**
   * Lifecycle transition (server orchestration only — never the public
   * `update` payload). Returns the previous status for event payloads.
   */
  async transitionStatus(
    idOrCode: string,
    nextStatus: string
  ): Promise<{ request: RequestRecord; previousStatus: string }> {
    const status = parseRequestStatus(nextStatus);
    const { row, previousStatus } = await this.repo().setStatus(
      idOrCode,
      status,
      this.requireActor()
    );
    return { request: (await this.hydrate([row]))[0]!, previousStatus };
  }

  async deactivate(payload: unknown): Promise<RequestRecord> {
    const id = parseRequestIdPayload(payload);
    return (await this.transitionStatus(id, "cancelled")).request;
  }

  /** Facility display code for a Request — legacy domains still key on it. */
  async facilityCode(request: RequestRecord): Promise<string | null> {
    return this.repo().facilityCodeById(request.facilityId);
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(parseRequestListParams(payload));
      case "getById":
        return this.getById(parseRequestIdPayload(payload));
      case "create":
        return this.create(payload);
      case "update":
        return this.update(payload);
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError(
          "VALIDATION_ERROR",
          `Unknown requests action: ${action}`
        );
    }
  }

  /**
   * Best-effort audit through the existing operational_events pattern.
   * entity_id is the Request UUID; the display reference travels in data.
   * Failure never fails the domain write.
   */
  private async recordEvent(
    eventType: string,
    row: FmRequestRow,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const moduleId = await resolveFmModuleId();
      if (!moduleId) return;
      await recordSystemOperationalEvent({
        organisationId: this.ctx.organisationId,
        moduleId,
        eventType,
        entityType: "request",
        entityId: row.id,
        actorProfileId: this.ctx.profileId,
        source: this.ctx.profileId ? "user" : "system",
        data: { requestId: row.code, facilityId: row.facility_id, ...data },
      });
    } catch (error) {
      console.error("[FmRequestServerService] event failed", {
        eventType,
        requestId: row.code,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
