"use client";

import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useUsers } from "../hooks/useUsers";
import type { UserModalState } from "../types";
import { UserFormModal } from "./UserFormModal";
import { UsersTable } from "./UsersTable";
import { UsersToolbar } from "./UsersToolbar";
import { ViewUserModal } from "./ViewUserModal";

export function UsersPage() {
  const { toast } = useToast();
  const {
    users,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    role,
    setRole,
    facility,
    setFacility,
    page,
    setPage,
    totalPages,
    total,
    reload,
    deactivateUser,
  } = useUsers();

  const [modal, setModal] = useState<UserModalState>({ type: "closed" });
  const [deactivating, setDeactivating] = useState(false);

  async function handleDeactivate() {
    if (modal.type !== "deactivate") return;

    setDeactivating(true);
    try {
      await deactivateUser(modal.user.id);
      toast({
        type: "success",
        title: "User deactivated",
        description: `${modal.user.name} is now inactive.`,
      });
      setModal({ type: "closed" });
      reload();
    } catch (err) {
      toast({
        type: "error",
        title: "Unable to deactivate user",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage people, roles, and access."
        actions={
          <Button onClick={() => setModal({ type: "create" })}>
            <Plus className="h-4 w-4" />
            New User
          </Button>
        }
      />

      <UsersToolbar
        search={search}
        onSearchChange={setSearch}
        role={role}
        onRoleChange={setRole}
        facility={facility}
        onFacilityChange={setFacility}
        status={status}
        onStatusChange={setStatus}
      />

      {error ? (
        <EmptyState
          icon={Users}
          title="Couldn’t load users"
          description={error}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : (
        <div className="overflow-x-auto">
          <UsersTable
            users={users}
            loading={loading}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            onView={(user) => setModal({ type: "view", user })}
            onEdit={(user) => setModal({ type: "edit", user })}
            onDeactivate={(user) => setModal({ type: "deactivate", user })}
          />
        </div>
      )}

      <UserFormModal
        open={modal.type === "create" || modal.type === "edit"}
        mode={modal.type === "edit" ? "edit" : "create"}
        user={modal.type === "edit" ? modal.user : null}
        onClose={() => setModal({ type: "closed" })}
        onSaved={reload}
      />

      <ViewUserModal
        open={modal.type === "view"}
        user={modal.type === "view" ? modal.user : null}
        onClose={() => setModal({ type: "closed" })}
        onEdit={(user) => setModal({ type: "edit", user })}
      />

      <ConfirmDialog
        open={modal.type === "deactivate"}
        onClose={() => setModal({ type: "closed" })}
        onConfirm={handleDeactivate}
        title="Deactivate user?"
        description={
          modal.type === "deactivate"
            ? `${modal.user.name} will lose access until reactivated. Users are never deleted.`
            : undefined
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
      />
    </div>
  );
}
