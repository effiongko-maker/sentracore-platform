import "server-only";
import { ActionError } from "@/lib/actions/errors";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { PlatformSession } from "@/lib/auth/types";
import type { PaginatedResult } from "@/types";
import type { WorkOrder, WorkOrderListParams } from "@/modules/work-orders/types";
import { resolveFmWorkOrganisation } from "@/modules/maintenance/server/FmWorkServerService";
import {
  FmWorkInstructionNotFoundError,
  mapFmWorkInstructionRowToWorkOrder,
  paginateInstructionRows,
  parseCreateInstructionInput,
  parseInstructionIdPayload,
  parseInstructionListParams,
  parseUpdateInstructionInput,
  summarizeInstructionOperationalPicture,
  type FmWorkInstructionRow,
  type WorkInstructionOperationalPicture,
} from "./fmWorkInstructionDomain";
import { FmWorkInstructionRepository } from "./FmWorkInstructionRepository";

export type FmWorkInstructionAccessContext = {
  organisationId: string;
  profileId: string;
  session?: PlatformSession;
  access?: OperatingAccess;
};

export function resolveFmWorkInstructionOrganisation(session: PlatformSession) {
  return resolveFmWorkOrganisation(session);
}

export type WorkInstructionPage = PaginatedResult<WorkOrder>;

export class FmWorkInstructionServerService {
  constructor(private readonly ctx: FmWorkInstructionAccessContext) {}

  private repo() {
    return new FmWorkInstructionRepository(this.ctx.organisationId);
  }

  private async hydrate(rows: FmWorkInstructionRow[]): Promise<WorkOrder[]> {
    const relations = await this.repo().relationsFor(rows);
    return rows.map((row) => mapFmWorkInstructionRowToWorkOrder(row, relations.get(row.id)));
  }

  async list(params: WorkOrderListParams = {}): Promise<WorkInstructionPage> {
    const parsed = parseInstructionListParams(params);
    const { rows, total } = await this.repo().listPage(parsed);
    const page: WorkInstructionPage = paginateInstructionRows(
      await this.hydrate(rows),
      total,
      parsed.page ?? 1,
      parsed.pageSize ?? 8
    );
    if (parsed.includeOperationalPictureTotals) {
      // Complete register — never the page slice.
      page.operationalPictureWorkOrders = await this.operationalPicture(
        parsed.asOf?.trim() || new Date().toISOString()
      );
    }
    return page;
  }

  async operationalPicture(asOf: string): Promise<WorkInstructionOperationalPicture> {
    return summarizeInstructionOperationalPicture(await this.repo().operationalPictureRows(), asOf);
  }

  async getById(idOrCode: string): Promise<WorkOrder> {
    const found = await this.findById(idOrCode);
    if (!found) throw new FmWorkInstructionNotFoundError(`Work Instruction ${idOrCode} not found.`);
    return found;
  }

  async findById(idOrCode: string): Promise<WorkOrder | null> {
    const row = await this.repo().getByIdOrCode(idOrCode);
    return row ? (await this.hydrate([row]))[0]! : null;
  }

  async create(payload: unknown): Promise<WorkOrder> {
    const row = await this.repo().create(parseCreateInstructionInput(payload), this.ctx.profileId);
    return (await this.hydrate([row]))[0]!;
  }

  async update(payload: unknown): Promise<{ workOrder: WorkOrder; previousStatus: string }> {
    const { row, previousStatus } = await this.repo().update(
      parseUpdateInstructionInput(payload),
      this.ctx.profileId
    );
    return { workOrder: (await this.hydrate([row]))[0]!, previousStatus };
  }

  async deactivate(payload: unknown): Promise<WorkOrder> {
    const id = parseInstructionIdPayload(payload);
    return (await this.update({ id, status: "cancelled" })).workOrder;
  }

  async countAssignedForProfile(profileId: string): Promise<number> {
    return this.repo().countAssignedForProfile(profileId);
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(parseInstructionListParams(payload));
      case "getById":
        return this.getById(parseInstructionIdPayload(payload));
      case "create":
        return this.create(payload);
      case "update":
        return (await this.update(payload)).workOrder;
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError("VALIDATION_ERROR", `Unknown work-orders action: ${action}`);
    }
  }
}
