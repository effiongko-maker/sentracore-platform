"use client";

import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useDeepCleaningLogs } from "../hooks/useDeepCleaningLogs";
import type { DeepCleaningLogModalState } from "../types";
import { DeepCleaningLogService } from "../services/DeepCleaningLogService";
import { DeepCleaningLogFormModal } from "./DeepCleaningLogFormModal";
import { DeepCleaningLogsTable } from "./DeepCleaningLogsTable";
import { DeepCleaningLogsToolbar } from "./DeepCleaningLogsToolbar";
import { ViewDeepCleaningLogModal } from "./ViewDeepCleaningLogModal";

export function DeepCleaningLogsPage() {
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
    facilityId,
    setFacilityId,
    status,
    setStatus,
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
  } = useDeepCleaningLogs();

  const [modal, setModal] = useState<DeepCleaningLogModalState>({
    type: "closed",
  });

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void DeepCleaningLogService.getDeepCleaningLog(openId)
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
        title="Deep Cleaning Log"
        description="Facility deep cleaning activity — area, vendor/team, status, and remarks."
        territoryNote={`${loading ? "—" : total} entries in view`}
      />

      <DeepCleaningLogsToolbar
        search={search}
        onSearchChange={setSearch}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        status={status}
        onStatusChange={setStatus}
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
          icon={Sparkles}
          title="Couldn’t load deep cleaning logs"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <DeepCleaningLogsTable
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

      <DeepCleaningLogFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        entry={modal.type === "edit" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewDeepCleaningLogModal
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
