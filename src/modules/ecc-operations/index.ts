export { EccOverviewPage } from "./components/EccOverviewPage";
export { EccDailyOpsPage } from "./components/EccDailyOpsPage";
export { EccIssuesPage } from "./components/EccIssuesPage";
export { EccRequestsPage } from "./components/EccRequestsPage";
export { EccPeoplePage } from "./components/EccPeoplePage";
export { EccReportingPage } from "./components/EccReportingPage";
export { EccIntelligencePage } from "./components/EccIntelligencePage";
export { EccFinancePage } from "./components/EccFinancePage";
export { EccWorkspaceShell } from "./components/EccWorkspaceShell";
export { EccOperationsService } from "./services/EccOperationsService";
export type { IEccOperationsService } from "./services/EccOperationsService";
export {
  ECC_MODULE_SLUG,
  ECC_WORKSPACE_ID,
  ECC_CAPABILITIES,
  DEFAULT_ECC_CENTRE,
  createEccModuleContext,
  type EccModuleContext,
  type EccModuleSlug,
  type EccWorkspaceId,
  type EccCapability,
  type EccDailyOpsRecord,
  type EccIssue,
  type EccRequest,
  type EccOverviewSnapshot,
  type EccReportingSnapshot,
  type EccPeopleSnapshot,
} from "./types";
export { ECC_ACCESS, eccModuleContext } from "./access";
export { ECC_NAV_ITEMS, ECC_NAV_GROUPS } from "./nav";
export {
  ECC_REPORTING_DIMENSIONS,
  ECC_ISSUE_STATUS_LABELS,
  ECC_REQUEST_STATUS_LABELS,
  ECC_SEVERITY_LABELS,
  ECC_PRIORITY_LABELS,
} from "./constants";

/** @deprecated Use EccOverviewPage — kept for older imports. */
export { EccOverviewPage as EccOperationsPage } from "./components/EccOverviewPage";
