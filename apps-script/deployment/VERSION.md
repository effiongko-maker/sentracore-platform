Release:
v0.8.6.5

Title:
Protected cost unlock for FM authorization / Super Admin override

Generated:
2026-09-04T12:55:50.191Z

Features
- CostRecordService.update allows exceptional unlock when Next.js attaches verified _protectedAction=finance.cost.unlock_edit with _authorityMode facility_manager or platform_override
- Default lock for non-draft claims remains; unlock is not global

Performance

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

Protected actions:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-protected-actions.mts
```

Finance cost workflow lock:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-finance-cost-workflow.mts
```

Notes
- V1 protected actions: exceptional cost unlock only changes Apps Script; other protected actions are Next.js authoritative.

Deployment semantics
- `deploymentRequired`: Pack intent: a new Web App deploy is required to apply this source release when cutting from the repo. Not a live deployment status flag.
- `appsScriptRedeploy`: Required — replace CostRecordService.gs and cut a new Web App version.

Live verification (read-only audit)
- Method: scripts/verify-protected-actions.mts plus finance verifies
- resourceLive: no
- Notes:
  - Deploy must include updated CostRecordService.gs, then a new Web App version.
  - No sheet schema change.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
