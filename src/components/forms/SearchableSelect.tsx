"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { selectClassName } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra text used only for filtering (facility, aliases, etc.). */
  searchText?: string;
};

type SearchableSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  emptyOptionLabel?: string;
  allowEmpty?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  "aria-label"?: string;
};

function optionMatches(option: SearchableSelectOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${option.label} ${option.searchText ?? ""} ${option.value}`
    .toLowerCase()
    .trim();
  return haystack.includes(q);
}

/**
 * Searchable single-select matching SentraCore form select styling.
 * Persists `option.value` only — never the display label.
 */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  emptyOptionLabel = "Not selected",
  allowEmpty = true,
  placeholder,
  searchPlaceholder = "Search…",
  disabled,
  loading,
  className,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.value === value) ?? null;
  const orphan =
    value && !selected
      ? ({ value, label: value } satisfies SearchableSelectOption)
      : null;

  const filtered = useMemo(() => {
    const base = orphan ? [orphan, ...options] : options;
    return base.filter((option) => optionMatches(option, query));
  }, [options, orphan, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

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
          setOpen((current) => !current);
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

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-[12px] border border-border bg-card shadow-lg">
          <div className="border-b border-border/70 p-2">
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

          <ul
            id={listboxId}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
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

            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">No matches</li>
            ) : (
              filtered.map((option) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40",
                        isSelected && "bg-muted/30 font-medium text-foreground"
                      )}
                      onClick={() => selectValue(option.value)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
