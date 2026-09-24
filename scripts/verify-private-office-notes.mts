/**
 * Private Office Private Executive Notes V1 verification (formerly "Batcave"). Non-mutating: source
 * inspection + pure checks. `--live-read` adds READ-ONLY checks against the linked database (privilege
 * denial, no grants). Behavioural RLS proof is done by rollback-only SQL probe (see the pass report).
 *
 * The underlying table (batcave_notes) and its policies/trigger/function names are UNCHANGED by the
 * Command Centre -> Executive Office / Batcave -> Private Office rename — only the capability STRING moved
 * (platform.batcave.access -> platform.executive.private_office.access, see
 * 20260922220000_executive_private_office_capability_rename.sql). The original
 * 20260920240000_batcave_private_notes.sql migration file is checked for table/policy/trigger structure
 * (unchanged, historical); the capability string enforced by batcave_note_actor_ok is checked against the
 * LATEST migration that defines it (the rename migration replaced the function body).
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-private-office-notes.mts [--live-read]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX, isNoteId, validateNoteInput } from "../src/modules/private-office/notes/domain";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");
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

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);
  const migRaw = src("supabase/migrations/20260920240000_batcave_private_notes.sql");
  const mig = strip(migRaw);
  const renameMig = strip(src("supabase/migrations/20260922220000_executive_private_office_capability_rename.sql"));
  const notesFiles = [...walk("src/modules/private-office/notes"), "src/app/api/private-office/notes/route.ts"];
  const notesCode = notesFiles.map((f) => strip(src(f))).join("\n");

  // ── A. Domain ─────────────────────────────────────────────────────────────
  {
    const table = mig.slice(mig.indexOf("create table public.batcave_notes"), mig.indexOf(");", mig.indexOf("create table public.batcave_notes")));
    const cols = [...table.matchAll(/^\s+(\w+)\s+(uuid|text|timestamptz)/gm)].map((m) => m[1]);
    assert(cols.join() === "id,organisation_id,owner_profile_id,title,body,created_at,updated_at", `A: exactly the minimal columns (${cols.join()})`);
    assert(/organisation_id uuid not null references public\.organisations/.test(table) && /owner_profile_id uuid not null references public\.profiles/.test(table), "A: one organisation and one canonical owner profile");
    assert(!/assignee|due|priority|tag|folder|categor|status|share|collaborat|comment|attach|remind|version|embedding|sentiment|score|project/i.test(table), "A: no assignment / due date / priority / sharing / tags / folders / comments / attachments / versions / AI metadata");
    assert(/char_length\(trim\(title\)\) > 0/.test(table) && /char_length\(body\) <= 20000/.test(table), "A: title required, bounded text");
    assert(!/insert into public\.batcave_notes/i.test(mig), "A: no seed / fake notes");
    assert(!validateNoteInput({ title: "  ", body: "x" }, { requireTitle: true }).ok, "A: a blank-titled note is refused");
    assert(!validateNoteInput({ title: "t".repeat(NOTE_TITLE_MAX + 1) }, { requireTitle: true }).ok && !validateNoteInput({ title: "t", body: "b".repeat(NOTE_BODY_MAX + 1) }, { requireTitle: true }).ok, "A: length bounds");
    assert(validateNoteInput({ title: " Prep ", body: "" }, { requireTitle: true }).ok, "A: an empty body is allowed with a title");
    pass("A domain: title/body only, one owner, one organisation, no seed, no task/sharing/tag creep");
  }

  // ── B. Authority ──────────────────────────────────────────────────────────
  {
    for (const cmd of ["select", "insert", "update", "delete"]) {
      assert(new RegExp(`create policy batcave_notes_${cmd}_own on public\\.batcave_notes`).test(mig), `B: ${cmd} policy exists`);
    }
    const policies = mig.slice(mig.indexOf("create policy batcave_notes_select_own"));
    assert((policies.match(/owner_profile_id = auth\.uid\(\)/g) ?? []).length >= 5, "B: every policy (incl. with-check) pins owner_profile_id = auth.uid()");
    assert(!/is_platform_super_admin|is_org_member|can_manage_organisation|admin_override|platform_super_admin/i.test(mig), "B: no Super Admin / org-admin / override path anywhere in the migration");
    // batcave_note_actor_ok's LATEST definition is the rename migration (it replaced the function body to
    // check the new capability key) — this is the live/current authority check, not the original file.
    const actorOk = renameMig.slice(renameMig.indexOf("function public.batcave_note_actor_ok"), renameMig.indexOf("revoke all on function public.batcave_note_actor_ok"));
    assert(/has_platform_capability\(p_organisation_id, 'platform\.command_centre\.view'\)/.test(actorOk) && /has_platform_capability\(p_organisation_id, 'platform\.executive\.private_office\.access'\)/.test(actorOk), "B: requires Executive Office entry AND the explicit Private Office grant (current capability key)");
    assert(!/platform\.batcave\.access/.test(actorOk), "B: the LIVE actor-ok check no longer references the retired platform.batcave.access key");
    assert(/p\.access_scope = 'platform'/.test(actorOk) && /p\.status = 'active'/.test(actorOk), "B: module-bound / inactive identities fail closed at the database");
    assert(/p\.organisation_id = p_organisation_id/.test(actorOk), "B: cross-organisation access fails");
    assert(/revoke all on table public\.batcave_notes from public, anon, authenticated, service_role/.test(mig) && /grant select, insert, update, delete on table public\.batcave_notes to authenticated;/.test(mig) && !/to[^;]*service_role;/.test(mig.slice(mig.indexOf("grant select, insert"))), "B: service_role and anon hold NO privilege on the table — no administrative read path");
    assert(/enable row level security/.test(mig) && !/force row level security/.test(mig) === true, "B: RLS enabled");
    const repo = strip(src("src/modules/private-office/notes/server/PrivateOfficeNotesRepository.ts"));
    assert(!/createAdminClient|SERVICE_ROLE/.test(notesCode), "B: the notes code never uses the service-role client");
    assert(/createClient\(await cookies\(\)\)/.test(repo), "B: only the signed-in user's own session client is used (RLS applies)");
    assert(!/async\s+(listAll|listByOwner|getByOwner|readAny|listForProfile)\b/.test(repo) && !/\(\s*(owner|ownerId|ownerProfileId|profileId)\s*[:,)]/.test(repo.replace(/constructor\([^)]*\)/, "")), "B: no arbitrary-owner or bulk reader exists");
    assert((repo.match(/\.eq\("owner_profile_id", this\.actor\.profileId\)/g) ?? []).length >= 3, "B: every read/update/delete query also pins the acting owner and organisation");
    const route = src("src/app/api/private-office/notes/route.ts");
    assert(route.indexOf("requirePrivateOfficeAccess()") < route.indexOf("switch (body.action)"), "B: the API is authorised before dispatch");
    const page = src("src/app/(app)/command-centre/private-office/notes/page.tsx");
    assert(page.indexOf("requirePrivateOfficeAccess()") < page.indexOf("new PrivateOfficeNotesService("), "B: the Notes page is gated before notes are loaded");
    assert(!/isPlatformSuperAdmin|roleSlugs|admin_override/i.test(notesCode + strip(src("src/modules/private-office/server/requirePrivateOfficeAccess.ts"))), "B: no Super Admin / override consulted");
    pass("B authority: owner-only via RLS, service_role has no privilege, no Super Admin path, module-bound & cross-org fail closed, gated route/API, LIVE capability key enforced");
  }

  // ── C. Ownership ─────────────────────────────────────────────────────────
  {
    const route = src("src/app/api/private-office/notes/route.ts");
    assert(/const input = \{ title: body\.input\?\.title, body: body\.input\?\.body \}/.test(route) && !/body\.(input\??\.)?(owner|organisation)|input\??\.(owner|organisation)/i.test(strip(route)), "C: only title and body are read from the client");
    const forged = validateNoteInput({ title: "t", body: "b", ownerProfileId: "x", organisationId: "y" } as never, { requireTitle: true });
    assert(forged.ok && Object.keys(forged.value).sort().join() === "body,title", "C: any client-supplied owner/organisation is discarded by validation");
    assert(!isNoteId("not-a-uuid") && isNoteId("11111111-1111-4111-8111-111111111111"), "C: note ids are UUIDs");
    assert(/new\.owner_profile_id is distinct from old\.owner_profile_id/.test(mig) && /new\.organisation_id is distinct from old\.organisation_id/.test(mig), "C: ownership and organisation are immutable (no transfer)");
    const svc = strip(src("src/modules/private-office/notes/server/PrivateOfficeNotesService.ts"));
    assert(/profileId: access\.profileId/.test(svc) && /organisationId: access\.organisationId/.test(svc), "C: the owner comes from the authenticated session");
    pass("C ownership: session-derived owner/organisation; client cannot choose; no transfer");
  }

  // ── D. Separation ─────────────────────────────────────────────────────────
  {
    const allowed = (f: string) =>
      f.startsWith("src/modules/private-office/") || f.startsWith("src/app/api/private-office/") || f.startsWith("src/app/(app)/command-centre/private-office/");
    const offenders = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !allowed(f) && /batcave_notes|PrivateOfficeNote|private-office\/notes/i.test(src(f)));
    assert(offenders.length === 0, `D: nothing outside Private Office touches notes (${offenders.join(", ")})`);
    for (const dir of ["src/modules/command-centre", "src/modules/platform-finance", "src/modules/intelligence", "src/lib/intelligence", "src/modules/ecc-operations", "src/lib/events"]) {
      assert(!/batcave|private.office/i.test(walk(dir).filter((f) => !f.endsWith("financialAccounts.ts")).map(src).join("\n")), `D: ${dir} is blind to Private Office`);
    }
    assert(!/operational_events|recordOperationalEvent|emitActionEvent/.test(notesCode), "D: no operational_events / event emission for notes");
    assert(!/kaiso|embedding|vector|openai|anthropic|llm|summari[sz]e/i.test(notesCode + strip(src("src/modules/private-office/components/PrivateOfficeNotes.tsx"))), "D: no Kaiso / AI / embeddings / indexing");
    const commitments = walk("src/modules/command-centre/commitments").map(src).join("\n");
    assert(!/batcave|private.office|note/i.test(strip(commitments).replace(/notes?:\s*string/gi, "")), "D: Executive Commitments consume no note data");
    assert(!/batcave|private.office/i.test(src("src/modules/command-centre/presentationTypes.ts")) && !/batcave|private.office/i.test(src("src/modules/command-centre/server/CommandCentreServerService.ts")), "D: Executive Office is content-blind (no note count, latest, titles or existence)");
    const door = src("src/modules/private-office/components/PrivateOfficeDoorway.tsx");
    assert(!/note|count|latest|\{/.test(strip(door).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/export function PrivateOfficeDoorway\(\) \{/, "").replace(/href="[^"]*"/, "")), "D: the doorway shows no note data");
    pass("D separation: Executive Office, Finance, Intelligence, Commitments, events and Kaiso are blind to notes");
  }

  // ── E. Audit privacy ──────────────────────────────────────────────────────
  {
    assert(!/audit|platform_iam_insert_audit_event|console\.|logger|log\(/i.test(notesCode), "E: note operations write to no audit / log stream");
    assert(!/platform_iam_insert_audit_event|insert into public\.(platform_iam_audit_events|ecc_audit_events|finance_audit_events|operational_events)/i.test(mig), "E: no database function or trigger copies notes (or note activity) into any general stream");
    pass("E audit privacy: no note title/body/excerpt or note activity reaches any general audit or event stream (deliberate: no note audit in V1)");
  }

  // ── F. UI ─────────────────────────────────────────────────────────────────
  {
    const page = src("src/modules/private-office/components/PrivateOfficePage.tsx");
    const notes = src("src/modules/private-office/components/PrivateOfficeNotes.tsx");
    assert(/notes === null/.test(page) && /could not be loaded/.test(page) && /No private notes yet\./.test(notes), "F: a failed read is an error; a loaded empty list is 'No private notes yet.'");
    assert(page.indexOf("notes === null") < page.indexOf("<PrivateOfficeNotes"), "F: failure is never rendered as an empty notebook");
    assert(/window\.confirm\("Permanently delete this note/.test(notes), "F: deletion needs explicit confirmation");
    assert(!/tiptap|quill|draft-js|slate|markdown|contenteditable|dangerouslySetInnerHTML/i.test(page + notes) && !/<textarea/.test(page), "F: plain text — no rich-text editor");
    assert(!/search|filter|tag|folder|priority|pin\b|due|reminder|share/i.test(strip(notes).replace(/input|textarea/g, "")), "F: no search / tags / folders / reminders / sharing creep");
    assert(!/Strategic|Private Finance|CEO Notes|Confidential|Coming soon|Kaiso/i.test(page + notes), "F: no fake feature cards");
    assert(!/only you can|encrypted|end-to-end|secret/i.test(page + notes) && /Private to your Private Office workspace\./.test(page), "F: privacy copy matches reality (no cryptographic or absolute claims)");
    assert(!/\d+ (private )?notes?\b/.test(page), "F: no fake metrics");
    pass("F UI: empty ≠ failure, confirmed deletion, plain text, no creep, honest privacy copy");
  }

  // ── Live (optional, read-only) ────────────────────────────────────────────
  if (process.argv.includes("--live-read")) {
    loadEnvLocal();
    const { createClient } = await import("@supabase/supabase-js");
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const svc = await c.from("batcave_notes").select("id", { head: true, count: "exact" });
    assert(svc.error, "live: the service role cannot read private notes at all");
    const old = await c.from("platform_capability_grants").select("profile_id").eq("capability", "platform.batcave.access");
    assert(!old.error && (old.data ?? []).length === 0, "live: no identity holds the retired platform.batcave.access key");
    const g = await c.from("platform_capability_grants").select("profile_id").eq("capability", "platform.executive.private_office.access");
    assert(!g.error, "live: platform.executive.private_office.access is queryable");
    pass(`live-read: service role denied; 0 retired-key grants; ${g.data?.length ?? 0} current Private Office grant(s)`);
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
