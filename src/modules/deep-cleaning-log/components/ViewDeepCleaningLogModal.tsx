"use client";

import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { formatDate } from "@/lib/utils";
import { DEEP_CLEANING_LOG_FIELD_LABELS } from "../constants";
import type { DeepCleaningLog } from "../types";

interface ViewDeepCleaningLogModalProps {
  open: boolean;
  entry: DeepCleaningLog | null;
  onClose: () => void;
  onEdit?: (entry: DeepCleaningLog) => void;
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

export function ViewDeepCleaningLogModal({
  open,
  entry,
  onClose,
  onEdit,
}: ViewDeepCleaningLogModalProps) {
  const facilityName = useFacilityName(entry?.facilityId);

  if (!entry) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.area || "Deep cleaning log"}
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
          {(entry.area || "DC").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-primary">
            {entry.area || "—"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {entry.date ? formatDate(entry.date) : "—"} ·{" "}
            {facilityName || entry.facilityId || "—"} · {entry.status || "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label={DEEP_CLEANING_LOG_FIELD_LABELS.id} value={entry.id} />
        <Detail
          label={DEEP_CLEANING_LOG_FIELD_LABELS.date}
          value={entry.date ? formatDate(entry.date) : "—"}
        />
        <Detail
          label={DEEP_CLEANING_LOG_FIELD_LABELS.facilityId}
          value={facilityName || entry.facilityId}
        />
        <Detail label={DEEP_CLEANING_LOG_FIELD_LABELS.area} value={entry.area} />
        <Detail
          label={DEEP_CLEANING_LOG_FIELD_LABELS.vendorTeam}
          value={entry.vendorTeam}
        />
        <Detail
          label={DEEP_CLEANING_LOG_FIELD_LABELS.status}
          value={entry.status}
        />
        <Detail
          label={DEEP_CLEANING_LOG_FIELD_LABELS.remarks}
          value={entry.remarks?.trim() || "—"}
        />
      </div>
    </Modal>
  );
}
