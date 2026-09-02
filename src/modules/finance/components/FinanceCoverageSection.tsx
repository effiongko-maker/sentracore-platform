export function FinanceCoverageSection({
  operationalCostsStatus = "Not yet recorded",
}: {
  operationalCostsStatus?: string;
}) {
  const rows = [
    { label: "Operational costs", status: operationalCostsStatus },
    { label: "Reimbursements", status: "Not yet recorded" },
    { label: "Payments received", status: "Not yet recorded" },
  ];

  return (
    <section className="fin-coverage">
      <h2 className="fin-metric-kicker">Financial coverage</h2>
      <ul className="fin-coverage-list">
        {rows.map((row) => (
          <li key={row.label} className="fin-coverage-row">
            <span className="fin-coverage-label">{row.label}</span>
            <span className="fin-coverage-status">{row.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
