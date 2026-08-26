"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { MASTER_DATA_STATUS_VARIANT } from "../constants";
import {
  resolveRelationName,
  useMasterDataRelationMaps,
} from "../hooks/useMasterDataRelationMaps";
import { labelize } from "../utils";
import type { MasterDataEntity, MasterDataItem } from "../types";
import { MasterDataRowActions } from "./MasterDataRowActions";

export function MasterDataTable({
  entity,
  items,
  loading,
  page,
  totalPages,
  total,
  onPageChange,
  onView,
  onEdit,
  onDeactivate,
}: {
  entity: MasterDataEntity;
  items: MasterDataItem[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onView: (item: MasterDataItem) => void;
  onEdit: (item: MasterDataItem) => void;
  onDeactivate: (item: MasterDataItem) => void;
}) {
  const { facilities, buildings, floors, ready } =
    useMasterDataRelationMaps(true);

  const columns = useMemo<Column<MasterDataItem>[]>(() => {
    const cols: Column<MasterDataItem>[] = [
      {
        key: "name",
        header: "Name",
        render: (item) => (
          <div>
            <span className="font-medium text-foreground">{item.name}</span>
            <p className="text-xs text-muted">{item.id}</p>
          </div>
        ),
      },
      {
        key: "code",
        header: "Code",
        render: (item) => (
          <span className="text-foreground">{item.code || "—"}</span>
        ),
      },
    ];

    if (entity !== "vendors") {
      cols.push({
        key: "facilityId",
        header: "Facility",
        render: (item) => (
          <span className="text-muted">
            {resolveRelationName(item.facilityId, facilities, ready)}
          </span>
        ),
      });
    }

    if (entity === "floors" || entity === "rooms") {
      cols.push({
        key: "buildingId",
        header: "Building",
        render: (item) => (
          <span className="text-muted">
            {resolveRelationName(item.buildingId, buildings, ready)}
          </span>
        ),
      });
    }

    if (entity === "rooms") {
      cols.push({
        key: "floorId",
        header: "Floor",
        render: (item) => (
          <span className="text-muted">
            {resolveRelationName(item.floorId, floors, ready)}
          </span>
        ),
      });
    }

    if (entity === "vendors") {
      cols.push(
        {
          key: "category",
          header: "Category",
          render: (item) => (
            <span className="text-muted">{item.category || "—"}</span>
          ),
        },
        {
          key: "contactName",
          header: "Contact",
          render: (item) => (
            <span className="text-muted">{item.contactName || "—"}</span>
          ),
        }
      );
    }

    cols.push(
      {
        key: "status",
        header: "Status",
        render: (item) => (
          <Badge variant={MASTER_DATA_STATUS_VARIANT[item.status]}>
            {labelize(item.status)}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        className: "w-20 text-right",
        render: (item) => (
          <MasterDataRowActions
            label={item.name}
            canDeactivate={item.status !== "inactive"}
            onView={() => onView(item)}
            onEdit={() => onEdit(item)}
            onDeactivate={() => onDeactivate(item)}
          />
        ),
      }
    );

    return cols;
  }, [
    entity,
    facilities,
    buildings,
    floors,
    ready,
    onView,
    onEdit,
    onDeactivate,
  ]);

  return (
    <DataTable
      columns={columns}
      data={items}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      rowKey={(item) => item.id}
    />
  );
}
