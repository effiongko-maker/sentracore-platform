"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import type {
  ActivityItem,
  ApprovalItem,
  Incident,
  MaintenanceTask,
  WorkOrder,
} from "@/types";

const priorityVariant = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
} as const;

const severityVariant = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
} as const;

export function RecentActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Latest movements across operations</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-muted">
              <Clock3 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted">{item.description}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {item.actor} · {formatRelativeTime(item.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PendingApprovalsCard({ items }: { items: ApprovalItem[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>Items waiting on your decision</CardDescription>
        </div>
        <Badge variant="warning">{items.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-sc-sm border border-border/70 px-3.5 py-3 transition-colors hover:bg-slate-50/80"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {item.type} · {item.requestedBy}
                </p>
              </div>
              <Badge variant="warning">Pending</Badge>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Requested {formatRelativeTime(item.requestedAt)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OpenWorkOrderRow({ item }: { item: WorkOrder }) {
  const facilityName = useFacilityName(item.facilityId);

  return (
    <div className="flex items-start gap-3 rounded-sc-sm border border-border/70 px-3.5 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <ClipboardList className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          <Badge variant={priorityVariant[item.priority]}>{item.priority}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">
          {item.id} · {facilityName || item.facilityId}
          {item.dueAt ? ` · Due ${formatDate(item.dueAt)}` : ""}
        </p>
      </div>
    </div>
  );
}

export function OpenWorkOrdersCard({ items }: { items: WorkOrder[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Open work orders</CardTitle>
          <CardDescription>Active requests needing progress</CardDescription>
        </div>
        <Link href="/work-orders">
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <OpenWorkOrderRow key={item.id} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}

export function CriticalIncidentsCard({ items }: { items: Incident[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Critical incidents</CardTitle>
          <CardDescription>Highest-severity open issues</CardDescription>
        </div>
        <Link href="/incidents">
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-sc-sm border border-red-100 bg-red-50/40 px-3.5 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-danger shadow-sc">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <Badge variant={severityVariant[item.severity]}>
                    {item.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {item.id} · {item.facility} · {formatRelativeTime(item.reportedAt)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function UpcomingMaintenanceCard({
  items,
}: {
  items: MaintenanceTask[];
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Upcoming maintenance</CardTitle>
          <CardDescription>Scheduled and overdue tasks</CardDescription>
        </div>
        <Link href="/maintenance">
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-sc-sm border border-border/70 px-3.5 py-3"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Wrench className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {item.title}
                </p>
                <Badge
                  variant={item.status === "overdue" ? "danger" : "info"}
                >
                  {item.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {item.asset} · {item.facility} · {formatDate(item.scheduledDate)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function QuickActionsCard() {
  const actions = [
    { label: "Create work order", href: "/work-orders", icon: ClipboardList },
    { label: "Report incident", href: "/incidents", icon: AlertTriangle },
    { label: "Schedule maintenance", href: "/maintenance", icon: Wrench },
    { label: "Invite user", href: "/users", icon: CheckCircle2 },
  ];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Quick actions</CardTitle>
          <CardDescription>Jump into common workflows</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="group flex items-center gap-3 rounded-sc-sm border border-border/70 px-3.5 py-3 transition-all duration-200 hover:border-accent/30 hover:bg-accent-soft/50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-muted transition-colors group-hover:bg-white group-hover:text-accent">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-foreground">
                {action.label}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
