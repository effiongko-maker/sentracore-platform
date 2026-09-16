/**
 * Platform Finance verification — single-connection transaction scope.
 *
 * All fixture writes + production RPC calls in a verify run MUST go through the
 * provided `pg` client after BEGIN. The helper always ROLLBACK in `finally`,
 * whether the suite passes, fails, or throws.
 *
 * Requires:
 *   - package `pg`
 *   - env PLATFORM_FINANCE_VERIFY_DATABASE_URL (explicit Postgres URL)
 *
 * Does NOT:
 *   - set session_replication_role
 *   - disable triggers / FKs / RLS
 *   - hard-delete immutable journals/audits
 *   - read macOS Keychain or invent credentials
 */
import type { Client } from "pg";

export type FinanceVerifyClient = Client;

export type WithFinanceVerifyTransactionResult<T> = {
  ok: boolean;
  rolledBack: true;
  value?: T;
  error?: string;
};

export function resolveFinanceVerifyDatabaseUrl(): string | null {
  return process.env.PLATFORM_FINANCE_VERIFY_DATABASE_URL?.trim() || null;
}

/** Broader URL resolution for one-shot migration apply in slice verifies only. */
export function resolveFinanceVerifyDatabaseUrlLoose(): string | null {
  return (
    process.env.PLATFORM_FINANCE_VERIFY_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    null
  );
}

export async function loadPgModule(): Promise<typeof import("pg") | null> {
  try {
    return await import("pg");
  } catch {
    return null;
  }
}

/**
 * BEGIN → run `fn` → always ROLLBACK.
 * Never commits. Never disables integrity controls.
 */
export async function withFinanceVerifyTransaction<T>(
  fn: (client: FinanceVerifyClient) => Promise<T>
): Promise<WithFinanceVerifyTransactionResult<T>> {
  const url = resolveFinanceVerifyDatabaseUrl();
  if (!url) {
    return {
      ok: false,
      rolledBack: true,
      error:
        "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set — DB suite skipped (no Keychain/credential lookup)",
    };
  }

  const pg = await loadPgModule();
  if (!pg) {
    return {
      ok: false,
      rolledBack: true,
      error:
        "package 'pg' is not installed — add as a devDependency to run DB verifies",
    };
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  let began = false;
  try {
    await client.connect();
    await client.query("BEGIN");
    began = true;
    const value = await fn(client);
    return { ok: true, rolledBack: true, value };
  } catch (e) {
    return {
      ok: false,
      rolledBack: true,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (began) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* connection may already be broken; still close */
      }
    }
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

/** Run a statement expected to fail; returns the error message. */
export async function expectSqlFailure(
  client: FinanceVerifyClient,
  sql: string,
  params: unknown[] = []
): Promise<string> {
  const sp = `pf_expect_fail_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    throw new Error("expected SQL failure but statement succeeded");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    } catch {
      /* transaction may already be broken */
    }
    if (message === "expected SQL failure but statement succeeded") throw e;
    return message;
  }
}
