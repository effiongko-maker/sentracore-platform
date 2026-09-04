"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import type { OperationalNotificationFeed } from "../types";

/**
 * Presentation-only attention feed for Facility Management Home.
 * Business rules live in deriveOperationalNotifications.
 */
export function OperationalNotificationsSection({
  feed,
}: {
  feed?: OperationalNotificationFeed | null;
}) {
  const safeFeed: OperationalNotificationFeed = feed ?? {
    total: 0,
    visible: [],
  };
  const hasItems = safeFeed.visible.length > 0;

  return (
    <section
      className="sc-fm-notify"
      aria-labelledby="sc-fm-notify-heading"
    >
      <div className="sc-fm-notify-header">
        <div>
          <h2 id="sc-fm-notify-heading" className="sc-fm-notify-title">
            Needs attention
          </h2>
          <p className="sc-fm-notify-lede">
            {hasItems
              ? "What happened that you should know about"
              : "Nothing needs your attention right now"}
          </p>
        </div>
        {safeFeed.viewAllHref && safeFeed.viewAllLabel ? (
          <Link href={safeFeed.viewAllHref} className="sc-fm-notify-view-all">
            {safeFeed.viewAllLabel}
          </Link>
        ) : null}
      </div>

      {hasItems ? (
        <ul className="sc-fm-notify-list">
          {safeFeed.visible.map((item) => (
            <li key={item.id} className="sc-fm-notify-item">
              <div className="sc-fm-notify-body">
                <p className="sc-fm-notify-event">{item.eventType}</p>
                <p className="sc-fm-notify-desc">{item.title}</p>
                <p className="sc-fm-notify-time">
                  {formatRelativeTime(item.at)}
                </p>
              </div>
              <Link href={item.href} className="sc-fm-notify-action">
                {item.actionLabel}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sc-fm-notify-empty">The attention feed is clear.</p>
      )}
    </section>
  );
}
