"use client";

/**
 * Explicit failed-reference-list state. Names the lists that could not be
 * loaded (they are NOT empty) and offers a retry. Successful lists are untouched.
 */
export function CatalogFailureNotice({
  failed,
  onRetry,
}: {
  failed: Array<{ label: string; retry: () => void }>;
  onRetry?: () => void;
}) {
  if (failed.length === 0) return null;
  const names = failed.map((item) => item.label).join(", ");
  return (
    <div
      role="alert"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sc border border-border/70 bg-slate-50/80 px-3 py-2 text-sm text-muted"
    >
      <span>
        Couldn&apos;t load: {names}. Those choices are unavailable — they are not empty.
      </span>
      <button
        type="button"
        className="underline underline-offset-2"
        onClick={() => {
          failed.forEach((item) => item.retry());
          onRetry?.();
        }}
      >
        Retry
      </button>
    </div>
  );
}
