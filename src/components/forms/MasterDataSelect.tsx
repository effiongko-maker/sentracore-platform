"use client";

import { selectClassName } from "@/components/forms/FormField";
import { useMasterDataOptions } from "@/hooks/useMasterDataOptions";
import type { MasterDataEntity } from "@/modules/master-data/types";
import { cn } from "@/lib/utils";

type ValueMode = "id" | "name";

/**
 * Single-select backed by Master Data sheets via MasterDataService.
 */
export function MasterDataSelect({
  entity,
  value,
  onChange,
  facilityId,
  buildingId,
  floorId,
  enabled = true,
  disabled,
  valueMode = "id",
  placeholder,
  loadingPlaceholder,
  emptyOptionLabel,
  allowEmpty = true,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  entity: MasterDataEntity;
  value: string;
  onChange: (value: string) => void;
  facilityId?: string;
  buildingId?: string;
  floorId?: string;
  enabled?: boolean;
  disabled?: boolean;
  /** Persist option id (default) or display name (for legacy string fields). */
  valueMode?: ValueMode;
  placeholder?: string;
  loadingPlaceholder?: string;
  emptyOptionLabel?: string;
  allowEmpty?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const { items, loading } = useMasterDataOptions(entity, {
    enabled,
    facilityId,
    buildingId,
    floorId,
  });

  const optionValue = (item: { id: string; name: string }) =>
    valueMode === "name" ? item.name : item.id;

  const orphan =
    value &&
    !items.some((item) => optionValue(item) === value)
      ? value
      : null;

  const defaultPlaceholder =
    placeholder ??
    `Select ${entity.endsWith("s") ? entity.slice(0, -1) : entity}`;

  return (
    <select
      id={id}
      className={cn(selectClassName, className)}
      value={value}
      disabled={disabled || loading || !enabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      {allowEmpty ? (
        <option value="">
          {loading
            ? loadingPlaceholder ?? "Loading…"
            : emptyOptionLabel ?? defaultPlaceholder}
        </option>
      ) : null}
      {orphan ? <option value={orphan}>{orphan}</option> : null}
      {items.map((item) => (
        <option key={item.id} value={optionValue(item)}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
