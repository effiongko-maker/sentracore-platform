import type {
  ApprovalSort,
  ApprovalStatus,
  ApprovalTemplateDefinition,
  ApprovalType,
} from "./types";

export const APPROVAL_STATUSES: ApprovalStatus[] = [
  "draft",
  "awaiting_decision",
  "approved",
  "rejected",
  "returned",
  "cancelled",
  "expired",
  "closed",
];

/** Filter UI — canonical statuses only. */
export const APPROVAL_STATUS_FILTER_OPTIONS: ApprovalStatus[] = [
  "draft",
  "awaiting_decision",
  "approved",
  "rejected",
  "returned",
  "cancelled",
  "expired",
  "closed",
];

export const APPROVAL_TYPES: ApprovalType[] = [
  "standard_maintenance",
  "variation",
  "equipment_replacement",
  "emergency",
];

/** User-facing labels for canonical statuses. */
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  draft: "Draft",
  awaiting_decision: "Awaiting Decision",
  awaiting_submission: "Draft",
  generated: "Draft",
  submitted: "Awaiting Decision",
  awaiting_response: "Awaiting Decision",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for Clarification",
  cancelled: "Cancelled",
  expired: "Expired",
  closed: "Closed",
};

export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  standard_maintenance: "Standard Maintenance Approval Request",
  variation: "Additional Works / Variation Approval",
  equipment_replacement: "Equipment Replacement Approval",
  emergency: "Emergency Works Notification / Ratification",
};

export const APPROVAL_STATUS_VARIANT: Record<
  ApprovalStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  draft: "neutral",
  awaiting_decision: "warning",
  awaiting_submission: "neutral",
  generated: "neutral",
  submitted: "warning",
  awaiting_response: "warning",
  approved: "success",
  rejected: "danger",
  returned: "warning",
  cancelled: "neutral",
  expired: "neutral",
  closed: "neutral",
};

export const APPROVAL_SUBMISSION_METHOD_OPTIONS = [
  { value: "physical_delivery", label: "Physical delivery" },
  { value: "email", label: "Email" },
  { value: "client_portal", label: "Client portal" },
  { value: "courier", label: "Courier" },
  { value: "other", label: "Other" },
] as const;

export const APPROVAL_FOLLOW_UP_METHOD_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "physical_visit", label: "Physical visit" },
  { value: "client_portal", label: "Client portal" },
  { value: "other", label: "Other" },
] as const;

export const APPROVALS_PAGE_SIZE = 8;

export const APPROVAL_SORT_OPTIONS: Array<{
  value: ApprovalSort;
  label: string;
}> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title_asc", label: "Title: A–Z" },
  { value: "title_desc", label: "Title: Z–A" },
];

export const DEFAULT_APPROVAL_SORT: ApprovalSort = "newest";

export const DEFAULT_APPROVAL_CURRENCY = "NGN";

export const APPROVAL_PACKAGE_DOCUMENT_ID = "approval-package-document";

/**
 * Cover-letter templates — same {{placeholder}} convention as
 * reporting TemplateAdapter. Wording remains editable after bind.
 */
export const APPROVAL_TEMPLATES: ApprovalTemplateDefinition[] = [
  {
    id: "standard_maintenance",
    title: "Standard Maintenance Approval Request",
    description:
      "Formal request for authorisation to proceed with planned or corrective maintenance.",
    body: `{{letterDate}}

{{clientName}}
{{clientAddress}}

Dear {{clientSalutation}},

REQUEST FOR APPROVAL TO CARRY OUT WORKS

We hereby request approval to proceed with the following works:

Work Order: {{workOrderId}}
Title: {{workOrderTitle}}
Location: {{location}}
Facility: {{facilityName}}
Asset: {{assetName}}
Priority: {{priority}}
Assigned to: {{assigneeName}}
Description of Works: {{description}}
Reason / Justification: {{reason}}
Estimated Cost: {{estimatedCost}}
Estimated Hours: {{estimatedHours}}
Due Date: {{dueDate}}

Kindly find the attached Work Order and supporting information for your review and approval.

Yours faithfully,

{{signatory}}`,
  },
  {
    id: "variation",
    title: "Additional Works / Variation Approval",
    description:
      "Authorisation for additional scope, variations, or works beyond the original brief.",
    body: `{{letterDate}}

{{clientName}}
{{clientAddress}}

Dear {{clientSalutation}},

REQUEST FOR APPROVAL — ADDITIONAL WORKS / VARIATION

We request your approval to proceed with additional / varied works associated with the following:

Work Order: {{workOrderId}}
Title: {{workOrderTitle}}
Location: {{location}}
Facility: {{facilityName}}
Description of Additional Works: {{description}}
Justification: {{reason}}
Estimated Additional Cost: {{estimatedCost}}
Estimated Hours: {{estimatedHours}}

The enclosed Work Order form sets out the proposed variation for your review.

Yours faithfully,

{{signatory}}`,
  },
  {
    id: "equipment_replacement",
    title: "Equipment Replacement Approval",
    description:
      "Request to replace equipment or major components where cost or disruption requires client sign-off.",
    body: `{{letterDate}}

{{clientName}}
{{clientAddress}}

Dear {{clientSalutation}},

REQUEST FOR APPROVAL — EQUIPMENT REPLACEMENT

We hereby request approval to replace equipment as follows:

Work Order: {{workOrderId}}
Title: {{workOrderTitle}}
Asset: {{assetName}}
Location: {{location}}
Facility: {{facilityName}}
Scope: {{description}}
Justification: {{reason}}
Estimated Cost: {{estimatedCost}}

Please find the attached Work Order form enclosing the recommended replacement details.

Yours faithfully,

{{signatory}}`,
  },
  {
    id: "emergency",
    title: "Emergency Works Notification / Ratification",
    description:
      "Notification or ratification of emergency works requiring formal client acknowledgment.",
    body: `{{letterDate}}

{{clientName}}
{{clientAddress}}

Dear {{clientSalutation}},

EMERGENCY WORKS — NOTIFICATION / REQUEST FOR RATIFICATION

We write regarding emergency works already identified / underway under the following reference:

Work Order: {{workOrderId}}
Title: {{workOrderTitle}}
Location: {{location}}
Facility: {{facilityName}}
Asset: {{assetName}}
Priority: {{priority}}
Nature of Emergency: {{description}}
Justification: {{reason}}
Estimated Cost: {{estimatedCost}}

Kindly find the attached Work Order form. We request your formal ratification / approval to continue as required.

Yours faithfully,

{{signatory}}`,
  },
];

export function getApprovalTemplate(
  id: ApprovalType
): ApprovalTemplateDefinition {
  return (
    APPROVAL_TEMPLATES.find((row) => row.id === id) ?? APPROVAL_TEMPLATES[0]
  );
}
