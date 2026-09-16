"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  ExternalLink,
  Eye,
  Search,
  X,
} from "lucide-react";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  PlatformFinancePayablesService,
  type FinancePayableCapabilities,
  type FinancePayableDetail,
} from "@/services/platform-finance/PlatformFinancePayablesService";
import type { FinancePeriod } from "@/modules/platform-finance/types";
import {
  FINANCE_PAYABLE_SOURCE_TYPES,
  type FinancePayableSourceType,
  type FinancePayableStatus,
  type FinancePayableView,
} from "@/modules/platform-finance/domain/payables";

type RegisterTab = "all" | "mine" | "review";
type DrawerTab = "overview" | "documents" | "history";

type AccessibleCompany = {
  id: string;
  code: string;
  name: string;
  status: string;
};

const STATUS_LABELS: Record<FinancePayableStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  scheduled: "Scheduled",
  payment_pending: "Payment Pending",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const STATUS_FILTER_GROUPS: ReadonlyArray<{
  label: string;
  statuses: readonly FinancePayableStatus[];
}> = [
  {
    label: "Approval",
    statuses: ["draft", "pending_approval", "approved", "rejected"],
  },
  {
    label: "Settlement",
    statuses: ["scheduled", "payment_pending", "paid"],
  },
  {
    label: "Exceptions",
    statuses: ["cancelled", "disputed"],
  },
];

const STATUS_TONE: Record<FinancePayableStatus, string> = {
  draft: "is-muted",
  pending_approval: "is-info",
  approved: "is-success",
  scheduled: "is-amber",
  payment_pending: "is-amber",
  paid: "is-success",
  rejected: "is-danger",
  cancelled: "is-muted",
  disputed: "is-purple",
};

const SOURCE_LABELS: Record<FinancePayableSourceType, string> = {
  financial_request: "Financial Request",
  vendor_bill: "Vendor Bill",
};

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  payment_initiated: "Payment initiated",
  paid: "Paid",
  cancelled: "Cancelled",
  disputed: "Disputed",
  document_added: "Document added",
  document_removed: "Document removed",
  document_superseded: "Document superseded",
  field_changed: "Field changed",
};

const OPEN_OBLIGATION: ReadonlySet<FinancePayableStatus> = new Set([
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "payment_pending",
  "disputed",
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

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function payableReference(payable: FinancePayableView): string {
  return payable.id.slice(0, 8).toUpperCase();
}

function periodLabel(p: FinancePeriod): string {
  const month = new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleString(
    "en-GB",
    { month: "short", timeZone: "UTC" }
  );
  const open = p.status === "open" ? " (Open)" : "";
  return `${month} ${p.year}${open}`;
}

function startOfTodayLocal(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function dueDateParts(iso: string | null | undefined): {
  overdue: boolean;
  dueSoon: boolean;
  days: number | null;
} {
  if (!iso) return { overdue: false, dueSoon: false, days: null };
  const target = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return { overdue: false, dueSoon: false, days: null };
  }
  const today = startOfTodayLocal();
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return {
    overdue: diffDays < 0,
    dueSoon: diffDays >= 0 && diffDays <= 7,
    days: diffDays,
  };
}

function inPeriod(
  payable: FinancePayableView,
  period: FinancePeriod | undefined
): boolean {
  if (!period) return true;
  if (payable.periodId) return payable.periodId === period.id;
  const start = new Date(Date.UTC(period.year, period.month - 1, 1));
  const end = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59));
  const candidates = [payable.dueDate, payable.createdAt].filter(
    Boolean
  ) as string[];
  if (candidates.length === 0) return false;
  return candidates.some((iso) => {
    const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
    return !Number.isNaN(d.getTime()) && d >= start && d <= end;
  });
}

export function PlatformFinancePayablesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payables, setPayables] = useState<FinancePayableView[]>([]);
  const [companies, setCompanies] = useState<AccessibleCompany[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [caps, setCaps] = useState<FinancePayableCapabilities | null>(null);

  const [tab, setTab] = useState<RegisterTab>("all");
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FinancePayableDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<
    null | "query" | "reject" | "partial"
  >(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [docBusyId, setDocBusyId] = useState<string | null>(null);

  const companyById = useMemo(() => {
    const map = new Map<string, AccessibleCompany>();
    for (const c of companies) map.set(c.id, c);
    return map;
  }, [companies]);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === periodId),
    [periods, periodId]
  );

  const singleCompany = companies.length === 1 ? companies[0] : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, cos, capability] = await Promise.all([
        PlatformFinancePayablesService.listAccessiblePayables(),
        PlatformFinancePayablesService.listAccessibleCompanies(),
        PlatformFinancePayablesService.getMyPayableCapabilities(),
      ]);
      setPayables(rows);
      const active = cos.filter((c) => c.status === "active");
      setCompanies(active);
      setCaps(capability);
      if (active.length === 1) {
        setCompanyId(active[0]!.id);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load payables."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function loadPeriods() {
      const effectiveCompanyId = singleCompany?.id || companyId;
      if (!effectiveCompanyId) {
        setPeriods([]);
        setPeriodId("");
        return;
      }
      try {
        const rows = await PlatformFinanceService.listPeriods(effectiveCompanyId);
        if (cancelled) return;
        setPeriods(rows);
        setPeriodId((prev) =>
          prev && rows.some((r) => r.id === prev) ? prev : ""
        );
      } catch {
        if (!cancelled) {
          setPeriods([]);
          setPeriodId("");
        }
      }
    }
    void loadPeriods();
    return () => {
      cancelled = true;
    };
  }, [companyId, singleCompany?.id]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDrawerTab("overview");
    setPendingAction(null);
    setReasonDraft("");
    setActionError(null);
    void PlatformFinancePayablesService.getPayableDetail(selectedId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(
            err instanceof Error ? err.message : "Unable to load payable."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const scopedPayables = useMemo(() => {
    return payables.filter((p) => {
      if (companyId && p.companyId !== companyId) return false;
      return inPeriod(p, selectedPeriod);
    });
  }, [payables, companyId, selectedPeriod]);

  const tabPayables = useMemo(() => {
    const profileId = caps?.profileId;
    switch (tab) {
      case "mine":
        return scopedPayables.filter((p) => p.createdByProfileId === profileId);
      case "review":
        return scopedPayables.filter((p) => p.status === "pending_approval");
      default:
        return scopedPayables;
    }
  }, [scopedPayables, tab, caps?.profileId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabPayables.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (sourceFilter && p.sourceType !== sourceFilter) return false;
      if (!q) return true;
      const company = companyById.get(p.companyId)?.name ?? "";
      const hay = [
        p.payeeName,
        p.description ?? "",
        company,
        payableReference(p),
        p.id,
        p.sourceId,
        SOURCE_LABELS[p.sourceType],
        STATUS_LABELS[p.status],
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tabPayables, statusFilter, sourceFilter, search, companyById]);

  useEffect(() => {
    setPage(1);
  }, [tab, companyId, periodId, search, statusFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (pageSafe - 1) * pageSize,
    pageSafe * pageSize
  );

  const summary = useMemo(() => {
    const outstandingRows = scopedPayables.filter((p) =>
      OPEN_OBLIGATION.has(p.status)
    );
    const outstandingAmount = outstandingRows.reduce(
      (sum, p) => sum + p.outstandingAmount,
      0
    );
    const dueSoonRows = outstandingRows.filter((p) => {
      const d = dueDateParts(p.dueDate);
      return d.dueSoon && !d.overdue;
    });
    const overdueRows = outstandingRows.filter(
      (p) => dueDateParts(p.dueDate).overdue
    );
    const paidRows = scopedPayables.filter((p) => p.status === "paid");
    return {
      outstandingAmount,
      outstandingCount: outstandingRows.length,
      dueSoonAmount: dueSoonRows.reduce((s, p) => s + p.outstandingAmount, 0),
      dueSoonCount: dueSoonRows.length,
      overdueAmount: overdueRows.reduce((s, p) => s + p.outstandingAmount, 0),
      overdueCount: overdueRows.length,
      paidAmount: paidRows.reduce((s, p) => s + p.payableAmount, 0),
      paidCount: paidRows.length,
    };
  }, [scopedPayables]);

  const tabCounts = useMemo(() => {
    const profileId = caps?.profileId;
    return {
      all: scopedPayables.length,
      mine: scopedPayables.filter((p) => p.createdByProfileId === profileId)
        .length,
      review: scopedPayables.filter((p) => p.status === "pending_approval")
        .length,
    };
  }, [scopedPayables, caps?.profileId]);

  const filtersActive =
    Boolean(search.trim()) ||
    Boolean(statusFilter) ||
    Boolean(sourceFilter);

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setSourceFilter("");
  }

  async function refreshAfterAction(payableId: string) {
    await load();
    const next = await PlatformFinancePayablesService.getPayableDetail(payableId);
    setDetail(next);
    setPendingAction(null);
    setReasonDraft("");
    setPartialAmount("");
    setActionError(null);
  }

  async function runAction(fn: () => Promise<unknown>): Promise<void> {
    if (!selectedId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await fn();
      await refreshAfterAction(selectedId);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionBusy(false);
    }
  }

  async function openDocument(documentId: string) {
    if (!selectedId) return;
    setDocBusyId(documentId);
    try {
      const { signedUrl } =
        await PlatformFinancePayablesService.getDocumentSignedUrl(
          selectedId,
          documentId
        );
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Unable to open document."
      );
    } finally {
      setDocBusyId(null);
    }
  }

  if (error && !loading && payables.length === 0 && companies.length === 0) {
    return (
      <div className="pf-requests pf-payables">
        <p className="pf-state-message is-error">{error}</p>
      </div>
    );
  }

  if (!loading && companies.length === 0) {
    return (
      <div className="pf-requests pf-payables">
        <header className="pf-ov-header">
          <div>
            <p className="pf-pay-breadcrumb">Finance</p>
            <h1 className="pf-ov-title">Payables</h1>
            <p className="pf-ov-desc">
              Track and manage vendor bills and approved financial request
              payables.
            </p>
          </div>
        </header>
        <div className="pf-empty-box pf-req-empty">
          <p className="pf-empty-title">No company access</p>
          <p className="pf-empty-copy">
            You do not have access to any Finance companies. Ask an
            administrator to grant company access before using Payables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`pf-requests pf-payables${selectedId ? " has-drawer" : ""}`}>
      <header className="pf-ov-header">
        <div>
          <p className="pf-pay-breadcrumb">Finance</p>
          <h1 className="pf-ov-title">Payables</h1>
          <p className="pf-ov-desc">
            Track and manage vendor bills and approved financial request
            payables.
          </p>
        </div>
        <div className="pf-req-controls">
          {singleCompany ? (
            <div className="pf-pay-context-readonly" title="Company">
              <Building2 size={14} aria-hidden />
              <span>{singleCompany.name}</span>
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor="pf-pay-company">
                Company
              </label>
              <div className="pf-req-select-wrap">
                <Building2 size={14} aria-hidden />
                <SearchableSelect
                  id="pf-pay-company"
                  className="pf-req-searchable"
                  aria-label="Company"
                  value={companyId}
                  onChange={setCompanyId}
                  emptyOptionLabel="All companies"
                  allowEmpty
                  options={companies.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  searchPlaceholder="Search companies…"
                />
              </div>
            </>
          )}
          <label className="sr-only" htmlFor="pf-pay-period">
            Select period
          </label>
          <div className="pf-req-select-wrap">
            <CalendarDays size={14} aria-hidden />
            <SearchableSelect
              id="pf-pay-period"
              className="pf-req-searchable"
              aria-label="Select period"
              value={periodId}
              onChange={setPeriodId}
              disabled={
                !(singleCompany?.id || companyId) || periods.length === 0
              }
              emptyOptionLabel={
                !(singleCompany?.id || companyId)
                  ? "Select period"
                  : periods.length === 0
                    ? "No periods"
                    : "All periods"
              }
              placeholder={
                !(singleCompany?.id || companyId)
                  ? "Select period"
                  : periods.length === 0
                    ? "No periods"
                    : "All periods"
              }
              allowEmpty
              options={periods.map((p) => ({
                value: p.id,
                label: periodLabel(p),
              }))}
              searchPlaceholder="Search periods…"
            />
          </div>
        </div>
      </header>

      <div className="pf-req-summary">
        <SummaryCard
          icon={<Coins size={16} />}
          tone="blue"
          label="Outstanding"
          value={formatNaira(summary.outstandingAmount)}
          hint={`${summary.outstandingCount} payable${summary.outstandingCount === 1 ? "" : "s"}`}
        />
        <SummaryCard
          icon={<Clock3 size={16} />}
          tone="amber"
          label="Due Soon"
          value={formatNaira(summary.dueSoonAmount)}
          hint={`${summary.dueSoonCount} payable${summary.dueSoonCount === 1 ? "" : "s"}`}
        />
        <SummaryCard
          icon={<AlertTriangle size={16} />}
          tone="red"
          label="Overdue"
          value={formatNaira(summary.overdueAmount)}
          hint={`${summary.overdueCount} payable${summary.overdueCount === 1 ? "" : "s"}`}
        />
        <SummaryCard
          icon={<CheckCircle2 size={16} />}
          tone="green"
          label="Paid"
          value={formatNaira(summary.paidAmount)}
          hint={`${summary.paidCount} payable${summary.paidCount === 1 ? "" : "s"}`}
        />
      </div>

      <div className="pf-req-tabs" role="tablist" aria-label="Payable views">
        {(
          [
            ["all", "All", tabCounts.all],
            ["mine", "My Payables", tabCounts.mine],
            ["review", "Needs Review", tabCounts.review],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`pf-req-tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      <section className="pf-req-table-card">
        <div className="pf-req-toolbar">
          <div className="pf-req-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search payables (payee, reference, source...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!singleCompany ? (
            <SearchableSelect
              className="pf-req-filter-select"
              aria-label="Company"
              value={companyId}
              onChange={setCompanyId}
              emptyOptionLabel="All companies"
              allowEmpty
              options={companies.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
              searchPlaceholder="Search companies…"
            />
          ) : null}
          <SearchableSelect
            className="pf-req-filter-select"
            aria-label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            emptyOptionLabel="All statuses"
            allowEmpty
            hideSearch
            optionGroups={STATUS_FILTER_GROUPS.map((group) => ({
              label: group.label,
              options: group.statuses.map((s) => ({
                value: s,
                label: STATUS_LABELS[s],
              })),
            }))}
          />
          <SearchableSelect
            className="pf-req-filter-select"
            aria-label="Source"
            value={sourceFilter}
            onChange={setSourceFilter}
            emptyOptionLabel="All sources"
            allowEmpty
            options={FINANCE_PAYABLE_SOURCE_TYPES.map((s) => ({
              value: s,
              label: SOURCE_LABELS[s],
            }))}
            searchPlaceholder="Search source…"
          />
          {filtersActive ? (
            <button
              type="button"
              className="pf-link-btn"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="pf-state-message">Loading payables…</p>
        ) : filtered.length === 0 ? (
          <EmptyRegister
            tab={tab}
            filtered={
              filtersActive || Boolean(companyId) || Boolean(periodId)
            }
          />
        ) : (
          <>
            <div className="pf-req-table-wrap">
              <table className="pf-req-table">
                <thead>
                  <tr>
                    <th>Payable</th>
                    <th>Source</th>
                    <th>Company</th>
                    <th>Amount</th>
                    <th>Outstanding</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const company =
                      companyById.get(row.companyId)?.name ?? "—";
                    const due = dueDateParts(row.dueDate);
                    return (
                      <tr
                        key={row.id}
                        className={
                          selectedId === row.id ? "is-selected" : undefined
                        }
                        onClick={() =>
                          router.push(`/platform-finance/payables/${row.id}`)
                        }
                      >
                        <td>
                          <div className="pf-req-primary">{row.payeeName}</div>
                          <div className="pf-req-meta">
                            {payableReference(row)}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`pf-pay-source ${
                              row.sourceType === "financial_request"
                                ? "is-request"
                                : "is-bill"
                            }`}
                          >
                            {SOURCE_LABELS[row.sourceType]}
                          </span>
                        </td>
                        <td>{company}</td>
                        <td className="pf-req-amount-cell">
                          {formatNaira(row.payableAmount, row.currency)}
                        </td>
                        <td className="pf-req-amount-cell">
                          {formatNaira(row.outstandingAmount, row.currency)}
                        </td>
                        <td>
                          <div
                            className={
                              due.overdue && OPEN_OBLIGATION.has(row.status)
                                ? "pf-pay-due is-overdue"
                                : undefined
                            }
                          >
                            {formatDate(row.dueDate)}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`pf-req-status ${STATUS_TONE[row.status]}`}
                          >
                            {STATUS_LABELS[row.status]}
                          </span>
                        </td>
                        <td>
                          <div className="pf-pay-row-actions">
                            <button
                              type="button"
                              className="pf-icon-btn"
                              aria-label="Quick preview"
                              title="Quick preview"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(row.id);
                              }}
                            >
                              <Eye size={15} aria-hidden />
                            </button>
                            <ChevronRight
                              size={16}
                              className="pf-pay-row-chevron"
                              aria-hidden
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pf-req-pagination">
              <p>
                Showing {(pageSafe - 1) * pageSize + 1}–
                {Math.min(pageSafe * pageSize, filtered.length)} of{" "}
                {filtered.length} payables
              </p>
              <div className="pf-req-page-btns">
                <button
                  type="button"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(
                    Math.max(0, pageSafe - 3),
                    Math.max(0, pageSafe - 3) + 3
                  )
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={n === pageSafe ? "is-active" : undefined}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                <button
                  type="button"
                  disabled={pageSafe >= totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedId ? (
        <PayableDetailDrawer
          loading={detailLoading}
          error={detailError}
          detail={detail}
          companyName={
            detail
              ? companyById.get(detail.payable.companyId)?.name ?? "—"
              : "—"
          }
          caps={caps}
          drawerTab={drawerTab}
          onDrawerTabChange={setDrawerTab}
          onClose={() => setSelectedId(null)}
          actionBusy={actionBusy}
          actionError={actionError}
          pendingAction={pendingAction}
          reasonDraft={reasonDraft}
          partialAmount={partialAmount}
          docBusyId={docBusyId}
          onReasonDraftChange={setReasonDraft}
          onPartialAmountChange={setPartialAmount}
          onPendingActionChange={setPendingAction}
          onOpenDocument={(id) => void openDocument(id)}
          onSubmit={() =>
            void runAction(() =>
              PlatformFinancePayablesService.submitPayable(selectedId)
            )
          }
          onStartReview={() =>
            void runAction(() =>
              PlatformFinancePayablesService.startReview(selectedId)
            )
          }
          onApprove={() =>
            void runAction(() =>
              PlatformFinancePayablesService.approvePayable(selectedId)
            )
          }
          onConfirmQuery={() => {
            if (!reasonDraft.trim()) {
              setActionError("A reason is required.");
              return;
            }
            void runAction(() =>
              PlatformFinancePayablesService.queryPayable(
                selectedId,
                reasonDraft.trim()
              )
            );
          }}
          onConfirmReject={() => {
            if (!reasonDraft.trim()) {
              setActionError("A rejection reason is required.");
              return;
            }
            void runAction(() =>
              PlatformFinancePayablesService.rejectPayable(
                selectedId,
                reasonDraft.trim()
              )
            );
          }}
          onConfirmPartial={() => {
            const amount = Number(partialAmount);
            if (!Number.isFinite(amount) || amount <= 0) {
              setActionError("Enter a valid approved amount.");
              return;
            }
            void runAction(() =>
              PlatformFinancePayablesService.partiallyApprovePayable(
                selectedId,
                amount,
                reasonDraft.trim() || null
              )
            );
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  tone: "blue" | "amber" | "red" | "green";
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className={`pf-req-summary-card is-tinted-${tone}`}>
      <div className={`pf-req-summary-icon is-${tone}`}>{icon}</div>
      <p className="pf-req-summary-label">{label}</p>
      <p className="pf-req-summary-value">{value}</p>
      {hint ? <p className="pf-req-summary-hint">{hint}</p> : null}
    </article>
  );
}

function EmptyRegister({
  tab,
  filtered,
}: {
  tab: RegisterTab;
  filtered: boolean;
}) {
  if (filtered) {
    return (
      <div className="pf-empty-box pf-req-empty">
        <p className="pf-empty-title">No matching payables</p>
        <p className="pf-empty-copy">
          Try clearing filters or adjusting company and period.
        </p>
      </div>
    );
  }
  const copy: Record<RegisterTab, { title: string; body: string }> = {
    all: {
      title: "No payables yet",
      body: "Approved financial requests create payables automatically. Native vendor-bill payables will also appear here when created.",
    },
    mine: {
      title: "No payables of yours",
      body: "Payables you create will show up here.",
    },
    review: {
      title: "Nothing needs review",
      body: "Payables awaiting Finance review will appear in this queue.",
    },
  };
  return (
    <div className="pf-empty-box pf-req-empty">
      <p className="pf-empty-title">{copy[tab].title}</p>
      <p className="pf-empty-copy">{copy[tab].body}</p>
    </div>
  );
}

function PayableDetailDrawer({
  loading,
  error,
  detail,
  companyName,
  caps,
  drawerTab,
  onDrawerTabChange,
  onClose,
  actionBusy,
  actionError,
  pendingAction,
  reasonDraft,
  partialAmount,
  docBusyId,
  onReasonDraftChange,
  onPartialAmountChange,
  onPendingActionChange,
  onOpenDocument,
  onSubmit,
  onStartReview,
  onApprove,
  onConfirmQuery,
  onConfirmReject,
  onConfirmPartial,
}: {
  loading: boolean;
  error: string | null;
  detail: FinancePayableDetail | null;
  companyName: string;
  caps: FinancePayableCapabilities | null;
  drawerTab: DrawerTab;
  onDrawerTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  actionBusy: boolean;
  actionError: string | null;
  pendingAction: null | "query" | "reject" | "partial";
  reasonDraft: string;
  partialAmount: string;
  docBusyId: string | null;
  onReasonDraftChange: (v: string) => void;
  onPartialAmountChange: (v: string) => void;
  onPendingActionChange: (v: null | "query" | "reject" | "partial") => void;
  onOpenDocument: (documentId: string) => void;
  onSubmit: () => void;
  onStartReview: () => void;
  onApprove: () => void;
  onConfirmQuery: () => void;
  onConfirmReject: () => void;
  onConfirmPartial: () => void;
}) {
  const payable = detail?.payable;
  const isOwn = Boolean(
    payable && caps && payable.createdByProfileId === caps.profileId
  );
  const canCreate = Boolean(caps?.create) && isOwn;
  const canReview = Boolean(caps?.review) && !isOwn;
  const canApprove = Boolean(caps?.approve) && !isOwn;

  const showSubmit = canCreate && payable?.status === "draft";
  const showStartReview =
    canReview && payable?.status === "pending_approval";
  const showReviewActions =
    canReview && payable?.status === "pending_approval";
  const showApproveActions =
    canApprove && payable?.status === "pending_approval";

  const activeDocuments =
    detail?.documents.filter((d) => !d.supersededAt) ?? [];
  const sourceRequest = detail?.sourceRequest;

  return (
    <aside className="pf-req-drawer" aria-label="Payable details">
      <div className="pf-req-drawer-head">
        <div>
          <p className="pf-req-drawer-ref">Payable Details</p>
          {payable ? (
            <span className={`pf-req-status ${STATUS_TONE[payable.status]}`}>
              {STATUS_LABELS[payable.status]}
            </span>
          ) : null}
        </div>
        <div className="pf-req-drawer-head-actions">
          {payable ? (
            <Link
              href={`/platform-finance/payables/${payable.id}`}
              className="pf-btn-secondary"
            >
              Open payable
            </Link>
          ) : null}
          <button
            type="button"
            className="pf-icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="pf-state-message">Loading payable…</p>
      ) : error ? (
        <p className="pf-state-message is-error">{error}</p>
      ) : !payable ? (
        <p className="pf-state-message">Payable not found.</p>
      ) : (
        <>
          <div className="pf-req-drawer-body">
            <h2 className="pf-req-drawer-title">{payable.payeeName}</h2>
            <p className="pf-req-drawer-cat">{payableReference(payable)}</p>

            <div className="pf-req-drawer-tabs" role="tablist">
              {(
                [
                  ["overview", "Overview"],
                  [
                    "documents",
                    `Documents (${activeDocuments.length})`,
                  ],
                  ["history", `History (${detail?.events.length ?? 0})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={`pf-req-drawer-tab${
                    drawerTab === id ? " is-active" : ""
                  }`}
                  aria-selected={drawerTab === id}
                  onClick={() => onDrawerTabChange(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {drawerTab === "overview" ? (
              <div className="pf-req-drawer-section">
                <dl className="pf-req-dl">
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <span
                        className={`pf-pay-source ${
                          payable.sourceType === "financial_request"
                            ? "is-request"
                            : "is-bill"
                        }`}
                      >
                        {SOURCE_LABELS[payable.sourceType]}
                      </span>
                      {payable.sourceType === "financial_request" ? (
                        <Link
                          href={`/platform-finance/requests/${payable.sourceId}`}
                          className="pf-pay-source-link"
                        >
                          {sourceRequest?.purpose
                            ? sourceRequest.purpose
                            : payable.sourceId.slice(0, 8).toUpperCase()}
                          <ExternalLink size={12} aria-hidden />
                        </Link>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>{companyName}</dd>
                  </div>
                  <div>
                    <dt>Payee</dt>
                    <dd>{payable.payeeName}</dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      {formatNaira(payable.payableAmount, payable.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Paid</dt>
                    <dd>
                      {formatNaira(payable.paidAmount, payable.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>
                      {formatNaira(
                        payable.outstandingAmount,
                        payable.currency
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Due Date</dt>
                    <dd>{formatDate(payable.dueDate)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span
                        className={`pf-req-status ${STATUS_TONE[payable.status]}`}
                      >
                        {STATUS_LABELS[payable.status]}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDateTime(payable.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{formatDateTime(payable.updatedAt)}</dd>
                  </div>
                </dl>
                {payable.description ? (
                  <>
                    <h3>Description</h3>
                    <p className="pf-req-drawer-purpose">
                      {payable.description}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {drawerTab === "documents" ? (
              <div className="pf-req-drawer-section">
                {activeDocuments.length === 0 ? (
                  <p className="pf-state-message">No documents attached.</p>
                ) : (
                  <ul className="pf-req-doc-list">
                    {activeDocuments.map((doc) => (
                      <li key={doc.id}>
                        <div>
                          <strong>{doc.filename}</strong>
                          <span>
                            {doc.documentRole} ·{" "}
                            {formatDateTime(doc.uploadedAt)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="pf-link-btn"
                          disabled={docBusyId === doc.id}
                          onClick={() => onOpenDocument(doc.id)}
                        >
                          {docBusyId === doc.id ? "Opening…" : "Open"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {drawerTab === "history" ? (
              <div className="pf-req-drawer-section">
                {(detail?.events.length ?? 0) === 0 ? (
                  <p className="pf-state-message">No history yet.</p>
                ) : (
                  <ol className="pf-req-activity">
                    {detail!.events.map((event) => (
                      <li key={event.id}>
                        <strong>
                          {EVENT_LABELS[event.eventType] ?? event.eventType}
                        </strong>
                        <span>{formatDateTime(event.createdAt)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}
          </div>

          <div className="pf-req-drawer-footer">
            {actionError ? (
              <p className="pf-state-message is-error">{actionError}</p>
            ) : null}

            {pendingAction === "query" ? (
              <div className="pf-req-action-form">
                <label>
                  Query reason
                  <textarea
                    value={reasonDraft}
                    onChange={(e) => onReasonDraftChange(e.target.value)}
                    rows={3}
                  />
                </label>
                <div className="pf-req-action-row">
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => onPendingActionChange(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pf-btn-primary"
                    disabled={actionBusy}
                    onClick={onConfirmQuery}
                  >
                    Send query
                  </button>
                </div>
              </div>
            ) : null}

            {pendingAction === "reject" ? (
              <div className="pf-req-action-form">
                <label>
                  Rejection reason
                  <textarea
                    value={reasonDraft}
                    onChange={(e) => onReasonDraftChange(e.target.value)}
                    rows={3}
                  />
                </label>
                <div className="pf-req-action-row">
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => onPendingActionChange(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pf-btn-danger-outline"
                    disabled={actionBusy}
                    onClick={onConfirmReject}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}

            {pendingAction === "partial" ? (
              <div className="pf-req-action-form">
                <label>
                  Approved amount
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={partialAmount}
                    onChange={(e) => onPartialAmountChange(e.target.value)}
                  />
                </label>
                <label>
                  Notes (optional)
                  <textarea
                    value={reasonDraft}
                    onChange={(e) => onReasonDraftChange(e.target.value)}
                    rows={2}
                  />
                </label>
                <div className="pf-req-action-row">
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => onPendingActionChange(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pf-btn-primary"
                    disabled={actionBusy}
                    onClick={onConfirmPartial}
                  >
                    Partially approve
                  </button>
                </div>
              </div>
            ) : null}

            {!pendingAction ? (
              <div className="pf-req-action-row">
                {payable.sourceType === "financial_request" ? (
                  <Link
                    href={`/platform-finance/requests/${payable.sourceId}`}
                    className="pf-btn-secondary"
                  >
                    View Financial Request
                    <ExternalLink size={14} aria-hidden />
                  </Link>
                ) : null}
                {showSubmit ? (
                  <button
                    type="button"
                    className="pf-btn-primary"
                    disabled={actionBusy}
                    onClick={onSubmit}
                  >
                    Submit
                  </button>
                ) : null}
                {showStartReview ? (
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={onStartReview}
                  >
                    Start review
                  </button>
                ) : null}
                {showReviewActions ? (
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => onPendingActionChange("query")}
                  >
                    Query
                  </button>
                ) : null}
                {showApproveActions ? (
                  <>
                    <button
                      type="button"
                      className="pf-btn-primary"
                      disabled={actionBusy}
                      onClick={onApprove}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="pf-btn-secondary"
                      disabled={actionBusy}
                      onClick={() => onPendingActionChange("partial")}
                    >
                      Partial
                    </button>
                    <button
                      type="button"
                      className="pf-btn-danger-outline"
                      disabled={actionBusy}
                      onClick={() => onPendingActionChange("reject")}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="pf-btn-secondary"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </aside>
  );
}
