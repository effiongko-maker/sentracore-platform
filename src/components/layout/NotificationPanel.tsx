"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { formatRelativeTime } from "@/lib/utils";
import type { NotificationItem } from "@/types";
import { Badge } from "@/components/ui/Badge";

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
}

const typeVariant = {
  info: "info",
  warning: "warning",
  danger: "danger",
  success: "success",
} as const;

export function NotificationPanel({
  open,
  onClose,
  notifications,
}: NotificationPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18 }}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[360px] overflow-hidden rounded-sc border border-border bg-card shadow-sc-lg"
        >
          <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            <span className="text-xs text-muted">
              {notifications.filter((item) => !item.read).length} unread
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((item) => (
              <div
                key={item.id}
                className="border-b border-border/60 px-4 py-3 last:border-0 hover:bg-slate-50/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-muted">
                      {item.message}
                    </p>
                  </div>
                  {!item.read ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={typeVariant[item.type]} withDot={false}>
                    {item.type}
                  </Badge>
                  <span className="text-[11px] text-muted">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
