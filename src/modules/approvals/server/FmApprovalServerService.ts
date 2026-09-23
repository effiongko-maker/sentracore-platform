import "server-only";
import { repoScopeFromAccess } from "@/lib/access/facilityScope";
import { ActionError } from "@/lib/actions/errors";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { PlatformSession } from "@/lib/auth/types";
import type { PaginatedResult } from "@/types";
import type { Approval, ApprovalListParams } from "@/modules/approvals/types";
import { resolveFmWorkOrganisation } from "@/modules/maintenance/server/FmWorkServerService";
import {
  FmApprovalNotFoundError,
  FmApprovalValidationError,
  approvalStatusChangeBlock,
  mapFmApprovalRowToApproval,
  paginateApprovalRows,
  parseApprovalActivity,
  parseApprovalIdPayload,
  parseApprovalListParams,
  parseCreateApprovalInput,
  parseUpdateApprovalInput,
  summarizeApprovalOperationalPicture,
  type ApprovalOperationalPicture,
  type FmApprovalRow,
} from "./fmApprovalDomain";
import { FmApprovalRepository } from "./FmApprovalRepository";

export type FmApprovalAccessContext = {
  organisationId: string;
  profileId: string;
  session?: PlatformSession;
  access?: OperatingAccess;
};

export function resolveFmApprovalOrganisation(session: PlatformSession) {
  return resolveFmWorkOrganisation(session);
}

export type ApprovalWriteOptions = {
  /**
   * TRUE only for the protected approval.record_decision path. The public
   * /api/approvals proxy never sets it, so decision fields cannot be written
   * (or a terminal decision status reached) outside that action.
   */
  allowDecision?: boolean;
  /** Append-only activity recorded with the write. */
  activity?: unknown;
  /** TRUE only for approval.revise_rejected: reopen a rejected Work-level Approval (rejected → draft). */
  reopenRejected?: boolean;
};

export class FmApprovalServerService {
  constructor(private readonly ctx: FmApprovalAccessContext) {}

  private repo() {
    return new FmApprovalRepository(this.ctx.organisationId, undefined, repoScopeFromAccess(this.ctx.access));
  }

  private async hydrate(rows: FmApprovalRow[]): Promise<Approval[]> {
    const relations = await this.repo().relationsFor(rows);
    return rows.map((row) => mapFmApprovalRowToApproval(row, relations.get(row.id)));
  }

  async list(params: ApprovalListParams = {}): Promise<PaginatedResult<Approval>> {
    const parsed = parseApprovalListParams(params);
    const { rows, total } = await this.repo().listPage(parsed);
    const page: PaginatedResult<Approval> = paginateApprovalRows(
      await this.hydrate(rows),
      total,
      parsed.page ?? 1,
      parsed.pageSize ?? 8
    );
    if (parsed.includeOperationalPictureTotals) {
      // Complete register — never the page slice.
      page.operationalPictureApprovals = await this.operationalPicture();
    }
    return page;
  }

  async operationalPicture(): Promise<ApprovalOperationalPicture> {
    return summarizeApprovalOperationalPicture(await this.repo().operationalPictureStatuses());
  }

  async getById(idOrCode: string): Promise<Approval> {
    const found = await this.findById(idOrCode);
    if (!found) throw new FmApprovalNotFoundError(`Approval ${idOrCode} not found.`);
    return found;
  }

  async findById(idOrCode: string): Promise<Approval | null> {
    const row = await this.repo().getByIdOrCode(idOrCode);
    return row ? (await this.hydrate([row]))[0]! : null;
  }

  /** The Approval of a Work Instruction (UUID or code), or null. */
  async findByWorkInstruction(ref: string): Promise<Approval | null> {
    const repo = this.repo();
    const wi = await repo.resolveWorkInstruction(ref);
    const row = await repo.getByWorkInstruction(wi.id);
    return row ? (await this.hydrate([row]))[0]! : null;
  }

  /** The Work-level client Approval of a Work (UUID or code), or null. */
  async findByWork(ref: string): Promise<Approval | null> {
    const repo = this.repo();
    const work = await repo.resolveWork(ref);
    const row = await repo.getByWork(work.id);
    return row ? (await this.hydrate([row]))[0]! : null;
  }

  async create(payload: unknown, options: ApprovalWriteOptions = {}): Promise<Approval> {
    const input = parseCreateApprovalInput(payload, { allowDecision: options.allowDecision === true });
    const repo = this.repo();
    const row = await repo.create(input, this.ctx.profileId);
    if (options.activity) await this.recordActivity(row.id, options.activity);
    return (await this.hydrate([row]))[0]!;
  }

  async update(payload: unknown, options: ApprovalWriteOptions = {}): Promise<Approval> {
    const input = parseUpdateApprovalInput(payload, {
      allowDecision: options.allowDecision === true,
      clearDecision: options.reopenRejected === true,
    });
    const repo = this.repo();
    if (options.reopenRejected === true) {
      // Reopening clears the recorded decision from the row: its snapshot (the activity) is written FIRST, so the
      // prior rejection can never be lost even if the row update then fails.
      const existing = await repo.getByIdOrCode(input.id);
      if (!existing) throw new FmApprovalNotFoundError(`Approval ${input.id} not found.`);
      // Same preconditions the repository enforces — checked before any write so no stray history is recorded.
      const block = approvalStatusChangeBlock({
        from: existing.status,
        to: input.status ?? existing.status,
        reopenRejected: true,
        isWorkLevel: Boolean(existing.work_id),
      });
      if (block) throw new FmApprovalValidationError(block);
      if (options.activity) await this.recordActivity(existing.id, options.activity);
      const { row } = await repo.update(input, this.ctx.profileId, { reopenRejected: true });
      return (await this.hydrate([row]))[0]!;
    }
    const { row } = await repo.update(input, this.ctx.profileId);
    if (options.activity) await this.recordActivity(row.id, options.activity);
    return (await this.hydrate([row]))[0]!;
  }

  private async recordActivity(approvalId: string, activity: unknown): Promise<void> {
    const entry = parseApprovalActivity(activity);
    // The acting profile is the session's — never taken from the payload.
    await this.repo().addActivity(approvalId, { ...entry, actorProfileId: this.ctx.profileId });
  }

  async deactivate(payload: unknown): Promise<Approval> {
    const id = parseApprovalIdPayload(payload);
    return this.update({ id, status: "cancelled" });
  }

  async dispatch(action: string, payload: unknown): Promise<unknown> {
    switch (action) {
      case "getAll":
        return this.list(parseApprovalListParams(payload));
      case "getById":
        return this.getById(parseApprovalIdPayload(payload));
      case "create":
        return this.create(payload);
      case "update":
        return this.update(payload);
      case "deactivate":
        return this.deactivate(payload);
      default:
        throw new ActionError("VALIDATION_ERROR", `Unknown approvals action: ${action}`);
    }
  }
}
