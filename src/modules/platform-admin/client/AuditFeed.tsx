"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminAuditEntry } from "../types";
import { AUDIT_CATEGORY_LABELS, type AuditCategory } from "../auditDescribe";
import { eventVisual } from "./kit";
import { formatWhen } from "./ui";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Administrative ledger: marker · who did what to whom · when — grouped by day. */
export function AuditFeed({ events, compact, orgParam }: { events: AdminAuditEntry[]; compact?: boolean; orgParam?: string }) {
  const rows: Array<{ type: "day"; label: string; key: string } | { type: "event"; event: AdminAuditEntry }> = [];
  let last = "";
  for (const e of events) {
    const label = dayLabel(e.at);
    if (!compact && label !== last) {
      rows.push({ type: "day", label, key: `${label}-${e.id}` });
      last = label;
    }
    rows.push({ type: "event", event: e });
  }
  return (
    <ol className={cn("ac-ledger", compact && "ac-ledger-compact")}>
      {rows.map((row) => {
        if (row.type === "day") {
          return (
            <li key={row.key} className="ac-day" aria-hidden>
              {row.label}
            </li>
          );
        }
        const e = row.event;
        const when = formatWhen(e.at);
        const visual = eventVisual(e.action, e.category);
        const Icon = visual.icon;
        const category = e.category ? AUDIT_CATEGORY_LABELS[e.category as AuditCategory] : null;
        return (
          <li key={e.id} className="ac-event">
            <span className={cn("ac-event-mark", visual.tone && `ac-event-mark-${visual.tone}`)} aria-hidden>
              <Icon className="h-4 w-4" />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="ac-event-head">
                {e.person ? <PersonAwareHeadline headline={e.headline} personName={e.person.name} href={`/admin/people/${e.person.profileId}${orgParam ?? ""}`} /> : e.headline}
              </div>
              <div className="ac-event-sub">
                <span>by {e.actor.name}</span>
                {category ? <span className="ac-tag">{category}</span> : null}
              </div>
              {e.detail.length > 0 ? (
                compact ? null : (
                  <details>
                    <summary>Details</summary>
                    <ul className="ac-event-detail">
                      {e.detail.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )
              ) : null}
            </div>
            <time className="ac-event-time" dateTime={e.at} title={when.absolute}>
              {when.relative}
            </time>
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
      <Link href={href}>{personName}</Link>
      {headline.slice(i + personName.length)}
    </>
  );
}
