import "server-only";
import { ActionError } from "@/lib/actions/errors";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import type { ProtectedActionId } from "@/lib/access/protectedActions";
import type { PlatformSession } from "@/lib/auth/types";
import { assertCostSubmissionTransition } from "@/lib/operational/finance/costSubmission";
import type { CostSubmissionLifecycleStatus } from "@/lib/operational/finance/types";
import { resolveFmWorkOrganisation } from "@/modules/maintenance/server/FmWorkServerService";
import {
  FmCostNotFoundError,
  FmCostProtectedRequiredError,
  FmCostValidationError,
  assertSubmissionShape,
  mapFmAuthorizationRow,
  mapFmCostRecordRow,
  mapFmCostSubmissionRow,
  mapFmPaymentRow,
  paginateRows,
  parseAuthorizationIdPayload,
  parseCostIdPayload,
  parseCostRecordListParams,
  parseCreateAuthorizationInput,
  parseCreateCostRecordInput,
  parseCreatePaymentInput,
  parseCreateSubmissionInput,
  parsePaymentIdPayload,
  parseSubmissionIdPayload,
  parseSubmissionListParams,
  parseSubmissionScopedListParams,
  parseUpdateAuthorizationInput,
  parseUpdateCostRecordInput,
  parseUpdatePaymentInput,
  parseUpdateSubmissionInput,
  type FmCostRecordRow,
  type FmCostSubmissionRow,
} from "./fmCostDomain";
import { FmCostRepository } from "./FmCostRepository";

export type FmCostAccessContext = {
  organisationId: string;
  profileId: string;
  session?: PlatformSession;
  access?: OperatingAccess;
};

export type FmCostResource = "cost-records" | "cost-submissions" | "reimbursement-authorizations" | "reimbursement-payments";

export function resolveFmCostOrganisation(session: PlatformSession) {
  return resolveFmWorkOrganisation(session);
}

/**
 * Protected actions this request has ALREADY been authorised for by the route
 * (step-up / System Administrator override). The service never verifies a
 * password itself; it only refuses protected mutations that lack the grant.
 */
export type FmCostWriteOptions = { authorizedProtectedAction?: ProtectedActionId | null };

function requireProtected(options: FmCostWriteOptions | undefined, actionId: ProtectedActionId, message: string): void {
  if (options?.authorizedProtectedAction === actionId) return;
  throw new FmCostProtectedRequiredError(actionId as FmCostProtectedRequiredError["actionId"], message);
}

/**
 * FM operational Costs (Supabase is the single source of truth).
 * Not Platform Finance: no ledger, payable, treasury or posting effects.
 * Approval never implies reimbursement authorization; the authorization is a
 * separate, explicitly-authored record with its own actor.
 */
export class FmCostServerService {
  constructor(private readonly ctx: FmCostAccessContext) {}

  private repo() {
    return new FmCostRepository(this.ctx.organisationId);
  }

  // ------------------------------------------------------------ Cost Records

  private async hydrateCosts(rows: FmCostRecordRow[]) {
    const relations = await this.repo().costRelations(rows);
    return rows.map((row) => mapFmCostRecordRow(row, relations.get(row.id)));
  }

  async listCosts(payload: unknown) {
    const params = parseCostRecordListParams(payload);
    const { rows, total } = await this.repo().listCosts(params);
    return paginateRows(await this.hydrateCosts(rows), total, params.page, params.pageSize);
  }

  async getCost(idOrCode: string) {
    const row = await this.repo().getCost(idOrCode);
    if (!row) throw new FmCostNotFoundError(`Cost record ${idOrCode} not found.`);
    return (await this.hydrateCosts([row]))[0];
  }

  async createCost(payload: unknown) {
    const row = await this.repo().createCost(parseCreateCostRecordInput(payload), this.ctx.profileId);
    return (await this.hydrateCosts([row]))[0];
  }

  async updateCost(payload: unknown, options?: FmCostWriteOptions) {
    const input = parseUpdateCostRecordInput(payload);
    const repo = this.repo();
    const existing = await repo.getCost(input.id);
    if (!existing) throw new FmCostNotFoundError(`Cost record ${input.id} not found.`);
    const lockedBy = await repo.lockingSubmissionCode(existing.id);
    if (lockedBy) {
      requireProtected(
        options,
        "finance.cost.unlock_edit",
        `Cost record ${existing.code} is locked by claim ${lockedBy}. Editing it requires Facility Manager authorization or System Administrator override.`
      );
    }
    const row = await repo.updateCost(input, this.ctx.profileId);
    return (await this.hydrateCosts([row]))[0];
  }

  // ----------------------------------------------------------- Submissions

  private async hydrateSubmissions(rows: FmCostSubmissionRow[]) {
    const relations = await this.repo().submissionRelations(rows);
    return rows.map((row) => mapFmCostSubmissionRow(row, relations.get(row.id)));
  }

  async listSubmissions(payload: unknown) {
    const params = parseSubmissionListParams(payload);
    const { rows, total } = await this.repo().listSubmissions(params);
    return paginateRows(await this.hydrateSubmissions(rows), total, params.page, params.pageSize);
  }

  async getSubmission(idOrCode: string) {
    const row = await this.repo().getSubmission(idOrCode);
    if (!row) throw new FmCostNotFoundError(`Cost submission ${idOrCode} not found.`);
    return (await this.hydrateSubmissions([row]))[0];
  }

  async createSubmission(payload: unknown) {
    const input = parseCreateSubmissionInput(payload);
    assertSubmissionShape({ status: input.status, costCount: input.costRefs.length });
    const row = await this.repo().createSubmission(input, this.ctx.profileId);
    return (await this.hydrateSubmissions([row]))[0];
  }

  async updateSubmission(payload: unknown, options?: FmCostWriteOptions) {
    const input = parseUpdateSubmissionInput(payload);
    const repo = this.repo();
    const existing = await repo.getSubmission(input.id);
    if (!existing) throw new FmCostNotFoundError(`Cost submission ${input.id} not found.`);
    const from = existing.status as CostSubmissionLifecycleStatus;
    const to = input.status ?? from;
    if (to !== from) {
      try {
        assertCostSubmissionTransition(from, to);
      } catch (error) {
        throw new FmCostValidationError(error instanceof Error ? error.message : "Invalid lifecycle transition");
      }
    }
    if (from === "submitted" && to === from) {
      requireProtected(
        options,
        "finance.claim.edit_submitted",
        "Editing a submitted claim requires Facility Manager authorization or System Administrator override."
      );
    }
    const costCount = input.costRefs ? input.costRefs.length : await repo.submissionCostCount(existing.id);
    assertSubmissionShape({ status: to, costCount });
    const row = await repo.updateSubmission(input, existing, this.ctx.profileId);
    return (await this.hydrateSubmissions([row]))[0];
  }

  // -------------------------------------------------------- Authorizations

  async listAuthorizations(payload: unknown) {
    const params = parseSubmissionScopedListParams(payload);
    const { rows, total } = await this.repo().listAuthorizations(params);
    return paginateRows(rows.map((r) => mapFmAuthorizationRow(r.row, r.submissionCode)), total, params.page, params.pageSize);
  }

  async getAuthorization(idOrCode: string) {
    const found = await this.repo().getAuthorization(idOrCode);
    if (!found) throw new FmCostNotFoundError(`Authorization not found: ${idOrCode}`);
    return mapFmAuthorizationRow(found.row, found.submissionCode);
  }

  /** Zero authorizations is data (null), not a failure. */
  async getAuthorizationForSubmission(submissionRef: string) {
    const found = await this.repo().getAuthorizationForSubmission(submissionRef);
    return found ? mapFmAuthorizationRow(found.row, found.submissionCode) : null;
  }

  async createAuthorization(payload: unknown) {
    const input = parseCreateAuthorizationInput(payload);
    const created = await this.repo().createAuthorization(input, this.ctx.profileId);
    return mapFmAuthorizationRow(created.row, created.submissionCode);
  }

  async updateAuthorization(payload: unknown, options?: FmCostWriteOptions) {
    const input = parseUpdateAuthorizationInput(payload);
    requireProtected(
      options,
      "finance.authorization.revise",
      "Revising a reimbursement authorization requires Facility Manager authorization or System Administrator override."
    );
    const updated = await this.repo().updateAuthorization(input.id, input, this.ctx.profileId);
    return mapFmAuthorizationRow(updated.row, updated.submissionCode);
  }

  // -------------------------------------------------------------- Payments

  async listPayments(payload: unknown) {
    const params = parseSubmissionScopedListParams(payload);
    const { rows, total } = await this.repo().listPayments(params);
    return paginateRows(rows.map((r) => mapFmPaymentRow(r.row, r.submissionCode)), total, params.page, params.pageSize);
  }

  async getPayment(idOrCode: string) {
    const found = await this.repo().getPayment(idOrCode);
    if (!found) throw new FmCostNotFoundError(`Payment not found: ${idOrCode}`);
    return mapFmPaymentRow(found.row, found.submissionCode);
  }

  async createPayment(payload: unknown) {
    const created = await this.repo().createPayment(parseCreatePaymentInput(payload), this.ctx.profileId);
    return mapFmPaymentRow(created.row, created.submissionCode);
  }

  async updatePayment(payload: unknown, options?: FmCostWriteOptions) {
    const input = parseUpdatePaymentInput(payload);
    requireProtected(
      options,
      "finance.payment.correct",
      "Correcting a reimbursement payment requires Facility Manager authorization or System Administrator override."
    );
    const updated = await this.repo().updatePayment(input, this.ctx.profileId);
    return mapFmPaymentRow(updated.row, updated.submissionCode);
  }

  // -------------------------------------------------------------- dispatch

  async dispatch(resource: FmCostResource, action: string, payload: unknown, options?: FmCostWriteOptions): Promise<unknown> {
    const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    switch (resource) {
      case "cost-records":
        if (action === "getAll") return this.listCosts(payload);
        if (action === "getById") return this.getCost(parseCostIdPayload(payload));
        if (action === "create") return this.createCost(payload);
        if (action === "update") return this.updateCost(payload, options);
        break;
      case "cost-submissions":
        if (action === "getAll") return this.listSubmissions(payload);
        if (action === "getById") return this.getSubmission(parseSubmissionIdPayload(payload));
        if (action === "create") return this.createSubmission(payload);
        if (action === "update") return this.updateSubmission(payload, options);
        break;
      case "reimbursement-authorizations":
        if (action === "getAll") return this.listAuthorizations(payload);
        if (action === "getById") return this.getAuthorization(parseAuthorizationIdPayload(payload));
        if (action === "getBySubmissionId") {
          const ref = String(raw.submissionId ?? "").trim();
          if (!ref) throw new FmCostValidationError("Submission id is required.");
          return this.getAuthorizationForSubmission(ref);
        }
        if (action === "create") return this.createAuthorization(payload);
        if (action === "update") return this.updateAuthorization(payload, options);
        break;
      case "reimbursement-payments":
        if (action === "getAll") return this.listPayments(payload);
        if (action === "getById") return this.getPayment(parsePaymentIdPayload(payload));
        if (action === "create") return this.createPayment(payload);
        if (action === "update") return this.updatePayment(payload, options);
        break;
    }
    throw new ActionError("VALIDATION_ERROR", `Unknown ${resource} action: ${action}`);
  }
}
