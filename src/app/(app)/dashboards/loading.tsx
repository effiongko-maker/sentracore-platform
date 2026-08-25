import {
  DASHBOARD_LOADING_MESSAGES,
  DASHBOARD_LOADING_STATUS,
  DashboardSkeleton,
  PageLoadingState,
} from "@/components/loading";

export default function DashboardsLoading() {
  return (
    <PageLoadingState
      tone="dark"
      status={DASHBOARD_LOADING_STATUS}
      messages={DASHBOARD_LOADING_MESSAGES}
      skeleton={<DashboardSkeleton />}
      title="Loading dashboard"
    />
  );
}
