"use client";

import Link from "next/link";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/tables/DataTable";
import {
  COST_CATEGORY_LABELS,
  type CostCategory,
  type CostRecord,
} from "@/lib/operational/finance";
import { CostRecordService } from "@/services/finance/CostRecordService";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { COST_REIMBURSABILITY_LABELS } from "../constants";

const COST_RECORDS_PAGE_SIZE = 25;

function formatRecordedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CostRecordsPage() {
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const requestId = useRef(0);

  const load = useCallback(async (nextPage: number) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await CostRecordService.listCostRecords({
        page: nextPage,
        pageSize: COST_RECORDS_PAGE_SIZE,
      });
      if (id !== requestId.current) return;
      setRecords(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      if (nextPage > result.totalPages) setPage(result.totalPages);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : "Unable to load cost records.");
      setRecords([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const columns = useMemo<Column<CostRecord>[]>(
    () => [
      {
        key: "recordedAt",
        header: "Date",
        render: (record) => <span className="text-muted">{formatRecordedAt(record.recordedAt)}</span>,
      },
      {
        key: "description",
        header: "Cost",
        render: (record) => (
          <div>
            <p className="font-medium text-foreground">{record.description}</p>
            <p className="text-xs text-muted">{record.costId}</p>
          </div>
        ),
      },
      {
        key: "facilityId",
        header: "Facility / location",
        render: (record) => (
          <span className="text-muted">
            {record.facilityId} · {record.location}
          </span>
        ),
      },
      {
        key: "category",
        header: "Category",
        render: (record) => (
          <span className="text-muted">
            {COST_CATEGORY_LABELS[record.category as CostCategory]}
          </span>
        ),
      },
      {
        key: "actualAmount",
        header: "Actual amount",
        render: (record) => (
          <span className="font-medium text-foreground">
            {formatFinancialAmount(record.actualAmount, record.currency)}
          </span>
        ),
      },
      {
        key: "evidence",
        header: "Evidence",
        render: (record) =>
          record.evidence.fileUrl ? (
            <a
              href={record.evidence.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {record.evidence.fileName ?? "Open receipt"}
            </a>
          ) : (
            <span className="text-muted">{record.evidence.reference}</span>
          ),
      },
      {
        key: "reimbursability",
        header: "Reimbursement",
        render: (record) => (
          <span className="text-muted">
            {COST_REIMBURSABILITY_LABELS[record.reimbursability]}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <ModeFrame mode="act">
      <div className="mb-4">
        <Link
          href="/finance"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Finance
        </Link>
      </div>
      <OperateHeader
        title="Cost records"
        description="Every recorded operational cost, including its receipt or invoice when one was uploaded."
        signalValue={loading ? "—" : total}
        signalLabel="Recorded"
      />
      <StreamSurface className="mt-4">
        {error ? (
          <EmptyState
            icon={ReceiptText}
            title="Unable to load cost records"
            description={error}
            actionLabel="Try again"
            onAction={() => void load(page)}
          />
        ) : (
          <DataTable
            columns={columns}
            data={records}
            rowKey={(record) => record.costId}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            emptyIcon={ReceiptText}
            emptyTitle="No cost records yet"
            emptyDescription="Record a cost from the Finance overview when an operational expense is incurred."
          />
        )}
      </StreamSurface>
    </ModeFrame>
  );
}
