"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime } from "@/lib/utils";
import type { WorkspaceScheduleItem } from "../types";

const modulePath: Record<WorkspaceScheduleItem["module"], string> = {
  incidents: "/incidents",
  maintenance: "/maintenance",
  "work-orders": "/work-orders",
  assets: "/assets",
  facilities: "/facilities",
  dashboards: "/dashboards",
};

export function TodaySchedule({ items }: { items: WorkspaceScheduleItem[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Today&apos;s schedule
        </h2>
        <p className="mt-1 text-sm text-muted">
          Due, scheduled, or reported today.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <EmptyState
              className="border-0 bg-transparent py-10"
              title="Nothing on the schedule"
              description="Maintenance due today, scheduled work orders, and newly reported incidents will appear here."
            />
          ) : (
            items.map((item) => (
              <Link
                key={item.id}
                href={modulePath[item.module]}
                className="flex items-start justify-between gap-3 rounded-sc-sm border border-border/60 px-3.5 py-3 transition-colors hover:bg-slate-50/80"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted">{item.meta}</p>
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
