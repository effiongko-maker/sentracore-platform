"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronRight,
  ClipboardList,
  Plus,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { ModeFrame } from "@/components/platform";
import { cn, formatRelativeTime } from "@/lib/utils";
import type {
  AttentionModel,
  OrganisationalPulse,
  WorkspaceQuickAction,
  WorkspaceSnapshot,
} from "../types";

const PRIMARY_ACTION_IDS = [
  "report-incident",
  "request-maintenance",
  "create-work-order",
  "manage-facilities",
] as const;

const ACTION_VISUAL: Record<
  (typeof PRIMARY_ACTION_IDS)[number],
  { icon: LucideIcon; tone: "blue" | "green" | "amber" | "violet" }
> = {
  "report-incident": { icon: Plus, tone: "blue" },
  "request-maintenance": { icon: Wrench, tone: "green" },
  "create-work-order": { icon: ClipboardList, tone: "amber" },
  "manage-facilities": { icon: Building2, tone: "violet" },
};

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string): string {
  if (!name?.trim()) return "there";
  return name.trim().split(/\s+/)[0] ?? "there";
}

function padCount(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function buildHeroCopy(snapshot: WorkspaceSnapshot): {
  heading: string;
  line1: string;
  line2: string;
} {
  const { pulse, attention, operationalState } = snapshot;
  const attentionTotal = attention.total;
  const critical = attention.criticalCount;

  if (operationalState.tone === "degraded") {
    return {
      heading: "Operational overview is limited",
      line1: operationalState.statement,
      line2:
        operationalState.subtext ??
        "Some live operational data is temporarily unavailable.",
    };
  }

  if (attentionTotal > 0) {
    return {
      heading: "Your operations need attention",
      line1:
        attentionTotal === 1
          ? "1 matter requires action across your facilities."
          : `${attentionTotal} matters require action across your facilities.`,
      line2:
        critical > 0
          ? `${critical} critical · ${pulse.openIncidents} open incidents · ${pulse.openWorkOrders} work orders · ${pulse.openMaintenance} maintenance.`
          : `${pulse.openIncidents} open incidents · ${pulse.openWorkOrders} work orders · ${pulse.openMaintenance} maintenance.`,
    };
  }

  if (operationalState.tone === "attention") {
    return {
      heading: "Your operations need attention",
      line1: operationalState.statement,
      line2:
        operationalState.subtext ??
        `${pulse.openIncidents} open incidents · ${pulse.openMaintenance} maintenance · ${pulse.openWorkOrders} work orders.`,
    };
  }

  return {
    heading: "Your operations are stable",
    line1: "No matters require intervention across your facilities.",
    line2:
      pulse.openIncidents > 0
        ? `${pulse.openIncidents} open incident${
            pulse.openIncidents === 1 ? "" : "s"
          } ${pulse.openIncidents === 1 ? "is" : "are"} being tracked with no urgent escalation.`
        : "Facility Management is calm. Continue with scheduled work.",
  };
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

function CommandHero({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const { pulse, attention, currentUser, asOf } = snapshot;
  const attentionTotal = attention.total;
  const critical = attention.criticalCount;
  const copy = buildHeroCopy(snapshot);
  const hour = new Date(asOf).getHours();
  const greeting = `${greetingForHour(hour)}, ${firstName(currentUser.name)}`;
  const live = snapshot.operationalState.tone !== "degraded";
  const updated = formatRelativeTime(asOf);

  return (
    <section
      className={cn(
        "sc-fm-hero",
        attentionTotal > 0 ? "sc-fm-hero-critical" : "sc-fm-hero-stable"
      )}
      aria-labelledby="sc-fm-hero-heading"
    >
      <div className="sc-fm-hero-grid" aria-hidden />
      <FacilityBlueprint />

      <div className="sc-fm-hero-body">
        <div className="sc-fm-hero-copy">
          <p className="sc-fm-hero-eyebrow">Facility Management</p>
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
          <div className="sc-fm-hero-critical-tile">
            <p className="sc-fm-hero-critical-value">{padCount(critical)}</p>
            <p className="sc-fm-hero-critical-label">Critical</p>
            <p className="sc-fm-hero-critical-meta">
              {critical > 0
                ? "Requires intervention"
                : attentionTotal > 0
                  ? `${attentionTotal} other attention item${attentionTotal === 1 ? "" : "s"}`
                  : "No intervention needed"}
            </p>
          </div>

          <div className="sc-fm-hero-metric">
            <p className="sc-fm-hero-metric-value">{pulse.openIncidents}</p>
            <p className="sc-fm-hero-metric-label">Open incidents</p>
          </div>
          <div className="sc-fm-hero-metric">
            <p className="sc-fm-hero-metric-value">{pulse.openMaintenance}</p>
            <p className="sc-fm-hero-metric-label">Maintenance</p>
          </div>
          <div className="sc-fm-hero-metric">
            <p className="sc-fm-hero-metric-value">{pulse.openWorkOrders}</p>
            <p className="sc-fm-hero-metric-label">Work orders</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RequiresAttention({ attention }: { attention: AttentionModel }) {
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
          <p className="sc-fm-panel-lede">
            {attention.total === 0
              ? "No matters require intervention now"
              : attention.total === 1
                ? "1 matter requires intervention now"
                : `${attention.total} matters require intervention now`}
          </p>
        </div>
        {attention.viewAllHref ? (
          <Link href={attention.viewAllHref} className="sc-fm-view-all">
            View all ({attention.total})
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {attention.total === 0 ? (
        <div className="sc-fm-attention-empty">
          <p>The operational queue is clear.</p>
        </div>
      ) : (
        <div className="sc-fm-queue">
          {attention.visible.map((matter) => (
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
                {matter.actionLabel.replace(/\s*→\s*$/, "")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function OperationalPicture({ pulse }: { pulse: OrganisationalPulse }) {
  const rows = [
    {
      value: pulse.criticalIncidents,
      label: "Critical",
      detail:
        pulse.criticalIncidents > 0
          ? "Require immediate intervention"
          : "None requiring intervention",
      href: "/incidents",
      tone: "critical" as const,
      icon: AlertTriangle,
    },
    {
      value: pulse.openIncidents,
      label: "Open incidents",
      detail: "Active and being tracked",
      href: "/incidents",
      tone: "blue" as const,
      icon: ClipboardList,
    },
    {
      value: pulse.openMaintenance,
      label: "Maintenance",
      detail: "Requests in operational flow",
      href: "/maintenance",
      tone: "amber" as const,
      icon: Wrench,
    },
    {
      value: pulse.openWorkOrders,
      label: "Work orders",
      detail: "Assigned and in progress",
      href: "/work-orders",
      tone: "green" as const,
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
        A snapshot of your operational landscape
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
  const items = PRIMARY_ACTION_IDS.map((id) =>
    actions.find((action) => action.id === id)
  ).filter(Boolean) as WorkspaceQuickAction[];

  return (
    <section className="sc-fm-actions" aria-labelledby="sc-fm-actions-heading">
      <h2 id="sc-fm-actions-heading" className="sc-fm-panel-title">
        Next actions
      </h2>
      <p className="sc-fm-panel-lede">Take action or explore key areas</p>

      <div className="sc-fm-actions-grid">
        {items.map((action) => {
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

export function CommandSurface({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return (
    <ModeFrame mode="command">
      <div className="sc-fm-home">
        <CommandHero snapshot={snapshot} />
        <div className="sc-fm-main">
          <RequiresAttention attention={snapshot.attention} />
          <OperationalPicture pulse={snapshot.pulse} />
        </div>
        <NextActions actions={snapshot.quickActions} />
      </div>
    </ModeFrame>
  );
}
