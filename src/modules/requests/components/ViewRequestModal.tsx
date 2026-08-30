"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import { useFacilityName } from "@/hooks/useEntityLabel";
import type { RequestTreatmentDetail } from "../treatment/detailTypes";
import type { RequestTreatmentResult } from "../treatment/resultTypes";
import {
  cancelRequest,
  getRequestTreatmentDetail,
  resolveRequest,
  startRequestReview,
} from "../actions/treatRequest";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPE_LABELS,
} from "../constants";
import { isRequestTerminal } from "../treatment/status";
import type { RequestRecord } from "../types";
import { CreateIncidentFromRequestModal } from "./CreateIncidentFromRequestModal";
import { CreateMaintenanceFromRequestModal } from "./CreateMaintenanceFromRequestModal";
import { LinkExistingTreatmentModal } from "./LinkExistingTreatmentModal";

interface ViewRequestModalProps {
  open: boolean;
  request: RequestRecord | null;
  onClose: () => void;
  onChanged?: () => void;
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

type TreatmentPanel =
  | { type: "closed" }
  | { type: "create-maintenance" }
  | { type: "create-incident" }
  | { type: "link-maintenance" }
  | { type: "link-incident" }
  | { type: "resolve" }
  | { type: "cancel" };

function actionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function ViewRequestModal({
  open,
  request,
  onClose,
  onChanged,
}: ViewRequestModalProps) {
  const { toast } = useToast();
  const facilityName = useFacilityName(request?.facilityId);
  const [detail, setDetail] = useState<RequestTreatmentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [panel, setPanel] = useState<TreatmentPanel>({ type: "closed" });
  const [busy, setBusy] = useState(false);
  const detailLoadGen = useRef(0);

  const activeRequest = detail?.request ?? request;
  const treatable =
    activeRequest != null && !isRequestTerminal(activeRequest.status);
  const preferMaintenance = activeRequest?.requestType !== "incident";

  async function reloadDetail(requestId: string) {
    const gen = ++detailLoadGen.current;
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const result = await getRequestTreatmentDetail({ requestId });
      if (gen !== detailLoadGen.current) return;
      if (!result.success) {
        setDetailError(result.error.message);
        setDetail(null);
        return;
      }
      setDetail(result.data);
    } catch (error) {
      if (gen !== detailLoadGen.current) return;
      setDetailError(
        actionErrorMessage(error, "Unable to load linked treatment records.")
      );
      setDetail(null);
    } finally {
      if (gen === detailLoadGen.current) {
        setLoadingDetail(false);
      }
    }
  }

  useEffect(() => {
    if (!open || !request?.id) {
      detailLoadGen.current += 1;
      setDetail(null);
      setDetailError(null);
      setLoadingDetail(false);
      setPanel({ type: "closed" });
      return;
    }

    const requestId = request.id;
    const wasSubmitted = request.status === "submitted";
    void reloadDetail(requestId);

    if (!wasSubmitted) return;

    let cancelled = false;
    void startRequestReview({ requestId })
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          console.warn("[ViewRequestModal] startRequestReview failed", {
            requestId,
            code: result.error.code,
            message: result.error.message,
          });
          return;
        }
        setDetail((prev) =>
          prev && prev.request.id === requestId
            ? { ...prev, request: result.data }
            : prev
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[ViewRequestModal] startRequestReview rejected", {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [open, request?.id]);

  /** Apply authoritative Create/Link response immediately; refresh detail in background. */
  function handleTreatmentResult(result: RequestTreatmentResult) {
    setDetail((prev) => {
      const base: RequestTreatmentDetail = prev ?? {
        request: result.request,
        maintenance: [],
        incidents: [],
        derivedWorkOrders: [],
      };
      const maintenance = result.maintenance
        ? [
            result.maintenance,
            ...base.maintenance.filter((row) => row.id !== result.maintenance!.id),
          ]
        : base.maintenance;
      const incidents = result.incident
        ? [
            result.incident,
            ...base.incidents.filter((row) => row.id !== result.incident!.id),
          ]
        : base.incidents;
      return {
        ...base,
        request: result.request,
        maintenance,
        incidents,
      };
    });
    if (request?.id) void reloadDetail(request.id);
    onChanged?.();
  }

  function handleTreatmentChanged() {
    if (request?.id) void reloadDetail(request.id);
    onChanged?.();
  }

  async function handleResolve() {
    if (!activeRequest) return;
    setBusy(true);
    try {
      const result = await resolveRequest({ requestId: activeRequest.id });
      if (!result.success) throw new Error(result.error.message);
      toast({
        type: "success",
        title: "Request resolved",
        description: `${activeRequest.id} marked resolved.`,
      });
      setPanel({ type: "closed" });
      handleTreatmentChanged();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to resolve",
        description: actionErrorMessage(err, "Please try again in a moment."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!activeRequest) return;
    setBusy(true);
    try {
      const result = await cancelRequest({ requestId: activeRequest.id });
      if (!result.success) throw new Error(result.error.message);
      toast({
        type: "success",
        title: "Request cancelled",
        description: `${activeRequest.id} marked cancelled.`,
      });
      setPanel({ type: "closed" });
      handleTreatmentChanged();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to cancel",
        description: actionErrorMessage(err, "Please try again in a moment."),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!request || !activeRequest) return null;

  const hasTreatment =
    (detail?.maintenance.length ?? 0) > 0 ||
    (detail?.incidents.length ?? 0) > 0;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={activeRequest.title}
        description={activeRequest.id}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-8">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Request</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail
                label="Status"
                value={
                  <Badge variant={REQUEST_STATUS_VARIANT[activeRequest.status]}>
                    {REQUEST_STATUS_LABELS[activeRequest.status]}
                  </Badge>
                }
              />
              <Detail
                label="Type"
                value={
                  activeRequest.requestType
                    ? REQUEST_TYPE_LABELS[activeRequest.requestType]
                    : "—"
                }
              />
              <Detail
                label="Facility"
                value={facilityName || activeRequest.facilityId || "—"}
              />
              <Detail
                label="Occurred"
                value={formatDate(activeRequest.occurredAt)}
              />
              <div className="sm:col-span-2">
                <Detail
                  label="Description"
                  value={activeRequest.description || "—"}
                />
              </div>
              <Detail
                label="Location"
                value={activeRequest.locationDetail || "—"}
              />
              <Detail
                label="Reporter"
                value={
                  [activeRequest.reporterName, activeRequest.reporterContact]
                    .filter(Boolean)
                    .join(" · ") || "—"
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Treatment
              </h3>
              {loadingDetail ? (
                <p className="text-xs text-muted">Loading linked work…</p>
              ) : null}
            </div>

            {detailError ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-danger">{detailError}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void reloadDetail(activeRequest.id)}
                >
                  Retry
                </Button>
              </div>
            ) : null}

            {treatable ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={preferMaintenance ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setPanel({ type: "create-maintenance" })}
                >
                  Create Maintenance
                </Button>
                <Button
                  type="button"
                  variant={!preferMaintenance ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setPanel({ type: "create-incident" })}
                >
                  Create Incident
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPanel({ type: "link-maintenance" })}
                >
                  Link Maintenance
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPanel({ type: "link-incident" })}
                >
                  Link Incident
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted">
                This request is {activeRequest.status}. Treatment actions are
                closed.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Linked work
            </h3>
            {!hasTreatment && !loadingDetail && !detailError ? (
              <p className="text-sm text-muted">
                No Maintenance or Incident treatments yet.
              </p>
            ) : null}

            {(detail?.maintenance.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Maintenance
                </p>
                {detail!.maintenance.map((mnt) => (
                  <div
                    key={mnt.id}
                    className="rounded-xl border border-border px-3 py-3"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {mnt.title}
                    </p>
                    <p className="text-xs text-muted">
                      {mnt.id} · {mnt.status} · {formatDate(mnt.reportedAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {(detail?.incidents.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Incidents
                </p>
                {detail!.incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="rounded-xl border border-border px-3 py-3"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {inc.title}
                    </p>
                    <p className="text-xs text-muted">
                      {inc.id} · {inc.status} · {formatDate(inc.reportedAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {(detail?.derivedWorkOrders.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Downstream work orders
                </p>
                {detail!.derivedWorkOrders.map((row) => (
                  <div
                    key={row.workOrder.id}
                    className="rounded-xl border border-dashed border-border px-3 py-3"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {row.workOrder.title}
                    </p>
                    <p className="text-xs text-muted">
                      {row.workOrder.id} · {row.workOrder.status} · via{" "}
                      {row.viaId}
                    </p>
                  </div>
                ))}
              </div>
            ) : hasTreatment ? (
              <p className="text-xs text-muted">
                No downstream work orders linked through treatment records.
              </p>
            ) : null}
          </section>

          {treatable || activeRequest.status === "resolved" ? (
            <section className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Request management
              </h3>
              <div className="flex flex-wrap gap-2">
                {activeRequest.status !== "resolved" &&
                activeRequest.status !== "closed" &&
                activeRequest.status !== "cancelled" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPanel({ type: "resolve" })}
                  >
                    Resolve Request
                  </Button>
                ) : null}
                {activeRequest.status !== "cancelled" &&
                activeRequest.status !== "closed" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setPanel({ type: "cancel" })}
                  >
                    Cancel Request
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </Modal>

      <CreateMaintenanceFromRequestModal
        open={panel.type === "create-maintenance"}
        request={activeRequest}
        onClose={() => setPanel({ type: "closed" })}
        onCreated={handleTreatmentResult}
      />

      <CreateIncidentFromRequestModal
        open={panel.type === "create-incident"}
        request={activeRequest}
        onClose={() => setPanel({ type: "closed" })}
        onCreated={handleTreatmentResult}
      />

      <LinkExistingTreatmentModal
        open={
          panel.type === "link-maintenance" || panel.type === "link-incident"
        }
        kind={panel.type === "link-incident" ? "incident" : "maintenance"}
        requestId={activeRequest.id}
        onClose={() => setPanel({ type: "closed" })}
        onLinked={handleTreatmentResult}
      />

      <ConfirmDialog
        open={panel.type === "resolve"}
        onClose={() => setPanel({ type: "closed" })}
        onConfirm={handleResolve}
        title="Resolve this request?"
        description="Linked Maintenance and Incident records are preserved. Resolution does not close downstream work."
        confirmLabel="Resolve"
        loading={busy}
      />

      <ConfirmDialog
        open={panel.type === "cancel"}
        onClose={() => setPanel({ type: "closed" })}
        onConfirm={handleCancel}
        title="Cancel this request?"
        description={
          hasTreatment
            ? "This request already has linked treatment records. Cancelling keeps those records and relationships but removes the request from the active queue."
            : "The request will be marked cancelled and leave the active queue."
        }
        confirmLabel="Cancel request"
        danger
        loading={busy}
      />
    </>
  );
}
