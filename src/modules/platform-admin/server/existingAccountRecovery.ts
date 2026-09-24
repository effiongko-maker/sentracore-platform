/**
 * Create Account found an existing sign-in identity for the email. Classify what the administrator may do, without
 * exposing another organisation's details. Pure — the caller reads the profile row.
 *
 *   recoverable_invited  profile exists, attached to NO organisation, status "invited" (the stranded state left by the
 *                        earlier invite/signup model) → the existing attachProfileToOrganisation path applies.
 *   this_organisation    already a member of this organisation → manage them from People.
 *   not_recoverable      another organisation, no profile, or an unattached inactive / suspended profile (attaching
 *                        would silently reactivate it) → generic refusal, no details.
 */
export type ExistingAccountState = "recoverable_invited" | "this_organisation" | "not_recoverable";

export function classifyExistingAccount(
  profile: { organisation_id: string | null; status: string } | null,
  organisationId: string
): ExistingAccountState {
  if (!profile) return "not_recoverable";
  if (profile.organisation_id === organisationId) return "this_organisation";
  if (profile.organisation_id === null && profile.status === "invited") return "recoverable_invited";
  return "not_recoverable";
}

export { ATTACH_EXISTING_ACCOUNT_RECOVERY } from "../types";

export const EXISTING_ACCOUNT_MESSAGES: Record<ExistingAccountState, string> = {
  recoverable_invited:
    "This person already has a SentraCore sign-in identity but has not been attached to this organisation.",
  this_organisation:
    "This person already has an account in this organisation. Find them in People to manage their access or issue a temporary password.",
  not_recoverable: "An account with this email already exists and cannot be added here.",
};
