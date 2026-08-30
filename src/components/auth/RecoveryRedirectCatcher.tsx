"use client";

import { useEffect, useState } from "react";

/**
 * Rescues password-recovery tokens that landed on /login (or similar)
 * instead of /auth/callback.
 *
 * Real failure shape (Supabase Site URL fallback + middleware):
 *   /#access_token=…&type=recovery
 *     → middleware → /login?next=/   (hash preserved by the browser)
 *     → this catcher → /auth/callback?next=/reset-password#access_token=…&type=recovery
 *
 * Also handles mangled next values where `#` was encoded into the path:
 *   /login?next=/%23access_token=…&refresh_token=…&type=recovery
 */
export function RecoveryRedirectCatcher() {
  const [rescuing, setRescuing] = useState(false);

  useEffect(() => {
    const hash = extractRecoveryHash(window.location.href);
    if (!hash) return;

    setRescuing(true);
    // Rebuild the intended callback URL; keep tokens in the fragment only.
    window.location.replace(`/auth/callback?next=/reset-password${hash}`);
  }, []);

  if (!rescuing) return null;

  return (
    <p className="mb-4 text-center text-sm text-muted" role="status">
      Continuing password reset…
    </p>
  );
}

/** @returns fragment including leading `#`, or null */
export function extractRecoveryHash(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const fromHash = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
  );
  if (
    fromHash.get("type") === "recovery" &&
    fromHash.get("access_token") &&
    fromHash.get("refresh_token")
  ) {
    return url.hash.startsWith("#") ? url.hash : `#${url.hash}`;
  }

  const nextRaw = url.searchParams.get("next");
  if (!nextRaw) return null;

  let next = nextRaw;
  try {
    // Middleware / URLSearchParams may already decode once; tolerate double-encoding.
    next = decodeURIComponent(nextRaw);
    if (next.includes("%23") || next.includes("%2F")) {
      next = decodeURIComponent(next);
    }
  } catch {
    /* keep nextRaw */
  }

  if (!next.includes("access_token") || !next.includes("type=recovery")) {
    return null;
  }

  // next shapes: "/#access_token=…", "/%23access_token=…", "#access_token=…"
  if (next.startsWith("/#")) return next.slice(1);
  if (next.startsWith("/")) {
    const rest = next.slice(1);
    if (rest.startsWith("#")) return rest;
    if (rest.startsWith("%23")) {
      try {
        return decodeURIComponent(rest);
      } catch {
        return `#${rest.slice(3)}`;
      }
    }
    // Bare token query stuffed after /
    if (rest.includes("access_token=")) return `#${rest}`;
  }
  if (next.startsWith("#")) return next;
  if (next.startsWith("%23")) {
    try {
      return decodeURIComponent(next);
    } catch {
      return `#${next.slice(3)}`;
    }
  }

  return null;
}
