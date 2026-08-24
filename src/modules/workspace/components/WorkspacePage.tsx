"use client";

import { Home } from "lucide-react";
import {
  LoadingGate,
  WORKSPACE_LOADING_MESSAGES,
  WorkspaceSkeleton,
} from "@/components/loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWorkspace } from "../hooks/useWorkspace";
import { CommandSurface } from "./CommandSurface";

export function WorkspacePage() {
  const { snapshot, loading, error, reload } = useWorkspace();

  if (error && !loading && !snapshot) {
    return (
      <EmptyState
        icon={Home}
        title="Couldn't load Home"
        description={error ?? "Your operational overview is unavailable right now."}
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
      {snapshot ? <CommandSurface snapshot={snapshot} /> : null}
    </LoadingGate>
  );
}
