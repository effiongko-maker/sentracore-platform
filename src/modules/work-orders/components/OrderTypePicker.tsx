"use client";

import {
  WORK_INSTRUCTION_KIND_LABELS,
  WORK_INSTRUCTION_KIND_OPTIONS,
  type WorkInstructionKind,
} from "../instructionKind";

/**
 * Manual Order Type selection for one-click Work Instruction creation.
 * No default — the person chooses Work Order or Job Order. Never inferred
 * from cost.
 */
export function OrderTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: WorkInstructionKind | "";
  onChange: (value: WorkInstructionKind | "") => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label="Order Type"
      className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as WorkInstructionKind | "")}
    >
      <option value="">Order Type…</option>
      {WORK_INSTRUCTION_KIND_OPTIONS.map((kind) => (
        <option key={kind} value={kind}>
          {WORK_INSTRUCTION_KIND_LABELS[kind]}
        </option>
      ))}
    </select>
  );
}
