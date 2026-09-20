"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  MessageSquare,
  Plus,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { ModeFrame } from "@/components/platform";
import { cn, formatRelativeTime } from "@/lib/utils";
import type {
  AttentionMatter,
  AttentionModel,
  OrganisationalPulse,
  WorkspaceQuickAction,
  WorkspaceSnapshot,
} from "../types";
import { FinancialPositionSection } from "./FinancialPositionSection";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import {
  accessCan,
  canSeeHref,
  resolveAccessVisibility,
  type AccessVisibility,
} from "@/lib/access";
import { signalHomeFinanceSettled } from "../utils/homeWorkspaceReady";

const PRIMARY_ACTION_IDS = [
  "log-issue",
  "create-work-order",
  "review-approvals",
] as const;

const ACTION_VISUAL: Record<
  (typeof PRIMARY_ACTION_IDS)[number],
  { icon: LucideIcon; tone: "blue" | "amber" | "violet" }
> = {
  "log-issue": { icon: Plus, tone: "blue" },
  "create-work-order": { icon: ClipboardList, tone: "amber" },
  "review-approvals": { icon: ClipboardCheck, tone: "violet" },
};

/** View-only oversight destinations for Executive Home (no Users). */
const EXECUTIVE_OVERSIGHT_LINKS: Array<{
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: "blue" | "amber" | "violet" | "green";
}> = [
  {
    href: "/approvals",
    title: "Approvals",
    description: "Decisions and packages awaiting review",
    icon: ClipboardCheck,
    tone: "amber",
  },
  {
    href: "/requests",
    title: "Requests",
    description: "Intake and facility requests across the organisation",
    icon: MessageSquare,
    tone: "blue",
  },
  {
    href: "/finance",
    title: "Finance",
    description: "Costs, claims, and reimbursement position",
    icon: Banknote,
    tone: "green",
  },
  {
    href: "/work",
    title: "Work",
    description: "Open and critical operational work",
    icon: Wrench,
    tone: "violet",
  },
];

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string): string {
  if (!name?.trim()) return "there";
  return name.trim().split(/\s+/)[0] ?? "there";
}

function padCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return value < 10 ? `0${value}` : String(value);
}

function formatMetric(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

function heroCriticalWorkMeta(
  criticalWork: number | null,
  attentionTotal: number,
  attentionIncomplete: boolean
): string {
  if (criticalWork == null) {
    return attentionIncomplete
      ? "Work data temporarily unavailable"
      : "Unavailable";
  }
  if (criticalWork > 0) {
    return "Require immediate intervention";
  }
  if (attentionIncomplete && attentionTotal === 0) {
    return "Attention picture incomplete";
  }
  if (attentionTotal > 0) {
    return attentionTotal === 1
      ? "1 matter requires attention"
      : `${attentionTotal} matters require attention`;
  }
  return "None requiring intervention";
}

function buildHeroCopy(
  snapshot: WorkspaceSnapshot,
  oversight: boolean
): {
  heading: string;
  line1: string;
  line2: string;
} {
  const { pulse, attention, operationalState } = snapshot;
  const attentionTotal = attention.total;

  if (operationalState.tone === "degraded") {
    return {
      heading: oversight
        ? "Organisation overview is limited"
        : "Operational overview is limited",
      line1: operationalState.statement,
      line2:
        operationalState.subtext ??
        "Some live operational data is temporarily unavailable.",
    };
  }

  if (attentionTotal > 0) {
    if (oversight) {
      return {
        heading: "Organisation status needs attention",
        line1:
          attentionTotal === 1
            ? "1 matter requires attention across the organisation."
            : `${attentionTotal} matters require attention across the organisation.`,
        line2: `${formatMetric(pulse.criticalWork)} critical work · ${formatMetric(pulse.openWork)} open work · ${formatMetric(pulse.openWorkOrders)} work orders.`,
      };
    }
    return {
      heading: "Your operations need attention",
      line1:
        attentionTotal === 1
          ? "1 matter requires action across your facilities."
          : `${attentionTotal} matters require action across your facilities.`,
      line2: `${formatMetric(pulse.criticalWork)} critical work · ${formatMetric(pulse.openWork)} open work · ${formatMetric(pulse.openWorkOrders)} work orders.`,
    };
  }

  if (operationalState.tone === "attention") {
    return {
      heading: oversight
        ? "Organisation status needs attention"
        : "Your operations need attention",
      line1: operationalState.statement,
      line2:
        operationalState.subtext ??
        `${formatMetric(pulse.openWork)} open work · ${formatMetric(pulse.openWorkOrders)} work orders.`,
    };
  }

  if (oversight) {
    return {
      heading: "Organisation status is stable",
      line1: "No matters require escalation across the organisation.",
      line2:
        (pulse.openWork ?? 0) > 0
          ? `${pulse.openWork} open work item${
              pulse.openWork === 1 ? "" : "s"
            } ${pulse.openWork === 1 ? "is" : "are"} in flow with no urgent escalation.`
          : "Operations appear calm. Drill into Work or Finance for detail.",
    };
  }

  return {
    heading: "Your operations are stable",
    line1: "No matters require intervention across your facilities.",
    line2:
      (pulse.openWork ?? 0) > 0
        ? `${pulse.openWork} open work item${
            pulse.openWork === 1 ? "" : "s"
          } ${pulse.openWork === 1 ? "is" : "are"} in flow with no urgent escalation.`
        : "Facility Management is calm. Continue with scheduled work.",
  };
}

/**
 * Executive-only: reframe mutate-oriented attention CTAs as review/open language.
 * Hrefs stay unchanged.
 */
function oversightAttentionLabel(label: string): string {
  let next = label.replace(/\s*→\s*$/, "").trim();
  const replacements: Array<[RegExp, string]> = [
    [/^Create work order$/i, "Review work"],
    [/^Open work order$/i, "Open work order"],
    [/^Assign work$/i, "Open work"],
    [/^Submit approval$/i, "Review approval"],
    [/^Create approval$/i, "Review approval"],
    [/^Record follow-up$/i, "Review approval"],
    [/^Resolve rejection$/i, "Review approval"],
    [/^Clarify approval$/i, "Review approval"],
    [/^Track approval$/i, "Review approval"],
    [/^Open approval$/i, "Review approval"],
    [/^Review people$/i, "Review organisation"],
    [/^Review incident$/i, "Review incident"],
    [/^View legacy incident$/i, "View legacy incident"],
    [/^Review work$/i, "Review work"],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(next)) return replacement;
  }
  if (/^create\b/i.test(next)) {
    return next.replace(/^create\b/i, "Review");
  }
  if (/^submit\b/i.test(next)) {
    return next.replace(/^submit\b/i, "Review");
  }
  if (/^assign\b/i.test(next)) {
    return next.replace(/^assign\b/i, "Open");
  }
  return next;
}

function isUsersHref(href: string): boolean {
  const path = href.split("?")[0] ?? href;
  return path === "/users" || path.startsWith("/users/");
}

function FacilityBlueprint() {
  return (
    <div className="sc-fm-blueprint" aria-hidden>
      <div className="sc-fm-blueprint-glow" />
      <svg
        className="sc-fm-blueprint-svg"
        viewBox="0 0 480 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g stroke="currentColor" strokeWidth="1.2" opacity="0.9">
          <path d="M48 300 L48 128 L150 64 L252 128 L252 300 Z" />
          <path d="M150 64 L150 300" opacity="0.55" />
          <path d="M48 170 L252 170" opacity="0.45" />
          <path d="M48 210 L252 210" opacity="0.4" />
          <path d="M48 250 L252 250" opacity="0.35" />
          <rect x="78" y="186" width="32" height="24" opacity="0.55" />
          <rect x="140" y="186" width="32" height="24" opacity="0.55" />
          <rect x="190" y="186" width="32" height="24" opacity="0.5" />
          <rect x="78" y="226" width="32" height="24" opacity="0.5" />
          <rect x="140" y="226" width="32" height="24" opacity="0.5" />
          <rect x="190" y="226" width="32" height="24" opacity="0.45" />
          <rect x="118" y="260" width="48" height="40" opacity="0.65" />

          <path d="M236 300 L236 96 L340 28 L444 96 L444 300 Z" />
          <path d="M340 28 L340 300" opacity="0.55" />
          <path d="M236 140 L444 140" opacity="0.45" />
          <path d="M236 180 L444 180" opacity="0.4" />
          <path d="M236 220 L444 220" opacity="0.38" />
          <path d="M236 260 L444 260" opacity="0.35" />
          <rect x="268" y="154" width="34" height="22" opacity="0.55" />
          <rect x="324" y="154" width="34" height="22" opacity="0.55" />
          <rect x="380" y="154" width="34" height="22" opacity="0.5" />
          <rect x="268" y="194" width="34" height="22" opacity="0.5" />
          <rect x="324" y="194" width="34" height="22" opacity="0.5" />
          <rect x="380" y="194" width="34" height="22" opacity="0.45" />
          <rect x="268" y="234" width="34" height="22" opacity="0.45" />
          <rect x="324" y="234" width="34" height="22" opacity="0.45" />
          <rect x="310" y="268" width="52" height="32" opacity="0.65" />

          <path d="M188 300 L188 150 L236 118" opacity="0.35" />
          <path d="M80 300 L444 300" opacity="0.25" />
        </g>
        <g fill="currentColor">
          <circle cx="150" cy="64" r="3.2" opacity="0.95" />
          <circle cx="340" cy="28" r="3.5" opacity="1" />
          <circle cx="252" cy="128" r="2.4" opacity="0.7" />
          <circle cx="236" cy="96" r="2.2" opacity="0.65" />
          <circle cx="444" cy="96" r="2.6" opacity="0.8" />
          <circle cx="310" cy="220" r="2" opacity="0.55" />
          <circle cx="140" cy="210" r="1.8" opacity="0.5" />
        </g>
      </svg>
    </div>
  );
}

function CommandHero({
  snapshot,
  oversight,
}: {
  snapshot: WorkspaceSnapshot;
  oversight: boolean;
}) {
  const { pulse, attention, currentUser, asOf } = snapshot;
  const attentionTotal = attention.total;
  const attentionIncomplete = Boolean(attention.incomplete);
  const criticalWork = pulse.criticalWork;
  const copy = buildHeroCopy(snapshot, oversight);
  const hour = new Date(asOf).getHours();
  const greeting = `${greetingForHour(hour)}, ${firstName(currentUser.name)}`;
  const live = snapshot.operationalState.tone !== "degraded";
  const updated = formatRelativeTime(asOf);
  const heroStress =
    attentionTotal > 0 || (criticalWork != null && criticalWork > 0);

  return (
    <section
      className={cn(
        "sc-fm-hero",
        heroStress ? "sc-fm-hero-critical" : "sc-fm-hero-stable"
      )}
      aria-labelledby="sc-fm-hero-heading"
    >
      <div className="sc-fm-hero-grid" aria-hidden />
      <FacilityBlueprint />

      <div className="sc-fm-hero-body">
        <div className="sc-fm-hero-copy">
          <p className="sc-fm-hero-eyebrow">
            {oversight ? "Organisation oversight" : "Facility Management"}
          </p>
          <p className="sc-fm-hero-greeting">{greeting}</p>
          <h1 id="sc-fm-hero-heading" className="sc-fm-hero-title">
            {copy.heading}
          </h1>
          <p className="sc-fm-hero-line">{copy.line1}</p>
          <p className="sc-fm-hero-line sc-fm-hero-line-muted">{copy.line2}</p>
          <p className="sc-fm-hero-live">
            <span
              className={cn(
                "sc-fm-hero-live-dot",
                live ? "is-on" : "is-off"
              )}
              aria-hidden
            />
            <span>
              {live ? "Live" : "Limited"} · Updated {updated}
            </span>
          </p>
        </div>

        <div className="sc-fm-hero-metrics" aria-label="Operational status">
          <Link
            href="/work"
            className="sc-fm-hero-critical-tile sc-fm-hero-critical-link"
          >
            <p className="sc-fm-hero-critical-value">{padCount(criticalWork)}</p>
            <p className="sc-fm-hero-critical-label">Critical work</p>
            <p className="sc-fm-hero-critical-meta">
              {heroCriticalWorkMeta(
                criticalWork,
                attentionTotal,
                attentionIncomplete
              )}
            </p>
          </Link>

          <div className="sc-fm-hero-metric">
            <p className="sc-fm-hero-metric-value">
              {formatMetric(pulse.openWork)}
            </p>
            <p className="sc-fm-hero-metric-label">Open work</p>
          </div>
          <div className="sc-fm-hero-metric">
            <p className="sc-fm-hero-metric-value">
              {formatMetric(pulse.openWorkOrders)}
            </p>
            <p className="sc-fm-hero-metric-label">Work orders</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RequiresAttention({
  attention,
  oversight,
}: {
  attention: AttentionModel;
  oversight: boolean;
}) {
  const incomplete = Boolean(attention.incomplete);
  const lede = incomplete
    ? attention.total === 0
      ? "Attention picture is incomplete — some operational data is temporarily unavailable."
      : attention.total === 1
        ? "1 known matter requires intervention · attention picture is incomplete"
        : `${attention.total} known matters require intervention · attention picture is incomplete`
    : attention.total === 0
      ? "No matters require intervention now"
      : attention.total === 1
        ? "1 matter requires intervention now"
        : `${attention.total} matters require intervention now`;

  const visibleMatters: AttentionMatter[] = oversight
    ? attention.visible.filter((matter) => !isUsersHref(matter.href))
    : attention.visible;

  const visibleTotal = oversight
    ? // Keep headline total from model; only filter rendered /users rows.
      attention.total
    : attention.total;

  return (
    <section
      className="sc-fm-attention"
      aria-labelledby="sc-fm-attention-heading"
    >
      <div className="sc-fm-attention-header">
        <div>
          <h2 id="sc-fm-attention-heading" className="sc-fm-panel-title">
            Requires attention
          </h2>
          <p className="sc-fm-panel-lede">{lede}</p>
        </div>
        {attention.viewAllHref && !isUsersHref(attention.viewAllHref) ? (
          <Link href={attention.viewAllHref} className="sc-fm-view-all">
            View all ({visibleTotal})
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {attention.total === 0 || visibleMatters.length === 0 ? (
        <div className="sc-fm-attention-empty">
          <p>
            {incomplete
              ? "Some operational sources could not be loaded. Retry Home or open Work directly."
              : oversight
                ? "No organisational matters require attention now."
                : "The operational queue is clear."}
          </p>
        </div>
      ) : (
        <div className="sc-fm-queue">
          {visibleMatters.map((matter) => {
            const actionLabel = oversight
              ? oversightAttentionLabel(matter.actionLabel)
              : matter.actionLabel.replace(/\s*→\s*$/, "");
            return (
              <Link
                key={matter.id}
                href={matter.href}
                className={cn(
                  "sc-fm-queue-item",
                  matter.severity === "critical"
                    ? "sc-fm-queue-critical"
                    : "sc-fm-queue-high"
                )}
              >
                <div className="sc-fm-queue-main">
                  <p className="sc-fm-queue-severity">
                    <span className="sc-fm-queue-dot" aria-hidden />
                    {matter.severity === "critical" ? "Critical" : "High"}
                  </p>
                  <p className="sc-fm-queue-title">{matter.title}</p>
                  <p className="sc-fm-queue-context">
                    {matter.location} · {matter.entityLabel}
                  </p>
                  <p className="sc-fm-queue-reason">{matter.reason}</p>
                </div>
                <span className="sc-fm-queue-action">
                  {actionLabel}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OperationalPicture({
  pulse,
  enriching = false,
}: {
  pulse: OrganisationalPulse;
  enriching?: boolean;
}) {
  const picture = pulse.picture;
  const rows = [
    {
      value: picture.critical,
      label: "Critical",
      detail:
        picture.critical == null
          ? "Temporarily unavailable"
          : "Requires immediate intervention",
      href: "/work",
      tone: "critical" as const,
      icon: AlertTriangle,
    },
    {
      value: picture.inProgress,
      label: "In Progress",
      detail:
        picture.inProgress == null
          ? "Temporarily unavailable"
          : "Currently being executed",
      href: "/work",
      tone: "blue" as const,
      icon: Wrench,
    },
    {
      value: picture.awaitingAction,
      label: "Awaiting Action",
      detail:
        picture.awaitingAction == null
          ? enriching
            ? "Loading…"
            : "Temporarily unavailable"
          : "Waiting on action or decision",
      href: "/approvals",
      tone: "amber" as const,
      icon: ClipboardCheck,
    },
    {
      value: picture.overdue,
      label: "Overdue",
      detail:
        picture.overdue == null
          ? "Temporarily unavailable"
          : "Past expected completion",
      href: "/work",
      tone: "amber" as const,
      icon: ClipboardList,
    },
  ];

  return (
    <section
      className="sc-fm-picture"
      aria-labelledby="sc-fm-picture-heading"
    >
      <h2 id="sc-fm-picture-heading" className="sc-fm-panel-title">
        Operational picture
      </h2>
      <p className="sc-fm-panel-lede">
        A snapshot of operational state right now
      </p>

      <div className="sc-fm-picture-list" role="list">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.label}
              href={row.href}
              className={cn("sc-fm-picture-row", `sc-fm-picture-${row.tone}`)}
              role="listitem"
            >
              <span className="sc-fm-picture-icon" aria-hidden>
                <Icon className="h-4 w-4" />
              </span>
              <span className="sc-fm-picture-copy">
                <span className="sc-fm-picture-metric">
                  <span className="sc-fm-picture-value">
                    {padCount(row.value)}
                  </span>{" "}
                  <span className="sc-fm-picture-label">{row.label}</span>
                </span>
                <span className="sc-fm-picture-detail">{row.detail}</span>
              </span>
              <ChevronRight className="sc-fm-picture-chevron h-4 w-4" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function NextActions({ actions }: { actions: WorkspaceQuickAction[] }) {
  const { access, can, loading } = useOperatingAccess();
  const items = PRIMARY_ACTION_IDS.map((id) =>
    actions.find((action) => action.id === id)
  ).filter(Boolean) as WorkspaceQuickAction[];

  const visible = items.filter((action) => {
    if (loading || !access) return false;
    if (action.id === "log-issue") return can("ops.create");
    // Browse WO / Approvals — view only
    return can("ops.view");
  });

  if (visible.length === 0) return null;

  return (
    <section className="sc-fm-actions" aria-labelledby="sc-fm-actions-heading">
      <h2 id="sc-fm-actions-heading" className="sc-fm-panel-title">
        Next actions
      </h2>
      <p className="sc-fm-panel-lede">Take action or explore key areas</p>

      <div className="sc-fm-actions-grid">
        {visible.map((action) => {
          const visual = ACTION_VISUAL[action.id as keyof typeof ACTION_VISUAL];
          const Icon = visual?.icon ?? ClipboardList;
          return (
            <Link
              key={action.id}
              href={action.href}
              className={cn("sc-fm-action", visual && `sc-fm-action-${visual.tone}`)}
            >
              <span className="sc-fm-action-icon" aria-hidden>
                <Icon className="h-5 w-5" />
              </span>
              <span className="sc-fm-action-copy">
                <span className="sc-fm-action-title">{action.title}</span>
                <span className="sc-fm-action-desc">{action.description}</span>
              </span>
              <ChevronRight className="sc-fm-action-arrow h-4 w-4" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function OversightLinks({ visibility }: { visibility: AccessVisibility }) {
  const links = EXECUTIVE_OVERSIGHT_LINKS.filter(
    (link) => canSeeHref(visibility, link.href) && !isUsersHref(link.href)
  );

  if (links.length === 0) return null;

  return (
    <section className="sc-fm-actions" aria-labelledby="sc-fm-oversight-heading">
      <h2 id="sc-fm-oversight-heading" className="sc-fm-panel-title">
        Oversight
      </h2>
      <p className="sc-fm-panel-lede">
        Drill into organisation surfaces — view only
      </p>

      <div className="sc-fm-actions-grid">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn("sc-fm-action", `sc-fm-action-${link.tone}`)}
            >
              <span className="sc-fm-action-icon" aria-hidden>
                <Icon className="h-5 w-5" />
              </span>
              <span className="sc-fm-action-copy">
                <span className="sc-fm-action-title">{link.title}</span>
                <span className="sc-fm-action-desc">{link.description}</span>
              </span>
              <ChevronRight className="sc-fm-action-arrow h-4 w-4" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function CommandSurface({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const { access, loading } = useOperatingAccess();
  const visibility =
    !loading && access ? resolveAccessVisibility(access) : null;
  const oversight = Boolean(visibility?.isExecutiveOversight);
  const showFinance =
    Boolean(visibility?.surfaces.has("finance")) ||
    (access ? accessCan(access, "finance.view") : false);

  // When Finance is not shown, release the notification bell gate immediately
  // so Home without finance.view does not block notifications.
  useEffect(() => {
    if (loading) return;
    if (!showFinance) {
      signalHomeFinanceSettled();
    }
  }, [loading, showFinance]);

  return (
    <ModeFrame mode="command">
      <div className="sc-fm-home">
        <CommandHero snapshot={snapshot} oversight={oversight} />
        {oversight ? (
          <>
            <RequiresAttention
              attention={snapshot.attention}
              oversight
            />
            {showFinance ? <FinancialPositionSection /> : null}
            <div className="sc-fm-main">
              <OperationalPicture pulse={snapshot.pulse} enriching={snapshot.enriching === true} />
            </div>
            {visibility ? <OversightLinks visibility={visibility} /> : null}
          </>
        ) : (
          <>
            {showFinance ? <FinancialPositionSection /> : null}
            <div className="sc-fm-main">
              <RequiresAttention
                attention={snapshot.attention}
                oversight={false}
              />
              <OperationalPicture pulse={snapshot.pulse} enriching={snapshot.enriching === true} />
            </div>
            <NextActions actions={snapshot.quickActions} />
          </>
        )}
      </div>
    </ModeFrame>
  );
}
