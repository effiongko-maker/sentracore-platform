import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { StatusVariant } from "@/types";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-700",
        success: "bg-emerald-50 text-success",
        warning: "bg-amber-50 text-amber-700",
        danger: "bg-red-50 text-danger",
        info: "bg-accent-soft text-accent",
        neutral: "bg-slate-100 text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const dotVariants: Record<StatusVariant, string> = {
  default: "bg-slate-400",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-accent",
  neutral: "bg-slate-400",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  withDot?: boolean;
}

export function Badge({
  className,
  variant = "default",
  withDot = true,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {withDot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            dotVariants[variant ?? "default"]
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
