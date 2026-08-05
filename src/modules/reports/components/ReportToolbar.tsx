"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Download,
  FileDown,
  FileText,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { getReportType } from "../constants";
import type { ClientReportDocument } from "../types";
import { displayReportValue, formatReportDateTime } from "../utils";
import { downloadReportPdf } from "../export/downloadReportPdf";
import { downloadReportWord } from "../export/downloadReportWord";

export function ReportToolbar({
  report,
  documentElementId,
  onBack,
  onStartOver,
}: {
  report: ClientReportDocument;
  documentElementId: string;
  onBack: () => void;
  onStartOver: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"pdf" | "word" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title = displayReportValue(report.title, "Operational Report");
  const reportType = displayReportValue(
    getReportType(report.reportType)?.title,
    "Operational report"
  );
  const period = displayReportValue(report.periodLabel, "Reporting Period");
  const facility = displayReportValue(report.facilityLabel, "Selected Facility");

  async function handlePdf() {
    const element = document.getElementById(documentElementId);
    if (!element) {
      setError("Report document is not ready to export.");
      return;
    }
    setBusy("pdf");
    setError(null);
    try {
      await downloadReportPdf(report, element);
      toast({
        type: "success",
        title: "✓ PDF downloaded successfully",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to download PDF."
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleWord() {
    setBusy("word");
    setError(null);
    try {
      await downloadReportWord(report);
      toast({
        type: "success",
        title: "✓ Word document downloaded",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to download Word document."
      );
    } finally {
      setBusy(null);
    }
  }

  function handlePrint() {
    setError(null);
    window.print();
    toast({
      type: "success",
      title: "✓ Print dialog opened",
    });
  }

  return (
    <div className="print:hidden border-b border-border/70 bg-card">
      <div className="flex flex-col gap-3 px-1 py-3 sm:px-0 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {reportType}
          </p>
          <h1 className="truncate text-xl font-semibold tracking-tight text-primary sm:text-2xl">
            {title}
          </h1>
          <p className="text-sm text-muted">
            <span>{period}</span>
            <span className="mx-2 text-border">·</span>
            <span>{facility}</span>
            <span className="mx-2 text-border">·</span>
            <span>{formatReportDateTime(report.generatedAt)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void handlePdf()}
            disabled={busy !== null}
            loading={busy === "pdf"}
          >
            {busy === "pdf" ? null : <Download className="h-3.5 w-3.5" />}
            Download PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handlePrint}
            disabled={busy !== null}
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleWord()}
            disabled={busy !== null}
            loading={busy === "word"}
          >
            {busy === "word" ? null : <FileDown className="h-3.5 w-3.5" />}
            Download Word
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onBack}
            disabled={busy !== null}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Edit selections
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onStartOver}
            disabled={busy !== null}
          >
            <FileText className="h-3.5 w-3.5" />
            New report
          </Button>
        </div>
      </div>

      {error ? (
        <p className="pb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
