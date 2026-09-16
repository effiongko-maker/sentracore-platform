/**
 * Command Centre composition/read service.
 * Soft-composes domain snapshots; never invents metrics or bypasses domain auth.
 */
import { isActionError } from "@/lib/actions/errors";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { hasModule } from "@/lib/actions/moduleAccess";
import type { PlatformSession } from "@/lib/auth/types";
import type { CommandCentreAccessContext } from "@/modules/command-centre/server/requireCommandCentreAccess";
import type {
  CommandCentreAttentionItem,
  CommandCentreDecisionItem,
  CommandCentrePulseCard,
  CommandCentreSnapshot,
  CommandCentreSurfaceState,
} from "@/modules/command-centre/presentationTypes";
import { tryGetEccAccess } from "@/modules/ecc-operations/server/requireEccAccess";
import { EccOperationsServerService } from "@/modules/ecc-operations/server/EccOperationsServerService";
import {
  FINANCIAL_REQUEST_CAPABILITIES,
  PLATFORM_FINANCE_CAPABILITIES,
  PLATFORM_FINANCE_MODULE_SLUG,
  FINANCE_PAYABLE_CAPABILITIES,
} from "@/modules/platform-finance/types";
import { PlatformFinanceServerService } from "@/modules/platform-finance/server/PlatformFinanceServerService";
import { PlatformFinanceRequestsServerService } from "@/modules/platform-finance/server/PlatformFinanceRequestsServerService";
import { PlatformFinancePayablesServerService } from "@/modules/platform-finance/server/PlatformFinancePayablesServerService";
import { createAdminClient } from "@/utils/supabase/admin";

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

function greetingForNow(date: Date): string {
  // Organisation HQ context — Lagos local time for greeting cadence.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      hour12: false,
    }).format(date)
  );
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
    const greeting = `${greetingForNow(now)}, ${displayName}.`;

    const [financePulse, decisions, attentionFinance, eccPulse, attentionEcc] =
      await Promise.all([
        this.composeFinancePulse(access),
        this.composeDecisions(access),
        this.composeFinanceAttention(access),
        this.composeEccPulse(access),
        this.composeEccAttention(access),
      ]);

    const attentionItems = [...attentionFinance.items, ...attentionEcc.items].slice(
      0,
      8
    );
    const attentionState: CommandCentreSurfaceState =
      attentionFinance.state === "error" && attentionEcc.state === "error"
        ? "error"
        : attentionItems.length > 0
          ? "healthy"
          : attentionFinance.state === "restricted" &&
              attentionEcc.state === "restricted"
            ? "restricted"
            : attentionFinance.state === "unavailable" &&
                attentionEcc.state === "unavailable"
              ? "unavailable"
              : "empty";

    const pulse: CommandCentrePulseCard[] = [
      financePulse,
      {
        domain: "operations",
        label: "Operations",
        state: "unavailable",
        statusLabel: "Not connected yet",
        lines: [
          "Facility Management pulse is not composed server-side yet.",
          "Open Operations for live operational attention.",
        ],
        href: "/operations",
      },
      eccPulse,
      {
        domain: "projects_construction",
        label: "Projects & Construction",
        state: "unavailable",
        statusLabel: "Not available yet",
        lines: ["Coming soon to your Command Centre."],
        href: null,
      },
    ];

    return {
      asOf,
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
      lastVisit: {
        state: "unavailable",
        message: "Change tracking is not yet enabled.",
        detail:
          "Once last-visit infrastructure exists, this surface will show meaningful organisational changes.",
      },
      assignments: {
        state: "unavailable",
        message: "CEO assignments are not enabled yet.",
        detail:
          "Active assignments, due dates, updates, and outcomes will appear here when the domain is available.",
      },
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

  private async composeFinancePulse(
    access: CommandCentreAccessContext
  ): Promise<CommandCentrePulseCard> {
    const base: CommandCentrePulseCard = {
      domain: "finance",
      label: "Finance",
      state: "unavailable",
      statusLabel: "Unavailable",
      lines: ["Finance pulse could not be composed."],
      href: "/platform-finance",
    };

    if (!financeModuleEnabled(access.session)) {
      return {
        ...base,
        state: "restricted",
        statusLabel: "No access",
        lines: ["Platform Finance is not available for your account."],
        href: null,
      };
    }

    const canView = await hasFinanceCapability(
      access.organisationId,
      access.profileId,
      PLATFORM_FINANCE_CAPABILITIES.view
    );
    if (!canView) {
      return {
        ...base,
        state: "restricted",
        statusLabel: "No access",
        lines: ["Finance overview requires platform finance view access."],
        href: null,
      };
    }

    try {
      const finance = new PlatformFinanceServerService(access.organisationId);
      const overview = await finance.getOverview({
        profileId: access.profileId,
      });

      let openPayablesLine: string | null = null;
      const canViewPayables = await hasFinanceCapability(
        access.organisationId,
        access.profileId,
        FINANCE_PAYABLE_CAPABILITIES.view
      );
      if (canViewPayables) {
        try {
          const payablesSvc = new PlatformFinancePayablesServerService(
            access.organisationId
          );
          const payables = await payablesSvc.listAccessiblePayables(
            actorFromSession(access.session, access.organisationId)
          );
          const open = payables.filter(
            (p) =>
              p.status !== "paid" &&
              p.status !== "cancelled" &&
              p.status !== "rejected"
          );
          openPayablesLine =
            open.length === 1
              ? "1 open payable"
              : `${open.length} open payables`;
        } catch {
          openPayablesLine = null;
        }
      }

      const pending = overview.requests.pendingCeoApproval.count;
      const awaiting = overview.requests.awaitingReview.count;
      const lines: string[] = [];
      lines.push(
        pending === 1
          ? "1 pending CEO decision"
          : `${pending} pending CEO decisions`
      );
      if (openPayablesLine) {
        lines.push(openPayablesLine);
      } else if (awaiting > 0) {
        lines.push(
          awaiting === 1
            ? "1 request awaiting review"
            : `${awaiting} requests awaiting review`
        );
      }

      const busy = pending > 0 || awaiting > 0;
      return {
        domain: "finance",
        label: "Finance",
        state: "healthy",
        statusLabel: busy ? "Needs attention" : "Stable",
        lines,
        href: "/platform-finance",
      };
    } catch (error) {
      if (isActionError(error) && error.code === "FORBIDDEN") {
        return {
          ...base,
          state: "restricted",
          statusLabel: "No access",
          lines: ["Finance data is restricted for your account."],
          href: null,
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
    const empty: CommandCentreSnapshot["decisions"] = {
      state: "empty",
      items: [],
      viewAllHref: "/platform-finance/requests",
    };

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
    if (!canApprove) {
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
      const actor = actorFromSession(access.session, access.organisationId);
      const [queue, categories] = await Promise.all([
        requestsSvc.listApprovalQueue(actor),
        requestsSvc.listCategories(actor),
      ]);
      const categoryById = new Map(categories.map((c) => [c.id, c.name]));

      const items: CommandCentreDecisionItem[] = queue.map((request) => ({
        id: request.id,
        title: request.purpose?.trim() || "Financial request",
        reference: request.externalReference,
        categoryLabel: categoryById.get(request.categoryId) ?? null,
        amountLabel: formatAmount(request.requestedAmount, request.currency),
        currency: request.currency,
        href: `/platform-finance/requests/${request.id}`,
      }));

      return {
        state: items.length === 0 ? "empty" : "healthy",
        items,
        viewAllHref: "/platform-finance/requests",
      };
    } catch (error) {
      if (isActionError(error) && error.code === "FORBIDDEN") {
        return { state: "restricted", items: [], viewAllHref: null };
      }
      return { state: "error", items: [], viewAllHref: "/platform-finance/requests" };
    }
  }

  private async composeFinanceAttention(
    access: CommandCentreAccessContext
  ): Promise<{ state: CommandCentreSurfaceState; items: CommandCentreAttentionItem[] }> {
    if (!financeModuleEnabled(access.session)) {
      return { state: "restricted", items: [] };
    }
    const canView = await hasFinanceCapability(
      access.organisationId,
      access.profileId,
      PLATFORM_FINANCE_CAPABILITIES.view
    );
    if (!canView) return { state: "restricted", items: [] };

    try {
      const finance = new PlatformFinanceServerService(access.organisationId);
      const overview = await finance.getOverview({
        profileId: access.profileId,
      });
      const items: CommandCentreAttentionItem[] = overview.needsAttention.map(
        (item) => ({
          id: `finance:${item.id}`,
          title: item.label,
          detail: item.detail,
          tone:
            item.tone === "critical"
              ? "critical"
              : item.tone === "warning"
                ? "high"
                : "medium",
          href: "/platform-finance/requests",
          sourceLabel: "Finance",
        })
      );

      const pending = overview.requests.pendingCeoApproval.count;
      if (pending > 0) {
        items.unshift({
          id: "finance:pending_ceo",
          title:
            pending === 1
              ? "1 decision awaiting CEO approval"
              : `${pending} decisions awaiting CEO approval`,
          detail: formatAmount(
            overview.requests.pendingCeoApproval.totalAmount,
            "NGN"
          ),
          tone: "high",
          href: "/platform-finance/requests",
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
    access: CommandCentreAccessContext
  ): Promise<CommandCentrePulseCard> {
    void access;
    const eccAccess = await tryGetEccAccess();
    if (!eccAccess) {
      return {
        domain: "ecc",
        label: "ECC",
        state: "restricted",
        statusLabel: "No access",
        lines: ["ECC Operations is not available for your account."],
        href: null,
      };
    }

    try {
      const ecc = new EccOperationsServerService(eccAccess.organisationId);
      const overview = await ecc.getOverview();
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
        href: "/ecc-operations",
      };
    } catch {
      return {
        domain: "ecc",
        label: "ECC",
        state: "error",
        statusLabel: "Unable to load",
        lines: ["ECC pulse could not be loaded."],
        href: "/ecc-operations",
      };
    }
  }

  private async composeEccAttention(
    access: CommandCentreAccessContext
  ): Promise<{ state: CommandCentreSurfaceState; items: CommandCentreAttentionItem[] }> {
    void access;
    const eccAccess = await tryGetEccAccess();
    if (!eccAccess) return { state: "restricted", items: [] };

    try {
      const ecc = new EccOperationsServerService(eccAccess.organisationId);
      const overview = await ecc.getOverview();
      const items: CommandCentreAttentionItem[] = overview.attentionItems
        .slice(0, 5)
        .map((item) => ({
          id: `ecc:${item.id}`,
          title: item.title,
          detail: item.detail,
          tone:
            item.kind === "escalation"
              ? "critical"
              : item.kind === "issue"
                ? "high"
                : "medium",
          href: item.href,
          sourceLabel: "ECC",
        }));
      return {
        state: items.length === 0 ? "empty" : "healthy",
        items,
      };
    } catch {
      return { state: "error", items: [] };
    }
  }
}
