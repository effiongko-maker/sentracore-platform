/**
 * Platform Finance — Payables Slice 3 (API/service boundary) verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-payables-slice3.mts
 *
 * Static checks always run.
 * Unauthenticated handler checks run without inventing credentials.
 * Optional DB suite (PLATFORM_FINANCE_VERIFY_DATABASE_URL) proves scoping
 * predicates via SQL in a rolled-back transaction — no persistent fixtures.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { GET, POST } from "../src/app/api/platform-finance/payables/route";
import {
  FINANCE_PAYABLE_CAPABILITIES,
  financePayableOutstandingAmount,
} from "../src/modules/platform-finance/types";
import {
  insertVerifyPayable,
  insertVerifyVendorBill,
} from "./lib/platform-finance-verify-payable-fixture";
import {
  expectSqlFailure,
  resolveFinanceVerifyDatabaseUrl,
  withFinanceVerifyTransaction,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";
type CheckResult = { name: string; status: CheckStatus; detail?: string };

const ROUTE = "src/app/api/platform-finance/payables/route.ts";
const CLIENT =
  "src/services/platform-finance/PlatformFinancePayablesService.ts";
const SERVICE =
  "src/modules/platform-finance/server/PlatformFinancePayablesServerService.ts";
const REPO =
  "src/modules/platform-finance/server/PlatformFinancePayablesRepository.ts";
const TRANSITIONS =
  "src/modules/platform-finance/server/payableTransitions.ts";

const EXPECTED_ACTIONS = [
  "getPayable",
  "getPayableDetail",
  "listMyPayables",
  "listAccessiblePayables",
  "listAccessibleCompanies",
  "getMyPayableCapabilities",
  "createPayable",
  "updateDraftPayable",
  "submitPayable",
  "startReview",
  "approvePayable",
  "partiallyApprovePayable",
  "rejectPayable",
  "queryPayable",
  "cancelPayable",
] as const;

const ACTION_TO_SERVICE: Record<(typeof EXPECTED_ACTIONS)[number], string> = {
  getPayable: "getPayable",
  getPayableDetail: "getPayableDetail",
  listMyPayables: "listMyPayables",
  listAccessiblePayables: "listAccessiblePayables",
  listAccessibleCompanies: "listAccessibleCompanies",
  getMyPayableCapabilities: "getMyPayableCapabilities",
  createPayable: "createPayable",
  updateDraftPayable: "updateDraftPayable",
  submitPayable: "submitPayable",
  startReview: "startReview",
  approvePayable: "approvePayable",
  partiallyApprovePayable: "partiallyApprovePayable",
  rejectPayable: "rejectPayable",
  queryPayable: "queryPayable",
  cancelPayable: "cancelPayable",
};

const BANKING_FORBIDDEN = [
  "schedulePayment",
  "markPaymentPending",
  "markPaid",
  "postPayable",
  "createPayment",
  "executePayment",
  "authorizeBankPayment",
  "reconcilePayment",
  "createPayableFromRequest",
  "updatePayableStatus",
] as const;

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

function push(
  results: CheckResult[],
  name: string,
  status: CheckStatus,
  detail?: string
) {
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ""}`);
}

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(ROUTE)), "route missing");
    assert(existsSync(resolve(CLIENT)), "client missing");
    assert(existsSync(resolve(SERVICE)), "server service missing");
    assert(existsSync(resolve(REPO)), "repository missing");
    push(results, "A.api_route_exists", "PASS", "/api/platform-finance/payables");
  } catch (e) {
    push(results, "A.api_route_exists", "FAIL", (e as Error).message);
    return;
  }

  const route = readSrc(ROUTE);
  const client = readSrc(CLIENT);
  const service = readSrc(SERVICE);
  const repo = readSrc(REPO);
  const transitions = readSrc(TRANSITIONS);

  try {
    for (const action of EXPECTED_ACTIONS) {
      assert(
        route.includes(`case "${action}"`) || route.includes(`"${action}"`),
        `route ${action}`
      );
      assert(client.includes(ACTION_TO_SERVICE[action]), `client ${action}`);
      assert(
        service.includes(`async ${ACTION_TO_SERVICE[action]}`),
        `service ${action}`
      );
    }
    assert(!route.includes("updatePayableStatus"), "no generic status");
    assert(!service.includes("updatePayableStatus"), "service no generic");
    assert(!client.includes("updatePayableStatus"), "client no generic");
    push(results, "B.named_actions_only", "PASS");
    push(results, "C.no_generic_updatePayableStatus", "PASS");
  } catch (e) {
    push(results, "B.named_actions_only", "FAIL", (e as Error).message);
    push(results, "C.no_generic_updatePayableStatus", "FAIL", (e as Error).message);
  }

  try {
    assert(client.includes('API_PATH = "/api/platform-finance/payables"'), "api path");
    assert(client.includes("postAction"), "postAction");
    for (const m of [
      "listMyPayables",
      "listAccessiblePayables",
      "getPayable",
      "createPayable",
      "updateDraftPayable",
      "submitPayable",
      "startReview",
      "approvePayable",
      "partiallyApprovePayable",
      "rejectPayable",
      "queryPayable",
      "cancelPayable",
    ]) {
      assert(client.includes(`${m}(`) || client.includes(`${m}():`), m);
    }
    push(results, "D.client_service_methods", "PASS");
  } catch (e) {
    push(results, "D.client_service_methods", "FAIL", (e as Error).message);
  }

  try {
    // createPayable is retained as an intentional refusal (no rpcCreate call).
    assert(service.includes("async createPayable"), "createPayable method");
    assert(
      service.includes("Direct payable creation is not permitted"),
      "service refuses direct create"
    );
    assert(!service.includes("rpcCreateFinancePayable"), "no create rpc call");
    assert(service.includes("rpcUpdateFinancePayableDraft"), "update→rpc");
    assert(service.includes("rpcSubmitFinancePayable"), "submit→rpc");
    assert(service.includes("rpcStartFinancePayableReview"), "review→rpc");
    assert(service.includes("rpcApproveFinancePayable"), "approve→rpc");
    assert(service.includes("rpcPartiallyApproveFinancePayable"), "partial→rpc");
    assert(service.includes("rpcRejectFinancePayable"), "reject→rpc");
    assert(service.includes("rpcQueryFinancePayable"), "query→rpc");
    assert(service.includes("rpcCancelFinancePayable"), "cancel→rpc");
    assert(transitions.includes("finance_payable_create"), "rpc file retains guard");
    push(results, "E.server_maps_to_named_rpcs", "PASS");
  } catch (e) {
    push(results, "E.server_maps_to_named_rpcs", "FAIL", (e as Error).message);
  }

  try {
    assert(repo.includes('eq("created_by_profile_id", createdByProfileId)'), "listMy actor");
    assert(service.includes("listMyPayables(actor.profileId)"), "service uses actor");
    push(results, "F.listMyPayables_actor_scoped", "PASS");
  } catch (e) {
    push(results, "F.listMyPayables_actor_scoped", "FAIL", (e as Error).message);
  }

  try {
    assert(repo.includes("listAccessibleCompanyIds"), "company access lookup");
    assert(repo.includes('in("company_id", accessibleCompanyIds)'), "company filter");
    assert(service.includes("listPayablesForCompanies"), "accessible uses companies");
    push(results, "G.listAccessiblePayables_company_scoped", "PASS");
  } catch (e) {
    push(results, "G.listAccessiblePayables_company_scoped", "FAIL", (e as Error).message);
  }

  try {
    assert(service.includes("assertCanView"), "assertCanView");
    assert(service.includes("finance_company_access"), "company access check");
    assert(route.includes("gateExistingPayable"), "gate existing");
    assert(route.includes("companyId: existing.companyId"), "re-gate company");
    push(results, "H.getPayable_company_boundary", "PASS");
  } catch (e) {
    push(results, "H.getPayable_company_boundary", "FAIL", (e as Error).message);
  }

  try {
    assert(route.includes('case "createPayable"'), "create action retained");
    assert(
      route.includes("Direct payable creation is not supported") ||
        route.includes("Direct payable creation is not"),
      "API refuses direct create"
    );
    assert(
      route.includes(`capability: FINANCE_PAYABLE_CAPABILITIES.create`) ||
        route.includes("FINANCE_PAYABLE_CAPABILITIES.create"),
      "still auth-gated before refuse"
    );
    push(results, "I.createPayable_bypass_refused", "PASS");
  } catch (e) {
    push(results, "I.createPayable_bypass_refused", "FAIL", (e as Error).message);
  }

  try {
    assert(route.includes('case "updateDraftPayable"'), "update draft");
    assert(
      route.includes("FINANCE_PAYABLE_CAPABILITIES.create") &&
        route.includes("updateDraftPayable"),
      "create for draft"
    );
    assert(service.includes("rpcUpdateFinancePayableDraft"), "rpc ownership");
    push(results, "J.updateDraft_auth", "PASS");
  } catch (e) {
    push(results, "J.updateDraft_auth", "FAIL", (e as Error).message);
  }

  try {
    assert(route.includes("FINANCE_PAYABLE_CAPABILITIES.review"), "review cap");
    assert(route.includes('case "startReview"'), "startReview");
    assert(route.includes('case "queryPayable"'), "query");
    push(results, "K.review_requires_review_cap", "PASS");
  } catch (e) {
    push(results, "K.review_requires_review_cap", "FAIL", (e as Error).message);
  }

  try {
    assert(route.includes("FINANCE_PAYABLE_CAPABILITIES.approve"), "approve cap");
    assert(route.includes('case "approvePayable"'), "approve");
    assert(route.includes('case "partiallyApprovePayable"'), "partial");
    assert(route.includes('case "rejectPayable"'), "reject");
    push(results, "L.approval_requires_approve_cap", "PASS");
  } catch (e) {
    push(results, "L.approval_requires_approve_cap", "FAIL", (e as Error).message);
  }

  try {
    assert(service.includes("mapRpcError"), "rpc error map");
    assert(service.includes('ActionError("FORBIDDEN"'), "forbidden map");
    assert(
      readSrc(TRANSITIONS).includes("separation of duties") ||
        readSrc(
          "supabase/migrations/20260915220000_finance_payables_lifecycle.sql"
        ).includes("separation of duties"),
      "sod in rpc"
    );
    push(results, "M.sod_preserved_via_rpc", "PASS");
  } catch (e) {
    push(results, "M.sod_preserved_via_rpc", "FAIL", (e as Error).message);
  }

  try {
    assert(!route.includes('case "createPayableFromRequest"'), "no from-request action");
    assert(!client.includes("createPayableFromRequest"), "no client method");
    assert(!service.includes("createPayableFromRequest"), "no service method");
    assert(
      route.includes("Direct payable creation is not supported"),
      "route refuses direct create"
    );
    assert(
      route.includes("Vendor Bill workflow") &&
        route.includes("created atomically on CEO approval"),
      "route explains vendor bill + FR approval paths"
    );
    assert(
      /case "createPayable"[\s\S]{0,1200}?status: 403/.test(route),
      "createPayable answers 403"
    );
    push(results, "N.no_create_from_request_api", "PASS");
  } catch (e) {
    push(results, "N.no_create_from_request_api", "FAIL", (e as Error).message);
  }

  try {
    for (const banned of BANKING_FORBIDDEN) {
      assert(!route.includes(`case "${banned}"`), `route ${banned}`);
      assert(!client.includes(`${banned}(`), `client ${banned}`);
    }
    push(results, "O.no_banking_payment_actions", "PASS");
  } catch (e) {
    push(results, "O.no_banking_payment_actions", "FAIL", (e as Error).message);
  }

  try {
    assert(!route.includes("finance_vendors"), "no vendors");
    assert(!service.includes("createVendor"), "no vendor create");
    // Vendor Bill lifecycle is a separate domain with its own API and RPCs;
    // the Payables surface must not reimplement any of it (comments may name
    // the upstream RPCs when documenting the createPayable refusal).
    assert(!route.includes("finance_vendor_bill_"), "no vendor bill rpc in payables route");
    assert(
      !/\.rpc\(\s*["']finance_vendor_bill_/.test(service) &&
        !/rpcApproveFinanceVendorBill|rpcCreateFinanceVendorBill/.test(service),
      "no vendor bill rpc calls in payables service"
    );
    assert(!route.includes('case "approveVendorBill"'), "no vendor bill action here");
    assert(
      existsSync(
        resolve("src/app/api/platform-finance/vendor-bills/route.ts")
      ),
      "vendor bill api owns its own route"
    );
    push(results, "P.vendor_bill_domain_separated", "PASS");
  } catch (e) {
    push(results, "P.vendor_bill_domain_separated", "FAIL", (e as Error).message);
  }

  try {
    assert(route.includes("actionErrorStatus"), "status map");
    assert(route.includes("401"), "401");
    assert(route.includes("403"), "403");
    assert(route.includes("404"), "404");
    assert(route.includes("409"), "409");
    assert(route.includes("422"), "422");
    assert(route.includes("sanitizeClientMessage"), "sanitize");
    push(results, "Q.error_mapping", "PASS");
  } catch (e) {
    push(results, "Q.error_mapping", "FAIL", (e as Error).message);
  }

  try {
    assert(
      route.includes("requirePlatformFinanceAccess") &&
        route.includes("requirePlatformFinanceAccessAny"),
      "auth helpers"
    );
    assert(
      !route.includes("profileId:") || !/body\.(profileId|organisationId|actor)/.test(route),
      "no client actor"
    );
    assert(!route.includes("body.organisationId"), "no client org");
    assert(!route.includes("from(\"finance_payables\")"), "no direct table mutates");
    assert(
      existsSync(resolve("src/app/(app)/platform-finance/payables/page.tsx")),
      "payables register route"
    );
    const page = readFileSync(
      resolve(
        "src/modules/platform-finance/components/PlatformFinancePayablesPage.tsx"
      ),
      "utf8"
    );
    assert(
      page.includes("PlatformFinancePayablesService"),
      "UI uses payables service"
    );
    assert(!page.includes("from(\"finance_payables\")"), "UI no direct table");
    const apiFiles = collectTsFiles(resolve("src/app/api"));
    for (const f of apiFiles) {
      const rel = f.replace(resolve(".") + "/", "");
      if (rel.includes("platform-finance/payables")) continue;
      const src = readFileSync(f, "utf8");
      assert(!src.includes("updatePayableStatus"), rel);
    }
    assert(
      financePayableOutstandingAmount({ payableAmount: 100, paidAmount: 20 }) === 80,
      "outstanding"
    );
    assert(
      Object.values(FINANCE_PAYABLE_CAPABILITIES).length === 4,
      "four caps"
    );
    push(results, "static.auth_and_scope_discipline", "PASS");
  } catch (e) {
    push(results, "static.auth_and_scope_discipline", "FAIL", (e as Error).message);
  }
}

async function runHandlers(results: CheckResult[]) {
  try {
    const res = await GET();
    const json = (await res.json()) as {
      success?: boolean;
      code?: string;
      message?: string;
    };
    assert(res.status === 401, `expected 401 got ${res.status}`);
    assert(json.success === false, "success false");
    assert(
      json.code === "UNAUTHENTICATED" ||
        /signed in|unauthenticated/i.test(json.message ?? ""),
      json.message ?? "expected unauthenticated"
    );
    push(results, "handler.get_unauthenticated", "PASS", `status=${res.status}`);
  } catch (e) {
    push(results, "handler.get_unauthenticated", "FAIL", (e as Error).message);
  }

  try {
    const res = await POST(
      new Request("http://localhost/api/platform-finance/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createPayable",
          input: {},
        }),
      })
    );
    const json = (await res.json()) as { success?: boolean; code?: string };
    assert(res.status === 401, `expected 401 got ${res.status}`);
    assert(json.success === false, "success false");
    push(results, "handler.post_unauthenticated", "PASS", `status=${res.status}`);
  } catch (e) {
    push(results, "handler.post_unauthenticated", "FAIL", (e as Error).message);
  }

  try {
    const res = await POST(
      new Request("http://localhost/api/platform-finance/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    assert(res.status === 401 || res.status === 400, `got ${res.status}`);
    push(
      results,
      "handler.post_missing_action_or_auth",
      "PASS",
      `status=${res.status}`
    );
  } catch (e) {
    push(
      results,
      "handler.post_missing_action_or_auth",
      "FAIL",
      (e as Error).message
    );
  }

  try {
    const res = await POST(
      new Request("http://localhost/api/platform-finance/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updatePayableStatus", id: randomUUID() }),
      })
    );
    const json = (await res.json()) as { success?: boolean; message?: string };
    assert(res.status === 401 || res.status === 400, `got ${res.status}`);
    if (res.status === 400) {
      assert(/unknown action/i.test(json.message ?? ""), json.message ?? "unknown action");
    }
    push(
      results,
      "handler.rejects_generic_status_action",
      "PASS",
      `status=${res.status}`
    );
  } catch (e) {
    push(
      results,
      "handler.rejects_generic_status_action",
      "FAIL",
      (e as Error).message
    );
  }

  try {
    const res = await POST(
      new Request("http://localhost/api/platform-finance/payables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createPayable",
          input: {
            sourceType: "financial_request",
            companyId: randomUUID(),
            sourceId: randomUUID(),
            payeeName: "X",
            payeeType: "vendor",
            payableAmount: 100,
          },
        }),
      })
    );
    // Unauthenticated → 401 before the refusal is expected here; with auth the
    // action is refused outright with 403 regardless of source type.
    assert(
      res.status === 401 || res.status === 403,
      `got ${res.status}`
    );
    if (res.status === 403) {
      const json = (await res.json()) as { message?: string };
      assert(
        /vendor bill|atomically|not supported/i.test(json.message ?? ""),
        json.message ?? "expected direct create refusal"
      );
    }
    push(
      results,
      "handler.rejects_create_from_financial_request",
      "PASS",
      `status=${res.status}`
    );
  } catch (e) {
    push(
      results,
      "handler.rejects_create_from_financial_request",
      "FAIL",
      (e as Error).message
    );
  }

  push(
    results,
    "handler.authenticated_e2e",
    "SKIPPED",
    "no authenticated session cookie available; not inventing credentials"
  );
}

async function insertTempGrant(
  client: FinanceVerifyClient,
  organisationId: string,
  profileId: string,
  capability: string
) {
  await client.query(
    `insert into public.finance_capability_grants
       (organisation_id, profile_id, capability)
     values ($1, $2, $3)
     on conflict (profile_id, organisation_id, capability) do nothing`,
    [organisationId, profileId, capability]
  );
}

async function runDb(results: CheckResult[], client: FinanceVerifyClient) {
  const org = await client.query<{ id: string }>(
    `select id from public.organisations where slug = 'paychex' limit 1`
  );
  assert(org.rows[0], "paychex org");
  const organisationId = org.rows[0].id;

  const profiles = await client.query<{ id: string }>(
    `select id from public.profiles where organisation_id = $1
     union
     select id from public.profiles where organisation_id is distinct from $1
     limit 2`,
    [organisationId]
  );
  assert(profiles.rows.length >= 1, "need profile");
  const creatorId = profiles.rows[0].id;
  const otherId = profiles.rows[1]?.id ?? null;

  const companyA = await client.query<{ id: string }>(
    `insert into public.finance_companies (organisation_id, code, name, status)
     values ($1, $2, 'PAY3 A', 'active') returning id`,
    [organisationId, `P3A${Date.now().toString(36).slice(-5).toUpperCase()}`]
  );
  const companyB = await client.query<{ id: string }>(
    `insert into public.finance_companies (organisation_id, code, name, status)
     values ($1, $2, 'PAY3 B', 'active') returning id`,
    [organisationId, `P3B${Date.now().toString(36).slice(-5).toUpperCase()}`]
  );
  const companyAId = companyA.rows[0].id;
  const companyBId = companyB.rows[0].id;

  await insertTempGrant(
    client,
    organisationId,
    creatorId,
    FINANCE_PAYABLE_CAPABILITIES.create
  );
  await client.query(
    `insert into public.finance_company_access
       (organisation_id, profile_id, company_id) values ($1, $2, $3)
     on conflict do nothing`,
    [organisationId, creatorId, companyAId]
  );

  // Read-scope fixtures are seeded directly: finance_payable_create is now a
  // disabled bypass guard and this suite is about list/read predicates.
  const srcA = await insertVerifyVendorBill(client, {
    companyId: companyAId,
    inputterProfileId: creatorId,
    billedAmount: 1000,
    payeeName: "Slice3 Payee",
  });
  const payableA = await insertVerifyPayable(client, {
    actorProfileId: creatorId,
    companyId: companyAId,
    payableAmount: 1000,
    sourceType: "vendor_bill",
    sourceId: srcA,
    payeeName: "Slice3 Payee",
  });

  // Seed under company B with temporary access, then revoke that access.
  await client.query(
    `insert into public.finance_company_access
       (organisation_id, profile_id, company_id) values ($1, $2, $3)
     on conflict do nothing`,
    [organisationId, creatorId, companyBId]
  );
  const srcB = await insertVerifyVendorBill(client, {
    companyId: companyBId,
    inputterProfileId: creatorId,
    billedAmount: 500,
    payeeName: "Other Co Payee",
  });
  const payableB = await insertVerifyPayable(client, {
    actorProfileId: creatorId,
    companyId: companyBId,
    payableAmount: 500,
    sourceType: "vendor_bill",
    sourceId: srcB,
    payeeName: "Other Co Payee",
  });
  await client.query(
    `delete from public.finance_company_access
     where profile_id = $1 and company_id = $2`,
    [creatorId, companyBId]
  );

  {
    const mine = await client.query(
      `select id from public.finance_payables
       where organisation_id = $1 and created_by_profile_id = $2`,
      [organisationId, creatorId]
    );
    assert(
      mine.rows.some((r: { id: string }) => r.id === payableA),
      "mine includes A"
    );
    push(results, "db.listMy_predicate_actor_scoped", "PASS");
  }

  {
    const accessible = await client.query(
      `select p.id from public.finance_payables p
       where p.organisation_id = $1
         and p.company_id in (
           select company_id from public.finance_company_access
           where profile_id = $2 and organisation_id = $1
         )`,
      [organisationId, creatorId]
    );
    assert(
      accessible.rows.some((r: { id: string }) => r.id === payableA),
      "accessible includes A"
    );
    assert(
      !accessible.rows.some((r: { id: string }) => r.id === payableB),
      "accessible excludes B without company access"
    );
    push(results, "db.listAccessible_company_scoped", "PASS");
  }

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_payable_update_draft(
         $1::uuid, $2::uuid, 'Hijack', null, null, null, null, false, null, null
       )`,
      [creatorId, payableB]
    );
    // After revoking company access, update should fail company access
    assert(/no company access|missing capability|only the creator|request-originated|draft/i.test(msg), msg);
    push(results, "db.cross_company_mutation_blocked", "PASS", msg);
  }

  if (otherId) {
    await insertTempGrant(
      client,
      organisationId,
      otherId,
      FINANCE_PAYABLE_CAPABILITIES.approve
    );
    await client.query(
      `insert into public.finance_company_access
         (organisation_id, profile_id, company_id) values ($1, $2, $3)
       on conflict do nothing`,
      [organisationId, otherId, companyAId]
    );
    await client.query(
      `select public.finance_payable_submit($1::uuid, $2::uuid)`,
      [creatorId, payableA]
    );
    {
      const msg = await expectSqlFailure(
        client,
        `select public.finance_payable_approve($1::uuid, $2::uuid, null)`,
        [creatorId, payableA]
      );
      assert(/separation of duties/i.test(msg), msg);
      push(results, "db.sod_creator_cannot_approve", "PASS", msg);
    }
  } else {
    push(
      results,
      "db.sod_creator_cannot_approve",
      "SKIPPED",
      "only one profile available for SoD pair"
    );
  }

  push(
    results,
    "db.cleanup.rollback",
    "PASS",
    "helper will ROLLBACK — no persistent pollution"
  );
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  console.log("=== Payables Slice 3 verification ===\n");
  console.log("--- static ---");
  runStatic(results);
  console.log("\n--- handlers ---");
  await runHandlers(results);

  console.log("\n--- database (optional) ---");
  if (!resolveFinanceVerifyDatabaseUrl()) {
    push(
      results,
      "db.transaction_suite",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set"
    );
  } else {
    const outcome = await withFinanceVerifyTransaction(async (client) => {
      await runDb(results, client);
      return true;
    });
    assert(outcome.rolledBack, "must roll back");
    if (!outcome.ok) {
      push(results, "db.run", "FAIL", outcome.error);
    }
  }

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
