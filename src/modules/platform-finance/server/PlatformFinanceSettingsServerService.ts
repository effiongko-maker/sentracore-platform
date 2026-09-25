import { ActionError } from "@/lib/actions/errors";
import { createAdminClient } from "@/utils/supabase/admin";
import { PlatformFinanceServerService } from "@/modules/platform-finance/server/PlatformFinanceServerService";
import { FINANCE_UNAVAILABLE_REPORTS } from "@/modules/platform-finance/reports/catalogue";
import {
  FINANCE_SYSTEM_ACCOUNTS,
  type FinanceReadinessItem,
  type FinanceSettingsCompanyPeriods,
  type FinanceSettingsSnapshot,
} from "@/modules/platform-finance/settings";

const COA_HREF = "/platform-finance/accounting/chart-of-accounts";
const PERIODS_HREF = "/platform-finance/accounting/periods";

/**
 * Platform Finance Settings — a READ-ONLY readiness snapshot. Company-scoped facts (periods, cash & bank accounts)
 * cover only the companies the actor has finance_company_access to; the chart of accounts is organisation-wide
 * (as the model defines it). Nothing is written.
 */
export class PlatformFinanceSettingsServerService {
  constructor(private readonly organisationId: string) {}

  async getSettings(profileId: string): Promise<FinanceSettingsSnapshot> {
    const finance = new PlatformFinanceServerService(this.organisationId);
    const asOf = new Date().toISOString();
    const today = asOf.slice(0, 10);
    const [companies, accounts, caps] = await Promise.all([
      finance.listAccessibleCompanies(profileId),
      finance.listAccounts(),
      finance.getMyAccountingCapabilities(profileId),
    ]);
    const companyIds = companies.map((c) => c.id);

    const admin = createAdminClient();
    const [periodLists, cashBank, categories] = await Promise.all([
      Promise.all(companies.map((c) => finance.listPeriods(c.id))),
      companyIds.length
        ? admin
            .from("finance_financial_accounts")
            .select("id", { count: "exact", head: true })
            .eq("organisation_id", this.organisationId)
            .eq("status", "active")
            .in("company_id", companyIds)
        : Promise.resolve({ count: 0, error: null }),
      admin
        .from("finance_request_categories")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", this.organisationId)
        .eq("status", "active"),
    ]);
    if (cashBank.error || categories.error) {
      throw new ActionError("INTERNAL_ERROR", "Unable to load Finance settings.");
    }

    const active = accounts.filter((a) => a.status === "active");
    const byType: Record<string, number> = {};
    for (const a of active) byType[a.accountType] = (byType[a.accountType] ?? 0) + 1;
    const systemAccounts = FINANCE_SYSTEM_ACCOUNTS.map((s) => {
      const match = accounts.find((a) => a.code === s.code);
      return { code: s.code, role: s.role, name: match?.name ?? null, active: match?.status === "active" };
    });
    // Cash Flow needs an explicit operating / investing / financing activity classification. The model has none
    // (`classification` is a source grouping, e.g. "operating_expense_…" — not a cash-flow activity), so this follows
    // the Reports catalogue's own verdict and is never inferred from account names or groupings.
    const cashFlowGap = FINANCE_UNAVAILABLE_REPORTS.find((r) => r.id === "cash-flow") ?? null;
    const cashFlowClassified = cashFlowGap === null;

    const periods: FinanceSettingsCompanyPeriods[] = companies.map((c, i) => {
      const list = periodLists[i] ?? [];
      return {
        companyId: c.id,
        companyName: c.name,
        companyCode: c.code,
        open: list.filter((p) => p.status === "open").length,
        closed: list.filter((p) => p.status === "closed").length,
        coversToday: list.some((p) => p.status === "open" && p.startDate <= today && p.endDate >= today),
        latestEnd: list.reduce<string | null>((max, p) => (!max || p.endDate > max ? p.endDate : max), null),
      };
    });

    const missingSystem = systemAccounts.filter((s) => !s.active);
    const companiesWithoutToday = periods.filter((p) => !p.coversToday);
    const cashBankAccounts = cashBank.count ?? 0;
    const noCompany = companies.length === 0;

    const readiness: FinanceReadinessItem[] = [
      {
        id: "chart-of-accounts",
        label: "Chart of Accounts",
        state: active.length > 0 && missingSystem.length === 0 ? "configured" : "requires_configuration",
        detail:
          active.length === 0
            ? "No active accounts."
            : missingSystem.length
              ? `Missing or inactive system account${missingSystem.length === 1 ? "" : "s"}: ${missingSystem.map((s) => `${s.code} ${s.role}`).join(", ")}.`
              : `${active.length} active accounts, including every account the posting rules require.`,
        href: COA_HREF,
      },
      {
        id: "periods",
        label: "Accounting periods",
        state: noCompany ? "not_available" : companiesWithoutToday.length === 0 ? "configured" : "requires_configuration",
        detail: noCompany
          ? "No finance company is assigned to you."
          : companiesWithoutToday.length === 0
            ? "An open period covers today for every company you can access."
            : `No open period covers today for ${companiesWithoutToday.map((p) => p.companyName).join(", ")}.`,
        href: PERIODS_HREF,
      },
      {
        id: "posting",
        label: "Journal posting",
        state: noCompany
          ? "not_available"
          : active.length > 0 && companiesWithoutToday.length === 0
            ? "configured"
            : "requires_configuration",
        detail:
          !noCompany && companiesWithoutToday.length > 0
            ? `Posting dated today needs an open period for ${companiesWithoutToday.length} of ${periods.length} companies. Closed periods refuse posting.`
            : "Balanced journals post only into an open period; a closed period refuses posting in the database.",
        href: "/platform-finance/accounting/journal",
      },
      {
        id: "review-and-post",
        label: "Review & Post",
        state: missingSystem.some((s) => s.code === "2000" || s.code === "1070") ? "requires_configuration" : "system_managed",
        detail: "Supplier bills and payments are reviewed, then posted against fixed control accounts (Payables 2000, Receivables 1070).",
        href: "/platform-finance/accounting",
      },
      {
        id: "cash-bank-accounts",
        label: "Cash & bank accounts",
        state: noCompany ? "not_available" : cashBankAccounts > 0 ? "configured" : "requires_configuration",
        detail: noCompany
          ? "No finance company is assigned to you."
          : cashBankAccounts > 0
            ? `${cashBankAccounts} active account${cashBankAccounts === 1 ? "" : "s"}; each posts to its own control GL account.`
            : "Receipts and payments need a cash or bank account.",
        href: "/platform-finance/cash-banks",
      },
      {
        id: "numbering",
        label: "Document numbering",
        state: "system_managed",
        detail: "References are generated by the system and are not configurable.",
        href: null,
      },
      {
        id: "cash-flow",
        label: "Cash Flow classification",
        state: cashFlowClassified ? "configured" : "not_available",
        detail: cashFlowClassified
          ? "Accounts carry operating / investing / financing classification."
          : "The chart of accounts does not classify activity as operating, investing or financing, so a cash flow statement cannot be derived without inventing that policy.",
        href: null,
      },
    ];

    return {
      asOf,
      companies: companies.map((c) => ({ id: c.id, code: c.code, name: c.name })),
      chartOfAccounts: {
        active: active.length,
        inactive: accounts.length - active.length,
        byType,
        systemAccounts,
        cashFlowClassified,
      },
      periods,
      cashBankAccounts,
      requestCategories: categories.count ?? 0,
      canManageCoa: caps.manageCoa,
      canManagePeriods: caps.managePeriods,
      readiness,
    };
  }
}
