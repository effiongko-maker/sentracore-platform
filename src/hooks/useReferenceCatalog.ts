"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ReferenceCatalog<T> = {
  items: T[];
  /** True until the first attempt settles. */
  loading: boolean;
  /** True when the load failed. `items` is then NOT a healthy empty list. */
  failed: boolean;
  retry: () => void;
};

/**
 * Load one reference catalog independently of its siblings.
 * Failure is explicit (`failed`) — never substituted with a healthy empty list,
 * and never erases catalogs that loaded successfully elsewhere.
 */
export function useReferenceCatalog<T>(
  enabled: boolean,
  load: () => Promise<T[]>
): ReferenceCatalog<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    loadRef
      .current()
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { items, loading, failed, retry };
}
