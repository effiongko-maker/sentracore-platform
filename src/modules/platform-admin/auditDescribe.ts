import { describeCapability } from "./capabilityCatalog";
import { v1OperatingRoleLabel } from "@/lib/access/roles";

/**
 * Readable rendering of a platform IAM audit event: WHO did WHAT to WHOM.
 * Pure — names are resolved by the reader and passed in.
 */

export type AuditCategory = "people" | "access" | "modules" | "operating_context";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  people: "People",
  access: "Access",
  modules: "Modules",
  operating_context: "Operating context",
};

export function auditCategoryForAction(action: string): AuditCategory | null {
  if (action.startsWith("capability.")) return "access";
  if (action.startsWith("module.")) return "modules";
  if (action === "access_scope.changed") return "access";
  if (action.startsWith("facility_assignment.")) return "operating_context";
  if (action.startsWith("user.") || action.startsWith("profile.")) return "people";
  return null;
}

export const AUDIT_ACTIONS_BY_CATEGORY: Record<AuditCategory, string[]> = {
  people: ["user.invited", "user.offboarded", "profile.attached_to_organisation", "profile.activated", "profile.suspended", "profile.deactivated"],
  access: ["capability.granted", "capability.revoked", "access_scope.changed"],
  modules: ["module.enabled", "module.disabled"],
  operating_context: [
    "facility_assignment.created",
    "facility_assignment.activated",
    "facility_assignment.deactivated",
    "facility_assignment.role_changed",
    "facility_assignment.facility_changed",
  ],
};

export type AuditNames = {
  actor: string;
  /** Resolved profile name for the person the event concerns (if any). */
  person: string | null;
  facility: string | null;
  previousFacility: string | null;
  moduleName: string | null;
};

export type AuditDescription = {
  headline: string;
  category: AuditCategory | null;
  detail: string[];
};

const roleLabel = (value: unknown) =>
  typeof value === "string" && value ? v1OperatingRoleLabel(value as never) || value : "";

function str(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return value == null ? "" : String(value);
}

export function describeAuditEvent(
  action: string,
  details: Record<string, unknown>,
  names: AuditNames
): AuditDescription {
  const person = names.person ?? "an unresolved person";
  const category = auditCategoryForAction(action);
  const detail: string[] = [];

  switch (action) {
    case "user.invited":
      if (str(details, "email")) detail.push(`Invited address: ${str(details, "email")}`);
      return { headline: `Invited ${person}`, category, detail };
    case "profile.attached_to_organisation":
      if (str(details, "organisationSlug")) detail.push(`Organisation: ${str(details, "organisationSlug")}`);
      return { headline: `Attached ${person} to the organisation`, category, detail };
    case "profile.activated":
    case "profile.suspended":
    case "profile.deactivated": {
      const verb = action.split(".")[1];
      if (str(details, "previousStatus")) detail.push(`Status: ${str(details, "previousStatus")} → ${str(details, "status") || verb}`);
      return { headline: `${verb === "activated" ? "Activated" : verb === "suspended" ? "Suspended" : "Deactivated"} ${person}`, category, detail };
    }
    case "access_scope.changed": {
      const label = (scope: string, home: string) =>
        scope === "module" ? `Module-bound · ${home === "ecc_operations" ? "ECC Operations" : home === "facility_management" ? "Facility Management" : "unknown module"}` : "Platform";
      detail.push(`Access scope: ${label(str(details, "previousAccessScope"), str(details, "previousHomeModule"))} → ${label(str(details, "accessScope"), str(details, "homeModule"))}`);
      return { headline: `Changed access scope for ${person}`, category, detail };
    }
    case "user.offboarded": {
      const revoked = (details.revoked ?? {}) as Record<string, unknown>;
      const parts: Array<[string, string]> = [
        ["platformCapabilityGrants", "platform capability grants"],
        ["financeCapabilityGrants", "finance capability grants"],
        ["financeCompanyAccess", "finance company access rows"],
        ["financeFinancialAccountAccess", "financial account access rows"],
        ["operationalIdentityLinksInactivated", "operational identity links"],
        ["fmFacilityAssignmentsInactivated", "facility assignments"],
      ];
      for (const [key, label] of parts) {
        const n = Number(revoked[key] ?? 0);
        if (n > 0) detail.push(`Revoked ${n} ${label}`);
      }
      if (detail.length === 0) detail.push("No grants or assignments were held");
      return { headline: `Offboarded ${person}`, category, detail };
    }
    case "module.enabled":
    case "module.disabled": {
      const moduleLabel = names.moduleName ?? (str(details, "moduleSlug") || "a module");
      if (action === "module.enabled") detail.push("Availability only — no one was granted access");
      return { headline: `${action === "module.enabled" ? "Enabled" : "Disabled"} the ${moduleLabel} module`, category, detail };
    }
    case "capability.granted":
    case "capability.revoked": {
      const cap = describeCapability(str(details, "capability"));
      detail.push(`Capability: ${str(details, "capability")}`);
      if (cap.domainLabel) detail.push(cap.domainLabel);
      return {
        headline: `${action === "capability.granted" ? "Granted" : "Revoked"} “${cap.label}” ${action === "capability.granted" ? "to" : "from"} ${person}`,
        category,
        detail,
      };
    }
    case "facility_assignment.created": {
      detail.push(`Operating role: ${roleLabel(details.operationalRole)}`);
      detail.push(`Assignment status: ${str(details, "status")}`);
      return { headline: `Assigned ${person} to ${names.facility ?? "a facility"}`, category, detail };
    }
    case "facility_assignment.activated":
    case "facility_assignment.deactivated":
      detail.push(`Operating role: ${roleLabel(details.operationalRole)}`);
      return {
        headline: `${action.endsWith("activated") && !action.endsWith("deactivated") ? "Reactivated" : "Deactivated"} ${person}’s assignment at ${names.facility ?? "a facility"}`,
        category,
        detail,
      };
    case "facility_assignment.role_changed":
      detail.push(`Operating role: ${roleLabel(details.previousOperationalRole)} → ${roleLabel(details.operationalRole)}`);
      detail.push("Operating role is context, not permission");
      return { headline: `Changed ${person}’s operating role at ${names.facility ?? "a facility"}`, category, detail };
    case "facility_assignment.facility_changed":
      detail.push(`Facility: ${names.previousFacility ?? "—"} → ${names.facility ?? "—"}`);
      return { headline: `Moved ${person}’s assignment to ${names.facility ?? "another facility"}`, category, detail };
    default:
      return { headline: action, category, detail };
  }
}
