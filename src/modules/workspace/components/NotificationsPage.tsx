"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ModeFrame, OperateHeader, StreamSurface } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime } from "@/lib/utils";
import type { OperationalNotificationFeed } from "@/modules/workspace/utils/deriveOperationalNotifications";
import { notificationSourceLabel } from "@/modules/workspace/utils/deriveOperationalNotifications";
import {
  countUnreadNotifications,
  loadReadNotificationIds,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_READ_STATE_EVENT,
} from "@/modules/workspace/utils/notificationReadState";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { OperationalNotificationService } from "@/services/workspace/OperationalNotificationService";

const EMPTY_FEED: OperationalNotificationFeed = {
  total: 0,
  items: [],
  visible: [],
};

/**
 * Unified platform notifications / attention view.
 * Same derivation as the header bell — not a second notification store.
 * Distinct from Home “Requires attention”.
 */
export function NotificationsPage() {
  const { access, can } = useOperatingAccess();
  const profileId = access?.sheetUserId ?? "";
  // Reset feed/read state synchronously whenever identity or access changes.
  return <NotificationsPageForUser key={JSON.stringify(access)} profileId={profileId} canReadOperations={can("ops.view")} />;
}

function NotificationsPageForUser({ profileId, canReadOperations }: { profileId: string; canReadOperations: boolean }) {
  const [feed, setFeed] = useState<OperationalNotificationFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await OperationalNotificationService.getFeed({
        canReadRequests: false,
        profileId,
        canReadOperations,
      });
      setFeed(next);
      setReadIds(loadReadNotificationIds(profileId));
    } catch (err) {
      setFeed({ ...EMPTY_FEED, incomplete: true });
      setError(
        err instanceof Error ? err.message : "Unable to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }, [profileId, canReadOperations]);

  useEffect(() => {
    setReadIds(loadReadNotificationIds(profileId));
    void load();
  }, [load, profileId]);

  useEffect(() => {
    const onReadState = () => setReadIds(loadReadNotificationIds(profileId));
    window.addEventListener(NOTIFICATION_READ_STATE_EVENT, onReadState);
    return () =>
      window.removeEventListener(NOTIFICATION_READ_STATE_EVENT, onReadState);
  }, [profileId]);

  const allIds = feed.items.map((item) => item.id);
  const unreadCount = countUnreadNotifications(allIds, readIds);

  function handleReadAll() {
    if (unreadCount === 0) return;
    setReadIds(markAllNotificationsRead(profileId, allIds, readIds));
  }

  function handleOpen(id: string) {
    setReadIds(markNotificationRead(profileId, id, readIds));
  }

  return (
    <ModeFrame mode="act">
      <OperateHeader
        title="Notifications"
        description="Updates about work and matters assigned to you."
        signalValue={loading ? "—" : unreadCount}
        signalLabel="Unread"
      />

      <div className="os-notify-page-toolbar">
        <p className="os-notify-page-meta">
          {loading
            ? "Loading…"
            : feed.incomplete
              ? feed.total > 0
                ? `${feed.total} known item${feed.total === 1 ? "" : "s"} · picture incomplete`
                : "Notification picture is incomplete"
              : `${feed.total} item${feed.total === 1 ? "" : "s"} · ${unreadCount} unread`}
        </p>
        <button
          type="button"
          className="os-notify-read-all"
          disabled={unreadCount === 0 || loading}
          onClick={handleReadAll}
        >
          Read all
        </button>
      </div>

      <StreamSurface className="mt-4">
        {error && feed.items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Notifications temporarily unavailable"
            description={
              error ??
              "Some operational data could not be loaded. This is not a confirmed empty inbox."
            }
          />
        ) : feed.incomplete && feed.items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Notifications temporarily unavailable"
            description="Some operational data could not be loaded. This is not a confirmed empty inbox."
          />
        ) : loading && feed.items.length === 0 ? (
          <p className="os-notify-empty">Loading…</p>
        ) : feed.items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications for you"
            description="Updates relevant to your responsibilities will appear here."
          />
        ) : (
          <ul className="os-notify-page-list">
            {feed.items.map((item) => {
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
                      {notificationSourceLabel(item.href)} ·{" "}
                      {formatRelativeTime(item.at)}
                      {unread ? " · Unread" : ""}
                    </p>
                  </div>
                  <Link
                    href={item.href}
                    className="os-notify-action"
                    onClick={() => handleOpen(item.id)}
                  >
                    {item.actionLabel}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </StreamSurface>
    </ModeFrame>
  );
}
