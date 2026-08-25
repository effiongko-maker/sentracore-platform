"use client";

import type { ReactNode } from "react";
import { ContentFade } from "./ContentFade";
import {
  PageLoadingState,
  type PageLoadingTone,
} from "./PageLoadingState";
import { useDeferredLoading } from "./useDeferredLoading";

/**
 * UX-only gate: delays loader display, fades skeleton → content.
 * Does not alter data fetching.
 */
export function LoadingGate({
  loading,
  skeleton,
  status,
  messages,
  title,
  tone = "light",
  children,
  /** Keep rendering children under the loader once first paint happened. */
  retainContent = false,
}: {
  loading: boolean;
  skeleton: ReactNode;
  /** Primary branded status line. */
  status?: string;
  messages?: readonly string[];
  title?: string;
  tone?: PageLoadingTone;
  children: ReactNode;
  retainContent?: boolean;
}) {
  const { showLoader, showContent, isExiting, isPending } =
    useDeferredLoading(loading);

  if (showLoader) {
    return (
      <PageLoadingState
        skeleton={skeleton}
        status={status}
        messages={messages}
        isExiting={isExiting}
        title={title}
        tone={tone}
      />
    );
  }

  // Fast path: still loading but under show-delay — avoid flash.
  if (isPending || loading) {
    return retainContent && showContent ? (
      <ContentFade>{children}</ContentFade>
    ) : (
      <div className="min-h-[240px]" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (!showContent) {
    return <div className="min-h-[240px]" aria-hidden />;
  }

  return <ContentFade>{children}</ContentFade>;
}
