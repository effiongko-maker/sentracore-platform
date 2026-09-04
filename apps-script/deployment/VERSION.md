Release:
v0.8.6.3

Title:
Unique reimbursement payment IDs and complete ceiling sum

Generated:
2026-09-03T14:52:57.313Z

Features
- ReimbursementPaymentRepository.nextId_() assigns PAY-{year}-{NNNNNN} from the persisted Payment ID column, not the paginated getAll() wrapper
- Authorized-amount ceiling sums every receipt for the submission via listAllBySubmissionId (not the first 100 list page)
- Submission Detail Record payment uses a synchronous lock so rapid double-click cannot fire two creates

Performance
- nextId_ and ceiling sum scan REIMBURSEMENT_PAYMENTS sheet rows; public getAll pageSize remains capped at 100

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

Finance reimbursement payment:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-finance-reimbursement-payment.mts
```

Finance reimbursement authorization:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-finance-reimbursement-authorization.mts
```

Notes
- MANUAL DEPLOYMENT REQUIRED: Replace ReimbursementPaymentRepository.gs and ReimbursementPaymentService.gs from this pack, then new Web App version.
- Root fix: nextId_ scans sheet Payment ID cells. Do not iterate getAll({}) as an array.
- Ceiling: listAllBySubmissionId so pageSize=100 cannot undercount receipts.
- Do not auto-delete duplicate PAY-2026-000001 test rows.

Deployment semantics
- `deploymentRequired`: Pack intent: a new Web App deploy is required to apply this source release when cutting from the repo. Not a live deployment status flag.
- `appsScriptRedeploy`: Required — replace ReimbursementPaymentRepository.gs and ReimbursementPaymentService.gs and cut a new Web App version.

Live verification (read-only audit)
- Method: scripts/verify-finance-reimbursement-payment.mts live GAS round-trip (create ×3 → retrieve → aggregate → update → retrieve)
- resourceLive: no
- Notes:
  - Deploy must include updated ReimbursementPaymentRepository.gs and ReimbursementPaymentService.gs, then a new Web App version.
  - No sheet schema change — REIMBURSEMENT_PAYMENTS columns unchanged.
  - Existing duplicate PAY-2026-000001 rows are bad test data from the previous nextId_ bug; clean them manually after deploy.
  - Live proof of PAY-YYYY-000001 → 000002 → 000003 requires no remaining PAY-{year}-* rows (or the script reports the next consecutive IDs from current max seq).

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
