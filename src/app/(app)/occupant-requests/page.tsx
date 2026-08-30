import type { Metadata } from "next";
import { Suspense } from "react";
import { OccupantRequestPage } from "@/modules/occupant-requests";

export const metadata: Metadata = {
  title: "Submit Request",
};

export default function OccupantRequestsRoute() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-200/80" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-40 animate-pulse rounded-sc bg-slate-100/80" />
            <div className="h-40 animate-pulse rounded-sc bg-slate-100/80" />
          </div>
        </div>
      }
    >
      <OccupantRequestPage />
    </Suspense>
  );
}
