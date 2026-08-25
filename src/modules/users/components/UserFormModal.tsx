"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import {
  USER_ROLE_SUGGESTIONS,
  USER_SPECIALIZATIONS,
  USER_STATUSES,
} from "../constants";
import { UserService } from "../services/UserService";
import {
  labelize,
  resolveFacilityDisplayName,
  toCreateFormValues,
} from "../utils";
import type { CreateUserInput, User, UserStatus } from "../types";

interface UserFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  user?: User | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}

export function UserFormModal({
  open,
  mode,
  user,
  onClose,
  onSaved,
}: UserFormModalProps) {
  const { toast } = useToast();
  const { facilities, loading: facilitiesLoading } = useFacilityOptions(open);
  const [form, setForm] = useState<CreateUserInput>(toCreateFormValues());
  const [errors, setErrors] = useState<
    Partial<Record<keyof CreateUserInput, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!open) return;
    setForm(toCreateFormValues(mode === "edit" ? user : null));
    setErrors({});
  }, [open, mode, user]);

  useEffect(() => {
    if (!open || facilities.length === 0) return;
    setForm((current) => {
      const resolved = resolveFacilityDisplayName(current.facility, facilities);
      if (!resolved || resolved === current.facility) return current;
      return { ...current, facility: resolved === "-" ? "" : resolved };
    });
  }, [open, facilities]);

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
    if (!form.role.trim()) next.role = "Role is required";
    if (!form.specialization.trim()) {
      next.specialization = "Specialization is required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current || saving) return;
    if (!validate()) return;

    submitLock.current = true;
    setSaving(true);
    try {
      const facilityName = form.facility.trim()
        ? resolveFacilityDisplayName(form.facility, facilities)
        : "-";

      const payload: CreateUserInput = {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || undefined,
        role: form.role.trim(),
        specialization: form.specialization.trim(),
        facility: facilityName,
      };

      if (mode === "edit" && user) {
        await UserService.updateUser(user.id, payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "User updated",
          description: `${payload.name}'s profile has been saved.`,
        });
      } else {
        await UserService.createUser(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "User created",
          description: `${payload.name} has been added to the directory.`,
        });
      }

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
      submitLock.current = false;
    }
  }

  const isEdit = mode === "edit";
  const facilitySelectValue = form.facility.trim();

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
          : "Add a person to the People register with their role and facility assignment."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving} disabled={saving}>
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
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={inputClassName}
            placeholder="e.g. 08077960315"
            value={form.phone ?? ""}
            onChange={(event) => updateField("phone", event.target.value)}
          />
        </FormField>

        <FormField
          label="Role"
          htmlFor="user-role"
          required
          error={errors.role}
        >
          <input
            id="user-role"
            list="user-role-suggestions"
            className={inputClassName}
            placeholder="e.g. Facility Manager"
            value={form.role}
            onChange={(event) => updateField("role", event.target.value)}
          />
          <datalist id="user-role-suggestions">
            {USER_ROLE_SUGGESTIONS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </FormField>

        <FormField
          label="Specialization"
          htmlFor="user-specialization"
          required
          error={errors.specialization}
        >
          <input
            id="user-specialization"
            list="user-specialization-suggestions"
            className={inputClassName}
            placeholder="e.g. HVAC"
            value={form.specialization}
            onChange={(event) =>
              updateField("specialization", event.target.value)
            }
          />
          <datalist id="user-specialization-suggestions">
            {USER_SPECIALIZATIONS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </FormField>

        <FormField label="Facility" htmlFor="user-facility">
          <select
            id="user-facility"
            className={selectClassName}
            value={facilitySelectValue}
            onChange={(event) =>
              updateField("facility", event.target.value)
            }
            disabled={facilitiesLoading}
          >
            <option value="">
              {facilitiesLoading ? "Loading facilities…" : "None / organisation-wide"}
            </option>
            {facilitySelectValue &&
            !facilities.some((item) => item.name === facilitySelectValue) ? (
              <option value={facilitySelectValue}>{facilitySelectValue}</option>
            ) : null}
            {facilities.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
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
