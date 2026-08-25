import {
  INTELLIGENCE_LOADING_MESSAGES,
  INTELLIGENCE_LOADING_STATUS,
  IntelligenceSkeleton,
  PageLoadingState,
} from "@/components/loading";

export default function IntelligenceLoading() {
  return (
    <PageLoadingState
      tone="dark"
      status={INTELLIGENCE_LOADING_STATUS}
      messages={INTELLIGENCE_LOADING_MESSAGES}
      skeleton={<IntelligenceSkeleton />}
      title="Loading Intelligence"
    />
  );
}
