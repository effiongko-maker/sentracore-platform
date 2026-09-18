"use client";

import { useState } from "react";
import { PlatformFinanceInvoicesService } from "@/services/platform-finance/PlatformFinanceInvoicesService";
import type { FinanceInvoiceDetail } from "@/modules/platform-finance/domain/invoices";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  invoiceCustomerName,
} from "@/modules/platform-finance/invoicePresentation";

export function PlatformFinanceInvoiceReviewDrawer(props: {
  invoice: FinanceInvoiceDetail;
  onClose: () => void;
  onIssued?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invoice = props.invoice;
  const customer = invoiceCustomerName(invoice);
  const notes = invoice.description?.trim() || null;

  async function issue() {
    if (invoice.status !== "under_review") return;
    setBusy(true);
    setError(null);
    try {
      await PlatformFinanceInvoicesService.issueAndPost(invoice.id);
      props.onIssued?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to issue invoice.");
      setBusy(false);
    }
  }

  return (
    <div
      className="pf-drawer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <section
        className="pf-req-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Review invoice"
      >
        <header className="pf-req-drawer-head">
          <div>
            <h2 className="pf-req-drawer-title">Review Invoice</h2>
            <p className="pf-req-drawer-cat">
              Confirm the invoice details before issuing it.
            </p>
          </div>
          <button type="button" className="pf-btn-secondary" onClick={props.onClose}>
            Close
          </button>
        </header>
        <div className="pf-req-drawer-body">
          {error ? (
            <div className="pf-vb-alert is-danger" role="alert">
              {error}
            </div>
          ) : null}
          <dl className="pf-req-dl">
            <div>
              <dt>Customer</dt>
              <dd>{customer}</dd>
            </div>
            <div>
              <dt>Invoice date</dt>
              <dd>{formatInvoiceDate(invoice.invoiceDate)}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{formatInvoiceDate(invoice.dueDate)}</dd>
            </div>
          </dl>
          <section className="pf-req-drawer-section">
            <h3>Invoice lines</h3>
            <div className="pf-req-table-wrap">
              <table className="pf-req-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td className="pf-req-amount-cell">
                        {formatInvoiceMoney(line.unitPrice, invoice.currency)}
                      </td>
                      <td className="pf-req-amount-cell">
                        {formatInvoiceMoney(line.lineAmount, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pf-invoice-lines-invoice-total">
              Total
              <strong>{formatInvoiceMoney(invoice.totalAmount, invoice.currency)}</strong>
            </p>
          </section>
          {notes ? (
            <section className="pf-req-drawer-section">
              <h3>Notes</h3>
              <p className="pf-req-description">{notes}</p>
            </section>
          ) : null}
          <section className="pf-req-drawer-section">
            <h3>On issue</h3>
            <p className="pf-req-description">
              A receivable of {formatInvoiceMoney(invoice.totalAmount, invoice.currency)} will
              be recognised for {customer}.
            </p>
          </section>
        </div>
        <footer className="pf-req-drawer-footer">
          <div className="pf-req-action-row">
            <button type="button" className="pf-btn-secondary" onClick={props.onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="pf-btn-primary"
              disabled={busy || invoice.status !== "under_review"}
              onClick={() => void issue()}
            >
              {busy ? "Issuing…" : "Issue Invoice"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
