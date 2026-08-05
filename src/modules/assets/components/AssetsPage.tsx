"use client";

import { Package, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
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
    page,
    setPage,
    totalPages,
    total,
    reload,
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
      reload();
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
    <div>
      <PageHeader
        title="Assets"
        description="Track equipment, systems, and critical infrastructure."
        actions={
          <Button onClick={() => setModal({ type: "create" })}>
            <Plus className="h-4 w-4" />
            New Asset
          </Button>
        }
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
      />

      {error ? (
        <EmptyState
          icon={Package}
          title="Couldn’t load assets"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : (
        <div className="overflow-x-auto">
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
        </div>
      )}

      <AssetFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        asset={modal.type === "edit" ? modal.asset : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={reload}
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
    </div>
  );
}
