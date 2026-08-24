export type UserStatus = "active" | "inactive" | "pending" | "suspended";

export type UserRole =
  | "admin"
  | "manager"
  | "technician"
  | "viewer"
  | "supervisor";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  specialization: string;
  facility: string;
  /** Derived later from open work orders — never entered in forms. */
  activeWorkOrders: number;
  status: UserStatus;
  avatarUrl?: string;
  lastActive: string;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  specialization: string;
  facility: string;
  status: UserStatus;
}

export type UpdateUserInput = Partial<CreateUserInput>;

export interface UserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: UserStatus | "all";
  role?: UserRole | "all";
  facility?: string | "all";
}

/**
 * Compact chrome identity for the signed-in platform user.
 * Role is a display label from platform role assignments (not FM sheet roles).
 */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarInitials: string;
  organisationId?: string | null;
  organisationName?: string | null;
  roleSlugs?: string[];
}

export type UserModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; user: User }
  | { type: "view"; user: User }
  | { type: "deactivate"; user: User };
