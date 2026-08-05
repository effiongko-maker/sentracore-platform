export { ReportingService, type IReportingService } from "./ReportingService";
export {
  SnapshotService,
  type CachedReportingSnapshot,
  type ISnapshotService,
  type SnapshotCacheMetadata,
} from "./SnapshotService";
export { tryLoadSheetsReportingSnapshot } from "./sheetsSnapshot";
export type {
  ReportingHealth,
  ReportingHealthBand,
  ReportingKpis,
  ReportingListItem,
  ReportingProjections,
  ReportingQuery,
  ReportingSnapshot,
  ReportingSnapshotMeta,
} from "./types";
export { kpiInsightLabels } from "./kpis";
export {
  normalizeToken,
  isActiveEntityStatus,
  isOperationalAssetStatus,
  toIsoUtc,
  ageInSeconds,
} from "./normalize";

// Document generation lives under reporting/documents and must stay
// independent of Dashboard. Prefer importing from
// `@/services/reporting/documents` in application code.
