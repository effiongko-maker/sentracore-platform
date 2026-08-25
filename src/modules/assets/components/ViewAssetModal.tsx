"use client";

import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { toDateInputValue } from "../utils";
import {
  ASSET_CRITICALITY_VARIANT,
  ASSET_STATUS_VARIANT,
} from "../constants";
import { getAssetInitials, labelize } from "../utils";
import type { Asset } from "../types";

interface ViewAssetModalProps {
  open: boolean;
  asset: Asset | null;
  onClose: () => void;
  onEdit?: (asset: Asset) => void;
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

export function ViewAssetModal({
  open,
  asset,
  onClose,
  onEdit,
}: ViewAssetModalProps) {
  if (!asset) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asset.name}
      description={asset.id}
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
                onEdit(asset);
              }}
            >
              Edit asset
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex items-start gap-4 border-b border-border/70 pb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">
          {getAssetInitials(asset.name)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-primary">{asset.name}</p>
            <Badge variant={ASSET_STATUS_VARIANT[asset.status]}>
              {labelize(asset.status)}
            </Badge>
            <Badge variant={ASSET_CRITICALITY_VARIANT[asset.criticality]}>
              {labelize(asset.criticality)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {labelize(asset.category)} · {asset.facility || "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Asset ID" value={asset.id} />
        <Detail label="Category" value={labelize(asset.category)} />
        <Detail label="Facility" value={asset.facility} />
        <Detail label="Manufacturer" value={asset.manufacturer} />
        <Detail label="Model" value={asset.model} />
        <Detail label="Serial number" value={asset.serialNumber} />
        <Detail label="OEM ID" value={asset.oemId} />
        <Detail label="Condition" value={labelize(asset.condition)} />
        <Detail label="Assigned to" value={asset.assignedTo} />
        <Detail
          label="Status"
          value={
            <Badge variant={ASSET_STATUS_VARIANT[asset.status]}>
              {labelize(asset.status)}
            </Badge>
          }
        />
        <Detail
          label="Install date"
          value={toDateInputValue(asset.installDate) || "—"}
        />
        <Detail
          label="Warranty expiry"
          value={toDateInputValue(asset.warrantyExpiry) || "—"}
        />
        <Detail label="Criticality" value={labelize(asset.criticality)} />
      </div>
    </Modal>
  );
}
