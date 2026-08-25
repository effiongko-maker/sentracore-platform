"use client";

import { useMemo } from "react";
import { Package } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { useFacilityName } from "@/hooks/useEntityLabel";
import {
  ASSET_CRITICALITY_VARIANT,
  ASSET_STATUS_VARIANT,
} from "../constants";
import { getAssetInitials, labelize } from "../utils";
import type { Asset } from "../types";
import { AssetRowActions } from "./AssetRowActions";

function FacilityCell({ value }: { value: string }) {
  const name = useFacilityName(value);
  return <span className="text-muted">{name || value || "—"}</span>;
}

interface AssetsTableProps {
  assets: Asset[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onDeactivate: (asset: Asset) => void;
}

export function AssetsTable({
  assets,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
}: AssetsTableProps) {
  const columns = useMemo<Column<Asset>[]>(
    () => [
      {
        key: "name",
        header: "Asset",
        render: (asset) => (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-white">
              {getAssetInitials(asset.name)}
            </div>
            <div>
              <span className="font-medium text-foreground">{asset.name}</span>
              <p className="text-xs text-muted">{asset.id}</p>
            </div>
          </div>
        ),
      },
      {
        key: "category",
        header: "Category",
        render: (asset) => (
          <span className="text-foreground">{labelize(asset.category)}</span>
        ),
      },
      {
        key: "facility",
        header: "Facility",
        render: (asset) => <FacilityCell value={asset.facility} />,
      },
      {
        key: "condition",
        header: "Condition",
        render: (asset) => (
          <span className="text-muted">{labelize(asset.condition)}</span>
        ),
      },
      {
        key: "criticality",
        header: "Criticality",
        render: (asset) => (
          <Badge variant={ASSET_CRITICALITY_VARIANT[asset.criticality]}>
            {labelize(asset.criticality)}
          </Badge>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (asset) => (
          <Badge variant={ASSET_STATUS_VARIANT[asset.status]}>
            {labelize(asset.status)}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (asset) => (
          <AssetRowActions
            asset={asset}
            onView={onView}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
          />
        ),
      },
    ],
    [onView, onEdit, onDeactivate]
  );

  return (
    <DataTable
      columns={columns}
      data={assets}
      rowKey={(asset) => asset.id}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyIcon={Package}
      emptyTitle="No assets match your filters"
      emptyDescription="Clear search or adjust category, facility, and status filters to find equipment."
      className="min-w-0"
    />
  );
}
