"use client";

import type { AdminFinanceAccess } from "../types";

/** Read-only summary of Platform Finance access — counts first, keys on disclosure. */
export function FinanceAccess({ access }: { access: AdminFinanceAccess }) {
  const none = access.capabilities.length === 0 && access.companies.length === 0 && access.financialAccountAccessCount === 0;
  if (none) return <span className="ac-secondary">No Platform Finance access.</span>;
  return (
    <dl className="ac-kv" style={{ marginTop: 4 }}>
      <dt>Capabilities</dt>
      <dd>
        <span className="ac-num">{access.capabilities.length}</span>
        {access.capabilities.length > 0 ? (
          <details style={{ marginTop: 4 }}>
            <summary className="ac-secondary" style={{ cursor: "pointer" }}>Show capability keys</summary>
            <ul className="ac-feed-detail" style={{ marginTop: 6, fontFamily: "var(--font-mono, monospace)" }}>
              {access.capabilities.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </dd>
      <dt>Companies</dt>
      <dd>{access.companies.length ? access.companies.join(", ") : "—"}</dd>
      <dt>Financial accounts</dt>
      <dd className="ac-num">{access.financialAccountAccessCount}</dd>
    </dl>
  );
}
