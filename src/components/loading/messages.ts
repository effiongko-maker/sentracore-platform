/** Friendly operational messages for general page loading. */
export const OPERATIONAL_LOADING_MESSAGES = [
  "Refreshing facility snapshot...",
  "Loading latest operational data...",
  "Checking asset health...",
  "Gathering maintenance activities...",
  "Reviewing work orders...",
  "Syncing operational metrics...",
  "Preparing today's facility overview...",
] as const;

export const DASHBOARD_LOADING_MESSAGES = [
  "Refreshing operational snapshot...",
  "Loading KPIs and attention queues...",
  "Checking asset health...",
  "Gathering maintenance activities...",
  "Reviewing work orders...",
  "Syncing operational metrics...",
  "Preparing the dashboard...",
] as const;

export const WORKSPACE_LOADING_MESSAGES = [
  "Preparing today's work overview...",
  "Loading your assignments...",
  "Reviewing work orders...",
  "Gathering maintenance activities...",
  "Checking today's schedule...",
  "Almost ready...",
] as const;

export const REPORTS_LOADING_MESSAGES = [
  "Loading reports...",
  "Preparing report options...",
  "Syncing facility list...",
  "Getting ready to build your report...",
] as const;

/** Ordered progress copy for report generation (not random). */
export const REPORT_GENERATION_STEPS = [
  "Preparing report...",
  "Generating document preview...",
  "Collecting operational data...",
  "Building executive summary...",
  "Formatting report...",
  "Finalizing report...",
] as const;

export const SHOW_LOADER_DELAY_MS = 500;
export const MIN_LOADER_VISIBLE_MS = 300;
export const LOADER_FADE_MS = 280;
export const STATUS_ROTATE_MIN_MS = 2000;
export const STATUS_ROTATE_MAX_MS = 3000;
