export type {
  AuthEnabledModule,
  AuthOrganisation,
  AuthProfile,
  AuthRoleAssignment,
  PlatformSession,
  ProfileStatus,
  SessionIdentity,
} from "./types";

export {
  getPlatformSession,
  requirePlatformSession,
  toSessionIdentity,
} from "./session";

export {
  signIn,
  signOut,
  requestPasswordReset,
  updatePassword,
  assertPasswordRecoveryContext,
  finalizePasswordReset,
} from "./actions";
export type {
  SignInState,
  ForgotPasswordState,
  ResetPasswordState,
} from "./actions";
export {
  safeInternalPath,
  resolveAppOrigin,
  PASSWORD_RECOVERY_COOKIE,
  MIN_PASSWORD_LENGTH,
} from "./urls";
export { markPasswordRecovery } from "./recoveryGate";
