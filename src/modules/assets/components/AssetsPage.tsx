"use client";

import { Package } from "lucide-react";
import { useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useAssets } from "../hooks/useAssets";
import type { AssetModalState } from "../types";
import { AssetFormModal } from "./AssetFormModal";
import { AssetsTable } from "./AssetsTable";
import { AssetsToolbar } from "./AssetsToolbar";
import { ViewAssetModal } from "./ViewAssetModal";

export function AssetsPage() {
  const { toast } = useToast();
  const {
    assets,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    category,
    setCategory,
    facility,
    setFacility,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
    deactivateAsset,
  } = useAssets();

  const [modal, setModal] = useState<AssetModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateAsset(modal.asset.id);
      toast({
        type: "success",
        title: "Asset deactivated",
        description: `${modal.asset.name} is now inactive.`,
      });
      setModal({ type: "closed" });
      await reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to deactivate asset",
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
        title="Assets"
        description="Operational objects — equipment, systems, and infrastructure with identity, status, and history."
        territoryNote={`${loading ? "—" : total} objects in view`}
      />

      <AssetsToolbar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        facility={facility}
        onFacilityChange={setFacility}
        status={status}
        onStatusChange={setStatus}
        sort={sort}
        onSortChange={setSort}
        total={total}
        loading={loading}
        onClearAll={clearAll}
        onCreate={() => setModal({ type: "create" })}
      />

      {error ? (
        <EmptyState
          icon={Package}
          title="Couldn’t load assets"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <AssetsTable
            assets={assets}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(asset) => setModal({ type: "view", asset })}
            onEdit={(asset) => setModal({ type: "edit", asset })}
            onDeactivate={(asset) => setModal({ type: "deactivate", asset })}
          />
        </StreamSurface>
      )}

      <AssetFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        asset={modal.type === "edit" ? modal.asset : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewAssetModal
        open={modal.type === "view"}
        asset={modal.type === "view" ? modal.asset : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(asset) => setModal({ type: "edit", asset })}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Deactivate asset?"
        description={
          modal.type === "deactivate"
            ? `${modal.asset.name} will be marked inactive. Assets are never deleted.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
