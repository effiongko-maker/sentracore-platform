"use client";

import Link from "next/link";
import { ArrowLeft, FileStack, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/tables/DataTable";
import type { CostSubmission } from "@/lib/operational/finance/types";
import { SUBMISSIONS_LIST_PAGE_SIZE } from "../constants";
import { useCostSubmissionsList } from "../hooks/useCostSubmissionsList";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import {
  SUBMISSION_LIFECYCLE_LABELS,
} from "../utils/submissionLifecycle";

function formatTimestamp(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SubmissionsPage() {
  const [page, setPage] = useState(1);
  const { submissions, total, totalPages, loading, error, reload } =
    useCostSubmissionsList({
      page,
      pageSize: SUBMISSIONS_LIST_PAGE_SIZE,
    });

  const columns = useMemo<Column<CostSubmission>[]>(
    () => [
      {
        key: "submissionId",
        header: "Submission",
        render: (row) => (
          <Link
            href={`/finance/submissions/${row.submissionId}`}
            className="font-medium text-primary hover:underline"
          >
            {row.submissionId}
          </Link>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <span className="text-muted">
            {SUBMISSION_LIFECYCLE_LABELS[row.status]}
          </span>
        ),
      },
      {
        key: "periodLabel",
        header: "Period",
        render: (row) => (
          <span className="text-muted">{row.periodLabel ?? "—"}</span>
        ),
      },
      {
        key: "submissionKind",
        header: "Kind",
        render: (row) => (
          <span className="text-muted">{row.submissionKind ?? "—"}</span>
        ),
      },
      {
        key: "costRecordIds",
        header: "Costs",
        render: (row) => (
          <span className="text-muted">{row.costRecordIds.length}</span>
        ),
      },
      {
        key: "claimAmount",
        header: "Claim",
        render: (row) => (
          <span className="font-medium">
            {formatFinancialAmount(row.claimAmount, row.currency)}
          </span>
        ),
      },
      {
        key: "submittedAt",
        header: "Submitted",
        render: (row) => (
          <span className="text-muted">{formatTimestamp(row.submittedAt)}</span>
        ),
      },
    ],
    []
  );

  return (
    <ModeFrame mode="act">
      <div className="fin-page">
        <div className="mb-4">
          <Link
            href="/finance"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Finance
          </Link>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <OperateHeader
            title="Reimbursement submissions"
            description="Build and track cost reimbursement claims from operational spend."
            signalValue={loading ? "—" : total}
            signalLabel="Submissions"
          />
          <Link
            href="/finance/submissions/new"
            className="inline-flex h-8 items-center gap-2 rounded-[12px] bg-accent px-3 text-xs font-medium text-white shadow-sc hover:bg-[#1e40af]"
          >
            <Plus className="h-4 w-4" />
            Create submission
          </Link>
        </div>

        <StreamSurface className="mt-4">
          {error ? (
            <EmptyState
              icon={FileStack}
              title="Unable to load submissions"
              description={error}
              actionLabel="Try again"
              onAction={() => void reload()}
            />
          ) : (
            <DataTable
              columns={columns}
              data={submissions}
              rowKey={(row) => row.submissionId}
              loading={loading}
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              emptyIcon={FileStack}
              emptyTitle="No submissions yet"
              emptyDescription="Create a submission to bundle reimbursable costs into a reimbursement claim."
            />
          )}
        </StreamSurface>
      </div>
    </ModeFrame>
  );
}
