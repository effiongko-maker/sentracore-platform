"use client";

import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ArrowLeft, Fuel } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useDieselUsage } from "../hooks/useDieselUsage";
import type { DieselUsageModalState } from "../types";
import { DieselUsageService } from "../services/DieselUsageService";
import { DieselUsageFormModal } from "./DieselUsageFormModal";
import { DieselUsageTable } from "./DieselUsageTable";
import { DieselUsageToolbar } from "./DieselUsageToolbar";
import { ViewDieselUsageModal } from "./ViewDieselUsageModal";

export function DieselUsagePage() {
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
    generatorId,
    setGeneratorId,
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
  } = useDieselUsage();

  const [modal, setModal] = useState<DieselUsageModalState>({ type: "closed" });

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void DieselUsageService.getDieselUsage(openId)
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
        title="Diesel Usage"
        description="Daily generator diesel tank levels — opening, added, closing, and calculated consumption."
        territoryNote={`${loading ? "—" : total} entries in view`}
      />

      <DieselUsageToolbar
        search={search}
        onSearchChange={setSearch}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        generatorId={generatorId}
        onGeneratorIdChange={setGeneratorId}
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
          icon={Fuel}
          title="Couldn’t load diesel usage"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <DieselUsageTable
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

      <DieselUsageFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        entry={modal.type === "edit" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewDieselUsageModal
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
