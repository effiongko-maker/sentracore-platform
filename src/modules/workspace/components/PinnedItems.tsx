"use client";

import { Pin } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export function PinnedItems() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Pinned</h2>
        <p className="mt-1 text-sm text-muted">
          Keep your most-used records one click away.
        </p>
      </div>
      <EmptyState
        icon={Pin}
        title="Nothing pinned yet"
        description="Pin your most-used facilities, assets and work orders for quick access."
      />
    </section>
  );
}
