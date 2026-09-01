import type {
  CreateMaintenanceInput,
  Maintenance,
  MaintenanceSort,
} from "./types";

const STRUCTURED_NOTE_LABELS = [
  "Location",
  "Category",
  "Attachment",
  "Requested by",
  "Reported by",
] as const;

type StructuredNoteLabel = (typeof STRUCTURED_NOTE_LABELS)[number];

const STRUCTURED_NOTE_PATTERN = new RegExp(
  `^(${STRUCTURED_NOTE_LABELS.join("|")}):\\s*(.*)$`,
  "i"
);

export type MaintenanceDescriptionNotes = {
  /** Free-text body without structured Location/Category/Requester lines. */
  body: string;
  location?: string;
  category?: string;
  requestedBy?: string;
  attachment?: string;
};

export function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function optionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Enforce: requiresWorkOrder=false ⇒ workOrderId must be undefined. */
export function applyWorkOrderRule<
  T extends { requiresWorkOrder?: boolean; workOrderId?: string },
>(input: T): T {
  if (input.requiresWorkOrder === false) {
    return { ...input, workOrderId: undefined };
  }
  return input;
}

function normalizeNoteLabel(label: string): StructuredNoteLabel | null {
  const match = STRUCTURED_NOTE_LABELS.find(
    (item) => item.toLowerCase() === label.toLowerCase()
  );
  return match ?? null;
}

/**
 * Occupant requests append Location / Category / Requested by into description.
 * Parse those out for clean table + detail presentation.
 */
export function parseMaintenanceDescriptionNotes(
  description?: string | null
): MaintenanceDescriptionNotes {
  const text = description?.trim() ?? "";
  if (!text) return { body: "" };

  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const bodyParts: string[] = [];
  const notes: MaintenanceDescriptionNotes = { body: "" };

  for (const block of blocks) {
    const lines = block
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    let matchedStructured = false;

    for (const line of lines) {
      const match = line.match(STRUCTURED_NOTE_PATTERN);
      if (!match) continue;
      const label = normalizeNoteLabel(match[1] ?? "");
      const value = (match[2] ?? "").trim();
      if (!label || !value) continue;
      matchedStructured = true;
      if (label === "Location") notes.location = value;
      else if (label === "Category") notes.category = value;
      else if (label === "Attachment") notes.attachment = value;
      else if (label === "Requested by" || label === "Reported by") {
        notes.requestedBy = value;
      }
    }

    if (!matchedStructured) {
      bodyParts.push(block);
    }
  }

  notes.body = bodyParts.join("\n\n").trim();
  return notes;
}

/**
 * Prefer a real Title column value. When Title fell back to the full
 * Description (Apps Script / mapper), strip structured metadata lines.
 */
export function displayMaintenanceTitle(
  row: Pick<Maintenance, "title" | "description">
): string {
  const rawTitle = row.title?.trim() ?? "";
  const notesFromDescription = parseMaintenanceDescriptionNotes(
    row.description
  );
  const notesFromTitle = parseMaintenanceDescriptionNotes(rawTitle);

  if (!rawTitle) {
    return notesFromDescription.body || "Untitled";
  }

  const description = row.description?.trim() ?? "";
  const titleLooksLikeDescription =
    Boolean(description) &&
    (rawTitle === description ||
      notesFromTitle.location != null ||
      notesFromTitle.category != null ||
      notesFromTitle.requestedBy != null ||
      notesFromTitle.attachment != null);

  if (titleLooksLikeDescription) {
    return (
      notesFromTitle.body ||
      notesFromDescription.body ||
      rawTitle.split(/\n+/)[0]?.trim() ||
      "Untitled"
    );
  }

  // Keep single-line operational titles as-is.
  if (!rawTitle.includes("\n")) return rawTitle;

  return notesFromTitle.body || rawTitle.split(/\n+/)[0]?.trim() || "Untitled";
}

export function displayMaintenanceLocation(
  row: Pick<Maintenance, "description">
): string | undefined {
  return parseMaintenanceDescriptionNotes(row.description).location;
}

function compareIsoDesc(a?: string, b?: string) {
  const left = Date.parse(a ?? "") || 0;
  const right = Date.parse(b ?? "") || 0;
  return right - left;
}

export function sortMaintenance(
  items: Maintenance[],
  sort: MaintenanceSort = "newest"
): Maintenance[] {
  const next = items.slice();
  switch (sort) {
    case "oldest":
      return next.sort((a, b) =>
        compareIsoDesc(
          b.updatedAt || b.reportedAt,
          a.updatedAt || a.reportedAt
        )
      );
    case "title_asc":
      return next.sort((a, b) =>
        displayMaintenanceTitle(a).localeCompare(
          displayMaintenanceTitle(b),
          undefined,
          { sensitivity: "base" }
        )
      );
    case "title_desc":
      return next.sort((a, b) =>
        displayMaintenanceTitle(b).localeCompare(
          displayMaintenanceTitle(a),
          undefined,
          { sensitivity: "base" }
        )
      );
    case "newest":
    default:
      return next.sort((a, b) =>
        compareIsoDesc(
          a.updatedAt || a.reportedAt,
          b.updatedAt || b.reportedAt
        )
      );
  }
}

export function toCreateFormValues(
  maintenance?: Maintenance | null
): CreateMaintenanceInput {
  return {
    title: maintenance ? displayMaintenanceTitle(maintenance) : "",
    description: maintenance?.description ?? "",
    type: maintenance?.type ?? "corrective",
    source: maintenance?.source ?? "manual",
    categoryId: maintenance?.categoryId ?? "",
    department: maintenance?.department ?? "",
    facilityId: maintenance?.facilityId ?? "",
    assetId: maintenance?.assetId ?? "",
    reportedByUserId: maintenance?.reportedByUserId ?? "",
    assignedToUserId: maintenance?.assignedToUserId ?? "",
    assignedGroupId: maintenance?.assignedGroupId ?? "",
    eventId: maintenance?.eventId ?? "",
    incidentId: maintenance?.incidentId ?? "",
    workOrderId: maintenance?.workOrderId ?? "",
    parentMaintenanceId: maintenance?.parentMaintenanceId ?? "",
    priority: maintenance?.priority ?? "medium",
    status: maintenance?.status ?? "requested",
    holdReason: maintenance?.holdReason ?? "",
    requiresWorkOrder: maintenance?.requiresWorkOrder ?? false,
    reportedAt: maintenance?.reportedAt
      ? maintenance.reportedAt.slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    scheduledStartAt: maintenance?.scheduledStartAt
      ? maintenance.scheduledStartAt.slice(0, 16)
      : "",
    scheduledEndAt: maintenance?.scheduledEndAt
      ? maintenance.scheduledEndAt.slice(0, 16)
      : "",
    dueAt: maintenance?.dueAt ? maintenance.dueAt.slice(0, 16) : "",
    startedAt: maintenance?.startedAt
      ? maintenance.startedAt.slice(0, 16)
      : "",
    completedAt: maintenance?.completedAt
      ? maintenance.completedAt.slice(0, 16)
      : "",
    completionNotes: maintenance?.completionNotes ?? "",
    workPerformed: maintenance?.workPerformed ?? "",
    createdByUserId: maintenance?.createdByUserId ?? "",
    updatedByUserId: maintenance?.updatedByUserId ?? "",
  };
}

const FORM_DIRTY_KEYS: (keyof CreateMaintenanceInput)[] = [
  "title",
  "description",
  "type",
  "source",
  "categoryId",
  "department",
  "facilityId",
  "assetId",
  "reportedByUserId",
  "assignedToUserId",
  "assignedGroupId",
  "incidentId",
  "workOrderId",
  "parentMaintenanceId",
  "priority",
  "status",
  "holdReason",
  "requiresWorkOrder",
  "reportedAt",
  "scheduledStartAt",
  "scheduledEndAt",
  "dueAt",
  "startedAt",
  "workPerformed",
  "completionNotes",
];

function normalizeFormCompareValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

/** True when Treat form differs from the loaded Maintenance entity. */
export function isMaintenanceFormDirty(
  maintenance: Maintenance,
  form: CreateMaintenanceInput
): boolean {
  const baseline = toCreateFormValues(maintenance);
  for (const key of FORM_DIRTY_KEYS) {
    if (
      normalizeFormCompareValue(form[key]) !==
      normalizeFormCompareValue(baseline[key])
    ) {
      return true;
    }
  }
  return false;
}
