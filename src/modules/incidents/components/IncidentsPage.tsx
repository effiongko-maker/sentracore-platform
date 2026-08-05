"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useIncidents } from "../hooks/useIncidents";
import type { IncidentModalState } from "../types";
import { IncidentFormModal } from "./IncidentFormModal";
import { IncidentsTable } from "./IncidentsTable";
import { IncidentsToolbar } from "./IncidentsToolbar";
import { ViewIncidentModal } from "./ViewIncidentModal";

export function IncidentsPage() {
  const { toast } = useToast();
  const {
    incidents,
    loading,
    error,
    search,
    setSearch,
    severity,
    setSeverity,
    status,
    setStatus,
    facilityId,
    setFacilityId,
    assignedToUserId,
    setAssignedToUserId,
    requiresWorkOrder,
    setRequiresWorkOrder,
    page,
    setPage,
    totalPages,
    total,
    reload,
    deactivateIncident,
  } = useIncidents();

  const [modal, setModal] = useState<IncidentModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateIncident(modal.incident.id);
      toast({
        type: "success",
        title: "Incident deactivated",
        description: `${modal.incident.title} is now cancelled.`,
      });
      setModal({ type: "closed" });
      reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to deactivate incident",
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
        title="Incidents"
        description="Capture, escalate, and resolve safety and operational events."
        actions={
          <Button onClick={() => setModal({ type: "create" })}>
            <Plus className="h-4 w-4" />
            New Incident
          </Button>
        }
      />

      <IncidentsToolbar
        search={search}
        onSearchChange={setSearch}
        severity={severity}
        onSeverityChange={setSeverity}
        status={status}
        onStatusChange={setStatus}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        assignedToUserId={assignedToUserId}
        onAssignedToUserIdChange={setAssignedToUserId}
        requiresWorkOrder={requiresWorkOrder}
        onRequiresWorkOrderChange={setRequiresWorkOrder}
      />

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn’t load incidents"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : (
        <div className="overflow-x-auto">
          <IncidentsTable
            incidents={incidents}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(incident) => setModal({ type: "view", incident })}
            onEdit={(incident) => setModal({ type: "edit", incident })}
            onDeactivate={(incident) =>
              setModal({ type: "deactivate", incident })
            }
          />
        </div>
      )}

      <IncidentFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        incident={modal.type === "edit" ? modal.incident : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={reload}
      />

      <ViewIncidentModal
        open={modal.type === "view"}
        incident={modal.type === "view" ? modal.incident : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(incident) => setModal({ type: "edit", incident })}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Deactivate incident?"
        description={
          modal.type === "deactivate"
            ? `${modal.incident.title} will be marked cancelled. Incidents are never deleted.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </div>
  );
}
