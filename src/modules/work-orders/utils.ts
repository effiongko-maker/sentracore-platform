import type {
  CreateWorkOrderInput,
  WorkOrder,
  WorkOrderSort,
} from "./types";

const STRUCTURED_NOTE_LABELS = [
  "Location",
  "Department",
  "Category",
  "Attachment",
  "Requested by",
  "Reported by",
  "Source maintenance",
] as const;

const STRUCTURED_NOTE_PATTERN = new RegExp(
  `^(${STRUCTURED_NOTE_LABELS.join("|")}):\\s*(.*)$`,
  "i"
);

export type WorkOrderDescriptionNotes = {
  body: string;
  location?: string;
  department?: string;
  category?: string;
  sourceMaintenanceId?: string;
};

export function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Parse structured context lines appended when a WO is created from maintenance.
 * Metadata stays on the record for detail/edit; the table only shows the body.
 */
export function parseWorkOrderDescriptionNotes(
  description?: string | null
): WorkOrderDescriptionNotes {
  const text = description?.trim() ?? "";
  if (!text) return { body: "" };

  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const bodyParts: string[] = [];
  const notes: WorkOrderDescriptionNotes = { body: "" };

  for (const block of blocks) {
    const lines = block
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    let matchedStructured = false;

    for (const line of lines) {
      const match = line.match(STRUCTURED_NOTE_PATTERN);
      if (!match) continue;
      matchedStructured = true;
      const label = (match[1] ?? "").toLowerCase();
      const value = (match[2] ?? "").trim();
      if (!value) continue;
      if (label === "location") notes.location = value;
      else if (label === "department") notes.department = value;
      else if (label === "category") notes.category = value;
      else if (label === "source maintenance") notes.sourceMaintenanceId = value;
    }

    if (!matchedStructured) {
      bodyParts.push(block);
    }
  }

  notes.body = bodyParts.join("\n\n").trim();
  return notes;
}

function looksLikeStructuredContext(text: string): boolean {
  return (
    /(?:^|\n)\s*(?:Location|Department|Category|Source maintenance)\s*:/i.test(
      text
    ) ||
    /\bLocation:\s*/i.test(text) ||
    /\bDepartment:\s*/i.test(text) ||
    /\bCategory:\s*/i.test(text) ||
    /\bSource maintenance:\s*/i.test(text)
  );
}

/**
 * Concise primary label for list/table cells.
 * Strips location/department/category/source-maintenance when Title fell back
 * to the enriched Description blob.
 */
export function displayWorkOrderTitle(
  row: Pick<WorkOrder, "title" | "description">
): string {
  const rawTitle = row.title?.trim() ?? "";
  const notesFromDescription = parseWorkOrderDescriptionNotes(row.description);
  const notesFromTitle = parseWorkOrderDescriptionNotes(rawTitle);

  if (!rawTitle) {
    return notesFromDescription.body || "Untitled";
  }

  const description = row.description?.trim() ?? "";
  const titleLooksLikeDescription =
    looksLikeStructuredContext(rawTitle) ||
    notesFromTitle.location != null ||
    notesFromTitle.department != null ||
    notesFromTitle.category != null ||
    notesFromTitle.sourceMaintenanceId != null ||
    (Boolean(description) && rawTitle === description);

  if (titleLooksLikeDescription) {
    // Single-line collapsed blobs: "issue Location: … Department: …"
    if (!rawTitle.includes("\n") && looksLikeStructuredContext(rawTitle)) {
      const cut = rawTitle.search(
        /\s+(?:Location|Department|Category|Source maintenance)\s*:/i
      );
      if (cut > 0) {
        return rawTitle.slice(0, cut).trim() || "Untitled";
      }
    }

    return (
      notesFromTitle.body ||
      notesFromDescription.body ||
      rawTitle.split(/\n+/)[0]?.trim() ||
      "Untitled"
    );
  }

  if (!rawTitle.includes("\n")) return rawTitle;

  return notesFromTitle.body || rawTitle.split(/\n+/)[0]?.trim() || "Untitled";
}

export function toCreateFormValues(
  workOrder?: WorkOrder | null
): CreateWorkOrderInput {
  return {
    title: workOrder ? displayWorkOrderTitle(workOrder) : "",
    description: workOrder?.description ?? "",
    type: workOrder?.type ?? "corrective",
    maintenanceType: workOrder?.maintenanceType,
    source: workOrder?.source ?? "manual",
    categoryId: workOrder?.categoryId ?? "",
    workInstructions: workOrder?.workInstructions ?? "",
    facilityId: workOrder?.facilityId ?? "",
    assetId: workOrder?.assetId ?? "",
    reportedByUserId: workOrder?.reportedByUserId ?? "",
    incidentId: workOrder?.incidentId ?? "",
    maintenanceId: workOrder?.maintenanceId ?? "",
    parentWorkOrderId: workOrder?.parentWorkOrderId ?? "",
    assignedToUserId: workOrder?.assignedToUserId ?? "",
    assignedGroupId: workOrder?.assignedGroupId ?? "",
    requestedAt: workOrder?.requestedAt ?? "",
    scheduledStartAt: workOrder?.scheduledStartAt ?? "",
    scheduledEndAt: workOrder?.scheduledEndAt ?? "",
    dueAt: workOrder?.dueAt ? workOrder.dueAt.slice(0, 10) : "",
    status: workOrder?.status ?? "open",
    priority: workOrder?.priority ?? "medium",
    holdReason: workOrder?.holdReason ?? "",
    startedAt: workOrder?.startedAt ?? "",
    completedAt: workOrder?.completedAt
      ? workOrder.completedAt.slice(0, 16)
      : "",
    estimatedHours: workOrder?.estimatedHours,
    actualHours: workOrder?.actualHours,
    estimatedCost: workOrder?.estimatedCost,
    actualCost: workOrder?.actualCost,
    completionNotes: workOrder?.completionNotes ?? "",
    workPerformed: workOrder?.workPerformed ?? "",
    downtimeMinutes: workOrder?.downtimeMinutes,
    slaDueAt: workOrder?.slaDueAt ?? "",
    requiresApproval: workOrder?.requiresApproval,
    createdByUserId: workOrder?.createdByUserId ?? "",
    updatedByUserId: workOrder?.updatedByUserId ?? "",
  };
}

export function optionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function compareIsoDesc(a?: string, b?: string) {
  const left = Date.parse(a ?? "") || 0;
  const right = Date.parse(b ?? "") || 0;
  return right - left;
}

export function sortWorkOrders(
  items: WorkOrder[],
  sort: WorkOrderSort = "newest"
): WorkOrder[] {
  const next = items.slice();
  switch (sort) {
    case "oldest":
      return next.sort((a, b) =>
        compareIsoDesc(
          b.createdAt || b.requestedAt,
          a.createdAt || a.requestedAt
        )
      );
    case "title_asc":
      return next.sort((a, b) =>
        displayWorkOrderTitle(a).localeCompare(
          displayWorkOrderTitle(b),
          undefined,
          { sensitivity: "base" }
        )
      );
    case "title_desc":
      return next.sort((a, b) =>
        displayWorkOrderTitle(b).localeCompare(
          displayWorkOrderTitle(a),
          undefined,
          { sensitivity: "base" }
        )
      );
    case "newest":
    default:
      return next.sort((a, b) =>
        compareIsoDesc(
          a.createdAt || a.requestedAt,
          b.createdAt || b.requestedAt
        )
      );
  }
}
