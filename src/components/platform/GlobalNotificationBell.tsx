"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "@/lib/utils";
import type { OperationalNotificationFeed } from "@/modules/workspace/utils/deriveOperationalNotifications";
import {
  HOME_WORKSPACE_SETTLED_EVENT,
  isOperationsHomePath,
} from "@/modules/workspace/utils/homeWorkspaceReady";
import {
  countUnreadNotifications,
  loadReadNotificationIds,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_READ_STATE_EVENT,
} from "@/modules/workspace/utils/notificationReadState";
import { OperationalNotificationService } from "@/services/workspace/OperationalNotificationService";

const EMPTY_FEED: OperationalNotificationFeed = {
  total: 0,
  items: [],
  visible: [],
};

/** If Home never settles (unexpected), still warm the bell after this ceiling. */
const OPERATIONS_BELL_FALLBACK_MS = 35_000;

/**
 * Global header notification bell.
 * Uses derived operational signals — not a notification database.
 * Distinct from Facility Management Home “Requires attention”.
 *
 * On /operations, the initial feed fetch waits until Home has settled so
 * notification source calls do not contend with WorkspaceService.
 */
export function GlobalNotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<OperationalNotificationFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const initialLoadStarted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await OperationalNotificationService.getFeed();
      setFeed(next);
      setReadIds(loadReadNotificationIds());
    } catch {
      setFeed(EMPTY_FEED);
    } finally {
      setLoading(false);
    }
  }, []);

  const startInitialLoad = useCallback(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    setReadIds(loadReadNotificationIds());
    initialLoadStarted.current = false;

    if (!isOperationsHomePath(pathname)) {
      startInitialLoad();
      return;
    }

    const onHomeSettled = () => startInitialLoad();
    window.addEventListener(HOME_WORKSPACE_SETTLED_EVENT, onHomeSettled);
    const fallback = window.setTimeout(
      () => startInitialLoad(),
      OPERATIONS_BELL_FALLBACK_MS
    );

    return () => {
      window.removeEventListener(HOME_WORKSPACE_SETTLED_EVENT, onHomeSettled);
      window.clearTimeout(fallback);
    };
  }, [pathname, startInitialLoad]);

  useEffect(() => {
    const onReadState = () => setReadIds(loadReadNotificationIds());
    window.addEventListener(NOTIFICATION_READ_STATE_EVENT, onReadState);
    return () =>
      window.removeEventListener(NOTIFICATION_READ_STATE_EVENT, onReadState);
  }, []);

  useEffect(() => {
    if (!open) return;
    // User opened the panel — load/refresh even if Home is still settling.
    setReadIds(loadReadNotificationIds());
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const allIds = feed.items.map((item) => item.id);
  const unreadCount = countUnreadNotifications(allIds, readIds);
  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  function handleReadAll() {
    if (unreadCount === 0) return;
    setReadIds(markAllNotificationsRead(allIds, readIds));
  }

  function handleItemOpen(id: string) {
    setReadIds(markNotificationRead(id, readIds));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="os-notify relative">
      <button
        type="button"
        className="os-notify-bell"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 ? (
          <span className="os-notify-badge" aria-hidden>
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="os-notify-panel"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="os-notify-panel-head">
            <p className="os-notify-panel-title">Notifications</p>
            <div className="os-notify-panel-actions">
              <button
                type="button"
                className="os-notify-read-all"
                disabled={unreadCount === 0}
                onClick={handleReadAll}
              >
                Read all
              </button>
              {feed.viewAllHref && feed.viewAllLabel ? (
                <Link
                  href={feed.viewAllHref}
                  className="os-notify-view-all"
                  onClick={() => setOpen(false)}
                >
                  {feed.viewAllLabel}
                </Link>
              ) : null}
            </div>
          </div>

          {loading && feed.visible.length === 0 ? (
            <p className="os-notify-empty">Loading…</p>
          ) : feed.visible.length === 0 ? (
            <p className="os-notify-empty">Nothing needs your attention right now.</p>
          ) : (
            <ul className="os-notify-list">
              {feed.visible.map((item) => {
                const unread = !readIds.has(item.id);
                return (
                  <li
                    key={item.id}
                    className={
                      unread
                        ? "os-notify-item os-notify-item-unread"
                        : "os-notify-item"
                    }
                  >
                    <div className="os-notify-item-body">
                      <p className="os-notify-event">{item.eventType}</p>
                      <p className="os-notify-desc">{item.title}</p>
                      <p className="os-notify-time">
                        {formatRelativeTime(item.at)}
                      </p>
                    </div>
                    <Link
                      href={item.href}
                      className="os-notify-action"
                      onClick={() => handleItemOpen(item.id)}
                    >
                      {item.actionLabel}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
