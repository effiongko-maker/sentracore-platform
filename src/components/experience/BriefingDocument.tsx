import { cn } from "@/lib/utils";

export function BriefingDocument({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn("sc-briefing-document mx-auto max-w-3xl", className)}
      {...props}
    >
      {children}
    </article>
  );
}

export type BriefingSectionEmphasis =
  | "action"
  | "change"
  | "observation"
  | "supporting"
  | "context";

const EMPHASIS_CLASS: Record<BriefingSectionEmphasis, string> = {
  action: "sc-briefing-section sc-briefing-section-action",
  change: "sc-briefing-section sc-briefing-section-change",
  observation: "sc-briefing-section sc-briefing-section-observation",
  supporting: "sc-briefing-section sc-briefing-section-supporting",
  context: "sc-briefing-section sc-briefing-section-context",
};

export function BriefingSection({
  emphasis = "observation",
  title,
  description,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  emphasis?: BriefingSectionEmphasis;
  title?: string;
  description?: string;
}) {
  return (
    <section
      className={cn(EMPHASIS_CLASS[emphasis], className)}
      {...props}
    >
      {title ? (
        <header className="sc-briefing-section-header">
          <h2 className={cn(
            emphasis === "action" && "sc-text-section-prominent",
            emphasis === "context" && "sc-text-section-quiet",
            emphasis !== "action" && emphasis !== "context" && "sc-text-section"
          )}>
            {title}
          </h2>
          {description ? (
            <p className="sc-text-supporting mt-1">{description}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function BriefingLead({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("sc-text-briefing-lead", className)} {...props}>
      {children}
    </p>
  );
}

export function BriefingStatus({
  className,
  label,
  description,
}: {
  className?: string;
  label: string;
  description?: string;
}) {
  return (
    <div className={cn("sc-briefing-status", className)}>
      <span className="sc-briefing-status-label">{label}</span>
      {description ? (
        <span className="sc-briefing-status-copy">{description}</span>
      ) : null}
    </div>
  );
}
