"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleDot,
  ClipboardList,
  HardHat,
  Headphones,
  Package,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  getActiveWorkspace,
  PLATFORM_WORKSPACES,
  type PlatformWorkspace,
  type WorkspaceId,
} from "@/lib/platform/workspaces";
import { cn } from "@/lib/utils";

const ACTIVE_CAPABILITIES: {
  label: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    label: "Facilities",
    detail: "Locations, spaces and occupancy",
    icon: Building2,
  },
  {
    label: "Assets",
    detail: "Equipment, systems and inventory",
    icon: Package,
  },
  {
    label: "Issues",
    detail: "What needs attention across the estate",
    icon: CircleDot,
  },
  {
    label: "Work",
    detail: "Active work in progress",
    icon: Wrench,
  },
  {
    label: "Work Orders",
    detail: "Assigned and in-progress work",
    icon: ClipboardList,
  },
];

const ENV_VISUAL: Record<
  Exclude<WorkspaceId, "operations">,
  { icon: LucideIcon; tone: "blue" | "green" | "amber" | "violet" }
> = {
  "ecc-operations": { icon: Headphones, tone: "blue" },
  finance: { icon: TrendingUp, tone: "green" },
  construction: { icon: HardHat, tone: "amber" },
  "projects-events": { icon: CalendarDays, tone: "violet" },
};

function PlatformSignal() {
  return (
    <div className="sc-ph-signal" aria-hidden>
      <div className="sc-ph-signal-glow" />
      <div className="sc-ph-signal-stage">
        <span className="sc-ph-signal-plane is-1" />
        <span className="sc-ph-signal-plane is-2" />
        <span className="sc-ph-signal-plane is-3 is-accent">
          <span className="sc-ph-signal-spark s1" />
          <span className="sc-ph-signal-spark s2" />
          <span className="sc-ph-signal-spark s3" />
        </span>
        <span className="sc-ph-signal-plane is-4" />
        <span className="sc-ph-signal-plane is-5" />
      </div>
    </div>
  );
}

function GateBlueprint() {
  return (
    <svg
      className="sc-ph-gate-blueprint"
      viewBox="0 0 420 280"
      fill="none"
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="1">
        <path d="M40 240 L40 110 L120 70 L200 110 L200 240 Z" opacity="0.55" />
        <path d="M120 70 L120 240" opacity="0.35" />
        <path d="M40 150 L200 150" opacity="0.3" />
        <path d="M40 190 L200 190" opacity="0.25" />
        <rect x="70" y="165" width="28" height="22" opacity="0.4" />
        <rect x="130" y="165" width="28" height="22" opacity="0.4" />
        <rect x="70" y="205" width="28" height="35" opacity="0.45" />
        <rect x="130" y="205" width="28" height="35" opacity="0.45" />

        <path d="M210 240 L210 95 L290 55 L370 95 L370 240 Z" opacity="0.7" />
        <path d="M290 55 L290 240" opacity="0.4" />
        <path d="M210 135 L370 135" opacity="0.35" />
        <path d="M210 175 L370 175" opacity="0.3" />
        <path d="M210 210 L370 210" opacity="0.28" />
        <rect x="235" y="150" width="30" height="20" opacity="0.5" />
        <rect x="285" y="150" width="30" height="20" opacity="0.5" />
        <rect x="335" y="150" width="20" height="20" opacity="0.45" />
        <rect x="235" y="185" width="30" height="20" opacity="0.45" />
        <rect x="285" y="185" width="30" height="20" opacity="0.45" />
        <rect x="250" y="215" width="40" height="25" opacity="0.55" />

        <path d="M160 240 L160 130 L210 100" opacity="0.25" />
        <circle cx="290" cy="95" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="120" cy="90" r="2.5" fill="currentColor" opacity="0.35" />
      </g>
    </svg>
  );
}

function EnvironmentCard({
  workspace,
  onOpen,
}: {
  workspace: PlatformWorkspace;
  onOpen: (workspace: PlatformWorkspace) => void;
}) {
  const visual = ENV_VISUAL[workspace.id as Exclude<WorkspaceId, "operations">];
  const Icon = visual.icon;
  const developing = workspace.status === "in_development";

  return (
    <button
      type="button"
      className={cn(
        "sc-ph-card",
        `sc-ph-card-${visual.tone}`,
        developing ? "sc-ph-card-strong" : "sc-ph-card-quiet"
      )}
      onClick={() => onOpen(workspace)}
    >
      <div className="sc-ph-card-top">
        <span className="sc-ph-card-icon" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <span className="sc-ph-card-status">{workspace.statusLabel}</span>
      </div>
      <h3 className="sc-ph-card-title">{workspace.title}</h3>
      <p className="sc-ph-card-desc">{workspace.description}</p>
      {workspace.capabilities?.length ? (
        <ul className="sc-ph-card-tags">
          {workspace.capabilities.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
      {workspace.statusDetail ? (
        <p className="sc-ph-card-footer">
          <span>{workspace.statusLabel}</span>
          <span aria-hidden> — </span>
          <span>{workspace.statusDetail}</span>
        </p>
      ) : null}
    </button>
  );
}

function EnvironmentPanel({
  workspace,
  onClose,
}: {
  workspace: PlatformWorkspace;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="sc-ph-panel-root">
      <button
        type="button"
        className="sc-ph-panel-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sc-ph-panel"
      >
        <button
          type="button"
          className="sc-ph-panel-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="sc-ph-insight-status">{workspace.statusLabel}</p>
        <h2 id={titleId} className="sc-ph-panel-title">
          {workspace.title}
        </h2>
        <p className="sc-ph-insight-body">{workspace.description}</p>
        {workspace.statusDetail ? (
          <p className="sc-ph-insight-meta">{workspace.statusDetail}</p>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

export function PlatformHomePage() {
  const active = getActiveWorkspace();
  const others = PLATFORM_WORKSPACES.filter((w) => w.status !== "active");
  const [selected, setSelected] = useState<PlatformWorkspace | null>(null);
  const gateId = useId();

  return (
    <div className="sc-ph">
      <header className="sc-ph-intro">
        <div className="sc-ph-intro-copy">
          <p className="sc-ph-eyebrow">SentraCore Platform</p>
          <h1 className="sc-ph-title">
            Operate the organisation from one connected platform
          </h1>
          <p className="sc-ph-lede">
            SentraCore brings specialised operating environments together to
            help the organisation manage activity, information and decisions
            across the business.
          </p>
        </div>
        <PlatformSignal />
      </header>

      <section className="sc-ph-gate" aria-labelledby={gateId}>
        <div className="sc-ph-gate-surface">
          <div className="sc-ph-gate-main">
            <GateBlueprint />
            <div className="sc-ph-gate-main-inner">
              <p className="sc-ph-gate-badge">
                <span className="sc-ph-gate-badge-dot" aria-hidden />
                Active environment
              </p>
              <div className="sc-ph-gate-heading">
                <span className="sc-ph-gate-mark" aria-hidden>
                  <Building2 className="h-5 w-5" />
                </span>
                <h2 id={gateId} className="sc-ph-gate-title">
                  Facility Management
                </h2>
              </div>
              <p className="sc-ph-gate-desc">{active.description}</p>
              <Link
                href={active.href ?? "/operations"}
                className="sc-ph-gate-cta"
              >
                Enter Facility Management
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <aside className="sc-ph-gate-rail" aria-label="Capabilities">
            <ul className="sc-ph-capability-list">
              {ACTIVE_CAPABILITIES.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.label} className="sc-ph-capability-item">
                    <span className="sc-ph-capability-icon" aria-hidden>
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span className="sc-ph-capability-copy">
                      <span className="sc-ph-capability-label">{item.label}</span>
                      <span className="sc-ph-capability-detail">
                        {item.detail}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </section>

      <section
        className="sc-ph-ecosystem"
        aria-labelledby="expanding-platform-heading"
      >
        <div className="sc-ph-ecosystem-header">
          <div>
            <h2
              id="expanding-platform-heading"
              className="sc-ph-section-label"
            >
              Expanding the platform
            </h2>
            <p className="sc-ph-section-lede">
              Specialised operating environments are being developed to support
              the wider work of the organisation.
            </p>
          </div>
        </div>

        <div className="sc-ph-card-row">
          {others.map((workspace) => (
            <EnvironmentCard
              key={workspace.id}
              workspace={workspace}
              onOpen={setSelected}
            />
          ))}
        </div>
      </section>

      {selected ? (
        <EnvironmentPanel
          workspace={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
