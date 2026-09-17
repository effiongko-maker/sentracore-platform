import { ActionError } from "@/lib/actions/errors";
import {
  isAccountNumberLast4,
  isCurrencyCode,
  isFinanceFinancialAccountType,
  isFinanceFinancialAccountVisibility,
  normalizeCurrency,
  normalizeFinancialAccountName,
  normalizeInstitutionName,
} from "@/modules/platform-finance/domain/financialAccounts";
import { PlatformFinanceFinancialAccountsRepository } from "@/modules/platform-finance/server/PlatformFinanceFinancialAccountsRepository";
import {
  PLATFORM_FINANCE_CAPABILITIES,
  type FinanceFinancialAccount,
} from "@/modules/platform-finance/types";

type FinancialAccountInput = {
  companyId: string;
  accountType: unknown;
  name: string;
  institutionName?: string | null;
  accountNumberLast4?: string | null;
  currency: string;
  controlGlAccountId: string;
  visibilityPolicy: unknown;
};

export class PlatformFinanceFinancialAccountsServerService {
  private readonly repo: PlatformFinanceFinancialAccountsRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceFinancialAccountsRepository(organisationId);
  }

  private async requireCapability(
    profileId: string,
    capability:
      | typeof PLATFORM_FINANCE_CAPABILITIES.financial_account_view
      | typeof PLATFORM_FINANCE_CAPABILITIES.financial_account_manage
  ) {
    const capabilities = await this.repo.listCapabilities(profileId);
    if (!capabilities.has(capability)) {
      throw new ActionError("FORBIDDEN", `Missing capability ${capability}.`);
    }
  }

  async getContext(profileId: string) {
    await this.requireCapability(
      profileId,
      PLATFORM_FINANCE_CAPABILITIES.financial_account_view
    );
    const [capabilities, companies, controlGlAccounts] = await Promise.all([
      this.repo.listCapabilities(profileId),
      this.repo.listAccessibleCompanies(profileId),
      this.repo.listControlGlAccounts(),
    ]);
    return {
      companies,
      controlGlAccounts,
      canView: capabilities.has(
        PLATFORM_FINANCE_CAPABILITIES.financial_account_view
      ),
      canManage: capabilities.has(
        PLATFORM_FINANCE_CAPABILITIES.financial_account_manage
      ),
    };
  }

  async listVisible(profileId: string, companyId?: string | null) {
    await this.requireCapability(
      profileId,
      PLATFORM_FINANCE_CAPABILITIES.financial_account_view
    );
    return this.repo.listVisible(profileId, companyId);
  }

  async getVisible(profileId: string, financialAccountId: string) {
    await this.requireCapability(
      profileId,
      PLATFORM_FINANCE_CAPABILITIES.financial_account_view
    );
    const account = await this.repo.getVisible(profileId, financialAccountId);
    if (!account) {
      throw new ActionError("VALIDATION_ERROR", "Financial Account not found.");
    }
    return account;
  }

  private async validateInput(input: FinancialAccountInput) {
    if (!input.companyId) {
      throw new ActionError("VALIDATION_ERROR", "Company is required.");
    }
    if (!isFinanceFinancialAccountType(input.accountType)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid Financial Account type.");
    }
    if (!isFinanceFinancialAccountVisibility(input.visibilityPolicy)) {
      throw new ActionError("VALIDATION_ERROR", "Invalid visibility policy.");
    }
    const name = normalizeFinancialAccountName(input.name);
    if (!name) {
      throw new ActionError("VALIDATION_ERROR", "Account name is required.");
    }
    const currency = normalizeCurrency(input.currency);
    if (!isCurrencyCode(currency)) {
      throw new ActionError("VALIDATION_ERROR", "Currency must be a three-letter code.");
    }
    const last4 = input.accountNumberLast4?.trim() || null;
    if (!isAccountNumberLast4(last4)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Only the final four digits may be stored."
      );
    }
    const eligibleGl = (await this.repo.listControlGlAccounts()).find(
      (account) => account.id === input.controlGlAccountId
    );
    if (!eligibleGl) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Control GL account must be an active current asset account."
      );
    }
    return {
      companyId: input.companyId,
      accountType: input.accountType,
      name,
      institutionName: normalizeInstitutionName(input.institutionName),
      accountNumberLast4: last4,
      currency,
      controlGlAccountId: eligibleGl.id,
      visibilityPolicy: input.visibilityPolicy,
    };
  }

  async create(
    profileId: string,
    input: FinancialAccountInput
  ) {
    await this.requireCapability(
      profileId,
      PLATFORM_FINANCE_CAPABILITIES.financial_account_manage
    );
    const validated = await this.validateInput(input);
    const accessibleCompanyIds = await this.repo.listAccessibleCompanyIds(profileId);
    if (!accessibleCompanyIds.includes(validated.companyId)) {
      throw new ActionError("FORBIDDEN", "Financial Account company is not accessible.");
    }
    return this.repo.create({ ...validated, actorProfileId: profileId });
  }

  async update(
    profileId: string,
    financialAccountId: string,
    input: FinancialAccountInput & {
      status: FinanceFinancialAccount["status"];
    }
  ) {
    await this.requireCapability(
      profileId,
      PLATFORM_FINANCE_CAPABILITIES.financial_account_manage
    );
    await this.getVisible(profileId, financialAccountId);
    if (input.status !== "active" && input.status !== "inactive") {
      throw new ActionError("VALIDATION_ERROR", "Invalid account status.");
    }
    const validated = await this.validateInput(input);
    return this.repo.update(financialAccountId, {
      ...validated,
      status: input.status,
      actorProfileId: profileId,
    });
  }

  async setStatus(
    profileId: string,
    financialAccountId: string,
    status: FinanceFinancialAccount["status"]
  ) {
    await this.requireCapability(
      profileId,
      PLATFORM_FINANCE_CAPABILITIES.financial_account_manage
    );
    const existing = await this.getVisible(profileId, financialAccountId);
    return this.update(profileId, financialAccountId, { ...existing, status });
  }

  async grantAccess(
    actorProfileId: string,
    financialAccountId: string,
    profileId: string
  ) {
    await this.requireCapability(
      actorProfileId,
      PLATFORM_FINANCE_CAPABILITIES.financial_account_manage
    );
    const account = await this.getVisible(actorProfileId, financialAccountId);
    if (account.visibilityPolicy !== "restricted") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Explicit access applies only to restricted accounts."
      );
    }
    await this.repo.grantAccess({
      financialAccountId,
      profileId,
      actorProfileId,
    });
  }

  async revokeAccess(
    actorProfileId: string,
    financialAccountId: string,
    profileId: string
  ) {
    await this.requireCapability(
      actorProfileId,
      PLATFORM_FINANCE_CAPABILITIES.financial_account_manage
    );
    await this.getVisible(actorProfileId, financialAccountId);
    await this.repo.revokeAccess({
      financialAccountId,
      profileId,
      actorProfileId,
    });
  }
}
