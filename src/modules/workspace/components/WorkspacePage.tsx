"use client";

import { Home } from "lucide-react";
import {
  LoadingGate,
  WORKSPACE_LOADING_MESSAGES,
  WorkspaceSkeleton,
} from "@/components/loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWorkspace } from "../hooks/useWorkspace";
import { MyWork } from "./MyWork";
import { QuickActions } from "./QuickActions";
import { RecentActivity } from "./RecentActivity";
import { TodaySchedule } from "./TodaySchedule";
import { WelcomeHero } from "./WelcomeHero";

/**
 * Home — personal daily work surface.
 * Distinct from Dashboard (operational health) and Reports (document generation).
 */
export function WorkspacePage() {
  const { snapshot, loading, error, reload } = useWorkspace();

  if (error && !loading && !snapshot) {
    return (
      <EmptyState
        icon={Home}
        title="Couldn’t load Home"
        description={error ?? "Your daily overview is unavailable right now."}
        actionLabel="Retry"
        onAction={reload}
      />
    );
  }

  return (
    <LoadingGate
      loading={loading || !snapshot}
      skeleton={<WorkspaceSkeleton />}
      messages={WORKSPACE_LOADING_MESSAGES}
      title="Loading Home"
    >
      {snapshot ? (
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
        </div>
      ) : null}
    </LoadingGate>
  );
}
