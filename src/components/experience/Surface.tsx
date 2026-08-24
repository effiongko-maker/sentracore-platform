import { cn } from "@/lib/utils";

export type SurfaceVariant = "canvas" | "group" | "elevated" | "quiet";

const VARIANT_CLASS: Record<SurfaceVariant, string> = {
  canvas: "sc-surface-canvas",
  group: "sc-surface-group",
  elevated: "sc-surface-elevated",
  quiet: "sc-surface-quiet",
};

export function Surface({
  variant = "canvas",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: SurfaceVariant }) {
  return (
    <div className={cn(VARIANT_CLASS[variant], className)} {...props}>
      {children}
    </div>
  );
}
