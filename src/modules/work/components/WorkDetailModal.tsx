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
} from "@/hooks/useEntityLabel";
import { OrderTypePicker } from "@/modules/work-orders/components/OrderTypePicker";
import type { WorkInstructionKind } from "@/modules/work-orders/instructionKind";
import { createWorkOrderFromMaintenance } from "@/modules/work-orders/actions/createWorkOrderFromMaintenance";
import { useToast } from "@/components/ui/Toast";
import {
  displayMaintenanceTitle,
  labelize,
  parseMaintenanceDescriptionNotes,
} from "@/modules/maintenance/utils";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import { WORK_PRIORITY_VARIANT, WORK_STATUS_VARIANT } from "../constants";
import { collectLinkedWorkOrderIds } from "../utils/linkedWorkOrderIds";
import { isHistoricalWork } from "../utils/historicalWork";
import { WorkOrderExecutionAssigneeList } from "./WorkOrderExecutionAssignees";

interface WorkDetailModalProps {
  open: boolean;
  work: Maintenance | null;
  linkedWorkOrdersById?: Record<string, WorkOrder | null>;
  linkedWorkOrdersLoading?: boolean;
  onClose: () => void;
  onTreat?: (work: Maintenance) => void;
  onUpdated?: (work: Maintenance) => void;
  onOpenWorkOrder?: (workOrderId: string) => void;
  /** ops.create — Create Work Order control */
  canCreateWorkOrder?: boolean;
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
  linkedWorkOrdersById = {},
  linkedWorkOrdersLoading = false,
  onClose,
  onTreat,
  onUpdated,
  onOpenWorkOrder,
  canCreateWorkOrder = true,
}: WorkDetailModalProps) {
  const { toast } = useToast();
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const [newOrderType, setNewOrderType] = useState<WorkInstructionKind | "">("");
  const facilityName = useFacilityName(work?.facilityId);
  const assetName = useAssetName(work?.assetId);
  const assigneeName = useUserName(work?.assignedToUserId);
  const reportedByName = useUserName(work?.reportedByUserId);

  if (!work) return null;

  const title = displayMaintenanceTitle(work);
  const notes = parseMaintenanceDescriptionNotes(work.description);
  const requesterLabel =
    notes.requestedBy ||
    (work.reportedByUserId
      ? reportedByName || work.reportedByUserId
      : undefined);
  // Imported historical Work is read-only evidence: no treat / cancel / create-instruction / link controls, and
  // absent facts read "Not recorded" (never a dash that could pass for a value, never a substitute).
  const historical = isHistoricalWork(work);
  const none = historical ? "Not recorded" : "—";
  // Classified Work: its execution basis (not the legacy requires-work-order flag) says a Work Instruction follows.
  const route = work.commercialRoute;
  const needsWorkOrderLink =
    !historical && (route ? true : Boolean(work.requiresWorkOrder)) && !work.workOrderId;
  const linkedWorkOrderIds = collectLinkedWorkOrderIds(work);
  const canTreat = !historical && work.status !== "cancelled";

  async function handleCreateWorkOrder() {
    if (!work) return;
    setCreatingWorkOrder(true);
    try {
      const result = await createWorkOrderFromMaintenance(work.id, route ? "" : newOrderType);
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
          {work.priority === "unknown" ? "Priority not recorded" : labelize(work.priority)}
        </Badge>
        {historical ? <Badge variant="neutral">Imported record</Badge> : null}
      </div>

      {historical ? (
        <div
          className="mt-4 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm"
          role="note"
        >
          <p className="font-medium text-foreground">Historical imported record</p>
          <p className="mt-0.5 text-muted">
            This record reflects source evidence migrated into SentraCore™ and is read-only.
          </p>
        </div>
      ) : null}

      <div className="mt-5 space-y-5">
        <Section title="What is the work?">
          <Detail
            label="Description"
            value={notes.body || work.description || none}
          />
          <Detail
            label="Work type"
            value={work.type ? labelize(work.type) : "Not recorded"}
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
            value={work.assetId ? assetName || work.assetId : none}
          />
          <Detail
            label="Assigned to"
            value={
              work.assignedToUserId
                ? assigneeName || work.assignedToUserId
                : none
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
                none
              )
            }
          />
          <Detail label="Reported by" value={requesterLabel || none} />
          <Detail label="Reported at" value={work.reportedAt ? formatDate(work.reportedAt) : "Not recorded"} />
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
                : none
            }
          />
          <Detail
            label="Due"
            value={work.dueAt ? formatDate(work.dueAt) : none}
          />
          <Detail label="Department" value={work.department || none} />
        </Section>

        <Section title="Formal execution">
          {linkedWorkOrderIds.length > 0 ? (
            <WorkOrderExecutionAssigneeList
              work={work}
              workOrdersById={linkedWorkOrdersById}
              loading={linkedWorkOrdersLoading}
              onOpenWorkOrder={onOpenWorkOrder}
              unassignedLabel={historical ? "Not recorded" : undefined}
            />
          ) : (
            <Detail
              label="Work order"
              value={
                needsWorkOrderLink ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted">No work order linked yet</p>
                    <div className="flex flex-wrap gap-2">
                      {canCreateWorkOrder && route === "job_order" ? (
                        <p className="text-xs text-muted">Job Order Work: request client approval from Treat work — the Job Order is recorded there after approval.</p>
                      ) : canCreateWorkOrder ? (
                        <>
                          {!route ? (
                            <OrderTypePicker value={newOrderType} onChange={setNewOrderType} disabled={creatingWorkOrder} />
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            loading={creatingWorkOrder}
                            disabled={(!route && !newOrderType) || (route === "work_order" && work.status !== "completed")}
                            title={
                              route === "work_order" && work.status !== "completed"
                                ? "The Work Order is submitted after the work is completed."
                                : undefined
                            }
                            onClick={() => void handleCreateWorkOrder()}
                          >
                            {route === "work_order" ? "Submit Work Order" : "Create Work Instruction"}
                          </Button>
                        </>
                      ) : null}
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
                  <span className="text-muted">No Work Instruction recorded</span>
                )
              }
            />
          )}
        </Section>

        <Section title="Completion & evidence">
          <Detail
            label="Completed at"
            value={
              work.completedAt ? formatDate(work.completedAt) : none
            }
          />
          <Detail
            label="Completion notes"
            value={work.completionNotes || none}
          />
          <Detail
            label="Work performed"
            value={work.workPerformed || none}
          />
          {notes.attachment ? (
            <Detail label="Attachment" value={notes.attachment} />
          ) : null}
        </Section>
      </div>
    </Modal>
  );
}
