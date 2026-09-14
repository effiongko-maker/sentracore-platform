Release:
v0.8.6.19

Title:
Work Orders explicit persisted Order Type

Generated:
2026-09-14T08:40:38.658Z

Features
- Persist Order Type (work_order | job_order) on Work Orders sheet
- Order Type is user-selected; estimated cost is financial only
- Legacy missing Order Type resolves to work_order

Performance

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

Work instruction kind:

```bash
node scripts/verify-work-instruction-kind.cjs
```

Work orders WIP register:

```bash
node scripts/verify-work-orders-wip-register.cjs
```

Notes
- Order Type is explicit and persisted. Estimated Cost must not classify Work Order vs Job Order.

Deployment semantics
- `deploymentRequired`: Pack intent: a new Web App deploy is required to apply this source release when cutting from the repo. Not a live deployment status flag.
- `appsScriptRedeploy`: Required — update WorkOrderRepository for Order Type read/write. Client already classifies via persisted orderType.

Live verification (read-only audit)
- resourceLive: no
- Notes:
  - Redeploy Apps Script before validating Order Type tabs against live sheet.
  - Legacy rows without Order Type resolve to Work Order after client update; sheet column is added on write.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
