"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Database,
  HardHat,
  Headphones,
  Layers,
  Lock,
  Network,
  Scale,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  PLATFORM_WORKSPACES,
  type PlatformWorkspace,
  type WorkspaceId,
  type WorkspaceStatus,
} from "@/lib/platform/workspaces";
import { cn } from "@/lib/utils";

/** Platform Home display order — FM first, then remaining catalog environments. */
const ENVIRONMENT_DISPLAY_ORDER: WorkspaceId[] = [
  "operations",
  "finance",
  "ecc-operations",
  "construction",
  "projects-events",
];

const ENV_ICON: Record<WorkspaceId, LucideIcon> = {
  operations: Building2,
  finance: TrendingUp,
  "ecc-operations": Headphones,
  construction: HardHat,
  "projects-events": CalendarDays,
};

const PLATFORM_PILLARS: Array<{
  label: string;
  detail: string;
  icon: LucideIcon;
}> = [
  {
    label: "Connected",
    detail: "A unified view across operating environments",
    icon: Network,
  },
  {
    label: "Secure",
    detail: "Role-based access with clear accountability",
    icon: Lock,
  },
  {
    label: "Scalable",
    detail: "Designed for growth and new capabilities",
    icon: Scale,
  },
];

const HERO_VISUAL_SRC = "/platform/hero-architecture.jpg";

function orderedEnvironments(): PlatformWorkspace[] {
  const byId = new Map(PLATFORM_WORKSPACES.map((w) => [w.id, w]));
  const ordered: PlatformWorkspace[] = [];
  for (const id of ENVIRONMENT_DISPLAY_ORDER) {
    const workspace = byId.get(id);
    if (workspace) ordered.push(workspace);
  }
  for (const workspace of PLATFORM_WORKSPACES) {
    if (!ENVIRONMENT_DISPLAY_ORDER.includes(workspace.id)) {
      ordered.push(workspace);
    }
  }
  return ordered;
}

function statusTone(status: WorkspaceStatus): "live" | "dev" | "planned" {
  if (status === "active") return "live";
  if (status === "in_development") return "dev";
  return "planned";
}

function statusBadgeLabel(workspace: PlatformWorkspace): string {
  if (workspace.status === "active") return "Live";
  return workspace.statusLabel;
}

function EnvironmentCard({ workspace }: { workspace: PlatformWorkspace }) {
  const Icon = ENV_ICON[workspace.id] ?? Database;
  const tone = statusTone(workspace.status);
  const isLive = workspace.status === "active";
  const enterHref = workspace.href;

  return (
    <article
      className={cn(
        "sc-ph-env",
        isLive ? "sc-ph-env-live" : "sc-ph-env-quiet"
      )}
    >
      <p className={cn("sc-ph-env-status", `sc-ph-env-status-${tone}`)}>
        <span className="sc-ph-env-status-dot" aria-hidden />
        {statusBadgeLabel(workspace)}
      </p>
      <div className="sc-ph-env-heading">
        <span className="sc-ph-env-icon" aria-hidden>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <h3 className="sc-ph-env-title">{workspace.title}</h3>
      </div>
      <p className="sc-ph-env-desc">{workspace.description}</p>
      {isLive && enterHref ? (
        <Link href={enterHref} className="sc-ph-env-cta">
          Enter {workspace.title}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : (
        <span className="sc-ph-env-soon" aria-disabled="true">
          Coming soon
        </span>
      )}
    </article>
  );
}

function PlatformHeroVisual() {
  return (
    <div className="sc-ph-hero-visual">
      <Image
        src={HERO_VISUAL_SRC}
        alt="Architectural glass towers with People, Places, Operations, Possibilities — a more connected tomorrow."
        fill
        priority
        sizes="(min-width: 960px) min(28rem, 38vw), (min-width: 640px) 90vw, 100vw"
        className="sc-ph-hero-image"
      />
    </div>
  );
}

export function PlatformHomePage() {
  const environments = orderedEnvironments();

  return (
    <div className="sc-ph">
      <header className="sc-ph-hero">
        <div className="sc-ph-hero-copy">
          <p className="sc-ph-eyebrow">SentraCore Platform</p>
          <h1 className="sc-ph-title">
            One platform. Multiple operating environments.
          </h1>
          <p className="sc-ph-lede">
            SentraCore brings specialised operating environments together to
            help the organisation manage activity, information and decisions
            across the business.
          </p>

          <ul className="sc-ph-pillars">
            {PLATFORM_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <li key={pillar.label} className="sc-ph-pillar">
                  <span className="sc-ph-pillar-icon" aria-hidden>
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="sc-ph-pillar-copy">
                    <span className="sc-ph-pillar-label">{pillar.label}</span>
                    <span className="sc-ph-pillar-detail">{pillar.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <PlatformHeroVisual />
      </header>

      <section
        className="sc-ph-environments"
        aria-labelledby="operating-environments-heading"
        id="operating-environments"
      >
        <div className="sc-ph-environments-header">
          <h2
            id="operating-environments-heading"
            className="sc-ph-section-label"
          >
            Operating environments
          </h2>
        </div>

        <div className="sc-ph-env-grid">
          {environments.map((workspace) => (
            <EnvironmentCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      </section>

      <section className="sc-ph-next" aria-label="Platform outlook">
        <div className="sc-ph-next-main">
          <span className="sc-ph-next-mark" aria-hidden>
            <Layers className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <div>
            <h2 className="sc-ph-next-title">Built for what&apos;s next.</h2>
            <p className="sc-ph-next-body">
              SentraCore is evolving. More specialised operating environments
              will be added as the organisation grows.
            </p>
          </div>
        </div>
        <p className="sc-ph-next-aside">
          Same organisation. A smarter way to operate.
        </p>
      </section>
    </div>
  );
}
