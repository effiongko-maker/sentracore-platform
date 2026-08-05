import type { ReactNode } from "react";

function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/80 motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}

function CardShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sc border border-border/80 bg-card p-5 shadow-sc ${className}`}
    >
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Banner */}
      <section className="relative overflow-hidden rounded-sc border border-border/70 bg-gradient-to-br from-white via-slate-50 to-accent-soft/40 px-6 py-8 sm:px-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-2xl space-y-3">
          <Bone className="h-3 w-24" />
          <Bone className="h-9 w-72 max-w-full" />
          <Bone className="h-4 w-56 max-w-full" />
          <Bone className="mt-2 h-4 w-96 max-w-full" />
        </div>
      </section>

      {/* Health summary */}
      <section className="max-w-xl space-y-3">
        <Bone className="h-4 w-36" />
        <CardShell>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Bone className="h-3 w-28" />
              <Bone className="h-8 w-24" />
              <Bone className="h-4 w-48" />
            </div>
            <Bone className="h-12 w-12 rounded-xl" />
          </div>
        </CardShell>
      </section>

      {/* KPI cards */}
      <section className="space-y-3">
        <div className="space-y-1.5">
          <Bone className="h-4 w-32" />
          <Bone className="h-3 w-52" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardShell key={i}>
              <div className="flex items-start justify-between gap-3">
                <Bone className="h-4 w-28" />
                <Bone className="h-8 w-8 rounded-xl" />
              </div>
              <Bone className="mt-4 h-9 w-16" />
              <Bone className="mt-3 h-3 w-36" />
            </CardShell>
          ))}
        </div>
      </section>

      {/* Lists */}
      <section className="space-y-3">
        <div className="space-y-1.5">
          <Bone className="h-4 w-40" />
          <Bone className="h-3 w-64" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <CardShell key={i} className="space-y-3">
              <Bone className="h-4 w-40" />
              <Bone className="h-3 w-56" />
              <div className="space-y-2 pt-1">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div
                    key={j}
                    className="flex items-start gap-3 rounded-sc-sm border border-border/70 px-3.5 py-3"
                  >
                    <Bone className="mt-0.5 h-8 w-8 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Bone className="h-4 w-3/4 max-w-[220px]" />
                      <Bone className="h-3 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            </CardShell>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section className="space-y-3">
        <div className="space-y-1.5">
          <Bone className="h-4 w-32" />
          <Bone className="h-3 w-48" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardShell key={i} className="flex items-center gap-3 py-4">
              <Bone className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bone className="h-4 w-28" />
                <Bone className="h-3 w-20" />
              </div>
            </CardShell>
          ))}
        </div>
      </section>
    </div>
  );
}
