"use client";

import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { DIESEL_USAGE_FIELD_LABELS } from "../constants";
import { getDieselUsageFlagLabels } from "../utils";
import type { DieselUsage } from "../types";

interface ViewDieselUsageModalProps {
  open: boolean;
  entry: DieselUsage | null;
  onClose: () => void;
  onEdit?: (entry: DieselUsage) => void;
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

export function ViewDieselUsageModal({
  open,
  entry,
  onClose,
  onEdit,
}: ViewDieselUsageModalProps) {
  if (!entry) return null;

  const flags = getDieselUsageFlagLabels(entry.consumption);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.generatorId || "Diesel usage"}
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
          {(entry.generatorId || "DU").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-primary">
            {entry.generatorId || "—"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {entry.date ? formatDate(entry.date) : "—"} · Facility{" "}
            {entry.facilityId || "—"} · Consumption{" "}
            {Number.isFinite(entry.consumption) ? entry.consumption : "—"} L
          </p>
          {flags.length > 0 ? (
            <p className="mt-1 text-sm text-danger">{flags.join(" · ")}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Entry ID" value={entry.id} />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.date}
          value={entry.date ? formatDate(entry.date) : "—"}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.facilityId}
          value={entry.facilityId}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.generatorId}
          value={entry.generatorId}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.openingLevel}
          value={
            Number.isFinite(entry.openingLevel)
              ? String(entry.openingLevel)
              : "—"
          }
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.added}
          value={entry.added == null ? "—" : String(entry.added)}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.closingLevel}
          value={
            Number.isFinite(entry.closingLevel)
              ? String(entry.closingLevel)
              : "—"
          }
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.consumption}
          value={
            Number.isFinite(entry.consumption)
              ? String(entry.consumption)
              : "—"
          }
        />
      </div>
    </Modal>
  );
}
