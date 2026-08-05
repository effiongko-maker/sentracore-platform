"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import {
  useBuildingName,
  useFacilityName,
  useFloorName,
} from "@/hooks/useEntityLabel";
import { MASTER_DATA_STATUS_VARIANT } from "../constants";
import { labelize } from "../utils";
import type { MasterDataEntity, MasterDataItem } from "../types";
import { MasterDataRowActions } from "./MasterDataRowActions";

function FacilityLabel({ id }: { id?: string }) {
  const name = useFacilityName(id);
  return <span className="text-muted">{id ? name || id : "—"}</span>;
}

function BuildingLabel({ id }: { id?: string }) {
  const name = useBuildingName(id);
  return <span className="text-muted">{id ? name || id : "—"}</span>;
}

function FloorLabel({ id }: { id?: string }) {
  const name = useFloorName(id);
  return <span className="text-muted">{id ? name || id : "—"}</span>;
}

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
        render: (item) => <FacilityLabel id={item.facilityId} />,
      });
    }

    if (entity === "floors" || entity === "rooms") {
      cols.push({
        key: "buildingId",
        header: "Building",
        render: (item) => <BuildingLabel id={item.buildingId} />,
      });
    }

    if (entity === "rooms") {
      cols.push({
        key: "floorId",
        header: "Floor",
        render: (item) => <FloorLabel id={item.floorId} />,
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
  }, [entity, onView, onEdit, onDeactivate]);

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
