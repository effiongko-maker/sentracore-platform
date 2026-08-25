"use client";

export function IntelligenceHeader() {
  return (
    <header className="ix-header">
      <div className="ix-header-copy">
        <p className="ix-header-mark">SentraCore Intelligence</p>
        <h1 className="ix-header-headline">
          The organisation is telling you something.
        </h1>
        <p className="ix-header-support">
          Intelligence connects activity across SentraCore to identify what needs
          attention, what is changing and what may matter next.
        </p>
      </div>
      <div className="ix-header-status" aria-live="polite">
        <span className="ix-header-status-pulse" aria-hidden />
        <span className="ix-header-status-label">
          Analysing organisational activity
        </span>
      </div>
    </header>
  );
}
