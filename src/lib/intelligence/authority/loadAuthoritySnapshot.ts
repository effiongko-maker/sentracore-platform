import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  collectAuthorityLookups,
  emptyAuthorityIndex,
  type AuthoritativeKind,
  type AuthoritativeRecord,
  type AuthoritySnapshot,
  type ReconcilableEvent,
} from "./reconcileEvents";

const IN_CHUNK = 100;

const TABLES: Record<AuthoritativeKind, { table: string; hasFacility: boolean }> = {
  work: { table: "fm_work", hasFacility: true },
  work_instruction: { table: "fm_work_instructions", hasFacility: true },
  request: { table: "fm_requests", hasFacility: true },
  incident: { table: "fm_incidents", hasFacility: true },
  approval: { table: "fm_approvals", hasFacility: false },
};

export class IntelligenceAuthorityUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IntelligenceAuthorityUnavailableError";
  }
}

function chunk<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    out.push(values.slice(i, i + IN_CHUNK));
  }
  return out;
}

type Row = { id: string; code: string; facility_id?: string | null };

async function selectRows(
  admin: SupabaseClient,
  table: string,
  organisationId: string,
  column: "id" | "code",
  values: string[],
  hasFacility: boolean
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const ids of chunk(values)) {
    const { data, error } = await admin
      .from(table)
      .select(hasFacility ? "id, code, facility_id" : "id, code")
      .eq("organisation_id", organisationId)
      .in(column, ids);
    if (error) {
      throw new IntelligenceAuthorityUnavailableError(
        `Authoritative source ${table} could not be read.`,
        { cause: error }
      );
    }
    rows.push(...((data ?? []) as unknown as Row[]));
  }
  return rows;
}

async function countRows(
  admin: SupabaseClient,
  table: string,
  organisationId: string
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId);
  if (error || count == null) {
    throw new IntelligenceAuthorityUnavailableError(
      `Authoritative source ${table} could not be counted.`,
      { cause: error }
    );
  }
  return count;
}

/**
 * Read the authoritative FM records that the given events refer to, plus the
 * authoritative population counts. Service-role, server-only, organisation
 * scoped on every query. Any failure throws — failure is never zero.
 */
export async function loadAuthoritySnapshot(input: {
  organisationId: string;
  events: ReconcilableEvent[];
  admin?: SupabaseClient;
}): Promise<AuthoritySnapshot> {
  const admin = input.admin ?? createAdminClient();
  const { organisationId } = input;
  const index = emptyAuthorityIndex(organisationId);
  const lookups = collectAuthorityLookups(input.events);

  const facilityRes = await admin
    .from("fm_facilities")
    .select("id, code")
    .eq("organisation_id", organisationId)
    .range(0, 4999);
  if (facilityRes.error) {
    throw new IntelligenceAuthorityUnavailableError(
      "Authoritative source fm_facilities could not be read.",
      { cause: facilityRes.error }
    );
  }
  for (const row of (facilityRes.data ?? []) as Array<{ id: string; code: string }>) {
    index.facilities.set(row.id.toLowerCase(), { id: row.id, code: row.code });
  }

  const kinds = Object.keys(TABLES) as AuthoritativeKind[];
  await Promise.all(
    kinds.map(async (kind) => {
      const { table, hasFacility } = TABLES[kind];
      const [byId, byCode] = await Promise.all([
        selectRows(admin, table, organisationId, "id", [...lookups.uuids[kind]], hasFacility),
        selectRows(admin, table, organisationId, "code", [...lookups.codes[kind]], hasFacility),
      ]);
      for (const row of [...byId, ...byCode]) {
        const record: AuthoritativeRecord = {
          id: row.id,
          code: row.code,
          facilityId: row.facility_id ? row.facility_id.toLowerCase() : null,
        };
        index.records[kind].set(row.id.toLowerCase(), record);
      }
    })
  );

  const assetUuids = [...lookups.assetRefs].filter((v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
  const assetCodes = [...lookups.assetRefs].filter((v) => !assetUuids.includes(v));
  const [assetById, assetByCode] = await Promise.all([
    selectRows(admin, "fm_assets", organisationId, "id", assetUuids, false),
    selectRows(admin, "fm_assets", organisationId, "code", assetCodes, false),
  ]);
  for (const row of [...assetById, ...assetByCode]) {
    index.assets.set(row.id.toLowerCase(), { id: row.id, code: row.code });
    index.assets.set(row.code.toLowerCase(), { id: row.id, code: row.code });
  }

  const [work, workInstructions, requests, incidents, approvals] =
    await Promise.all([
      countRows(admin, TABLES.work.table, organisationId),
      countRows(admin, TABLES.work_instruction.table, organisationId),
      countRows(admin, TABLES.request.table, organisationId),
      countRows(admin, TABLES.incident.table, organisationId),
      countRows(admin, TABLES.approval.table, organisationId),
    ]);

  return {
    index,
    counts: { work, workInstructions, requests, incidents, approvals },
  };
}
