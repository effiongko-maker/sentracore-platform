/**
 * Skeleton that mirrors the Intelligence briefing composition
 * (hero → now → changes → patterns → recommendations → activity).
 */
function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/[0.08] motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}

function SectionRule() {
  return <div className="h-px w-full bg-white/[0.08]" />;
}

export function IntelligenceSkeleton() {
  return (
    <div className="ix-ref-page !min-h-0 !bg-transparent !p-0">
      <div className="space-y-8">
        {/* Hero */}
        <header className="space-y-3 pt-1">
          <Bone className="h-2.5 w-28" />
          <Bone className="h-10 w-[min(100%,22rem)]" />
          <Bone className="h-4 w-[min(100%,28rem)]" />
          <div className="flex flex-wrap gap-6 pt-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Bone className="h-7 w-12" />
                <Bone className="h-3 w-24" />
              </div>
            ))}
          </div>
        </header>

        <SectionRule />

        {/* Now */}
        <section className="space-y-4">
          <div className="space-y-2">
            <Bone className="h-2.5 w-12" />
            <Bone className="h-6 w-64 max-w-full" />
            <Bone className="h-3.5 w-80 max-w-full" />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.85fr)]">
            <div className="rounded-xl border border-white/[0.1] bg-[#111b2e]/80 p-5 space-y-3">
              <Bone className="h-2.5 w-24" />
              <Bone className="h-6 w-4/5 max-w-[28rem]" />
              <Bone className="h-4 w-full" />
              <Bone className="h-4 w-5/6" />
              <div className="space-y-2 pt-2">
                <Bone className="h-3 w-full" />
                <Bone className="h-3 w-4/5" />
                <Bone className="h-3 w-3/5" />
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/[0.1] bg-[#111b2e]/60 p-4 space-y-2"
                >
                  <Bone className="h-3.5 w-3/4" />
                  <Bone className="h-3 w-full" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionRule />

        {/* What changed */}
        <section className="space-y-4">
          <div className="space-y-2">
            <Bone className="h-2.5 w-24" />
            <Bone className="h-6 w-48" />
            <Bone className="h-3.5 w-72 max-w-full" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.1] bg-[#111b2e]/60 p-4 space-y-3"
              >
                <Bone className="h-2.5 w-16" />
                <Bone className="h-4 w-4/5" />
                <Bone className="h-3 w-full" />
                <Bone className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </section>

        <SectionRule />

        {/* Patterns */}
        <section className="space-y-4">
          <div className="space-y-2">
            <Bone className="h-2.5 w-20" />
            <Bone className="h-6 w-72 max-w-full" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.1] bg-[#111b2e]/60 p-4 space-y-3"
              >
                <Bone className="h-4 w-5/6" />
                <Bone className="h-3 w-full" />
                <Bone className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
