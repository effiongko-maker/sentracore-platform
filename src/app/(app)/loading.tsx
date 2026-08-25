import {
  HOME_LOADING_STATUS,
  PageLoadingState,
  WORKSPACE_LOADING_MESSAGES,
  WorkspaceSkeleton,
} from "@/components/loading";

export default function Loading() {
  return (
    <PageLoadingState
      status={HOME_LOADING_STATUS}
      messages={WORKSPACE_LOADING_MESSAGES}
      skeleton={<WorkspaceSkeleton />}
      title="Loading Home"
    />
  );
}
