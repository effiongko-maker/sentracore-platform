export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200/80" />
      <div className="h-4 w-80 animate-pulse rounded-md bg-slate-200/60" />
      <div className="mt-6 h-64 animate-pulse rounded-sc bg-slate-200/70" />
    </div>
  );
}
