"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function OperationalPageHeader({
  title,
  description,
  countValue,
  countLabel,
  actionLabel,
  onAction,
  loading,
}: {
  title: string;
  description: string;
  countValue: string | number;
  countLabel: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  const showAction = Boolean(actionLabel && onAction);

  return (
    <header className="op-header">
      <div className="op-header-copy">
        <h1 className="op-header-title">{title}</h1>
        <p className="op-header-desc">{description}</p>
      </div>
      <div className="op-header-actions">
        <div className="op-count" aria-live="polite">
          <span className="op-count-value">{loading ? "—" : countValue}</span>
          <span className="op-count-label">{countLabel}</span>
        </div>
        {showAction ? (
          <Button onClick={onAction}>
            <Plus className="h-4 w-4" />
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
