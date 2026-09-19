"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminAuditEntry } from "../types";
import { formatWhen } from "./ui";

/** WHO did WHAT to WHOM, WHEN — readable names, details disclosed on the row. */
export function AuditFeed({ events, compact, orgParam }: { events: AdminAuditEntry[]; compact?: boolean; orgParam?: string }) {
  return (
    <ol className={cn("ac-feed", compact && "ac-feed-compact")}>
      {events.map((e) => {
        const when = formatWhen(e.at);
        return (
          <li key={e.id} className="ac-feed-item">
            <time className="ac-feed-time" dateTime={e.at} title={when.absolute}>
              {when.relative}
            </time>
            <div>
              <div className="ac-feed-head">
                {e.person ? (
                  <PersonAwareHeadline headline={e.headline} personName={e.person.name} href={`/admin/people/${e.person.profileId}${orgParam ?? ""}`} />
                ) : (
                  e.headline
                )}
              </div>
              <div className="ac-feed-actor">by {e.actor.name}</div>
              {!compact && e.detail.length > 0 ? (
                <ul className="ac-feed-detail">
                  {e.detail.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PersonAwareHeadline({ headline, personName, href }: { headline: string; personName: string; href: string }) {
  const i = headline.indexOf(personName);
  if (i < 0) return <>{headline}</>;
  return (
    <>
      {headline.slice(0, i)}
      <Link href={href} className="underline decoration-[var(--ac-rule-strong)] underline-offset-2 hover:decoration-current">
        {personName}
      </Link>
      {headline.slice(i + personName.length)}
    </>
  );
}
