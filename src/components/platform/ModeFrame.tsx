import type { ProductMode } from "@/lib/platform/modes";
import { cn } from "@/lib/utils";

const FRAME_CLASS: Partial<Record<ProductMode, string>> = {
  command: "os-frame-command",
  understand: "os-frame-understand",
  organise: "os-frame-organise",
  act: "os-frame-act",
  execute: "os-frame-execute",
  learn: "os-frame-learn",
};

export function ModeFrame({
  mode,
  className,
  children,
}: {
  mode: ProductMode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("os-composition", FRAME_CLASS[mode], className)}>
      {children}
    </div>
  );
}

/** Operational state — signal number + phrase, not magazine headline. */
export function CommandStatement({
  headline,
  description,
  meta,
  tone = "stable",
  signalValue,
  signalPhrase,
  eyebrow = "Home",
}: {
  headline: string;
  description?: string;
  meta?: string;
  tone?: "stable" | "attention" | "critical";
  /** Dominant operational count when the state is signal-led */
  signalValue?: string | number;
  /** Uppercase operational phrase under the count */
  signalPhrase?: string;
  eyebrow?: string;
}) {
  const useSignal =
    signalValue !== undefined &&
    signalValue !== null &&
    Boolean(signalPhrase);

  return (
    <header className={cn("os-statement", `os-statement-${tone}`)}>
      {eyebrow ? <p className="os-statement-eyebrow">{eyebrow}</p> : null}
      {useSignal ? (
        <div className="os-statement-signal">
          <p className="os-statement-signal-value">{signalValue}</p>
          <h1 className="os-statement-signal-phrase">{signalPhrase}</h1>
        </div>
      ) : (
        <h1 className="os-statement-display">{headline}</h1>
      )}
      {description ? <p className="os-statement-sub">{description}</p> : null}
      {meta ? <p className="os-statement-meta">{meta}</p> : null}
    </header>
  );
}

/** Execute / Act module header. */
export function OperateHeader({
  title,
  description,
  signalValue,
  signalLabel,
  actions,
}: {
  title: string;
  description?: string;
  signalValue?: string | number;
  signalLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="os-module-header">
      <div className="min-w-0">
        <h1 className="os-module-title">{title}</h1>
        {description ? <p className="os-module-desc">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {signalValue !== undefined && signalLabel ? (
          <div className="os-module-signal">
            <span className="os-module-signal-value">{signalValue}</span>
            <span className="os-module-signal-label">{signalLabel}</span>
          </div>
        ) : null}
        {actions}
      </div>
    </header>
  );
}

/** Organise module header. */
export function ExploreHeader({
  title,
  description,
  territoryNote,
  actions,
}: {
  title: string;
  description?: string;
  territoryNote?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="os-module-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="os-module-title">{title}</h1>
          {description ? <p className="os-module-desc">{description}</p> : null}
          {territoryNote ? (
            <p className="os-statement-meta mt-3">{territoryNote}</p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}

/** Understand module header. */
export function UnderstandHeader({
  title,
  description,
  asOf,
}: {
  title: string;
  description?: string;
  asOf?: string;
}) {
  return (
    <header className="os-module-header">
      <h1 className="os-module-title">{title}</h1>
      {description ? <p className="os-module-desc">{description}</p> : null}
      {asOf ? <p className="os-statement-meta mt-3">As of {asOf}</p> : null}
    </header>
  );
}

/** Reports / publication header. */
export function CommunicateHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="os-module-header">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="os-module-title">{title}</h1>
          {description ? (
            <p className="os-module-desc">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function StreamSurface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("os-stream", className)}>{children}</div>;
}
