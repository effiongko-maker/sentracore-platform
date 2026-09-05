"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  filterOperatingLayers,
  OPERATING_LAYERS,
} from "@/lib/platform/layers";
import { cn } from "@/lib/utils";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { usePlatformShell } from "@/hooks/usePlatformShell";
import { resolveAccessVisibility } from "@/lib/access";

type PaletteAction = {
  id: string;
  label: string;
  description?: string;
  href: string;
  group: string;
  /** When set, only shown if the actor has this mutation capability. */
  requireCapability?: "ops.create";
};

const CREATE_ACTIONS: PaletteAction[] = [
  {
    id: "log-issue",
    label: "Log an issue",
    description: "Act",
    href: "/issues",
    group: "Create",
    requireCapability: "ops.create",
  },
  {
    id: "create-maintenance",
    label: "Request maintenance",
    description: "Act",
    href: "/occupant-requests?type=maintenance",
    group: "Create",
    requireCapability: "ops.create",
  },
  {
    id: "create-work-order",
    label: "Go to Work Orders",
    description: "Work",
    href: "/work-orders",
    group: "Navigate",
  },
];

export function CommandPalette() {
  const router = useRouter();
  const { enabledModules } = usePlatformSession();
  const { access, can, loading: accessLoading } = useOperatingAccess();
  const { commandPaletteOpen, closeCommandPalette } = usePlatformShell();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const actions = useMemo(() => {
    const visibility =
      !accessLoading && access ? resolveAccessVisibility(access) : null;
    const layers = filterOperatingLayers(
      OPERATING_LAYERS,
      enabledModules,
      visibility
    );
    const nav: PaletteAction[] = [
      {
        id: "nav-platform",
        label: "SentraCore Platform Home",
        description: "Platform",
        href: "/",
        group: "Navigate",
      },
      {
        id: "nav-operations",
        label: "Enter Facility Management",
        description: "Facility Management",
        href: "/operations",
        group: "Navigate",
      },
    ];

    for (const layer of layers) {
      for (const mod of layer.modules) {
        if (mod.comingSoon) continue;
        nav.push({
          id: `nav-${mod.href}`,
          label: mod.label,
          description: layer.label,
          href: mod.href,
          group: "Navigate",
        });
      }
    }

    const creates = CREATE_ACTIONS.filter((action) => {
      if (!action.requireCapability) return true;
      if (accessLoading || !access) return false;
      return can(action.requireCapability);
    });

    return [...creates, ...nav];
  }, [enabledModules, access, accessLoading, can]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.group.toLowerCase().includes(q)
    );
  }, [actions, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteAction[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [filtered]);

  const flatFiltered = useMemo(() => Array.from(grouped.values()).flat(), [grouped]);

  const runAction = useCallback(
    (action: PaletteAction) => {
      closeCommandPalette();
      setQuery("");
      router.push(action.href);
    },
    [closeCommandPalette, router]
  );

  useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!commandPaletteOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCommandPalette();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && flatFiltered[activeIndex]) {
        e.preventDefault();
        runAction(flatFiltered[activeIndex]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandPaletteOpen, flatFiltered, activeIndex, closeCommandPalette, runAction]);

  if (!commandPaletteOpen) return null;

  let itemIndex = -1;

  return (
    <>
      <div
        className="os-palette-backdrop"
        onClick={closeCommandPalette}
        aria-hidden
      />
      <div className="os-palette" role="dialog" aria-label="Command palette">
        <input
          autoFocus
          type="search"
          className="os-palette-input"
          placeholder="Search, navigate, create…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Command search"
        />
        <div className="os-palette-list" role="listbox">
          {flatFiltered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--os-ink-muted)]">
              No matching commands.
            </p>
          ) : (
            Array.from(grouped.entries()).map(([group, items]) => (
              <div key={group}>
                <p className="os-palette-group-label">{group}</p>
                {items.map((item) => {
                  itemIndex += 1;
                  const idx = itemIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={idx === activeIndex}
                      className={cn(
                        "os-palette-item",
                        idx === activeIndex && "os-palette-item-active"
                      )}
                      onClick={() => runAction(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <span>{item.label}</span>
                      {item.description ? (
                        <span className="os-palette-item-desc">
                          {item.description}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
