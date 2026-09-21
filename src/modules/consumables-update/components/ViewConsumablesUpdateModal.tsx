"use client";

import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { CONSUMABLES_UPDATE_FIELD_LABELS } from "../constants";
import { getConsumablesUpdateFlagLabels } from "../utils";
import type { ConsumablesUpdate } from "../types";

interface ViewConsumablesUpdateModalProps {
  open: boolean;
  entry: ConsumablesUpdate | null;
  onClose: () => void;
  onEdit?: (entry: ConsumablesUpdate) => void;
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

export function ViewConsumablesUpdateModal({
  open,
  entry,
  onClose,
  onEdit,
}: ViewConsumablesUpdateModalProps) {
  const facilityName = useFacilityName(entry?.facilityId);
  if (!entry) return null;

  const flags = getConsumablesUpdateFlagLabels(
    entry.closing,
    entry.reorderLevel
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.itemName || "Consumables update"}
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
              Edit update
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex items-start gap-4 border-b border-border/70 pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
          {(entry.itemName || "CU").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-primary">
            {entry.itemName || "—"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {entry.date ? formatDate(entry.date) : "—"} · Facility{" "}
            {facilityName || "—"} · Closing{" "}
            {Number.isFinite(entry.closing) ? entry.closing : "—"}
          </p>
          {flags.length > 0 ? (
            <p className="mt-1 text-sm text-danger">{flags.join(" · ")}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Entry ID" value={entry.id} />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.itemId}
          value={entry.itemId}
        />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.date}
          value={entry.date ? formatDate(entry.date) : "—"}
        />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.facilityId}
          value={facilityName || "—"}
        />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.itemName}
          value={entry.itemName}
        />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.opening}
          value={Number.isFinite(entry.opening) ? String(entry.opening) : "—"}
        />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.received}
          value={entry.received == null ? "—" : String(entry.received)}
        />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.issued}
          value={Number.isFinite(entry.issued) ? String(entry.issued) : "—"}
        />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.closing}
          value={Number.isFinite(entry.closing) ? String(entry.closing) : "—"}
        />
        <Detail
          label={CONSUMABLES_UPDATE_FIELD_LABELS.reorderLevel}
          value={
            entry.reorderLevel == null ? "—" : String(entry.reorderLevel)
          }
        />
      </div>
    </Modal>
  );
}
