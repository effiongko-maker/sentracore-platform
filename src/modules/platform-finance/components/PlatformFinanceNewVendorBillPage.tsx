"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  FileImage,
  FileSpreadsheet,
  FileText,
  Upload,
  X,
} from "lucide-react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import {
  PlatformFinanceVendorBillsService,
  type FinanceVendorBillCapabilities,
} from "@/services/platform-finance/PlatformFinanceVendorBillsService";
import {
  FINANCE_VENDOR_BILL_DOCUMENT_ROLES,
  FINANCE_VENDOR_BILL_PAYEE_TYPES,
  type FinanceVendorBill,
  type FinanceVendorBillDocument,
  type FinanceVendorBillDocumentRole,
  type FinanceVendorBillPayeeType,
} from "@/modules/platform-finance/domain/vendorBills";
import {
  FINANCE_VENDOR_BILL_DOCUMENT_ACCEPT,
  FINANCE_VENDOR_BILL_DOCUMENT_ROLE_LABELS,
  formatFileSize,
  mimeTypeLabel,
  prevalidateFinanceVendorBillDocumentFile,
} from "@/modules/platform-finance/vendorBillDocumentUi";

const PURPOSE_MAX = 500;

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

function parseAmountInput(display: string): number | null {
  const cleaned = display.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
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

export function PlatformFinanceNewVendorBillPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [caps, setCaps] = useState<FinanceVendorBillCapabilities | null>(null);
  const [companies, setCompanies] = useState<
    Array<{ id: string; code: string; name: string; status: string }>
  >([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const [companyId, setCompanyId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [payeeType, setPayeeType] =
    useState<FinanceVendorBillPayeeType>("vendor");
  const [destinationEnabled, setDestinationEnabled] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [purpose, setPurpose] = useState("");
  const [description, setDescription] = useState("");
  const [goodsReceived, setGoodsReceived] = useState<"yes" | "no">("no");
  const [projectContractRef, setProjectContractRef] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [bill, setBill] = useState<FinanceVendorBill | null>(null);
  const [documents, setDocuments] = useState<FinanceVendorBillDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [docRole, setDocRole] =
    useState<FinanceVendorBillDocumentRole>("supporting");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      try {
        const [capability, cos] = await Promise.all([
          PlatformFinanceVendorBillsService.getMyVendorBillCapabilities(),
          PlatformFinanceVendorBillsService.listAccessibleCompanies(),
        ]);
        if (cancelled) return;
        setCaps(capability);
        setCompanies(cos.filter((c) => c.status === "active"));
        if (!capability.create) {
          setBootError("You do not have permission to create vendor bills.");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setBootError(
            err instanceof Error
              ? err.message
              : "Unable to load vendor bill form."
          );
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshDocuments = useCallback(async (vendorBillId: string) => {
    const detail =
      await PlatformFinanceVendorBillsService.getVendorBillDetail(vendorBillId);
    setDocuments(detail.documents.filter((d) => !d.supersededAt));
    setBill(detail.vendorBill);
  }, []);

  async function ensureDraft(): Promise<FinanceVendorBill> {
    if (bill) return bill;
    const amount = parseAmountInput(amountDisplay);
    if (!companyId) throw new Error("Company is required.");
    if (!payeeName.trim()) throw new Error("Vendor / Payee name is required.");
    if (amount == null || amount < 0) {
      throw new Error("Amount must be a number greater than or equal to 0.");
    }
    if (!purpose.trim()) throw new Error("Description / Purpose is required.");
    if (destinationEnabled && (!bankName.trim() || !accountName.trim() || !accountNumber.trim())) {
      throw new Error("Complete bank name, account name, and account number, or remove payment details.");
    }

    const created = await PlatformFinanceVendorBillsService.createVendorBill({
      companyId,
      payeeName: payeeName.trim(),
      payeeType,
      billedAmount: amount,
      purpose: purpose.trim(),
      description: description.trim() || purpose.trim(),
      invoiceReference: invoiceReference.trim() || null,
      invoiceDate: invoiceDate || null,
      goodsServicesReceived: goodsReceived === "yes",
      dueDate: dueDate || null,
      projectContractRef: projectContractRef.trim() || null,
      currency,
      paymentDestination: destinationEnabled
        ? {
            paymentMethod: "bank_transfer",
            bankName: bankName.trim(),
            accountName: accountName.trim(),
            accountNumber: accountNumber.trim(),
          }
        : null,
    });
    setBill(created);
    setAccountNumber("");
    return created;
  }

  async function persistDraftFields(existing: FinanceVendorBill) {
    const amount = parseAmountInput(amountDisplay);
    if (amount == null || amount < 0) {
      throw new Error("Amount must be a number greater than or equal to 0.");
    }
    if (!payeeName.trim()) throw new Error("Vendor / Payee name is required.");
    if (!purpose.trim()) throw new Error("Description / Purpose is required.");
    const existingDestination = existing.paymentDestination;
    if (destinationEnabled && (!bankName.trim() || !accountName.trim())) {
      throw new Error("Bank name and account name are required for payment details.");
    }
    if (destinationEnabled && !existingDestination && !accountNumber.trim()) {
      throw new Error("Account number is required for new payment details.");
    }
    if (
      destinationEnabled && existingDestination && !accountNumber.trim() &&
      (bankName.trim() !== existingDestination.bankName ||
        accountName.trim() !== existingDestination.accountName)
    ) {
      throw new Error("Enter the account number to replace existing payment details.");
    }

    const updated = await PlatformFinanceVendorBillsService.updateDraftVendorBill(
      existing.id,
      {
        payeeName: payeeName.trim(),
        payeeType,
        billedAmount: amount,
        purpose: purpose.trim(),
        description: description.trim() || purpose.trim(),
        invoiceReference: invoiceReference.trim() || null,
        invoiceDate: invoiceDate || null,
        clearInvoiceDate: !invoiceDate,
        goodsServicesReceived: goodsReceived === "yes",
        dueDate: dueDate || null,
        clearDueDate: !dueDate,
        projectContractRef: projectContractRef.trim() || null,
        currency,
        paymentDestinationMutation: !destinationEnabled
          ? existingDestination
            ? { action: "remove" }
            : { action: "preserve" }
          : accountNumber.trim()
            ? {
                action: "replace",
                destination: {
                  paymentMethod: "bank_transfer",
                  bankName: bankName.trim(),
                  accountName: accountName.trim(),
                  accountNumber: accountNumber.trim(),
                },
              }
            : { action: "preserve" },
      }
    );
    setBill(updated);
    setAccountNumber("");
    return updated;
  }

  async function handleSaveDraft() {
    setBusy(true);
    setFormError(null);
    try {
      const draft = await ensureDraft();
      await persistDraftFields(draft);
      router.push(`/platform-finance/vendor-bills/${draft.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Unable to save draft.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setBusy(true);
    setFormError(null);
    try {
      const draft = await ensureDraft();
      await persistDraftFields(draft);
      const docs =
        documents.length > 0
          ? documents
          : (
              await PlatformFinanceVendorBillsService.getVendorBillDetail(
                draft.id
              )
            ).documents.filter((d) => !d.supersededAt);
      if (docs.length === 0) {
        throw new Error("At least one supporting document is required to submit.");
      }
      if (goodsReceived !== "yes") {
        throw new Error(
          "Goods / services must be marked received before submit."
        );
      }
      await PlatformFinanceVendorBillsService.submitVendorBill(draft.id);
      router.push(`/platform-finance/vendor-bills/${draft.id}`);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Unable to submit vendor bill."
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setFormError(null);
    try {
      const draft = await ensureDraft();
      await persistDraftFields(draft);
      for (const file of list) {
        const pre = prevalidateFinanceVendorBillDocumentFile(file);
        if (pre) throw new Error(pre);
        await PlatformFinanceVendorBillsService.uploadDocument({
          vendorBillId: draft.id,
          file,
          documentRole: docRole,
        });
      }
      await refreshDocuments(draft.id);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Document upload failed."
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeDocument(documentId: string) {
    if (!bill) return;
    setFormError(null);
    try {
      await PlatformFinanceVendorBillsService.removeDocument(bill.id, documentId);
      await refreshDocuments(bill.id);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Unable to remove document."
      );
    }
  }

  if (booting) {
    return (
      <div className="pf-new-request pf-vb-create">
        <p className="pf-empty-copy">Loading…</p>
      </div>
    );
  }

  if (bootError || !caps?.create) {
    return (
      <div className="pf-new-request pf-vb-create">
        <Link href="/platform-finance/vendor-bills" className="pf-link-btn">
          <ArrowLeft size={16} aria-hidden />
          Back to Vendor Bills
        </Link>
        <div className="pf-req-empty">
          <p className="pf-empty-title">Cannot create vendor bill</p>
          <p className="pf-empty-copy">
            {bootError ?? "Missing capability platform_finance.vendor_bill.create."}
          </p>
        </div>
      </div>
    );
  }

  const companyOptions = companies.map((c) => ({
    value: c.id,
    label: c.name,
    searchText: c.code,
  }));

  return (
    <div className="pf-new-request pf-vb-create">
      <Link href="/platform-finance/vendor-bills" className="pf-link-btn">
        <ArrowLeft size={16} aria-hidden />
        Back to Vendor Bills
      </Link>

      <header className="pf-vb-create-header">
        <h1 className="pf-vb-create-title">Create Vendor Bill</h1>
        <p className="pf-vb-create-desc">
          Enter the invoice details and supporting information.
        </p>
      </header>

      {formError ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {formError}
        </div>
      ) : null}

      <div className="pf-vb-create-sheet">
        <section className="pf-vb-create-section">
          <h2 className="pf-vb-create-section-title">Company</h2>
          <div className="pf-vb-create-fields pf-vb-create-fields-company">
            <FormField
              label="Company"
              htmlFor="vb-company"
              required
              className="pf-vb-company-field"
            >
              <SearchableSelect
                id="vb-company"
                className="pf-vb-company-select"
                menuClassName="pf-vb-company-menu"
                value={companyId}
                onChange={setCompanyId}
                options={companyOptions}
                placeholder="Select company"
                searchPlaceholder="Search companies…"
                allowEmpty={false}
                disabled={Boolean(bill) || busy}
              />
            </FormField>
          </div>
        </section>

        <section className="pf-vb-create-section">
          <h2 className="pf-vb-create-section-title">Payment Destination</h2>
          <label className="pf-new-check-row">
            <input type="checkbox" checked={destinationEnabled} onChange={(e) => setDestinationEnabled(e.target.checked)} disabled={busy} />
            Add bank-transfer payment details (optional)
          </label>
          {destinationEnabled ? (
            <div className="pf-vb-create-fields pf-vb-create-fields-vendor">
              <FormField label="Bank name" htmlFor="vb-bank-name" required>
                <input id="vb-bank-name" className={inputClassName} value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={busy} />
              </FormField>
              <FormField label="Account name" htmlFor="vb-account-name" required>
                <input id="vb-account-name" className={inputClassName} value={accountName} onChange={(e) => setAccountName(e.target.value)} disabled={busy} />
              </FormField>
              <FormField label={bill?.paymentDestination ? "Replacement account number" : "Account number"} htmlFor="vb-account-number" required={!bill?.paymentDestination}>
                <input id="vb-account-number" className={inputClassName} inputMode="numeric" autoComplete="off" value={accountNumber} placeholder={bill?.paymentDestination ? `Existing •••• ${bill.paymentDestination.accountNumberLast4}; blank preserves` : "Account number"} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} disabled={busy} />
              </FormField>
            </div>
          ) : null}
        </section>

        <section className="pf-vb-create-section">
          <h2 className="pf-vb-create-section-title">Vendor / Payee</h2>
          <div className="pf-vb-create-fields pf-vb-create-fields-vendor">
            <FormField label="Vendor / Payee name" htmlFor="vb-payee" required>
              <input
                id="vb-payee"
                className={inputClassName}
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                disabled={busy}
              />
            </FormField>
            <FormField label="Payee type" htmlFor="vb-payee-type">
              <select
                id="vb-payee-type"
                className={inputClassName}
                value={payeeType}
                onChange={(e) =>
                  setPayeeType(e.target.value as FinanceVendorBillPayeeType)
                }
                disabled={busy}
              >
                {FINANCE_VENDOR_BILL_PAYEE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "vendor" ? "Vendor" : t === "staff" ? "Staff" : "Other"}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Invoice / Bill Reference"
              htmlFor="vb-invoice-ref"
            >
              <input
                id="vb-invoice-ref"
                className={inputClassName}
                value={invoiceReference}
                onChange={(e) => setInvoiceReference(e.target.value)}
                disabled={busy}
              />
            </FormField>
            <FormField label="Invoice Date" htmlFor="vb-invoice-date">
              <input
                id="vb-invoice-date"
                type="date"
                className={inputClassName}
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                disabled={busy}
              />
            </FormField>
          </div>
        </section>

        <section className="pf-vb-create-section">
          <h2 className="pf-vb-create-section-title">Amount and Details</h2>
          <div className="pf-vb-create-fields pf-vb-create-fields-amount">
            <FormField label="Amount" htmlFor="vb-amount" required>
              <div className="pf-new-amount-wrap">
                <span aria-hidden>₦</span>
                <input
                  id="vb-amount"
                  className={inputClassName}
                  inputMode="decimal"
                  value={amountDisplay}
                  onChange={(e) =>
                    setAmountDisplay(formatAmountFieldDisplay(e.target.value))
                  }
                  disabled={busy}
                />
              </div>
            </FormField>
            <FormField label="Currency" htmlFor="vb-currency">
              <select
                id="vb-currency"
                className={inputClassName}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={busy}
              >
                <option value="NGN">NGN</option>
              </select>
            </FormField>
            <FormField
              label="Description / Purpose"
              htmlFor="vb-purpose"
              required
              className="pf-vb-create-purpose"
            >
              <input
                id="vb-purpose"
                className={inputClassName}
                maxLength={PURPOSE_MAX}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                disabled={busy}
              />
            </FormField>
            <FormField
              label="Additional notes (optional)"
              htmlFor="vb-description"
              className="pf-vb-create-notes"
            >
              <textarea
                id="vb-description"
                className={`${inputClassName} pf-new-textarea`}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
              />
            </FormField>
          </div>
        </section>

        <section className="pf-vb-create-section">
          <h2 className="pf-vb-create-section-title">Additional Information</h2>
          <div className="pf-vb-create-fields pf-vb-create-fields-extra">
            <FormField
              label="Goods / Services Received?"
              htmlFor="vb-goods"
              required
            >
              <select
                id="vb-goods"
                className={inputClassName}
                value={goodsReceived}
                onChange={(e) =>
                  setGoodsReceived(e.target.value === "yes" ? "yes" : "no")
                }
                disabled={busy}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </FormField>
            <FormField
              label="Project / Contract (optional)"
              htmlFor="vb-project"
            >
              <input
                id="vb-project"
                className={inputClassName}
                value={projectContractRef}
                onChange={(e) => setProjectContractRef(e.target.value)}
                disabled={busy}
              />
            </FormField>
            <FormField label="Required By / Due Date" htmlFor="vb-due">
              <input
                id="vb-due"
                type="date"
                className={inputClassName}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={busy}
              />
            </FormField>
          </div>
        </section>

        <section className="pf-vb-create-section pf-vb-create-section-docs">
          <div className="pf-vb-create-docs-head">
            <h2 className="pf-vb-create-section-title">Supporting Documents</h2>
            <select
              className={`${inputClassName} pf-vb-create-doc-role`}
              value={docRole}
              onChange={(e) =>
                setDocRole(e.target.value as FinanceVendorBillDocumentRole)
              }
              disabled={busy || uploading}
              aria-label="Document role"
            >
              {FINANCE_VENDOR_BILL_DOCUMENT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {FINANCE_VENDOR_BILL_DOCUMENT_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="pf-vb-create-docs-grid">
            <div
              className={`pf-new-dropzone pf-vb-create-dropzone${
                dragOver ? " is-dragover" : ""
              }${uploading ? " is-busy" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void uploadFiles(e.dataTransfer.files);
              }}
            >
              <Upload size={20} aria-hidden />
              <p className="pf-new-dropzone-title">
                Click to upload or drag and drop
              </p>
              <p className="pf-new-dropzone-hint">
                PDF, images, or Office documents · max 10 MB
              </p>
              <button
                type="button"
                className="pf-btn-secondary"
                disabled={busy || uploading || !companyId}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="pf-new-file-input"
                accept={FINANCE_VENDOR_BILL_DOCUMENT_ACCEPT}
                multiple
                onChange={(e) => {
                  if (e.target.files) void uploadFiles(e.target.files);
                }}
              />
            </div>
            <div className="pf-vb-create-docs-side">
              {documents.length > 0 ? (
                <ul className="pf-new-docs-list">
                  {documents.map((doc) => (
                    <li key={doc.id} className="pf-new-doc-row">
                      <FileTypeIcon
                        mimeType={doc.mimeType}
                        filename={doc.filename}
                      />
                      <div className="pf-new-doc-meta">
                        <strong>{doc.filename}</strong>
                        <span className="pf-req-meta">
                          {formatFileSize(doc.byteSize)} ·{" "}
                          {
                            FINANCE_VENDOR_BILL_DOCUMENT_ROLE_LABELS[
                              doc.documentRole
                            ]
                          }
                        </span>
                      </div>
                      <button
                        type="button"
                        className="pf-icon-btn"
                        aria-label={`Remove ${doc.filename}`}
                        disabled={busy}
                        onClick={() => void removeDocument(doc.id)}
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pf-new-docs-empty">
                  Uploaded documents will appear here.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="pf-vb-create-footer">
        <button
          type="button"
          className="pf-btn-secondary"
          disabled={busy || uploading}
          onClick={() => void handleSaveDraft()}
        >
          Save as Draft
        </button>
        <button
          type="button"
          className="pf-btn-primary"
          disabled={busy || uploading}
          onClick={() => void handleSubmit()}
        >
          Submit for Review
        </button>
      </footer>
    </div>
  );
}
