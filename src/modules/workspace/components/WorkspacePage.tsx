"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { useWorkspace } from "../hooks/useWorkspace";
import { MyWork } from "./MyWork";
import { OperationsShortcut } from "./OperationsShortcut";
import { PinnedItems } from "./PinnedItems";
import { QuickActions } from "./QuickActions";
import { RecentActivity } from "./RecentActivity";
import { TodaySchedule } from "./TodaySchedule";
import { WelcomeHero } from "./WelcomeHero";

/**
 * Workspace Home — "What should I do today?"
 * Separate from the Operational Dashboard on /dashboards.
 */
export function WorkspacePage() {
  const { snapshot, loading, error, reload } = useWorkspace();

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-44 animate-pulse rounded-sc bg-slate-200/70" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-sc bg-slate-200/70"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <EmptyState
        title="Couldn’t load workspace"
        description={error ?? "No workspace data available."}
        actionLabel="Retry"
        onAction={reload}
      />
    );
  }

  return (
    <div className="space-y-10">
      <WelcomeHero
        userName={snapshot.currentUser.name}
        asOf={snapshot.asOf}
      />
      <QuickActions actions={snapshot.quickActions} />
      <MyWork items={snapshot.myWork} />
      <div className="grid gap-8 xl:grid-cols-2">
        <TodaySchedule items={snapshot.schedule} />
        <RecentActivity items={snapshot.activity} />
      </div>
      <PinnedItems />
      <OperationsShortcut />
    </div>
  );
}
