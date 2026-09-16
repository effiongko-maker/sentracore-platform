"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  PlatformFinanceVendorBillsService,
  type FinanceVendorBillProfileSummary,
} from "@/services/platform-finance/PlatformFinanceVendorBillsService";
import {
  type FinanceVendorBill,
  type FinanceVendorBillStatus,
} from "@/modules/platform-finance/domain/vendorBills";

type StatusFilter =
  | "all"
  | "draft"
  | "under_review"
  | "pending_ceo"
  | "approved"
  | "rejected";

const STATUS_LABELS: Record<FinanceVendorBillStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  query: "Query",
  resubmitted: "Resubmitted",
  pending_ceo_approval: "Pending CEO",
  approved: "Approved",
  partially_approved: "Partially Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<FinanceVendorBillStatus, string> = {
  draft: "is-muted",
  submitted: "is-info",
  under_review: "is-info",
  query: "is-danger",
  resubmitted: "is-info",
  pending_ceo_approval: "is-amber",
  approved: "is-success",
  partially_approved: "is-success",
  rejected: "is-danger",
};

const UNDER_REVIEW_STATUSES: ReadonlySet<FinanceVendorBillStatus> = new Set([
  "submitted",
  "under_review",
  "query",
  "resubmitted",
]);

const APPROVED_STATUSES: ReadonlySet<FinanceVendorBillStatus> = new Set([
  "approved",
  "partially_approved",
]);

function formatNaira(amount: number, currency = "NGN"): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function billReference(bill: FinanceVendorBill): string {
  const inv = bill.invoiceReference?.trim();
  if (inv) return inv;
  return `VB-${bill.id.slice(0, 8).toUpperCase()}`;
}

function shortName(fullName: string | null | undefined, fallbackId: string): string {
  const name = fullName?.trim();
  if (!name) return fallbackId.slice(0, 8).toUpperCase();
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0]}. ${parts[parts.length - 1]}`;
  }
  return name;
}

function matchesFilter(bill: FinanceVendorBill, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "draft") return bill.status === "draft";
  if (filter === "under_review") return UNDER_REVIEW_STATUSES.has(bill.status);
  if (filter === "pending_ceo") return bill.status === "pending_ceo_approval";
  if (filter === "approved") return APPROVED_STATUSES.has(bill.status);
  if (filter === "rejected") return bill.status === "rejected";
  return true;
}

export function PlatformFinanceVendorBillsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bills, setBills] = useState<FinanceVendorBill[]>([]);
  const [inputters, setInputters] = useState<
    Record<string, FinanceVendorBillProfileSummary>
  >({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listResult =
        await PlatformFinanceVendorBillsService.listAccessibleVendorBills();
      setBills(listResult.vendorBills);
      const map: Record<string, FinanceVendorBillProfileSummary> = {};
      for (const p of listResult.inputters) map[p.id] = p;
      setInputters(map);
    } catch (err: unknown) {
      setBills([]);
      setError(
        err instanceof Error ? err.message : "Unable to load vendor bills."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const next = {
      all: bills.length,
      draft: 0,
      under_review: 0,
      pending_ceo: 0,
      approved: 0,
      rejected: 0,
    };
    for (const bill of bills) {
      if (bill.status === "draft") next.draft += 1;
      else if (UNDER_REVIEW_STATUSES.has(bill.status)) next.under_review += 1;
      else if (bill.status === "pending_ceo_approval") next.pending_ceo += 1;
      else if (APPROVED_STATUSES.has(bill.status)) next.approved += 1;
      else if (bill.status === "rejected") next.rejected += 1;
    }
    return next;
  }, [bills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills.filter((bill) => {
      if (!matchesFilter(bill, filter)) return false;
      if (!q) return true;
      const creator =
        inputters[bill.inputterProfileId]?.fullName?.toLowerCase() ?? "";
      const hay = [
        billReference(bill),
        bill.payeeName,
        bill.purpose,
        bill.description ?? "",
        bill.invoiceReference ?? "",
        creator,
        STATUS_LABELS[bill.status],
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [bills, filter, search, inputters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (pageSafe - 1) * pageSize,
    pageSafe * pageSize
  );
  const showingFrom = filtered.length === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const showingTo = Math.min(pageSafe * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  return (
    <div className="pf-requests pf-vendor-bills">
      <header className="pf-ov-header">
        <div>
          <h1 className="pf-ov-title">Vendor Bills</h1>
          <p className="pf-ov-desc">
            Manage invoices and external obligations.
          </p>
        </div>
        <div className="pf-req-controls pf-vb-page-actions">
          <label className="pf-req-search pf-vb-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor bills..."
              aria-label="Search vendor bills"
            />
          </label>
          <Link
            href="/platform-finance/vendor-bills/new"
            className="pf-btn-primary"
          >
            <Plus size={16} aria-hidden />
            New Vendor Bill
          </Link>
        </div>
      </header>

      <div className="pf-req-tabs pf-vb-filter-tabs" role="tablist">
        {(
          [
            ["all", "All", counts.all],
            ["draft", "Draft", counts.draft],
            ["under_review", "Under Review", counts.under_review],
            ["pending_ceo", "Pending CEO", counts.pending_ceo],
            ["approved", "Approved", counts.approved],
            ["rejected", "Rejected", counts.rejected],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`pf-req-tab${filter === id ? " is-active" : ""}`}
            onClick={() => setFilter(id)}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {error ? (
        <section className="pf-req-table-card">
          <div className="pf-vb-register-empty" role="alert">
            <p className="pf-empty-title">Unable to load vendor bills</p>
            <p className="pf-empty-copy">{error}</p>
            <button
              type="button"
              className="pf-btn-secondary"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        </section>
      ) : (
        <section className="pf-req-table-card">
          {loading ? (
            <div className="pf-vb-register-empty">
              <p className="pf-empty-title">Loading vendor bills…</p>
            </div>
          ) : filtered.length === 0 ? (
            <>
              <div className="pf-req-table-wrap">
                <table className="pf-req-table">
                  <thead>
                    <tr>
                      <th>Ref No</th>
                      <th>Vendor / Payee</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Created by</th>
                    </tr>
                  </thead>
                </table>
              </div>
              <div className="pf-vb-register-empty">
                <p className="pf-empty-title">No vendor bills</p>
                <p className="pf-empty-copy">
                  {bills.length === 0
                    ? "External invoices and obligations will appear here once created."
                    : "No vendor bills match the current filters."}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="pf-req-table-wrap">
                <table className="pf-req-table">
                  <thead>
                    <tr>
                      <th>Ref No</th>
                      <th>Vendor / Payee</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Created by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((bill) => (
                      <tr
                        key={bill.id}
                        className="is-clickable"
                        onClick={() =>
                          router.push(
                            `/platform-finance/vendor-bills/${bill.id}`
                          )
                        }
                      >
                        <td>
                          <span className="pf-req-primary">
                            {billReference(bill)}
                          </span>
                        </td>
                        <td>{bill.payeeName}</td>
                        <td>
                          <span className="pf-req-meta">
                            {bill.purpose || bill.description || "—"}
                          </span>
                        </td>
                        <td className="pf-req-amount-cell">
                          {formatNaira(bill.billedAmount, bill.currency)}
                        </td>
                        <td>
                          <span
                            className={`pf-req-status ${STATUS_TONE[bill.status]}`}
                          >
                            {STATUS_LABELS[bill.status]}
                          </span>
                        </td>
                        <td>
                          {formatDate(
                            bill.invoiceDate ??
                              bill.submittedAt ??
                              bill.createdAt
                          )}
                        </td>
                        <td>
                          {shortName(
                            inputters[bill.inputterProfileId]?.fullName,
                            bill.inputterProfileId
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pf-req-pagination">
                <p>
                  Showing {showingFrom}-{showingTo} of {filtered.length}
                </p>
                <div className="pf-req-page-btns">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={n === pageSafe}
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </button>
                    )
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
