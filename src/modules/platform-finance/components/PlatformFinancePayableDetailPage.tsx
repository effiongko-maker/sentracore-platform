"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coins,
  Download,
  ExternalLink,
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
  Zap,
  BarChart3,
} from "lucide-react";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import {
  PlatformFinancePayablesService,
  type FinancePayableCapabilities,
  type FinancePayableDetail,
} from "@/services/platform-finance/PlatformFinancePayablesService";
import {
  PlatformFinancePaymentsService,
  type FinancePaymentCapabilities,
  type RevealedPayableDestination,
} from "@/services/platform-finance/PlatformFinancePaymentsService";
import type {
  FinancePayableDocument,
  FinancePayableDocumentRole,
  FinancePayableEvent,
  FinancePayableStatus,
  FinancePayableView,
} from "@/modules/platform-finance/domain/payables";
import { isFinancePayablePaymentEligible } from "@/modules/platform-finance/domain/payables";
import type { FinancePaymentView } from "@/modules/platform-finance/domain/payments";
import type { FinanceFinancialAccountView } from "@/modules/platform-finance/types";
import { PlatformFinancePaymentReviewDrawer } from "@/modules/platform-finance/components/PlatformFinancePaymentReviewDrawer";
import {
  FINANCE_PAYABLE_DOCUMENT_ACCEPT,
  FINANCE_PAYABLE_DOCUMENT_ROLE_LABELS,
  formatFileSize,
  formatUploadedAt,
  mimeTypeLabel,
  prevalidateFinancePayableDocumentFile,
} from "@/modules/platform-finance/payableDocumentUi";

type WorkspaceTab = "overview" | "documents" | "history" | "payments";
type PendingAction = null | "query" | "reject" | "partial" | "cancel";

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
  partially_paid: "Partially Paid",
  scheduled: "Scheduled",
  payment_pending: "Payment Pending",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const STATUS_TONE: Record<FinancePayableStatus, string> = {
  draft: "is-muted",
  pending_approval: "is-info",
  approved: "is-success",
  partially_paid: "is-amber",
  scheduled: "is-amber",
  payment_pending: "is-amber",
  paid: "is-success",
  rejected: "is-danger",
  cancelled: "is-muted",
  disputed: "is-purple",
};

const SOURCE_LABELS = {
  financial_request: "Financial Request",
  vendor_bill: "Vendor Bill",
} as const;

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  payment_initiated: "Payment initiated",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
  disputed: "Disputed",
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

function payableReference(payable: Pick<FinancePayableView, "id">): string {
  return payable.id.slice(0, 8).toUpperCase();
}

function profileLabel(profileId: string | null | undefined): string {
  if (!profileId) return "—";
  return `Profile · ${profileId.slice(0, 8).toUpperCase()}`;
}

function eventComment(event: FinancePayableEvent): string {
  const meta = event.metadata ?? {};
  const reason =
    typeof meta.reason === "string"
      ? meta.reason
      : typeof meta.query_reason === "string"
        ? meta.query_reason
        : typeof meta.queryReason === "string"
          ? meta.queryReason
          : typeof meta.decisionNotes === "string"
            ? meta.decisionNotes
            : typeof meta.decision_notes === "string"
              ? meta.decision_notes
              : null;
  if (reason?.trim()) return reason.trim();
  if (typeof meta.filename === "string" && meta.filename.trim()) {
    return meta.filename.trim();
  }
  if (
    typeof meta.approvedAmount === "number" &&
    Number.isFinite(meta.approvedAmount)
  ) {
    return `Approved amount ${formatNaira(meta.approvedAmount)}`;
  }
  if (
    typeof meta.approved_amount === "number" &&
    Number.isFinite(meta.approved_amount)
  ) {
    return `Approved amount ${formatNaira(meta.approved_amount)}`;
  }
  return "—";
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

export function PlatformFinancePayableDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const payableId = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<FinancePayableDetail | null>(null);
  const [caps, setCaps] = useState<FinancePayableCapabilities | null>(null);
  const [paymentCaps, setPaymentCaps] =
    useState<FinancePaymentCapabilities | null>(null);
  const [payments, setPayments] = useState<FinancePaymentView[]>([]);
  const [reviewPaymentId, setReviewPaymentId] = useState<string | null>(null);
  const [sourceAccounts, setSourceAccounts] = useState<
    FinanceFinancialAccountView[]
  >([]);
  const [companies, setCompanies] = useState<AccessibleCompany[]>([]);
  const [tab, setTab] = useState<WorkspaceTab>("overview");

  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [partialAmount, setPartialAmount] = useState("");

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const [revealedDestination, setRevealedDestination] =
    useState<RevealedPayableDestination | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [editingDraft, setEditingDraft] = useState(false);
  const [draftPayeeName, setDraftPayeeName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");

  const [docMenuId, setDocMenuId] = useState<string | null>(null);
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadRole, setUploadRole] =
    useState<FinancePayableDocumentRole>("supporting");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!payableId) {
      setError("Payable not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const [capability, payableDetail, cos, paymentCapability] =
        await Promise.all([
          PlatformFinancePayablesService.getMyPayableCapabilities(),
          PlatformFinancePayablesService.getPayableDetail(payableId),
          PlatformFinancePayablesService.listAccessibleCompanies(),
          PlatformFinancePaymentsService.getMyPaymentCapabilities().catch(
            () => ({ view: false, execute: false })
          ),
        ]);
      setCaps(capability);
      setPaymentCaps(paymentCapability);
      setDetail(payableDetail);
      setCompanies(cos.filter((c) => c.status === "active"));
      setDraftPayeeName(payableDetail.payable.payeeName);
      setDraftDescription(payableDetail.payable.description ?? "");
      setDraftAmount(String(payableDetail.payable.payableAmount));
      setDraftDueDate(payableDetail.payable.dueDate?.slice(0, 10) ?? "");
      setEditingDraft(false);
      setPendingAction(null);
      setReasonDraft("");
      setPartialAmount("");
      setPayAmount(String(payableDetail.payable.outstandingAmount));
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayReference("");
      setPayAccountId("");
      setRevealedDestination(null);
      setPayError(null);

      if (paymentCapability.view || paymentCapability.execute) {
        const history =
          await PlatformFinancePaymentsService.listPaymentsForPayable(
            payableId
          ).catch(() => [] as FinancePaymentView[]);
        setPayments(history);
      } else {
        setPayments([]);
      }

      if (
        paymentCapability.execute &&
        isFinancePayablePaymentEligible(payableDetail.payable.status)
      ) {
        const accounts =
          await PlatformFinancePaymentsService.listPayableSourceFinancialAccounts(
            payableId
          ).catch(() => [] as FinanceFinancialAccountView[]);
        setSourceAccounts(accounts);
      } else {
        setSourceAccounts([]);
      }
    } catch (err: unknown) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Unable to load payable.");
    } finally {
      setLoading(false);
    }
  }, [payableId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!docMenuId) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node | null;
      if (
        target &&
        target instanceof Element &&
        target.closest(".pf-payd-doc-actions")
      ) {
        return;
      }
      setDocMenuId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [docMenuId]);

  const payable = detail?.payable ?? null;
  const companyName = useMemo(() => {
    if (!payable) return "—";
    return companies.find((c) => c.id === payable.companyId)?.name ?? "—";
  }, [companies, payable]);

  const activeDocuments = useMemo(
    () => (detail?.documents ?? []).filter((d) => d.supersededAt == null),
    [detail?.documents]
  );

  const events = detail?.events ?? [];
  const approvedEvent = useMemo(
    () =>
      [...events].reverse().find((e) => e.eventType === "approved") ?? null,
    [events]
  );
  const lastEvent = events.length > 0 ? events[events.length - 1]! : null;

  const canConfirmPayment = Boolean(
    paymentCaps?.execute &&
      payable &&
      isFinancePayablePaymentEligible(payable.status) &&
      payable.paymentDestination
  );

  async function revealDestination() {
    if (!payableId) return;
    setRevealBusy(true);
    setPayError(null);
    try {
      const revealed =
        await PlatformFinancePaymentsService.revealPayableDestination(
          payableId
        );
      setRevealedDestination(revealed);
    } catch (err: unknown) {
      setPayError(
        err instanceof Error ? err.message : "Unable to reveal account number."
      );
    } finally {
      setRevealBusy(false);
    }
  }

  async function confirmExternalPayment() {
    if (!payable || !payableId) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError("Enter a payment amount greater than zero.");
      return;
    }
    if (!payAccountId) {
      setPayError("Select the corporate financial account used for payment.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
      setPayError("Enter a valid payment date.");
      return;
    }
    setPayBusy(true);
    setPayError(null);
    try {
      await PlatformFinancePaymentsService.confirmPayment({
        payableId,
        sourceFinancialAccountId: payAccountId,
        amount,
        paymentDate: payDate,
        externalReference: payReference.trim() || null,
      });
      setRevealedDestination(null);
      await load();
    } catch (err: unknown) {
      setPayError(
        err instanceof Error
          ? err.message
          : "Unable to confirm external payment."
      );
    } finally {
      setPayBusy(false);
    }
  }

  const isOwn = Boolean(
    payable && caps && payable.createdByProfileId === caps.profileId
  );
  const canCreate = Boolean(caps?.create) && isOwn;
  const canReview = Boolean(caps?.review) && !isOwn;
  const canApprove = Boolean(caps?.approve) && !isOwn;

  const showSubmit = canCreate && payable?.status === "draft";
  const showEditDraft = canCreate && payable?.status === "draft";
  const showCancel =
    (canCreate || canReview) &&
    (payable?.status === "draft" || payable?.status === "pending_approval");
  const showStartReview =
    canReview && payable?.status === "pending_approval";
  const showQuery = canReview && payable?.status === "pending_approval";
  const showApproveActions =
    canApprove && payable?.status === "pending_approval";
  const canManageDocs =
    canCreate &&
    (payable?.status === "draft" || payable?.status === "pending_approval");
  const canRemoveDocs = canCreate && payable?.status === "draft";
  const canSupersedeDocs =
    canCreate &&
    payable?.status !== "draft" &&
    payable?.status !== "paid" &&
    payable?.status !== "rejected" &&
    payable?.status !== "cancelled";

  const refLabel = payable ? payableReference(payable) : "…";
  const sourceRequest = detail?.sourceRequest ?? null;

  async function refreshAfterAction() {
    await load();
  }

  async function runAction(fn: () => Promise<unknown>): Promise<void> {
    setActionBusy(true);
    setActionError(null);
    try {
      await fn();
      await refreshAfterAction();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionBusy(false);
    }
  }

  async function saveDraft() {
    if (!payable) return;
    const amount = Number(draftAmount);
    if (!draftPayeeName.trim()) {
      setActionError("Payee name is required.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError("Enter a valid payable amount.");
      return;
    }
    await runAction(() =>
      PlatformFinancePayablesService.updateDraftPayable(payable.id, {
        payeeName: draftPayeeName.trim(),
        description: draftDescription.trim() || null,
        payableAmount: amount,
        dueDate: draftDueDate.trim() || null,
        clearDueDate: !draftDueDate.trim(),
      })
    );
  }

  async function openDocument(documentId: string) {
    if (!payable) return;
    setDocBusyId(documentId);
    setDocMenuId(null);
    try {
      const { signedUrl } =
        await PlatformFinancePayablesService.getDocumentSignedUrl(
          payable.id,
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

  async function removeDocument(documentId: string) {
    if (!payable) return;
    setDocBusyId(documentId);
    setDocMenuId(null);
    try {
      await PlatformFinancePayablesService.removeDocument(
        payable.id,
        documentId
      );
      await refreshAfterAction();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Unable to remove document."
      );
    } finally {
      setDocBusyId(null);
    }
  }

  async function onUploadSelected(fileList: FileList | null) {
    if (!payable || !fileList?.length) return;
    const file = fileList[0]!;
    const pre = prevalidateFinancePayableDocumentFile(file);
    if (pre) {
      setActionError(pre);
      return;
    }
    setUploadBusy(true);
    setActionError(null);
    try {
      await PlatformFinancePayablesService.uploadDocument({
        payableId: payable.id,
        file,
        documentRole: uploadRole,
      });
      await refreshAfterAction();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Unable to upload document."
      );
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function supersedeDocument(documentId: string, file: File) {
    if (!payable) return;
    const pre = prevalidateFinancePayableDocumentFile(file);
    if (pre) {
      setActionError(pre);
      return;
    }
    setDocBusyId(documentId);
    setDocMenuId(null);
    try {
      await PlatformFinancePayablesService.supersedeDocument({
        payableId: payable.id,
        documentId,
        file,
      });
      await refreshAfterAction();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Unable to supersede document."
      );
    } finally {
      setDocBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="pf-rev pf-payd">
        <p className="pf-state-message">Loading payable…</p>
      </div>
    );
  }

  if (error || !payable) {
    return (
      <div className="pf-rev pf-payd">
        <nav className="pf-rev-breadcrumb" aria-label="Breadcrumb">
          <Link href="/platform-finance">Finance</Link>
          <span aria-hidden>/</span>
          <Link href="/platform-finance/payables">Payables</Link>
        </nav>
        <p className="pf-state-message is-error">
          {error ?? "Payable not found."}
        </p>
        <Link href="/platform-finance/payables" className="pf-btn-secondary">
          <ArrowLeft size={14} aria-hidden />
          Back to Payables
        </Link>
      </div>
    );
  }

  return (
    <div className="pf-rev pf-payd">
      <nav className="pf-rev-breadcrumb" aria-label="Breadcrumb">
        <Link href="/platform-finance">Finance</Link>
        <span aria-hidden>/</span>
        <Link href="/platform-finance/payables">Payables</Link>
        <span aria-hidden>/</span>
        <span>{refLabel}</span>
      </nav>

      <header className="pf-rev-header pf-payd-header">
        <div className="pf-rev-header-main">
          <div className="pf-payd-title-row">
            <h1 className="pf-ov-title">{payable.payeeName}</h1>
            <span className="pf-payd-id">{refLabel}</span>
          </div>
          {payable.description ? (
            <p className="pf-ov-desc">{payable.description}</p>
          ) : null}
        </div>
        <div className="pf-payd-header-status">
          <span className={`pf-req-status ${STATUS_TONE[payable.status]}`}>
            {payable.status === "approved" ? (
              <CheckCircle2 size={14} aria-hidden />
            ) : null}
            {STATUS_LABELS[payable.status]}
          </span>
        </div>
      </header>

      <div className="pf-rev-tabs" role="tablist" aria-label="Payable sections">
        {(
          [
            ["overview", "Overview"],
            ["payments", `Payments (${payments.length})`],
            ["documents", `Documents (${activeDocuments.length})`],
            ["history", `History (${events.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`pf-rev-tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pf-rev-layout">
        <div className="pf-rev-main">
          {tab === "overview" ? (
            <>
              <div className="pf-payd-info-grid">
                <InfoCard
                  icon={<FileText size={15} />}
                  title="Source"
                >
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
                    <>
                      <Link
                        href={`/platform-finance/requests/${payable.sourceId}`}
                        className="pf-payd-source-link"
                      >
                        {sourceRequest?.externalReference?.trim() ||
                          payable.sourceId.slice(0, 8).toUpperCase()}
                        <ExternalLink size={12} aria-hidden />
                      </Link>
                      <p className="pf-payd-muted">
                        Created from an approved financial request.
                      </p>
                    </>
                  ) : (
                    <p className="pf-payd-muted">
                      Native vendor-bill payable. Source reference is opaque.
                    </p>
                  )}
                </InfoCard>
                <InfoCard icon={<Building2 size={15} />} title="Company">
                  <p className="pf-payd-strong">{companyName}</p>
                </InfoCard>
                <InfoCard icon={<UserRound size={15} />} title="Payee">
                  <p className="pf-payd-strong">{payable.payeeName}</p>
                </InfoCard>
                <InfoCard icon={<UserRound size={15} />} title="Payment Destination">
                  {payable.paymentDestination ? (
                    <>
                      <p className="pf-payd-strong">{payable.paymentDestination.bankName}</p>
                      <p className="pf-payd-muted">
                        {payable.paymentDestination.accountName} · ••••{" "}
                        {payable.paymentDestination.accountNumberLast4}
                      </p>
                      {revealedDestination ? (
                        <p className="pf-payd-strong">
                          Account number: {revealedDestination.accountNumber}
                        </p>
                      ) : null}
                      {canConfirmPayment ? (
                        <button
                          type="button"
                          className="pf-btn is-ghost"
                          disabled={revealBusy}
                          onClick={() => void revealDestination()}
                        >
                          {revealBusy
                            ? "Revealing…"
                            : revealedDestination
                              ? "Revealed for external transfer"
                              : "Reveal account number"}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="pf-payd-muted">Not supplied</p>
                  )}
                </InfoCard>
              </div>

              {canConfirmPayment || payments.length > 0 ? (
                <section className="pf-rev-card">
                  <div className="pf-rev-card-head">
                    <div className="pf-rev-card-title">
                      <Coins size={15} aria-hidden />
                      <h2>Record external payment</h2>
                    </div>
                  </div>
                  <p className="pf-payd-muted">
                    Confirm a disbursement already made outside SentraCore
                    through the company&apos;s bank or payment channel. SentraCore
                    does not send money.
                  </p>
                  {canConfirmPayment ? (
                    <div className="pf-payd-pay-form">
                      <label>
                        <span>Payment amount</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Payment date</span>
                        <input
                          type="date"
                          value={payDate}
                          onChange={(e) => setPayDate(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>External bank / transaction reference</span>
                        <input
                          type="text"
                          value={payReference}
                          onChange={(e) => setPayReference(e.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                      <label>
                        <span>Paid from financial account</span>
                        <select
                          value={payAccountId}
                          onChange={(e) => setPayAccountId(e.target.value)}
                        >
                          <option value="">Select account…</option>
                          {sourceAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                              {account.accountNumberLast4
                                ? ` · •••• ${account.accountNumberLast4}`
                                : ""}{" "}
                              ({account.currency})
                            </option>
                          ))}
                        </select>
                      </label>
                      {payError ? (
                        <p className="pf-form-error" role="alert">
                          {payError}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="pf-btn is-primary"
                        disabled={payBusy || sourceAccounts.length === 0}
                        onClick={() => void confirmExternalPayment()}
                      >
                        {payBusy
                          ? "Confirming…"
                          : "Confirm external payment"}
                      </button>
                      {sourceAccounts.length === 0 ? (
                        <p className="pf-payd-muted">
                          No active same-company financial accounts are available
                          for payment.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {payments.length > 0 ? (
                    <div className="pf-payd-pay-history">
                      <h3>Payment history</h3>
                      <ul>
                        {payments.map((payment) => (
                          <li key={payment.id}>
                            <strong>
                              {formatNaira(payment.amount, payment.currency)}
                            </strong>{" "}
                            on {formatDate(payment.paymentDate)}
                            {payment.externalReference
                              ? ` · ${payment.externalReference}`
                              : ""}
                            <br />
                            <span className="pf-payd-muted">
                              From{" "}
                              {payment.sourceFinancialAccountName ??
                                "financial account"}
                              {payment.sourceFinancialAccountLast4
                                ? ` · •••• ${payment.sourceFinancialAccountLast4}`
                                : ""}{" "}
                              · {payment.status}
                            </span>
                            <br />
                            <button type="button" className="pf-link-btn" onClick={() => setReviewPaymentId(payment.id)}>
                              Review &amp; Post accounting
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="pf-rev-card">
                <div className="pf-rev-card-head">
                  <div className="pf-rev-card-title">
                    <Info size={15} aria-hidden />
                    <h2>Description</h2>
                  </div>
                </div>
                <p className="pf-payd-description">
                  {payable.description?.trim() || "—"}
                </p>
              </section>

              <div className="pf-payd-two-grid">
                <section className="pf-rev-card">
                  <div className="pf-rev-card-head">
                    <div className="pf-rev-card-title">
                      <CalendarDays size={15} aria-hidden />
                      <h2>Dates</h2>
                    </div>
                  </div>
                  <dl className="pf-payd-dl">
                    <div>
                      <dt>Due Date</dt>
                      <dd>{formatDate(payable.dueDate)}</dd>
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
                </section>
                <section className="pf-rev-card">
                  <div className="pf-rev-card-head">
                    <div className="pf-rev-card-title">
                      <UserRound size={15} aria-hidden />
                      <h2>Additional Information</h2>
                    </div>
                  </div>
                  <dl className="pf-payd-dl">
                    <div>
                      <dt>Created by</dt>
                      <dd>{profileLabel(payable.createdByProfileId)}</dd>
                    </div>
                    <div>
                      <dt>Last updated by</dt>
                      <dd>
                        {profileLabel(lastEvent?.actorProfileId ?? null)}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              <DocumentsSection
                documents={activeDocuments}
                canUpload={canManageDocs}
                canRemove={canRemoveDocs}
                canSupersede={Boolean(canSupersedeDocs)}
                uploadBusy={uploadBusy}
                uploadRole={uploadRole}
                onUploadRoleChange={setUploadRole}
                fileInputRef={fileInputRef}
                onPickUpload={() => fileInputRef.current?.click()}
                onUploadSelected={onUploadSelected}
                docMenuId={docMenuId}
                docBusyId={docBusyId}
                onToggleMenu={(id) =>
                  setDocMenuId((cur) => (cur === id ? null : id))
                }
                onOpen={openDocument}
                onRemove={removeDocument}
                onSupersede={supersedeDocument}
              />

              <HistorySection events={events} />
            </>
          ) : null}

          {tab === "payments" ? (
            <section className="pf-rev-card">
              <div className="pf-rev-card-head">
                <div className="pf-rev-card-title">
                  <Coins size={15} aria-hidden />
                  <h2>Payments ({payments.length})</h2>
                </div>
              </div>
              {payments.length === 0 ? (
                <p className="pf-payd-muted">No payments recorded yet.</p>
              ) : (
                <ul className="pf-payd-pay-history">
                  {payments.map((payment) => (
                    <li key={payment.id}>
                      <strong>
                        {formatNaira(payment.amount, payment.currency)}
                      </strong>{" "}
                      on {formatDate(payment.paymentDate)}
                      {payment.externalReference
                        ? ` · ${payment.externalReference}`
                        : ""}
                      <br />
                      <span className="pf-payd-muted">
                        From{" "}
                        {payment.sourceFinancialAccountName ??
                          "financial account"}
                        {payment.sourceFinancialAccountLast4
                          ? ` · •••• ${payment.sourceFinancialAccountLast4}`
                          : ""}{" "}
                        · recorded {formatDateTime(payment.createdAt)} ·{" "}
                        {payment.status}
                      </span>
                      <br />
                      <button type="button" className="pf-link-btn" onClick={() => setReviewPaymentId(payment.id)}>
                        Review &amp; Post accounting
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {tab === "documents" ? (
            <DocumentsSection
              documents={activeDocuments}
              canUpload={canManageDocs}
              canRemove={canRemoveDocs}
              canSupersede={Boolean(canSupersedeDocs)}
              uploadBusy={uploadBusy}
              uploadRole={uploadRole}
              onUploadRoleChange={setUploadRole}
              fileInputRef={fileInputRef}
              onPickUpload={() => fileInputRef.current?.click()}
              onUploadSelected={onUploadSelected}
              docMenuId={docMenuId}
              docBusyId={docBusyId}
              onToggleMenu={(id) =>
                setDocMenuId((cur) => (cur === id ? null : id))
              }
              onOpen={openDocument}
              onRemove={removeDocument}
              onSupersede={supersedeDocument}
            />
          ) : null}

          {tab === "history" ? <HistorySection events={events} /> : null}
        </div>

        <aside className="pf-rev-aside">
          <section className="pf-rev-card">
            <div className="pf-rev-card-head">
              <div className="pf-rev-card-title">
                <BarChart3 size={15} aria-hidden />
                <h2 className="pf-rev-aside-title">Amount Summary</h2>
              </div>
            </div>
            <dl className="pf-payd-amount">
              <div>
                <dt>Total Amount</dt>
                <dd>
                  {formatNaira(payable.payableAmount, payable.currency)}
                </dd>
              </div>
              <div>
                <dt>Paid Amount</dt>
                <dd>{formatNaira(payable.paidAmount, payable.currency)}</dd>
              </div>
              <div className="is-outstanding">
                <dt>Outstanding</dt>
                <dd>
                  {formatNaira(payable.outstandingAmount, payable.currency)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="pf-rev-card">
            <div className="pf-rev-card-head">
              <div className="pf-rev-card-title">
                <CheckCircle2 size={15} aria-hidden />
                <h2 className="pf-rev-aside-title">Status</h2>
              </div>
            </div>
            <div className="pf-payd-status-block">
              <p className="pf-payd-muted">Current status</p>
              <span className={`pf-req-status ${STATUS_TONE[payable.status]}`}>
                {STATUS_LABELS[payable.status]}
              </span>
              {payable.status === "approved" && approvedEvent ? (
                <p className="pf-payd-status-meta">
                  Approved on {formatDateTime(approvedEvent.createdAt)}
                </p>
              ) : (
                <p className="pf-payd-status-meta">
                  Updated {formatDateTime(payable.updatedAt)}
                </p>
              )}
            </div>
          </section>

          <section className="pf-rev-card">
            <div className="pf-rev-card-head">
              <div className="pf-rev-card-title">
                <Zap size={15} aria-hidden />
                <h2 className="pf-rev-aside-title">Actions</h2>
              </div>
            </div>
            <p className="pf-payd-muted pf-payd-actions-hint">
              Available actions depend on your role and the current status of
              this payable.
            </p>

            {actionError ? (
              <p className="pf-state-message is-error">{actionError}</p>
            ) : null}

            {editingDraft ? (
              <div className="pf-req-action-form">
                <label>
                  Payee
                  <input
                    value={draftPayeeName}
                    onChange={(e) => setDraftPayeeName(e.target.value)}
                  />
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draftAmount}
                    onChange={(e) => setDraftAmount(e.target.value)}
                  />
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={draftDueDate}
                    onChange={(e) => setDraftDueDate(e.target.value)}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={3}
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                  />
                </label>
                <div className="pf-rev-action-row">
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => setEditingDraft(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pf-btn-primary"
                    disabled={actionBusy}
                    onClick={() => void saveDraft()}
                  >
                    Save draft
                  </button>
                </div>
              </div>
            ) : null}

            {pendingAction === "query" ? (
              <div className="pf-req-action-form">
                <label>
                  Query reason
                  <textarea
                    rows={3}
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                  />
                </label>
                <div className="pf-rev-action-row">
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => setPendingAction(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pf-btn-primary"
                    disabled={actionBusy}
                    onClick={() => {
                      if (!reasonDraft.trim()) {
                        setActionError("A reason is required.");
                        return;
                      }
                      void runAction(() =>
                        PlatformFinancePayablesService.queryPayable(
                          payable.id,
                          reasonDraft.trim()
                        )
                      );
                    }}
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
                    rows={3}
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                  />
                </label>
                <div className="pf-rev-action-row">
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => setPendingAction(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pf-btn-danger-outline"
                    disabled={actionBusy}
                    onClick={() => {
                      if (!reasonDraft.trim()) {
                        setActionError("A rejection reason is required.");
                        return;
                      }
                      void runAction(() =>
                        PlatformFinancePayablesService.rejectPayable(
                          payable.id,
                          reasonDraft.trim()
                        )
                      );
                    }}
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
                    onChange={(e) => setPartialAmount(e.target.value)}
                  />
                </label>
                <label>
                  Notes (optional)
                  <textarea
                    rows={2}
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                  />
                </label>
                <div className="pf-rev-action-row">
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => setPendingAction(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pf-btn-primary"
                    disabled={actionBusy}
                    onClick={() => {
                      const amount = Number(partialAmount);
                      if (!Number.isFinite(amount) || amount <= 0) {
                        setActionError("Enter a valid approved amount.");
                        return;
                      }
                      void runAction(() =>
                        PlatformFinancePayablesService.partiallyApprovePayable(
                          payable.id,
                          amount,
                          reasonDraft.trim() || null
                        )
                      );
                    }}
                  >
                    Partially approve
                  </button>
                </div>
              </div>
            ) : null}

            {pendingAction === "cancel" ? (
              <div className="pf-req-action-form">
                <label>
                  Cancellation reason (optional)
                  <textarea
                    rows={2}
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                  />
                </label>
                <div className="pf-rev-action-row">
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => setPendingAction(null)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="pf-btn-danger-outline"
                    disabled={actionBusy}
                    onClick={() =>
                      void runAction(() =>
                        PlatformFinancePayablesService.cancelPayable(
                          payable.id,
                          reasonDraft.trim() || null
                        )
                      )
                    }
                  >
                    Confirm cancel
                  </button>
                </div>
              </div>
            ) : null}

            {!editingDraft && !pendingAction ? (
              <div className="pf-payd-actions">
                {payable.sourceType === "financial_request" ? (
                  <Link
                    href={`/platform-finance/requests/${payable.sourceId}`}
                    className="pf-payd-action-btn is-primary-outline"
                  >
                    View Financial Request
                    <ExternalLink size={14} aria-hidden />
                  </Link>
                ) : null}

                {showEditDraft ? (
                  <button
                    type="button"
                    className="pf-payd-action-btn"
                    disabled={actionBusy}
                    onClick={() => setEditingDraft(true)}
                  >
                    <Pencil size={14} aria-hidden />
                    Update draft
                  </button>
                ) : null}

                {showSubmit ? (
                  <button
                    type="button"
                    className="pf-btn-primary pf-payd-action-btn is-solid"
                    disabled={actionBusy}
                    onClick={() =>
                      void runAction(() =>
                        PlatformFinancePayablesService.submitPayable(payable.id)
                      )
                    }
                  >
                    <Send size={14} aria-hidden />
                    Submit
                  </button>
                ) : null}

                {showStartReview ? (
                  <button
                    type="button"
                    className="pf-payd-action-btn"
                    disabled={actionBusy}
                    onClick={() =>
                      void runAction(() =>
                        PlatformFinancePayablesService.startReview(payable.id)
                      )
                    }
                  >
                    Start review
                  </button>
                ) : null}

                {showQuery ? (
                  <button
                    type="button"
                    className="pf-payd-action-btn"
                    disabled={actionBusy}
                    onClick={() => setPendingAction("query")}
                  >
                    <MessageSquare size={14} aria-hidden />
                    Query
                  </button>
                ) : null}

                {showApproveActions ? (
                  <>
                    <button
                      type="button"
                      className="pf-btn-primary pf-payd-action-btn is-solid"
                      disabled={actionBusy}
                      onClick={() =>
                        void runAction(() =>
                          PlatformFinancePayablesService.approvePayable(
                            payable.id
                          )
                        )
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="pf-payd-action-btn"
                      disabled={actionBusy}
                      onClick={() => setPendingAction("partial")}
                    >
                      Partial approve
                    </button>
                    <button
                      type="button"
                      className="pf-btn-danger-outline pf-payd-action-btn"
                      disabled={actionBusy}
                      onClick={() => setPendingAction("reject")}
                    >
                      Reject
                    </button>
                  </>
                ) : null}

                {showCancel ? (
                  <button
                    type="button"
                    className="pf-payd-action-btn"
                    disabled={actionBusy}
                    onClick={() => setPendingAction("cancel")}
                  >
                    Cancel payable
                  </button>
                ) : null}

                <div className="pf-payd-action-pair">
                  <button
                    type="button"
                    className="pf-payd-action-btn"
                    onClick={() => router.push("/platform-finance/payables")}
                  >
                    <X size={14} aria-hidden />
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
      {reviewPaymentId ? (
        <PlatformFinancePaymentReviewDrawer
          paymentId={reviewPaymentId}
          onClose={() => setReviewPaymentId(null)}
        />
      ) : null}
    </div>
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="pf-rev-card pf-payd-info-card">
      <div className="pf-rev-card-head">
        <div className="pf-rev-card-title">
          {icon}
          <h2>{title}</h2>
        </div>
      </div>
      <div className="pf-payd-info-body">{children}</div>
    </section>
  );
}

function DocumentsSection({
  documents,
  canUpload,
  canRemove,
  canSupersede,
  uploadBusy,
  uploadRole,
  onUploadRoleChange,
  fileInputRef,
  onPickUpload,
  onUploadSelected,
  docMenuId,
  docBusyId,
  onToggleMenu,
  onOpen,
  onRemove,
  onSupersede,
}: {
  documents: FinancePayableDocument[];
  canUpload: boolean;
  canRemove: boolean;
  canSupersede: boolean;
  uploadBusy: boolean;
  uploadRole: FinancePayableDocumentRole;
  onUploadRoleChange: (role: FinancePayableDocumentRole) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickUpload: () => void;
  onUploadSelected: (files: FileList | null) => void;
  docMenuId: string | null;
  docBusyId: string | null;
  onToggleMenu: (id: string) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onSupersede: (id: string, file: File) => void;
}) {
  const supersedeRefs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <section className="pf-rev-card">
      <div className="pf-rev-card-head">
        <div className="pf-rev-card-title">
          <Paperclip size={15} aria-hidden />
          <h2>Documents ({documents.length})</h2>
        </div>
        {canUpload ? (
          <div className="pf-payd-upload-controls">
            <SearchableSelect
              className="pf-payd-role-select"
              aria-label="Document role"
              value={uploadRole}
              onChange={(v) =>
                onUploadRoleChange(v as FinancePayableDocumentRole)
              }
              allowEmpty={false}
              hideSearch
              options={(
                Object.keys(
                  FINANCE_PAYABLE_DOCUMENT_ROLE_LABELS
                ) as FinancePayableDocumentRole[]
              ).map((role) => ({
                value: role,
                label: FINANCE_PAYABLE_DOCUMENT_ROLE_LABELS[role],
              }))}
            />
            <button
              type="button"
              className="pf-btn-secondary"
              disabled={uploadBusy}
              onClick={onPickUpload}
            >
              {uploadBusy ? "Uploading…" : "Upload Document"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept={FINANCE_PAYABLE_DOCUMENT_ACCEPT}
              onChange={(e) => onUploadSelected(e.target.files)}
            />
          </div>
        ) : null}
      </div>

      {documents.length === 0 ? (
        <p className="pf-state-message">No documents</p>
      ) : (
        <div className="pf-payd-table-wrap">
          <table className="pf-payd-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Uploaded by</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <div className="pf-payd-doc-name">
                      <FileTypeIcon
                        mimeType={doc.mimeType}
                        filename={doc.filename}
                      />
                      <span>{doc.filename}</span>
                    </div>
                  </td>
                  <td>
                    <span className="pf-new-doc-role-chip">
                      {FINANCE_PAYABLE_DOCUMENT_ROLE_LABELS[doc.documentRole]}
                    </span>
                  </td>
                  <td>{formatFileSize(doc.byteSize)}</td>
                  <td>{formatUploadedAt(doc.uploadedAt)}</td>
                  <td>{profileLabel(doc.uploadedByProfileId)}</td>
                  <td>
                    <div className="pf-payd-doc-actions">
                      <button
                        type="button"
                        className="pf-link-btn"
                        disabled={docBusyId === doc.id}
                        onClick={() => onOpen(doc.id)}
                      >
                        <Download size={13} aria-hidden />
                        {docBusyId === doc.id ? "Opening…" : "Download"}
                      </button>
                      {(canRemove || canSupersede) ? (
                        <div className="pf-payd-doc-menu-wrap">
                          <button
                            type="button"
                            className="pf-icon-btn"
                            aria-label="Document actions"
                            onClick={() => onToggleMenu(doc.id)}
                          >
                            <MoreVertical size={15} />
                          </button>
                          {docMenuId === doc.id ? (
                            <div className="pf-payd-doc-menu">
                              {canSupersede ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      supersedeRefs.current[doc.id]?.click()
                                    }
                                  >
                                    Replace
                                  </button>
                                  <input
                                    ref={(el) => {
                                      supersedeRefs.current[doc.id] = el;
                                    }}
                                    type="file"
                                    className="sr-only"
                                    accept={FINANCE_PAYABLE_DOCUMENT_ACCEPT}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) onSupersede(doc.id, file);
                                      e.target.value = "";
                                    }}
                                  />
                                </>
                              ) : null}
                              {canRemove ? (
                                <button
                                  type="button"
                                  className="is-danger"
                                  onClick={() => onRemove(doc.id)}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HistorySection({ events }: { events: FinancePayableEvent[] }) {
  return (
    <section className="pf-rev-card">
      <div className="pf-rev-card-head">
        <div className="pf-rev-card-title">
          <Clock3 size={15} aria-hidden />
          <h2>History ({events.length})</h2>
        </div>
      </div>
      {events.length === 0 ? (
        <p className="pf-state-message">No activity recorded</p>
      ) : (
        <div className="pf-payd-table-wrap">
          <table className="pf-payd-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Event</th>
                <th>By</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {[...events].reverse().map((event) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.createdAt)}</td>
                  <td>
                    <strong>
                      {EVENT_LABELS[event.eventType] ?? event.eventType}
                    </strong>
                  </td>
                  <td>{profileLabel(event.actorProfileId)}</td>
                  <td>{eventComment(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
