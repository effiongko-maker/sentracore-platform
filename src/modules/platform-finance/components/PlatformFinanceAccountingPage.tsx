"use client";

import Link from "next/link";
import { BookOpen, CalendarRange } from "lucide-react";

/**
 * Accounting hub — Slice 1 surfaces only (COA + Periods).
 * No fake balances or statement cards.
 */
export function PlatformFinanceAccountingPage() {
  return (
    <div className="pf-accounting-hub">
      <p className="pf-accounting-hub-lead">
        Manage the shared organisation chart of accounts, company accounting
        periods, and the posted journal — the accounting source of truth.
      </p>

      <div className="pf-accounting-hub-grid">
        <Link
          href="/platform-finance/accounting/journal"
          className="pf-accounting-hub-card"
        >
          <span className="pf-accounting-hub-icon" aria-hidden>
            <BookOpen size={20} />
          </span>
          <div>
            <strong>Journal</strong>
            <p>
              Posted journal entries — the accounting source of truth for each
              company book.
            </p>
          </div>
        </Link>
        <Link
          href="/platform-finance/accounting/chart-of-accounts"
          className="pf-accounting-hub-card"
        >
          <span className="pf-accounting-hub-icon" aria-hidden>
            <BookOpen size={20} />
          </span>
          <div>
            <strong>Chart of Accounts</strong>
            <p>Organisation-scoped account register. Shared across companies.</p>
          </div>
        </Link>
        <Link
          href="/platform-finance/accounting/periods"
          className="pf-accounting-hub-card"
        >
          <span className="pf-accounting-hub-icon" aria-hidden>
            <CalendarRange size={20} />
          </span>
          <div>
            <strong>Periods</strong>
            <p>
              Company monthly calendars. Open periods accept posting; closed
              periods do not.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
