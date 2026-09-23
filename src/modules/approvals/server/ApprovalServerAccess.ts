import "server-only";
import type { Approval } from "@/modules/approvals/types";
import { onApprovalMutation } from "@/services/cache/domainCache";
import { getFmApprovalServerService } from "./getFmApprovalServerService";
import type { ApprovalWriteOptions } from "./FmApprovalServerService";

/**
 * Server-only Approval persistence for server actions.
 * Supabase (fm_approvals) is the single source of truth — never Apps Script.
 * Browser code uses `@/services/approvals/ApprovalService` (→ /api/approvals).
 */
export const ApprovalServerAccess = {
  async getApproval(idOrCode: string): Promise<Approval | null> {
    return (await getFmApprovalServerService()).findById(idOrCode);
  },

  async getApprovalForWorkInstruction(ref: string): Promise<Approval | null> {
    return (await getFmApprovalServerService()).findByWorkInstruction(ref);
  },

  async getApprovalForWork(ref: string): Promise<Approval | null> {
    return (await getFmApprovalServerService()).findByWork(ref);
  },

  async createApproval(input: unknown, options?: ApprovalWriteOptions): Promise<Approval> {
    const created = await (await getFmApprovalServerService()).create(input, options);
    onApprovalMutation();
    return created;
  },

  async updateApproval(
    idOrCode: string,
    input: Record<string, unknown>,
    options?: ApprovalWriteOptions
  ): Promise<Approval> {
    const updated = await (await getFmApprovalServerService()).update({ ...input, id: idOrCode }, options);
    onApprovalMutation();
    return updated;
  },
};
