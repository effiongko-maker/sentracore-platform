/**
 * Command Centre authority foundation verification.
 *
 * Static + optional DB (PLATFORM_FINANCE_VERIFY_DATABASE_URL — shared Postgres URL).
 * Does not seed CEO users. Does not grant capabilities persistently.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMMAND_CENTRE_CAPABILITIES,
  isCommandCentreCapability,
} from "../src/modules/command-centre/types";
import {
  resolveFinanceVerifyDatabaseUrl,
  resolveFinanceVerifyDatabaseUrlLoose,
  withFinanceVerifyTransaction,
} from "./lib/platform-finance-verify-transaction";
import { composeFinanceDecisionQueue } from "../src/modules/command-centre/server/composeFinanceDecisionQueue";
import type {
  FinancialRequest,
  FinancialRequestCategory,
} from "../src/modules/platform-finance/types";
import type { FinanceVendorBill } from "../src/modules/platform-finance/domain/vendorBills";

type CheckResult = {
  name: string;
  status: "PASS" | "FAIL" | "SKIPPED";
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

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function push(
  results: CheckResult[],
  name: string,
  status: CheckResult["status"],
  detail?: string
) {
  results.push({ name, status, detail });
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const MIGRATION =
  "supabase/migrations/20260916090000_command_centre_authority_foundation.sql";
const HELPER =
  "src/modules/command-centre/server/requireCommandCentreAccess.ts";
const TYPES = "src/modules/command-centre/types.ts";

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(MIGRATION)), "migration missing");
    const sql = readSrc(MIGRATION);
    assert(sql.includes("platform_capability_grants"), "grants table");
    assert(sql.includes("has_platform_capability"), "SQL helper");
    assert(
      sql.includes("platform\\.command_centre"),
      "capability format scoped to command_centre"
    );
    assert(
      !sql.includes("platform_super_admin") ||
        sql.includes("is_platform_super_admin()"),
      "uses RLS helper not role auto-grant"
    );
    assert(!sql.includes("finance_capability_grants"), "not finance grants");
    assert(
      !sql.includes("create table public.finance_company_access") &&
        !sql.includes("references public.finance_company_access"),
      "must not create/link finance company access"
    );
    push(results, "static.migration", "PASS");
  } catch (e) {
    push(results, "static.migration", "FAIL", (e as Error).message);
  }

  try {
    const types = readSrc(TYPES);
    assert(
      types.includes('"platform.command_centre.view"'),
      "view slug"
    );
    assert(
      types.includes('"platform.command_centre.decide"'),
      "decide slug"
    );
    assert(
      COMMAND_CENTRE_CAPABILITIES.view === "platform.command_centre.view",
      "view const"
    );
    assert(
      COMMAND_CENTRE_CAPABILITIES.decide === "platform.command_centre.decide",
      "decide const"
    );
    assert(isCommandCentreCapability("platform.command_centre.view"), "guard");
    assert(
      !isCommandCentreCapability("platform_finance.request.approve"),
      "not finance approve"
    );
    assert(
      !isCommandCentreCapability("platform.admin_override"),
      "not admin override"
    );
    push(results, "static.capability_slugs", "PASS");
  } catch (e) {
    push(results, "static.capability_slugs", "FAIL", (e as Error).message);
  }

  try {
    const helper = readSrc(HELPER);
    assert(helper.includes("requireCommandCentreAccess"), "require helper");
    assert(
      helper.includes("requireCommandCentreAccessAny"),
      "require any helper"
    );
    assert(helper.includes("getPlatformSession"), "session");
    assert(helper.includes("platform_capability_grants"), "grants table");
    assert(
      helper.includes("Super Admin does NOT auto-receive"),
      "SA discipline comment"
    );
    assert(
      !helper.includes("isPlatformSuperAdminFromSlugs") ||
        !/if\s*\(\s*isSuperAdmin\s*\)\s*\{?\s*return/.test(helper),
      "no SA capability bypass"
    );
    assert(!helper.includes("finance_capability_grants"), "not finance grants");
    assert(
      !helper.includes('.from("finance_company_access")'),
      "must not query finance company access"
    );
    push(results, "static.server_helper", "PASS");
  } catch (e) {
    push(results, "static.server_helper", "FAIL", (e as Error).message);
  }

  try {
    const route = "src/app/(app)/command-centre/page.tsx";
    assert(existsSync(resolve(route)), "command-centre route missing");
    const page = readSrc(route);
    assert(page.includes("requireCommandCentreAccess"), "route gated");
    assert(
      page.includes("CommandCentreServerService"),
      "composition service used"
    );
    assert(!page.includes("₦24,500,000"), "no fictional amount");
    assert(!page.includes("12 pending"), "no fictional pending count");

    const service = readSrc(
      "src/modules/command-centre/server/CommandCentreServerService.ts"
    );
    assert(
      service.includes("listApprovalQueue"),
      "uses finance approval queue"
    );
    assert(
      service.includes("PlatformFinanceVendorBillsServerService"),
      "uses authoritative vendor-bill service"
    );
    assert(
      service.includes("FINANCIAL_REQUEST_CAPABILITIES.approve") &&
        service.includes("COMMAND_CENTRE_CAPABILITIES.decide"),
      "requires both finance approve and command-centre decide"
    );
    assert(
      service.includes("private async loadFinanceQueue") && !/isSuperAdmin/.test(
        service.slice(service.indexOf("private async loadFinanceQueue"), service.indexOf("private composeDecisions"))
      ),
      "decision composition has no Super Admin bypass"
    );
    assert(service.includes("composeLastVisit"), "last-visit composition");
    assert(
      service.includes('from("command_centre_visits")'),
      "per-user visit marker"
    );
    assert(
      service.includes("composeLastVisitChanges"),
      "authoritative change feed composer"
    );
    assert(
      service.includes("resolveWorkspaceAccessChrome"),
      "shared workspace-entry resolver"
    );
    assert(
      !service.includes("recorded organisational change"),
      "does not reduce changes to a raw count"
    );
    const commandPage = readSrc(
      "src/modules/command-centre/components/CommandCentrePage.tsx"
    );
    assert(commandPage.includes("LastVisitBlock"), "renders composed change rows");
    assert(
      commandPage.includes("disabledNavigationLabel") &&
        service.includes("Workspace access required"),
      "renders disabled workspace-entry affordance"
    );
    const composer = readSrc(
      "src/modules/command-centre/server/composeLastVisitChanges.ts"
    );
    assert(
      composer.includes("FINANCE_REQUEST_TITLES") &&
        composer.includes("ECC_TITLES") &&
        !composer.includes("OPERATION_TITLES") &&
        !composer.includes("operational_events\""),
      "whitelists meaningful Finance/ECC executive events; FM operational_events are not read"
    );
    assert(!service.includes("composeAssignments"), "personal FM assignment tray is no longer part of Command Centre (executive console V1)");
    assert(
      service.includes("loadOperationalPictureSummary") &&
        !service.includes("loadAssignmentSummary"),
      "Operational Picture contract retained; Apps Script Assignment Summary retired (Phase 2E)"
    );
    assert(
      service.includes("getCommandCentreOverview"),
      "grant-checked Finance executive projection"
    );
    assert(
      !service.includes("overview.needsAttention.map"),
      "organisational Finance queue not copied into personal attention"
    );

    const accessCaps = readSrc("src/lib/access/capabilities.ts");
    assert(
      !accessCaps.includes("command_centre"),
      "not mixed into FM sheet capabilities"
    );
    push(results, "static.ui_route_and_composition", "PASS");
  } catch (e) {
    push(
      results,
      "static.ui_route_and_composition",
      "FAIL",
      (e as Error).message
    );
  }

  try {
    const category = {
      id: "cat-1",
      name: "Operations",
    } as FinancialRequestCategory;
    const request = {
      id: "fr-1",
      status: "pending_ceo_approval",
      currency: "NGN",
      requestedAmount: 100,
      categoryId: category.id,
      purpose: "Authorised request",
      externalReference: "FR-001",
      updatedAt: "2026-09-17T10:00:00.000Z",
    } as FinancialRequest;
    const vendorBill = {
      id: "vb-1",
      status: "pending_ceo_approval",
      currency: "NGN",
      billedAmount: 250,
      purpose: "Authorised vendor bill",
      invoiceReference: "INV-001",
      payeeName: "Vendor Ltd",
      updatedAt: "2026-09-17T09:00:00.000Z",
    } as FinanceVendorBill;
    const submittedRequest = {
      ...request,
      id: "fr-submitted",
      status: "submitted",
    } as FinancialRequest;
    const submittedBill = {
      ...vendorBill,
      id: "vb-submitted",
      status: "submitted",
    } as FinanceVendorBill;
    const composed = composeFinanceDecisionQueue({
      requests: [request, submittedRequest],
      vendorBills: [vendorBill, submittedBill],
      categories: [category],
    });
    assert(composed.items.length === 2, "only CEO-pending rows compose");
    assert(composed.items[0]?.source === "vendor_bill", "oldest decision first");
    assert(
      composed.items.some(
        (item) =>
          item.source === "finance_request" &&
          item.href === "/platform-finance/requests/fr-1"
      ),
      "financial-request deep link"
    );
    assert(
      composed.items.some(
        (item) =>
          item.source === "vendor_bill" &&
          item.href === "/platform-finance/vendor-bills/vb-1"
      ),
      "vendor-bill deep link"
    );
    assert(composed.totalsByCurrency.get("NGN") === 350, "combined amount");
    assert(
      composeFinanceDecisionQueue({ requests: [], vendorBills: [], categories: [] })
        .items.length === 0,
      "combined empty queue"
    );
    push(results, "static.finance_decision_composition", "PASS");
  } catch (e) {
    push(
      results,
      "static.finance_decision_composition",
      "FAIL",
      (e as Error).message
    );
  }
}

async function runDb(results: CheckResult[]) {
  const strictUrl = resolveFinanceVerifyDatabaseUrl();
  const looseUrl = resolveFinanceVerifyDatabaseUrlLoose();
  if (!strictUrl && !looseUrl) {
    push(
      results,
      "db.suite",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL / DATABASE_URL not set"
    );
    return;
  }

  // Prefer transactional strict URL; otherwise one-shot apply via loose URL then skip mutations.
  if (!strictUrl && looseUrl) {
    const pg = await import("pg").catch(() => null);
    if (!pg) {
      push(results, "db.suite", "SKIPPED", "package pg not available");
      return;
    }
    const client = new pg.Client({
      connectionString: looseUrl,
      ssl: looseUrl.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      await client.query(readSrc(MIGRATION));
      const table = await client.query(
        `select to_regclass('public.platform_capability_grants') as reg`
      );
      assert(table.rows[0]?.reg, "table missing after apply");
      push(results, "db.migration_apply", "PASS", "applied via loose DB URL");
    } catch (e) {
      push(results, "db.migration_apply", "FAIL", (e as Error).message);
    } finally {
      await client.end().catch(() => undefined);
    }
    return;
  }

  const outcome = await withFinanceVerifyTransaction(async (client) => {
    const sql = readSrc(MIGRATION);
    await client.query(sql);

    const table = await client.query(
      `select to_regclass('public.platform_capability_grants') as reg`
    );
    assert(table.rows[0]?.reg, "table missing after apply");

    const helper = await client.query(
      `select public.has_platform_capability($1::uuid, $2::text) as ok`,
      ["00000000-0000-0000-0000-000000000001", COMMAND_CENTRE_CAPABILITIES.view]
    );
    assert(helper.rows[0]?.ok === false, "helper callable");

    const any = await client.query(
      `select o.id as org_id, p.id as profile_id
       from public.organisations o
       join public.profiles p on p.organisation_id = o.id
       limit 1`
    );
    assert(any.rows[0], "need at least one org-linked profile for insert checks");

    await client.query(
      `insert into public.platform_capability_grants
         (organisation_id, profile_id, capability)
       values ($1, $2, $3)`,
      [
        any.rows[0].org_id,
        any.rows[0].profile_id,
        COMMAND_CENTRE_CAPABILITIES.view,
      ]
    );
    await client.query(
      `insert into public.platform_capability_grants
         (organisation_id, profile_id, capability)
       values ($1, $2, $3)`,
      [
        any.rows[0].org_id,
        any.rows[0].profile_id,
        COMMAND_CENTRE_CAPABILITIES.decide,
      ]
    );

    let rejectedFinance = false;
    try {
      await client.query(
        `insert into public.platform_capability_grants
           (organisation_id, profile_id, capability)
         values ($1, $2, $3)`,
        [
          any.rows[0].org_id,
          any.rows[0].profile_id,
          "platform_finance.request.approve",
        ]
      );
    } catch {
      rejectedFinance = true;
    }
    assert(rejectedFinance, "must reject finance capability slug");

    let rejectedAdmin = false;
    try {
      await client.query(
        `insert into public.platform_capability_grants
           (organisation_id, profile_id, capability)
         values ($1, $2, $3)`,
        [any.rows[0].org_id, any.rows[0].profile_id, "platform.admin_override"]
      );
    } catch {
      rejectedAdmin = true;
    }
    assert(rejectedAdmin, "must reject platform.admin_override");

    const financeUnchanged = await client.query(
      `select to_regclass('public.finance_capability_grants') as reg`
    );
    assert(financeUnchanged.rows[0]?.reg, "finance grants intact");

    return true;
  });

  assert(outcome.rolledBack, "must roll back");
  if (!outcome.ok) {
    push(results, "db.suite", "FAIL", outcome.error);
    return;
  }
  push(results, "db.migration_apply_and_constraints", "PASS");
  push(results, "db.cleanup.rollback", "PASS", "helper will ROLLBACK");
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  console.log("=== Command Centre authority foundation verification ===\n");
  console.log("--- static ---");
  runStatic(results);
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
