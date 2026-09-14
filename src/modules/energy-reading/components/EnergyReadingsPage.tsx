"use client";

import { ArrowLeft, Gauge } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ExploreHeader,
  ModeFrame,
  StreamSurface,
} from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useEnergyReadings } from "../hooks/useEnergyReadings";
import type { EnergyReadingModalState } from "../types";
import { EnergyReadingService } from "../services/EnergyReadingService";
import { EnergyReadingFormModal } from "./EnergyReadingFormModal";
import { EnergyReadingsTable } from "./EnergyReadingsTable";
import { EnergyReadingsToolbar } from "./EnergyReadingsToolbar";
import { ViewEnergyReadingModal } from "./ViewEnergyReadingModal";

export function EnergyReadingsPage() {
  const openId = useQueryRecordId();
  const {
    entries,
    loading,
    error,
    search,
    setSearch,
    meter,
    setMeter,
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
  } = useEnergyReadings();

  const [modal, setModal] = useState<EnergyReadingModalState>({ type: "closed" });

  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void EnergyReadingService.getEnergyReading(openId)
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
        title="Energy Reading"
        description="AEDC meter readings are not a Facility Management operational responsibility. This register is retained for historical/compatibility access only and is not an FM capture workflow."
        territoryNote={`${loading ? "—" : total} readings in view`}
      />

      <EnergyReadingsToolbar
        search={search}
        onSearchChange={setSearch}
        meter={meter}
        onMeterChange={setMeter}
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
        canCreate={false}
      />

      {error ? (
        <EmptyState
          icon={Gauge}
          title="Couldn’t load energy readings"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      ) : (
        <StreamSurface>
          <EnergyReadingsTable
            canMutate={false}
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

      <EnergyReadingFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        entry={modal.type === "edit" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={async () => {
          await reloadFirstPage();
        }}
      />

      <ViewEnergyReadingModal
        open={modal.type === "view"}
        entry={modal.type === "view" ? modal.entry : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={undefined}
      />
    </ModeFrame>
  );
}
