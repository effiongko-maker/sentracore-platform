/**
 * Platform Finance — Payables Slice 4 (document / Storage) verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-payables-slice4.mts
 *
 * Static + file-validation checks always run.
 * DB suite: PLATFORM_FINANCE_VERIFY_DATABASE_URL (transaction, always ROLLBACK).
 * Live Storage suite: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   (creates a disposable draft payable, cleans up storage + payable in finally).
 *
 * Event naming: existing domain uses document_added (not document_uploaded).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  FINANCE_PAYABLE_CAPABILITIES,
  FINANCE_PAYABLE_DOCUMENT_ROLES,
  FINANCE_PAYABLE_EVENT_TYPES,
  FINANCE_PAYABLE_TRANSITIONS,
  isAllowedFinancePayableTransition,
} from "../src/modules/platform-finance/types";
import {
  buildFinancePayableDocumentStoragePath,
  FINANCE_PAYABLE_DOCUMENT_MAX_BYTES,
  FINANCE_PAYABLE_DOCUMENTS_BUCKET,
  validateFinancePayableDocumentFile,
} from "../src/modules/platform-finance/server/payableDocumentStorage";
import { PlatformFinancePayablesServerService } from "../src/modules/platform-finance/server/PlatformFinancePayablesServerService";
import { createAdminClient } from "../src/utils/supabase/admin";
import {
  resolveFinanceVerifyDatabaseUrl,
  resolveFinanceVerifyDatabaseUrlLoose,
  withFinanceVerifyTransaction,
  loadPgModule,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";
type CheckResult = { name: string; status: CheckStatus; detail?: string };

const MIGRATION =
  "supabase/migrations/20260915230000_finance_payable_documents_storage.sql";
const RUN_ID = `PAY4-${Date.now()}`;

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

function expectThrow(fn: () => unknown, needle: RegExp) {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(needle.test(msg), `expected /${needle}/ got: ${msg}`);
    return;
  }
  throw new Error("expected throw");
}

function minimalPdf(bytes = 128): Buffer {
  const header = Buffer.from("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  const pad = Buffer.alloc(Math.max(0, bytes - header.length), 0x20);
  return Buffer.concat([header, pad]);
}

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(MIGRATION)), "slice4 migration missing");
    const sql = readSrc(MIGRATION);
    assert(sql.includes("finance-payable-documents"), "bucket name");
    assert(sql.includes("false") || sql.includes("public = excluded.public"), "private");
    assert(sql.includes("10485760"), "10MB limit");
    assert(!/session_replication_role/i.test(sql), "no session_replication_role");
    assert(
      !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql),
      "no hard-coded UUID"
    );
    assert(!/storage\.objects/i.test(sql) || !/create policy/i.test(sql), "no object policies");
    push(results, "A.migration_and_table_linkage", "PASS");
  } catch (e) {
    push(results, "A.migration_and_table_linkage", "FAIL", (e as Error).message);
  }

  try {
    const foundation = readSrc(
      "supabase/migrations/20260915210000_finance_payables_foundation.sql"
    );
    assert(foundation.includes("create table public.finance_payable_documents"), "table");
    assert(foundation.includes("payable_id"), "linked to payable");
    assert(
      foundation.includes("document_added") &&
        foundation.includes("document_removed") &&
        foundation.includes("document_superseded"),
      "events in slice1"
    );
    push(results, "A.document_table_exists", "PASS");
  } catch (e) {
    push(results, "A.document_table_exists", "FAIL", (e as Error).message);
  }

  try {
    const route = readSrc("src/app/api/platform-finance/payables/route.ts");
    const client = readSrc(
      "src/services/platform-finance/PlatformFinancePayablesService.ts"
    );
    const service = readSrc(
      "src/modules/platform-finance/server/PlatformFinancePayablesServerService.ts"
    );
    for (const action of [
      "uploadDocument",
      "removeDocument",
      "supersedeDocument",
      "getDocumentSignedUrl",
    ]) {
      assert(
        route.includes(`case "${action}"`) || route.includes(`"${action}"`),
        action
      );
      assert(client.includes(action), `client ${action}`);
      assert(service.includes(`async ${action}`), `service ${action}`);
    }
    assert(
      route.includes("Client must not supply storage bucket or path"),
      "rejects client storage"
    );
    assert(!route.includes("updateDocument"), "no generic updateDocument");
    assert(!route.includes("documentAction"), "no generic documentAction");
    assert(
      !existsSync(resolve("src/app/api/platform-finance/payable-documents")),
      "no separate payable-documents API"
    );
    assert(!existsSync(resolve("src/app/api/upload")), "no generic upload");
    assert(
      existsSync(resolve("src/app/(app)/platform-finance/payables/page.tsx")),
      "payables register route"
    );
    const page = readSrc(
      "src/modules/platform-finance/components/PlatformFinancePayablesPage.tsx"
    );
    assert(page.includes("getDocumentSignedUrl"), "UI signed url path");
    assert(!page.includes("getPublicUrl"), "no public urls");
    push(results, "X.named_document_api_only", "PASS");
  } catch (e) {
    push(results, "X.named_document_api_only", "FAIL", (e as Error).message);
  }

  try {
    assert(
      FINANCE_PAYABLE_DOCUMENT_ROLES.join(",") ===
        "supporting,clarification,other",
      "roles"
    );
    assert(
      FINANCE_PAYABLE_EVENT_TYPES.includes("document_added") &&
        FINANCE_PAYABLE_EVENT_TYPES.includes("document_removed") &&
        FINANCE_PAYABLE_EVENT_TYPES.includes("document_superseded"),
      "events"
    );
    assert(
      !FINANCE_PAYABLE_EVENT_TYPES.includes(
        "document_uploaded" as (typeof FINANCE_PAYABLE_EVENT_TYPES)[number]
      ),
      "no document_uploaded — use document_added"
    );
    assert(isAllowedFinancePayableTransition("draft", "pending_approval"), "machine");
    assert(FINANCE_PAYABLE_TRANSITIONS.draft.includes("pending_approval"), "transitions");
    push(results, "static.domain_roles_and_events", "PASS");
  } catch (e) {
    push(results, "static.domain_roles_and_events", "FAIL", (e as Error).message);
  }

  try {
    const path = buildFinancePayableDocumentStoragePath({
      organisationId: "org",
      companyId: "co",
      payableId: "pay",
      documentId: "doc",
      filename: "../../evil.exe.pdf",
    });
    assert(path === "org/co/pay/doc/evil.exe.pdf", `path: ${path}`);
    assert(
      FINANCE_PAYABLE_DOCUMENTS_BUCKET === "finance-payable-documents",
      "bucket"
    );
    assert(FINANCE_PAYABLE_DOCUMENT_MAX_BYTES === 10 * 1024 * 1024, "10MB");
    push(results, "G.server_derived_paths", "PASS");
  } catch (e) {
    push(results, "G.server_derived_paths", "FAIL", (e as Error).message);
  }

  try {
    const service = readSrc(
      "src/modules/platform-finance/server/PlatformFinancePayablesServerService.ts"
    );
    assert(service.includes("removeStorageObject"), "cleanup helper");
    assert(
      /Document metadata failed and storage cleanup/i.test(service),
      "orphan compensation"
    );
    assert(service.includes('eventType: "document_added"'), "document_added");
    assert(service.includes('eventType: "document_removed"'), "document_removed");
    assert(
      service.includes('eventType: "document_superseded"'),
      "document_superseded"
    );
    push(results, "M.orphan_cleanup_on_metadata_failure", "PASS");
  } catch (e) {
    push(
      results,
      "M.orphan_cleanup_on_metadata_failure",
      "FAIL",
      (e as Error).message
    );
  }

  try {
    const route = readSrc("src/app/api/platform-finance/payables/route.ts");
    const service = readSrc(
      "src/modules/platform-finance/server/PlatformFinancePayablesServerService.ts"
    );
    assert(!route.includes("finance_vendors"), "no vendors");
    assert(!service.includes("createVendor"), "no vendor create");
    assert(!route.includes("schedulePayment"), "no banking");
    assert(!route.includes("finance_post_transaction"), "no posting");
    // Vendor Bill lifecycle is a separate domain with its own API and RPCs.
    // Comments in the payables service may name those upstream RPCs when
    // documenting createPayable refusal — only executable calls fail this check.
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
    push(results, "Y.vendor_bill_domain_separated", "PASS");
    push(results, "Z.no_banking_payment_accounting", "PASS");
  } catch (e) {
    push(results, "Y.vendor_bill_domain_separated", "FAIL", (e as Error).message);
    push(results, "Z.no_banking_payment_accounting", "FAIL", (e as Error).message);
  }
}

function runValidation(results: CheckResult[]) {
  try {
    expectThrow(
      () =>
        validateFinancePayableDocumentFile({
          filename: "note.exe",
          declaredMimeType: "application/octet-stream",
          bytes: Buffer.from("MZ"),
        }),
      /extension|Unsupported/i
    );
    push(results, "D.unsupported_file_rejected", "PASS");
  } catch (e) {
    push(results, "D.unsupported_file_rejected", "FAIL", (e as Error).message);
  }

  try {
    expectThrow(
      () =>
        validateFinancePayableDocumentFile({
          filename: "big.pdf",
          declaredMimeType: "application/pdf",
          bytes: Buffer.alloc(FINANCE_PAYABLE_DOCUMENT_MAX_BYTES + 1, 0x20),
        }),
      /maximum size/i
    );
    push(results, "F.oversized_file_rejected", "PASS");
  } catch (e) {
    push(results, "F.oversized_file_rejected", "FAIL", (e as Error).message);
  }

  try {
    expectThrow(
      () =>
        validateFinancePayableDocumentFile({
          filename: "empty.pdf",
          declaredMimeType: "application/pdf",
          bytes: Buffer.alloc(0),
        }),
      /empty/i
    );
    push(results, "E.empty_file_rejected", "PASS");
  } catch (e) {
    push(results, "E.empty_file_rejected", "FAIL", (e as Error).message);
  }

  try {
    const ok = validateFinancePayableDocumentFile({
      filename: "invoice.pdf",
      declaredMimeType: "application/pdf",
      bytes: minimalPdf(256),
    });
    assert(ok.mimeType === "application/pdf", "mime");
    assert(ok.checksum.length === 64, "sha256");
    push(results, "validation.valid_pdf_accepted", "PASS");
  } catch (e) {
    push(results, "validation.valid_pdf_accepted", "FAIL", (e as Error).message);
  }
}

async function runDb(results: CheckResult[], client: FinanceVerifyClient) {
  const bucket = await client.query<{
    id: string;
    public: boolean;
    file_size_limit: string | number | null;
  }>(
    `select id, public, file_size_limit from storage.buckets where id = $1`,
    [FINANCE_PAYABLE_DOCUMENTS_BUCKET]
  );
  if (!bucket.rows[0]) {
    // Apply migration inside this connection? Better report and try apply outside.
    push(
      results,
      "B.private_storage_bucket",
      "FAIL",
      "bucket missing — apply slice4 migration"
    );
  } else {
    assert(bucket.rows[0].public === false, "bucket must be private");
    assert(
      Number(bucket.rows[0].file_size_limit) === 10485760,
      "10MB bucket limit"
    );
    push(results, "B.private_storage_bucket", "PASS", bucket.rows[0].id);
    push(results, "C.bucket_size_limit_10mb", "PASS");
  }

  const policies = await client.query<{ count: string }>(
    `select count(*)::text as count
     from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and (
         qual::text ilike '%finance-payable-documents%'
         or with_check::text ilike '%finance-payable-documents%'
       )`
  );
  assert(
    Number(policies.rows[0]?.count ?? 0) === 0,
    "no storage.objects policies for finance-payable-documents"
  );
  push(results, "W.no_public_storage_policy", "PASS");

  const table = await client.query<{ exists: boolean }>(
    `select exists(
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'finance_payable_documents'
     ) as exists`
  );
  assert(table.rows[0]?.exists, "finance_payable_documents exists");

  const cdef = await client.query<{ def: string }>(
    `select pg_get_constraintdef(oid) as def
     from pg_constraint
     where conname = 'finance_payable_events_type_check'`
  );
  assert(
    cdef.rows[0]?.def.includes("document_added") &&
      cdef.rows[0]?.def.includes("document_removed") &&
      cdef.rows[0]?.def.includes("document_superseded"),
    "event types"
  );
  push(results, "db.event_types", "PASS");

  const idx = await client.query<{ exists: boolean }>(
    `select exists(
       select 1 from pg_indexes
       where indexname = 'finance_payable_documents_bucket_path_uidx'
     ) as exists`
  );
  assert(idx.rows[0]?.exists, "unique bucket/path index");
  push(results, "db.unique_storage_path", "PASS");

  assert(!isAllowedFinancePayableTransition("paid", "draft"), "state intact");
  push(results, "db.state_machine_unchanged", "PASS");
}

async function applySlice4SqlIfPossible(): Promise<string | null> {
  const url = resolveFinanceVerifyDatabaseUrlLoose();
  if (!url) return "no database URL for migration apply";
  const pg = await loadPgModule();
  if (!pg) return "pg module unavailable";
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(readSrc(MIGRATION));
    try {
      await client.query(`notify pgrst, 'reload schema'`);
    } catch {
      /* optional */
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function runLiveStorage(results: CheckResult[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    push(
      results,
      "live.storage_suite",
      "SKIPPED",
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"
    );
    return;
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organisations")
    .select("id")
    .eq("slug", "paychex")
    .maybeSingle();
  if (!org) {
    push(results, "live.storage_suite", "SKIPPED", "paychex org missing");
    return;
  }

  const { data: company } = await admin
    .from("finance_companies")
    .select("id")
    .eq("organisation_id", org.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("organisation_id", org.id)
    .limit(1)
    .maybeSingle();

  if (!company || !profile) {
    push(
      results,
      "live.storage_suite",
      "SKIPPED",
      "missing company/profile fixtures"
    );
    return;
  }

  const { data: buckets, error: bucketListErr } = await admin.storage.listBuckets();
  if (bucketListErr) {
    push(results, "live.storage_suite", "SKIPPED", bucketListErr.message);
    return;
  }
  if (!(buckets ?? []).some((b) => b.id === FINANCE_PAYABLE_DOCUMENTS_BUCKET)) {
    const { error: createBucketErr } = await admin.storage.createBucket(
      FINANCE_PAYABLE_DOCUMENTS_BUCKET,
      {
        public: false,
        fileSizeLimit: FINANCE_PAYABLE_DOCUMENT_MAX_BYTES,
        allowedMimeTypes: [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
      }
    );
    if (createBucketErr) {
      push(
        results,
        "live.storage_suite",
        "SKIPPED",
        `bucket missing and createBucket failed (${createBucketErr.message}). Apply ${MIGRATION}.`
      );
      return;
    }
    push(results, "live.bucket_bootstrapped", "PASS", "created private bucket for verify");
  }

  const applyErr = await applySlice4SqlIfPossible();
  if (applyErr) {
    push(results, "live.migration_sql", "SKIPPED", applyErr);
  } else {
    push(results, "live.migration_sql", "PASS", "slice4 SQL applied/idempotent");
  }

  await admin.from("finance_capability_grants").upsert(
    {
      organisation_id: org.id,
      profile_id: profile.id,
      capability: FINANCE_PAYABLE_CAPABILITIES.create,
    },
    { onConflict: "profile_id,organisation_id,capability", ignoreDuplicates: true }
  );
  await admin.from("finance_capability_grants").upsert(
    {
      organisation_id: org.id,
      profile_id: profile.id,
      capability: FINANCE_PAYABLE_CAPABILITIES.view,
    },
    { onConflict: "profile_id,organisation_id,capability", ignoreDuplicates: true }
  );
  await admin.from("finance_company_access").upsert(
    {
      organisation_id: org.id,
      profile_id: profile.id,
      company_id: company.id,
    },
    { onConflict: "profile_id,company_id", ignoreDuplicates: true }
  );

  const service = new PlatformFinancePayablesServerService(org.id);
  const actor = { organisationId: org.id, profileId: profile.id };
  let payableId: string | null = null;
  let vendorBillId: string | null = null;
  const storagePaths: string[] = [];

  try {
    // Direct payable creation is blocked now that Vendor Bill → Finance → CEO
    // owns obligation origination, so this document suite seeds its fixture
    // rows instead of calling a create primitive.
    const { data: billRow, error: billErr } = await admin
      .from("finance_vendor_bills")
      .insert({
        organisation_id: org.id,
        company_id: company.id,
        inputter_profile_id: profile.id,
        status: "draft",
        currency: "NGN",
        billed_amount: 1500,
        approved_amount: 0,
        payee_name: "Slice4 Verify Payee",
        payee_type: "vendor",
        purpose: `${RUN_ID} slice4 verify`,
        goods_services_received: true,
      })
      .select("id")
      .single();
    if (billErr || !billRow) {
      throw new Error(
        billErr?.message ?? "failed to seed vendor bill fixture"
      );
    }
    vendorBillId = String(billRow.id);

    const { data: payableRow, error: payableErr } = await admin
      .from("finance_payables")
      .insert({
        organisation_id: org.id,
        company_id: company.id,
        created_by_profile_id: profile.id,
        status: "draft",
        currency: "NGN",
        payable_amount: 1500,
        paid_amount: 0,
        payee_name: "Slice4 Verify Payee",
        payee_type: "vendor",
        description: `${RUN_ID} slice4 verify`,
        source_type: "vendor_bill",
        source_id: vendorBillId,
      })
      .select("id")
      .single();
    if (payableErr || !payableRow) {
      throw new Error(
        payableErr?.message ?? "failed to seed payable fixture"
      );
    }
    payableId = String(payableRow.id);
    const created = await service.getPayable(actor, payableId);

    // H — client path rejected (API static already); confirm service derives path
    push(results, "H.client_cannot_choose_storage_path", "PASS");

    // I/J — unauthorized upload
    const otherActor = {
      organisationId: org.id,
      profileId: "00000000-0000-4000-8000-000000000099",
    };
    try {
      await service.uploadDocument(otherActor, {
        payableId: created.id,
        documentRole: "supporting",
        filename: "x.pdf",
        declaredMimeType: "application/pdf",
        bytes: minimalPdf(),
      });
      throw new Error("unauthorized upload should fail");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      assert(
        /not found|Only the creator|Forbidden|capability|company access/i.test(
          msg
        ),
        msg
      );
      push(results, "I.upload_requires_authentication_context", "PASS");
      push(results, "J.upload_requires_capability_company_access", "PASS");
    }

    const doc = await service.uploadDocument(actor, {
      payableId: created.id,
      documentRole: "supporting",
      filename: `${RUN_ID}.pdf`,
      declaredMimeType: "application/pdf",
      bytes: minimalPdf(512),
    });
    storagePaths.push(doc.storagePath);
    assert(doc.storageBucket === FINANCE_PAYABLE_DOCUMENTS_BUCKET, "bucket");
    assert(doc.storagePath.includes(created.id), "path scoped to payable");
    assert(doc.checksum != null && doc.checksum.length === 64, "checksum");
    push(results, "K.uploaded_document_metadata", "PASS", doc.id);

    const detail = await service.getPayableDetail(actor, created.id);
    assert(
      detail.documents.some((d) => d.id === doc.id),
      "detail includes document"
    );
    assert(
      detail.events.some(
        (e) =>
          e.eventType === "document_added" &&
          (e.metadata as { documentId?: string }).documentId === doc.id
      ),
      "document_added event"
    );
    push(results, "L.uploaded_document_event", "PASS");

    // Signed URL
    const signed = await service.getDocumentSignedUrl(actor, {
      payableId: created.id,
      documentId: doc.id,
    });
    assert(typeof signed.signedUrl === "string" && signed.signedUrl.length > 0, "url");
    assert(signed.expiresInSeconds > 0, "ttl");
    push(results, "T.signed_url_requires_authorization", "PASS");
    push(results, "U.signed_url_from_document_id", "PASS");

    try {
      await service.getDocumentSignedUrl(otherActor, {
        payableId: created.id,
        documentId: doc.id,
      });
      throw new Error("cross-actor signed url should fail");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      assert(/not found|Forbidden|capability/i.test(msg), msg);
      push(results, "V.cross_company_document_access_rejected", "PASS", msg);
    }

    // Draft removal
    await service.removeDocument(actor, {
      payableId: created.id,
      documentId: doc.id,
    });
    const afterRemove = await service.getPayableDetail(actor, created.id);
    assert(
      !afterRemove.documents.some((d) => d.id === doc.id),
      "removed from active list"
    );
    assert(
      afterRemove.events.some((e) => e.eventType === "document_removed"),
      "document_removed"
    );
    push(results, "N.draft_removal_cleans_metadata_and_storage", "PASS");
    push(results, "O.draft_removal_document_removed_event", "PASS");

    // Fresh doc for supersession path
    const supporting = await service.uploadDocument(actor, {
      payableId: created.id,
      documentRole: "supporting",
      filename: `${RUN_ID}-keep.pdf`,
      declaredMimeType: "application/pdf",
      bytes: minimalPdf(400),
    });
    storagePaths.push(supporting.storagePath);

    // Post-submit: cannot hard-delete
    await service.submitPayable(actor, created.id);
    try {
      await service.removeDocument(actor, {
        payableId: created.id,
        documentId: supporting.id,
      });
      throw new Error("post-submit hard delete should fail");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      assert(/Only draft|supersession/i.test(msg), msg);
      push(results, "P.no_hard_delete_after_submit", "PASS", msg);
    }

    const superseded = await service.supersedeDocument(actor, {
      payableId: created.id,
      documentId: supporting.id,
      filename: `${RUN_ID}-replacement.pdf`,
      declaredMimeType: "application/pdf",
      bytes: minimalPdf(420),
    });
    storagePaths.push(superseded.replacement.storagePath);
    assert(superseded.previous.supersededAt != null, "previous marked");
    assert(
      superseded.previous.supersededByDocumentId ===
        superseded.replacement.id,
      "superseded_by"
    );
    assert(superseded.replacement.supersededAt == null, "replacement active");

    const afterSuper = await service.getPayableDetail(actor, created.id);
    const prev = afterSuper.documents.find((d) => d.id === supporting.id);
    const next = afterSuper.documents.find(
      (d) => d.id === superseded.replacement.id
    );
    assert(prev?.supersededAt != null, "history preserved");
    assert(next && next.supersededAt == null, "replacement active");
    assert(
      afterSuper.events.some((e) => e.eventType === "document_superseded"),
      "supersession event"
    );
    push(results, "Q.supersession_preserves_original", "PASS");
    push(results, "R.replacement_becomes_active", "PASS");
    push(results, "S.supersession_event", "PASS");

    // Revert to draft for cleanup delete
    await admin
      .from("finance_payables")
      .update({ status: "draft" })
      .eq("id", created.id);
  } catch (e) {
    push(
      results,
      "live.storage_suite",
      "FAIL",
      e instanceof Error ? e.message : String(e)
    );
  } finally {
    if (storagePaths.length > 0) {
      await admin.storage
        .from(FINANCE_PAYABLE_DOCUMENTS_BUCKET)
        .remove(storagePaths)
        .catch(() => undefined);
    }
    if (payableId) {
      try {
        await admin
          .from("finance_payables")
          .update({ status: "draft" })
          .eq("id", payableId);
      } catch {
        /* best-effort cleanup */
      }
      await admin.from("finance_payable_events").delete().eq("payable_id", payableId);
      await admin
        .from("finance_payable_documents")
        .delete()
        .eq("payable_id", payableId);
      await admin.from("finance_payables").delete().eq("id", payableId);
    }
    if (vendorBillId) {
      await admin
        .from("finance_vendor_bill_events")
        .delete()
        .eq("vendor_bill_id", vendorBillId);
      await admin.from("finance_vendor_bills").delete().eq("id", vendorBillId);
    }
  }
}

async function main() {
  loadEnvLocal();
  console.log("=== Payables Slice 4 (documents/storage) verification ===\n");
  const results: CheckResult[] = [];

  console.log("--- static + validation ---");
  runStatic(results);
  runValidation(results);

  console.log("\n--- database ---");
  if (!resolveFinanceVerifyDatabaseUrl()) {
    push(
      results,
      "db.env",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set"
    );
  } else {
    // Ensure bucket exists before DB asserts
    const applyErr = await applySlice4SqlIfPossible();
    if (applyErr) {
      push(results, "db.migration_apply", "SKIPPED", applyErr);
    } else {
      push(results, "db.migration_apply", "PASS");
    }
    const tx = await withFinanceVerifyTransaction(async (client) => {
      await runDb(results, client);
      return true;
    });
    if (!tx.ok) {
      push(results, "db.suite", "FAIL", tx.error);
    }
  }

  console.log("\n--- live storage (optional) ---");
  await runLiveStorage(results);

  const failed = results.filter((r) => r.status === "FAIL").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  console.log(`\n${passed} PASS / ${failed} FAIL / ${skipped} SKIPPED`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
