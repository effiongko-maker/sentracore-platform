import type { CreateIncidentInput } from "@/modules/incidents/types";
import type { CreateMaintenanceInput } from "@/modules/maintenance/types";
import type {
  IncidentRequestFormValues,
  MaintenanceRequestFormValues,
  OccupantActor,
  OccupantAttachmentRef,
} from "./types";

function slugCategory(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function toAttachmentRef(file?: File | null): OccupantAttachmentRef | undefined {
  if (!file) return undefined;
  return {
    fileName: file.name,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
  };
}

function appendStructuredNotes(
  description: string,
  notes: Array<{ label: string; value?: string }>
): string {
  const lines = [description.trim()].filter(Boolean);
  for (const note of notes) {
    const value = note.value?.trim();
    if (!value) continue;
    lines.push(`${note.label}: ${value}`);
  }
  return lines.join("\n\n");
}

/**
 * Maps occupant maintenance form → CreateMaintenanceInput.
 * Location/category/attachment are persisted via existing fields until
 * dedicated sheet columns / file storage exist.
 */
export function toCreateMaintenanceInput(
  form: MaintenanceRequestFormValues,
  actor: OccupantActor
): CreateMaintenanceInput {
  const attachment = toAttachmentRef(form.attachment);
  const now = new Date().toISOString();

  return {
    title: form.title.trim(),
    description: appendStructuredNotes(form.description, [
      { label: "Location", value: form.location },
      { label: "Category", value: form.category },
      {
        label: "Attachment",
        value: attachment
          ? `${attachment.fileName} (pending upload support)`
          : undefined,
      },
      {
        label: "Requested by",
        value: actor.displayName || actor.email || actor.id,
      },
    ]),
    type: "corrective",
    source: "request",
    categoryId: form.category ? slugCategory(form.category) : undefined,
    department: form.department.trim() || undefined,
    facilityId: form.facilityId,
    reportedByUserId: actor.id,
    priority: form.priority,
    status: "requested",
    reportedAt: now,
    createdByUserId: actor.id,
    updatedByUserId: actor.id,
  };
}

/**
 * Maps occupant incident form → CreateIncidentInput.
 */
export function toCreateIncidentInput(
  form: IncidentRequestFormValues,
  actor: OccupantActor
): CreateIncidentInput {
  const attachment = toAttachmentRef(form.attachment);
  const now = new Date().toISOString();

  return {
    title: form.title.trim(),
    description: appendStructuredNotes(form.description, [
      {
        label: "Attachment",
        value: attachment
          ? `${attachment.fileName} (pending upload support)`
          : undefined,
      },
      {
        label: "Reported by",
        value: actor.displayName || actor.email || actor.id,
      },
    ]),
    type: "service_request",
    source: "tenant",
    facilityId: form.facilityId,
    locationDetail: form.location.trim() || undefined,
    reportedByUserId: actor.id,
    reportedAt: now,
    reportedVia: "portal",
    severity: form.severity,
    status: "reported",
    createdByUserId: actor.id,
    updatedByUserId: actor.id,
  };
}

export function emptyMaintenanceForm(): MaintenanceRequestFormValues {
  return {
    title: "",
    description: "",
    facilityId: "",
    location: "",
    department: "",
    priority: "medium",
    category: "General",
    attachment: null,
  };
}

export function emptyIncidentForm(): IncidentRequestFormValues {
  return {
    title: "",
    description: "",
    facilityId: "",
    location: "",
    severity: "medium",
    attachment: null,
  };
}
