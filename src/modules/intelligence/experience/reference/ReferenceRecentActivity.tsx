"use client";

import type { ActivityItem } from "./referenceHelpers";

export function ReferenceRecentActivity({
  items,
  variant = "panel",
}: {
  items: ActivityItem[];
  variant?: "panel" | "feed";
}) {
  const isFeed = variant === "feed";

  return (
    <section
      className={
        isFeed
          ? "ix-ref-activity-feed"
          : "ix-ref-card ix-ref-side-panel"
      }
      aria-label="Recent activity"
    >
      {!isFeed ? (
        <header className="ix-ref-panel-head">
          <h2>Recent activity</h2>
        </header>
      ) : null}

      {items.length === 0 ? (
        <p className="ix-ref-empty">No recent activity recorded.</p>
      ) : (
        <ul className="ix-ref-activity-list">
          {items.map((item) => (
            <li key={item.id} className="ix-ref-activity-item">
              <span className={`ix-ref-activity-dot ix-ref-activity-dot-${item.tone}`} />
              <div className="ix-ref-activity-copy">
                <p>{item.label}</p>
                <span>{item.time}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
