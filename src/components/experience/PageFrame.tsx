import { cn } from "@/lib/utils";

export type PageArchetype =
  | "briefing"
  | "workspace"
  | "snapshot"
  | "operational-list"
  | "reference-admin"
  | "guided-flow";

const ARCHETYPE_CLASS: Record<PageArchetype, string> = {
  briefing: "sc-page sc-page-briefing",
  workspace: "sc-page sc-page-workspace",
  snapshot: "sc-page sc-page-snapshot",
  "operational-list": "sc-page sc-page-operational",
  "reference-admin": "sc-page sc-page-reference",
  "guided-flow": "sc-page sc-page-guided",
};

export function PageFrame({
  archetype = "operational-list",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { archetype?: PageArchetype }) {
  return (
    <div
      className={cn(
        ARCHETYPE_CLASS[archetype],
        "motion-safe-only animate-[content-fade-in_0.35s_ease-out]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
