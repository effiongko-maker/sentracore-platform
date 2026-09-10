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

/** Operational Registers → reporting/read foundation (composition only). */
export {
  OPERATIONAL_REGISTER_IDS,
  OperationalRegistersReadService,
  loadOperationalRegistersBundle,
  type IOperationalRegistersReadService,
  type OperationalRegisterId,
  type OperationalRegistersBundle,
  type OperationalRegistersBundleMeta,
  type OperationalRegistersQuery,
} from "./registers";

/** Operational Picture — first consumer of the register read layer. */
export {
  OperationalPictureService,
  buildOperationalPicture,
  type IOperationalPictureService,
  type OperationalPicture,
  type OperationalPictureDerived,
  type OperationalPictureMeta,
  type OperationalPictureQuery,
  type OperationalRegisterLatestActivity,
  type OperationalRegisterSection,
} from "./operational-picture";

// Document generation lives under reporting/documents and must stay
// independent of Dashboard. Prefer importing from
// `@/services/reporting/documents` in application code.
