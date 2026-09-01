"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { MasterDataSelect } from "@/components/forms/MasterDataSelect";
import { useToast } from "@/components/ui/Toast";
import { useMasterDataOptions } from "@/hooks/useMasterDataOptions";
import { FacilityService } from "@/services/facilities/FacilityService";
import { AssetService } from "@/services/assets/AssetService";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type { Facility } from "@/modules/facilities/types";
import type { Asset } from "@/modules/assets/types";
import type { User } from "@/modules/users/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import { cn } from "@/lib/utils";
import {
  INCIDENT_CHANNELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from "../constants";
import { reportIncident } from "../actions/reportIncident";
import { labelize, optionalString } from "../utils";
import type {
  IncidentChannel,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
  ReportIncidentInput,
} from "../types";

interface ReportIncidentModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

type ReportTab = "quick" | "details";

type ReportFormState = {
  title: string;
  facilityId: string;
  severity: IncidentSeverity;
  description: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  locationNotes: string;
  type: IncidentType | "";
  source: IncidentSource | "";
  status: IncidentStatus | "";
  assignedToUserId: string;
  reportedByUserId: string;
  reportedAt: string;
  reportedVia: IncidentChannel | "";
  assetId: string;
  requiresWorkOrder: boolean;
  workOrderId: string;
};

function emptyForm(): ReportFormState {
  return {
    title: "",
    facilityId: "",
    severity: "medium",
    description: "",
    buildingId: "",
    floorId: "",
    roomId: "",
    locationNotes: "",
    type: "",
    source: "",
    status: "",
    assignedToUserId: "",
    reportedByUserId: "",
    reportedAt: "",
    reportedVia: "",
    assetId: "",
    requiresWorkOrder: false,
    workOrderId: "",
  };
}

function composeLocationDetail(parts: {
  buildingName?: string;
  floorName?: string;
  roomName?: string;
  notes?: string;
}): string | undefined {
  const composed = [parts.buildingName, parts.floorName, parts.roomName, parts.notes]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");
  return composed || undefined;
}

function toDatetimeLocalValue(isoOrLocal: string): string {
  if (!isoOrLocal) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(isoOrLocal)) return isoOrLocal;
  const ms = Date.parse(isoOrLocal);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 16);
}

export function ReportIncidentModal({
  open,
  onClose,
  onSaved,
}: ReportIncidentModalProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<ReportTab>("quick");
  const [form, setForm] = useState<ReportFormState>(emptyForm);
  const [errors, setErrors] = useState<{
    title?: string;
    facilityId?: string;
    workOrderId?: string;
    reportedAt?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [showSpecificLocation, setShowSpecificLocation] = useState(false);

  const { items: buildings } = useMasterDataOptions("buildings", {
    facilityId: form.facilityId || undefined,
    enabled: open && showSpecificLocation && Boolean(form.facilityId),
  });
  const { items: floors } = useMasterDataOptions("floors", {
    facilityId: form.facilityId || undefined,
    buildingId: form.buildingId || undefined,
    enabled:
      open &&
      showSpecificLocation &&
      Boolean(form.facilityId && form.buildingId),
  });
  const { items: rooms } = useMasterDataOptions("rooms", {
    facilityId: form.facilityId || undefined,
    buildingId: form.buildingId || undefined,
    floorId: form.floorId || undefined,
    enabled:
      open &&
      showSpecificLocation &&
      Boolean(form.facilityId && form.buildingId && form.floorId),
  });

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setErrors({});
    setTab("quick");
    setShowSpecificLocation(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      FacilityService.listFacilities({ page: 1, pageSize: 200 }),
      AssetService.listAssetsCatalog({ page: 1, pageSize: 200 }),
      UserService.listUsersCatalog({ page: 1, pageSize: 200 }),
      WorkOrderService.listWorkOrders({ page: 1, pageSize: 200 }),
    ])
      .then(([facilityPage, assetPage, userPage, workOrderPage]) => {
        if (cancelled) return;
        setFacilities(facilityPage.data);
        setAssets(assetPage.data);
        setUsers(userPage.data);
        setWorkOrders(workOrderPage.data);
      })
      .catch(() => {
        if (cancelled) return;
        setFacilities([]);
        setAssets([]);
        setUsers([]);
        setWorkOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const facilityName = facilities.find((f) => f.id === form.facilityId)?.name;
  const filteredAssets = form.facilityId
    ? assets.filter(
        (asset) =>
          asset.facility === form.facilityId ||
          (facilityName != null && asset.facility === facilityName)
      )
    : assets;

  function updateField<K extends keyof ReportFormState>(
    key: K,
    value: ReportFormState[K]
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "facilityId") {
        next.buildingId = "";
        next.floorId = "";
        next.roomId = "";
        next.assetId = "";
      }
      if (key === "buildingId") {
        next.floorId = "";
        next.roomId = "";
      }
      if (key === "floorId") {
        next.roomId = "";
      }
      if (key === "requiresWorkOrder" && value === false) {
        next.workOrderId = "";
      }
      return next;
    });
    setErrors((current) => ({
      ...current,
      [key]: undefined,
    }));
  }

  function validate() {
    const next: {
      title?: string;
      facilityId?: string;
      workOrderId?: string;
      reportedAt?: string;
    } = {};

    if (!form.title.trim()) next.title = "Please describe what happened";
    if (!form.facilityId.trim()) next.facilityId = "Please select a facility";

    if (form.requiresWorkOrder === false && form.workOrderId.trim()) {
      next.workOrderId =
        "Work order must be empty when requires work order is No";
    }

    if (form.reportedAt.trim()) {
      const ms = Date.parse(form.reportedAt);
      if (!Number.isFinite(ms)) {
        next.reportedAt = "Reported at is invalid";
      }
    }

    setErrors(next);

    if (next.title || next.facilityId) {
      setTab("quick");
      return false;
    }
    if (next.workOrderId || next.reportedAt) {
      setTab("details");
      return false;
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const buildingName = buildings.find(
        (item) => item.id === form.buildingId
      )?.name;
      const floorName = floors.find((item) => item.id === form.floorId)?.name;
      const roomName = rooms.find((item) => item.id === form.roomId)?.name;

      const payload: ReportIncidentInput = {
        title: form.title.trim(),
        facilityId: form.facilityId.trim(),
        severity: form.severity,
        description: optionalString(form.description),
        buildingId: optionalString(form.buildingId),
        floorId: optionalString(form.floorId),
        roomId: optionalString(form.roomId),
        locationDetail: composeLocationDetail({
          buildingName,
          floorName,
          roomName,
          notes: form.locationNotes,
        }),
        type: form.type || undefined,
        source: form.source || undefined,
        status: form.status || undefined,
        assignedToUserId: optionalString(form.assignedToUserId),
        reportedByUserId: optionalString(form.reportedByUserId),
        reportedAt: optionalString(form.reportedAt)
          ? new Date(form.reportedAt).toISOString()
          : undefined,
        reportedVia: form.reportedVia || undefined,
        assetId: optionalString(form.assetId),
        requiresWorkOrder: form.requiresWorkOrder ? true : undefined,
        workOrderId: optionalString(form.workOrderId),
      };

      const result = await reportIncident(payload);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      toast({
        type: "success",
        title: "Incident reported",
        description: `${result.data.title} has been logged.`,
      });

      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to report incident",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Report event"
      description="Log a significant operational event that needs investigation or containment."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="report-incident-form" loading={saving}>
            Report incident
          </Button>
        </>
      }
    >
      <form
        id="report-incident-form"
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <div
          className="flex gap-1 border-b border-border/70"
          role="tablist"
          aria-label="Incident reporting detail"
        >
          {(
            [
              { id: "quick", label: "Quick report" },
              { id: "details", label: "Additional details" },
            ] as const
          ).map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                )}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "quick" ? (
          <div className="space-y-5" role="tabpanel">
            <FormField
              label="What happened?"
              htmlFor="report-title"
              required
              error={errors.title}
            >
              <input
                id="report-title"
                className={inputClassName}
                placeholder="e.g. Water is leaking from the ceiling in the lobby"
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                autoFocus
              />
            </FormField>

            <FormField
              label="Where did this happen?"
              htmlFor="report-facility"
              required
              error={errors.facilityId}
            >
              <select
                id="report-facility"
                className={selectClassName}
                value={form.facilityId}
                onChange={(event) =>
                  updateField("facilityId", event.target.value)
                }
              >
                <option value="">Select facility</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
              </select>
            </FormField>

            {!showSpecificLocation ? (
              <button
                type="button"
                className="text-sm font-medium text-accent transition-colors hover:text-accent/80"
                onClick={() => setShowSpecificLocation(true)}
              >
                + Add a more specific location
              </button>
            ) : (
              <div className="space-y-3 rounded-sc border border-border/70 bg-slate-50/50 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    More specific location
                  </p>
                  <button
                    type="button"
                    className="text-xs font-medium text-muted hover:text-foreground"
                    onClick={() => {
                      setShowSpecificLocation(false);
                      setForm((current) => ({
                        ...current,
                        buildingId: "",
                        floorId: "",
                        roomId: "",
                        locationNotes: "",
                      }));
                    }}
                  >
                    Remove
                  </button>
                </div>

                {!form.facilityId ? (
                  <p className="text-xs text-muted">
                    Choose a facility above to add building, floor, or room.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Building" htmlFor="report-building">
                      <MasterDataSelect
                        id="report-building"
                        entity="buildings"
                        value={form.buildingId}
                        facilityId={form.facilityId}
                        enabled={Boolean(form.facilityId)}
                        emptyOptionLabel="Select building"
                        loadingPlaceholder="Loading…"
                        aria-label="Building"
                        onChange={(next) => updateField("buildingId", next)}
                      />
                    </FormField>

                    {form.buildingId ? (
                      <FormField label="Floor" htmlFor="report-floor">
                        <MasterDataSelect
                          id="report-floor"
                          entity="floors"
                          value={form.floorId}
                          facilityId={form.facilityId}
                          buildingId={form.buildingId}
                          enabled={Boolean(form.buildingId)}
                          emptyOptionLabel="Select floor"
                          loadingPlaceholder="Loading…"
                          aria-label="Floor"
                          onChange={(next) => updateField("floorId", next)}
                        />
                      </FormField>
                    ) : null}

                    {form.floorId ? (
                      <FormField label="Room" htmlFor="report-room">
                        <MasterDataSelect
                          id="report-room"
                          entity="rooms"
                          value={form.roomId}
                          facilityId={form.facilityId}
                          buildingId={form.buildingId}
                          floorId={form.floorId}
                          enabled={Boolean(form.floorId)}
                          emptyOptionLabel="Select room"
                          loadingPlaceholder="Loading…"
                          aria-label="Room"
                          onChange={(next) => updateField("roomId", next)}
                        />
                      </FormField>
                    ) : null}
                  </div>
                )}

                <FormField
                  label="More location details"
                  htmlFor="report-location-notes"
                >
                  <input
                    id="report-location-notes"
                    className={inputClassName}
                    placeholder="e.g. near the main reception desk"
                    value={form.locationNotes}
                    onChange={(event) =>
                      updateField("locationNotes", event.target.value)
                    }
                  />
                </FormField>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                How serious is it?
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="How serious is it?"
              >
                {INCIDENT_SEVERITIES.map((value) => {
                  const selected = form.severity === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateField("severity", value)}
                      className={cn(
                        "rounded-[12px] border px-3.5 py-2 text-sm font-medium transition-colors",
                        selected
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border bg-card text-muted hover:bg-slate-50 hover:text-foreground"
                      )}
                      aria-pressed={selected}
                    >
                      {labelize(value)}
                    </button>
                  );
                })}
              </div>
            </div>

            <FormField label="Tell us more" htmlFor="report-description">
              <textarea
                id="report-description"
                className={`${inputClassName} h-auto min-h-[88px] py-2.5`}
                rows={3}
                placeholder="Anything else SentraCore should know?"
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
              />
            </FormField>
          </div>
        ) : (
          <div className="space-y-6" role="tabpanel">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Incident details
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Type" htmlFor="report-type">
                  <select
                    id="report-type"
                    className={selectClassName}
                    value={form.type}
                    onChange={(event) =>
                      updateField(
                        "type",
                        event.target.value as IncidentType | ""
                      )
                    }
                  >
                    <option value="">Use default (Other)</option>
                    {INCIDENT_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {labelize(value)}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Source" htmlFor="report-source">
                  <select
                    id="report-source"
                    className={selectClassName}
                    value={form.source}
                    onChange={(event) =>
                      updateField(
                        "source",
                        event.target.value as IncidentSource | ""
                      )
                    }
                  >
                    <option value="">Use default (Manual)</option>
                    {INCIDENT_SOURCES.map((value) => (
                      <option key={value} value={value}>
                        {labelize(value)}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Management
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Status" htmlFor="report-status">
                  <select
                    id="report-status"
                    className={selectClassName}
                    value={form.status}
                    onChange={(event) =>
                      updateField(
                        "status",
                        event.target.value as IncidentStatus | ""
                      )
                    }
                  >
                    <option value="">Use default (Reported)</option>
                    {INCIDENT_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {labelize(value)}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Assigned to" htmlFor="report-assignee">
                  <select
                    id="report-assignee"
                    className={selectClassName}
                    value={form.assignedToUserId}
                    onChange={(event) =>
                      updateField("assignedToUserId", event.target.value)
                    }
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Reported information
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Reported by" htmlFor="report-reporter">
                  <select
                    id="report-reporter"
                    className={selectClassName}
                    value={form.reportedByUserId}
                    onChange={(event) =>
                      updateField("reportedByUserId", event.target.value)
                    }
                  >
                    <option value="">Use signed-in user</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  label="Reported at"
                  htmlFor="report-reported-at"
                  error={errors.reportedAt}
                >
                  <input
                    id="report-reported-at"
                    type="datetime-local"
                    className={inputClassName}
                    value={toDatetimeLocalValue(form.reportedAt)}
                    onChange={(event) =>
                      updateField("reportedAt", event.target.value)
                    }
                  />
                </FormField>

                <FormField label="Reported via" htmlFor="report-channel">
                  <select
                    id="report-channel"
                    className={selectClassName}
                    value={form.reportedVia}
                    onChange={(event) =>
                      updateField(
                        "reportedVia",
                        event.target.value as IncidentChannel | ""
                      )
                    }
                  >
                    <option value="">Use default (Portal)</option>
                    {INCIDENT_CHANNELS.map((value) => (
                      <option key={value} value={value}>
                        {labelize(value)}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Operational context
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Asset" htmlFor="report-asset">
                  <select
                    id="report-asset"
                    className={selectClassName}
                    value={form.assetId}
                    onChange={(event) =>
                      updateField("assetId", event.target.value)
                    }
                  >
                    <option value="">None</option>
                    {filteredAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  label="Requires work order"
                  htmlFor="report-requires-wo"
                >
                  <select
                    id="report-requires-wo"
                    className={selectClassName}
                    value={form.requiresWorkOrder ? "true" : "false"}
                    onChange={(event) =>
                      updateField(
                        "requiresWorkOrder",
                        event.target.value === "true"
                      )
                    }
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </FormField>

                {form.requiresWorkOrder ? (
                  <FormField
                    label="Work order"
                    htmlFor="report-wo"
                    error={errors.workOrderId}
                    className="sm:col-span-2"
                  >
                    <select
                      id="report-wo"
                      className={selectClassName}
                      value={form.workOrderId}
                      onChange={(event) =>
                        updateField("workOrderId", event.target.value)
                      }
                    >
                      <option value="">Not linked yet</option>
                      {workOrders.map((workOrder) => (
                        <option key={workOrder.id} value={workOrder.id}>
                          {workOrder.id} — {workOrder.title}
                        </option>
                      ))}
                    </select>
                  </FormField>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </form>
    </Modal>
  );
}
