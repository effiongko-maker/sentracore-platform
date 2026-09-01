"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  Package,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { WorkspaceQuickAction } from "../types";

const icons: Record<WorkspaceQuickAction["icon"], LucideIcon> = {
  issue: ClipboardList,
  incident: AlertTriangle,
  maintenance: Wrench,
  workOrder: ClipboardList,
  asset: Package,
  facility: Building2,
  dashboard: BarChart3,
};

const accent: Record<WorkspaceQuickAction["icon"], string> = {
  issue: "bg-accent-soft text-accent",
  incident: "bg-red-50 text-danger",
  maintenance: "bg-amber-50 text-amber-700",
  workOrder: "bg-sky-50 text-sky-700",
  asset: "bg-emerald-50 text-emerald-700",
  facility: "bg-violet-50 text-violet-700",
  dashboard: "bg-accent-soft text-accent",
};

export function QuickActions({ actions }: { actions: WorkspaceQuickAction[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Quick actions</h2>
        <p className="mt-1 text-sm text-muted">
          Start the work that matters most right now.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = icons[action.icon];
          return (
            <Link key={action.id} href={action.href} className="group block h-full">
              <Card className="h-full p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-sc-lg">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${accent[action.icon]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold tracking-tight text-foreground group-hover:text-primary">
                      {action.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {action.description}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
