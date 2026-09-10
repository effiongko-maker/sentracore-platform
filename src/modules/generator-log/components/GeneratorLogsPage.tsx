"use client";

import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ArrowLeft, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useGeneratorLogs } from "../hooks/useGeneratorLogs";
import type { GeneratorLogModalState } from "../types";
import { GeneratorLogService } from "../services/GeneratorLogService";
import { GeneratorLogFormModal } from "./GeneratorLogFormModal";
import { GeneratorLogsTable } from "./GeneratorLogsTable";
import { GeneratorLogsToolbar } from "./GeneratorLogsToolbar";
import { ViewGeneratorLogModal } from "./ViewGeneratorLogModal";

export function GeneratorLogsPage() {
  const { can } = useOperatingAccess();
  const canCreateOps = can("ops.create");
  const canMutateOps = can("ops.edit");
  const openId = useQueryRecordId();
  const {
    entries,
    loading,
    error,
    search,
    setSearch,
    generator,
    setGenerator,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
  } = useGeneratorLogs();

  const [modal, setModal] = useState<GeneratorLogModalState>({ type: "closed" });

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void GeneratorLogService.getGeneratorLog(openId)
      .then((entry) => {
        if (!cancelled && entry) setModal({ type: "view", entry });
      })
      .catch(() => {
        /* leave list as-is if record cannot be loaded */
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  return (
    <ModeFrame mode="organise">
      <div className="mb-4">
        <Link
          href="/operational-registers"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Operational Registers
        </Link>
      </div>
      <ExploreHeader
        title="Generator Log"
        description="Recorded generator runs — date, runtime, diesel, and remarks."
        territoryNote={`${loading ? "—" : total} logs in view`}
      />

      <GeneratorLogsToolbar
        search={search}
        onSearchChange={setSearch}
        generator={generator}
        onGeneratorChange={setGenerator}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        sort={sort}
        onSortChange={setSort}
        total={total}
        loading={loading}
        onClearAll={clearAll}
        onCreate={() => setModal({ type: "create" })}
        canCreate={canCreateOps}
      />

      {error ? (
        <EmptyState
          icon={Zap}
          title="Couldn’t load generator logs"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <GeneratorLogsTable
            canMutate={canMutateOps}
            entries={entries}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(entry) => setModal({ type: "view", entry })}
            onEdit={(entry) => setModal({ type: "edit", entry })}
          />
        </StreamSurface>
      )}

      <GeneratorLogFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        entry={modal.type === "edit" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewGeneratorLogModal
        open={modal.type === "view"}
        entry={modal.type === "view" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={
          canMutateOps
            ? (entry) => setModal({ type: "edit", entry })
            : undefined
        }
      />
    </ModeFrame>
  );
}
