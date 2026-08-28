"use client";

import { Inbox } from "lucide-react";
import { useState } from "react";
import { ModeFrame, StreamSurface } from "@/components/platform";
import { OperationalPageHeader } from "@/components/operational";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { cancelRequest } from "../actions/treatRequest";
import { useRequests } from "../hooks/useRequests";
import type { RequestModalState } from "../types";
import { RequestFormModal } from "./RequestFormModal";
import { RequestsTable } from "./RequestsTable";
import { RequestsToolbar } from "./RequestsToolbar";
import { ViewRequestModal } from "./ViewRequestModal";

export function RequestsPage() {
  const { toast } = useToast();
  const {
    requests,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    facilityId,
    setFacilityId,
    page,
    setPage,
    totalPages,
    total,
    reload,
  } = useRequests();

  const [modal, setModal] = useState<RequestModalState>({ type: "closed" });
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    if (modal.type !== "deactivate") return;

    setCancelling(true);
    try {
      const result = await cancelRequest({ requestId: modal.request.id });
      if (!result.success) {
        throw new Error(result.error.message);
      }
      toast({
        type: "success",
        title: "Request cancelled",
        description: `${modal.request.title} is no longer in the active queue.`,
      });
      setModal({ type: "closed" });
      reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to cancel request",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <ModeFrame mode="execute">
      <div className="op-page">
        <OperationalPageHeader
          title="Request Queue"
          description="Incoming reports requiring facility review and action."
          countValue={total}
          countLabel="In view"
          loading={loading}
        />

        <RequestsToolbar
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          facilityId={facilityId}
          onFacilityIdChange={setFacilityId}
          total={total}
          loading={loading}
        />

        {error ? (
          <EmptyState
            icon={Inbox}
            title="Couldn’t load requests"
            description={error}
            actionLabel="Retry"
            onAction={reload}
          />
        ) : (
          <StreamSurface>
            <RequestsTable
              requests={requests}
              loading={loading}
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              onView={(request) => setModal({ type: "view", request })}
              onEdit={(request) => setModal({ type: "edit", request })}
              onDeactivate={(request) =>
                setModal({ type: "deactivate", request })
              }
            />
          </StreamSurface>
        )}
      </div>

      <RequestFormModal
        open={modal.type === "edit"}
        mode="edit"
        request={modal.type === "edit" ? modal.request : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={reload}
      />

      <ViewRequestModal
        open={modal.type === "view"}
        request={modal.type === "view" ? modal.request : null}
        onClose={() => setModal({ type: "closed" })}
        onChanged={reload}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleCancel}
        title="Cancel this request?"
        description={
          modal.type === "deactivate"
            ? `${modal.request.title} will be marked cancelled. Linked Maintenance/Incident records are preserved.`
            : undefined
        }
        confirmLabel="Cancel request"
        danger
        loading={cancelling}
      />
    </ModeFrame>
  );
}
