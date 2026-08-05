"use client";

import { useEffect, useRef, useState } from "react";
import {
  LOADER_FADE_MS,
  MIN_LOADER_VISIBLE_MS,
  SHOW_LOADER_DELAY_MS,
} from "./messages";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export type DeferredLoadingPhase =
  | "idle"
  | "pending"
  | "visible"
  | "exiting"
  | "ready";

/**
 * Delays showing a loader (~500ms) to avoid flash on fast loads,
 * keeps it briefly once shown, then fades out before content.
 */
export function useDeferredLoading(isLoading: boolean) {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<DeferredLoadingPhase>(
    isLoading ? "pending" : "ready"
  );
  const phaseRef = useRef(phase);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const timers: number[] = [];
    const fadeMs = reducedMotion ? 0 : LOADER_FADE_MS;
    const showDelay = reducedMotion ? 0 : SHOW_LOADER_DELAY_MS;
    const minVisible = reducedMotion ? 0 : MIN_LOADER_VISIBLE_MS;

    if (isLoading) {
      shownAtRef.current = null;
      setPhase("pending");
      timers.push(
        window.setTimeout(() => {
          shownAtRef.current = Date.now();
          setPhase("visible");
        }, showDelay)
      );
    } else {
      const current = phaseRef.current;
      if (current === "visible" || current === "exiting") {
        const shownAt = shownAtRef.current ?? Date.now();
        const wait = Math.max(0, minVisible - (Date.now() - shownAt));
        timers.push(
          window.setTimeout(() => {
            setPhase("exiting");
            timers.push(
              window.setTimeout(() => {
                shownAtRef.current = null;
                setPhase("ready");
              }, fadeMs)
            );
          }, wait)
        );
      } else {
        shownAtRef.current = null;
        setPhase("ready");
      }
    }

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [isLoading, reducedMotion]);

  return {
    phase,
    showLoader: phase === "visible" || phase === "exiting",
    showContent: phase === "ready",
    isExiting: phase === "exiting",
    isPending: phase === "pending",
    reducedMotion,
  };
}
