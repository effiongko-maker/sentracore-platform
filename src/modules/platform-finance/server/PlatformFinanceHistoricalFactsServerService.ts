import { ActionError } from "@/lib/actions/errors";
import {
  type DerivedCommercialSpread,
  type PlatformFinanceHistoricalCommercialFact,
  type PlatformFinanceHistoricalCommercialFactInput,
  isValidHistoricalCommercialFactAmount,
} from "@/modules/platform-finance/domain/historicalCommercialFacts";
import { PlatformFinanceHistoricalFactsRepository } from "@/modules/platform-finance/server/PlatformFinanceHistoricalFactsRepository";
import { PLATFORM_FINANCE_CAPABILITIES } from "@/modules/platform-finance/types";
import { createAdminClient } from "@/utils/supabase/admin";

type Actor = { organisationId: string; profileId: string };

export type HistoricalFactCapabilities = {
  view: boolean;
  manage: boolean;
};

/**
 * Foundation-scope service. No update/delete methods exist: the table has no correction mechanism (see the
 * migration and table comment on platform_finance_historical_commercial_facts) — every row is immutable after
 * import. A future correction path is a deliberate, separate decision, not an oversight here.
 */
export class PlatformFinanceHistoricalFactsServerService {
  private readonly repo: PlatformFinanceHistoricalFactsRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceHistoricalFactsRepository(organisationId);
  }

  async getMyCapabilities(actor: Actor): Promise<HistoricalFactCapabilities> {
    const caps = await this.loadCaps(actor.profileId);
    return {
      view: caps.has(PLATFORM_FINANCE_CAPABILITIES.historical_view) || caps.has(PLATFORM_FINANCE_CAPABILITIES.historical_manage),
      manage: caps.has(PLATFORM_FINANCE_CAPABILITIES.historical_manage),
    };
  }

  async list(actor: Actor): Promise<PlatformFinanceHistoricalCommercialFact[]> {
    await this.assertView(actor);
    return this.repo.list();
  }

  async listWithDerivedSpread(
    actor: Actor
  ): Promise<Array<{ fact: PlatformFinanceHistoricalCommercialFact; spread: DerivedCommercialSpread | null }>> {
    await this.assertView(actor);
    return this.repo.listWithDerivedSpread();
  }

  async get(actor: Actor, id: string): Promise<PlatformFinanceHistoricalCommercialFact> {
    await this.assertView(actor);
    const fact = await this.repo.get(id);
    if (!fact) throw new ActionError("VALIDATION_ERROR", "Historical commercial fact not found.");
    return fact;
  }

  /**
   * Import-only entry point (called by a governed migration script, never by an interactive UI in this
   * foundation). Validates the independently-evidenced amount fields; does not touch fm_migration_provenance
   * itself — the caller is responsible for writing the matching provenance row using the existing pattern.
   */
  async importFact(
    actor: Actor,
    input: PlatformFinanceHistoricalCommercialFactInput
  ): Promise<PlatformFinanceHistoricalCommercialFact> {
    await this.assertManage(actor);

    const code = input.code.trim();
    const description = input.description.trim();
    if (!code) throw new ActionError("VALIDATION_ERROR", "Code is required.");
    if (!description) throw new ActionError("VALIDATION_ERROR", "Description is required.");

    for (const [label, value] of [
      ["submittedAmount", input.submittedAmount],
      ["authorisedAmount", input.authorisedAmount],
      ["amountReceived", input.amountReceived],
    ] as const) {
      if (value != null && !isValidHistoricalCommercialFactAmount(value)) {
        throw new ActionError("VALIDATION_ERROR", `${label} must be a positive amount, or omitted entirely (never zero as a substitute for unknown).`);
      }
    }

    if (input.fmWorkId) {
      await this.requireWork(input.fmWorkId);
    }
    if (input.fmWorkInstructionId) {
      await this.requireWorkInstruction(input.fmWorkInstructionId);
    }

    const existing = await this.repo.getByCode(code);
    if (existing) throw new ActionError("VALIDATION_ERROR", `Code ${code} already exists.`);

    return this.repo.create({ ...input, code, description }, actor.profileId);
  }

  private async requireWork(fmWorkId: string): Promise<void> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("fm_work")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("id", fmWorkId)
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    if (!data) throw new ActionError("VALIDATION_ERROR", "Linked FM Work not found in this organisation.");
  }

  private async requireWorkInstruction(fmWorkInstructionId: string): Promise<void> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("fm_work_instructions")
      .select("id")
      .eq("organisation_id", this.organisationId)
      .eq("id", fmWorkInstructionId)
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    if (!data) throw new ActionError("VALIDATION_ERROR", "Linked FM Work Instruction not found in this organisation.");
  }

  private async loadCaps(profileId: string): Promise<Set<string>> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId)
      .in("capability", [
        PLATFORM_FINANCE_CAPABILITIES.historical_view,
        PLATFORM_FINANCE_CAPABILITIES.historical_manage,
      ]);
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    return new Set((data ?? []).map((r) => r.capability as string));
  }

  private async assertView(actor: Actor): Promise<void> {
    const caps = await this.getMyCapabilities(actor);
    if (!caps.view) {
      throw new ActionError("FORBIDDEN", `Missing capability ${PLATFORM_FINANCE_CAPABILITIES.historical_view}.`);
    }
  }

  private async assertManage(actor: Actor): Promise<void> {
    const caps = await this.getMyCapabilities(actor);
    if (!caps.manage) {
      throw new ActionError("FORBIDDEN", `Missing capability ${PLATFORM_FINANCE_CAPABILITIES.historical_manage}.`);
    }
  }
}
