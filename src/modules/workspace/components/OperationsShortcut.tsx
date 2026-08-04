"use client";

import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function OperationsShortcut() {
  return (
    <section>
      <Link href="/dashboards" className="group block">
        <Card className="overflow-hidden border-primary/10 bg-primary px-6 py-7 text-white shadow-sc-lg transition-transform duration-200 hover:-translate-y-0.5 sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/65">
                  Command center
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  View Operational Dashboard
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
                  Review live KPIs, attention queues, and estate health across
                  facilities, assets, and work in motion.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 self-start rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors group-hover:bg-white/15">
              Open dashboard
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Card>
      </Link>
    </section>
  );
}
