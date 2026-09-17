"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  Send,
} from "lucide-react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import {
  PlatformFinanceVendorBillsService,
  type FinanceVendorBillCapabilities,
  type FinanceVendorBillDetail,
  type FinanceVendorBillProfileSummary,
} from "@/services/platform-finance/PlatformFinanceVendorBillsService";
import type {
  FinanceVendorBill,
  FinanceVendorBillDocument,
  FinanceVendorBillEvent,
  FinanceVendorBillStatus,
} from "@/modules/platform-finance/domain/vendorBills";
import {
  FINANCE_VENDOR_BILL_DOCUMENT_ACCEPT,
  FINANCE_VENDOR_BILL_DOCUMENT_ROLE_LABELS,
  formatFileSize,
  formatUploadedAt,
  mimeTypeLabel,
  prevalidateFinanceVendorBillDocumentFile,
} from "@/modules/platform-finance/vendorBillDocumentUi";

type WorkspaceTab = "overview" | "documents" | "comments" | "history";
type CeoDecision = "approve" | "partial" | "reject";
type ConfirmAction = null | "query" | "send_to_ceo" | "approve" | "partial" | "reject" | "resubmit";

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

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  submitted: "Submitted",
  review_started: "Review started",
  queried: "Query raised",
  resubmitted: "Query resolved / resubmitted",
  sent_to_ceo: "Sent for CEO approval",
  approved: "Approved",
  partially_approved: "Partially approved",
  rejected: "Rejected",
  document_added: "Document added",
  document_removed: "Document removed",
  document_superseded: "Document superseded",
  field_changed: "Field changed",
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

function billReference(bill: FinanceVendorBill): string {
  const inv = bill.invoiceReference?.trim();
  if (inv) return inv;
  return `VB-${bill.id.slice(0, 8).toUpperCase()}`;
}

function payableReference(id: string): string {
  return `PAY-${id.slice(0, 8).toUpperCase()}`;
}

function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return parts[0]!.slice(0, 2).toUpperCase();
}

function actorName(
  actors: FinanceVendorBillProfileSummary[],
  profileId: string
): string {
  return (
    actors.find((a) => a.id === profileId)?.fullName?.trim() ||
    profileId.slice(0, 8).toUpperCase()
  );
}

function eventReason(event: FinanceVendorBillEvent): string | null {
  const meta = event.metadata ?? {};
  const reason =
    (typeof meta.reason === "string" && meta.reason) ||
    (typeof meta.notes === "string" && meta.notes) ||
    (typeof meta.decisionNotes === "string" && meta.decisionNotes) ||
    (typeof meta.financeNotes === "string" && meta.financeNotes) ||
    null;
  return reason?.trim() || null;
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

export function PlatformFinanceVendorBillDetailPage() {
  const params = useParams<{ id: string }>();
  const vendorBillId = typeof params?.id === "string" ? params.id : "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<FinanceVendorBillCapabilities | null>(null);
  const [detail, setDetail] = useState<FinanceVendorBillDetail | null>(null);
  const [companies, setCompanies] = useState<
    Array<{ id: string; code: string; name: string; status: string }>
  >([]);
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [notesDraft, setNotesDraft] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [ceoDecision, setCeoDecision] = useState<CeoDecision>("approve");
  const [partialAmount, setPartialAmount] = useState("");
  const [ceoNotes, setCeoNotes] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [destinationMode, setDestinationMode] = useState<"preserve" | "replace" | "remove">("preserve");
  const [replacementBankName, setReplacementBankName] = useState("");
  const [replacementAccountName, setReplacementAccountName] = useState("");
  const [replacementAccountNumber, setReplacementAccountNumber] = useState("");

  const load = useCallback(async () => {
    if (!vendorBillId) {
      setError("Vendor bill not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const [capability, billDetail, cos] = await Promise.all([
        PlatformFinanceVendorBillsService.getMyVendorBillCapabilities(),
        PlatformFinanceVendorBillsService.getVendorBillDetail(vendorBillId),
        PlatformFinanceVendorBillsService.listAccessibleCompanies(),
      ]);
      setCaps(capability);
      setDetail(billDetail);
      setCompanies(cos);
      setNotesDraft(billDetail.vendorBill.financeNotes ?? "");
      setCeoNotes(billDetail.vendorBill.ceoDecisionNotes ?? "");
      setDestinationMode("preserve");
      setReplacementBankName(billDetail.vendorBill.paymentDestination?.bankName ?? "");
      setReplacementAccountName(billDetail.vendorBill.paymentDestination?.accountName ?? "");
      setReplacementAccountNumber("");
      setPartialAmount(
        billDetail.vendorBill.billedAmount
          ? String(billDetail.vendorBill.billedAmount)
          : ""
      );
    } catch (err: unknown) {
      setDetail(null);
      setError(
        err instanceof Error ? err.message : "Unable to load vendor bill."
      );
    } finally {
      setLoading(false);
    }
  }, [vendorBillId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const bill = detail?.vendorBill ?? null;
  const documents = useMemo(
    () => (detail?.documents ?? []).filter((d) => !d.supersededAt),
    [detail]
  );
  const actors = detail?.actors ?? [];
  const company = companies.find((c) => c.id === bill?.companyId);

  const isInputter = Boolean(
    caps && bill && caps.profileId === bill.inputterProfileId
  );
  const canReview = Boolean(caps?.review) && !isInputter;
  const canApprove = Boolean(caps?.approve) && !isInputter;
  const canResolveQuery = Boolean(caps?.create && isInputter);

  const commentEvents = useMemo(() => {
    return (detail?.events ?? []).filter((e) =>
      ["queried", "resubmitted", "sent_to_ceo", "approved", "partially_approved", "rejected"].includes(
        e.eventType
      )
    );
  }, [detail]);

  async function runAction(action: Exclude<ConfirmAction, null>) {
    if (!bill) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (action === "query") {
        const reason = (queryDraft || commentDraft).trim();
        if (!reason) throw new Error("Query reason is required.");
        const actorRole =
          bill.status === "pending_ceo_approval" ? "ceo" : "finance";
        await PlatformFinanceVendorBillsService.queryVendorBill(
          bill.id,
          reason,
          actorRole
        );
        setQueryDraft("");
        setCommentDraft("");
        setTab("comments");
      } else if (action === "send_to_ceo") {
        if (bill.status === "submitted") {
          await PlatformFinanceVendorBillsService.startReview(bill.id);
        }
        await PlatformFinanceVendorBillsService.sendToCeo(
          bill.id,
          notesDraft.trim() || null
        );
      } else if (action === "approve") {
        await PlatformFinanceVendorBillsService.approveVendorBill(
          bill.id,
          ceoNotes.trim() || null
        );
      } else if (action === "partial") {
        const amount = Number(partialAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error("Approved amount must be greater than 0.");
        }
        if (amount >= bill.billedAmount) {
          throw new Error(
            `Partial approval must be less than the billed amount (${formatNaira(bill.billedAmount, bill.currency)}).`
          );
        }
        await PlatformFinanceVendorBillsService.partiallyApproveVendorBill(
          bill.id,
          amount,
          ceoNotes.trim() || null
        );
      } else if (action === "reject") {
        const reason = ceoNotes.trim() || commentDraft.trim();
        if (!reason) throw new Error("Rejection reason is required.");
        await PlatformFinanceVendorBillsService.rejectVendorBill(bill.id, reason);
      } else if (action === "resubmit") {
        const note = commentDraft.trim();
        if (
          destinationMode === "replace" &&
          (!replacementBankName.trim() || !replacementAccountName.trim() || !replacementAccountNumber.trim())
        ) {
          throw new Error("Complete all replacement payment destination fields.");
        }
        await PlatformFinanceVendorBillsService.resubmitVendorBill(bill.id, {
          description: note
            ? `${bill.description ?? bill.purpose}\n\nResolution: ${note}`
            : undefined,
          paymentDestinationMutation:
            destinationMode === "replace"
              ? {
                  action: "replace",
                  destination: {
                    paymentMethod: "bank_transfer",
                    bankName: replacementBankName.trim(),
                    accountName: replacementAccountName.trim(),
                    accountNumber: replacementAccountNumber.trim(),
                  },
                }
              : { action: destinationMode },
        });
        setCommentDraft("");
      }
      setConfirmAction(null);
      await load();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Action failed."
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function downloadDocument(doc: FinanceVendorBillDocument) {
    if (!bill) return;
    setDownloadingId(doc.id);
    try {
      const { signedUrl } =
        await PlatformFinanceVendorBillsService.getDocumentSignedUrl(
          bill.id,
          doc.id
        );
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Unable to open document."
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function uploadClarification(files: FileList | null) {
    if (!bill || !files?.length) return;
    setActionBusy(true);
    setActionError(null);
    try {
      for (const file of Array.from(files)) {
        const pre = prevalidateFinanceVendorBillDocumentFile(file);
        if (pre) throw new Error(pre);
        await PlatformFinanceVendorBillsService.uploadDocument({
          vendorBillId: bill.id,
          file,
          documentRole: "clarification",
        });
      }
      await load();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Upload failed."
      );
    } finally {
      setActionBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="pf-rev pf-vb-detail">
        <p className="pf-empty-copy">Loading vendor bill…</p>
      </div>
    );
  }

  if (error || !bill || !detail) {
    return (
      <div className="pf-rev pf-vb-detail">
        <Link href="/platform-finance/vendor-bills" className="pf-link-btn">
          <ArrowLeft size={16} aria-hidden />
          Back to Vendor Bills
        </Link>
        <div className="pf-req-empty">
          <p className="pf-empty-title">Vendor bill unavailable</p>
          <p className="pf-empty-copy">{error ?? "Not found."}</p>
        </div>
      </div>
    );
  }

  const isTerminal =
    bill.status === "approved" ||
    bill.status === "partially_approved" ||
    bill.status === "rejected";
  const showCeoPanel =
    canApprove && bill.status === "pending_ceo_approval";
  const showFinanceActions =
    canReview &&
    (bill.status === "submitted" ||
      bill.status === "under_review" ||
      bill.status === "resubmitted");
  const showQueryResolve =
    canResolveQuery && bill.status === "query";
  const unapproved =
    bill.status === "partially_approved"
      ? bill.billedAmount - bill.approvedAmount
      : 0;

  return (
    <div className="pf-rev pf-vb-detail">
      <nav className="pf-rev-breadcrumb">
        <Link href="/platform-finance/vendor-bills">Vendor Bills</Link>
        <span aria-hidden>/</span>
        <span>{billReference(bill)}</span>
      </nav>

      <header className="pf-rev-header">
        <div className="pf-rev-header-main">
          <div className="pf-rev-meta">
            <span className="pf-rev-ref-pill">{billReference(bill)}</span>
            <span className={`pf-req-status ${STATUS_TONE[bill.status]}`}>
              {STATUS_LABELS[bill.status]}
            </span>
          </div>
          <h1 className="pf-ov-title" style={{ marginTop: "0.55rem" }}>
            {bill.payeeName}
          </h1>
          <p className="pf-ov-desc">{bill.purpose}</p>
        </div>
        <div className="pf-rev-header-actions">
          <Link href="/platform-finance/vendor-bills" className="pf-btn-secondary">
            <ArrowLeft size={16} aria-hidden />
            Back
          </Link>
        </div>
      </header>

      {actionError ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {actionError}
        </div>
      ) : null}

      {(bill.status === "approved" || bill.status === "partially_approved") &&
      detail.payable ? (
        <div className="pf-vb-success-banner">
          <CheckCircle2 size={20} aria-hidden />
          <div>
            <strong>Approved — Payable Created</strong>
            <p>
              This vendor bill has been approved and a payable has been created.
            </p>
          </div>
        </div>
      ) : null}

      <div className="pf-rev-tabs" role="tablist">
        {(
          [
            ["overview", "Overview"],
            ["documents", `Documents (${documents.length})`],
            ["comments", `Comments (${commentEvents.length})`],
            ["history", "History"],
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

      <div className={`pf-rev-layout${showCeoPanel ? " has-ceo" : ""}`}>
        <div className="pf-rev-main">
          {tab === "overview" ? (
            <>
              <section className="pf-rev-card">
                <div className="pf-rev-card-head">
                  <h2 className="pf-rev-card-title">Invoice Details</h2>
                </div>
                <dl className="pf-payd-dl pf-vb-detail-grid">
                  <div>
                    <dt>Vendor / Payee</dt>
                    <dd>{bill.payeeName}</dd>
                  </div>
                  <div>
                    <dt>Invoice Reference</dt>
                    <dd>{bill.invoiceReference?.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt>Invoice Date</dt>
                    <dd>{formatDate(bill.invoiceDate)}</dd>
                  </div>
                  <div>
                    <dt>Original Bill Amount</dt>
                    <dd className="pf-payd-amount">
                      {formatNaira(bill.billedAmount, bill.currency)}
                    </dd>
                  </div>
                  {(bill.status === "approved" ||
                    bill.status === "partially_approved") && (
                    <div>
                      <dt>Approved Amount</dt>
                      <dd className="pf-payd-amount">
                        {formatNaira(bill.approvedAmount, bill.currency)}
                      </dd>
                    </div>
                  )}
                  {bill.status === "partially_approved" ? (
                    <div>
                      <dt>Unapproved</dt>
                      <dd>{formatNaira(unapproved, bill.currency)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Description / Purpose</dt>
                    <dd>{bill.purpose}</dd>
                  </div>
                  <div>
                    <dt>Goods / Services Received</dt>
                    <dd>{bill.goodsServicesReceived ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt>Project / Contract</dt>
                    <dd>{bill.projectContractRef?.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt>Due Date</dt>
                    <dd>{formatDate(bill.dueDate)}</dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>
                      {company
                        ? `${company.code} — ${company.name}`
                        : bill.companyId.slice(0, 8).toUpperCase()}
                    </dd>
                  </div>
                  <div>
                    <dt>Submitted by</dt>
                    <dd>
                      {detail.inputter?.fullName?.trim() ||
                        bill.inputterProfileId.slice(0, 8).toUpperCase()}
                    </dd>
                  </div>
                </dl>
              </section>

              {showFinanceActions ? (
                <section className="pf-rev-card">
                  <div className="pf-rev-card-head">
                    <h2 className="pf-rev-card-title">Finance Review</h2>
                  </div>
                  <FormField label="Review Notes" htmlFor="vb-finance-notes">
                    <textarea
                      id="vb-finance-notes"
                      className={`${inputClassName} pf-new-textarea`}
                      rows={4}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      disabled={actionBusy}
                      placeholder="Notes for CEO (optional)"
                    />
                  </FormField>
                  <div className="pf-req-action-row">
                    <button
                      type="button"
                      className="pf-btn-secondary"
                      disabled={actionBusy}
                      onClick={() => {
                        setQueryDraft("");
                        setConfirmAction("query");
                      }}
                    >
                      Query
                    </button>
                    <button
                      type="button"
                      className="pf-btn-primary"
                      disabled={actionBusy}
                      onClick={() => setConfirmAction("send_to_ceo")}
                    >
                      Send to CEO
                    </button>
                  </div>
                </section>
              ) : null}

              {(bill.status === "approved" ||
                bill.status === "partially_approved") &&
              detail.payable ? (
                <section className="pf-rev-card pf-vb-payable-card">
                  <div className="pf-rev-card-head">
                    <h2 className="pf-rev-card-title">Related Payable</h2>
                    <span
                      className={`pf-req-status ${
                        detail.payable.status === "approved"
                          ? "is-success"
                          : "is-muted"
                      }`}
                    >
                      {detail.payable.status}
                    </span>
                  </div>
                  <dl className="pf-payd-dl">
                    <div>
                      <dt>Payable Reference</dt>
                      <dd>{payableReference(detail.payable.id)}</dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>
                        {formatNaira(
                          detail.payable.payableAmount,
                          detail.payable.currency
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Approved By</dt>
                      <dd>
                        {actorName(
                          actors,
                          detail.events.find(
                            (e) =>
                              e.eventType === "approved" ||
                              e.eventType === "partially_approved"
                          )?.actorProfileId ?? ""
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Approved On</dt>
                      <dd>{formatDateTime(bill.decidedAt)}</dd>
                    </div>
                  </dl>
                  <Link
                    href={`/platform-finance/payables/${detail.payable.id}`}
                    className="pf-btn-primary"
                  >
                    View Payable
                  </Link>
                </section>
              ) : null}

              {bill.status === "rejected" ? (
                <section className="pf-rev-card">
                  <h2 className="pf-rev-card-title">Rejection</h2>
                  <p className="pf-ov-desc">
                    {bill.ceoDecisionNotes?.trim() || "This bill was rejected."}
                  </p>
                </section>
              ) : null}
            </>
          ) : null}

          {tab === "documents" ? (
            <section className="pf-rev-card">
              <div className="pf-rev-card-head">
                <h2 className="pf-rev-card-title">
                  Documents ({documents.length})
                </h2>
                {showQueryResolve ? (
                  <button
                    type="button"
                    className="pf-btn-secondary"
                    disabled={actionBusy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={16} aria-hidden />
                    Add clarification
                  </button>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="pf-new-file-input"
                accept={FINANCE_VENDOR_BILL_DOCUMENT_ACCEPT}
                onChange={(e) => void uploadClarification(e.target.files)}
              />
              {documents.length === 0 ? (
                <p className="pf-empty-copy">No documents attached.</p>
              ) : (
                <ul className="pf-new-docs-list">
                  {documents.map((doc) => (
                    <li key={doc.id} className="pf-new-doc-row">
                      <FileTypeIcon
                        mimeType={doc.mimeType}
                        filename={doc.filename}
                      />
                      <div>
                        <strong>{doc.filename}</strong>
                        <span className="pf-req-meta">
                          {formatFileSize(doc.byteSize)} ·{" "}
                          {
                            FINANCE_VENDOR_BILL_DOCUMENT_ROLE_LABELS[
                              doc.documentRole
                            ]
                          }{" "}
                          · {formatUploadedAt(doc.uploadedAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="pf-icon-btn"
                        disabled={downloadingId === doc.id}
                        aria-label={`Download ${doc.filename}`}
                        onClick={() => void downloadDocument(doc)}
                      >
                        <Download size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {tab === "comments" ? (
            <section className="pf-rev-card">
              <div className="pf-rev-card-head">
                <h2 className="pf-rev-card-title">Query & Resolution</h2>
              </div>
              {commentEvents.length === 0 ? (
                <p className="pf-empty-copy">
                  No query activity yet. Finance queries and inputter resolutions
                  appear here.
                </p>
              ) : (
                <ol className="pf-vb-thread">
                  {commentEvents.map((event) => {
                    const reason = eventReason(event);
                    return (
                      <li key={event.id} className="pf-vb-thread-item">
                        <span className="pf-req-avatar" aria-hidden>
                          {initials(actorName(actors, event.actorProfileId))}
                        </span>
                        <div>
                          <div className="pf-vb-thread-head">
                            <strong>
                              {actorName(actors, event.actorProfileId)}
                            </strong>
                            <span>{formatDateTime(event.createdAt)}</span>
                            <em>{EVENT_LABELS[event.eventType] ?? event.eventType}</em>
                          </div>
                          {reason ? <p>{reason}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {(showFinanceActions ||
                (canApprove && bill.status === "pending_ceo_approval") ||
                showQueryResolve) &&
              !isTerminal ? (
                <div className="pf-vb-comment-compose">
                  {showQueryResolve ? (
                    <div className="pf-vb-create-fields">
                      <label>
                        Payment destination
                        <select className={inputClassName} value={destinationMode} onChange={(e) => setDestinationMode(e.target.value as typeof destinationMode)} disabled={actionBusy}>
                          <option value="preserve">Preserve existing details</option>
                          <option value="replace">Replace bank details</option>
                          <option value="remove">Remove payment destination</option>
                        </select>
                      </label>
                      {destinationMode === "replace" ? (
                        <>
                          <label>Bank name<input className={inputClassName} value={replacementBankName} onChange={(e) => setReplacementBankName(e.target.value)} /></label>
                          <label>Account name<input className={inputClassName} value={replacementAccountName} onChange={(e) => setReplacementAccountName(e.target.value)} /></label>
                          <label>New account number<input className={inputClassName} inputMode="numeric" autoComplete="off" value={replacementAccountNumber} onChange={(e) => setReplacementAccountNumber(e.target.value.replace(/\D/g, ""))} /></label>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <textarea
                    className={`${inputClassName} pf-new-textarea`}
                    rows={3}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    disabled={actionBusy}
                    placeholder={
                      showQueryResolve
                        ? "Describe how you resolved the query…"
                        : "Add a query reason…"
                    }
                  />
                  <button
                    type="button"
                    className="pf-btn-primary"
                    disabled={actionBusy || !commentDraft.trim()}
                    onClick={() =>
                      setConfirmAction(showQueryResolve ? "resubmit" : "query")
                    }
                  >
                    <Send size={16} aria-hidden />
                    {showQueryResolve ? "Resolve & Resubmit" : "Post query"}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === "history" ? (
            <section className="pf-rev-card">
              <div className="pf-rev-card-head">
                <h2 className="pf-rev-card-title">Status / History</h2>
              </div>
              <ol className="pf-rev-timeline">
                {[...detail.events].reverse().map((event) => (
                  <li key={event.id}>
                    <span className="pf-rev-timeline-dot" aria-hidden />
                    <div>
                      <strong>
                        {EVENT_LABELS[event.eventType] ?? event.eventType}
                      </strong>
                      <p className="pf-req-meta">
                        {formatDateTime(event.createdAt)} ·{" "}
                        {actorName(actors, event.actorProfileId)}
                        {event.fromStatus && event.toStatus
                          ? ` · ${STATUS_LABELS[event.fromStatus] ?? event.fromStatus} → ${STATUS_LABELS[event.toStatus] ?? event.toStatus}`
                          : null}
                      </p>
                      {eventReason(event) ? <p>{eventReason(event)}</p> : null}
                      {event.eventType === "approved" ||
                      event.eventType === "partially_approved"
                        ? detail.payable && (
                            <p className="pf-req-meta">
                              Payable created: {payableReference(detail.payable.id)}
                            </p>
                          )
                        : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <aside className="pf-rev-aside">
          <section className="pf-rev-card">
            <h2 className="pf-rev-card-title">Documents</h2>
            {documents.length === 0 ? (
              <p className="pf-empty-copy">None yet</p>
            ) : (
              <ul className="pf-req-doc-list">
                {documents.slice(0, 4).map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      className="pf-link-btn"
                      onClick={() => void downloadDocument(doc)}
                    >
                      {doc.filename}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pf-rev-card">
            <h2 className="pf-rev-card-title">Vendor Information</h2>
            <dl className="pf-payd-dl">
              <div>
                <dt>Payee</dt>
                <dd>{bill.payeeName}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{bill.payeeType}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{company?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Payment destination</dt>
                <dd>
                  {bill.paymentDestination
                    ? `${bill.paymentDestination.bankName} · ${bill.paymentDestination.accountName} · •••• ${bill.paymentDestination.accountNumberLast4}`
                    : "Not supplied"}
                </dd>
              </div>
            </dl>
          </section>

          {showCeoPanel ? (
            <section className="pf-rev-card pf-vb-ceo-panel">
              <h2 className="pf-rev-card-title">CEO Approval</h2>
              <p className="pf-req-meta">
                Decision uses your authenticated Finance approval authority.
              </p>
              <fieldset className="pf-vb-decision">
                <legend className="sr-only">Decision</legend>
                {(
                  [
                    ["approve", "Approve Full Amount"],
                    ["partial", "Partially Approve"],
                    ["reject", "Reject"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="ceo-decision"
                      checked={ceoDecision === value}
                      onChange={() => setCeoDecision(value)}
                      disabled={actionBusy}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

              <div className="pf-vb-amount-compare">
                <div>
                  <em>Original Bill</em>
                  <strong>
                    {formatNaira(bill.billedAmount, bill.currency)}
                  </strong>
                </div>
                {ceoDecision === "partial" ? (
                  <div>
                    <em>Approved</em>
                    <FormField label="Approved Amount" htmlFor="vb-partial">
                      <input
                        id="vb-partial"
                        className={inputClassName}
                        inputMode="decimal"
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                        disabled={actionBusy}
                      />
                    </FormField>
                    <p className="pf-req-meta">
                      Must be &lt; {formatNaira(bill.billedAmount, bill.currency)}
                    </p>
                  </div>
                ) : null}
              </div>

              <FormField label="Approval Notes" htmlFor="vb-ceo-notes">
                <textarea
                  id="vb-ceo-notes"
                  className={`${inputClassName} pf-new-textarea`}
                  rows={3}
                  value={ceoNotes}
                  onChange={(e) => setCeoNotes(e.target.value)}
                  disabled={actionBusy}
                  placeholder={
                    ceoDecision === "reject"
                      ? "Rejection reason (required)"
                      : "Optional notes"
                  }
                />
              </FormField>

              <button
                type="button"
                className="pf-btn-primary"
                disabled={actionBusy}
                onClick={() =>
                  setConfirmAction(
                    ceoDecision === "approve"
                      ? "approve"
                      : ceoDecision === "partial"
                        ? "partial"
                        : "reject"
                  )
                }
              >
                {ceoDecision === "reject"
                  ? "Reject Vendor Bill"
                  : "Approve and Create Payable"}
              </button>
            </section>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmAction != null}
        title={
          confirmAction === "query"
            ? "Query this vendor bill?"
            : confirmAction === "send_to_ceo"
              ? "Send to CEO?"
              : confirmAction === "approve"
                ? "Approve full amount and create payable?"
                : confirmAction === "partial"
                  ? "Partially approve and create payable?"
                  : confirmAction === "reject"
                    ? "Reject this vendor bill?"
                    : confirmAction === "resubmit"
                      ? "Resubmit resolved vendor bill?"
                      : "Confirm"
        }
        description={
          confirmAction === "approve" || confirmAction === "partial"
            ? "The payable will be created atomically by the approval transaction. There is no separate Create Payable step."
            : confirmAction === "query"
              ? `The inputter will be responsible for resolving the query.${
                  (queryDraft || commentDraft).trim()
                    ? ` Reason: ${(queryDraft || commentDraft).trim()}`
                    : " Provide a reason in the comments field first."
                }`
              : confirmAction === "reject"
                ? "Rejection is terminal and creates no payable."
                : confirmAction === "resubmit"
                  ? "The bill will return to Finance review."
                  : undefined
        }
        confirmLabel="Confirm"
        danger={confirmAction === "reject"}
        loading={actionBusy}
        onClose={() => {
          if (!actionBusy) setConfirmAction(null);
        }}
        onConfirm={() => {
          if (confirmAction) void runAction(confirmAction);
        }}
      />
    </div>
  );
}
