import { boundaryForSession } from "@/lib/access/moduleBoundary";
/**
 * Command Centre composition/read service.
 * Soft-composes domain snapshots; never invents metrics or bypasses domain auth.
 */
import { isActionError } from "@/lib/actions/errors";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { accessCan } from "@/lib/access/resolveAccess";
import { resolveOperatingAccess } from "@/lib/access/server";
import {
  resolveWorkspaceAccessChrome,
  type WorkspaceAccessChrome,
} from "@/lib/access/workspaceAccessChrome";
import { hasModule } from "@/lib/actions/moduleAccess";
import type { PlatformSession } from "@/lib/auth/types";
import type { CommandCentreAccessContext } from "@/modules/command-centre/server/requireCommandCentreAccess";
import type {
  CommandCentrePulseCard,
  CommandCentreSnapshot,
} from "@/modules/command-centre/presentationTypes";
import {
  composeExecutiveAttention,
  eccCoverageAttentionItem,
  eccCoverageGap,
  eccIssueRequestAttentionItems,
  financeAttentionItems,
  fmAttentionFromPicture,
  type DomainAttentionResult,
} from "@/modules/command-centre/server/composeExecutiveAttention";
import { EccOperationsServerService } from "@/modules/ecc-operations/server/EccOperationsServerService";
import { ECC_CAPABILITIES, ECC_MODULE_SLUG } from "@/modules/ecc-operations/types";
import type { FinanceOverviewSnapshot } from "@/modules/platform-finance/overviewTypes";
import { FINANCE_PAYABLE_CAPABILITIES, type FinancePayableView } from "@/modules/platform-finance/domain/payables";
import type {
  CommandCentreFigure,
  CommandCentreFinancialPosition,
  CommandCentreObligations,
  CommandCentrePerformanceEnvironment,
} from "@/modules/command-centre/presentationTypes";
import {
  FINANCIAL_REQUEST_CAPABILITIES,
  PLATFORM_FINANCE_MODULE_SLUG,
} from "@/modules/platform-finance/types";
import { PlatformFinanceServerService } from "@/modules/platform-finance/server/PlatformFinanceServerService";
import { PlatformFinanceRequestsServerService } from "@/modules/platform-finance/server/PlatformFinanceRequestsServerService";
import { PlatformFinancePayablesServerService } from "@/modules/platform-finance/server/PlatformFinancePayablesServerService";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  loadOperationalPictureSummary,
  type OperationalPictureSummary,
} from "@/services/workspace/CommandCentreFmSummaryService";
import { COMMAND_CENTRE_CAPABILITIES } from "@/modules/command-centre/types";
import {
  organisationLocalHour,
  requireOrganisationTimeZone,
} from "@/lib/time/organisationTime";
import {
  overdueCommitmentAttentionItems,
} from "@/modules/command-centre/commitments/domain";
import { ExecutiveCommitmentsService } from "@/modules/command-centre/commitments/server/ExecutiveCommitmentsService";
import { readCommitmentCapabilities } from "@/modules/command-centre/commitments/server/requireCommitmentsAccess";
import {
  composeLastVisitChanges,
  type FmChangeVisibility,
} from "@/modules/command-centre/server/composeLastVisitChanges";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import { FmCostServerService, resolveFmCostOrganisation } from "@/modules/finance/server/FmCostServerService";
import { summarizeSubmissionPayments } from "@/modules/finance/utils/submissionPayment";
import type { CostSubmission, ReimbursementAuthorization, ReimbursementPayment } from "@/lib/operational/finance/types";
import type { PaginatedResult } from "@/types";
import {
  composeFinanceDecisionQueue,
  decisionScopeNote,
  evaluateDecisionScope,
  type DecisionScope,
} from "@/modules/command-centre/server/composeFinanceDecisionQueue";
import { PlatformFinanceVendorBillsServerService } from "@/modules/platform-finance/server/PlatformFinanceVendorBillsServerService";

function displayNameFromSession(session: PlatformSession): string {
  const profile = session.profile;
  if (profile.fullName?.trim()) return profile.fullName.trim();
  const parts = [profile.firstName, profile.lastName]
    .map((p) => p?.trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return session.email.split("@")[0] || "there";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/** Organisation timezone for display, or null (never a guessed zone). */
function organisationTimeZoneOrNull(session: PlatformSession): string | null {
  try {
    return requireOrganisationTimeZone(session.organisation);
  } catch {
    return null;
  }
}

function greetingForNow(date: Date, timeZone: string | null): string {
  // Cosmetic only: cadence follows the ORGANISATION's local hour. Without a valid
  // organisation timezone the greeting is neutral — no guessed zone.
  if (!timeZone) return "Hello";
  const hour = organisationLocalHour(date, timeZone);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatAmount(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  }
}

/** true / false, or null when the grant could not be read (a failure — never "no grant"). */
async function hasFinanceCapability(
  organisationId: string,
  profileId: string,
  capability: string
): Promise<boolean | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("capability", capability)
    .maybeSingle();
  if (error) return null;
  return Boolean(data);
}

async function hasPlatformCapability(
  organisationId: string,
  profileId: string,
  capability: string
): Promise<boolean | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("capability", capability)
    .maybeSingle();
  if (error) return null;
  return Boolean(data);
}

function actorFromSession(session: PlatformSession, organisationId: string) {
  return {
    profileId: session.profile.id,
    organisationId,
  };
}

function financeModuleEnabled(session: PlatformSession): boolean {
  const isSuperAdmin = isPlatformSuperAdminFromSlugs(session.roleSlugs);
  return (
    isSuperAdmin || hasModule(session.enabledModules, PLATFORM_FINANCE_MODULE_SLUG)
  );
}

/** Request-time "checked at" label in the organisation's timezone (explicit UTC without one). */
function checkedTimeLabel(iso: string, timeZone: string | null): string {
  try {
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      ...(timeZone ? { timeZone } : { timeZone: "UTC" }),
    }).format(new Date(iso));
    return timeZone ? time : `${time} UTC`;
  } catch {
    return "";
  }
}

function measuredFromLabel(iso: string, timeZone: string | null): string {
  try {
    const label = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: timeZone ?? "UTC",
    }).format(new Date(iso));
    return timeZone ? label : `${label} UTC`;
  } catch {
    return iso;
  }
}

/** Facility Management Pending Payments outstanding (Costs & Claims), as FM's own Costs & Claims overview derives it. */
type FmOutstandingResult =
  | { status: "not_enabled" | "restricted" | "unavailable" }
  | { status: "loaded"; amount: number; count: number };

const FM_OUTSTANDING_POOL = 500;

/**
 * ONE read of the Finance executive projection per request (overview + payables), shared by the Finance pulse,
 * Financial Position, Performance and Commitments — never re-queried per section.
 */
type FinanceProjection =
  | { status: "not_enabled" | "restricted" | "unavailable" }
  | { status: "loaded"; overview: FinanceOverviewSnapshot; payables: FinancePayableView[] | null };

/** Record-level Finance visibility (feed, obligation rows): Finance workspace access + company access. */
type FinanceRecordScope = { companyIds: string[]; payableView: boolean } | null;

export type CommandCentreLoadOptions = {
  /**
   * Evaluate "Since your last visit" and advance the visit marker. Only the Overview does this; lens pages read the
   * same projection without moving the marker.
   */
  trackVisit?: boolean;
};

type FinanceQueueResult =
  | { status: "not_enabled" | "restricted" | "unavailable" }
  | {
      status: "loaded";
      decisions: ReturnType<typeof composeFinanceDecisionQueue>;
      scope: DecisionScope;
    };

/**
 * The Finance executive projection, read once. The Finance domain itself authorises the organisation-wide
 * projection for the explicit Executive Office grant (getCommandCentreOverview / listCommandCentrePayables) — an
 * aggregate view; record-level detail still needs the Finance capability (see readFinanceRecordScope).
 */
async function loadFinanceProjection(access: CommandCentreAccessContext): Promise<FinanceProjection> {
  if (!financeModuleEnabled(access.session)) return { status: "not_enabled" };
  try {
    const overview = await new PlatformFinanceServerService(access.organisationId).getCommandCentreOverview({
      profileId: access.profileId,
    });
    let payables: FinancePayableView[] | null;
    try {
      payables = await new PlatformFinancePayablesServerService(access.organisationId).listCommandCentrePayables(
        access.profileId
      );
    } catch {
      payables = null; // an explicit partial state — never "no payables"
    }
    return { status: "loaded", overview, payables };
  } catch (error) {
    if (isActionError(error) && error.code === "FORBIDDEN") return { status: "restricted" };
    return { status: "unavailable" };
  }
}


export class CommandCentreServerService {
  /**
   * Compose the executive console for an authorised CEO/orchestrator actor.
   * Every domain is evaluated independently and keeps its own state: a failed or restricted
   * domain never contributes zero / "stable" / "nothing requires attention".
   */
  async load(
    access: CommandCentreAccessContext,
    options: CommandCentreLoadOptions = {}
  ): Promise<CommandCentreSnapshot> {
    const trackVisit = options.trackVisit !== false;
    const asOf = new Date().toISOString();
    const now = new Date(asOf);
    const displayName = displayNameFromSession(access.session);
    const organisationTimeZone = organisationTimeZoneOrNull(access.session);
    const greeting = `${greetingForNow(now, organisationTimeZone)}, ${displayName}.`;
    const operatingAccess = await resolveOperatingAccess(access.session);
    const workspaceEntry = await resolveWorkspaceAccessChrome({
      organisationId: access.organisationId,
      profileId: access.profileId,
      roleSlugs: access.session.roleSlugs,
      enabledModules: access.session.enabledModules,
      operatingAccess,
      boundary: boundaryForSession(access.session),
    });
    const fmEnabled =
      isPlatformSuperAdminFromSlugs(access.session.roleSlugs) ||
      hasModule(access.session.enabledModules, "facility_management");
    // The FM domain enforces its own view authority. Command Centre never weakens that gate:
    // without FM view access the FM projection is RESTRICTED (not "unavailable", not zero).
    const fmViewAllowed = fmEnabled && accessCan(operatingAccess, "ops.view");
    // Costs & Claims (Pending Payments, receipts) keeps its own FM authority: finance.view.
    const fmCostsClaimsAllowed = fmEnabled && accessCan(operatingAccess, "finance.view");
    const fmOutstanding = this.loadFmOutstanding(access, operatingAccess, fmEnabled, fmCostsClaimsAllowed);
    const operationalPicture = fmViewAllowed
      ? loadOperationalPictureSummary(asOf)
      : Promise.resolve<OperationalPictureSummary | null>(null);

    const fmChangeVisibility: FmChangeVisibility | null =
      fmEnabled && (fmViewAllowed || fmCostsClaimsAllowed)
        ? { operations: fmViewAllowed, costsClaims: fmCostsClaimsAllowed, scope: operatingAccess.fmFacilityScope }
        : null;

    // ECC keeps its own authority: the explicit ECC view grant (null = the grant could not be read).
    const eccEnabled = hasModule(access.session.enabledModules, ECC_MODULE_SLUG);
    const eccViewGrant = eccEnabled
      ? await hasPlatformCapability(access.organisationId, access.profileId, ECC_CAPABILITIES.view)
      : false;
    const financeProjection = loadFinanceProjection(access);
    const financeRecordScope = this.readFinanceRecordScope(access);

    const [financePulse, facilityManagementPulse, financeQueue, eccAttention, fmAttention, lastVisit, commitmentsResult] =
      await Promise.all([
        this.composeFinancePulse(access, workspaceEntry, asOf, organisationTimeZone, financeProjection),
        this.composeFacilityManagementPulse(
          access,
          workspaceEntry,
          operationalPicture,
          { asOf, timeZone: organisationTimeZone, fmViewAllowed, outstanding: fmOutstanding }
        ),
        this.loadFinanceQueue(access),
        this.evaluateEccAttention(access, eccViewGrant),
        this.evaluateFmAttention(access, operationalPicture, fmViewAllowed),
        trackVisit
          ? financeRecordScope.then((financeScope) =>
              this.composeLastVisit(access, asOf, workspaceEntry, {
                fmEnabled,
                fm: fmChangeVisibility,
                financeScope,
                ecc: eccViewGrant === true,
                eccEnabled,
              })
            )
          : Promise.resolve<CommandCentreSnapshot["lastVisit"]>({
              state: "unavailable",
              message: "Shown on the Overview.",
              detail: "",
              scope: "",
              items: [],
            }),
        this.loadCommitments(access, now, organisationTimeZone),
      ]);
    const eccPulse = await this.composeEccPulse(
      access,
      workspaceEntry,
      eccAttention.coverage,
      { asOf, timeZone: organisationTimeZone },
      eccViewGrant
    );
    const [finance, recordScope, fmOutstandingResult] = await Promise.all([
      financeProjection,
      financeRecordScope,
      fmOutstanding,
    ]);

    const attention = composeExecutiveAttention([
      this.financeAttentionResult(financeQueue),
      eccAttention.result,
      fmAttention,
      commitmentsResult.attention,
    ]);

    const pulse: CommandCentrePulseCard[] = [
      financePulse,
      facilityManagementPulse,
      eccPulse,
      {
        domain: "projects_construction",
        label: "Projects & Construction",
        state: "unavailable",
        statusLabel: "Not available yet",
        lines: ["Coming soon to your Executive Office."],
        href: null,
        disabledNavigationLabel: null,
      },
    ];

    return {
      asOf,
      checkedAt: asOf,
      timeZone: organisationTimeZone,
      greeting,
      lede: "Your executive view of the organisation.",
      profile: {
        displayName,
        jobTitle: access.session.profile.jobTitle,
        avatarUrl: access.session.profile.avatarUrl,
        initials: initialsFromName(displayName),
      },
      pulse,
      decisions: this.composeDecisions(financeQueue),
      attention,
      commitments: commitmentsResult.section,
      lastVisit,
      financialPosition: this.composeFinancialPosition(finance, fmOutstandingResult, workspaceEntry),
      performance: this.composePerformance(pulse, finance),
      obligations: this.composeObligations(finance, recordScope, asOf),
    };
  }

  /**
   * Executive Commitments for the acting executive. Requires the explicit commitments.view
   * grant: without it the surface is simply not offered (restricted) and commitments take no
   * part in attention. A failed read is an error/unavailable state — never an empty register.
   */
  private async loadCommitments(
    access: CommandCentreAccessContext,
    now: Date,
    timeZone: string | null
  ): Promise<{
    section: CommandCentreSnapshot["commitments"];
    attention: DomainAttentionResult;
  }> {
    const base = {
      canManage: false,
      currentProfileId: access.profileId,
      today: null as string | null,
      overdue: [],
      open: [],
      completed: [],
    };
    const unavailable = (reason: string) => ({
      section: { ...base, state: "error" as const, reason },
      attention: {
        domain: "commitments" as const,
        status: "unavailable" as const,
        items: [],
        note: "Commitments could not be evaluated.",
      },
    });
    const caps = await readCommitmentCapabilities(access.organisationId, access.profileId);
    if (caps === null) return unavailable("Commitments access could not be verified.");
    if (!caps.view) {
      return {
        section: { ...base, state: "restricted", reason: null },
        // Not applicable to this identity: never claimed as evaluated, never a gap.
        attention: { domain: "commitments", status: "not_enabled", items: [] },
      };
    }
    if (!timeZone) return unavailable("Due dates cannot be evaluated without the organisation timezone.");
    try {
      const register = await new ExecutiveCommitmentsService(
        access.organisationId,
        access.profileId,
        timeZone
      ).loadRegister(now);
      const outstanding = register.overdue.length + register.open.length;
      return {
        section: {
          ...base,
          canManage: caps.manage,
          state: outstanding === 0 ? "empty" : "healthy",
          reason: null,
          today: register.today,
          overdue: register.overdue,
          open: register.open,
          completed: register.completed,
        },
        attention: {
          domain: "commitments",
          status: "loaded",
          items: overdueCommitmentAttentionItems(register.overdue),
        },
      };
    } catch {
      return unavailable("The commitments register could not be read.");
    }
  }

  /**
   * Facility Management's Pending Payments outstanding — the SAME derivation as FM's Costs & Claims overview
   * (live Pending Payments, receipt-derived, 2025 history excluded by FM's own default), read through FM's own
   * actor-scoped service. A truncated pool is unavailable, never a lower figure.
   */
  private async loadFmOutstanding(
    access: CommandCentreAccessContext,
    operatingAccess: OperatingAccess,
    fmEnabled: boolean,
    allowed: boolean
  ): Promise<FmOutstandingResult> {
    if (!fmEnabled) return { status: "not_enabled" };
    if (!allowed) return { status: "restricted" };
    try {
      const { organisationId, profileId } = resolveFmCostOrganisation(access.session);
      const fm = new FmCostServerService({ organisationId, profileId, session: access.session, access: operatingAccess });
      const pool = { page: 1, pageSize: FM_OUTSTANDING_POOL };
      const [submissions, payments, authorizations] = (await Promise.all([
        fm.listSubmissions(pool),
        fm.listPayments(pool),
        fm.listAuthorizations(pool),
      ])) as [PaginatedResult<CostSubmission>, PaginatedResult<ReimbursementPayment>, PaginatedResult<ReimbursementAuthorization>];
      const truncated = [submissions, payments, authorizations].some((p) => p.total > p.data.length);
      if (truncated) return { status: "unavailable" };
      let amount = 0;
      let count = 0;
      for (const submission of submissions.data) {
        if (submission.status !== "submitted" && submission.status !== "queried") continue;
        const summary = summarizeSubmissionPayments(submission, payments.data, authorizations.data);
        if (summary.outstandingAmount > 0) {
          count += 1;
          amount += summary.outstandingAmount;
        }
      }
      return { status: "loaded", amount: Math.round(amount * 100) / 100, count };
    } catch {
      return { status: "unavailable" };
    }
  }

  /**
   * Facility Management pulse — mapped from FM's existing signals only: Work (critical / in progress / overdue),
   * Work Orders (overdue / awaiting action), Payment Approvals awaiting action (Operational Picture), and Pending
   * Payments outstanding (Costs & Claims). Each part keeps FM's own authority; a part the actor may not see or that
   * failed is said so — never a zero.
   */
  private async composeFacilityManagementPulse(
    access: CommandCentreAccessContext,
    workspaceEntry: WorkspaceAccessChrome,
    operationalPicture: Promise<OperationalPictureSummary | null>,
    context: {
      asOf: string;
      timeZone: string | null;
      fmViewAllowed: boolean;
      outstanding?: Promise<FmOutstandingResult>;
    } = {
      asOf: new Date().toISOString(),
      timeZone: null,
      fmViewAllowed: true,
    }
  ): Promise<CommandCentrePulseCard> {
    const href = workspaceEntry.facilityManagement ? "/operations" : null;
    const disabledNavigationLabel = workspaceEntry.facilityManagement ? null : "Workspace access required";
    const base: CommandCentrePulseCard = {
      domain: "facility_management",
      label: "Facility Management",
      state: "unavailable",
      statusLabel: "Unavailable",
      lines: ["Facility Management data is unavailable."],
      href,
      disabledNavigationLabel,
      financialLine: null,
    };

    const moduleEnabled =
      isPlatformSuperAdminFromSlugs(access.session.roleSlugs) ||
      hasModule(access.session.enabledModules, "facility_management");
    if (!moduleEnabled) {
      return {
        ...base,
        state: "restricted",
        statusLabel: "Not enabled",
        lines: ["Facility Management is not enabled for this organisation."],
        href: null,
        disabledNavigationLabel: null,
      };
    }

    const outstanding = context.outstanding ? await context.outstanding.catch(() => ({ status: "unavailable" }) as const) : null;
    const financialLine =
      outstanding?.status === "loaded"
        ? outstanding.count === 0
          ? "No pending payments outstanding"
          : `Pending payments outstanding ${formatAmount(outstanding.amount, "NGN")} · ${outstanding.count} ${outstanding.count === 1 ? "request" : "requests"}`
        : null;
    const financialUnavailable = outstanding?.status === "unavailable";

    if (!context.fmViewAllowed) {
      // Operational figures need FM operational access; Costs & Claims keeps its own grant.
      if (!financialLine) {
        return {
          ...base,
          state: "restricted",
          statusLabel: "Restricted",
          lines: ["Facility Management figures need Facility Management access."],
          href: null,
          disabledNavigationLabel: null,
        };
      }
      return {
        ...base,
        state: "healthy",
        statusLabel: "Partial view",
        partial: true,
        lines: [financialLine, "Work figures need Facility Management operational access."],
        financialLine,
      };
    }

    try {
      const aggregate = await operationalPicture;
      if (!aggregate) return { ...base, financialLine };
      const { maintenance, workOrders, approvals } = aggregate;
      const n = (count: number) => count.toLocaleString("en-NG");
      const lines: string[] = [];
      lines.push(
        maintenance.state === "healthy"
          ? `Work: ${n(maintenance.critical)} critical · ${n(maintenance.inProgress)} in progress · ${n(maintenance.overdue)} overdue`
          : "Work unavailable"
      );
      lines.push(
        workOrders.state === "healthy"
          ? `Work Orders: ${n(workOrders.overdue)} overdue · ${n(workOrders.awaitingAction)} awaiting action`
          : "Work Orders unavailable"
      );
      lines.push(
        approvals.state === "healthy"
          ? `Payment Approvals: ${n(approvals.awaitingAction)} awaiting action`
          : "Payment Approvals unavailable"
      );
      if (financialLine) lines.push(financialLine);
      else if (financialUnavailable) lines.push("Pending payments unavailable");

      const states = [maintenance.state, workOrders.state, approvals.state];
      if (states.every((st) => st !== "healthy") && !financialLine) {
        return {
          ...base,
          state: "error",
          statusLabel: "Unable to load",
          lines: ["Facility Management pulse could not be loaded."],
        };
      }
      const partial = states.some((st) => st !== "healthy") || financialUnavailable;
      const exception =
        (maintenance.state === "healthy" && (maintenance.critical > 0 || maintenance.overdue > 0)) ||
        (workOrders.state === "healthy" && workOrders.overdue > 0);
      return {
        ...base,
        state: "healthy",
        statusLabel: exception
          ? "Needs attention"
          : partial
            ? "Partial view"
            : `Checked ${checkedTimeLabel(context.asOf, context.timeZone)}`.trim(),
        partial,
        lines,
        financialLine,
      };
    } catch {
      return {
        ...base,
        state: "error",
        statusLabel: "Unable to load",
        lines: ["Facility Management pulse could not be loaded."],
        financialLine,
      };
    }
  }

  /**
   * Record-level Finance visibility for this actor: Finance workspace access (any Finance grant) plus the companies
   * they may see (finance_company_access); payable rows additionally need the payable view grant. null = none.
   */
  private async readFinanceRecordScope(access: CommandCentreAccessContext): Promise<FinanceRecordScope> {
    if (!financeModuleEnabled(access.session)) return null;
    try {
      const admin = createAdminClient();
      const { data: grants, error } = await admin
        .from("finance_capability_grants")
        .select("capability")
        .eq("organisation_id", access.organisationId)
        .eq("profile_id", access.profileId);
      if (error || !grants?.length) return null;
      const companies = await new PlatformFinanceServerService(access.organisationId).listAccessibleCompanies(
        access.profileId
      );
      return {
        companyIds: companies.map((c) => c.id),
        payableView: grants.some((g) => g.capability === FINANCE_PAYABLE_CAPABILITIES.view),
      };
    } catch {
      return null;
    }
  }

  private async composeFinancePulse(
    access: CommandCentreAccessContext,
    workspaceEntry: WorkspaceAccessChrome,
    asOf: string = new Date().toISOString(),
    timeZone: string | null = null,
    projection?: Promise<FinanceProjection>
  ): Promise<CommandCentrePulseCard> {
    const base: CommandCentrePulseCard = {
      domain: "finance",
      label: "Finance",
      state: "unavailable",
      statusLabel: "Unavailable",
      lines: ["Finance pulse could not be composed."],
      href: workspaceEntry.platformFinance ? "/platform-finance" : null,
      disabledNavigationLabel: workspaceEntry.platformFinance
        ? null
        : "Workspace access required",
    };

    const finance = await (projection ?? loadFinanceProjection(access));
    if (finance.status === "not_enabled") {
      return {
        ...base,
        state: "restricted",
        statusLabel: "Not enabled",
        lines: ["Platform Finance is not enabled for this organisation."],
        href: null,
        disabledNavigationLabel: null,
      };
    }
    if (finance.status === "restricted") {
      return {
        ...base,
        state: "restricted",
        statusLabel: "Restricted",
        lines: ["Finance data is restricted for your account."],
        href: null,
        disabledNavigationLabel: null,
      };
    }
    if (finance.status !== "loaded") {
      return { ...base, state: "error", statusLabel: "Unable to load", lines: ["Finance pulse could not be loaded."] };
    }

    const { overview, payables } = finance;
    // A failed payables read is an explicit partial state — never a silently missing line.
    const payablesFailed = payables === null;
    const open = (payables ?? []).filter(
      (p) => p.status !== "paid" && p.status !== "cancelled" && p.status !== "rejected"
    );
    const openPayablesLine = payablesFailed
      ? "Open payables unavailable"
      : open.length === 1
        ? "1 open payable"
        : `${open.length} open payables`;

    const pending = overview.pendingCeoDecisions.count;
    const awaiting = overview.requests.awaitingReview.count;
    const lines: string[] = [];
    lines.push(pending === 1 ? "1 pending CEO decision" : `${pending} pending CEO decisions`);
    const awaitingLine = awaiting === 1 ? "1 awaiting Finance review" : `${awaiting} awaiting Finance review`;
    lines.push(`${awaitingLine} · ${openPayablesLine}`);

    const busy = pending > 0 || awaiting > 0;
    return {
      domain: "finance",
      label: "Finance",
      state: "healthy",
      statusLabel: payablesFailed
        ? "Partial view"
        : busy
          ? "Needs attention"
          : `Checked ${checkedTimeLabel(asOf, timeZone)}`.trim(),
      partial: payablesFailed,
      lines,
      financialLine: lines[0] ?? null,
      href: workspaceEntry.platformFinance ? "/platform-finance" : null,
      disabledNavigationLabel: workspaceEntry.platformFinance
        ? null
        : "Workspace access required",
    };
  }

  // ── Lens compositions — pure projections of data already read in this request ──────────────────────────────

  private composeFinancialPosition(
    finance: FinanceProjection,
    fmOutstanding: FmOutstandingResult,
    workspaceEntry: WorkspaceAccessChrome
  ): CommandCentreFinancialPosition {
    const known = (label: string, count?: number): CommandCentreFigure => ({ state: "known", label, count });
    const unavailable = (label = "Unavailable"): CommandCentreFigure => ({ state: "unavailable", label });
    const noAccess = (label = "No access"): CommandCentreFigure => ({ state: "no_access", label });
    const bucket = (b: { count: number; totalAmount: number }) =>
      known(`${formatAmount(b.totalAmount, "NGN")} · ${b.count} ${b.count === 1 ? "item" : "items"}`, b.count);

    const financeBase = {
      periodLabel: null,
      periodStatus: null,
      receivablesOpen: unavailable(),
      receivablesOverdue: unavailable(),
      payablesOpen: unavailable(),
      payablesOverdue: unavailable(),
      postedRevenue: unavailable(),
      postedExpenses: unavailable(),
      postedNet: unavailable(),
      unpostedItems: unavailable(),
      scope: null,
      href: workspaceEntry.platformFinance ? "/platform-finance" : null,
    } as const;
    let financePosition: CommandCentreFinancialPosition["finance"];
    if (finance.status !== "loaded") {
      financePosition = {
        ...financeBase,
        state: finance.status === "unavailable" ? "error" : "restricted",
        reason:
          finance.status === "not_enabled"
            ? "Platform Finance is not enabled for this organisation."
            : finance.status === "restricted"
              ? "Finance figures are restricted for your account."
              : "Finance could not be read.",
        receivablesOpen: finance.status === "unavailable" ? unavailable() : noAccess(),
        receivablesOverdue: finance.status === "unavailable" ? unavailable() : noAccess(),
        payablesOpen: finance.status === "unavailable" ? unavailable() : noAccess(),
        payablesOverdue: finance.status === "unavailable" ? unavailable() : noAccess(),
        postedRevenue: finance.status === "unavailable" ? unavailable() : noAccess(),
        postedExpenses: finance.status === "unavailable" ? unavailable() : noAccess(),
        postedNet: finance.status === "unavailable" ? unavailable() : noAccess(),
        unpostedItems: finance.status === "unavailable" ? unavailable() : noAccess(),
      };
    } else {
      const { overview, payables } = finance;
      const today = overview.asOf.slice(0, 10);
      const openPayables = (payables ?? []).filter(
        (p) => p.status !== "paid" && p.status !== "cancelled" && p.status !== "rejected" && p.outstandingAmount > 0
      );
      // Payables keep their own currencies; totals are stated per currency, never blended.
      const byCurrency = (rows: FinancePayableView[]) => {
        const totals = new Map<string, number>();
        for (const r of rows) totals.set(r.currency || "NGN", (totals.get(r.currency || "NGN") ?? 0) + r.outstandingAmount);
        return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => formatAmount(n, c)).join(" + ");
      };
      const payablesFigure = (rows: FinancePayableView[]) =>
        rows.length === 0 ? known("None", 0) : known(`${byCurrency(rows)} · ${rows.length} ${rows.length === 1 ? "payable" : "payables"}`, rows.length);
      const overduePayables = openPayables.filter((p) => p.dueDate != null && p.dueDate < today);
      const acc = overview.accounting;
      const money = (value: number | null) => (value == null ? unavailable("No posted accounting in this period") : known(formatAmount(value, "NGN")));
      financePosition = {
        ...financeBase,
        state: payables === null ? "partial" : "healthy",
        reason: payables === null ? "Payables could not be read; other Finance figures are shown." : null,
        scope: "All Finance companies (Executive Office projection).",
        periodLabel: acc.periodLabel,
        periodStatus: acc.periodStatus,
        receivablesOpen: overview.receivables ? bucket(overview.receivables.open) : noAccess("Needs receivables access"),
        receivablesOverdue: overview.receivables ? bucket(overview.receivables.overdue) : noAccess("Needs receivables access"),
        payablesOpen: payables === null ? unavailable() : payablesFigure(openPayables),
        payablesOverdue: payables === null ? unavailable() : payablesFigure(overduePayables),
        postedRevenue: money(acc.revenue),
        postedExpenses: money(acc.expenses),
        postedNet: money(acc.netProfit),
        unpostedItems: known(String(acc.unpostedItems), acc.unpostedItems),
      };
    }

    const fm: CommandCentreFinancialPosition["facilityManagement"] =
      fmOutstanding.status === "loaded"
        ? {
            state: "healthy",
            reason: null,
            pendingPaymentsOutstanding:
              fmOutstanding.count === 0
                ? known("None outstanding", 0)
                : known(`${formatAmount(fmOutstanding.amount, "NGN")} · ${fmOutstanding.count} ${fmOutstanding.count === 1 ? "request" : "requests"}`, fmOutstanding.count),
            href: workspaceEntry.facilityManagement ? "/finance/submissions" : null,
          }
        : {
            state: fmOutstanding.status === "unavailable" ? "error" : "restricted",
            reason:
              fmOutstanding.status === "not_enabled"
                ? "Facility Management is not enabled for this organisation."
                : fmOutstanding.status === "restricted"
                  ? "Needs Facility Management Costs & Claims access."
                  : "Pending payments could not be fully evaluated.",
            pendingPaymentsOutstanding: fmOutstanding.status === "unavailable" ? unavailable() : noAccess(),
            href: null,
          };

    return {
      finance: financePosition,
      facilityManagement: fm,
      exclusions: [
        "Finance and Facility Management positions are shown separately: FM pending payments are amounts FM has requested from its client, not Platform Finance receivables, so they are never added together.",
        "Historical commercial facts (imported pre-SentraCore™ records) are context only and are not part of any position here.",
        "Cash and bank balances are not included in this view.",
      ],
    };
  }

  private composePerformance(
    pulse: CommandCentrePulseCard[],
    finance: FinanceProjection
  ): CommandCentrePerformanceEnvironment[] {
    const notEstablished = "Throughput over time is not established yet — it needs recorded operational history.";
    return pulse.map((card) => {
      let throughput: string[] = [notEstablished];
      if (card.domain === "finance" && finance.status === "loaded") {
        const { overview } = finance;
        const approved = overview.requests.approvedThisMonth;
        const acc = overview.accounting;
        throughput = [
          `Financial requests approved this month: ${approved.count} · ${formatAmount(approved.totalAmount, "NGN")}`,
          acc.netProfit == null
            ? `Posted results${acc.periodLabel ? ` (${acc.periodLabel})` : ""}: no posted accounting yet`
            : `Posted results${acc.periodLabel ? ` (${acc.periodLabel})` : ""}: revenue ${formatAmount(acc.revenue ?? 0, "NGN")} · expenses ${formatAmount(acc.expenses ?? 0, "NGN")} · net ${formatAmount(acc.netProfit, "NGN")}`,
        ];
      }
      if (card.domain === "projects_construction") throughput = [];
      return {
        domain: card.domain,
        label: card.label,
        state: card.state,
        statusLabel: card.statusLabel,
        position: card.lines,
        throughput,
        href: card.href,
      };
    });
  }

  private composeObligations(finance: FinanceProjection, scope: FinanceRecordScope, asOf: string): CommandCentreObligations {
    if (finance.status !== "loaded") {
      return {
        state: finance.status === "unavailable" ? "error" : "restricted",
        reason:
          finance.status === "not_enabled"
            ? "Platform Finance is not enabled for this organisation."
            : finance.status === "restricted"
              ? "Finance obligations are restricted for your account."
              : "Finance could not be read.",
        summary: null,
        items: [],
      };
    }
    if (finance.payables === null) {
      return { state: "error", reason: "Payables could not be read.", summary: null, items: [] };
    }
    const today = asOf.slice(0, 10);
    // An approved obligation with a stated due date is a commitment; drafts, rejected and paid items are not.
    const committed = finance.payables.filter(
      (p) =>
        (p.status === "approved" || p.status === "scheduled" || p.status === "payment_pending") &&
        p.outstandingAmount > 0 &&
        p.dueDate != null
    );
    const overdue = committed.filter((p) => p.dueDate! < today);
    const summary =
      committed.length === 0
        ? "No approved Finance payables with a due date are outstanding."
        : `${committed.length} approved ${committed.length === 1 ? "payable" : "payables"} with a due date · ${overdue.length} overdue`;
    const visible = scope && scope.payableView ? new Set(scope.companyIds) : null;
    const items = visible
      ? committed
          .filter((p) => visible.has(p.companyId))
          .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
          .map((p) => ({
            id: `payable:${p.id}`,
            environment: "Finance" as const,
            title: p.payeeName || p.description || "Payable",
            statusLabel: p.status.replaceAll("_", " "),
            amountLabel: formatAmount(p.outstandingAmount, p.currency || "NGN"),
            dueDate: p.dueDate!,
            overdue: p.dueDate! < today,
            href: `/platform-finance/payables/${p.id}`,
          }))
      : [];
    return {
      state: committed.length === 0 ? "empty" : visible ? "healthy" : "partial",
      reason: visible
        ? items.length < committed.length
          ? "Only payables in your Finance companies are listed."
          : null
        : "Individual payables need Finance payable access; the summary is shown.",
      summary,
      items,
    };
  }

  /** One read of the Finance CEO decision queue, shared by Decisions and Attention. */
  private async loadFinanceQueue(
    access: CommandCentreAccessContext
  ): Promise<FinanceQueueResult> {
    if (!financeModuleEnabled(access.session)) return { status: "not_enabled" };

    const canApprove = await hasFinanceCapability(
      access.organisationId,
      access.profileId,
      FINANCIAL_REQUEST_CAPABILITIES.approve
    );
    const canDecide = await hasPlatformCapability(
      access.organisationId,
      access.profileId,
      COMMAND_CENTRE_CAPABILITIES.decide
    );
    // null = the grant could not be read: a failure, not a denial.
    if (canApprove === null || canDecide === null) return { status: "unavailable" };
    if (!canApprove || !canDecide) return { status: "restricted" };

    try {
      const requestsSvc = new PlatformFinanceRequestsServerService(
        access.organisationId
      );
      const vendorBillsSvc = new PlatformFinanceVendorBillsServerService(
        access.organisationId
      );
      const actor = actorFromSession(access.session, access.organisationId);
      const [requests, vendorBills, categories, scope] = await Promise.all([
        requestsSvc.listApprovalQueue(actor),
        vendorBillsSvc.listApprovalQueue(actor),
        requestsSvc.listCategories(actor),
        this.readDecisionScope(access),
      ]);
      return {
        status: "loaded",
        decisions: composeFinanceDecisionQueue({ requests, vendorBills, categories }),
        scope,
      };
    } catch (error) {
      if (isActionError(error) && error.code === "FORBIDDEN") {
        return { status: "restricted" };
      }
      return { status: "unavailable" };
    }
  }

  /**
   * Is the actor's Finance company access complete for the organisation? Compares the actor's
   * finance_company_access with EVERY company of the organisation (the population the org-wide
   * pulse counts). A read failure throws so the queue becomes unavailable — never "complete".
   */
  private async readDecisionScope(
    access: CommandCentreAccessContext
  ): Promise<DecisionScope> {
    const admin = createAdminClient();
    const [companies, accessRows] = await Promise.all([
      admin.from("finance_companies").select("id").eq("organisation_id", access.organisationId),
      admin
        .from("finance_company_access")
        .select("company_id")
        .eq("organisation_id", access.organisationId)
        .eq("profile_id", access.profileId),
    ]);
    if (companies.error || accessRows.error) {
      throw new Error("Finance company scope could not be read.");
    }
    return evaluateDecisionScope(
      (companies.data ?? []).map((row) => String(row.id)),
      (accessRows.data ?? []).map((row) => String(row.company_id))
    );
  }

  private composeDecisions(
    queue: FinanceQueueResult
  ): CommandCentreSnapshot["decisions"] {
    switch (queue.status) {
      case "not_enabled":
        return {
          state: "restricted",
          items: [],
          viewAllHref: null,
          reason: "Platform Finance is not enabled for this organisation.",
          scopeNote: null,
        };
      case "restricted":
        return {
          state: "restricted",
          items: [],
          viewAllHref: null,
          reason:
            "Finance decisions are shown to people with Finance approval authority and Executive Office decision access.",
          scopeNote: null,
        };
      case "unavailable":
        return {
          state: "error",
          items: [],
          viewAllHref: null,
          reason: "The Finance decision queue could not be read.",
          scopeNote: null,
        };
      case "loaded": {
        const scopeNote = decisionScopeNote(queue.scope);
        const items = queue.decisions.items;
        return {
          // Visible decisions are always shown. A truthful "empty" needs a COMPLETE scope: with
          // limited company access, zero visible items is partial knowledge, never "none waiting".
          state: !queue.scope.complete ? "partial" : items.length === 0 ? "empty" : "healthy",
          items,
          viewAllHref: null,
          reason: scopeNote,
          scopeNote,
        };
      }
    }
  }

  private financeAttentionResult(queue: FinanceQueueResult): DomainAttentionResult {
    if (queue.status !== "loaded") {
      return {
        domain: "finance",
        status: queue.status,
        items: [],
        note:
          queue.status === "restricted"
            ? "Finance decisions are restricted for your access."
            : queue.status === "unavailable"
              ? "Finance could not be evaluated."
              : null,
      };
    }
    const { items, totalsByCurrency } = queue.decisions;
    const scopeNote = decisionScopeNote(queue.scope);
    const amountDetail =
      [
        ...[...totalsByCurrency.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([currency, amount]) => formatAmount(amount, currency)),
        scopeNote ? "within your company access" : null,
      ]
        .filter(Boolean)
        .join(" · ") || null;
    return {
      domain: "finance",
      // Partial scope stays partial: a zero here is never an all-clear.
      status: queue.scope.complete ? "loaded" : "partial",
      items: financeAttentionItems({ pendingCount: items.length, amountDetail }),
      note: scopeNote,
    };
  }

  private async evaluateFmAttention(
    access: CommandCentreAccessContext,
    operationalPicture: Promise<OperationalPictureSummary | null>,
    fmViewAllowed: boolean
  ): Promise<DomainAttentionResult> {
    const enabled =
      isPlatformSuperAdminFromSlugs(access.session.roleSlugs) ||
      hasModule(access.session.enabledModules, "facility_management");
    if (!enabled) return { domain: "facility_management", status: "not_enabled", items: [] };
    if (!fmViewAllowed) {
      return {
        domain: "facility_management",
        status: "restricted",
        items: [],
        note: "Facility Management attention needs Facility Management access.",
      };
    }
    try {
      const aggregate = await operationalPicture;
      if (!aggregate) {
        return { domain: "facility_management", status: "unavailable", items: [] };
      }
      const result = fmAttentionFromPicture(aggregate);
      return { domain: "facility_management", ...result };
    } catch {
      return { domain: "facility_management", status: "unavailable", items: [] };
    }
  }

  /**
   * ECC executive exceptions from authoritative ECC state. Issues, Requests and the current
   * shift are read independently so one failed source is a visible partial — never zero.
   */
  private async evaluateEccAttention(
    access: CommandCentreAccessContext,
    /** The actor's ECC view grant: ECC keeps its own authority (null = the grant could not be read). */
    eccViewGrant: boolean | null = true
  ): Promise<{ result: DomainAttentionResult; coverage: "gap" | "ok" | "unknown" }> {
    if (!hasModule(access.session.enabledModules, ECC_MODULE_SLUG)) {
      return {
        result: { domain: "ecc", status: "not_enabled", items: [] },
        coverage: "unknown",
      };
    }
    if (eccViewGrant !== true) {
      return {
        result: {
          domain: "ecc",
          status: eccViewGrant === null ? "unavailable" : "restricted",
          items: [],
          note: eccViewGrant === null ? "ECC access could not be verified." : "ECC attention needs ECC access.",
        },
        coverage: "unknown",
      };
    }
    const ecc = new EccOperationsServerService(access.organisationId);
    const [issues, requests, people] = await Promise.allSettled([
      ecc.listIssues(),
      ecc.listRequests(),
      ecc.getPeopleSnapshot(),
    ]);
    const items = eccIssueRequestAttentionItems({
      issues: issues.status === "fulfilled" ? issues.value : [],
      requests: requests.status === "fulfilled" ? requests.value : [],
    });
    let coverage: "gap" | "ok" | "unknown" = "unknown";
    if (people.status === "fulfilled") {
      const item = eccCoverageAttentionItem(people.value);
      coverage = eccCoverageGap(people.value) ? "gap" : "ok";
      if (item) items.push(item);
    }
    const missing: string[] = [];
    if (issues.status !== "fulfilled") missing.push("Issues");
    if (requests.status !== "fulfilled") missing.push("Requests");
    if (people.status !== "fulfilled") missing.push("shift coverage");
    const loadedCount = 3 - missing.length;
    const status =
      missing.length === 0 ? "loaded" : loadedCount === 0 ? "unavailable" : "partial";
    return {
      result: {
        domain: "ecc",
        status,
        items,
        note: missing.length ? `ECC ${missing.join(", ")} could not be evaluated.` : null,
      },
      coverage,
    };
  }

  private async composeEccPulse(
    access: CommandCentreAccessContext,
    workspaceEntry: WorkspaceAccessChrome,
    /** Undefined when shift coverage was not evaluated for this call. */
    coverage?: "gap" | "ok" | "unknown",
    context: { asOf: string; timeZone: string | null } = {
      asOf: new Date().toISOString(),
      timeZone: null,
    },
    eccViewGrant: boolean | null = true
  ): Promise<CommandCentrePulseCard> {
    if (hasModule(access.session.enabledModules, ECC_MODULE_SLUG) && eccViewGrant !== true) {
      return {
        domain: "ecc",
        label: "ECC",
        state: eccViewGrant === null ? "error" : "restricted",
        statusLabel: eccViewGrant === null ? "Unable to load" : "Restricted",
        lines: [eccViewGrant === null ? "ECC access could not be verified." : "ECC figures need ECC access."],
        href: null,
        disabledNavigationLabel: null,
      };
    }
    if (!hasModule(access.session.enabledModules, ECC_MODULE_SLUG)) {
      return {
        domain: "ecc",
        label: "ECC",
        state: "restricted",
        statusLabel: "Not enabled",
        lines: ["ECC Operations is not enabled for this organisation."],
        href: null,
        disabledNavigationLabel: null,
      };
    }

    try {
      const ecc = new EccOperationsServerService(access.organisationId);
      const overview = await ecc.getOverview();
      // No ECC operational evidence is NOT calm: distinguish "nothing recorded"
      // from "recorded, no exceptions found".
      const hasEvidence =
        overview.latestDailyOps != null ||
        overview.openIssueCount > 0 ||
        overview.openRequestCount > 0 ||
        overview.recentResolutions.length > 0 ||
        overview.recentActivity.length > 0;
      if (!hasEvidence) {
        return {
          domain: "ecc",
          label: "ECC",
          state: "empty",
          statusLabel: "No ECC activity",
          lines: ["No ECC operational data has been recorded yet."],
          href: workspaceEntry.eccOperations ? "/ecc-operations" : null,
          disabledNavigationLabel: workspaceEntry.eccOperations
            ? null
            : "Workspace access required",
        };
      }
      const lines: string[] = [];
      if (overview.escalatedIssueCount === 0 && overview.highUrgentOpenCount === 0) {
        lines.push("No escalated or high-priority items");
      } else {
        if (overview.escalatedIssueCount > 0) {
          lines.push(
            overview.escalatedIssueCount === 1
              ? "1 escalated issue"
              : `${overview.escalatedIssueCount} escalated issues`
          );
        }
        if (overview.highUrgentOpenCount > 0) {
          lines.push(
            overview.highUrgentOpenCount === 1
              ? "1 high/urgent open item"
              : `${overview.highUrgentOpenCount} high/urgent open items`
          );
        }
      }
      lines.push(
        `${overview.openIssueCount} open ${overview.openIssueCount === 1 ? "issue" : "issues"} · ${overview.openRequestCount} open ${overview.openRequestCount === 1 ? "request" : "requests"}`
      );
      // Staffing is shown as a recorded fact, never as a judgement.
      const staffingUnavailable = overview.staffingSourceUnavailable === true;
      if (staffingUnavailable) {
        lines.push("Staffing unavailable");
      } else if (typeof overview.staffingReadiness === "string" && overview.staffingReadiness.trim()) {
        lines.push(`Staffing: ${overview.staffingReadiness.trim()}`);
      }

      const partial = staffingUnavailable || coverage === "unknown";
      const pressured =
        overview.escalatedIssueCount > 0 ||
        overview.highUrgentOpenCount > 0 ||
        coverage === "gap";
      return {
        domain: "ecc",
        label: "ECC",
        state: "healthy",
        statusLabel: pressured
          ? "Needs attention"
          : partial
            ? "Partial view"
            : `Checked ${checkedTimeLabel(context.asOf, context.timeZone)}`.trim(),
        partial,
        lines,
        href: workspaceEntry.eccOperations ? "/ecc-operations" : null,
        disabledNavigationLabel: workspaceEntry.eccOperations
          ? null
          : "Workspace access required",
      };
    } catch {
      return {
        domain: "ecc",
        label: "ECC",
        state: "error",
        statusLabel: "Unable to load",
        lines: ["ECC pulse could not be loaded."],
        href: workspaceEntry.eccOperations ? "/ecc-operations" : null,
        disabledNavigationLabel: workspaceEntry.eccOperations
          ? null
          : "Workspace access required",
      };
    }
  }

  private async composeLastVisit(
    access: CommandCentreAccessContext,
    asOf: string,
    workspaceEntry: WorkspaceAccessChrome,
    fmContext: {
      fmEnabled: boolean;
      fm: FmChangeVisibility | null;
      /** Record-level Finance visibility (Finance access + companies); null = none. */
      financeScope?: FinanceRecordScope;
      /** ECC view grant held. */
      ecc?: boolean;
      eccEnabled?: boolean;
    } = { fmEnabled: false, fm: null }
  ): Promise<CommandCentreSnapshot["lastVisit"]> {
    const timeZone = organisationTimeZoneOrNull(access.session);
    const financeEnabled = financeModuleEnabled(access.session);
    const eccEnabled = fmContext.eccEnabled ?? hasModule(access.session.enabledModules, ECC_MODULE_SLUG);
    const financeScope = fmContext.financeScope ?? null;
    const visibility = {
      // Finance activity names records (purposes, amounts): it needs Finance access and stays in the actor's companies.
      finance: financeEnabled && financeScope && financeScope.companyIds.length ? { companyIds: financeScope.companyIds } : false,
      ecc: eccEnabled && fmContext.ecc === true,
      fm: fmContext.fm,
    } as const;
    // Facility Management changes come from FM's own authoritative records (never the legacy operational_events
    // stream), within the actor's FM authority and authorised facilities.
    const covered = [
      visibility.finance ? "Finance" : null,
      visibility.ecc ? "ECC" : null,
      visibility.fm ? "Facility Management" : null,
    ].filter(Boolean) as string[];
    const fmNotes: string[] = [];
    if (financeEnabled && !visibility.finance) fmNotes.push("Finance activity needs Finance access with company access");
    else if (visibility.finance) fmNotes.push("Finance activity is limited to your Finance companies");
    if (eccEnabled && !visibility.ecc) fmNotes.push("ECC activity needs ECC access");
    if (visibility.fm) {
      if (!visibility.fm.operations) fmNotes.push("Facility Management covers Costs & Claims only for your access");
      if (!visibility.fm.costsClaims) fmNotes.push("Facility Management Costs & Claims changes need Costs & Claims access");
      if (!visibility.fm.scope.unrestricted) fmNotes.push("Facility Management is limited to your authorised facilities");
    } else if (fmContext.fmEnabled) {
      fmNotes.push("Facility Management changes need Facility Management access");
    }
    const listed =
      covered.length <= 1 ? covered.join("") : `${covered.slice(0, -1).join(", ")} and ${covered[covered.length - 1]}`;
    const scope = covered.length
      ? [`Covers ${listed} activity.`, ...fmNotes.map((note) => `${note}.`)].join(" ")
      : "No change sources are enabled for this organisation.";
    if (covered.length === 0) {
      return {
        state: "unavailable",
        message: "No change sources are enabled.",
        detail: "",
        scope,
        items: [],
      };
    }

    const admin = createAdminClient();
    const { data: marker, error: markerError } = await admin
      .from("command_centre_visits")
      .select("last_visited_at")
      .eq("organisation_id", access.organisationId)
      .eq("profile_id", access.profileId)
      .maybeSingle();

    if (markerError) {
      return {
        state: "unavailable",
        message: "Change tracking is unavailable.",
        detail: "The visit marker could not be read.",
        scope,
        items: [],
      };
    }

    const previous = marker?.last_visited_at ? String(marker.last_visited_at) : null;
    if (!previous) {
      const { error: firstVisitError } = await admin
        .from("command_centre_visits")
        .insert({
          organisation_id: access.organisationId,
          profile_id: access.profileId,
          last_visited_at: asOf,
        });
      return {
        state: firstVisitError ? "error" : "empty",
        message: firstVisitError
          ? "Your visit marker could not be created."
          : "This is your first tracked Executive Office visit.",
        detail: firstVisitError
          ? "Changes cannot be measured yet."
          : "Changes will be measured from this visit onward.",
        scope,
        items: [],
      };
    }

    const changes = await composeLastVisitChanges({
      db: admin,
      organisationId: access.organisationId,
      previous,
      asOf,
      visibility,
      workspaceEntry: {
        platformFinance: workspaceEntry.platformFinance,
        eccOperations: workspaceEntry.eccOperations,
        facilityManagement: workspaceEntry.facilityManagement,
      },
      timeZone,
    });
    if (changes.sourceErrors.length > 0) {
      return {
        state: "error",
        message: "Changes could not be loaded.",
        detail: `Unavailable sources: ${changes.sourceErrors.join(", ")}. Your last-visit point was not moved.`,
        scope,
        items: [],
      };
    }

    // Contract preserved: the marker advances after each successful evaluation, so refreshing
    // moves "since your last visit" forward. (Separating "session start" from "previous visit"
    // would need a second stored timestamp — deliberately not introduced here.)
    const { error: writeError } = await admin
      .from("command_centre_visits")
      .update({ last_visited_at: asOf })
      .eq("organisation_id", access.organisationId)
      .eq("profile_id", access.profileId);
    if (writeError) {
      return {
        state: "error",
        message: "Your visit marker could not be updated.",
        detail: "Changes may repeat on your next visit.",
        scope,
        items: [],
      };
    }

    const total = changes.items.length;
    return {
      state: total === 0 ? "empty" : "healthy",
      message:
        total === 0
          ? `No ${covered.join(" or ")} changes since your last visit.`
          : `${total} recent change${total === 1 ? "" : "s"} since your last visit.`,
      detail: `Measured from ${measuredFromLabel(previous, timeZone)}.`,
      scope,
      items: changes.items,
    };
  }
}
