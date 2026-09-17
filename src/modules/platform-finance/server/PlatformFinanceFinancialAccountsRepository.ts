import { ActionError } from "@/lib/actions/errors";
import type {
  FinanceAccount,
  FinanceCompany,
  FinanceFinancialAccount,
  FinanceFinancialAccountView,
  PlatformFinanceCapability,
} from "@/modules/platform-finance/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { financialAccountIsVisible } from "@/modules/platform-finance/domain/financialAccounts";

type FinancialAccountRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  account_type: string;
  name: string;
  institution_name: string | null;
  account_number_last4: string | null;
  currency: string;
  control_gl_account_id: string;
  visibility_policy: string;
  status: string;
  created_by_profile_id: string;
  created_at: string;
  updated_at: string;
};

function throwDb(
  error: { message?: string } | null,
  fallback: string
): never {
  throw new ActionError("INTERNAL_ERROR", error?.message?.trim() || fallback);
}

function mapFinancialAccount(row: FinancialAccountRow): FinanceFinancialAccount {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    companyId: row.company_id,
    accountType: row.account_type as FinanceFinancialAccount["accountType"],
    name: row.name,
    institutionName: row.institution_name,
    accountNumberLast4: row.account_number_last4,
    currency: row.currency,
    controlGlAccountId: row.control_gl_account_id,
    visibilityPolicy:
      row.visibility_policy as FinanceFinancialAccount["visibilityPolicy"],
    status: row.status as FinanceFinancialAccount["status"],
    createdByProfileId: row.created_by_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PlatformFinanceFinancialAccountsRepository {
  constructor(private readonly organisationId: string) {}

  async listCapabilities(profileId: string): Promise<Set<PlatformFinanceCapability>> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId)
      .in("capability", [
        "platform_finance.financial_account.view",
        "platform_finance.financial_account.manage",
      ]);
    if (error) throwDb(error, "Unable to load Financial Account capabilities.");
    return new Set(
      (data ?? []).map((row) => row.capability as PlatformFinanceCapability)
    );
  }

  async listAccessibleCompanyIds(profileId: string): Promise<string[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_company_access")
      .select("company_id")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId);
    if (error) throwDb(error, "Unable to load Finance company access.");
    return (data ?? []).map((row) => String(row.company_id));
  }

  async listAccessibleCompanies(profileId: string): Promise<FinanceCompany[]> {
    const companyIds = await this.listAccessibleCompanyIds(profileId);
    if (companyIds.length === 0) return [];
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_companies")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("status", "active")
      .in("id", companyIds)
      .order("name");
    if (error) throwDb(error, "Unable to load accessible Finance companies.");
    return (data ?? []).map((row) => ({
      id: String(row.id),
      organisationId: String(row.organisation_id),
      code: String(row.code),
      name: String(row.name),
      status: row.status as FinanceCompany["status"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  async listControlGlAccounts(): Promise<FinanceAccount[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_accounts")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("status", "active")
      .eq("account_type", "asset")
      .eq("classification", "current_asset")
      .order("code");
    if (error) throwDb(error, "Unable to load eligible control GL accounts.");
    return (data ?? []).map((row) => ({
      id: String(row.id),
      organisationId: String(row.organisation_id),
      code: String(row.code),
      name: String(row.name),
      accountType: row.account_type as FinanceAccount["accountType"],
      classification: (row.classification as string | null) ?? null,
      status: row.status as FinanceAccount["status"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  private async listVisibleRows(
    profileId: string,
    companyId?: string | null
  ): Promise<FinancialAccountRow[]> {
    const admin = createAdminClient();
    const [companyIds, grants, capabilities] = await Promise.all([
      this.listAccessibleCompanyIds(profileId),
      admin
        .from("finance_financial_account_access")
        .select("financial_account_id")
        .eq("organisation_id", this.organisationId)
        .eq("profile_id", profileId),
      this.listCapabilities(profileId),
    ]);
    if (grants.error) {
      throwDb(grants.error, "Unable to load restricted account access.");
    }
    if (
      !capabilities.has("platform_finance.financial_account.view") ||
      companyIds.length === 0 ||
      (companyId && !companyIds.includes(companyId))
    ) {
      return [];
    }

    let query = admin
      .from("finance_financial_accounts")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .in("company_id", companyIds)
      .order("name");
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query;
    if (error) throwDb(error, "Unable to load Financial Accounts.");

    const grantedAccountIds = new Set(
      (grants.data ?? []).map((row) => String(row.financial_account_id))
    );
    return ((data ?? []) as FinancialAccountRow[]).filter(
      (row) => financialAccountIsVisible({
        hasViewCapability: capabilities.has(
          "platform_finance.financial_account.view"
        ),
        hasCompanyAccess: companyIds.includes(row.company_id),
        visibilityPolicy:
          row.visibility_policy as FinanceFinancialAccount["visibilityPolicy"],
        hasRestrictedAccountGrant: grantedAccountIds.has(row.id),
      })
    );
  }

  async listVisible(
    profileId: string,
    companyId?: string | null
  ): Promise<FinanceFinancialAccountView[]> {
    const rows = await this.listVisibleRows(profileId, companyId);
    if (rows.length === 0) return [];
    const admin = createAdminClient();
    const companyIds = [...new Set(rows.map((row) => row.company_id))];
    const glIds = [...new Set(rows.map((row) => row.control_gl_account_id))];
    const [companies, accounts] = await Promise.all([
      admin.from("finance_companies").select("id,name").in("id", companyIds),
      admin.from("finance_accounts").select("id,code,name").in("id", glIds),
    ]);
    if (companies.error) throwDb(companies.error, "Unable to load company names.");
    if (accounts.error) throwDb(accounts.error, "Unable to load control GL names.");
    const companyById = new Map(
      (companies.data ?? []).map((row) => [String(row.id), String(row.name)])
    );
    const glById = new Map(
      (accounts.data ?? []).map((row) => [
        String(row.id),
        { code: String(row.code), name: String(row.name) },
      ])
    );
    return rows.map((row) => {
      const base = mapFinancialAccount(row);
      const gl = glById.get(row.control_gl_account_id);
      return {
        ...base,
        companyName: companyById.get(row.company_id) ?? "Unknown company",
        controlGlAccountCode: gl?.code ?? "",
        controlGlAccountName: gl?.name ?? "Unknown account",
      };
    });
  }

  async getVisible(
    profileId: string,
    financialAccountId: string
  ): Promise<FinanceFinancialAccountView | null> {
    const visible = await this.listVisible(profileId);
    return visible.find((row) => row.id === financialAccountId) ?? null;
  }

  async create(input: {
    companyId: string;
    accountType: FinanceFinancialAccount["accountType"];
    name: string;
    institutionName: string | null;
    accountNumberLast4: string | null;
    currency: string;
    controlGlAccountId: string;
    visibilityPolicy: FinanceFinancialAccount["visibilityPolicy"];
    actorProfileId: string;
  }): Promise<FinanceFinancialAccount> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_financial_accounts")
      .insert({
        organisation_id: this.organisationId,
        company_id: input.companyId,
        account_type: input.accountType,
        name: input.name,
        institution_name: input.institutionName,
        account_number_last4: input.accountNumberLast4,
        currency: input.currency,
        control_gl_account_id: input.controlGlAccountId,
        visibility_policy: input.visibilityPolicy,
        status: "active",
        created_by_profile_id: input.actorProfileId,
      })
      .select("*")
      .single();
    if (error) throwDb(error, "Unable to create Financial Account.");
    return mapFinancialAccount(data as FinancialAccountRow);
  }

  async update(
    financialAccountId: string,
    input: {
      accountType: FinanceFinancialAccount["accountType"];
      name: string;
      institutionName: string | null;
      accountNumberLast4: string | null;
      currency: string;
      controlGlAccountId: string;
      visibilityPolicy: FinanceFinancialAccount["visibilityPolicy"];
      status: FinanceFinancialAccount["status"];
      actorProfileId: string;
    }
  ): Promise<FinanceFinancialAccount> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_financial_accounts")
      .update({
        account_type: input.accountType,
        name: input.name,
        institution_name: input.institutionName,
        account_number_last4: input.accountNumberLast4,
        currency: input.currency,
        control_gl_account_id: input.controlGlAccountId,
        visibility_policy: input.visibilityPolicy,
        status: input.status,
        updated_by_profile_id: input.actorProfileId,
      })
      .eq("organisation_id", this.organisationId)
      .eq("id", financialAccountId)
      .select("*")
      .single();
    if (error) throwDb(error, "Unable to update Financial Account.");
    return mapFinancialAccount(data as FinancialAccountRow);
  }

  async grantAccess(input: {
    financialAccountId: string;
    profileId: string;
    actorProfileId: string;
  }): Promise<void> {
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,organisation_id")
      .eq("id", input.profileId)
      .maybeSingle();
    if (profileError) throwDb(profileError, "Unable to verify access profile.");
    if (!profile || profile.organisation_id !== this.organisationId) {
      throw new ActionError("VALIDATION_ERROR", "Profile not found.");
    }
    const { error } = await admin.from("finance_financial_account_access").upsert(
      {
        organisation_id: this.organisationId,
        financial_account_id: input.financialAccountId,
        profile_id: input.profileId,
        created_by_profile_id: input.actorProfileId,
      },
      { onConflict: "financial_account_id,profile_id", ignoreDuplicates: true }
    );
    if (error) throwDb(error, "Unable to grant Financial Account access.");
  }

  async revokeAccess(input: {
    financialAccountId: string;
    profileId: string;
    actorProfileId: string;
  }): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin.rpc("finance_revoke_financial_account_access", {
      p_financial_account_id: input.financialAccountId,
      p_profile_id: input.profileId,
      p_actor_profile_id: input.actorProfileId,
    });
    if (error) throwDb(error, "Unable to revoke Financial Account access.");
  }
}
