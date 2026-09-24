import { IDLE_LOCK_MS, LOCK_CHANNEL } from "../shared/protocol";

/**
 * Private Office production security — client lock semantics.
 *
 * Locks on: explicit Lock; ~10 minutes without user input (measured by wall-clock timestamps, so time spent
 * suspended / in a background tab counts and is re-evaluated on resume); sign-out; a lock broadcast from
 * another tab; the page being hidden into the back/forward cache; the server refusing the lease.
 * The server lease is extended only when real user input happened since the last extension — timers and
 * background polling never keep the vault unlocked.
 */

export type LockReason = "explicit" | "inactivity" | "another-tab" | "signed-out" | "page-hidden" | "lease-refused" | "security-change";

export type LockController = { lock: (reason: LockReason) => void; stop: () => void };

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
const CHECK_MS = 15_000;
const TOUCH_MS = 60_000;

export function startLockController(options: {
  onLock: (reason: LockReason) => void;
  touch: () => Promise<boolean>;
  subscribeSignOut?: (onSignOut: () => void) => () => void;
  /** Overridable for verification only. */
  idleMs?: number;
  checkMs?: number;
  touchMs?: number;
}): LockController {
  const idleMs = options.idleMs ?? IDLE_LOCK_MS;
  const touchMs = options.touchMs ?? TOUCH_MS;
  let lastActivity = Date.now();
  let lastTouch = Date.now();
  let activeSinceTouch = false;
  let locked = false;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LOCK_CHANNEL) : null;

  const onActivity = () => {
    lastActivity = Date.now();
    activeSinceTouch = true;
  };
  const evaluate = () => {
    if (locked) return;
    if (Date.now() - lastActivity >= idleMs) {
      lock("inactivity");
      return;
    }
    if (activeSinceTouch && Date.now() - lastTouch >= touchMs) {
      activeSinceTouch = false;
      lastTouch = Date.now();
      void options.touch().then((ok) => {
        if (!ok) lock("lease-refused");
      });
    }
  };
  const onVisibility = () => evaluate();
  const onPageHide = () => lock("page-hidden");
  const onMessage = (event: MessageEvent) => {
    if ((event.data as { type?: string } | null)?.type === "lock") lock("another-tab", false);
  };

  for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  window.addEventListener("pageshow", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  channel?.addEventListener("message", onMessage);
  const interval = window.setInterval(evaluate, options.checkMs ?? CHECK_MS);
  const unsubscribeSignOut = options.subscribeSignOut?.(() => lock("signed-out"));

  function stop() {
    for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onVisibility);
    window.removeEventListener("pageshow", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    channel?.removeEventListener("message", onMessage);
    channel?.close();
    window.clearInterval(interval);
    unsubscribeSignOut?.();
  }

  function lock(reason: LockReason, broadcast = true) {
    if (locked) return;
    locked = true;
    if (broadcast) channel?.postMessage({ type: "lock" });
    stop();
    options.onLock(reason);
  }

  return { lock: (reason) => lock(reason), stop };
}
