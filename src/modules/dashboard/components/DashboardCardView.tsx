"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  Minus,
  Wrench,
  Zap,
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
import { formatRelativeTime, cn } from "@/lib/utils";
import { useUserName } from "@/hooks/useEntityLabel";
import type { DashboardCard, DashboardCardItem } from "../types";
import { resolveActionPath, resolveModulePath } from "../utils";

const toneClass: Record<string, string> = {
  success: "bg-emerald-50 text-success",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-danger",
  info: "bg-accent-soft text-accent",
  neutral: "bg-slate-100 text-muted",
};

function ItemRow({ item }: { item: DashboardCardItem }) {
  const href = resolveModulePath(item.module, item.entityId);

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
          {item.tone ? (
            <Badge variant={item.tone}>{item.meta?.split(" · ")[0]}</Badge>
          ) : null}
        </div>
        {item.meta ? (
          <p className="mt-1 text-xs text-muted">{item.meta}</p>
        ) : null}
        {item.reportedAt ? (
          <p className="mt-1 text-[11px] text-slate-400">
            {formatRelativeTime(item.reportedAt)}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

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
    <Card className="p-5 transition-shadow duration-200 hover:shadow-sc-lg">
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
        <p className="mt-2 text-xs text-muted">{card.secondaryLabel}</p>
      ) : null}
    </Card>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block" style={{ animationDelay: `${index * 40}ms` }}>
      {body}
    </Link>
  );
}

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
          <p className="text-sm text-muted">
            {card.emptyMessage ?? "Nothing to show."}
          </p>
        ) : (
          items.map((item) => (
            <ItemRow
              key={`${item.module}:${item.entityId}`}
              item={item}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardHealthCard({ card }: { card: DashboardCard }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{card.title}</p>
          <p className="mt-2 text-sm text-foreground">
            {card.description ?? "—"}
          </p>
        </div>
        <Badge variant={card.tone}>{card.secondaryLabel ?? "health"}</Badge>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-primary">
        {card.primaryValue ?? "—"}
        <span className="ml-2 text-sm font-normal text-muted">/ 100</span>
      </p>
    </Card>
  );
}

export function DashboardQuickActionCard({ card }: { card: DashboardCard }) {
  if (!card.actionId) return null;
  const href = resolveActionPath(card.actionId);

  return (
    <Link href={href}>
      <Card className="h-full p-4 transition-shadow hover:shadow-sc-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{card.title}</p>
            {card.description ? (
              <p className="text-xs text-muted">{card.description}</p>
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

  return (
    <div className="relative overflow-hidden rounded-sc border border-border/80 bg-primary px-6 py-7 text-white shadow-sc-lg sm:px-8">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
      <div className="relative">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/70">
          {title ?? "Operations Command Center"}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting}
          {userName ? `, ${userName.split(" ")[0]}` : ""}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
          {subtitle ?? "Live operational health across your estate."}
        </p>
      </div>
    </div>
  );
}
