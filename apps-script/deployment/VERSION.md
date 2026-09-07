Release:
v0.8.6.7

Title:
Home single-pass Maintenance criticalWorkTotal (eliminate second getAll)

Generated:
2026-09-07T09:07:56.510Z

Features
- MaintenanceService.getAll accepts includeCriticalWorkTotal and returns exact active high|critical count before pagination
- Home WorkspaceService uses one Maintenance getAll for active pool + Critical Work (no separate high_or_critical pageSize 1 request)

Performance
- Removes duplicate Maintenance register scan on /operations core path

Files Changed
- ROUTER.gs
- ApprovalRepository.gs
- AssetRepository.gs
- CostRecordRepository.gs
- CostSubmissionRepository.gs
- FacilityRepository.gs
- IncidentRepository.gs
- MaintenanceRepository.gs
- MasterDataRepository.gs
- ReimbursementAuthorizationRepository.gs
- ReimbursementPaymentRepository.gs
- ReportingSnapshotRepository.gs
- RequestRepository.gs
- UserRepository.gs
- WorkOrderRepository.gs
- ApprovalService.gs
- AssetService.gs
- CatalogCacheService.gs
- CostRecordService.gs
- CostSubmissionService.gs
- FacilityService.gs
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
- WorkOrderMaintenanceMutationService.gs
- WorkOrderService.gs
- ApprovalsController.gs
- AssetsController.gs
- CostRecordsController.gs
- CostSubmissionsController.gs
- FacilitiesController.gs
- IncidentsController.gs
- MaintenanceController.gs
- MasterDataController.gs
- OperationalWorkloadController.gs
- ReimbursementAuthorizationsController.gs
- ReimbursementPaymentsController.gs
- ReportingSnapshotController.gs
- RequestsController.gs
- UsersController.gs
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

Home Critical Work single-pass total:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-home-critical-work-count.mts
```

Command Surface Critical Work:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-command-surface-critical-work.mts
```

Notes
- Additive getAll flag only; default list/UI getAll unchanged.
- high_or_critical filter retained for non-Home callers.

Deployment semantics
- `deploymentRequired`: Pack intent: a new Web App deploy is required to apply this source release when cutting from the repo. Not a live deployment status flag.
- `appsScriptRedeploy`: Required — replace MaintenanceService.gs and cut a new Web App version.

Live verification (read-only audit)
- Method: scripts/verify-home-critical-work-count.mts plus verify-command-surface-critical-work.mts
- resourceLive: no
- Notes:
  - Deploy must include updated MaintenanceService.gs, then a new Web App version.
  - Until redeployed, Home Critical Work stays null (fail-closed) while pool rows may still load if an older getAll ignores the flag.
  - No sheet schema change.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
