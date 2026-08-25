/**
 * Skeleton matching the redesigned Dashboard composition
 * (health hero → attention → metrics → changed / motion).
 */
function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/[0.08] motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Bone className="h-2.5 w-28" />
          <Bone className="h-9 w-44" />
          <Bone className="h-4 w-80 max-w-full" />
        </div>
        <Bone className="h-3 w-40" />
      </header>

      <section className="grid gap-4 rounded-2xl border border-white/[0.1] bg-[#111b2e]/90 p-5 md:grid-cols-[1.15fr_0.85fr] md:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Bone className="h-[6.75rem] w-[6.75rem] rounded-full" />
          <div className="min-w-0 flex-1 space-y-3">
            <Bone className="h-3.5 w-32" />
            <Bone className="h-6 w-28 rounded-full" />
            <Bone className="h-4 w-full max-w-md" />
            <Bone className="h-4 w-4/5 max-w-sm" />
            <Bone className="h-3.5 w-28" />
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#0f172a]/70 p-4">
          <Bone className="h-2.5 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Bone className="h-3.5 w-36" />
              <Bone className="h-3.5 w-8" />
            </div>
          ))}
          <Bone className="mt-2 h-3 w-full" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <Bone className="h-5 w-56" />
          <Bone className="h-3.5 w-64" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#111b2e]/80">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-t border-white/[0.08] px-4 py-3.5 first:border-t-0"
            >
              <Bone className="h-9 w-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bone className="h-3.5 w-3/4 max-w-sm" />
                <Bone className="h-3 w-40" />
              </div>
              <Bone className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <Bone className="h-5 w-40" />
          <Bone className="h-3.5 w-48" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-white/[0.1] bg-[#111b2e]/80 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <Bone className="h-3.5 w-28" />
                <Bone className="h-8 w-8 rounded-lg" />
              </div>
              <Bone className="h-8 w-16" />
              <Bone className="h-3 w-32" />
              <Bone className="h-3 w-36" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-white/[0.1] bg-[#111b2e]/80 p-4"
          >
            <Bone className="h-5 w-32" />
            <Bone className="h-3 w-48" />
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Bone className="h-8 w-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Bone className="h-3.5 w-4/5" />
                    <Bone className="h-3 w-2/3" />
                  </div>
                </div>
                <Bone className="h-6 w-10 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
