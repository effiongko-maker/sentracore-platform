"use client";

import { useState } from "react";
import { ArrowLeft, FileDown, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { getEccReportType } from "./constants";
import { downloadEccReportWord } from "./downloadEccReportWord";
import type { EccClientReportDocument } from "./types";

function formatReportDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function EccReportToolbar({
  report,
  onBack,
  onStartOver,
}: {
  report: EccClientReportDocument;
  onBack: () => void;
  onStartOver: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"word" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportType =
    getEccReportType(report.reportType)?.title ?? "Operational report";

  async function handleWord() {
    setBusy("word");
    setError(null);
    try {
      await downloadEccReportWord(report);
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
            {report.title}
          </h1>
          <p className="text-sm text-muted">
            <span>{report.periodLabel}</span>
            <span className="mx-2 text-border">·</span>
            <span>{report.facilityLabel || report.centreName}</span>
            <span className="mx-2 text-border">·</span>
            <span>{formatReportDateTime(report.generatedAt)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
