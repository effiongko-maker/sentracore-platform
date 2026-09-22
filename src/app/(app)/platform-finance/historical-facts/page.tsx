import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformFinanceHistoricalFactsPage } from "@/modules/platform-finance/components/PlatformFinanceHistoricalFactsPage";

export const metadata: Metadata = { title: "Historical Commercial Facts" };

export default function PlatformFinanceHistoricalFactsRoute() {
  return (
    <Suspense
      fallback={
        <div className="pf-requests">
          <p className="pf-state-message">Loading Historical Commercial Facts…</p>
        </div>
      }
    >
      <PlatformFinanceHistoricalFactsPage />
    </Suspense>
  );
}
