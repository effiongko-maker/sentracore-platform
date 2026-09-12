"use client";

/**
 * ECC Finance — workspace route shell.
 * Navigation and IA only for now; finance product surfaces land here later.
 * Must not share Facility Management `/finance` or platform `/workspaces/finance`.
 */
export function EccFinancePage() {
  return (
    <div className="ecc-finance">
      <header className="ecc-page-header">
        <div className="ecc-page-header-copy">
          <h1 className="ecc-page-title">Finance</h1>
          <p className="ecc-page-desc">
            ECC finance within the ECC Operations workspace. Operational finance
            capability for this centre will be built here.
          </p>
        </div>
      </header>
    </div>
  );
}
