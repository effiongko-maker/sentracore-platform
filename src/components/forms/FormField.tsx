import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {!error && hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClassName =
  "h-10 w-full rounded-[12px] border border-border bg-white px-3.5 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-accent/40 focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-slate-50";

export const selectClassName = inputClassName;

/** Compact select used in list-page toolbars (search + filters row). */
export const toolbarSelectClassName =
  "h-10 rounded-[12px] border border-border bg-card px-3 text-sm text-foreground outline-none transition-all duration-200 focus:border-accent/40 focus:ring-2 focus:ring-accent/15";
