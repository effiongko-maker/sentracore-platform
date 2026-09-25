import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PlatformFinanceReportPage } from "@/modules/platform-finance/components/PlatformFinanceReportPage";
import { financeReportById } from "@/modules/platform-finance/reports/catalogue";

type Props = { params: Promise<{ reportId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reportId } = await params;
  return { title: financeReportById(reportId)?.title ?? "Report" };
}

export default async function PlatformFinanceReportRoute({ params }: Props) {
  const { reportId } = await params;
  const report = financeReportById(reportId);
  if (!report) notFound();
  return (
    <Suspense fallback={<p className="pf-state-message">Preparing report…</p>}>
      <PlatformFinanceReportPage reportId={report.id} />
    </Suspense>
  );
}
