"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Info,
  MoreVertical,
  Paperclip,
  Save,
  Upload,
} from "lucide-react";
import {
  FormField,
  inputClassName,
} from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import {
  PlatformFinanceRequestsService,
  type FinancialRequestCapabilities,
} from "@/services/platform-finance/PlatformFinanceRequestsService";
import {
  FINANCIAL_REQUEST_DOCUMENT_ROLES,
  FINANCIAL_REQUEST_PAYEE_TYPES,
  type FinancialRequest,
  type FinancialRequestCategory,
  type FinancialRequestDocument,
  type FinancialRequestDocumentRole,
  type FinancialRequestPayeeType,
} from "@/modules/platform-finance/domain/requests";
import {
  FINANCE_REQUEST_DOCUMENT_ACCEPT,
  FINANCE_REQUEST_DOCUMENT_ROLE_LABELS,
  formatFileSize,
  formatUploadedAt,
  mimeTypeLabel,
  prevalidateFinanceRequestDocumentFile,
} from "@/modules/platform-finance/requestDocumentUi";

type WizardStep = 1 | 2 | 3 | 4;

const PURPOSE_MAX = 500;
const TITLE_MAX = 200;

const STEPS = [
  { n: 1, label: "Need", hint: "What do you need?" },
  { n: 2, label: "Details", hint: "Provide more information" },
  { n: 3, label: "Documentation", hint: "Upload supporting docs" },
  { n: 4, label: "Review & Submit", hint: "Confirm and submit" },
] as const;

const PAYEE_TYPE_LABELS: Record<FinancialRequestPayeeType, string> = {
  vendor: "Vendor",
  staff: "Staff",
  other: "Other",
};

function dash(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

function formatNaira(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const hasFraction = !Number.isInteger(amount);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Presentation-only grouping for the amount field; payloads stay numeric. */
function formatAmountFieldDisplay(raw: string): string {
  let cleaned = "";
  let seenDot = false;
  for (const char of raw) {
    if (char >= "0" && char <= "9") {
      cleaned += char;
      continue;
    }
    if (char === "." && !seenDot) {
      cleaned += ".";
      seenDot = true;
    }
  }
  if (!cleaned) return "";

  const endsWithDot = cleaned.endsWith(".");
  const [intRaw = "0", ...fracParts] = cleaned.split(".");
  const intPart = intRaw.replace(/^0+(?=\d)/, "") || "0";
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (fracParts.length > 0) return `${grouped}.${fracParts.join("")}`;
  if (endsWithDot) return `${grouped}.`;
  return grouped;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

export function PlatformFinanceNewRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeDraftId = searchParams.get("draftId")?.trim() || null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedDraftRef = useRef<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [caps, setCaps] = useState<FinancialRequestCapabilities | null>(null);
  const [categories, setCategories] = useState<FinancialRequestCategory[]>([]);
  const [companies, setCompanies] = useState<
    Array<{ id: string; code: string; name: string; status: string }>
  >([]);

  const [step, setStep] = useState<WizardStep>(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] =
    useState<FinancialRequest | null>(null);

  // Step 1 — Need (title → purpose; purpose copy → description)
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [purposeText, setPurposeText] = useState("");

  // Step 2 — Details
  const [companyId, setCompanyId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [payeeType, setPayeeType] =
    useState<FinancialRequestPayeeType>("other");

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Step 3 — Documentation
  const [documents, setDocuments] = useState<FinancialRequestDocument[]>([]);
  const [uploadRole, setUploadRole] =
    useState<FinancialRequestDocumentRole>("supporting");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [docMenuId, setDocMenuId] = useState<string | null>(null);
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    setBootLoading(true);
    setBootError(null);
    try {
      const [capability, cats, cos] = await Promise.all([
        PlatformFinanceRequestsService.getMyRequestCapabilities(),
        PlatformFinanceRequestsService.listCategories(),
        PlatformFinanceRequestsService.listAccessibleCompanies(),
      ]);
      setCaps(capability);
      setCategories(cats.filter((c) => c.status === "active"));
      setCompanies(cos.filter((c) => c.status === "active"));
      if (cos.filter((c) => c.status === "active").length === 1) {
        setCompanyId(cos.find((c) => c.status === "active")!.id);
      }
    } catch (err: unknown) {
      setBootError(
        err instanceof Error
          ? err.message
          : "Unable to load New Financial Request."
      );
    } finally {
      setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (bootLoading || !caps?.create || !resumeDraftId) return;
    if (hydratedDraftRef.current === resumeDraftId) return;

    let cancelled = false;
    async function hydrateDraft() {
      try {
        const detail =
          await PlatformFinanceRequestsService.getRequestDetail(resumeDraftId!);
        if (cancelled) return;
        if (detail.request.status !== "draft") {
          setBootError("Only draft financial requests can be continued.");
          return;
        }
        const request = detail.request;
        // Hydrate existing draft only — do not persist/overwrite on load.
        setDraftId(request.id);
        setCategoryId(request.categoryId);
        setTitle(request.purpose);
        setPurposeText(request.description ?? "");
        setCompanyId(request.companyId);
        setAmountText(
          formatAmountFieldDisplay(String(request.requestedAmount))
        );
        setRequiredBy(
          request.requiredByDate ? request.requiredByDate.slice(0, 10) : ""
        );
        setPayeeName(request.payeeName);
        setPayeeType(request.payeeType);
        setDocuments(detail.documents);
        const supporting = detail.documents.some(
          (d) => d.documentRole === "supporting" && d.supersededAt == null
        );
        setStep(supporting ? 4 : 3);
        hydratedDraftRef.current = resumeDraftId!;
      } catch (err: unknown) {
        if (!cancelled) {
          setBootError(
            err instanceof Error
              ? err.message
              : "Unable to load the saved draft."
          );
        }
      }
    }

    void hydrateDraft();
    return () => {
      cancelled = true;
    };
  }, [bootLoading, caps, resumeDraftId]);

  const categoryName = useMemo(
    () => categories.find((c) => c.id === categoryId)?.name ?? null,
    [categories, categoryId]
  );
  const companyName = useMemo(
    () => companies.find((c) => c.id === companyId)?.name ?? null,
    [companies, companyId]
  );
  const companyAccessMode = useMemo(() => {
    if (companies.length === 0) return "none" as const;
    if (companies.length === 1) return "single" as const;
    return "multi" as const;
  }, [companies.length]);

  const activeDocuments = useMemo(
    () => documents.filter((d) => d.supersededAt == null),
    [documents]
  );
  const hasActiveSupporting = useMemo(
    () =>
      activeDocuments.some(
        (d) => d.documentRole === "supporting" && d.supersededAt == null
      ),
    [activeDocuments]
  );

  const refreshDocuments = useCallback(async (requestId: string) => {
    const detail =
      await PlatformFinanceRequestsService.getRequestDetail(requestId);
    setDocuments(detail.documents);
  }, []);

  useEffect(() => {
    if ((step === 3 || step === 4) && draftId) {
      void refreshDocuments(draftId).catch((err: unknown) => {
        setFormError(
          err instanceof Error
            ? err.message
            : "Unable to load request documents."
        );
      });
    }
  }, [step, draftId, refreshDocuments]);

  const amountValue = useMemo(() => {
    const n = Number(amountText.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }, [amountText]);

  const step1Errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!categoryId) e.categoryId = "Category is required.";
    if (!title.trim()) e.title = "Request title is required.";
    else if (title.trim().length > TITLE_MAX)
      e.title = `Title must be at most ${TITLE_MAX} characters.`;
    if (!purposeText.trim()) e.purposeText = "Purpose is required.";
    else if (purposeText.trim().length > PURPOSE_MAX)
      e.purposeText = `Purpose must be at most ${PURPOSE_MAX} characters.`;
    return e;
  }, [categoryId, title, purposeText]);

  const step2Errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!companyId) e.companyId = "Company is required.";
    if (amountValue == null) e.amount = "Requested amount is required.";
    else if (amountValue < 0) e.amount = "Amount cannot be negative.";
    if (!requiredBy) e.requiredBy = "Required by date is required.";
    if (!payeeName.trim()) e.payeeName = "Payee is required.";
    if (
      !(FINANCIAL_REQUEST_PAYEE_TYPES as readonly string[]).includes(payeeType)
    ) {
      e.payeeType = "Payee type is required.";
    }
    return e;
  }, [companyId, amountValue, requiredBy, payeeName, payeeType]);

  function markTouched(keys: string[]) {
    setTouched((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = true;
      return next;
    });
  }

  /** Fields required by createRequest / updateDraftRequest — not wizard-only UX. */
  const draftApiErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!categoryId) e.categoryId = "Category is required.";
    if (!title.trim()) e.title = "Request title is required.";
    else if (title.trim().length > TITLE_MAX)
      e.title = `Title must be at most ${TITLE_MAX} characters.`;
    if (!companyId) e.companyId = "Company is required.";
    if (amountValue == null) e.amount = "Requested amount is required.";
    else if (amountValue < 0) e.amount = "Amount cannot be negative.";
    if (!payeeName.trim()) e.payeeName = "Payee is required.";
    if (
      !(FINANCIAL_REQUEST_PAYEE_TYPES as readonly string[]).includes(payeeType)
    ) {
      e.payeeType = "Payee type is required.";
    }
    return e;
  }, [categoryId, title, companyId, amountValue, payeeName, payeeType]);

  async function persistDraft(): Promise<FinancialRequest> {
    const payload = {
      companyId,
      categoryId,
      requestedAmount: amountValue as number,
      purpose: title.trim(),
      description: purposeText.trim(),
      payeeName: payeeName.trim(),
      payeeType,
      requiredByDate: requiredBy || null,
      currency: "NGN",
    };
    if (draftId) {
      return PlatformFinanceRequestsService.updateDraftRequest(draftId, {
        categoryId: payload.categoryId,
        requestedAmount: payload.requestedAmount,
        purpose: payload.purpose,
        description: payload.description,
        payeeName: payload.payeeName,
        payeeType: payload.payeeType,
        requiredByDate: payload.requiredByDate,
      });
    }
    const created = await PlatformFinanceRequestsService.createRequest(payload);
    setDraftId(created.id);
    return created;
  }

  async function handleSaveDraft() {
    setFormError(null);
    setSaveMessage(null);
    const missingKeys = Object.keys(draftApiErrors);
    markTouched([
      "categoryId",
      "title",
      "companyId",
      "amount",
      "payeeName",
      "payeeType",
    ]);
    if (missingKeys.length > 0) {
      const needStep1 =
        Boolean(draftApiErrors.categoryId) || Boolean(draftApiErrors.title);
      const needStep2 =
        Boolean(draftApiErrors.companyId) ||
        Boolean(draftApiErrors.amount) ||
        Boolean(draftApiErrors.payeeName) ||
        Boolean(draftApiErrors.payeeType);
      if (needStep1) setStep(1);
      else if (needStep2) setStep(2);
      setFormError(
        needStep2 && !needStep1
          ? "To save a draft, complete Details: company, requested amount, and payee are required."
          : needStep1 && needStep2
            ? "To save a draft, complete Need (category, title) and Details (company, amount, payee)."
            : "To save a draft, complete category and request title on the Need step."
      );
      return;
    }
    setSaving(true);
    try {
      await persistDraft();
      setSaveMessage("Draft saved.");
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Unable to save draft."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleContinueFromNeed() {
    setFormError(null);
    setSaveMessage(null);
    markTouched(["categoryId", "title", "purposeText"]);
    if (Object.keys(step1Errors).length > 0) return;
    setStep(2);
  }

  async function handleContinueFromDetails() {
    setFormError(null);
    setSaveMessage(null);
    markTouched([
      "companyId",
      "amount",
      "requiredBy",
      "payeeName",
      "payeeType",
    ]);
    if (Object.keys(step2Errors).length > 0) return;
    if (Object.keys(step1Errors).length > 0) {
      setStep(1);
      setFormError("Complete the Need step before continuing.");
      return;
    }
    setSaving(true);
    try {
      const saved = await persistDraft();
      setSaveMessage(null);
      await refreshDocuments(saved.id);
      setStep(3);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Unable to save draft."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    setFormError(null);
    setSaveMessage(null);
    setUploadStatus(null);

    const files = Array.from(fileList);
    if (files.length === 0) return;

    let requestId = draftId;
    if (!requestId) {
      if (Object.keys(draftApiErrors).length > 0) {
        setFormError(
          "Save Need and Details before uploading documents. Company, amount, and payee are required."
        );
        setStep(Object.keys(step1Errors).length > 0 ? 1 : 2);
        return;
      }
      setUploading(true);
      try {
        const created = await persistDraft();
        requestId = created.id;
      } catch (err: unknown) {
        setFormError(
          err instanceof Error ? err.message : "Unable to create draft for upload."
        );
        setUploading(false);
        return;
      }
    }

    setUploading(true);
    let successCount = 0;
    try {
      for (const file of files) {
        const pre = prevalidateFinanceRequestDocumentFile(file);
        if (pre) {
          setFormError(pre);
          continue;
        }
        setUploadStatus(`Uploading ${file.name}…`);
        const doc = await PlatformFinanceRequestsService.uploadRequestDocument({
          requestId: requestId!,
          documentRole: uploadRole,
          file,
        });
        successCount += 1;
        setDocuments((prev) => {
          if (prev.some((d) => d.id === doc.id)) return prev;
          return [...prev, doc];
        });
      }
      if (requestId) await refreshDocuments(requestId);
      if (successCount > 0) {
        setUploadStatus(
          successCount === 1
            ? "Document uploaded."
            : `${successCount} documents uploaded.`
        );
      }
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Unable to upload document."
      );
      setUploadStatus(null);
      if (requestId) {
        try {
          await refreshDocuments(requestId);
        } catch {
          /* keep previous list */
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveDocument(documentId: string) {
    if (!draftId) return;
    setDocMenuId(null);
    setFormError(null);
    setRemovingDocId(documentId);
    try {
      await PlatformFinanceRequestsService.removeDraftRequestDocument(
        draftId,
        documentId
      );
      await refreshDocuments(draftId);
      setUploadStatus("Document removed.");
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Unable to remove document."
      );
    } finally {
      setRemovingDocId(null);
    }
  }

  function handleContinueFromDocumentation() {
    setFormError(null);
    setSaveMessage(null);
    if (!draftId) {
      setFormError("Save the draft before continuing.");
      return;
    }
    if (!hasActiveSupporting) {
      setFormError(
        "Add at least one Supporting document before continuing. Submission requires supporting documentation."
      );
      return;
    }
    setStep(4);
  }

  function goToStep(next: WizardStep) {
    setDocMenuId(null);
    setFormError(null);
    setSaveMessage(null);
    setStep(next);
  }

  async function handleSubmitRequest() {
    setFormError(null);
    setSaveMessage(null);
    if (!draftId) {
      setFormError("Save the draft before submitting.");
      return;
    }
    if (!hasActiveSupporting) {
      setFormError(
        "Add at least one Supporting document before submitting."
      );
      return;
    }
    if (Object.keys(step1Errors).length > 0) {
      goToStep(1);
      setFormError("Complete the Need step before submitting.");
      return;
    }
    if (Object.keys(step2Errors).length > 0) {
      goToStep(2);
      setFormError("Complete the Details step before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      // Persist any edits made via Review → Edit before the authoritative submit.
      await persistDraft();
      const submitted =
        await PlatformFinanceRequestsService.submitRequest(draftId);
      setSubmittedRequest(submitted);
      setDraftId(submitted.id);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Unable to submit request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (bootLoading) {
    return (
      <div className="pf-new-request">
        <p className="pf-state-message">Loading New Financial Request…</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="pf-new-request">
        <p className="pf-state-message is-error">{bootError}</p>
      </div>
    );
  }

  if (!caps?.create) {
    return (
      <div className="pf-new-request">
        <p className="pf-state-message is-error">
          You do not have permission to create financial requests
          (`platform_finance.request.create`).
        </p>
        <p className="pf-new-denied-actions">
          <Link href="/platform-finance/requests" className="pf-link">
            Back to Financial Requests
          </Link>
        </p>
      </div>
    );
  }

  if (companyAccessMode === "none") {
    return (
      <div className="pf-new-request">
        <p className="pf-state-message is-error">
          You do not have access to any Finance company, so a financial request
          cannot be created. Ask an administrator to grant company access.
        </p>
        <p className="pf-new-denied-actions">
          <Link href="/platform-finance/requests" className="pf-link">
            Back to Financial Requests
          </Link>
        </p>
      </div>
    );
  }

  if (submittedRequest) {
    return (
      <div className="pf-new-request">
        <header className="pf-new-header">
          <div>
            <h1 className="pf-ov-title">New Financial Request</h1>
            <p className="pf-ov-desc">
              Submit a financial request for approval. Provide the necessary
              details and supporting documents.
            </p>
          </div>
        </header>
        <div className="pf-new-submit-success" role="status">
          <CheckCircle2 size={28} aria-hidden />
          <h2>Request submitted</h2>
          <p>
            Your financial request
            {submittedRequest.purpose.trim()
              ? ` “${submittedRequest.purpose.trim()}”`
              : ""}{" "}
            has been submitted for Finance review.
          </p>
          <Link
            href="/platform-finance/requests"
            className="pf-btn-primary pf-new-save-success-action"
          >
            Back to Financial Requests
          </Link>
        </div>
      </div>
    );
  }

  const busy = saving || uploading || submitting;

  return (
    <div className="pf-new-request">
      <header className="pf-new-header">
        <div>
          <h1 className="pf-ov-title">New Financial Request</h1>
          <p className="pf-ov-desc">
            Submit a financial request for approval. Provide the necessary
            details and supporting documents.
          </p>
        </div>
        <button
          type="button"
          className="pf-btn-secondary"
          disabled={busy}
          onClick={() => void handleSaveDraft()}
        >
          <Save size={15} aria-hidden />
          Save as Draft
        </button>
      </header>

      <ol className="pf-new-stepper" aria-label="Request steps">
        {STEPS.map((s, idx) => {
          const active = step === s.n;
          const completed = step > s.n;
          const upcoming = s.n > step;
          return (
            <li
              key={s.n}
              className={`pf-new-step${active ? " is-active" : ""}${
                completed ? " is-complete" : ""
              }${upcoming ? " is-upcoming" : ""}`}
            >
              <span className="pf-new-step-index" aria-hidden>
                {completed ? <Check size={14} strokeWidth={2.5} /> : s.n}
              </span>
              <span className="pf-new-step-copy">
                <strong>{s.label}</strong>
                <em>{s.hint}</em>
              </span>
              {idx < STEPS.length - 1 ? (
                <span className="pf-new-step-line" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>

      {formError ? (
        <p className="pf-state-message is-error" role="status">
          {formError}
        </p>
      ) : null}

      {saveMessage ? (
        <div className="pf-new-save-success" role="status">
          <p className="pf-state-message">{saveMessage}</p>
          <Link
            href="/platform-finance/requests"
            className="pf-btn-secondary pf-new-save-success-action"
          >
            Back to Financial Requests
          </Link>
        </div>
      ) : null}

      <div className="pf-new-layout">
        <section className="pf-new-main">
          {step === 1 ? (
            <div className="pf-new-panel">
              <h2 className="pf-new-panel-title">What is the need?</h2>
              <p className="pf-new-panel-desc">
                Start by telling us what you need and why.
              </p>

              <div className="pf-new-fields">
                <FormField
                  label="Category"
                  htmlFor="pf-new-category"
                  required
                  error={touched.categoryId ? step1Errors.categoryId : undefined}
                  hint="Choose the category that best fits your request."
                >
                  <SearchableSelect
                    id="pf-new-category"
                    aria-label="Category"
                    value={categoryId}
                    onChange={(v) => {
                      setCategoryId(v);
                      markTouched(["categoryId"]);
                    }}
                    emptyOptionLabel="Select a category"
                    placeholder="Select a category"
                    allowEmpty
                    options={categories.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                    searchPlaceholder="Search categories…"
                  />
                </FormField>

                <FormField
                  label="Request title"
                  htmlFor="pf-new-title"
                  required
                  error={touched.title ? step1Errors.title : undefined}
                  hint="A clear, concise title for this request."
                >
                  <input
                    id="pf-new-title"
                    className={inputClassName}
                    value={title}
                    maxLength={TITLE_MAX}
                    placeholder="e.g. Office supplies for the team"
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => markTouched(["title"])}
                  />
                </FormField>

                <FormField
                  label="Purpose"
                  htmlFor="pf-new-purpose"
                  required
                  error={
                    touched.purposeText ? step1Errors.purposeText : undefined
                  }
                  hint="Provide a short explanation of the purpose of this request."
                >
                  <div className="pf-new-textarea-wrap">
                    <textarea
                      id="pf-new-purpose"
                      className="pf-new-textarea"
                      rows={5}
                      value={purposeText}
                      maxLength={PURPOSE_MAX}
                      placeholder="Briefly explain what you need this for."
                      onChange={(e) => setPurposeText(e.target.value)}
                      onBlur={() => markTouched(["purposeText"])}
                    />
                    <span className="pf-new-counter">
                      {purposeText.length}/{PURPOSE_MAX}
                    </span>
                  </div>
                </FormField>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="pf-new-panel">
              <h2 className="pf-new-panel-title">Request details</h2>
              <p className="pf-new-panel-desc">
                {companyAccessMode === "single"
                  ? "Provide the amount, timing, and payee for this need."
                  : "Provide the amount, timing, payee, and which company this request is for."}
              </p>

              <div className="pf-new-fields">
                {companyAccessMode === "single" ? (
                  <div className="pf-new-company-context">
                    <span className="pf-new-company-context-label">
                      Request for
                    </span>
                    <strong>{companies[0]?.name}</strong>
                    {companies[0]?.code ? (
                      <span className="pf-new-company-context-code">
                        {companies[0].code}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <FormField
                    label="Which company is this request for?"
                    htmlFor="pf-new-company"
                    required
                    error={
                      touched.companyId ? step2Errors.companyId : undefined
                    }
                    hint="Only companies you can use are listed."
                  >
                    <SearchableSelect
                      id="pf-new-company"
                      aria-label="Which company is this request for?"
                      value={companyId}
                      onChange={(v) => {
                        setCompanyId(v);
                        markTouched(["companyId"]);
                      }}
                      emptyOptionLabel="Select a company"
                      placeholder="Select a company"
                      allowEmpty
                      options={companies.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      searchPlaceholder="Search companies…"
                    />
                  </FormField>
                )}

                <FormField
                  label="Requested amount"
                  htmlFor="pf-new-amount"
                  required
                  error={touched.amount ? step2Errors.amount : undefined}
                  hint="Amount in NGN. Finance will not change this during review."
                >
                  <div className="pf-new-amount-wrap">
                    <span aria-hidden>₦</span>
                    <input
                      id="pf-new-amount"
                      className={inputClassName}
                      inputMode="decimal"
                      value={amountText}
                      placeholder="0"
                      onChange={(e) =>
                        setAmountText(formatAmountFieldDisplay(e.target.value))
                      }
                      onBlur={() => markTouched(["amount"])}
                    />
                  </div>
                </FormField>

                <FormField
                  label="Required by"
                  htmlFor="pf-new-required-by"
                  required
                  error={touched.requiredBy ? step2Errors.requiredBy : undefined}
                  hint="When the funds or goods are needed."
                >
                  <input
                    id="pf-new-required-by"
                    type="date"
                    className={inputClassName}
                    value={requiredBy}
                    onChange={(e) => setRequiredBy(e.target.value)}
                    onBlur={() => markTouched(["requiredBy"])}
                  />
                </FormField>

                <FormField
                  label="Payee"
                  htmlFor="pf-new-payee"
                  required
                  error={touched.payeeName ? step2Errors.payeeName : undefined}
                  hint="Who should receive payment if this request is approved."
                >
                  <input
                    id="pf-new-payee"
                    className={inputClassName}
                    value={payeeName}
                    placeholder="Payee name"
                    onChange={(e) => setPayeeName(e.target.value)}
                    onBlur={() => markTouched(["payeeName"])}
                  />
                </FormField>

                <FormField
                  label="Payee type"
                  htmlFor="pf-new-payee-type"
                  required
                  error={touched.payeeType ? step2Errors.payeeType : undefined}
                >
                  <SearchableSelect
                    id="pf-new-payee-type"
                    aria-label="Payee type"
                    value={payeeType}
                    onChange={(v) => {
                      setPayeeType(v as FinancialRequestPayeeType);
                      markTouched(["payeeType"]);
                    }}
                    allowEmpty={false}
                    options={FINANCIAL_REQUEST_PAYEE_TYPES.map((t) => ({
                      value: t,
                      label: PAYEE_TYPE_LABELS[t],
                    }))}
                    searchPlaceholder="Search payee type…"
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="pf-new-panel">
              <h2 className="pf-new-panel-title">Documentation</h2>
              <p className="pf-new-panel-desc">
                Upload supporting documents for this request. These help Finance
                assess and process your request.
              </p>

              <div className="pf-new-doc-role">
                <FormField
                  label="Document role for next upload"
                  htmlFor="pf-new-upload-role"
                  hint="Supporting documents are required before submission."
                >
                  <SearchableSelect
                    id="pf-new-upload-role"
                    aria-label="Document role for next upload"
                    value={uploadRole}
                    onChange={(v) =>
                      setUploadRole(v as FinancialRequestDocumentRole)
                    }
                    allowEmpty={false}
                    options={FINANCIAL_REQUEST_DOCUMENT_ROLES.map((role) => ({
                      value: role,
                      label: FINANCE_REQUEST_DOCUMENT_ROLE_LABELS[role],
                    }))}
                    searchPlaceholder="Search role…"
                  />
                </FormField>
              </div>

              <div className="pf-new-upload-row">
                <div
                  className={`pf-new-dropzone${dragOver ? " is-dragover" : ""}${
                    uploading ? " is-busy" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload documents"
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (!uploading) void uploadFiles(e.dataTransfer.files);
                  }}
                  onClick={() => {
                    if (!uploading) fileInputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!uploading) fileInputRef.current?.click();
                    }
                  }}
                >
                  <Upload size={22} aria-hidden />
                  <p className="pf-new-dropzone-title">
                    Drag and drop files here or click to browse.
                  </p>
                  <p className="pf-new-dropzone-hint">
                    You can upload multiple files (PDF, JPG, PNG, DOC, DOCX, XLS,
                    XLSX). Maximum file size: 10 MB per file.
                  </p>
                </div>
                <span className="pf-new-upload-or">or</span>
                <button
                  type="button"
                  className="pf-btn-secondary"
                  disabled={uploading || saving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="pf-new-file-input"
                  accept={FINANCE_REQUEST_DOCUMENT_ACCEPT}
                  multiple
                  disabled={uploading || saving}
                  onChange={(e) => {
                    if (e.target.files) void uploadFiles(e.target.files);
                  }}
                />
              </div>

              {uploadStatus ? (
                <p className="pf-new-upload-status" role="status">
                  {uploadStatus}
                </p>
              ) : null}

              <div className="pf-new-docs">
                <h3 className="pf-new-docs-title">
                  Uploaded documents ({activeDocuments.length})
                </h3>
                {activeDocuments.length === 0 ? (
                  <p className="pf-new-docs-empty">
                    No documents uploaded yet. Add at least one Supporting
                    document to continue.
                  </p>
                ) : (
                  <ul className="pf-new-docs-list">
                    {activeDocuments.map((doc) => (
                      <li key={doc.id} className="pf-new-doc-row">
                        <FileTypeIcon
                          mimeType={doc.mimeType}
                          filename={doc.filename}
                        />
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
                        <div className="pf-new-doc-actions">
                          <button
                            type="button"
                            className="pf-new-doc-menu-btn"
                            aria-label={`Actions for ${doc.filename}`}
                            aria-expanded={docMenuId === doc.id}
                            disabled={removingDocId === doc.id || uploading}
                            onClick={() =>
                              setDocMenuId((id) =>
                                id === doc.id ? null : doc.id
                              )
                            }
                          >
                            <MoreVertical size={16} aria-hidden />
                          </button>
                          {docMenuId === doc.id ? (
                            <div className="pf-new-doc-menu" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                disabled={removingDocId === doc.id}
                                onClick={() =>
                                  void handleRemoveDocument(doc.id)
                                }
                              >
                                {removingDocId === doc.id
                                  ? "Removing…"
                                  : "Remove"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="pf-new-panel">
              <h2 className="pf-new-panel-title">Review & Submit</h2>
              <p className="pf-new-panel-desc">
                Please review the details of your financial request before
                submitting.
              </p>

              <div className="pf-new-review">
                <section className="pf-new-review-card">
                  <div className="pf-new-review-card-head">
                    <div className="pf-new-review-card-title">
                      <span className="pf-new-review-icon" aria-hidden>
                        <FileText size={16} />
                      </span>
                      <h3>Need</h3>
                    </div>
                    <button
                      type="button"
                      className="pf-new-review-edit"
                      onClick={() => goToStep(1)}
                    >
                      Edit
                    </button>
                  </div>
                  <dl className="pf-new-review-grid">
                    <div>
                      <dt>Category</dt>
                      <dd>{dash(categoryName)}</dd>
                    </div>
                    <div>
                      <dt>Purpose</dt>
                      <dd>{dash(title)}</dd>
                    </div>
                    <div>
                      <dt>Description</dt>
                      <dd>{dash(purposeText)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="pf-new-review-card">
                  <div className="pf-new-review-card-head">
                    <div className="pf-new-review-card-title">
                      <span className="pf-new-review-icon" aria-hidden>
                        <FileText size={16} />
                      </span>
                      <h3>Details</h3>
                    </div>
                    <button
                      type="button"
                      className="pf-new-review-edit"
                      onClick={() => goToStep(2)}
                    >
                      Edit
                    </button>
                  </div>
                  <dl className="pf-new-review-grid">
                    <div>
                      <dt>Company</dt>
                      <dd>{dash(companyName)}</dd>
                    </div>
                    <div>
                      <dt>Payee</dt>
                      <dd>
                        {payeeName.trim()
                          ? `${payeeName.trim()} (${PAYEE_TYPE_LABELS[payeeType].toLowerCase()})`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Request amount</dt>
                      <dd>{formatNaira(amountValue)}</dd>
                    </div>
                    <div>
                      <dt>Required by</dt>
                      <dd>{formatDate(requiredBy || null)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="pf-new-review-card">
                  <div className="pf-new-review-card-head">
                    <div className="pf-new-review-card-title">
                      <span className="pf-new-review-icon" aria-hidden>
                        <Paperclip size={16} />
                      </span>
                      <div>
                        <h3>Supporting Documents</h3>
                        <p className="pf-new-review-docs-count">
                          {activeDocuments.length === 1
                            ? "1 document uploaded."
                            : `${activeDocuments.length} documents uploaded.`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pf-new-review-edit"
                      onClick={() => goToStep(3)}
                    >
                      Edit
                    </button>
                  </div>
                  {activeDocuments.length === 0 ? (
                    <p className="pf-new-docs-empty">
                      No documents uploaded yet.
                    </p>
                  ) : (
                    <ul className="pf-new-docs-list">
                      {activeDocuments.map((doc) => (
                        <li key={doc.id} className="pf-new-doc-row is-readonly">
                          <FileTypeIcon
                            mimeType={doc.mimeType}
                            filename={doc.filename}
                          />
                          <div className="pf-new-doc-meta">
                            <strong>{doc.filename}</strong>
                            <span>
                              {mimeTypeLabel(doc.mimeType, doc.filename)} ·{" "}
                              {formatFileSize(doc.byteSize)} · Uploaded{" "}
                              {formatUploadedAt(doc.uploadedAt)}
                            </span>
                          </div>
                          <div className="pf-new-doc-role-chip">
                            {
                              FINANCE_REQUEST_DOCUMENT_ROLE_LABELS[
                                doc.documentRole
                              ]
                            }
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="pf-new-aside">
          <div className="pf-new-summary">
            <h3>Request summary</h3>
            <p>
              {step === 4
                ? "This will be submitted for approval."
                : "This will be updated as you complete each step."}
            </p>
            <dl>
              <div>
                <dt>Category</dt>
                <dd>{dash(categoryName)}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{dash(title)}</dd>
              </div>
              <div>
                <dt>Request amount</dt>
                <dd>{formatNaira(amountValue)}</dd>
              </div>
              <div>
                <dt>Required by</dt>
                <dd>{formatDate(requiredBy || null)}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{dash(companyName)}</dd>
              </div>
              <div>
                <dt>Payee</dt>
                <dd>{dash(payeeName)}</dd>
              </div>
              <div>
                <dt>Attachments</dt>
                <dd>
                  {activeDocuments.length === 0
                    ? "0"
                    : activeDocuments.length === 1
                      ? "1 file"
                      : `${activeDocuments.length} files`}
                </dd>
              </div>
            </dl>
          </div>

          {step === 4 ? (
            <div className="pf-new-guide">
              <div className="pf-new-guide-head">
                <Info size={16} aria-hidden />
                <strong>Before you submit</strong>
              </div>
              <p className="pf-new-guide-lead">Please ensure that:</p>
              <ul>
                <li>All information is correct</li>
                <li>You have uploaded the required supporting documents</li>
                <li>
                  The request amount and required by date are accurate
                </li>
              </ul>
            </div>
          ) : step >= 3 ? (
            <div className="pf-new-guide">
              <div className="pf-new-guide-head">
                <Info size={16} aria-hidden />
                <strong>Document guidance</strong>
              </div>
              <p className="pf-new-guide-lead">
                Upload documents that support this request, such as:
              </p>
              <ul>
                <li>Supplier quotations</li>
                <li>Invoices or pro forma invoices</li>
                <li>Receipts where applicable</li>
                <li>Internal approvals where required</li>
                <li>Any other relevant documents</li>
              </ul>
              <p className="pf-new-guide-foot">
                <strong>Accepted file types:</strong> PDF, JPG, JPEG, PNG, DOC,
                DOCX, XLS, XLSX
              </p>
              <p className="pf-new-guide-foot">
                <strong>Maximum size:</strong> 10 MB per file
              </p>
            </div>
          ) : (
            <div className="pf-new-guide">
              <div className="pf-new-guide-head">
                <Info size={16} aria-hidden />
                <strong>Good to know</strong>
              </div>
              <ul>
                <li>Be clear and specific about what you need.</li>
                <li>
                  Supporting documentation will be required before the request
                  can progress.
                </li>
                <li>
                  Finance may query the request for additional information.
                </li>
                <li>You can save the request as a draft and continue later.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      <footer className="pf-new-footer">
        <button
          type="button"
          className="pf-btn-secondary"
          disabled={busy}
          onClick={() => {
            setDocMenuId(null);
            if (step === 4) {
              goToStep(3);
              return;
            }
            if (step === 3) {
              goToStep(2);
              return;
            }
            if (step === 2) {
              goToStep(1);
              return;
            }
            router.push("/platform-finance/requests");
          }}
        >
          {step === 1 ? "Cancel" : "Back"}
        </button>
        {step === 4 ? (
          <button
            type="button"
            className="pf-btn-primary"
            disabled={busy || !draftId || !hasActiveSupporting}
            title={
              !hasActiveSupporting
                ? "Add at least one Supporting document before submitting"
                : undefined
            }
            onClick={() => void handleSubmitRequest()}
          >
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        ) : (
          <button
            type="button"
            className="pf-btn-primary"
            disabled={busy}
            title={
              step === 3 && !hasActiveSupporting
                ? "Add at least one Supporting document to continue"
                : undefined
            }
            onClick={() => {
              if (step === 1) handleContinueFromNeed();
              else if (step === 2) void handleContinueFromDetails();
              else if (step === 3) handleContinueFromDocumentation();
            }}
          >
            Continue
            <ArrowRight size={16} aria-hidden />
          </button>
        )}
      </footer>
    </div>
  );
}
