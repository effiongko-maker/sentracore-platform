import {
  REPORTS_LOADING_MESSAGES,
  REPORTS_LOADING_STATUS,
  PageLoadingState,
  ReportsSkeleton,
} from "@/components/loading";

export default function ReportsLoading() {
  return (
    <PageLoadingState
      tone="dark"
      status={REPORTS_LOADING_STATUS}
      messages={REPORTS_LOADING_MESSAGES}
      skeleton={<ReportsSkeleton />}
      title="Loading reports"
    />
  );
}
