"use client";

import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useFacilities } from "../hooks/useFacilities";
import type { FacilityModalState } from "../types";
import { FacilityService } from "../services/FacilityService";
import { FacilityFormModal } from "./FacilityFormModal";
import { FacilitiesTable } from "./FacilitiesTable";
import { FacilitiesToolbar } from "./FacilitiesToolbar";
import { ViewFacilityModal } from "./ViewFacilityModal";

export function FacilitiesPage() {
  const { toast } = useToast();
  const openId = useQueryRecordId();
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

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void FacilityService.getFacility(openId)
      .then((facility) => {
        if (!cancelled && facility) setModal({ type: "view", facility });
      })
      .catch(() => {
        /* leave list as-is if record cannot be loaded */
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

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
    <ModeFrame mode="organise">
      <ExploreHeader
        title="Facilities"
        description="The operational geography of your organisation — sites, buildings, and locations where work happens."
        territoryNote={`${loading ? "—" : total} locations in view`}
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
          icon={Building2}
          title="Couldn’t load facilities"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : (
        <StreamSurface>
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
        </StreamSurface>
      )}

      <FacilityFormModal
        open={modal.type === "edit"}
        mode="edit"
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
            ? `${modal.facility.name} will be marked inactive.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </ModeFrame>
  );
}
