"use client";

import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useConsumablesUpdates } from "../hooks/useConsumablesUpdates";
import type { ConsumablesUpdateModalState } from "../types";
import { ConsumablesUpdateService } from "../services/ConsumablesUpdateService";
import { ConsumablesUpdateFormModal } from "./ConsumablesUpdateFormModal";
import { ConsumablesUpdatesTable } from "./ConsumablesUpdatesTable";
import { ConsumablesUpdatesToolbar } from "./ConsumablesUpdatesToolbar";
import { ViewConsumablesUpdateModal } from "./ViewConsumablesUpdateModal";

export function ConsumablesUpdatesPage() {
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
    itemName,
    setItemName,
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
  } = useConsumablesUpdates();

  const [modal, setModal] = useState<ConsumablesUpdateModalState>({
    type: "closed",
  });

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void ConsumablesUpdateService.getConsumablesUpdate(openId)
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
        title="Consumables Update"
        description="Facility consumable stock — opening, received, issued, and calculated closing."
        territoryNote={`${loading ? "—" : total} updates in view`}
      />

      <ConsumablesUpdatesToolbar
        search={search}
        onSearchChange={setSearch}
        facilityId={facilityId}
        onFacilityIdChange={setFacilityId}
        itemName={itemName}
        onItemNameChange={setItemName}
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
          icon={Package}
          title="Couldn’t load consumables updates"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <ConsumablesUpdatesTable
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

      <ConsumablesUpdateFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        entry={modal.type === "edit" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewConsumablesUpdateModal
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
