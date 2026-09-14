"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bug,
  Clock,
  FileText,
  Fuel,
  Layers,
  Package,
  Recycle,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ModeFrame } from "@/components/platform";
import { cn } from "@/lib/utils";

type RegisterAccent =
  | "slate"
  | "emerald"
  | "amber"
  | "violet"
  | "green"
  | "rose"
  | "blue";

/** Registers exposed from this area. */
const REGISTERS: ReadonlyArray<{
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accent: RegisterAccent;
}> = [
  {
    label: "Generator Log",
    description:
      "Record generator runs, operating hours and diesel used.",
    href: "/generator-log",
    icon: Zap,
    accent: "slate",
  },
  {
    label: "Diesel Usage",
    description:
      "Track generator tank levels and calculated consumption.",
    href: "/diesel-usage",
    icon: Fuel,
    accent: "amber",
  },
  {
    label: "Consumables Update",
    description:
      "Record facility consumable stock — opening, received, issued, and closing.",
    href: "/consumables-update",
    icon: Package,
    accent: "violet",
  },
  {
    label: "Waste Log",
    description:
      "Track facility waste disposal — type, quantity, unit, and method.",
    href: "/waste-log",
    icon: Recycle,
    accent: "green",
  },
  {
    label: "Fumigation Log",
    description:
      "Record pest treatments — area, pest type, vendor, and next due date.",
    href: "/fumigation-log",
    icon: Bug,
    accent: "rose",
  },
  {
    label: "Deep Cleaning Log",
    description:
      "Record facility deep cleaning — area, vendor/team, status, and remarks.",
    href: "/deep-cleaning-log",
    icon: Sparkles,
    accent: "blue",
  },
];

const ACCENT_CLASS: Record<RegisterAccent, string> = {
  slate: "bg-slate-600 text-white",
  emerald: "bg-emerald-700 text-white",
  amber: "bg-amber-700 text-white",
  violet: "bg-violet-700 text-white",
  green: "bg-green-800 text-white",
  rose: "bg-rose-800 text-white",
  blue: "bg-blue-700 text-white",
};

function SummaryStat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-4 py-3 sm:px-5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500"
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        <p className="truncate text-[11px] font-medium text-muted">{label}</p>
      </div>
    </div>
  );
}

function RegisterCard({
  register,
  className,
}: {
  register: (typeof REGISTERS)[number];
  className?: string;
}) {
  const Icon = register.icon;

  return (
    <Link
      href={register.href}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-sc border border-border/80 bg-card shadow-sc transition-colors hover:border-border",
        className
      )}
    >
      <div className="flex flex-1 items-start gap-3.5 px-5 pt-5 pb-4">
        <span
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            ACCENT_CLASS[register.accent]
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {register.label}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {register.description}
          </p>
        </div>
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors group-hover:bg-slate-100 group-hover:text-slate-600"
          aria-hidden
        >
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
      </div>
      <div className="border-t border-border/70 px-5 py-3">
        <span className="text-xs font-medium text-muted">Open register</span>
      </div>
    </Link>
  );
}

export function OperationalRegistersPage() {
  const registerCount = REGISTERS.length;

  return (
    <ModeFrame mode="organise">
      <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-xl">
          <p className="os-statement-eyebrow">Facility Management</p>
          <h1 className="os-module-title">Operational Registers</h1>
          <p className="os-module-desc">
            Day-to-day facility records and operating controls.
          </p>
        </div>

        <div
          className="flex w-full shrink-0 divide-x divide-border/70 overflow-hidden rounded-sc border border-border/80 bg-card shadow-sc sm:w-auto"
          aria-label="Register summary"
        >
          <SummaryStat
            icon={Layers}
            value={registerCount}
            label="Registers"
          />
          <SummaryStat icon={FileText} value="—" label="Records today" />
          <SummaryStat icon={Clock} value="—" label="Last activity" />
        </div>
      </header>

      <section aria-label="Operational registers">
        <ul className="grid list-none gap-4 sm:grid-cols-2">
          {REGISTERS.map((register, index) => {
            const isLast = index === REGISTERS.length - 1;
            return (
              <li
                key={register.href}
                className={cn(isLast && "sm:col-span-2")}
              >
                <RegisterCard register={register} />
              </li>
            );
          })}
        </ul>
      </section>
    </ModeFrame>
  );
}
