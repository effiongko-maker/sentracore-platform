/**
 * Organisation timezone architecture verification (rollback-safe).
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-organisation-timezone.mts [--live]
 *
 * `--live` adds READ-ONLY schema/PayChex checks plus probes that attempt invalid writes
 * inside DO blocks that always roll back (no persistent change).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  OrganisationTimeZoneError,
  assertIanaTimeZone,
  organisationLocalDate,
  organisationLocalHour,
  requireOrganisationTimeZone,
} from "../src/lib/time/organisationTime";
import { DEFAULT_ECC_CENTRE } from "../src/modules/ecc-operations/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
function throws(fn: () => unknown, ctor: new (...a: never[]) => Error = OrganisationTimeZoneError): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof ctor;
  }
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
function sql(query: string): string {
  const file = join(tmpdir(), `tz-verify-${Date.now()}.sql`);
  writeFileSync(file, query);
  return execFileSync("npx", ["supabase", "db", "query", "--linked", "--file", file], { encoding: "utf8" });
}

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = { userId: "f0000000-0000-4000-8000-0000000000aa", email: "a@example.com", name: "Authenticated Actor" };

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);

  // ── 1. Organisation timezone is authoritative platform context ─────────────
  {
    const session = src("src/lib/auth/session.ts");
    assert(/\.select\("id, name, slug, status, timezone"\)/.test(session), "1: session reads organisations.timezone");
    assert(session.includes("timezone:") && (session.match(/from\("organisations"\)/g) ?? []).length === 1, "1: exactly one organisation query in the session (no extra round trip)");
    assert(src("src/lib/auth/types.ts").includes("timezone?: string | null"), "1: AuthOrganisation carries timezone");
    const route = src("src/app/api/ecc-operations/route.ts");
    assert(route.includes("session.organisation?.timezone ?? null"), "1: ECC takes the timezone from the authenticated session");
    pass("1 organisation timezone is authoritative platform context (one existing session query, no parallel mechanism)");
  }

  // ── 4. Proof case + generality ─────────────────────────────────────────────
  {
    const instant = "2026-09-20T23:30:00Z";
    assert(new Date(instant).toISOString().slice(0, 10) === "2026-09-20", "UTC date is still 2026-09-20");
    assert(organisationLocalDate(instant, "Africa/Lagos") === "2026-09-21", "4: 2026-09-20T23:30:00Z must be 2026-09-21 in Africa/Lagos");
    assert(organisationLocalDate("2026-09-20T22:59:59Z", "Africa/Lagos") === "2026-09-20", "boundary before local midnight");
    assert(organisationLocalDate("2026-09-20T23:00:00Z", "Africa/Lagos") === "2026-09-21", "boundary at local midnight");
    // DST-agnostic: other zones, including DST transitions, come from the IANA database
    assert(organisationLocalDate("2026-09-20T03:00:00Z", "America/Los_Angeles") === "2026-09-19", "other IANA zones work");
    assert(organisationLocalDate("2026-07-01T23:30:00Z", "Europe/London") === "2026-07-02", "DST zone resolves via the IANA database");
    assert(organisationLocalDate("2026-01-01T23:30:00Z", "Europe/London") === "2026-01-01", "same zone without DST");
    assert(organisationLocalHour("2026-09-20T23:30:00Z", "Africa/Lagos") === 0, "local hour at 00:30");
    pass("4 2026-09-20T23:30:00Z is 2026-09-21 in Africa/Lagos (UTC date remains 2026-09-20); DST zones resolve via IANA");
    const helper = src("src/lib/time/organisationTime.ts");
    assert(!/\+\s*1\b|3600|60 \* 60|getTimezoneOffset|toLocaleDateString/.test(helper.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")), "no manual offset arithmetic");
  }

  // ── 6/7. Browser / server-machine timezone cannot establish authority ──────
  {
    const before = process.env.TZ;
    try {
      for (const tz of ["Pacific/Kiritimati", "America/Los_Angeles", "UTC"]) {
        process.env.TZ = tz;
        assert(organisationLocalDate("2026-09-20T23:30:00Z", "Africa/Lagos") === "2026-09-21", `system TZ=${tz} must not change the organisation date`);
        assert(organisationLocalHour("2026-09-20T23:30:00Z", "Africa/Lagos") === 0, `system TZ=${tz} must not change the organisation hour`);
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
    const page = src("src/modules/ecc-operations/components/EccDailyOpsPage.tsx");
    assert(!/todayDate|toISOString\(\)\.slice\(0,\s*10\)|new Date\(\)\.get(FullYear|Date)/.test(page), "6: page derives no date from the browser clock");
    assert(page.includes("EccOperationsService.getOperationalDate()"), "6: default date comes from the server");
    assert(/reportingDate:\s*""/.test(page), "6: the form default is empty until the server answers");
    pass("6 the browser clock/timezone cannot establish the operational date (server-authoritative default)");
    pass("7 the server machine timezone cannot establish the operational date (helper is zone-explicit)");
  }

  // ── 8/9. Explicit failure ─────────────────────────────────────────────────
  {
    for (const bad of [null, undefined, "", "   "]) {
      assert(throws(() => assertIanaTimeZone(bad)), `8: missing timezone (${String(bad)}) must fail explicitly`);
    }
    assert(throws(() => requireOrganisationTimeZone({ timezone: null })) && throws(() => requireOrganisationTimeZone(null)), "8: missing organisation timezone fails");
    for (const bad of ["Mars/Olympus", "Lagos", "UTC+1", "GMT+01:00", "not a zone"]) {
      assert(throws(() => assertIanaTimeZone(bad)), `9: invalid IANA identifier "${bad}" must fail explicitly`);
    }
    assert(throws(() => organisationLocalDate("2026-09-20T00:00:00Z", "Mars/Olympus")), "9: date helper rejects an invalid zone (no UTC fallback)");
    assert(throws(() => organisationLocalDate("garbage", "Africa/Lagos")), "invalid instant is rejected");
    assert(assertIanaTimeZone("Africa/Lagos") === "Africa/Lagos", "valid zone accepted");
    pass("8 missing organisation timezone fails explicitly (no UTC / browser / Lagos fallback)");
    pass("9 invalid IANA timezone fails explicitly");
  }

  // ── 3/5/8b/12. ECC Daily Ops behaviour (repository stubs, no DB) ───────────
  {
    const { EccOperationsServerService } = await import("../src/modules/ecc-operations/server/EccOperationsServerService");
    const { EccOperationsRepository } = await import("../src/modules/ecc-operations/server/EccOperationsRepository");
    const { EccAuditRepository } = await import("../src/modules/ecc-operations/server/EccAuditRepository");
    const R = EccOperationsRepository.prototype as unknown as Record<string, unknown>;
    const original = { ...R };
    const inserted: Array<Record<string, unknown>> = [];
    R.ensureDefaultCentre = async () => ({ ...DEFAULT_ECC_CENTRE });
    R.findDailyOpsByPeriodDate = async () => null;
    R.insertDailyOps = async (r: Record<string, unknown>) => (inserted.push(r), r);
    (EccAuditRepository.prototype as unknown as Record<string, unknown>).record = async (x: unknown) => x;
    const input = (over: Record<string, unknown> = {}) =>
      ({
        period: "morning",
        overallStatus: "operational",
        centreOperations: { status: "normal", noIssuesToReport: true, staffingStatus: "ready", staffingReadiness: "", observations: "", disruptionNotes: "" },
        callOperations: { status: "normal", noIssuesToReport: true, notes: "", additionalMetrics: {} },
        facility: { status: "normal", noIssuesToReport: true, condition: "", power: "", environment: "", issues: "", observations: "" },
        technical: { status: "normal", noIssuesToReport: true, equipment: "", network: "", servers: "", software: "", callTakingSystems: "", incidents: "", observations: "" },
        ...over,
      }) as never;
    const at = (iso: string) => () => new Date(iso);
    try {
      const svc = new EccOperationsServerService(ORG, ACTOR, "Africa/Lagos", at("2026-09-20T23:30:00Z"));
      const rec = await svc.createDailyOps(input());
      assert(rec.reportingDate === "2026-09-21", "3: default reporting date is the organisation-local date (2026-09-21, not UTC 2026-09-20)");
      const today = await svc.getOperationalDate();
      assert(today.date === "2026-09-21" && today.timeZone === "Africa/Lagos", "3: server-authoritative default is exposed to the UI");
      pass("3 ECC Daily Ops default uses the organisation timezone (23:30Z → 2026-09-21 for Africa/Lagos)");

      const historical = await svc.createDailyOps(input({ reportingDate: "2026-01-05", period: "evening" }));
      assert(historical.reportingDate === "2026-01-05", "5: an explicit historical reporting date is honoured");
      pass("5 historical reporting dates remain allowed (only the default changed)");

      const utcOrg = new EccOperationsServerService(ORG, ACTOR, "UTC", at("2026-09-20T23:30:00Z"));
      assert((await utcOrg.createDailyOps(input({ period: "ad_hoc" }))).reportingDate === "2026-09-20", "another organisation timezone yields its own date");

      inserted.length = 0;
      const missing = new EccOperationsServerService(ORG, ACTOR, null, at("2026-09-20T23:30:00Z"));
      assert(await missing.createDailyOps(input()).then(() => false, (e) => e instanceof OrganisationTimeZoneError), "8: default date without an organisation timezone fails explicitly");
      assert(await missing.getOperationalDate().then(() => false, (e) => e instanceof OrganisationTimeZoneError), "8: getOperationalDate fails explicitly");
      assert(inserted.length === 0, "8: nothing is written when the timezone is unknown");
      const invalid = new EccOperationsServerService(ORG, ACTOR, "Mars/Olympus", at("2026-09-20T23:30:00Z"));
      assert(await invalid.createDailyOps(input({ period: "morning" })).then(() => false, (e) => e instanceof OrganisationTimeZoneError), "9: an invalid stored timezone fails explicitly");
      pass("8b unknown/invalid organisation timezone blocks the operational default and writes nothing");
    } finally {
      Object.assign(R, original);
    }
    const people = src("src/modules/ecc-operations/server/EccPeopleRepository.ts");
    assert(/attendance_date: attendanceDate/.test(people) && people.includes("organisationLocalDate(") && !/attendance_date: stamp\.slice/.test(people), "attendance day uses the organisation-local date");
  }

  // ── 10. Command Centre ────────────────────────────────────────────────────
  {
    const files = walk("src/modules/command-centre").concat(walk("src/lib/time"));
    const offenders = files.filter((f) => /Africa\/Lagos/.test(src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
    assert(offenders.length === 0, `10: Command Centre still owns a Lagos assumption: ${offenders.join(", ")}`);
    assert(walk("src").every((f) => !/timeZone:\s*"Africa\/Lagos"/.test(src(f))), "no hard-coded Africa/Lagos timeZone anywhere in src");
    const svc = src("src/modules/command-centre/server/CommandCentreServerService.ts");
    assert(svc.includes("requireOrganisationTimeZone(session.organisation)") && svc.includes("organisationLocalHour(date, timeZone)") && svc.includes("timeZone: organisationTimeZone"), "10: server uses organisation context and ships it to the client");
    assert(src("src/modules/command-centre/components/CommandCentrePage.tsx").includes("formatAsOfDate(snapshot.asOf, snapshot.timeZone)"), "10: client formats with the server-provided organisation timezone");
    assert(/if \(!timeZone\) return "Hello"/.test(svc), "10: cosmetic greeting is neutral, not a guessed zone, without a timezone");
    pass("10 Command Centre no longer owns an independent Africa/Lagos assumption (organisation timezone, neutral when absent)");
  }

  // ── 11/12/14/15. Isolation, query count, single-centre, no Sheets ──────────
  {
    const eccOrgReads = walk("src/modules/ecc-operations").concat(walk("src/services/ecc-operations")).filter((f) => /from\("organisations"\)/.test(src(f)));
    assert(eccOrgReads.length === 0, `12: ECC must not query organisations for timezone: ${eccOrgReads.join(", ")}`);
    const cc = walk("src/modules/command-centre").filter((f) => /from\("organisations"\)/.test(src(f)));
    assert(cc.length === 0, "12: Command Centre must not query organisations for timezone");
    pass("12 no extra organisation/timezone query added per ECC request or Command Centre load");
    const session = src("src/lib/auth/session.ts");
    assert(session.includes('.eq("id", profile.organisationId)'), "11: organisation context is bound to the caller's own organisation");
    pass("11 organisation isolation intact (timezone rides on the caller's own organisation row)");
    assert(DEFAULT_ECC_CENTRE.id === "ECC-001" && !/CentreSelect|switchCentre/.test(walk("src/modules/ecc-operations/components").map(src).join("\n")), "14: ECC remains single-centre");
    pass("14 ECC remains single-centre V1");
    const touched = ["src/lib/time/organisationTime.ts", "src/modules/ecc-operations/server/EccOperationsServerService.ts", "src/modules/ecc-operations/server/EccPeopleRepository.ts", "supabase/migrations/20260920150000_organisation_timezone.sql"];
    assert(touched.every((f) => !/appsScript|apps-script|spreadsheet|googleapis/i.test(src(f))), "15: no Apps Script / Sheets dependency");
    pass("15 no Apps Script / Sheets dependency introduced");
    const migration = src("supabase/migrations/20260920150000_organisation_timezone.sql");
    assert(/set not null/.test(migration) && !/default\s+'/i.test(migration.replace(/comment[\s\S]*$/, "")) , "migration: NOT NULL with no column default");
    assert(/slug = 'paychex'/.test(migration) && /pg_timezone_names/.test(migration), "migration: PayChex-only backfill; DB-catalogue validation");
    pass("migration: NOT NULL, no default, PayChex-only backfill, validated against the IANA catalogue in the database");
  }

  // ── 2. Live: PayChex + rollback-safe write probes ──────────────────────────
  if (process.argv.includes("--live")) {
    loadEnvLocal();
    const { createAdminClient } = await import("../src/utils/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin.from("organisations").select("slug, timezone");
    const rows = (data ?? []) as Array<{ slug: string; timezone: string }>;
    const paychex = rows.find((r) => r.slug === "paychex");
    assert(paychex?.timezone === "Africa/Lagos", "2: PayChex must resolve to Africa/Lagos");
    assert(rows.every((r) => typeof r.timezone === "string" && r.timezone.length > 0), "every organisation has a timezone");
    pass("2 PayChex resolves to Africa/Lagos (live read-only)");
    const probe = sql(`
      do $$
      begin
        begin
          update public.organisations set timezone = 'Mars/Olympus' where slug = 'paychex';
          raise exception 'INVALID TIMEZONE WAS ACCEPTED';
        exception when sqlstate '22023' then null;
        end;
        begin
          insert into public.organisations (name, slug) values ('tz probe', 'tz-probe-rollback');
          raise exception 'MISSING TIMEZONE WAS ACCEPTED';
        exception when sqlstate '22023' or sqlstate '23502' then null;
        end;
      end $$;`);
    assert(!/INVALID TIMEZONE WAS ACCEPTED|MISSING TIMEZONE WAS ACCEPTED/.test(probe), "the database must reject invalid and missing timezones");
    const after = await admin.from("organisations").select("slug, timezone");
    assert((after.data as Array<{ slug: string; timezone: string }>).find((r) => r.slug === "paychex")?.timezone === "Africa/Lagos" && !(after.data as Array<{ slug: string }>).some((r) => r.slug === "tz-probe-rollback"), "probes left no persistent change");
    pass("9b database rejects invalid and missing timezones (rollback-only probes, no persistent change)");
  }

  console.log(out.join("\n"));
  console.log("VERIFY_ORGANISATION_TIMEZONE: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? (process.env.TZ_DEBUG ? error.stack : error.message) : error);
  process.exit(1);
});
