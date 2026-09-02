Release:
v0.8.3

Title:
CostRecord receipt and invoice uploads

Generated:
2026-09-02T10:59:08.567Z

Features
- COST_RECORDS schema: Location column + Budgeted Amount replaces Estimated Amount
- Safe in-place migration preserves existing Estimated Amount values into Budgeted Amount
- CostRecord domain: budgetedAmount + required location (estimatedAmount removed)
- Receipt and invoice uploads stored in the Apps Script project's Google Drive

Performance
- No additional API calls — schema migration runs on sheet access only
- Evidence upload is a single cost-create request, limited to 5 MB

Files Changed
- ROUTER.gs
- ApprovalRepository.gs
- ApprovalsController.gs
- ApprovalService.gs
- AssetRepository.gs
- AssetsController.gs
- AssetService.gs
- CatalogCacheService.gs
- CostRecordRepository.gs
- CostRecordsController.gs
- CostRecordService.gs
- FacilitiesController.gs
- FacilityRepository.gs
- FacilityService.gs
- IncidentRepository.gs
- IncidentsController.gs
- IncidentService.gs
- MaintenanceController.gs
- MaintenanceRepository.gs
- MaintenanceService.gs
- MasterDataController.gs
- MasterDataRepository.gs
- MasterDataService.gs
- OperationalListAudit.gs
- OperationalRegisterCache.gs
- OperationalWorkloadController.gs
- OperationalWorkloadService.gs
- ReportingSnapshotController.gs
- ReportingSnapshotRepository.gs
- ReportingSnapshotService.gs
- ReportingSnapshotTriggers.gs
- RequestRepository.gs
- RequestsController.gs
- RequestService.gs
- RequestTreatmentLinkSpike.gs
- RequestTreatmentMutationSpike.gs
- RequestTreatmentService.gs
- SheetFieldUtils.gs
- UserRepository.gs
- UsersController.gs
- UserService.gs
- WorkOrderMaintenanceMutationService.gs
- WorkOrderRepository.gs
- WorkOrdersController.gs
- WorkOrderService.gs

Deployment Required
YES

Trigger Required
NO

Apps Script Redeploy
YES

Smoke Tests

CostRecord domain:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-cost-record-domain.mts
```

CostRecord persistence:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-cost-record-persistence.mts
```

Finance Cost Entry and evidence upload:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-finance-cost-entry.mts
```

Notes
- MANUAL ACTION REQUIRED: Deploy updated CostRecordRepository.gs and CostRecordService.gs, then create a new Web App version.
- Existing COST_RECORDS rows are preserved; Estimated Amount values migrate to Budgeted Amount on first sheet access.
- New Location column is added without deleting or recreating the sheet.
- Receipt and invoice files are saved privately in the Apps Script project's Google Drive folder named SentraCore Cost Evidence.
- After deployment, run initialiseCostEvidenceStorage() once from the Apps Script editor to authorize Google Drive and create the evidence folder.
- Live GAS verification requires APPS_SCRIPT_URL in .env.local after deploy.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
