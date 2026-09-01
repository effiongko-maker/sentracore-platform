export function FinanceSubmissionsSection() {
  return (
    <section>
      <h2 className="fin-section-title">Reimbursement &amp; submissions</h2>
      <p className="fin-section-lede">
        The path from operational cost to reimbursement and payment. This area
        is not yet live — it is separate from client authorisation to proceed
        with work.
      </p>

      <div className="fin-quiet-panel mt-4">
        <p className="fin-action-title">No reimbursement submissions recorded yet</p>
        <p className="fin-section-lede" style={{ marginTop: "0.5rem" }}>
          Once operational costs and reimbursement submissions are captured,
          SentraCore will track progress through submission, processing, and
          payment received.
        </p>
        <ul className="fin-pipeline-list">
          <li>Awaiting submission</li>
          <li>Submitted</li>
          <li>Awaiting processing</li>
          <li>Approved / awaiting payment</li>
          <li>Paid</li>
        </ul>
      </div>
    </section>
  );
}
