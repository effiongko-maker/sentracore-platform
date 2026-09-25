"use client";

import { CostsClaimsNav } from "./CostsClaimsNav";

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
import { useFacilityName } from "@/hooks/useEntityLabel";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { COST_REIMBURSABILITY_LABELS } from "../constants";
import { FM_2025_HISTORY_NOTE, FM_ORDER_REGISTER_VALUE_NOTE } from "@/lib/fm/sourceRegisterScope";

type CostRegisterView = "costs" | "order_values";

const COST_RECORDS_PAGE_SIZE = 25;

function formatRecordedAt(iso?: string): string {
  if (!iso) return "Not recorded";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function FacilityLocationCell({ record }: { record: CostRecord }) {
  const name = useFacilityName(record.facilityId);
  const facilityLabel = name || record.facilityId ? name || "Unknown facility" : "Not recorded";
  return (
    <span className="text-muted">
      {/* Facility identity is known authoritatively; only finer-grained location may be absent — never append
          a "Location not recorded" suffix onto a known facility. */}
      {facilityLabel}
      {record.location ? ` · ${record.location}` : ""}
    </span>
  );
}

export function CostRecordsPage({ initialView = "costs" }: { initialView?: CostRegisterView } = {}) {
  // The source-register view is a subset of Costs, not a separate financial total.
  const [view, setView] = useState<CostRegisterView>(initialView);
  const [includeHistory, setIncludeHistory] = useState(false);
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
        valueScope: view,
        includeHistory,
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
  }, [view, includeHistory]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(page), 0);
    return () => window.clearTimeout(timer);
  }, [load, page]);

  const columns = useMemo<Column<CostRecord>[]>(
    () => [
      {
        key: "recordedAt",
        header: "Date",
        render: (record) => {
          // recordedAt ("Cost") is always preferred when it exists. A migrated_historical row with no
          // authoritative FM cost date falls back to its CERTAIN-linked commercial fact's payment_datetime
          // ("Payment") only when one exists — never relabelled as a Cost date, never copied into
          // fm_cost_records. Neither exists: a quiet dash, not repeated "Not recorded" noise.
          if (record.recordedAt) {
            return (
              <span className="text-muted">
                {formatRecordedAt(record.recordedAt)} · Cost
              </span>
            );
          }
          if (record.compactDate) {
            return (
              <span className="text-muted">
                {formatRecordedAt(record.compactDate.value)} · {record.compactDate.label}
              </span>
            );
          }
          return <span className="text-muted">—</span>;
        },
      },
      {
        key: "description",
        header: "Cost",
        render: (record) => (
          <div>
            <p className="font-medium text-foreground">{record.description}</p>
            <p className="text-xs text-muted">
              {record.costId}
              {record.valueKind === "order_value"
                ? <span> · {record.sourceRegister ?? "Order register"} · Execution cost</span>
                : record.recordOrigin === "migrated_historical" ? <span> · Imported record</span> : null}
            </p>
          </div>
        ),
      },
      {
        key: "facilityId",
        header: "Facility / location",
        render: (record) => <FacilityLocationCell record={record} />,
      },
      {
        key: "category",
        header: "Category",
        render: (record) => (
          <span className="text-muted">
            {record.category && (record.category as string) !== "unknown"
              ? COST_CATEGORY_LABELS[record.category as CostCategory]
              : record.recordOrigin === "migrated_historical"
                ? "Not recorded historically"
                : "Not recorded"}
          </span>
        ),
      },
      {
        key: "actualAmount",
        header: view === "order_values" ? "Execution cost" : "Actual amount",
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
            <span className="text-muted">{record.evidence.reference ?? "Not recorded"}</span>
          ),
      },
      {
        key: "reimbursability",
        header: "Reimbursement",
        render: (record) => (
          <span className="text-muted">
            {record.reimbursability === "unknown" && record.recordOrigin === "migrated_historical"
              ? "Not recorded historically"
              : COST_REIMBURSABILITY_LABELS[record.reimbursability]}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        className: "w-24 text-right",
        render: (record) => (
          <Link
            href={`/finance/costs/${encodeURIComponent(record.costId)}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Open →
          </Link>
        ),
      },
    ],
    [view]
  );

  return (
    <ModeFrame mode="act">
      <div className="mb-4">
        <Link
          href="/finance"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Costs & Claims
        </Link>
      </div>
      <CostsClaimsNav />
      <OperateHeader
        title={view === "order_values" ? "WO/JO execution costs" : "Cost records"}
        description={
          view === "order_values"
            ? FM_ORDER_REGISTER_VALUE_NOTE
            : "Every recorded operational cost, including its receipt or invoice when one was uploaded."
        }
        signalValue={loading ? "—" : total}
        signalLabel={view === "order_values" ? "Orders" : "Recorded"}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm" role="group" aria-label="Register view">
        {(["costs", "order_values"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => {
              setView(option);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 font-medium ${view === option ? "border-primary bg-primary text-white" : "border-border text-muted hover:text-foreground"}`}
          >
            {option === "costs" ? "Costs" : "WO/JO execution costs"}
          </button>
        ))}
        {(
          <label className="inline-flex items-center gap-2 text-muted" title={FM_2025_HISTORY_NOTE}>
            <input
              type="checkbox"
              checked={includeHistory}
              onChange={(event) => {
                setIncludeHistory(event.target.checked);
                setPage(1);
              }}
            />
            Include 2025 history
          </label>
        )}
      </div>
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
            emptyTitle={view === "order_values" ? "No WO/JO execution costs in this view" : "No costs recorded in SentraCore™ yet"}
            emptyDescription={
              view === "order_values"
                ? FM_2025_HISTORY_NOTE
                : "Record a cost from the Costs & Claims overview when an execution cost is incurred. WO/JO execution costs are included here, with their source provenance."
            }
          />
        )}
      </StreamSurface>
    </ModeFrame>
  );
}
