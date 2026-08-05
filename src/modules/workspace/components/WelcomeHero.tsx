"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";
import { greetingForHour } from "../utils";

export function WelcomeHero({
  userName,
  asOf,
}: {
  userName?: string;
  asOf: string;
}) {
  const [now, setNow] = useState(() => new Date(asOf));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = greetingForHour(now.getHours());
  const name = userName?.trim() ?? "";
  const dateLabel = formatDate(now, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="relative overflow-hidden rounded-sc border border-border/70 bg-gradient-to-br from-white via-slate-50 to-accent-soft/40 px-6 py-8 sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
          Home
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {dateLabel}
          <span className="mx-2 text-border">·</span>
          {timeLabel}
        </p>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
          Your personal starting point for today&apos;s facility work.
        </p>
      </div>
    </section>
  );
}
