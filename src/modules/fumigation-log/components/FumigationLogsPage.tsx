"use client";

import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ArrowLeft, Bug } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useFumigationLogs } from "../hooks/useFumigationLogs";
import type { FumigationLogModalState } from "../types";
import { FumigationLogService } from "../services/FumigationLogService";
import { FumigationLogFormModal } from "./FumigationLogFormModal";
import { FumigationLogsTable } from "./FumigationLogsTable";
import { FumigationLogsToolbar } from "./FumigationLogsToolbar";
import { ViewFumigationLogModal } from "./ViewFumigationLogModal";

export function FumigationLogsPage() {
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
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    nextDueFrom,
    setNextDueFrom,
    nextDueTo,
    setNextDueTo,
    sort,
    setSort,
    clearAll,
    page,
    setPage,
    totalPages,
    total,
    reload,
    reloadFirstPage,
  } = useFumigationLogs();

  const [modal, setModal] = useState<FumigationLogModalState>({
    type: "closed",
  });

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void FumigationLogService.getFumigationLog(openId)
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
        title="Fumigation Log"
        description="Facility pest treatments — area, pest type, vendor, and next due date."
        territoryNote={`${loading ? "—" : total} entries in view`}
      />

      <FumigationLogsToolbar
        search={search}
        onSearchChange={setSearch}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        nextDueFrom={nextDueFrom}
        onNextDueFromChange={setNextDueFrom}
        nextDueTo={nextDueTo}
        onNextDueToChange={setNextDueTo}
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
          icon={Bug}
          title="Couldn’t load fumigation logs"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <FumigationLogsTable
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

      <FumigationLogFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        entry={modal.type === "edit" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewFumigationLogModal
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
