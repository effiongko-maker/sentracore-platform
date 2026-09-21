"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { ConsumablesUpdateService } from "../services/ConsumablesUpdateService";
import type { ConsumablesRegisterEntry, RegisterQuantity } from "../types";

function FacilityLabel({ id }: { id: string }) {
  return <>{useFacilityName(id) || "—"}</>;
}

/**
 * A recorded quantity keeps ITS OWN unit; a missing one reads "Not recorded" (never 0). Nothing here is summed,
 * converted or reconciled across fields.
 */
export function formatRegisterQuantity(value: RegisterQuantity): string {
  if (value.quantity === null) return "Not recorded";
  return value.unit ? `${value.quantity} ${value.unit}` : String(value.quantity);
}

function QuantityCell({ value }: { value: RegisterQuantity }) {
  const missing = value.quantity === null;
  return (
    <span
      className={missing ? "text-muted" : "tabular-nums text-foreground"}
      title={value.raw ? `Register cell: ${value.raw}` : undefined}
    >
      {formatRegisterQuantity(value)}
    </span>
  );
}

const COLUMNS: Column<ConsumablesRegisterEntry>[] = [
  {
    key: "item",
    header: "Item",
    render: (entry) => (
      <div>
        <span className="font-medium text-foreground">{entry.itemName || "—"}</span>
        <p className="text-xs text-muted">{entry.itemCode}</p>
      </div>
    ),
  },
  { key: "facility", header: "Facility", render: (entry) => <FacilityLabel id={entry.facilityId} /> },
  { key: "opening", header: "Opening", render: (entry) => <QuantityCell value={entry.opening} /> },
  { key: "received", header: "Received", render: (entry) => <QuantityCell value={entry.received} /> },
  { key: "issued", header: "Issued", render: (entry) => <QuantityCell value={entry.issued} /> },
  { key: "closing", header: "Closing", render: (entry) => <QuantityCell value={entry.closing} /> },
  { key: "reorder", header: "Reorder level", render: (entry) => <QuantityCell value={entry.reorderLevel} /> },
  {
    key: "date",
    header: "Date",
    render: (entry) => <span className="text-muted">{entry.snapshotDate ?? "Not recorded"}</span>,
  },
];

type State =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; entries: ConsumablesRegisterEntry[] };

/**
 * Read-only historical register evidence, shown beneath the dated updates. It is explicitly NOT a stock ledger:
 * the source register has no transaction dates, closing is shown only where the register stated it, and units are
 * never reconciled across fields.
 */
export function ConsumablesRegisterEvidence() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    ConsumablesUpdateService.listRegisterEntries({ signal: controller.signal })
      .then((entries) => setState({ status: "ready", entries }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        void error;
        setState({ status: "unavailable" });
      });
    return () => controller.abort();
  }, []);

  // Nothing to show and nothing failed: the section stays out of the way.
  if (state.status === "ready" && state.entries.length === 0) return null;

  return (
    <section className="mt-8" aria-label="Historical consumables register">
      <div className="mb-3 flex items-start gap-2">
        <ClipboardList className="mt-0.5 h-4 w-4 text-muted" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Historical register</h2>
          <p className="text-xs text-muted">
            Imported from the consumables register. These entries are undated and are not stock transactions: no
            balance is calculated, each quantity keeps its recorded unit, and a blank cell means not recorded.
          </p>
        </div>
      </div>
      {state.status === "unavailable" ? (
        <p className="text-sm text-muted">The historical register is currently unavailable.</p>
      ) : (
        <DataTable
          columns={COLUMNS}
          data={state.status === "ready" ? state.entries : []}
          rowKey={(entry) => entry.id}
          loading={state.status === "loading"}
          emptyTitle="No register entries"
          emptyDescription="No historical register entries were imported."
        />
      )}
    </section>
  );
}
