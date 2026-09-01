import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { FinancePendingActionItem } from "../types";

const KIND_LABEL: Record<FinancePendingActionItem["kind"], string> = {
  client_authorisation_awaiting: "Client authorisation",
  client_authorisation_returned: "Client authorisation",
  client_authorisation_draft: "Client authorisation",
};

export function FinancePendingActionSection({
  items,
  loading,
}: {
  items: FinancePendingActionItem[];
  loading: boolean;
}) {
  return (
    <section className="fin-section-primary">
      <h2 className="fin-section-title">Pending action</h2>
      <p className="fin-section-lede">
        What needs attention now across client authorisation.
      </p>

      <div className="fin-action-panel">
        {loading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-[4.5rem] animate-pulse rounded-md bg-muted/20"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <Clock3 className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 text-sm font-medium text-foreground">
              Nothing needs action right now
            </p>
            <p className="mt-1 text-sm text-muted">
              Client authorisation items awaiting submission, decision, or
              clarification will appear here.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="fin-action-row">
              <div className="min-w-0">
                <p className="fin-action-kind">{KIND_LABEL[item.kind]}</p>
                <p className="fin-action-title">{item.title}</p>
                <p className="fin-action-meta">
                  <Link
                    href={`/work-orders?id=${encodeURIComponent(item.workOrderId)}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {item.workOrderId}
                  </Link>
                  {" · "}
                  {item.facilityId}
                </p>
              </div>

              <p className="fin-action-stage">{item.stageLabel}</p>
              <div className="flex items-center justify-end">
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                >
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
