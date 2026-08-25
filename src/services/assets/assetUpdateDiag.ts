/**
 * TEMP DIAG — facility persistence investigation.
 * Expected Apps Script build marker returned on asset update `_diag`.
 * If missing, the live /exec deployment does not contain the latest AssetRepository.gs.
 */
export const ASSET_FACILITY_DIAG_BUILD = "2026-08-25-facility-diag-v1";

export type AssetUpdateDiag = {
  buildMarker?: string;
  spreadsheetId?: string;
  spreadsheetName?: string;
  sheetName?: string;
  headers?: string[];
  idCol1?: number;
  idHeader?: string;
  rowIndex1?: number;
  facilityCols?: Array<{ index0: number; col1: number; header: string }>;
  facilityBeforeObject?: string;
  facilityBeforeCells?: Array<{
    header: string;
    col1: number;
    value: string;
  }>;
  requestedFacility?: string;
  resolvedFacilityWritten?: string;
  rowFacilitySlot?: string;
  cellAfterFlush?: string;
  facilityAfterCells?: Array<{
    header: string;
    col1: number;
    value: string;
  }>;
  verifiedFacility?: string | null;
  verifiedManufacturer?: string | null;
  verifiedModel?: string | null;
  sheetChanged?: boolean;
  fieldsWritten?: Record<string, string>;
};

export type AssetUpdateResult = {
  asset: import("@/modules/assets/types").Asset;
  diag: AssetUpdateDiag | null;
  path:
    | "sheet_unchanged"
    | "sheet_changed_api_stale"
    | "api_ok_list_stale"
    | "persisted"
    | "old_deployment"
    | "no_facility_column"
    | "unknown";
  evidence: string[];
};
