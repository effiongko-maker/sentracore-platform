"use client";

import type { IntelligenceThreadStep } from "../view-model/buildIntelligenceThread";

export function IntelligenceThread({ steps }: { steps: IntelligenceThreadStep[] }) {
  if (steps.length === 0) return null;

  return (
    <section className="ix-thread" aria-label="How this finding formed">
      <header className="ix-thread-head">
        <h3 className="ix-thread-title">How this finding formed</h3>
        <p className="ix-thread-sub">
          From recent activity to what SentraCore is highlighting
        </p>
      </header>

      <div className="ix-thread-flow">
        <svg className="ix-thread-path" aria-hidden preserveAspectRatio="none">
          <defs>
            <linearGradient id="ix-thread-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(59, 130, 246, 0.05)" />
              <stop offset="50%" stopColor="rgba(59, 130, 246, 0.35)" />
              <stop offset="100%" stopColor="rgba(59, 130, 246, 0.65)" />
            </linearGradient>
          </defs>
          <path
            className="ix-thread-path-line"
            d="M 0 50 Q 50 50 100 50"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <ol className="ix-thread-steps">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={`ix-thread-step ix-thread-step-${step.kind}${
                index === steps.length - 1 ? " ix-thread-step-terminal" : ""
              }`}
            >
              <div className="ix-thread-node">
                <span className="ix-thread-node-ring" aria-hidden />
                <span className="ix-thread-node-core" aria-hidden />
              </div>
              <p className="ix-thread-step-label">{step.label}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
