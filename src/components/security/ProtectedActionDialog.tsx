"use client";

import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
} from "@/components/forms/FormField";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import type { ProtectedActionId } from "@/lib/access";

export type ProtectedActionProof = {
  stepUpPassword?: string;
};

type Props = {
  open: boolean;
  actionId: ProtectedActionId;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (proof: ProtectedActionProof) => void | Promise<void>;
};

/**
 * Simple FM step-up prompt. Super Admin confirms without password.
 */
export function ProtectedActionDialog({
  open,
  actionId,
  title,
  description,
  confirmLabel = "Authorize",
  onClose,
  onConfirm,
}: Props) {
  const { access, can } = useOperatingAccess();
  const isSuperAdmin =
    Boolean(access?.hasAdminOverride) || can("platform.admin_override");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    if (!isSuperAdmin && !password.trim()) {
      setError("Enter your password to authorize this action.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(
        isSuperAdmin ? {} : { stepUpPassword: password }
      );
      setPassword("");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Authorization failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) {
          setPassword("");
          setError(null);
          onClose();
        }
      }}
      title={title}
      description={description}
      size="md"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={submitting}
            disabled={submitting}
            onClick={() => void handleConfirm()}
          >
            {isSuperAdmin ? "Override" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted mb-4">
        Protected action: <code className="text-xs">{actionId}</code>
      </p>
      {isSuperAdmin ? (
        <p className="text-sm text-foreground rounded-lg border border-border/80 bg-slate-50 px-3 py-2">
          System Administrator override — Facility Manager password is not
          required. This will be recorded as a platform override.
        </p>
      ) : (
        <FormField
          label="Facility Manager password"
          htmlFor="protected-step-up"
          required
          error={error ?? undefined}
        >
          <input
            id="protected-step-up"
            type="password"
            autoComplete="current-password"
            className={inputClassName}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleConfirm();
              }
            }}
          />
        </FormField>
      )}
      {isSuperAdmin && error ? (
        <p className="mt-2 text-sm text-danger">{error}</p>
      ) : null}
    </Modal>
  );
}
