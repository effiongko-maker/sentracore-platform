"use client";

import { useEffect, useRef, useState } from "react";
import { RelatedOperationalContextPanel } from "@/components/operational/RelatedOperationalContextPanel";
import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import {
  useAssetName,
  useFacilityName,
  useUserName,
  useWorkOrderTitle,
} from "@/hooks/useEntityLabel";
import { OrderTypePicker } from "@/modules/work-orders/components/OrderTypePicker";
import { ExecutionBasisField } from "@/modules/maintenance/components/ExecutionBasisField";
import type { WorkCommercialRoute } from "@/modules/maintenance/types";
import type { WorkInstructionKind } from "@/modules/work-orders/instructionKind";
import { triageIncident } from "../actions/triageIncident";
import type { TriageResponse } from "@/lib/operational/orchestration";
import {
  INCIDENT_SEVERITY_VARIANT,
  INCIDENT_STATUS_VARIANT,
} from "../constants";
import { labelize } from "../utils";
import type { Incident } from "../types";
import { IncidentIntelligencePanel } from "./intelligence/IncidentIntelligencePanel";

interface ViewIncidentModalProps {
  open: boolean;
  incident: Incident | null;
  onClose: () => void;
  onEdit?: (incident: Incident) => void;
  /** Called after a next-step action succeeds so the list can revalidate. */
  onUpdated?: (incident: Incident) => void;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

const NEXT_STEP_OPTIONS: Array<{
  value: TriageResponse;
  label: string;
  description: string;
}> = [
  {
    value: "resolve_without_work",
    label: "Resolve this incident",
    description: "Close the incident without creating operational work.",
  },
  {
    value: "create_maintenance",
    label: "Create a maintenance request",
    description: "Open linked maintenance while keeping the incident open.",
  },
  {
    value: "create_work_order",
    label: "Create a work order",
    description: "Create a linked work order while keeping the incident open.",
  },
  {
    value: "create_both",
    label: "Create both maintenance and a work order",
    description: "Create linked maintenance and a work order together.",
  },
];

function isTerminalStatus(status: Incident["status"]): boolean {
  return (
    status === "resolved" || status === "closed" || status === "cancelled"
  );
}

function hasOperationalLinks(incident: Incident): boolean {
  return (
    (incident.maintenanceIds?.length ?? 0) > 0 ||
    (incident.workOrderIds?.length ?? 0) > 0 ||
    Boolean(incident.workOrderId)
  );
}

function nextActionSummary(incident: Incident): string | null {
  if (isTerminalStatus(incident.status)) {
    return incident.status === "cancelled"
      ? "Incident cancelled"
      : "Incident resolved";
  }

  const hasMaintenance = (incident.maintenanceIds?.length ?? 0) > 0;
  const hasWorkOrder =
    (incident.workOrderIds?.length ?? 0) > 0 || Boolean(incident.workOrderId);

  if (hasMaintenance && hasWorkOrder) {
    return "Maintenance work and work order linked";
  }
  if (hasMaintenance) return "Maintenance work linked";
  if (hasWorkOrder) return "Work order linked";
  return null;
}

export function ViewIncidentModal({
  open,
  incident,
  onClose,
  onEdit,
  onUpdated,
}: ViewIncidentModalProps) {
  const { toast } = useToast();
  const [displayIncident, setDisplayIncident] = useState<Incident | null>(
    incident
  );
  const [nextStep, setNextStep] =
    useState<TriageResponse>("create_maintenance");
  const [applying, setApplying] = useState(false);
  const [orderType, setOrderType] = useState<WorkInstructionKind | "">("");
  // create_both: the new Work's execution basis IS the Order Type (never asked twice). create_work_order: the Incident's
  // existing Work supplies it when classified; the picker only matters for legacy-unclassified Work.
  const needsOrderType = nextStep === "create_work_order";
  // Creating Work requires an explicit Execution basis (never defaulted).
  const [commercialRoute, setCommercialRoute] = useState<WorkCommercialRoute | "">("");
  const needsExecutionBasis =
    nextStep === "create_maintenance" || nextStep === "create_both";
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      submittingRef.current = false;
      setApplying(false);
      return;
    }
    setDisplayIncident(incident);
    setNextStep("create_maintenance");
    setCommercialRoute("");
  }, [open, incident]);

  const facilityName = useFacilityName(displayIncident?.facilityId);
  const assetName = useAssetName(displayIncident?.assetId);
  const assigneeName = useUserName(displayIncident?.assignedToUserId);
  const reportedByName = useUserName(displayIncident?.reportedByUserId);
  const workOrderTitle = useWorkOrderTitle(displayIncident?.workOrderId);

  if (!displayIncident) return null;

  const summary = nextActionSummary(displayIncident);
  const canApplyNextStep =
    displayIncident.recordOrigin !== "migrated_historical" &&
    !isTerminalStatus(displayIncident.status) &&
    !hasOperationalLinks(displayIncident) &&
    (displayIncident.status === "reported" ||
      displayIncident.status === "triaged");

  async function handleApplyNextStep() {
    if (!displayIncident || submittingRef.current || applying) return;

    submittingRef.current = true;
    setApplying(true);

    try {
      const result = await triageIncident({
        incidentId: displayIncident.id,
        response: nextStep,
        ...(needsOrderType && orderType ? { orderType } : {}),
        ...(needsExecutionBasis && commercialRoute ? { commercialRoute } : {}),
      });

      if (!result.success) {
        throw new Error(result.error.message);
      }

      const updated = result.data.incident;
      setDisplayIncident(updated);
      setContextRefreshKey((key) => key + 1);

      const successDescription =
        nextStep === "resolve_without_work"
          ? "The incident has been resolved."
          : nextStep === "create_maintenance"
            ? "A linked maintenance request was created."
            : nextStep === "create_work_order"
              ? "A linked work order was created."
              : "Linked maintenance and work order were created.";

      toast({
        type: "success",
        title: "Next step applied",
        description: successDescription,
      });

      onUpdated?.(updated);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[ViewIncidentModal] apply next step failed", err);
      }
      toast({
        type: "error",
        title: "Unable to apply next step",
        description:
          err instanceof Error ? err.message : "Please try again shortly.",
      });
    } finally {
      submittingRef.current = false;
      setApplying(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={displayIncident.title}
      description={`${labelize(displayIncident.severity)} · ${labelize(displayIncident.status)}`}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {onEdit && displayIncident.recordOrigin !== "migrated_historical" ? (
            <Button
              type="button"
              onClick={() => {
                onClose();
                onEdit(displayIncident);
              }}
            >
              Investigate
            </Button>
          ) : null}
        </>
      }
    >
      {displayIncident.recordOrigin === "migrated_historical" ? (
        <p className="mb-4 rounded-lg border border-border/70 bg-slate-50 px-3 py-2 text-sm text-muted">
          Imported historical record — read-only source evidence. Status and severity were not recorded in the
          source, and this record cannot be edited, investigated or cancelled.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-5">
        <Badge variant={INCIDENT_STATUS_VARIANT[displayIncident.status]}>
          {labelize(displayIncident.status)}
        </Badge>
        <Badge variant={INCIDENT_SEVERITY_VARIANT[displayIncident.severity]}>
          {labelize(displayIncident.severity)}
        </Badge>
        <span className="text-sm text-muted">
          {labelize(displayIncident.type)}
        </span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail label="Incident ID" value={displayIncident.id} />
        <Detail label="Source" value={labelize(displayIncident.source)} />
        <Detail
          label="Facility"
          value={facilityName || displayIncident.facilityId}
        />
        <Detail
          label="Asset"
          value={
            displayIncident.assetId
              ? assetName || displayIncident.assetId
              : "—"
          }
        />
        <Detail
          label="Assigned to"
          value={
            displayIncident.assignedToUserId
              ? assigneeName || displayIncident.assignedToUserId
              : "—"
          }
        />
        <Detail
          label="Reported by"
          value={
            displayIncident.reportedByUserId
              ? reportedByName || displayIncident.reportedByUserId
              : "—"
          }
        />
        <Detail
          label="Reported at"
          value={formatDate(displayIncident.reportedAt)}
        />
        <Detail
          label="Reported via"
          value={
            displayIncident.reportedVia
              ? labelize(displayIncident.reportedVia)
              : "—"
          }
        />
        <Detail
          label="Requires work order"
          value={displayIncident.requiresWorkOrder ? "Yes" : "No"}
        />
        <Detail
          label="Work orders"
          value={
            displayIncident.workOrderIds?.length
              ? displayIncident.workOrderIds.join(", ")
              : displayIncident.workOrderId
                ? workOrderTitle || displayIncident.workOrderId
                : "—"
          }
        />
        <Detail
          label="Maintenance"
          value={
            displayIncident.maintenanceIds?.length
              ? displayIncident.maintenanceIds.join(", ")
              : "—"
          }
        />
        <Detail
          label="Location detail"
          value={displayIncident.locationDetail || "—"}
        />
        <Detail
          label="Created at"
          value={formatDate(displayIncident.createdAt)}
        />
        <Detail
          label="Description"
          value={displayIncident.description || "—"}
        />
        <Detail label="Root cause" value={displayIncident.rootCause || "—"} />
        <Detail
          label="Resolution notes"
          value={displayIncident.resolutionNotes || "—"}
        />
      </div>

      {canApplyNextStep ? (
        <section className="mt-6 space-y-3 border-t border-border/70 pt-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              What should happen next?
            </p>
            <p className="mt-1 text-sm text-muted">
              Decide how this incident should be handled operationally.
            </p>
          </div>
          <div className="grid gap-2">
            {NEXT_STEP_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="incident-next-step"
                  className="mt-1"
                  value={option.value}
                  checked={nextStep === option.value}
                  disabled={applying}
                  onChange={() => setNextStep(option.value)}
                />
                <span>
                  <span className="font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {needsExecutionBasis ? (
            <ExecutionBasisField
              id="incident-execution-basis"
              value={commercialRoute}
              onChange={setCommercialRoute}
              disabled={applying}
            />
          ) : null}
          {needsOrderType ? (
            <div className="space-y-1">
              <OrderTypePicker value={orderType} onChange={setOrderType} disabled={applying} />
              <p className="text-xs text-muted">
                Only needed when the Work has no execution basis; otherwise it follows the Work.
              </p>
            </div>
          ) : null}
          {nextStep === "create_both" && commercialRoute === "job_order" ? (
            <p className="text-xs text-muted">
              A Job Order is issued only after the client approves: create the maintenance request first, then request
              client approval from the Work.
            </p>
          ) : null}
          <Button
            type="button"
            onClick={handleApplyNextStep}
            disabled={
              applying ||
              (needsExecutionBasis && !commercialRoute) ||
              (nextStep === "create_both" && commercialRoute === "job_order")
            }
            loading={applying}
          >
            {applying ? "Applying..." : "Apply next step"}
          </Button>
        </section>
      ) : summary ? (
        <section className="mt-6 space-y-2 border-t border-border/70 pt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Next action
          </p>
          <p className="text-sm font-medium text-foreground">{summary}</p>
          <p className="text-sm text-muted">
            {isTerminalStatus(displayIncident.status)
              ? "This incident is closed. No further operational next step is available here."
              : "Linked operational work is already recorded for this incident."}
          </p>
        </section>
      ) : null}

      <RelatedOperationalContextPanel
        incidentId={displayIncident.id}
        active={open}
        refreshKey={contextRefreshKey}
      />

      <IncidentIntelligencePanel
        incidentId={displayIncident.id}
        active={open}
      />
    </Modal>
  );
}
