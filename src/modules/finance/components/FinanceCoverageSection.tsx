export function FinanceCoverageSection({
  operationalCostsStatus,
  reimbursementsStatus,
  clientAuthorisationsStatus,
  paymentsStatus,
}: {
  operationalCostsStatus: string;
  reimbursementsStatus: string;
  clientAuthorisationsStatus: string;
  paymentsStatus: string;
}) {
  const rows = [
    { label: "Operational costs", status: operationalCostsStatus },
    { label: "Reimbursement submissions", status: reimbursementsStatus },
    { label: "Client authorisations", status: clientAuthorisationsStatus },
    { label: "Payments", status: paymentsStatus },
  ];

  return (
    <section className="fin-v13-coverage" aria-label="Financial coverage">
      <h2 className="fin-v13-metric-label">Coverage</h2>
      <ul className="fin-v13-coverage-list">
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span className="fin-v13-coverage-rule" aria-hidden="true" />
            <span className="fin-v13-muted">{row.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
