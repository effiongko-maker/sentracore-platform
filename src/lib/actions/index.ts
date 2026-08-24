export type {
  ActionAuthz,
  ActionContext,
  ActionDefinition,
  ActionDepartment,
  PlatformModuleSlug,
} from "./types";

export type { ActionErrorCode } from "./errors";
export { ActionError, isActionError, toActionError } from "./errors";

export type {
  ActionFailure,
  ActionResult,
  ActionSuccess,
} from "./result";
export {
  actionFailure,
  actionFailureFromError,
  actionSuccess,
  assertActionSuccess,
} from "./result";

export { resolveActionContext } from "./context";
export { createActionAuthz } from "./authz";
export { hasModule, requireModule } from "./moduleAccess";
export { executeAction } from "./execute";

export type { ActionEventInput } from "./events";
export { buildEventFromContext, emitActionEvent } from "./events";

export type {
  DecideRecommendationInput,
  DecideRecommendationResult,
} from "./decideRecommendation";
export { decideRecommendation } from "./decideRecommendation";
