"use client";

import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { DIESEL_USAGE_FIELD_LABELS } from "../constants";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { dieselGeneratorPresentation, dieselVariance, formatLitres, getDieselUsageFlagLabels } from "../utils";
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
  const facilityName = useFacilityName(entry?.facilityId);
  if (!entry) return null;

  const flags = getDieselUsageFlagLabels(entry.consumption, entry.recordOrigin);
  const generator = dieselGeneratorPresentation(entry);
  const variance = dieselVariance(entry);
  const recorded = (v: number | null | undefined) => (v == null ? "Not recorded" : String(v));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={generator.primary === "—" ? "Diesel usage" : generator.primary}
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
            {facilityName || "—"} · Consumption {formatLitres(entry.consumption)}
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
          value={facilityName || "—"}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.generatorId}
          value={generator.note ? `${generator.primary} (${generator.note})` : generator.primary}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.openingLevel}
          value={recorded(entry.openingLevel)}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.undergroundTankQty}
          value={recorded(entry.undergroundTankQty)}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.surfaceTankQty}
          value={recorded(entry.surfaceTankQty)}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.added}
          value={recorded(entry.added)}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.closingLevel}
          value={recorded(entry.closingLevel)}
        />
        <Detail
          label={DIESEL_USAGE_FIELD_LABELS.consumption}
          value={recorded(entry.consumption)}
        />
        <Detail
          label="Reading variance (L)"
          value={
            variance
              ? `${variance.variance > 0 ? "+" : ""}${variance.variance} — (opening${variance.addedRecorded ? " + added" : ""} − closing) − consumption; readings are physical measurements, shown not corrected${variance.addedRecorded ? "" : " (no delivery recorded)"}`
              : "Not available — a reading or consumption is not recorded"
          }
        />
      </div>
    </Modal>
  );
}
