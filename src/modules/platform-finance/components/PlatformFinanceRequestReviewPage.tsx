"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Info,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Pencil,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  PlatformFinanceRequestsService,
  type FinancialRequestCapabilities,
  type FinancialRequestDetail,
} from "@/services/platform-finance/PlatformFinanceRequestsService";
import type { FinanceCompany } from "@/modules/platform-finance/types";
import {
  type FinancialRequest,
  type FinancialRequestCategory,
  type FinancialRequestDocument,
  type FinancialRequestStatus,
} from "@/modules/platform-finance/domain/requests";
import {
  FINANCE_REQUEST_DOCUMENT_ROLE_LABELS,
  formatFileSize,
  formatUploadedAt,
  mimeTypeLabel,
} from "@/modules/platform-finance/requestDocumentUi";

type WorkspaceTab = "overview" | "documents" | "finance_review" | "activity";
type ConfirmAction =
  | null
  | "query"
  | "send_to_ceo"
  | "approve"
  | "partial"
  | "query_ceo"
  | "reject";

const STATUS_LABELS: Record<FinancialRequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  query: "Query",
  resubmitted: "Resubmitted",
  pending_ceo_approval: "Pending CEO Approval",
  approved: "Approved",
  partially_approved: "Partially Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<FinancialRequestStatus, string> = {
  draft: "is-muted",
  submitted: "is-info",
  under_review: "is-info",
  query: "is-warn",
  resubmitted: "is-info",
  pending_ceo_approval: "is-amber",
  approved: "is-success",
  partially_approved: "is-success",
  rejected: "is-danger",
};

const EVENT_LABELS: Record<string, string> = {
  created: "Draft created",
  updated: "Draft updated",
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

const PAYEE_TYPE_LABELS: Record<string, string> = {
  vendor: "Vendor",
  staff: "Staff",
  other: "Other",
};

function formatNaira(amount: number, currency = "NGN"): string {
  const hasFraction = !Number.isInteger(amount);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
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
  const target = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"}`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "In 1 day";
  if (diffDays <= 7) return `In ${diffDays} days`;
  return null;
}

function requestReference(request: FinancialRequest): string {
  if (request.externalReference?.trim()) return request.externalReference.trim();
  return request.id.slice(0, 8).toUpperCase();
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function statusExplanation(status: FinancialRequestStatus): string {
  switch (status) {
    case "draft":
      return "Still with the requester as a draft.";
    case "submitted":
      return "Awaiting Finance review.";
    case "under_review":
      return "Finance is reviewing this request.";
    case "query":
      return "Queried — awaiting requester resubmission.";
    case "resubmitted":
      return "Resubmitted — awaiting Finance review.";
    case "pending_ceo_approval":
      return "Reviewed by Finance. Awaiting your decision.";
    case "approved":
      return "Approved. Payment is handled outside this workspace.";
    case "partially_approved":
      return "Partially approved. Payment is handled outside this workspace.";
    case "rejected":
      return "Rejected — request is closed.";
    default:
      return "";
  }
}

function FileTypeIcon({
  mimeType,
  filename,
}: {
  mimeType: string;
  filename: string;
}) {
  const label = mimeTypeLabel(mimeType, filename);
  if (label === "PDF") {
    return (
      <span className="pf-new-doc-icon is-pdf" aria-hidden>
        <FileText size={18} />
      </span>
    );
  }
  if (label === "JPG" || label === "JPEG" || label === "PNG") {
    return (
      <span className="pf-new-doc-icon is-image" aria-hidden>
        <FileImage size={18} />
      </span>
    );
  }
  if (label === "XLS" || label === "XLSX") {
    return (
      <span className="pf-new-doc-icon is-sheet" aria-hidden>
        <FileSpreadsheet size={18} />
      </span>
    );
  }
  return (
    <span className="pf-new-doc-icon is-doc" aria-hidden>
      <FileText size={18} />
    </span>
  );
}

export function PlatformFinanceRequestReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const requestId = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<FinancialRequestCapabilities | null>(null);
  const [detail, setDetail] = useState<FinancialRequestDetail | null>(null);
  const [categories, setCategories] = useState<FinancialRequestCategory[]>([]);
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [queue, setQueue] = useState<FinancialRequest[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<FinancialRequest[]>([]);
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [notesDraft, setNotesDraft] = useState("");
  const [ceoNotesDraft, setCeoNotesDraft] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [docMenuId, setDocMenuId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) {
      setError("Request not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const [capability, requestDetail, cats, cos, reviewQueue, approvalQ] =
        await Promise.all([
          PlatformFinanceRequestsService.getMyRequestCapabilities(),
          PlatformFinanceRequestsService.getRequestDetail(requestId),
          PlatformFinanceRequestsService.listCategories(),
          PlatformFinanceService.listCompanies(),
          PlatformFinanceRequestsService.listReviewQueue().catch(() => []),
          PlatformFinanceRequestsService.listApprovalQueue().catch(() => []),
        ]);
      setCaps(capability);
      setDetail(requestDetail);
      setCategories(cats);
      setCompanies(cos);
      setQueue(reviewQueue);
      setApprovalQueue(approvalQ);
      setNotesDraft(requestDetail.request.financeNotes ?? "");
      setCeoNotesDraft(requestDetail.request.ceoDecisionNotes ?? "");
      setPartialAmount("");
    } catch (err: unknown) {
      setDetail(null);
      setError(
        err instanceof Error ? err.message : "Unable to load request."
      );
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!docMenuId) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node | null;
      if (
        target &&
        target instanceof Element &&
        target.closest(".pf-rev-doc-actions")
      ) {
        return;
      }
      setDocMenuId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [docMenuId]);

  const request = detail?.request ?? null;
  const categoryName = useMemo(() => {
    if (!request) return "—";
    return categories.find((c) => c.id === request.categoryId)?.name ?? "—";
  }, [categories, request]);
  const companyName = useMemo(() => {
    if (!request) return "—";
    return companies.find((c) => c.id === request.companyId)?.name ?? "—";
  }, [companies, request]);

  const activeDocuments = useMemo(
    () => (detail?.documents ?? []).filter((d) => d.supersededAt == null),
    [detail?.documents]
  );

  const isOwn = Boolean(
    request && caps && request.requesterProfileId === caps.profileId
  );
  const canReview = Boolean(caps?.review) && !isOwn;
  const canApprove = Boolean(caps?.approve) && !isOwn;

  const showStartReview = canReview && request?.status === "submitted";
  const showFinanceActions =
    canReview && request?.status === "under_review";
  const showCeoActions =
    canApprove && request?.status === "pending_ceo_approval";
  const isCeoWorkspace =
    canApprove &&
    (request?.status === "pending_ceo_approval" ||
      request?.status === "approved" ||
      request?.status === "partially_approved" ||
      request?.status === "rejected" ||
      request?.status === "query");

  const navQueue = useMemo(() => {
    if (canApprove && (showCeoActions || request?.status === "pending_ceo_approval")) {
      return approvalQueue;
    }
    if (canApprove && !canReview) return approvalQueue;
    return queue;
  }, [
    approvalQueue,
    canApprove,
    canReview,
    queue,
    request?.status,
    showCeoActions,
  ]);

  const queueIndex = useMemo(
    () => navQueue.findIndex((r) => r.id === requestId),
    [navQueue, requestId]
  );
  const prevId =
    queueIndex > 0 ? navQueue[queueIndex - 1]?.id ?? null : null;
  const nextId =
    queueIndex >= 0 && queueIndex < navQueue.length - 1
      ? navQueue[queueIndex + 1]?.id ?? null
      : null;

  const urgency = requiredByUrgency(request?.requiredByDate ?? null);
  const requesterName =
    detail?.requester?.fullName?.trim() ||
    request?.requesterProfileId.slice(0, 8) ||
    "—";
  const requesterTitle =
    detail?.requester?.jobTitle?.trim() || "Requester";
  const refLabel = request ? requestReference(request) : "…";

  const financeReviewEvents = useMemo(
    () =>
      (detail?.events ?? []).filter((e) =>
        ["review_started", "queried", "sent_to_ceo"].includes(e.eventType)
      ),
    [detail?.events]
  );

  const sentToCeoEvent = useMemo(
    () =>
      [...(detail?.events ?? [])]
        .reverse()
        .find((e) => e.eventType === "sent_to_ceo") ?? null,
    [detail?.events]
  );

  const workflowEvents = useMemo(() => {
    const events = detail?.events ?? [];
    const wanted = [
      "submitted",
      "review_started",
      "sent_to_ceo",
      "approved",
      "partially_approved",
      "rejected",
      "queried",
    ] as const;
    const picked: typeof events = [];
    for (const type of wanted) {
      const ev = events.find((e) => e.eventType === type);
      if (ev) picked.push(ev);
    }
    return picked;
  }, [detail?.events]);

  const nextSteps = useMemo(() => {
    const status = request?.status;
    const financeDone =
      status === "pending_ceo_approval" ||
      status === "approved" ||
      status === "partially_approved" ||
      status === "rejected";
    const ceoDone =
      status === "approved" ||
      status === "partially_approved" ||
      status === "rejected";
    const financeActive =
      status === "submitted" ||
      status === "under_review" ||
      status === "resubmitted" ||
      status === "query";
    return [
      {
        key: "finance",
        label: "Finance review",
        hint: "Review request, documents and compliance.",
        state: financeDone ? "done" : financeActive ? "active" : "upcoming",
      },
      {
        key: "ceo_route",
        label: "Send to CEO",
        hint: "Forward to CEO for approval.",
        state: financeDone
          ? "done"
          : status === "under_review"
            ? "upcoming"
            : "upcoming",
      },
      {
        key: "ceo",
        label: "CEO approval",
        hint: "Approved requests proceed to payment.",
        state: ceoDone
          ? "done"
          : status === "pending_ceo_approval"
            ? "active"
            : "upcoming",
      },
    ] as const;
  }, [request?.status]);

  async function refreshDetail() {
    const next = await PlatformFinanceRequestsService.getRequestDetail(
      requestId
    );
    setDetail(next);
    setNotesDraft(next.request.financeNotes ?? "");
    setCeoNotesDraft(next.request.ceoDecisionNotes ?? "");
    try {
      setQueue(await PlatformFinanceRequestsService.listReviewQueue());
    } catch {
      /* keep previous queue */
    }
    try {
      setApprovalQueue(
        await PlatformFinanceRequestsService.listApprovalQueue()
      );
    } catch {
      /* keep previous */
    }
  }

  async function runAction(fn: () => Promise<unknown>) {
    setActionBusy(true);
    setActionError(null);
    try {
      await fn();
      setConfirmAction(null);
      setPartialAmount("");
      await refreshDetail();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Unable to complete action."
      );
    } finally {
      setActionBusy(false);
    }
  }

  function partialAmountValue(): number | null {
    const n = Number(partialAmount.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  async function downloadDocument(doc: FinancialRequestDocument) {
    setDownloadingId(doc.id);
    setDocMenuId(null);
    setActionError(null);
    try {
      const { signedUrl } =
        await PlatformFinanceRequestsService.getRequestDocumentSignedUrl(
          requestId,
          doc.id
        );
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = doc.filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Unable to download document."
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function downloadAllDocuments() {
    if (activeDocuments.length === 0) return;
    setDownloadingAll(true);
    setActionError(null);
    try {
      for (const doc of activeDocuments) {
        await downloadDocument(doc);
      }
    } finally {
      setDownloadingAll(false);
    }
  }

  function actorLabel(actorProfileId: string): string {
    if (detail?.requester && detail.requester.id === actorProfileId) {
      return detail.requester.fullName?.trim() || requesterName;
    }
    return actorProfileId.slice(0, 8).toUpperCase();
  }

  if (loading) {
    return (
      <div className="pf-rev">
        <p className="pf-state-message">Loading request review…</p>
      </div>
    );
  }

  if (error || !request || !detail) {
    return (
      <div className="pf-rev">
        <p className="pf-state-message is-error">
          {error || "Request not found."}
        </p>
        <p className="pf-new-denied-actions">
          <Link href="/platform-finance/requests" className="pf-link">
            Back to Financial Requests
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="pf-rev">
      <nav className="pf-rev-breadcrumb" aria-label="Breadcrumb">
        <Link href="/platform-finance">Work</Link>
        <span aria-hidden>/</span>
        <Link href="/platform-finance/requests">Financial Requests</Link>
        <span aria-hidden>/</span>
        <span>{refLabel}</span>
      </nav>

      <header className="pf-rev-header">
        <div className="pf-rev-header-main">
          <h1 className="pf-ov-title">{request.purpose}</h1>
          {request.description?.trim() ? (
            <p className="pf-ov-desc">{request.description.trim()}</p>
          ) : null}
          <div className="pf-rev-meta">
            <span className="pf-rev-ref-pill">{refLabel}</span>
            <span className={`pf-req-status ${STATUS_TONE[request.status]}`}>
              {STATUS_LABELS[request.status]}
            </span>
            <span className="pf-rev-meta-item">
              <em>Requested amount</em>
              <strong>
                {formatNaira(request.requestedAmount, request.currency)}
              </strong>
            </span>
            {request.approvedAmount > 0 ? (
              <span className="pf-rev-meta-item">
                <em>Approved amount</em>
                <strong>
                  {formatNaira(request.approvedAmount, request.currency)}
                </strong>
              </span>
            ) : null}
            {(request.financeNotes?.trim() ||
              request.status === "pending_ceo_approval" ||
              sentToCeoEvent) && (
              <span className="pf-rev-meta-item">
                <em>Finance notes</em>
                <strong>
                  {request.financeNotes?.trim()
                    ? "Recorded"
                    : "See Finance review"}
                </strong>
                <button
                  type="button"
                  className="pf-new-review-edit"
                  onClick={() => setTab("finance_review")}
                >
                  View notes
                </button>
              </span>
            )}
            {!isCeoWorkspace ? (
              <span className="pf-rev-meta-item">
                <em>Submitted</em>
                <strong>{formatDateTime(request.submittedAt)}</strong>
              </span>
            ) : null}
            <span className="pf-rev-meta-item">
              <em>Required by</em>
              <strong>{formatDate(request.requiredByDate)}</strong>
              {urgency ? (
                <span className="pf-req-urgency is-urgent">{urgency}</span>
              ) : null}
            </span>
            <span className="pf-rev-meta-item">
              <em>Company</em>
              <strong>{companyName}</strong>
            </span>
            <span className="pf-rev-meta-item">
              <em>Category</em>
              <strong>{categoryName}</strong>
            </span>
          </div>
        </div>
        <div className="pf-rev-header-actions">
          <button
            type="button"
            className="pf-btn-secondary"
            disabled={!prevId || actionBusy}
            onClick={() =>
              prevId &&
              router.push(`/platform-finance/requests/${prevId}`)
            }
          >
            <ArrowLeft size={14} aria-hidden />
            Previous
          </button>
          <button
            type="button"
            className="pf-btn-secondary"
            disabled={!nextId || actionBusy}
            onClick={() =>
              nextId &&
              router.push(`/platform-finance/requests/${nextId}`)
            }
          >
            Next
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </header>

      <div className="pf-rev-tabs" role="tablist" aria-label="Request sections">
        {(
          [
            ["overview", "Overview"],
            ["documents", `Documents (${activeDocuments.length})`],
            [
              "finance_review",
              `Finance Review (${financeReviewEvents.length})`,
            ],
            ["activity", `Activity (${detail.events.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`pf-rev-tab${tab === id ? " is-active" : ""}`}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError ? (
        <p className="pf-state-message is-error" role="status">
          {actionError}
        </p>
      ) : null}

      <div className="pf-rev-layout">
        <div className="pf-rev-main">
          {tab === "overview" ? (
            <>
              <section className="pf-rev-card">
                <div className="pf-rev-card-head">
                  <div className="pf-rev-card-title">
                    <span className="pf-new-review-icon" aria-hidden>
                      <FileText size={16} />
                    </span>
                    <h2>Request Details</h2>
                  </div>
                </div>
                <dl className="pf-new-review-grid">
                  <div>
                    <dt>Category</dt>
                    <dd>{categoryName}</dd>
                  </div>
                  <div>
                    <dt>Purpose</dt>
                    <dd>{request.purpose}</dd>
                  </div>
                  <div>
                    <dt>Description</dt>
                    <dd>{request.description?.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>{companyName}</dd>
                  </div>
                  <div>
                    <dt>Payee</dt>
                    <dd>
                      {request.payeeName} (
                      {PAYEE_TYPE_LABELS[request.payeeType] ??
                        request.payeeType}
                      )
                    </dd>
                  </div>
                  <div>
                    <dt>Request amount</dt>
                    <dd>
                      {formatNaira(request.requestedAmount, request.currency)}
                    </dd>
                  </div>
                  {request.approvedAmount > 0 ? (
                    <div>
                      <dt>Approved amount</dt>
                      <dd>
                        {formatNaira(request.approvedAmount, request.currency)}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Required by</dt>
                    <dd>{formatDate(request.requiredByDate)}</dd>
                  </div>
                </dl>
              </section>

              <div className="pf-rev-context-grid">
                <section className="pf-rev-card">
                  <div className="pf-rev-card-head">
                    <div className="pf-rev-card-title">
                      <span className="pf-new-review-icon" aria-hidden>
                        <UserRound size={16} />
                      </span>
                      <h2>Requester</h2>
                    </div>
                  </div>
                  <div className="pf-rev-person">
                    <div className="pf-req-avatar" aria-hidden>
                      {initials(requesterName)}
                    </div>
                    <div>
                      <strong>{requesterName}</strong>
                      <span>{requesterTitle}</span>
                    </div>
                  </div>
                </section>

                <section className="pf-rev-card">
                  <div className="pf-rev-card-head">
                    <div className="pf-rev-card-title">
                      <span className="pf-new-review-icon" aria-hidden>
                        <UserRound size={16} />
                      </span>
                      <h2>Payee Details</h2>
                    </div>
                  </div>
                  <dl className="pf-new-review-grid">
                    <div>
                      <dt>Name</dt>
                      <dd>{request.payeeName}</dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>
                        {PAYEE_TYPE_LABELS[request.payeeType] ??
                          request.payeeType}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              <FinanceReviewCard
                financeNotes={request.financeNotes}
                requestedAmount={request.requestedAmount}
                currency={request.currency}
                sentToCeoEvent={sentToCeoEvent}
                actorLabel={actorLabel}
                eventCount={financeReviewEvents.length}
                onViewAll={() => setTab("finance_review")}
              />

              <DocumentsCard
                documents={activeDocuments}
                docMenuId={docMenuId}
                downloadingId={downloadingId}
                downloadingAll={downloadingAll}
                onToggleMenu={(id) =>
                  setDocMenuId((cur) => (cur === id ? null : id))
                }
                onDownload={(doc) => void downloadDocument(doc)}
                onDownloadAll={() => void downloadAllDocuments()}
              />

              {showCeoActions ||
              request.ceoDecisionNotes?.trim() ||
              request.status === "approved" ||
              request.status === "partially_approved" ||
              request.status === "rejected" ? (
                <section className="pf-rev-card">
                  <div className="pf-rev-card-head">
                    <div className="pf-rev-card-title">
                      <span className="pf-new-review-icon" aria-hidden>
                        <FileText size={16} />
                      </span>
                      <h2>CEO Decision Notes</h2>
                    </div>
                  </div>
                  {showCeoActions ? (
                    <>
                      <textarea
                        className="pf-rev-notes"
                        rows={5}
                        placeholder="Add your decision notes here…"
                        value={ceoNotesDraft}
                        disabled={actionBusy}
                        onChange={(e) => setCeoNotesDraft(e.target.value)}
                      />
                      <p className="pf-rev-notes-hint">
                        These notes are recorded with Approve, Partial Approve,
                        Query, or Reject. There is no separate save-notes
                        action.
                      </p>
                    </>
                  ) : request.ceoDecisionNotes?.trim() ? (
                    <p className="pf-req-description">
                      {request.ceoDecisionNotes.trim()}
                    </p>
                  ) : (
                    <p className="pf-rev-notes-empty">
                      No CEO decision notes recorded.
                    </p>
                  )}
                </section>
              ) : (
                <section className="pf-rev-card">
                  <div className="pf-rev-card-head">
                    <div className="pf-rev-card-title">
                      <span className="pf-new-review-icon" aria-hidden>
                        <FileText size={16} />
                      </span>
                      <h2>Review & Notes</h2>
                    </div>
                  </div>
                  {canReview &&
                  (request.status === "submitted" ||
                    request.status === "under_review") ? (
                    <>
                      <textarea
                        className="pf-rev-notes"
                        rows={5}
                        placeholder="Add your review notes here…"
                        value={notesDraft}
                        disabled={actionBusy}
                        onChange={(e) => setNotesDraft(e.target.value)}
                      />
                      <p className="pf-rev-notes-hint">
                        These notes are applied when you Query the requester or
                        Send to CEO. There is no separate save-notes action in
                        the current workflow.
                      </p>
                    </>
                  ) : request.financeNotes?.trim() ? (
                    <p className="pf-req-description">
                      {request.financeNotes.trim()}
                    </p>
                  ) : (
                    <p className="pf-rev-notes-empty">
                      No finance review notes recorded yet.
                    </p>
                  )}
                </section>
              )}
            </>
          ) : null}

          {tab === "finance_review" ? (
            <section className="pf-rev-card">
              <div className="pf-rev-card-head">
                <div className="pf-rev-card-title">
                  <h2>Finance Review</h2>
                </div>
              </div>
              <FinanceReviewCard
                financeNotes={request.financeNotes}
                requestedAmount={request.requestedAmount}
                currency={request.currency}
                sentToCeoEvent={sentToCeoEvent}
                actorLabel={actorLabel}
                eventCount={financeReviewEvents.length}
                embedded
              />
              {financeReviewEvents.length === 0 ? (
                <p className="pf-rev-notes-empty">
                  No Finance review events yet.
                </p>
              ) : (
                <ol className="pf-rev-timeline" style={{ marginTop: "1rem" }}>
                  {financeReviewEvents.map((ev) => (
                    <li key={ev.id}>
                      <span className="pf-rev-timeline-dot" aria-hidden />
                      <div>
                        <strong>
                          {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                        </strong>
                        <span>
                          {formatDateTime(ev.createdAt)} ·{" "}
                          {actorLabel(ev.actorProfileId)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}

          {tab === "documents" ? (
            <DocumentsCard
              documents={activeDocuments}
              docMenuId={docMenuId}
              downloadingId={downloadingId}
              downloadingAll={downloadingAll}
              onToggleMenu={(id) =>
                setDocMenuId((cur) => (cur === id ? null : id))
              }
              onDownload={(doc) => void downloadDocument(doc)}
              onDownloadAll={() => void downloadAllDocuments()}
            />
          ) : null}

          {tab === "activity" ? (
            <section className="pf-rev-card">
              <div className="pf-rev-card-head">
                <div className="pf-rev-card-title">
                  <h2>Activity</h2>
                </div>
              </div>
              {detail.events.length === 0 ? (
                <p className="pf-rev-notes-empty">No activity yet.</p>
              ) : (
                <ol className="pf-rev-timeline">
                  {detail.events.map((ev) => (
                    <li key={ev.id}>
                      <span className="pf-rev-timeline-dot" aria-hidden />
                      <div>
                        <strong>
                          {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                        </strong>
                        <span>
                          {formatDateTime(ev.createdAt)} ·{" "}
                          {actorLabel(ev.actorProfileId)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}
        </div>

        <aside className="pf-rev-aside">
          <section className="pf-rev-card">
            <h3 className="pf-rev-aside-title">Request status</h3>
            <div className="pf-rev-status-block">
              <span
                className={`pf-rev-status-dot ${STATUS_TONE[request.status]}`}
                aria-hidden
              />
              <div>
                <strong>{STATUS_LABELS[request.status]}</strong>
                <p>{statusExplanation(request.status)}</p>
              </div>
            </div>
          </section>

          {isCeoWorkspace || showCeoActions ? (
            <section className="pf-rev-card">
              <h3 className="pf-rev-aside-title">Workflow</h3>
              {workflowEvents.length === 0 ? (
                <p className="pf-rev-notes-empty">No workflow events yet.</p>
              ) : (
                <ol className="pf-rev-timeline">
                  {workflowEvents.map((ev) => (
                    <li key={ev.id}>
                      <span className="pf-rev-timeline-dot is-filled" aria-hidden>
                        <Check size={10} strokeWidth={3} />
                      </span>
                      <div>
                        <strong>
                          {ev.eventType === "review_started"
                            ? "Under review (Finance)"
                            : ev.eventType === "sent_to_ceo"
                              ? "Pending CEO approval"
                              : EVENT_LABELS[ev.eventType] ?? ev.eventType}
                        </strong>
                        <span>{formatDateTime(ev.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : (
            <section className="pf-rev-card">
              <h3 className="pf-rev-aside-title">Next steps</h3>
              <ol className="pf-rev-next-steps">
                {nextSteps.map((step) => (
                  <li key={step.key} className={`is-${step.state}`}>
                    <span className="pf-rev-next-index" aria-hidden>
                      {step.state === "done" ? (
                        <Check size={12} strokeWidth={2.5} />
                      ) : null}
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.hint}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {showCeoActions ? (
            <section className="pf-rev-card">
              <h3 className="pf-rev-aside-title">Actions</h3>
              {confirmAction === "partial" ? (
                <div className="pf-rev-partial-form">
                  <label htmlFor="pf-ceo-partial-amount">
                    Approved amount (must be greater than 0 and less than
                    requested{" "}
                    {formatNaira(request.requestedAmount, request.currency)})
                  </label>
                  <div className="pf-new-amount-wrap">
                    <span aria-hidden>₦</span>
                    <input
                      id="pf-ceo-partial-amount"
                      inputMode="decimal"
                      value={partialAmount}
                      disabled={actionBusy}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="pf-rev-action-row">
                    <button
                      type="button"
                      className="pf-btn-secondary"
                      disabled={actionBusy}
                      onClick={() => setConfirmAction(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="pf-btn-primary"
                      disabled={actionBusy}
                      onClick={() => {
                        const amount = partialAmountValue();
                        if (
                          amount == null ||
                          amount <= 0 ||
                          amount >= request.requestedAmount
                        ) {
                          setActionError(
                            "Approved amount must be greater than 0 and less than the requested amount."
                          );
                          return;
                        }
                        void runAction(() =>
                          PlatformFinanceRequestsService.partiallyApproveRequest(
                            requestId,
                            {
                              approvedAmount: amount,
                              decisionNotes: ceoNotesDraft.trim()
                                ? ceoNotesDraft.trim()
                                : null,
                            }
                          )
                        );
                      }}
                    >
                      Confirm partial
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pf-rev-actions">
                  <button
                    type="button"
                    className="pf-btn-primary pf-rev-action-btn"
                    disabled={actionBusy}
                    onClick={() => setConfirmAction("approve")}
                  >
                    <CheckCircle2 size={15} aria-hidden />
                    Approve Request
                  </button>
                  <button
                    type="button"
                    className="pf-btn-secondary pf-rev-action-btn"
                    disabled={actionBusy}
                    onClick={() => {
                      setActionError(null);
                      setConfirmAction("partial");
                    }}
                  >
                    <Pencil size={15} aria-hidden />
                    Partially Approve
                  </button>
                  <button
                    type="button"
                    className="pf-btn-secondary pf-rev-action-btn"
                    disabled={actionBusy}
                    onClick={() => {
                      if (!ceoNotesDraft.trim()) {
                        setActionError(
                          "A query reason is required. Add decision notes, then Query."
                        );
                        return;
                      }
                      setConfirmAction("query_ceo");
                    }}
                  >
                    <MessageSquare size={15} aria-hidden />
                    Query
                  </button>
                  <button
                    type="button"
                    className="pf-btn-danger-outline pf-rev-action-btn"
                    disabled={actionBusy}
                    onClick={() => {
                      if (!ceoNotesDraft.trim()) {
                        setActionError(
                          "A rejection reason is required. Add decision notes, then Reject."
                        );
                        return;
                      }
                      setConfirmAction("reject");
                    }}
                  >
                    <X size={15} aria-hidden />
                    Reject Request
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {canReview && !showCeoActions ? (
            <section className="pf-rev-card">
              <h3 className="pf-rev-aside-title">Actions</h3>
              <div className="pf-rev-actions">
                {showStartReview ? (
                  <button
                    type="button"
                    className="pf-btn-primary pf-rev-action-btn"
                    disabled={actionBusy}
                    onClick={() =>
                      void runAction(() =>
                        PlatformFinanceRequestsService.startRequestReview(
                          requestId
                        )
                      )
                    }
                  >
                    Start review
                  </button>
                ) : null}

                {showFinanceActions ? (
                  <>
                    <button
                      type="button"
                      className="pf-btn-primary pf-rev-action-btn"
                      disabled={actionBusy}
                      onClick={() => {
                        if (!notesDraft.trim()) {
                          setActionError(
                            "A query reason is required. Add notes above, then Query Request."
                          );
                          return;
                        }
                        setConfirmAction("query");
                      }}
                    >
                      <MessageSquare size={15} aria-hidden />
                      Query Request
                    </button>
                    <button
                      type="button"
                      className="pf-btn-secondary pf-rev-action-btn"
                      disabled={actionBusy}
                      onClick={() => setConfirmAction("send_to_ceo")}
                    >
                      <Send size={15} aria-hidden />
                      Send to CEO
                    </button>
                  </>
                ) : null}

                {!showStartReview && !showFinanceActions ? (
                  <p className="pf-rev-notes-empty">
                    No Finance review actions are available in the current
                    status.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {showCeoActions ? (
            <section className="pf-new-guide">
              <div className="pf-new-guide-head">
                <Info size={16} aria-hidden />
                <strong>Before you decide</strong>
              </div>
              <p className="pf-new-guide-lead">Please ensure that:</p>
              <ul>
                <li>You have reviewed the request details</li>
                <li>You have considered Finance review notes</li>
                <li>You have inspected supporting documents</li>
                <li>
                  You understand approval is a funding decision only — not
                  payment or posting
                </li>
              </ul>
            </section>
          ) : null}

          <section className="pf-rev-card">
            <div className="pf-rev-card-head">
              <h3 className="pf-rev-aside-title">Activity</h3>
              <button
                type="button"
                className="pf-new-review-edit"
                onClick={() => setTab("activity")}
              >
                View all
              </button>
            </div>
            {detail.events.length === 0 ? (
              <p className="pf-rev-notes-empty">No activity yet.</p>
            ) : (
              <ol className="pf-rev-timeline is-compact">
                {detail.events.slice(0, 5).map((ev) => (
                  <li key={ev.id}>
                    <span className="pf-rev-timeline-dot" aria-hidden />
                    <div>
                      <strong>
                        {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                      </strong>
                      <span>
                        {formatDateTime(ev.createdAt)} ·{" "}
                        {actorLabel(ev.actorProfileId)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmAction === "query"}
        title="Query request?"
        description={`Query “${request.purpose}” (${formatNaira(request.requestedAmount, request.currency)}). Your notes will be recorded as the Finance query reason.`}
        confirmLabel="Query Request"
        loading={actionBusy}
        onClose={() => {
          if (!actionBusy) setConfirmAction(null);
        }}
        onConfirm={() => {
          void runAction(() =>
            PlatformFinanceRequestsService.queryRequest(requestId, {
              reason: notesDraft.trim(),
              actorRole: "finance",
            })
          );
        }}
      />

      <ConfirmDialog
        open={confirmAction === "send_to_ceo"}
        title="Send to CEO?"
        description={`Route “${request.purpose}” (${formatNaira(request.requestedAmount, request.currency)}) for CEO funding decision.`}
        confirmLabel="Send to CEO"
        loading={actionBusy}
        onClose={() => {
          if (!actionBusy) setConfirmAction(null);
        }}
        onConfirm={() => {
          void runAction(() =>
            PlatformFinanceRequestsService.sendRequestToCeo(
              requestId,
              notesDraft.trim() ? notesDraft.trim() : null
            )
          );
        }}
      />

      <ConfirmDialog
        open={confirmAction === "approve"}
        title="Approve request?"
        description={`Approve “${request.purpose}” for the full requested amount ${formatNaira(request.requestedAmount, request.currency)}. This is a funding decision only — it does not create a payment or posting.`}
        confirmLabel="Approve Request"
        loading={actionBusy}
        onClose={() => {
          if (!actionBusy) setConfirmAction(null);
        }}
        onConfirm={() => {
          void runAction(() =>
            PlatformFinanceRequestsService.approveRequest(
              requestId,
              ceoNotesDraft.trim() ? ceoNotesDraft.trim() : null
            )
          );
        }}
      />

      <ConfirmDialog
        open={confirmAction === "query_ceo"}
        title="Query request?"
        description={`Send “${request.purpose}” (${formatNaira(request.requestedAmount, request.currency)}) to QUERY. Your decision notes will be recorded as the query reason.`}
        confirmLabel="Query"
        loading={actionBusy}
        onClose={() => {
          if (!actionBusy) setConfirmAction(null);
        }}
        onConfirm={() => {
          void runAction(() =>
            PlatformFinanceRequestsService.queryRequest(requestId, {
              reason: ceoNotesDraft.trim(),
              actorRole: "ceo",
            })
          );
        }}
      />

      <ConfirmDialog
        open={confirmAction === "reject"}
        title="Reject request?"
        description={`Reject “${request.purpose}” (${formatNaira(request.requestedAmount, request.currency)}). This decision is terminal for the Financial Request.`}
        confirmLabel="Reject Request"
        danger
        loading={actionBusy}
        onClose={() => {
          if (!actionBusy) setConfirmAction(null);
        }}
        onConfirm={() => {
          void runAction(() =>
            PlatformFinanceRequestsService.rejectRequest(
              requestId,
              ceoNotesDraft.trim()
            )
          );
        }}
      />
    </div>
  );
}

function FinanceReviewCard({
  financeNotes,
  requestedAmount,
  currency,
  sentToCeoEvent,
  actorLabel,
  eventCount,
  onViewAll,
  embedded,
}: {
  financeNotes: string | null;
  requestedAmount: number;
  currency: string;
  sentToCeoEvent: { actorProfileId: string; createdAt: string } | null;
  actorLabel: (id: string) => string;
  eventCount: number;
  onViewAll?: () => void;
  embedded?: boolean;
}) {
  return (
    <section className={embedded ? undefined : "pf-rev-card"}>
      {!embedded ? (
        <div className="pf-rev-card-head">
          <div className="pf-rev-card-title">
            <span className="pf-new-review-icon" aria-hidden>
              <FileText size={16} />
            </span>
            <h2>Finance Review</h2>
          </div>
          {onViewAll ? (
            <button
              type="button"
              className="pf-new-review-edit"
              onClick={onViewAll}
            >
              View all ({eventCount})
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="pf-rev-finance-review">
        {sentToCeoEvent ? (
          <p className="pf-rev-finance-meta">
            Routed by {actorLabel(sentToCeoEvent.actorProfileId)} ·{" "}
            {formatDateTime(sentToCeoEvent.createdAt)}
          </p>
        ) : (
          <p className="pf-rev-finance-meta">Finance review findings</p>
        )}
        <span className="pf-rev-finance-badge">
          Forwarded for decision · {formatNaira(requestedAmount, currency)}
        </span>
        {financeNotes?.trim() ? (
          <p className="pf-req-description">{financeNotes.trim()}</p>
        ) : (
          <p className="pf-rev-notes-empty">
            No Finance notes recorded on this request.
          </p>
        )}
      </div>
    </section>
  );
}

function DocumentsCard({
  documents,
  docMenuId,
  downloadingId,
  downloadingAll,
  onToggleMenu,
  onDownload,
  onDownloadAll,
}: {
  documents: FinancialRequestDocument[];
  docMenuId: string | null;
  downloadingId: string | null;
  downloadingAll: boolean;
  onToggleMenu: (id: string) => void;
  onDownload: (doc: FinancialRequestDocument) => void;
  onDownloadAll: () => void;
}) {
  return (
    <section className="pf-rev-card">
      <div className="pf-rev-card-head">
        <div className="pf-rev-card-title">
          <span className="pf-new-review-icon" aria-hidden>
            <Paperclip size={16} />
          </span>
          <h2>Supporting Documents ({documents.length})</h2>
        </div>
        <button
          type="button"
          className="pf-btn-secondary"
          disabled={documents.length === 0 || downloadingAll}
          onClick={onDownloadAll}
        >
          <Download size={14} aria-hidden />
          {downloadingAll ? "Downloading…" : "Download all"}
        </button>
      </div>
      {documents.length === 0 ? (
        <p className="pf-rev-notes-empty">No active documents.</p>
      ) : (
        <ul className="pf-new-docs-list">
          {documents.map((doc) => (
            <li key={doc.id} className="pf-new-doc-row">
              <FileTypeIcon mimeType={doc.mimeType} filename={doc.filename} />
              <div className="pf-new-doc-meta">
                <strong>{doc.filename}</strong>
                <span>
                  {mimeTypeLabel(doc.mimeType, doc.filename)} ·{" "}
                  {formatFileSize(doc.byteSize)} · Uploaded{" "}
                  {formatUploadedAt(doc.uploadedAt)}
                </span>
              </div>
              <div className="pf-new-doc-role-chip">
                {FINANCE_REQUEST_DOCUMENT_ROLE_LABELS[doc.documentRole]}
              </div>
              <div className="pf-rev-doc-actions pf-new-doc-actions">
                <button
                  type="button"
                  className="pf-new-doc-menu-btn"
                  aria-label={`Actions for ${doc.filename}`}
                  aria-expanded={docMenuId === doc.id}
                  disabled={downloadingId === doc.id || downloadingAll}
                  onClick={() => onToggleMenu(doc.id)}
                >
                  <MoreVertical size={16} aria-hidden />
                </button>
                {docMenuId === doc.id ? (
                  <div className="pf-new-doc-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={downloadingId === doc.id}
                      onClick={() => onDownload(doc)}
                    >
                      {downloadingId === doc.id ? "Downloading…" : "Download"}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
