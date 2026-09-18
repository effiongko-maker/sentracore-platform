import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveFmOperationalIdentity } from "../src/lib/access/operationalIdentity";
import {
  accessCan,
  resolveOperatingAccessFromSheetUser,
} from "../src/lib/access/resolveAccess";

const person = (id: string, email: string) => ({
  id, email, name: "Person", role: "FM Staff", status: "active" as const,
  facility: "FAC-0001",
});

async function main() {
  let emailLookups = 0;
  const explicit = await resolveFmOperationalIdentity({
    explicitLink: { externalIdentityId: "USR-0002", status: "active" },
    email: "profile@paychexng.com",
    loadById: async (id) => person(id, "typo@paychexng.clm"),
    loadByEmail: async () => { emailLookups += 1; return null; },
  });
  assert.equal(explicit.source, "explicit_link");
  assert.equal(explicit.operationalUserId, "USR-0002");
  assert.equal(explicit.enrichment, "resolved");
  assert.equal(explicit.user?.id, "USR-0002");
  assert.equal(emailLookups, 0, "explicit links must bypass email fallback");
  const explicitAccess = resolveOperatingAccessFromSheetUser(
    "profile@paychexng.com",
    "Person",
    explicit.user
  );
  assert.equal(explicitAccess.sheetUserId, "USR-0002");
  assert.equal(accessCan(explicitAccess, "ops.view"), false);

  const unavailable = await resolveFmOperationalIdentity({
    explicitLink: { externalIdentityId: "USR-0002", status: "active" },
    email: "profile@paychexng.com",
    loadById: async () => { throw new Error("People register unavailable"); },
    loadByEmail: async () => { emailLookups += 1; return person("USR-9999", "profile@paychexng.com"); },
  });
  assert.equal(unavailable.source, "explicit_link");
  assert.equal(unavailable.operationalUserId, "USR-0002");
  assert.equal(unavailable.enrichment, "unavailable");
  assert.equal(unavailable.user, null);
  assert.equal(emailLookups, 0, "failed explicit enrichment must not use email fallback");

  const fallback = await resolveFmOperationalIdentity({
    explicitLink: null,
    email: "person@paychexng.com",
    loadById: async () => null,
    loadByEmail: async (email) => person("USR-0003", email),
  });
  assert.equal(fallback.source, "email_fallback");
  assert.equal(fallback.operationalUserId, "USR-0003");
  assert.equal(fallback.user?.id, "USR-0003");

  const missing = await resolveFmOperationalIdentity({
    explicitLink: null,
    email: "missing@paychexng.com",
    loadById: async () => null,
    loadByEmail: async () => null,
  });
  assert.deepEqual(missing, {
    source: "none",
    operationalUserId: null,
    enrichment: "not_applicable",
    user: null,
  });

  const missingAccess = resolveOperatingAccessFromSheetUser(
    "missing@paychexng.com",
    "Missing",
    missing.user
  );
  assert.equal(accessCan(missingAccess, "ops.view"), false);
  assert.equal(accessCan(missingAccess, "users.manage"), false);

  const broken = await resolveFmOperationalIdentity({
    explicitLink: { externalIdentityId: "USR-0002", status: "active" },
    email: "profile@paychexng.com",
    loadById: async () => null,
    loadByEmail: async () => person("USR-9999", "profile@paychexng.com"),
  });
  assert.equal(broken.source, "explicit_link");
  assert.equal(broken.enrichment, "not_found");
  assert.equal(broken.user, null);
  const brokenAccess = resolveOperatingAccessFromSheetUser(
    "profile@paychexng.com",
    "Person",
    broken.user
  );
  assert.equal(accessCan(brokenAccess, "ops.view"), false);

  const root = new URL("../", import.meta.url);
  const read = (path: string) => readFile(new URL(path, root), "utf8");
  const [migration, access, workspace, api, maintenance, issue, incident, commandCentre] = await Promise.all([
    read("supabase/migrations/20260917100000_operational_identity_links.sql"),
    read("src/lib/access/server.ts"),
    read("src/services/workspace/WorkspaceService.ts"),
    read("src/app/api/auth/me/route.ts"),
    read("src/modules/maintenance/actions/requestMaintenance.ts"),
    read("src/modules/issues/actions/logIssue.ts"),
    read("src/modules/incidents/actions/reportIncident.ts"),
    read("src/modules/command-centre/server/CommandCentreServerService.ts"),
  ]);
  assert.match(migration, /Identity linkage is not an authority grant/);
  assert.match(migration, /unique \(organisation_id, profile_id, identity_domain\)/);
  assert.match(migration, /unique \(organisation_id, identity_domain, external_identity_id\)/);
  assert.match(migration, /revoke all on function public\.provision_operational_identity_link[\s\S]*authenticated/);
  assert.doesNotMatch(access, /resolveFmOperationalIdentity/);
  assert.doesNotMatch(access, /action: "getAll"/);
  assert.match(access, /platform_capability_grants/);
  assert.match(api, /operationalUserId: operatingAccess\.sheetUserId/);
  assert.match(workspace, /currentUser\?\.operationalUserId/);
  assert.match(commandCentre, /loadTransitionalSheetAssigneeId/);
  assert.doesNotMatch(commandCentre, /loadAssignmentSummary\(operatingAccess\.sheetUserId\)/);
  assert.doesNotMatch(maintenance, /reportedByUserId:\s*validated\.reportedByUserId \|\| context\.userId/);
  assert.doesNotMatch(issue, /reportedByUserId:\s*context\.userId/);
  assert.match(incident, /createdByUserId: actorUserId/);
  assert.match(incident, /operationalReporterUserId/);
  assert.doesNotMatch(maintenance, /assignedToUserId:\s*context\.userId/);
  assert.doesNotMatch(issue, /assignedToUserId:\s*context\.userId/);
  assert.doesNotMatch(incident, /assignedToUserId:\s*actorUserId/);

  console.log("Operational identity bridge verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
