Release:
v0.8.6.17

Title:
Operational Registers write-path deploy + live verify

Generated:
2026-09-10T17:35:28.724Z

Features
- Live write verification for all 7 Operational Registers (npm run verify-operational-registers-write)
- Deployment checklist CRITICAL notes for generator-log and diesel-usage triads

Performance

Files Changed
- ROUTER.gs
- ApprovalRepository.gs
- AssetRepository.gs
- ConsumablesUpdateRepository.gs
- CostRecordRepository.gs
- CostSubmissionRepository.gs
- DeepCleaningLogRepository.gs
- DieselUsageRepository.gs
- EnergyReadingRepository.gs
- FacilityRepository.gs
- FumigationLogRepository.gs
- GeneratorLogRepository.gs
- IncidentRepository.gs
- MaintenanceRepository.gs
- MasterDataRepository.gs
- ReimbursementAuthorizationRepository.gs
- ReimbursementPaymentRepository.gs
- ReportingSnapshotRepository.gs
- RequestRepository.gs
- UserRepository.gs
- WasteLogRepository.gs
- WorkOrderRepository.gs
- ApprovalService.gs
- AssetService.gs
- CatalogCacheService.gs
- ConsumablesUpdateService.gs
- CostRecordService.gs
- CostSubmissionService.gs
- DeepCleaningLogService.gs
- DieselUsageService.gs
- EnergyReadingService.gs
- FacilityService.gs
- FumigationLogService.gs
- GeneratorLogService.gs
- IncidentService.gs
- MaintenanceService.gs
- MasterDataService.gs
- OperationalWorkloadService.gs
- ReimbursementAuthorizationService.gs
- ReimbursementPaymentService.gs
- ReportingSnapshotService.gs
- RequestService.gs
- RequestTreatmentService.gs
- UserService.gs
- WasteLogService.gs
- WorkOrderMaintenanceMutationService.gs
- WorkOrderService.gs
- ApprovalsController.gs
- AssetsController.gs
- ConsumablesUpdateController.gs
- CostRecordsController.gs
- CostSubmissionsController.gs
- DeepCleaningLogController.gs
- DieselUsageController.gs
- EnergyReadingController.gs
- FacilitiesController.gs
- FumigationLogController.gs
- GeneratorLogController.gs
- IncidentsController.gs
- MaintenanceController.gs
- MasterDataController.gs
- OperationalWorkloadController.gs
- ReimbursementAuthorizationsController.gs
- ReimbursementPaymentsController.gs
- ReportingSnapshotController.gs
- RequestsController.gs
- UsersController.gs
- WasteLogController.gs
- WorkOrdersController.gs
- OperationalListAudit.gs
- OperationalRegisterCache.gs
- ReportingSnapshotTriggers.gs
- RequestTreatmentLinkSpike.gs
- RequestTreatmentMutationSpike.gs
- SheetFieldUtils.gs

Deployment Required
YES

Trigger Required
NO

Apps Script Redeploy
YES

Smoke Tests

Typecheck:

```bash
npm run typecheck
```

Operational API access:

```bash
npm run verify-operational-api-access
```

Operational Registers write path:

```bash
npm run verify-operational-registers-write
```

Notes
- Repo write wiring for all 7 registers is correct. Remaining live failure is incomplete Apps Script file deployment for GeneratorLogRepository.gs only.

Deployment semantics
- `deploymentRequired`: Pack intent: a new Web App deploy is required to apply this source release when cutting from the repo. Not a live deployment status flag.
- `appsScriptRedeploy`: Required — create/paste GeneratorLogRepository.gs (Controller/Service already present live). Cut a new Web App version.

Live verification (read-only audit)
- Verified: 2026-09-10T17:35:00Z
- Method: npm run verify-operational-registers-write against live /exec
- resourceLive: no
- Notes:
  - PASS live create+list: energy-reading, diesel-usage, consumables-update, waste-log, fumigation-log, deep-cleaning-log
  - FAIL live create: generator-log → GeneratorLogRepository is not defined (only remaining missing file)
  - Frontend does not reference Apps Script controller/repository names — those strings are Apps Script runtime errors returned via the API.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
