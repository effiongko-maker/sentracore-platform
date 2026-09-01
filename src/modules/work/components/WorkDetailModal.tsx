"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import {
  issueHrefForWork,
  requestHrefForWork,
  WORK_STATUS_LABELS,
} from "@/lib/operational/work";
import {
  useAssetName,
  useFacilityName,
  useUserName,
  useWorkOrderTitle,
} from "@/hooks/useEntityLabel";
import { createWorkOrderFromMaintenance } from "@/modules/work-orders/actions/createWorkOrderFromMaintenance";
import { useToast } from "@/components/ui/Toast";
import {
  displayMaintenanceTitle,
  labelize,
  parseMaintenanceDescriptionNotes,
} from "@/modules/maintenance/utils";
import type { Maintenance } from "@/modules/maintenance/types";
import { WORK_PRIORITY_VARIANT, WORK_STATUS_VARIANT } from "../constants";

interface WorkDetailModalProps {
  open: boolean;
  work: Maintenance | null;
  onClose: () => void;
  onTreat?: (work: Maintenance) => void;
  onUpdated?: (work: Maintenance) => void;
  onOpenWorkOrder?: (workOrderId: string) => void;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="text-sm text-foreground whitespace-pre-wrap">
        {value || "—"}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function WorkDetailModal({
  open,
  work,
  onClose,
  onTreat,
  onUpdated,
  onOpenWorkOrder,
}: WorkDetailModalProps) {
  const { toast } = useToast();
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const facilityName = useFacilityName(work?.facilityId);
  const assetName = useAssetName(work?.assetId);
  const assigneeName = useUserName(work?.assignedToUserId);
  const reportedByName = useUserName(work?.reportedByUserId);
  const workOrderTitle = useWorkOrderTitle(work?.workOrderId);

  if (!work) return null;

  const title = displayMaintenanceTitle(work);
  const notes = parseMaintenanceDescriptionNotes(work.description);
  const requesterLabel =
    notes.requestedBy ||
    (work.reportedByUserId
      ? reportedByName || work.reportedByUserId
      : undefined);
  const needsWorkOrderLink =
    Boolean(work.requiresWorkOrder) && !work.workOrderId;
  const canTreat = work.status !== "cancelled";

  async function handleCreateWorkOrder() {
    if (!work) return;
    setCreatingWorkOrder(true);
    try {
      const result = await createWorkOrderFromMaintenance(work.id);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      toast({
        type: "success",
        title: "Work order created",
        description: `${result.data.workOrder.id} linked to this work.`,
      });
      onUpdated?.(result.data.maintenance);
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to create work order",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setCreatingWorkOrder(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={work.id}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canTreat && onTreat ? (
            <Button
              onClick={() => {
                onClose();
                onTreat(work);
              }}
            >
              {work.status === "completed" ? "View completion" : "Treat"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-5">
        <Badge variant={WORK_STATUS_VARIANT[work.status]}>
          {WORK_STATUS_LABELS[work.status] ?? labelize(work.status)}
        </Badge>
        <Badge variant={WORK_PRIORITY_VARIANT[work.priority]}>
          {labelize(work.priority)}
        </Badge>
      </div>

      <div className="mt-5 space-y-5">
        <Section title="What is the work?">
          <Detail
            label="Description"
            value={notes.body || work.description || "—"}
          />
          <Detail
            label="Location"
            value={
              <div>
                <div>{facilityName || work.facilityId}</div>
                {notes.location ? (
                  <p className="mt-1 text-xs text-muted">{notes.location}</p>
                ) : null}
              </div>
            }
          />
          <Detail
            label="Asset"
            value={work.assetId ? assetName || work.assetId : "—"}
          />
          <Detail
            label="Assigned to"
            value={
              work.assignedToUserId
                ? assigneeName || work.assignedToUserId
                : "—"
            }
          />
        </Section>

        <Section title="Why does it exist?">
          <Detail
            label="Issue"
            value={
              <Link
                href={issueHrefForWork(work.id)}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Open Issue
              </Link>
            }
          />
          <Detail
            label="Request"
            value={
              work.sourceRequestId ? (
                <Link
                  href={requestHrefForWork(work.sourceRequestId)}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  {work.sourceRequestId}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Detail label="Reported by" value={requesterLabel || "—"} />
          <Detail label="Reported at" value={formatDate(work.reportedAt)} />
        </Section>

        <Section title="Status & schedule">
          <Detail
            label="Status"
            value={WORK_STATUS_LABELS[work.status] ?? labelize(work.status)}
          />
          <Detail
            label="Scheduled"
            value={
              work.scheduledStartAt
                ? formatDate(work.scheduledStartAt)
                : "—"
            }
          />
          <Detail
            label="Due"
            value={work.dueAt ? formatDate(work.dueAt) : "—"}
          />
          <Detail label="Department" value={work.department || "—"} />
        </Section>

        <Section title="Formal execution">
          <Detail
            label="Work order"
            value={
              work.workOrderId ? (
                <button
                  type="button"
                  className="text-left text-sm font-medium text-accent underline-offset-2 hover:underline"
                  onClick={() => onOpenWorkOrder?.(work.workOrderId!)}
                >
                  {work.workOrderId}
                  {workOrderTitle ? ` — ${workOrderTitle}` : ""}
                </button>
              ) : needsWorkOrderLink ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted">No work order linked yet</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      loading={creatingWorkOrder}
                      onClick={() => void handleCreateWorkOrder()}
                    >
                      Create Work Order
                    </Button>
                    {onTreat ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onClose();
                          onTreat(work);
                        }}
                      >
                        Link existing
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                "—"
              )
            }
          />
        </Section>

        <Section title="Completion & evidence">
          <Detail
            label="Completed at"
            value={
              work.completedAt ? formatDate(work.completedAt) : "—"
            }
          />
          <Detail
            label="Completion notes"
            value={work.completionNotes || "—"}
          />
          <Detail
            label="Work performed"
            value={work.workPerformed || "—"}
          />
          {notes.attachment ? (
            <Detail label="Attachment" value={notes.attachment} />
          ) : null}
        </Section>
      </div>
    </Modal>
  );
}
