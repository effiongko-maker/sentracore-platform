/**
 * Re-export the canonical UserService from the API layer.
 * Module components keep importing from here — no UI changes required.
 */
export {
  UserService,
  type IUserService,
} from "@/services/users/UserService";
