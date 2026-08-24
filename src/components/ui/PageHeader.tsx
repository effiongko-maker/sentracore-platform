import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Operational page title — primary H1 lives here; shell shows area wayfinding only.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-7 flex flex-col gap-4 border-b border-[var(--sc-rule)] pb-6 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.03em] text-[var(--sc-ink-display)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--sc-ink-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
