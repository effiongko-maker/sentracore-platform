"use client";

import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { FACILITY_STATUS_VARIANT } from "../constants";
import { getFacilityInitials, labelize } from "../utils";
import type { Facility } from "../types";

interface ViewFacilityModalProps {
  open: boolean;
  facility: Facility | null;
  onClose: () => void;
  onEdit?: (facility: Facility) => void;
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

export function ViewFacilityModal({
  open,
  facility,
  onClose,
  onEdit,
}: ViewFacilityModalProps) {
  if (!facility) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={facility.name}
      description={facility.code}
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
                onEdit(facility);
              }}
            >
              Edit facility
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex items-start gap-4 border-b border-border/70 pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
          {getFacilityInitials(facility.name)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-primary">
              {facility.name}
            </p>
            <Badge variant={FACILITY_STATUS_VARIANT[facility.status]}>
              {labelize(facility.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {labelize(facility.type)} · {facility.location}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Facility ID" value={facility.id} />
        <Detail label="Facility code" value={facility.code || facility.id} />
        <Detail label="Location" value={facility.location} />
        <Detail label="Facility type" value={labelize(facility.type)} />
        <Detail label="Manager" value={facility.manager} />
        <Detail
          label="Status"
          value={
            <Badge variant={FACILITY_STATUS_VARIANT[facility.status]}>
              {labelize(facility.status)}
            </Badge>
          }
        />
        <Detail label="Created at" value={formatDate(facility.createdAt)} />
        <Detail label="Updated at" value={formatDate(facility.updatedAt)} />
        <Detail
          label="Description"
          value={facility.description || "—"}
        />
      </div>
    </Modal>
  );
}
