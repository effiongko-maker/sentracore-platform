"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import type { WorkspaceWorkSummary } from "../types";

export function MyWork({ items }: { items: WorkspaceWorkSummary[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">My work</h2>
        <p className="mt-1 text-sm text-muted">Your personal workload for today.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link key={item.id} href={item.href} className="block">
            <Card className="h-full transition-shadow hover:shadow-sc-lg">
              <CardContent className="py-5">
                <p className="text-sm font-medium text-muted">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                  {item.count}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {item.count === 0 ? item.emptyLabel : "Needs your attention"}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
