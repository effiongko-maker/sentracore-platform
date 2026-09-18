Release:
v0.8.6.21

Title:
FM reliability contract, observability, and Apps Script shared-secret gate

Generated:
2026-09-18T13:48:44.705Z

Features
- Correlate every Apps Script call with a request ID and structured fm.apps_script logs
- Stop converting notification, Assigned Work, and FM Finance overview failures into legitimate zeros
- Piggyback complete-population Operational Picture totals onto existing getAll reads
- Require APPS_SCRIPT_SHARED_SECRET on doPost; remove hardcoded /exec fallback

Performance
- Operational Picture totals reuse the same filtered getAll rows — no extra sheet read

Files Changed
- ROUTER.gs
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
- CommandCentreFmSummaryService.gs
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
- CommandCentreFmSummaryController.gs
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

Phase 0A FM reliability contract:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-fm-phase-0a.mts
```

Command Centre FM aggregate golden contract:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-command-centre-fm-aggregate-contract.mts
```

Notes
- Next.js production refuses a missing Apps Script URL or shared secret. Do not promote until both env vars and this Apps Script release are live.
- Home Operational Picture uses the same CommandCentreFmSummaryService predicates as Command Centre, computed on the already-loaded getAll row set.

Deployment semantics
- `deploymentRequired`: Pack intent: a new Web App deploy is required to apply this source release when cutting from the repo. Not a live deployment status flag.
- `appsScriptRedeploy`: Required — deploy ROUTER shared-secret validation and Operational Picture list totals before enabling production Next.js fail-closed secret enforcement.

Live verification (read-only audit)
- resourceLive: no
- Notes:
  - Set Script Property APPS_SCRIPT_SHARED_SECRET to the same value as the Next.js server env var before deploying this Apps Script release.
  - Set Next.js APPS_SCRIPT_URL and APPS_SCRIPT_SHARED_SECRET (never NEXT_PUBLIC_*) before promoting the Next.js build.
  - Anonymous /exec POSTs must fail after deploy. GET liveness remains unauthenticated.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
