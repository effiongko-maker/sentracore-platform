"use client";

import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MASTER_DATA_STATUS_VARIANT } from "../constants";
import { entitySingular, labelize } from "../utils";
import type { MasterDataEntity, MasterDataItem } from "../types";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function ViewMasterDataModal({
  open,
  entity,
  item,
  onClose,
  onEdit,
}: {
  open: boolean;
  entity: MasterDataEntity;
  item: MasterDataItem | null;
  onClose: () => void;
  onEdit: (item: MasterDataItem) => void;
}) {
  if (!item) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.name}
      description={`${entitySingular(entity)} · ${item.id}`}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Badge variant={MASTER_DATA_STATUS_VARIANT[item.status]}>
            {labelize(item.status)}
          </Badge>
          {item.code ? (
            <span className="text-sm text-muted">Code {item.code}</span>
          ) : null}
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          {item.facilityId ? (
            <Detail label="Facility" value={item.facilityId} />
          ) : null}
          {item.buildingId ? (
            <Detail label="Building" value={item.buildingId} />
          ) : null}
          {item.floorId ? <Detail label="Floor" value={item.floorId} /> : null}
          {item.level ? <Detail label="Level" value={item.level} /> : null}
          {item.category ? (
            <Detail label="Category" value={item.category} />
          ) : null}
          {item.contactName ? (
            <Detail label="Contact" value={item.contactName} />
          ) : null}
          {item.email ? <Detail label="Email" value={item.email} /> : null}
          {item.phone ? <Detail label="Phone" value={item.phone} /> : null}
          {item.description ? (
            <div className="sm:col-span-2">
              <Detail label="Description" value={item.description} />
            </div>
          ) : null}
        </dl>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={() => onEdit(item)}>
            Edit
          </Button>
        </div>
      </div>
    </Modal>
  );
}
