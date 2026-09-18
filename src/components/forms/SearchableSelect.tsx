"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { selectClassName } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra text used only for filtering (facility, aliases, etc.). */
  searchText?: string;
};

export type SearchableSelectOptionGroup = {
  label: string;
  options: SearchableSelectOption[];
};

type SearchableSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options?: SearchableSelectOption[];
  /** When set, options render under subtle section labels. */
  optionGroups?: SearchableSelectOptionGroup[];
  emptyOptionLabel?: string;
  allowEmpty?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Hide the in-menu search field (useful for short option lists). */
  hideSearch?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  /** Optional class on the open menu panel (width/height/spacing overrides). */
  menuClassName?: string;
  "aria-label"?: string;
};

type MenuPlacement = "below" | "above";

type MenuPosition = {
  left: number;
  width: number;
  placement: MenuPlacement;
  offset: number;
  listMaxHeight: number;
  menuMaxHeight: number;
};

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;
const DEFAULT_LIST_MAX = 224;
const SEARCH_CHROME_ESTIMATE = 53;

function optionMatches(option: SearchableSelectOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${option.label} ${option.searchText ?? ""} ${option.value}`
    .toLowerCase()
    .trim();
  return haystack.includes(q);
}

function computeMenuPosition(
  trigger: HTMLElement | null,
  hideSearch: boolean
): MenuPosition | null {
  const rect = trigger?.getBoundingClientRect();
  if (!rect) return null;
  const width = Math.max(rect.width, 220);
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, rect.left),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
  );
  const chrome = hideSearch ? 8 : SEARCH_CHROME_ESTIMATE;
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN - MENU_GAP;
  const spaceAbove = rect.top - VIEWPORT_MARGIN - MENU_GAP;
  const desired = chrome + DEFAULT_LIST_MAX;
  const placement: MenuPlacement =
    spaceBelow >= desired || spaceBelow >= spaceAbove ? "below" : "above";
  const available = Math.max(0, placement === "below" ? spaceBelow : spaceAbove);
  const listMaxHeight = Math.min(
    DEFAULT_LIST_MAX,
    Math.max(0, available - chrome)
  );
  const menuMaxHeight = Math.max(0, Math.min(available, chrome + listMaxHeight));
  const offset =
    placement === "below"
      ? rect.bottom + MENU_GAP
      : window.innerHeight - rect.top + MENU_GAP;
  return {
    left,
    width,
    placement,
    offset,
    listMaxHeight,
    menuMaxHeight,
  };
}

/**
 * Searchable single-select matching SentraCore form select styling.
 * Persists `option.value` only — never the display label.
 * Menu portals to document.body so it is not clipped by overflow ancestors
 * (tables, modals, drawers).
 */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  optionGroups,
  emptyOptionLabel = "Not selected",
  allowEmpty = true,
  placeholder,
  searchPlaceholder = "Search…",
  hideSearch = false,
  disabled,
  loading,
  className,
  menuClassName,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  const flatOptions = useMemo(() => {
    if (optionGroups?.length) {
      return optionGroups.flatMap((group) => group.options);
    }
    return options ?? [];
  }, [optionGroups, options]);

  const selected = flatOptions.find((option) => option.value === value) ?? null;
  const orphan =
    value && !selected
      ? ({ value, label: value } satisfies SearchableSelectOption)
      : null;

  const filteredFlat = useMemo(() => {
    const base = orphan ? [orphan, ...flatOptions] : flatOptions;
    return base.filter((option) => optionMatches(option, query));
  }, [flatOptions, orphan, query]);

  const filteredGroups = useMemo(() => {
    if (!optionGroups?.length) return null;
    const q = query.trim();
    return optionGroups
      .map((group) => ({
        label: group.label,
        options: group.options.filter((option) => optionMatches(option, q)),
      }))
      .filter((group) => group.options.length > 0);
  }, [optionGroups, query]);

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition(event?: Event) {
      if (
        event &&
        menuRef.current &&
        event.target instanceof Node &&
        menuRef.current.contains(event.target)
      ) {
        return;
      }
      const next = computeMenuPosition(rootRef.current, hideSearch);
      if (next) setMenuPos(next);
    }
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, hideSearch]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    function onWheel(event: WheelEvent) {
      event.stopPropagation();
      const list = listRef.current;
      if (!list) {
        event.preventDefault();
        return;
      }
      const delta = event.deltaY;
      const atTop = list.scrollTop <= 0;
      const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
      const overList = list.contains(event.target as Node);
      if (!overList) {
        event.preventDefault();
        return;
      }
      if ((delta < 0 && atTop) || (delta > 0 && atBottom) || list.scrollHeight <= list.clientHeight) {
        event.preventDefault();
      }
    }
    menu.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      menu.removeEventListener("wheel", onWheel);
    };
  }, [open, menuPos]);

  useEffect(() => {
    if (!open || hideSearch) return;
    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, hideSearch]);

  function selectValue(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const triggerLabel = loading
    ? "Loading…"
    : selected?.label ??
      orphan?.label ??
      (value ? value : placeholder ?? emptyOptionLabel);

  const isPlaceholder = !value && !loading;
  const hasMatches = filteredGroups
    ? filteredGroups.length > 0
    : filteredFlat.length > 0;

  function renderOption(option: SearchableSelectOption) {
    const isSelected = option.value === value;
    return (
      <li key={option.value} role="option" aria-selected={isSelected}>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40",
            isSelected && "bg-muted/30 font-medium text-foreground"
          )}
          onClick={() => selectValue(option.value)}
        >
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {isSelected ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
          ) : null}
        </button>
      </li>
    );
  }

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className={cn(
              "flex flex-col overflow-hidden rounded-[12px] border border-border bg-card shadow-lg",
              menuClassName
            )}
            style={{
              position: "fixed",
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 80,
              maxHeight: menuPos.menuMaxHeight,
              ...(menuPos.placement === "below"
                ? { top: menuPos.offset }
                : { bottom: menuPos.offset }),
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {hideSearch ? null : (
              <div className="shrink-0 border-b border-border/70 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={searchPlaceholder}
                    className="h-9 w-full rounded-md border border-border bg-white pl-8 pr-2.5 text-sm text-foreground outline-none placeholder:text-slate-400 focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
                    aria-label={searchPlaceholder}
                  />
                </div>
              </div>
            )}

            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="min-h-0 flex-1 overflow-y-auto py-1 overscroll-contain"
              style={{ maxHeight: menuPos.listMaxHeight }}
            >
              {allowEmpty ? (
                <li role="option" aria-selected={!value}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40",
                      !value && "bg-muted/30 font-medium text-foreground"
                    )}
                    onClick={() => selectValue("")}
                  >
                    <span className="min-w-0 flex-1 truncate text-muted">
                      {emptyOptionLabel}
                    </span>
                    {!value ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : null}
                  </button>
                </li>
              ) : null}

              {!hasMatches ? (
                <li className="px-3 py-2 text-sm text-muted">
                  {flatOptions.length === 0 ? "No options available" : "No matches"}
                </li>
              ) : filteredGroups ? (
                filteredGroups.map((group) => (
                  <li key={group.label} role="presentation">
                    <div
                      className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.06em] text-slate-400"
                      aria-hidden
                    >
                      {group.label}
                    </div>
                    <ul role="group" aria-label={group.label}>
                      {group.options.map(renderOption)}
                    </ul>
                  </li>
                ))
              ) : (
                filteredFlat.map(renderOption)
              )}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled || loading}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className={cn(
          selectClassName,
          "flex items-center justify-between gap-2 text-left",
          isPlaceholder && "text-slate-400"
        )}
        onClick={() => {
          if (disabled || loading) return;
          if (open) {
            setOpen(false);
            setQuery("");
            return;
          }
          const next = computeMenuPosition(rootRef.current, hideSearch);
          if (next) setMenuPos(next);
          setOpen(true);
        }}
      >
        <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
