type FlowStage = {
  id: string;
  label: string;
  title: string;
  detail: string;
  live: boolean;
};

const STAGES: FlowStage[] = [
  {
    id: "cost",
    label: "Cost",
    title: "Operational spend",
    detail: "What the operation actually spent.",
    live: false,
  },
  {
    id: "submission",
    label: "Submission",
    title: "Reimbursement requests",
    detail: "Amounts submitted for reimbursement or payment.",
    live: false,
  },
  {
    id: "authorisation",
    label: "Authorisation",
    title: "Client approvals",
    detail: "Permission to proceed with work before execution.",
    live: true,
  },
  {
    id: "payment",
    label: "Payment",
    title: "Money received",
    detail: "Funds recorded when payment is received.",
    live: false,
  },
];

export function FinanceFlowRail({
  authorisationCount,
  awaitingDecisionCount,
  loading,
}: {
  authorisationCount: number;
  awaitingDecisionCount: number;
  loading: boolean;
}) {
  return (
    <section aria-label="Operational financial flow">
      <div className="fin-flow">
        {STAGES.map((stage) => {
          const live = stage.live;
          let signal: string | undefined;
          if (live && !loading) {
            signal =
              awaitingDecisionCount > 0
                ? `${awaitingDecisionCount} awaiting client decision`
                : authorisationCount > 0
                  ? `${authorisationCount} authorisations in view`
                  : "No authorisations yet";
          }

          return (
            <article
              key={stage.id}
              className={
                live ? "fin-flow-stage fin-flow-stage--live" : "fin-flow-stage"
              }
            >
              <p className="fin-flow-label">{stage.label}</p>
              <h2 className="fin-flow-title">{stage.title}</h2>
              <p className="fin-flow-detail">{stage.detail}</p>
              <span
                className={
                  live
                    ? "fin-flow-badge fin-flow-badge--live"
                    : "fin-flow-badge fin-flow-badge--await"
                }
              >
                {live ? "Live" : "Not yet recorded"}
              </span>
              {signal ? (
                <p className="fin-flow-detail fin-flow-signal">{signal}</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
