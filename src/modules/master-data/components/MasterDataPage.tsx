"use client";

import { Database } from "lucide-react";
import { useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { cn } from "@/lib/utils";
import { MASTER_DATA_ENTITIES } from "../constants";
import { useMasterData } from "../hooks/useMasterData";
import { entitySingular } from "../utils";
import type { MasterDataEntity, MasterDataModalState } from "../types";
import { MasterDataFormModal } from "./MasterDataFormModal";
import { MasterDataTable } from "./MasterDataTable";
import { MasterDataToolbar } from "./MasterDataToolbar";
import { ViewMasterDataModal } from "./ViewMasterDataModal";

export function MasterDataPage() {
  const { toast } = useToast();
  const [entity, setEntity] = useState<MasterDataEntity>("departments");
  const {
    items,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    facilityId,
    setFacilityId,
    buildingId,
    setBuildingId,
    floorId,
    setFloorId,
    category,
    setCategory,
    page,
    setPage,
    totalPages,
    total,
    reload,
    clearAll,
    deactivateItem,
  } = useMasterData(entity);

  const [modal, setModal] = useState<MasterDataModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);
  const activeMeta = MASTER_DATA_ENTITIES.find((item) => item.id === entity);
  const singular = entitySingular(entity);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateItem(modal.item.id);
      toast({
        type: "success",
        title: `${singular} deactivated`,
        description: `${modal.item.name} is now inactive.`,
      });
      setModal({ type: "closed" });
      reload();
    } catch (err) {
      toast({
        type: "error",
        title: `Unable to deactivate ${singular.toLowerCase()}`,
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <ModeFrame mode="organise">
      <ExploreHeader
        title="Master data"
        description="Reference structure — departments, buildings, floors, rooms, and vendors that define the operation."
        territoryNote={`${loading ? "—" : total} ${activeMeta?.label.toLowerCase() ?? "records"} in view`}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {MASTER_DATA_ENTITIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setEntity(item.id)}
            className={cn(
              "rounded-sc border px-3 py-2 text-left text-sm transition-colors",
              entity === item.id
                ? "border-primary/30 bg-primary text-white"
                : "border-border bg-card text-foreground hover:border-primary/20"
            )}
          >
            <span className="block font-medium">{item.label}</span>
          </button>
        ))}
      </div>

      {activeMeta ? (
        <p className="mb-4 text-sm text-muted">{activeMeta.description}</p>
      ) : null}

      <MasterDataToolbar
        entity={entity}
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        buildingId={buildingId}
        onBuildingIdChange={setBuildingId}
        floorId={floorId}
        onFloorIdChange={setFloorId}
        category={category}
        onCategoryChange={setCategory}
        total={total}
        loading={loading}
        onClearAll={clearAll}
        onCreate={() => setModal({ type: "create" })}
        createLabel={`New ${singular.toLowerCase()}`}
      />

      {error ? (
        <EmptyState
          icon={Database}
          title={`Couldn’t load ${activeMeta?.label.toLowerCase() ?? "master data"}`}
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : (
        <StreamSurface>
          <MasterDataTable
            entity={entity}
            items={items}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(item) => setModal({ type: "view", item })}
            onEdit={(item) => setModal({ type: "edit", item })}
            onDeactivate={(item) => setModal({ type: "deactivate", item })}
          />
        </StreamSurface>
      )}

      <MasterDataFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        entity={entity}
        item={modal.type === "edit" ? modal.item : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={reload}
      />

      <ViewMasterDataModal
        open={modal.type === "view"}
        entity={entity}
        item={modal.type === "view" ? modal.item : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(item) => setModal({ type: "edit", item })}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title={`Deactivate ${singular.toLowerCase()}?`}
        description={
          modal.type === "deactivate"
            ? `${modal.item.name} will be marked inactive. Master data rows are never deleted.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
