"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { Button } from "@/components/ui/Button";
import {
  FormField,
  selectClassName,
} from "@/components/forms/FormField";
import { useToast } from "@/components/ui/Toast";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import {
  V1_DEPLOYED_FACILITY_NAME,
  V1_OPERATING_ROLE_OPTIONS,
  parseV1OperatingRole,
  v1OperatingRoleLabel,
} from "@/lib/access";
import { USER_MANAGE_STATUSES } from "../constants";
import { UserService } from "../services/UserService";
import {
  formatWorkload,
  labelize,
  toCreateFormValues,
} from "../utils";
import type {
  CreateUserInput,
  EligibleProfile,
  User,
  UserStatus,
} from "../types";

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
  const {
    facilities,
    loading: facilitiesLoading,
    error: facilitiesError,
  } = useFacilityOptions(open);
  const [form, setForm] = useState<CreateUserInput>(toCreateFormValues());
  const [eligible, setEligible] = useState<EligibleProfile[]>([]);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [eligibleLoading, setEligibleLoading] = useState(false);
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
    if (!open || mode !== "create") return;
    let cancelled = false;
    setEligibleLoading(true);
    setEligibleError(null);
    void UserService.listEligibleProfiles()
      .then((rows) => {
        if (cancelled) return;
        setEligible(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEligible([]);
        setEligibleError(
          err instanceof Error
            ? err.message
            : "Unable to load eligible people."
        );
      })
      .finally(() => {
        if (!cancelled) setEligibleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open || facilities.length === 0) return;
    setForm((current) => {
      if (current.facilityId) return current;
      if (current.facility.trim()) {
        const match = facilities.find(
          (item) =>
            item.id === current.facility || item.name === current.facility
        );
        if (match) {
          return { ...current, facility: match.name, facilityId: match.id };
        }
        return current;
      }
      if (mode === "create") {
        const preferred =
          facilities.find((item) => item.name === V1_DEPLOYED_FACILITY_NAME) ??
          facilities[0];
        if (preferred) {
          return {
            ...current,
            facility: preferred.name,
            facilityId: preferred.id,
          };
        }
      }
      return current;
    });
  }, [open, facilities, mode]);

  function updateField<K extends keyof CreateUserInput>(
    key: K,
    value: CreateUserInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof CreateUserInput, string>> = {};
    if (mode === "create" && !form.profileId?.trim()) {
      next.profileId = "Select an existing platform person";
    }
    if (!form.role.trim()) next.role = "Operating role is required";
    else if (!parseV1OperatingRole(form.role)) {
      next.role = "Select a V1 operating role";
    }
    if (!form.facilityId?.trim() && !form.facility.trim()) {
      next.facility = "Facility is required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current || saving) return;
    if (facilitiesError) {
      toast({
        type: "error",
        title: "Facilities unavailable",
        description: facilitiesError,
      });
      return;
    }
    if (!validate()) return;

    submitLock.current = true;
    setSaving(true);
    try {
      const roleSlug = parseV1OperatingRole(form.role);
      const selectedFacility = facilities.find(
        (item) =>
          item.id === form.facilityId || item.name === form.facility
      );
      const payload: CreateUserInput = {
        ...form,
        profileId: form.profileId,
        role: roleSlug ? v1OperatingRoleLabel(roleSlug) : form.role.trim(),
        facility: selectedFacility?.name ?? form.facility,
        facilityId: selectedFacility?.id ?? form.facilityId ?? form.facility,
        assignmentId: user?.assignmentId,
        status: form.status,
      };

      if (mode === "edit" && user) {
        await UserService.updateUser(user.id, payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Assignment updated",
          description: `${user.name}'s facility assignment has been saved.`,
        });
      } else {
        const selected = eligible.find((row) => row.id === payload.profileId);
        await UserService.createUser(payload);
        await onSaved?.();
        toast({
          type: "success",
          title: "Person assigned",
          description: `${selected?.name ?? "Person"} is assigned to ${payload.facility}.`,
        });
      }

      onClose();
    } catch (err) {
      toast({
        type: "error",
        title:
          mode === "edit"
            ? "Unable to update assignment"
            : "Unable to assign person",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
      submitLock.current = false;
    }
  }

  const isEdit = mode === "edit";
  const facilitySelectValue = form.facilityId || form.facility.trim();
  const roleSelectValue =
    parseV1OperatingRole(form.role) ??
    (form.role.trim() ? "__legacy__" : "");
  const selectedPerson = eligible.find((row) => row.id === form.profileId);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isEdit ? "Edit assignment" : "Assign person"}
      description={
        isEdit
          ? "Update facility, operating role, and assignment status. This does not change their SentraCore account."
          : "Assign an existing platform person to a facility. New accounts are invited from Admin Console."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="user-form"
            loading={saving}
            disabled={saving || Boolean(facilitiesError) || Boolean(eligibleError)}
          >
            {isEdit ? "Save assignment" : "Assign person"}
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        {isEdit && user ? (
          <div className="sm:col-span-2 rounded-xl border border-border/80 bg-slate-50/80 px-4 py-3">
            <p className="text-sm font-medium text-foreground">{user.name}</p>
            <p className="mt-0.5 text-sm text-muted">{user.email}</p>
          </div>
        ) : (
          <FormField
            label="Person"
            htmlFor="user-profile"
            required
            error={errors.profileId || eligibleError || undefined}
            className="sm:col-span-2"
          >
            <select
              id="user-profile"
              className={selectClassName}
              value={form.profileId ?? ""}
              onChange={(event) => {
                const next = eligible.find((row) => row.id === event.target.value);
                updateField("profileId", event.target.value);
                updateField("name", next?.name ?? "");
                updateField("email", next?.email ?? "");
              }}
              disabled={eligibleLoading}
            >
              <option value="">
                {eligibleLoading
                  ? "Loading people…"
                  : eligibleError
                    ? "People directory unavailable"
                    : "Select an existing person…"}
              </option>
              {eligible.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.email})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              {selectedPerson
                ? "This assigns an existing SentraCore person. It does not send an invitation."
                : "Invite new people from Admin Console, then assign them here."}
            </p>
          </FormField>
        )}

        <FormField
          label="Operating role"
          htmlFor="user-role"
          required
          error={errors.role}
        >
          <select
            id="user-role"
            className={selectClassName}
            value={roleSelectValue === "__legacy__" ? "" : roleSelectValue}
            onChange={(event) => {
              const slug = parseV1OperatingRole(event.target.value);
              updateField(
                "role",
                slug ? v1OperatingRoleLabel(slug) : event.target.value
              );
            }}
          >
            <option value="">Select operating role…</option>
            {roleSelectValue === "__legacy__" ? (
              <option value="" disabled>
                Current: {form.role} (choose a V1 role)
              </option>
            ) : null}
            {V1_OPERATING_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Operating context only. Permissions come from platform capability grants.
          </p>
        </FormField>

        <FormField label="Assignment status" htmlFor="user-status" required>
          <select
            id="user-status"
            className={selectClassName}
            value={
              USER_MANAGE_STATUSES.includes(form.status)
                ? form.status
                : "active"
            }
            onChange={(event) =>
              updateField("status", event.target.value as UserStatus)
            }
          >
            {USER_MANAGE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {labelize(value)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Facility"
          htmlFor="user-facility"
          required
          error={errors.facility || facilitiesError || undefined}
          className="sm:col-span-2"
        >
          <select
            id="user-facility"
            className={selectClassName}
            value={facilitySelectValue}
            onChange={(event) => {
              const match = facilities.find(
                (item) =>
                  item.id === event.target.value ||
                  item.name === event.target.value
              );
              updateField("facility", match?.name ?? event.target.value);
              updateField("facilityId", match?.id ?? event.target.value);
            }}
            disabled={facilitiesLoading || Boolean(facilitiesError)}
          >
            <option value="">
              {facilitiesLoading
                ? "Loading facilities…"
                : facilitiesError
                  ? "Facilities unavailable"
                  : facilities.length === 0
                    ? "No facilities configured"
                    : "Select facility…"}
            </option>
            {facilities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
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
              {formatWorkload(user.activeWorkOrders, user.workloadAvailable !== false)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {user.workloadAvailable === false
                ? "Workload cannot be derived until Work uses platform profile identity."
                : "Derived from active Work Orders assigned to this person. Not editable."}
            </p>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
