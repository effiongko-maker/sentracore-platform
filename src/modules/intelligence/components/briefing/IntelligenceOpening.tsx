"use client";

import { useEffect, useState } from "react";
import { UserService } from "@/services/users/UserService";

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(fullName: string | undefined): string | null {
  if (!fullName) return null;
  const part = fullName.trim().split(/\s+/)[0];
  return part || null;
}

export function IntelligenceOpening({
  urgentCount,
  windowDays,
  processing,
  hasOperationalActivity,
  partial,
}: {
  urgentCount: number;
  windowDays: number;
  processing: boolean;
  hasOperationalActivity: boolean;
  partial: boolean;
}) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    UserService.getCurrentUser()
      .then((user) => {
        if (!cancelled) setName(firstName(user.name));
      })
      .catch(() => {
        if (!cancelled) setName(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const greeting = timeGreeting();
  const addressee = name ? `, ${name}` : "";

  let headline: string;
  let headlineClass = "sc-intel-headline";

  if (processing) {
    headline = "Assembling the operational picture";
    headlineClass += " sc-intel-headline-calm";
  } else if (!hasOperationalActivity && urgentCount === 0) {
    headline = "Waiting for enough activity to interpret";
    headlineClass += " sc-intel-headline-calm";
  } else if (urgentCount > 0) {
    headline = "The operation needs your attention";
  } else {
    headline = "The operation is steady";
    headlineClass += " sc-intel-headline-calm";
  }

  return (
    <header className="sc-intel-opening">
      <p className="sc-intel-greeting">
        {greeting}
        {addressee}
      </p>
      <h1 className={headlineClass}>{headline}</h1>

      <div className="sc-intel-opening-meta">
        {processing ? (
          <span>SentraCore is still processing recent activity.</span>
        ) : urgentCount > 0 ? (
          <>
            <span>
              <strong>{urgentCount}</strong>{" "}
              {urgentCount === 1 ? "matter requires" : "matters require"} action
            </span>
            <span aria-hidden>·</span>
            <span>Based on the last {windowDays} days</span>
          </>
        ) : hasOperationalActivity ? (
          <span>Based on activity from the last {windowDays} days</span>
        ) : (
          <span>More operational activity will sharpen this briefing</span>
        )}
      </div>

      {partial ? (
        <p className="sc-intel-status-note">
          <em>Still completing.</em> Some of this picture is still coming
          together — available findings are shown below.
        </p>
      ) : null}
    </header>
  );
}
