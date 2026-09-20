"use client";

import { Home, ShieldOff } from "lucide-react";
import {
  HOME_LOADING_STATUS,
  LoadingGate,
  WORKSPACE_LOADING_MESSAGES,
  WorkspaceSkeleton,
} from "@/components/loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { useWorkspace } from "../hooks/useWorkspace";
import { CommandSurface } from "./CommandSurface";

export function WorkspacePage() {
  const { access, loading: accessLoading, can } = useOperatingAccess();
  // Unauthorized is not unavailable: without ops.view no operational read is issued.
  const accessKnown = !accessLoading && access != null;
  const canViewOperations = can("ops.view");
  const { snapshot, loading, error, reload } = useWorkspace(canViewOperations);

  if (accessKnown && !canViewOperations) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Home isn't available for your access"
        description="Your account doesn't currently have permission to view the Facility Management overview. Ask an administrator to review your access."
      />
    );
  }

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
      status={HOME_LOADING_STATUS}
      messages={WORKSPACE_LOADING_MESSAGES}
      title="Loading Home"
    >
      {snapshot ? <CommandSurface snapshot={snapshot} /> : null}
    </LoadingGate>
  );
}
