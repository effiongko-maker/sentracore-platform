type FlowStage = {
  id: string;
  label: string;
};

const STAGES: FlowStage[] = [
  { id: "cost", label: "Operational costs" },
  { id: "submission", label: "Reimbursement" },
  { id: "authorisation", label: "Client authorisation" },
  { id: "payment", label: "Payment" },
];

export function FinanceFlowRail({
  authorisationCount,
  awaitingDecisionCount,
  costRecordedCount,
  costLive,
  submissionCount,
  submissionLive,
  paymentStatusSignal,
  loading,
}: {
  authorisationCount: number;
  awaitingDecisionCount: number;
  costRecordedCount: number;
  costLive: boolean;
  submissionCount: number;
  submissionLive: boolean;
  paymentStatusSignal: string;
  loading: boolean;
}) {
  return (
    <section className="fin-v13-status" aria-label="Financial status">
      <p className="fin-v13-status-note">
        Client authorisation is Work Order approval — not reimbursement authority
        on a CostSubmission.
      </p>
      <ul className="fin-v13-status-strip">
        {STAGES.map((stage) => {
          let signal = "—";
          if (!loading) {
            if (stage.id === "cost") {
              signal = costLive
                ? costRecordedCount > 0
                  ? `${costRecordedCount} recorded`
                  : "Ready"
                : "Not yet recorded";
            } else if (stage.id === "submission") {
              signal = submissionLive
                ? submissionCount > 0
                  ? `${submissionCount} submission${
                      submissionCount === 1 ? "" : "s"
                    }`
                  : "Ready"
                : "Not yet recorded";
            } else if (stage.id === "authorisation") {
              signal =
                awaitingDecisionCount > 0
                  ? `${awaitingDecisionCount} awaiting decision`
                  : authorisationCount > 0
                    ? `${authorisationCount} recorded`
                    : "None yet";
            } else if (stage.id === "payment") {
              signal = paymentStatusSignal || "Not yet recorded";
            }
          }

          return (
            <li key={stage.id} className="fin-v13-status-item">
              <span className="fin-v13-status-label">{stage.label}</span>
              <span className="fin-v13-status-value">{signal}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
