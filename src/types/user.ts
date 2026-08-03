/**
 * Re-export Users module types for shared consumers (TopBar, etc.).
 * Prefer importing from `@/modules/users` within the Users feature.
 */
export type {
  CreateUserInput,
  CurrentUser,
  UpdateUserInput,
  User,
  UserListParams,
  UserRole,
  UserStatus,
} from "@/modules/users/types";

export {
  USER_FACILITIES,
  USER_ROLES,
  USER_SPECIALIZATIONS,
  USER_STATUSES,
} from "@/modules/users/constants";
