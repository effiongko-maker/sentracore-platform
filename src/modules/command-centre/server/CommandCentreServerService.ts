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
import { ECC_MODULE_SLUG } from "@/modules/ecc-operations/types";
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
import { buildOperationalPictureMetricsFromAggregate } from "@/modules/workspace/operationalPicture";
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
import { composeLastVisitChanges } from "@/modules/command-centre/server/composeLastVisitChanges";
import { composeFinanceDecisionQueue } from "@/modules/command-centre/server/composeFinanceDecisionQueue";
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

type FinanceQueueResult =
  | { status: "not_enabled" | "restricted" | "unavailable" }
  | { status: "loaded"; decisions: ReturnType<typeof composeFinanceDecisionQueue> };

export class CommandCentreServerService {
  /**
   * Compose the executive console for an authorised CEO/orchestrator actor.
   * Every domain is evaluated independently and keeps its own state: a failed or restricted
   * domain never contributes zero / "stable" / "nothing requires attention".
   */
  async load(
    access: CommandCentreAccessContext
  ): Promise<CommandCentreSnapshot> {
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
    const operationalPicture = fmViewAllowed
      ? loadOperationalPictureSummary(asOf)
      : Promise.resolve<OperationalPictureSummary | null>(null);

    const [financePulse, operationsPulse, financeQueue, eccAttention, fmAttention, lastVisit, commitmentsResult] =
      await Promise.all([
        this.composeFinancePulse(access, workspaceEntry, asOf, organisationTimeZone),
        this.composeOperationsPulse(
          access,
          workspaceEntry,
          operationalPicture,
          { asOf, timeZone: organisationTimeZone, fmViewAllowed }
        ),
        this.loadFinanceQueue(access),
        this.evaluateEccAttention(access),
        this.evaluateFmAttention(access, operationalPicture, fmViewAllowed),
        this.composeLastVisit(access, asOf, workspaceEntry),
        this.loadCommitments(access, now, organisationTimeZone),
      ]);
    const eccPulse = await this.composeEccPulse(
      access,
      workspaceEntry,
      eccAttention.coverage,
      { asOf, timeZone: organisationTimeZone }
    );

    const attention = composeExecutiveAttention([
      this.financeAttentionResult(financeQueue),
      eccAttention.result,
      fmAttention,
      commitmentsResult.attention,
    ]);

    const pulse: CommandCentrePulseCard[] = [
      financePulse,
      operationsPulse,
      eccPulse,
      {
        domain: "projects_construction",
        label: "Projects & Construction",
        state: "unavailable",
        statusLabel: "Not available yet",
        lines: ["Coming soon to your Command Centre."],
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

  private async composeOperationsPulse(
    access: CommandCentreAccessContext,
    workspaceEntry: WorkspaceAccessChrome,
    operationalPicture: Promise<OperationalPictureSummary | null>,
    context: { asOf: string; timeZone: string | null; fmViewAllowed: boolean } = {
      asOf: new Date().toISOString(),
      timeZone: null,
      fmViewAllowed: true,
    }
  ): Promise<CommandCentrePulseCard> {
    const base: CommandCentrePulseCard = {
      domain: "operations",
      label: "Operations",
      state: "unavailable",
      statusLabel: "Unavailable",
      lines: ["Facility Management data is unavailable."],
      href: workspaceEntry.facilityManagement ? "/operations" : null,
      disabledNavigationLabel: workspaceEntry.facilityManagement
        ? null
        : "Workspace access required",
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
    if (!context.fmViewAllowed) {
      return {
        ...base,
        state: "restricted",
        statusLabel: "Restricted",
        lines: ["Facility Management figures need Facility Management access."],
        href: null,
        disabledNavigationLabel: null,
      };
    }

    try {
      const aggregate = await operationalPicture;
      if (!aggregate) return base;
      const picture = buildOperationalPictureMetricsFromAggregate(aggregate);
      const value = (count: number | null) =>
        count == null ? "Unavailable" : count.toLocaleString("en-NG");
      const available = Object.values(picture).some((count) => count != null);

      if (!available) {
        return {
          ...base,
          state: "error",
          statusLabel: "Unable to load",
          lines: ["Facility Management pulse could not be loaded."],
        };
      }

      const partial = Object.values(picture).some((count) => count == null);
      const exception = (picture.critical ?? 0) > 0 || (picture.overdue ?? 0) > 0;
      return {
        domain: "operations",
        label: "Operations",
        state: "healthy",
        statusLabel: partial
          ? "Partial view"
          : exception
            ? "Needs attention"
            : `Checked ${checkedTimeLabel(context.asOf, context.timeZone)}`.trim(),
        partial,
        lines: [
          `Critical ${value(picture.critical)} · In Progress ${value(picture.inProgress)}`,
          `Awaiting Action ${value(picture.awaitingAction)} · Overdue ${value(picture.overdue)}`,
        ],
        href: workspaceEntry.facilityManagement ? "/operations" : null,
        disabledNavigationLabel: workspaceEntry.facilityManagement
          ? null
          : "Workspace access required",
      };
    } catch {
      return {
        ...base,
        state: "error",
        statusLabel: "Unable to load",
        lines: ["Facility Management pulse could not be loaded."],
      };
    }
  }

  private async composeFinancePulse(
    access: CommandCentreAccessContext,
    workspaceEntry: WorkspaceAccessChrome,
    asOf: string = new Date().toISOString(),
    timeZone: string | null = null
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

    if (!financeModuleEnabled(access.session)) {
      return {
        ...base,
        state: "restricted",
        statusLabel: "Not enabled",
        lines: ["Platform Finance is not enabled for this organisation."],
        href: null,
        disabledNavigationLabel: null,
      };
    }

    try {
      const finance = new PlatformFinanceServerService(access.organisationId);
      const overview = await finance.getCommandCentreOverview({
        profileId: access.profileId,
      });

      // A failed payables read is an explicit partial state — never a silently missing line.
      let openPayablesLine: string;
      let payablesFailed = false;
      try {
        const payablesSvc = new PlatformFinancePayablesServerService(
          access.organisationId
        );
        const payables = await payablesSvc.listCommandCentrePayables(
          access.profileId
        );
        const open = payables.filter(
          (p) =>
            p.status !== "paid" &&
            p.status !== "cancelled" &&
            p.status !== "rejected"
        );
        openPayablesLine =
          open.length === 1 ? "1 open payable" : `${open.length} open payables`;
      } catch {
        payablesFailed = true;
        openPayablesLine = "Open payables unavailable";
      }

      const pending = overview.pendingCeoDecisions.count;
      const awaiting = overview.requests.awaitingReview.count;
      const lines: string[] = [];
      lines.push(
        pending === 1
          ? "1 pending CEO decision"
          : `${pending} pending CEO decisions`
      );
      const awaitingLine =
        awaiting === 1
          ? "1 awaiting Finance review"
          : `${awaiting} awaiting Finance review`;
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
        href: workspaceEntry.platformFinance ? "/platform-finance" : null,
        disabledNavigationLabel: workspaceEntry.platformFinance
          ? null
          : "Workspace access required",
      };
    } catch (error) {
      if (isActionError(error) && error.code === "FORBIDDEN") {
        return {
          ...base,
          state: "restricted",
          statusLabel: "Restricted",
          lines: ["Finance data is restricted for your account."],
          href: null,
          disabledNavigationLabel: null,
        };
      }
      return {
        ...base,
        state: "error",
        statusLabel: "Unable to load",
        lines: ["Finance pulse could not be loaded."],
      };
    }
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
      const [requests, vendorBills, categories] = await Promise.all([
        requestsSvc.listApprovalQueue(actor),
        vendorBillsSvc.listApprovalQueue(actor),
        requestsSvc.listCategories(actor),
      ]);
      return {
        status: "loaded",
        decisions: composeFinanceDecisionQueue({ requests, vendorBills, categories }),
      };
    } catch (error) {
      if (isActionError(error) && error.code === "FORBIDDEN") {
        return { status: "restricted" };
      }
      return { status: "unavailable" };
    }
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
        };
      case "restricted":
        return {
          state: "restricted",
          items: [],
          viewAllHref: null,
          reason:
            "Finance decisions are shown to people with Finance approval authority and Command Centre decision access.",
        };
      case "unavailable":
        return {
          state: "error",
          items: [],
          viewAllHref: null,
          reason: "The Finance decision queue could not be read.",
        };
      case "loaded":
        return {
          state: queue.decisions.items.length === 0 ? "empty" : "healthy",
          items: queue.decisions.items,
          viewAllHref: null,
          reason: null,
        };
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
    const amountDetail =
      [...totalsByCurrency.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => formatAmount(amount, currency))
        .join(" · ") || null;
    return {
      domain: "finance",
      status: "loaded",
      items: financeAttentionItems({ pendingCount: items.length, amountDetail }),
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
    access: CommandCentreAccessContext
  ): Promise<{ result: DomainAttentionResult; coverage: "gap" | "ok" | "unknown" }> {
    if (!hasModule(access.session.enabledModules, ECC_MODULE_SLUG)) {
      return {
        result: { domain: "ecc", status: "not_enabled", items: [] },
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
    }
  ): Promise<CommandCentrePulseCard> {
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
    workspaceEntry: WorkspaceAccessChrome
  ): Promise<CommandCentreSnapshot["lastVisit"]> {
    const timeZone = organisationTimeZoneOrNull(access.session);
    const visibility = {
      finance: financeModuleEnabled(access.session),
      ecc: hasModule(access.session.enabledModules, ECC_MODULE_SLUG),
    };
    // Facility Management is deliberately NOT part of this feed: its only change history is the
    // legacy operational_events stream, which is not reconciled to current FM records.
    const covered = [visibility.finance ? "Finance" : null, visibility.ecc ? "ECC" : null].filter(
      Boolean
    ) as string[];
    const scope = covered.length
      ? `Covers ${covered.join(" and ")} activity only. Facility Management changes are not included.`
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
          : "This is your first tracked Command Centre visit.",
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
      workspaceEntry,
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
