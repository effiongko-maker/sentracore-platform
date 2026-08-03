"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
} from "react";

interface SidebarContextValue {
  collapsed: boolean;
  mobileOpen: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (value: boolean) => void;
  openMobile: () => void;
  closeMobile: () => void;
}

export const SidebarContext: Context<SidebarContextValue | null> =
  createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "sentracore.sidebar.collapsed";

export function useSidebarState(): SidebarContextValue {
  const [collapsed, setCollapsedState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored === "true") setCollapsedState(true);
    } catch {
      // sessionStorage may be unavailable
    }
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore quota / privacy mode failures
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((previous) => {
      const next = !previous;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobile();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, closeMobile]);

  return useMemo(
    () => ({
      collapsed,
      mobileOpen,
      toggleCollapsed,
      setCollapsed,
      openMobile,
      closeMobile,
    }),
    [
      collapsed,
      mobileOpen,
      toggleCollapsed,
      setCollapsed,
      openMobile,
      closeMobile,
    ]
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within AppShell");
  }
  return context;
}
