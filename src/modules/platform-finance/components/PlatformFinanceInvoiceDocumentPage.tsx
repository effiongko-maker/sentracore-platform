"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { PlatformFinanceInvoicesService } from "@/services/platform-finance/PlatformFinanceInvoicesService";
import type { FinanceInvoiceDetail } from "@/modules/platform-finance/domain/invoices";
import {
  INVOICE_DOCUMENT_ID,
  PlatformFinanceInvoiceDocument,
} from "@/modules/platform-finance/components/PlatformFinanceInvoiceDocument";
import { downloadInvoicePdf } from "@/modules/platform-finance/export/downloadInvoicePdf";

export function PlatformFinanceInvoiceDocumentPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = params.id;
  const [detail, setDetail] = useState<FinanceInvoiceDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

  const reload = useCallback(async () => {
    const next = await PlatformFinanceInvoicesService.getDetail(invoiceId);
    setDetail(next);
  }, [invoiceId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setBusy(true);
        return reload();
      })
      .then(() => {
        if (!cancelled) setBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to load invoice.");
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const issued = detail?.status === "issued";

  async function handleDownload() {
    const element = document.getElementById(INVOICE_DOCUMENT_ID);
    if (!detail || !issued || !element) return;
    setExporting(true);
    setError(null);
    try {
      await downloadInvoicePdf(detail.reference, element);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to download invoice PDF.");
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    if (!issued) return;
    window.print();
  }

  useEffect(() => {
    if (!detail || detail.status !== "issued" || autoRan.current || busy) return;
    const shouldPrint = searchParams.get("print") === "1";
    const shouldDownload = searchParams.get("download") === "1";
    if (!shouldPrint && !shouldDownload) return;
    autoRan.current = true;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        if (cancelled) return;
        if (shouldPrint) window.print();
        if (shouldDownload) {
          const element = document.getElementById(INVOICE_DOCUMENT_ID);
          if (element) {
            setExporting(true);
            try {
              await downloadInvoicePdf(detail.reference, element);
            } catch (e: unknown) {
              if (!cancelled) {
                setError(
                  e instanceof Error ? e.message : "Unable to download invoice PDF."
                );
              }
            } finally {
              if (!cancelled) setExporting(false);
            }
          }
        }
        if (!cancelled) {
          router.replace(`/platform-finance/invoices/${detail.id}/document`);
        }
      })();
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [detail, busy, searchParams, router]);

  return (
    <div className="pf-invoice-document-page">
      <header className="pf-invoice-doc-toolbar print:hidden">
        <Link className="pf-link-btn" href={`/platform-finance/invoices/${invoiceId}`}>
          <ArrowLeft size={16} aria-hidden />
          Back to Invoice
        </Link>
        {issued ? (
          <div className="pf-req-controls">
            <button
              type="button"
              className="pf-btn-secondary"
              disabled={exporting}
              onClick={handlePrint}
            >
              <Printer size={16} aria-hidden />
              Print
            </button>
            <button
              type="button"
              className="pf-btn-primary"
              disabled={exporting}
              onClick={() => void handleDownload()}
            >
              <Download size={16} aria-hidden />
              {exporting ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        ) : null}
      </header>

      {busy && !detail ? <p className="pf-state-message print:hidden">Loading invoice…</p> : null}
      {error ? (
        <div className="pf-vb-alert is-danger print:hidden" role="alert">
          {error}
        </div>
      ) : null}

      {detail ? (
        <div className="pf-invoice-print-root">
          <PlatformFinanceInvoiceDocument invoice={detail} />
        </div>
      ) : null}
    </div>
  );
}
