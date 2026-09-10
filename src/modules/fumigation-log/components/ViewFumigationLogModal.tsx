"use client";

import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { cn, formatDate } from "@/lib/utils";
import { FUMIGATION_LOG_FIELD_LABELS } from "../constants";
import {
  getFumigationDueState,
  getFumigationDueStateLabel,
} from "../utils";
import type { FumigationLog } from "../types";

interface ViewFumigationLogModalProps {
  open: boolean;
  entry: FumigationLog | null;
  onClose: () => void;
  onEdit?: (entry: FumigationLog) => void;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

export function ViewFumigationLogModal({
  open,
  entry,
  onClose,
  onEdit,
}: ViewFumigationLogModalProps) {
  const facilityName = useFacilityName(entry?.facilityId);

  if (!entry) return null;

  const dueState = getFumigationDueState(entry.nextDueDate);
  const dueLabel = getFumigationDueStateLabel(entry.nextDueDate);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.areaTreated || "Fumigation log"}
      description={entry.id}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onEdit ? (
            <Button
              onClick={() => {
                onClose();
                onEdit(entry);
              }}
            >
              Edit entry
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex items-start gap-4 border-b border-border/70 pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
          {(entry.areaTreated || "FL").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-primary">
            {entry.areaTreated || "—"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {entry.date ? formatDate(entry.date) : "—"} ·{" "}
            {facilityName || entry.facilityId || "—"} · {entry.pestType || "—"}
          </p>
          {dueLabel ? (
            <p
              className={cn(
                "mt-1 text-sm",
                dueState === "overdue" && "text-danger",
                dueState === "due_soon" && "text-amber-700",
                dueState === "scheduled" && "text-muted"
              )}
            >
              Next due {entry.nextDueDate ? formatDate(entry.nextDueDate) : "—"}{" "}
              · {dueLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label={FUMIGATION_LOG_FIELD_LABELS.id} value={entry.id} />
        <Detail
          label={FUMIGATION_LOG_FIELD_LABELS.date}
          value={entry.date ? formatDate(entry.date) : "—"}
        />
        <Detail
          label={FUMIGATION_LOG_FIELD_LABELS.facilityId}
          value={facilityName || entry.facilityId}
        />
        <Detail
          label={FUMIGATION_LOG_FIELD_LABELS.areaTreated}
          value={entry.areaTreated}
        />
        <Detail
          label={FUMIGATION_LOG_FIELD_LABELS.pestType}
          value={entry.pestType}
        />
        <Detail label={FUMIGATION_LOG_FIELD_LABELS.vendor} value={entry.vendor} />
        <Detail
          label={FUMIGATION_LOG_FIELD_LABELS.nextDueDate}
          value={
            entry.nextDueDate ? (
              <span>
                {formatDate(entry.nextDueDate)}
                {dueLabel ? (
                  <span
                    className={cn(
                      "mt-1 block text-xs",
                      dueState === "overdue" && "text-danger",
                      dueState === "due_soon" && "text-amber-700",
                      dueState === "scheduled" && "text-muted"
                    )}
                  >
                    {dueLabel}
                  </span>
                ) : null}
              </span>
            ) : (
              "—"
            )
          }
        />
        <Detail
          label={FUMIGATION_LOG_FIELD_LABELS.remarks}
          value={entry.remarks?.trim() || "—"}
        />
      </div>
    </Modal>
  );
}
