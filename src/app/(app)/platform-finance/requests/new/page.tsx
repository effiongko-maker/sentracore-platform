import type { Metadata } from "next";
import { Suspense } from "react";
import { PlatformFinanceNewRequestPage } from "@/modules/platform-finance/components/PlatformFinanceNewRequestPage";

export const metadata: Metadata = {
  title: "New Financial Request",
};

export default function PlatformFinanceNewRequestRoute() {
  return (
    <Suspense
      fallback={
        <div className="pf-new-request">
          <p className="pf-state-message">Loading New Financial Request…</p>
        </div>
      }
    >
      <PlatformFinanceNewRequestPage />
    </Suspense>
  );
}
