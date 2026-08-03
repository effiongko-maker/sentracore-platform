"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import {
  USER_FACILITIES,
  USER_ROLES,
  USER_SPECIALIZATIONS,
  USER_STATUSES,
} from "../constants";
import { UserService } from "../services/UserService";
import { labelize, toCreateFormValues } from "../utils";
import type { CreateUserInput, User, UserRole, UserStatus } from "../types";

interface UserFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  user?: User | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function UserFormModal({
  open,
  mode,
  user,
  onClose,
  onSaved,
}: UserFormModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<CreateUserInput>(toCreateFormValues());
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateUserInput, string>>
  >({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? user : null));
    setErrors({});
  }, [open, mode, user]);

  function updateField<K extends keyof CreateUserInput>(
    key: K,
    value: CreateUserInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof CreateUserInput, string>> = {};
    if (!form.name.trim()) next.name = "Full name is required";
    if (!form.email.trim()) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = "Enter a valid email address";
    }
    if (!form.specialization.trim()) {
      next.specialization = "Specialization is required";
    }
    if (!form.facility.trim()) next.facility = "Facility is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: CreateUserInput = {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || undefined,
        specialization: form.specialization.trim(),
        facility: form.facility.trim(),
      };

      if (mode === "edit" && user) {
        await UserService.updateUser(user.id, payload);
        toast({
          type: "success",
          title: "User updated",
          description: `${payload.name}'s profile has been saved.`,
        });
      } else {
        await UserService.createUser(payload);
        toast({
          type: "success",
          title: "User created",
          description: `${payload.name} has been added to the directory.`,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast({
        type: "error",
        title: mode === "edit" ? "Unable to update user" : "Unable to create user",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isEdit ? "Edit user" : "New user"}
      description={
        isEdit
          ? "Update profile details, assignment, and access status."
          : "Invite a colleague and assign their role within SentraCore."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            {isEdit ? "Save changes" : "Create user"}
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField
          label="Full name"
          htmlFor="user-name"
          required
          error={errors.name}
          className="sm:col-span-2"
        >
          <input
            id="user-name"
            className={inputClassName}
            placeholder="e.g. Amara Okonkwo"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </FormField>

        <FormField
          label="Email"
          htmlFor="user-email"
          required
          error={errors.email}
        >
          <input
            id="user-email"
            type="email"
            className={inputClassName}
            placeholder="name@company.com"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
          />
        </FormField>

        <FormField label="Phone" htmlFor="user-phone">
          <input
            id="user-phone"
            className={inputClassName}
            placeholder="+44 7700 900000"
            value={form.phone ?? ""}
            onChange={(event) => updateField("phone", event.target.value)}
          />
        </FormField>

        <FormField label="Role" htmlFor="user-role" required>
          <select
            id="user-role"
            className={selectClassName}
            value={form.role}
            onChange={(event) =>
              updateField("role", event.target.value as UserRole)
            }
          >
            {USER_ROLES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Specialization"
          htmlFor="user-specialization"
          required
          error={errors.specialization}
        >
          <select
            id="user-specialization"
            className={selectClassName}
            value={form.specialization}
            onChange={(event) =>
              updateField("specialization", event.target.value)
            }
          >
            {USER_SPECIALIZATIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Facility"
          htmlFor="user-facility"
          required
          error={errors.facility}
        >
          <select
            id="user-facility"
            className={selectClassName}
            value={form.facility}
            onChange={(event) => updateField("facility", event.target.value)}
          >
            {USER_FACILITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Status" htmlFor="user-status" required>
          <select
            id="user-status"
            className={selectClassName}
            value={form.status}
            onChange={(event) =>
              updateField("status", event.target.value as UserStatus)
            }
          >
            {USER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        {isEdit && user ? (
          <div className="sm:col-span-2 rounded-xl border border-border/80 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Current Workload
            </p>
            <p className="mt-1 text-sm text-foreground">
              {user.activeWorkOrders} Active Work Order
              {user.activeWorkOrders === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Calculated automatically from open work orders. Not editable.
            </p>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
