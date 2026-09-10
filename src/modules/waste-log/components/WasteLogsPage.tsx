"use client";

import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ArrowLeft, Recycle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useWasteLogs } from "../hooks/useWasteLogs";
import type { WasteLogModalState } from "../types";
import { WasteLogService } from "../services/WasteLogService";
import { WasteLogFormModal } from "./WasteLogFormModal";
import { WasteLogsTable } from "./WasteLogsTable";
import { WasteLogsToolbar } from "./WasteLogsToolbar";
import { ViewWasteLogModal } from "./ViewWasteLogModal";

export function WasteLogsPage() {
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
    wasteType,
    setWasteType,
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
  } = useWasteLogs();

  const [modal, setModal] = useState<WasteLogModalState>({ type: "closed" });

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void WasteLogService.getWasteLog(openId)
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
        title="Waste Log"
        description="Facility waste disposal register — type, quantity, unit, and disposal method."
        territoryNote={`${loading ? "—" : total} entries in view`}
      />

      <WasteLogsToolbar
        search={search}
        onSearchChange={setSearch}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        wasteType={wasteType}
        onWasteTypeChange={setWasteType}
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
          icon={Recycle}
          title="Couldn’t load waste logs"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <WasteLogsTable
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

      <WasteLogFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        entry={modal.type === "edit" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewWasteLogModal
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
