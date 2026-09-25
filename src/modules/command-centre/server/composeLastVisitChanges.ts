import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommandCentreChangeItem } from "@/modules/command-centre/presentationTypes";
import {
  scopeAllowsFacilities,
  scopeAllowsFmWide,
  type FmFacilityScope,
} from "@/lib/access/facilityScope";

type WorkspaceEntry = {
  platformFinance: boolean;
  eccOperations: boolean;
  facilityManagement?: boolean;
};

/**
 * Facility Management visibility for the acting executive — the SAME authority the FM environment applies:
 * `operations` = FM operational view (Issues, Work, Work Orders, Payment Approvals; ops.view),
 * `costsClaims` = Costs & Claims view (Pending Payments, receipts; finance.view), both inside `scope` (the actor's
 * authorised facilities). null = FM is not part of this actor's feed.
 */
export type FmChangeVisibility = {
  operations: boolean;
  costsClaims: boolean;
  scope: FmFacilityScope;
};

type DomainVisibility = {
  /** Finance activity within these Finance companies (the actor's finance_company_access); false = not visible. */
  finance: false | { companyIds: string[] };
  ecc: boolean;
  fm?: FmChangeVisibility | null;
};

type Json = Record<string, unknown>;

const FINANCE_REQUEST_TITLES: Record<string, string> = {
  submitted: "Financial request submitted",
  review_started: "Finance review started",
  queried: "Financial request queried",
  resubmitted: "Financial request resubmitted",
  sent_to_ceo: "Financial request sent for CEO approval",
  approved: "Financial request approved",
  partially_approved: "Financial request partially approved",
  rejected: "Financial request rejected",
};

const ECC_TITLES: Record<string, string> = {
  "daily_ops.created": "Daily operations report recorded",
  "issue.created": "ECC issue recorded",
  "issue.status_changed": "ECC issue status changed",
  "request.created": "ECC request recorded",
  "request.status_changed": "ECC request status changed",
  "finance.transaction_recorded": "ECC financial transaction recorded",
  "finance.commitment_created": "ECC financial commitment created",
  "finance.commitment_status_changed": "ECC commitment status changed",
};

const FINANCE_AUDIT_TITLES: Record<string, string> = {
  "finance.transaction.posted": "Finance transaction posted",
  "finance.vendor_bill.submitted": "Vendor bill submitted",
  "finance.vendor_bill.approved": "Vendor bill approved",
  "finance.vendor_bill.partially_approved": "Vendor bill partially approved",
  "finance.vendor_bill.rejected": "Vendor bill rejected",
  "finance.period.closed": "Finance period closed",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Change composition reads authoritative history only: Finance request/audit events, ECC audit events, and Facility
 * Management's own Supabase records (their recorded timestamps — logged, created, submitted, decided, received,
 * followed up). The legacy FM operational_events stream is NOT read (unreconciled). Imported FM records (listed in
 * fm_migration_provenance / record_origin migrated_historical) are history, not activity, and never appear.
 */
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compact(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

function relativeTime(
  occurredAt: string,
  asOf: string,
  timeZone: string | null
): string {
  const deltaSeconds = Math.max(
    0,
    Math.floor((Date.parse(asOf) - Date.parse(occurredAt)) / 1000)
  );
  if (deltaSeconds < 60) return "Just now";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  // Display only: the organisation's calendar. Unknown timezone ⇒ explicit UTC date, never a guessed zone.
  if (!timeZone) return `${occurredAt.slice(0, 10)} (UTC)`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(occurredAt));
}

function amountLabel(amount: number | null, currency = "NGN"): string | null {
  if (amount == null) return null;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const FM_SUBMISSION_TITLES: Record<string, string> = {
  payment_request: "Payment request raised",
  contract_instalment: "Contract instalment requested",
  reimbursement_claim: "Reimbursement claim submitted",
};

/** Facility Management activity from its own authoritative records, inside the actor's FM authority and scope. */
async function fmChanges(input: {
  db: SupabaseClient;
  organisationId: string;
  previous: string;
  asOf: string;
  fm: FmChangeVisibility;
  href: (path: string) => string | null;
  timeZone: string | null;
}): Promise<{ items: CommandCentreChangeItem[]; errors: string[] }> {
  const { db, organisationId, previous, asOf, fm, href, timeZone } = input;
  const items: CommandCentreChangeItem[] = [];
  const errors: string[] = [];
  const LIMIT = 20;
  const inWindow = <Q extends { gt: (c: string, v: string) => Q; lte: (c: string, v: string) => Q }>(q: Q, column: string) =>
    q.gt(column, previous).lte(column, asOf);
  const push = (key: string, id: string, title: string, detail: Array<string | null | undefined>, occurredAt: string, path: string) =>
    items.push({
      id: `fm:${key}:${id}`,
      sourceId: id,
      sourceType: "fm_record_event",
      title,
      detail: compact([...detail, "Facility Management"]),
      sourceLabel: "Facility Management",
      occurredAt,
      timeLabel: relativeTime(occurredAt, asOf, timeZone),
      href: href(path),
    });
  /** Imported (migrated) record ids of a table among `ids` — history, never "activity since your visit". */
  const imported = async (table: string, ids: string[]): Promise<Set<string> | null> => {
    if (!ids.length) return new Set();
    const { data, error } = await db
      .from("fm_migration_provenance")
      .select("target_id")
      .eq("organisation_id", organisationId)
      .eq("target_table", table)
      .in("target_id", ids);
    if (error) return null;
    return new Set((data ?? []).map((r) => String(r.target_id)));
  };
  /** Extra facilities of multi-facility records ("Both"), keyed by record id. */
  const extraFacilities = async (table: "fm_work_facilities" | "fm_work_instruction_facilities", column: string, ids: string[]) => {
    const map = new Map<string, string[]>();
    if (!ids.length || fm.scope.unrestricted) return map;
    const { data, error } = await db.from(table).select(`${column},facility_id`).eq("organisation_id", organisationId).in(column, ids);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as Json[]) {
      const key = String(r[column]);
      map.set(key, [...(map.get(key) ?? []), String(r.facility_id)]);
    }
    return map;
  };

  if (fm.operations) {
    // Issues logged.
    try {
      const { data, error } = await inWindow(
        db.from("fm_requests").select("id,code,title,facility_id,created_at").eq("organisation_id", organisationId),
        "created_at"
      ).order("created_at", { ascending: false }).limit(LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as Json[];
      const skip = await imported("fm_requests", rows.map((r) => String(r.id)));
      if (!skip) throw new Error("provenance");
      for (const r of rows) {
        if (skip.has(String(r.id)) || !scopeAllowsFacilities(fm.scope, [text(r.facility_id)])) continue;
        push("issue", String(r.id), "Issue logged", [text(r.title), text(r.code)], String(r.created_at), "/issues");
      }
    } catch {
      errors.push("Facility Management Issues");
    }

    // Work created / completed (operational Work only; imported history is excluded).
    try {
      const select = "id,code,title,facility_id,created_at,completed_at,record_origin";
      const base = () => db.from("fm_work").select(select).eq("organisation_id", organisationId).neq("record_origin", "migrated_historical");
      const [created, completed] = await Promise.all([
        inWindow(base(), "created_at").order("created_at", { ascending: false }).limit(LIMIT),
        inWindow(base(), "completed_at").order("completed_at", { ascending: false }).limit(LIMIT),
      ]);
      if (created.error || completed.error) throw created.error ?? completed.error;
      const rows = [...((created.data ?? []) as Json[]), ...((completed.data ?? []) as Json[])];
      const extra = await extraFacilities("fm_work_facilities", "work_id", [...new Set(rows.map((r) => String(r.id)))]);
      const allowed = (r: Json) => scopeAllowsFacilities(fm.scope, [text(r.facility_id), ...(extra.get(String(r.id)) ?? [])]);
      for (const r of (created.data ?? []) as Json[]) {
        if (allowed(r)) push("work-created", String(r.id), "Work created", [text(r.title), text(r.code)], String(r.created_at), "/work");
      }
      for (const r of (completed.data ?? []) as Json[]) {
        if (allowed(r)) push("work-completed", String(r.id), "Work completed", [text(r.title), text(r.code)], String(r.completed_at), "/work");
      }
    } catch {
      errors.push("Facility Management Work");
    }

    // Work Orders / Job Orders recorded.
    try {
      const { data, error } = await inWindow(
        db.from("fm_work_instructions").select("id,code,title,order_type,facility_id,created_at").eq("organisation_id", organisationId).neq("record_origin", "migrated_historical"),
        "created_at"
      ).order("created_at", { ascending: false }).limit(LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as Json[];
      const extra = await extraFacilities("fm_work_instruction_facilities", "work_instruction_id", rows.map((r) => String(r.id)));
      for (const r of rows) {
        if (!scopeAllowsFacilities(fm.scope, [text(r.facility_id), ...(extra.get(String(r.id)) ?? [])])) continue;
        push("wo-created", String(r.id), r.order_type === "job_order" ? "Job Order recorded" : "Work Order recorded", [text(r.title), text(r.code)], String(r.created_at), "/work-orders");
      }
    } catch {
      errors.push("Facility Management Work Orders");
    }

    // Payment Approvals submitted to the client / decided by the client (their recorded dates).
    try {
      const select = "id,code,title,approval_amount,currency,decision_outcome,submitted_at,decision_at,work_instruction_id,work_id";
      const base = () => db.from("fm_approvals").select(select).eq("organisation_id", organisationId);
      const [submitted, decided] = await Promise.all([
        inWindow(base(), "submitted_at").order("submitted_at", { ascending: false }).limit(LIMIT),
        inWindow(base(), "decision_at").order("decision_at", { ascending: false }).limit(LIMIT),
      ]);
      if (submitted.error || decided.error) throw submitted.error ?? decided.error;
      const rows = [...((submitted.data ?? []) as Json[]), ...((decided.data ?? []) as Json[])];
      const skip = await imported("fm_approvals", [...new Set(rows.map((r) => String(r.id)))]);
      if (!skip) throw new Error("provenance");
      // An Approval's facility is derived through its Work Order or Work (as FM's own Approvals scope does).
      const facilityOf = new Map<string, string | null>();
      if (!fm.scope.unrestricted) {
        for (const [table, column] of [["fm_work_instructions", "work_instruction_id"], ["fm_work", "work_id"]] as const) {
          const ids = [...new Set(rows.map((r) => text(r[column])).filter(Boolean) as string[])];
          if (!ids.length) continue;
          const { data: parents, error: parentError } = await db.from(table).select("id,facility_id").eq("organisation_id", organisationId).in("id", ids);
          if (parentError) throw parentError;
          for (const p of (parents ?? []) as Json[]) facilityOf.set(String(p.id), text(p.facility_id));
        }
      }
      const allowed = (r: Json) => {
        if (fm.scope.unrestricted) return true;
        const parent = text(r.work_instruction_id) ?? text(r.work_id);
        if (!parent) return fm.scope.includeUnattributed;
        return scopeAllowsFacilities(fm.scope, [facilityOf.get(parent) ?? null]);
      };
      const amount = (r: Json) => amountLabel(r.approval_amount == null ? null : Number(r.approval_amount), text(r.currency) ?? "NGN");
      for (const r of (submitted.data ?? []) as Json[]) {
        if (skip.has(String(r.id)) || !allowed(r)) continue;
        push("approval-submitted", String(r.id), "Payment Approval submitted to the client", [text(r.title), amount(r)], String(r.submitted_at), "/approvals");
      }
      for (const r of (decided.data ?? []) as Json[]) {
        if (skip.has(String(r.id)) || !allowed(r)) continue;
        const outcome = text(r.decision_outcome);
        push("approval-decided", String(r.id), outcome ? `Payment Approval decision recorded: ${outcome.replaceAll("_", " ")}` : "Payment Approval decision recorded", [text(r.title), amount(r)], String(r.decision_at), "/approvals");
      }
    } catch {
      errors.push("Facility Management Payment Approvals");
    }
  }

  if (fm.costsClaims) {
    // Pending Payments raised (their submission date) and receipts recorded against them.
    try {
      const { data, error } = await inWindow(
        db.from("fm_cost_submissions").select("id,code,submission_kind,description,period_label,claim_amount,currency,facility_id,submitted_at").eq("organisation_id", organisationId),
        "submitted_at"
      ).order("submitted_at", { ascending: false }).limit(LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as Json[];
      const skip = await imported("fm_cost_submissions", rows.map((r) => String(r.id)));
      if (!skip) throw new Error("provenance");
      for (const r of rows) {
        if (skip.has(String(r.id)) || !scopeAllowsFmWide(fm.scope, text(r.facility_id))) continue;
        push(
          "payment-raised", String(r.id),
          FM_SUBMISSION_TITLES[String(r.submission_kind)] ?? "Pending payment raised",
          [text(r.period_label) ?? text(r.description), amountLabel(r.claim_amount == null ? null : Number(r.claim_amount), text(r.currency) ?? "NGN"), text(r.code)],
          String(r.submitted_at), `/finance/submissions/${encodeURIComponent(String(r.code))}`
        );
      }
    } catch {
      errors.push("Facility Management Pending Payments");
    }

    try {
      const { data, error } = await inWindow(
        db.from("fm_reimbursement_payments").select("id,submission_id,received_amount,currency,received_at,created_at").eq("organisation_id", organisationId),
        "created_at"
      ).order("created_at", { ascending: false }).limit(LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as Json[];
      const subIds = [...new Set(rows.map((r) => String(r.submission_id)))];
      const subs = new Map<string, Json>();
      if (subIds.length) {
        const { data: s, error: subError } = await db.from("fm_cost_submissions").select("id,code,period_label,description,facility_id").eq("organisation_id", organisationId).in("id", subIds);
        if (subError) throw subError;
        for (const row of (s ?? []) as Json[]) subs.set(String(row.id), row);
      }
      for (const r of rows) {
        const sub = subs.get(String(r.submission_id));
        // A receipt is in scope exactly when its Pending Payment is.
        if (!sub || !scopeAllowsFmWide(fm.scope, text(sub.facility_id))) continue;
        push(
          "receipt", String(r.id), "Payment received",
          [text(sub.period_label) ?? text(sub.description), amountLabel(Number(r.received_amount), text(r.currency) ?? "NGN"), text(sub.code)],
          String(r.created_at), `/finance/submissions/${encodeURIComponent(String(sub.code))}`
        );
      }
    } catch {
      errors.push("Facility Management receipts");
    }
  }

  // Commercial follow-ups on a Work Order (operations) or a Pending Payment (Costs & Claims).
  if (fm.operations || fm.costsClaims) {
    try {
      const { data, error } = await inWindow(
        db.from("fm_commercial_follow_ups").select("id,work_instruction_id,cost_submission_id,method,followed_up_at,created_at").eq("organisation_id", organisationId),
        "created_at"
      ).order("created_at", { ascending: false }).limit(LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as Json[];
      const wiIds = [...new Set(rows.map((r) => text(r.work_instruction_id)).filter(Boolean) as string[])];
      const subIds = [...new Set(rows.map((r) => text(r.cost_submission_id)).filter(Boolean) as string[])];
      const [wis, subs, extra] = await Promise.all([
        wiIds.length ? db.from("fm_work_instructions").select("id,code,title,facility_id").eq("organisation_id", organisationId).in("id", wiIds) : Promise.resolve({ data: [], error: null }),
        subIds.length ? db.from("fm_cost_submissions").select("id,code,period_label,description,facility_id").eq("organisation_id", organisationId).in("id", subIds) : Promise.resolve({ data: [], error: null }),
        extraFacilities("fm_work_instruction_facilities", "work_instruction_id", wiIds),
      ]);
      if (wis.error || subs.error) throw wis.error ?? subs.error;
      const wiById = new Map(((wis.data ?? []) as Json[]).map((w) => [String(w.id), w]));
      const subById = new Map(((subs.data ?? []) as Json[]).map((x) => [String(x.id), x]));
      for (const r of rows) {
        const wi = text(r.work_instruction_id) ? wiById.get(String(r.work_instruction_id)) : undefined;
        const sub = text(r.cost_submission_id) ? subById.get(String(r.cost_submission_id)) : undefined;
        if (wi && fm.operations && scopeAllowsFacilities(fm.scope, [text(wi.facility_id), ...(extra.get(String(wi.id)) ?? [])])) {
          push("follow-up", String(r.id), "Follow-up recorded", [text(wi.title), text(r.method), text(wi.code)], String(r.created_at), "/work-orders");
        } else if (sub && fm.costsClaims && scopeAllowsFmWide(fm.scope, text(sub.facility_id))) {
          push("follow-up", String(r.id), "Follow-up recorded", [text(sub.period_label) ?? text(sub.description), text(r.method), text(sub.code)], String(r.created_at), `/finance/submissions/${encodeURIComponent(String(sub.code))}`);
        }
      }
    } catch {
      errors.push("Facility Management follow-ups");
    }
  }

  return { items, errors };
}

export async function composeLastVisitChanges(input: {
  db: SupabaseClient;
  organisationId: string;
  previous: string;
  asOf: string;
  visibility: DomainVisibility;
  workspaceEntry: WorkspaceEntry;
  /** Authoritative organisation IANA timezone for display (null when unavailable). */
  timeZone: string | null;
}): Promise<{ items: CommandCentreChangeItem[]; sourceErrors: string[] }> {
  const { db, organisationId, previous, asOf, visibility, workspaceEntry, timeZone } = input;
  const sourceErrors: string[] = [];
  const items: CommandCentreChangeItem[] = [];

  if (visibility.finance) {
    const { data, error } = await db
      .from("finance_request_events")
      .select("id,request_id,event_type,created_at")
      .eq("organisation_id", organisationId)
      .gt("created_at", previous)
      .lte("created_at", asOf)
      .in("event_type", Object.keys(FINANCE_REQUEST_TITLES))
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      sourceErrors.push("Finance");
    } else {
      const requestIds = [...new Set((data ?? []).map((row) => String(row.request_id)))];
      const requestById = new Map<string, Json>();
      if (requestIds.length) {
        const { data: requests, error: requestError } = await db
          .from("finance_requests")
          .select("id,company_id,purpose,requested_amount,currency")
          .eq("organisation_id", organisationId)
          .in("id", requestIds);
        if (requestError) sourceErrors.push("Finance records");
        for (const request of requests ?? []) {
          requestById.set(String(request.id), request as Json);
        }
      }
      const financeCompanies = new Set(visibility.finance.companyIds);
      for (const row of data ?? []) {
        const requestId = String(row.request_id);
        const request = requestById.get(requestId);
        // Only records in the actor's Finance companies; a record whose company cannot be established is not shown.
        if (!request || !financeCompanies.has(String(request.company_id))) continue;
        const occurredAt = String(row.created_at);
        items.push({
          id: `finance:${row.id}`,
          sourceId: String(row.id),
          sourceType: "finance_request_event",
          title: FINANCE_REQUEST_TITLES[String(row.event_type)]!,
          detail: compact([
            text(request?.purpose) ?? "Financial request",
            amountLabel(number(request?.requested_amount), text(request?.currency) ?? "NGN"),
            "Finance",
          ]),
          sourceLabel: "Finance",
          occurredAt,
          timeLabel: relativeTime(occurredAt, asOf, timeZone),
          href: workspaceEntry.platformFinance
            ? `/platform-finance/requests/${requestId}`
            : null,
        });
      }
    }

    const { data: audits, error: auditError } = await db
      .from("finance_audit_events")
      .select("id,action,object_type,object_id,details,created_at")
      .eq("organisation_id", organisationId)
      .gt("created_at", previous)
      .lte("created_at", asOf)
      .in("action", Object.keys(FINANCE_AUDIT_TITLES))
      .order("created_at", { ascending: false })
      .limit(20);
    if (auditError) {
      sourceErrors.push("Finance audit");
    } else {
      const transactionIds = (audits ?? [])
        .filter((row) => row.object_type === "finance_transaction")
        .map((row) => String(row.object_id));
      const billIds = (audits ?? [])
        .filter((row) => row.object_type === "finance_vendor_bill")
        .map((row) => String(row.object_id));
      const transactionById = new Map<string, Json>();
      const billById = new Map<string, Json>();
      if (transactionIds.length) {
        const { data: transactions, error: transactionError } = await db
          .from("finance_transactions")
          .select("id,company_id,reference,description,amount,currency")
          .eq("organisation_id", organisationId)
          .in("id", transactionIds);
        if (transactionError) sourceErrors.push("Finance transactions");
        for (const transaction of transactions ?? []) {
          transactionById.set(String(transaction.id), transaction as Json);
        }
      }
      if (billIds.length) {
        const { data: bills, error: billError } = await db
          .from("finance_vendor_bills")
          .select("id,company_id,purpose,billed_amount,currency")
          .eq("organisation_id", organisationId)
          .in("id", billIds);
        if (billError) sourceErrors.push("Finance vendor bills");
        for (const bill of bills ?? []) {
          billById.set(String(bill.id), bill as Json);
        }
      }
      const periodIds = (audits ?? [])
        .filter((row) => row.object_type === "finance_period")
        .map((row) => String(row.object_id));
      const periodCompany = new Map<string, string>();
      if (periodIds.length) {
        const { data: periods, error: periodError } = await db
          .from("finance_periods")
          .select("id,company_id")
          .eq("organisation_id", organisationId)
          .in("id", periodIds);
        if (periodError) sourceErrors.push("Finance periods");
        for (const period of periods ?? []) periodCompany.set(String(period.id), String(period.company_id));
      }
      const auditCompanies = new Set(visibility.finance.companyIds);
      for (const row of audits ?? []) {
        const transaction = transactionById.get(String(row.object_id));
        const bill = billById.get(String(row.object_id));
        const companyId = text(transaction?.company_id) ?? text(bill?.company_id) ?? periodCompany.get(String(row.object_id)) ?? null;
        if (!companyId || !auditCompanies.has(companyId)) continue;
        const details = (row.details ?? {}) as Json;
        const occurredAt = String(row.created_at);
        items.push({
          id: `finance-audit:${row.id}`,
          sourceId: String(row.id),
          sourceType: "finance_audit_event",
          title: FINANCE_AUDIT_TITLES[String(row.action)]!,
          detail: compact([
            text(transaction?.description) ??
              text(transaction?.reference) ??
              text(bill?.purpose),
            amountLabel(
              number(transaction?.amount) ??
                number(bill?.billed_amount) ??
                number(details.total_debit),
              text(transaction?.currency) ?? text(bill?.currency) ?? "NGN"
            ),
            "Finance",
          ]),
          sourceLabel: "Finance",
          occurredAt,
          timeLabel: relativeTime(occurredAt, asOf, timeZone),
          href: workspaceEntry.platformFinance ? "/platform-finance" : null,
        });
      }
    }
  }

  if (visibility.ecc) {
    const { data, error } = await db
      .from("ecc_audit_events")
      .select("id,action,entity_type,entity_id,description,created_at")
      .eq("organisation_id", organisationId)
      .gt("created_at", previous)
      .lte("created_at", asOf)
      .in("action", Object.keys(ECC_TITLES))
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) sourceErrors.push("ECC");
    for (const row of data ?? []) {
      const occurredAt = String(row.created_at);
      items.push({
        id: `ecc:${row.id}`,
        sourceId: String(row.id),
        sourceType: "ecc_audit_event",
        title: ECC_TITLES[String(row.action)]!,
        detail: compact([text(row.description), "ECC"]),
        sourceLabel: "ECC",
        occurredAt,
        timeLabel: relativeTime(occurredAt, asOf, timeZone),
        href: workspaceEntry.eccOperations ? "/ecc-operations" : null,
      });
    }
  }

  if (visibility.fm && (visibility.fm.operations || visibility.fm.costsClaims)) {
    const fmResult = await fmChanges({
      db,
      organisationId,
      previous,
      asOf,
      fm: visibility.fm,
      href: (path) => (workspaceEntry.facilityManagement ? path : null),
      timeZone,
    });
    items.push(...fmResult.items);
    sourceErrors.push(...fmResult.errors);
  }

  return {
    items: items
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, 4),
    sourceErrors,
  };
}
