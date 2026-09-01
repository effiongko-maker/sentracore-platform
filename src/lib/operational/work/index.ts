/**
 * Work consolidation — Phase 15 foundation + Phase 16 Work/WIP surface.
 */

export type { WorkPriority, WorkRecord, WorkStatus } from "./types";

export {
  WORK_BACKING_STORE,
  WORK_STATUS_LABELS,
  WORK_STATUS_SEMANTICS,
  isWorkCancelled,
  isWorkSuccessfullyTerminal,
  issueHrefForWork,
  maintenanceCompatHref,
  mapMaintenanceToWork,
  requestHrefForWork,
  workHref,
} from "./types";

export {
  FROZEN_INCIDENT_CREATE_ORCHESTRATORS,
  INCIDENT_DOMAIN_LEGACY,
  LEGACY_INCIDENT_CREATE_PATHS,
} from "./legacy";

export {
  INCIDENT_CREATE_FROZEN_MESSAGE,
  INCIDENT_WRITE_FREEZE_PHASE,
  assertNewIncidentCreateAllowed,
} from "./incidentWriteFreeze";

export {
  INCIDENT_INTELLIGENCE_COMPAT_CONSUMERS,
  INTELLIGENCE_OPERATIONAL_CONTEXT,
} from "./intelligenceContext";

export {
  INCIDENT_REPORTING_COMPAT,
  INCIDENT_REPORTING_RETARGET_PHASE,
  REPORTING_OPERATIONAL_CONTEXT,
} from "./reportingContext";

export {
  INCIDENT_NAV_COMPAT,
  INCIDENT_NAVIGATION_RETIREMENT_PHASE,
  NAVIGATION_OPERATIONAL_CONTEXT,
  PRIMARY_FM_NAV_SURFACES,
} from "./navigationContext";
