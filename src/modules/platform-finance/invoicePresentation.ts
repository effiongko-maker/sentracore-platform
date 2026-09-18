import type { FinanceInvoiceDetail, InvoiceStatus } from "@/modules/platform-finance/domain/invoices";

export function formatInvoiceMoney(amount: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG")}`;
  }
}

export function formatInvoiceDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function invoiceCustomerName(invoice: {
  status: InvoiceStatus;
  counterpartyName: string;
  counterpartyDisplayName: string | null;
}) {
  if (invoice.status === "issued" && invoice.counterpartyDisplayName?.trim()) {
    return invoice.counterpartyDisplayName.trim();
  }
  return invoice.counterpartyName;
}

export function invoiceCustomerLegalName(invoice: FinanceInvoiceDetail) {
  const display = invoiceCustomerName(invoice);
  const legal = invoice.counterpartyLegalName?.trim() ?? "";
  if (!legal) return null;
  if (legal.toLowerCase() === display.trim().toLowerCase()) return null;
  return legal;
}

export function invoiceDocumentStatusLabel(status: InvoiceStatus) {
  if (status === "draft") return "Draft";
  if (status === "under_review") return "Under review — not issued";
  return null;
}
