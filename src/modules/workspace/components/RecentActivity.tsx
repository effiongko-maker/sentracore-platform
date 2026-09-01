"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime } from "@/lib/utils";
import type { WorkspaceActivityItem } from "../types";

const modulePath: Record<WorkspaceActivityItem["module"], string> = {
  incidents: "/incidents",
  work: "/work",
  issues: "/issues",
  maintenance: "/work",
  "work-orders": "/work-orders",
  assets: "/assets",
  facilities: "/facilities",
  dashboards: "/dashboards",
};

export function RecentActivity({ items }: { items: WorkspaceActivityItem[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
        <p className="mt-1 text-sm text-muted">
          Newest operational events across the estate.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <EmptyState
              icon={Activity}
              className="border-0 bg-transparent py-10"
              title="No recent activity"
              description="New work, work orders, and legacy incident activity will show up here."
            />
          ) : (
            items.map((item) => (
              <Link
                key={item.id}
                href={modulePath[item.module]}
                className="flex items-start justify-between gap-3 rounded-sc-sm border border-border/60 px-3.5 py-3 transition-colors hover:bg-slate-50/80"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {item.summary}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                </div>
                <p className="shrink-0 text-[11px] text-slate-400">
                  {formatRelativeTime(item.at)}
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
