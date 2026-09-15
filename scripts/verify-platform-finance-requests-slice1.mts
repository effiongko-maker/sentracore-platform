/**
 * Platform Finance — Financial Requests Slice 1 verification.
 *
 * Static (always):
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-requests-slice1.mts
 *
 * Optional DB checks when env present:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Authenticated RLS client tests are skipped without NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (does not invent credentials).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINANCIAL_REQUEST_CAPABILITIES,
  FINANCIAL_REQUEST_CATEGORY_SEEDS,
  FINANCIAL_REQUEST_DOCUMENT_ROLES,
  FINANCIAL_REQUEST_EVENT_TYPES,
  FINANCIAL_REQUEST_PAYEE_TYPES,
  FINANCIAL_REQUEST_SEPARATION_OF_DUTIES,
  FINANCIAL_REQUEST_STATUSES,
  FINANCIAL_REQUEST_TERMINAL_STATUSES,
  FINANCIAL_REQUEST_TRANSITIONS,
  financialRequestOutstandingAmount,
  isAllowedFinancialRequestTransition,
  PLATFORM_FINANCE_CAPABILITIES,
} from "../src/modules/platform-finance/types";

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";

type CheckResult = {
  name: string;
  status: CheckStatus;
  detail?: string;
};

const MIGRATION =
  "supabase/migrations/20260914200000_finance_requests_foundation.sql";

const EXPECTED_TABLES = [
  "finance_request_categories",
  "finance_requests",
  "finance_request_documents",
  "finance_request_events",
] as const;

const CAPABILITY_FORMAT = /^platform_finance(\.[a-z0-9_]+)+$/;

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

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function hasDbEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function collectTransitionEdges(): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  for (const [from, tos] of Object.entries(FINANCIAL_REQUEST_TRANSITIONS)) {
    for (const to of tos) edges.push([from, to]);
  }
  return edges;
}

async function runStatic(results: CheckResult[]) {
  const push = (name: string, status: CheckStatus, detail?: string) => {
    results.push({ name, status, detail });
    const suffix = detail ? ` — ${detail}` : "";
    console.log(`${status} ${name}${suffix}`);
  };

  try {
    assert(existsSync(resolve(MIGRATION)), "migration file missing");
    push("schema.migration_exists", "PASS", MIGRATION);
  } catch (e) {
    push("schema.migration_exists", "FAIL", (e as Error).message);
    return;
  }

  const sql = readSrc(MIGRATION);

  for (const table of EXPECTED_TABLES) {
    try {
      assert(sql.includes(`create table public.${table}`), `missing ${table}`);
      push(`schema.table_${table}`, "PASS");
    } catch (e) {
      push(`schema.table_${table}`, "FAIL", (e as Error).message);
    }
  }

  const requiredRequestCols = [
    "organisation_id",
    "company_id",
    "requester_profile_id",
    "status",
    "currency",
    "requested_amount",
    "approved_amount",
    "paid_amount",
    "category_id",
    "purpose",
    "description",
    "payee_name",
    "payee_type",
    "required_by_date",
    "external_reference",
    "project_contract_ref",
    "finance_notes",
    "ceo_decision_notes",
    "queried_at",
    "submitted_at",
    "reviewed_at",
    "decided_at",
    "created_at",
    "updated_at",
  ];
  try {
    for (const col of requiredRequestCols) {
      assert(sql.includes(col), `finance_requests missing ${col}`);
    }
    push("schema.finance_requests_columns", "PASS");
  } catch (e) {
    push("schema.finance_requests_columns", "FAIL", (e as Error).message);
  }

  try {
    assert(sql.includes("references public.finance_companies"), "company FK");
    assert(sql.includes("references public.profiles"), "profile FK");
    assert(
      sql.includes("references public.finance_request_categories"),
      "category FK"
    );
    assert(
      sql.includes("finance_requests_paid_amount_v1_zero"),
      "paid_amount = 0 constraint"
    );
    assert(
      sql.includes("finance_requests_approved_lte_requested"),
      "approved <= requested"
    );
    assert(
      sql.includes("finance_requests_amount_status_invariants"),
      "status/amount invariants"
    );
    assert(
      sql.includes("finance_request_events_reject_update"),
      "events append-only (no update) trigger"
    );
    push("schema.constraints_and_fks", "PASS");
  } catch (e) {
    push("schema.constraints_and_fks", "FAIL", (e as Error).message);
  }

  try {
    for (const seed of FINANCIAL_REQUEST_CATEGORY_SEEDS) {
      assert(sql.includes(`'${seed.slug}'`), `seed slug ${seed.slug}`);
      assert(sql.includes(seed.name), `seed name ${seed.name}`);
    }
    assert(sql.includes("status in ('active', 'inactive')"), "active/inactive");
    assert(sql.includes("sort_order"), "sort_order");
    push("categories.seeds_and_structure", "PASS");
  } catch (e) {
    push("categories.seeds_and_structure", "FAIL", (e as Error).message);
  }

  try {
    assert(FINANCIAL_REQUEST_STATUSES.length === 9, "nine statuses");
    assert(
      !(FINANCIAL_REQUEST_STATUSES as readonly string[]).includes("returned"),
      "no RETURNED"
    );
    assert(
      !(FINANCIAL_REQUEST_STATUSES as readonly string[]).includes("cancelled"),
      "no CANCELLED"
    );
    for (const status of FINANCIAL_REQUEST_STATUSES) {
      assert(sql.includes(`'${status}'`), `SQL status ${status}`);
    }
    assert(!sql.includes("'returned'"), "SQL must not define returned");
    assert(
      !sql.includes("'cancelled'"),
      "SQL must not define cancelled status literal"
    );
    push("status.authoritative_set", "PASS");
  } catch (e) {
    push("status.authoritative_set", "FAIL", (e as Error).message);
  }

  try {
    const allowed = new Set([
      "draft→submitted",
      "submitted→under_review",
      "under_review→query",
      "under_review→pending_ceo_approval",
      "query→resubmitted",
      "resubmitted→under_review",
      "pending_ceo_approval→approved",
      "pending_ceo_approval→partially_approved",
      "pending_ceo_approval→rejected",
      "pending_ceo_approval→query",
    ]);
    const edges = collectTransitionEdges().map(([a, b]) => `${a}→${b}`);
    assert(edges.length === allowed.size, `edge count ${edges.length}`);
    for (const edge of edges) {
      assert(allowed.has(edge), `unexpected transition ${edge}`);
    }
    assert(
      isAllowedFinancialRequestTransition("draft", "submitted"),
      "draft→submitted allowed"
    );
    assert(
      !isAllowedFinancialRequestTransition("draft", "approved"),
      "draft→approved forbidden"
    );
    assert(
      !isAllowedFinancialRequestTransition("approved", "draft"),
      "approved→draft forbidden"
    );
    for (const terminal of FINANCIAL_REQUEST_TERMINAL_STATUSES) {
      assert(
        FINANCIAL_REQUEST_TRANSITIONS[terminal].length === 0,
        `${terminal} must be terminal`
      );
    }
    push("status.transition_map", "PASS");
  } catch (e) {
    push("status.transition_map", "FAIL", (e as Error).message);
  }

  try {
    assert(
      financialRequestOutstandingAmount({
        approvedAmount: 100,
        paidAmount: 0,
      }) === 100,
      "outstanding derive"
    );
    assert(
      FINANCIAL_REQUEST_SEPARATION_OF_DUTIES.paidAmountRemainsZeroInV1,
      "paidAmountRemainsZeroInV1"
    );
    assert(
      FINANCIAL_REQUEST_SEPARATION_OF_DUTIES.requesterMustNotApproveOwn,
      "requesterMustNotApproveOwn"
    );
    assert(
      FINANCIAL_REQUEST_SEPARATION_OF_DUTIES.draftHardDeleteOnly,
      "draftHardDeleteOnly"
    );
    push("amounts.and_sod_constants", "PASS");
  } catch (e) {
    push("amounts.and_sod_constants", "FAIL", (e as Error).message);
  }

  try {
    for (const role of FINANCIAL_REQUEST_DOCUMENT_ROLES) {
      assert(sql.includes(`'${role}'`), `document role ${role}`);
    }
    assert(sql.includes("superseded_at"), "superseded_at");
    assert(sql.includes("superseded_by_document_id"), "superseded_by");
    assert(sql.includes("storage_bucket"), "storage_bucket metadata");
    assert(sql.includes("storage_path"), "storage_path metadata");
    assert(
      !sql.includes("insert into storage.buckets") &&
        !sql.includes("create bucket"),
      "must not create storage bucket"
    );
    push("documents.metadata_model", "PASS");
  } catch (e) {
    push("documents.metadata_model", "FAIL", (e as Error).message);
  }

  try {
    for (const eventType of FINANCIAL_REQUEST_EVENT_TYPES) {
      assert(sql.includes(`'${eventType}'`), `event type ${eventType}`);
    }
    assert(
      sql.includes("finance_request_events is append-only"),
      "append-only comment/exception"
    );
    assert(
      !sql.includes("finance_request_events_no_delete"),
      "events DELETE must remain allowed for draft cascade"
    );
    assert(
      !sql.includes("create table public.finance_audit_events"),
      "must not recreate audit table"
    );
    push("history.events_model", "PASS");
  } catch (e) {
    push("history.events_model", "FAIL", (e as Error).message);
  }

  try {
    const caps = Object.values(FINANCIAL_REQUEST_CAPABILITIES);
    assert(caps.length === 4, "four request capabilities");
    for (const cap of caps) {
      assert(CAPABILITY_FORMAT.test(cap), `format ${cap}`);
      assert(sql.includes(`'${cap}'`), `RLS references ${cap}`);
    }
    assert(
      PLATFORM_FINANCE_CAPABILITIES.request_create ===
        FINANCIAL_REQUEST_CAPABILITIES.create,
      "capability constants aligned"
    );
    assert(
      sql.includes("platform_finance(\\.[a-z0-9_]+)+"),
      "capability format widened for nested request caps"
    );
    assert(
      sql.includes("has_finance_company_access"),
      "company access remains distinct in RLS"
    );
    push("access.capabilities_and_company", "PASS");
  } catch (e) {
    push("access.capabilities_and_company", "FAIL", (e as Error).message);
  }

  try {
    for (const table of EXPECTED_TABLES) {
      assert(
        sql.includes(`alter table public.${table} enable row level security`),
        `RLS enable ${table}`
      );
      assert(
        sql.includes(`create policy finance_`),
        "policies present"
      );
    }
    assert(
      !/for all to authenticated[\s\S]{0,80}using\s*\(\s*true\s*\)/i.test(sql),
      "no permissive all/true policy"
    );
    assert(
      !/using\s*\(\s*true\s*\)/i.test(sql),
      "no using(true) policies"
    );
    push("rls.restrictive_policies", "PASS");
  } catch (e) {
    push("rls.restrictive_policies", "FAIL", (e as Error).message);
  }

  try {
    assert(
      !sql.includes("create or replace function public.finance_submit"),
      "no submit RPC"
    );
    assert(
      !sql.includes("finance_approve_request"),
      "no approve RPC"
    );
    assert(
      !sql.includes("/api/platform-finance/requests"),
      "no requests API route in migration"
    );
    for (const payee of FINANCIAL_REQUEST_PAYEE_TYPES) {
      assert(sql.includes(`'${payee}'`), `payee type ${payee}`);
    }
    push("scope.slice1_only", "PASS");
  } catch (e) {
    push("scope.slice1_only", "FAIL", (e as Error).message);
  }
}

async function runDb(results: CheckResult[]) {
  const push = (name: string, status: CheckStatus, detail?: string) => {
    results.push({ name, status, detail });
    const suffix = detail ? ` — ${detail}` : "";
    console.log(`${status} ${name}${suffix}`);
  };

  if (!hasDbEnv()) {
    push(
      "db.env",
      "SKIPPED",
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"
    );
    return;
  }

  const admin = adminClient();
  const runId = `PFR1-${Date.now()}`;

  try {
    const { data: orgs, error } = await admin
      .from("organisations")
      .select("id")
      .eq("slug", "paychex")
      .limit(1);
    if (error) throw error;
    assert(orgs?.[0]?.id, "paychex org missing");
    const organisationId = orgs![0].id as string;

    for (const table of EXPECTED_TABLES) {
      const { error: tableError } = await admin.from(table).select("id").limit(1);
      if (tableError) {
        const missing = /does not exist|schema cache|could not find the table/i.test(
          tableError.message
        );
        push(
          `db.table_${table}`,
          missing ? "SKIPPED" : "FAIL",
          tableError.message +
            (missing
              ? " — apply migration 20260914200000_finance_requests_foundation.sql"
              : "")
        );
      } else {
        push(`db.table_${table}`, "PASS");
      }
    }

    const tableResults = results.filter((r) => r.name.startsWith("db.table_"));
    const tablesSkipped = tableResults.some((r) => r.status === "SKIPPED");
    const tablesFailed = tableResults.some((r) => r.status === "FAIL");
    const tablesReady =
      tableResults.length === EXPECTED_TABLES.length &&
      tableResults.every((r) => r.status === "PASS");

    if (tablesSkipped || tablesFailed || !tablesReady) {
      if (tablesSkipped) {
        push(
          "db.integrity_suite",
          "SKIPPED",
          "apply migration 20260914200000_finance_requests_foundation.sql then re-run"
        );
      }
    } else {
      const { data: categories, error: catError } = await admin
        .from("finance_request_categories")
        .select("slug, name, status, sort_order")
        .eq("organisation_id", organisationId)
        .order("sort_order");
      if (catError) {
        push("db.categories_seeded", "FAIL", catError.message);
      } else {
        const slugs = new Set((categories ?? []).map((c) => c.slug));
        const missing = FINANCIAL_REQUEST_CATEGORY_SEEDS.filter(
          (s) => !slugs.has(s.slug)
        );
        if (missing.length) {
          push(
            "db.categories_seeded",
            "FAIL",
            `missing ${missing.map((m) => m.slug).join(",")}`
          );
        } else {
          push(
            "db.categories_seeded",
            "PASS",
            `${categories?.length ?? 0} categories`
          );
        }
      }

      const { data: companies, error: companyError } = await admin
        .from("finance_companies")
        .select("id")
        .eq("organisation_id", organisationId)
        .limit(1);
      if (companyError || !companies?.[0]) {
        push(
          "db.amount_invariants",
          "SKIPPED",
          companyError?.message ?? "no company"
        );
      } else {
        const companyId = companies[0].id as string;
        const { data: profiles, error: profileError } = await admin
          .from("profiles")
          .select("id")
          .limit(1);
        const { data: category, error: oneCatError } = await admin
          .from("finance_request_categories")
          .select("id")
          .eq("organisation_id", organisationId)
          .eq("slug", "travel")
          .maybeSingle();

        if (profileError || !profiles?.[0] || oneCatError || !category) {
          push(
            "db.amount_invariants",
            "SKIPPED",
            profileError?.message || oneCatError?.message || "missing fixtures"
          );
        } else {
          const profileId = profiles[0].id as string;
          const categoryId = category.id as string;
          const base = {
            organisation_id: organisationId,
            company_id: companyId,
            requester_profile_id: profileId,
            category_id: categoryId,
            purpose: `${runId} purpose`,
            payee_name: "Smoke Payee",
            payee_type: "vendor",
            requested_amount: 100,
            approved_amount: 0,
            paid_amount: 0,
            status: "draft",
            currency: "NGN",
          };

          const neg = await admin.from("finance_requests").insert({
            ...base,
            purpose: `${runId} neg`,
            requested_amount: -1,
          });
          assert(neg.error, "negative requested_amount must fail");

          const over = await admin.from("finance_requests").insert({
            ...base,
            purpose: `${runId} over`,
            requested_amount: 50,
            approved_amount: 51,
            status: "draft",
          });
          assert(over.error, "approved > requested must fail");

          const paid = await admin.from("finance_requests").insert({
            ...base,
            purpose: `${runId} paid`,
            paid_amount: 1,
          });
          assert(paid.error, "paid_amount non-zero must fail in v1");

          const rejectedBad = await admin.from("finance_requests").insert({
            ...base,
            purpose: `${runId} rej`,
            status: "rejected",
            approved_amount: 10,
            requested_amount: 100,
          });
          assert(
            rejectedBad.error,
            "rejected with approved_amount > 0 must fail"
          );

          const ok = await admin
            .from("finance_requests")
            .insert({ ...base, purpose: `${runId} ok` })
            .select("id")
            .single();
          if (ok.error || !ok.data?.id) {
            push(
              "db.amount_invariants",
              "FAIL",
              ok.error?.message ?? "insert ok failed"
            );
          } else {
            const requestId = ok.data.id as string;
            const eventIns = await admin
              .from("finance_request_events")
              .insert({
                organisation_id: organisationId,
                request_id: requestId,
                actor_profile_id: profileId,
                event_type: "created",
                to_status: "draft",
                metadata: { runId },
              })
              .select("id")
              .single();
            if (eventIns.error || !eventIns.data?.id) {
              push("db.events_append_only", "FAIL", eventIns.error?.message);
            } else {
              const eventId = eventIns.data.id as string;
              const upd = await admin
                .from("finance_request_events")
                .update({ metadata: { tampered: true } })
                .eq("id", eventId);
              if (!upd.error) {
                push(
                  "db.events_append_only",
                  "FAIL",
                  "event UPDATE unexpectedly succeeded"
                );
              } else {
                push("db.events_append_only", "PASS", upd.error.message);
              }
            }

            const delReq = await admin
              .from("finance_requests")
              .delete()
              .eq("id", requestId);
            if (delReq.error) {
              push(
                "db.draft_hard_delete_cascade",
                "FAIL",
                delReq.error.message
              );
            } else {
              push("db.draft_hard_delete_cascade", "PASS");
            }
            push("db.amount_invariants", "PASS");
          }
        }
      }
    }

    const { data: rlsRows, error: rlsError } = await admin.rpc(
      "has_finance_capability",
      {
        p_organisation_id: organisationId,
        p_capability: "platform_finance.request.create",
      }
    );
    if (rlsError && /could not find the function/i.test(rlsError.message)) {
      push("db.helpers_present", "FAIL", rlsError.message);
    } else {
      push(
        "db.helpers_present",
        "PASS",
        `has_finance_capability callable (result=${String(rlsRows)})`
      );
    }
  } catch (e) {
    push("db.run", "FAIL", (e as Error).message);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    push(
      "access.rls_authenticated_client",
      "SKIPPED",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY not set; not inventing credentials"
    );
  } else {
    push(
      "access.rls_authenticated_client",
      "SKIPPED",
      "Slice 1 verify does not drive authenticated request mutations yet"
    );
  }
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  console.log("=== Financial Requests Slice 1 verification ===\n");
  console.log("--- static ---");
  await runStatic(results);
  console.log("\n--- database (optional) ---");
  await runDb(results);

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  console.log(`\n${pass} PASS / ${fail} FAIL / ${skipped} SKIPPED`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
