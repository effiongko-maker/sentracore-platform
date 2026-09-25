"use client";

import { CostsClaimsNav } from "./CostsClaimsNav";

import Link from "next/link";
import { ArrowLeft, FileStack, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/tables/DataTable";
import type { ClientPaymentKind, CostSubmission } from "@/lib/operational/finance/types";
import { CLIENT_PAYMENT_KIND_LABELS, SUBMISSIONS_LIST_PAGE_SIZE } from "../constants";
import { useCostSubmissionsList } from "../hooks/useCostSubmissionsList";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import {
  SUBMISSION_LIFECYCLE_LABELS,
} from "../utils/submissionLifecycle";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";

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

const KIND_TABS: Array<{ id: ClientPaymentKind | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "payment_request", label: "Payment requests" },
  { id: "contract_instalment", label: "Contract instalments" },
  { id: "reimbursement_claim", label: "Reimbursement claims" },
];

/** FM Pending Payments register. `?kind=reimbursement_claim` is the direct Reimbursement claims view. */
export function SubmissionsPage() {
  const [includeHistory, setIncludeHistory] = useState(false);
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();
  const rawKind = searchParams.get("kind");
  const kind = KIND_TABS.some((tab) => tab.id === rawKind) ? (rawKind as ClientPaymentKind | "all") : "all";
  const claimsOnly = kind === "reimbursement_claim";
  const { can } = useOperatingAccess();
  const canCreateClaim = can("finance.create");
  const { submissions, total, totalPages, loading, error, reload } =
    useCostSubmissionsList({
      page,
      pageSize: SUBMISSIONS_LIST_PAGE_SIZE,
      kind,
      includeHistory,
    });

  const columns = useMemo<Column<CostSubmission>[]>(
    () => [
        {
        key: "submissionId",
        header: "Reference",
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
        key: "submissionKind",
        header: "Type",
        render: (row) => (
          <span className="text-muted">{CLIENT_PAYMENT_KIND_LABELS[row.submissionKind ?? "reimbursement_claim"]}</span>
        ),
      },
      {
        key: "description",
        header: "Request",
        render: (row) => (
          <span className="text-muted">
            {row.description ?? row.periodLabel ?? "—"}
            {row.submissionPackage?.reference ? ` · ${row.submissionPackage.reference}` : ""}
          </span>
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
        header: "Requested",
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
        <CostsClaimsNav />
        <div className="mb-4">
          <Link
            href="/finance"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Costs & Claims
          </Link>
        </div>

        {kind === "contract_instalment" ? <Link className="fin-v13-text-action mb-3 inline-block" href="/finance/monthly-payments">View recorded monthly contract receipts →</Link> : null}
        <label className="mb-3 flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={includeHistory} onChange={(e) => { setIncludeHistory(e.target.checked); setPage(1); }} />Include 2025 history</label>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <OperateHeader
            title={claimsOnly ? "Reimbursements" : kind === "contract_instalment" ? "Contract Payments" : "Pending Payments"}
            description={
              claimsOnly
                ? "Prepare and track reimbursement claims from operational costs."
                : "Amounts FM has requested from the client — payment requests, contract instalments and reimbursement claims."
            }
            signalValue={loading ? "—" : total}
            signalLabel={claimsOnly ? "Claims" : "Requests"}
          />
          {canCreateClaim && !claimsOnly ? (
            <Link className="fin-v13-btn-primary" href={`/finance/client-payments/new?kind=${kind === "contract_instalment" ? "contract_instalment" : "payment_request"}`}>
              <Plus className="h-4 w-4" /> {kind === "contract_instalment" ? "Record contract instalment" : "Raise payment request"}
            </Link>
          ) : null}
          {canCreateClaim && claimsOnly ? (
            <Link
              href="/finance/submissions/new"
              className="inline-flex h-8 items-center gap-2 rounded-[12px] bg-accent px-3 text-xs font-medium text-white shadow-sc hover:bg-[#1e40af]"
            >
              <Plus className="h-4 w-4" />
              Create claim
            </Link>
          ) : null}
        </div>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Pending payment type">
          {KIND_TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tab.id === "all" ? "/finance/submissions" : `/finance/submissions?kind=${tab.id}`}
              onClick={() => setPage(1)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                kind === tab.id ? "border-accent bg-accent text-white" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <StreamSurface className="mt-4">
          {error ? (
            <EmptyState
              icon={FileStack}
              title={claimsOnly ? "Unable to load claims" : "Unable to load pending payments"}
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
              emptyTitle={claimsOnly ? "No reimbursement claims recorded in SentraCore™ yet" : "No pending payments recorded yet"}
              emptyDescription={
                claimsOnly
                  ? "Create a claim to group reimbursable costs for reimbursement."
                  : "Payment requests, contract instalments and reimbursement claims appear here."
              }
            />
          )}
        </StreamSurface>
      </div>
    </ModeFrame>
  );
}
