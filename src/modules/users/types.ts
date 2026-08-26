export type UserStatus = "active" | "inactive" | "pending" | "suspended";

/** Sheet role labels are free-form (e.g. CEO, Facility Manager). */
export type UserRole = string;

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  specialization: string;
  facility: string;
  /**
   * Display value for USERS sheet "Current Workload".
   * Derived live from active Work Orders assigned to this user id
   * (not the stale sheet cell). Field name retained for API compatibility.
   */
  activeWorkOrders: number;
  /** Empty when the sheet Status cell is blank. */
  status: UserStatus | "";
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

/** Client-side list sort — matches Assets toolbar pattern. */
export type UserSort = "newest";

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
