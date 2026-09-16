"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Accounting chrome: hub title on the root only.
 * Navigation lives in the Finance sidebar — no in-content subnav.
 */
export function PlatformFinanceAccountingShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isHub = pathname === "/platform-finance/accounting";

  return (
    <div className="pf-accounting">
      {isHub ? (
        <header className="pf-accounting-header">
          <div>
            <p className="pf-ov-eyebrow">Platform Finance</p>
            <h1 className="pf-accounting-title">Accounting</h1>
            <p className="pf-accounting-desc">
              Organisation chart of accounts, company periods, and the journal
              of posted accounting activity.
            </p>
          </div>
        </header>
      ) : null}

      <div className="pf-accounting-body">{children}</div>
    </div>
  );
}
