import type { CreateIncidentInput } from "@/modules/incidents/types";
import type { CreateMaintenanceInput } from "@/modules/maintenance/types";
import type { CreateRequestInput } from "@/modules/requests/types";
import type {
  ClientRequestFormValues,
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
  const requester =
    form.reporterName?.trim() ||
    actor.displayName ||
    actor.email ||
    actor.id;

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
      { label: "Requested by", value: requester },
      { label: "Phone", value: form.reporterPhone },
      { label: "Email", value: form.reporterEmail },
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
 * Maps occupant maintenance form → CreateRequestInput (REQ-* intake only).
 */
export function toCreateRequestFromMaintenanceForm(
  form: MaintenanceRequestFormValues,
  actor: OccupantActor
): CreateRequestInput {
  const attachment = toAttachmentRef(form.attachment);
  const now = new Date().toISOString();
  const reporterName =
    form.reporterName?.trim() || actor.displayName || undefined;
  const reporterContact =
    form.reporterEmail?.trim() ||
    form.reporterPhone?.trim() ||
    actor.email ||
    undefined;

  return {
    title: form.title.trim(),
    description: appendStructuredNotes(form.description, [
      { label: "Location", value: form.location },
      { label: "Category", value: form.category },
      { label: "Priority", value: form.priority },
      { label: "Department", value: form.department },
      {
        label: "Attachment",
        value: attachment
          ? `${attachment.fileName} (pending upload support)`
          : undefined,
      },
      { label: "Requested by", value: reporterName },
      { label: "Phone", value: form.reporterPhone },
      { label: "Email", value: form.reporterEmail },
    ]),
    facilityId: form.facilityId,
    occurredAt: now,
    locationDetail: form.location.trim() || undefined,
    reporterName,
    reporterContact,
    reportedByUserId: actor.id,
    requestType: "maintenance",
    status: "submitted",
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

/**
 * Maps occupant incident form → CreateRequestInput (REQ-* intake only).
 */
export function toCreateRequestFromIncidentForm(
  form: IncidentRequestFormValues,
  actor: OccupantActor
): CreateRequestInput {
  const attachment = toAttachmentRef(form.attachment);
  const now = new Date().toISOString();

  return {
    title: form.title.trim(),
    description: appendStructuredNotes(form.description, [
      { label: "Severity", value: form.severity },
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
    facilityId: form.facilityId,
    occurredAt: now,
    locationDetail: form.location.trim() || undefined,
    reporterName: actor.displayName || undefined,
    reporterContact: actor.email || undefined,
    reportedByUserId: actor.id,
    requestType: "incident",
    status: "submitted",
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
    reporterName: "",
    reporterPhone: "",
    reporterEmail: "",
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

export function emptyClientRequestForm(
  facilityId = ""
): ClientRequestFormValues {
  return {
    fullName: "",
    phone: "",
    email: "",
    floor: "",
    office: "",
    title: "",
    description: "",
    urgency: "medium",
    facilityId,
    attachment: null,
  };
}

/** Map client intake → existing maintenance REQ create contract. */
export function toMaintenanceFormFromClient(
  form: ClientRequestFormValues
): MaintenanceRequestFormValues {
  const location = [form.floor.trim(), form.office.trim()]
    .filter(Boolean)
    .join(" · ");

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    facilityId: form.facilityId,
    location,
    department: "",
    priority: form.urgency,
    category: "General",
    attachment: form.attachment ?? null,
    reporterName: form.fullName.trim(),
    reporterPhone: form.phone.trim(),
    reporterEmail: form.email.trim(),
  };
}
