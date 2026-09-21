/**
 * Production-execution safety gates. Pure: takes facts, returns every failed gate. The CLI refuses to open a
 * write transaction unless this returns an empty list.
 */
export const APPROVED_PROJECT_REF = "eiwzdvmrfwwtbpofqxal";

export type GateInput = {
  /** --i-understand-this-writes-production */
  productionFlag: boolean;
  /** --confirm=<batchKey>@<projectRef> */
  confirm: string | undefined;
  expectedProjectRef: string | undefined;
  linkedProjectRef: string | undefined;
  databaseUrl: string | undefined;
  supabaseUrl: string | undefined;
  batchKey: string;
  approvedBatchKey: string | undefined;
  manifestDigest: string;
  approvedDigest: string | undefined;
  sourcesVerified: boolean;
  blockers: number;
};

/** The project ref a Postgres URL points at (pooler user `postgres.<ref>` or host `db.<ref>.supabase.co`), else null. */
export function projectRefFromDatabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const user = decodeURIComponent(u.username);
    const m1 = /^postgres\.([a-z0-9]{20})$/.exec(user);
    if (m1) return m1[1]!;
    const m2 = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
    return m2 ? m2[1]! : null;
  } catch {
    return null;
  }
}

export function projectRefFromSupabaseUrl(url: string | undefined): string | null {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url ?? "");
  return m ? m[1]! : null;
}

export function evaluateProductionGates(g: GateInput): string[] {
  const failures: string[] = [];
  if (!g.productionFlag) failures.push("missing --i-understand-this-writes-production");
  if (g.confirm !== `${g.batchKey}@${APPROVED_PROJECT_REF}`) failures.push(`--confirm must equal ${g.batchKey}@${APPROVED_PROJECT_REF}`);
  if (g.expectedProjectRef !== APPROVED_PROJECT_REF) failures.push(`--project-ref must be ${APPROVED_PROJECT_REF}`);
  if (g.linkedProjectRef !== APPROVED_PROJECT_REF) failures.push(`linked Supabase project (${g.linkedProjectRef ?? "none"}) is not ${APPROVED_PROJECT_REF}`);
  const dbRef = projectRefFromDatabaseUrl(g.databaseUrl);
  if (dbRef !== APPROVED_PROJECT_REF) failures.push(`FM_MIGRATION_DATABASE_URL does not identify project ${APPROVED_PROJECT_REF} (found ${dbRef ?? "unrecognised"})`);
  const apiRef = projectRefFromSupabaseUrl(g.supabaseUrl);
  if (apiRef !== null && apiRef !== APPROVED_PROJECT_REF) failures.push(`NEXT_PUBLIC_SUPABASE_URL points at ${apiRef}`);
  if (!g.approvedBatchKey || g.approvedBatchKey !== g.batchKey) failures.push(`--batch must equal the manifest batch ${g.batchKey}`);
  if (!g.approvedDigest || g.approvedDigest !== g.manifestDigest) failures.push("--manifest-digest must equal the manifest's SHA-256 digest");
  if (!g.sourcesVerified) failures.push("source workbook hashes / deterministic re-derivation not verified");
  if (g.blockers > 0) failures.push(`${g.blockers} blocking schema-forced default(s) unresolved`);
  return failures;
}
