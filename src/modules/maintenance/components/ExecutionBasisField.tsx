"use client";

import { FormField, selectClassName } from "@/components/forms/FormField";
import { WORK_COMMERCIAL_ROUTE_OPTIONS } from "../constants";
import type { WorkCommercialRoute } from "../types";

/**
 * Execution basis (fm_work.commercial_route) — the route this Work follows. An explicit choice: it starts unselected
 * and is never defaulted or inferred. `lockedReason` makes it read-only once downstream workflow exists.
 */
export function ExecutionBasisField({
  id,
  value,
  onChange,
  error,
  disabled,
  lockedReason,
  className,
}: {
  id: string;
  value: WorkCommercialRoute | "";
  onChange: (value: WorkCommercialRoute | "") => void;
  error?: string;
  disabled?: boolean;
  lockedReason?: string;
  className?: string;
}) {
  return (
    <FormField
      label="Execution basis"
      htmlFor={id}
      required
      error={error}
      hint={lockedReason}
      className={className}
    >
      <select
        id={id}
        className={selectClassName}
        value={value}
        disabled={disabled || Boolean(lockedReason)}
        onChange={(event) => onChange(event.target.value as WorkCommercialRoute | "")}
      >
        <option value="" disabled>
          Select execution basis…
        </option>
        {WORK_COMMERCIAL_ROUTE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {`${option.label} — ${option.description}`}
          </option>
        ))}
      </select>
    </FormField>
  );
}
