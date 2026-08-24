function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/80 motion-reduce:animate-none ${className ?? ""}`}
    />
  );
}

export default function IntelligenceLoading() {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Bone className="h-8 w-64 max-w-full" />
        <Bone className="h-4 w-48 max-w-full" />
      </div>
      <div className="space-y-2">
        <Bone className="h-5 w-96 max-w-full" />
        <Bone className="h-4 w-56 max-w-full" />
      </div>
      <div className="space-y-3">
        <Bone className="h-5 w-40" />
        <Bone className="h-24 w-full" />
        <Bone className="h-24 w-full" />
      </div>
    </div>
  );
}
