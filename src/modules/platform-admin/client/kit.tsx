"use client";

import { Activity, Blocks, Building2, KeyRound, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ProfileStatus } from "@/lib/auth/types";

/** Admin presentational kit — one visual language for every Admin surface. */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size, platform, muted }: { name: string; size?: "sm" | "lg"; platform?: boolean; muted?: boolean }) {
  return (
    <span className={cn("ac-avatar", size === "lg" && "ac-avatar-lg", size === "sm" && "ac-avatar-sm", platform && "ac-avatar-platform", muted && "ac-avatar-muted")} aria-hidden>
      {initials(name)}
    </span>
  );
}

export type PillTone = "ok" | "warn" | "critical" | "accent" | "plain" | "platform" | "neutral";
export function Pill({ tone = "neutral", children, title }: { tone?: PillTone; children: ReactNode; title?: string }) {
  return (
    <span className={cn("ac-pill", tone !== "neutral" && `ac-pill-${tone}`)} title={title}>
      {children}
    </span>
  );
}

export function statusPillTone(status: ProfileStatus): { label: string; tone: PillTone } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "ok" };
    case "invited":
      return { label: "Invited", tone: "warn" };
    case "suspended":
      return { label: "Suspended", tone: "critical" };
    default:
      return { label: "Inactive", tone: "neutral" };
  }
}
export function StatusPill({ status }: { status: ProfileStatus }) {
  const { label, tone } = statusPillTone(status);
  return <Pill tone={tone}>{label}</Pill>;
}

export function Panel({
  title,
  icon: Icon,
  aside,
  children,
  flush,
  foot,
  className,
}: {
  title?: string;
  icon?: LucideIcon;
  aside?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  foot?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ac-panel", className)}>
      {title ? (
        <div className="ac-panel-head">
          <h2 className="ac-panel-title">
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
            {title}
          </h2>
          {aside ? <div className="ac-panel-aside">{aside}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "ac-panel-body-flush" : "ac-panel-body"}>{children}</div>
      {foot ? <div className="ac-panel-foot">{foot}</div> : null}
    </section>
  );
}

/** Semantic marker for an audit event — subtle, not rainbow. */
export function eventVisual(action: string, category: string | null): { icon: LucideIcon; tone: "" | "grant" | "revoke" | "danger" } {
  if (action === "capability.granted") return { icon: KeyRound, tone: "grant" };
  if (action === "capability.revoked") return { icon: KeyRound, tone: "revoke" };
  if (action === "user.offboarded" || action === "profile.suspended" || action === "profile.deactivated") return { icon: UserRound, tone: "danger" };
  if (category === "modules") return { icon: Blocks, tone: "" };
  if (category === "operating_context") return { icon: Building2, tone: "" };
  if (category === "people") return { icon: UserRound, tone: "" };
  return { icon: Activity, tone: "" };
}
