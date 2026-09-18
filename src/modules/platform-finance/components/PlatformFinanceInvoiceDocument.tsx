"use client";

import type { FinanceInvoiceDetail } from "@/modules/platform-finance/domain/invoices";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  invoiceCustomerLegalName,
  invoiceCustomerName,
  invoiceDocumentStatusLabel,
} from "@/modules/platform-finance/invoicePresentation";

export const INVOICE_DOCUMENT_ID = "invoice-document";

export function PlatformFinanceInvoiceDocument({
  invoice,
}: {
  invoice: FinanceInvoiceDetail;
}) {
  const customer = invoiceCustomerName(invoice);
  const legalName = invoiceCustomerLegalName(invoice);
  const statusLabel = invoiceDocumentStatusLabel(invoice.status);
  const notes = invoice.description?.trim() || null;

  return (
    <article
      id={INVOICE_DOCUMENT_ID}
      className="pf-invoice-doc"
      aria-label={`Invoice ${invoice.reference}`}
    >
      <header className="pf-invoice-doc-header">
        <div>
          <p className="pf-invoice-doc-kicker">Invoice</p>
          <p className="pf-invoice-doc-issuer">{invoice.companyName}</p>
          {statusLabel ? (
            <p className="pf-invoice-doc-mark">{statusLabel}</p>
          ) : null}
        </div>
        <dl className="pf-invoice-doc-meta">
          <div>
            <dt>Invoice number</dt>
            <dd>{invoice.reference}</dd>
          </div>
          <div>
            <dt>Invoice date</dt>
            <dd>{formatInvoiceDate(invoice.invoiceDate)}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{formatInvoiceDate(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{invoice.currency}</dd>
          </div>
        </dl>
      </header>

      <section className="pf-invoice-doc-party" aria-label="Bill to">
        <h2>Bill to</h2>
        <p className="pf-invoice-doc-customer">{customer}</p>
        {legalName ? <p className="pf-invoice-doc-muted">{legalName}</p> : null}
        {invoice.counterpartyTaxRegistrationId ? (
          <p className="pf-invoice-doc-muted">
            Tax ID {invoice.counterpartyTaxRegistrationId}
          </p>
        ) : null}
      </section>

      <table className="pf-invoice-doc-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.description}</td>
              <td className="is-num">{line.quantity}</td>
              <td className="is-num">
                {formatInvoiceMoney(line.unitPrice, invoice.currency)}
              </td>
              <td className="is-num">
                {formatInvoiceMoney(line.lineAmount, invoice.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pf-invoice-doc-total">
        Total
        <strong>{formatInvoiceMoney(invoice.totalAmount, invoice.currency)}</strong>
      </p>

      {notes ? (
        <section className="pf-invoice-doc-notes" aria-label="Notes">
          <h2>Notes</h2>
          <p>{notes}</p>
        </section>
      ) : null}
    </article>
  );
}
