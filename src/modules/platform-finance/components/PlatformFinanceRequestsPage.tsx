"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  MoreVertical,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  PlatformFinanceRequestsService,
  type FinancialRequestCapabilities,
  type FinancialRequestDetail,
  type FinancialRequestProfileSummary,
} from "@/services/platform-finance/PlatformFinanceRequestsService";
import type { FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";
import {
  FINANCIAL_REQUEST_STATUSES,
  isFinancialRequestTerminalStatus,
  type FinancialRequest,
  type FinancialRequestCategory,
  type FinancialRequestStatus,
} from "@/modules/platform-finance/domain/requests";

type RegisterTab = "all" | "mine" | "review" | "ceo";
type DrawerTab = "details" | "documents" | "review" | "activity";

const STATUS_LABELS: Record<FinancialRequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  query: "Query",
  resubmitted: "Resubmitted",
  pending_ceo_approval: "Awaiting CEO",
  approved: "Approved",
  partially_approved: "Partially Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<FinancialRequestStatus, string> = {
  draft: "is-muted",
  submitted: "is-muted",
  under_review: "is-info",
  query: "is-purple",
  resubmitted: "is-info",
  pending_ceo_approval: "is-amber",
  approved: "is-success",
  partially_approved: "is-success",
  rejected: "is-danger",
};

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  submitted: "Submitted",
  review_started: "Review started",
  queried: "Queried",
  resubmitted: "Resubmitted",
  sent_to_ceo: "Sent to CEO",
  approved: "Approved",
  partially_approved: "Partially approved",
  rejected: "Rejected",
  document_added: "Document added",
  document_removed: "Document removed",
  document_superseded: "Document superseded",
  field_changed: "Field changed",
};

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

function requiredByUrgency(iso: string | null): string | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays <= 7) return `In ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  return null;
}

function requestReference(request: FinancialRequest): string {
  if (request.externalReference?.trim()) return request.externalReference.trim();
  return request.id.slice(0, 8).toUpperCase();
}

function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return parts[0]!.slice(0, 2).toUpperCase();
}

function periodLabel(p: FinancePeriod): string {
  const month = new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleString(
    "en-GB",
    { month: "short", timeZone: "UTC" }
  );
  return `${month} ${p.year}`;
}

function inPeriod(
  request: FinancialRequest,
  period: FinancePeriod | undefined
): boolean {
  if (!period) return true;
  const start = new Date(Date.UTC(period.year, period.month - 1, 1));
  const end = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59));
  const candidates = [
    request.requiredByDate,
    request.submittedAt,
    request.createdAt,
  ].filter(Boolean) as string[];
  return candidates.some((iso) => {
    const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
    return !Number.isNaN(d.getTime()) && d >= start && d <= end;
  });
}

export function PlatformFinanceRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<FinancialRequest[]>([]);
  const [requesters, setRequesters] = useState<
    Record<string, FinancialRequestProfileSummary>
  >({});
  const [categories, setCategories] = useState<FinancialRequestCategory[]>([]);
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [caps, setCaps] = useState<FinancialRequestCapabilities | null>(null);

  const [tab, setTab] = useState<RegisterTab>("all");
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [requesterFilter, setRequesterFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FinancialRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("details");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<
    null | "query" | "reject" | "partial"
  >(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<FinancialRequest | null>(
    null
  );
  const [deletingDraft, setDeletingDraft] = useState(false);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const categoryById = useMemo(() => {
    const map = new Map<string, FinancialRequestCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const companyById = useMemo(() => {
    const map = new Map<string, FinanceCompany>();
    for (const c of companies) map.set(c.id, c);
    return map;
  }, [companies]);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === periodId),
    [periods, periodId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResult, cats, cos, capability] = await Promise.all([
        PlatformFinanceRequestsService.listAccessibleRequests(),
        PlatformFinanceRequestsService.listCategories(),
        PlatformFinanceService.listCompanies(),
        PlatformFinanceRequestsService.getMyRequestCapabilities(),
      ]);
      setRequests(listResult.requests);
      const reqMap: Record<string, FinancialRequestProfileSummary> = {};
      for (const r of listResult.requesters) reqMap[r.id] = r;
      setRequesters(reqMap);
      setCategories(cats.filter((c) => c.status === "active"));
      setCompanies(cos.filter((c) => c.status === "active"));
      setCaps(capability);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load financial requests."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!rowMenuId) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (rowMenuRef.current && target && !rowMenuRef.current.contains(target)) {
        setRowMenuId(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setRowMenuId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [rowMenuId]);

  useEffect(() => {
    let cancelled = false;
    async function loadPeriods() {
      if (!companyId) {
        setPeriods([]);
        setPeriodId("");
        return;
      }
      try {
        const rows = await PlatformFinanceService.listPeriods(companyId);
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
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!selectedId) {
        setDetail(null);
        setDetailError(null);
        return;
      }
      setDetailLoading(true);
      setDetailError(null);
      setDrawerTab("details");
      setPendingAction(null);
      setReasonDraft("");
      setActionError(null);
      void PlatformFinanceRequestsService.getRequestDetail(selectedId)
        .then((data) => {
          if (!cancelled) setDetail(data);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setDetail(null);
            setDetailError(
              err instanceof Error ? err.message : "Unable to load request."
            );
          }
        })
        .finally(() => {
          if (!cancelled) setDetailLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedId]);

  const tabRequests = useMemo(() => {
    const profileId = caps?.profileId;
    switch (tab) {
      case "mine":
        return requests.filter((r) => r.requesterProfileId === profileId);
      case "review":
        return requests.filter((r) =>
          ["submitted", "under_review", "resubmitted"].includes(r.status)
        );
      case "ceo":
        return requests.filter((r) => r.status === "pending_ceo_approval");
      default:
        return requests;
    }
  }, [requests, tab, caps?.profileId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabRequests.filter((r) => {
      if (companyId && r.companyId !== companyId) return false;
      if (!inPeriod(r, selectedPeriod)) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (categoryFilter && r.categoryId !== categoryFilter) return false;
      if (requesterFilter && r.requesterProfileId !== requesterFilter)
        return false;
      if (!q) return true;
      const cat = categoryById.get(r.categoryId)?.name ?? "";
      const company = companyById.get(r.companyId)?.name ?? "";
      const requester =
        requesters[r.requesterProfileId]?.fullName ?? r.requesterProfileId;
      const hay = [
        r.purpose,
        r.description ?? "",
        cat,
        company,
        requester,
        requestReference(r),
        r.payeeName,
        STATUS_LABELS[r.status],
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    tabRequests,
    companyId,
    selectedPeriod,
    statusFilter,
    categoryFilter,
    requesterFilter,
    search,
    categoryById,
    companyById,
    requesters,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [
    tab,
    companyId,
    periodId,
    search,
    statusFilter,
    categoryFilter,
    requesterFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (pageSafe - 1) * pageSize,
    pageSafe * pageSize
  );

  const summary = useMemo(() => {
    const scope = requests.filter((r) => {
      if (companyId && r.companyId !== companyId) return false;
      return inPeriod(r, selectedPeriod);
    });
    const open = scope.filter((r) => !isFinancialRequestTerminalStatus(r.status));
    const underReview = scope.filter((r) =>
      ["submitted", "under_review", "resubmitted"].includes(r.status)
    );
    const awaitingCeo = scope.filter(
      (r) => r.status === "pending_ceo_approval"
    );
    const approved = scope.filter(
      (r) => r.status === "approved" || r.status === "partially_approved"
    );
    return {
      open: open.length,
      underReview: underReview.length,
      awaitingCeo: awaitingCeo.length,
      approved: approved.length,
    };
  }, [requests, companyId, selectedPeriod]);

  const requesterOptions = useMemo(() => {
    const ids = [...new Set(requests.map((r) => r.requesterProfileId))];
    return ids
      .map((id) => ({
        id,
        label: requesters[id]?.fullName?.trim() || id.slice(0, 8),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [requests, requesters]);

  const filtersActive =
    Boolean(search.trim()) ||
    Boolean(statusFilter) ||
    Boolean(categoryFilter) ||
    Boolean(requesterFilter);

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setCategoryFilter("");
    setRequesterFilter("");
  }

  async function refreshAfterAction(requestId: string) {
    await load();
    const next = await PlatformFinanceRequestsService.getRequestDetail(
      requestId
    );
    setDetail(next);
    setPendingAction(null);
    setReasonDraft("");
    setPartialAmount("");
    setActionError(null);
  }

  async function runAction(
    fn: () => Promise<unknown>
  ): Promise<void> {
    if (!selectedId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await fn();
      await refreshAfterAction(selectedId);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Action failed."
      );
    } finally {
      setActionBusy(false);
    }
  }

  if (error && !loading && requests.length === 0) {
    return (
      <div className="pf-requests">
        <p className="pf-state-message is-error">{error}</p>
      </div>
    );
  }

  return (
    <div className={`pf-requests${selectedId ? " has-drawer" : ""}`}>
      <header className="pf-ov-header">
        <div>
          <h1 className="pf-ov-title">Financial Requests</h1>
          <p className="pf-ov-desc">
            Review, track and manage financial needs across the organisation.
          </p>
        </div>
        <div className="pf-req-controls">
          <label className="sr-only" htmlFor="pf-req-company">
            Company
          </label>
          <div className="pf-req-select-wrap">
            <Building2 size={14} aria-hidden />
            <SearchableSelect
              id="pf-req-company"
              className="pf-req-searchable"
              aria-label="Company"
              value={companyId}
              onChange={setCompanyId}
              emptyOptionLabel="All Companies"
              allowEmpty
              options={companies.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
              searchPlaceholder="Search companies…"
            />
          </div>
          <label className="sr-only" htmlFor="pf-req-period">
            Period
          </label>
          <div className="pf-req-select-wrap">
            <CalendarDays size={14} aria-hidden />
            <SearchableSelect
              id="pf-req-period"
              className="pf-req-searchable"
              aria-label="Period"
              value={periodId}
              onChange={setPeriodId}
              disabled={!companyId || periods.length === 0}
              emptyOptionLabel={
                !companyId
                  ? "Select period"
                  : periods.length === 0
                    ? "No periods"
                    : "All periods"
              }
              placeholder={
                !companyId
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
          <Link
            href="/platform-finance/requests/new"
            className="pf-btn-primary"
          >
            <Plus size={16} aria-hidden />
            New Request
          </Link>
        </div>
      </header>

      <div className="pf-req-tabs" role="tablist" aria-label="Request views">
        {(
          [
            ["all", "All"],
            ["mine", "My Requests"],
            ["review", "Needs Review"],
            ["ceo", "Awaiting CEO"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`pf-req-tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pf-req-summary">
        <SummaryCard
          icon={<FileText size={16} />}
          tone="blue"
          label="Open Requests"
          value={summary.open}
        />
        <SummaryCard
          icon={<Clock3 size={16} />}
          tone="amber"
          label="Under Review"
          value={summary.underReview}
        />
        <SummaryCard
          icon={<UserRound size={16} />}
          tone="red"
          label="Awaiting CEO"
          value={summary.awaitingCeo}
        />
        <SummaryCard
          icon={<CheckCircle2 size={16} />}
          tone="green"
          label="Approved"
          value={summary.approved}
          hint={selectedPeriod ? "This period" : undefined}
        />
      </div>

      <section className="pf-req-table-card">
        <div className="pf-req-toolbar">
          <div className="pf-req-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search requests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SearchableSelect
            className="pf-req-filter-select"
            aria-label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            emptyOptionLabel="Status"
            allowEmpty
            options={FINANCIAL_REQUEST_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABELS[s],
            }))}
            searchPlaceholder="Search status…"
          />
          <SearchableSelect
            className="pf-req-filter-select"
            aria-label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            emptyOptionLabel="Category"
            allowEmpty
            options={categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            searchPlaceholder="Search categories…"
          />
          <SearchableSelect
            className="pf-req-filter-select"
            aria-label="Requester"
            value={requesterFilter}
            onChange={setRequesterFilter}
            emptyOptionLabel="Requester"
            allowEmpty
            options={requesterOptions.map((r) => ({
              value: r.id,
              label: r.label,
            }))}
            searchPlaceholder="Search requesters…"
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
          <p className="pf-state-message">Loading financial requests…</p>
        ) : filtered.length === 0 ? (
          <EmptyRegister
            tab={tab}
            filtered={filtersActive || Boolean(companyId) || Boolean(periodId)}
          />
        ) : (
          <>
            <div className="pf-req-table-wrap">
              <table className="pf-req-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Requester</th>
                    <th>Company</th>
                    <th>Amount</th>
                    <th>Required by</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const urgency = requiredByUrgency(row.requiredByDate);
                    const cat = categoryById.get(row.categoryId)?.name ?? "—";
                    const company =
                      companyById.get(row.companyId)?.name ?? "—";
                    const requester =
                      requesters[row.requesterProfileId]?.fullName?.trim() ||
                      "—";
                    return (
                      <tr
                        key={row.id}
                        className={
                          selectedId === row.id ? "is-selected" : undefined
                        }
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td>
                          <div className="pf-req-primary">{row.purpose}</div>
                          <div className="pf-req-meta">
                            {cat} · {requestReference(row)}
                          </div>
                        </td>
                        <td>{requester}</td>
                        <td>{company}</td>
                        <td className="pf-req-amount-cell">
                          {formatNaira(row.requestedAmount, row.currency)}
                        </td>
                        <td>
                          <div>{formatDate(row.requiredByDate)}</div>
                          {urgency ? (
                            <div
                              className={`pf-req-urgency${
                                urgency.includes("overdue") ||
                                urgency === "Due today" ||
                                urgency.startsWith("In ")
                                  ? " is-urgent"
                                  : ""
                              }`}
                            >
                              {urgency}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span
                            className={`pf-req-status ${STATUS_TONE[row.status]}`}
                          >
                            {STATUS_LABELS[row.status]}
                          </span>
                        </td>
                        <td>
                          {row.status === "draft" ? (
                            <div
                              className="pf-req-row-actions"
                              ref={rowMenuId === row.id ? rowMenuRef : undefined}
                            >
                              <button
                                type="button"
                                className="pf-icon-btn"
                                aria-label={`Actions for ${row.purpose}`}
                                aria-expanded={rowMenuId === row.id}
                                aria-haspopup="menu"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRowMenuId((id) =>
                                    id === row.id ? null : row.id
                                  );
                                }}
                              >
                                <MoreVertical size={16} />
                              </button>
                              {rowMenuId === row.id ? (
                                <div
                                  className="pf-req-row-menu"
                                  role="menu"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRowMenuId(null);
                                      router.push(
                                        `/platform-finance/requests/new?draftId=${encodeURIComponent(row.id)}`
                                      );
                                    }}
                                  >
                                    Continue request
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="is-danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRowMenuId(null);
                                      setDraftToDelete(row);
                                    }}
                                  >
                                    Delete draft
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pf-req-pagination">
              <span>
                Showing {(pageSafe - 1) * pageSize + 1}-
                {Math.min(pageSafe * pageSize, filtered.length)} of{" "}
                {filtered.length} requests
              </span>
              <div className="pf-req-page-btns">
                <button
                  type="button"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                <span>{pageSafe}</span>
                <button
                  type="button"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedId ? (
        <RequestDetailDrawer
          loading={detailLoading}
          error={detailError}
          detail={detail}
          categoryName={
            detail
              ? categoryById.get(detail.request.categoryId)?.name ?? "—"
              : "—"
          }
          companyName={
            detail
              ? companyById.get(detail.request.companyId)?.name ?? "—"
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
          onReasonDraftChange={setReasonDraft}
          onPartialAmountChange={setPartialAmount}
          onPendingActionChange={setPendingAction}
          onStartReview={() =>
            void runAction(() =>
              PlatformFinanceRequestsService.startRequestReview(selectedId)
            )
          }
          onSendToCeo={() =>
            void runAction(() =>
              PlatformFinanceRequestsService.sendRequestToCeo(selectedId)
            )
          }
          onApprove={() =>
            void runAction(() =>
              PlatformFinanceRequestsService.approveRequest(selectedId)
            )
          }
          onConfirmQuery={() => {
            if (!reasonDraft.trim()) {
              setActionError("A reason is required.");
              return;
            }
            const actorRole =
              detail?.request.status === "pending_ceo_approval"
                ? "ceo"
                : "finance";
            void runAction(() =>
              PlatformFinanceRequestsService.queryRequest(selectedId, {
                reason: reasonDraft.trim(),
                actorRole,
              })
            );
          }}
          onConfirmReject={() => {
            if (!reasonDraft.trim()) {
              setActionError("A reason is required.");
              return;
            }
            void runAction(() =>
              PlatformFinanceRequestsService.rejectRequest(
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
              PlatformFinanceRequestsService.partiallyApproveRequest(
                selectedId,
                {
                  approvedAmount: amount,
                  decisionNotes: reasonDraft.trim() || null,
                }
              )
            );
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(draftToDelete)}
        onClose={() => {
          if (!deletingDraft) setDraftToDelete(null);
        }}
        title="Delete draft?"
        description={
          draftToDelete
            ? `Delete draft “${draftToDelete.purpose}”? This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete draft"
        cancelLabel="Cancel"
        danger
        loading={deletingDraft}
        onConfirm={() => {
          if (!draftToDelete) return;
          void (async () => {
            setDeletingDraft(true);
            try {
              await PlatformFinanceRequestsService.deleteDraftRequest(
                draftToDelete.id
              );
              setDraftToDelete(null);
              if (selectedId === draftToDelete.id) setSelectedId(null);
              await load();
            } catch (err: unknown) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Unable to delete draft."
              );
              setDraftToDelete(null);
            } finally {
              setDeletingDraft(false);
            }
          })();
        }}
      />
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
  value: number;
  hint?: string;
}) {
  return (
    <article className="pf-req-summary-card">
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
        <p className="pf-empty-title">No matching requests</p>
        <p className="pf-empty-copy">
          Try clearing filters or adjusting company and period.
        </p>
      </div>
    );
  }
  const copy: Record<RegisterTab, { title: string; body: string }> = {
    all: {
      title: "No financial requests yet",
      body: "When requests are created, they will appear in this register.",
    },
    mine: {
      title: "No requests of yours",
      body: "Requests you create will show up here.",
    },
    review: {
      title: "Nothing needs review",
      body: "Submitted and in-review requests will appear in this queue.",
    },
    ceo: {
      title: "Nothing awaiting CEO",
      body: "Requests sent for CEO decision will appear here.",
    },
  };
  return (
    <div className="pf-empty-box pf-req-empty">
      <p className="pf-empty-title">{copy[tab].title}</p>
      <p className="pf-empty-copy">{copy[tab].body}</p>
    </div>
  );
}

function RequestDetailDrawer({
  loading,
  error,
  detail,
  categoryName,
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
  onReasonDraftChange,
  onPartialAmountChange,
  onPendingActionChange,
  onStartReview,
  onSendToCeo,
  onApprove,
  onConfirmQuery,
  onConfirmReject,
  onConfirmPartial,
}: {
  loading: boolean;
  error: string | null;
  detail: FinancialRequestDetail | null;
  categoryName: string;
  companyName: string;
  caps: FinancialRequestCapabilities | null;
  drawerTab: DrawerTab;
  onDrawerTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  actionBusy: boolean;
  actionError: string | null;
  pendingAction: null | "query" | "reject" | "partial";
  reasonDraft: string;
  partialAmount: string;
  onReasonDraftChange: (v: string) => void;
  onPartialAmountChange: (v: string) => void;
  onPendingActionChange: (v: null | "query" | "reject" | "partial") => void;
  onStartReview: () => void;
  onSendToCeo: () => void;
  onApprove: () => void;
  onConfirmQuery: () => void;
  onConfirmReject: () => void;
  onConfirmPartial: () => void;
}) {
  const request = detail?.request;
  const isOwn =
    Boolean(request && caps && request.requesterProfileId === caps.profileId);
  const canReview = Boolean(caps?.review) && !isOwn;
  const canApprove = Boolean(caps?.approve) && !isOwn;

  const showStartReview =
    canReview && request?.status === "submitted";
  const showFinanceRoute =
    canReview &&
    (request?.status === "under_review" || request?.status === "resubmitted");
  const showCeoActions =
    canApprove && request?.status === "pending_ceo_approval";

  const urgency = requiredByUrgency(request?.requiredByDate ?? null);
  const requesterName =
    detail?.requester?.fullName?.trim() ||
    request?.requesterProfileId.slice(0, 8) ||
    "—";
  const reviewEvents =
    detail?.events.filter((e) =>
      ["review_started", "queried", "sent_to_ceo", "approved", "partially_approved", "rejected"].includes(
        e.eventType
      )
    ) ?? [];

  return (
    <aside className="pf-req-drawer" aria-label="Request detail">
          <div className="pf-req-drawer-head">
        <div>
          <p className="pf-req-drawer-ref">
            {request ? requestReference(request) : "…"}
          </p>
          {request ? (
            <span className={`pf-req-status ${STATUS_TONE[request.status]}`}>
              {STATUS_LABELS[request.status]}
            </span>
          ) : null}
        </div>
        <div className="pf-req-drawer-head-actions">
          {((canReview || canApprove) && request) ? (
            <Link
              href={`/platform-finance/requests/${request.id}`}
              className="pf-btn-secondary"
            >
              Open review
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
        <p className="pf-state-message">Loading request…</p>
      ) : error ? (
        <p className="pf-state-message is-error">{error}</p>
      ) : !request ? (
        <p className="pf-state-message">Request not found.</p>
      ) : (
        <>
          <div className="pf-req-drawer-body">
            <h2 className="pf-req-drawer-title">{request.purpose}</h2>
            <p className="pf-req-drawer-cat">{categoryName}</p>
            {request.description ? (
              <p className="pf-req-drawer-purpose">{request.description}</p>
            ) : null}

            <div className="pf-req-drawer-metrics">
              <div>
                <span>Requested amount</span>
                <strong>
                  {formatNaira(request.requestedAmount, request.currency)}
                </strong>
              </div>
              <div>
                <span>Required by</span>
                <strong>{formatDate(request.requiredByDate)}</strong>
                {urgency ? (
                  <em className="pf-req-urgency is-urgent">{urgency}</em>
                ) : null}
              </div>
              <div>
                <span>Company</span>
                <strong>{companyName}</strong>
              </div>
            </div>

            <div className="pf-req-drawer-person">
              <div className="pf-req-avatar" aria-hidden>
                {initials(requesterName)}
              </div>
              <div>
                <strong>{requesterName}</strong>
                <span>{detail?.requester?.jobTitle || "Requester"}</span>
              </div>
              <div className="pf-req-drawer-submitted">
                Submitted
                <strong>{formatDateTime(request.submittedAt)}</strong>
              </div>
            </div>

            <div className="pf-req-drawer-tabs" role="tablist">
              {(
                [
                  ["details", "Details"],
                  ["documents", `Documents (${detail?.documents.length ?? 0})`],
                  ["review", `Review (${reviewEvents.length})`],
                  ["activity", `Activity (${detail?.events.length ?? 0})`],
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

            {drawerTab === "details" ? (
              <div className="pf-req-drawer-section">
                <h3>Request information</h3>
                <dl className="pf-req-dl">
                  <div>
                    <dt>Category</dt>
                    <dd>{categoryName}</dd>
                  </div>
                  <div>
                    <dt>Purpose</dt>
                    <dd>{request.purpose}</dd>
                  </div>
                  <div>
                    <dt>Payee</dt>
                    <dd>
                      {request.payeeName}{" "}
                      <span className="pf-req-meta">({request.payeeType})</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Required by</dt>
                    <dd>{formatDate(request.requiredByDate)}</dd>
                  </div>
                  <div>
                    <dt>Payment destination</dt>
                    <dd>
                      {request.paymentDestination
                        ? `${request.paymentDestination.bankName} · ${request.paymentDestination.accountName} · •••• ${request.paymentDestination.accountNumberLast4}`
                        : "Not supplied"}
                    </dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>{companyName}</dd>
                  </div>
                  {request.approvedAmount > 0 ? (
                    <div>
                      <dt>Approved amount</dt>
                      <dd>
                        {formatNaira(request.approvedAmount, request.currency)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <h3>Description</h3>
                <p className="pf-req-description">
                  {request.description?.trim() || "No description provided."}
                </p>
                {request.financeNotes ? (
                  <>
                    <h3>Finance notes</h3>
                    <p className="pf-req-description">{request.financeNotes}</p>
                  </>
                ) : null}
                {request.ceoDecisionNotes ? (
                  <>
                    <h3>CEO decision notes</h3>
                    <p className="pf-req-description">
                      {request.ceoDecisionNotes}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {drawerTab === "documents" ? (
              <div className="pf-req-drawer-section">
                {(detail?.documents.length ?? 0) === 0 ? (
                  <div className="pf-empty-box">
                    <p className="pf-empty-title">No documents</p>
                    <p className="pf-empty-copy">
                      Supporting files attached to this request will appear
                      here.
                    </p>
                  </div>
                ) : (
                  <ul className="pf-req-doc-list">
                    {detail!.documents.map((doc) => (
                      <li key={doc.id}>
                        <strong>{doc.filename}</strong>
                        <span>
                          {doc.documentRole} · {formatDateTime(doc.uploadedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {drawerTab === "review" ? (
              <div className="pf-req-drawer-section">
                {reviewEvents.length === 0 ? (
                  <div className="pf-empty-box">
                    <p className="pf-empty-title">No review activity</p>
                    <p className="pf-empty-copy">
                      Finance and CEO review events will appear here when they
                      occur.
                    </p>
                  </div>
                ) : (
                  <ul className="pf-req-activity">
                    {reviewEvents.map((ev) => (
                      <li key={ev.id}>
                        <strong>
                          {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                        </strong>
                        <span>{formatDateTime(ev.createdAt)}</span>
                        {ev.fromStatus || ev.toStatus ? (
                          <em>
                            {[ev.fromStatus, ev.toStatus]
                              .filter(Boolean)
                              .map((s) =>
                                s ? STATUS_LABELS[s as FinancialRequestStatus] : ""
                              )
                              .join(" → ")}
                          </em>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {drawerTab === "activity" ? (
              <div className="pf-req-drawer-section">
                {(detail?.events.length ?? 0) === 0 ? (
                  <div className="pf-empty-box">
                    <p className="pf-empty-title">No activity yet</p>
                    <p className="pf-empty-copy">
                      Workflow history for this request will appear here.
                    </p>
                  </div>
                ) : (
                  <ul className="pf-req-activity">
                    {detail!.events.map((ev) => (
                      <li key={ev.id}>
                        <strong>
                          {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                        </strong>
                        <span>{formatDateTime(ev.createdAt)}</span>
                        {ev.fromStatus || ev.toStatus ? (
                          <em>
                            {[ev.fromStatus, ev.toStatus]
                              .filter(Boolean)
                              .map((s) =>
                                s ? STATUS_LABELS[s as FinancialRequestStatus] : ""
                              )
                              .join(" → ")}
                          </em>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          {(showStartReview ||
            showFinanceRoute ||
            showCeoActions ||
            pendingAction) && (
            <div className="pf-req-drawer-footer">
              {actionError ? (
                <p className="pf-state-message is-error">{actionError}</p>
              ) : null}
              {pendingAction ? (
                <div className="pf-req-action-form">
                  {pendingAction === "partial" ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Approved amount"
                      value={partialAmount}
                      onChange={(e) => onPartialAmountChange(e.target.value)}
                    />
                  ) : null}
                  <textarea
                    rows={3}
                    placeholder={
                      pendingAction === "partial"
                        ? "Decision notes (optional)"
                        : "Reason (required)"
                    }
                    value={reasonDraft}
                    onChange={(e) => onReasonDraftChange(e.target.value)}
                  />
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
                      onClick={() => {
                        if (pendingAction === "query") onConfirmQuery();
                        else if (pendingAction === "reject") onConfirmReject();
                        else onConfirmPartial();
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pf-req-action-row">
                  {(showFinanceRoute || showCeoActions) && (
                    <button
                      type="button"
                      className="pf-btn-secondary"
                      disabled={actionBusy}
                      onClick={() => onPendingActionChange("query")}
                    >
                      Query
                    </button>
                  )}
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
                  {showFinanceRoute ? (
                    <button
                      type="button"
                      className="pf-btn-secondary"
                      disabled={actionBusy}
                      onClick={onSendToCeo}
                    >
                      Send to CEO
                    </button>
                  ) : null}
                  {showCeoActions ? (
                    <>
                      <button
                        type="button"
                        className="pf-btn-secondary"
                        disabled={actionBusy}
                        onClick={() => onPendingActionChange("reject")}
                      >
                        Reject
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
                        className="pf-btn-primary"
                        disabled={actionBusy}
                        onClick={onApprove}
                      >
                        Approve
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
