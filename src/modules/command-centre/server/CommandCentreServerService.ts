/**
 * Command Centre composition/read service.
 * Soft-composes domain snapshots; never invents metrics or bypasses domain auth.
 */
import { isActionError } from "@/lib/actions/errors";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { resolveOperatingAccess } from "@/lib/access/server";
import {
  resolveWorkspaceAccessChrome,
  type WorkspaceAccessChrome,
} from "@/lib/access/workspaceAccessChrome";
import { hasModule } from "@/lib/actions/moduleAccess";
import type { PlatformSession } from "@/lib/auth/types";
import type { CommandCentreAccessContext } from "@/modules/command-centre/server/requireCommandCentreAccess";
import type {
  CommandCentreAttentionItem,
  CommandCentrePulseCard,
  CommandCentreSnapshot,
  CommandCentreSurfaceState,
} from "@/modules/command-centre/presentationTypes";
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

async function hasFinanceCapability(
  organisationId: string,
  profileId: string,
  capability: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("capability", capability)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

async function hasPlatformCapability(
  organisationId: string,
  profileId: string,
  capability: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("capability", capability)
    .maybeSingle();
  return !error && Boolean(data);
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

export class CommandCentreServerService {
  /**
   * Compose Command Centre snapshot for an authorised CEO/orchestrator actor.
   * Domain soft-failures become unavailable/restricted — never fabricated zeros.
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
    });
    const fmEnabled =
      isPlatformSuperAdminFromSlugs(access.session.roleSlugs) ||
      hasModule(access.session.enabledModules, "facility_management");
    const operationalPicture = fmEnabled
      ? loadOperationalPictureSummary(asOf)
      : Promise.resolve<OperationalPictureSummary | null>(null);

    const [financePulse, operationsPulse, decisions, attentionFinance, eccPulse, assignments, lastVisit] =
      await Promise.all([
        this.composeFinancePulse(access, workspaceEntry),
        this.composeOperationsPulse(
          access,
          workspaceEntry,
          operationalPicture
        ),
        this.composeDecisions(access),
        this.composeFinanceAttention(access),
        this.composeEccPulse(access, workspaceEntry),
        this.composeAssignments(access),
        this.composeLastVisit(access, asOf, workspaceEntry),
      ]);

    const attentionItems = attentionFinance.items.slice(0, 8);
    const attentionState: CommandCentreSurfaceState =
      attentionFinance.state === "error"
        ? "error"
        : attentionItems.length > 0
          ? "healthy"
          : attentionFinance.state === "restricted"
            ? "restricted"
            : attentionFinance.state === "unavailable"
              ? "unavailable"
              : "empty";

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
      timeZone: organisationTimeZone,
      greeting,
      lede: "Here's what's happening across your organisation today.",
      profile: {
        displayName,
        jobTitle: access.session.profile.jobTitle,
        avatarUrl: access.session.profile.avatarUrl,
        initials: initialsFromName(displayName),
      },
      pulse,
      decisions,
      attention: {
        state: attentionState,
        items: attentionItems,
      },
      lastVisit,
      assignments,
      askSentraCore: {
        state: "unavailable",
        prompt: "What would you like to know?",
        suggestions: [
          "What's changed this week?",
          "What needs my attention?",
          "How are operations performing?",
          "What decisions are waiting?",
        ],
      },
    };
  }

  private async composeOperationsPulse(
    access: CommandCentreAccessContext,
    workspaceEntry: WorkspaceAccessChrome,
    operationalPicture: Promise<OperationalPictureSummary | null>
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
        statusLabel: "No access",
        lines: ["Facility Management is not available for your account."],
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

      return {
        domain: "operations",
        label: "Operations",
        state: "healthy",
        statusLabel: "Live data",
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
    workspaceEntry: WorkspaceAccessChrome
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
        statusLabel: "No access",
        lines: ["Platform Finance is not available for your account."],
        href: null,
        disabledNavigationLabel: null,
      };
    }

    try {
      const finance = new PlatformFinanceServerService(access.organisationId);
      const overview = await finance.getCommandCentreOverview({
        profileId: access.profileId,
      });

      let openPayablesLine: string | null = null;
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
        openPayablesLine = null;
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
      lines.push(
        openPayablesLine
          ? `${awaitingLine} · ${openPayablesLine}`
          : awaitingLine
      );

      const busy = pending > 0 || awaiting > 0;
      return {
        domain: "finance",
        label: "Finance",
        state: "healthy",
        statusLabel: busy ? "Needs attention" : "Stable",
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
          statusLabel: "No access",
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

  private async composeDecisions(access: CommandCentreAccessContext): Promise<
    CommandCentreSnapshot["decisions"]
  > {
    if (!financeModuleEnabled(access.session)) {
      return {
        state: "restricted",
        items: [],
        viewAllHref: null,
      };
    }

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
    if (!canApprove || !canDecide) {
      return {
        state: "restricted",
        items: [],
        viewAllHref: null,
      };
    }

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
      const { items } = composeFinanceDecisionQueue({
        requests,
        vendorBills,
        categories,
      });

      return {
        state: items.length === 0 ? "empty" : "healthy",
        items,
        viewAllHref: null,
      };
    } catch (error) {
      if (isActionError(error) && error.code === "FORBIDDEN") {
        return { state: "restricted", items: [], viewAllHref: null };
      }
      return { state: "error", items: [], viewAllHref: null };
    }
  }

  private async composeFinanceAttention(
    access: CommandCentreAccessContext
  ): Promise<{ state: CommandCentreSurfaceState; items: CommandCentreAttentionItem[] }> {
    if (!financeModuleEnabled(access.session)) {
      return { state: "restricted", items: [] };
    }
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
    if (!canApprove || !canDecide) return { state: "restricted", items: [] };

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
      const decisions = composeFinanceDecisionQueue({
        requests,
        vendorBills,
        categories,
      });
      const items: CommandCentreAttentionItem[] = [];

      const pending = decisions.items.length;
      if (pending > 0) {
        const amountDetail = [...decisions.totalsByCurrency.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([currency, amount]) => formatAmount(amount, currency))
          .join(" · ");
        items.unshift({
          id: "finance:pending_ceo",
          title:
            pending === 1
              ? "1 decision awaiting CEO approval"
              : `${pending} decisions awaiting CEO approval`,
          detail: amountDetail || null,
          tone: "high",
          href: "/platform-finance",
          sourceLabel: "Finance",
        });
      }

      return {
        state: items.length === 0 ? "empty" : "healthy",
        items,
      };
    } catch {
      return { state: "error", items: [] };
    }
  }

  private async composeEccPulse(
    access: CommandCentreAccessContext,
    workspaceEntry: WorkspaceAccessChrome
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
      // No ECC operational evidence is NOT stability: distinguish "nothing recorded"
      // from "recorded and calm".
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
      if (overview.highUrgentOpenCount === 0 && overview.escalatedIssueCount === 0) {
        lines.push("No critical alerts");
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
      const attention = overview.attentionItems.length;
      lines.push(
        attention === 0
          ? "No items need attention"
          : attention === 1
            ? "1 item needs attention"
            : `${attention} items need attention`
      );

      const pressured =
        overview.escalatedIssueCount > 0 || overview.highUrgentOpenCount > 0;
      return {
        domain: "ecc",
        label: "ECC",
        state: "healthy",
        statusLabel: pressured ? "Needs attention" : "Stable",
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

  private async composeAssignments(
    access: CommandCentreAccessContext
  ): Promise<CommandCentreSnapshot["assignments"]> {
    if (!hasModule(access.session.enabledModules, "facility_management")) {
      return {
        state: "unavailable",
        message: "No assignment source is enabled.",
        detail: "Facility Management is not enabled for this organisation.",
        items: [],
      };
    }
    try {
      type DomainSource =
        | { state: "healthy"; active: number }
        | { state: "unavailable" };

      let workSource: DomainSource = { state: "unavailable" };
      try {
        const { FmWorkRepository } = await import(
          "@/modules/maintenance/server/FmWorkRepository"
        );
        const count = await new FmWorkRepository(
          access.organisationId
        ).countActiveForProfile(access.profileId);
        workSource = { state: "healthy", active: count };
      } catch {
        workSource = { state: "unavailable" };
      }

      // Phase 2D: Incidents are Supabase — profile UUID, no identity-link hop.
      let incidentsSource: DomainSource = { state: "unavailable" };
      try {
        const { FmIncidentRepository } = await import(
          "@/modules/incidents/server/FmIncidentRepository"
        );
        const count = await new FmIncidentRepository(
          access.organisationId
        ).countActiveForProfile(access.profileId);
        incidentsSource = { state: "healthy", active: count };
      } catch {
        incidentsSource = { state: "unavailable" };
      }

      // Phase 2E: Work Instructions are Supabase — profile UUID, no identity-link hop.
      let workOrdersSource: DomainSource = { state: "unavailable" };
      try {
        const { FmWorkInstructionRepository } = await import(
          "@/modules/work-orders/server/FmWorkInstructionRepository"
        );
        const count = await new FmWorkInstructionRepository(
          access.organisationId
        ).countAssignedForProfile(access.profileId);
        workOrdersSource = { state: "healthy", active: count };
      } catch {
        workOrdersSource = { state: "unavailable" };
      }

      const domains = [
        {
          id: "assigned-work",
          label: "Assigned Work",
          href: "/work",
          source: workSource,
        },
        {
          id: "assigned-work-orders",
          label: "Assigned Work Orders",
          href: "/work-orders",
          source: workOrdersSource,
        },
        {
          id: "assigned-legacy-incidents",
          label: "Legacy Incidents Assigned",
          href: "/incidents",
          source: incidentsSource,
        },
      ];
      const unavailable = domains.filter(
        (item) => item.source.state === "unavailable"
      );
      if (unavailable.length === domains.length) {
        return {
          state: "error",
          message: "Assignments could not be loaded.",
          detail: "Facility Management assignment data is temporarily unavailable.",
          items: [],
        };
      }
      const assigned = domains
        .filter(
          (item) =>
            item.source.state === "unavailable" || item.source.active > 0
        )
        .map((item) => ({
          id: item.id,
          label: item.label,
          count:
            item.source.state === "healthy" ? item.source.active : null,
          state:
            item.source.state === "healthy"
              ? ("healthy" as const)
              : ("unavailable" as const),
          href: item.href,
        }));
      return {
        state: assigned.length === 0 ? "empty" : "healthy",
        message: assigned.length === 0 ? "You have no active assignments." : "",
        detail:
          "Work, Work Instructions and Incidents all use your profile identity.",
        items: assigned,
      };
    } catch {
      return {
        state: "error",
        message: "Assignments could not be loaded.",
        detail: "Facility Management assignment data is temporarily unavailable.",
        items: [],
      };
    }
  }

  private async composeLastVisit(
    access: CommandCentreAccessContext,
    asOf: string,
    workspaceEntry: WorkspaceAccessChrome
  ): Promise<CommandCentreSnapshot["lastVisit"]> {
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
        message: "Change tracking is awaiting its database migration.",
        detail: markerError.message,
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
        detail: firstVisitError?.message ?? "Changes will be measured from this visit onward.",
        items: [],
      };
    }

    const visibility = {
      operations: hasModule(access.session.enabledModules, "facility_management"),
      finance: financeModuleEnabled(access.session),
      ecc: hasModule(access.session.enabledModules, ECC_MODULE_SLUG),
    };
    const changes = await composeLastVisitChanges({
      db: admin,
      organisationId: access.organisationId,
      previous,
      asOf,
      visibility,
      workspaceEntry,
      timeZone: organisationTimeZoneOrNull(access.session),
    });
    if (changes.sourceErrors.length > 0) {
      return {
        state: "error",
        message: "Changes could not be loaded.",
        detail: `Unavailable sources: ${changes.sourceErrors.join(", ")}. Visit marker was not advanced.`,
        items: [],
      };
    }

    const { error: writeError } = await admin
      .from("command_centre_visits")
      .update({ last_visited_at: asOf })
      .eq("organisation_id", access.organisationId)
      .eq("profile_id", access.profileId);
    if (writeError) {
      return {
        state: "error",
        message: "Your visit marker could not be updated.",
        detail: writeError.message,
        items: [],
      };
    }

    const total = changes.items.length;
    return {
      state: total === 0 ? "empty" : "healthy",
      message:
        total === 0
          ? "No meaningful changes since your last visit."
          : `${total} meaningful change${total === 1 ? "" : "s"} since your last visit.`,
      detail: `Measured from ${previous}.`,
      items: changes.items,
    };
  }
}
