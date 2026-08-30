import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackRequestPage } from "@/modules/occupant-requests/components/TrackRequestPage";

export const metadata: Metadata = {
  title: "Track Request",
};

export default function TrackOccupantRequestRoute() {
  return (
    <Suspense
      fallback={
        <div className="sr-shell-root">
          <p className="sr-state">Loading…</p>
        </div>
      }
    >
      <TrackRequestPage />
    </Suspense>
  );
}
