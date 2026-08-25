"use client";

import { useMemo } from "react";
import {
  DASHBOARD_LOADING_MESSAGES,
  DASHBOARD_LOADING_STATUS,
  DashboardSkeleton,
  LoadingGate,
} from "@/components/loading";
import { ModeFrame } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { buildDashboardOverview } from "../view-model/buildDashboardOverview";
import { DashboardOverview } from "./DashboardOverview";

/**
 * Pure DashboardSnapshot renderer.
 * No ReportingService or domain service calls.
 */
export function DashboardPage() {
  const { snapshot, loading, error, reload } = useDashboard();
  const overview = useMemo(
    () => (snapshot ? buildDashboardOverview(snapshot) : null),
    [snapshot]
  );

  if (error && !loading && !snapshot) {
    return (
      <ModeFrame mode="cognitive">
        <div className="db-page">
          <EmptyState
            icon={BarChart3}
            title="Couldn’t load dashboard"
            description={
              error ?? "Operational snapshot is unavailable right now."
            }
            actionLabel="Retry"
            onAction={reload}
          />
        </div>
      </ModeFrame>
    );
  }

  return (
    <LoadingGate
      loading={loading || !snapshot}
      skeleton={<DashboardSkeleton />}
      status={DASHBOARD_LOADING_STATUS}
      messages={DASHBOARD_LOADING_MESSAGES}
      title="Loading dashboard"
      tone="dark"
    >
      {overview ? (
        <ModeFrame mode="cognitive">
          <DashboardOverview overview={overview} />
        </ModeFrame>
      ) : null}
    </LoadingGate>
  );
}
