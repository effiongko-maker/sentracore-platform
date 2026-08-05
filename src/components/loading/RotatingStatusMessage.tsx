"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  STATUS_ROTATE_MAX_MS,
  STATUS_ROTATE_MIN_MS,
} from "./messages";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function nextDelay() {
  return (
    STATUS_ROTATE_MIN_MS +
    Math.floor(Math.random() * (STATUS_ROTATE_MAX_MS - STATUS_ROTATE_MIN_MS + 1))
  );
}

export function RotatingStatusMessage({
  messages,
  className,
  live = true,
}: {
  messages: readonly string[];
  className?: string;
  /** When false, shows the first message only (useful with stepped sequences). */
  live?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const sequence = useMemo(() => shuffle(messages), [messages]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!live || sequence.length <= 1 || reducedMotion) return;

    let cancelled = false;
    let timeoutId = 0;

    const tick = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setVisible(false);
        window.setTimeout(() => {
          if (cancelled) return;
          setIndex((current) => (current + 1) % sequence.length);
          setVisible(true);
          tick();
        }, 180);
      }, nextDelay());
    };

    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [live, reducedMotion, sequence]);

  const message = sequence[index] ?? messages[0] ?? "Loading...";

  return (
    <p
      className={cn(
        "text-sm font-medium text-slate-600 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
      aria-live={live ? "polite" : undefined}
      aria-atomic="true"
    >
      {message}
    </p>
  );
}
