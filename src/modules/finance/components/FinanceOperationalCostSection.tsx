import type { FinanceOperationalCostLens } from "../types";

export function FinanceOperationalCostSection({
  lenses,
  loading,
}: {
  lenses: FinanceOperationalCostLens[];
  loading: boolean;
}) {
  return (
    <section className="fin-quiet-panel">
      <h2 className="fin-section-title">Operational cost analysis</h2>
      <p className="fin-section-lede">
        Where operational money is going — by facility, department, category,
        work, and execution instrument. No cost records have been captured yet.
      </p>

      {loading ? (
        <div className="fin-lens-grid mt-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="fin-lens h-16 animate-pulse bg-muted/15" />
          ))}
        </div>
      ) : (
        <div className="fin-lens-grid mt-4">
          {lenses.map((lens) => (
            <div key={lens.id} className="fin-lens">
              <p className="fin-lens-label">{lens.label}</p>
              <p className="fin-lens-note">No cost records yet</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
