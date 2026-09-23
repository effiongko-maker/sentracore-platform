"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ApprovalService } from "@/services/approvals/ApprovalService";
import type { Approval } from "../types";
import { labelizeApprovalStatus } from "../utils";
import { ApprovalFormModal } from "./ApprovalFormModal";
import { ApprovalPackageModal } from "./ApprovalPackageModal";
import { FollowUpApprovalModal } from "./FollowUpApprovalModal";
import { RecordDecisionModal } from "./RecordDecisionModal";
import { SubmitApprovalModal } from "./SubmitApprovalModal";
import { ViewApprovalModal } from "./ViewApprovalModal";

type Step = "view" | "edit" | "package" | "submit" | "follow_up" | "decision" | null;

/**
 * Work → Approval handoff (Job Order route). The APR reference opens that Approval in the existing Approval modal, with
 * the same lifecycle actions as the Approvals page (Edit the package, Preview, Submit, Follow up, Record decision) —
 * no separate route. `onChanged` reports the refreshed Approval so the Work can reflect its new status.
 */
export function WorkApprovalHandoff({
  approvalId,
  status,
  onChanged,
}: {
  approvalId: string;
  status: string;
  onChanged?: (approval: Approval) => void;
}) {
  const { toast } = useToast();
  const { can } = useOperatingAccess();
  const canManage = can("approvals.manage");
  const [approval, setApproval] = useState<Approval | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [loading, setLoading] = useState(false);

  async function open(target: "view" | "edit" = "view") {
    setLoading(true);
    try {
      const row = await ApprovalService.getApproval(approvalId);
      if (!row) throw new Error(`Approval ${approvalId} could not be found.`);
      setApproval(row);
      setStep(target);
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to open approval",
        description: err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function refreshed(next?: Approval) {
    const row = next ?? (await ApprovalService.getApproval(approvalId).catch(() => null));
    if (row) {
      setApproval(row);
      onChanged?.(row);
    }
    setStep(row ? "view" : null);
  }

  const close = () => setStep(null);

  return (
    <>
      <button
        type="button"
        className="font-medium text-accent underline-offset-2 hover:underline disabled:opacity-60"
        disabled={loading}
        onClick={() => void open()}
      >
        {approvalId}
      </button>{" "}
      <span className="text-muted">— {labelizeApprovalStatus(status as Approval["status"])}</span>
      {/* Draft: Request client approval → Edit package → Submit, all from the Work (approvals.manage only). */}
      {canManage && status === "draft" ? (
        <>
          {" · "}
          <button
            type="button"
            className="font-medium text-accent underline-offset-2 hover:underline disabled:opacity-60"
            disabled={loading}
            onClick={() => void open("edit")}
          >
            Edit package
          </button>
        </>
      ) : null}

      <ViewApprovalModal
        open={step === "view"}
        approval={approval}
        onClose={close}
        onEdit={canManage ? () => setStep("edit") : undefined}
        onPackage={() => setStep("package")}
        onSubmit={canManage ? () => setStep("submit") : undefined}
        onFollowUp={canManage ? () => setStep("follow_up") : undefined}
        onDecision={canManage ? () => setStep("decision") : undefined}
      />
      {step === "edit" && approval ? (
        <ApprovalFormModal open approval={approval} onClose={() => setStep("view")} onSaved={() => void refreshed()} />
      ) : null}
      <ApprovalPackageModal open={step === "package"} approval={approval} onClose={() => setStep("view")} />
      <SubmitApprovalModal open={step === "submit"} approval={approval} onClose={() => setStep("view")} onSaved={(row) => void refreshed(row)} />
      <FollowUpApprovalModal open={step === "follow_up"} approval={approval} onClose={() => setStep("view")} onSaved={(row) => void refreshed(row)} />
      <RecordDecisionModal open={step === "decision"} approval={approval} onClose={() => setStep("view")} onSaved={(row) => void refreshed(row)} />
    </>
  );
}
