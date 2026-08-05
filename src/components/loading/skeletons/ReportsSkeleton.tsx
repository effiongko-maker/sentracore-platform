function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/80 motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Bone className="h-7 w-36" />
        <Bone className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-sc border border-border/80 bg-card px-3 py-3 shadow-sc"
          >
            <Bone className="h-7 w-7 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bone className="h-2.5 w-12" />
              <Bone className="h-3.5 w-20" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-sc border border-border/80 bg-card p-5 shadow-sc"
          >
            <div className="flex items-start gap-3">
              <Bone className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bone className="h-4 w-36" />
                <Bone className="h-3 w-full" />
                <Bone className="h-3 w-4/5" />
              </div>
            </div>
            <Bone className="mt-5 h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
