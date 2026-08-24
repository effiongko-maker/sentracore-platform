"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  productModeFromPath,
  shellNavStateForMode,
  type ProductMode,
  type ShellNavState,
} from "@/lib/platform/modes";

type PlatformShellContextValue = {
  productMode: ProductMode;
  navState: ShellNavState;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  enterFocus: () => void;
  exitFocus: () => void;
};

const PlatformShellContext = createContext<PlatformShellContextValue | null>(
  null
);

export function PlatformShellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const productMode = productModeFromPath(pathname);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
    setCommandPaletteOpen(false);
    setFocusMode(false);
  }, [pathname]);

  const navState: ShellNavState = focusMode
    ? "focus"
    : shellNavStateForMode(productMode);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const toggleCommandPalette = useCallback(
    () => setCommandPaletteOpen((v) => !v),
    []
  );
  const enterFocus = useCallback(() => setFocusMode(true), []);
  const exitFocus = useCallback(() => setFocusMode(false), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandPalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCommandPalette]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileNav();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, closeMobileNav]);

  const value = useMemo(
    () => ({
      productMode,
      navState,
      mobileNavOpen,
      commandPaletteOpen,
      openMobileNav,
      closeMobileNav,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      enterFocus,
      exitFocus,
    }),
    [
      productMode,
      navState,
      mobileNavOpen,
      commandPaletteOpen,
      openMobileNav,
      closeMobileNav,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      enterFocus,
      exitFocus,
    ]
  );

  return (
    <PlatformShellContext.Provider value={value}>
      {children}
    </PlatformShellContext.Provider>
  );
}

export function usePlatformShell() {
  const ctx = useContext(PlatformShellContext);
  if (!ctx) {
    throw new Error("usePlatformShell must be used within ProductShell");
  }
  return ctx;
}
