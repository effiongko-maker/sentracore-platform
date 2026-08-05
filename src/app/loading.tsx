"use client";

import {
  OPERATIONAL_LOADING_MESSAGES,
  PageLoadingState,
  WorkspaceSkeleton,
} from "@/components/loading";

export default function Loading() {
  return (
    <PageLoadingState
      skeleton={<WorkspaceSkeleton />}
      messages={OPERATIONAL_LOADING_MESSAGES}
      title="Loading"
    />
  );
}
