/** Primary branded status lines — fixed, intentional, context-specific. */
export const HOME_LOADING_STATUS = "Preparing today’s work overview…";
export const INTELLIGENCE_LOADING_STATUS =
  "Preparing your intelligence overview…";
export const DASHBOARD_LOADING_STATUS =
  "Preparing your operational overview…";
export const REPORTS_LOADING_STATUS = "Preparing reporting workspace…";

/** Optional supporting lines that may rotate beneath the primary status. */
export const OPERATIONAL_LOADING_MESSAGES = [
  HOME_LOADING_STATUS,
  "Refreshing facility snapshot…",
  "Loading latest operational data…",
  "Gathering maintenance activities…",
  "Reviewing work orders…",
] as const;

export const DASHBOARD_LOADING_MESSAGES = [
  DASHBOARD_LOADING_STATUS,
  "Loading KPIs and attention queues…",
  "Checking asset health…",
  "Gathering maintenance activities…",
  "Reviewing work orders…",
] as const;

export const WORKSPACE_LOADING_MESSAGES = [
  HOME_LOADING_STATUS,
  "Loading your assignments…",
  "Reviewing work orders…",
  "Gathering maintenance activities…",
  "Checking today’s schedule…",
] as const;

export const INTELLIGENCE_LOADING_MESSAGES = [
  INTELLIGENCE_LOADING_STATUS,
  "Reviewing recent incidents and responses…",
  "Connecting related operational activity…",
  "Gathering what needs attention…",
] as const;

export const REPORTS_LOADING_MESSAGES = [
  REPORTS_LOADING_STATUS,
  "Loading report templates…",
  "Syncing facility list…",
  "Getting ready to build your report…",
] as const;

/** Ordered progress copy for report generation (not random). */
export const REPORT_GENERATION_STEPS = [
  "Preparing report…",
  "Generating document preview…",
  "Collecting operational data…",
  "Building executive summary…",
  "Formatting report…",
  "Finalizing report…",
] as const;

export const SHOW_LOADER_DELAY_MS = 500;
export const MIN_LOADER_VISIBLE_MS = 300;
export const LOADER_FADE_MS = 280;
export const STATUS_ROTATE_MIN_MS = 2000;
export const STATUS_ROTATE_MAX_MS = 3000;
