export type UserStatus = "active" | "inactive" | "pending" | "suspended";

/** Sheet role labels — V1 uses Facility Manager / FM Staff / Liaison Officer / Finance / NCC / Client. */
export type UserRole = string;

/** Platform profile eligible for an FM facility assignment. */
export type EligibleProfile = {
  id: string;
  name: string;
  email: string;
  status: string;
};

export interface User {
  /** Canonical identity: platform profile UUID. */
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  specialization: string;
  facility: string;
  facilityId?: string;
  assignmentId?: string;
  /**
   * Display value for current Active Work (fm_work assigned to profile).
   * Not stored. Does not include Work Instructions (still Apps Script).
   */
  activeWorkOrders: number;
  workloadWorkOrderIds?: string[];
  /** False when workload cannot be derived without fabricating a zero. */
  workloadAvailable?: boolean;
  /** Assignment status for the People directory row. */
  status: UserStatus | "";
  /** Platform profile status — distinct from assignment status. */
  profileStatus?: string;
  avatarUrl?: string;
  lastActive: string;
  createdAt: string;
}

export interface CreateUserInput {
  /** Existing platform profile to assign. Required on create. */
  profileId?: string;
  name?: string;
  email?: string;
  phone?: string;
  role: UserRole;
  specialization?: string;
  facility: string;
  facilityId?: string;
  assignmentId?: string;
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
 * Display role from Supabase assignments. Operating role for access is
 * `/api/access/me` (People register matched by email).
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
  /** FM People ID resolved server-side; distinct from authenticated profile id. */
  operationalUserId?: string | null;
}

export type UserModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; user: User }
  | { type: "view"; user: User }
  | { type: "deactivate"; user: User };
