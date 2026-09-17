Release:
v0.8.6.20

Title:
Command Centre versioned FM aggregate contracts

Generated:
2026-09-17T10:07:26.188Z

Features
- Add operational-picture.v1 organisational FM summary
- Add assignment-summary.v1 operational-user assignment summary
- Preserve per-domain unavailable state and caller-controlled asOf

Performance
- Replace Command Centre full-register and paginated reads with two count-only Apps Script requests

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

Command Centre FM aggregate golden contract:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-command-centre-fm-aggregate-contract.mts
```

Notes
- The Apps Script addition is backward-compatible; existing getAll resources remain unchanged.
- TypeScript remains the canonical predicate reference and the golden verifier controls mirror drift.

Deployment semantics
- `deploymentRequired`: Pack intent: a new Web App deploy is required to apply this source release when cutting from the repo. Not a live deployment status flag.
- `appsScriptRedeploy`: Required — deploy the additive command-centre-fm resource before enabling the dependent Next.js build.

Live verification (read-only audit)
- resourceLive: no
- Notes:
  - Deploy Apps Script first to avoid a Next.js contract-order outage.
  - After deployment, validate one Operational Picture and one Assignment Summary request before warm-load observation.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
