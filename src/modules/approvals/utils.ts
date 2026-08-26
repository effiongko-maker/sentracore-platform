import type { WorkOrder } from "@/modules/work-orders/types";
import {
  displayWorkOrderTitle,
  parseWorkOrderDescriptionNotes,
} from "@/modules/work-orders/utils";
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_TYPE_LABEL,
  DEFAULT_APPROVAL_CURRENCY,
  getApprovalTemplate,
} from "./constants";
import type {
  Approval,
  ApprovalSort,
  ApprovalType,
  CreateApprovalInput,
} from "./types";

export function labelizeApprovalStatus(status: string): string {
  return (
    APPROVAL_STATUS_LABEL[status as keyof typeof APPROVAL_STATUS_LABEL] ??
    status
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function labelizeApprovalType(type: string): string {
  return (
    APPROVAL_TYPE_LABEL[type as keyof typeof APPROVAL_TYPE_LABEL] ??
    type
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function optionalString(value?: string | null): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export function displayApprovalTitle(approval: Approval): string {
  const title = approval.title?.trim();
  if (title) return title;
  return labelizeApprovalType(approval.type);
}

function compareIsoDesc(a?: string, b?: string) {
  const left = Date.parse(a ?? "") || 0;
  const right = Date.parse(b ?? "") || 0;
  return right - left;
}

export function sortApprovals(
  items: Approval[],
  sort: ApprovalSort = "newest"
): Approval[] {
  const next = items.slice();
  switch (sort) {
    case "oldest":
      return next.sort((a, b) =>
        compareIsoDesc(b.updatedAt || b.createdAt, a.updatedAt || a.createdAt)
      );
    case "title_asc":
      return next.sort((a, b) =>
        displayApprovalTitle(a).localeCompare(displayApprovalTitle(b), undefined, {
          sensitivity: "base",
        })
      );
    case "title_desc":
      return next.sort((a, b) =>
        displayApprovalTitle(b).localeCompare(displayApprovalTitle(a), undefined, {
          sensitivity: "base",
        })
      );
    case "newest":
    default:
      return next.sort((a, b) =>
        compareIsoDesc(a.updatedAt || a.createdAt, b.updatedAt || b.createdAt)
      );
  }
}

/** Same placeholder substitution convention as reporting TemplateAdapter. */
export function applyApprovalPlaceholders(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = values[key];
    return value == null || value === "" ? "—" : value;
  });
}

export type ApprovalBindContext = {
  workOrder: WorkOrder;
  facilityName?: string;
  assetName?: string;
  assigneeName?: string;
  clientName?: string;
  clientAddress?: string;
  clientSalutation?: string;
  reason?: string;
  approvalAmount?: number;
  currency?: string;
  signatory?: string;
  letterDate?: string;
};

export function buildApprovalPlaceholderMap(
  ctx: ApprovalBindContext
): Record<string, string> {
  const { workOrder } = ctx;
  const notes = parseWorkOrderDescriptionNotes(workOrder.description);
  const location = notes.location || workOrder.facilityId || "—";

  const amount =
    ctx.approvalAmount ?? workOrder.estimatedCost ?? undefined;
  const currency = ctx.currency ?? DEFAULT_APPROVAL_CURRENCY;
  const letterDate =
    ctx.letterDate ||
    new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return {
    letterDate,
    clientName: ctx.clientName?.trim() || "Client",
    clientAddress: ctx.clientAddress?.trim() || "",
    clientSalutation: ctx.clientSalutation?.trim() || "Sir/Madam",
    workOrderId: workOrder.id,
    workOrderTitle: displayWorkOrderTitle(workOrder),
    location,
    facilityName: ctx.facilityName?.trim() || workOrder.facilityId || "—",
    building: "—",
    floor: "—",
    room: "—",
    department: notes.department || "—",
    assetName: ctx.assetName?.trim() || workOrder.assetId || "—",
    priority: workOrder.priority
      ? workOrder.priority.replace(/_/g, " ")
      : "—",
    assigneeName:
      ctx.assigneeName?.trim() || workOrder.assignedToUserId || "—",
    description:
      notes.body ||
      workOrder.description ||
      displayWorkOrderTitle(workOrder) ||
      "—",
    reason: ctx.reason?.trim() || "—",
    estimatedCost:
      amount != null ? `${currency} ${amount.toLocaleString()}` : "—",
    estimatedHours:
      workOrder.estimatedHours != null
        ? String(workOrder.estimatedHours)
        : "—",
    dueDate: workOrder.dueAt
      ? new Date(workOrder.dueAt).toLocaleDateString("en-GB")
      : "—",
    signatory: ctx.signatory?.trim() || "Facilities Management Team",
  };
}

export function renderApprovalCoverLetter(
  templateId: ApprovalType,
  ctx: ApprovalBindContext
): string {
  const template = getApprovalTemplate(templateId);
  return applyApprovalPlaceholders(
    template.body,
    buildApprovalPlaceholderMap(ctx)
  );
}

export function toCreateApprovalFromWorkOrder(
  workOrder: WorkOrder,
  overrides: Partial<CreateApprovalInput> & {
    facilityName?: string;
    assetName?: string;
    assigneeName?: string;
  } = {}
): CreateApprovalInput {
  const type = overrides.type ?? "standard_maintenance";
  const title =
    overrides.title?.trim() ||
    `Approval for ${displayWorkOrderTitle(workOrder)}`;
  const amount =
    overrides.approvalAmount ?? workOrder.estimatedCost ?? undefined;
  const currency = overrides.currency ?? DEFAULT_APPROVAL_CURRENCY;
  const reason = overrides.reason;
  const notes = parseWorkOrderDescriptionNotes(workOrder.description);
  const description =
    overrides.description ||
    notes.body ||
    workOrder.description ||
    displayWorkOrderTitle(workOrder);

  const coverLetter =
    overrides.coverLetter ||
    renderApprovalCoverLetter(type, {
      workOrder,
      facilityName: overrides.facilityName,
      assetName: overrides.assetName,
      assigneeName: overrides.assigneeName,
      clientName: overrides.clientName,
      clientAddress: overrides.clientAddress,
      reason,
      approvalAmount: amount,
      currency,
    });

  return {
    title,
    type,
    workOrderId: workOrder.id,
    facilityId: workOrder.facilityId,
    assetId: overrides.assetId ?? workOrder.assetId,
    status: overrides.status ?? "draft",
    description,
    reason,
    coverLetter,
    templateId: overrides.templateId ?? type,
    clientName: overrides.clientName,
    clientAddress: overrides.clientAddress,
    approvalAmount: amount,
    currency,
    requestedByUserId: overrides.requestedByUserId,
    generatedAt: overrides.generatedAt ?? new Date().toISOString(),
  };
}
