import Link from "next/link";
import type { FinancePositionMetric } from "../types";

export function FinancePositionSection({
  metrics,
  loading,
  totalAuthorisations,
  awaitingDecisionCount,
}: {
  metrics: FinancePositionMetric[];
  loading: boolean;
  totalAuthorisations: number;
  awaitingDecisionCount: number;
}) {
  const payment = metrics.find((m) => m.id === "payment");

  return (
    <section className="fin-v13-auth">
      <div className="fin-v13-auth-row">
        <div className="fin-v13-auth-stats">
          <span>
            <strong>Client authorisation</strong>{" "}
            <span className="fin-v13-muted">
              {loading ? "—" : `${totalAuthorisations} recorded`}
            </span>
          </span>
          <span className="fin-v13-dot" aria-hidden="true">
            ·
          </span>
          <span className="fin-v13-muted">
            Awaiting decision {loading ? "—" : awaitingDecisionCount}
          </span>
          <span className="fin-v13-dot" aria-hidden="true">
            ·
          </span>
          <span className="fin-v13-muted">
            Payment {payment?.detail ?? "Not yet recorded"}
          </span>
        </div>
        <Link href="/approvals" className="fin-v13-text-action">
          Open authorisations →
        </Link>
      </div>
      <p className="fin-v13-auth-note">
        Work Order client approval — not reimbursement approval of a
        CostSubmission.
      </p>
    </section>
  );
}
