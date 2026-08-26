"use client";

import { FileCheck2 } from "lucide-react";
import { useState } from "react";
import {
  ModeFrame,
  OperateHeader,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { cancelApprovalRequest } from "../actions/approvalLifecycleActions";
import { useApprovals } from "../hooks/useApprovals";
import type { Approval, ApprovalModalState } from "../types";
import { ApprovalsTable } from "./ApprovalsTable";
import { ApprovalsToolbar } from "./ApprovalsToolbar";
import { ApprovalFormModal } from "./ApprovalFormModal";
import { ApprovalPackageModal } from "./ApprovalPackageModal";
import { FollowUpApprovalModal } from "./FollowUpApprovalModal";
import { RecordDecisionModal } from "./RecordDecisionModal";
import { SubmitApprovalModal } from "./SubmitApprovalModal";
import { ViewApprovalModal } from "./ViewApprovalModal";

export function ApprovalsPage() {
  const { toast } = useToast();
  const {
    items,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    type,
    setType,
    facilityId,
    setFacilityId,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
  } = useApprovals();

  const [modal, setModal] = useState<ApprovalModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);

  function handleLifecycleSaved(_approval: Approval) {
    void reload();
  }

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      const result = await cancelApprovalRequest(modal.approval.id);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      toast({
        type: "success",
        title: "Approval cancelled",
        description: `${modal.approval.id} is now cancelled.`,
      });
      setModal({ type: "closed" });
      await reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to cancel approval",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <ModeFrame mode="act">
      <OperateHeader
        title="Approvals"
        description="Formal client authorisation requests linked to work orders. Work Orders may exist without an Approval."
        signalValue={loading ? "—" : total}
        signalLabel="In view"
      />

      <ApprovalsToolbar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        type={type}
        onTypeChange={setType}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        sort={sort}
        onSortChange={setSort}
        total={total}
        loading={loading}
        onClearAll={clearAll}
      />

      <StreamSurface className="mt-4">
        {error ? (
          <EmptyState
            icon={FileCheck2}
            title="Unable to load approvals"
            description={error}
          />
        ) : (
          <ApprovalsTable
            items={items}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(approval) => setModal({ type: "view", approval })}
            onEdit={(approval) => setModal({ type: "edit", approval })}
            onPackage={(approval) => setModal({ type: "package", approval })}
            onSubmit={(approval) => setModal({ type: "submit", approval })}
            onFollowUp={(approval) => setModal({ type: "follow_up", approval })}
            onDecision={(approval) => setModal({ type: "decision", approval })}
            onDeactivate={(approval) =>
              setModal({ type: "deactivate", approval })
            }
          />
        )}
      </StreamSurface>

      <ViewApprovalModal
        open={modal.type === "view"}
        approval={modal.type === "view" ? modal.approval : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(approval) => setModal({ type: "edit", approval })}
        onPackage={(approval) => setModal({ type: "package", approval })}
        onSubmit={(approval) => setModal({ type: "submit", approval })}
        onFollowUp={(approval) => setModal({ type: "follow_up", approval })}
        onDecision={(approval) => setModal({ type: "decision", approval })}
      />

      {modal.type === "edit" ? (
        <ApprovalFormModal
          open
          approval={modal.approval}
          onClose={() => setModal({ type: "closed" })}
          onSaved={() => void reload()}
        />
      ) : null}

      <ApprovalPackageModal
        open={modal.type === "package"}
        approval={modal.type === "package" ? modal.approval : null}
        onClose={() => setModal({ type: "closed" })}
      />

      <SubmitApprovalModal
        open={modal.type === "submit"}
        approval={modal.type === "submit" ? modal.approval : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={handleLifecycleSaved}
      />

      <FollowUpApprovalModal
        open={modal.type === "follow_up"}
        approval={modal.type === "follow_up" ? modal.approval : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={handleLifecycleSaved}
      />

      <RecordDecisionModal
        open={modal.type === "decision"}
        approval={modal.type === "decision" ? modal.approval : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={handleLifecycleSaved}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={() => void handleDeactivate()}
        title="Cancel approval request?"
        description={
          modal.type === "deactivate"
            ? `${modal.approval.id} will be marked cancelled. The linked work order is not cancelled automatically.`
            : undefined
        }
        confirmLabel="Cancel approval"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
