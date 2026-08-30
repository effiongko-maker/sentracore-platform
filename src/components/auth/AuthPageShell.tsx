import type { ReactNode } from "react";
import { SentraCoreLogo } from "@/components/brand";

/**
 * Shared branded shell for login / forgot / reset password pages.
 */
export function AuthPageShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(29,78,216,0.08),_transparent_55%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)]"
      />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4">
            <SentraCoreLogo size={56} priority alt="" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            SentraCore
            <span className="align-super text-[10px] font-medium text-primary/40">
              ™
            </span>
          </h1>
          <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-1 max-w-sm text-sm text-muted">{subtitle}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sc">
          {children}
        </div>

        {footer ? (
          <div className="mt-6 text-center text-xs text-muted">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
