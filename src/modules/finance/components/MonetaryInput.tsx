"use client";

import {
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { inputClassName } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import {
  caretFromKeepableCount,
  countKeepableChars,
  formatMonetaryDisplay,
  sanitizeMonetaryInput,
} from "../utils/monetaryInput";

export type MonetaryInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: string;
  onValueChange: (formatted: string) => void;
  allowDecimal?: boolean;
};

function applyFormat(
  raw: string,
  caret: number,
  allowDecimal: boolean
): { display: string; caret: number } {
  const keepable = countKeepableChars(raw, caret);
  const display = formatMonetaryDisplay(
    sanitizeMonetaryInput(raw, allowDecimal)
  );
  return {
    display,
    caret: caretFromKeepableCount(display, keepable),
  };
}

export function MonetaryInput({
  value,
  onValueChange,
  allowDecimal = true,
  className,
  disabled,
  ...rest
}: MonetaryInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const caret = pendingCaret.current;
    if (!el || caret == null) return;
    el.setSelectionRange(caret, caret);
    pendingCaret.current = null;
  }, [value]);

  function commit(raw: string, caret: number) {
    const next = applyFormat(raw, caret, allowDecimal);
    pendingCaret.current = next.caret;
    onValueChange(next.display);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    rest.onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;
    const el = event.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start !== end) return;

    if (event.key === "Backspace" && start > 0 && el.value[start - 1] === ",") {
      event.preventDefault();
      const raw = el.value.slice(0, Math.max(0, start - 2)) + el.value.slice(start);
      commit(raw, Math.max(0, start - 2));
      return;
    }

    if (
      event.key === "Delete" &&
      start < el.value.length &&
      el.value[start] === ","
    ) {
      event.preventDefault();
      const raw = el.value.slice(0, start) + el.value.slice(start + 2);
      commit(raw, start);
    }
  }

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      autoComplete="off"
      disabled={disabled}
      className={cn(inputClassName, className)}
      value={value}
      onChange={(event) => {
        const el = event.target;
        commit(el.value, el.selectionStart ?? el.value.length);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
