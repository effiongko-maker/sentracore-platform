"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useFacilities } from "../hooks/useFacilities";
import type { FacilityModalState } from "../types";
import { FacilityFormModal } from "./FacilityFormModal";
import { FacilitiesTable } from "./FacilitiesTable";
import { FacilitiesToolbar } from "./FacilitiesToolbar";
import { ViewFacilityModal } from "./ViewFacilityModal";

export function FacilitiesPage() {
  const { toast } = useToast();
  const {
    facilities,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    type,
    setType,
    location,
    setLocation,
    page,
    setPage,
    totalPages,
    total,
    reload,
    deactivateFacility,
  } = useFacilities();

  const [modal, setModal] = useState<FacilityModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateFacility(modal.facility.id);
      toast({
        type: "success",
        title: "Facility deactivated",
        description: `${modal.facility.name} is now inactive.`,
      });
      setModal({ type: "closed" });
      reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to deactivate facility",
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
        title="Facilities"
        description="Manage sites, buildings, and locations across the SentraCore platform."
        actions={
          <Button onClick={() => setModal({ type: "create" })}>
            <Plus className="h-4 w-4" />
            New Facility
          </Button>
        }
      />

      <FacilitiesToolbar
        search={search}
        onSearchChange={setSearch}
        type={type}
        onTypeChange={setType}
        location={location}
        onLocationChange={setLocation}
        status={status}
        onStatusChange={setStatus}
      />

      {error ? (
        <EmptyState
          title="Couldn’t load facilities"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : (
        <div className="overflow-x-auto">
          <FacilitiesTable
            facilities={facilities}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(facility) => setModal({ type: "view", facility })}
            onEdit={(facility) => setModal({ type: "edit", facility })}
            onDeactivate={(facility) =>
              setModal({ type: "deactivate", facility })
            }
          />
        </div>
      )}

      <FacilityFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        facility={modal.type === "edit" ? modal.facility : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={reload}
      />

      <ViewFacilityModal
        open={modal.type === "view"}
        facility={modal.type === "view" ? modal.facility : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(facility) => setModal({ type: "edit", facility })}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Deactivate facility?"
        description={
          modal.type === "deactivate"
            ? `${modal.facility.name} will be marked inactive. Facilities are never deleted.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </div>
  );
}
