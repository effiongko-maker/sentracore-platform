"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ClipboardList,
  Minus,
  Plus,
  Wrench,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, formatRelativeTime, cn } from "@/lib/utils";
import { useFacilityName, useUserName } from "@/hooks/useEntityLabel";
import type { DashboardCard, DashboardCardItem } from "../types";
import { resolveActionPath, resolveModulePath } from "../utils";

const toneClass: Record<string, string> = {
  success: "bg-emerald-50 text-success",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-danger",
  info: "bg-accent-soft text-accent",
  neutral: "bg-slate-100 text-muted",
};

function labelize(value?: string) {
  if (!value) return "";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ItemRow({ item }: { item: DashboardCardItem }) {
  const href = resolveModulePath(item.module, item.entityId);
  const facilityName = useFacilityName(item.facilityId);

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-sc-sm border border-border/70 px-3.5 py-3 transition-colors hover:bg-slate-50/80"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-muted">
        {item.module === "incidents" ? (
          <AlertTriangle className="h-4 w-4" />
        ) : item.module === "maintenance" ? (
          <Wrench className="h-4 w-4" />
        ) : (
          <ClipboardList className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          {item.priority ? (
            <Badge variant={item.tone ?? "neutral"}>
              {labelize(item.priority)}
            </Badge>
          ) : null}
          {item.status ? (
            <Badge variant="neutral">{labelize(item.status)}</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted">
          {item.facilityId ? facilityName || item.facilityId : "No facility"}
          {item.reportedAt ? ` · ${formatRelativeTime(item.reportedAt)}` : ""}
        </p>
      </div>
    </Link>
  );
}

/** Renders `kpi_stat` cards from DashboardSnapshot. */
export function DashboardKpiCard({
  card,
  index = 0,
}: {
  card: DashboardCard;
  index?: number;
}) {
  const TrendIcon =
    card.trend === "up"
      ? ArrowUpRight
      : card.trend === "down"
        ? ArrowDownRight
        : Minus;

  const href = card.module ? resolveModulePath(card.module) : undefined;

  const body = (
    <Card
      className="h-full p-5 transition-shadow duration-200 hover:shadow-sc-lg"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{card.title}</p>
        <span
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-xl",
            toneClass[card.tone] ?? toneClass.neutral
          )}
        >
          <TrendIcon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">
        {card.primaryValue ?? "—"}
      </p>
      {card.secondaryLabel ? (
        <p className="mt-2 text-xs leading-5 text-muted">{card.secondaryLabel}</p>
      ) : null}
    </Card>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  );
}

/** Renders `entity_list` and `attention_queue` cards. */
export function DashboardListCard({ card }: { card: DashboardCard }) {
  const href = card.module ? resolveModulePath(card.module) : undefined;
  const items = card.items ?? [];

  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>{card.title}</CardTitle>
          {card.description ? (
            <CardDescription>{card.description}</CardDescription>
          ) : null}
        </div>
        {href ? (
          <Link href={href}>
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-sc-sm border border-dashed border-border/80 bg-slate-50/60 px-3.5 py-5 text-center text-sm text-muted">
            {card.emptyMessage ??
              "No open items in this queue. New work will appear here automatically."}
          </p>
        ) : (
          items.map((item) => (
            <ItemRow key={`${item.module}:${item.entityId}`} item={item} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Renders `health_summary` cards. */
export function DashboardHealthCard({ card }: { card: DashboardCard }) {
  return (
    <Card className="h-full p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{card.title}</p>
          <p className="mt-2 text-sm text-foreground">
            {card.description ??
              card.secondaryLabel ??
              "Operational health summary for the current facility scope."}
          </p>
        </div>
        <Badge variant={card.tone}>{card.secondaryLabel ?? "Health"}</Badge>
      </div>
      {card.primaryValue != null ? (
        <p className="mt-4 text-3xl font-semibold tracking-tight text-primary">
          {card.primaryValue}
          <span className="ml-2 text-sm font-normal text-muted">/ 100</span>
        </p>
      ) : null}
    </Card>
  );
}

/** Renders `quick_action` cards — navigation via actionId only. */
export function DashboardQuickActionCard({ card }: { card: DashboardCard }) {
  if (!card.actionId) return null;
  const href = resolveActionPath(card.actionId);

  return (
    <Link href={href} className="block h-full">
      <Card className="h-full p-4 transition-all duration-200 hover:border-primary/20 hover:shadow-sc-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            {card.actionId === "view-facilities" ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{card.title}</p>
            {card.description ? (
              <p className="mt-0.5 text-xs leading-5 text-muted">
                {card.description}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function DashboardContextBanner({
  title,
  subtitle,
  currentUserId,
  asOf,
}: {
  title?: string;
  subtitle?: string;
  currentUserId?: string;
  asOf: string;
}) {
  const userName = useUserName(currentUserId);
  const hour = new Date(asOf).getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = formatDate(asOf, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="relative overflow-hidden rounded-sc border border-border/80 bg-primary px-6 py-7 text-white shadow-sc-lg sm:px-8">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-20 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="relative">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/70">
          {title ?? "Dashboard"}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting}
          {userName ? `, ${userName.split(" ")[0]}` : ""}
        </h2>
        <p className="mt-2 text-sm text-white/75">{dateLabel}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
          {subtitle ?? "Here's what's happening across your facilities today."}
        </p>
      </div>
    </div>
  );
}

export function NeedsAttentionEmpty() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-8 text-center">
        <p className="text-sm font-medium text-foreground">
          Everything looks good. No items require immediate attention.
        </p>
        <p className="mt-1 text-xs text-muted">
          Critical work, overdue work, and blocked items will appear here.
        </p>
      </CardContent>
    </Card>
  );
}
