import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import type { CommandCentreChangeItem } from "@/modules/command-centre/presentationTypes";

type WorkspaceEntry = {
  facilityManagement: boolean;
  platformFinance: boolean;
  eccOperations: boolean;
};

type DomainVisibility = {
  operations: boolean;
  finance: boolean;
  ecc: boolean;
};

type Json = Record<string, unknown>;

const OPERATION_TITLES: Record<string, string> = {
  [OperationalEventTypes.FACILITY_INCIDENT_REPORTED]: "Incident reported",
  [OperationalEventTypes.FACILITY_INCIDENT_TRIAGED]: "Incident triaged",
  [OperationalEventTypes.FACILITY_INCIDENT_ESCALATED]: "Critical issue escalated",
  [OperationalEventTypes.FACILITY_INCIDENT_RESOLVED]: "Incident resolved",
  [OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED]: "Maintenance requested",
  [OperationalEventTypes.FACILITY_MAINTENANCE_SCHEDULED]: "Maintenance scheduled",
  [OperationalEventTypes.FACILITY_MAINTENANCE_STARTED]: "Maintenance started",
  [OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED]: "Maintenance completed",
  [OperationalEventTypes.FACILITY_WORK_ORDER_CREATED]: "Work order created",
  [OperationalEventTypes.FACILITY_WORK_ORDER_ASSIGNED]: "Work order assigned",
  [OperationalEventTypes.FACILITY_WORK_ORDER_STARTED]: "Work order started",
  [OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED]: "Work order completed",
  [OperationalEventTypes.FACILITY_APPROVAL_SUBMITTED]: "Client approval submitted",
  [OperationalEventTypes.FACILITY_APPROVAL_APPROVED]: "Client approval approved",
  [OperationalEventTypes.FACILITY_APPROVAL_PARTIALLY_APPROVED]: "Client approval partially approved",
  [OperationalEventTypes.FACILITY_APPROVAL_REJECTED]: "Client approval rejected",
  [OperationalEventTypes.FACILITY_REQUEST_CREATED]: "Operational request created",
  [OperationalEventTypes.FACILITY_REQUEST_RESOLVED]: "Operational request resolved",
};

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

  if (visibility.operations) {
    const { data, error } = await db
      .from("operational_events")
      .select("id,event_type,entity_type,entity_id,occurred_at,data")
      .eq("organisation_id", organisationId)
      .gt("occurred_at", previous)
      .lte("occurred_at", asOf)
      .in("event_type", Object.keys(OPERATION_TITLES))
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (error) sourceErrors.push("Operations");
    for (const row of data ?? []) {
      const eventData = (row.data ?? {}) as Json;
      const entityId = text(row.entity_id);
      const description = text(eventData.title) ?? text(eventData.description);
      const amount = amountLabel(
        number(eventData.approvedAmount) ?? number(eventData.approvalAmount)
      );
      items.push({
        id: `operations:${row.id}`,
        sourceId: String(row.id),
        sourceType: "operational_event",
        title: OPERATION_TITLES[String(row.event_type)]!,
        detail: compact([description, amount, entityId, "Operations"]),
        sourceLabel: "Operations",
        occurredAt: String(row.occurred_at),
        timeLabel: relativeTime(String(row.occurred_at), asOf, timeZone),
        href: workspaceEntry.facilityManagement ? "/operations" : null,
      });
    }
  }

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
          .select("id,purpose,requested_amount,currency")
          .eq("organisation_id", organisationId)
          .in("id", requestIds);
        if (requestError) sourceErrors.push("Finance records");
        for (const request of requests ?? []) {
          requestById.set(String(request.id), request as Json);
        }
      }
      for (const row of data ?? []) {
        const requestId = String(row.request_id);
        const request = requestById.get(requestId);
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
          .select("id,reference,description,amount,currency")
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
          .select("id,purpose,billed_amount,currency")
          .eq("organisation_id", organisationId)
          .in("id", billIds);
        if (billError) sourceErrors.push("Finance vendor bills");
        for (const bill of bills ?? []) {
          billById.set(String(bill.id), bill as Json);
        }
      }
      for (const row of audits ?? []) {
        const transaction = transactionById.get(String(row.object_id));
        const bill = billById.get(String(row.object_id));
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

  return {
    items: items
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, 4),
    sourceErrors,
  };
}
