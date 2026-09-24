/**
 * Admin Console — recovering an existing sign-in identity that was never attached to the organisation (earlier invite
 * model), Home workspace copy, and administrator temporary-password email confirmation. No database access.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-admin-existing-account-recovery.mts
 */
import { readFileSync } from "node:fs";
import {
  EXISTING_ACCOUNT_MESSAGES,
  classifyExistingAccount,
} from "../src/modules/platform-admin/server/existingAccountRecovery";
import { ATTACH_EXISTING_ACCOUNT_RECOVERY } from "../src/modules/platform-admin/types";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function main() {
  const out: string[] = [];
  const ORG = "org-1";
  const service = read("src/modules/platform-admin/server/PlatformAdminServerService.ts");
  const people = read("src/modules/platform-admin/client/PeopleView.tsx");
  const create = service.slice(service.indexOf("async createAccount("), service.indexOf("async issueTemporaryPassword("));

  // 1. Classification.
  check(classifyExistingAccount({ organisation_id: null, status: "invited" }, ORG) === "recoverable_invited", "unattached invited ⇒ recoverable");
  check(classifyExistingAccount({ organisation_id: ORG, status: "active" }, ORG) === "this_organisation", "already in this organisation");
  check(classifyExistingAccount({ organisation_id: "org-2", status: "active" }, ORG) === "not_recoverable", "another organisation ⇒ not recoverable");
  check(classifyExistingAccount({ organisation_id: null, status: "suspended" }, ORG) === "not_recoverable" && classifyExistingAccount({ organisation_id: null, status: "inactive" }, ORG) === "not_recoverable", "unattached suspended / inactive are not silently reactivated");
  check(classifyExistingAccount(null, ORG) === "not_recoverable", "identity without a profile is not recoverable here");
  check(!/organisation|org-2/i.test(EXISTING_ACCOUNT_MESSAGES.not_recoverable.replace("cannot be added here", "")), "another organisation is not revealed");
  out.push("PASS 1 existing identities classified: unattached invited ⇒ recoverable; this org / other org / suspended handled without leaking details");

  // 2. Create Account never creates a duplicate and offers the recovery instead of the misleading message.
  check(!/Use Issue Temporary Password for an existing account/.test(service), "misleading temporary-password message removed");
  check(/const existingUserId = await findAuthUserIdByEmail\(this\.admin, email\);\s*if \(existingUserId\) \{[\s\S]*?throw new ActionError\(/.test(create), "an existing identity always stops creation (no duplicate user)");
  check(create.indexOf("throw new ActionError(\n        \"VALIDATION_ERROR\",\n        EXISTING_ACCOUNT_MESSAGES[state]") < create.indexOf("auth.admin.createUser("), "classification happens before any createUser");
  check(create.includes('state === "recoverable_invited" ? { details: { recovery: ATTACH_EXISTING_ACCOUNT_RECOVERY } } : undefined'), "recovery marker only for the recoverable state");
  check(people.includes("err.details?.recovery === ATTACH_EXISTING_ACCOUNT_RECOVERY") && people.includes("Existing account found") && people.includes('"Attach existing account"'), "Create Account offers Attach existing account");
  check(read("src/modules/platform-admin/client/adminApi.ts").includes("json.details ?? null"), "client receives the server recovery marker");
  check(ATTACH_EXISTING_ACCOUNT_RECOVERY === "attach_existing_account", "shared recovery marker");
  out.push("PASS 2 Create Account offers Attach existing account (no duplicate identity, no misleading message)");

  // 3. The existing attach path is reused unchanged.
  check(people.includes('adminCall<AttachProfileResult>("attachProfileToOrganisation", {') && people.includes("email: recoverable.email,"), "dialog calls the existing attachProfileToOrganisation action");
  check(read("src/app/api/platform-admin/route.ts").includes('case "attachProfileToOrganisation"'), "existing route action");
  const attach = service.slice(service.indexOf("async attachProfileToOrganisation("), service.indexOf("async attachProfileToOrganisation(") + 1600);
  check(attach.includes("this.repo.attachInvitedProfile({") && attach.includes('action: "profile.attached_to_organisation"'), "existing audited RPC path");
  out.push("PASS 3 the existing, audited attachProfileToOrganisation → attach_invited_profile_to_organisation path is reused");

  // 4 / 5 / 6. Attachment grants nothing, preserves the identity, refuses other organisations.
  const rpc = read("supabase/migrations/20260916124500_attach_invited_profile_to_organisation.sql");
  const rpcBody = strip(rpc.replace(/--.*$/gm, ""));
  check(!/platform_capability_grants|user_role_assignments|fm_facility_assignments|finance_capability_grants|insert into/i.test(rpcBody), "attachment grants no roles, capabilities or facility assignments");
  check(/full_name = coalesce\(nullif\(trim\(p_full_name\), ''\), full_name\)/.test(rpcBody) && !/delete from|auth\.users.*insert/i.test(rpcBody) && attach.includes("email,\n      organisationSlug: organisation.slug,\n    });"), "existing identity and name preserved (no name passed, nothing recreated)");
  check(/already linked to a different organisation/.test(rpcBody) && /errcode = '42501'/.test(rpcBody), "another organisation's profile cannot be attached (server-side)");
  check(!/grantPlatformCapability|setFacilityAssignment|setAccessScope/.test(people.slice(people.indexOf("async function attachExisting"), people.indexOf("async function attachExisting") + 900)), "the dialog applies no access after attaching");
  out.push("PASS 4-6 attachment grants nothing, preserves the identity and name, and refuses another organisation");

  // 7. Already-attached accounts keep existing-account handling.
  check(/Find them in People to manage their access or issue a temporary password/.test(EXISTING_ACCOUNT_MESSAGES.this_organisation), "already-attached ⇒ manage from People");
  out.push("PASS 7 already-attached accounts are directed to their existing People management");

  // 8-11. Home workspace copy and non-authority.
  check(people.includes("Where this person lands after signing in. Access is managed separately."), "simplified Home workspace copy");
  check(people.includes("Access to Platform Finance is assigned separately."), "one-line Finance note");
  check(!/Finance authority is not granted here|platform_finance\.\*|FM Costs|company access and|cannot open Facility Management/.test(people), "architecture-heavy Finance explanation removed");
  check(!/homeEntry\.note/.test(people), "registry architecture notes no longer shown in Create Account");
  check(!/capabilityPackage: .*platform_finance|capabilities: .*platform_finance/.test(people) && !/homeModule[\s\S]{0,200}grantPlatformCapability/.test(create), "Home workspace / Platform Finance selection grants no capability");
  out.push("PASS 8-11 Home workspace is non-authoritative; Platform Finance grants nothing; concise copy in place");

  // 12. Email confirmation limited to the authorised administrator temporary-password path.
  const temp = service.slice(service.indexOf("async issueTemporaryPassword("), service.indexOf("async issueTemporaryPassword(") + 2600);
  check(/const confirmEmail = !authUser\.user\.email_confirmed_at;/.test(temp) && temp.includes("...(confirmEmail ? { email_confirm: true } : {}),"), "temporary password confirms an unconfirmed identity");
  check(temp.includes("...(confirmEmail ? { emailConfirmedByAdministrator: true } : {}),"), "the confirmation is audited");
  check(create.includes("email_confirm: true,"), "same usable state as Create Account (pre-confirmed)");
  check(/if \(profile\.status !== "active" \|\| !profile\.organisation_id\)/.test(temp), "only for active, organisation-attached accounts (after attach)");
  check((service.match(/email_confirm: true/g) ?? []).length === 2, "no other code path confirms emails");
  out.push("PASS 12 email confirmation happens only in the audited administrator provisioning / temporary-password path");

  // 13. Regression: a successful issuance must show the one-time password, not loop back to the confirmation. The dialog
  // is rendered inside the person DataBoundary, so refreshing the person while it is open unmounts it and discards the
  // credential; the refresh must wait until the administrator closes the credential view.
  const personView = read("src/modules/platform-admin/client/PersonView.tsx");
  const dialog = personView.slice(personView.indexOf("function IssuePasswordDialog("), personView.indexOf("return (", personView.indexOf("function IssuePasswordDialog(")));
  const confirmFn = dialog.slice(dialog.indexOf("async function confirm()"));
  const closeFn = dialog.slice(dialog.indexOf("function close()"), dialog.indexOf("async function confirm()"));
  check(personView.indexOf("<IssuePasswordDialog") < personView.lastIndexOf("</DataBoundary>") && personView.indexOf("<IssuePasswordDialog") > personView.indexOf('<DataBoundary state={person}'), "dialog lives inside the person DataBoundary (why the refresh must wait)");
  check(confirmFn.includes("setResult(data);") && !/onDone\(|reload\(|refresh\(/.test(confirmFn), "successful issuance does not refresh the person while the credential is shown");
  check(/const issued = result !== null;[\s\S]*setResult\(null\);[\s\S]*onClose\(\);[\s\S]*if \(issued\) onDone\(\);/.test(closeFn), "authoritative refresh happens once, after the credential view is closed");
  out.push("PASS 13 Issue Temporary Password shows the one-time credential once; refresh deferred to close (no confirmation loop)");

  for (const line of out) console.log(line);
  console.log("verify-admin-existing-account-recovery: PASS");
}

try {
  main();
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
}
