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

export function WorkspaceSkeleton() {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-sc border border-border/70 bg-gradient-to-br from-white via-slate-50 to-accent-soft/40 px-6 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-2xl space-y-3">
          <Bone className="h-3 w-24" />
          <Bone className="h-10 w-80 max-w-full" />
          <Bone className="h-4 w-56" />
          <Bone className="mt-2 h-4 w-96 max-w-full" />
        </div>
      </section>

      <section className="space-y-3">
        <Bone className="h-4 w-32" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardShell key={i} className="flex items-center gap-3">
              <Bone className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bone className="h-4 w-28" />
                <Bone className="h-3 w-20" />
              </div>
            </CardShell>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Bone className="h-4 w-28" />
        <CardShell className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
            >
              <Bone className="h-8 w-8 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bone className="h-4 w-48 max-w-full" />
                <Bone className="h-3 w-32" />
              </div>
            </div>
          ))}
        </CardShell>
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <section key={i} className="space-y-3">
            <Bone className="h-4 w-36" />
            <CardShell className="space-y-3">
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="space-y-2 border-b border-border/60 pb-3 last:border-0">
                  <Bone className="h-4 w-40" />
                  <Bone className="h-3 w-56" />
                </div>
              ))}
            </CardShell>
          </section>
        ))}
      </div>
    </div>
  );
}
