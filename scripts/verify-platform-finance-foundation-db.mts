/**
 * Platform Finance Phase 1 — thorough DB integration smoke.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-foundation-db.mts
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional (authenticated RLS client):
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Skips cleanly when Supabase env is missing.
 * Uses service role for fixture setup + posting RPC checks.
 * Uses an existing profile as actor (does not invent auth users).
 * Tags disposable rows with reference prefix PF1SMOKE- and cleans up best-effort.
 * Never deletes seeded companies or structural COA accounts 1000–5000.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";

const RUN_ID = `PF1SMOKE-${Date.now()}`;
const EXPECTED_COMPANY_CODES = [
  "PAYCHEX",
  "FORNIDO",
  "TRIVNET",
  "DIAMOND_HEIRS",
  "INOVATIVA",
  "ICEPYRAMID",
  "FAMILY_DEPOT",
  "KAFAKUWO",
  "LECOLLECTIF",
  "NOUVELTECH",
  "REIDACCESS",
  "TELEMIX",
] as const;

const STRUCTURAL_COA = ["1000", "2000", "3000", "4000", "5000"] as const;

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";

type CheckResult = {
  name: string;
  status: CheckStatus;
  detail?: string;
};

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

function hasEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function errMsg(error: { message?: string } | null | undefined): string {
  return error?.message ?? "unknown error";
}

function isMissingRelation(message: string): boolean {
  return /could not find the (table|function|view)|schema cache|does not exist/i.test(
    message
  );
}

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * App-layer company/capability gate mirrored from requirePlatformFinanceAccess
 * (session-less): capability grant required; company access required when companyId set.
 * SA does not auto-bypass in the real helper either.
 */
async function appLayerAccessCheck(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    profileId: string;
    capability: string;
    companyId?: string;
  }
): Promise<{ ok: boolean; reason?: string }> {
  const { data: capRow, error: capError } = await admin
    .from("finance_capability_grants")
    .select("id")
    .eq("organisation_id", input.organisationId)
    .eq("profile_id", input.profileId)
    .eq("capability", input.capability)
    .maybeSingle();
  if (capError) return { ok: false, reason: capError.message };
  if (!capRow) return { ok: false, reason: `Missing capability ${input.capability}` };

  if (input.companyId) {
    const { data: accessRow, error: accessError } = await admin
      .from("finance_company_access")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("profile_id", input.profileId)
      .maybeSingle();
    if (accessError) return { ok: false, reason: accessError.message };
    if (!accessRow) {
      return { ok: false, reason: "No finance company access" };
    }

    const { data: company, error: companyError } = await admin
      .from("finance_companies")
      .select("id, organisation_id")
      .eq("id", input.companyId)
      .maybeSingle();
    if (companyError) return { ok: false, reason: companyError.message };
    if (!company || company.organisation_id !== input.organisationId) {
      return { ok: false, reason: "Company not in organisation" };
    }
  }

  return { ok: true };
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  const push = (name: string, status: CheckStatus, detail?: string) => {
    results.push({ name, status, detail });
    const suffix = detail ? ` — ${detail}` : "";
    console.log(`${status} ${name}${suffix}`);
  };

  if (!hasEnv()) {
    console.log(
      "SKIP verify-platform-finance-foundation-db (no SUPABASE env)"
    );
    process.exit(0);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host = new URL(url).hostname;
  const isLocal = /localhost|127\.0\.0\.1/.test(host);
  console.log(
    `verify-platform-finance-foundation-db target host=${host} local=${isLocal ? "yes" : "no"} run=${RUN_ID}`
  );

  const admin = adminClient();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  // Disposable IDs for cleanup
  const created = {
    capabilityGrantIds: [] as string[],
    companyAccessIds: [] as string[],
    periodIds: [] as string[],
    transactionIds: [] as string[],
    journalEntryIds: [] as string[],
    auditObjectIds: [] as string[],
    tempInactiveAccountId: null as string | null,
    tempAccountWasActive: true,
  };

  let orgId = "";
  let profileId = "";
  let companyAId = "";
  let companyBId = "";
  let cashId = "";
  let expenseId = "";
  let openPeriodId = "";
  let closedPeriodId = "";
  let postedTxId = "";
  let postedJournalId = "";

  const cleanup = async () => {
    console.log("--- cleanup ---");
    // Restore structural account if we inactivated it
    if (created.tempInactiveAccountId && created.tempAccountWasActive) {
      const { error } = await admin
        .from("finance_accounts")
        .update({ status: "active" })
        .eq("id", created.tempInactiveAccountId);
      console.log(
        error
          ? `  restore account status: FAIL ${error.message}`
          : "  restore account status: ok"
      );
    }

    // Posted journals/lines/audits are intentionally immutable — attempt deletes and report leftovers.
    for (const txId of created.transactionIds) {
      // Clear FK if possible (posted FT may refuse depending on constraints)
      await admin
        .from("finance_transactions")
        .update({
          journal_entry_id: null,
          status: "draft",
          posted_at: null,
          posted_by_profile_id: null,
        })
        .eq("id", txId)
        .eq("reference", `${RUN_ID}-BALANCED`);
    }

    for (const journalId of created.journalEntryIds) {
      const { error: lineErr } = await admin
        .from("finance_journal_lines")
        .delete()
        .eq("journal_entry_id", journalId);
      const { error: jeErr } = await admin
        .from("finance_journal_entries")
        .delete()
        .eq("id", journalId);
      if (lineErr || jeErr) {
        console.log(
          `  journal ${journalId}: immutable leftover (${errMsg(lineErr || jeErr)})`
        );
      } else {
        console.log(`  journal ${journalId}: deleted`);
      }
    }

    for (const txId of created.transactionIds) {
      const { error } = await admin
        .from("finance_transactions")
        .delete()
        .eq("id", txId);
      console.log(
        error
          ? `  transaction ${txId}: leftover (${error.message})`
          : `  transaction ${txId}: deleted`
      );
    }

    for (const objectId of created.auditObjectIds) {
      const { error } = await admin
        .from("finance_audit_events")
        .delete()
        .eq("object_id", objectId)
        .like("action", "finance.%");
      console.log(
        error
          ? `  audit object ${objectId}: leftover (${error.message}) — append-only by design`
          : `  audit object ${objectId}: deleted`
      );
    }

    for (const periodId of created.periodIds) {
      const { error } = await admin
        .from("finance_periods")
        .delete()
        .eq("id", periodId);
      if (error) {
        throw new Error(
          `period ${periodId} delete rejected (refusing to swallow): ${error.message}`
        );
      }
      console.log(`  period ${periodId}: deleted`);
    }

    for (const id of created.capabilityGrantIds) {
      const { error } = await admin
        .from("finance_capability_grants")
        .delete()
        .eq("id", id);
      console.log(
        error
          ? `  capability grant ${id}: leftover (${error.message})`
          : `  capability grant ${id}: deleted`
      );
    }

    for (const id of created.companyAccessIds) {
      const { error } = await admin
        .from("finance_company_access")
        .delete()
        .eq("id", id);
      console.log(
        error
          ? `  company access ${id}: leftover (${error.message})`
          : `  company access ${id}: deleted`
      );
    }

    // Sweep any remaining rows tagged with this run reference prefix
    const { data: leftoverTx } = await admin
      .from("finance_transactions")
      .select("id, reference, status")
      .like("reference", `${RUN_ID}%`);
    if (leftoverTx?.length) {
      console.log(
        `  leftover transactions: ${leftoverTx
          .map((t) => `${t.reference}/${t.status}`)
          .join(", ")}`
      );
    }

    console.log(
      "  seeded companies and structural COA 1000-5000 were not deleted"
    );
  };

  try {
    // --- Schema presence ---
    const requiredTables = [
      "finance_companies",
      "finance_company_access",
      "finance_capability_grants",
      "finance_accounts",
      "finance_periods",
      "finance_transactions",
      "finance_journal_entries",
      "finance_journal_lines",
      "finance_audit_events",
    ] as const;

    let schemaReady = true;
    for (const table of requiredTables) {
      const { error } = await admin.from(table).select("id").limit(1);
      if (error) {
        schemaReady = false;
        push(
          `schema.table.${table}`,
          isMissingRelation(error.message) ? "FAIL" : "FAIL",
          error.message
        );
      } else {
        push(`schema.table.${table}`, "PASS");
      }
    }

    for (const view of [
      "finance_general_ledger_v",
      "finance_trial_balance_v",
    ] as const) {
      const { error } = await admin.from(view).select("*").limit(1);
      if (error) {
        schemaReady = false;
        push(`schema.view.${view}`, "FAIL", error.message);
      } else {
        push(`schema.view.${view}`, "PASS");
      }
    }

    {
      const { error } = await admin.rpc("finance_post_transaction", {
        p_transaction_id: "00000000-0000-0000-0000-000000000000",
        p_actor_profile_id: "00000000-0000-0000-0000-000000000000",
        p_lines: [],
      });
      const msg = errMsg(error);
      if (isMissingRelation(msg)) {
        schemaReady = false;
        push("schema.rpc.finance_post_transaction", "FAIL", msg);
      } else {
        push(
          "schema.rpc.finance_post_transaction",
          "PASS",
          `reachable (${msg.slice(0, 80)})`
        );
      }
    }

    {
      const { error } = await admin.rpc("finance_close_period", {
        p_period_id: "00000000-0000-0000-0000-000000000000",
        p_actor_profile_id: "00000000-0000-0000-0000-000000000000",
      });
      const msg = errMsg(error);
      if (isMissingRelation(msg)) {
        schemaReady = false;
        push("schema.rpc.finance_close_period", "FAIL", msg);
      } else {
        push(
          "schema.rpc.finance_close_period",
          "PASS",
          `reachable (${msg.slice(0, 80)})`
        );
      }
    }

    {
      const { error } = await admin.rpc("finance_reopen_period", {
        p_period_id: "00000000-0000-0000-0000-000000000000",
      });
      const msg = errMsg(error);
      if (isMissingRelation(msg)) {
        push(
          "schema.rpc.finance_reopen_period_absent",
          "PASS",
          "no reopen RPC (expected)"
        );
      } else {
        push(
          "schema.rpc.finance_reopen_period_absent",
          "FAIL",
          `reopen RPC appears present: ${msg}`
        );
      }
    }

    if (!schemaReady) {
      push(
        "integration",
        "SKIPPED",
        "Finance foundation schema/RPCs not present on target DB — apply migrations 20260914140000 / 20260914140100 first"
      );
      const failed = results.filter((r) => r.status === "FAIL").length;
      console.log(
        `\nSUMMARY fail=${failed} pass=${results.filter((r) => r.status === "PASS").length} skipped=${results.filter((r) => r.status === "SKIPPED").length}`
      );
      process.exit(failed > 0 ? 1 : 0);
    }

    // --- Org + companies ---
    const { data: org, error: orgError } = await admin
      .from("organisations")
      .select("id, slug")
      .eq("slug", "paychex")
      .maybeSingle();
    assert(!orgError && org, `paychex org: ${errMsg(orgError)}`);
    orgId = org!.id;

    const { data: companies, error: companiesError } = await admin
      .from("finance_companies")
      .select("id, code, name, organisation_id")
      .eq("organisation_id", orgId)
      .order("code");
    assert(!companiesError, `companies: ${errMsg(companiesError)}`);
    const codes = (companies ?? []).map((c) => c.code);
    const uniqueCodes = new Set(codes);
    assert(
      codes.length === 12 && uniqueCodes.size === 12,
      `expected 12 unique companies, got ${codes.length} (unique ${uniqueCodes.size}): ${codes.join(",")}`
    );
    for (const code of EXPECTED_COMPANY_CODES) {
      assert(uniqueCodes.has(code), `missing company code ${code}`);
    }
    push("seed.companies", "PASS", "12 unique companies under paychex");

    const companyA = companies!.find((c) => c.code === "PAYCHEX");
    const companyB = companies!.find((c) => c.code === "FORNIDO");
    assert(companyA && companyB, "PAYCHEX and FORNIDO required");
    companyAId = companyA!.id;
    companyBId = companyB!.id;

    // --- Actor profile ---
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, organisation_id")
      .eq("organisation_id", orgId)
      .limit(1)
      .maybeSingle();
    assert(!profileError && profile, `profile: ${errMsg(profileError)}`);
    profileId = profile!.id;
    push("fixture.actor_profile", "PASS", "using existing org profile");

    // --- COA ---
    const { data: accounts, error: accountsError } = await admin
      .from("finance_accounts")
      .select("id, code, name, status, organisation_id")
      .eq("organisation_id", orgId)
      .in("code", [...STRUCTURAL_COA]);
    assert(!accountsError, `accounts: ${errMsg(accountsError)}`);
    assert(
      (accounts ?? []).length === STRUCTURAL_COA.length,
      `structural COA incomplete: ${(accounts ?? []).map((a) => a.code).join(",")}`
    );
    for (const a of accounts!) {
      assert(a.status === "active", `account ${a.code} should be active`);
    }
    cashId = accounts!.find((a) => a.code === "1000")!.id;
    expenseId = accounts!.find((a) => a.code === "5000")!.id;
    push("seed.coa", "PASS", "structural accounts 1000-5000 active");

    // Duplicate account prevention
    {
      const { error } = await admin.from("finance_accounts").insert({
        organisation_id: orgId,
        code: "1000",
        name: "Cash Duplicate",
        account_type: "asset",
        status: "active",
      });
      assert(error, "duplicate account code should fail");
      push("coa.duplicate_rejected", "PASS", errMsg(error).slice(0, 100));
    }

    // --- Grants: capability + company A only ---
    const capsNeeded = [
      PLATFORM_FINANCE_CAPABILITIES.view,
      PLATFORM_FINANCE_CAPABILITIES.post,
      PLATFORM_FINANCE_CAPABILITIES.create_transaction,
      PLATFORM_FINANCE_CAPABILITIES.manage_periods,
      PLATFORM_FINANCE_CAPABILITIES.manage_coa,
    ];
    for (const capability of capsNeeded) {
      const { data, error } = await admin
        .from("finance_capability_grants")
        .upsert(
          {
            organisation_id: orgId,
            profile_id: profileId,
            capability,
          },
          { onConflict: "profile_id,organisation_id,capability" }
        )
        .select("id")
        .single();
      assert(!error && data, `grant ${capability}: ${errMsg(error)}`);
      created.capabilityGrantIds.push(data!.id);
    }

    const { data: accessA, error: accessAError } = await admin
      .from("finance_company_access")
      .upsert(
        {
          organisation_id: orgId,
          profile_id: profileId,
          company_id: companyAId,
        },
        { onConflict: "profile_id,company_id" }
      )
      .select("id")
      .single();
    assert(!accessAError && accessA, `access A: ${errMsg(accessAError)}`);
    created.companyAccessIds.push(accessA!.id);

    // Ensure no access to B for this profile (delete if present from prior runs)
    await admin
      .from("finance_company_access")
      .delete()
      .eq("profile_id", profileId)
      .eq("company_id", companyBId);

    push("access.grants", "PASS", "capability + company A only");

    {
      const allowed = await appLayerAccessCheck(admin, {
        organisationId: orgId,
        profileId,
        capability: PLATFORM_FINANCE_CAPABILITIES.post,
        companyId: companyAId,
      });
      assert(allowed.ok, `app layer A should allow: ${allowed.reason}`);

      const deniedB = await appLayerAccessCheck(admin, {
        organisationId: orgId,
        profileId,
        capability: PLATFORM_FINANCE_CAPABILITIES.post,
        companyId: companyBId,
      });
      assert(!deniedB.ok, "app layer B should deny without company access");

      // Drop post capability to prove company-access-alone is insufficient, then restore.
      await admin
        .from("finance_capability_grants")
        .delete()
        .eq("profile_id", profileId)
        .eq("organisation_id", orgId)
        .eq("capability", PLATFORM_FINANCE_CAPABILITIES.post);
      const { data: remainingCaps } = await admin
        .from("finance_capability_grants")
        .select("id")
        .eq("profile_id", profileId)
        .eq("organisation_id", orgId);
      const remainingIds = new Set((remainingCaps ?? []).map((r) => r.id));
      created.capabilityGrantIds = created.capabilityGrantIds.filter((id) =>
        remainingIds.has(id)
      );
      const deniedCap = await appLayerAccessCheck(admin, {
        organisationId: orgId,
        profileId,
        capability: PLATFORM_FINANCE_CAPABILITIES.post,
        companyId: companyAId,
      });
      assert(!deniedCap.ok, "app layer should deny without capability");
      const { data: restored, error: restoreErr } = await admin
        .from("finance_capability_grants")
        .insert({
          organisation_id: orgId,
          profile_id: profileId,
          capability: PLATFORM_FINANCE_CAPABILITIES.post,
        })
        .select("id")
        .single();
      assert(!restoreErr && restored, `restore post cap: ${errMsg(restoreErr)}`);
      created.capabilityGrantIds.push(restored!.id);
      push(
        "access.app_layer_cross_company",
        "PASS",
        "A allowed; B denied; missing capability denied"
      );
    }

    if (anonKey) {
      push(
        "access.rls_authenticated_client",
        "SKIPPED",
        "anon key present but JWT user session bootstrap not implemented in this smoke (helpers use auth.uid())"
      );
    } else {
      push(
        "access.rls_authenticated_client",
        "SKIPPED",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY missing — RLS policies not exercised via authenticated client; app-layer + service-role trigger checks cover posting/immutability"
      );
    }

    // --- Periods (idempotent: reuse existing smoke months; never silent-delete) ---
    const openYear = 2099;
    const openMonth = 1;
    const closedYear = 2098;
    const closedMonth = 12;

    {
      const { data: existingOpen, error: existingOpenErr } = await admin
        .from("finance_periods")
        .select("id, status")
        .eq("company_id", companyAId)
        .eq("year", openYear)
        .eq("month", openMonth)
        .maybeSingle();
      assert(!existingOpenErr, `open period lookup: ${errMsg(existingOpenErr)}`);

      if (existingOpen) {
        assert(
          existingOpen.status === "open",
          `open period ${openYear}-${openMonth} exists but status=${existingOpen.status}; reopen is not allowed`
        );
        openPeriodId = existingOpen.id;
      } else {
        const { data: openPeriod, error: openPeriodError } = await admin
          .from("finance_periods")
          .insert({
            organisation_id: orgId,
            company_id: companyAId,
            year: openYear,
            month: openMonth,
            start_date: `${openYear}-01-01`,
            end_date: `${openYear}-01-31`,
            status: "open",
          })
          .select("id")
          .single();
        assert(
          !openPeriodError && openPeriod,
          `open period: ${errMsg(openPeriodError)}`
        );
        openPeriodId = openPeriod!.id;
        created.periodIds.push(openPeriodId);
      }
    }

    {
      const { data: existingClosed, error: existingClosedErr } = await admin
        .from("finance_periods")
        .select("id, status")
        .eq("company_id", companyAId)
        .eq("year", closedYear)
        .eq("month", closedMonth)
        .maybeSingle();
      assert(
        !existingClosedErr,
        `closed period lookup: ${errMsg(existingClosedErr)}`
      );

      if (existingClosed) {
        closedPeriodId = existingClosed.id;
        if (existingClosed.status !== "closed") {
          const { data: closedRpc, error: closeErr } = await admin.rpc(
            "finance_close_period",
            {
              p_period_id: closedPeriodId,
              p_actor_profile_id: profileId,
              p_reason: `${RUN_ID} close`,
            }
          );
          assert(!closeErr && closedRpc, `close period: ${errMsg(closeErr)}`);
          created.auditObjectIds.push(closedPeriodId);
        }
      } else {
        const { data: closedPeriod, error: closedPeriodError } = await admin
          .from("finance_periods")
          .insert({
            organisation_id: orgId,
            company_id: companyAId,
            year: closedYear,
            month: closedMonth,
            start_date: `${closedYear}-12-01`,
            end_date: `${closedYear}-12-31`,
            status: "open",
          })
          .select("id")
          .single();
        assert(
          !closedPeriodError && closedPeriod,
          `closed period seed: ${errMsg(closedPeriodError)}`
        );
        closedPeriodId = closedPeriod!.id;
        created.periodIds.push(closedPeriodId);

        const { data: closedRpc, error: closeErr } = await admin.rpc(
          "finance_close_period",
          {
            p_period_id: closedPeriodId,
            p_actor_profile_id: profileId,
            p_reason: `${RUN_ID} close`,
          }
        );
        assert(!closeErr && closedRpc, `close period: ${errMsg(closeErr)}`);
        created.auditObjectIds.push(closedPeriodId);
      }
    }

    // Uniqueness
    {
      const { error } = await admin.from("finance_periods").insert({
        organisation_id: orgId,
        company_id: companyAId,
        year: openYear,
        month: openMonth,
        start_date: `${openYear}-01-01`,
        end_date: `${openYear}-01-31`,
        status: "open",
      });
      assert(error, "duplicate period should fail");
      push("periods.unique", "PASS");
    }

    // Closed immutability / no reopen
    {
      const { error } = await admin
        .from("finance_periods")
        .update({ status: "open", closed_at: null, closed_by_profile_id: null })
        .eq("id", closedPeriodId);
      assert(error, "reopen via update should fail");
      assert(
        /reopen|immutable/i.test(error!.message),
        `unexpected reopen error: ${error!.message}`
      );
      push("periods.no_reopen", "PASS", error!.message.slice(0, 100));
    }

    // --- Happy path post ---
    const { data: balancedTx, error: balancedTxError } = await admin
      .from("finance_transactions")
      .insert({
        organisation_id: orgId,
        company_id: companyAId,
        reference: `${RUN_ID}-BALANCED`,
        transaction_date: `${openYear}-01-15`,
        transaction_type: "foundation",
        description: `${RUN_ID} balanced posting`,
        amount: 100,
        currency: "NGN",
        status: "draft",
        created_by_profile_id: profileId,
        metadata: { smoke: RUN_ID },
      })
      .select("id")
      .single();
    assert(!balancedTxError && balancedTx, `draft FT: ${errMsg(balancedTxError)}`);
    postedTxId = balancedTx!.id;
    created.transactionIds.push(postedTxId);
    created.auditObjectIds.push(postedTxId);

    const balancedLines = [
      { account_id: expenseId, debit: 100, credit: 0, description: "expense" },
      { account_id: cashId, debit: 0, credit: 100, description: "cash" },
    ];

    const { data: journalId, error: postError } = await admin.rpc(
      "finance_post_transaction",
      {
        p_transaction_id: postedTxId,
        p_actor_profile_id: profileId,
        p_lines: balancedLines,
        p_period_id: openPeriodId,
        p_reason: `${RUN_ID} post`,
      }
    );
    assert(!postError && journalId, `post: ${errMsg(postError)}`);
    postedJournalId = String(journalId);
    created.journalEntryIds.push(postedJournalId);

    const { data: postedFt } = await admin
      .from("finance_transactions")
      .select("status, journal_entry_id, posted_by_profile_id")
      .eq("id", postedTxId)
      .single();
    assert(postedFt?.status === "posted", "FT should be posted");
    assert(
      postedFt?.journal_entry_id === postedJournalId,
      "FT journal link mismatch"
    );
    assert(
      postedFt?.posted_by_profile_id === profileId,
      "posted_by must be profile id"
    );

    const { data: lines } = await admin
      .from("finance_journal_lines")
      .select("debit, credit, line_no, account_id")
      .eq("journal_entry_id", postedJournalId)
      .order("line_no");
    assert(lines?.length === 2, `expected 2 lines, got ${lines?.length}`);
    const sumDebit = (lines ?? []).reduce((s, l) => s + Number(l.debit), 0);
    const sumCredit = (lines ?? []).reduce((s, l) => s + Number(l.credit), 0);
    assert(sumDebit === 100 && sumCredit === 100, "journal not balanced");

    const { data: audit } = await admin
      .from("finance_audit_events")
      .select("action, actor_profile_id, object_id, details")
      .eq("object_id", postedTxId)
      .eq("action", "finance.transaction.posted")
      .maybeSingle();
    assert(audit, "posting audit missing");
    assert(audit!.actor_profile_id === profileId, "audit actor must be profile id");
    push(
      "posting.happy_path",
      "PASS",
      `journal=${postedJournalId} balanced debit=credit=100`
    );

    // GL / TB
    {
      const { data: gl, error: glError } = await admin
        .from("finance_general_ledger_v")
        .select("journal_entry_id, debit, credit")
        .eq("journal_entry_id", postedJournalId);
      assert(!glError, `GL: ${errMsg(glError)}`);
      assert((gl ?? []).length === 2, "GL should show 2 lines");

      const { data: tb, error: tbError } = await admin
        .from("finance_trial_balance_v")
        .select("total_debit, total_credit, account_code")
        .eq("period_id", openPeriodId)
        .eq("company_id", companyAId);
      assert(!tbError, `TB: ${errMsg(tbError)}`);
      const tbDebit = (tb ?? []).reduce((s, r) => s + Number(r.total_debit), 0);
      const tbCredit = (tb ?? []).reduce(
        (s, r) => s + Number(r.total_credit),
        0
      );
      assert(tbDebit === tbCredit, `TB not balanced ${tbDebit} vs ${tbCredit}`);
      push("views.gl_tb", "PASS", `TB debit=${tbDebit} credit=${tbCredit}`);
    }

    // --- Unbalanced post: no partial state ---
    {
      const { data: badTx, error: badTxError } = await admin
        .from("finance_transactions")
        .insert({
          organisation_id: orgId,
          company_id: companyAId,
          reference: `${RUN_ID}-UNBAL`,
          transaction_date: `${openYear}-01-16`,
          transaction_type: "foundation",
          description: `${RUN_ID} unbalanced`,
          amount: 50,
          currency: "NGN",
          status: "draft",
          created_by_profile_id: profileId,
          metadata: { smoke: RUN_ID },
        })
        .select("id")
        .single();
      assert(!badTxError && badTx, errMsg(badTxError));
      created.transactionIds.push(badTx!.id);

      const { error } = await admin.rpc("finance_post_transaction", {
        p_transaction_id: badTx!.id,
        p_actor_profile_id: profileId,
        p_lines: [
          { account_id: expenseId, debit: 50, credit: 0 },
          { account_id: cashId, debit: 0, credit: 40 },
        ],
        p_period_id: openPeriodId,
      });
      assert(error && /unbalanced/i.test(error.message), errMsg(error));

      const { data: stillDraft } = await admin
        .from("finance_transactions")
        .select("status, journal_entry_id")
        .eq("id", badTx!.id)
        .single();
      assert(stillDraft?.status === "draft", "FT must remain draft");
      assert(!stillDraft?.journal_entry_id, "no journal link on failed post");

      const { count: jeCount } = await admin
        .from("finance_journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("transaction_id", badTx!.id);
      assert((jeCount ?? 0) === 0, "no journal header after unbalanced");

      const { count: auditCount } = await admin
        .from("finance_audit_events")
        .select("id", { count: "exact", head: true })
        .eq("object_id", badTx!.id)
        .eq("action", "finance.transaction.posted");
      assert((auditCount ?? 0) === 0, "no success audit on failed post");
      push("atomicity.unbalanced", "PASS");
    }

    // --- Closed period ---
    {
      const { data: closedTx, error: closedTxError } = await admin
        .from("finance_transactions")
        .insert({
          organisation_id: orgId,
          company_id: companyAId,
          reference: `${RUN_ID}-CLOSED`,
          transaction_date: `${closedYear}-12-10`,
          transaction_type: "foundation",
          description: `${RUN_ID} closed period`,
          amount: 10,
          currency: "NGN",
          status: "draft",
          created_by_profile_id: profileId,
          metadata: { smoke: RUN_ID },
        })
        .select("id")
        .single();
      assert(!closedTxError && closedTx, errMsg(closedTxError));
      created.transactionIds.push(closedTx!.id);

      const { error } = await admin.rpc("finance_post_transaction", {
        p_transaction_id: closedTx!.id,
        p_actor_profile_id: profileId,
        p_lines: balancedLines.map((l) => ({
          ...l,
          debit: l.debit ? 10 : 0,
          credit: l.credit ? 10 : 0,
        })),
        p_period_id: closedPeriodId,
      });
      assert(error && /closed/i.test(error.message), errMsg(error));

      const { data: stillDraft } = await admin
        .from("finance_transactions")
        .select("status, journal_entry_id")
        .eq("id", closedTx!.id)
        .single();
      assert(
        stillDraft?.status === "draft" && !stillDraft.journal_entry_id,
        "closed-period FT must remain draft without journal"
      );
      push("atomicity.closed_period", "PASS");
    }

    // --- Inactive account ---
    {
      created.tempInactiveAccountId = expenseId;
      created.tempAccountWasActive = true;
      const { error: inactErr } = await admin
        .from("finance_accounts")
        .update({ status: "inactive" })
        .eq("id", expenseId);
      assert(!inactErr, errMsg(inactErr));

      const { data: inactTx, error: inactTxError } = await admin
        .from("finance_transactions")
        .insert({
          organisation_id: orgId,
          company_id: companyAId,
          reference: `${RUN_ID}-INACTIVE`,
          transaction_date: `${openYear}-01-17`,
          transaction_type: "foundation",
          description: `${RUN_ID} inactive account`,
          amount: 10,
          currency: "NGN",
          status: "draft",
          created_by_profile_id: profileId,
          metadata: { smoke: RUN_ID },
        })
        .select("id")
        .single();
      assert(!inactTxError && inactTx, errMsg(inactTxError));
      created.transactionIds.push(inactTx!.id);

      const { error } = await admin.rpc("finance_post_transaction", {
        p_transaction_id: inactTx!.id,
        p_actor_profile_id: profileId,
        p_lines: [
          { account_id: expenseId, debit: 10, credit: 0 },
          { account_id: cashId, debit: 0, credit: 10 },
        ],
        p_period_id: openPeriodId,
      });
      assert(error && /not active/i.test(error.message), errMsg(error));

      const { error: reactivateErr } = await admin
        .from("finance_accounts")
        .update({ status: "active" })
        .eq("id", expenseId);
      assert(!reactivateErr, errMsg(reactivateErr));
      created.tempInactiveAccountId = null;
      push("atomicity.inactive_account", "PASS");
    }

    // --- Duplicate post ---
    {
      const { error } = await admin.rpc("finance_post_transaction", {
        p_transaction_id: postedTxId,
        p_actor_profile_id: profileId,
        p_lines: balancedLines,
        p_period_id: openPeriodId,
      });
      assert(
        error && /already posted|already has a journal/i.test(error.message),
        errMsg(error)
      );

      const { count } = await admin
        .from("finance_journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("transaction_id", postedTxId);
      assert((count ?? 0) === 1, `expected one journal, got ${count}`);

      const { count: auditCount } = await admin
        .from("finance_audit_events")
        .select("id", { count: "exact", head: true })
        .eq("object_id", postedTxId)
        .eq("action", "finance.transaction.posted");
      assert((auditCount ?? 0) === 1, `expected one success audit, got ${auditCount}`);
      push("posting.duplicate_rejected", "PASS", "single journal + single audit");
    }

    // --- Immutability (triggers fire for service_role) ---
    {
      const { error: updJe } = await admin
        .from("finance_journal_entries")
        .update({ description: "mutated" })
        .eq("id", postedJournalId);
      assert(updJe && /cannot be updated/i.test(updJe.message), errMsg(updJe));

      const { error: delJe } = await admin
        .from("finance_journal_entries")
        .delete()
        .eq("id", postedJournalId);
      assert(delJe && /cannot be deleted/i.test(delJe.message), errMsg(delJe));

      const { data: aLine } = await admin
        .from("finance_journal_lines")
        .select("id")
        .eq("journal_entry_id", postedJournalId)
        .limit(1)
        .maybeSingle();
      assert(aLine, "line missing");

      const { error: updLine } = await admin
        .from("finance_journal_lines")
        .update({ description: "mutated" })
        .eq("id", aLine!.id);
      assert(
        updLine && /cannot be updated or deleted/i.test(updLine.message),
        errMsg(updLine)
      );

      const { error: delLine } = await admin
        .from("finance_journal_lines")
        .delete()
        .eq("id", aLine!.id);
      assert(
        delLine && /cannot be updated or deleted/i.test(delLine.message),
        errMsg(delLine)
      );

      const { error: updAudit } = await admin
        .from("finance_audit_events")
        .update({ reason: "mutated" })
        .eq("object_id", postedTxId)
        .eq("action", "finance.transaction.posted");
      assert(updAudit && /append-only/i.test(updAudit.message), errMsg(updAudit));

      const { error: delAudit } = await admin
        .from("finance_audit_events")
        .delete()
        .eq("object_id", postedTxId)
        .eq("action", "finance.transaction.posted");
      assert(delAudit && /append-only/i.test(delAudit.message), errMsg(delAudit));

      push(
        "immutability.journal_and_audit",
        "PASS",
        "service_role UPDATE/DELETE rejected by triggers"
      );
    }

    // Cross-module static note (runtime isolation already covered by unit script)
    push(
      "cross_module",
      "PASS",
      "DB smoke uses finance_* only; FM/ECC tables not touched"
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    push("integration.fatal", "FAIL", message);
  } finally {
    try {
      await cleanup();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      push("cleanup", "FAIL", message);
    }
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  console.log(`\nSUMMARY pass=${pass} fail=${fail} skipped=${skipped}`);

  if (fail > 0) {
    console.error("FAIL verify-platform-finance-foundation-db");
    process.exit(1);
  }

  console.log("PASS verify-platform-finance-foundation-db");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
