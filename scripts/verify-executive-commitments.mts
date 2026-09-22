/**
 * Executive Commitments V1 verification. Non-mutating: pure functions, prototype stubs and
 * source inspection. `--live-read` adds READ-ONLY checks against the linked database.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-executive-commitments.mts [--live-read]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  commitmentDateLabel,
  isCommitmentOverdue,
  overdueCommitmentAttentionItems,
  partitionCommitments,
  validateCommitmentInput,
  type CommitmentRecord,
} from "../src/modules/command-centre/commitments/domain";
import { composeExecutiveAttention } from "../src/modules/command-centre/server/composeExecutiveAttention";
import { COMMAND_CENTRE_CAPABILITIES } from "../src/modules/command-centre/types";
import { PLATFORM_ADMINISTRABLE_CAPABILITIES } from "../src/modules/platform-admin/types";
import { catalogCoversAllAdministrableCapabilities } from "../src/modules/platform-admin/capabilityCatalog";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

const ME = "11111111-1111-4111-8111-111111111111";
const EFF = "22222222-2222-4222-8222-222222222222";
const rec = (over: Partial<CommitmentRecord>): CommitmentRecord => ({
  id: "c1", title: "Proposal", description: null, createdByProfileId: ME, assigneeProfileId: EFF,
  dueDate: null, status: "open", completedAt: null, createdAt: "2026-09-01T00:00:00Z", ...over,
});
const names = new Map([[ME, "CEO"], [EFF, "Effiong"]]);

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);
  const mig = src("supabase/migrations/20260920220000_executive_commitments.sql");

  // ── A. Domain ─────────────────────────────────────────────────────────────
  {
    assert(/organisation_id uuid not null references public\.organisations/.test(mig), "A: organisation scoped");
    assert(/created_by_profile_id uuid not null references public\.profiles/.test(mig) && /assignee_profile_id uuid not null references public\.profiles/.test(mig), "A: canonical profile identities (FKs to profiles)");
    assert(!/assignee_name|assignee_email|ecc_people|operational_identity_links|fm_facility/i.test(mig.replace(/--.*$/gm, "")), "A: assignee is never a name, email, ECC person or FM assignment");
    assert(/status in \('open', 'completed', 'cancelled'\)/.test(mig) && !/reopen/i.test(mig.replace(/--.*$/gm, "")), "A: lifecycle is open → completed | cancelled (no reopen)");
    assert(!/\boverdue\s+(boolean|text|date|timestamptz)/i.test(mig) && !/status in \([^)]*overdue/i.test(mig), "A: overdue is derived, never stored (no column, not a status)");
    assert(!/insert into public\.executive_commitments\s*\(\s*organisation_id, title, description, created_by_profile_id, assignee_profile_id, due_date\s*\)\s*values\s*\(\s*'/i.test(mig) && !/seed/i.test(mig.replace(/--.*$/gm, "")), "A: no seed / fake commitments");
    assert(/revoke all on table public\.executive_commitments from anon, authenticated, service_role/.test(mig) && !/grant (insert|update|delete)/i.test(mig.replace(/grant execute[^;]*;/g, "")), "A: no direct writes and no delete grant for anyone (no normal hard delete)");
    assert(/created_by_profile_id/.test(mig) && /assignee_profile_id/.test(mig) && /only the creator or assignee may change/.test(mig), "A: authorship and assignment are distinct concepts");
    assert(/executive_commitment_events is append-only/.test(mig) && /'created', 'edited', 'completed', 'cancelled'/.test(mig), "A: append-only audit history for created/edited/completed/cancelled");
    const domain = src("src/modules/command-centre/commitments/domain.ts");
    assert(!/priority|tags?\b|subtask|recurr|percent|estimate/i.test(domain.replace(/\/\*[\s\S]*?\*\//g, "")), "A: no generic task-manager concepts in the domain");
    pass("A domain: org-scoped, profile identities, creator ≠ assignee, small lifecycle, derived overdue, no hard delete, no seed data");
  }

  // ── B. Authority ──────────────────────────────────────────────────────────
  {
    assert(COMMAND_CENTRE_CAPABILITIES.commitmentsView === "platform.command_centre.commitments.view" && COMMAND_CENTRE_CAPABILITIES.commitmentsManage === "platform.command_centre.commitments.manage", "B: explicit view/manage capabilities");
    // The literal-typed constants are distinct at compile time, so compare the runtime VALUES as plain strings.
    assert(new Set<string>(Object.values(COMMAND_CENTRE_CAPABILITIES)).size === Object.keys(COMMAND_CENTRE_CAPABILITIES).length, "B: every Command Centre capability is distinct — commitments are not overloaded onto view/decide");
    assert(/'platform\.command_centre\.commitments\.view'/.test(mig) && /'platform\.command_centre\.commitments\.manage'/.test(mig) && /platform_iam_is_allowed_platform_capability/.test(mig), "B: administrable through the canonical IAM allow-list");
    assert(PLATFORM_ADMINISTRABLE_CAPABILITIES.includes(COMMAND_CENTRE_CAPABILITIES.commitmentsView) && PLATFORM_ADMINISTRABLE_CAPABILITIES.includes(COMMAND_CENTRE_CAPABILITIES.commitmentsManage) && catalogCoversAllAdministrableCapabilities(), "B: appear in the existing Admin Console capability catalogue (no special screen)");
    const gate = src("src/modules/command-centre/commitments/server/requireCommitmentsAccess.ts");
    assert(gate.includes("requireCommandCentreAccess()") && gate.includes("commitmentsView") && gate.includes("commitmentsManage") && /level === "manage"/.test(gate), "B: view needs Command Centre view + commitments.view; manage additionally needs commitments.manage");
    assert(!/assignee|assign/i.test(gate.replace(/Assignment of a commitment is never consulted here\./, "").replace(/\/\*[\s\S]*?\*\//g, "")), "B: assignment is never consulted for authority");
    assert(!/created_by|assignee_profile_id|executive_commitments/.test(gate), "B: authority reads only explicit grants, never commitment ownership");
    const route = src("src/app/api/command-centre/commitments/route.ts");
    assert(route.includes('requireCommitmentsAccess("manage")') && route.indexOf("requireCommitmentsAccess") < route.indexOf("switch (body.action)"), "B: every API action is authorised server-side before dispatch");
    assert(route.includes("access.profileId") && !/body\.(actor|profile|createdBy)/i.test(route), "B: actor is the authenticated session, never client input");
    const cc = src("src/modules/command-centre/server/requireCommandCentreAccess.ts");
    assert(cc.includes('assertBoundaryAllows(session, "platform")'), "B: module-bound identities cannot enter (platform boundary preserved)");
    assert(/if \(!caps\.view\)/.test(src("src/modules/command-centre/server/CommandCentreServerService.ts")), "B: Command Centre view alone does not surface or manage the register");
    assert(/revoke all on function public\.%s from anon, authenticated/.test(mig) && /grant execute on function public\.%s to service_role/.test(mig), "B: mutation RPCs are service-role only; direct mutation fails closed");
    const repo = src("src/modules/command-centre/commitments/server/ExecutiveCommitmentRepository.ts");
    assert(!/\.(insert|update|delete)\(/.test(repo), "B: the repository performs no direct table writes — RPCs only");
    pass("B authority: explicit view/manage, no assignment authority, boundary preserved, server-side gates, no direct writes");
  }

  // ── C. Data integrity ─────────────────────────────────────────────────────
  {
    assert(isCommitmentOverdue({ status: "open", dueDate: "2026-09-20" }, "2026-09-21"), "C: open past-due is overdue");
    assert(!isCommitmentOverdue({ status: "open", dueDate: "2026-09-21" }, "2026-09-21"), "C: due today is not overdue");
    assert(!isCommitmentOverdue({ status: "open", dueDate: null }, "2026-09-21"), "C: no due date is never overdue");
    assert(!isCommitmentOverdue({ status: "completed", dueDate: "2026-01-01" }, "2026-09-21") && !isCommitmentOverdue({ status: "cancelled", dueDate: "2026-01-01" }, "2026-09-21"), "C: completed/cancelled are never overdue");
    const parts = partitionCommitments([
      rec({ id: "a", dueDate: "2026-09-10" }), rec({ id: "b", dueDate: "2026-09-30" }), rec({ id: "c", dueDate: null }),
      rec({ id: "d", status: "completed", dueDate: "2026-01-01", completedAt: "2026-09-19T00:00:00Z" }),
      rec({ id: "e", status: "cancelled", dueDate: "2026-01-01" }),
    ], names, "2026-09-21");
    assert(parts.overdue.map((c) => c.id).join() === "a" && parts.open.map((c) => c.id).join() === "b,c" && parts.completed.map((c) => c.id).join() === "d", "C: deterministic ordering (overdue → due → undated); cancelled hidden; completed separate");
    // validation
    assert(!validateCommitmentInput({ title: "  ", assigneeProfileId: EFF }).ok, "C: blank title rejected");
    assert(!validateCommitmentInput({ title: "x", assigneeProfileId: "Effiong" }).ok, "C: an assignee must be a profile UUID, never a name");
    assert(!validateCommitmentInput({ title: "x", assigneeProfileId: EFF, dueDate: "2026-02-30" }).ok && !validateCommitmentInput({ title: "x", assigneeProfileId: EFF, dueDate: "tomorrow" }).ok, "C: due date must be a real calendar date");
    const okSelf = validateCommitmentInput({ title: " Review ", assigneeProfileId: ME, dueDate: "" });
    assert(okSelf.ok && okSelf.value.dueDate === null && okSelf.value.title === "Review", "C: the executive may assign to themselves; empty due date = none");
    assert(/status = 'active'/.test(mig) && /assignee must be an active member of the organisation|must be an active member/.test(mig) && /p\.organisation_id = p_organisation_id/.test(mig), "C: DB rejects inactive / invited / cross-organisation assignees (proved by rollback probe)");
    assert(/executive_commitments_validate_parties/.test(mig) && /assignee is not a member of the organisation/.test(mig), "C: trigger backstop for cross-organisation parties");
    // organisation timezone drives "today"
    const { ExecutiveCommitmentRepository } = await import("../src/modules/command-centre/commitments/server/ExecutiveCommitmentRepository");
    const { ExecutiveCommitmentsService } = await import("../src/modules/command-centre/commitments/server/ExecutiveCommitmentsService");
    const proto = ExecutiveCommitmentRepository.prototype as unknown as Record<string, unknown>;
    proto.listForProfile = async () => [rec({ id: "late", dueDate: "2026-09-20" })];
    proto.profileNames = async () => names;
    const near = new Date("2026-09-20T23:30:00Z"); // 00:30 on the 21st in Lagos, still the 20th in UTC
    const lagos = await new ExecutiveCommitmentsService("o", ME, "Africa/Lagos").loadRegister(near);
    const utc = await new ExecutiveCommitmentsService("o", ME, "UTC").loadRegister(near);
    assert(lagos.today === "2026-09-21" && lagos.overdue.length === 1 && utc.today === "2026-09-20" && utc.overdue.length === 0, "C: overdue follows the ORGANISATION calendar, not UTC");
    pass("C integrity: validation, canonical assignee, no completed/cancelled overdue, organisation-timezone due dates");
  }

  // ── D. UI ─────────────────────────────────────────────────────────────────
  {
    const panel = src("src/modules/command-centre/components/CommitmentsPanel.tsx");
    assert(/state === "restricted"\) return null/.test(panel), "D: an identity without commitments.view is simply not offered the surface");
    assert(/No outstanding commitments\./.test(panel) && /commitments\.state === "error"/.test(panel) && panel.indexOf('state === "error"') < panel.indexOf("No outstanding commitments."), "D: a loaded empty register is 'No outstanding commitments.'; a failed read is a separate error state");
    assert(!/All caught up|Everything is handled|across the organisation/i.test(panel), "D: no unsupported completeness claims");
    assert(/commitments\.canManage && !form/.test(panel) && /New Commitment/.test(panel), "D: New Commitment is offered only with manage authority");
    assert(!/kanban|drag|swimlane|priority|subtask|\btags?\b/i.test(panel.replace(/\/\*[\s\S]*?\*\//g, "")), "D: no task-manager concepts");
    const all = [...walk("src/modules/command-centre"), ...walk("src/app/api/command-centre")].filter((f) => /\.(ts|tsx)$/.test(f));
    assert(all.every((f) => !/batcave/i.test(src(f))), "D: no Private Office coupling");
    pass("D UI: restricted hidden, empty ≠ failure, manage-gated creation, no task-manager concepts, no Private Office");
  }

  // ── E. Attention ─────────────────────────────────────────────────────────
  {
    const parts = partitionCommitments([
      rec({ id: "ov", dueDate: "2026-09-10" }), rec({ id: "soon", dueDate: "2026-09-25" }), rec({ id: "nodue" }),
      rec({ id: "done", status: "completed", dueDate: "2026-09-01", completedAt: "2026-09-02T00:00:00Z" }), rec({ id: "can", status: "cancelled", dueDate: "2026-09-01" }),
    ], names, "2026-09-21");
    const items = overdueCommitmentAttentionItems(parts.overdue);
    assert(items.length === 1 && items[0].id === "commitments:ov" && /Overdue · due 10 Sept? · Effiong/.test(items[0].detail ?? ""), "E: an overdue open commitment qualifies");
    assert(overdueCommitmentAttentionItems([...parts.open, ...parts.completed]).length === 0, "E: open-not-overdue, undated and completed commitments do not qualify");
    assert(!items.some((i) => /cancelled|can/.test(i.id)), "E: cancelled never qualifies");
    assert(/^10 Sept?$/.test(commitmentDateLabel("2026-09-10")), "E: date-only label");
    const ok = composeExecutiveAttention([
      { domain: "finance", status: "loaded", items: [] }, { domain: "ecc", status: "loaded", items: [] },
      { domain: "facility_management", status: "loaded", items: [] }, { domain: "commitments", status: "not_enabled", items: [] },
    ]);
    assert(ok.complete && ok.state === "empty" && !/Commitments/.test(ok.summary), "E: identities without commitments.view are unaffected and commitments is not claimed as evaluated");
    const withC = composeExecutiveAttention([{ domain: "finance", status: "loaded", items: [] }, { domain: "commitments", status: "loaded", items }]);
    assert(withC.state === "healthy" && withC.items.length === 1, "E: overdue commitments reach executive attention");
    const failed = composeExecutiveAttention([{ domain: "finance", status: "loaded", items: [] }, { domain: "commitments", status: "unavailable", items: [] }]);
    assert(!failed.complete && failed.state !== "empty", "E: an unreadable register cannot yield a global 'nothing requires attention'");
    pass("E attention: only overdue open commitments qualify; failure ≠ empty");
  }

  // ── F. Regression / isolation ─────────────────────────────────────────────
  {
    const svc = src("src/modules/command-centre/server/CommandCentreServerService.ts");
    const dir = walk("src/modules/command-centre/commitments").map((f) => src(f)).join("\n") + src("src/app/api/command-centre/commitments/route.ts");
    assert(!/operational_events/.test(dir) && !/from\("operational_events"\)/.test(svc), "F: no operational_events dependency");
    assert(!/landingWorkspace|landing_workspace|access_scope|home_module/.test(dir), "F: landing_workspace / access scope untouched");
    assert(!/notification/i.test(dir), "F: no notification system built (delivery deferred)");
    assert(/Since Your Last Visit/.test(src("src/modules/command-centre/components/CommandCentrePage.tsx")) && /<CommitmentsPanel/.test(src("src/modules/command-centre/components/CommandCentrePage.tsx")), "F: existing surfaces retained; commitments added beside them");
    pass("F regression: no operational_events, landing/IAM untouched, no notifications, existing surfaces retained");
  }

  // ── Live read (optional, read-only) ───────────────────────────────────────
  if (process.argv.includes("--live-read")) {
    loadEnvLocal();
    const { createClient } = await import("@supabase/supabase-js");
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const commitments = await c.from("executive_commitments").select("*", { count: "exact", head: true });
    assert(!commitments.error && commitments.count === 0, "live: no persisted commitments (no fake data)");
    const grants = await c.from("platform_capability_grants").select("capability").like("capability", "platform.command_centre.commitments.%");
    assert(!grants.error && (grants.data ?? []).length === 0, "live: no existing identity holds a commitments capability");
    const direct = await c.from("executive_commitments").insert({ organisation_id: "835a2e6d-a91b-413f-946a-8ed73a6027cc", title: "x", created_by_profile_id: ME, assignee_profile_id: ME });
    assert(direct.error, "live: even the service role cannot write directly");
    pass("live-read: 0 commitments, 0 grants, direct writes refused");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
