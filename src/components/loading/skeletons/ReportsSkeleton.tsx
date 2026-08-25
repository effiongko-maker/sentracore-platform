/**
 * Skeleton matching the Reports landing composition
 * (header → assistant → continue working → templates).
 */
function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/[0.08] motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Bone className="h-2.5 w-24" />
          <Bone className="h-9 w-40" />
          <Bone className="h-4 w-80 max-w-full" />
        </div>
        <Bone className="h-10 w-36 rounded-lg" />
      </header>

      <section className="grid gap-5 rounded-2xl border border-white/[0.1] bg-[#121a2e]/90 p-5 md:grid-cols-[0.9fr_1.3fr] md:p-6">
        <div className="space-y-3">
          <Bone className="h-8 w-8 rounded-lg" />
          <Bone className="h-6 w-56 max-w-full" />
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-4/5" />
        </div>
        <div className="space-y-3">
          <Bone className="h-20 w-full rounded-xl" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} className="h-7 w-40 rounded-full" />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <Bone className="h-5 w-40" />
          <Bone className="h-3.5 w-52" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.1] bg-[#111b2e]/70 p-4 space-y-3"
            >
              <Bone className="h-8 w-8 rounded-lg" />
              <Bone className="h-4 w-4/5" />
              <Bone className="h-3 w-24" />
              <Bone className="h-3 w-32" />
              <Bone className="h-8 w-24 rounded-md" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <Bone className="h-5 w-44" />
          <Bone className="h-3.5 w-64 max-w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.1] bg-[#111b2e]/70 p-4 space-y-3 min-h-[14rem]"
            >
              <Bone className="h-8 w-8 rounded-lg" />
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3 w-full" />
              <Bone className="h-3 w-5/6" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Bone className="h-5 w-16 rounded-full" />
                <Bone className="h-5 w-14 rounded-full" />
                <Bone className="h-5 w-20 rounded-full" />
              </div>
              <Bone className="mt-auto h-3 w-40" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
