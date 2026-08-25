"use client";

import { Search, X } from "lucide-react";

export function OperationalSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const hasValue = value.trim().length > 0;

  return (
    <div className="op-search">
      <Search className="op-search-icon" strokeWidth={2} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder || "Search"}
        autoComplete="off"
        spellCheck={false}
      />
      {hasValue ? (
        <button
          type="button"
          className="op-search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
