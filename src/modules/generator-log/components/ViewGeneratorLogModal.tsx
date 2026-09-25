"use client";

import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { GENERATOR_LOG_FIELD_LABELS } from "../constants";
import type { GeneratorLog } from "../types";

interface ViewGeneratorLogModalProps {
  open: boolean;
  entry: GeneratorLog | null;
  onClose: () => void;
  onEdit?: (entry: GeneratorLog) => void;
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

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Hour-meter readings are counter values, not times. */
function formatReading(value: number | null): string {
  return value == null ? "Not recorded" : value.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export function ViewGeneratorLogModal({
  open,
  entry,
  onClose,
  onEdit,
}: ViewGeneratorLogModalProps) {
  if (!entry) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry.generator || "Generator log"}
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
              Edit log
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex items-start gap-4 border-b border-border/70 pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
          {(entry.generator || "GL").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-primary">
            {entry.generator || "—"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {entry.date ? formatDate(entry.date) : "—"} · {entry.hours.toFixed(2)}{" "}
            run hours
            {entry.fuelUsed != null ? ` · ${entry.fuelUsed} L diesel on this date (all generators)` : ""}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Log ID" value={entry.id} />
        <Detail
          label={GENERATOR_LOG_FIELD_LABELS.date}
          value={entry.date ? formatDate(entry.date) : "—"}
        />
        <Detail
          label={GENERATOR_LOG_FIELD_LABELS.generator}
          value={entry.generator}
        />
        <Detail
          label={GENERATOR_LOG_FIELD_LABELS.hours}
          value={entry.hours.toFixed(2)}
        />
        <Detail
          label={GENERATOR_LOG_FIELD_LABELS.startMeterReading}
          value={formatReading(entry.startMeterReading)}
        />
        <Detail
          label={GENERATOR_LOG_FIELD_LABELS.endMeterReading}
          value={formatReading(entry.endMeterReading)}
        />
        {entry.logBasis === "clock_times" ? (
          <>
            <Detail label="Run start (legacy clock time)" value={formatDateTime(entry.startedAt ?? undefined)} />
            <Detail label="Run end (legacy clock time)" value={formatDateTime(entry.endedAt ?? undefined)} />
          </>
        ) : null}
        <Detail
          label={GENERATOR_LOG_FIELD_LABELS.fuelUsed}
          value={
            entry.fuelUsed != null
              ? `${entry.fuelUsed} L — total for all generators on this date, not this generator's own consumption`
              : "Diesel not recorded on this log (a date's total is recorded on one log of that date)"
          }
        />
        <Detail
          label={GENERATOR_LOG_FIELD_LABELS.remarks}
          value={entry.remarks?.trim() || "—"}
        />
      </div>
    </Modal>
  );
}
