"use client";

import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { ENERGY_READING_FIELD_LABELS } from "../constants";
import type { EnergyReading } from "../types";

interface ViewEnergyReadingModalProps {
  open: boolean;
  entry: EnergyReading | null;
  onClose: () => void;
  onEdit?: (entry: EnergyReading) => void;
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

export function ViewEnergyReadingModal({
  open,
  entry,
  onClose,
  onEdit,
}: ViewEnergyReadingModalProps) {
  if (!entry) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.meter || "Energy reading"}
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
              Edit reading
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex items-start gap-4 border-b border-border/70 pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
          {(entry.meter || "ER").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-primary">
            {entry.meter || "—"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {entry.date ? formatDate(entry.date) : "—"} · Reading{" "}
            {Number.isFinite(entry.reading) ? entry.reading : "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Reading ID" value={entry.id} />
        <Detail
          label={ENERGY_READING_FIELD_LABELS.date}
          value={entry.date ? formatDate(entry.date) : "—"}
        />
        <Detail label={ENERGY_READING_FIELD_LABELS.meter} value={entry.meter} />
        <Detail
          label={ENERGY_READING_FIELD_LABELS.reading}
          value={
            Number.isFinite(entry.reading) ? String(entry.reading) : "—"
          }
        />
        <Detail
          label={ENERGY_READING_FIELD_LABELS.remarks}
          value={entry.remarks?.trim() || "—"}
        />
      </div>
    </Modal>
  );
}
